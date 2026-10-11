// 나의 어린이집 탭 (앱개발): 다니는(다닐) 어린이집을 하나 등록하면 매일 볼 것을 모아 보여준다.
// - 오늘: 식단·공지(서울시 보육포털 / 정보공개포털 공시 링크 — 내용은 가져오지 않음), 대기질 링크, 지금 할 일·새 알림
// - 급할 때 맡길 곳: 서울시 특화 보육(365열린·거점형 야간·주말·휴일) 어린이집을 가까운 순으로 (서울만)
// 저장: my:v1.mine = {key, sido, name, type, area} (이 기기에만)
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

      <h3 class="mine-h">오늘 챙겨 볼 것</h3>
      <div class="mine-list">
        ${seoul ? `<a class="mine-item" href="${esc(d.iseoul)}" target="_blank" rel="noopener"><span class="mi-ic" aria-hidden="true">🍱</span><span><b>오늘 식단·공지 보기</b><small>어린이집이 서울시 보육포털에 올린 식단표·공지·가정통신문으로 연결해요</small></span><span aria-hidden="true">↗</span></a>`
          : ""}
        ${childTodo ? `<button type="button" class="mine-item" data-todo><span class="mi-ic" aria-hidden="true">📋</span><span><b>우리 아이 지금 할 일</b><small>입소 타임라인에서 이번 달 할 일을 확인해요</small></span><span aria-hidden="true">›</span></button>` : ""}
        <button type="button" class="mine-item" data-alerts><span class="mi-ic" aria-hidden="true">🔔</span><span><b>알림${todo ? ` <em>${todo}개 새로 왔어요</em>` : ""}</b><small>입소 일정·관심 어린이집 변화</small></span><span aria-hidden="true">›</span></button>
      </div>

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
  }

  function css() {
    if ($("mineCss")) return;
    const s = document.createElement("style"); s.id = "mineCss";
    s.textContent = `#view-mine .mine{padding:16px 20px 24px;display:grid;gap:12px}#view-mine h2{margin:0;font-family:var(--font-cute,inherit);font-weight:400;font-size:22px;color:var(--text)}
#view-mine .mine-lead,#view-mine .mine-note{margin:0;color:var(--muted);font-size:13px;line-height:1.55}#view-mine .mine-cands,#view-mine .mine-results,#view-mine .mine-list{display:grid;gap:8px}
#view-mine .mine-pick{display:grid;gap:12px}#view-mine .mine-card{padding:18px;border-radius:var(--r20,20px);background:var(--accent-subtle);border:1px solid var(--accent-soft);display:grid;gap:6px}
#view-mine .mine-badge{justify-self:start;padding:2px 10px;border-radius:99px;background:var(--accent);color:#fff;font-size:12px}#view-mine .mine-sub{margin:0;color:var(--muted);font-size:13px}
#view-mine .mine-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}#view-mine .mine-actions .btn{min-height:44px}#view-mine .mine-h{margin:8px 0 0;font-family:var(--font-cute,inherit);font-weight:400;font-size:18px}
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
