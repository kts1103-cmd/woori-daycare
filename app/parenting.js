// 병원 찾기 탭(밤에 아플 때) + 육아 정보 화면(My 메뉴에서 열림, 우리 아이 지원금) (앱개발): ① 밤에 아플 때 찾기 ② 우리 아이 지원금 확인 — 모두 공식 기관 안내로 연결한다 (내용·금액은 옮겨 싣지 않음).
// ① 달빛어린이병원: 보건복지부·중앙응급의료센터(E-Gen) 사이트 / 심야약국: E-Gen 약국 찾기 + 시·도별 공공심야약국 공식 안내(아래 NIGHT)
// ② 지원금: 아이 연월(my:v1.child)로 "확인해 볼 지원"을 걸러 보여주고, 금액·기준은 복지로에서 확인하게 한다 (해마다 바뀜)
// 서버가 생겨도 이 파일은 그대로 쓴다 (정적 안내). NIGHT의 주소는 확인한 날짜(NIGHT_CHECKED)를 화면에 표시한다.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const myv = () => { try { return JSON.parse(localStorage.getItem("my:v1") || "{}"); } catch { return {}; } };
  const LINK = {
    moon: "https://www.e-gen.or.kr/moonlight/main.do", pharm: "https://www.e-gen.or.kr/egen/search_pharmacy.do", er: "https://www.e-gen.or.kr/egen/search_emergency_room.do",
    holiday: "https://www.pharm114.or.kr/", bokjiro: "https://www.bokjiro.go.kr/",
  };

  // ---- 시·도별 공공심야약국 공식 안내 (agent 조사·직접 열림 확인한 주소만) ----
  const NIGHT_CHECKED = "2026-10";
  const NIGHT = {
  "서울특별시": {
    "url": "https://news.seoul.go.kr/welfare/archives/567003",
    "title": "서울시 공공심야약국 지정 운영 안내",
    "note": "25개 자치구 40개소, 밤 10시~새벽 1시"
  },
  "부산광역시": {
    "url": "https://www.busan.go.kr/depart/ahpharmacy",
    "title": "약국안내 : 부산광역시 분야별 통합",
    "note": "공공심야약국 19곳, 대부분 22시~01시(3곳은 21시~24시)"
  },
  "대구광역시": {
    "url": "https://www.daegu.go.kr/health/index.do?menu_id=00933164",
    "title": "공공심야약국운영현황",
    "note": "12개소 목록(구·군별)"
  },
  "인천광역시": {
    "url": "https://www.incheon.go.kr/IC010101/view?nttNo=2043826&curPage=57",
    "title": "2026년 인천시 공공심야약국 운영 현황",
    "note": "35개소(365일 20, 요일제 15), 22시~01시, 2026-04-01 기준"
  },
  "전남광주통합특별시": {
    "url": "https://www.gwangju.go.kr/welfare/contentsView.do?pageId=welfare193",
    "title": "광주광역시 공공심야약국 운영 현황",
    "note": "광주 지역만 안내해요. 전남 지역은 시·군에 확인해요"
  },
  "세종특별자치시": {
    "url": "https://www.sejong.go.kr/health/sub05_02_10.do",
    "title": "공공심야약국 운영안내",
    "note": "2곳(아람약국, 허약국), 365일 22시~익일 01시"
  },
  "경기도": {
    "url": "https://www.gg.go.kr/contents/contents.do?ciIdx=749&menuId=2530",
    "title": "경기도 공공심야 약국",
    "note": "2026년 6월 기준 30개 시·군 81개소, 20시~익일 01시 중 3시간 이상, 약국별 상이"
  }
};

  // ---- 지원금: 아이 연월로 "확인해 볼 지원"을 표시. 금액은 적지 않는다 ----
  // match(months, expecting): 지금 아이에게 확인해 볼 만한지 (보장이 아니라 안내)
  const SUPPORTS = [
    { id: "preg", ic: '<img class="sp" src="img/ob-expecting.png" alt="">', name: "임신·출산 진료비 지원", who: "임신·출산 중인 가정", how: "국민행복카드로 병원비를 지원받을 수 있는지 확인해요.", match: (m, e) => e },
    { id: "first", ic: '<img class="sp" src="img/sp-gift.png" alt="">', name: "첫만남이용권", who: "출생한 아이 (사용 기한은 출생일부터 1년)", how: "출생신고 뒤 복지로·주민센터에서 신청해요. 국민행복카드로 사용해요.", match: (m, e) => e || (m >= 0 && m <= 12) },
    { id: "parent", ic: '<img class="sp" src="img/ob-born.png" alt="">', name: "부모급여", who: "만 0~1세 영아를 키우는 가정", how: "출생 후 60일 이내에 신청하면 출생한 달부터 받을 수 있어요. 어린이집을 이용하면 보육료 바우처로 지원돼요.", match: (m, e) => e || (m >= 0 && m < 24) },
    { id: "allow", ic: '<img class="sp" src="img/sp-allowance.png" alt="">', name: "아동수당", who: "해당 연령의 아동을 키우는 가정 (대상 연령은 확대 중이에요)", how: "복지로·주민센터에서 신청해요. 소득·재산과 상관없이 받는 지원이에요.", match: (m, e) => e || m >= 0 },
    { id: "care", ic: '<img class="sp" src="img/sp-school.png" alt="">', name: "보육료 지원", who: "어린이집을 이용하는 아이", how: "국민행복카드로 보육료를 결제해요. 입소 전에 지원 신청을 해 두세요.", match: (m, e) => e || m >= 0 },
    { id: "home", ic: '<img class="sp" src="img/sp-home.png" alt="">', name: "양육수당", who: "어린이집·유치원을 이용하지 않고 가정에서 키우는 아이", how: "어린이집이나 유치원을 이용하면 보육료·유아학비로 바꿔요. 대상 연령은 복지로에서 확인해요.", match: (m, e) => !e && m >= 12 && m < 84 },
  ];

  const css = () => {
    if ($("parentingCss")) return;
    const s = document.createElement("style"); s.id = "parentingCss";
    s.textContent = `:is(#view-parenting,#view-hospital) .pi-card{padding:16px;border:1px solid var(--line);border-radius:var(--r20,20px);background:var(--surface);display:grid;gap:10px}:is(#view-parenting,#view-hospital) .pi-card h3{margin:0;font-family:var(--font-cute,inherit);font-weight:400;font-size:18px}
:is(#view-parenting,#view-hospital) .pi-lead{margin:0;color:var(--muted);font-size:13px;line-height:1.55}:is(#view-parenting,#view-hospital) .pi-btns{display:grid;gap:8px}:is(#view-parenting,#view-hospital) .pi-link{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 14px;border:1px solid var(--line);border-radius:var(--r16,16px);background:var(--bg);color:var(--text);text-decoration:none;font:inherit}
:is(#view-parenting,#view-hospital) .pi-link b{display:block;font-size:15px}:is(#view-parenting,#view-hospital) .pi-link small{display:block;color:var(--muted);font-size:12px;line-height:1.4}:is(#view-parenting,#view-hospital) .pi-link>span:nth-child(2){flex:1;min-width:0}:is(#view-parenting,#view-hospital) .pi-ic{font-size:24px}
:is(#view-parenting,#view-hospital) .pi-urgent{padding:10px 12px;border-radius:var(--r12,12px);background:var(--danger-soft);color:var(--danger);font-size:13px;line-height:1.5}:is(#view-parenting,#view-hospital) select{min-height:48px;padding:0 12px;border:1px solid var(--line);border-radius:var(--r12,12px);background:var(--bg);color:var(--text);font:inherit;font-size:16px;width:100%}
:is(#view-parenting,#view-hospital) .pi-near-box{display:grid;gap:8px}:is(#view-parenting,#view-hospital) .pi-chips{display:flex;gap:6px;flex-wrap:wrap}:is(#view-parenting,#view-hospital) .pi-chips button{min-height:44px;padding:0 12px;border:1px solid var(--line);border-radius:99px;background:var(--surface);color:var(--text);font:inherit;font-size:14px;cursor:pointer}:is(#view-parenting,#view-hospital) .pi-chips button[aria-selected=true]{background:var(--accent);border-color:var(--accent);color:#fff}
:is(#view-parenting,#view-hospital) .pi-near{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:var(--r12,12px);background:var(--bg)}:is(#view-parenting,#view-hospital) .pi-near>span:first-child{flex:1;min-width:0}:is(#view-parenting,#view-hospital) .pi-near b{display:block;font-size:15px;overflow-wrap:anywhere}:is(#view-parenting,#view-hospital) .pi-near small{color:var(--muted);font-size:12px;line-height:1.5}:is(#view-parenting,#view-hospital) .pi-near small i{font-style:normal}:is(#view-parenting,#view-hospital) .pi-near small i.on{color:var(--accent-strong);font-weight:700}
:is(#view-parenting,#view-hospital) .pi-near-act{display:flex;gap:6px}:is(#view-parenting,#view-hospital) .pi-near-act .btn{min-width:44px;min-height:44px;display:inline-grid;place-items:center}
:is(#view-parenting,#view-hospital) .pi-sup{display:grid;gap:4px;padding:12px;border:1px solid var(--line);border-radius:var(--r16,16px);background:var(--bg)}:is(#view-parenting,#view-hospital) .pi-sup.me{border-color:var(--accent);background:var(--accent-subtle)}:is(#view-parenting,#view-hospital) .pi-sup b{font-size:15px}:is(#view-parenting,#view-hospital) .pi-sup em{margin-left:6px;padding:1px 8px;border-radius:99px;background:var(--accent);color:#fff;font-style:normal;font-size:12px}:is(#view-parenting,#view-hospital) .pi-sup p{margin:0;font-size:13px;line-height:1.5}:is(#view-parenting,#view-hospital) .pi-sup small{color:var(--muted);font-size:12px}
:is(#view-parenting,#view-hospital) .pi-cta{min-height:44px;border:0;background:none;color:var(--accent-strong);text-decoration:underline;font:inherit;cursor:pointer;justify-self:start}`;
    document.head.appendChild(s);
  };

  // ---- 가까운 병원·약국 (data/night_care.json: 국립중앙의료원, 매일 갱신). 파일이 없으면 이 칸을 숨기고 아래 공식 링크만 보여준다 ----
  const TABS = [["baby", "🌙 달빛어린이병원"], ["peds", "🩺 소아과"], ["pharm", "💊 약국"], ["er", "🏥 응급실"]];
  let care, tab = "baby", base = null; // care: undefined=아직, null=없음
  const loadCare = () => care !== undefined ? Promise.resolve(care) : fetch("data/night_care.json").then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => (care = j && Array.isArray(j.baby) ? j : null));
  const meters = (a, b) => { const R = 6371000, rad = (x) => (x * Math.PI) / 180, dLa = rad(b.la - a.la), dLo = rad(b.lo - a.lo), h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.la)) * Math.cos(rad(b.la)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const kmText = (m) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`);
  const hm = (v) => `${v.slice(0, 2)}:${v.slice(2)}`;
  const toMin = (v) => Number(v.slice(0, 2)) * 60 + Number(v.slice(2));
  // 오늘 시간(월=0 … 일=6)과 지금 열려 있는지 (밤을 넘기는 곳은 어제 시간도 본다). 공휴일은 판별하지 않는다
  function openInfo(h) {
    const d = new Date(), day = (d.getDay() + 6) % 7, now = d.getHours() * 60 + d.getMinutes();
    const span = (x) => { if (!x) return null; const [a, b] = x.split("-"); return [toMin(a), toMin(b)]; };
    const t = span(h[day]), y = span(h[(day + 6) % 7]);
    let open = false;
    if (t) open = t[1] > t[0] ? now >= t[0] && now < t[1] : now >= t[0];
    if (!open && y && y[1] <= y[0]) open = now < y[1];
    return { today: h[day] ? `${hm(h[day].split("-")[0])}~${hm(h[day].split("-")[1])}` : "", open, has: !!t };
  }
  // 지도 링크: 네이버 지도에서 병원·약국 이름으로만 검색한다 (이름+주소를 같이 넣으면 결과가 나오지 않음 — 사용자 확인).
  // 같은 이름이 여러 곳 나올 수 있어서 목록에 도로명 주소를 보여 주고, 사용자가 주소를 보고 고른다.
  const roadOf = (r) => String(r.a || "").replace(/\s*[,(].*$/, "").replace(/\s+/g, " ").trim();
  const mapUrl = (r) => `https://map.naver.com/p/search/${encodeURIComponent(r.n)}`;
  function nearRows(kind) {
    if (!care || !base || !care[kind]) return [];
    return care[kind].map((r) => ({ ...r, dist: meters(base, r), oi: openInfo(r.h) })).filter((r) => r.dist <= 30000)
      .sort((a, b) => (b.oi.open - a.oi.open) || a.dist - b.dist).slice(0, 8);
  }
  // ---- 주소·동네 검색: 네이버 지도 주소 검색(가능하면) → 안 되면 어린이집 데이터의 주소로 대략 위치를 잡는다 ----
  const SHORT = (n) => String(n).replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "");
  function geocodeNaver(q) {
    return new Promise((res) => {
      const S = window.naver && naver.maps && naver.maps.Service;
      if (!S || !S.geocode) return res(null);
      try {
        S.geocode({ query: q }, (status, resp) => {
          const a = status === S.Status.OK && resp && resp.v2 && resp.v2.addresses && resp.v2.addresses[0];
          res(a ? { la: Number(a.y), lo: Number(a.x), label: a.roadAddress || a.jibunAddress || q } : null);
        });
      } catch { res(null); }
    });
  }
  async function geocodeLocal(q) {
    let idx; try { idx = await (await fetch("data/index.json")).json(); } catch { return null; }
    const sidos = idx.sidos || [], toks = q.replace(/[(),]/g, " ").split(/\s+/).filter(Boolean);
    let entry = null; const rest = [];
    toks.forEach((t) => { const h = !entry && sidos.find((x) => x.sido === t || SHORT(x.sido) === t || (t.length >= 2 && x.sido.startsWith(t))); if (h) entry = h; else rest.push(t); });
    if (!entry) { const pref = mineSido(); entry = sidos.find((x) => x.sido === pref) || null; }
    if (!entry || !rest.length) return null;
    let rows; try { rows = await (await fetch("data/" + entry.file)).json(); } catch { return null; }
    const hit = rows.filter((r) => r.lat && r.lng && rest.every((t) => String(r.addr || "").includes(t) || String(r.sigungu || "").includes(t)));
    if (!hit.length) return null;
    const mid = (a) => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
    return { la: mid(hit.map((r) => r.lat)), lo: mid(hit.map((r) => r.lng)), label: q };
  }
  const geocode = async (q) => (await geocodeNaver(q)) || geocodeLocal(q);
  window.APP_GEOCODE = geocode; // 나의 어린이집 "급할 때 맡길 곳"의 위치 검색도 같은 함수를 쓴다 → {la, lo, label} 또는 null

  function nearHTML(msg) {
    const tabs = `<div class="pi-chips" role="tablist" aria-label="찾을 곳">${TABS.filter(([k]) => care[k] && care[k].length).map(([k, l]) => `<button type="button" role="tab" data-ntab="${k}" aria-selected="${tab === k}">${l}</button>`).join("")}</div>`;
    const search = `<form class="pi-search" role="search" data-search><input type="search" name="q" maxlength="60" autocomplete="off" placeholder="주소·동네로 찾기 (예: 서울 강남구 테헤란로)" aria-label="주소 또는 동네 검색"><button type="submit">검색</button></form>
      <div class="pi-here-row"><button type="button" class="pi-here" data-locate>📍 현재 위치로 보기</button>${msg ? `<span class="pi-status" role="status">${esc(msg)}</span>` : ""}</div>`;
    if (!base) return `${search}${tabs}<p class="pi-lead">현재 위치를 쓰거나 주소를 검색하면 가까운 곳을 보여드려요. 위치는 기기 안에서만 계산해요. 주소 검색은 네이버 지도로 처리돼요.</p>`;
    const rows = nearRows(tab);
    const rowHTML = (r) => `<div class="pi-near"><span><b>${esc(r.n)}</b><small class="pi-addr">${esc(roadOf(r))}</small><small>${tab === "er" ? `${kmText(r.dist)} · ${esc(r.k || "응급의료기관")} · <i>가기 전 전화 확인 필요</i>` : `${kmText(r.dist)} · ${r.oi.today ? `오늘 ${r.oi.today}` : "오늘 시간 정보 없음"} · <i class="${r.oi.open ? "on" : ""}">${r.oi.has ? (r.oi.open ? "운영시간 이내 · 전화 확인 필요" : "운영시간 외 · 전화 확인 필요") : "전화 확인 필요"}</i>`}</small></span>
        <span class="pi-near-act">${r.t ? `<a class="btn" href="tel:${esc(r.t.replace(/[^0-9+]/g, ""))}" aria-label="${esc(r.n)} 전화">📞</a>` : ""}<a class="btn" href="${esc(mapUrl(r))}" target="_blank" rel="noopener" aria-label="${esc(r.n)} 지도에서 보기">🗺️</a></span></div>`;
    const shut = rows.filter((r) => r.oi.has && !r.oi.open), live = rows.filter((r) => !(r.oi.has && !r.oi.open)); // 운영시간 외인 곳은 아래로 접는다
    return `${search}${tabs}<p class="pi-lead">${esc(base.label)} 기준 가까운 곳이에요. 운영시간 이내인 곳을 먼저 보여드려요.</p>
      ${rows.length ? live.map(rowHTML).join("") : `<p class="pi-lead">가까운 곳을 찾지 못했어요. 아래 공식 사이트에서 찾아보세요.</p>`}
      ${rows.length && !live.length ? `<p class="pi-lead">지금 운영시간 이내인 곳이 없어요. 아래 운영시간 외 목록에서 전화로 확인해 보세요.</p>` : ""}
      ${shut.length ? `<details class="pi-closed"${live.length ? "" : " open"}><summary>운영시간 외 ${shut.length}곳 ${live.length ? "보기" : ""}</summary>${shut.map(rowHTML).join("")}</details>` : ""}
      <p class="pi-lead">시간은 기관이 등록한 값이에요. 휴진·접수마감일 수 있으니 가기 전에 전화로 확인하세요. 공휴일 시간은 따로 확인해요. 국립중앙의료원 · 기준일 ${esc(care.basis || "-")}</p>`;
  }
  async function initNear() {
    const box = $("piNear"); if (!box) return;
    await loadCare(); if (!care) { box.hidden = true; document.querySelectorAll("[data-moon]").forEach((a) => (a.hidden = false)); return; } // 데이터가 없을 때만 공식 사이트 링크를 보여준다
    let msg = "";
    const paint = () => {
      box.innerHTML = nearHTML(msg); msg = "";
      box.querySelectorAll("[data-ntab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.ntab; paint(); }));
      box.querySelector("[data-locate]")?.addEventListener("click", () => locate(true));
      box.querySelector("[data-search]")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const q = e.target.q.value.trim(); if (q.length < 2) { msg = "두 글자 이상 적어 주세요."; return paint(); }
        const hit = await geocode(q);
        if (hit) { base = { la: hit.la, lo: hit.lo, label: hit.label }; } else msg = "주소를 찾지 못했어요. 시·도부터 적어 보세요 (예: 서울 강남구 테헤란로).";
        paint();
      });
    };
    const locate = (ask) => {
      if (!navigator.geolocation) { msg = "이 기기에서는 위치를 쓸 수 없어요."; return paint(); }
      navigator.geolocation.getCurrentPosition((p) => { base = { la: p.coords.latitude, lo: p.coords.longitude, label: "현재 위치" }; paint(); },
        () => { if (ask) msg = "위치를 가져오지 못했어요. 휴대폰 설정에서 위치 권한을 확인하거나 주소를 검색해 주세요."; paint(); }, { timeout: 10000, maximumAge: 300000 });
    };
    // 기본은 현재 위치: 위치 권한을 이미 허용했으면 바로 쓰고, 아니면 나의 어린이집 주변을 보여주며 "현재 위치로 보기"를 눌러 허용받는다
    if (!base) {
      const m = myv().mine;
      if (m && window.APP && APP.snapByKey) { try { const d = await APP.snapByKey(m.sido, m.key); if (d && d.lat && d.lng) base = { la: d.lat, lo: d.lng, label: `${d.name} 주변` }; } catch {} }
    }
    paint();
    try { const st = navigator.permissions && await navigator.permissions.query({ name: "geolocation" }); if (st && st.state === "granted" && (!base || base.label !== "현재 위치")) locate(false); } catch {}
  }

  const mineSido = () => (myv().mine && myv().mine.sido) || (window.APP_SETTINGS && APP_SETTINGS.get().defaultSido) || "";
  function nightHTML(sido) {
    const keys = window.APP && APP.sidos && APP.sidos().length ? APP.sidos() : Object.keys(NIGHT);
    const cur = NIGHT[sido] ? sido : "";
    const pick = keys.length ? `<label class="pi-lead" for="piNightSido">지역을 골라 공공심야약국 공식 안내를 열어요</label>
      <select id="piNightSido"><option value="">지역 선택</option>${keys.map((k) => `<option ${k === cur ? "selected" : ""}>${esc(k)}</option>`).join("")}</select>
      <div id="piNightOut">${cur ? nightLink(cur) : ""}</div>` : "";
    return `<div class="pi-card" id="piNight"><h3><img class="sp" src="img/sp-sick.png" alt=""> 밤에 아플 때</h3>
      <p class="pi-lead">가까운 달빛어린이병원·소아과·약국은 아래에서 바로 볼 수 있어요. 가기 전에 전화로 한 번 더 확인하세요.</p>
      <div id="piNear" class="pi-near-box"></div>
      <div class="pi-btns">
        <a class="pi-link" href="${LINK.moon}" target="_blank" rel="noopener" data-moon hidden><span class="pi-ic" aria-hidden="true">🌙</span><span><b>달빛어린이병원 찾기</b><small>보건복지부 · 야간·휴일에 소아 진료를 해요. 지역별 목록과 진료 중 표시가 있어요</small></span><span aria-hidden="true">↗</span></a>
        <a class="pi-link" href="${LINK.pharm}" target="_blank" rel="noopener" data-moon hidden><span class="pi-ic" aria-hidden="true">💊</span><span><b>심야·휴일 약국 찾기</b><small>중앙응급의료센터(E-Gen) 약국 찾기</small></span><span aria-hidden="true">↗</span></a>
        <a class="pi-link" href="${LINK.er}" target="_blank" rel="noopener" data-moon hidden><span class="pi-ic" aria-hidden="true">🏥</span><span><b>응급실 찾기</b><small>중앙응급의료센터(E-Gen)</small></span><span aria-hidden="true">↗</span></a>
      </div>
      ${pick ? `<div class="pi-pick" data-moon hidden>${pick}</div>` : ""}
      <p class="pi-urgent">위급하다면 망설이지 말고 119에 전화하세요.</p></div>`;
  }
  function nightLink(sido) {
    const n = NIGHT[sido]; if (!n || !/^https:\/\//.test(n.url || "")) return `<a class="pi-link" href="${LINK.holiday}" target="_blank" rel="noopener"><span class="pi-ic">💊</span><span><b>휴일지킴이약국 조회 (대한약사회)</b><small>이 지역은 시·도 공식 안내 주소를 확인하지 못해 전국 조회로 연결해요. 위의 약국 찾기도 이용해 보세요</small></span><span aria-hidden="true">↗</span></a>`;
    return `<a class="pi-link" href="${esc(n.url)}" target="_blank" rel="noopener"><span class="pi-ic">💊</span><span><b>${esc(sido)} 공공심야약국 안내</b><small>${esc(n.title || "시·도 공식 안내")}${n.note ? ` · ${esc(n.note)}` : ""} · 주소 확인 ${NIGHT_CHECKED}</small></span><span aria-hidden="true">↗</span></a>`;
  }

  function supportHTML() {
    const child = myv().child, c = child && window.TIMELINE ? TIMELINE.ctxOf(child) : null;
    const rows = SUPPORTS.map((s) => ({ ...s, me: c ? !!s.match(c.months, c.expecting) : false }));
    const shown = c ? [...rows.filter((r) => r.me), ...rows.filter((r) => !r.me)] : rows;
    return `<div class="pi-card" id="piSupport"><h3>🎀 우리 아이 지원금</h3>
      <p class="pi-lead">${c ? `${esc(child.name || "우리 아이")}에게 확인해 볼 지원을 먼저 보여드려요.` : "아이를 등록하면 지금 확인해 볼 지원을 먼저 보여드려요."} 금액·기준은 해마다 바뀌어서 앱에 적지 않아요. 복지로나 주민센터에서 확인하세요.</p>
      ${c ? "" : `<button type="button" class="pi-cta" data-child>아이 정보 등록하기</button>`}
      ${shown.map((s) => `<div class="pi-sup${s.me ? " me" : ""}"><b>${s.ic} ${esc(s.name)}${s.me ? "<em>확인해 보세요</em>" : ""}</b><p>${esc(s.who)}</p><small>${esc(s.how)}</small></div>`).join("")}
      <div class="pi-btns"><a class="pi-link" href="${LINK.bokjiro}" target="_blank" rel="noopener"><span class="pi-ic" aria-hidden="true">🔎</span><span><b>복지로에서 금액·신청 확인</b><small>보건복지부 복지로</small></span><span aria-hidden="true">↗</span></a></div>
      <p class="pi-lead">복지로·보건복지부 안내 기준(2026.10). 지자체마다 추가 지원이 있을 수 있어요.</p></div>`;
  }

  function render() {
    css();
    const hs = document.querySelector("#view-hospital .section");
    if (hs) { // 병원 찾기 탭
      hs.querySelectorAll("#piNight").forEach((e) => e.remove());
      hs.insertAdjacentHTML("beforeend", nightHTML(mineSido()));
      initNear();
      const sel = $("piNightSido");
      if (sel) sel.addEventListener("change", () => { $("piNightOut").innerHTML = sel.value ? nightLink(sel.value) : ""; });
    }
    const sec = document.querySelector("#view-parenting .section"); // 육아 정보 (My 메뉴에서 열림)
    if (sec) {
      sec.querySelectorAll("#piSupport").forEach((e) => e.remove());
      (sec.querySelector(".note") || sec.querySelector("h2")).insertAdjacentHTML("afterend", supportHTML());
      sec.querySelector("[data-child]")?.addEventListener("click", () => window.MYPAGE && MYPAGE.open("child"));
    }
  }
  // 탭 없이 육아 정보 화면 열기 (My 메뉴): 탭 선택을 풀고 화면만 켠다. 아무 탭이나 누르면 돌아간다
  window.openParenting = () => {
    render();
    document.querySelectorAll("nav.tabs button").forEach((x) => x.setAttribute("aria-selected", "false"));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-parenting"));
    window.scrollTo(0, 0);
  };
  const start = () => {
    render();
    document.querySelector('nav.tabs [data-view="view-hospital"]')?.addEventListener("click", render);
    window.addEventListener("my:changed", () => { if ($("view-parenting")?.classList.contains("active") || $("view-hospital")?.classList.contains("active")) render(); });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
