// 우리 아이 입소 타임라인 + 시기별 체크리스트 (마미톡 280days·검사 일정 안내 벤치마킹)
// My에 등록한 아이 정보(출생·출산 예정 연월)로 "지금 할 일"을 계산한다. 이 기기 localStorage(my:v1)에만 저장.
(function () {
  const KEY = "my:v1";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const read = () => { try { return Object.assign({ favs: [], recent: [], child: null, tasks: {} }, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return { favs: [], recent: [], child: null, tasks: {} }; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
  const svg = (d) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

  // ---- 아이 상태 ----
  const schoolYearOf = (d) => (d.getMonth() >= 2 ? d.getFullYear() : d.getFullYear() - 1); // 3월 시작
  function classOf(year, sy) { const a = sy - 1 - year; return a < 0 ? "입소 전" : a > 5 ? "유치원 연령" : `만 ${a}세반`; }
  function ctxOf(child, now = new Date()) {
    if (!child) return null;
    const m = child.month || 1;
    const months = (now.getFullYear() - child.year) * 12 + (now.getMonth() + 1 - m); // 음수면 출산 전
    const sy = schoolYearOf(now);
    return { child, months, expecting: months < 0, sy, cls: classOf(child.year, sy), next: classOf(child.year, sy + 1), month: now.getMonth() + 1, ym: `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}` };
  }
  const ageText = (c) => c.expecting ? `출산 ${-c.months}개월 전` : c.months < 24 ? `생후 ${c.months}개월` : `만 ${Math.floor(c.months / 12)}세`;

  // ---- 할 일 목록 ----
  // when(ctx): 지금 보여줄지, monthly: 매달 다시 체크, auto(v): 자동 완료 조건
  const LINK = { wait: "https://www.childcare.go.kr/?menuno=175", waitStatus: "https://www.childcare.go.kr/?menuno=178", bokjiro: "https://www.bokjiro.go.kr/", vaccine: "https://nip.kdca.go.kr/" };
  const TASKS = [
    { id: "wait-apply", group: "신청", title: "등록대기 신청하기", desc: "아이사랑에서 원하는 어린이집 여러 곳에 등록대기를 신청해요. 임신 중에도 신청할 수 있어요.", link: LINK.wait, when: () => true },
    { id: "shortlist", group: "알아보기", title: "후보 어린이집 3곳 이상 관심 담기", desc: "거리·연장보육·통학차량을 비교해 ♡로 담아 두면 My에서 비교표로 볼 수 있어요.", when: () => true, auto: (v) => v.favs.length >= 3 },
    { id: "wait-check", group: "신청", title: "이번 달 등록대기 순번 확인", desc: "순번은 수시로 바뀌어요. 한 달에 한 번은 확인해요.", link: LINK.waitStatus, monthly: true, when: () => true },
    { id: "season", group: "알아보기", title: "신학기 반 편성 시즌 챙기기", desc: "보통 가을부터 겨울 사이에 다음 해 3월 반 편성과 입소 확정이 진행돼요. 시기는 어린이집마다 달라 대기 중인 곳의 연락을 놓치지 마세요.", when: (c) => [9, 10, 11, 12, 1, 2].includes(c.month) },
    { id: "visit", group: "상담", title: "상담·방문 예약하기", desc: "후보 어린이집에 전화로 상담 일정을 잡아요. 상세 화면의 상담 체크리스트를 챙겨 가세요.", when: (c) => c.months >= -3 },
    { id: "extended", group: "신청", title: "맞벌이라면 연장보육 신청하기", desc: "연장보육은 보통 오후 4시~7시 30분에 운영돼요. 만 0~2세는 주민센터·복지로에서 자격 인정을 받은 뒤 어린이집에 이용신청서를 내고, 만 3~5세는 어린이집 상담 후 이용신청서를 내면 돼요. 자세한 내용은 입소 가이드를 확인하세요.", link: LINK.bokjiro, when: () => true, optional: true },

    { id: "subsidy", group: "서류", title: "보육료 지원 신청 (복지로·주민센터)", desc: "어린이집 입소 전에 보육료 지원을 신청해 두어야 국민행복카드로 결제할 수 있어요.", link: LINK.bokjiro, when: (c) => c.months >= 0 },
    { id: "card", group: "서류", title: "국민행복카드 준비", desc: "보육료 결제에 쓰는 카드예요. 지원 신청과 함께 발급받아요.", when: (c) => c.months >= 0 },
    { id: "vaccine", group: "건강", title: "예방접종 기록 확인", desc: "입소할 때 예방접종 내역을 확인하는 곳이 많아요. 예방접종도우미에서 미리 확인해 두세요.", link: LINK.vaccine, when: (c) => c.months >= 0 },
    { id: "checkup", group: "건강", title: "영유아 건강검진 결과 챙기기", desc: "어린이집에서 건강검진 결과를 요청할 수 있어요. 최근 결과를 준비해 두세요.", when: (c) => c.months >= 4 },
    { id: "supplies", group: "입소 준비", title: "입소 준비물 챙기기", desc: "낮잠이불, 여벌옷, 이름표, 개인 컵·수건 등 준비물 목록은 어린이집에 확인해요.", when: (c) => c.months >= 6 },
    { id: "adapt", group: "입소 준비", title: "적응 기간 일정 맞추기", desc: "처음 1~2주는 짧게 등원하며 적응하는 경우가 많아요. 보호자 일정을 미리 비워 두세요.", when: (c) => c.months >= 6 },
  ];
  const taskKey = (t, c) => (t.monthly ? `${t.id}-${c.ym}` : t.id);
  function listFor(v, c) {
    return TASKS.filter((t) => t.when(c)).map((t) => ({ ...t, done: !!(v.tasks[taskKey(t, c)] || (t.auto && t.auto(v))), key: taskKey(t, c) }));
  }

  // ---- 첫 화면 배너 ----
  function renderBanner() {
    const host = document.querySelector("#view-map");
    if (!host) return;
    let b = $("todoBanner");
    if (!b) { b = document.createElement("button"); b.id = "todoBanner"; b.type = "button"; b.className = "todo-banner"; host.insertBefore(b, host.firstChild); b.addEventListener("click", open); }
    const v = read(), c = ctxOf(v.child);
    if (!c) {
      b.innerHTML = `<span class="tb-ic">👶</span><span><b>우리 아이를 등록해 보세요</b><small>출생·출산 예정 월을 넣으면 지금 할 일을 알려드려요</small></span>${svg('<path d="m9 5 7 7-7 7"/>')}`;
      return;
    }
    const list = listFor(v, c), left = list.filter((t) => !t.done).length;
    b.innerHTML = `<span class="tb-ic">${c.expecting ? "🤰" : "👶"}</span><span><b>${esc(c.child.name || "우리 아이")} · ${c.expecting ? ageText(c) : c.cls}</b><small>${left ? `지금 할 일 <em>${left}개</em>가 남았어요` : "지금 할 일을 모두 마쳤어요 🎉"}</small></span>${svg('<path d="m9 5 7 7-7 7"/>')}`;
  }

  // ---- 타임라인 화면 ----
  let root = null;
  function ensureRoot() {
    if (root) return root;
    root = document.createElement("div"); root.id = "timeline"; root.className = "mypage"; root.hidden = true;
    root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "우리 아이 입소 타임라인");
    document.body.appendChild(root);
    return root;
  }
  function open() {
    const v = read();
    if (!v.child) { window.MYPAGE && MYPAGE.open("child"); return; }
    ensureRoot(); tab = "todo"; render(); root.hidden = false; document.body.classList.add("my-mode");
    history.pushState({ timeline: true }, "", "#todo");
  }
  function close() { if (!root) return; root.hidden = true; document.body.classList.remove("my-mode"); renderBanner(); }
  window.addEventListener("popstate", () => { if (document.querySelector("#account:not([hidden])")) return; if (root && !root.hidden) close(); });
  if (location.hash === "#todo") history.replaceState(null, "", location.pathname + location.search);

  // 생애 단계 막대: 임신 → 만0 → 만1 → 만2 → 만3~5
  // 실제 나이가 아니라 이번 학년도 "반" 기준 (입소는 반으로 정해지므로)
  const STAGES = [["임신·입소 전", (c) => c.expecting || c.cls === "입소 전"], ["0세반", (c) => !c.expecting && c.cls === "만 0세반"], ["1세반", (c) => c.cls === "만 1세반"], ["2세반", (c) => c.cls === "만 2세반"], ["3~5세반", (c) => /만 [345]세반/.test(c.cls)]];
  let tab = "todo"; // "todo" 진행 | "done" 완료
  // 완료 기록: 지금 목록의 완료 + 지난 기록(지난달 순번 확인, 시즌이 지난 항목 등)까지 날짜순
  function doneHistory(v, list) {
    const out = [];
    const seen = new Set();
    Object.entries(v.tasks || {}).forEach(([key, at]) => {
      const m = key.match(/^(.*)-(\d{4})(\d{2})$/);
      const t = TASKS.find((x) => x.id === key) || (m && TASKS.find((x) => x.id === m[1] && x.monthly));
      if (!t) return;
      out.push({ key, t, at: typeof at === "number" ? at : null, note: m && t.monthly ? `${Number(m[3])}월분` : "" });
      seen.add(key);
    });
    list.filter((t) => t.done && !seen.has(t.key) && t.auto && t.auto(v)).forEach((t) => out.push({ key: t.key, t, at: null, auto: true }));
    return out.sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  const dateKo = (t) => { const d = new Date(t); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };

  function render() {
    const v = read(), c = ctxOf(v.child), list = listFor(v, c);
    const must = list, done = must.filter((t) => t.done).length; // 선택 항목도 함께 셈 (진행·완료 탭 숫자와 맞춤)
    const todo = list.filter((t) => !t.done);
    const hist = doneHistory(v, list);
    const groups = [...new Set(todo.map((t) => t.group))];
    const taskHTML = (t) => `
            <label class="tl-task">
              <input type="checkbox" data-task="${t.key}">
              <span><b>${esc(t.title)}${t.optional ? " <em>선택</em>" : ""}${t.monthly ? " <em>매달</em>" : ""}</b><small>${esc(t.desc)}</small>
              ${t.link ? `<a href="${t.link}" target="_blank" rel="noopener" class="tl-link">공식 사이트 열기 ↗</a>` : ""}</span>
            </label>`;
    root.innerHTML = `
      <header class="detail-header"><button class="icon-button" data-close aria-label="닫기">${svg('<path d="m15 5-7 7 7 7"/>')}</button><h2>우리 아이 입소 타임라인</h2></header>
      <div class="my-body">
        <section class="tl-hero">
          <span class="tl-age">${c.expecting ? "🤰" : "👶"} ${esc(ageText(c))}</span>
          <h3>${esc(c.child.name || "우리 아이")}는 ${c.expecting ? "곧 태어나요" : `지금 <b>${c.cls}</b>`}</h3>
          <p>${c.expecting ? "" : `${esc(ageText(c))}이지만 반은 출생연도 기준이라 이번 학년도(${c.sy}.3~)는 <b>${c.cls}</b>이에요. `}${c.sy + 1}학년도(내년 3월~)에는 <b>${c.next}</b>이에요.</p>
          <ol class="tl-stages">${STAGES.map(([l, f]) => `<li class="${f(c) ? "now" : ""}">${l}</li>`).join("")}</ol>
        </section>
        <section class="tl-progress">
          <div class="tl-progress-head"><span><b>지금 할 일 ${done}/${must.length}</b><small>체크하면 이 기기에 저장돼요</small></span>
            <div class="segments tl-tabs" role="tablist" aria-label="할 일 보기">
              <button type="button" role="tab" data-tab="todo" aria-selected="${tab === "todo"}" aria-pressed="${tab === "todo"}">진행 ${todo.length}</button>
              <button type="button" role="tab" data-tab="done" aria-selected="${tab === "done"}" aria-pressed="${tab === "done"}">완료 ${hist.length}</button>
            </div></div>
          <span class="bar"><span style="width:${must.length ? (done / must.length) * 100 : 0}%"></span></span>
        </section>
        ${tab === "todo"
          ? (todo.length ? groups.map((g) => `<section class="my-sec"><h3>${esc(g)}</h3>${todo.filter((t) => t.group === g).map(taskHTML).join("")}</section>`).join("")
            : `<section class="my-sec tl-alldone"><b>🎉 지금 할 일을 모두 마쳤어요</b><small>완료 탭에서 한 일을 다시 볼 수 있어요.</small></section>`)
          : (hist.length ? `<section class="my-sec"><h3>✅ 완료한 일</h3>${hist.map((h) => `
            <div class="tl-task done">
              <span class="tl-done-ic" aria-hidden="true">✓</span>
              <span><b>${esc(h.t.title)}${h.note ? ` <em>${h.note}</em>` : ""}</b>
                <small>${h.auto ? `♡ 관심 ${v.favs.length}곳 담아서 자동 완료` : h.at ? `${dateKo(h.at)} 완료` : "완료"}</small></span>
              ${h.auto ? "" : `<button type="button" class="tl-undo" data-undo="${esc(h.key)}">되돌리기</button>`}
            </div>`).join("")}</section>`
            : `<section class="my-sec tl-alldone"><b>아직 완료한 일이 없어요</b><small>진행 탭에서 한 일을 체크해 보세요.</small></section>`)}
        <p class="src-line">아이사랑·복지로 안내 기준(2026.10)</p>
        <p class="src">일반적인 안내예요. 신청 시기와 서류는 지자체·어린이집마다 다를 수 있으니 공식 사이트에서 확인하세요.</p>
      </div>`;
    root.querySelector("[data-close]").addEventListener("click", () => history.back());
    root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; render(); }));
    root.querySelectorAll("[data-task]").forEach((cb) => cb.addEventListener("change", () => {
      if (!cb.checked) return;
      const x = read(); x.tasks = x.tasks || {}; x.tasks[cb.dataset.task] = Date.now(); write(x);
      cb.closest(".tl-task").classList.add("leaving");
      setTimeout(render, 250); // 체크한 항목이 진행 목록에서 살짝 사라지며 완료로 이동
    }));
    root.querySelectorAll("[data-undo]").forEach((b) => b.addEventListener("click", () => {
      const x = read(); delete (x.tasks || {})[b.dataset.undo]; write(x); render();
    }));
  }

  // 커뮤니티 등에서 쓰는 "우리 아이 연령반"
  function childClass() { const c = ctxOf(read().child); return c ? (c.expecting ? "예비" : c.cls) : null; }

  window.TIMELINE = { open, renderBanner, childClass, ctxOf };
  const start = () => renderBanner();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.addEventListener("storage", renderBanner);
  window.addEventListener("my:changed", renderBanner);
})();
