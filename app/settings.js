// 앱 설정 (앱개발): 이 기기에만 저장 (서버 전송 없음). app.js보다 먼저 불러와 테마·글자 크기를 바로 적용한다.
// 구조: #settings 한 화면 안에서 첫 화면 → 하위 화면(알림·화면·검색/위치·커뮤니티·내 기록/데이터·정보·프로필). 하위 화면은 history로 쌓여 뒤로가기가 한 단계씩 동작한다.
// 서버·푸시가 필요한 항목은 비활성 줄로만 보여준다(기능을 흉내 내지 않음). 키 이름은 Flutter 이식 때도 그대로 쓴다.
(function () {
  const KEY = "settings";
  const DEFAULTS = {
    v: 2,
    theme: "light",       // light(기본, 시안 기준) | dark | system
    fontSize: "normal",   // small | normal | large
    reduceMotion: false,  // 화면 전환 애니메이션 줄이기
    startTab: "view-map", // 처음 열 탭
    listMode: "list",     // 어린이집 목록 기본 보기: list | map
    defaultSido: "",      // 비어 있으면 앱 기본값
    defaultCity: "",      // 시·군·구 (시작 흐름에서 고름, 시·도를 바꾸면 비움)
    defaultRadius: "3000",
    route: "ask",         // ask | walk | public | car
    showLocate: true,
    notifySchedule: true, // 입소·지원 일정 (앱 안 알림, 이 기기에서만 계산)
    notifyCheckup: true,  // 영유아 건강검진 시기
    notifyCapacity: true, // 관심 어린이집 정원 여유
    notifyWait: true,     // 관심 어린이집 등록대기 (데이터가 생기면)
    notifyMine: true,     // 나의 어린이집 정보 변경
    notifyNotes: true,    // 내가 적어 둔 일정·준비물
    badgeOn: true,        // 종 아이콘 숫자 표시
    quietOn: false, quietFrom: "21", quietTo: "08", // 조용한 시간: 이 시간엔 배지 숫자만 숨김
    notifyActivity: false, // 서버 필요
    notifyAds: false,      // 서버·별도 동의 필요 — 어떤 경로로도 true가 되지 않게 막는다
  };
  const APP_VERSION = "0.1.0 (시제품)";
  // 백업·초기화 대상 (사진은 크기 때문에 제외)
  const DATA_KEYS = ["settings", "my:v1", "mine:v1", "account:v1", "ratings:v1", "community:v1", "notify:v1", "parentroom:v1"];
  const DATA_PREFIX = /^(rate|check):/;
  const OTHER_KEYS = ["onboard:v1", "permintro:v1", "joinprompt:v1", "applink:childcare"];

  function read() {
    let raw = {}; try { raw = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
    const o = { ...DEFAULTS, ...raw };
    if (raw.v !== 2) { // 예전 설정: 새 알림 항목은 기존 일정·나의 어린이집 설정을 이어받는다
      if (raw.notifyCheckup === undefined && raw.notifySchedule === false) o.notifyCheckup = false;
      if (raw.notifyNotes === undefined && raw.notifyMine === false) o.notifyNotes = false;
      o.v = 2;
    }
    o.notifyAds = false; o.notifyActivity = false;
    return o;
  }
  let s = read();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };

  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function applyTheme() {
    const dark = s.theme === "dark" || (s.theme === "system" && media && media.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#151B19" : "#FFFFFF";
  }
  function applyFont() { document.documentElement.dataset.font = s.fontSize; }
  function applyMotion() { if (s.reduceMotion) document.documentElement.dataset.motion = "reduce"; else delete document.documentElement.dataset.motion; }
  applyTheme(); applyFont(); applyMotion();
  if (media && media.addEventListener) media.addEventListener("change", () => { if (s.theme === "system") applyTheme(); });

  const listeners = [];
  function set(key, value) {
    if (key === "notifyAds" || key === "notifyActivity") value = false; // 서버·동의 기록이 생기기 전에는 켜지지 않는다
    s[key] = value;
    if (key === "defaultSido") s.defaultCity = "";
    save();
    if (key === "theme") applyTheme();
    if (key === "fontSize") applyFont();
    if (key === "reduceMotion") applyMotion();
    listeners.forEach((fn) => fn(key, value));
  }

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const myv = () => { try { return JSON.parse(localStorage.getItem("my:v1") || "{}"); } catch { return {}; } };
  const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const recordCount = () => { let n = 0; try { for (let i = 0; i < localStorage.length; i++) if (/^(rate|check):/.test(localStorage.key(i))) n++; } catch {} return n; };

  // ---- 데이터 내보내기·가져오기·초기화 ----
  const allowedKey = (k) => DATA_KEYS.includes(k) || DATA_PREFIX.test(k);
  function exportAll() {
    const out = { app: "새싹이네", kind: "backup", v: 1, at: new Date().toISOString(), data: {} };
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (allowedKey(k)) out.data[k] = localStorage.getItem(k); } } catch {}
    return out;
  }
  function importAll(obj) {
    if (!obj || obj.kind !== "backup" || typeof obj.data !== "object" || !obj.data) throw new Error("백업 파일이 아니에요");
    let n = 0;
    Object.keys(obj.data).forEach((k) => {
      if (!allowedKey(k) || typeof obj.data[k] !== "string") return; // 허용 목록 밖의 키는 무시
      try { JSON.parse(obj.data[k]); localStorage.setItem(k, obj.data[k]); n++; } catch {}
    });
    return n;
  }
  async function wipeAll() {
    try {
      const keys = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (allowedKey(k) || OTHER_KEYS.includes(k)) keys.push(k); }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {}
    try { if (window.PHOTO_STORE && PHOTO_STORE.clearAll) await PHOTO_STORE.clearAll(); else if (window.indexedDB) indexedDB.deleteDatabase("woori-daycare-photos"); } catch {}
  }

  window.APP_SETTINGS = {
    get: () => ({ ...s }),
    onChange: (fn) => listeners.push(fn),
    set: (key, value) => set(key, value),
    open: (sub) => open(sub),
    exportAll, importAll, wipeAll,
  };

  // ---- 화면 조각 ----
  const seg = (key, options) => `<div class="set-seg" role="radiogroup" data-key="${key}">${options.map(([v, l]) =>
    `<button type="button" role="radio" data-v="${v}" aria-checked="${String(s[key]) === v}">${l}</button>`).join("")}</div>`;
  const toggle = (key, label, sub) => `<label class="set-row"><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ""}</span>
    <input type="checkbox" class="switch" data-key="${key}" aria-label="${esc(label)}" ${s[key] ? "checked" : ""}></label>`;
  const serverRow = (label, sub) => `<div class="set-row off" aria-disabled="true"><span><b>${label}</b><small>${sub ? `${sub} · ` : ""}서버가 생기면 제공돼요</small></span><input type="checkbox" class="switch" aria-label="${esc(label)} (준비 중)" disabled></div>`;
  const nav = (sub, label, val, help) => `<button type="button" class="set-row nav" data-sub="${sub}"><span><b>${label}</b>${help ? `<small>${help}</small>` : ""}</span><span class="set-val">${esc(val || "")}</span><span class="set-chev" aria-hidden="true">›</span></button>`;
  const link = (label, href, sub) => `<a class="set-row link" href="${href}" target="_blank" rel="noopener"><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ""}</span><span aria-hidden="true">›</span></a>`;
  const hours = (key) => `<select data-key="${key}" aria-label="${key === "quietFrom" ? "조용한 시간 시작" : "조용한 시간 끝"}">${Array.from({ length: 24 }, (_, h) => { const v = String(h).padStart(2, "0"); return `<option value="${h}" ${Number(s[key]) === h ? "selected" : ""}>${v}시</option>`; }).join("")}</select>`;
  const group = (html) => `<div class="set-group">${html}</div>`;
  const NOTI_KEYS = ["notifySchedule", "notifyCheckup", "notifyCapacity", "notifyWait", "notifyMine", "notifyNotes"];
  const TAB_NAMES = { "view-map": "어린이집 찾기", "view-mine": "나의 어린이집", "view-hospital": "병원 찾기", "view-community": "커뮤니티" };

  const regionText = () => (s.defaultSido ? `${s.defaultSido}${s.defaultCity ? " " + s.defaultCity : ""}` : "전국");
  const radiusText = () => ({ 0: "제한 없음", 500: "500m", 1000: "1km", 3000: "3km" }[s.defaultRadius] || "");
  const account = () => (window.ACCOUNT && ACCOUNT.get ? ACCOUNT.get() : null);
  const hiddenList = () => { try { return window.COMMUNITY && COMMUNITY.hidden ? COMMUNITY.hidden() : []; } catch { return []; } };
  const reported = () => (window.COMMUNITY && COMMUNITY.hidden ? hiddenList().length : (jget("community:v1", {}).reported || []).length);
  const nickOf = () => { const a = account(); return (a && a.nick) || (window.COMMUNITY && COMMUNITY.nick ? COMMUNITY.nick() : jget("community:v1", {}).nick) || ""; };

  const TITLES = { alerts: "알림 항목", display: "화면", search: "검색·위치", community: "커뮤니티", data: "내 기록·데이터", info: "정보", profile: "프로필·계정" };

  function home() {
    const acc = account(), child = myv().child, nick = nickOf();
    const on = NOTI_KEYS.filter((k) => s[k]).length;
    return `
      <button type="button" class="set-profile" data-sub="profile"><span class="set-ava" aria-hidden="true">${esc((nick || "새").slice(0, 1))}</span>
        <span><b>${esc(nick || "닉네임 없음")}</b><small>${acc ? "체험 가입 · 이 기기에만 저장" : "가입 전 · 이 기기에만 저장"}${child ? ` · ${child.name ? esc(child.name) : "우리 아이"} 등록` : ""}</small></span><span class="set-chev" aria-hidden="true">›</span></button>
      ${group(`
        ${nav("alerts", "알림 항목", `${NOTI_KEYS.length}개 중 ${on}개 켜짐`)}
        ${nav("display", "화면", `${{ system: "기기 설정", light: "라이트", dark: "다크" }[s.theme]} · ${{ small: "작게", normal: "보통", large: "크게" }[s.fontSize]}`)}
        ${nav("search", "검색·위치", `${regionText()} · ${radiusText()}`)}
        ${nav("community", "커뮤니티", reported() ? `숨긴 글 ${reported()}개` : "")}
        ${nav("data", "내 기록·데이터", `관심 ${(myv().favs || []).length} · 기록 ${recordCount()}`)}
        ${nav("info", "정보", APP_VERSION.split(" ")[0])}
      `)}
      <p class="set-note">민간에서 만든 앱이에요. 정부기관과 관련이 없습니다.</p>`;
  }

  function alerts() {
    return `<p class="set-note"><span class="badge">앱 안 알림</span> 모든 알림은 이 기기 안에서만 계산해요. 서버로 보내지 않아요.</p>
      ${group(`
        ${toggle("notifySchedule", "입소·지원 일정 안내", "등록대기 신청·순번 확인, 학년도 시작, 부모급여 신청 시기를 알려드려요")}
        ${toggle("notifyCheckup", "영유아 건강검진 시기", "아이 개월 수에 맞춰 시작하는 달과 마지막 달에 알려드려요")}
        ${toggle("notifyCapacity", "관심 어린이집 정원 여유", "정원 여유(계산)가 생기거나 없어지면 알려드려요. 정원에서 현원을 뺀 값이고 실시간 빈자리가 아니에요")}
        ${toggle("notifyWait", "관심 어린이집 등록대기", "등록대기 인원이 바뀌면 알려드려요 (데이터가 연결되면 시작돼요)")}
        ${toggle("notifyMine", "나의 어린이집 정보 변경", "전화번호·주소·정원이 바뀌면 알려드려요")}
        ${toggle("notifyNotes", "내가 적어 둔 일정", "나의 어린이집 일정·준비물을 하루 전과 당일에 알려드려요")}
      `)}
      <h3 class="set-h">알림 표시</h3>
      ${group(`
        ${toggle("badgeOn", "종 아이콘에 숫자 표시", "새 알림 수를 보여줘요")}
        ${toggle("quietOn", "조용한 시간", "이 시간엔 숫자를 숨겨요. 알림 목록에는 그대로 쌓여요")}
        <div class="set-row set-time"><b>시간</b><span>${hours("quietFrom")}<span aria-hidden="true"> ~ </span>${hours("quietTo")}</span></div>
      `)}
      <h3 class="set-h">앱 밖 알림 (준비 중)</h3>
      ${group(`
        ${serverRow("내 활동 알림", "학부모 인증·댓글·학부모 모임 새 글")}
        ${serverRow("이벤트·혜택 알림 (광고성)", "별도 동의 후 발송 · 밤 9시~아침 8시에는 보내지 않아요")}
      `)}
      <h3 class="set-h">알림이 안 올 때</h3>
      ${group(`
        <div class="set-row col"><span><b>지금 점검하기</b><small>꺼 둔 항목과 아이 정보, 관심 어린이집, 브라우저 알림 권한을 확인해요</small></span>
          <button type="button" class="btn" data-check>점검하기</button></div>
        <div class="set-result" id="setCheckOut" role="status" aria-live="polite" hidden></div>
      `)}`;
  }

  function display() {
    return `${group(`
        <div class="set-row col"><b>화면 모드</b>${seg("theme", [["system", "기기 설정"], ["light", "라이트"], ["dark", "다크"]])}</div>
        <div class="set-row col"><b>글자 크기</b>${seg("fontSize", [["small", "작게"], ["normal", "보통"], ["large", "크게"]])}</div>
        ${toggle("reduceMotion", "움직임 줄이기", "화면 전환 애니메이션을 줄여요")}
      `)}
      <h3 class="set-h">시작할 때</h3>
      ${group(`
        <label class="set-row"><b>처음 열 탭</b><select data-key="startTab">${Object.entries(TAB_NAMES).map(([v, l]) => `<option value="${v}" ${s.startTab === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <div class="set-row col"><b>어린이집 목록 기본 보기</b>${seg("listMode", [["list", "목록"], ["map", "지도"]])}</div>
      `)}`;
  }

  function search() {
    const sidoOpts = [...(document.getElementById("sido")?.options || [])].map((o) => o.value);
    return `${group(`
        <div class="set-row"><span><b>우리 동네</b><small>앱을 열면 이 동네부터 보여드려요</small></span>${window.MYPAGE && MYPAGE.open ? `<button type="button" class="set-val-btn" data-region>${esc(regionText())} ›</button>` : `<span class="set-val">${esc(regionText())}</span>`}</div>
        ${!(window.MYPAGE && MYPAGE.open) ? `<label class="set-row"><b>처음 보여줄 지역</b><select data-key="defaultSido"><option value="">앱 기본값</option>${sidoOpts.map((v) => `<option ${s.defaultSido === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>` : ""}
        <label class="set-row"><b>기본 검색 반경</b>
          <select data-key="defaultRadius">${[["0", "제한 없음"], ["500", "500m"], ["1000", "1km"], ["3000", "3km"]].map(([v, l]) => `<option value="${v}" ${s.defaultRadius === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <div class="set-row col"><b>길찾기 기본 수단</b>${seg("route", [["ask", "매번 묻기"], ["walk", "도보"], ["public", "대중교통"], ["car", "자동차"]])}</div>
      `)}
      <h3 class="set-h">위치</h3>
      ${group(`
        ${toggle("showLocate", "현재 위치로 찾기 사용", "버튼을 누를 때만 위치를 쓰고, 기기 안에서만 계산해요. 서버로 보내지 않아요.")}
        <p class="set-note">위치 권한 자체는 휴대폰(브라우저) 설정에서 바꿀 수 있어요.</p>
        <button type="button" class="set-row link" data-perm><span><b>권한 안내 다시 보기</b><small>위치·사진·카메라·알림을 언제 쓰는지 알려드려요</small></span><span aria-hidden="true">›</span></button>
        <button type="button" class="set-row link" data-applink><span><b>아이사랑 열기 선택 초기화</b><small>"다음부터 묻지 않기"를 취소해요</small></span><span aria-hidden="true">›</span></button>
      `)}`;
  }

  function community() {
    const n = reported();
    return `${group(`
        <div class="set-row"><span><b>신고해서 숨긴 글</b><small>${n ? `${n}개를 숨기고 있어요` : "숨긴 글이 없어요"}</small></span>${n ? `<button type="button" class="btn" data-unhide>모두 다시 보기</button>` : ""}</div>
        ${hiddenList().map((h) => `<div class="set-row"><span><b>${esc(h.title)}</b></span><button type="button" class="btn" data-unhide-one="${esc(h.id)}" aria-label="${esc(h.title)} 다시 보기">다시 보기</button></div>`).join("")}
        ${serverRow("차단한 이웃", "닉네임은 바뀔 수 있어서 서버의 회원 정보가 있어야 안전하게 차단할 수 있어요")}
        <button type="button" class="set-row link" data-policy><span><b>커뮤니티 운영정책</b></span><span aria-hidden="true">›</span></button>
      `)}
      <p class="set-note">글은 개인 의견이며 앱이 보증하지 않아요. 비방·의혹·실명은 신고해 주세요.</p>`;
  }

  function data() {
    const v = myv();
    return `<p class="set-note">관심 ${(v.favs || []).length}곳 · 최근 본 ${(v.recent || []).length}곳 · 평가·체크리스트 ${recordCount()}건<span id="setPhotoCount"></span>. 모두 이 기기에만 저장돼요.</p>
      ${group(`
        <div class="set-row"><span><b>최근 본 기록</b><small>최근 본 어린이집 목록을 지워요</small></span><button type="button" class="btn danger-btn" data-clear="recent" ${(v.recent || []).length ? "" : "disabled"}>지우기</button></div>
        <div class="set-row"><span><b>평가·상담 체크리스트</b><small>이 기기에 저장된 기록 ${recordCount()}건</small></span><button type="button" class="btn danger-btn" data-clear="records" ${recordCount() ? "" : "disabled"}>모두 삭제</button></div>
      `)}
      <h3 class="set-h">백업</h3>
      ${group(`
        <div class="set-row"><span><b>백업 파일 내보내기</b><small>아이 정보가 들어 있어요. 다른 사람과 공유하지 마세요. 사진은 빠져요</small></span><button type="button" class="btn" data-export>내보내기</button></div>
        <div class="set-row"><span><b>백업 파일 가져오기</b><small>기기를 바꿀 때 써요. 같은 항목은 덮어써요</small></span><button type="button" class="btn" data-import>가져오기</button></div>
        <input type="file" id="setImportFile" accept="application/json,.json" hidden>
      `)}
      <h3 class="set-h">모두 지우기</h3>
      ${group(`
        <div class="set-row col set-danger"><span><b>이 기기 데이터 모두 지우기</b><small>가입·인증·아이 정보·관심·평가·사진이 모두 지워지고 되돌릴 수 없어요. 서버에는 처음부터 저장된 게 없어요.</small></span>
          <button type="button" class="btn danger-btn" data-wipe>모두 지우기</button></div>
      `)}
      <p class="set-result" id="setDataOut" role="status" aria-live="polite" hidden></p>`;
  }

  function info() {
    const basis = document.querySelector(".basisDate")?.textContent || "-";
    return `${group(`
        <div class="set-row"><b>앱 버전</b><span class="muted">${APP_VERSION}</span></div>
        <div class="set-row"><b>데이터 기준일</b><span class="muted">${esc(basis)} (매일 갱신)</span></div>
        ${link("데이터 출처", "https://info.childcare.go.kr/", "어린이집정보공개포털(한국사회보장정보원) 어린이집 기본정보 · 공공데이터포털 15083298 · 연장보육 15140061(2024) · 병원·약국·응급실: 국립중앙의료원(공공데이터포털) · 위치 보완: 네이버 지도 주소 검색")}
        ${link("이용약관", "https://kts1103-cmd.github.io/woori-daycare/", "출시 전 공개 예정")}
        ${link("개인정보처리방침", "https://kts1103-cmd.github.io/woori-daycare/", "출시 전 공개 예정")}
        ${link("위치기반서비스 이용약관", "https://kts1103-cmd.github.io/woori-daycare/", "출시 전 공개 예정")}
        ${window.ONBOARD && ONBOARD.open ? `<button type="button" class="set-row link" data-onboard><span><b>처음 안내 다시 보기</b></span><span aria-hidden="true">›</span></button>` : ""}
      `)}
      <p class="set-note">민간에서 개발한 앱이며 정부기관과 관련이 없습니다. 지도 © NAVER Corp.</p>`;
  }

  function profile() {
    const acc = account(), v = myv(), child = v.child;
    const nick = nickOf(), canNick = !!((acc && window.ACCOUNT && ACCOUNT.update) || (window.COMMUNITY && COMMUNITY.setNick));
    const when = acc && acc.createdAt ? new Date(acc.createdAt).toLocaleDateString("ko-KR") : "";
    return `${group(`
        ${canNick ? `<form class="set-row col" data-nickform><span><b>닉네임</b><small>2~12자 · 실명은 피해 주세요 · 커뮤니티 글에 표시돼요</small></span>
          <span class="set-nick"><input type="text" name="nick" value="${esc(nick)}" minlength="2" maxlength="12" autocomplete="off" aria-label="닉네임"><button type="submit" class="btn">저장</button></span>
          <small class="set-result" id="setNickOut" role="status" aria-live="polite" hidden></small></form>` : `<div class="set-row"><span><b>닉네임</b><small>실명은 피해 주세요 · 커뮤니티 글에 표시돼요</small></span><span class="muted">${esc(nick || "-")}</span></div>`}
        <div class="set-row"><span><b>우리 아이</b><small>연·월만 받아요 · 이 기기에만 저장돼요</small></span>${window.MYPAGE && MYPAGE.open ? `<button type="button" class="set-val-btn" data-child>${child ? esc(child.name || "등록됨") : "등록하기"} ›</button>` : ""}</div>
        <div class="set-row"><span><b>가입 방법</b><small>${acc ? `시제품 체험 가입 · 이 기기에만 저장${when ? ` · ${esc(when)}` : ""}` : "아직 가입하지 않았어요"}</small></span>${!acc && window.ACCOUNT && ACCOUNT.openSignup ? `<button type="button" class="btn" data-signup>가입하기</button>` : ""}</div>
        ${serverRow("간편 로그인 연결", "카카오·네이버·Google·Apple")}
        ${acc && window.MYPAGE && MYPAGE.open ? `<button type="button" class="set-row link" data-verify><span><b>학부모 인증 관리</b><small>${(acc.verifications || []).length}곳</small></span><span aria-hidden="true">›</span></button>` : ""}
      `)}
      ${acc && window.ACCOUNT && ACCOUNT.withdraw ? group(`<div class="set-row col set-danger"><span><b>탈퇴하기</b><small>가입·인증 정보와 내 별점 평가가 이 기기에서 지워져요. 관심·아이 정보는 남아요. 전부 지우려면 내 기록·데이터의 "이 기기 데이터 모두 지우기"를 써 주세요.</small></span><button type="button" class="btn danger-btn" data-withdraw>탈퇴하기</button></div>`) : ""}
      ${acc ? group(`<button type="button" class="set-row link" data-logout><span><b>로그아웃</b><small>시제품: 이 기기의 가입·인증 정보가 지워져요</small></span><span aria-hidden="true">›</span></button>`) : ""}
      <h3 class="set-h">받지 않는 정보</h3>
      <p class="set-note">이름·전화번호·생년월일·성별·비밀번호는 받지 않아요. 연령반 계산은 아이의 연·월만으로 충분하고, 로그인은 출시 때 간편 로그인으로 해서 비밀번호를 보관하지 않아요. 필요한 만큼만 받아요.</p>
      <p class="set-note">탈퇴는 <b>내 기록·데이터</b>의 "이 기기 데이터 모두 지우기"로 할 수 있어요. 서버에는 저장된 정보가 없어요.</p>`;
  }

  const VIEWS = { alerts, display, search, community, data, info, profile };

  // 헤더 My 버튼 옆 닉네임 (가입 닉네임 → 커뮤니티 닉네임 순)
  function headerNick() {
    const el = document.getElementById("myNick"); if (!el) return;
    let n = ""; try { n = nickOf(); } catch {}
    el.textContent = n; el.hidden = !n;
    const b = document.getElementById("openMy"); if (b) b.classList.toggle("has-nick", !!n);
    if (b) b.setAttribute("aria-label", n ? `My 페이지, 닉네임 ${n}` : "My page");
  }
  window.APP_SETTINGS.refreshNick = headerNick;
  ["account:changed", "my:changed", "storage"].forEach((ev) => window.addEventListener(ev, headerNick));
  window.addEventListener("load", headerNick);

  // ---- 그리기·연결 ----
  let sub = null, depth = 0, lastFocus = null;
  const css = () => {
    if (document.getElementById("settingsCss")) return;
    const st = document.createElement("style"); st.id = "settingsCss";
    // 임시 스타일 — 모양은 디자인 세션이 index.html에서 덮어쓴다
    st.textContent = `#settings .set-row.nav,#settings .set-row.link,#settings .set-profile{width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer}
#settings .set-row.nav{display:flex;align-items:center;gap:8px;min-height:56px;background:none;border:0;border-bottom:1px solid var(--line)}#settings .set-row.nav>span:first-child{flex:1;min-width:0}#settings .set-val,#settings .set-val-btn{color:var(--muted);font-size:13px}#settings .set-val-btn{min-height:44px;border:0;background:none;font:inherit;color:var(--accent-strong);cursor:pointer}#settings .set-chev{color:var(--muted);font-size:20px}
#settings .set-profile{display:flex;align-items:center;gap:12px;min-height:72px;margin:12px 16px;padding:12px 14px;border:1px solid var(--line);border-radius:var(--r16,16px);background:var(--surface)}#settings .set-profile b{display:block;font-size:16px}#settings .set-profile small{display:block;color:var(--muted);font-size:12px;margin-top:2px}#settings .set-profile>span:nth-child(2){flex:1;min-width:0}
#settings .set-ava{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:var(--accent-subtle);color:var(--accent-strong);font-family:var(--font-cute,inherit);font-size:20px}
#settings .set-row.off{opacity:.55}#settings .set-time select,#settings .set-row select{min-height:44px}#settings .set-result{margin:0 16px 12px;padding:10px 12px;border-radius:var(--r12,12px);background:var(--accent-subtle);font-size:13px;line-height:1.6;white-space:pre-line}
#settings .set-nick{display:flex;gap:8px;width:100%}#settings .set-nick input{flex:1;min-width:0;min-height:44px;padding:0 12px;border:1px solid var(--line);border-radius:var(--r12,12px);background:var(--bg);color:var(--text);font:inherit;font-size:16px}#settings .set-danger .danger-btn{align-self:flex-start}html[data-motion=reduce] *{animation:none!important;transition:none!important}`;
    document.head.appendChild(st);
  };

  function render(name) {
    css();
    sub = VIEWS[name] ? name : null;
    const el = document.getElementById("settings");
    el.innerHTML = `
      <div class="detail-header"><button class="icon-button" data-back aria-label="${sub ? "설정 첫 화면으로" : "설정 닫기"}"><svg class="i" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><h2>${sub ? TITLES[sub] : "설정"}</h2></div>
      <div class="set-body">${sub ? VIEWS[sub]() : home()}</div>`;
    bind(el);
    el.scrollTop = 0; const b = el.querySelector(".set-body"); if (b) b.scrollTop = 0;
  }

  function go(name) { history.pushState({ settings: name }, "", `#settings/${name}`); depth++; render(name); }

  const out = (id, msg) => { const e = document.getElementById(id); if (e) { e.hidden = false; e.textContent = msg; } };
  function arm(btn, label, fn) { // 두 번 눌러 확인
    btn.addEventListener("click", () => {
      if (btn.dataset.armed !== "1") { btn.dataset.armed = "1"; btn.dataset.label = btn.textContent; btn.textContent = label; setTimeout(() => { if (btn.dataset.armed === "1") { btn.dataset.armed = ""; btn.textContent = btn.dataset.label; } }, 4000); return; }
      fn();
    });
  }
  const leaveTo = (fn) => { close(); setTimeout(fn, 30); };

  function bind(el) {
    el.querySelector("[data-back]").addEventListener("click", () => { if (sub) history.back(); else close(); });
    el.querySelectorAll("[data-sub]").forEach((b) => b.addEventListener("click", () => go(b.dataset.sub)));
    el.querySelectorAll(".set-seg").forEach((g) => g.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      set(g.dataset.key, b.dataset.v);
      g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", x === b));
    })));
    el.querySelectorAll("input.switch[data-key]").forEach((c) => c.addEventListener("change", () => set(c.dataset.key, c.checked)));
    el.querySelectorAll("select[data-key]").forEach((sel) => sel.addEventListener("change", () => set(sel.dataset.key, sel.value)));
    el.querySelector("[data-perm]")?.addEventListener("click", () => leaveTo(() => window.PERMINTRO && PERMINTRO.open()));
    el.querySelector("[data-applink]")?.addEventListener("click", (e) => { if (window.APPLINK) APPLINK.resetChoice(); e.currentTarget.querySelector("small").textContent = "초기화했어요. 다음에 아이사랑을 열 때 다시 물어봐요"; });
    el.querySelector("[data-region]")?.addEventListener("click", () => leaveTo(() => MYPAGE.open("region")));
    el.querySelector("[data-child]")?.addEventListener("click", () => leaveTo(() => MYPAGE.open("child")));
    el.querySelector("[data-verify]")?.addEventListener("click", () => leaveTo(() => MYPAGE.open("verify")));
    el.querySelector("[data-signup]")?.addEventListener("click", () => leaveTo(() => ACCOUNT.openSignup()));
    el.querySelector("[data-onboard]")?.addEventListener("click", () => leaveTo(() => ONBOARD.open()));
    el.querySelector("[data-policy]")?.addEventListener("click", () => leaveTo(() => {
      document.querySelector('nav.tabs [data-view="view-community"]')?.click();
      setTimeout(() => document.querySelector("#view-community [data-policy]")?.click(), 0);
    }));
    el.querySelector("[data-nickform]")?.addEventListener("submit", (e) => {
      e.preventDefault(); const v = e.target.nick.value.trim(); let ok = false;
      if (v.length >= 2 && v.length <= 12) {
        if (account() && window.ACCOUNT && ACCOUNT.update) ok = !!ACCOUNT.update({ nick: v });
        if (window.COMMUNITY && COMMUNITY.setNick) { const r = COMMUNITY.setNick(v); ok = ok || r !== false; }
      }
      out("setNickOut", ok ? "닉네임을 바꿨어요." : "2~12자로 적어 주세요."); if (ok) { headerNick(); const h = el.querySelector(".set-ava"); if (h) h.textContent = v.slice(0, 1); }
    });
    const wd = el.querySelector("[data-withdraw]");
    if (wd) arm(wd, "한 번 더 누르면 탈퇴", () => { if (!confirm("탈퇴하면 가입·인증 정보와 내 별점 평가가 이 기기에서 지워져요. 계속할까요?")) return; ACCOUNT.withdraw(); render("profile"); });
    el.querySelector("[data-logout]")?.addEventListener("click", () => {
      if (!confirm("로그아웃할까요? (시제품: 이 기기의 가입·인증 정보가 지워져요)")) return;
      ACCOUNT.logout(); render("profile");
    });
    el.querySelectorAll("[data-unhide-one]").forEach((b) => b.addEventListener("click", () => { try { COMMUNITY.unhide(b.dataset.unhideOne); } catch {} render("community"); }));
    el.querySelector("[data-unhide]")?.addEventListener("click", () => {
      if (window.COMMUNITY && COMMUNITY.hidden) { try { COMMUNITY.hidden().forEach((h) => COMMUNITY.unhide(h.id)); } catch {} render("community"); return; }
      try { const c = jget("community:v1", null); if (c) { c.reported = []; localStorage.setItem("community:v1", JSON.stringify(c)); } } catch {}
      render("community");
    });
    // 알림이 안 올 때 점검
    el.querySelector("[data-check]")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try { if (window.NOTIFY) { await NOTIFY.check(true); await NOTIFY.checkMine(true); } } catch {}
      const v = myv(), lines = [], off = NOTI_KEYS.filter((k) => !s[k]).length;
      lines.push(off ? `꺼 둔 알림 항목이 ${off}개 있어요.` : "알림 항목은 모두 켜져 있어요.");
      if (!v.child) lines.push("일정·검진 알림은 아이 정보가 있어야 해요. 프로필·계정에서 등록해 주세요.");
      if (!(v.favs || []).length) lines.push("정원·등록대기 알림은 관심 어린이집(♡)이 있어야 해요.");
      if (!v.mine) lines.push("나의 어린이집 알림은 나의 어린이집을 등록해야 해요.");
      const perm = "Notification" in window ? ({ granted: "허용됨", denied: "차단됨", default: "아직 묻지 않음" }[Notification.permission] || "") : "지원 안 함";
      lines.push(`브라우저 알림 권한: ${perm}. 앱 밖 알림은 출시 후에 허용을 요청해요.${perm === "차단됨" ? " 브라우저 설정 › 사이트 권한에서 바꿀 수 있어요." : ""}`);
      out("setCheckOut", lines.join("\n")); btn.disabled = false;
    });
    // 내 기록·데이터
    el.querySelectorAll("[data-clear]").forEach((b) => arm(b, "한 번 더 누르면 삭제", () => {
      if (b.dataset.clear === "recent") { try { const m = myv(); m.recent = []; localStorage.setItem("my:v1", JSON.stringify(m)); window.dispatchEvent(new Event("my:changed")); } catch {} }
      else { try { const keys = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (DATA_PREFIX.test(k)) keys.push(k); } keys.forEach((k) => localStorage.removeItem(k)); } catch {} }
      render("data");
    }));
    const pc = el.querySelector("#setPhotoCount");
    if (pc && window.PHOTO_STORE && PHOTO_STORE.count) PHOTO_STORE.count().then((n) => { if (n && pc.isConnected) pc.textContent = ` · 사진 ${n}장`; }).catch(() => {});
    el.querySelector("[data-export]")?.addEventListener("click", () => {
      const d = new Date(), name = `saessak-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.json`;
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(exportAll())], { type: "application/json" })); a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      out("setDataOut", `${name} 파일을 만들었어요. 아이 정보가 들어 있으니 안전한 곳에 보관하세요.`);
    });
    const file = el.querySelector("#setImportFile");
    el.querySelector("[data-import]")?.addEventListener("click", () => file.click());
    file?.addEventListener("change", async () => {
      const f = file.files[0]; if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        if (!confirm("백업 파일의 내용으로 이 기기의 같은 항목을 덮어써요. 계속할까요?")) return;
        const n = importAll(obj); out("setDataOut", `${n}개 항목을 가져왔어요. 화면을 새로 불러와요.`); setTimeout(() => location.reload(), 900);
      } catch (e) { out("setDataOut", `가져오지 못했어요: ${e.message === "백업 파일이 아니에요" ? e.message : "파일을 읽을 수 없어요"}`); }
      file.value = "";
    });
    const wipe = el.querySelector("[data-wipe]");
    if (wipe) arm(wipe, "한 번 더 누르면 모두 삭제", async () => {
      if (!confirm("가입·인증·아이 정보·관심·평가·사진이 모두 지워져요. 되돌릴 수 없어요. 정말 지울까요?")) return;
      await wipeAll(); location.reload();
    });
  }

  function open(name) {
    lastFocus = document.activeElement;
    const el = document.getElementById("settings");
    if (el.hidden) { depth = 0; history.pushState({ settings: name || "" }, "", name ? `#settings/${name}` : "#settings"); depth = 1; }
    else if (name && name !== sub) { go(name); return; }
    render(name);
    el.hidden = false;
    document.body.classList.add("settings-mode");
    el.querySelector("[data-back]").focus();
  }
  function hide() {
    const el = document.getElementById("settings"); if (el.hidden) return;
    el.hidden = true; document.body.classList.remove("settings-mode"); sub = null; depth = 0;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function close() { if (depth > 0) history.go(-depth); else hide(); } // 쌓인 기록만큼 되돌아가면 popstate에서 닫힌다

  window.addEventListener("popstate", () => {
    const el = document.getElementById("settings"); if (!el || el.hidden) return;
    const m = location.hash.match(/^#settings(?:\/(\w+))?$/);
    if (!m) { hide(); return; }
    depth = m[1] ? 2 : 1; render(m[1]);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("settings-mode")) { if (sub) history.back(); else close(); } });
  if (/^#settings/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("openSettings");
    if (btn) btn.addEventListener("click", () => open());
  });
})();
