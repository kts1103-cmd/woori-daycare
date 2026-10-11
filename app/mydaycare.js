// 나의 어린이집 탭 (앱개발): 다니는(다닐) 어린이집을 하나 등록하면 매일 볼 것을 모아 보여준다.
// - 오늘: 식단·공지(서울시 보육포털 / 정보공개포털 공시 링크 — 내용은 가져오지 않음), 대기질 링크, 지금 할 일·새 알림
// - 급할 때 맡길 곳: 서울시 특화 보육(365열린·거점형 야간·주말·휴일) 어린이집을 가까운 순으로 (서울만)
// - 일정·준비물 메모: 어린이집 행사·준비물을 직접 적어 두면 하루 전·당일 알림(notify.js)
// - 학부모 모임: 이 어린이집을 재원 인증한 학부모만 들어가는 게시판 (parentroom.js)
// 저장: my:v1.mine = {key, sido, name, type, area}, mine:v1.events = [{id, date, title, items, done}] (이 기기에만)
(function () {
  const KEY = "my:v1";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const read = () => { try { return Object.assign({ favs: [], recent: [], child: null }, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return { favs: [], recent: [], child: null }; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} window.dispatchEvent(new Event("my:changed")); };
  const km = (m) => (m == null ? "" : m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`);
  const LINK = { info: "https://info.childcare.go.kr/info_html5/pnis/search/NurseryNameSlL.jsp", isarang: "https://www.childcare.go.kr/", hourly: "https://www.childcare.go.kr/?menuno=242", iseoulSvc: "https://iseoul.seoul.go.kr/portal/reservation/guide.do" };
  const view = () => $("view-mine");
  let picking = false, nearCache = null;

  // ---- 광고 1개 ("급할 때 맡길 곳" 위). 광고임을 항상 표시(표시·광고법). 실제 광고는 window.MINE_ADS = [{brand,title,body,url}]로 채우고, 없으면 자리표시.
  // 커뮤니티 광고(community.js)와 같은 모양(.cm-ad)을 쓴다. 지역·어린이집 정보로 타기팅하지 않는다(개인정보 최소).
  const ADS = [{ brand: "광고 자리", title: "여기에 광고가 들어가요", body: "나의 어린이집 화면에 하나만 보여요. 시제품 자리표시예요.", url: "" }];
  function adHTML() {
    const list = Array.isArray(window.MINE_ADS) && window.MINE_ADS.length ? window.MINE_ADS : ADS;
    const a = list[Math.floor(Date.now() / 864e5) % list.length]; // 하루에 하나씩 돌아가며
    const ok = /^https?:\/\//i.test(a.url || "");
    const inner = `<span class="cm-ad-tag">광고</span><span class="cm-ad-brand">${esc(a.brand || "")}</span><b class="cm-ad-title">${esc(a.title)}</b><span class="cm-ad-body">${esc(a.body || "")}</span>`;
    return ok ? `<a class="cm-ad mine-ad" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer sponsored" aria-label="광고: ${esc(a.title)}">${inner}</a>` : `<div class="cm-ad mine-ad" role="note" aria-label="광고: ${esc(a.title)}">${inner}</div>`;
  }

  // ---- 일정·준비물 메모 (서버가 생기면 이 두 함수만 바꾼다) ----
  const NOTE_KEY = "mine:v1";
  const loadNotes = () => { try { return (JSON.parse(localStorage.getItem(NOTE_KEY) || "{}").events) || []; } catch { return []; } };
  const saveNotes = (events) => { try { localStorage.setItem(NOTE_KEY, JSON.stringify({ events })); } catch {} window.dispatchEvent(new Event("my:changed")); };
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const dday = (date) => { const [y, m, d] = date.split("-").map(Number), t = new Date(); const diff = Math.round((new Date(y, m - 1, d) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5); return diff === 0 ? "오늘" : diff === 1 ? "내일" : diff > 0 ? `D-${diff}` : `${-diff}일 지남`; };
  const dateKo = (date) => { const [, m, d] = date.split("-").map(Number); return `${m}월 ${d}일`; };
  function notesHTML() {
    const list = loadNotes().filter((e) => !e.done).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
    return `<h3 class="mine-h">일정·준비물 메모</h3>
      <div class="mine-list">${list.length ? list.map((e) => `<div class="mine-note-row"><label><input type="checkbox" data-done="${esc(e.id)}" aria-label="${esc(e.title)} 완료"><span><b>${esc(e.title)}</b><small>${dateKo(e.date)} · ${dday(e.date)}${e.items ? ` · 준비물: ${esc(e.items)}` : ""}</small></span></label><button type="button" class="mine-x" data-rm="${esc(e.id)}" aria-label="${esc(e.title)} 삭제">✕</button></div>`).join("") : `<p class="mine-lead">어린이집 행사·준비물을 적어 두면 하루 전과 당일에 알림으로 알려드려요.</p>`}</div>
      <details class="mine-add"><summary>＋ 일정 추가</summary>
        <form data-nform novalidate><label>날짜<input type="date" name="date" required value="${todayStr()}" min="${todayStr()}"></label>
          <label>무슨 일정인가요?<input type="text" name="title" maxlength="30" placeholder="예: 가을 소풍, 학부모 상담" required></label>
          <label>준비물 <small>(선택)</small><input type="text" name="items" maxlength="60" placeholder="예: 도시락, 여벌옷"></label>
          <p class="mine-note">이 기기에만 저장돼요. 아이 이름 같은 개인정보는 적지 않아도 돼요.</p>
          <button type="submit" class="btn primary" disabled>추가</button></form></details>`;
  }
  function bindNotes(el) {
    el.querySelectorAll("[data-done]").forEach((c) => c.addEventListener("change", () => { saveNotes(loadNotes().map((e) => (e.id === c.dataset.done ? { ...e, done: true } : e))); render(); }));
    el.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { saveNotes(loadNotes().filter((e) => e.id !== b.dataset.rm)); render(); }));
    const f = el.querySelector("[data-nform]"); if (!f) return;
    const btn = f.querySelector("button"), sync = () => { btn.disabled = !(f.date.value && f.title.value.trim()); };
    f.addEventListener("input", sync);
    f.addEventListener("submit", (e) => {
      e.preventDefault(); if (btn.disabled) return;
      const all = loadNotes(); if (all.length >= 50) return;
      all.push({ id: Date.now().toString(36), date: f.date.value, title: f.title.value.trim(), items: f.items.value.trim(), done: false });
      saveNotes(all); render();
    });
  }
  // ---- 학부모 모임 입구 ----
  function roomHTML(m, d) {
    const ok = !!(window.ACCOUNT && ACCOUNT.verifiedFor(m.key)), pend = !!(window.ACCOUNT && ACCOUNT.pendingFor && ACCOUNT.pendingFor(m.key));
    return `<h3 class="mine-h">학부모 모임</h3>` + (ok
      ? `<button type="button" class="mine-item" data-room><span class="mi-ic" aria-hidden="true">👥</span><span><b>${esc(d.name)} 학부모 모임</b><small>같은 어린이집을 재원 인증한 학부모끼리 묻고 나눠요</small></span><span aria-hidden="true">›</span></button>`
      : `<div class="mine-item locked"><span class="mi-ic" aria-hidden="true">🔒</span><span><b>재원 인증을 하면 들어갈 수 있어요</b><small>${pend ? "인증을 확인하고 있어요. 확인이 끝나면 열려요." : "이 어린이집을 다니는 학부모만 같은 모임에 들어올 수 있어요."}</small></span></div>${pend ? "" : `<button type="button" class="btn primary" data-verify>이 어린이집 재원 인증하기</button>`}`)
      + `<p class="mine-note">시제품에서는 글이 이 기기 안에서만 보여요. 서버가 연결되면 같은 어린이집 학부모들과 이어져요.</p>`;
  }


  function setMine(s) {
    const v = read(); v.mine = s ? { key: s.key, sido: s.sido, name: s.name, type: s.type, area: s.area } : null; write(v);
    picking = false; nearCache = null; render();
  }

  function pickHTML(v) {
    const acc = window.ACCOUNT && ACCOUNT.get();
    const cands = [...((acc && acc.verifications) || []).filter((x) => x.state !== "pending").map((x) => ({ ...x, why: "학부모 인증" })), ...v.favs.slice(0, 4).map((x) => ({ ...x, why: "관심" }))]
      .filter((x, i, a) => a.findIndex((y) => y.key === x.key) === i).slice(0, 5);
    return `<section class="mine-pick">
        <h2>${v.mine ? "나의 어린이집 바꾸기" : "다니는 어린이집을 등록해요"}</h2>
        <p class="mine-lead">등록하면 매일 볼 식단·공지 바로가기와 우리 아이 할 일을 한곳에 모아 드려요. 서울이면 급할 때 맡길 곳도 보여드려요. 이 기기에만 저장돼요.</p>
        ${cands.length ? `<div class="mine-cands">${cands.map((c, i) => `<button type="button" class="my-dc" data-cand="${i}"><span><b>${esc(c.name)}</b><small>${esc(c.area || "")} · ${c.why}</small></span></button>`).join("")}</div>` : ""}
        <label class="search-field"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg><input id="mineQ" autocomplete="off" placeholder="어린이집 이름으로 찾기"></label>
        <div class="mine-results" id="mineResults"></div>
        ${v.mine ? `<button type="button" class="btn" data-cancel>취소</button>` : ""}
      </section>`;
  }
  function bindPick(v) {
    const acc = window.ACCOUNT && ACCOUNT.get();
    const cands = [...((acc && acc.verifications) || []).filter((x) => x.state !== "pending"), ...v.favs.slice(0, 4)].filter((x, i, a) => a.findIndex((y) => y.key === x.key) === i).slice(0, 5);
    view().querySelectorAll("[data-cand]").forEach((b) => b.addEventListener("click", () => setMine(cands[+b.dataset.cand])));
    view().querySelector("[data-cancel]")?.addEventListener("click", () => { picking = false; render(); });
    const q = $("mineQ"), box = $("mineResults"); let t;
    q.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const list = window.APP && APP.search ? APP.search(q.value, 8) : [];
        box.innerHTML = q.value.trim().length < 2 ? `<p class="note">두 글자 이상 입력해 주세요.</p>`
          : list.length ? list.map((s, i) => `<button type="button" class="my-dc" data-i="${i}"><span><b>${esc(s.name)}</b><small>${esc(s.area)} · ${esc(s.type)}</small></span></button>`).join("")
          : `<p class="note">찾는 어린이집이 없어요. 어린이집 찾기 탭의 지역이 '전국'이거나 그 지역인지 확인해 주세요.</p>`;
        box.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => setMine(list[+b.dataset.i])));
      }, 150);
    });
  }

  async function render() {
    const el = view(); if (!el) return;
    const v = read();
    if (!v.mine || picking) { el.innerHTML = `<div class="section mine">${pickHTML(v)}</div>`; bindPick(v); return; }
    const m = v.mine;
    el.innerHTML = `<div class="section mine"><p class="mine-lead">불러오는 중…</p></div>`;
    let d = null;
    try { d = await APP.snapByKey(m.sido, m.key); } catch {}
    if (!d) { el.innerHTML = `<div class="section mine"><p class="mine-lead">${esc(m.name)} 정보를 찾지 못했어요. 폐원했거나 이름이 바뀌었을 수 있어요.</p><button type="button" class="btn" data-change>다른 어린이집 등록</button></div>`; el.querySelector("[data-change]").addEventListener("click", () => { picking = true; render(); }); return; }
    const seoul = m.sido === "서울특별시";
    const todo = window.NOTIFY ? NOTIFY.unread() : 0;
    const childTodo = v.child && window.TIMELINE ? true : false;
    el.innerHTML = `<div class="section mine">
      <section class="mine-card">
        <span class="mine-badge">나의 어린이집</span>
        <h2>${esc(d.name)}</h2>
        <p class="mine-sub">${esc(d.type)} · ${esc(d.area)}${d.capacity ? ` · 정원 ${d.capacity}명` : ""}</p>
        <div class="mine-actions">
          ${d.tel ? `<a class="btn" href="tel:${esc(String(d.tel).replace(/[^0-9+]/g, ""))}">📞 전화</a>` : ""}
          <button type="button" class="btn" data-detail>상세 보기</button>
          <button type="button" class="btn" data-change>바꾸기</button>
        </div>
      </section>

      ${roomHTML(m, d)}

      <h3 class="mine-h">오늘 챙겨 볼 것</h3>
      <div class="mine-list">
        ${seoul ? `<a class="mine-item" href="${esc(d.iseoul)}" target="_blank" rel="noopener"><span class="mi-ic" aria-hidden="true">🍱</span><span><b>오늘 식단·공지 보기</b><small>어린이집이 서울시 보육포털에 올린 식단표·공지·가정통신문으로 연결해요</small></span><span aria-hidden="true">↗</span></a>`
          : ""}
        ${childTodo ? `<button type="button" class="mine-item" data-todo><span class="mi-ic" aria-hidden="true">📋</span><span><b>우리 아이 지금 할 일</b><small>입소 타임라인에서 이번 달 할 일을 확인해요</small></span><span aria-hidden="true">›</span></button>` : ""}
        <button type="button" class="mine-item" data-alerts><span class="mi-ic" aria-hidden="true">🔔</span><span><b>알림${todo ? ` <em>${todo}개 새로 왔어요</em>` : ""}</b><small>입소 일정·관심 어린이집 변화</small></span><span aria-hidden="true">›</span></button>
      </div>

      ${notesHTML()}

      ${adHTML()}

      ${seoul ? `<h3 class="mine-h">급할 때 맡길 곳</h3>
      <div id="mineNear"><p class="mine-lead">가까운 곳을 찾는 중…</p></div>` : `<h3 class="mine-h">급할 때 맡길 곳</h3>
      <p class="mine-lead">서울시 특화 보육 정보는 서울만 있어요. 다른 지역은 아이사랑 웹이나 앱에서 시간제 보육을 신청할 수 있어요.</p>
      <a class="mine-item" href="${LINK.hourly}" target="_blank" rel="noopener"><span class="mi-ic" aria-hidden="true">⏱️</span><span><b>아이사랑 시간제 보육 신청</b><small>필요한 시간만 맡기는 시간제 보육은 아이사랑 웹이나 앱에서 신청해요. 휴대폰에서는 웹·앱을 골라 열 수 있어요. 지역·기관마다 조건이 달라요.</small></span><span aria-hidden="true">↗</span></a>`}

      <p class="src-line">출처: 어린이집정보공개포털(한국사회보장정보원)${seoul ? ` · 서울시 특화 보육: 서울 열린데이터광장(공공누리 1유형) · 기준일 <span id="mineBasis"></span>` : ""}</p>
      ${seoul ? `<p class="src">이용 조건은 서울시 보육포털 안내 기준(2026.10)이에요. 예약 전 보육포털에서 다시 확인하세요.</p>` : ""}
    </div>`;
    el.querySelector("[data-change]").addEventListener("click", () => { picking = true; render(); });
    el.querySelector("[data-detail]").addEventListener("click", () => APP.openByKey(m.sido, m.key));
    el.querySelector("[data-todo]")?.addEventListener("click", () => TIMELINE.open());
    el.querySelector("[data-alerts]").addEventListener("click", () => NOTIFY && NOTIFY.open());
    bindNotes(el);
    el.querySelector("[data-room]")?.addEventListener("click", () => window.PARENTROOM && PARENTROOM.open({ key: m.key, sido: m.sido, name: d.name }));
    el.querySelector("[data-verify]")?.addEventListener("click", () => window.ACCOUNT && ACCOUNT.openVerify({ key: m.key, sido: m.sido, name: d.name, area: d.area }, { onDone: () => render() }));
    if (seoul) renderNear(d);
  }

  async function renderNear(d) {
    const box = $("mineNear"); if (!box) return;
    if (!d.lat || !d.lng) { box.innerHTML = `<p class="mine-lead">위치 정보가 없어 가까운 곳을 찾지 못했어요.</p>`; return; }
    let list = nearCache;
    try { if (!list) list = nearCache = await APP.seoulSvcNear(d.lat, d.lng, 8); } catch { list = []; }
    const basis = $("mineBasis"); if (basis) basis.textContent = APP.seoulSvcBasis() || "-";
    const S = APP.SEOUL_SVC || {};
    if (!list.length) { box.innerHTML = `<p class="mine-lead">서울시 특화 보육 정보를 불러오지 못했어요.</p><a class="mine-item" href="${LINK.iseoulSvc}" target="_blank" rel="noopener"><span class="mi-ic">🔎</span><span><b>서울시 보육포털에서 찾기</b></span><span aria-hidden="true">↗</span></a>`; return; }
    box.innerHTML = `
      <div class="mine-kinds">${Object.entries(S).map(([k, s]) => `<details class="mine-kind"><summary><span aria-hidden="true">${s.ic}</span> ${s.label}</summary>
        <dl><dt>운영</dt><dd>${esc(s.when)}</dd><dt>요금</dt><dd>${esc(s.fee)}</dd><dt>신청</dt><dd>${esc(s.how)}</dd></dl>
        <a href="${s.url}" target="_blank" rel="noopener">보육포털에서 예약·안내 ↗</a></details>`).join("")}</div>
      <p class="mine-note">당일 취소·노쇼가 4회 쌓이면 그달 예약이 막혀요 (서울시 보육포털 안내).</p>
      <div class="mine-list">${list.map((x) => `<div class="mine-near">
        <span><b>${esc(x.name)}</b><small>${km(x.dist)} · ${x.kinds.map((k) => `${S[k]?.ic || ""} ${S[k]?.label || k}`).join(" · ")}</small></span>
        <span class="mine-near-act">${x.tel ? `<a class="btn" href="tel:${esc(String(x.tel).replace(/[^0-9+]/g, ""))}" aria-label="${esc(x.name)} 전화">📞</a>` : ""}<a class="btn" href="${esc(S[x.kinds[0]]?.url || x.iseoul)}" target="_blank" rel="noopener">예약</a></span></div>`).join("")}</div>
      <p class="mine-note">나의 어린이집에서 가까운 순(직선거리, 계산)이에요.</p>`;
    // 하나를 열면 나머지는 접는다
    const kinds = box.querySelectorAll("details.mine-kind");
    kinds.forEach((el) => el.addEventListener("toggle", () => { if (el.open) kinds.forEach((o) => { if (o !== el) o.open = false; }); }));
  }

  function css() {
    if ($("mineCss")) return;
    const s = document.createElement("style"); s.id = "mineCss";
    s.textContent = `#view-mine .mine{padding:16px 20px 24px;display:grid;gap:12px}#view-mine h2{margin:0;font-family:var(--font-cute,inherit);font-weight:400;font-size:22px;color:var(--text)}
#view-mine .mine-lead,#view-mine .mine-note{margin:0;color:var(--muted);font-size:13px;line-height:1.55}#view-mine .mine-cands,#view-mine .mine-results,#view-mine .mine-list{display:grid;gap:8px}
#view-mine .mine-pick{display:grid;gap:12px}#view-mine .mine-card{padding:18px;border-radius:var(--r20,20px);background:var(--accent-subtle);border:1px solid var(--accent-soft);display:grid;gap:6px}
#view-mine .mine-badge{justify-self:start;padding:2px 10px;border-radius:99px;background:var(--accent);color:#fff;font-size:12px}#view-mine .mine-sub{margin:0;color:var(--muted);font-size:13px}
#view-mine .mine-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}#view-mine .mine-actions .btn{min-height:44px}#view-mine .mine-h{margin:8px 0 0;font-family:var(--font-cute,inherit);font-weight:400;font-size:18px}
#view-mine .mine-note-row{display:flex;align-items:center;gap:6px;padding:8px 12px;border:1px solid var(--line);border-radius:var(--r12,12px);background:var(--surface)}#view-mine .mine-note-row label{flex:1;min-width:0;display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer}#view-mine .mine-note-row b{display:block;font-size:15px;overflow-wrap:anywhere}#view-mine .mine-note-row small{color:var(--muted);font-size:12px;line-height:1.4}#view-mine .mine-note-row input[type=checkbox]{width:22px;height:22px;flex:none}
#view-mine .mine-x{min-width:44px;min-height:44px;border:0;background:none;color:var(--muted);font-size:16px;cursor:pointer}#view-mine .mine-add{border:1px solid var(--line);border-radius:var(--r12,12px);background:var(--surface);padding:0 12px}#view-mine .mine-add summary{min-height:48px;display:flex;align-items:center;cursor:pointer;color:var(--accent-strong);font-weight:700}
#view-mine .mine-add form{display:grid;gap:10px;padding:4px 0 14px}#view-mine .mine-add label{display:grid;gap:4px;font-size:14px}#view-mine .mine-add input{min-height:48px;padding:0 12px;border:1px solid var(--line);border-radius:var(--r12,12px);background:var(--bg);color:var(--text);font:inherit;font-size:16px}#view-mine .mine-item.locked{background:var(--accent-subtle);cursor:default}
#view-mine .mine-item{display:flex;align-items:center;gap:12px;min-height:56px;padding:12px 14px;border:1px solid var(--line);border-radius:var(--r16,16px);background:var(--surface);color:var(--text);text-decoration:none;text-align:left;font:inherit;cursor:pointer;width:100%}
#view-mine .mine-item b{display:block;font-size:15px}#view-mine .mine-item em{font-style:normal;color:var(--danger);font-size:13px}#view-mine .mine-item small{display:block;color:var(--muted);font-size:12px;line-height:1.45}#view-mine .mine-item>span:nth-child(2){flex:1;min-width:0}
#view-mine .mi-ic{font-size:22px}#view-mine .mine-kinds{display:grid;grid-template-columns:1fr 1fr;gap:8px}#view-mine .mine-kind{padding:10px 12px;border:1px solid var(--line);border-radius:var(--r12,12px);background:var(--surface);font-size:13px}
#view-mine .mine-kind summary{cursor:pointer;min-height:28px;font-weight:700}#view-mine .mine-kind dl{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;margin:8px 0}#view-mine .mine-kind dt{color:var(--muted)}#view-mine .mine-kind dd{margin:0}
#view-mine .mine-kind[open]{grid-column:1/-1}#view-mine .mine-near{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:var(--r12,12px);background:var(--surface)}#view-mine .mine-near>span:first-child{flex:1;min-width:0}
#view-mine .mine-near b{display:block;font-size:14px;overflow-wrap:anywhere}#view-mine .mine-near small{color:var(--muted);font-size:12px}#view-mine .mine-near-act{display:flex;gap:6px}#view-mine .mine-near-act .btn{min-width:44px;min-height:44px;display:inline-grid;place-items:center}`;
    document.head.appendChild(s);
  }

  window.MYDAYCARE = { render, set: setMine };
  const start = () => {
    css();
    document.querySelector('nav.tabs [data-view="view-mine"]')?.addEventListener("click", () => render());
    window.addEventListener("my:changed", () => { if (view()?.classList.contains("active") && !picking) render(); });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
