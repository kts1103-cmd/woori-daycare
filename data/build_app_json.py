import csv, json, os, sys, collections
src, outdir = sys.argv[1], sys.argv[2]
ext_src = sys.argv[3] if len(sys.argv) > 3 else None
norm = lambda x: ''.join(str(x).split())
ext = {}
if ext_src:  # 연장보육반 운영 여부 (2024년, data.go.kr 15140061)
    with open(ext_src, encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if r['연도'] == '2024':
                ext[(norm(r['시군구']), norm(r['어린이집명']))] = r['연장보육반운영여부'] == 'Y'
matched = 0
os.makedirs(outdir, exist_ok=True)
by = collections.defaultdict(list); st = collections.Counter(); nocoord = 0; total = 0
def num(x):
    try: return int(float(x))
    except: return None
with open(src, encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        total += 1; st[r['운영현황']] += 1
        if r['운영현황'] not in ('정상', '재개'): continue
        try: lat, lng = float(r['위도']), float(r['경도'])
        except: lat = lng = None
        if not lat: nocoord += 1
        by[r['시도']].append({"name": r['어린이집명'], "type": r['어린이집유형구분'], "sido": r['시도'], "sigungu": r['시군구'],
            "addr": r['주소'].strip(), "tel": r['어린이집전화번호'], "capacity": num(r['정원수']), "current": num(r['현원수']),
            "staff": num(r['보육교직원수']), "cctv": num(r['CCTV설치수']), "bus": r['통학차량운영여부'] == '운영',
            "rooms": num(r['보육실수']), "area": num(r['보육실면적']), "playground": num(r['놀이터수']),
            "since": r['인가일자'][:10] or None,
            "extended": ext.get((norm(r['시군구']), norm(r['어린이집명']))),
            "lat": lat, "lng": lng})
        if by[r['시도']][-1]["extended"] is not None: matched += 1
index = []
for i, (sido, rows) in enumerate(sorted(by.items())):
    fn = f"sido_{i:02d}.json"
    json.dump(rows, open(os.path.join(outdir, fn), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    index.append({"sido": sido, "file": fn, "count": len(rows)})
json.dump({"basis": os.environ.get("BASIS", "unknown"), "extendedBasis": "2024",  "source": "어린이집정보공개포털 어린이집 기본정보 (data.go.kr 15083298, 이용허락범위 제한 없음)", "sidos": index},
          open(os.path.join(outdir, "index.json"), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print("extended matched", matched)
print("total", total, dict(st), "active", sum(len(v) for v in by.values()), "no-coord", nocoord)
