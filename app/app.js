(function () {
  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  let index = null;          // data/index.json
  const cache = {};          // 시도별 데이터
  let data = [];             // 현재 보여줄 대상
  let userPos = null;        // 기기 안에서만 사용, 서버로 보내지 않음
  let map = null;
  // 지도 영역 모드: 사용자가 지도를 움직이거나 확대하면 화면 안의 어린이집을 보여준다
  let area = null;           // { s, w, n, e, center }
  let allRows = null;        // 전국 데이터 (영역 모드에서 시·도 경계를 넘어도 보이게)
  let programmaticUntil = 0;  // 앱이 지도를 맞춘 직후 이 시각까지의 idle은 사용자 이동으로 보지 않는다
  const AREA_MIN_ZOOM = 12;  // 이보다 멀리서는 너무 많아 자동 표시하지 않는다
  const AREA_MAX_MARKERS = 3000;  // 클러스터로 묶어 그리므로 화면 안 전체를 대상으로
  const CLUSTER_PX = 56;          // 이 픽셀 칸 안의 어린이집은 하나의 묶음으로
  let markers = [];

  // 탭 전환
  document.querySelectorAll("nav.tabs button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("nav.tabs button").forEach((x) => x.setAttribute("aria-selected", x === b));
      document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === b.dataset.view));
    });
  });

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  }
  function splitCityGu(d) {
    const sg = String(d.sigungu || "").trim();
    const [c, g] = sg.split(/\s+/);
    if (g) { d.city = c; d.gu = g; return; }
    const m = sg.match(/^(.+?시)(.+구)$/); // "수원시영통구"처럼 붙어 있는 경우
    if (m) { d.city = m[1]; d.gu = m[2]; return; }
    const p = String(d.addr || "").trim().split(/\s+/);
    d.city = sg;
    d.gu = /시$/.test(sg) && p[1] === sg && /구$/.test(p[2] || "") ? p[2] : "";
  }
  let selGu = ""; // 시 안의 일반구 (예: 포항시 북구)
  // 서울시 특화 보육 (data/seoul_svc.py → seoul_svc.json): 서울 데이터를 불러올 때 d.seoulSvc(종류)·d.stcode를 붙인다. 없으면 표시 안 함
  const SEOUL_SVC = {
    "365": { label: "365열린", ic: "🌗", when: "365일 07:30~24:00 (1.1·설·추석 연휴·5.5 제외)", fee: "1시간 3,000원 · 1일 5만 원", how: "1일 전까지 온라인 예약 · 긴급 시 당일 방문", url: "https://iseoul.seoul.go.kr/portal/reservation/dailyOpenPreschoolMiddle.do" },
    night: { label: "거점형 야간", ic: "🌙", when: "평일 16:00~22:00", fee: "무료 (저녁 식비 별도)", how: "이용 당일 오후 1시까지 온라인 신청", url: "https://iseoul.seoul.go.kr/portal/reservation/baseExtendInfo.do" },
    weekend: { label: "주말", ic: "🗓️", when: "토·일 09:00~18:00 (1.1·설·추석 연휴 제외)", fee: "1시간 3,000원", how: "1일 전까지 온라인 예약 · 긴급 시 당일 방문", url: "https://iseoul.seoul.go.kr/portal/reservation/wkendInfo.do" },
    holiday: { label: "휴일", ic: "🎌", when: "일요일·공휴일 07:30~19:30", fee: "무료", how: "다니는 어린이집 이용 아동 · 어린이집에 전화 접수", url: "https://iseoul.seoul.go.kr/portal/reservation/holi_info.do" },
  };
  let seoulSvc = null;
  const loadSeoulSvc = () => seoulSvc ? Promise.resolve(seoulSvc) : fetchJson("data/seoul_svc.json").then((j) => (seoulSvc = j)).catch(() => (seoulSvc = { basis: "", items: {} }));
  // 서울시 보육포털: 시설 코드가 있으면 그 어린이집 홈페이지, 없으면 이름 검색 결과로
  const iseoulUrl = (d) => d.stcode ? `https://iseoul.seoul.go.kr/homepage/main.do?stCode=${encodeURIComponent(d.stcode)}` : `https://iseoul.seoul.go.kr/portal/info/preSchoolList.do?crname=${encodeURIComponent(d.name)}`;
  async function loadSido(sido) {
    if (cache[sido]) return cache[sido];
    const meta = index && index.sidos.find((s) => s.sido === sido);
    if (!meta) throw new Error(`알 수 없는 지역: ${sido}`);
    const [rows, svc] = await Promise.all([fetchJson(`data/${meta.file}`), sido === "서울특별시" ? loadSeoulSvc() : null]);
    if (!Array.isArray(rows)) throw new Error(`${meta.file}: 형식 오류`);
    rows.forEach((d, i) => {
      d.id = `${meta.file}-${i}`; splitCityGu(d);
      const s = svc && svc.items[`${d.sigungu}|${d.name}`];
      if (s) { d.seoulSvc = s.kinds; if (s.stcode) d.stcode = s.stcode; }
    });
    return (cache[sido] = rows);
  }
  // 일부 시도가 실패해도 받은 곳까지는 보여준다
  async function loadAll() {
    const all = await Promise.allSettled(index.sidos.map((s) => loadSido(s.sido)));
    const ok = all.filter((r) => r.status === "fulfilled").map((r) => r.value);
    if (!ok.length) throw new Error("전국 데이터를 불러오지 못했습니다.");
    return { rows: ok.flat(), failed: all.length - ok.length };
  }

  // 데이터를 못 불러왔을 때: 목록 자리에 안내와 다시 시도 버튼
  function showLoadError(msg, retry) {
    console.error(msg);
    $("count").textContent = "데이터를 불러오지 못했습니다";
    $("pager").innerHTML = "";
    $("list").innerHTML = `<li class="empty-row" role="alert">데이터를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.<br><button type="button" class="chip" data-retry>다시 시도</button></li>`;
    $("list").querySelector("[data-retry]").addEventListener("click", retry);
  }

  function fillSigungu() {
    const list = [...new Set(data.map((d) => d.city))].sort();
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
    return `<div class="panel" data-panel="rate"><h4>⭐ 내 평가 (재원 학부모)</h4>
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
  // 등록대기 아동 수: OPEN API(cpmsapi030) 연동 후 waitTotal·waitByAge가 데이터에 들어온다
  function waitText(d) {
    const link = `<a href="https://www.childcare.go.kr/?menuno=175" target="_blank" rel="noopener">아이사랑에서 신청</a>`;
    if (d.waitTotal == null) return `정보 준비 중 · ${link}`;
    const ages = d.waitByAge ? Object.entries(d.waitByAge).filter(([, n]) => n > 0).map(([a, n]) => `만 ${a}세 ${n}명`).join(", ") : "";
    return `${d.waitTotal}명${ages ? ` <small>(${ages})</small>` : ""} · ${link}`;
  }
  // 목록 카드용 등록대기 배지: 우리 아이 연령반(My에 등록한 아이)이 있으면 그 반 대기자 수를 먼저 보여준다
  // 우리 아이 반 기준 대기자 수 (아이 미등록·반 정보 없음이면 null)
  function myClassWait(d) {
    const cls = window.TIMELINE && TIMELINE.childClass ? TIMELINE.childClass() : null; // "만 1세반" 등
    const age = cls && (cls.match(/만 (\d)세반/) || [])[1];
    return { cls, n: age != null && d.waitByAge && d.waitByAge[age] != null ? d.waitByAge[age] : null };
  }
  // 정렬용: 우리 아이 반 대기 → 없으면 전체 대기, 데이터 없으면 null
  const waitOf = (d) => (d.waitTotal == null ? null : myClassWait(d).n ?? d.waitTotal);
  function waitBadge(d) {
    if (d.waitTotal == null) return "";
    const { cls, n } = myClassWait(d);
    const text = n != null ? `${cls} 대기 <em>${n}명</em>` : `등록대기 <em>${d.waitTotal}명</em>`;
    const level = (n ?? d.waitTotal) === 0 ? "ok" : (n ?? d.waitTotal) >= 10 ? "many" : "";
    return `<span class="tag wait ${level}${n != null ? " mine" : ""}" title="아이사랑 등록대기 아동 수 (정보공개포털 기준)"><i aria-hidden="true">⏳</i>${text}</span>`;
  }
  const seatsLeft = (d) => (d.capacity && d.current != null ? d.capacity - d.current : null);
  const ratioOf = (d) => (d.staff && d.current ? d.current / d.staff : null);
  const spaceOf = (d) => (d.area && d.current ? d.area / d.current : null);
  const yearsOf = (d) => (d.since ? (Date.now() - new Date(d.since)) / 31557600000 : null);

  function currentList() {
    const radius = Number($("radius").value);
    const fSeat = $("fSeat").value, fBus = $("fBus").checked, fExt = $("fExt").checked, fPlay = $("fPlay").checked, fAge = $("fAge").value, fCap = $("fCap").value, fCur = $("fCur").value, fNight = $("fNight").checked, fH24 = $("fH24").checked, fHourly = $("fHourly").checked;
    let list = data;
    if (area) {
      const src = allRows || data;
      list = src.filter((d) => d.lat && d.lat >= area.s && d.lat <= area.n && d.lng >= area.w && d.lng <= area.e)
        .map((d) => ({ ...d, dist: distance(area.center, d) }));
    } else if (userPos) {
      list = data.filter((d) => d.lat).map((d) => ({ ...d, dist: distance(userPos, d) })).filter((d) => !radius || d.dist <= radius);
    } else if ($("sigungu").value) {
      list = data.filter((d) => d.city === $("sigungu").value && (!selGu || d.gu === selGu));
    }
    const q = $("q").value.trim().replace(/\s+/g, "");
    list = list.filter((d) => {
      if (q && !`${d.name}${d.addr || ""}`.replace(/\s+/g, "").includes(q)) return false;
      if (typeFilter && d.type !== typeFilter) return false;
      if (fBus && !d.bus) return false;
      if (fExt && d.extended !== true) return false;
      if (fPlay && !(d.playground > 0)) return false;
      if ((fNight && !d.night) || (fH24 && !d.h24) || (fHourly && !d.hourly)) return false;
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
      // 등록대기 적은 순: 데이터 없는 곳은 맨 뒤, 같으면 남은 정원 많은 순
      wait: (a, b) => {
        const wa = waitOf(a), wb = waitOf(b);
        if (wa == null || wb == null) return (wa == null) - (wb == null) || (seatsLeft(b) ?? -1e9) - (seatsLeft(a) ?? -1e9);
        return wa - wb || (seatsLeft(b) ?? -1e9) - (seatsLeft(a) ?? -1e9);
      },
    };
    return [...list].sort(by[sort === "dist" && !userPos && !area ? "name" : sort]);
  }


  // 목록용 지역: 주소 앞부분에서 시·도 + 시·군·구(+ 일반구)까지. 예) 경상북도 포항시 북구, 부산광역시 남구
  const areaOf = (d) => {
    const parts = String(d.addr || "").trim().split(/\s+/);
    const out = parts.length ? [parts[0]] : [];
    for (const t of parts.slice(1, 3)) { if (/(시|군|구)$/.test(t)) out.push(t); else break; }
    if (d.city) return [d.sido, d.city !== d.sido ? d.city : "", d.gu].filter(Boolean).join(" "); // 세종처럼 시도=시군이면 한 번만
    return out.length > 1 ? out.join(" ") : [d.sido, d.sigungu].filter(Boolean).join(" ");
  };
  // My page(관심·최근·비교)에 저장할 요약 (mypage.js)
  const snapOf = (d) => ({ key: keyOf(d), sido: d.sido, name: d.name, type: d.type, area: areaOf(d), capacity: d.capacity, current: d.current,
    left: seatsLeft(d) != null ? Math.max(0, seatsLeft(d)) : null, ratio: ratioOf(d), space: spaceOf(d), extended: d.extended, bus: d.bus, playground: d.playground, years: yearsOf(d) });
  // My page에서 어린이집을 다시 열 때
  window.APP = {
    // 회원가입 학부모 인증에서 어린이집 이름 검색 (지금 불러온 지역 데이터 기준)
    search(q, n = 8) {
      const w = String(q || "").replace(/\s+/g, "");
      if (w.length < 2) return [];
      return data.filter((d) => String(d.name).replace(/\s+/g, "").includes(w)).slice(0, n).map(snapOf);
    },
    // 시작 흐름(onboarding.js)의 동네 선택: 시·도 목록, 시·군·구 목록, 바로 적용
    sidos: () => (index ? index.sidos.map((s) => s.sido) : []),
    async cities(sido) { const rows = await loadSido(sido); return [...new Set(rows.map((d) => d.city))].filter(Boolean).sort((a, b) => a.localeCompare(b, "ko")); },
    setRegion: (sido, city) => applyRegion(sido, city || "", ""),
    // 알림(notify.js): 관심 어린이집의 최신 요약 (정원 여유·등록대기 변화 비교용)
    async snapByKey(sido, key) {
      const rows = sido ? await loadSido(sido) : (await loadAll()).rows;
      const d = rows.find((r) => keyOf(r) === key);
      return d ? { ...snapOf(d), waitTotal: typeof d.waitTotal === "number" ? d.waitTotal : null, tel: d.tel, addr: d.addr, lat: d.lat, lng: d.lng, geocoded: !!d.geocoded, stcode: d.stcode || null, seoulSvc: d.seoulSvc || [], iseoul: d.sido === "서울특별시" ? iseoulUrl(d) : null } : null;
    },
    // 나의 어린이집(mydaycare.js): 급할 때 맡길 곳 — 서울시 특화 보육 어린이집을 가까운 순으로
    SEOUL_SVC,
    async seoulSvcNear(lat, lng, n = 12) {
      const rows = await loadSido("서울특별시"), svc = await loadSeoulSvc();
      return rows.filter((d) => d.seoulSvc && d.lat && d.lng).map((d) => ({ ...snapOf(d), tel: d.tel, addr: d.addr, kinds: d.seoulSvc, iseoul: iseoulUrl(d), dist: lat != null ? distance({ lat, lng }, d) : null }))
        .sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0)).slice(0, n).map((x) => ({ ...x, basis: svc.basis }));
    },
    seoulSvcBasis: () => (seoulSvc ? seoulSvc.basis : ""),
    async openByKey(sido, key) {
      const rows = sido ? await loadSido(sido) : (await loadAll()).rows;
      const d = rows.find((r) => keyOf(r) === key);
      if (!d) return;
      const from = document.querySelector('nav.tabs [aria-selected="true"]');
      document.querySelector('nav.tabs [data-view="view-map"]')?.click();
      openDetail(d);
      returnTab = from && from.dataset.view !== "view-map" ? from : null; // 상세에서 뒤로 가면 열었던 탭(나의 어린이집 등)으로
    },
  };
  // 교직원 평균 근속연수: 어린이집정보공개포털 OPEN API(어린이집별 기본정보 조회) 연동 후 d.tenureAvg(년)로 들어옴
  const tenureOf = (d) => (typeof d.tenureAvg === "number" && d.tenureAvg >= 0 ? d.tenureAvg : null);
  const tenureTag = (d) => tenureOf(d) == null ? "" : `<span class="tag stat tenure" title="교직원 평균 근속연수(추정)"><i aria-hidden="true">🌳</i>평균 근속 <em>${tenureOf(d).toFixed(1)}년</em></span>`;
  // 근속 구간 분포 막대 (d.tenureDist = {lt1, 1to2, 2to4, 4to6, ge6} 인원)
  const TENURE_BINS = [["lt1", "1년 미만"], ["1to2", "1~2년"], ["2to4", "2~4년"], ["4to6", "4~6년"], ["ge6", "6년 이상"]];
  function tenureDistHTML(d) {
    const t = d.tenureDist; if (!t || tenureOf(d) == null) return "";
    const total = TENURE_BINS.reduce((a, [k]) => a + (Number(t[k]) || 0), 0); if (!total) return "";
    return `<div class="tenure-dist" role="img" aria-label="근속연수 분포: ${TENURE_BINS.map(([k, l]) => `${l} ${Number(t[k]) || 0}명`).join(", ")}">
      <span class="td-bar">${TENURE_BINS.map(([k], i) => `<i class="td${i}" style="flex:${Number(t[k]) || 0}"></i>`).join("")}</span>
      <span class="td-legend">${TENURE_BINS.map(([k, l], i) => `<small><i class="td${i}"></i>${l} ${Number(t[k]) || 0}</small>`).join("")}</span></div>`;
  }
  const rbOf = (d) => (window.RATINGS ? RATINGS.badge(keyOf(d)) : ""); // 인증 학부모 별점 배지 (ratings.js)
  // 화면별 출처 (디자인 세션) — 정보 바로 아래에 붙인다
  const srcLine = (html) => `<p class="src-line">출처: ${html}</p>`;
  const SRC = {
    basic: () => `어린이집정보공개포털(한국사회보장정보원) · 기준일 ${esc(index ? index.basis : "")}`,
    ext: "연장보육: 공공데이터포털(2024)",
    seoul: () => `서울시 특화 보육: 서울 열린데이터광장(공공누리 1유형) · 기준일 ${esc(seoulSvc ? seoulSvc.basis : "")}`,
  };
  window.APP_SRC = SRC;
  const tagsOf = (d) => `${d.extended ? '<span class="tag"><i aria-hidden="true">🌙</i>연장보육</span>' : ""}${d.bus ? '<span class="tag"><i aria-hidden="true">🚌</i>통학차량</span>' : ""}${d.playground > 0 ? '<span class="tag"><i aria-hidden="true">🛝</i>놀이터</span>' : ""}${yearsOf(d) != null && yearsOf(d) <= 3 ? '<span class="tag"><i aria-hidden="true">✨</i>신규</span>' : ""}${yearsOf(d) >= 10 ? `<span class="tag gray">${Math.floor(yearsOf(d))}년 운영</span>` : ""}`;
  const ICON = {
    back: '<path d="m15 5-7 7 7 7"/>', chevron: '<path d="m9 5 7 7-7 7"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="M12 8v5M12 17h.01"/>',
    phone: '<path d="m7 3 3 5-3 2c2 4 3 5 7 7l2-3 5 3-2 4C9 21 3 15 3 5Z"/>',
    route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8"/>',
    external: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4Z"/><circle cx="12" cy="13" r="3.5"/>',
  };
  const ic = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
  const houseArt = `<div class="house-art"><svg viewBox="0 0 390 158" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><circle cx="307" cy="46" r="22" fill="#F5DEA0"/><ellipse cx="250" cy="174" rx="170" ry="59" fill="#F0F9F6"/><rect x="133" y="74" width="124" height="83" rx="12" fill="#fff"/><path d="m117 78 78-55 78 55Z" fill="#2B7668"/><rect x="182" y="107" width="27" height="51" rx="8" fill="#245C52"/><g fill="#F5DEA0"><rect x="152" y="93" width="18" height="22" rx="4"/><rect x="222" y="93" width="18" height="22" rx="4"/></g><rect x="93" y="118" width="8" height="43" rx="4" fill="#245C52"/><ellipse cx="97" cy="105" rx="31" ry="37" fill="#2B7668"/></svg><span>사진 준비 중 · 일러스트</span></div>`;

  // 상세 상단: 네이버 Static Map (등록한 웹 주소에서만 동작하는 Client ID만 사용, Secret 불필요)
  function staticMap(d) {
    if (!cfg.NAVER_MAPS_KEY_ID || !d.lat) return "";
    const dark = document.documentElement.dataset.theme === "dark";
    const pos = `${d.lng} ${d.lat}`;
    const src = `https://maps.apigw.ntruss.com/map-static/v2/raster-cors?w=480&h=160&scale=2&level=16&center=${d.lng},${d.lat}`
      + `&markers=${encodeURIComponent(`type:d|size:mid|color:0x245C52|pos:${pos}`)}&X-NCP-APIGW-API-KEY-ID=${encodeURIComponent(cfg.NAVER_MAPS_KEY_ID)}`;
    return `<div class="house-art static-map${dark ? " dim" : ""}"><img src="${src}" alt="${esc(d.name)} 위치 지도" loading="lazy" onerror="this.parentNode.classList.add('failed')">`
      + `<span>${d.geocoded ? "주소 기준 위치 · " : ""}© NAVER Corp.</span></div>`;
  }

  // 상세 화면 (뒤로가기 버튼·기기 뒤로가기 모두 목록으로 복귀)
  let detailOpen = false, listScroll = 0;
  function openDetail(d) {
    listScroll = document.querySelector("main").scrollTop;
    const s = seat(d), r = ratioOf(d), sp = spaceOf(d), left = seatsLeft(d);
    const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    const root = $("view-detail");
    root.innerHTML = `
      <header class="detail-header">
        <button class="icon-button" id="detailBack" aria-label="목록으로 돌아가기">${ic("back")}</button>
        <h2>어린이집 정보</h2>
      </header>
      <div class="detail-body">
        <div id="photoHero">${staticMap(d) || houseArt}</div>
        <div class="detail-content">
          <div>
            <span class="badge">${esc(d.type)}</span> <span class="seat ${s.cls}">${s.text}</span>
            <div class="detail-name-row"><h2 class="detail-name">${esc(d.name)}</h2>
              <button type="button" class="fav-pill" id="favBtn" aria-pressed="false" aria-label="관심 어린이집에 담기"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg><span>관심</span></button></div>
            <p class="detail-address">${esc(d.addr || d.sigungu)}</p>
            ${/^https?:\/\//.test(d.site || "") ? `<a class="site-link" href="${esc(d.site)}" target="_blank" rel="noopener noreferrer" title="어린이집이 정보공개포털에 등록한 주소예요. 이 앱이 관리하는 사이트가 아니에요.">🌐 어린이집 사이트 바로가기<span aria-hidden="true">↗</span></a>` : ""}
            ${d.geocoded ? `<p class="geo-note" title="좌표가 없어 주소로 찾은 위치예요. 실제와 조금 다를 수 있어요.">📍 주소 기준 위치</p>` : ""}
            <div class="tags">${tagsOf(d)}</div>
          </div>
          <div class="metrics">
            <div><span ${d.dist != null ? "" : 'title="정원에서 현원을 뺀 값"'}>${d.dist != null ? "현재 위치에서" : "남은 정원(계산)"}</span><strong>${d.dist != null ? fmt(d.dist) : left != null ? Math.max(0, left) + "명" : "-"}</strong></div>
            <div><span>정원</span><strong>${d.capacity ?? "-"}명</strong></div>
            <div><span>현원</span><strong>${d.current ?? "-"}명</strong></div>
          </div>
          ${window.RATINGS ? RATINGS.section(keyOf(d)) : ""}
          <section class="facts">
            <h3>시설 정보</h3>
            <dl>
              ${row('<span title="현원 ÷ 교직원 수">교직원 1명당 아이(계산)</span>', r ? `${r.toFixed(1)}명` : "정보 없음")}
              ${row('<span title="근속연수 구간 인원으로 계산 (6년 이상은 7년)">교직원 평균 근속(추정)</span>', tenureOf(d) != null ? `${tenureOf(d).toFixed(1)}년` : "정보 준비 중")}
              ${tenureDistHTML(d)}
              ${row("보육실 · 면적", `${d.rooms ?? "-"}개 · ${d.area ?? "-"}㎡${sp ? ` <small title="보육실 면적 ÷ 현원">(1명당 ${sp.toFixed(1)}㎡, 계산)</small>` : ""}`)}
              ${row("놀이터", d.playground ? `${d.playground}곳` : "없음")}
              ${row("CCTV", d.cctv != null ? `${d.cctv}대` : "정보 없음")}
              ${row("통학차량", d.bus ? "운영" : "미운영")}
              ${row("연장보육", d.extended === true ? "운영" : d.extended === false ? "미운영" : "정보 없음")}
              ${d.night != null || d.h24 != null || d.hourly != null ? row("야간·24시간·시간제", [d.night && "야간연장", d.h24 && "24시간", d.hourly && "시간제"].filter(Boolean).join(" · ") || "운영 안 함") : ""}
              ${d.seoulSvc && d.seoulSvc.length ? row("서울시 특화 보육", d.seoulSvc.map((k) => SEOUL_SVC[k]?.label || k).join(" · ")) : ""}
              ${row("등록대기", waitText(d))}
              ${row("인가", d.since ? `${d.since.slice(0, 4)}년 · 운영 ${Math.floor(yearsOf(d))}년째` : "정보 없음")}
            </dl>
          </section>
          <section class="photos-sec">
            <div class="photos-head"><h3>시설 사진</h3><span id="photoCount"></span></div>
            <div class="photo-strip" id="photoStrip"></div>
            <p class="src-line">원장 등록 사진</p>
            <button class="owner-upload" id="ownerUpload">${ic("camera")}<span><b>원장님이신가요?</b><small>시설 사진을 직접 등록해 주세요</small></span>${ic("chevron")}</button>
          </section>
          <section class="visit-note">
            <h3>방문 전 확인해 주세요</h3>
            <p>남은 정원은 ${esc(index.basis)} 기준 정원과 현원의 차이예요. 실시간 빈자리가 아니며 연령반별 자리와 대기자는 반영되지 않아요. 모집 여부와 운영 시간은 어린이집에 직접 확인하세요.</p>
          </section>
          <div class="more">
            <button class="btn" data-open="check">📝 상담 체크리스트</button>
            <a class="btn" href="https://info.childcare.go.kr/info_html5/pnis/search/NurseryNameSlL.jsp" target="_blank" rel="noopener" data-copy="${esc(d.name)}">💰 비용·식단·일과</a>
            <a class="btn" href="https://www.childcare.go.kr/?menuno=175" target="_blank" rel="noopener">📮 등록대기 신청</a>
            ${d.sido === "서울특별시" ? `<a class="btn" href="${esc(iseoulUrl(d))}" target="_blank" rel="noopener" title="어린이집이 서울시 보육포털에 올린 식단·공지로 연결해요">🍱 식단·공지 (서울시 보육포털)</a>` : ""}
          </div>
          <div class="slot"></div>
          <a class="info-shortcut" href="https://www.childcare.go.kr/?menuno=215" target="_blank" rel="noopener">${ic("shield")}<span>이용 중 불편이 있었나요? 아이사랑 불편신고</span>${ic("chevron")}</a>
          <button class="info-shortcut" id="toViolation">${ic("shield")}<span>위반시설·행위자 공표 확인하기</span>${ic("chevron")}</button>
          ${srcLine(`${SRC.basic()} · ${SRC.ext}${d.seoulSvc && d.seoulSvc.length ? ` · ${SRC.seoul()}` : ""}`)}
        </div>
      </div>
      <div class="detail-actions">
        <div class="action-row">
          ${d.tel ? `<a class="btn secondary" href="tel:${esc(d.tel)}">${ic("phone")}전화 문의</a>` : `<button class="btn secondary" disabled>전화번호 없음</button>`}
          <button class="btn primary" id="routeBtn">${ic("route")}길찾기</button>
        </div>
      </div>`;
    root.querySelector("#detailBack").addEventListener("click", () => history.back());
    root.querySelector("#routeBtn").addEventListener("click", () => openRouteSheet(d));
    root.querySelector("#toViolation").addEventListener("click", () => {
      history.back();
      setTimeout(() => document.querySelector('nav.tabs [data-view="view-violation"]').click(), 0);
    });
    root.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
      const slot = root.querySelector(".slot");
      const same = slot.dataset.open === b.dataset.open;
      slot.dataset.open = same ? "" : b.dataset.open;
      slot.innerHTML = same ? "" : b.dataset.open === "rate" ? ratePanel(d) : checkPanel(d);
      if (!same) { bindPanels(root, d); slot.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
    }));
    root.querySelectorAll("[data-copy]").forEach((a) => a.addEventListener("click", () => {
      try { navigator.clipboard.writeText(a.dataset.copy); } catch {}
      toast(`"${a.dataset.copy}" 이름을 복사했어요. 공시 검색창에 붙여넣어 찾아보세요.`);
    }));
    root.querySelector("#ownerUpload").addEventListener("click", () => openUploadSheet(d));
    renderPhotos(d);
    if (window.RATINGS) RATINGS.bind(root, keyOf(d), d.name, snapOf(d));
    if (window.MYPAGE) { const snap = snapOf(d); MYPAGE.track(snap); MYPAGE.bindFav(root.querySelector("#favBtn"), snap); }
    showDetail(true);
    history.pushState({ detail: true }, "", "#detail");
  }

  // 시설 사진: 원장이 등록한 사진 (시제품은 이 기기에만 저장 · photos.js). 사진이 없으면 기존 그림을 그대로 보여준다.
  const photoUrls = [];
  async function renderPhotos(d) {
    const root = $("view-detail");
    const rows = window.PHOTO_STORE ? await PHOTO_STORE.list(keyOf(d)) : [];
    if (!root.contains($("photoHero"))) return;
    photoUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    const urls = rows.map((r) => { const u = URL.createObjectURL(r.blob); photoUrls.push(u); return u; });
    $("photoCount").textContent = rows.length ? `${rows.length}장` : "";
    if (rows.length) {
      $("photoHero").innerHTML = `<div class="photo-hero"><div class="photo-track">${urls.map((u, i) => `<img src="${u}" alt="${esc(d.name)} 시설 사진 ${i + 1}" data-i="${i}">`).join("")}</div>
          <span class="photo-badge">원장 등록 · 검수 대기</span><span class="photo-index">1 / ${rows.length}</span></div>`;
    }
    $("photoStrip").innerHTML = rows.length
      ? urls.map((u, i) => `<button class="thumb" data-i="${i}" aria-label="사진 ${i + 1} 크게 보기"><img src="${u}" alt=""></button>`).join("")
      : `<p class="photo-empty">아직 등록된 시설 사진이 없어요.</p>`;
    const track = $("photoHero").querySelector(".photo-track");
    if (track) track.addEventListener("scroll", () => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      $("photoHero").querySelector(".photo-index").textContent = `${i + 1} / ${rows.length}`;
    }, { passive: true });
    root.querySelectorAll("#photoHero .photo-track img, #photoStrip .thumb").forEach((el) => el.addEventListener("click", () => openPhotoViewer(d, rows, urls, Number(el.dataset.i))));
  }

  function openPhotoViewer(d, rows, urls, i) {
    const r = rows[i];
    const sh = $("sheet");
    sh.setAttribute("aria-label", "시설 사진 보기");
    sh.innerHTML = `<div class="sheet-top"><h2>시설 사진 ${i + 1} / ${rows.length}</h2><button class="icon-button" data-close aria-label="닫기">${ic("close")}</button></div>
      <img class="viewer-img" src="${urls[i]}" alt="${esc(d.name)} 시설 사진 ${i + 1}">
      <p class="sheet-copy">원장 등록 사진 · ${new Date(r.createdAt).toLocaleDateString("ko-KR")} · 검수 대기<br>시제품: 이 기기에만 저장되어 다른 사람에게는 보이지 않아요.</p>
      <div class="viewer-actions">
        ${i > 0 ? `<button class="btn" data-go="${i - 1}">‹ 이전</button>` : ""}
        ${i < rows.length - 1 ? `<button class="btn" data-go="${i + 1}">다음 ›</button>` : ""}
        <button class="btn danger" data-del>사진 삭제</button>
      </div>`;
    sh.querySelector("[data-close]").addEventListener("click", () => sh.close());
    sh.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => openPhotoViewer(d, rows, urls, Number(b.dataset.go))));
    sh.querySelector("[data-del]").addEventListener("click", async () => {
      if (!confirm("이 사진을 삭제할까요?")) return;
      await PHOTO_STORE.remove(r.id);
      sh.close(); toast("사진을 삭제했어요."); openDetail(d); history.back();
    });
    if (!sh.open) sh.showModal();
  }

  // 원장 사진 등록 시트
  function openUploadSheet(d) {
    const sh = $("sheet");
    let files = [];
    const previews = [];
    sh.setAttribute("aria-label", "시설 사진 등록");
    sh.innerHTML = `<div class="sheet-top"><h2>시설 사진 등록</h2><button class="icon-button" data-close aria-label="닫기">${ic("close")}</button></div>
      <p class="sheet-copy"><b>${esc(d.name)}</b> 원장(대표자)만 등록할 수 있어요. 등록한 사진은 운영자 검수 후 게시돼요.</p>
      <form class="upload-form" novalidate>
        <fieldset><legend>1. 원장 확인</legend>
          <label class="field"><span>원장(대표자) 이름</span><input name="owner" autocomplete="name" required maxlength="20" placeholder="예: 홍길동"></label>
          <p class="note">정식 서비스에서는 휴대폰 본인인증과 어린이집 인가 정보로 원장 여부를 확인해요.</p>
        </fieldset>
        <fieldset><legend>2. 사진 선택 <small>최대 ${PHOTO_STORE.MAX_FILES}장</small></legend>
          <label class="pick"><input type="file" name="files" accept="image/*" multiple>${ic("camera")}<span>사진 고르기</span></label>
          <div class="pick-grid" id="pickGrid"></div>
          <p class="note">외관·보육실·놀이터처럼 시설이 보이는 사진을 올려 주세요. 촬영 위치 등 사진 속 정보는 등록할 때 자동으로 지워져요.</p>
        </fieldset>
        <fieldset><legend>3. 확인 및 동의</legend>
          <label class="check"><input type="checkbox" name="c1">아이·교직원의 얼굴, 이름표, 차량번호 등 개인을 알아볼 수 있는 정보가 사진에 없어요.</label>
          <label class="check"><input type="checkbox" name="c2">직접 찍었거나 사용 권한이 있는 사진이며, 앱에 게시하는 것을 허락해요.</label>
          <label class="check"><input type="checkbox" name="c3">기준에 맞지 않는 사진은 검수 과정에서 게시되지 않거나 삭제될 수 있어요.</label>
        </fieldset>
        <p class="form-error" id="uploadError" role="alert" hidden></p>
        <button class="btn primary submit" type="submit" disabled>사진 등록하기</button>
        <p class="note">시제품: 사진은 이 기기에만 저장되고 서버로 보내지 않아요.</p>
      </form>`;
    const form = sh.querySelector("form");
    const grid = sh.querySelector("#pickGrid");
    const submit = form.querySelector(".submit");
    const valid = () => form.owner.value.trim() && files.length && form.c1.checked && form.c2.checked && form.c3.checked;
    const update = () => { submit.disabled = !valid(); };
    const drawGrid = () => {
      previews.splice(0).forEach((u) => URL.revokeObjectURL(u));
      grid.innerHTML = files.map((f, i) => { const u = URL.createObjectURL(f); previews.push(u); return `<div class="pick-item"><img src="${u}" alt="선택한 사진 ${i + 1}"><button type="button" data-rm="${i}" aria-label="사진 ${i + 1} 빼기">×</button></div>`; }).join("");
      grid.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { files.splice(Number(b.dataset.rm), 1); drawGrid(); update(); }));
    };
    form.files.addEventListener("change", () => {
      const picked = [...form.files.files].filter((f) => f.type.startsWith("image/"));
      if (files.length + picked.length > PHOTO_STORE.MAX_FILES) toast(`사진은 최대 ${PHOTO_STORE.MAX_FILES}장까지 등록할 수 있어요.`);
      files = files.concat(picked).slice(0, PHOTO_STORE.MAX_FILES);
      form.files.value = "";
      drawGrid(); update();
    });
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!valid()) return;
      submit.disabled = true; submit.textContent = "사진 정리하는 중…";
      try {
        const n = await PHOTO_STORE.add(keyOf(d), files, { uploader: form.owner.value.trim(), consents: ["no-personal-info", "license", "moderation"] });
        sh.close();
        toast(`사진 ${n}장을 등록했어요. 검수 후 게시돼요.`);
        renderPhotos(d);
      } catch (err) {
        const el = sh.querySelector("#uploadError");
        el.hidden = false; el.textContent = "사진을 저장하지 못했어요. 다른 사진으로 다시 시도해 주세요.";
        submit.disabled = false; submit.textContent = "사진 등록하기";
      }
    });
    sh.querySelector("[data-close]").addEventListener("click", () => sh.close());
    sh.addEventListener("close", () => previews.splice(0).forEach((u) => URL.revokeObjectURL(u)), { once: true });
    if (!sh.open) sh.showModal();
  }
  let returnTab = null; // openByKey로 다른 탭에서 열었을 때 돌아갈 탭
  function showDetail(on) {
    detailOpen = on;
    document.body.classList.toggle("detail-mode", on);
    $("view-detail").classList.toggle("active", on);
    $("view-map").classList.toggle("active", !on);
    const main = document.querySelector("main");
    if (on) main.scrollTop = 0;
    else main.scrollTop = listScroll;
  }
  window.addEventListener("popstate", () => {
    if (document.querySelector("#account:not([hidden])")) return; // 회원가입 화면이 먼저 닫힘 (account.js)
    if (!detailOpen) return;
    if ($("sheet").open) $("sheet").close();
    showDetail(false);
    if (returnTab) { const t = returnTab; returnTab = null; t.click(); }
  });

  // 길찾기 방법 선택 시트
  function openRouteSheet(d) {
    const pref = window.APP_SETTINGS ? APP_SETTINGS.get().route : "ask";
    if (pref && pref !== "ask") { directions(d, pref); return; }
    const opts = [["walk", "도보"], ["public", "대중교통"], ["car", "자동차"]];
    $("sheet").innerHTML = `<div class="sheet-top"><h2>어떻게 찾아갈까요?</h2><button class="icon-button" data-close aria-label="닫기">${ic("close")}</button></div>
      <p class="sheet-copy">네이버 지도로 ${esc(d.name)}까지 길을 안내해요.</p>
      <div class="sheet-options">${opts.map(([m, l]) => `<button data-route="${m}">${l}${ic("external")}</button>`).join("")}</div>`;
    $("sheet").setAttribute("aria-label", "길찾기 방법 선택");
    $("sheet").querySelector("[data-close]").addEventListener("click", () => $("sheet").close());
    $("sheet").querySelectorAll("[data-route]").forEach((b) => b.addEventListener("click", () => { $("sheet").close(); directions(d, b.dataset.route); }));
    $("sheet").showModal();
  }
  $("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) $("sheet").close(); });

  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.classList.add("visible");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("visible"), 3500);
  }

  const PAGE = 10;
  let page = 1;
  // 필터·검색이 바뀌면 1페이지로, 페이지 번호를 누를 때만 keepPage
  function render(opts) {
    if (!opts || !opts.keepPage) page = 1;
    const all = currentList();
    const pages = Math.max(1, Math.ceil(all.length / PAGE));
    page = Math.min(page, pages);
    const offset = (page - 1) * PAGE;
    const list = all.slice(offset, offset + PAGE);
    $("count").textContent = area ? `지도 화면 안 어린이집 ${all.length.toLocaleString()}곳 (지도 가운데에서 가까운 순)` : `조건에 맞는 어린이집 ${all.length.toLocaleString()}곳`;
    renderPager(pages);
    $("list").innerHTML = list.length ? list.map((d, i) => {
      const s = seat(d);
      return `
      <li data-id="${d.id}">
        <div class="head" role="button" tabindex="0" aria-label="${esc(d.name)} 상세 보기">
          <span class="no-col"><span class="no emo" data-t="${typeKey(d)}" aria-hidden="true">${emojiOf(d)}</span><span class="no-type" data-t="${typeKey(d)}">${esc(typeShort(d))}</span></span>
          <span class="t"><span class="name-row"><b>${esc(d.name)}</b>${window.MYPAGE ? `<button type="button" class="fav-mini" data-fav aria-pressed="false" aria-label="${esc(d.name)} 관심 담기"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg></button>` : ""}</span><small class="area">${esc(areaOf(d))}</small>${d.dist != null || d.geocoded ? `<small>${[d.dist != null ? `${d.geocoded ? "약 " : ""}${fmt(d.dist)}` : "", d.geocoded ? '<span class="geo-mini" title="주소로 찾은 위치">주소 기준 위치</span>' : ""].filter(Boolean).join(" · ")}</small>` : ""}${waitBadge(d) ? `<span class="wait-line">${waitBadge(d)}</span>` : ""}
</span>
          <span class="side"><span class="seat ${s.cls}">${s.text}</span></span>
          ${rbOf(d) || ratioOf(d) || tenureOf(d) != null || tagsOf(d) ? `<span class="tags">${rbOf(d)}${ratioOf(d) ? `<span class="tag stat"><i aria-hidden="true">🧑‍🏫</i>교직원당 아이 <em>${ratioOf(d).toFixed(1)}명</em></span>` : ""}${tenureTag(d)}${tagsOf(d)}</span>` : ""}
        </div>
      </li>`;
    }).join("") : `<li class="empty-row">조건에 맞는 어린이집이 없습니다. 필터를 줄여 보세요.</li>`;
    $("list").querySelectorAll("li[data-id]").forEach((li) => {
      const d = list.find((x) => x.id === li.dataset.id);
      const head = li.querySelector(".head");
      head.addEventListener("click", () => openDetail(d));
      head.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === head) { e.preventDefault(); openDetail(d); } });
      // 이름 옆 하트: 관심 어린이집 담기 (mypage.js)
      const fav = li.querySelector("[data-fav]");
      if (fav && window.MYPAGE) { fav.addEventListener("click", (e) => e.stopPropagation()); MYPAGE.bindFav(fav, snapOf(d)); }
    });
    // 지역 선택 모드: 그 지역 전체를 클러스터로 그리고, 페이지 넘김이 아닐 때만 지도를 지역에 맞춘다
    if (area) drawMarkers(all.slice(0, AREA_MAX_MARKERS), offset);
    else if (!userPos) drawMarkers(all.slice(0, AREA_MAX_MARKERS), offset, { cluster: true, fit: !(opts && opts.keepPage) });
    else drawMarkers(list, offset, { fit: !(opts && opts.keepPage) });
  }

  // 페이지 번호: 현재 페이지 주변 3개 + 처음/끝 + 이전/다음 (모바일 한 줄)
  function renderPager(pages) {
    const el = $("pager");
    if (pages <= 1) { el.innerHTML = ""; return; }
    let start = Math.max(1, page - 1);
    const end = Math.min(pages, start + 2);
    start = Math.max(1, end - 2);
    const btn = (n, label, aria, extra = "") => `<button type="button" data-page="${n}" aria-label="${aria}" ${extra}>${label}</button>`;
    let html = btn(page - 1, "‹", "이전 페이지", page === 1 ? "disabled" : "");
    if (start > 1) html += btn(1, "1", "1페이지") + (start > 2 ? `<span class="gap" aria-hidden="true">…</span>` : "");
    for (let n = start; n <= end; n++) html += btn(n, n, `${n}페이지`, n === page ? 'aria-current="page"' : "");
    if (end < pages) html += (end < pages - 1 ? `<span class="gap" aria-hidden="true">…</span>` : "") + btn(pages, pages, `${pages}페이지`);
    html += btn(page + 1, "›", "다음 페이지", page === pages ? "disabled" : "");
    el.innerHTML = html;
  }
  $("pager").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-page]");
    if (!b || b.disabled) return;
    page = Number(b.dataset.page);
    render({ keepPage: true });
    $("count").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // 네이버 지도 (Client ID가 없으면 목록만 표시)
  // 유형별 귀여운 이모티콘 (목록 카드·지도 마커 공통)
  const TYPE_EMOJI = { "국공립": "🏫", "민간": "🎈", "가정": "🏡", "직장": "💼", "사회복지법인": "🤝", "법인·단체등": "🌈", "협동": "🌱" };
  const emojiOf = (d) => TYPE_EMOJI[d.type] || "🐣";
  // 유형별 원 배경색 (디자인 세션) — 목록 .no.emo[data-t]와 지도 마커가 같은 색
  const TYPE_KEY = { "국공립": "pub", "민간": "pri", "가정": "home", "직장": "work", "사회복지법인": "soc", "법인·단체등": "corp", "협동": "coop" };
  const TYPE_BG = { pub: "#DDF1EA", pri: "#E3ECFB", home: "#FBF1D6", work: "#ECE6F8", soc: "#DDF3F1", corp: "#FBE4EE", coop: "#E2F3D8", etc: "#EEF0EC" };
  const typeKey = (d) => TYPE_KEY[d.type] || "etc";
  const TYPE_SHORT = { "사회복지법인": "사회복지", "법인·단체등": "법인·단체" }; // 이모티콘 아래 칸에 맞게 짧게
  const typeShort = (d) => TYPE_SHORT[d.type] || d.type || "기타";
  const pinIcon = (d, n) => ({ content: `<div style="position:relative;width:32px;height:32px;border-radius:50%;background:${TYPE_BG[typeKey(d)]};border:2px ${d.geocoded ? "dashed #E9CB7A" : "solid #fff"};box-shadow:0 2px 8px rgba(40,77,57,.3);display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;cursor:pointer;font-family:'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif" title="${n}번 ${esc(d.name)} · ${esc(d.type)}${d.geocoded ? " · 주소 기준 위치" : ""}">${emojiOf(d)}</div>`, anchor: new naver.maps.Point(16, 16) });
  // 화면 픽셀 격자로 가까운 어린이집을 묶는다
  function clusterize(list) {
    const proj = map.getProjection();
    const cells = new Map();
    list.forEach((d, i) => {
      const p = proj.fromCoordToOffset(new naver.maps.LatLng(d.lat, d.lng));
      const key = `${Math.floor(p.x / CLUSTER_PX)}:${Math.floor(p.y / CLUSTER_PX)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push({ d, rank: i + 1 });
    });
    return [...cells.values()];
  }
  const clusterIcon = (n) => {
    const size = n < 10 ? 34 : n < 100 ? 42 : 50;
    return { content: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(43,118,104,.88);color:#fff;border:3px solid rgba(255,255,255,.9);box-shadow:0 2px 10px rgba(40,77,57,.3);display:flex;align-items:center;justify-content:center;font:700 13px sans-serif" title="어린이집 ${n}곳 · 눌러서 확대">${n}</div>`, anchor: new naver.maps.Point(size / 2, size / 2) };
  };

  function drawMarkers(list, offset = (page - 1) * PAGE, o = {}) {
    if (!map) return;
    markers.forEach((m) => m.setMap(null));
    if (o.fit) fitTo(list);
    if (area || o.cluster) {
      markers = [];
      clusterize(list.filter((d) => d.lat)).forEach((g) => {
        if (g.length === 1) {
          const { d, rank } = g[0];
          const m = new naver.maps.Marker({ map, position: new naver.maps.LatLng(d.lat, d.lng), title: d.name, icon: pinIcon(d, rank) });
          naver.maps.Event.addListener(m, "click", () => openDetail(d));
          markers.push(m);
          return;
        }
        const lat = g.reduce((a, x) => a + x.d.lat, 0) / g.length, lng = g.reduce((a, x) => a + x.d.lng, 0) / g.length;
        const m = new naver.maps.Marker({ map, position: new naver.maps.LatLng(lat, lng), title: `어린이집 ${g.length}곳`, icon: clusterIcon(g.length), zIndex: 100 });
        naver.maps.Event.addListener(m, "click", () => map.morph(new naver.maps.LatLng(lat, lng), Math.min(map.getZoom() + 2, 19)));
        markers.push(m);
      });
      return;
    }
    const pts = list.filter((d) => d.lat);
    markers = pts.map((d) => {
      const m = new naver.maps.Marker({ map, position: new naver.maps.LatLng(d.lat, d.lng), title: d.name, icon: pinIcon(d, offset + list.indexOf(d) + 1) });
      naver.maps.Event.addListener(m, "click", () => openDetail(d));
      return m;
    });
  }

  // 목록 전체가 보이도록 지도를 맞춘다 (앱이 움직인 것이므로 영역 자동 검색은 일으키지 않음)
  function fitTo(list) {
    const ll = list.filter((d) => d.lat).map((d) => new naver.maps.LatLng(d.lat, d.lng));
    if (userPos) ll.push(new naver.maps.LatLng(userPos.lat, userPos.lng));
    if (!ll.length || area) return;
    programmaticUntil = Date.now() + 1500;  // setCenter+setZoom 등은 idle이 여러 번 올 수 있어 시간으로 판단
    if (ll.length === 1) { map.setCenter(ll[0]); map.setZoom(16); return; }
    const bounds = new naver.maps.LatLngBounds(ll[0], ll[0]);
    ll.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
  }

  function initMap() {
    if (!cfg.NAVER_MAPS_KEY_ID) {
      $("map").style.height = "auto"; $("map").style.minHeight = "0";
      $("map").innerHTML = `<div class="map-fallback">네이버 Maps Client ID를 config.js에 넣으면 지도가 표시됩니다.</div>`;
      return;
    }
    const s = document.createElement("script");
    // Style Editor에서 만든 스타일 ID가 있으면 GL 지도로 앱 디자인에 맞춘 색을 쓴다 (라이트/다크 따로)
    const styleOf = () => (document.documentElement.dataset.theme === "dark" ? cfg.NAVER_MAP_STYLE_ID_DARK : cfg.NAVER_MAP_STYLE_ID) || "";
    const useGL = !!(cfg.NAVER_MAP_STYLE_ID || cfg.NAVER_MAP_STYLE_ID_DARK);
    s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(cfg.NAVER_MAPS_KEY_ID)}${useGL ? "&submodules=gl" : ""}`;
    s.onload = () => {
      const opts = { center: new naver.maps.LatLng(36.5, 127.8), zoom: 7 };
      if (useGL && styleOf()) Object.assign(opts, { gl: true, customStyleId: styleOf() });
      map = new naver.maps.Map("map", opts);
      if (opts.gl) $("map").classList.add("styled");
      if (useGL && window.APP_SETTINGS) APP_SETTINGS.onChange((k) => {
        if (k === "theme" && map.setOptions && styleOf()) map.setOptions({ customStyleId: styleOf() });
      });
      let t;
      naver.maps.Event.addListener(map, "idle", () => {
        if (Date.now() < programmaticUntil) {  // 앱이 맞춘 이동: 영역 검색은 하지 않고, 바뀐 확대 수준으로 묶음만 다시 그린다
          clearTimeout(t);
          t = setTimeout(() => { if (!area && !userPos) render({ keepPage: true, noFit: true }); }, 200);
          return;
        }
        clearTimeout(t); t = setTimeout(onMapMoved, 250);
      });
      render();
    };
    s.onerror = () => { $("map").innerHTML = `<div class="map-fallback">지도를 불러오지 못했습니다. Client ID와 등록 도메인을 확인하세요.</div>`; };
    document.head.appendChild(s);
  }

  async function onMapMoved() {
    const z = map.getZoom();
    if (z < AREA_MIN_ZOOM) {
      if (area) return;  // 이미 영역 모드면 축소해도 마지막 영역 유지
      if ($("view-map").dataset.mode === "map") toast("지도를 조금 더 확대하면 그 지역 어린이집을 자동으로 보여드려요.");
      return;
    }
    const b = map.getBounds();
    const sw = b.getSW(), ne = b.getNE(), c = map.getCenter();
    area = { s: sw.lat(), w: sw.lng(), n: ne.lat(), e: ne.lng(), center: { lat: c.lat(), lng: c.lng() } };
    if (!allRows) {
      $("count").textContent = "이 지역 어린이집을 불러오는 중…";
      try { allRows = (await loadAll()).rows; } catch (e) { allRows = null; }
    }
    updateRegionLabel();
    render();
  }
  function exitArea() { area = null; }

  async function selectSido(sido) {
    exitArea();
    selGu = "";
    $("count").textContent = "불러오는 중…";
    userPos = null;
    try {
      data = sido ? await loadSido(sido) : (await loadAll()).rows; // "" = 전국
    } catch (e) {
      data = [];
      showLoadError(e.message, () => selectSido(sido).then(updateRegionLabel));
      return;
    }
    fillSigungu();
    showOptionalFilters(data);
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
        exitArea();
        n.textContent = "전국 데이터를 불러와 가까운 순으로 정렬하는 중…";
        try {
          const r = await loadAll();
          data = r.rows;
          n.textContent = r.failed ? `현재 위치 기준으로 정렬했습니다. (${r.failed}개 시·도는 불러오지 못해 빠졌어요)` : "현재 위치 기준 가까운 순으로 정렬했습니다.";
        } catch (e) {
          userPos = null;
          n.textContent = "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
          return;
        }
        updateRegionLabel();
        render();
      },
      () => { n.textContent = "위치 권한이 없어 지역 선택으로 보여드립니다."; },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });

  $("sido").addEventListener("change", () => selectSido($("sido").value).then(updateRegionLabel));
  $("sigungu").addEventListener("change", () => { selGu = ""; userPos = null; exitArea(); updateRegionLabel(); render(); });

  // 지역 선택 시트: 시도 → 시군구 두 단계
  function updateRegionLabel() {
    $("regionLabel").textContent = area ? "지도 화면 안" : userPos ? "현재 위치 주변" : [$("sido").value || "전국", $("sigungu").value, $("sigungu").value && selGu].filter(Boolean).join(" ");
    $("regionBtn").setAttribute("aria-label", `지역 변경: ${$("regionLabel").textContent}`);
    // 반경은 현재 위치로 찾았을 때만 의미가 있어서 그때만 보여준다
    const rf = $("radius").closest(".radius-field");
    if (rf) rf.hidden = !userPos;
  }
  const DOWN_BACK = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>';
  const CHECK = "<b>✓</b>";
  function regionSheet(html, label) {
    const sh = $("sheet");
    sh.setAttribute("aria-label", label);
    sh.innerHTML = `<div class="sheet-top"><h2>어느 동네를 살펴볼까요?</h2><button class="icon-button" data-close aria-label="닫기">${ic("close")}</button></div>${html}`;
    sh.querySelector("[data-close]").addEventListener("click", () => sh.close());
    if (!sh.open) sh.showModal();
  }
  function openSidoSheet() {
    const cur = userPos || area ? null : $("sido").value;
    const nation = cur === "";
    regionSheet(`<p class="sheet-copy">전국 또는 시·도를 골라 주세요.</p>
      <div class="sheet-options scroll"><button data-nation class="${nation ? "selected" : ""}">전국${nation ? CHECK : ""}</button>${index.sidos.map((s) => `<button data-sido="${esc(s.sido)}" class="${s.sido === cur ? "selected" : ""}">${esc(s.sido)}${s.sido === cur ? CHECK : ""}</button>`).join("")}</div>`, "시도 선택");
    $("sheet").querySelector("[data-nation]").addEventListener("click", async () => {
      $("sheet").close();
      $("sido").value = "";
      await selectSido("");
      $("sigungu").value = ""; selGu = "";
      $("locNotice").hidden = true;
      updateRegionLabel();
      render();
    });
    $("sheet").querySelectorAll("[data-sido]").forEach((b) => b.addEventListener("click", async () => {
      const sido = b.dataset.sido;
      b.innerHTML = `${esc(sido)}<small>불러오는 중…</small>`;
      let rows;
      try { rows = await loadSido(sido); } catch (e) {
        console.error(e);
        b.innerHTML = `${esc(sido)}<small>불러오지 못했어요 · 다시 눌러 주세요</small>`;
        return;
      }
      openSigunguSheet(sido, rows);
    }));
    $("sheet").querySelector(".selected")?.scrollIntoView({ block: "center" });
  }
  async function applyRegion(sido, city, gu) {
    $("sheet").close();
    if ($("sido").value !== sido || userPos) { $("sido").value = sido; await selectSido(sido); }
    $("sigungu").value = city;
    selGu = gu || "";
    userPos = null;
    exitArea();
    $("locNotice").hidden = true;
    updateRegionLabel();
    render();
  }
  function openSigunguSheet(sido, rows) {
    const counts = {}, gus = {};
    rows.forEach((d) => {
      counts[d.city] = (counts[d.city] || 0) + 1;
      if (d.gu) (gus[d.city] = gus[d.city] || new Set()).add(d.gu);
    });
    const list = Object.keys(counts).sort((a, b) => a.localeCompare(b, "ko"));
    const cur = !userPos && $("sido").value === sido ? $("sigungu").value : null;
    const opt = (v, label, n) => `<button data-sgg="${esc(v)}" class="${cur === v ? "selected" : ""}">${label} <small>${n.toLocaleString()}곳${gus[v] ? ` · 구 ${gus[v].size}개` : ""}</small>${cur === v ? CHECK : gus[v] ? "<b>›</b>" : ""}</button>`;
    regionSheet(`<button class="sheet-back" data-back>${DOWN_BACK}시·도 다시 고르기</button>
      <p class="sheet-copy"><b>${esc(sido)}</b>에서 시·군·구를 골라 주세요.</p>
      <div class="sheet-options scroll">${opt("", `${esc(sido)} 전체`, rows.length)}${list.map((s) => opt(s, esc(s), counts[s])).join("")}</div>`, "시군구 선택");
    $("sheet").querySelector("[data-back]").addEventListener("click", openSidoSheet);
    $("sheet").querySelectorAll("[data-sgg]").forEach((b) => b.addEventListener("click", () => {
      const city = b.dataset.sgg;
      if (city && gus[city]) openGuSheet(sido, city, rows);
      else applyRegion(sido, city, "");
    }));
    $("sheet").querySelector(".selected")?.scrollIntoView({ block: "center" });
  }
  function openGuSheet(sido, city, rows) {
    const inCity = rows.filter((d) => d.city === city);
    const counts = {};
    inCity.forEach((d) => { if (d.gu) counts[d.gu] = (counts[d.gu] || 0) + 1; });
    const list = Object.keys(counts).sort((a, b) => a.localeCompare(b, "ko"));
    const cur = !userPos && $("sido").value === sido && $("sigungu").value === city ? selGu : null;
    const opt = (v, label, n) => `<button data-gu="${esc(v)}" class="${cur === v ? "selected" : ""}">${label} <small>${n.toLocaleString()}곳</small>${cur === v ? CHECK : ""}</button>`;
    regionSheet(`<button class="sheet-back" data-back>${DOWN_BACK}${esc(sido)} 시·군 다시 고르기</button>
      <p class="sheet-copy"><b>${esc(sido)} ${esc(city)}</b>에서 구를 골라 주세요.</p>
      <div class="sheet-options scroll">${opt("", `${esc(city)} 전체`, inCity.length)}${list.map((g) => opt(g, esc(g), counts[g])).join("")}</div>`, "구 선택");
    $("sheet").querySelector("[data-back]").addEventListener("click", () => openSigunguSheet(sido, rows));
    $("sheet").querySelectorAll("[data-gu]").forEach((b) => b.addEventListener("click", () => applyRegion(sido, city, b.dataset.gu)));
    $("sheet").querySelector(".selected")?.scrollIntoView({ block: "center" });
  }
  $("regionBtn").addEventListener("click", () => { if (index) openSidoSheet(); });
  $("radius").addEventListener("change", render);
  window.addEventListener("ratings:changed", () => render({ keepPage: true }));
  ["fSeat", "fBus", "fExt", "fPlay", "fNight", "fH24", "fHourly", "fAge", "fCap", "fCur", "sort"].forEach((id) => $(id).addEventListener("change", render));
  // 야간·24시간·시간제 정보는 정보공개포털 OPEN API(cpmsapi030) 연동 후 데이터에 들어오면 필터가 자동으로 보인다
  // "등록대기 적은 순"을 고르면 오해하지 않도록 안내를 함께 보여준다
  $("sort").addEventListener("change", () => { $("waitSortNote").hidden = $("sort").value !== "wait"; });
  function showOptionalFilters(rows) {
    document.querySelectorAll("[data-needs]").forEach((el) => { el.hidden = !rows.some((d) => d[el.dataset.needs] != null); });
  }
  document.querySelectorAll(".chip[data-type]").forEach((c) => c.addEventListener("click", () => {
    document.querySelectorAll(".chip[data-type]").forEach((x) => x.classList.toggle("on", x === c));
    typeFilter = c.dataset.type;
    render();
  }));

  // 검색
  let qTimer;
  $("q").addEventListener("input", () => {
    $("qClear").hidden = !$("q").value;
    clearTimeout(qTimer); qTimer = setTimeout(render, 150);
  });
  $("qClear").addEventListener("click", () => { $("q").value = ""; $("qClear").hidden = true; $("q").focus(); render(); });

  // 지도/목록 전환
  function setMode(mode) {
    $("view-map").dataset.mode = mode;
    document.querySelectorAll(".segments [data-mode]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === mode));
    // 목록으로 시작하면 지도가 숨은 상태(크기 0)로 만들어지므로, 보인 다음 프레임에 크기를 다시 잡고 범위를 맞춘다
    if (mode === "map" && map) requestAnimationFrame(() => {
      const el = $("map");
      el.style.width = ""; el.style.height = ""; // 숨은 상태에서 붙은 width:0 제거 → CSS 크기로
      if (map.setSize) map.setSize(new naver.maps.Size(el.clientWidth, el.clientHeight));
      if (map.refresh) map.refresh(true);
      render();
    });
  }
  document.querySelectorAll(".segments [data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  // 첫 화면은 목록 (지도는 버튼으로 전환)

  if (location.hash === "#detail") history.replaceState(null, "", location.pathname + location.search);

  (async function init() {
    initMap();
    try {
      index = await fetchJson("data/index.json");
      if (!index || !Array.isArray(index.sidos) || !index.sidos.length) throw new Error("index.json: 시도 목록이 비어 있음");
    } catch (e) {
      index = null;
      showLoadError(e.message, () => location.reload());
      return;
    }
    $("basis").textContent = `어린이집정보공개포털(한국사회보장정보원) · 기준일 ${index.basis} · 연장보육: 공공데이터포털(2024)`;
    document.querySelectorAll(".basisDate").forEach((e) => { e.textContent = index.basis; });
    $("sido").innerHTML = `<option value="">전국</option>` + index.sidos.map((s) => `<option>${esc(s.sido)}</option>`).join("");
    const pref = window.APP_SETTINGS ? APP_SETTINGS.get() : {};
    $("radius").value = pref.defaultRadius || $("radius").value;
    $("locate").hidden = pref.showLocate === false;
    if (window.APP_SETTINGS) APP_SETTINGS.onChange((k, v) => {
      if (k === "showLocate") $("locate").hidden = !v;
      if (k === "defaultRadius") { $("radius").value = v; render(); }
    });
    const start = index.sidos.find((s) => s.sido === pref.defaultSido) ? pref.defaultSido : ""; // 기본은 전국
    $("sido").value = start;
    await selectSido(start);
    if (start && pref.defaultCity && data.some((d) => d.city === pref.defaultCity)) { $("sigungu").value = pref.defaultCity; render(); }
    updateRegionLabel();
  })();
})();
