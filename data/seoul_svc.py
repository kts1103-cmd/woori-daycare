"""서울시 특화 보육 서비스 어린이집 → app/data/seoul_svc.json

출처: 서울 열린데이터광장 (공공누리 1유형: 출처표시, 상업적 이용·변경 가능), 원본시스템 서울시 보육포털.
  OA-21701 365열린어린이집 · OA-21702 거점형야간보육 · OA-21703 휴일보육 · OA-22401 주말어린이집 · OA-22903 서울형 모아어린이집
받는 곳: 데이터셋 화면의 시트 미리보기(dataView.do). 인증키(OpenAPI)를 받으면 그쪽으로 바꾼다 (PLAN.md 2절).
우리 데이터(정보공개포털)와는 "자치구 + 이름(공백·괄호 제거)"으로 맞추고, 못 맞춘 곳은 넣지 않는다(틀린 표시 방지).
사용법: python -I data/seoul_svc.py app/data
"""
import json, os, re, sys, urllib.request, urllib.parse, datetime

# 모아어린이집(OA-22903)은 지난 기수 공동체까지 섞여 있어 지금 참여 여부가 애매 → 넣지 않음
DATASETS = [("OA-21701", "365"), ("OA-21702", "night"), ("OA-21703", "holiday"), ("OA-22401", "weekend")]
URL = "https://data.seoul.go.kr/dataList/dataView.do?"


def fetch(inf_id):
    rows, page = [], 1
    while True:
        q = urllib.parse.urlencode({"onepagerow": 1000, "srvType": "S", "infId": inf_id, "serviceKind": 1, "pageNo": page,
                                    "gridTotalCnt": "", "ssUserId": "SAMPLE_VIEW", "strWhere": "", "strOrderby": "", "filterCol": "필터선택", "txtFilter": ""})
        req = urllib.request.Request(URL + q, data=b"", method="POST", headers={"User-Agent": "woori-daycare-data/1.0"})
        txt = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace").strip()
        # 응답이 따옴표 없는 키를 쓰는 JS 객체라 키에 따옴표를 붙여 JSON으로 읽는다
        js = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', txt)
        js = re.sub(r',\s*([\]}])', r'\1', js)  # 끝에 붙은 쉼표
        d = json.loads(js)
        if d.get("result") != "ok": raise ValueError(f"{inf_id}: {str(d)[:80]}")
        rows += d.get("list") or []
        if page >= int(d.get("page", {}).get("pageCount") or 1): return rows
        page += 1


norm = lambda s: re.sub(r"[\s()（）\[\]·.,\-]", "", str(s or ""))


def main(outdir):
    seoul = None
    idx = json.load(open(os.path.join(outdir, "index.json"), encoding="utf-8"))
    for s in idx["sidos"]:
        if s["sido"] == "서울특별시": seoul = json.load(open(os.path.join(outdir, s["file"]), encoding="utf-8"))
    if not seoul: sys.exit("서울 데이터 없음")
    by = {}
    for d in seoul: by.setdefault((d["sigungu"], norm(d["name"])), []).append(d)
    items, stat = {}, {}
    for inf, kind in DATASETS:
        try: rows = fetch(inf)
        except Exception as e:
            print(f"seoul_svc: {inf} 실패 {type(e).__name__} → 이 종류는 건너뜀"); continue
        ok = miss = 0
        for r in rows:
            # 모아어린이집은 항목 이름이 다르다 (KID_PRTC_NM 어린이집명, CGG 자치구, 코드 없음)
            code = str(r.get("STCODE") or "")
            name, gu = r.get("CRNAME") or r.get("KID_PRTC_NM") or "", r.get("ARCODENM") or r.get("CGG") or ""
            if code.startswith("9") or "테스트" in name or not name: continue  # 원본의 시험용 행
            hit = by.get((gu, norm(name))) or (None if norm(name).endswith("어린이집") else by.get((gu, norm(name) + "어린이집")))
            if not hit or len(hit) != 1:  # 0곳·여러 곳이면 확실하지 않아 넣지 않음
                miss += 1; continue
            key = f'{hit[0]["sigungu"]}|{hit[0]["name"]}'
            it = items.setdefault(key, {"kinds": []})
            if code and not it.get("stcode"): it["stcode"] = code
            if kind not in it["kinds"]: it["kinds"].append(kind); ok += 1
        stat[kind] = {"rows": len(rows), "facilities": ok, "unmatched": miss}
    out = {"basis": datetime.date.today().isoformat(), "source": "서울 열린데이터광장(공공누리 1유형)", "stat": stat, "items": items}
    json.dump(out, open(os.path.join(outdir, "seoul_svc.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("seoul_svc:", json.dumps(stat, ensure_ascii=False), "facilities", len(items))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "app/data")
