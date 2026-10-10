"""좌표가 없거나 잘못된 어린이집을 주소로 네이버 Geocoding API에 조회해 채운다.

- 키는 환경변수 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (GitHub Secrets)에서만 읽는다. 키가 없으면 조회는 건너뛴다.
- 어린이집 주소만 보낸다 (사용자 위치는 보내지 않음).
- 결과는 data/geocode_cache.json에 저장해 같은 주소를 다시 조회하지 않는다.
- 공공데이터에는 좌표를 모를 때 서울시청 좌표(37.56647, 126.977963)를 넣은 곳이 있고,
  자기 시·도에서 크게 벗어난 좌표도 있다. 이런 좌표는 "없음"으로 보고 주소로 다시 찾는다.
  다시 찾은 좌표도 시·도 범위를 벗어나면 버린다 (잘못된 위치보다 표시하지 않는 편이 낫다).

사용법: python -I data/geocode.py app/data
"""
import glob, json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(ROOT, "geocode_cache.json")
URL = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query="
MAX_PER_RUN = 500  # 하루 호출 상한 (무료 이용량 보호)
PLACEHOLDER = (37.56647, 126.977963)  # 서울시청: 원본 데이터의 "좌표 모름" 대체값
KOREA = (33.0, 38.7, 124.5, 132.0)    # 위도 최소/최대, 경도 최소/최대
MAX_DLAT, MAX_DLNG = 1.2, 1.4         # 시·도 중앙값에서 이만큼 넘게 떨어지면 잘못된 좌표로 본다


def lookup(addr, key_id, key):
    req = urllib.request.Request(URL + urllib.parse.quote(addr), headers={
        "x-ncp-apigw-api-key-id": key_id, "x-ncp-apigw-api-key": key, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        res = json.load(r)
    a = (res.get("addresses") or [None])[0]
    return (float(a["y"]), float(a["x"])) if a else None


def is_placeholder(lat, lng):
    return abs(lat - PLACEHOLDER[0]) < 0.0002 and abs(lng - PLACEHOLDER[1]) < 0.0002


def in_korea(lat, lng):
    return KOREA[0] <= lat <= KOREA[1] and KOREA[2] <= lng <= KOREA[3]


def center_of(rows):
    """시·도 파일 하나의 중앙값 좌표 (대체값·국외 좌표는 빼고 계산)."""
    pts = [(d["lat"], d["lng"]) for d in rows if d.get("lat") and d.get("lng")
           and in_korea(d["lat"], d["lng"]) and not is_placeholder(d["lat"], d["lng"])]
    if not pts:
        return None
    lats, lngs = sorted(p[0] for p in pts), sorted(p[1] for p in pts)
    return lats[len(lats) // 2], lngs[len(lngs) // 2]


def plausible(lat, lng, center):
    if not in_korea(lat, lng) or is_placeholder(lat, lng):
        return False
    return center is None or (abs(lat - center[0]) <= MAX_DLAT and abs(lng - center[1]) <= MAX_DLNG)


def main(app_data):
    key_id, key = os.environ.get("NAVER_CLIENT_ID"), os.environ.get("NAVER_CLIENT_SECRET")
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    calls = filled = cleared = 0
    for f in sorted(glob.glob(os.path.join(app_data, "sido_*.json"))):
        rows = json.load(open(f, encoding="utf-8"))
        center = center_of(rows)
        changed = False
        for d in rows:
            # 1) 잘못된 원본 좌표는 없는 것으로 처리
            if d.get("lat") and d.get("lng") and not plausible(d["lat"], d["lng"], center):
                d["lat"] = d["lng"] = None
                d.pop("geocoded", None)
                changed = True
                cleared += 1
            if d.get("lat") or not d.get("addr"):
                continue
            # 2) 주소로 다시 찾기
            addr = d["addr"]
            if addr not in cache and key_id and key and calls < MAX_PER_RUN:
                try:
                    hit = lookup(addr, key_id, key)
                except Exception as e:  # 한 건 실패로 전체를 멈추지 않는다
                    print("geocode 실패:", type(e).__name__)
                    hit = None
                cache[addr] = list(hit) if hit else None
                calls += 1
                time.sleep(0.1)
            hit = cache.get(addr)
            if hit and plausible(hit[0], hit[1], center):
                d["lat"], d["lng"] = hit
                d["geocoded"] = True  # 공공데이터 원본 좌표가 아니라 주소로 찾은 좌표
                changed = True
                filled += 1
        if changed:
            json.dump(rows, open(f, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    if not key_id or not key:
        print("geocode: NAVER_CLIENT_ID/SECRET 없음 → 새 주소 조회는 건너뜀 (캐시만 사용)")
    print(f"geocode: 잘못된 원본 좌표 {cleared}곳 제거, 조회 {calls}건, 좌표 채움 {filled}곳")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "app", "data"))
