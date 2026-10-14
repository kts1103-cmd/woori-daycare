"""어린이집 키 목록(daycare_keys)을 Supabase에 동기화한다 (서버 Phase 2·3 선행: 재원 인증 부여가 이 키를 참조한다).

- 입력: app/data/sido_*.json (앱이 쓰는 공공데이터 JSON, 읽기만 함)
- 키: 앱의 keyOf = `시도|시군구|이름` (2026-10-14 결정, PLAN 11.C). 같은 시도·시군구·이름이 둘 이상이면 그 시설들만 끝에 `#`+전화번호 숫자 끝 4자리를 붙인다.
  (app.js assignKeys, flutter_app/lib/models/daycare.dart 와 같아야 한다)
- 쓰기: PostgREST upsert. **service_role 키가 필요**하므로 환경변수로만 읽는다(코드·저장소에 절대 넣지 않는다).
    SUPABASE_URL                 예: https://xxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY    서버 전용 비밀 키 (GitHub Secrets)
- 기본은 **dry-run**(서버에 아무것도 보내지 않고 건수·충돌만 출력). 실제 반영은 `--apply`.
- 안전장치: 이전 대비 키 수가 크게 줄면(기본 10% 초과) 중단. 이번 실행에서 안 보인 키는 삭제하지 않고 active=false 로만 표시한다.
- `#`를 붙여도 키가 또 겹치면(전화 끝 4자리까지 같음) 첫 건만 쓰고 충돌 목록을 출력한다. stcode 전환은 정보공개포털 서면 문의 결과 후(API_신청현황.md).

사용:  python -I data/sync_daycare_keys.py            (dry-run)
       python -I data/sync_daycare_keys.py --apply    (SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 필요)
"""
import argparse
import datetime
import glob
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BATCH = 500


def load_rows(data_dir):
    rows = []
    for path in sorted(glob.glob(os.path.join(data_dir, "sido_*.json"))):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        items = d["list"] if isinstance(d, dict) and "list" in d else d
        rows.extend(items)
    return rows


def base_key(r):
    return f"{(r.get('sido') or '').strip()}|{(r.get('sigungu') or '').strip()}|{(r.get('name') or '').strip()}"


def build_keys(rows, today):
    rows = [r for r in rows if (r.get("name") or "").strip() and (r.get("sido") or "").strip()]
    cnt = {}
    for r in rows:
        b = base_key(r)
        cnt[b] = cnt.get(b, 0) + 1
    keys, collisions = {}, []
    for r in rows:
        sigungu, name, sido = (r.get("sigungu") or "").strip(), (r.get("name") or "").strip(), (r.get("sido") or "").strip()
        b = base_key(r)
        key = f"{b}#{re.sub(r'[^0-9]', '', r.get('tel') or '')[-4:]}" if cnt[b] > 1 else b
        row = {"key": key, "stcode": r.get("stcode"), "sido": sido, "name": name, "sigungu": sigungu or None,
               "last_seen": today, "active": True}
        if key in keys:
            collisions.append(key)
            continue
        keys[key] = row
    return list(keys.values()), collisions


def request(base, secret, method, path, body=None, headers=None):
    h = {"apikey": secret, "Authorization": f"Bearer {secret}", "Content-Type": "application/json"}
    h.update(headers or {})
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(base.rstrip("/") + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, resp.read(), resp.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="서버에 실제로 반영 (기본은 dry-run)")
    ap.add_argument("--data-dir", default=os.path.join(ROOT, "app", "data"))
    ap.add_argument("--max-drop", type=float, default=0.10, help="이전 건수 대비 허용 감소 비율")
    args = ap.parse_args()

    today = datetime.date.today().isoformat()
    rows = load_rows(args.data_dir)
    keys, collisions = build_keys(rows, today)
    print(f"입력 {len(rows)}곳 → 키 {len(keys)}개, 충돌(# 붙인 뒤에도 같은 키) {len(collisions)}건")
    for k in collisions[:10]:
        print("  충돌 예:", k)
    if not rows:
        print("입력이 비어 있어 중단해요.")
        return 2
    if not args.apply:
        print("dry-run: 서버에 보내지 않았어요. 반영하려면 --apply (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요).")
        return 0

    base, secret = os.environ.get("SUPABASE_URL", ""), os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not secret:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 없어요. 중단.")
        return 2

    # 안전장치: 서버의 현재 활성 키 수와 비교
    st, _, hd = request(base, secret, "GET", "/rest/v1/daycare_keys?select=key&active=eq.true&limit=1", headers={"Prefer": "count=exact", "Range": "0-0"})
    prev = 0
    if st in (200, 206) and hd.get("Content-Range", "").count("/") == 1:
        tail = hd["Content-Range"].split("/")[1]
        prev = int(tail) if tail.isdigit() else 0
    if prev and len(keys) < prev * (1 - args.max_drop):
        print(f"이전 활성 키 {prev}개보다 {args.max_drop:.0%} 넘게 줄었어요({len(keys)}개). 이상 감지로 중단.")
        return 3

    sent = 0
    for i in range(0, len(keys), BATCH):
        chunk = keys[i:i + BATCH]
        st, body, _ = request(base, secret, "POST", "/rest/v1/daycare_keys?on_conflict=key", chunk,
                              {"Prefer": "resolution=merge-duplicates,return=minimal"})
        if st >= 300:
            print(f"upsert 실패 HTTP {st}: {body[:200].decode('utf-8', 'ignore')}")
            return 4
        sent += len(chunk)
    print(f"upsert {sent}건 완료")

    # 이번에 안 보인 키는 삭제하지 않고 비활성 표시
    q = urllib.parse.quote(today)
    st, body, _ = request(base, secret, "PATCH", f"/rest/v1/daycare_keys?last_seen=lt.{q}&active=eq.true", {"active": False},
                          {"Prefer": "return=minimal"})
    print("비활성 표시:", "완료" if st < 300 else f"실패 HTTP {st}")
    return 0 if st < 300 else 5


if __name__ == "__main__":
    sys.exit(main())
