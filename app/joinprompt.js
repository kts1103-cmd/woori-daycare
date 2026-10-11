// 필요한 순간의 가입 권유 (앱개발). 강제하지 않고, 같은 권유는 한 번만 (닫으면 14일 동안 다시 안 띄움).
// 순간: 관심 어린이집 3곳째를 담았을 때. (알림 센터의 권유 카드는 notify.js, 평가·글쓰기는 원래 가입이 필요)
// 저장: localStorage "joinprompt:v1" {kind: 마지막으로 보여 준 시각}
(function () {
  const KEY = "joinprompt:v1", QUIET = 14 * 864e5;
  const $ = (id) => document.getElementById(id);
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
  const mark = (k) => { try { const v = load(); v[k] = Date.now(); localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
  const favCount = () => { try { return (JSON.parse(localStorage.getItem("my:v1") || "{}").favs || []).length; } catch { return 0; } };
  const member = () => !!(window.ACCOUNT && ACCOUNT.isMember());
  const MSG = {
    fav3: { ic: "♡", title: "관심 어린이집을 3곳 담았어요", body: "가입해 두면 휴대폰을 바꿔도 관심 목록이 남고, 자리가 생기면 앱 밖에서도 알려드려요 (출시 후)." },
  };
  function css() {
    if ($("joinPromptCss")) return;
    const s = document.createElement("style"); s.id = "joinPromptCss";
    s.textContent = `#joinPrompt{position:fixed;left:0;right:0;bottom:0;z-index:30;max-width:480px;margin:0 auto;padding:20px 20px calc(16px + env(safe-area-inset-bottom));border-radius:20px 20px 0 0;background:var(--surface);color:var(--text);box-shadow:0 -8px 24px rgba(0,0,0,.12);display:grid;gap:10px}
#joinPrompt .jp-ic{font-size:28px;line-height:1;color:var(--accent)}#joinPrompt b{font-family:var(--font-cute,inherit);font-weight:400;font-size:18px}#joinPrompt p{margin:0;color:var(--muted);font-size:14px;line-height:1.55}
#joinPrompt .jp-go{min-height:52px;border:0;border-radius:var(--r16,16px);background:var(--accent);color:#fff;font-family:var(--font-cute,inherit);font-size:17px;cursor:pointer}#joinPrompt .jp-no{min-height:44px;border:0;background:none;color:var(--muted);font:inherit;font-size:14px;text-decoration:underline;cursor:pointer}`;
    document.head.appendChild(s);
  }
  function show(kind) {
    const m = MSG[kind]; if (!m || $("joinPrompt")) return;
    css(); mark(kind);
    const el = document.createElement("div"); el.id = "joinPrompt"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "가입 안내");
    el.innerHTML = `<span class="jp-ic" aria-hidden="true">${m.ic}</span><b>${m.title}</b><p>${m.body}</p>
      <button type="button" class="jp-go">가입하고 이어서 보기</button><button type="button" class="jp-no">나중에 할게요</button>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.querySelector(".jp-go").addEventListener("click", () => { close(); if (window.ACCOUNT) ACCOUNT.openSignup(); });
    el.querySelector(".jp-no").addEventListener("click", close);
    el.querySelector(".jp-go").focus();
  }
  function maybe(kind) {
    if (member() || document.querySelector("#onboard:not([hidden]), #permIntro:not([hidden])")) return;
    const at = load()[kind];
    if (at && Date.now() - at < QUIET) return;
    show(kind);
  }
  // 관심 어린이집: 2곳 이하 → 3곳 이상이 되는 순간에만
  let lastFav = favCount();
  window.addEventListener("my:changed", () => {
    const n = favCount();
    if (lastFav < 3 && n >= 3) setTimeout(() => maybe("fav3"), 400); // 하트 애니메이션 뒤
    lastFav = n;
  });
  window.JOINPROMPT = { maybe };
})();
