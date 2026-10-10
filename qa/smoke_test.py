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
            page.wait_for_selector('button[aria-label$="상세 보기"]', timeout=30000)
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
                page.click('button[aria-label$="상세 보기"] >> nth=0')
                page.wait_for_timeout(500)
                check(page.evaluate("location.hash") == "#detail", "상세 화면 열림")
                page.go_back()
                page.wait_for_timeout(500)
                # 지역 전환: 시트에서 다른 시·도 선택
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
