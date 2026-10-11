// My page (시제품)
// 참고한 앱: 당근(프로필·내 활동), 직방·호갱노노(관심 목록·비교), 쿠팡·배민(최근 본), 키즈노트·아이사랑(우리 아이 연령반)
// 모든 정보는 이 기기 localStorage에만 저장한다.
(function () {
  const KEY = "my:v1";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const svg = (d) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const I = {
    back: '<path d="m15 5-7 7 7 7"/>', heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', chevron: '<path d="m9 5 7 7-7 7"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    baby: '<circle cx="12" cy="9" r="5"/><path d="M10 9h.01M14 9h.01M10.5 11.5c.9.6 2.1.6 3 0M7 21c.8-3 2.8-5 5-5s4.2 2 5 5"/>', compare: '<path d="M4 6h7v12H4zM13 6h7v12h-7z"/>',
    chat: '<path d="M4 5h16v11H9l-5 4Z"/>', star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>', note: '<path d="M6 3h9l4 4v14H6Z"/><path d="M9 12h7M9 16h5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  };
  const read = () => { try { return Object.assign({ favs: [], recent: [], child: null }, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return { favs: [], recent: [], child: null }; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} window.dispatchEvent(new Event("my:changed")); };
  const toast = (m) => { const t = $("toast"); if (!t) return; t.textContent = m; t.classList.add("visible"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("visible"), 3000); };
  const readJSON = (k, def) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? def; } catch { return def; } };
  const MAX_COMPARE = 3;

  // ---- 관심·최근 (app.js 상세 화면에서 호출) ----
  function track(snap) {
    const v = read();
    v.recent = [snap, ...v.recent.filter((x) => x.key !== snap.key)].slice(0, 20);
    const i = v.favs.findIndex((x) => x.key === snap.key);
    if (i >= 0) v.favs[i] = { ...v.favs[i], ...snap };
    write(v);
  }
  const isFav = (key) => read().favs.some((x) => x.key === key);
  function toggleFav(snap) {
    const v = read();
    const on = v.favs.some((x) => x.key === snap.key);
    v.favs = on ? v.favs.filter((x) => x.key !== snap.key) : [{ ...snap, savedAt: Date.now() }, ...v.favs];
    write(v);
    toast(on ? "관심 어린이집에서 뺐어요." : "관심 어린이집에 담았어요. My에서 비교할 수 있어요.");
    return !on;
  }
  function bindFav(btn, snap) {
    const paint = (on) => { btn.classList.toggle("on", on); btn.setAttribute("aria-pressed", on); btn.setAttribute("aria-label", on ? "관심 어린이집에서 빼기" : "관심 어린이집에 담기"); const l = btn.querySelector(".fav-lbl"); if (l) l.textContent = on ? "관심 중" : "관심"; };
    paint(isFav(snap.key));
    btn.addEventListener("click", () => paint(toggleFav(snap)));
  }

  // ---- 우리 아이 연령반 (학년도 3월 시작, 출생연도 기준) ----
  function classOf(birthYear, schoolYear) { const age = schoolYear - 1 - birthYear; return age < 0 ? "입소 전" : age > 5 ? "유치원·초등 연령" : `만 ${age}세반`; }
  const schoolYearNow = () => { const d = new Date(); return d.getMonth() >= 2 ? d.getFullYear() : d.getFullYear() - 1; };

  // ---- 화면 ----
  let root = null, sub = "home", compareSel = [], direct = false; // direct: 홈 배너 등에서 하위 화면을 바로 연 경우 → 뒤로 가면 닫기
  function ensureRoot() {
    if (root) return root;
    root = document.createElement("div");
    root.id = "mypage"; root.className = "mypage"; root.hidden = true;
    root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "My page");
    document.body.appendChild(root);
    return root;
  }
  function open(s) {
    ensureRoot(); sub = s || "home"; direct = !!s; render();
    root.hidden = false; document.body.classList.add("my-mode");
    history.pushState({ my: true }, "", "#my");
  }
  function close() { if (!root) return; root.hidden = true; document.body.classList.remove("my-mode"); }
  window.addEventListener("popstate", () => {
    if (document.querySelector("#account:not([hidden])")) return; // 회원가입 화면이 먼저 닫힘 (account.js)
    if (!root || root.hidden) return;
    if (sub !== "home" && !direct) { sub = "home"; render(); history.pushState({ my: true }, "", "#my"); return; }
    close();
  });
  if (location.hash === "#my") history.replaceState(null, "", location.pathname + location.search);

  function header(title, backLabel = "닫기") {
    return `<header class="detail-header"><button class="icon-button" data-my-back aria-label="${backLabel}">${svg(I.back)}</button><h2>${title}</h2></header>`;
  }
  function bindCommon() {
    root.querySelector("[data-my-back]")?.addEventListener("click", () => { if (sub !== "home" && !direct) { sub = "home"; render(); } else history.back(); });
    root.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => { direct = false; sub = b.dataset.go; render(); root.querySelector(".my-body").scrollTop = 0; }));
    root.querySelectorAll("[data-open-key]").forEach((b) => b.addEventListener("click", () => openDaycare(b.dataset.openKey)));
  }
  function openDaycare(key) {
    const s = [...read().favs, ...read().recent].find((x) => x.key === key);
    if (!s || !window.APP || !APP.openByKey) return;
    close(); history.replaceState(null, "", location.pathname);
    APP.openByKey(s.sido, key);
  }

  const card = (s, extra = "") => `<button class="my-dc" data-open-key="${esc(s.key)}">
      <span><b>${esc(s.name)}</b><small>${esc(s.area || "")} · ${esc(s.type || "")}</small></span>${extra}${svg(I.chevron)}</button>`;

  function render() {
    const v = read();
    if (sub === "favs") return renderFavs(v);
    if (sub === "recent") return renderRecent(v);
    if (sub === "compare") return renderCompare(v);
    if (sub === "child") return renderChild(v);
    if (sub === "region") return renderRegion();
    if (sub === "activity") return renderActivity();
    if (sub === "verify") return renderVerify();
    const cm = readJSON("community:v1", {});
    const myPosts = (cm.posts || []).filter((p) => p.mine).length;
    const myComments = (cm.posts || []).reduce((a, p) => a + (p.comments || []).filter((c) => c.mine).length, 0);
    const myRatings = Object.keys(readJSON("ratings:v1", {})).length;
    const acc = window.ACCOUNT ? ACCOUNT.get() : null;
    const sy = schoolYearNow();
    root.innerHTML = `${header("My")}
      <div class="my-body">
        <section class="my-profile">
          <span class="my-avatar">${svg(I.user)}</span>
          ${acc ? `<div><b>${esc(acc.nick)}</b><small>${(acc.verifications || []).length ? `<span class="verified-badge">✔ 인증 어린이집 ${(acc.verifications || []).length}곳</span>` : "학부모 인증 전 · 평가하려면 인증이 필요해요"}</small></div>
          <button class="btn my-login" type="button" data-go="verify">인증 관리</button>`
          : `<div><b>${esc(cm.nick || "새싹이네 부모님")}</b><small>가입 전 · 이 기기에 저장된 정보만 보여요</small></div>
          <button class="btn my-login primary" type="button" data-join>회원가입</button>`}
        </section>
        <button class="my-child" data-go="child">
          <span class="my-ic">${svg(I.baby)}</span>
          ${v.child ? `<span><b>${esc(v.child.name || "우리 아이")} · ${v.child.expecting ? "출산 예정 " + v.child.year + "." + (v.child.month || 1) : classOf(v.child.year, sy)}</b><small>${sy}학년도 기준 · 내년 ${classOf(v.child.year, sy + 1)} · 정보 수정</small></span>` : `<span><b>우리 아이 정보 등록</b><small>출생·출산 예정 월을 넣으면 연령반과 지금 할 일을 알려드려요</small></span>`}
          ${svg(I.chevron)}</button>
        <button class="my-child my-region" data-go="region">
          <span class="my-ic">${svg('<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>')}</span>
          <span><b>내 동네</b><small>${esc(regionNow().label) || "아직 정하지 않았어요 · 정하면 이 동네부터 보여드려요"}</small></span>
          ${svg(I.chevron)}</button>
        <div class="my-stats">
          <button data-go="favs"><b>${v.favs.length}</b><span>관심</span></button>
          <button data-go="recent"><b>${v.recent.length}</b><span>최근 본</span></button>
          <button data-go="activity"><b>${myPosts + myComments + myRatings}</b><span>내 활동</span></button>
        </div>
        <section class="my-sec"><div class="my-sec-head"><h3>${svg(I.heart)}관심 어린이집</h3><button data-go="favs">전체</button></div>
          ${v.favs.length ? v.favs.slice(0, 3).map((s) => card(s)).join("") : `<p class="my-empty">어린이집 상세 화면에서 ♡를 누르면 여기에 모여요.</p>`}
          ${v.favs.length >= 2 ? `<button class="btn my-compare-cta" data-go="compare">${svg(I.compare)}관심 어린이집 비교하기</button>` : ""}
        </section>
        <section class="my-sec"><div class="my-sec-head"><h3>${svg(I.clock)}최근 본 어린이집</h3><button data-go="recent">전체</button></div>
          ${v.recent.length ? `<div class="my-recent">${v.recent.slice(0, 8).map((s) => `<button class="my-chip" data-open-key="${esc(s.key)}"><b>${esc(s.name)}</b><small>${esc((s.area || "").split(" ").slice(-1)[0])}</small></button>`).join("")}</div>` : `<p class="my-empty">아직 본 어린이집이 없어요.</p>`}
        </section>
        <nav class="my-menu" aria-label="My 메뉴">
          <button data-timeline>${svg(I.baby)}<span>우리 아이 입소 타임라인</span><small>지금 할 일</small>${svg(I.chevron)}</button>
          <button data-go="activity">${svg(I.chat)}<span>내가 쓴 글·댓글</span><small>${myPosts + myComments}</small>${svg(I.chevron)}</button>
          <button data-go="activity">${svg(I.star)}<span>내 별점 평가</span><small>${myRatings}</small>${svg(I.chevron)}</button>
          ${acc ? `<button data-go="verify">${svg(I.user)}<span>학부모 인증 관리</span><small>${(acc.verifications || []).length}곳</small>${svg(I.chevron)}</button>` : ""}
          <button data-parenting>${svg(I.baby)}<span>육아 정보</span><small>지원금·성장·수유실</small>${svg(I.chevron)}</button>
          <button data-settings>${svg(I.gear)}<span>앱 설정</span>${svg(I.chevron)}</button>
          ${acc ? `<button data-logout>${svg(I.close)}<span>로그아웃</span>${svg(I.chevron)}</button>` : ""}
          <a href="#policy" data-policy-link>${svg(I.note)}<span>커뮤니티 운영정책</span>${svg(I.chevron)}</a>
        </nav>
        <p class="src">시제품: My 정보는 이 기기에만 저장돼요. 로그인은 서버 연결 후 제공돼요.</p>
      </div>`;
    bindCommon();
    { // 프로필(아바타·닉네임)을 누르면 설정의 프로필 화면
      const pf = root.querySelector(".my-profile"), who = pf && pf.querySelector("div");
      if (who && window.APP_SETTINGS && APP_SETTINGS.open) {
        who.setAttribute("role", "button"); who.setAttribute("tabindex", "0"); who.setAttribute("aria-label", "프로필 보기");
        const go = () => { close(); history.replaceState(null, "", location.pathname); APP_SETTINGS.open("profile"); };
        [pf.querySelector(".my-avatar"), who].forEach((el) => { if (el) { el.style.cursor = "pointer"; el.addEventListener("click", go); } });
        who.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      }
    }
    root.querySelector("[data-timeline]").addEventListener("click", () => { close(); history.replaceState(null, "", location.pathname); window.TIMELINE && TIMELINE.open(); });
    root.querySelector("[data-join]")?.addEventListener("click", () => window.ACCOUNT && ACCOUNT.openSignup({ onDone: () => render() }));
    root.querySelector("[data-logout]")?.addEventListener("click", () => { if (!confirm("로그아웃할까요? (시제품: 이 기기의 가입·인증 정보가 지워져요)")) return; ACCOUNT.logout(); render(); });
    root.querySelector("[data-parenting]").addEventListener("click", () => { close(); history.replaceState(null, "", location.pathname); window.openParenting && window.openParenting(); });
    root.querySelector("[data-settings]").addEventListener("click", () => { close(); history.replaceState(null, "", location.pathname); window.APP_SETTINGS && APP_SETTINGS.open ? APP_SETTINGS.open() : $("openSettings")?.click(); });
    root.querySelector("[data-policy-link]").addEventListener("click", (e) => {
      e.preventDefault(); close(); history.replaceState(null, "", location.pathname);
      document.querySelector('nav.tabs [data-view="view-community"]')?.click();
      setTimeout(() => document.querySelector("#view-community [data-policy]")?.click(), 0);
    });
  }

  function renderFavs(v) {
    root.innerHTML = `${header(`관심 어린이집 ${v.favs.length}`, "My로")}
      <div class="my-body">
        ${v.favs.length ? v.favs.map((s) => card(s, `<button class="my-unfav" data-unfav="${esc(s.key)}" aria-label="${esc(s.name)} 관심 해제">${svg(I.heart)}</button>`)).join("") : `<p class="my-empty">관심 어린이집이 없어요.</p>`}
        ${v.favs.length >= 2 ? `<button class="btn primary my-compare-cta" data-go="compare">${svg(I.compare)}비교하기 (최대 ${MAX_COMPARE}곳)</button>` : ""}
      </div>`;
    bindCommon();
    root.querySelectorAll("[data-unfav]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const s = read().favs.find((x) => x.key === b.dataset.unfav); if (s) toggleFav(s); render();
    }));
  }
  function renderRecent(v) {
    root.innerHTML = `${header("최근 본 어린이집", "My로")}
      <div class="my-body">
        ${v.recent.length ? v.recent.map((s) => card(s)).join("") : `<p class="my-empty">아직 본 어린이집이 없어요.</p>`}
        ${v.recent.length ? `<button class="btn my-clear" data-clear>기록 모두 지우기</button>` : ""}
      </div>`;
    bindCommon();
    root.querySelector("[data-clear]")?.addEventListener("click", () => { const x = read(); x.recent = []; write(x); render(); });
  }

  // 직방·호갱노노식 비교표
  function renderCompare(v) {
    if (!compareSel.length || compareSel.some((k) => !v.favs.find((x) => x.key === k))) compareSel = v.favs.slice(0, MAX_COMPARE).map((x) => x.key);
    const list = compareSel.map((k) => v.favs.find((x) => x.key === k)).filter(Boolean);
    const best = (vals, low) => { const nums = vals.filter((x) => x != null); if (nums.length < 2) return null; return low ? Math.min(...nums) : Math.max(...nums); };
    const rows = [
      ["유형", (s) => s.type],
      ["지역", (s) => (s.area || "").split(" ").slice(1).join(" ")],
      ["정원 / 현원", (s) => `${s.capacity ?? "-"} / ${s.current ?? "-"}`],
      ["남은 정원(계산)", (s) => s.left, "high", (x) => `${x}명`],
      ["교직원당 아이(계산)", (s) => s.ratio, "low", (x) => `${x.toFixed(1)}명`],
      ["아이 1명당 면적(계산)", (s) => s.space, "high", (x) => `${x.toFixed(1)}㎡`],
      ["연장보육", (s) => (s.extended ? "운영" : s.extended === false ? "미운영" : "-")],
      ["통학차량", (s) => (s.bus ? "운영" : "미운영")],
      ["놀이터", (s) => (s.playground ? `${s.playground}곳` : "없음")],
      ["운영 기간", (s) => (s.years != null ? `${Math.floor(s.years)}년` : "-")],
    ];
    root.innerHTML = `${header("어린이집 비교", "My로")}
      <div class="my-body">
        <p class="sheet-copy">비교할 곳을 골라 주세요 (최대 ${MAX_COMPARE}곳). 더 좋은 값은 <b class="my-best-sample">초록</b>으로 표시돼요.</p>
        <div class="cm-pick my-pick">${v.favs.map((s) => `<label class="chip ${compareSel.includes(s.key) ? "on" : ""}"><input type="checkbox" value="${esc(s.key)}" ${compareSel.includes(s.key) ? "checked" : ""}>${esc(s.name)}</label>`).join("")}</div>
        <div class="my-table-wrap"><table class="my-table">
          <thead><tr><th scope="col"><span class="sr-only">항목</span></th>${list.map((s) => `<th scope="col">${esc(s.name)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map(([label, get, dir, fmt]) => {
            const vals = list.map(get);
            const b = dir ? best(vals, dir === "low") : null;
            return `<tr><th scope="row">${label}</th>${vals.map((x) => `<td class="${dir && x != null && x === b ? "best" : ""}">${x == null ? "-" : fmt ? fmt(x) : esc(x)}</td>`).join("")}</tr>`;
          }).join("")}</tbody>
        </table></div>
        <p class="src-line">출처: 어린이집정보공개포털(한국사회보장정보원) · 연장보육: 공공데이터포털(2024)</p>
        <p class="src">관심에 담은 시점의 공공데이터 기준이에요. 모집 여부는 어린이집에 직접 확인하세요.</p>
      </div>`;
    bindCommon();
    root.querySelectorAll(".my-pick input").forEach((c) => c.addEventListener("change", () => {
      const sel = [...root.querySelectorAll(".my-pick input:checked")].map((x) => x.value);
      if (sel.length > MAX_COMPARE) { c.checked = false; toast(`최대 ${MAX_COMPARE}곳까지 비교할 수 있어요.`); return; }
      if (sel.length < 1) { c.checked = true; return; }
      compareSel = sel; render();
    }));
  }

  // 키즈노트·아이사랑식 우리 아이 정보
  // 내 동네: 앱이 처음 보여줄 지역 (설정의 "처음 보여줄 지역"과 같은 값)
  function regionNow() {
    const st = window.APP_SETTINGS ? APP_SETTINGS.get() : {}, acc = window.ACCOUNT ? ACCOUNT.get() : null;
    const sido = st.defaultSido || (acc && acc.sido) || "", city = st.defaultSido ? st.defaultCity || "" : (acc && acc.city) || "";
    return { sido, city, label: [sido, city].filter(Boolean).join(" ") };
  }
  function renderRegion() {
    const cur = regionNow();
    root.innerHTML = `${header("내 동네", "My로")}
      <form class="my-body upload-form my-region-form" novalidate>
        <p class="note" style="margin:0">앱을 열면 이 동네부터 어린이집을 보여드려요. 나의 어린이집·전체메뉴의 지도도 이 동네로 열려요.</p>
        <label class="field"><span>시·도</span><select name="sido" required><option value="">선택해 주세요</option></select></label>
        <label class="field"><span>시·군·구</span><select name="city" required disabled><option value="">먼저 시·도를 골라 주세요</option></select></label>
        <button class="btn primary submit" type="submit" disabled>저장</button>
        <p class="note">동네 정보는 이 기기에만 저장되고 서버로 보내지 않아요.</p>
      </form>`;
    bindCommon();
    const f = root.querySelector("form"), btn = f.querySelector(".submit");
    const sync = () => { btn.disabled = !(f.sido.value && f.city.value); };
    const fill = async (sido, keep) => {
      f.city.disabled = true; f.city.innerHTML = `<option value="">${sido ? "불러오는 중…" : "먼저 시·도를 골라 주세요"}</option>`; sync();
      if (!sido || !window.APP) return;
      let list = []; try { list = await APP.cities(sido); } catch {}
      if (f.sido.value !== sido) return;
      f.city.innerHTML = `<option value="">선택해 주세요</option>` + list.map((c) => `<option ${c === keep ? "selected" : ""}>${esc(c)}</option>`).join("");
      f.city.disabled = !list.length; sync();
    };
    if (window.APP && APP.sidos) {
      f.sido.innerHTML = `<option value="">선택해 주세요</option>` + APP.sidos().map((x) => `<option ${x === cur.sido ? "selected" : ""}>${esc(x)}</option>`).join("");
      if (cur.sido) fill(cur.sido, cur.city);
    }
    f.sido.addEventListener("change", () => fill(f.sido.value, ""));
    f.addEventListener("change", sync);
    f.addEventListener("submit", (e) => {
      e.preventDefault(); if (btn.disabled) return;
      const sido = f.sido.value, city = f.city.value;
      if (window.APP_SETTINGS) { APP_SETTINGS.set("defaultSido", sido); APP_SETTINGS.set("defaultCity", city); }
      if (window.APP && APP.setRegion) APP.setRegion(sido, city);
      try { const a = JSON.parse(localStorage.getItem("account:v1") || "null"); if (a) { a.sido = sido; a.city = city; localStorage.setItem("account:v1", JSON.stringify(a)); window.dispatchEvent(new Event("account:changed")); } } catch {}
      toast(`내 동네를 ${sido} ${city}(으)로 바꿨어요.`); sub = "home"; direct = false; render();
    });
  }
  function renderChild(v) {
    const sy = schoolYearNow(), y = new Date().getFullYear();
    const years = Array.from({ length: 9 }, (_, i) => y + 1 - i);
    const c = v.child || {};
    root.innerHTML = `${header("우리 아이 정보", "My로")}
      <form class="my-body upload-form my-child-form" novalidate>
        <label class="field"><span>아이 이름 또는 애칭 <small>(선택)</small></span><input name="name" maxlength="10" value="${esc(c.name || "")}" placeholder="예: 콩이"></label>
        <div class="cm-pick">${[["born", "태어났어요"], ["expecting", "임신 중이에요"]].map(([k, l]) => `<label class="chip ${(c.expecting ? "expecting" : "born") === k ? "on" : ""}"><input type="radio" name="stage" value="${k}" ${(c.expecting ? "expecting" : "born") === k ? "checked" : ""}>${l}</label>`).join("")}</div>
        <div class="my-ym">
          <label class="field"><span data-ylabel>출생 연도</span><select name="year">${years.map((yy) => `<option ${(c.year || y - 1) === yy ? "selected" : ""}>${yy}</option>`).join("")}</select></label>
          <label class="field"><span data-mlabel>출생 월</span><select name="month">${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => `<option value="${m}" ${(c.month || 1) === m ? "selected" : ""}>${m}월</option>`).join("")}</select></label>
        </div>
        <div class="my-class" aria-live="polite"></div>
        <p class="note">어린이집 반은 보통 3월에 시작하는 학년도와 출생연도로 정해져요. 어린이집마다 반 구성이 다를 수 있어요.</p>
        <button class="btn primary submit" type="submit">저장하고 지금 할 일 보기</button>
        ${v.child ? `<button class="btn danger" type="button" data-del>아이 정보 지우기</button>` : ""}
        <p class="note">아이 정보는 이 기기에만 저장되고 서버로 보내지 않아요.</p>
      </form>`;
    bindCommon();
    const f = root.querySelector("form");
    const show = () => {
      const exp = f.stage.value === "expecting";
      f.querySelectorAll(".cm-pick .chip").forEach((x) => x.classList.toggle("on", x.querySelector("input").checked));
      f.querySelector("[data-ylabel]").textContent = exp ? "출산 예정 연도" : "출생 연도";
      f.querySelector("[data-mlabel]").textContent = exp ? "출산 예정 월" : "출생 월";
      const yy = Number(f.year.value);
      f.querySelector(".my-class").innerHTML = `<div><span class="my-class-label">올해 반</span><small>${sy}.3 ~ ${sy + 1}.2</small><b>${exp ? "출산 전" : classOf(yy, sy)}</b></div><div><span class="my-class-label">내년 반</span><small>${sy + 1}.3 ~</small><b>${classOf(yy, sy + 1)}</b></div>`;
    };
    f.addEventListener("change", show); show();
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const x = read(); x.child = { name: f.name.value.trim(), year: Number(f.year.value), month: Number(f.month.value), expecting: f.stage.value === "expecting" }; write(x);
      toast("아이 정보를 저장했어요."); close(); history.replaceState(null, "", location.pathname);
      window.TIMELINE && TIMELINE.open();
    });
    f.querySelector("[data-del]")?.addEventListener("click", () => { const x = read(); x.child = null; write(x); sub = "home"; render(); });
  }

  // 학부모 인증 관리 (account.js)
  function renderVerify() {
    const acc = window.ACCOUNT && ACCOUNT.get();
    if (!acc) { sub = "home"; return render(); }
    const list = acc.verifications || [];
    root.innerHTML = `${header("학부모 인증 관리", "My로")}
      <div class="my-body">
        <p class="sheet-copy">인증한 어린이집에만 별점 평가를 남길 수 있어요.</p>
        ${list.length ? list.map((x) => `<div class="my-dc"><span><b>${esc(x.name)}</b><small>${esc(x.area || "")} · ${x.state === "pending" ? `<span class="verified-badge pending">⏳ 확인 중</span>` : `<span class="verified-badge">✔ ${esc(x.status)}</span>`} · ${esc((ACCOUNT.METHOD_LABEL || {})[x.method] || "")} · ${new Date(x.at).toLocaleDateString("ko-KR")}</small></span>${x.state === "pending" ? `<button class="btn my-unverify" data-approve="${esc(x.key)}" title="시제품: 운영자 승인 흉내">승인(시제품)</button>` : ""}<button class="btn my-unverify" data-unverify="${esc(x.key)}">해제</button></div>`).join("") : `<p class="my-empty">아직 인증한 어린이집이 없어요.</p>`}
        <button class="btn primary my-compare-cta" data-add-verify>+ 어린이집 인증 추가</button>
      </div>`;
    bindCommon();
    root.querySelector("[data-add-verify]").addEventListener("click", () => ACCOUNT.openVerify(null, { onDone: () => render() }));
    root.querySelectorAll("[data-approve]").forEach((b) => b.addEventListener("click", () => { ACCOUNT.approve(b.dataset.approve); toast("시제품: 운영자 승인 처리했어요."); render(); }));
    root.querySelectorAll("[data-unverify]").forEach((b) => b.addEventListener("click", () => {
      if (!confirm("이 어린이집 인증을 해제할까요? 이 어린이집에 남긴 평가는 그대로 남아요.")) return;
      ACCOUNT.removeVerification(b.dataset.unverify); render();
    }));
  }

  // 당근식 내 활동
  function renderActivity() {
    const cm = readJSON("community:v1", {});
    const posts = (cm.posts || []).filter((p) => p.mine);
    const comments = (cm.posts || []).flatMap((p) => (p.comments || []).filter((c) => c.mine).map((c) => ({ ...c, title: p.title })));
    const ratings = Object.entries(readJSON("ratings:v1", {}));
    const avg = (r) => Object.values(r.scores || {}).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(r.scores || {}).length);
    root.innerHTML = `${header("내 활동", "My로")}
      <div class="my-body">
        <section class="my-sec"><h3>${svg(I.chat)}내가 쓴 글 ${posts.length}</h3>
          ${posts.length ? posts.map((p) => `<div class="my-row"><b>${esc(p.title)}</b><small>${new Date(p.at).toLocaleDateString("ko-KR")} · 공감 ${p.likes} · 댓글 ${p.comments.length}</small></div>`).join("") : `<p class="my-empty">아직 쓴 글이 없어요.</p>`}</section>
        <section class="my-sec"><h3>${svg(I.chat)}내가 쓴 댓글 ${comments.length}</h3>
          ${comments.length ? comments.map((c) => `<div class="my-row"><b>${esc(c.body)}</b><small>"${esc(c.title)}"에 남김</small></div>`).join("") : `<p class="my-empty">아직 쓴 댓글이 없어요.</p>`}</section>
        <section class="my-sec"><h3>${svg(I.star)}내 별점 평가 ${ratings.length}</h3>
          ${ratings.length ? ratings.map(([k, r]) => `<div class="my-row"><b>${esc(k.split("|").slice(1).join("|"))} · ★ ${avg(r).toFixed(1)}</b><small>${esc(r.verified?.status || "")} 인증 · ${new Date(r.at).toLocaleDateString("ko-KR")}</small></div>`).join("") : `<p class="my-empty">아직 평가한 어린이집이 없어요.</p>`}</section>
      </div>`;
    bindCommon();
  }

  window.MYPAGE = { open, track, bindFav, isFav };
  document.addEventListener("click", (e) => { if (e.target.closest("#openMy")) open(); });
})();
