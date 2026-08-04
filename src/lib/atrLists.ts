// ──────────────────────────────────────────────────────────────────────────────
// Long / Short watchlists — the ONE storage API for both sides of the wire.
//
// The writer (TickerCard's "add to list") and the reader (TickerInputTable)
// must go through this module. A split where one side writes sessionStorage and
// the other reads localStorage looks like it works — the write succeeds, the
// reader just finds stale data and then overwrites it. Everything here is
// localStorage, and every read is try/catch-wrapped so corrupt JSON degrades to
// empty slots instead of white-screening the page.
// ──────────────────────────────────────────────────────────────────────────────

export const LONGS_KEY = 'atr-longs';
export const SHORTS_KEY = 'atr-shorts';
export const SLOTS = 6;

export type ListSide = 'long' | 'short';

export const keyForSide = (side: ListSide): string =>
  side === 'long' ? LONGS_KEY : SHORTS_KEY;

export const emptySlots = (): string[] => Array.from({ length: SLOTS }, () => '');

/** Normalise anything a user or storage hands us into a slot value. */
const normalize = (v: unknown): string =>
  String(v ?? '').trim().toUpperCase().slice(0, 5);

/**
 * The single shared read helper. Always returns exactly SLOTS entries.
 * Corrupt or foreign-shaped JSON falls back to empty slots — never throws.
 */
export function readList(key: string): string[] {
  try {
    // One-time migration for anyone whose lists were written to sessionStorage
    // by an earlier build.
    const legacy = sessionStorage.getItem(key);
    if (legacy && !localStorage.getItem(key)) {
      localStorage.setItem(key, legacy);
      sessionStorage.removeItem(key);
    }

    const raw = localStorage.getItem(key);
    if (!raw) return emptySlots();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return emptySlots();

    const out = emptySlots();
    for (let i = 0; i < SLOTS; i++) out[i] = normalize(parsed[i]);
    return out;
  } catch {
    return emptySlots();
  }
}

/**
 * Write a list and notify this tab.
 *
 * The native `storage` event does not fire in the tab that made the change, so
 * the manual dispatch is what lets TickerInputTable re-read after a card writes.
 */
export function writeList(key: string, arr: string[]): void {
  try {
    const out = emptySlots();
    for (let i = 0; i < SLOTS; i++) out[i] = normalize(arr[i]);
    localStorage.setItem(key, JSON.stringify(out));
    window.dispatchEvent(new Event('storage'));
  } catch {
    /* storage unavailable (private mode / quota) — nothing to recover */
  }
}

export type AddResult = 'added' | 'duplicate' | 'full';

/** Fill the first empty slot. Single implementation — callers only report. */
export function addToList(side: ListSide, ticker: string): AddResult {
  const key = keyForSide(side);
  const value = normalize(ticker);
  const arr = readList(key);

  if (arr.includes(value)) return 'duplicate';

  const slot = arr.findIndex((s) => !s);
  if (slot === -1) return 'full';

  arr[slot] = value;
  writeList(key, arr);
  return 'added';
}
