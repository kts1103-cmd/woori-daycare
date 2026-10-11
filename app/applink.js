// 아이사랑 앱 연결 (휴대폰에서만)
// 아이사랑(www.childcare.go.kr) 링크를 누르면 "웹으로 바로 / 아이사랑 앱으로" 중 고르게 한다.
// - 웹: 등록대기 등 해당 메뉴로 바로 이동 (기본, 추천)
// - 앱: 공식 '아이사랑 모바일' 첫 화면. 앱이 없으면 스토어로 이동.
//   Android 패키지 com.mw.Android_KidsLove2, iOS App Store id490070696 (2026-10 확인, 교육부 영유아안전정보과)
//   공공 앱이라 특정 메뉴로 바로 가는 앱 링크는 공개되어 있지 않아 첫 화면까지만 연다.
(function () {
  const ANDROID_PKG = "com.mw.Android_KidsLove2";
  const PLAY = `https://play.google.com/store/apps/details?id=${ANDROID_PKG}`;
  const IOS_STORE = "https://apps.apple.com/kr/app/id490070696";
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isAndroid && !isIOS) return; // PC에서는 지금처럼 웹으로 연다
  const PREF = "applink:childcare"; // "web" | "app" — 다음부터 묻지 않기
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function openApp() {
    if (isAndroid) {
      // 설치되어 있으면 앱 실행, 없으면 플레이스토어
      location.href = `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${ANDROID_PKG};S.browser_fallback_url=${encodeURIComponent(PLAY)};end`;
    } else {
      // iOS는 공개된 앱 스킴이 없어 App Store로 연다 (설치되어 있으면 App Store에 '열기' 버튼이 보임)
      location.href = IOS_STORE;
    }
  }
  const openWeb = (url) => window.open(url, "_blank", "noopener");

  function choose(url, label) {
    const sh = document.getElementById("sheet");
    if (!sh) return openWeb(url);
    sh.setAttribute("aria-label", "아이사랑 열기");
    sh.innerHTML = `<div class="sheet-top"><h2>아이사랑에서 열기</h2><button class="icon-button" data-close aria-label="닫기"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div>
      <p class="sheet-copy">${label ? `<b>${esc(label)}</b> 화면으로 가요. ` : ""}앱은 첫 화면까지만 열 수 있어서, 메뉴로 바로 가려면 웹을 추천해요.</p>
      <div class="sheet-options applink-opts">
        <button data-web><span><b>웹으로 바로 열기</b><small>추천 · 해당 메뉴로 바로 이동</small></span>↗</button>
        <button data-app><span><b>아이사랑 앱으로 열기</b><small>${isAndroid ? "앱 첫 화면 · 없으면 플레이스토어" : "App Store에서 열기·설치"}</small></span>📱</button>
      </div>
      <label class="check applink-remember"><input type="checkbox" data-remember>다음부터 묻지 않기</label>`;
    const remember = (v) => { if (sh.querySelector("[data-remember]").checked) try { localStorage.setItem(PREF, v); } catch {} };
    sh.querySelector("[data-close]").addEventListener("click", () => sh.close());
    sh.querySelector("[data-web]").addEventListener("click", () => { remember("web"); sh.close(); openWeb(url); });
    sh.querySelector("[data-app]").addEventListener("click", () => { remember("app"); sh.close(); openApp(); });
    if (!sh.open) sh.showModal();
  }

  // 앱 안의 모든 아이사랑 링크(상세·입소 가이드·타임라인 등)를 한곳에서 처리
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="https://www.childcare.go.kr"]');
    if (!a || e.defaultPrevented || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    let pref = null; try { pref = localStorage.getItem(PREF); } catch {}
    if (pref === "web") return openWeb(a.href);
    if (pref === "app") return openApp();
    choose(a.href, (a.textContent || "").replace(/[📮↗]/g, "").trim().slice(0, 30));
  }, true);

  window.APPLINK = { resetChoice() { try { localStorage.removeItem(PREF); } catch {} } };
})();
