// 시설 사진 저장소 (시제품)
// 지금은 이 기기의 IndexedDB에만 저장한다. 정식 서비스에서는 같은 함수 이름(list/add/remove)으로
// 서버 API를 호출하도록 이 파일만 바꾸면 된다. (원장 인증 → 업로드 → 운영자 검수 → 게시)
(function () {
  const DB = "woori-daycare-photos", STORE = "photos";
  const MAX_SIDE = 1600, QUALITY = 0.85;
  let dbp = null;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("daycare", "daycare");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out && "result" in out ? out.result : out);
      t.onerror = () => reject(t.error);
    });
  }

  // 긴 변 1600px JPEG로 다시 그린다. 다시 그리면 촬영 위치(GPS) 등 EXIF 정보가 함께 지워진다.
  async function normalize(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", QUALITY));
  }

  window.PHOTO_STORE = {
    MAX_FILES: 10,
    async list(daycare) {
      try {
        const rows = await tx("readonly", (s) => s.index("daycare").getAll(daycare));
        return (rows || []).sort((a, b) => a.createdAt - b.createdAt);
      } catch { return []; }
    },
    // meta: { uploader, consents } — 정식 서비스에서는 서버가 인증 정보와 함께 보관
    async add(daycare, files, meta) {
      const now = Date.now();
      const rows = [];
      for (const [i, f] of files.entries()) {
        rows.push({ id: `${now}-${i}-${Math.random().toString(36).slice(2, 8)}`, daycare, blob: await normalize(f), createdAt: now + i, status: "pending", uploader: meta.uploader, consents: meta.consents });
      }
      await tx("readwrite", (s) => rows.forEach((r) => s.put(r)));
      return rows.length;
    },
    async remove(id) { await tx("readwrite", (s) => s.delete(id)); },
    // 설정(settings.js): 이 기기에 저장된 사진 수 / 모두 지우기
    async count() { try { const n = await tx("readonly", (s) => s.count()); return typeof n === "number" ? n : 0; } catch { return 0; } },
    async clearAll() { try { await tx("readwrite", (s) => s.clear()); return true; } catch { return false; } },
  };
})();
