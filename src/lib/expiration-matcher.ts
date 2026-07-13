/**
 * Expiration reconciliation — runs AFTER parse, BEFORE insert.
 *
 * For each parsed trade marked status='expired' (i.e. an expiration row),
 * find an active OPEN position with the same group key
 * (OPT|underlying|right|strike|expiry|direction) in the existing-trades list,
 * and mutate it to closed:
 *   exit_price = 0
 *   exit_date  = expiration date
 *   entry_date = first fill (preserved)
 * NEVER create a new trade from expiration rows.
 */
import type { NormalizedTrade } from './parsers/types';
import type { TradeRow, TradeInsert } from '@/contexts/TradesContext';

interface Reconciled {
  toInsert: TradeInsert[];
  toUpdate: { id: string; patch: Partial<TradeRow> }[];
  matchedExpirations: number;
}

const groupKeyFor = (t: { symbol: string; option_legs?: unknown; strike?: number | null; expiry_date?: string | null; side?: string }): string => {
  // Prefer single-leg key; multi-leg uses underlying+expiry only
  const legs = (t.option_legs as Array<{ right?: string }> | null | undefined) ?? null;
  if (legs && legs.length > 1) return `OPT|${t.symbol}|MULTI|${t.expiry_date ?? '-'}`;
  const right = legs?.[0]?.right ?? '?';
  // Deliberately exclude `side`: an expiration row is the CLOSING action and its
  // recorded side can be the opposite of the open position's, which would otherwise
  // cause the match to miss and insert a duplicate closed trade.
  return `OPT|${t.symbol}|${right}|${t.strike ?? '-'}|${t.expiry_date ?? '-'}`;
};

export function reconcileExpirations(
  parsed: NormalizedTrade[],
  existingOpen: TradeRow[],
): Reconciled {
  const toInsert: TradeInsert[] = [];
  const toUpdate: Reconciled['toUpdate'] = [];
  let matched = 0;

  // FIFO queues of existing open positions by group key
  const queues = new Map<string, TradeRow[]>();
  for (const t of existingOpen) {
    if (t.status !== 'open') continue;
    const k = groupKeyFor({
      symbol: t.symbol,
      option_legs: t.option_legs,
      strike: t.strike,
      expiry_date: typeof t.expiry_date === 'string' ? t.expiry_date : null,
      side: t.side,
    });
    if (!queues.has(k)) queues.set(k, []);
    queues.get(k)!.push(t);
  }
  for (const q of queues.values()) {
    q.sort((a, b) => (a.entry_date ?? '').localeCompare(b.entry_date ?? ''));
  }

  for (const p of parsed) {
    const isExpiration = p.status === 'expired' && (p.exit_price === 0 || p.entry_price === 0);
    if (!isExpiration) {
      toInsert.push(toInsertRow(p));
      continue;
    }

    const k = groupKeyFor({
      symbol: p.symbol,
      option_legs: p.option_legs,
      strike: p.strike,
      expiry_date: p.expiry_date,
      side: p.side,
    });
    const queue = queues.get(k);
    if (queue && queue.length) {
      const open = queue.shift()!;
      // Contract multiplier is a property of the OPEN position (an option), not of the
      // parsed expiration row whose option_legs may be absent — reading p.option_legs
      // here dropped the ×100 and produced P&L off by 100×.
      const openIsOption = !!(open.option_legs || open.strike != null);
      const mult = openIsOption ? 100 : 1;
      // Expired worthless: a long loses the premium paid, a short keeps it.
      const premiumPnl = open.entry_price
        ? Number(open.entry_price) * Number(open.quantity) * mult * (open.side === 'long' ? -1 : 1)
        : 0;
      toUpdate.push({
        id: open.id,
        patch: {
          status: 'closed',
          exit_price: 0,
          exit_date: p.exit_date ?? p.expiry_date ?? new Date().toISOString(),
          net_pnl: premiumPnl - Number(open.commission ?? 0),
        },
      });
      matched++;
      // DROP the expiration row — do NOT insert a new trade
      continue;
    }
    // No matching open position — keep as a closed expired trade so the data isn't lost
    toInsert.push(toInsertRow(p));
  }

  return { toInsert, toUpdate, matchedExpirations: matched };
}

function toInsertRow(p: NormalizedTrade): TradeInsert {
  return {
    user_id: '', // filled by TradesContext.addTrades
    symbol: p.symbol,
    side: p.side,
    quantity: p.quantity,
    entry_price: p.entry_price ?? null,
    exit_price: p.exit_price ?? null,
    entry_date: p.entry_date,
    exit_date: p.exit_date,
    commission: p.commission,
    net_pnl: p.net_pnl,
    status: p.status === 'expired' ? 'closed' : p.status,
    option_strategy: p.option_strategy,
    option_legs: p.option_legs as never,
    strike: p.strike,
    expiry_date: p.expiry_date,
    notes: p.notes,
    external_id: p.external_id,
    group_key: p.group_key,
    import_source: p.option_legs ? 'option-import' : 'csv-import',
  };
}
