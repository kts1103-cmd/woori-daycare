// 같은 어린이집 학부모 모임 (앱개발): 그 어린이집을 재원 인증한 학부모만 보고 쓰는 어린이집별 게시판.
// 시제품: 글·댓글·공감은 이 기기 localStorage("parentroom:v1")에만 저장한다 (다른 학부모와 이어지지 않음).
// 서버 연결 시: 아래 `api` 객체의 함수(전부 Promise 반환)만 서버 호출로 바꾸고, 방 구분 키(room)는 어린이집 코드로 바꾼다.
//   서버에서 꼭 해야 할 것: ① 방 입장 때 서버가 인증 여부를 다시 확인 ② 글 작성 서버 검수(비방·개인정보) ③ 신고 3건 이상 임시조치 + 이의제기 절차 ④ 새 글 알림(푸시)
// 법·운영 원칙(PLAN.md 8.2): 개인 의견이며 앱이 보증하지 않음 · 실명·아이 이름·사진 금지 · 특정 교직원 비방·의혹 차단 · 신고/임시조치
(function () {
  const KEY = "parentroom:v1";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CATS = [["ask", "❓ 질문"], ["info", "💡 정보"], ["talk", "💬 이야기"]];
  const catLabel = (k) => (CATS.find((c) => c[0] === k) || CATS[2])[1];
  const REASONS = ["특정인 비방·명예훼손", "개인정보 노출(실명·연락처·사진 등)", "허위 사실", "광고·홍보", "욕설·혐오 표현", "기타"];
  const BLIND_AT = 3; // 신고 3건이면 임시로 가린다 (서버에서는 운영자 검토 + 이의제기로 연결)

  // ---- 저장소 (서버가 생기면 이 객체만 교체) ----
  const raw = () => { try { return Object.assign({ posts: [], liked: [], reported: [] }, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return { posts: [], liked: [], reported: [] }; } };
  const put = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const api = {
    list: async (room) => { const v = raw(); return { posts: v.posts.filter((p) => p.room === room && !v.reported.includes(p.id)), liked: v.liked }; },
    create: async (room, post) => { const v = raw(); const p = { id: uid(), room, at: Date.now(), likes: 0, reports: 0, comments: [], ...post }; v.posts.unshift(p); put(v); return p; },
    comment: async (id, c) => { const v = raw(); const p = v.posts.find((x) => x.id === id); if (!p) return; p.comments.push({ id: uid(), at: Date.now(), ...c }); put(v); },
    like: async (id) => { const v = raw(), p = v.posts.find((x) => x.id === id); if (!p) return; const i = v.liked.indexOf(id); if (i >= 0) { v.liked.splice(i, 1); p.likes = Math.max(0, p.likes - 1); } else { v.liked.push(id); p.likes += 1; } put(v); },
    report: async (id, reason) => { const v = raw(), p = v.posts.find((x) => x.id === id); if (!p) return; p.reports = (p.reports || 0) + 1; p.lastReason = reason; v.reported.push(id); put(v); }, // 신고한 사람 화면에서는 바로 숨김
    remove: async (id) => { const v = raw(); v.posts = v.posts.filter((p) => p.id !== id); put(v); },
  };

  // ---- 글 검사: 확실한 것만 막는다 (비방·개인정보). 애매하면 신고·운영자 검토로 ----
  const PHONE = /(01[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}/;
  const SSN = /\d{6}[-\s]?[1-4]\d{6}/;
  const TITLE = "(선생님|교사|원장)", HARM = "(때리|때렸|때려|폭행|학대|방치|폭언|체벌)", NAME = "[가-힣OＯ○*]{2,4}[ ]*"; // 이름 자리에 OO·○○·**로 가린 것도 이름으로 본다
  // 교직원 호칭(앞이나 뒤에 이름이 붙은 경우) + 폭행·학대 같은 말이 함께 나오면 막는다
  const ABUSE = new RegExp(`(${NAME}${TITLE}|${TITLE}[ ]*${NAME}).*${HARM}|${HARM}.*(${NAME}${TITLE}|${TITLE}[ ]*${NAME})`);
  function check(text) {
    if (PHONE.test(text) || SSN.test(text)) return "전화번호·주민번호 같은 개인정보는 올릴 수 없어요.";
    if (ABUSE.test(text)) return "특정 교직원에 대한 비방·의혹은 올릴 수 없어요. 불편이 있다면 아이사랑 불편신고를 이용해 주세요.";
    if (/https?:\/\/|www\./i.test(text)) return "링크는 올릴 수 없어요.";
    return "";
  }

  const ago = (t) => { const m = Math.floor((Date.now() - t) / 60000); if (m < 1) return "방금"; if (m < 60) return `${m}분 전`; const h = Math.floor(m / 60); if (h < 24) return `${h}시간 전`; return new Date(t).toLocaleDateString("ko-KR"); };
  const svg = (d) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const nick = () => { const a = window.ACCOUNT && ACCOUNT.get(); return (a && a.nick) || "학부모"; };

  let root = null, room = null, cat = "all", openId = null, busy = false;
  const css = () => {
    if ($("prCss")) return;
    const s = document.createElement("style"); s.id = "prCss";
    s.textContent = `#parentroom .pr-body{padding:16px 20px 28px;display:grid;gap:12px}#parentroom .pr-rule{margin:0;padding:12px 14px;border-radius:var(--r12,12px);background:var(--warn-soft);color:var(--warn);font-size:13px;line-height:1.55}
#parentroom .pr-chips{display:flex;gap:8px;flex-wrap:wrap}#parentroom .pr-chips button{min-height:40px;padding:0 14px;border:1px solid var(--line);border-radius:99px;background:var(--surface);color:var(--text);font:inherit;font-size:14px;cursor:pointer}#parentroom .pr-chips button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
#parentroom .pr-post{padding:14px;border:1px solid var(--line);border-radius:var(--r16,16px);background:var(--surface);display:grid;gap:8px;text-align:left}#parentroom .pr-top{display:flex;gap:8px;align-items:center;color:var(--muted);font-size:12px}#parentroom .pr-top b{color:var(--text);font-size:13px}
#parentroom .pr-text{margin:0;font-size:15px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}#parentroom .pr-acts{display:flex;gap:6px;flex-wrap:wrap}#parentroom .pr-acts button{min-height:40px;padding:0 12px;border:0;border-radius:99px;background:var(--accent-subtle);color:var(--accent-strong);font:inherit;font-size:13px;cursor:pointer}
#parentroom .pr-blind{padding:14px;border:1px dashed var(--line);border-radius:var(--r16,16px);color:var(--muted);font-size:13px}#parentroom .pr-cm{margin:0;padding:8px 10px;border-radius:var(--r12,12px);background:var(--accent-subtle);font-size:14px;line-height:1.5;overflow-wrap:anywhere}#parentroom .pr-cm small{display:block;color:var(--muted);font-size:12px}
#parentroom textarea,#parentroom input[type=text]{width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--line);border-radius:var(--r12,12px);background:var(--surface);color:var(--text);font:inherit;font-size:16px}#parentroom textarea{min-height:110px;resize:vertical}
#parentroom .pr-go{min-height:52px;border:0;border-radius:var(--r16,16px);background:var(--accent);color:#fff;font-family:var(--font-cute,inherit);font-size:17px;cursor:pointer}#parentroom .pr-go:disabled{background:var(--line);color:var(--muted)}#parentroom .pr-err{margin:0;color:var(--danger);font-size:13px}#parentroom .pr-empty{padding:28px 12px;text-align:center;color:var(--muted);font-size:14px;line-height:1.6}`;
    document.head.appendChild(s);
  };
  const header = (t, back) => `<header class="detail-header"><button class="icon-button" data-close aria-label="${back ? "목록으로" : "닫기"}">${svg('<path d="m15 5-7 7 7 7"/>')}</button><h2>${esc(t)}</h2></header>`;
  const RULES = `<p class="pr-rule">개인 의견이며 앱이 보증하지 않아요. 실명·아이 이름·사진·연락처는 올리지 마세요. 특정 교직원 비방·의혹은 올릴 수 없고, 신고가 쌓이면 임시로 가려져요. 시제품에서는 글이 이 기기 안에서만 보여요.</p>`;

  function ensure() {
    css();
    if (!root) { root = document.createElement("div"); root.id = "parentroom"; root.className = "mypage"; root.hidden = true; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "학부모 모임"); document.body.appendChild(root); }
    return root;
  }
  const verified = () => !!(window.ACCOUNT && room && ACCOUNT.verifiedFor(room.key)); // 서버에서는 서버가 확인

  async function renderFeed() {
    openId = null;
    if (!verified()) { root.innerHTML = `${header(room.name)}<div class="pr-body"><p class="pr-empty">재원 인증을 한 학부모만 들어올 수 있어요.</p></div>`; bind(); return; }
    const { posts, liked } = await api.list(room.key);
    const list = posts.filter((p) => cat === "all" || p.cat === cat);
    root.innerHTML = `${header(`${room.name} 학부모 모임`)}<div class="pr-body">${RULES}
      <div class="pr-chips" role="group" aria-label="글 종류">${[["all", "전체"], ...CATS].map(([k, l]) => `<button type="button" data-cat="${k}" aria-pressed="${cat === k}">${l}</button>`).join("")}</div>
      <button type="button" class="pr-go" data-write>글쓰기</button>
      ${list.length ? list.map((p) => card(p, liked)).join("") : `<p class="pr-empty">아직 글이 없어요.<br>첫 글을 남겨 보세요. 같은 어린이집을 인증한 학부모만 볼 수 있어요.</p>`}
      <p class="src">이 어린이집을 재원 인증한 학부모끼리의 모임이에요. 글은 개인 의견이며 앱이 보증하지 않아요.</p></div>`;
    bind();
  }
  const blinded = (p) => (p.reports || 0) >= BLIND_AT;
  function card(p, liked) {
    if (blinded(p)) return `<div class="pr-blind">신고가 접수되어 운영자 확인 전까지 임시로 가려진 글이에요.</div>`;
    return `<article class="pr-post"><div class="pr-top"><b>${esc(p.nick)}</b><span>${catLabel(p.cat)}</span><span>${ago(p.at)}</span></div>
      <p class="pr-text">${esc(p.body)}</p>
      <div class="pr-acts"><button type="button" data-like="${p.id}" aria-pressed="${liked.includes(p.id)}">${liked.includes(p.id) ? "♥" : "♡"} 공감 ${p.likes || 0}</button><button type="button" data-open="${p.id}">💬 댓글 ${p.comments.length}</button>${p.mine ? `<button type="button" data-del="${p.id}">삭제</button>` : `<button type="button" data-report="${p.id}">신고</button>`}</div></article>`;
  }
  async function renderPost(id) {
    openId = id; const { posts, liked } = await api.list(room.key); const p = posts.find((x) => x.id === id);
    if (!p) return renderFeed();
    root.innerHTML = `${header("글 보기", true)}<div class="pr-body">${card(p, liked)}
      ${p.comments.map((c) => `<p class="pr-cm"><small>${esc(c.nick)} · ${ago(c.at)}</small>${esc(c.body)}</p>`).join("")}
      <form data-cform novalidate><textarea name="c" maxlength="300" placeholder="댓글을 남겨요 (300자까지)" aria-label="댓글"></textarea><p class="pr-err" data-err hidden></p><button type="submit" class="pr-go" style="margin-top:8px;width:100%">댓글 달기</button></form></div>`;
    bind();
    root.querySelector("[data-cform]").addEventListener("submit", async (e) => {
      e.preventDefault(); const t = e.target.c.value.trim(), err = root.querySelector("[data-err]");
      const bad = t.length < 1 ? "내용을 적어 주세요." : check(t);
      if (bad) { err.textContent = bad; err.hidden = false; return; }
      await api.comment(id, { nick: nick(), body: t }); renderPost(id);
    });
  }
  function renderWrite() {
    root.innerHTML = `${header("글쓰기", true)}<form class="pr-body" data-wform novalidate>${RULES}
      <div class="pr-chips" role="radiogroup" aria-label="글 종류">${CATS.map(([k, l], i) => `<button type="button" role="radio" data-wcat="${k}" aria-checked="${i === 0}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div>
      <textarea name="b" maxlength="500" placeholder="같은 어린이집 학부모에게 묻거나 나누고 싶은 이야기를 적어요 (500자까지)" aria-label="내용"></textarea>
      <p class="pr-err" data-err hidden></p><button type="submit" class="pr-go" disabled>올리기</button></form>`;
    bind();
    let wc = "ask"; const f = root.querySelector("form"), btn = f.querySelector(".pr-go");
    f.querySelectorAll("[data-wcat]").forEach((b) => b.addEventListener("click", () => { wc = b.dataset.wcat; f.querySelectorAll("[data-wcat]").forEach((x) => { x.setAttribute("aria-checked", x === b); x.setAttribute("aria-pressed", x === b); }); }));
    f.b.addEventListener("input", () => { btn.disabled = f.b.value.trim().length < 5; });
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); if (busy) return; const t = f.b.value.trim(), err = f.querySelector("[data-err]");
      const bad = check(t); if (bad) { err.textContent = bad; err.hidden = false; return; }
      busy = true; try { await api.create(room.key, { nick: nick(), cat: wc, body: t, mine: true }); } finally { busy = false; }
      history.back(); // 글쓰기 화면 → 목록
    });
    f.b.focus();
  }
  function reportSheet(id) {
    const sh = $("sheet"); if (!sh) return;
    sh.innerHTML = `<form method="dialog" class="sheet-form"><h3>신고하기</h3><p class="sheet-copy">이유를 골라 주세요. 신고한 글은 내 화면에서 바로 숨겨져요.</p>
      <div class="sheet-options">${REASONS.map((r, i) => `<label class="check"><input type="radio" name="r" value="${esc(r)}" ${i ? "" : "checked"}>${esc(r)}</label>`).join("")}</div>
      <div class="sheet-actions"><button class="btn" value="cancel">취소</button><button class="btn primary" value="ok">신고</button></div></form>`;
    sh.querySelector("form").addEventListener("submit", async (e) => { const ok = e.submitter && e.submitter.value === "ok"; if (ok) { await api.report(id, sh.querySelector("input:checked").value); renderFeed(); } });
    if (sh.showModal) sh.showModal();
  }
  function bind() {
    root.querySelector("[data-close]")?.addEventListener("click", () => history.back());
    root.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => { cat = b.dataset.cat; renderFeed(); }));
    root.querySelector("[data-write]")?.addEventListener("click", () => { history.pushState({ proom: "write" }, "", "#room"); renderWrite(); });
    root.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => { history.pushState({ proom: "post" }, "", "#room"); renderPost(b.dataset.open); }));
    root.querySelectorAll("[data-like]").forEach((b) => b.addEventListener("click", async () => { await api.like(b.dataset.like); openId ? renderPost(openId) : renderFeed(); }));
    root.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => { if (confirm("이 글을 삭제할까요?")) { await api.remove(b.dataset.del); history.state && history.state.proom ? history.back() : renderFeed(); } }));
    root.querySelectorAll("[data-report]").forEach((b) => b.addEventListener("click", () => reportSheet(b.dataset.report)));
  }

  function open(r) {
    ensure(); room = r; cat = "all";
    root.hidden = false; document.body.classList.add("my-mode");
    history.pushState({ proom: "feed" }, "", "#room"); renderFeed();
  }
  function hide() { if (!root || root.hidden) return; root.hidden = true; if (!document.querySelector(".mypage:not([hidden])")) document.body.classList.remove("my-mode"); }
  // 뒤로가기: 글쓰기·글 보기 → 목록 → 닫기
  window.addEventListener("popstate", () => {
    if (!root || root.hidden) return;
    if (document.querySelector("#account:not([hidden])")) return;
    const st = history.state;
    if (st && st.proom === "feed") renderFeed(); else hide();
  });
  if (location.hash === "#room") history.replaceState(null, "", location.pathname + location.search);
  window.PARENTROOM = { open };
})();
