// 알림 센터 + 규칙 엔진 (앱개발). 모든 계산은 이 기기 안에서만 하고 서버로 보내지 않는다.
// 종류: schedule(입소·지원 일정, 공식 안내 날짜만) · capacity(정원 여유) · wait(등록대기, 데이터 생기면) · activity(서버 필요, 준비 중)
// 저장: localStorage "notify:v1" {read:{id:ts}, seen:{id:ts}, events:[], favBase:{key:{left,wait}}, lastFav:"YYYYMMDD"}
(function () {
  const KEY = "notify:v1";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const EMPTY = () => ({ read: {}, seen: {}, events: [], favBase: {}, lastFav: "", mineBase: null, lastMine: "" });
  const load = () => { try { return Object.assign(EMPTY(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return EMPTY(); } };
  const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
  const my = () => { try { return Object.assign({ favs: [], child: null, tasks: {} }, JSON.parse(localStorage.getItem("my:v1") || "{}")); } catch { return { favs: [], child: null, tasks: {} }; } };
  const cfg = () => (window.APP_SETTINGS ? APP_SETTINGS.get() : {});
  const ON = { schedule: "notifySchedule", capacity: "notifyCapacity", wait: "notifyWait", mine: "notifyMine" };
  const LINK = { wait: "https://www.childcare.go.kr/?menuno=175", waitStatus: "https://www.childcare.go.kr/?menuno=178", bokjiro: "https://www.bokjiro.go.kr/" };
  const SRC_LINE = "아이사랑·복지로·국민건강보험공단 안내 기준(2026.10)";

  // ---- 일정 규칙: 공식 안내에 나오는 날짜·구간만 쓴다 (애매한 시기는 넣지 않음) ----
  // 영유아 건강검진 시기(국민건강보험공단): [차수, 시작 개월, 끝 개월(없으면 null), 표시]. 6차는 자료마다 끝이 달라 시작만 안내
  const CHECKUP = [[1, 0, 0, "생후 14~35일"], [2, 4, 6, "생후 4~6개월"], [3, 9, 12, "생후 9~12개월"], [4, 18, 24, "생후 18~24개월"], [5, 30, 36, "생후 30~36개월"], [6, 42, null, "생후 42개월부터"], [7, 54, 60, "생후 54~60개월"], [8, 66, 71, "생후 66~71개월"]];
  const DAY = 86400000;
  function scheduleItems(v, now) {
    const out = [];
    const T = window.TIMELINE;
    const c = v.child && T ? T.ctxOf(v.child, now) : null;
    if (!c) return out;
    const who = esc(c.child.name || "우리 아이");
    const ym = c.ym;
    const needsCare = c.next !== "유치원 연령";
    // 1) 등록대기 신청 (아이사랑 연중 신청)
    if (needsCare && !v.tasks["wait-apply"])
      out.push({ id: "wait-apply", kind: "schedule", ic: "📮", title: "등록대기 신청을 해 두었나요?", body: "등록대기는 아이사랑에서 연중 신청할 수 있고, 임신 중에도 가능해요.", link: LINK.wait, task: "wait-apply" });
    // 2) 매달 등록대기 순번 확인
    if (needsCare && !v.tasks[`wait-check-${ym}`])
      out.push({ id: `wait-check-${ym}`, kind: "schedule", ic: "🔎", title: `${now.getMonth() + 1}월 등록대기 순번 확인`, body: "순번은 수시로 바뀌어요. 아이사랑 마이룸에서 확인해요.", link: LINK.waitStatus, task: `wait-check-${ym}` });
    // 3) 다음 학년도(3월 1일) 시작까지 D-90 · D-30 · D-7 (가장 가까운 단계 하나만)
    if (needsCare) {
      const start = new Date(c.sy + 1, 2, 1), d = Math.ceil((start - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / DAY);
      const thr = [7, 30, 90].find((t) => d >= 0 && d <= t);
      if (thr) out.push({ id: `school-${c.sy + 1}-${thr}`, kind: "schedule", ic: "🏫", title: `${c.sy + 1}학년도 시작까지 ${d}일`, body: `${who}는 3월부터 ${c.next}이에요(반은 출생연도 기준). 대기 중인 어린이집의 연락과 입소 서류를 확인해요.`, open: "timeline" });
    }
    // 4) 출생 후 60일 이내 부모급여·아동수당 신청 (출생 달·다음 달)
    if (c.months === 0 || c.months === 1)
      out.push({ id: `benefit-${c.child.year}${c.child.month}-${c.months}`, kind: "schedule", ic: "📝", title: c.months === 0 ? "출생 후 60일 안에 신청해요" : "신청 기한(출생 후 60일)이 가까워요", body: "부모급여·아동수당은 출생 후 60일 이내에 신청하면 출생한 달부터 받을 수 있어요. 복지로·주민센터에서 신청해요.", link: LINK.bokjiro });
    // 5) 영유아 건강검진 시기 (시작 달 · 마지막 달)
    CHECKUP.forEach(([n, a, b, label]) => {
      if (c.months === a) out.push({ id: `checkup-${n}-start-${c.child.year}${c.child.month}`, kind: "schedule", ic: "🩺", title: `${n}차 영유아 건강검진 시기예요`, body: `${label}. 지정 검진기관에서 받을 수 있어요. 대상 여부는 국민건강보험공단(1577-1000)에서 확인해요.`, link: "https://www.nhis.or.kr/" });
      else if (b != null && b > a && c.months === b) out.push({ id: `checkup-${n}-end-${c.child.year}${c.child.month}`, kind: "schedule", ic: "🩺", title: `${n}차 영유아 건강검진, 이번 달이 마지막이에요`, body: `${label} 시기예요. 아직이라면 지정 검진기관을 확인해요.`, link: "https://www.nhis.or.kr/" });
    });
    return out;
  }

  // ---- 관심 어린이집 변화 (정원 여유·등록대기): 하루 한 번 최신 데이터와 비교 ----
  const today = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  async function checkFavs(force) {
    const st = load(), v = my(), t = today();
    if (!window.APP || !APP.snapByKey || !v.favs.length || (!force && st.lastFav === t)) return;
    const s = cfg(); let changed = false;
    for (const f of v.favs) {
      let n; try { n = await APP.snapByKey(f.sido, f.key); } catch { continue; }
      if (!n) continue;
      const base = st.favBase[f.key], left = n.left, wait = n.waitTotal;
      if (base) {
        if (s.notifyCapacity !== false && base.left === 0 && left > 0) { st.events.unshift({ id: `cap-${f.key}-${t}`, kind: "capacity", ic: "🪑", at: Date.now(), title: `${esc(n.name)}에 자리가 생겼어요`, body: `정원 ${n.capacity}명 중 ${n.current}명 · 여유 ${left}자리(계산)`, fav: { sido: f.sido, key: f.key } }); changed = true; }
        else if (s.notifyCapacity !== false && base.left > 0 && left === 0) { st.events.unshift({ id: `cap-${f.key}-${t}`, kind: "capacity", ic: "🪑", at: Date.now(), title: `${esc(n.name)} 정원이 찼어요`, body: `정원 ${n.capacity}명 중 ${n.current}명(계산)`, fav: { sido: f.sido, key: f.key } }); changed = true; }
        if (s.notifyWait !== false && typeof base.wait === "number" && typeof wait === "number" && base.wait !== wait) { st.events.unshift({ id: `wait-${f.key}-${t}`, kind: "wait", ic: "⏳", at: Date.now(), title: `${esc(n.name)} 등록대기가 바뀌었어요`, body: `${base.wait}명 → ${wait}명`, fav: { sido: f.sido, key: f.key } }); changed = true; }
      }
      st.favBase[f.key] = { left: left == null ? null : left, wait: typeof wait === "number" ? wait : null };
    }
    Object.keys(st.favBase).forEach((k) => { if (!v.favs.some((f) => f.key === k)) delete st.favBase[k]; });
    st.events = st.events.slice(0, 30); st.lastFav = t; save(st);
    if (changed) refresh();
  }

  // ---- 나의 어린이집: 정보 변경(전화·주소·정원·공시 목록에서 사라짐) 하루 한 번 점검 ----
  // 공시 데이터에는 운영 중인 곳만 있어서, 목록에서 이틀 연속 안 보이면 "확인해 보세요"로만 알린다 (휴원·폐원이라고 단정하지 않음)
  async function checkMine(force) {
    const st = load(), m = my().mine, t = today();
    if (!m || !window.APP || !APP.snapByKey || (!force && st.lastMine === t)) return;
    let n; try { n = await APP.snapByKey(m.sido, m.key); } catch { return; }
    const b = st.mineBase && st.mineBase.key === m.key ? st.mineBase : null, ev = [];
    const add = (id, ic, title, body) => ev.push({ id: `mine-${m.key}-${id}-${t}`, kind: "mine", ic, at: Date.now(), title, body, fav: { sido: m.sido, key: m.key }, mine: true });
    if (!n) {
      const miss = (b ? b.miss || 0 : 0) + 1;
      st.mineBase = { ...(b || { key: m.key }), key: m.key, miss };
      if (miss === 2) add("gone", "⚠️", `${esc(m.name)}이(가) 공시 목록에서 보이지 않아요`, "휴원·폐원·이름 변경일 수 있어요. 어린이집에 전화로 확인해 보세요.");
    } else {
      const cur = { key: m.key, tel: n.tel || "", addr: n.addr || "", capacity: n.capacity ?? null, miss: 0 };
      if (b && b.tel !== undefined) {
        if (b.tel !== cur.tel && cur.tel) add("tel", "📞", `${esc(n.name)} 전화번호가 바뀌었어요`, `${esc(b.tel || "-")} → ${esc(cur.tel)}`);
        if (b.addr !== cur.addr && cur.addr) add("addr", "📍", `${esc(n.name)} 주소가 바뀌었어요`, `${esc(cur.addr)}`);
        if (b.capacity != null && cur.capacity != null && b.capacity !== cur.capacity) add("cap", "👥", `${esc(n.name)} 정원이 바뀌었어요`, `${b.capacity}명 → ${cur.capacity}명`);
      }
      st.mineBase = cur;
    }
    st.events = ev.concat(st.events).slice(0, 30); st.lastMine = t; save(st);
    if (ev.length) refresh();
  }
  // 나의 어린이집 일정·준비물 메모(mine:v1, 이 기기)에서 하루 전·당일 알림
  function noteItems(now) {
    let notes = []; try { notes = (JSON.parse(localStorage.getItem("mine:v1") || "{}").events) || []; } catch {}
    const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), out = [];
    notes.forEach((e) => {
      if (e.done || !/^\d{4}-\d\d-\d\d$/.test(e.date || "")) return;
      const [y, mo, d] = e.date.split("-").map(Number), diff = Math.round((new Date(y, mo - 1, d).getTime() - day0) / DAY);
      if (diff !== 0 && diff !== 1) return;
      out.push({ id: `mev-${e.id}-${diff}`, kind: "mine", ic: "🗓️", title: `${diff ? "내일" : "오늘"}: ${esc(e.title)}`, body: e.items ? `준비물: ${esc(e.items)}` : "나의 어린이집에 적어 둔 일정이에요.", open: "mine" });
    });
    return out;
  }

  // ---- 목록 ----
  function list() {
    const st = load(), s = cfg(), v = my(), now = new Date(), items = [];
    const seen = st.seen; let dirty = false;
    scheduleItems(v, now).forEach((it) => { if (!seen[it.id]) { seen[it.id] = Date.now(); dirty = true; } items.push({ ...it, at: seen[it.id] }); });
    noteItems(now).forEach((it) => { if (!seen[it.id]) { seen[it.id] = Date.now(); dirty = true; } items.push({ ...it, at: seen[it.id] }); });
    st.events.forEach((e) => items.push(e));
    if (dirty) save(st);
    return items.filter((it) => s[ON[it.kind]] !== false).map((it) => ({ ...it, unread: !st.read[it.id] })).sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  const unread = () => list().filter((i) => i.unread).length;
  function markAllRead() { const st = load(); list().forEach((i) => { st.read[i.id] = Date.now(); }); save(st); }

  // ---- 화면 ----
  let root = null, afterClose = null;
  const svg = (d) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  function ensureUI() {
    if (!document.getElementById("alertsCss")) {
      const css = document.createElement("style"); css.id = "alertsCss";
      css.textContent = `.alert-btn{position:relative;margin-left:auto}.alert-btn + .my-btn{margin-left:4px}.alert-btn .dot{position:absolute;top:6px;right:6px;min-width:16px;height:16px;padding:0 4px;border-radius:99px;background:var(--danger);color:#fff;font:700 10px/16px var(--font,inherit);text-align:center}
#alerts .al-item{display:flex;gap:12px;align-items:flex-start;width:100%;min-height:44px;padding:12px 14px;margin:0 0 8px;border:1px solid var(--line);border-radius:var(--r16,16px);background:var(--surface);color:var(--text);text-align:left;cursor:pointer;font:inherit}
#alerts .al-item.unread{background:var(--accent-subtle);border-color:var(--accent-soft)}#alerts .al-ic{font-size:22px;line-height:1.2}#alerts .al-item b{display:block;font-size:15px}#alerts .al-item small{display:block;margin-top:2px;color:var(--muted);font-size:13px;line-height:1.45}
#alerts .al-empty{padding:32px 12px;text-align:center;color:var(--muted)}#alerts .al-set{margin:4px 0 12px;border:0;background:none;color:var(--accent-strong);text-decoration:underline;font:inherit;cursor:pointer;min-height:44px}`;
      document.head.appendChild(css);
    }
    if (!$("openAlerts")) {
      const row = document.querySelector(".brand-row"), my = $("openMy");
      if (row && my) {
        const b = document.createElement("button"); b.type = "button"; b.id = "openAlerts"; b.className = "icon-button alert-btn";
        b.innerHTML = `${svg('<path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z"/><path d="M10 20a2 2 0 0 0 4 0"/>')}<span class="dot" hidden></span>`;
        b.addEventListener("click", open); row.insertBefore(b, my);
        my.style.marginLeft = "4px";
      }
    }
    if (!root) {
      root = document.createElement("div"); root.id = "alerts"; root.className = "mypage"; root.hidden = true;
      root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "알림");
      document.body.appendChild(root);
    }
  }
  function badge() {
    const b = $("openAlerts"); if (!b) return;
    const n = unread(), dot = b.querySelector(".dot");
    dot.hidden = !n; dot.textContent = n > 9 ? "9+" : n;
    b.setAttribute("aria-label", n ? `알림 ${n}개 새로 왔어요` : "알림");
  }
  function render() {
    const items = list();
    root.innerHTML = `
      <header class="detail-header"><button class="icon-button" data-close aria-label="알림 닫기">${svg('<path d="m15 5-7 7 7 7"/>')}</button><h2>알림</h2></header>
      <div class="my-body">
        <button type="button" class="al-set" data-set>알림 종류 설정</button>
        ${window.ACCOUNT && !ACCOUNT.isMember() ? `<button type="button" class="al-item al-join" data-join><span class="al-ic" aria-hidden="true">📱</span><span><b>가입하면 앱 밖에서도 알려드려요</b><small>앱을 닫아 둬도 자리가 생기거나 일정이 다가오면 알림을 받아요 (출시 후). 지금 알림은 가입 없이도 받아요.</small></span></button>` : ""}
        ${items.length ? items.map((it, i) => `<button type="button" class="al-item${it.unread ? " unread" : ""}" data-i="${i}"><span class="al-ic" aria-hidden="true">${it.ic}</span><span><b>${it.title}</b><small>${it.body}</small></span></button>`).join("")
          : `<p class="al-empty">새 알림이 없어요.<br>아이를 등록하고 어린이집에 ♡를 담으면 일정과 변화를 알려드려요.</p>`}
        <p class="src-line">${SRC_LINE}</p>
        <p class="src">일반적인 안내예요. 신청 시기와 서류는 지자체·기관마다 다를 수 있으니 공식 사이트에서 확인하세요. 알림은 이 기기 안에서만 계산하고 서버로 보내지 않아요.</p>
      </div>`;
    root.querySelector("[data-close]").addEventListener("click", () => history.back());
    root.querySelector("[data-set]").addEventListener("click", () => leave(() => $("openSettings")?.click()));
    root.querySelector("[data-join]")?.addEventListener("click", () => leave(() => ACCOUNT.openSignup()));
    root.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => {
      const it = items[+b.dataset.i];
      if (it.fav && window.APP) leave(() => APP.openByKey(it.fav.sido, it.fav.key));
      else if (it.open === "timeline" && window.TIMELINE) leave(() => TIMELINE.open());
      else if (it.open === "mine") leave(() => document.querySelector('nav.tabs [data-view="view-mine"]')?.click());
      else if (it.link) window.open(it.link, "_blank", "noopener");
    }));
  }
  function open() {
    ensureUI(); render(); root.hidden = false; document.body.classList.add("my-mode");
    history.pushState({ alerts: true }, "", "#alerts");
  }
  function hide() { if (!root || root.hidden) return false; markAllRead(); root.hidden = true; document.body.classList.remove("my-mode"); badge(); return true; }
  function leave(fn) { afterClose = fn; history.back(); }
  window.addEventListener("popstate", () => {
    if (document.querySelector("#account:not([hidden])")) return;
    if (hide() && afterClose) { const f = afterClose; afterClose = null; setTimeout(f, 30); }
  });
  if (location.hash === "#alerts") history.replaceState(null, "", location.pathname + location.search);

  function refresh() { ensureUI(); badge(); if (root && !root.hidden) render(); }
  window.NOTIFY = { list, unread, open, refresh, check: checkFavs, checkMine };

  const start = () => { refresh(); setTimeout(() => { checkFavs().catch(() => {}); checkMine().catch(() => {}); }, 2000); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.addEventListener("my:changed", refresh);
  window.addEventListener("storage", refresh);
  if (window.APP_SETTINGS) APP_SETTINGS.onChange((k) => { if (/^notify/.test(k)) refresh(); });
})();
