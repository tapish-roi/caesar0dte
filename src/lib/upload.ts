export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

// A rejected upload used to surface as a bare "שגיאה בהעלאה" with no reason. The
// most common cause — the file exceeding the server's size limit — reaches the
// browser as an opaque network failure, because the proxy's 413 carries no CORS
// headers. Name that case explicitly rather than leaving the user guessing.
export function uploadErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'ההעלאה נכשלה — ייתכן שהקובץ חורג ממגבלת הגודל של השרת, או שהחיבור נותק.';
  }
  return msg;
}

// If the transfer moves no bytes at all for this long, the connection is dead.
// A healthy-but-slow upload keeps firing progress events and is never aborted;
// only a genuinely stalled one trips this.
const STALL_TIMEOUT_MS = 45_000;

export interface UploadProgress {
  /** 0–100, or null while the total size is still unknown. */
  percent: number | null;
  loaded: number;
  total: number;
}

// storage-js resolves only when the whole upload finishes and exposes no progress
// events, so a stalled transfer is indistinguishable from a slow one — which is
// what made the spinner look frozen. XHR gives us upload.onprogress, so we can
// show real progress, abort the moment the bytes actually stop moving, and read
// the true HTTP status (a 413 from the size limit is invisible to fetch, because
// the proxy's 413 carries no CORS headers).
export function uploadWithProgress(opts: {
  url: string;
  token: string;
  apikey: string;
  file: File;
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { url, token, apikey, file, onProgress, signal } = opts;

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stallTimer: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      clearTimeout(stallTimer);
      signal?.removeEventListener('abort', onAbort);
    };
    const armStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        xhr.abort();
        cleanup();
        reject(new Error('ההעלאה נתקעה — לא הועברו נתונים במשך 45 שניות. בדוק את החיבור ונסה שוב.'));
      }, STALL_TIMEOUT_MS);
    };
    function onAbort() {
      xhr.abort();
      cleanup();
      reject(new Error('ההעלאה בוטלה.'));
    }

    signal?.addEventListener('abort', onAbort);

    xhr.upload.onprogress = (e) => {
      armStallTimer(); // bytes moved — the connection is alive
      onProgress?.({
        percent: e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : null,
        loaded: e.loaded,
        total: e.lengthComputable ? e.total : file.size,
      });
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      // Storage's own 4xx bodies are readable (they carry CORS headers), so the
      // server's reason reaches the user verbatim. A 413 from the proxy in front
      // of it may not be, which is why onerror below also names the size limit.
      if (xhr.status === 413) {
        return reject(new Error(
          `הקובץ (${formatBytes(file.size)}) חורג ממגבלת הגודל של השרת. יש להעלות קובץ קטן יותר, או להגדיל את המגבלה בהגדרות ה-Storage.`,
        ));
      }
      if (xhr.status === 401 || xhr.status === 403) {
        return reject(new Error('פג תוקף ההתחברות או שאין הרשאה להעלות. התחבר מחדש ונסה שוב.'));
      }
      let detail = '';
      try {
        detail = JSON.parse(xhr.responseText)?.message ?? '';
      } catch { /* body may be HTML from a proxy — the status alone is the signal */ }
      reject(new Error(`ההעלאה נכשלה (${xhr.status})${detail ? `: ${detail}` : ''}`));
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error('ההעלאה נכשלה — החיבור לשרת נכשל. ייתכן שהקובץ חורג ממגבלת הגודל של השרת.'));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new Error('ההעלאה נכשלה — פסק זמן.'));
    };

    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', apikey);
    xhr.setRequestHeader('x-upsert', 'false');
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);
    armStallTimer(); // a connection that never even starts must also fail
    xhr.send(file);
  });
}
