"""매일 실행: 어린이집정보공개포털 '어린이집 기본정보'를 비정기(수시, 오늘 기준)로 받아 앱 데이터를 갱신한다.

사용법:  python -I data/update_data.py
결과:    data/raw/master_YYYYMMDD/*.bin, data/daycare_master_YYYYMMDD.csv, app/data/*.json
필요:    pip install xlrd==2.0.1
"""
import csv, datetime, glob, json, os, shutil, subprocess, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
URL = "https://info.childcare.go.kr/info_html5/stat/sheet/StatCrInfoExcel.jsp"
REFERER = "https://info.childcare.go.kr/info_html5/oais/openapi/OpenApiInfoSl.jsp"
# 전남광주통합특별시는 시점에 따라 새 코드(12) 또는 옛 코드 광주(29)·전남(46)에 들어 있어 셋 다 받는다
SIDO_CODES = ["11", "12", "26", "27", "28", "29", "30", "31", "36", "41", "43", "44", "46", "47", "48", "49", "51", "52"]
MIN_TOTAL = 20000  # 이보다 적으면 다운로드 이상으로 보고 앱 데이터를 바꾸지 않는다
MAX_DROP = 0.2     # 시도별 건수가 이전보다 이만큼 넘게 줄면 앱 데이터를 바꾸지 않는다
XLS_MAGIC = b"\xd0\xcf\x11\xe0"


def download(today, outdir):
    os.makedirs(outdir, exist_ok=True)
    for code in SIDO_CODES:
        body = urllib.parse.urlencode({
            "S_SAVENAME": "", "flagType": "", "flag": "crInfo", "exlChk": "Y",
            "currYear": today.strftime("%Y"), "currMon": today.strftime("%m"),
            "std_condi": "N",  # 비정기(수시) = 조회 시점 기준 최신
            "wkyear": today.strftime("%Y"), "wkmonth": today.strftime("%m"),
            "sido": code, "sigun": "",
        }).encode()
        req = urllib.request.Request(URL, data=body, headers={"User-Agent": "Mozilla/5.0", "Referer": REFERER})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    content = r.read()
                # 200으로 오류 페이지(HTML)가 오는 경우를 걸러낸다: 엑셀(XLS) 파일 시그니처 확인
                if not content.startswith(XLS_MAGIC):
                    raise ValueError(f"{code}: 엑셀 파일이 아님 ({content[:40]!r})")
                break
            except Exception as e:
                if attempt == 2:
                    sys.exit(f"시도 {code} 다운로드 실패: {e}")
                print(f"retry {code}: {e}")
                time.sleep(10)
        with open(os.path.join(outdir, f"{code}.bin"), "wb") as f:
            f.write(content)
        time.sleep(2)  # 기관 서버 부담을 줄이기 위해 간격을 둔다


def check_counts(old_index_path, new_index_path):
    """시도가 사라지거나 건수가 크게 줄면 다운로드 이상으로 보고 교체하지 않는다."""
    with open(new_index_path, encoding="utf-8") as f:
        new = {s["sido"]: s["count"] for s in json.load(f)["sidos"]}
    if not os.path.exists(old_index_path):
        return []
    with open(old_index_path, encoding="utf-8") as f:
        old = {s["sido"]: s["count"] for s in json.load(f)["sidos"]}
    problems = []
    for sido, n in old.items():
        if sido not in new:
            problems.append(f"{sido}: 새 데이터에서 사라짐 (이전 {n}건)")
        elif new[sido] < n * (1 - MAX_DROP):
            problems.append(f"{sido}: {n} → {new[sido]}건 ({MAX_DROP:.0%} 넘게 감소)")
    for sido, n in new.items():
        if n == 0:
            problems.append(f"{sido}: 0건")
    return problems


def main():
    today = datetime.date.today()
    tag = today.strftime("%Y%m%d")
    raw = os.path.join(ROOT, "raw", f"master_{tag}")
    csv_path = os.path.join(ROOT, f"daycare_master_{tag}.csv")
    download(today, raw)
    subprocess.run([sys.executable, "-I", os.path.join(ROOT, "merge_master.py"), raw, csv_path], check=True)

    with open(csv_path, encoding="utf-8-sig") as f:
        total = sum(1 for _ in csv.reader(f)) - 1
    if total < MIN_TOTAL:
        sys.exit(f"다운로드 결과가 {total}건뿐이라 앱 데이터를 갱신하지 않았습니다.")

    app_data = os.path.join(ROOT, "..", "app", "data")
    tmp, old = app_data + "_new", app_data + "_old"
    for d in (tmp, old):  # 지난 실행이 남긴 찌꺼기와 섞이지 않게
        shutil.rmtree(d, ignore_errors=True)
    env = dict(os.environ, BASIS=today.isoformat())
    subprocess.run([sys.executable, "-I", os.path.join(ROOT, "build_app_json.py"), csv_path, tmp,
                    os.path.join(ROOT, "raw", "15140061_utf8.csv")], check=True, env=env)
    # 좌표 없는 곳은 주소로 채운다 (NAVER_CLIENT_ID/SECRET이 없으면 건너뜀)
    subprocess.run([sys.executable, "-I", os.path.join(ROOT, "geocode.py"), tmp], check=True, env=env)
    for f in glob.glob(os.path.join(tmp, "*.json")):  # 깨진 JSON이 배포되지 않게
        with open(f, encoding="utf-8") as fh:
            json.load(fh)
    problems = check_counts(os.path.join(app_data, "index.json"), os.path.join(tmp, "index.json"))
    if problems:
        shutil.rmtree(tmp, ignore_errors=True)
        sys.exit("데이터 이상으로 앱 데이터를 갱신하지 않았습니다:\n" + "\n".join(problems))
    # 새 데이터가 다 만들어진 뒤에 폴더 단위로 교체한다
    if os.path.exists(app_data):
        os.replace(app_data, old)
    os.replace(tmp, app_data)
    shutil.rmtree(old, ignore_errors=True)
    print(f"updated: basis {today.isoformat()}, {total} rows")


if __name__ == "__main__":
    main()
