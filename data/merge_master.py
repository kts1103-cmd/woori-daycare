import xlrd, csv, glob, os, sys
src, out = sys.argv[1], sys.argv[2]
rows, header, counts = [], None, {}
for f in sorted(glob.glob(os.path.join(src, '*.bin'))):
    s = xlrd.open_workbook(f, encoding_override='cp949').sheet_by_index(0)
    if s.nrows < 2: counts[os.path.basename(f)] = 0; continue
    h = [str(x).strip() for x in s.row_values(0)]
    header = header or h
    n = 0
    for r in range(1, s.nrows):
        v = s.row_values(r)
        if any(str(x).strip() for x in v): rows.append(v); n += 1
    counts[os.path.basename(f)] = n
with open(out, 'w', newline='', encoding='utf-8-sig') as fo:
    w = csv.writer(fo); w.writerow(header); w.writerows(rows)
print(header); print(counts); print('total', len(rows))
