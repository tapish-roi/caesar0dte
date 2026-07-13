import type { TradeInsert } from '@/contexts/TradesContext';

/**
 * Fingerprint a trade for dedup. We rely primarily on `external_id` (ibkr's
 * TradeID), but if absent we fall back to a content hash.
 */
type FingerprintFields = Pick<TradeInsert, 'external_id' | 'symbol' | 'entry_date' | 'quantity' | 'entry_price' | 'side' | 'strike' | 'expiry_date'>;

export function tradeFingerprint(t: FingerprintFields): string {
  if (t.external_id) return `ext:${t.external_id}`;
  // Include strike/expiry so two option trades that differ only by contract
  // (same underlying, date, qty, price, side) aren't collapsed into one.
  return `c:${t.symbol}|${t.entry_date ?? ''}|${t.quantity}|${t.entry_price ?? ''}|${t.side}|${t.strike ?? ''}|${t.expiry_date ?? ''}`;
}

export function dedupAgainstExisting<T extends FingerprintFields>(
  parsed: T[],
  existingExternalIds: Set<string>,
  existingFingerprints: Set<string>,
): { fresh: T[]; duplicates: T[] } {
  const fresh: T[] = [];
  const duplicates: T[] = [];
  const seen = new Set<string>();
  for (const t of parsed) {
    const fp = tradeFingerprint(t);
    if (seen.has(fp)) { duplicates.push(t); continue; }
    seen.add(fp);
    if (t.external_id && existingExternalIds.has(t.external_id)) { duplicates.push(t); continue; }
    if (existingFingerprints.has(fp)) { duplicates.push(t); continue; }
    fresh.push(t);
  }
  return { fresh, duplicates };
}
