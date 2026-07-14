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
