"""달빛어린이병원·소아청소년과·심야/휴일 약국 → app/data/night_care.json (매일 04:00 갱신 파이프라인에서 실행)

출처: 국립중앙의료원 (공공데이터포털, 이용허락범위 제한 없음)
  - 전국 병·의원 찾기 서비스 HsptlAsembySearchService: getBabyListInfoInqire(달빛어린이병원 및 소아전문센터), getHsptlMdcncListInfoInqire(소아청소년과)
  - 전국 약국 정보 조회 서비스 ErmctInsttInfoInqireService: getParmacyFullDown(전체 약국)
키: 환경변수 DATAGO_KEY (공공데이터포털 일반 인증키 Decoding 값. 저장소에 넣지 않고 GitHub Secrets에만).
키가 없거나 호출이 실패하면 파일을 건드리지 않고 끝난다 (앱은 이 칸을 숨기고 E-Gen 링크 안내로 대신한다).
저장 형식(용량을 줄이려고 짧은 키): {"basis","stat","baby":[...],"peds":[...],"pharm":[...],"er":[...]}  (er: k=응급의료기관 구분, t=응급실 전화, h 없음)
  항목 {n:이름, a:주소, t:전화, la:위도, lo:경도, h:[월,화,수,목,금,토,일,공휴일 각 "0830-1730" 또는 ""], k:종류코드(baby만: 'B' 달빛, 'C' 소아전문센터 등 응답값)}
앱은 시간을 원문 그대로 보여주고 "지금 진료·영업 중"은 (계산)으로 표시한다.
사용법: python -I data/medical.py app/data
가이드(2016) 기준으로 만든 것이라 실제 응답과 다르면 --probe 로 응답을 확인해 고친다: python -I data/medical.py --probe
"""
import datetime, json, os, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

HOSP = "https://apis.data.go.kr/B552657/HsptlAsembySearchService/"
ERMC = "https://apis.data.go.kr/B552657/ErmctInfoInqireService/"
PHARM = "https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/"
PEDS_QD = "D002"  # 진료과목 코드 소아청소년과 (CODE_MST D000). 응답을 확인해 틀리면 고친다
ROWS = 1000


def call(url, key, **p):
    q = urllib.parse.urlencode({"serviceKey": key, **p})
    last = None
    for i in range(3):
        try:
            raw = urllib.request.urlopen(url + "?" + q, timeout=60).read()
            root = ET.fromstring(raw)
            code = (root.findtext("header/resultCode") or "").strip()
            if code not in ("00", "0"):
                raise ValueError(f"{url.rsplit('/', 1)[-1]}: {code} {root.findtext('header/resultMsg')}")
            body = root.find("body")
            total = int(body.findtext("totalCount") or 0)
            items = [{c.tag: (c.text or "").strip() for c in it} for it in body.findall("items/item")]
            return total, items
        except Exception as e:
            last = e; time.sleep(2 + i * 3)
    raise last


def paged(url, key, rows=ROWS, **p):
    out, page = [], 1
    while True:
        total, items = call(url, key, pageNo=page, numOfRows=rows, **p)
        out += items
        if not items or len(out) >= total: return out
        page += 1


def hhmm(v):
    v = (v or "").strip()
    if not v.isdigit(): return ""
    v = v.zfill(4)
    return v if 0 <= int(v[:2]) <= 24 and int(v[2:]) < 60 else ""


def hours(it):
    out = []
    for d in range(1, 9):  # 1~7 월~일, 8 공휴일
        s, c = hhmm(it.get(f"dutyTime{d}s")), hhmm(it.get(f"dutyTime{d}c"))
        out.append(f"{s}-{c}" if s and c else "")
    return out


def rec(it, kind=None):
    try: la, lo = float(it.get("wgs84Lat") or it.get("latitude")), float(it.get("wgs84Lon") or it.get("longitude"))
    except Exception: return None
    if not (33 < la < 39 and 124 < lo < 132): return None
    n = it.get("dutyName", "").strip()
    if not n: return None
    r = {"n": n, "a": it.get("dutyAddr", "").strip(), "t": it.get("dutyTel1", "").strip(), "la": round(la, 6), "lo": round(lo, 6), "h": hours(it)}
    if kind: r["k"] = kind
    return r


def is_night_or_holiday(h):
    """밤 10시(2200) 이후까지 하거나 자정을 넘기는 날이 있는 곳, 또는 일요일·공휴일에 여는 곳"""
    for d, x in enumerate(h):
        if not x: continue
        s, c = x.split("-")
        if d >= 6: return True  # 일요일(6)·공휴일(7)에 영업
        if int(c) >= 2200 or int(c) <= int(s): return True
    return False


