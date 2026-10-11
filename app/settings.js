// 앱 설정: 이 기기에만 저장 (서버 전송 없음). app.js보다 먼저 불러와 테마·글자 크기를 바로 적용한다.
(function () {
  const KEY = "settings";
  const DEFAULTS = {
    theme: "light",       // light(기본, 시안 기준) | dark | system
    fontSize: "normal",   // small | normal | large
    defaultSido: "",      // 비어 있으면 앱 기본값
    defaultRadius: "3000",
    route: "ask",         // ask | walk | public | car
    showLocate: true,
    notifySchedule: true, // 입소·지원 일정 (앱 안 알림, 이 기기에서만 계산)
    notifyCapacity: true, // 관심 어린이집 정원 여유
    notifyWait: true,     // 관심 어린이집 등록대기 (데이터가 생기면)
    notifyAds: false,
  };
  const APP_VERSION = "0.1.0 (시제품)";

  const read = () => { try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { ...DEFAULTS }; } };
  let s = read();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };

  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function applyTheme() {
    const dark = s.theme === "dark" || (s.theme === "system" && media && media.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#151B19" : "#FFFFFF";
  }
  function applyFont() {
    document.documentElement.dataset.font = s.fontSize;
  }
  applyTheme(); applyFont();
  if (media && media.addEventListener) media.addEventListener("change", () => { if (s.theme === "system") applyTheme(); });

  const listeners = [];
  window.APP_SETTINGS = {
    get: () => ({ ...s }),
    onChange: (fn) => listeners.push(fn),
  };
  function set(key, value) {
    s[key] = value; save();
    if (key === "theme") applyTheme();
    if (key === "fontSize") applyFont();
    listeners.forEach((fn) => fn(key, value));
  }

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const seg = (key, options) => `<div class="set-seg" role="radiogroup" data-key="${key}">${options.map(([v, l]) =>
    `<button type="button" role="radio" data-v="${v}" aria-checked="${s[key] === v}">${l}</button>`).join("")}</div>`;
  const toggle = (key, label, sub, disabled) => `<label class="set-row${disabled ? " off" : ""}"><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ""}</span>
    <input type="checkbox" class="switch" data-key="${key}" ${s[key] ? "checked" : ""} ${disabled ? "disabled" : ""}></label>`;
  const link = (label, href, sub) => `<a class="set-row link" href="${href}" target="_blank" rel="noopener"><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ""}</span><span aria-hidden="true">›</span></a>`;

  function recordCount() {
    let n = 0;
    try { for (let i = 0; i < localStorage.length; i++) if (/^(rate|check):/.test(localStorage.key(i))) n++; } catch {}
    return n;
  }

  function render() {
    const el = document.getElementById("settings");
    const sidoOpts = [...(document.getElementById("sido")?.options || [])].map((o) => o.value);
    const basis = document.querySelector(".basisDate")?.textContent || "-";
    el.innerHTML = `
      <div class="detail-header"><button class="icon-button" data-close aria-label="설정 닫기"><svg class="i" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><h2>설정</h2></div>
      <div class="set-body">
        <h3 class="set-h">화면</h3>
        <div class="set-group">
          <div class="set-row col"><b>화면 모드</b>${seg("theme", [["system", "기기 설정"], ["light", "라이트"], ["dark", "다크"]])}</div>
          ${toggle("darkQuick", "다크 모드", "켜면 어두운 화면으로 고정해요")}
          <div class="set-row col"><b>글자 크기</b>${seg("fontSize", [["small", "작게"], ["normal", "보통"], ["large", "크게"]])}</div>
        </div>

        <h3 class="set-h">검색 기본값</h3>
        <div class="set-group">
          <label class="set-row"><b>처음 보여줄 지역</b>
            <select data-key="defaultSido"><option value="">앱 기본값</option>${sidoOpts.map((v) => `<option ${s.defaultSido === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
          <label class="set-row"><b>기본 검색 반경</b>
            <select data-key="defaultRadius">${[["0", "제한 없음"], ["500", "500m"], ["1000", "1km"], ["3000", "3km"]].map(([v, l]) => `<option value="${v}" ${s.defaultRadius === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <div class="set-row col"><b>길찾기 기본 수단</b>${seg("route", [["ask", "매번 묻기"], ["walk", "도보"], ["public", "대중교통"], ["car", "자동차"]])}</div>
        </div>

        <h3 class="set-h">위치</h3>
        <div class="set-group">
          ${toggle("showLocate", "현재 위치로 찾기 사용", "버튼을 누를 때만 위치를 쓰고, 기기 안에서만 계산해요. 서버로 보내지 않아요.")}
          <p class="set-note">위치 권한 자체는 휴대폰(브라우저) 설정에서 바꿀 수 있어요.</p>
          <button type="button" class="set-row link" data-perm><span><b>권한 안내 다시 보기</b><small>위치·사진·카메라·알림을 언제 쓰는지 알려드려요</small></span><span aria-hidden="true">›</span></button>
        </div>

        <h3 class="set-h">알림 <span class="badge">앱 안 알림</span></h3>
        <div class="set-group">
          ${toggle("notifySchedule", "입소·지원 일정 안내", "등록대기·학년도 시작·부모급여 신청·영유아 건강검진 시기를 알려드려요")}
          ${toggle("notifyCapacity", "관심 어린이집 정원 여유", "정원이 차거나 자리가 생기면 알려드려요 (정원에서 현재원을 뺀 계산값)")}
          ${toggle("notifyWait", "관심 어린이집 등록대기", "등록대기 인원이 바뀌면 알려드려요 (데이터가 연결되면 시작돼요)")}
          ${toggle("notifyActivity", "내 활동 알림 (학부모 인증·댓글)", "서버가 생기면 제공돼요", true)}
          ${toggle("notifyAds", "이벤트·혜택 알림 (광고성)", "별도 동의 후 발송 · 밤 9시~아침 8시에는 보내지 않아요", true)}
        </div>

        <h3 class="set-h">내 기록</h3>
        <div class="set-group">
          <div class="set-row"><span><b>평가·상담 체크리스트</b><small>이 기기에 저장된 기록 ${recordCount()}건</small></span>
            <button type="button" class="btn danger-btn" data-clear ${recordCount() ? "" : "disabled"}>모두 삭제</button></div>
        </div>

        <h3 class="set-h">정보</h3>
        <div class="set-group">
          <div class="set-row"><b>앱 버전</b><span class="muted">${APP_VERSION}</span></div>
          <div class="set-row"><b>데이터 기준일</b><span class="muted">${esc(basis)} (매일 갱신)</span></div>
          ${link("데이터 출처", "https://info.childcare.go.kr/", "어린이집정보공개포털(한국사회보장정보원) 어린이집 기본정보 · 공공데이터포털 15083298 · 연장보육 15140061(2024) · 위치 보완: 네이버 지도 주소 검색")}
          ${link("이용약관", "https://kts1103-cmd.github.io/woori-daycare/", "출시 전 공개 예정")}
          ${link("개인정보처리방침", "https://kts1103-cmd.github.io/woori-daycare/", "출시 전 공개 예정")}
          ${link("위치기반서비스 이용약관", "https://kts1103-cmd.github.io/woori-daycare/", "출시 전 공개 예정")}
          <p class="set-note">민간에서 개발한 앱이며 정부기관과 관련이 없습니다. 지도 © NAVER Corp.</p>
        </div>
      </div>`;
    bind(el);
  }

  function bind(el) {
    el.querySelector("[data-close]").addEventListener("click", close);
    el.querySelectorAll(".set-seg").forEach((g) => g.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      set(g.dataset.key, b.dataset.v);
      g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", x === b));
      if (g.dataset.key === "theme") syncDarkQuick(el);
    })));
    el.querySelectorAll("input.switch[data-key]").forEach((c) => c.addEventListener("change", () => {
      if (c.dataset.key === "darkQuick") {
        set("theme", c.checked ? "dark" : "light");
        el.querySelectorAll('.set-seg[data-key="theme"] button').forEach((x) => x.setAttribute("aria-checked", x.dataset.v === s.theme));
      } else set(c.dataset.key, c.checked);
    }));
    el.querySelectorAll("select[data-key]").forEach((sel) => sel.addEventListener("change", () => set(sel.dataset.key, sel.value)));
    el.querySelector("[data-perm]")?.addEventListener("click", () => window.PERMINTRO && PERMINTRO.open());
    const clr = el.querySelector("[data-clear]");
    clr.addEventListener("click", () => {
      if (clr.dataset.armed !== "1") { clr.dataset.armed = "1"; clr.textContent = "한 번 더 누르면 삭제"; return; }
      try {
        const keys = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^(rate|check):/.test(k)) keys.push(k); }
        keys.forEach((k) => localStorage.removeItem(k));
      } catch {}
      render();
    });
    syncDarkQuick(el);
  }
  function syncDarkQuick(el) {
    const c = el.querySelector('input[data-key="darkQuick"]');
    if (c) c.checked = document.documentElement.dataset.theme === "dark";
  }

  let lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    render();
    const el = document.getElementById("settings");
    el.hidden = false;
    document.body.classList.add("settings-mode");
    el.querySelector("[data-close]").focus();
  }
  function close() {
    document.getElementById("settings").hidden = true;
    document.body.classList.remove("settings-mode");
    if (lastFocus) lastFocus.focus();
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("settings-mode")) close(); });
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("openSettings");
    if (btn) btn.addEventListener("click", open);
  });
})();
