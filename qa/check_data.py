"""매일 품질 점검: 앱 데이터(app/data)가 정상인지 검사하고 결과를 마크다운으로 낸다.

사용법:  python -I qa/check_data.py [report.md]
종료코드: 0 = 통과(경고는 있을 수 있음), 1 = 실패 항목 있음
추이 기록: qa/history.csv 에 하루 한 줄씩 쌓는다 (같은 날 다시 돌리면 덮어씀)
"""
import csv, datetime, json, os, sys
sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "app", "data")
HISTORY = os.path.join(ROOT, "qa", "history.csv")
EXPECTED_SIDOS = 16      # 광주·전남 통합 이후 기준
MAX_AGE_DAYS = 2         # 기준일이 이보다 오래되면 갱신이 멈춘 것
MAX_DROP = 0.05          # 전날 대비 전체 건수가 이만큼 넘게 줄면 경고
FIELDS = ["name", "type", "sido", "sigungu", "addr", "tel", "capacity", "current", "lat", "lng"]

fails, warns, infos = [], [], []


def in_korea(d):
    return isinstance(d.get("lat"), (int, float)) and isinstance(d.get("lng"), (int, float)) \
        and 33 <= d["lat"] <= 39 and 124 <= d["lng"] <= 132


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else None
    try:
        with open(os.path.join(DATA, "index.json"), encoding="utf-8") as f:
            index = json.load(f)
    except Exception as e:
        fails.append(f"index.json을 읽을 수 없음: {e}")
        return finish(out, {})

    # 기준일
    today = datetime.date.today()
    try:
        age = (today - datetime.date.fromisoformat(index["basis"])).days
        (fails if age > MAX_AGE_DAYS else infos).append(f"데이터 기준일 {index['basis']} ({age}일 전)")
    except Exception:
        fails.append(f"기준일 형식 오류: {index.get('basis')!r}")

    sidos = index.get("sidos") or []
    if len(sidos) != EXPECTED_SIDOS:
        warns.append(f"시·도 수 {len(sidos)}개 (예상 {EXPECTED_SIDOS}개)")

    stats = {"total": 0, "no_coord": 0, "bad_coord": 0, "cap0": 0, "over_cap": 0, "missing_field": 0, "dup": 0}
    seen = set()
    for s in sidos:
        path = os.path.join(DATA, s["file"])
        try:
            with open(path, encoding="utf-8") as f:
                rows = json.load(f)
        except Exception as e:
            fails.append(f"{s['sido']} ({s['file']}) 읽기 실패: {e}")
            continue
        if len(rows) != s["count"]:
            fails.append(f"{s['sido']}: index는 {s['count']}건, 파일은 {len(rows)}건")
        if not rows:
            fails.append(f"{s['sido']}: 0건")
        for d in rows:
            stats["total"] += 1
            if any(k not in d for k in FIELDS):
                stats["missing_field"] += 1
            if d.get("lat") in (None, "") or d.get("lng") in (None, ""):
                stats["no_coord"] += 1
            elif not in_korea(d):
                stats["bad_coord"] += 1
            if not d.get("capacity"):
                stats["cap0"] += 1
            elif (d.get("current") or 0) > d["capacity"]:
                stats["over_cap"] += 1
            key = (d.get("name"), d.get("addr"))
            if key in seen:
                stats["dup"] += 1
            seen.add(key)

    t = max(stats["total"], 1)
    if stats["missing_field"]:
        fails.append(f"필수 항목이 빠진 레코드 {stats['missing_field']}건")
    if stats["no_coord"] / t > 0.03:
        warns.append(f"좌표 없음 {stats['no_coord']}건 ({stats['no_coord'] / t:.1%}) — 지도에서 빠짐")
    if stats["bad_coord"]:
        warns.append(f"한국 범위 밖 좌표 {stats['bad_coord']}건")
    if stats["cap0"]:
        warns.append(f"정원 0/없음 {stats['cap0']}건 — '정원보다 N명 적음' 표시가 틀릴 수 있음")
    if stats["over_cap"]:
        warns.append(f"현원이 정원보다 많은 곳 {stats['over_cap']}건")
    if stats["dup"]:
        warns.append(f"이름+주소 중복 {stats['dup']}건")

    # 전날 대비
    prev = read_last_history(today)
    if prev:
        p = int(prev["total"])
        if p and stats["total"] < p * (1 - MAX_DROP):
            fails.append(f"전체 건수 급감: {p:,} → {stats['total']:,}")
        for k in ("no_coord", "cap0"):
            if int(prev[k]) and stats[k] > int(prev[k]) * 1.5 and stats[k] - int(prev[k]) >= 20:
                warns.append(f"{k} 급증: {prev[k]} → {stats[k]}")

    infos.append(f"전체 {stats['total']:,}건 / 시·도 {len(sidos)}개")
    write_history(today, index.get("basis", ""), stats)
    return finish(out, stats)


def read_last_history(today):
    if not os.path.exists(HISTORY):
        return None
    with open(HISTORY, encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if r["date"] != today.isoformat()]
    return rows[-1] if rows else None


def write_history(today, basis, stats):
    rows = []
    if os.path.exists(HISTORY):
        with open(HISTORY, encoding="utf-8") as f:
            rows = [r for r in csv.DictReader(f) if r["date"] != today.isoformat()]
    rows.append({"date": today.isoformat(), "basis": basis, **stats})
    with open(HISTORY, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["date", "basis", *stats.keys()])
        w.writeheader()
        w.writerows(rows[-400:])


def finish(out, stats):
    lines = ["## 데이터 점검", ""]
    lines += [f"- ❌ {m}" for m in fails] + [f"- ⚠️ {m}" for m in warns] + [f"- ✅ {m}" for m in infos]
    if stats:
        lines += ["", "| 항목 | 값 |", "|---|---|"] + [f"| {k} | {v:,} |" for k, v in stats.items()]
    text = "\n".join(lines) + "\n"
    print(text)
    if out:
        with open(out, "w", encoding="utf-8") as f:
            f.write(text)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
