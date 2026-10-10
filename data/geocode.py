"""좌표가 없는 어린이집을 주소로 네이버 Geocoding API에 조회해 채운다.

- 키는 환경변수 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (GitHub Secrets)에서만 읽는다. 키가 없으면 건너뛴다.
- 어린이집 주소만 보낸다 (사용자 위치는 보내지 않음).
- 결과는 data/geocode_cache.json에 저장해 같은 주소를 다시 조회하지 않는다.

사용법: python -I data/geocode.py app/data
"""
import glob, json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(ROOT, "geocode_cache.json")
URL = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query="
MAX_PER_RUN = 500  # 하루 호출 상한 (무료 이용량 보호)


def lookup(addr, key_id, key):
    req = urllib.request.Request(URL + urllib.parse.quote(addr), headers={
        "x-ncp-apigw-api-key-id": key_id, "x-ncp-apigw-api-key": key, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        res = json.load(r)
    a = (res.get("addresses") or [None])[0]
    return (float(a["y"]), float(a["x"])) if a else None


def main(app_data):
    key_id, key = os.environ.get("NAVER_CLIENT_ID"), os.environ.get("NAVER_CLIENT_SECRET")
    if not key_id or not key:
        print("geocode: NAVER_CLIENT_ID/SECRET 없음 → 건너뜀")
        return
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    calls = filled = 0
    for f in sorted(glob.glob(os.path.join(app_data, "sido_*.json"))):
        rows = json.load(open(f, encoding="utf-8"))
        changed = False
        for d in rows:
            if d.get("lat") or not d.get("addr"):
                continue
            addr = d["addr"]
            if addr not in cache and calls < MAX_PER_RUN:
                try:
                    hit = lookup(addr, key_id, key)
                except Exception as e:  # 한 건 실패로 전체를 멈추지 않는다
                    print("geocode 실패:", type(e).__name__)
                    hit = None
                cache[addr] = list(hit) if hit else None
                calls += 1
                time.sleep(0.1)
            if cache.get(addr):
                d["lat"], d["lng"] = cache[addr]
                d["geocoded"] = True  # 공공데이터 원본 좌표가 아니라 주소로 추정한 좌표
                changed = True
                filled += 1
        if changed:
            json.dump(rows, open(f, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"geocode: 조회 {calls}건, 좌표 채움 {filled}곳")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "app", "data"))
