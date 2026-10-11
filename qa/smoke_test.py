"""앱을 실제 브라우저(Chromium)로 열어 핵심 동작을 확인한다.

사용법:  python -I qa/smoke_test.py http://localhost:8000/app/ [report.md]
필요:    pip install playwright && playwright install chromium
종료코드: 0 = 통과, 1 = 실패
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

url = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else None
results = []  # (통과 여부, 설명)


def check(ok, msg):
    results.append((bool(ok), msg))


with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, vp in (("데스크톱", {"width": 1280, "height": 900}), ("모바일", {"width": 375, "height": 812})):
        page = browser.new_page(viewport=vp)
        # 네이버 지도는 등록 도메인에서만 인증되므로 테스트에서는 막고 목록 화면만 점검한다
        page.route("**/*map.naver.com/**", lambda r: r.abort())
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        # 네이버 지도 인증은 등록 도메인에서만 통과하므로 테스트 서버(localhost)에서는 제외
        page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(m.text))
        page.on("response", lambda r: r.status >= 400 and "map.naver" not in r.url and errors.append(f"HTTP {r.status} {r.url}"))
        try:
            page.goto(url, wait_until="networkidle", timeout=60000)
            page.click('.segments [data-mode="list"]')  # 지도 키가 있으면 지도 모드로 시작하므로 목록으로 전환
            page.wait_for_selector('[aria-label$="상세 보기"]', timeout=30000)
            count = page.text_content("#count") or ""
            check("곳" in count and not count.startswith("조건에 맞는 어린이집 0곳"), f"[{name}] 목록 표시: {count}")
            check(page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"[{name}] 가로 넘침 없음")

            if name == "데스크톱":
                # 검색
                page.fill("#q", "어린이집")
                page.wait_for_timeout(500)
                check("곳" in (page.text_content("#count") or ""), "검색 동작")
                page.fill("#q", "<img src=x onerror=window.__xss=1>")
                page.wait_for_timeout(500)
                check(not page.evaluate("window.__xss"), "검색어 XSS 차단")
                page.fill("#q", "")
                page.wait_for_timeout(500)
                # 상세 화면
                page.click('[aria-label$="상세 보기"] >> nth=0')
                page.wait_for_timeout(500)
                check(page.evaluate("location.hash") == "#detail", "상세 화면 열림")
                page.go_back()
                page.wait_for_timeout(500)
                # 하단 탭 5개 + 나의 어린이집 탭
                vis = page.evaluate("[...document.querySelectorAll('nav.tabs [role=tab]')].filter(b => b.offsetParent).length")  # 숨은 탭(가이드·위반)은 메뉴에서 연다
                check(vis == 5, f"보이는 하단 탭 {vis}개 (기대 5)")
                page.click('nav.tabs [data-view="view-mine"]')
                page.wait_for_timeout(500)
                check(page.evaluate("document.getElementById('view-mine').classList.contains('active')"), "나의 어린이집 탭 열림")
                page.click('nav.tabs [role="tab"] >> nth=0')
                page.wait_for_timeout(300)
                # 알림 버튼
                if page.locator("#openAlerts").count():
                    page.click("#openAlerts")
                    page.wait_for_timeout(500)
                    check(page.evaluate("!!document.querySelector('dialog[open], .mypage, [role=dialog]')"), "알림 화면 열림")
                    page.keyboard.press("Escape")
                    page.go_back() if page.evaluate("location.hash") else None
                    page.wait_for_timeout(300)
                else:
                    check(False, "알림 버튼(#openAlerts) 없음")
                # 처음 실행 시작 흐름 (자동화 브라우저는 건너뛰므로 ?onboard=1 로 강제)
                p2 = browser.new_page(viewport=vp)
                p2.route("**/*map.naver.com/**", lambda r: r.abort())
                p2.goto(url + ("&" if "?" in url else "?") + "onboard=1", wait_until="networkidle", timeout=60000)
                p2.wait_for_timeout(800)
                check(p2.locator("#onboard").count() > 0, "시작 흐름(#onboard) 표시")
                p2.close()                # 지역 전환: 시트에서 다른 시·도 선택
                before = page.text_content("#regionLabel")
                page.click("#regionBtn")
                page.click("#sheet [data-sido] >> nth=0")
                page.wait_for_selector("#sheet [data-sgg]", timeout=30000)
                page.click("#sheet [data-sgg] >> nth=0")
                page.wait_for_timeout(1000)
                after = page.text_content("#regionLabel")
                check(after != before and "곳" in (page.text_content("#count") or ""), f"지역 전환: {before} → {after}")
        except Exception as e:
            check(False, f"[{name}] 테스트 중단: {e}")
        check(not errors, f"[{name}] 콘솔/네트워크 오류 없음" + (f" — {errors[:3]}" if errors else ""))
        page.close()
    browser.close()

lines = ["## 앱 화면 점검", ""] + [f"- {'✅' if ok else '❌'} {m}" for ok, m in results]
text = "\n".join(lines) + "\n"
print(text)
if out:
    with open(out, "w", encoding="utf-8") as f:
        f.write(text)
sys.exit(0 if all(ok for ok, _ in results) else 1)
