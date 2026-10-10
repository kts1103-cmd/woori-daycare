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
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
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
    const paint = (on) => { btn.classList.toggle("on", on); btn.setAttribute("aria-pressed", on); btn.setAttribute("aria-label", on ? "관심 어린이집에서 빼기" : "관심 어린이집에 담기"); };
    paint(isFav(snap.key));
    btn.addEventListener("click", () => paint(toggleFav(snap)));
  }

  // ---- 우리 아이 연령반 (학년도 3월 시작, 출생연도 기준) ----
  function classOf(birthYear, schoolYear) { const age = schoolYear - 1 - birthYear; return age < 0 ? "입소 전" : age > 5 ? "유치원·초등 연령" : `만 ${age}세반`; }
  const schoolYearNow = () => { const d = new Date(); return d.getMonth() >= 2 ? d.getFullYear() : d.getFullYear() - 1; };

  // ---- 화면 ----
  let root = null, sub = "home", compareSel = [];
  function ensureRoot() {
    if (root) return root;
    root = document.createElement("div");
    root.id = "mypage"; root.className = "mypage"; root.hidden = true;
    root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "My page");
    document.body.appendChild(root);
    return root;
  }
  function open() {
    ensureRoot(); sub = "home"; render();
    root.hidden = false; document.body.classList.add("my-mode");
    history.pushState({ my: true }, "", "#my");
  }
  function close() { if (!root) return; root.hidden = true; document.body.classList.remove("my-mode"); }
  window.addEventListener("popstate", () => {
    if (!root || root.hidden) return;
    if (sub !== "home") { sub = "home"; render(); history.pushState({ my: true }, "", "#my"); return; }
    close();
  });
  if (location.hash === "#my") history.replaceState(null, "", location.pathname + location.search);

  function header(title, backLabel = "닫기") {
    return `<header class="detail-header"><button class="icon-button" data-my-back aria-label="${backLabel}">${svg(I.back)}</button><h2>${title}</h2></header>`;
  }
  function bindCommon() {
    root.querySelector("[data-my-back]")?.addEventListener("click", () => { if (sub !== "home") { sub = "home"; render(); } else history.back(); });
    root.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => { sub = b.dataset.go; render(); root.querySelector(".my-body").scrollTop = 0; }));
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
    if (sub === "activity") return renderActivity();
    const cm = readJSON("community:v1", {});
    const myPosts = (cm.posts || []).filter((p) => p.mine).length;
    const myComments = (cm.posts || []).reduce((a, p) => a + (p.comments || []).filter((c) => c.mine).length, 0);
    const myRatings = Object.keys(readJSON("ratings:v1", {})).length;
    const sy = schoolYearNow();
    root.innerHTML = `${header("My")}
      <div class="my-body">
        <section class="my-profile">
          <span class="my-avatar">${svg(I.user)}</span>
          <div><b>${esc(cm.nick || "우리동네 부모님")}</b><small>로그인 전 · 이 기기에 저장된 정보만 보여요</small></div>
          <button class="btn my-login" type="button" data-soon>로그인</button>
        </section>
        <button class="my-child" data-go="child">
          <span class="my-ic">${svg(I.baby)}</span>
          ${v.child ? `<span><b>${esc(v.child.name || "우리 아이")} · ${classOf(v.child.year, sy)}</b><small>${sy}학년도 기준 · 내년 ${classOf(v.child.year, sy + 1)}</small></span>` : `<span><b>우리 아이 정보 등록</b><small>출생연도를 넣으면 연령반을 알려드려요</small></span>`}
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
          <button data-go="activity">${svg(I.chat)}<span>내가 쓴 글·댓글</span><small>${myPosts + myComments}</small>${svg(I.chevron)}</button>
          <button data-go="activity">${svg(I.star)}<span>내 별점 평가</span><small>${myRatings}</small>${svg(I.chevron)}</button>
          <button data-settings>${svg(I.gear)}<span>앱 설정</span>${svg(I.chevron)}</button>
          <a href="#policy" data-policy-link>${svg(I.note)}<span>커뮤니티 운영정책</span>${svg(I.chevron)}</a>
        </nav>
        <p class="src">시제품: My 정보는 이 기기에만 저장돼요. 로그인은 서버 연결 후 제공돼요.</p>
      </div>`;
    bindCommon();
    root.querySelector("[data-soon]").addEventListener("click", () => toast("로그인은 서버 연결 후 열려요. (카카오·네이버 간편 로그인 예정)"));
    root.querySelector("[data-settings]").addEventListener("click", () => { close(); history.replaceState(null, "", location.pathname); $("openSettings")?.click(); });
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
      ["남은 정원", (s) => s.left, "high", (x) => `${x}명`],
      ["교직원당 아이", (s) => s.ratio, "low", (x) => `${x.toFixed(1)}명`],
      ["아이 1명당 면적", (s) => s.space, "high", (x) => `${x.toFixed(1)}㎡`],
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
          <thead><tr><th></th>${list.map((s) => `<th scope="col">${esc(s.name)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map(([label, get, dir, fmt]) => {
            const vals = list.map(get);
            const b = dir ? best(vals, dir === "low") : null;
            return `<tr><th scope="row">${label}</th>${vals.map((x) => `<td class="${dir && x != null && x === b ? "best" : ""}">${x == null ? "-" : fmt ? fmt(x) : esc(x)}</td>`).join("")}</tr>`;
          }).join("")}</tbody>
        </table></div>
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
  function renderChild(v) {
    const sy = schoolYearNow(), y = new Date().getFullYear();
    const years = Array.from({ length: 8 }, (_, i) => y - i);
    root.innerHTML = `${header("우리 아이 정보", "My로")}
      <form class="my-body upload-form my-child-form" novalidate>
        <label class="field"><span>아이 이름 또는 애칭 <small>(선택)</small></span><input name="name" maxlength="10" value="${esc(v.child?.name || "")}" placeholder="예: 콩이"></label>
        <label class="field"><span>출생연도</span><select name="year">${years.map((yy) => `<option ${v.child?.year === yy ? "selected" : ""}>${yy}</option>`).join("")}</select></label>
        <div class="my-class" aria-live="polite"></div>
        <p class="note">어린이집 반은 보통 3월에 시작하는 학년도와 출생연도로 정해져요. 어린이집마다 반 구성이 다를 수 있어요.</p>
        <button class="btn primary submit" type="submit">저장</button>
        ${v.child ? `<button class="btn danger" type="button" data-del>아이 정보 지우기</button>` : ""}
        <p class="note">아이 정보는 이 기기에만 저장되고 서버로 보내지 않아요.</p>
      </form>`;
    bindCommon();
    const f = root.querySelector("form");
    const show = () => { const yy = Number(f.year.value); f.querySelector(".my-class").innerHTML = `<div><span>${sy}학년도 (지금)</span><b>${classOf(yy, sy)}</b></div><div><span>${sy + 1}학년도 (내년 3월~)</span><b>${classOf(yy, sy + 1)}</b></div>`; };
    f.year.addEventListener("change", show); show();
    f.addEventListener("submit", (e) => { e.preventDefault(); const x = read(); x.child = { name: f.name.value.trim(), year: Number(f.year.value) }; write(x); toast("아이 정보를 저장했어요."); sub = "home"; render(); });
    f.querySelector("[data-del]")?.addEventListener("click", () => { const x = read(); x.child = null; write(x); sub = "home"; render(); });
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
