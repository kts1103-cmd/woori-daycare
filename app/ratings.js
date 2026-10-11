// 인증 학부모 별점 (시제품)
// - 재원 인증을 한 학부모만 평가할 수 있다 (졸업 인증은 폐지).
// - 평균은 인증 평가가 MIN_PUBLIC건 이상 모였을 때만 공개한다(소수 의견이 시설 평판을 좌우하지 않도록).
// - 자유 서술 없이 항목별 별점 + 태그만 받는다(명예훼손 위험을 줄이기 위해).
// 지금은 서버가 없어 "내 평가"만 이 기기 localStorage에 저장한다. 정식 서비스에서는 store만 서버 API로 바꾼다.
(function () {
  const KEY = "ratings:v1";
  const MIN_PUBLIC = 5;
  const ITEMS = ["시설·청결", "급식", "소통", "안전", "프로그램"];
  const TAGS = ["알림장 소통 원활", "적응 기간 배려", "급식 만족", "통학차량 시간 정확", "놀이 공간 넓음", "연장보육 만족", "선생님이 자주 바뀌지 않음"];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (id) => document.getElementById(id);

  const store = {
    all() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } },
    mine(key) { return this.all()[key] || null; },
    save(key, v) { const a = this.all(); if (v) a[key] = v; else delete a[key]; try { localStorage.setItem(KEY, JSON.stringify(a)); } catch {} },
  };

  // 정식 서비스에서는 서버가 인증 평가 목록을 준다. 시제품은 내 평가 1건뿐.
  function reviews(key) { const m = store.mine(key); return m ? [m] : []; }
  const avgOf = (r) => ITEMS.reduce((a, it) => a + (r.scores[it] || 0), 0) / ITEMS.length;
  function summary(key) {
    const list = reviews(key);
    const n = list.length;
    const items = Object.fromEntries(ITEMS.map((it) => [it, n ? list.reduce((a, r) => a + (r.scores[it] || 0), 0) / n : 0]));
    const tags = {};
    list.forEach((r) => r.tags.forEach((t) => { tags[t] = (tags[t] || 0) + 1; }));
    return { n, avg: n ? list.reduce((a, r) => a + avgOf(r), 0) / n : 0, items, tags, public: n >= MIN_PUBLIC, mine: store.mine(key) };
  }

  const starRow = (v, size = "") => `<span class="stars-view ${size}" role="img" aria-label="별점 ${v.toFixed(1)}점">${[1, 2, 3, 4, 5].map((i) => `<span style="--fill:${Math.max(0, Math.min(1, v - i + 1)) * 100}%">★</span>`).join("")}</span>`;

  // 목록 카드용 배지
  function badge(key) {
    const s = summary(key);
    if (s.public) return `<span class="tag rating"><i aria-hidden="true">★</i>${s.avg.toFixed(1)} <small>인증 ${s.n}</small></span>`;
    if (s.mine) return `<span class="tag rating mine"><i aria-hidden="true">★</i>내 평가 ${avgOf(s.mine).toFixed(1)}</span>`;
    return "";
  }

  function summaryHTML(s, demo) {
    const top = Object.entries(s.tags).sort((a, b) => b[1] - a[1]).slice(0, 4);
    return `
      <div class="rating-summary ${demo ? "demo" : ""}">
        ${demo ? '<span class="badge sample">예시 · 실제 평가 아님</span>' : ""}
        <div class="rating-big"><strong>${s.avg.toFixed(1)}</strong>${starRow(s.avg, "lg")}<small>인증 학부모 ${s.n}명</small></div>
        <dl class="rating-items">${ITEMS.map((it) => `<div><dt>${it}</dt><dd><span class="bar"><span style="width:${(s.items[it] / 5) * 100}%"></span></span><b>${s.items[it].toFixed(1)}</b></dd></div>`).join("")}</dl>
        ${top.length ? `<div class="tags">${top.map(([t, c]) => `<span class="tag">${esc(t)} <small>${c}</small></span>`).join("")}</div>` : ""}
      </div>`;
  }
  const DEMO = { n: 12, avg: 4.3, items: { "시설·청결": 4.5, "급식": 4.2, "소통": 4.6, "안전": 4.4, "프로그램": 3.9 }, tags: { "알림장 소통 원활": 9, "급식 만족": 7, "적응 기간 배려": 6, "놀이 공간 넓음": 4 } };

  // 평가 버튼: 비회원 → 가입 / 회원이지만 이 어린이집 미인증 → 인증 / 인증 회원 → 평가
  const acct = () => window.ACCOUNT;
  function ctaHTML(key, mine) {
    const A = acct();
    if (!A || !A.isMember()) return `<button class="btn rate-cta" type="button" data-rate>⭐ 회원가입하고 평가하기</button><p class="note rate-why">평가는 가입할 때 <b>재원 인증</b>을 한 학부모만 남길 수 있어요.</p>`;
    const v = A.verifiedFor(key);
    if (!v && A.pendingFor && A.pendingFor(key)) return `<button class="btn rate-cta" type="button" disabled>⏳ 인증 확인 대기 중이에요 (시제품)</button><p class="note rate-why">시제품: 운영자 확인은 서버 연결 후 열려요. 확인이 끝나면 평가를 남길 수 있어요.</p>`;
    if (!v) return `<button class="btn rate-cta" type="button" data-rate>🔒 이 어린이집 학부모 인증하고 평가하기</button><p class="note rate-why">${esc(A.get().nick)}님은 아직 이 어린이집을 인증하지 않았어요.</p>`;
    return `<div class="rate-verified"><span class="verified-badge" title="시제품: 서버에서 증빙을 확인하기 전에는 자동 확인으로 표시돼요">✔ ${esc(v.status)} 인증 회원(시제품)</span></div><button class="btn rate-cta" type="button" data-rate>${mine ? "내 평가 수정하기" : "⭐ 평가하기"}</button>`;
  }

  // 상세 화면 섹션
  function section(key) {
    const s = summary(key);
    const mine = s.mine;
    return `
      <section class="rating-sec" data-rating-sec>
        <div class="rating-head"><h3>인증 학부모 평가</h3><span class="verified-badge" title="시제품: 서버에서 증빙을 확인하기 전에는 자동 확인으로 표시돼요">✔ 재원 인증(시제품)</span></div>
        ${s.public ? summaryHTML(s) : `
        <p class="rating-empty">아직 공개된 평균이 없어요. <b>인증 학부모 ${MIN_PUBLIC}명 이상</b>이 평가하면 평균을 보여드려요. <small>(현재 ${s.n}명)</small></p>
        <details class="rating-demo"><summary>공개되면 이렇게 보여요</summary>${summaryHTML(DEMO, true)}</details>`}
        ${mine ? `<div class="rating-mine"><span>내 평가</span>${starRow(avgOf(mine))}<b>${avgOf(mine).toFixed(1)}</b><small>${esc(mine.verified.status)} · ${new Date(mine.at).toLocaleDateString("ko-KR")}</small></div>` : ""}
        ${ctaHTML(key, mine)}
        <p class="src-line">개인 의견이며 앱이 보증하지 않아요</p>
        <p class="note">시제품: 내 평가만 이 기기에 저장돼요. 실제 다른 학부모 평가는 아직 없어요.</p>
      </section>`;
  }

  // 평가 시트: 항목별 별점·태그 (학부모 인증은 회원가입 때 account.js에서)
  function openRate(key, name, onDone) {
    const sh = $("sheet");
    const prev = store.mine(key);
    const v = prev ? JSON.parse(JSON.stringify(prev)) : { scores: {}, tags: [], verified: null };
    const close = () => sh.close();
    const top = (title) => `<div class="sheet-top"><h2>${title}</h2><button class="icon-button" data-close aria-label="닫기"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div>`;

    function step2() {
      sh.setAttribute("aria-label", "별점 평가");
      sh.innerHTML = `${top("별점 평가")}
        <p class="sheet-copy"><span class="verified-badge" title="시제품: 서버에서 증빙을 확인하기 전에는 자동 확인으로 표시돼요">✔ ${esc(v.verified.status)} 인증(시제품)</span> 항목마다 별을 눌러 주세요.</p>
        <form class="upload-form rate-form" novalidate>
          ${ITEMS.map((it) => `<div class="rate-row"><span>${it}</span><span class="rate-stars" data-item="${it}" role="radiogroup" aria-label="${it}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" class="${(v.scores[it] || 0) >= n ? "on" : ""}" aria-label="${it} ${n}점" aria-pressed="${v.scores[it] === n}">★</button>`).join("")}</span></div>`).join("")}
          <fieldset><legend>좋았던 점 <small>(선택)</small></legend>
            <div class="cm-pick">${TAGS.map((t) => `<label class="chip ${v.tags.includes(t) ? "on" : ""}"><input type="checkbox" value="${esc(t)}" ${v.tags.includes(t) ? "checked" : ""}>${esc(t)}</label>`).join("")}</div>
          </fieldset>
          <p class="note">서술형 후기는 받지 않아요. 자세한 경험은 커뮤니티 "어린이집 후기"에 나눠 주세요.</p>
          <button class="btn primary submit" type="submit" disabled>평가 저장</button>
          ${prev ? '<button class="btn danger" type="button" data-del>내 평가 삭제</button>' : ""}
        </form>`;
      const f = sh.querySelector("form"), btn = f.querySelector(".submit");
      const sync = () => {
        btn.disabled = !ITEMS.every((it) => v.scores[it]);
        f.querySelectorAll(".cm-pick .chip").forEach((c) => c.classList.toggle("on", c.querySelector("input").checked));
      };
      f.querySelectorAll(".rate-stars").forEach((g) => g.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        v.scores[g.dataset.item] = Number(b.dataset.n);
        g.querySelectorAll("button").forEach((x) => { x.classList.toggle("on", Number(x.dataset.n) <= Number(b.dataset.n)); x.setAttribute("aria-pressed", x === b); });
        sync();
      })));
      f.addEventListener("change", () => { v.tags = [...f.querySelectorAll(".cm-pick input:checked")].map((x) => x.value); sync(); });
      sync();
      sh.querySelector("[data-close]").addEventListener("click", close);
      f.querySelector("[data-del]")?.addEventListener("click", () => { if (!confirm("내 평가를 삭제할까요?")) return; store.save(key, null); close(); onDone && onDone("deleted"); });
      f.addEventListener("submit", (e) => { e.preventDefault(); if (btn.disabled) return; v.at = Date.now(); store.save(key, v); close(); onDone && onDone("saved"); });
    }

    const ver = acct() && acct().verifiedFor(key);
    if (!ver) return; // 인증 회원만 (bind에서 먼저 확인)
    v.verified = { status: ver.status, method: ver.method, at: ver.at };
    step2();
    if (!sh.open) sh.showModal();
  }

  // 상세 화면에서 섹션을 그린 뒤 호출
  function bind(root, key, name, snap) {
    const sec = root.querySelector("[data-rating-sec]");
    if (!sec) return;
    const refresh = () => { const cur = root.querySelector("[data-rating-sec]"); if (cur) { cur.outerHTML = section(key); bind(root, key, name, snap); } };
    const rate = () => openRate(key, name, (r) => {
      refresh();
      const t = $("toast"); if (t) { t.textContent = r === "deleted" ? "내 평가를 삭제했어요." : "평가를 저장했어요. 고마워요!"; t.classList.add("visible"); setTimeout(() => t.classList.remove("visible"), 3000); }
      window.dispatchEvent(new CustomEvent("ratings:changed"));
    });
    sec.querySelector("[data-rate]")?.addEventListener("click", () => { // 인증 확인 중이면 버튼이 없음
      const A = acct();
      const pre = snap || { key, name };
      const after = () => { refresh(); if (A.verifiedFor(key)) rate(); };
      if (!A) return;
      if (!A.isMember()) return A.openSignup({ daycare: pre, onDone: after });
      if (!A.verifiedFor(key)) return A.openVerify(pre, { onDone: after });
      rate();
    });
  }

  window.RATINGS = { MIN_PUBLIC, badge, section, bind, summary };
})();