def probe(key):
    """응답 모양 확인용: 각 서비스 1건씩 받아 항목 이름만 보여준다 (키는 출력하지 않음)"""
    for name, url, op, p in [("달빛", HOSP, "getBabyListInfoInqire", {}), ("소아과", HOSP, "getHsptlMdcncListInfoInqire", {"QD": PEDS_QD, "Q0": "서울특별시"}), ("약국", PHARM, "getParmacyListInfoInqire", {"Q0": "서울특별시"})]:
        try:
            total, items = call(url + op, key, pageNo=1, numOfRows=2, **p)
            print(name, "총", total, "건 / 항목:", sorted(items[0].keys()) if items else "(없음)")
            if items: print("  예:", {k: items[0][k] for k in list(items[0])[:8]})
        except Exception as e:
            print(name, "실패", type(e).__name__, str(e)[:100])


def main(outdir):
    key = os.environ.get("DATAGO_KEY", "").strip()
    if not key:
        print("medical: DATAGO_KEY 없음 → 건너뜀"); return 1
    if "--probe" in sys.argv: probe(key); return 0
    stat, result = {}, {}
    try:
        baby = [r for r in (rec(i, i.get("dutyDiv") or "B") for i in paged(HOSP + "getBabyListInfoInqire", key)) if r]
        result["baby"] = baby; stat["baby"] = len(baby)
    except Exception as e:
        print("medical: 달빛어린이병원 실패", type(e).__name__, str(e)[:100])
    try:
        # 확인(2026-10): QD 코드는 필터로 동작하지 않아 내과 등이 섞여 온다 → 이름에 '소아'가 든 곳만 남긴다(엄격 해석)
        peds = [r for r in (rec(i) for i in paged(HOSP + "getHsptlMdcncListInfoInqire", key, QD=PEDS_QD)) if r and "소아" in r["n"]]
        result["peds"] = peds; stat["peds"] = len(peds)
    except Exception as e:
        print("medical: 소아청소년과 실패", type(e).__name__, str(e)[:100])
    try:  # 응급실: 국립중앙의료원 응급의료기관 정보 조회(getEgytListInfoInqire). 승인 전/실패하면 병·의원 목록의 응급의료기관 구분으로 대신한다
        try:
            er = []
            for i in paged(ERMC + "getEgytListInfoInqire", key):
                r = rec(i, i.get("dutyEmclsName") or "응급의료기관")
                if r: r["h"] = []; r["t"] = (i.get("dutyTel3") or r["t"]).strip(); er.append(r)  # 응급실 전화(dutyTel3) 우선
        except Exception as e:
            print("medical: 응급의료기관 API 실패 → 병·의원 목록으로 대신", type(e).__name__, str(e)[:60]); er = []
            for z in ("A", "B"):
                for i in paged(HOSP + "getHsptlMdcncListInfoInqire", key, QZ=z):
                    if i.get("dutyEryn") != "1" or i.get("dutyEmcls", "G099") == "G099": continue
                    r = rec(i, i.get("dutyEmclsName") or "응급의료기관")
                    if r: r["h"] = []; er.append(r)
        result["er"] = er; stat["er"] = len(er)
    except Exception as e:
        print("medical: 응급실 실패", type(e).__name__, str(e)[:100])
    try:
        ph = [r for r in (rec(i) for i in paged(PHARM + "getParmacyFullDown", key)) if r]
        ph = [r for r in ph if is_night_or_holiday(r["h"])]
        result["pharm"] = ph; stat["pharm"] = len(ph)
    except Exception as e:
        print("medical: 약국 실패", type(e).__name__, str(e)[:100])
    # 정상이라면 달빛 100곳 이상, 소아과 1,000곳 이상, 심야·휴일 약국 500곳 이상 — 너무 적으면 이전 파일을 유지
    if stat.get("baby", 0) < 50 or stat.get("peds", 0) < 300 or stat.get("pharm", 0) < 300 or stat.get("er", 0) < 200:
        print("medical: 건수가 너무 적어 갱신 안 함", stat); return 1
    path = os.path.join(outdir, "night_care.json")
    json.dump({"basis": datetime.date.today().isoformat(), "source": "국립중앙의료원", "stat": stat, **result}, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("medical:", stat, "→", os.path.getsize(path) // 1024, "KB")
    return 0


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    sys.exit(main(args[0] if args else "app/data"))
