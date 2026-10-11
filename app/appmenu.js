// 전체메뉴 (디자인): 앱의 모든 기능을 목적별로 모아 보여주는 탭. 하단 탭은 5개(찾기·나의 어린이집·병원 찾기·커뮤니티·전체메뉴),
// 입소 가이드·위반시설은 탭에서 빼고(hidden 탭 버튼은 남겨 둠) 여기서 연다. 외부 링크는 새 창(↗), 아이사랑 링크는 applink.js가 웹/앱 선택을 띄운다.
(function () {
  const $ = (id) => document.getElementById(id);
  const CC = "https://www.childcare.go.kr/?menuno=";
  const tabs = () => [...document.querySelectorAll("nav.tabs button")];
  const menuTab = () => document.querySelector('nav.tabs [data-view="view-menu"]');

  // 탭 없이 열린 화면(입소 가이드·위반시설·육아 정보)이면 전체메뉴 탭을 선택 상태로 둔다
  function sync() {
    const sel = tabs().find((b) => b.getAttribute("aria-selected") === "true");
    if (sel && !sel.hidden) return;
    if (sel) sel.setAttribute("aria-selected", "false");
    menuTab()?.setAttribute("aria-selected", "true");
  }
  const goTab = (view) => { document.querySelector(`nav.tabs [data-view="${view}"]`)?.click(); setTimeout(sync, 0); window.scrollTo(0, 0); document.querySelector("main")?.scrollTo?.(0, 0); };
  const click = (id) => $(id)?.click();

  // [아이콘, 이름, 동작, 칩 색]  동작: "tab:view-x" | "link:url" | "do:이름"
  const GROUPS = [
    ["어린이집 찾기", [
      ["🔍", "어린이집 찾기", "tab:view-map", "mint"], ["🗺️", "지도로 보기", "do:map", "mint"],
      ["🏠", "나의 어린이집", "tab:view-mine", "mint"], ["❤️", "관심·비교", "do:my", "pink"],
    ]],
    ["입소·신청", [
      ["📋", "입소 가이드", "tab:view-guide", "blue"], ["🗓️", "입소 타임라인", "do:timeline", "blue"],
      ["📮", "등록대기 신청", "link:" + CC + "175", "blue"], ["🔎", "내 등록대기 현황", "link:" + CC + "178", "blue"],
      ["⏱️", "시간제보육 신청", "link:" + CC + "242", "blue"], ["💳", "국민행복카드", "link:" + CC + "181", "blue"],
    ]],
    ["우리 아이", [
      ["👶", "우리 아이 정보", "do:child", "yellow"], ["🎀", "지원금 확인", "do:parenting", "yellow"],
      ["📈", "월령별 성장·돌보기", "link:" + CC + "293", "yellow"], ["📝", "일정·준비물 메모", "tab:view-mine", "yellow"],
    ]],
    ["건강·급할 때", [
      ["🏥", "병원·약국·응급실", "tab:view-hospital", "teal"], ["🌙", "밤에 아플 때", "tab:view-hospital", "teal"],
      ["🍼", "수유실 찾기", "link:https://sooyusil.com/", "teal"],
    ]],
    ["소통", [
      ["💬", "커뮤니티", "tab:view-community", "purple"], ["👥", "학부모 모임", "tab:view-mine", "purple"],
    ]],
    ["안전·권리", [
      ["🛡️", "위반시설·행위자", "tab:view-violation", "red"], ["📢", "이용 불편신고", "link:" + CC + "215", "red"],
    ]],
    ["내 정보·설정", [
      ["👤", "My 페이지", "do:my", "mint"], ["🔔", "알림", "do:alerts", "mint"],
      ["🪪", "학부모 인증", "do:verify", "mint"], ["⚙️", "설정", "do:settings", "mint"],
    ]],
  ];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function render() {
    const el = $("menuAll"); if (!el) return;
    el.innerHTML = `<h2>전체메뉴</h2>` + GROUPS.map(([g, items]) => `<section class="menu-group" aria-label="${esc(g)}"><h3>${esc(g)}</h3><div class="menu-grid">${items.map(([ic, name, act, tone]) => {
      const ext = act.startsWith("link:");
      const inner = `<span class="menu-ic ${tone}" aria-hidden="true">${ic}</span><span class="menu-name">${esc(name)}</span>${ext ? `<span class="menu-ext" aria-hidden="true">↗</span>` : ""}`;
      return ext ? `<a class="menu-item" href="${esc(act.slice(5))}" target="_blank" rel="noopener">${inner}</a>` : `<button type="button" class="menu-item" data-act="${esc(act)}">${inner}</button>`;
    }).join("")}</div></section>`).join("") + `<p class="src-line">↗ 표시는 아이사랑·복지로 등 공식 사이트로 연결돼요. 이 앱은 정부 앱이 아니에요.</p>`;
    el.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => run(b.dataset.act)));
  }

  function run(act) {
    const [kind, arg] = [act.slice(0, act.indexOf(":")), act.slice(act.indexOf(":") + 1)];
    if (kind === "tab") return goTab(arg);
    const later = (fn, ms = 60) => setTimeout(fn, ms);
    if (arg === "map") { // 설정의 "처음 보여줄 지역"(없으면 지금 지역)으로 지도를 연다
      goTab("view-map");
      const pref = window.APP_SETTINGS ? APP_SETTINGS.get() : {};
      if (pref.defaultSido && window.APP && APP.setRegion) APP.setRegion(pref.defaultSido, pref.defaultCity || "");
      later(() => [...document.querySelectorAll("#view-map .segments button")].find((b) => /지도/.test(b.textContent))?.click(), 200);
    }
    else if (arg === "my") click("openMy");
    else if (arg === "alerts") click("openAlerts");
    else if (arg === "settings") click("openSettings");
    else if (arg === "timeline") window.TIMELINE && TIMELINE.open();
    else if (arg === "child") window.MYPAGE && MYPAGE.open("child");
    else if (arg === "parenting") { window.openParenting && openParenting(); sync(); }
    else if (arg === "verify") window.ACCOUNT && ACCOUNT.openVerify();
  }

  const start = () => {
    render();
    tabs().forEach((b) => b.addEventListener("click", () => setTimeout(sync, 0)));
    const op = window.openParenting; if (op) window.openParenting = () => { op(); sync(); };
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
