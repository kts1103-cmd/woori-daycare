import csv, json, os, sys, collections, re
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
seen = set()
os.makedirs(outdir, exist_ok=True)
by = collections.defaultdict(list); st = collections.Counter(); nocoord = 0; total = 0
def site_url(x):
    """정보공개포털 '홈페이지주소' 정리 (엄격): 이메일·한글 문구·점 없는 값은 버린다. 고치는 것은 ①스킴 오타(http//, htto://, ktp://, http;//) ②스킴 누락 ③'.'·'/' 옆 공백 ④끝의 점. http(s)만 허용. 없으면 None"""
    x = (x or '').strip()
    if not x or '@' in x or re.search(r'[<>"\x27,]', x) or len(x) > 200: return None
    x = re.sub(r'\s*([./])\s*', r'\1', x).rstrip('.')
    x = re.sub(r'^(ht\w{1,3})//', r'\1://', x, flags=re.I)  # http// 처럼 ':' 빠진 것
    if re.search(r'\s', x): return None
    m = re.match(r'^([A-Za-z]{2,5})?[:;]?/{0,2}', x)
    has = bool(m and m.group(1) and x[m.end(1):m.end(1)+1] in ':;')
    if has and not re.match(r'^[a-z]*t+[a-z]*p?s?$', m.group(1), re.I): return None  # 스킴처럼 보이지 않는 글자(cafe: 등)
    scheme = 'http' if has and m.group(1).lower() == 'http' else 'https'
    rest = x[m.end():] if has else x.lstrip('/')
    if not re.match(r'^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(?:[:/?#]|$)', rest): return None
    # QA 보정(2026-10): 오타 수정, 서비스 종료·플랫폼 대표주소·포털은 비운다(엉뚱한 곳 연결 방지)
    rest = re.sub(r'^wwww\.', 'www.', rest).replace('cyword.com', 'cyworld.com')
    rest = re.sub(r'^(cafe\.naver\.com|cafe\.daum\.net|daum\.net)\.(?=[A-Za-z0-9_-])', r'\1/', rest)
    rest = re.sub(r'^(?:www\.)?daum\.net/(?!cafe\b)(?=[A-Za-z0-9_-])', 'cafe.daum.net/', rest)
    host = re.split(r'[:/?#]', rest, 1)[0].lower(); bare = not re.sub(r'^[^/?#]*[/?#]*', '', rest).strip('/')
    if host.endswith('cyworld.com') or host in ('kr.yahoo.com', 'yahoo.com', 'google.com', 'www.google.com'): return None
    if bare and host.removeprefix('www.') in ('kidsnote.com', 'naver.com', 'daum.net', 'blog.naver.com', 'cafe.naver.com', 'cafe.daum.net', 'instagram.com', 'facebook.com', 'youtube.com', 'band.us', 'kakao.com', 'tistory.com'): return None
    if 'iseoul.seoul.go.kr' in rest: return None  # 서울시 보육포털은 앱이 따로 연결
    return f"{scheme}://{rest}"
def num(x):
    try: return int(float(x))
    except: return None
with open(src, encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        total += 1; st[r['운영현황']] += 1
        if r['운영현황'] not in ('정상', '재개'): continue
        # 육아종합지원센터·장난감도서관 등 정원이 없는 지원시설은 어린이집 목록에서 제외
        if not num(r['정원수']): continue
        k = (r['시군구'], norm(r['어린이집명']), norm(r['주소']))
        if k in seen: continue  # 새·옛 시도코드 양쪽에 같은 시설이 있으면 한 번만
        seen.add(k)
        try: lat, lng = float(r['위도']), float(r['경도'])
        except: lat = lng = None
        if not lat: nocoord += 1
        by[r['시도']].append({"name": r['어린이집명'], "type": r['어린이집유형구분'], "sido": r['시도'], "sigungu": r['시군구'],
            "addr": r['주소'].strip(), "tel": r['어린이집전화번호'], "capacity": num(r['정원수']), "current": num(r['현원수']),
            "staff": num(r['보육교직원수']), "cctv": num(r['CCTV설치수']), "bus": r['통학차량운영여부'] == '운영',
            "rooms": num(r['보육실수']), "area": num(r['보육실면적']), "playground": num(r['놀이터수']),
            "since": r['인가일자'][:10] or None,
            "site": site_url(r.get('홈페이지주소')),
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
