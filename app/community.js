// 커뮤니티 (시제품)
// 참고: 당근 동네생활(동네 기준 피드·주제 칩·공감/댓글), 네이버 맘카페(육아 게시판 분류).
// 글·댓글·공감은 이 기기 localStorage에만 저장한다. 정식 서비스에서는 store 객체만 서버 API로 바꾼다.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const root = $("view-community");
  if (!root) return;

  const CATS = [
    ["review", "어린이집 후기", "🏫"], ["admission", "등록대기", "📮"], ["question", "궁금해요", "🙋"],
    ["worry", "육아 고민", "💭"], ["local", "동네 정보", "📍"],
  ];
  const catOf = (k) => CATS.find((c) => c[0] === k) || CATS[2];
  const REPORT_REASONS = ["특정인 비방·명예훼손", "개인정보 노출(실명·사진 등)", "허위 사실", "광고·홍보", "욕설·혐오 표현", "기타"];

  // ---- 저장소 ----
  const KEY = "community:v1";
  const now = Date.now(), H = 3600e3;
  const SEED = [
    { id: "s1", cat: "admission", title: "국공립 대기 순번 얼마나 걸리셨어요?", body: "3월 입소 목표로 작년 가을에 신청했는데 아직 대기 12번이에요. 맞벌이 가점 있어도 이 정도면 다른 곳도 같이 넣어둬야 할까요?", author: "새싹맘", at: now - 2 * H, likes: 14, views: 182, comments: [
      { author: "도토리아빠", body: "저희는 대기 9번에서 4개월 걸렸어요. 2~3곳 같이 넣어두시는 거 추천해요.", at: now - 1.5 * H },
      { author: "햇살맘", body: "3월은 졸업생 빠지는 시기라 순번이 갑자기 당겨지기도 해요!", at: now - 1 * H }] },
    { id: "s2", cat: "review", title: "연장보육 7시 반까지 되는 곳 다녀본 후기", body: "연장반을 따로 운영해서 담당 선생님이 계시고, 저녁 간식도 나와요. 상담 때 연장반 아이 수와 담당 선생님을 꼭 물어보세요.", daycare: "123키즈어린이집", author: "퇴근길엄마", at: now - 5 * H, likes: 31, views: 420, ownerReply: { name: "김○○", body: "좋은 후기 감사합니다. 연장반은 담당 교사 1명과 보조 교사가 함께 운영하고 있어요. 상담은 평일 오후에 언제든 가능합니다.", at: now - 3 * H }, comments: [
      { author: "민트맘", body: "연장반 담당 따로 있는지 꼭 물어볼게요. 감사해요!", at: now - 4 * H }] },
    { id: "s3", cat: "question", title: "상담 갈 때 꼭 물어봐야 할 것 있을까요?", body: "처음 어린이집 보내는 거라 뭘 물어봐야 할지 모르겠어요. 필요경비랑 적응기간 말고 또 뭐가 있을까요?", author: "초보엄마", at: now - 9 * H, likes: 22, views: 301, comments: [
      { author: "두아이맘", body: "아플 때 귀가 기준, 낮잠 시간, 바깥놀이 횟수 물어보세요. 앱 상세 화면에 상담 체크리스트도 있어요.", at: now - 8 * H },
      { author: "도토리아빠", body: "CCTV 열람 절차도요!", at: now - 7 * H }] },
    { id: "s4", cat: "worry", title: "적응기간 2주째인데 아침마다 울어요", body: "등원할 때마다 너무 울어서 마음이 아파요. 다들 얼마나 걸리셨나요?", author: "콩이맘", at: now - 26 * H, likes: 45, views: 512, comments: [
      { author: "햇살맘", body: "저희는 한 달 정도 걸렸어요. 인사는 짧게 하고 나오는 게 오히려 빨리 적응하더라고요.", at: now - 25 * H }] },
    { id: "s5", cat: "local", title: "양덕동 키즈카페 새로 생겼어요", body: "4세 이하 존이 따로 있고 평일 오전은 한산해요. 주차는 건물 지하 2시간 무료예요.", author: "동네아빠", at: now - 50 * H, likes: 18, views: 240, comments: [] },
  ].map((p) => ({ ...p, seed: true }));

  const store = {
    load() {
      try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.posts) return v; } catch {}
      return { posts: SEED, liked: [], reported: [], nick: "" };
    },
    save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
  };
  let db = store.load();
  const commit = () => store.save(db);
  function nick() {
    if (!db.nick) { const a = ["민트", "새싹", "도토리", "햇살", "구름", "콩콩"]; db.nick = `${a[Math.floor(Math.random() * a.length)]}${Math.floor(1000 + Math.random() * 9000)}`; commit(); }
    return db.nick;
  }

  // ---- 공통 ----
  const ago = (t) => { const m = Math.floor((Date.now() - t) / 60000); if (m < 1) return "방금"; if (m < 60) return `${m}분 전`; const h = Math.floor(m / 60); if (h < 24) return `${h}시간 전`; const d = Math.floor(h / 24); return d < 7 ? `${d}일 전` : new Date(t).toLocaleDateString("ko-KR"); };
  const region = () => { const t = ($("regionLabel")?.textContent || "").trim(); return t && t !== "지역 선택" ? t : "우리 동네"; };
  const svg = (d) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const I = {
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
    chat: '<path d="M4 5h16v11H9l-5 4Z"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    back: '<path d="m15 5-7 7 7 7"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>', pen: '<path d="M4 20h4L19 9l-4-4L4 16Z"/>',
    flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>', school: '<path d="M3 11 12 4l9 7v9H3Z"/><path d="M10 20v-5h4v5"/>', send: '<path d="m3 11 18-8-8 18-2-8Z"/>',
  };
  const toast = (msg) => { const t = $("toast"); if (!t) return; t.textContent = msg; t.classList.add("visible"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("visible"), 3000); };
  // 특정인(선생님·교사·원장 + 이름)을 지목하면서 학대·폭행을 주장하는 글은 등록 전에 막고 공식 창구로 안내 (간단한 1차 필터)
  const flagged = (text) => /(선생님|교사|원장)\s*[가-힣]{2,4}/.test(text) && /(때리|때렸|때려|폭행|학대|방치|폭언|체벌)/.test(text);

  // ---- 상태 ----
  let cat = "all", sort = "new", openId = null, mode = "feed";

  function setMode(m) {
    mode = m;
    document.body.classList.toggle("post-mode", m !== "feed");
    if (m === "feed") { renderFeed(); document.querySelector("main").scrollTop = feedScroll; }
    else document.querySelector("main").scrollTop = 0;
  }
  let feedScroll = 0;
  function push(m, id) {
    feedScroll = document.querySelector("main").scrollTop;
    openId = id || null;
    history.pushState({ community: m }, "", "#" + m);
    setMode(m);
    m === "post" ? renderPost() : m === "policy" ? renderPolicy() : renderWrite();
  }
  window.addEventListener("popstate", () => { if (mode !== "feed") { const s = $("sheet"); if (s && s.open) s.close(); setMode("feed"); } });
  if (/^#(post|write|policy)$/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);

  // ---- 피드 ----
  function visiblePosts() {
    let list = db.posts.filter((p) => !db.reported.includes(p.id) && (cat === "all" || p.cat === cat));
    return sort === "hot" ? list.sort((a, b) => (b.likes + b.comments.length * 2) - (a.likes + a.comments.length * 2)) : list.sort((a, b) => b.at - a.at);
  }
  function renderFeed() {
    const posts = visiblePosts();
    root.innerHTML = `
      <div class="cm-head">
        <div><h2>우리 동네 이야기</h2><p>${esc(region())} 부모님들과 나눠요</p></div>
        <span class="badge sample">시제품</span>
      </div>
      <div class="cm-rules" role="note">
        <b>⚠️ 글을 올리기 전에 꼭 확인하세요</b>
        <p>허위 사실은 물론, <strong>사실이라도 특정 어린이집·선생님을 비방하는 글은 명예훼손으로 형사처벌이나 손해배상 책임</strong>을 질 수 있어요. 글에 대한 법적 책임은 작성자 본인에게 있습니다.</p>
        <ul>
          <li>선생님·아이의 실명, 얼굴 사진, 연락처는 올릴 수 없어요.</li>
          <li>확인되지 않은 학대 의혹은 게시하지 말고 <strong>112 또는 아동보호전문기관</strong>에 신고해 주세요.</li>
          <li>기준을 어긴 글은 예고 없이 숨김·삭제되며, 수사기관의 적법한 요청에는 협조합니다.</li>
        </ul>
        <a href="#policy" data-policy>운영정책 전문 보기 ›</a>
      </div>
      <div class="chips cm-cats" role="group" aria-label="게시판 주제">
        <button class="chip ${cat === "all" ? "on" : ""}" data-cat="all">전체</button>
        ${CATS.map(([k, l, e]) => `<button class="chip ${cat === k ? "on" : ""}" data-cat="${k}">${e} ${l}</button>`).join("")}
      </div>
      <div class="cm-sort"><span>글 ${posts.length}개</span><div class="segments" role="group" aria-label="정렬">
        <button type="button" data-sort="new" aria-pressed="${sort === "new"}">최신순</button><button type="button" data-sort="hot" aria-pressed="${sort === "hot"}">인기순</button></div></div>
      <ul class="cm-list">${posts.length ? posts.map(cardHTML).join("") : `<li class="cm-empty">아직 글이 없어요. 첫 글을 남겨 보세요.</li>`}</ul>
      <p class="src">시제품: 글과 댓글은 이 기기에만 저장돼요. "예시" 글은 화면 확인용으로 만든 글이에요. · <a href="#policy" data-policy>커뮤니티 운영정책</a></p>
      <button class="cm-fab" type="button" data-write>${svg(I.pen)}글쓰기</button>`;
    root.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => { cat = b.dataset.cat; renderFeed(); }));
    root.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => { sort = b.dataset.sort; renderFeed(); }));
    root.querySelectorAll("[data-post]").forEach((b) => b.addEventListener("click", () => push("post", b.dataset.post)));
    root.querySelector("[data-write]").addEventListener("click", () => push("write"));
    root.querySelectorAll("[data-policy]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); push("policy"); }));
  }
  // 임시조치(정보통신망법 제44조의2): 권리침해 신고가 들어오면 최대 30일 가림
  const TAKEDOWN_DAYS = 30;
  const blinded = (p) => p.takedown && p.takedown.status !== "restored" && Date.now() < p.takedown.until;
  const dateKo = (t) => new Date(t).toLocaleDateString("ko-KR");

  function cardHTML(p) {
    const [, label, emoji] = catOf(p.cat);
    if (blinded(p)) {
      return `<li><button class="cm-card cm-blinded" data-post="${p.id}">
        <span class="cm-cat">${emoji} ${label}</span>
        <b class="cm-title">권리침해 신고로 임시조치된 글이에요</b>
        <span class="cm-body">${dateKo(p.takedown.until)}까지 가려져요. 운영정책에 따라 검토 후 다시 보이거나 삭제돼요.</span>
      </button></li>`;
    }
    const liked = db.liked.includes(p.id);
    return `<li><button class="cm-card" data-post="${p.id}">
      <span class="cm-cat">${emoji} ${label}${p.seed ? ' <em>예시</em>' : ""}</span>
      <b class="cm-title">${esc(p.title)}</b>
      <span class="cm-body">${esc(p.body)}</span>
      ${p.daycare ? `<span class="cm-daycare">${svg(I.school)}${esc(p.daycare)}${p.ownerReply ? " · 원장 답변" : ""}</span>` : ""}
      <span class="cm-meta"><span>${esc(p.author)} · ${ago(p.at)} · 조회 ${p.views}</span>
        <span class="cm-counts"><span class="${liked ? "on" : ""}">${svg(I.heart)}${p.likes}</span><span>${svg(I.chat)}${p.comments.length}</span></span></span>
    </button></li>`;
  }

  // ---- 글 상세 ----
  function renderPost() {
    const p = db.posts.find((x) => x.id === openId);
    if (!p) { history.back(); return; }
    if (blinded(p)) return renderBlinded(p);
    if (!p._viewed) { p.views++; p._viewed = true; commit(); }
    const [, label, emoji] = catOf(p.cat);
    const liked = db.liked.includes(p.id);
    const r = p.ownerReply;
    root.innerHTML = `
      <header class="detail-header"><button class="icon-button" data-back aria-label="목록으로">${svg(I.back)}</button><h2>${emoji} ${label}</h2>
        <button class="icon-button" data-report aria-label="신고하기">${svg(I.flag)}</button></header>
      <div class="detail-body cm-post">
        <article>
          <div class="cm-author"><span class="cm-avatar" aria-hidden="true">${esc(p.author.slice(0, 1))}</span><div><b>${esc(p.author)}</b><small>${esc(region())} · ${ago(p.at)} · 조회 ${p.views}</small></div>${p.seed ? '<span class="badge sample">예시</span>' : ""}</div>
          <h1>${esc(p.title)}</h1>
          <p class="cm-text">${esc(p.body).replace(/\n/g, "<br>")}</p>
          ${p.daycare ? `<span class="cm-daycare">${svg(I.school)}${esc(p.daycare)}</span>` : ""}
          ${p.cat === "review" ? `<p class="cm-review-note">개인의 경험이에요. 어린이집 상황은 시기·반마다 다를 수 있어요.</p>` : ""}
          ${p.takedown && p.takedown.status === "restored" ? `<p class="cm-review-note">권리침해 신고 검토 후 다시 게시된 글이에요.</p>` : ""}
          <div class="cm-actions"><button class="cm-like ${liked ? "on" : ""}" data-like aria-pressed="${liked}">${svg(I.heart)}공감 ${p.likes}</button><span>${svg(I.chat)}댓글 ${p.comments.length}</span></div>
        </article>
        ${p.daycare ? (r ? `
        <section class="cm-owner-reply" aria-label="어린이집 공식 답변">
          <div class="cm-owner-head">${svg(I.school)}<b>${esc(p.daycare)} 공식 답변</b><small>${ago(r.at)}</small></div>
          <p>${esc(r.body).replace(/\n/g, "<br>")}</p>
          <small class="cm-owner-by">원장 ${esc(r.name)} · 원장 확인 후 게시</small>
        </section>` : `
        <button class="owner-upload cm-owner-cta" data-owner-reply>${svg(I.school)}<span><b>${esc(p.daycare)} 원장님이신가요?</b><small>이 글에 어린이집 공식 답변을 남길 수 있어요</small></span>${svg('<path d="m9 5 7 7-7 7"/>')}</button>`) : ""}
        <section class="cm-comments" aria-label="댓글">
          ${p.comments.length ? p.comments.map((c, i) => `<div class="cm-comment"><span class="cm-avatar sm" aria-hidden="true">${esc(c.author.slice(0, 1))}</span><div><b>${esc(c.author)}</b> <small>${ago(c.at)}</small><p>${esc(c.body)}</p></div>${c.mine ? `<button class="cm-del" data-del-c="${i}">삭제</button>` : ""}</div>`).join("") : `<p class="cm-empty">첫 댓글을 남겨 보세요.</p>`}
        </section>
        ${p.mine ? `<button class="btn danger cm-delete" data-delete>글 삭제</button>` : ""}
      </div>
      <form class="cm-reply"><input name="c" maxlength="300" autocomplete="off" placeholder="따뜻한 댓글을 남겨 주세요" aria-label="댓글 입력"><button class="icon-button" aria-label="댓글 등록">${svg(I.send)}</button></form>`;
    root.querySelector("[data-back]").addEventListener("click", () => history.back());
    root.querySelector("[data-like]").addEventListener("click", () => {
      const on = db.liked.includes(p.id);
      db.liked = on ? db.liked.filter((x) => x !== p.id) : [...db.liked, p.id];
      p.likes += on ? -1 : 1; commit(); renderPost();
    });
    root.querySelector("[data-report]").addEventListener("click", () => openReport(p));
    root.querySelector("[data-owner-reply]")?.addEventListener("click", () => openOwnerReply(p));
    root.querySelector("[data-delete]")?.addEventListener("click", () => {
      if (!confirm("이 글을 삭제할까요?")) return;
      db.posts = db.posts.filter((x) => x.id !== p.id); commit(); toast("글을 삭제했어요."); history.back();
    });
    root.querySelectorAll("[data-del-c]").forEach((b) => b.addEventListener("click", () => { p.comments.splice(Number(b.dataset.delC), 1); commit(); renderPost(); }));
    root.querySelector(".cm-reply").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = e.target.c.value.trim();
      if (!v) return;
      p.comments.push({ author: nick(), body: v, at: Date.now(), mine: true }); commit(); renderPost();
      root.querySelector(".detail-body").scrollTop = 1e6;
    });
  }

  // 임시조치된 글: 다른 사람에게는 안내만, 작성자에게는 원문과 이의제기 버튼
  function renderBlinded(p) {
    const t = p.takedown;
    const objected = t.status === "objection";
    root.innerHTML = `
      <header class="detail-header"><button class="icon-button" data-back aria-label="목록으로">${svg(I.back)}</button><h2>임시조치된 글</h2></header>
      <div class="detail-body cm-post">
        <section class="cm-takedown">
          <b>권리침해 신고로 임시조치된 글이에요</b>
          <p>${dateKo(t.at)}에 ${esc(t.reporterType)}의 권리침해 신고가 접수되어 ${dateKo(t.until)}까지 가려져요. 기간 안에 운영자가 검토해 다시 게시하거나 삭제해요.</p>
          <dl><div><dt>신고 사유</dt><dd>${esc(t.reason)}</dd></div><div><dt>처리 상태</dt><dd>${objected ? "작성자 이의제기 · 검토 중" : "임시조치 · 검토 대기"}</dd></div></dl>
        </section>
        ${p.mine ? `
        <section class="cm-mine-blinded">
          <h3>내가 쓴 글</h3>
          <p class="cm-text"><b>${esc(p.title)}</b><br>${esc(p.body).replace(/\n/g, "<br>")}</p>
          ${objected ? `<p class="note">이의제기를 접수했어요: "${esc(t.objection)}"</p>` : `
          <form class="upload-form" data-objection>
            <label class="field"><span>이의제기 사유</span><textarea name="why" rows="4" maxlength="500" required placeholder="직접 겪은 사실인지, 공익적인 정보인지 등 다시 게시되어야 하는 이유를 적어 주세요."></textarea></label>
            <button class="btn primary submit" type="submit">이의제기 하기</button>
          </form>`}
        </section>` : ""}
        <p class="src">시제품: 신고와 처리 기록은 이 기기에만 저장돼요. 운영정책은 커뮤니티 첫 화면에서 볼 수 있어요.</p>
        <button class="btn" data-restore>운영자 검토 완료 처리 (시제품 확인용)</button>
      </div>`;
    root.querySelector("[data-back]").addEventListener("click", () => history.back());
    root.querySelector("[data-objection]")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const why = e.target.why.value.trim();
      if (!why) return;
      t.status = "objection"; t.objection = why; commit(); toast("이의제기를 접수했어요. 운영자가 검토해요."); renderBlinded(p);
    });
    root.querySelector("[data-restore]").addEventListener("click", () => { t.status = "restored"; commit(); toast("검토 후 다시 게시했어요."); renderPost(); });
  }

  function openReport(p) {
    const sh = $("sheet");
    sh.setAttribute("aria-label", "게시글 신고");
    sh.innerHTML = `<div class="sheet-top"><h2>신고 사유를 골라 주세요</h2><button class="icon-button" data-close aria-label="닫기">${svg(I.close)}</button></div>
      <button class="cm-rights" data-rights><b>권리침해 신고</b><small>글에 언급된 어린이집·당사자라면 임시조치(최대 ${TAKEDOWN_DAYS}일 가림)를 요청할 수 있어요</small></button>
      <p class="sheet-copy">이용자 신고: 신고한 글은 내 화면에서 바로 숨겨지고, 운영자가 확인해요.</p>
      <div class="sheet-options">${REPORT_REASONS.map((r) => `<button data-reason="${r}">${r}</button>`).join("")}</div>`;
    sh.querySelector("[data-close]").addEventListener("click", () => sh.close());
    sh.querySelector("[data-rights]").addEventListener("click", () => openTakedown(p));
    sh.querySelectorAll("[data-reason]").forEach((b) => b.addEventListener("click", () => {
      db.reported.push(p.id); commit(); sh.close(); toast("신고가 접수됐어요. 이 글은 숨겨져요."); history.back();
    }));
    if (!sh.open) sh.showModal();
  }

  // 권리침해 신고 (임시조치 요청)
  function openTakedown(p) {
    const sh = $("sheet");
    sh.setAttribute("aria-label", "권리침해 신고");
    sh.innerHTML = `<div class="sheet-top"><h2>권리침해 신고</h2><button class="icon-button" data-close aria-label="닫기">${svg(I.close)}</button></div>
      <p class="sheet-copy">명예훼손·사생활 침해 등 권리를 침해당한 당사자(또는 대리인)가 요청할 수 있어요. 접수되면 글이 최대 ${TAKEDOWN_DAYS}일 동안 가려지고, 작성자는 이의를 제기할 수 있어요.</p>
      <form class="upload-form" novalidate>
        <fieldset><legend>신고인</legend>
          <div class="cm-pick">${["어린이집(기관)", "언급된 당사자", "대리인"].map((t, i) => `<label class="chip ${i === 0 ? "on" : ""}"><input type="radio" name="who" value="${t}" ${i === 0 ? "checked" : ""}>${t}</label>`).join("")}</div>
          <label class="field"><span>기관명 또는 이름</span><input name="name" maxlength="40" required value="${esc(p.daycare || "")}"></label>
          <label class="field"><span>연락받을 이메일</span><input name="email" type="email" maxlength="80" required autocomplete="email" placeholder="처리 결과를 알려 드려요"></label>
        </fieldset>
        <fieldset><legend>침해 내용</legend>
          <label class="field"><span>사유</span><select name="reason">${["명예훼손(허위 사실)", "명예훼손(사실 적시·비방)", "사생활 침해·개인정보 노출", "기타 권리침해"].map((r) => `<option>${r}</option>`).join("")}</select></label>
          <label class="field"><span>구체적인 내용</span><textarea name="detail" rows="4" maxlength="1000" required placeholder="어느 부분이 어떤 권리를 침해하는지 적어 주세요."></textarea></label>
        </fieldset>
        <label class="check"><input type="checkbox" name="ok">신고 내용이 사실이며, 허위 신고 시 책임질 수 있음을 확인해요.</label>
        <button class="btn primary submit" type="submit" disabled>임시조치 요청하기</button>
        <p class="note">시제품: 이 기기에만 기록되고 실제로 접수되지 않아요.</p>
      </form>`;
    const f = sh.querySelector("form"), btn = f.querySelector(".submit");
    const sync = () => {
      f.querySelectorAll(".cm-pick .chip").forEach((c) => c.classList.toggle("on", c.querySelector("input").checked));
      btn.disabled = !(f.name.value.trim() && /.+@.+\..+/.test(f.email.value) && f.detail.value.trim().length >= 5 && f.ok.checked);
    };
    f.addEventListener("input", sync); f.addEventListener("change", sync); sync();
    sh.querySelector("[data-close]").addEventListener("click", () => sh.close());
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      const at = Date.now();
      p.takedown = { at, until: at + TAKEDOWN_DAYS * 864e5, reporterType: f.who.value, reporter: f.name.value.trim(), reason: f.reason.value, detail: f.detail.value.trim(), status: "pending" };
      commit(); sh.close(); toast(`임시조치를 요청했어요. 이 글은 ${dateKo(p.takedown.until)}까지 가려져요.`); renderPost();
    });
  }

  // 원장 공식 답변
  function openOwnerReply(p) {
    const sh = $("sheet");
    sh.setAttribute("aria-label", "어린이집 공식 답변");
    sh.innerHTML = `<div class="sheet-top"><h2>공식 답변 남기기</h2><button class="icon-button" data-close aria-label="닫기">${svg(I.close)}</button></div>
      <p class="sheet-copy"><b>${esc(p.daycare)}</b> 원장(대표자)만 답변할 수 있어요. 답변은 글 아래에 "공식 답변"으로 표시돼요.</p>
      <form class="upload-form" novalidate>
        <label class="field"><span>원장(대표자) 이름</span><input name="owner" maxlength="20" required autocomplete="name"></label>
        <p class="note">정식 서비스에서는 휴대폰 본인인증과 어린이집 인가 정보로 원장 여부를 확인해요.</p>
        <label class="field"><span>답변</span><textarea name="body" rows="5" maxlength="1000" required placeholder="사실과 다른 부분은 설명하고, 개선한 점이 있다면 알려 주세요."></textarea></label>
        <label class="check"><input type="checkbox" name="ok">작성자나 아이를 특정할 수 있는 정보(이름·반·날짜 등)를 쓰지 않았어요.</label>
        <button class="btn primary submit" type="submit" disabled>답변 등록하기</button>
        <p class="note">시제품: 이 기기에만 저장돼요.</p>
      </form>`;
    const f = sh.querySelector("form"), btn = f.querySelector(".submit");
    const sync = () => { btn.disabled = !(f.owner.value.trim() && f.body.value.trim().length >= 5 && f.ok.checked); };
    f.addEventListener("input", sync); f.addEventListener("change", sync); sync();
    sh.querySelector("[data-close]").addEventListener("click", () => sh.close());
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      p.ownerReply = { name: f.owner.value.trim(), body: f.body.value.trim(), at: Date.now() };
      commit(); sh.close(); toast("공식 답변을 등록했어요."); renderPost();
    });
    sh.showModal();
  }

  // ---- 운영정책 (초안 · 법률 검토 전) ----
  function renderPolicy() {
    const sec = (h, items) => `<section><h3>${h}</h3><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul></section>`;
    root.innerHTML = `
      <header class="detail-header"><button class="icon-button" data-back aria-label="닫기">${svg(I.back)}</button><h2>커뮤니티 운영정책</h2></header>
      <div class="detail-body cm-policy">
        <p class="cm-draft">초안 · 법률 검토 전 문서예요. 정식 출시 전 변호사 검토를 받아 확정해요.</p>
        ${sec("1. 목적", ["부모님들이 어린이집 선택과 육아에 필요한 경험을 나누는 공간이에요.", "글의 책임은 작성자에게 있으며, 운영자는 아래 기준에 따라 게시물을 관리해요."])}
        ${sec("2. 올릴 수 없는 글", ["선생님·아이·보호자의 실명, 얼굴 사진, 연락처 등 개인을 알아볼 수 있는 정보", "확인되지 않은 학대·범죄 의혹, 특정인을 지목한 비난", "허위 사실, 욕설·혐오 표현, 광고·홍보", "아동학대가 의심된다면 게시판이 아닌 112 또는 지자체·아동보호전문기관에 신고해 주세요."])}
        ${sec("3. 어린이집 후기 작성 기준", ["직접 이용하며 겪은 사실과 개인적인 의견을 구분해 적어 주세요.", "다른 부모님께 도움이 되는 정보(운영 방식, 소통, 급식, 시설 등) 위주로 적어 주세요.", "어린이집은 후기에 공식 답변을 남길 수 있어요."])}
        ${sec("4. 신고와 임시조치", ["이용자 신고: 누구나 신고할 수 있고, 신고한 글은 신고자 화면에서 바로 숨겨져요.", `권리침해 신고: 글로 권리를 침해당한 당사자(어린이집 포함)나 대리인이 요청하면, 정보통신망법 제44조의2에 따라 최대 ${TAKEDOWN_DAYS}일 동안 글을 가리는 임시조치를 해요.`, "작성자는 임시조치에 이의를 제기할 수 있고, 운영자가 양쪽 의견을 검토해 다시 게시하거나 삭제해요.", "처리 결과는 신고인과 작성자에게 알려요."])}
        ${sec("5. 제재", ["기준을 어긴 글은 삭제되며, 반복되면 글쓰기가 제한될 수 있어요."])}
        ${sec("6. 수사기관 협조", ["법원·수사기관의 적법한 요청이 있으면 관련 법령에 따라 필요한 정보를 제공할 수 있어요."])}
        <p class="src">시행일: 정식 출시일 · 문의: 운영자 이메일(출시 전 확정)</p>
      </div>`;
    root.querySelector("[data-back]").addEventListener("click", () => history.back());
  }

  // ---- 글쓰기 ----
  function renderWrite() {
    root.innerHTML = `
      <header class="detail-header"><button class="icon-button" data-back aria-label="닫기">${svg(I.close)}</button><h2>글쓰기</h2></header>
      <form class="detail-body cm-write" novalidate>
        <fieldset><legend>주제</legend><div class="cm-pick">${CATS.map(([k, l, e]) => `<label class="chip"><input type="radio" name="cat" value="${k}" ${k === (cat !== "all" ? cat : "question") ? "checked" : ""}>${e} ${l}</label>`).join("")}</div></fieldset>
        <label class="field"><span>제목</span><input name="title" maxlength="60" required placeholder="제목을 입력해 주세요"></label>
        <label class="field"><span>내용</span><textarea name="body" rows="8" maxlength="2000" required placeholder="${esc(region())} 부모님들과 나누고 싶은 이야기를 적어 주세요."></textarea></label>
        <label class="field" data-daycare-field><span>관련 어린이집 <small>(선택)</small></span><input name="daycare" maxlength="40" placeholder="예: 새싹어린이집"></label>
        <div class="cm-guide" data-review-guide hidden><b>후기 작성 원칙</b><p>직접 겪은 사실만 적어 주세요. 선생님·아이의 실명, 얼굴 사진, 확인되지 않은 의혹은 올릴 수 없어요. 문제가 있다면 해당 지자체나 아이사랑 상담 창구에 먼저 알려 주세요.</p></div>
        <label class="check"><input type="checkbox" name="agree">개인정보(실명·연락처·사진)와 비방 내용이 없는지 확인했어요.</label>
        <p class="form-error" data-err role="alert" hidden></p>
        <button class="btn primary cm-submit" type="submit" disabled>등록하기</button>
        <p class="note">작성자는 "${esc(nick())}" 닉네임으로 표시돼요. 시제품: 이 기기에만 저장돼요.</p>
      </form>`;
    const f = root.querySelector("form");
    const btn = f.querySelector(".cm-submit");
    const sync = () => {
      f.querySelector("[data-review-guide]").hidden = f.cat.value !== "review";
      f.querySelectorAll(".cm-pick .chip").forEach((c) => c.classList.toggle("on", c.querySelector("input").checked));
      btn.disabled = !(f.title.value.trim() && f.body.value.trim().length >= 5 && f.agree.checked);
    };
    f.addEventListener("input", sync); f.addEventListener("change", sync); sync();
    root.querySelector("[data-back]").addEventListener("click", () => {
      if ((f.title.value || f.body.value) && !confirm("작성 중인 글이 사라져요. 나갈까요?")) return;
      history.back();
    });
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const err = f.querySelector("[data-err]");
      const text = `${f.title.value} ${f.body.value}`;
      if (flagged(text)) { err.hidden = false; err.textContent = "특정인을 지목한 의혹 제기는 올릴 수 없어요. 해당 지자체나 아이사랑 상담 창구에 알려 주세요."; return; }
      const p = { id: "u" + Date.now(), cat: f.cat.value, title: f.title.value.trim(), body: f.body.value.trim(), daycare: f.daycare.value.trim() || undefined, author: nick(), at: Date.now(), likes: 0, views: 0, comments: [], mine: true };
      db.posts.unshift(p); commit();
      cat = "all"; sort = "new";
      history.back();
      setTimeout(() => toast("글을 올렸어요."), 50);
    });
  }

  renderFeed();
  // 탭을 열 때마다 현재 지역 이름으로 다시 그림
  document.querySelector('nav.tabs [data-view="view-community"]')?.addEventListener("click", () => { if (mode === "feed") renderFeed(); });
})();
