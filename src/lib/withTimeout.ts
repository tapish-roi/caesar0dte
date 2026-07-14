// supabase-js bounds nothing. A REST insert, an edge-function fetch, or a storage
// upload whose connection stalls (dropped wifi, a proxy that swallows the socket,
// a 413 whose response carries no CORS headers) never settles — the promise just
// hangs. Every caller then sits in its "pending" state forever: a spinner that
// never stops, a button that stays greyed, and no error anyone can read.
//
// Racing against a timer does not cancel the underlying request — storage-js takes
// no AbortSignal — but it does hand the caller a real rejection, so `finally` runs,
// the UI recovers, and the user is told something instead of nothing.
export function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    Promise.resolve(p),
    new Promise<never>((_, reject) => {
      // Phrased as a noun clause on purpose: the label may be feminine ("ההעלאה")
      // or masculine ("אימות ההתחברות"), and this wording agrees with both.
      const secs = Math.max(1, Math.round(ms / 1000));
      timer = setTimeout(
        () => reject(new Error(`${label}: לא התקבלה תגובה תוך ${secs} שניות — ייתכן שהחיבור נתקע. נסה שוב.`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

// An upload's budget has to scale with the file: a 34 MB video over a slow uplink
// is legitimately slow, and a flat timeout would abort a healthy transfer. Assume a
// pessimistic 50 KB/s floor, plus 60s of setup slack, capped at 30 minutes.
export function uploadTimeoutMs(bytes: number): number {
  return Math.min(30 * 60_000, 60_000 + (bytes / (50 * 1024)) * 1000);
}
