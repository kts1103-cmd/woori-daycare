// 회원가입 + 학부모(재원) 인증 (시제품)
// - 가입할 때 지금 다니는 어린이집을 인증한다 (재원 인증만, 졸업 인증 없음). 별점 평가는 그 어린이집을 인증한 회원만 할 수 있다.
// - 서버가 없어 계정은 이 기기 localStorage(account:v1)에만 저장한다. 비밀번호는 받지 않는다.
//   정식 서비스: 카카오·네이버 간편 로그인 + 증빙 사진 업로드 → 운영자 확인 후 인증 완료.
(function () {
  const KEY = "account:v1";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const svg = (d) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  // 재원 인증만 인정: 졸업·퇴소 인증은 2026-10 폐지 → 예전 기록은 읽을 때 빼고, 다음 저장 때 정리된다
  const read = () => { try { const a = JSON.parse(localStorage.getItem(KEY) || "null"); if (a && a.verifications) a.verifications = a.verifications.filter((x) => x.status !== "졸업·퇴소"); return a; } catch { return null; } };
  const write = (v) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} window.dispatchEvent(new Event("account:changed")); };
  const toast = (m) => { const t = $("toast"); if (!t) return; t.textContent = m; t.classList.add("visible"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("visible"), 3000); };

  const get = () => read();
  const isMember = () => !!read();
  // 승인된 인증만 평가 가능 (state 없음 = 예전 시제품 데이터 → 승인으로 봄)
  const verifiedFor = (key) => (read()?.verifications || []).find((x) => x.key === key && (x.state || "approved") === "approved") || null;
  const pendingFor = (key) => (read()?.verifications || []).find((x) => x.key === key && x.state === "pending") || null;
  function approve(key) { const a = read(); if (!a) return; (a.verifications || []).forEach((x) => { if (x.key === key) x.state = "approved"; }); write(a); } // 시제품: 운영자 승인 흉내

  // ---- 화면 틀 (My page와 같은 전체 화면) ----
  let root = null, state = null, onDone = null;
  function ensureRoot() {
    if (root) return root;
    root = document.createElement("div"); root.id = "account"; root.className = "mypage"; root.hidden = true;
    root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "회원가입");
    document.body.appendChild(root);
    return root;
  }
  function show() { root.hidden = false; document.body.classList.add("my-mode"); history.pushState({ account: true }, "", "#join"); }
  function close() { if (!root) return; root.hidden = true; if (!document.querySelector(".mypage:not([hidden])")) document.body.classList.remove("my-mode"); }
  // 다른 화면(상세·My 등)의 뒤로가기 처리가 "회원가입이 열려 있음"을 먼저 확인할 수 있게 한 박자 늦게 닫는다
  window.addEventListener("popstate", () => { if (root && !root.hidden) setTimeout(close, 0); });
  if (location.hash === "#join") history.replaceState(null, "", location.pathname + location.search);
  const header = (t) => `<header class="detail-header"><button class="icon-button" data-x aria-label="닫기">${svg('<path d="m15 5-7 7 7 7"/>')}</button><h2>${t}</h2></header>`;
  const steps = (n) => `<ol class="join-steps">${["가입", "약관", "학부모 인증", "완료"].map((s, i) => `<li class="${i + 1 === n ? "now" : i + 1 < n ? "done" : ""}">${s}</li>`).join("")}</ol>`;
  function bindX() { root.querySelector("[data-x]").addEventListener("click", () => history.back()); }

  // ---- 회원가입 ----
  function openSignup(opts = {}) {
    ensureRoot(); onDone = opts.onDone || null;
    state = { nick: "", verifications: [], pre: opts.daycare || null };
    if (isMember()) { openVerify(opts.daycare, opts); return; }
    step1(); show();
  }
  function step1() {
    root.innerHTML = `${header("회원가입")}<div class="my-body">${steps(1)}
      <section class="join-hero"><b>우리동네 어린이집에 오신 걸 환영해요</b><p>가입하면 <b>인증 학부모 평가</b>를 남기고, 관심 어린이집과 아이 정보를 다른 기기에서도 이어서 볼 수 있어요.</p></section>
      <button class="join-btn kakao" data-soon>카카오로 시작하기</button>
      <button class="join-btn naver" data-soon>네이버로 시작하기</button>
      <button class="join-btn apple" data-soon>Apple로 시작하기</button>
      <button class="join-btn demo" data-next>시제품으로 체험 가입</button>
      <p class="note">시제품 가입은 이 기기에만 저장돼요. 간편 로그인은 서버 연결 후 열려요.</p></div>`;
    bindX();
    root.querySelectorAll("[data-soon]").forEach((b) => b.addEventListener("click", () => toast("간편 로그인은 서버 연결 후 열려요. 지금은 체험 가입을 이용해 주세요.")));
    root.querySelector("[data-next]").addEventListener("click", step2);
  }
  function step2() {
    let cmNick = ""; try { cmNick = JSON.parse(localStorage.getItem("community:v1") || "{}").nick || ""; } catch {}
    root.innerHTML = `${header("회원가입")}<form class="my-body upload-form" novalidate>${steps(2)}
      <label class="field"><span>닉네임</span><input name="nick" maxlength="12" required value="${esc(state.nick || cmNick)}" placeholder="2~12자 (실명은 피해 주세요)"></label>
      <fieldset><legend>약관 동의</legend>
        <label class="check"><input type="checkbox" name="agreeAll">전체 동의</label>
        <label class="check"><input type="checkbox" name="t1" data-req>[필수] 서비스 이용약관</label>
        <label class="check"><input type="checkbox" name="t2" data-req>[필수] 개인정보 수집·이용</label>
        <label class="check"><input type="checkbox" name="t3" data-req>[필수] 커뮤니티·평가 운영정책 (허위 인증·비방 시 이용 제한)</label>
      </fieldset>
      <button class="btn primary submit" type="submit" disabled>다음 · 학부모 인증</button>
      <p class="note">약관 전문은 정식 출시 전에 법률 검토를 거쳐 공개돼요.</p></form>`;
    bindX();
    const f = root.querySelector("form"), btn = f.querySelector(".submit"), req = [...f.querySelectorAll("[data-req]")];
    const all = f.elements.agreeAll;
    const sync = () => { btn.disabled = !(f.nick.value.trim().length >= 2 && req.every((c) => c.checked)); };
    // '전체 동의'는 자기 change에서만 하위 항목을 바꾸고, 하위 항목이 바뀌면 '전체 동의' 표시만 맞춘다
    all.addEventListener("change", () => { req.forEach((c) => (c.checked = all.checked)); sync(); });
    req.forEach((c) => c.addEventListener("change", () => { all.checked = req.every((x) => x.checked); }));
    f.addEventListener("input", sync); f.addEventListener("change", sync); sync();
    f.addEventListener("submit", (e) => { e.preventDefault(); if (btn.disabled) return; state.nick = f.nick.value.trim(); step3(); });
  }

  // 학부모 인증 (확정 방식, PLAN.md 3.5): 어린이집 선택 → 증빙 캡처 1장 (재원 중인 학부모만)
  //   인정 수단 ① 아이사랑 "보육료 결제 현황" 캡처  ② 키즈노트 알림장·공지 캡처 (어린이집 이름 + 날짜가 보이게)
  //   시제품: 사진은 저장하지 않고 고르기만 한다. 실제 판독(CLOVA OCR)은 서버 연결 후.
  //   확인용 규칙: 파일 이름에 어린이집 이름이 들어 있으면 바로 승인, 아니면 "운영자 확인 중", 너무 작은 그림은 다시 올리기.
  const PAY_URL = "https://www.childcare.go.kr/?menuno=540"; // 아이사랑 보육료 결제 현황
  const PROOFS = {
    isarang_pay: { label: "아이사랑 결제현황", sub: "보육료 결제 현황 화면", tip: "아이사랑에서 '보육료 결제 현황'을 열고, 어린이집 이름과 결제 월이 보이게 캡처하세요." },
    kidsnote: { label: "키즈노트", sub: "알림장·공지 화면", tip: "키즈노트 앱에서 알림장이나 공지를 열고, 어린이집 이름과 날짜가 보이게 캡처하세요." },
  };
  const mock = (kind) => kind === "isarang_pay"
    ? `<div class="proof-mock" aria-hidden="true"><i class="pm-bar">보육료 결제 현황</i><i class="pm-row"><b>○○어린이집</b></i><i class="pm-row">2026.10 결제 완료</i><i class="pm-row">아동 <span class="pm-mask">███</span></i></div>`
    : `<div class="proof-mock kn" aria-hidden="true"><i class="pm-bar">알림장</i><i class="pm-row"><b>○○어린이집</b> · 햇살반</i><i class="pm-row">2026.10.10 (금)</i><i class="pm-row"><span class="pm-mask">███</span> 어머님께</i></div>`;

  function verifyForm(pre, { submitLabel, skippable }) {
    const picked = pre ? { ...pre } : null;
    return `
      <fieldset><legend>1. 어린이집</legend>
        <div class="join-picked" ${picked ? "" : "hidden"}>${picked ? `<b>${esc(picked.name)}</b><small>${esc(picked.area || "")}</small><button type="button" data-repick>바꾸기</button>` : ""}</div>
        <div class="join-search" ${picked ? "hidden" : ""}>
          <label class="search-field"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg><input name="q" autocomplete="off" placeholder="지금 다니는 어린이집 이름"></label>
          <div class="join-results"></div>
        </div>
      </fieldset>
      <input type="hidden" name="status" value="재원 중">
      <fieldset><legend>2. 인증 방법</legend>
        <p class="note" data-status-note>지금 다니는 어린이집만 인증할 수 있어요. 최근 3개월 안의 결제 내역이나 알림장이 보이면 돼요.</p>
        <div class="proof-pick">${Object.entries(PROOFS).map(([k, p], i) => `
          <label class="proof-card ${i ? "" : "on"}"><input type="radio" name="proof" value="${k}" ${i ? "" : "checked"}>
            ${mock(k)}<b>${p.label}</b><small>${p.sub}</small></label>`).join("")}</div>
        <div class="proof-tip">
          <p data-tip>${PROOFS.isarang_pay.tip}</p>
          <a class="btn proof-go" data-go-pay href="${PAY_URL}" target="_blank" rel="noopener">아이사랑 결제현황 열기 ↗</a>
        </div>
      </fieldset>
      <fieldset><legend>3. 캡처 사진 올리기</legend>
        <label class="pick"><input type="file" name="shot" accept="image/*"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4Z"/><circle cx="12" cy="13" r="3.5"/></svg><span data-pick-label>캡처 사진 고르기 (1장)</span></label>
        <div class="proof-preview" hidden></div>
        <p class="note proof-privacy">🔒 올린 사진은 판독 직후 바로 삭제돼요. 아이 이름은 자동으로 가려져요. 인증은 1년에 한 번(3월 새 학년)이에요.</p>
      </fieldset>
      <label class="check"><input type="checkbox" name="ok">[필수] 인증을 위해 캡처 속 정보(어린이집명, 결제 월, 아이 이름)를 판독하고 즉시 삭제하는 데 동의합니다.</label>
      <div class="proof-result" hidden aria-live="polite"></div>
      <button class="btn primary submit" type="submit" disabled>${submitLabel}</button>
      ${skippable ? `<button class="btn join-skip" type="button" data-skip>나중에 인증할게요</button><p class="note">인증하지 않아도 가입은 돼요. 다만 별점 평가는 인증한 어린이집에만 남길 수 있어요.</p>` : ""}
      <p class="note">시제품: 사진은 저장하지 않아요. 실제 판독은 서버 연결 후 열려요.</p>`;
  }
  const norm = (s) => String(s || "").replace(/[\s()（）_\-.]/g, "").toLowerCase();

  function bindVerify(f, pre, onSubmit) {
    let picked = pre ? { ...pre } : null, file = null, previewUrl = null, busy = false;
    const btn = f.querySelector(".submit"), resBox = f.querySelector(".proof-result");
    const sync = () => {
      btn.disabled = busy || !(picked && file && f.ok.checked);
      f.querySelectorAll(".cm-pick .chip, .proof-card").forEach((c) => c.classList.toggle("on", c.querySelector("input").checked));
      const kind = f.proof.value;
      f.querySelector("[data-tip]").textContent = PROOFS[kind].tip;
      f.querySelector("[data-go-pay]").hidden = kind !== "isarang_pay"; // 키즈노트는 공개 바로가기가 없어 안내만
    };
    const pickedBox = f.querySelector(".join-picked"), searchBox = f.querySelector(".join-search"), results = f.querySelector(".join-results");
    const setPicked = (s) => {
      picked = s;
      pickedBox.hidden = !s; searchBox.hidden = !!s;
      pickedBox.innerHTML = s ? `<b>${esc(s.name)}</b><small>${esc(s.area || "")}</small><button type="button" data-repick>바꾸기</button>` : "";
      pickedBox.querySelector("[data-repick]")?.addEventListener("click", () => { setPicked(null); f.q.focus(); });
      sync();
    };
    pickedBox.querySelector("[data-repick]")?.addEventListener("click", () => { setPicked(null); f.q.focus(); });
    let t;
    f.q.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const list = window.APP && APP.search ? APP.search(f.q.value, 8) : [];
        results.innerHTML = f.q.value.trim().length < 2 ? `<p class="note">두 글자 이상 입력해 주세요.</p>`
          : list.length ? list.map((s, i) => `<button type="button" class="my-dc" data-i="${i}"><span><b>${esc(s.name)}</b><small>${esc(s.area)} · ${esc(s.type)}</small></span></button>`).join("")
          : `<p class="note">찾는 어린이집이 없어요. 위쪽 지역 선택이 '전국'인지 확인해 주세요.</p>`;
        results.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => setPicked(list[Number(b.dataset.i)])));
      }, 150);
    });
    // 사진: 미리보기만 하고 저장하지 않는다
    const clearPreview = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; };
    f.shot.addEventListener("change", () => {
      const fl = f.shot.files[0];
      clearPreview(); resBox.hidden = true;
      file = fl && fl.type.startsWith("image/") ? fl : null;
      const pv = f.querySelector(".proof-preview");
      if (file) { previewUrl = URL.createObjectURL(file); pv.innerHTML = `<img src="${previewUrl}" alt="고른 캡처 미리보기"><span>${esc(file.name)}</span><button type="button" data-unpick>빼기</button>`; pv.hidden = false;
        pv.querySelector("[data-unpick]").addEventListener("click", () => { f.shot.value = ""; file = null; clearPreview(); pv.hidden = true; f.querySelector("[data-pick-label]").textContent = "캡처 사진 고르기 (1장)"; sync(); });
        f.querySelector("[data-pick-label]").textContent = "다른 사진 고르기";
      } else { pv.hidden = true; }
      sync();
    });
    f.addEventListener("change", sync); sync();

    const result = (kind, title, body) => { resBox.className = `proof-result ${kind}`; resBox.innerHTML = `<b>${title}</b><small>${body}</small>`; resBox.hidden = false; };
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); if (btn.disabled) return;
      busy = true; btn.textContent = "판독 중…"; sync();
      result("reading", "🔍 판독 중…", "어린이집 이름과 날짜를 찾고 있어요.");
      let tooSmall = false;
      try { const bmp = await createImageBitmap(file); tooSmall = Math.max(bmp.width, bmp.height) < 300; bmp.close && bmp.close(); } catch { tooSmall = true; }
      await new Promise((r) => setTimeout(r, 1200));
      const base = { key: picked.key, sido: picked.sido, name: picked.name, area: picked.area, status: f.status.value, method: f.proof.value, at: Date.now() };
      // 판독이 끝나면 사진 흔적을 지운다
      const done = () => { f.shot.value = ""; file = null; clearPreview(); f.querySelector(".proof-preview").hidden = true; };
      if (tooSmall) {
        done(); busy = false; btn.textContent = "다시 올리기"; sync();
        result("fail", "❌ 어린이집 이름이나 날짜를 찾지 못했어요", "화면 전체가 선명하게 보이는 캡처로 다시 올려 주세요.");
        return;
      }
      const auto = norm(file.name).includes(norm(picked.name).replace(/어린이집$/, "")) && norm(picked.name).length >= 2;
      done();
      if (auto) { result("ok", "✅ 인증이 완료됐어요", `${esc(picked.name)} · ${esc(base.status)}`); setTimeout(() => onSubmit({ ...base, state: "approved" }), 700); }
      else { result("wait", "⏳ 운영자가 확인하고 있어요", "24시간 안에 결과를 알려 드려요. 확인이 끝나면 평가를 남길 수 있어요."); setTimeout(() => onSubmit({ ...base, state: "pending" }), 900); }
    });
  }
  function step3() {
    root.innerHTML = `${header("회원가입")}<form class="my-body upload-form" novalidate>${steps(3)}
      <p class="sheet-copy">지금 다니는 어린이집을 인증하면 그곳에 <b>인증 학부모 평가</b>를 남길 수 있어요.</p>
      ${verifyForm(state.pre, { submitLabel: "인증하고 가입 완료", skippable: true })}</form>`;
    bindX();
    const f = root.querySelector("form");
    bindVerify(f, state.pre, (ver) => { state.verifications = [ver]; finish(); });
    f.querySelector("[data-skip]").addEventListener("click", () => { state.verifications = []; finish(); });
  }
  function finish() {
    write({ nick: state.nick, joinedAt: Date.now(), verifications: state.verifications });
    root.innerHTML = `${header("가입 완료")}<div class="my-body">${steps(4)}
      <section class="join-hero done"><span class="join-check">✔</span><b>${esc(state.nick)}님, 가입을 환영해요!</b>
      <p>${!state.verifications.length ? "학부모 인증은 My에서 언제든 추가할 수 있어요."
        : state.verifications[0].state === "pending" ? `<span class="verified-badge pending">⏳ ${esc(state.verifications[0].name)} · 확인 중</span><br>운영자가 24시간 안에 확인해요. 확인이 끝나면 별점 평가를 남길 수 있어요.`
        : `<span class="verified-badge">✔ ${esc(state.verifications[0].name)} · ${esc(state.verifications[0].status)} 인증</span><br>이제 이 어린이집에 별점 평가를 남길 수 있어요.`}</p></section>
      <button class="btn primary submit" data-ok>${onDone ? "평가하러 가기" : "시작하기"}</button></div>`;
    bindX();
    root.querySelector("[data-ok]").addEventListener("click", () => { const cb = onDone; history.back(); cb && setTimeout(cb, 50); });
  }

  // ---- 가입 후 어린이집 인증 추가 ----
  function openVerify(pre, opts = {}) {
    ensureRoot(); onDone = opts.onDone || null;
    if (!isMember()) { openSignup({ daycare: pre, onDone: opts.onDone }); return; }
    root.innerHTML = `${header("학부모 인증 추가")}<form class="my-body upload-form" novalidate>
      <p class="sheet-copy">인증한 어린이집에만 별점 평가를 남길 수 있어요.</p>
      ${verifyForm(pre, { submitLabel: "인증하기" })}</form>`;
    bindX();
    bindVerify(root.querySelector("form"), pre, (ver) => {
      const a = read(); a.verifications = [ver, ...(a.verifications || []).filter((x) => x.key !== ver.key)]; write(a);
      toast(ver.state === "pending" ? `${ver.name} 인증을 운영자가 확인하고 있어요.` : `${ver.name} 학부모 인증을 마쳤어요.`);
      const cb = onDone; history.back(); cb && setTimeout(cb, 50);
    });
    show();
  }

  function removeVerification(key) { const a = read(); if (!a) return; a.verifications = (a.verifications || []).filter((x) => x.key !== key); write(a); }
  function logout() { write(null); toast("로그아웃했어요. (시제품: 이 기기의 가입 정보를 지웠어요)"); }

  const METHOD_LABEL = { isarang_pay: "아이사랑 결제현황", kidsnote: "키즈노트" };
  window.ACCOUNT = { get, isMember, verifiedFor, pendingFor, approve, openSignup, openVerify, removeVerification, logout, METHOD_LABEL };
})();
