(function () {
  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  let index = null;          // data/index.json
  const cache = {};          // 시도별 데이터
  let data = [];             // 현재 보여줄 대상
  let userPos = null;        // 기기 안에서만 사용, 서버로 보내지 않음
  let map = null;
  let markers = [];

  // 탭 전환
  document.querySelectorAll("nav.tabs button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("nav.tabs button").forEach((x) => x.setAttribute("aria-selected", x === b));
      document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === b.dataset.view));
    });
  });

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function loadSido(sido) {
    if (cache[sido]) return cache[sido];
    const meta = index.sidos.find((s) => s.sido === sido);
    const rows = await (await fetch(`data/${meta.file}`)).json();
    rows.forEach((d, i) => { d.id = `${meta.file}-${i}`; });
    return (cache[sido] = rows);
  }
  async function loadAll() {
    const all = await Promise.all(index.sidos.map((s) => loadSido(s.sido)));
    return all.flat();
  }

  function fillSigungu() {
    const list = [...new Set(data.map((d) => d.sigungu))].sort();
    $("sigungu").innerHTML = `<option value="">전체</option>` + list.map((s) => `<option>${esc(s)}</option>`).join("");
  }

  // 거리 계산 (하버사인, 미터)
  function distance(a, b) {
    const R = 6371000, rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmt = (m) => (m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`);

  // 빈자리 표시: 정원 - 현원
  function seat(d) {
    if (!d.capacity || d.current == null) return { cls: "", text: "정보 없음" };
    const left = d.capacity - d.current;
    if (left <= 0) return { cls: "full", text: "정원 꽉 참" };
    if (left / d.capacity < 0.1) return { cls: "few", text: `정원보다 ${left}명 적음` };
    return { cls: "ok", text: `정원보다 ${left}명 적음` };
  }

  // 네이버지도 길찾기: 앱 딥링크(목적지만 전달) → 미설치 시 웹으로
  function directions(d, mode) {
    const app = `nmap://route/${mode}?dlat=${d.lat}&dlng=${d.lng}&dname=${encodeURIComponent(d.name)}&appname=${encodeURIComponent(location.hostname || "woori-daycare")}`;
    const web = `https://map.naver.com/p/search/${encodeURIComponent(d.addr || d.name)}`;
    if (!/Android|iPhone|iPad/i.test(navigator.userAgent)) { window.open(web, "_blank", "noopener"); return; }
    const t = setTimeout(() => { window.location.href = web; }, 1500);
    window.addEventListener("pagehide", () => clearTimeout(t), { once: true });
    window.location.href = app;
  }

  let typeFilter = "";

  // 시제품 저장소: 평가·체크리스트는 이 기기에만 저장 (서버 전송 없음)
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const keyOf = (d) => `${d.sigungu}|${d.name}`;
  const RATE_ITEMS = ["시설·청결", "급식", "소통", "통학·접근성", "프로그램"];
  const RATE_TAGS = ["알림장 소통 원활", "적응 기간 배려", "급식 만족", "차량 시간 정확", "놀이 공간 넓음", "연장보육 만족"];
  const CHECKLIST = [
    "보육료 외 필요경비(특별활동비·현장학습비)는 월 얼마인가요?",
    "연장보육은 몇 시까지, 어떤 조건으로 신청할 수 있나요?",
    "연장보육반은 따로 운영되나요? 담당 선생님은 누구인가요?",
    "주간 식단과 간식 공개 방법, 알레르기 대응은?",
    "적응 기간은 어떻게 진행되나요?",
    "하루 일과(낮잠·바깥놀이 시간)는 어떻게 되나요?",
    "우리 아이 연령반 선생님 1명이 보는 아이 수는?",
    "통학차량 노선과 탑승 시간은?",
    "아플 때 연락·귀가 기준은?",
    "CCTV 열람 절차는 어떻게 되나요?",
  ];

  function ratePanel(d) {
    const saved = store.get("rate:" + keyOf(d)) || { scores: {}, tags: [] };
    return `<div class="panel" data-panel="rate"><h4>⭐ 내 평가 (재원·졸업 학부모)</h4>
      ${RATE_ITEMS.map((it) => `<div class="stars">${it}<span data-item="${it}">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}" class="${(saved.scores[it] || 0) >= n ? "on" : ""}" aria-label="${it} ${n}점">★</button>`).join("")}</span></div>`).join("")}
      <div class="tags" style="margin-top:8px">${RATE_TAGS.map((t) => `<label class="chip toggle"><input type="checkbox" value="${t}" ${saved.tags.includes(t) ? "checked" : ""}>${t}</label>`).join("")}</div>
      <p class="note">시제품: 이 기기에만 저장됩니다. 실제 서비스에서는 재원 인증 후 평가가 5건 이상 모이면 평균만 공개합니다.</p></div>`;
  }
  function checkPanel(d) {
    const saved = store.get("check:" + keyOf(d)) || { done: [], memo: "" };
    return `<div class="panel" data-panel="check"><h4>📝 상담 체크리스트</h4>
      ${CHECKLIST.map((q, i) => `<label class="check"><input type="checkbox" data-i="${i}" ${saved.done.includes(i) ? "checked" : ""}>${q}</label>`).join("")}
      <textarea rows="3" placeholder="상담 메모 (예: 연장보육 7시 30분까지, 특별활동비 월 5만원)">${esc(saved.memo)}</textarea>
      <p class="note">메모는 이 기기에만 저장됩니다.</p></div>`;
  }
  function bindPanels(li, d) {
    const k = keyOf(d);
    li.querySelectorAll('[data-panel="rate"] .stars span').forEach((sp) => sp.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      const v = store.get("rate:" + k) || { scores: {}, tags: [] };
      v.scores[sp.dataset.item] = Number(b.dataset.n); store.set("rate:" + k, v);
      sp.querySelectorAll("button").forEach((x) => x.classList.toggle("on", Number(x.dataset.n) <= Number(b.dataset.n)));
    })));
    li.querySelectorAll('[data-panel="rate"] input').forEach((c) => c.addEventListener("change", () => {
      const v = store.get("rate:" + k) || { scores: {}, tags: [] };
      v.tags = [...li.querySelectorAll('[data-panel="rate"] input:checked')].map((x) => x.value); store.set("rate:" + k, v);
    }));
    const save = () => store.set("check:" + k, {
      done: [...li.querySelectorAll('[data-panel="check"] input:checked')].map((x) => Number(x.dataset.i)),
      memo: li.querySelector('[data-panel="check"] textarea')?.value || "",
    });
    li.querySelectorAll('[data-panel="check"] input, [data-panel="check"] textarea').forEach((e) => e.addEventListener("input", save));
  }
  const inRange = (v, r) => { if (!r) return true; if (v == null) return false; const [lo, hi] = r.split("-").map(Number); return v >= lo && v <= hi; };
  const seatsLeft = (d) => (d.capacity && d.current != null ? d.capacity - d.current : null);
  const ratioOf = (d) => (d.staff && d.current ? d.current / d.staff : null);
  const spaceOf = (d) => (d.area && d.current ? d.area / d.current : null);
  const yearsOf = (d) => (d.since ? (Date.now() - new Date(d.since)) / 31557600000 : null);

  function currentList() {
    const radius = Number($("radius").value);
    const fSeat = $("fSeat").value, fBus = $("fBus").checked, fExt = $("fExt").checked, fPlay = $("fPlay").checked, fAge = $("fAge").value, fCap = $("fCap").value, fCur = $("fCur").value;
    let list = data;
    if (userPos) {
      list = data.filter((d) => d.lat).map((d) => ({ ...d, dist: distance(userPos, d) })).filter((d) => !radius || d.dist <= radius);
    } else if ($("sigungu").value) {
      list = data.filter((d) => d.sigungu === $("sigungu").value);
    }
    list = list.filter((d) => {
      if (typeFilter && d.type !== typeFilter) return false;
      if (fBus && !d.bus) return false;
      if (fExt && d.extended !== true) return false;
      if (fPlay && !(d.playground > 0)) return false;
      const y = yearsOf(d);
      if (fAge === "new" && !(y != null && y <= 3)) return false;
      if (fAge === "old" && !(y != null && y >= 10)) return false;
      if (!inRange(d.capacity, fCap) || !inRange(d.current, fCur)) return false;
      const left = seatsLeft(d);
      if (fSeat === "full") return left != null && left <= 0;
      if (fSeat) return left != null && left >= Number(fSeat);
      return true;
    });
    const sort = $("sort").value;
    const by = {
      dist: (a, b) => (a.dist ?? 0) - (b.dist ?? 0) || a.name.localeCompare(b.name, "ko"),
      seat: (a, b) => (seatsLeft(b) ?? -1e9) - (seatsLeft(a) ?? -1e9),
      ratio: (a, b) => (ratioOf(a) ?? 1e9) - (ratioOf(b) ?? 1e9),
      space: (a, b) => (spaceOf(b) ?? -1) - (spaceOf(a) ?? -1),
      name: (a, b) => a.name.localeCompare(b.name, "ko"),
    };
    return [...list].sort(by[sort === "dist" && !userPos ? "name" : sort]);
  }

  const PAGE = 50;
  function render() {
    const all = currentList();
    const list = all.slice(0, PAGE);
    $("count").textContent = `조건에 맞는 어린이집 ${all.length.toLocaleString()}곳${all.length > PAGE ? ` · 상위 ${PAGE}곳 표시` : ""}`;
    $("list").innerHTML = list.length ? list.map((d, i) => {
      const s = seat(d);
      const r = ratioOf(d);
      return `
      <li data-id="${d.id}">
        <button class="head" aria-expanded="false">
          <span class="no">${i + 1}</span>
          <span class="t"><b>${esc(d.name)}</b><small>${esc(d.type)} · ${esc(d.sigungu)}${d.dist != null ? ` · ${fmt(d.dist)}` : ""}</small>
            <span class="tags">${d.extended ? '<span class="tag">🌙 연장보육</span>' : ""}${d.bus ? '<span class="tag">🚌 차량</span>' : ""}${d.playground > 0 ? '<span class="tag">🛝 놀이터</span>' : ""}${yearsOf(d) != null && yearsOf(d) <= 3 ? '<span class="tag">✨ 신규</span>' : ""}${yearsOf(d) >= 10 ? `<span class="tag gray">${Math.floor(yearsOf(d))}년 운영</span>` : ""}</span></span>
          <span class="seat ${s.cls}">${s.text}</span>
        </button>
        <div class="detail">
          <div class="meta">${esc(d.addr)}</div>
          <div class="meta">정원 ${d.capacity ?? "-"}명 · 현원 ${d.current ?? "-"}명 <small>(${index.basis} 기준)</small>${r ? ` · 교직원 1명당 아이 ${r.toFixed(1)}명` : ""}</div>
          <div class="meta">보육실 ${d.rooms ?? "-"}개 · 면적 ${d.area ?? "-"}㎡${spaceOf(d) ? ` (아이 1명당 ${spaceOf(d).toFixed(1)}㎡)` : ""} · 놀이터 ${d.playground ? d.playground + "곳" : "없음"}</div>
          <div class="meta">CCTV ${d.cctv ?? "-"}대 · 통학차량 ${d.bus ? "운영" : "미운영"} · 연장보육 ${d.extended === true ? "운영" : d.extended === false ? "미운영" : "정보 없음"}</div>
          <div class="meta">${d.since ? `${d.since.slice(0, 4)}년 인가 · 운영 ${Math.floor(yearsOf(d))}년째` : "인가일 정보 없음"}</div>
          <div class="actions">
            <button class="btn primary" data-route="walk">도보 길찾기</button>
            <button class="btn" data-route="public">대중교통</button>
            <button class="btn" data-route="car">자동차</button>
            ${d.tel ? `<a class="btn" href="tel:${esc(d.tel)}">전화</a>` : ""}
          </div>
          <div class="more">
            <button class="btn" data-open="check">📝 상담 체크리스트</button>
            <button class="btn" data-open="rate">⭐ 평가하기</button>
            <a class="btn" href="https://info.childcare.go.kr/info_html5/pnis/search/NurseryNameSlL.jsp" target="_blank" rel="noopener" data-copy="${esc(d.name)}">💰 비용·식단·일과 (공시)</a>
            <a class="btn" href="https://www.childcare.go.kr/" target="_blank" rel="noopener">📮 입소대기 신청</a>
          </div>
          <div class="slot"></div>
        </div>
      </li>`;
    }).join("") : `<li style="padding:16px 0;color:var(--muted)">조건에 맞는 어린이집이 없습니다. 필터를 줄여 보세요.</li>`;
    $("list").querySelectorAll("li[data-id]").forEach((li) => {
      const d = list.find((x) => x.id === li.dataset.id);
      li.querySelector(".head").addEventListener("click", (e) => {
        const open = li.classList.toggle("open");
        e.currentTarget.setAttribute("aria-expanded", open);
      });
      li.querySelectorAll("[data-route]").forEach((b) => b.addEventListener("click", () => directions(d, b.dataset.route)));
      li.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
        const slot = li.querySelector(".slot");
        const same = slot.dataset.open === b.dataset.open;
        slot.dataset.open = same ? "" : b.dataset.open;
        slot.innerHTML = same ? "" : b.dataset.open === "rate" ? ratePanel(d) : checkPanel(d);
        if (!same) bindPanels(li, d);
      }));
      li.querySelectorAll("[data-copy]").forEach((a) => a.addEventListener("click", () => {
        try { navigator.clipboard.writeText(a.dataset.copy); } catch {}
        const n = $("locNotice"); n.hidden = false;
        n.textContent = `"${a.dataset.copy}" 이름을 복사했어요. 공시 검색창에 붙여넣어 찾아보세요.`;
      }));
    });
    drawMarkers(list);
  }

  // 네이버 지도 (Client ID가 없으면 목록만 표시)
  function drawMarkers(list) {
    if (!map) return;
    markers.forEach((m) => m.setMap(null));
    const pts = list.filter((d) => d.lat);
    markers = pts.map((d) => new naver.maps.Marker({ map, position: new naver.maps.LatLng(d.lat, d.lng), title: d.name, icon: { content: `<div style="background:#2f7d4f;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font:700 12px sans-serif;border:2px solid #fff">${list.indexOf(d) + 1}</div>`, anchor: new naver.maps.Point(12, 12) } }));
    const ll = pts.map((d) => new naver.maps.LatLng(d.lat, d.lng));
    if (userPos) ll.push(new naver.maps.LatLng(userPos.lat, userPos.lng));
    if (ll.length) {
      const bounds = new naver.maps.LatLngBounds(ll[0], ll[0]);
      ll.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, { top: 30, right: 30, bottom: 30, left: 30 });
    }
  }

  function initMap() {
    if (!cfg.NAVER_MAPS_KEY_ID) {
      $("map").style.height = "auto"; $("map").style.minHeight = "0";
      $("map").innerHTML = `<div class="map-fallback">네이버 Maps Client ID를 config.js에 넣으면 지도가 표시됩니다.</div>`;
      return;
    }
    const s = document.createElement("script");
    s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(cfg.NAVER_MAPS_KEY_ID)}`;
    s.onload = () => { map = new naver.maps.Map("map", { center: new naver.maps.LatLng(36.5, 127.8), zoom: 7 }); render(); };
    s.onerror = () => { $("map").innerHTML = `<div class="map-fallback">지도를 불러오지 못했습니다. Client ID와 등록 도메인을 확인하세요.</div>`; };
    document.head.appendChild(s);
  }

  async function selectSido(sido) {
    $("count").textContent = "불러오는 중…";
    userPos = null;
    data = await loadSido(sido);
    fillSigungu();
    render();
  }

  // 현재 위치: 버튼을 누를 때만 요청
  $("locate").addEventListener("click", () => {
    const n = $("locNotice");
    n.hidden = false;
    if (!navigator.geolocation) { n.textContent = "이 기기는 위치 기능을 지원하지 않습니다."; return; }
    n.textContent = "현재 위치를 확인하는 중… (위치는 기기 안에서만 쓰고 서버로 보내지 않습니다)";
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        userPos = { lat: p.coords.latitude, lng: p.coords.longitude };
        n.textContent = "전국 데이터를 불러와 가까운 순으로 정렬하는 중…";
        data = await loadAll();
        n.textContent = "현재 위치 기준 가까운 순으로 정렬했습니다.";
        render();
      },
      () => { n.textContent = "위치 권한이 없어 지역 선택으로 보여드립니다."; },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });

  $("sido").addEventListener("change", () => selectSido($("sido").value));
  $("sigungu").addEventListener("change", () => { userPos = null; render(); });
  $("radius").addEventListener("change", render);
  ["fSeat", "fBus", "fExt", "fPlay", "fAge", "fCap", "fCur", "sort"].forEach((id) => $(id).addEventListener("change", render));
  document.querySelectorAll(".chip[data-type]").forEach((c) => c.addEventListener("click", () => {
    document.querySelectorAll(".chip[data-type]").forEach((x) => x.classList.toggle("on", x === c));
    typeFilter = c.dataset.type;
    render();
  }));

  (async function init() {
    initMap();
    index = await (await fetch("data/index.json")).json();
    $("basis").textContent = `${index.source} · 기준일 ${index.basis}`;
    document.querySelectorAll(".basisDate").forEach((e) => { e.textContent = index.basis; });
    $("sido").innerHTML = index.sidos.map((s) => `<option>${esc(s.sido)}</option>`).join("");
    const start = index.sidos.find((s) => s.sido === "경상북도") ? "경상북도" : index.sidos[0].sido;
    $("sido").value = start;
    await selectSido(start);
  })();
})();
