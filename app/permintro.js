// 처음 실행 권한 안내 (앱개발). 필수 권한 0개 · 선택 권한 4개, 거부해도 앱을 쓸 수 있다.
// 이 화면은 안내만 한다: 실제 허용 창은 기능을 쓰는 순간에 뜬다 (위치=현재 위치 버튼, 사진·카메라=사진 올릴 때, 알림=출시 후).
// 저장: localStorage "permintro:v1" = 확인한 날짜. 자동화 브라우저(점검)에서는 건너뛰고, ?perm=1 로 강제 표시.
(function () {
  const KEY = "permintro:v1";
  const $ = (id) => document.getElementById(id);
  const get = () => { try { return localStorage.getItem(KEY); } catch { return "x"; } };
  const set = () => { try { localStorage.setItem(KEY, new Date().toISOString().slice(0, 10)); } catch {} };
  const ITEMS = [
    ["📍", "위치", "내 주변 어린이집을 찾고 길찾기에 써요. 버튼을 누를 때만 쓰고, 기기 안에서만 계산해요.", "거부해도 지역을 직접 골라 찾을 수 있어요."],
    ["🖼️", "사진", "학부모 인증 서류나 원장 등록 사진처럼 직접 고른 사진을 올릴 때만 써요.", "거부해도 사진 없이 다른 기능을 쓸 수 있어요."],
    ["📷", "카메라", "인증 서류를 바로 촬영할 때만 써요.", "거부해도 갤러리에서 고를 수 있어요."],
    ["🔔", "알림", "입소 일정·관심 어린이집 변화를 앱 밖에서도 알려드려요. 지금은 앱 안 알림만 제공하고, 앱 밖 알림은 출시 후 허용을 요청해요.", "거부해도 앱 안 알림은 그대로 받아요."],
  ];
  let root = null;
  function css() {
    if ($("permCss")) return;
    const s = document.createElement("style"); s.id = "permCss";
    s.textContent = `#permIntro{z-index:40;overflow-y:auto}#permIntro .pi-body{padding:24px 20px 12px;display:flex;flex-direction:column;gap:14px}
#permIntro h2{margin:0;font-family:var(--font-cute,inherit);font-weight:400;font-size:24px;line-height:1.3}#permIntro .pi-lead{margin:0;color:var(--muted);font-size:14px;line-height:1.55}
#permIntro .pi-row{display:flex;gap:12px;padding:14px;border:1px solid var(--line);border-radius:var(--r16,16px);background:var(--surface)}#permIntro .pi-ic{flex:none;width:40px;height:40px;display:grid;place-items:center;border-radius:50%;background:var(--accent-subtle);font-size:20px}
#permIntro .pi-row b{font-family:var(--font-cute,inherit);font-weight:400;font-size:16px}#permIntro .pi-row em{margin-left:6px;font-style:normal;font-size:12px;color:var(--accent-strong);background:var(--accent-soft);border-radius:99px;padding:1px 8px}
#permIntro .pi-row p{margin:4px 0 0;font-size:13px;line-height:1.5}#permIntro .pi-row small{display:block;margin-top:4px;color:var(--muted);font-size:12px;line-height:1.45}
#permIntro .pi-foot{position:sticky;bottom:0;padding:12px 20px calc(16px + env(safe-area-inset-bottom));background:linear-gradient(transparent,var(--bg) 30%)}#permIntro .pi-go{width:100%;min-height:52px;border:0;border-radius:var(--r16,16px);background:var(--accent);color:#fff;font-family:var(--font-cute,inherit);font-size:18px;cursor:pointer}`;
    document.head.appendChild(s);
  }
  function open(first) {
    css();
    if (!root) { root = document.createElement("div"); root.id = "permIntro"; root.className = "mypage"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "권한 안내"); document.body.appendChild(root); }
    root.innerHTML = `<div class="pi-body">
        <h2>이런 권한을 쓸 수 있어요</h2>
        <p class="pi-lead">모두 <b>선택</b>이에요. 허용하지 않아도 어린이집 찾기·비교는 그대로 쓸 수 있어요. 허용 창은 기능을 쓰는 순간에 따로 떠요.</p>
        ${ITEMS.map(([ic, n, why, no]) => `<div class="pi-row"><span class="pi-ic" aria-hidden="true">${ic}</span><span><b>${n}</b><em>선택</em><p>${why}</p><small>${no}</small></span></div>`).join("")}
        <p class="pi-lead">권한은 휴대폰(브라우저) 설정에서 언제든 바꿀 수 있어요. 이 화면은 설정에서 다시 볼 수 있어요.</p>
      </div>
      <div class="pi-foot"><button type="button" class="pi-go">${first ? "시작하기" : "확인"}</button></div>`;
    root.hidden = false; document.body.style.overflow = "hidden";
    const go = root.querySelector(".pi-go");
    go.addEventListener("click", () => { set(); root.hidden = true; document.body.style.overflow = ""; });
    go.focus();
  }
  window.PERMINTRO = { open: () => open(false) };
  const q = new URLSearchParams(location.search).get("perm") === "1";
  const start = () => { if (q || (!get() && !navigator.webdriver)) open(true); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
