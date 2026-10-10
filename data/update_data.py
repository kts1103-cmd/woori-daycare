"""매일 실행: 어린이집정보공개포털 '어린이집 기본정보'를 비정기(수시, 오늘 기준)로 받아 앱 데이터를 갱신한다.

사용법:  python -I data/update_data.py
결과:    data/raw/master_YYYYMMDD/*.bin, data/daycare_master_YYYYMMDD.csv, app/data/*.json
필요:    pip install xlrd==2.0.1
"""
import csv, datetime, glob, json, os, subprocess, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
URL = "https://info.childcare.go.kr/info_html5/stat/sheet/StatCrInfoExcel.jsp"
REFERER = "https://info.childcare.go.kr/info_html5/oais/openapi/OpenApiInfoSl.jsp"
# 전남광주통합특별시는 시점에 따라 새 코드(12) 또는 옛 코드 광주(29)·전남(46)에 들어 있어 셋 다 받는다
SIDO_CODES = ["11", "12", "26", "27", "28", "29", "30", "31", "36", "41", "43", "44", "46", "47", "48", "49", "51", "52"]
MIN_TOTAL = 20000  # 이보다 적으면 다운로드 이상으로 보고 앱 데이터를 바꾸지 않는다


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
        with urllib.request.urlopen(req, timeout=120) as r, open(os.path.join(outdir, f"{code}.bin"), "wb") as f:
            f.write(r.read())
        time.sleep(2)  # 기관 서버 부담을 줄이기 위해 간격을 둔다


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
    tmp = app_data + "_new"
    env = dict(os.environ, BASIS=today.isoformat())
    subprocess.run([sys.executable, "-I", os.path.join(ROOT, "build_app_json.py"), csv_path, tmp,
                    os.path.join(ROOT, "raw", "15140061_utf8.csv")], check=True, env=env)
    # 새 데이터가 다 만들어진 뒤에 교체한다
    for f in glob.glob(os.path.join(app_data, "*.json")):
        os.remove(f)
    os.makedirs(app_data, exist_ok=True)
    for f in glob.glob(os.path.join(tmp, "*.json")):
        os.replace(f, os.path.join(app_data, os.path.basename(f)))
    os.rmdir(tmp)
    print(f"updated: basis {today.isoformat()}, {total} rows")


if __name__ == "__main__":
    main()
