// 처음 실행 시작 흐름 (앱개발): 환영 → 아이 단계(임신 중/태어났어요/나중에) → 출생·출산 예정 연월 → 동네(시·도·시군구, 설정 defaultSido/defaultCity) → 권한 안내(permintro.js) → 가입 권유(비회원만, 나중에 가능) → 홈
// 로그인 없이 시작한다 (가입은 평가·커뮤니티를 쓸 때만). 아이 정보는 연·월과 부르는 이름(선택)만, my:v1(이 기기)에만 저장.
// 저장: localStorage "onboard:v1" = 마친 날짜. 자동화 브라우저(점검)에서는 건너뛰고, ?onboard=1 로 강제 표시.
(function () {
  const KEY = "onboard:v1", MY = "my:v1";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };
  const readMy = () => { try { return Object.assign({ favs: [], recent: [], child: null }, JSON.parse(ls(MY) || "{}")); } catch { return { favs: [], recent: [], child: null }; } };
  const force = new URLSearchParams(location.search).get("onboard") === "1";
  // 이미 쓰던 사람(권한 안내를 봤거나 아이를 등록함)은 다시 띄우지 않는다
  const pending = () => force || (!ls(KEY) && !(window.PERMINTRO && PERMINTRO.seen()) && !readMy().child && !navigator.webdriver);
  const svg = (d) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

  let root = null, step = "welcome", stage = null;
  function css() {
    if ($("onboardCss")) return;
    const s = document.createElement("style"); s.id = "onboardCss";
    s.textContent = `#onboard{z-index:41;overflow-y:auto}#onboard .ob-wrap{flex:1;display:flex;flex-direction:column;padding:20px 20px calc(20px + env(safe-area-inset-bottom));gap:16px}
#onboard .ob-back{align-self:flex-start;margin-left:-8px}#onboard h2{margin:8px 0 0;font-family:var(--font-cute,inherit);font-weight:400;font-size:26px;line-height:1.35;color:var(--text)}#onboard .ob-lead{margin:0;color:var(--muted);font-size:14px;line-height:1.6}
#onboard .ob-hero{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center}#onboard .ob-hero .brand-mark{width:96px;height:96px}#onboard .ob-hero h1{margin:0;font-family:var(--font-cute,inherit);font-weight:400;font-size:32px;color:var(--accent-strong)}
#onboard .ob-main{width:100%;min-height:56px;border:0;border-radius:var(--r16,16px);background:var(--accent);color:#fff;font-family:var(--font-cute,inherit);font-size:18px;cursor:pointer}#onboard .ob-main:disabled{background:var(--line);color:var(--muted);cursor:default}
#onboard .ob-sub{min-height:44px;border:0;background:none;color:var(--muted);font:inherit;font-size:14px;text-decoration:underline;cursor:pointer}#onboard .ob-note{margin:0;text-align:center;color:var(--muted);font-size:12px;line-height:1.5}
#onboard .ob-pick{display:grid;gap:12px}#onboard .ob-card{display:flex;align-items:center;gap:14px;min-height:88px;padding:16px;border:1px solid var(--line);border-radius:var(--r20,20px);background:var(--surface);color:var(--text);text-align:left;font:inherit;cursor:pointer}
#onboard .ob-card .ob-ic{font-size:36px;line-height:1}#onboard .ob-card b{display:block;font-family:var(--font-cute,inherit);font-weight:400;font-size:18px}#onboard .ob-card small{color:var(--muted);font-size:13px}
#onboard label.ob-f{display:grid;gap:6px;font-size:14px;color:var(--text)}#onboard .ob-f select,#onboard .ob-f input{min-height:48px;padding:0 12px;border:1px solid var(--line);border-radius:var(--r12,12px);background:var(--surface);color:var(--text);font:inherit;font-size:16px}
#onboard .ob-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}#onboard .ob-preview{margin:0;padding:12px 14px;border-radius:var(--r12,12px);background:var(--accent-subtle);color:var(--accent-strong);font-size:14px;line-height:1.55}#onboard .ob-spacer{flex:1}
#onboard .ob-perks{list-style:none;margin:0;padding:0;display:grid;gap:10px}#onboard .ob-perks li{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px solid var(--line);border-radius:var(--r16,16px);background:var(--surface)}#onboard .ob-perks li>span:first-child{font-size:24px;line-height:1.2}
#onboard .ob-perks b{display:block;font-family:var(--font-cute,inherit);font-weight:400;font-size:16px}#onboard .ob-perks small{display:block;margin-top:2px;color:var(--muted);font-size:13px;line-height:1.5}#onboard .ob-join{display:grid;gap:8px}`;
    document.head.appendChild(s);
  }
  function ensure() {
    css();
    if (!root) { root = document.createElement("div"); root.id = "onboard"; root.className = "mypage"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "시작하기"); document.body.appendChild(root); }
    return root;
  }
  const back = (to) => `<button type="button" class="icon-button ob-back" data-back="${to}" aria-label="이전">${svg('<path d="m15 5-7 7 7 7"/>')}</button>`;

  // 연·월 선택지: 태어났어요 = 지금부터 7년 전까지, 임신 중 = 이번 달부터 10개월 뒤까지
  function monthOptions(isExp) {
    const now = new Date(), out = [];
    const n = isExp ? 11 : 12 * 7 + 1;
    for (let i = 0; i < n; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + (isExp ? i : -i), 1);
      out.push([`${d.getFullYear()}-${d.getMonth() + 1}`, `${d.getFullYear()}년 ${d.getMonth() + 1}월`]);
    }
    return out;
  }
  function previewText(y, m, isExp) {
    if (!window.TIMELINE || !y) return "";
    const c = TIMELINE.ctxOf({ year: y, month: m, expecting: isExp });
    if (!c) return "";
    return isExp || c.cls === "입소 전"
      ? `반은 출생연도로 정해져요. ${c.sy + 1}학년도(내년 3월~)에는 <b>${esc(c.next)}</b>이에요.`
      : `이번 학년도(${c.sy}.3~)는 <b>${esc(c.cls)}</b>, 내년 3월부터는 <b>${esc(c.next)}</b>이에요.`;
  }

  function render() {
    const r = ensure();
    if (step === "welcome") {
      const mark = document.querySelector(".app-header .brand-mark")?.outerHTML || "";
      r.innerHTML = `<div class="ob-wrap">
        <div class="ob-hero"><img class="ob-art" src="img/ob-welcome-scene.png" width="220" height="220" alt=""><h1>새싹이네</h1>
          <p class="ob-lead"><b class="ob-em">어린이집 찾기</b>부터 입소 준비,<br>아플 땐 <b class="ob-em">병원·약국</b>까지 함께해요.</p></div>
        <button type="button" class="ob-main" data-go="stage">시작하기</button>
        <p class="ob-note">로그인 없이 바로 쓸 수 있어요. 평가·커뮤니티를 쓸 때만 가입해요.<br>민간 개발 앱이며 정부기관과 관련이 없습니다.</p></div>`;
    } else if (step === "stage") {
      r.innerHTML = `<div class="ob-wrap">${back("welcome")}
        <h2>우리 아이는 지금<br>어떤 시기인가요?</h2>
        <p class="ob-lead">연령반과 입소 일정을 계산하는 데만 써요.</p>
        <div class="ob-pick">
          <button type="button" class="ob-card" data-stage="expecting"><span class="ob-ic" aria-hidden="true"><img src="img/ob-expecting.png" width="64" height="64" alt=""></span><span><b>아직 뱃속에 있어요</b><small>출산 예정 월로 등록해요</small></span></button>
          <button type="button" class="ob-card" data-stage="born"><span class="ob-ic" aria-hidden="true"><img src="img/ob-born.png" width="64" height="64" alt=""></span><span><b>태어났어요</b><small>태어난 해와 달로 등록해요</small></span></button>
        </div>
        <div class="ob-spacer"></div>
        <button type="button" class="ob-sub" data-go="region" data-skip>나중에 할게요</button></div>`;
    } else if (step === "child") {
      const isExp = stage === "expecting", opts = monthOptions(isExp);
      r.innerHTML = `<div class="ob-wrap">${back("stage")}
        <h2>${isExp ? "출산 예정 월을<br>알려주세요" : "태어난 해와 달을<br>알려주세요"}</h2>
        <p class="ob-lead">생년월일 대신 <b>연·월</b>만 받아요. 이 기기에만 저장되고 서버로 보내지 않아요.</p>
        <label class="ob-f">${isExp ? "출산 예정" : "태어난 달"}
          <select id="obYm"><option value="">선택해 주세요</option>${opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
        <label class="ob-f">부르는 이름 <small class="muted">(선택 · 별명도 좋아요)</small>
          <input id="obName" maxlength="10" autocomplete="off" placeholder="예: 콩이"></label>
        <p class="ob-preview" id="obPreview" hidden></p>
        <label class="check ob-agree"><input type="checkbox" id="obC1">[필수] 아이 정보(연·월·별명)를 이 기기에 저장해 연령반·입소 일정을 계산하는 데 쓰는 것에 동의해요.</label>
        ${isExp ? `<label class="check ob-agree"><input type="checkbox" id="obC2">[필수] 출산 예정 정보는 임신 사실을 알 수 있는 민감한 정보예요. 위 동의와 별도로 동의해요.</label>` : ""}
        <div class="ob-spacer"></div>
        <button type="button" class="ob-main" data-save disabled>다음</button></div>`;
      const sel = $("obYm"), btn = r.querySelector("[data-save]"), pv = $("obPreview");
      sel.addEventListener("change", () => {
        const [y, m] = sel.value.split("-").map(Number);
        const t = sel.value ? previewText(y, m, isExp) : "";
        pv.hidden = !t; pv.innerHTML = t; ready();
      });
      const ready = () => { btn.disabled = !(sel.value && $("obC1").checked && (!isExp || $("obC2").checked)); };
      r.querySelectorAll(".ob-agree input").forEach((c) => c.addEventListener("change", ready));
      btn.addEventListener("click", () => {
        const [y, m] = sel.value.split("-").map(Number);
        const v = readMy(); v.child = { name: $("obName").value.trim().slice(0, 10), year: y, month: m, expecting: isExp };
        ls(MY, JSON.stringify(v)); window.dispatchEvent(new Event("my:changed"));
        step = "region"; render();
      });
    } else if (step === "region") {
      const sidos = window.APP && APP.sidos ? APP.sidos() : [];
      if (!sidos.length) { // 지역 목록(index.json)을 아직 못 받음 → 잠시 뒤 다시
        r.innerHTML = `<div class="ob-wrap"><p class="ob-lead">지역 목록을 불러오는 중…</p><div class="ob-spacer"></div><button type="button" class="ob-sub" data-go="perm">전국으로 볼게요</button></div>`;
        setTimeout(() => { if (step === "region" && !r.hidden) render(); }, 600);
      } else r.innerHTML = `<div class="ob-wrap">${back(stage ? "child" : "stage")}
        <img class="ob-art sm" src="img/ob-region.png" width="96" height="96" alt="">
        <h2>주로 어느 동네에서<br>찾으세요?</h2>
        <p class="ob-lead">앱을 열면 이 동네부터 보여드려요. 설정에서 언제든 바꿀 수 있어요.</p>
        <label class="ob-f">시·도
          <select id="obSido"><option value="">선택해 주세요</option>${sidos.map((v) => `<option>${esc(v)}</option>`).join("")}</select></label>
        <label class="ob-f">시·군·구 <small class="muted">(선택)</small>
          <select id="obCity" disabled><option value="">전체</option></select></label>
        <div class="ob-spacer"></div>
        <button type="button" class="ob-main" data-region disabled>다음</button>
        <button type="button" class="ob-sub" data-go="perm">전국으로 볼게요</button></div>`;
      const sd = $("obSido"), ct = $("obCity"), btn = r.querySelector("[data-region]");
      if (sd) sd.addEventListener("change", async () => {
        const v = sd.value;
        ct.disabled = true; btn.disabled = !v;
        ct.innerHTML = `<option value="">${v ? "불러오는 중…" : "전체"}</option>`;
        if (!v) return;
        let list = [];
        try { list = await APP.cities(v); } catch {}
        if (sd.value !== v) return; // 그사이 다른 시·도를 고름
        ct.innerHTML = `<option value="">${esc(v)} 전체</option>` + list.map((c) => `<option>${esc(c)}</option>`).join("");
        ct.disabled = !list.length;
      });
      if (btn) btn.addEventListener("click", () => {
        const sido = sd.value, city = ct.value;
        if (window.APP_SETTINGS && APP_SETTINGS.set) { APP_SETTINGS.set("defaultSido", sido); APP_SETTINGS.set("defaultCity", city); }
        if (window.APP && APP.setRegion) APP.setRegion(sido, city).catch(() => {});
        step = "perm"; render();
      });
    } else if (step === "perm") {
      r.hidden = true; // 권한 안내 화면을 그대로 쓰고, 끝나면 가입 권유로
      const next = () => { if (window.ACCOUNT && ACCOUNT.isMember()) finish(); else { step = "join"; render(); } };
      if (window.PERMINTRO) PERMINTRO.open(true, next); else next();
      return;
    } else if (step === "join") {
      // 가입 권유 (강제 아님): 가입하면 좋은 점 + 간편 로그인 + 나중에
      r.innerHTML = `<div class="ob-wrap">
        <img class="ob-art sm" src="img/ob-join.png" width="96" height="96" alt="">
        <h2>가입하면 이런 게<br>더 좋아요</h2>
        <ul class="ob-perks">
          <li><span aria-hidden="true">🔔</span><span><b>정원 여유가 보이면 알려요</b><small>관심 어린이집의 정원·현원 차이(계산)와 입소 일정이 바뀌면 앱 밖에서도 알려드려요 (출시 후)</small></span></li>
          <li><span aria-hidden="true">📱</span><span><b>휴대폰을 바꿔도 그대로</b><small>관심 어린이집·아이 정보·할 일을 이어서 봐요 (출시 후)</small></span></li>
          <li><span aria-hidden="true">⭐</span><span><b>인증 학부모 평가·커뮤니티</b><small>지금 다니는 어린이집을 인증하면 평가를 남길 수 있어요</small></span></li>
        </ul>
        <div class="ob-spacer"></div>
        <div class="ob-join">
          <button type="button" class="join-btn kakao" data-join>카카오로 시작하기</button>
          <button type="button" class="join-btn naver" data-join>네이버로 시작하기</button>
          <button type="button" class="join-btn google" data-join><svg class="g-logo" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>Google로 시작하기</button>
          <button type="button" class="join-btn apple" data-join>Apple로 시작하기</button>
        </div>
        <button type="button" class="ob-sub" data-later>나중에 할게요</button>
        <p class="ob-note">가입하지 않아도 어린이집 찾기·비교·알림은 그대로 쓸 수 있어요.<br>시제품: 간편 로그인은 서버 연결 후 열려요. 지금은 체험 가입으로 이어져요.</p></div>`;
      r.querySelectorAll("[data-join]").forEach((b) => b.addEventListener("click", () => { finish(); if (window.ACCOUNT) ACCOUNT.openSignup(); }));
      r.querySelector("[data-later]").addEventListener("click", finish);
    }
    r.hidden = false; document.body.style.overflow = "hidden";
    r.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => { if (b.hasAttribute("data-skip")) stage = null; step = b.dataset.go; render(); }));
    r.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", () => { step = b.dataset.back; render(); }));
    r.querySelectorAll("[data-stage]").forEach((b) => b.addEventListener("click", () => { stage = b.dataset.stage; step = "child"; render(); }));
    (r.querySelector(".ob-main:not(:disabled)") || r.querySelector("button"))?.focus();
  }
  function finish() {
    ls(KEY, new Date().toISOString().slice(0, 10));
    if (root) root.hidden = true; document.body.style.overflow = "";
    if (force) history.replaceState(null, "", location.pathname); // ?onboard=1 제거
  }
  window.ONBOARD = { pending, open: () => { step = "welcome"; stage = null; render(); } };
  const start = () => { if (pending()) window.ONBOARD.open(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
