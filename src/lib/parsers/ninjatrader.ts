/**
 * NinjaTrader "Trade Performance" CSV parser.
 * Headers commonly: Instrument, Account, B/S (or Side), Quantity, Price, Time,
 *                   Commission, Profit, Cum. net profit
 *
 * NinjaTrader exports are typically futures (single-leg). We treat each fill as
 * an execution and FIFO match per Instrument.
 */
import type { ParseResult, NormalizedTrade, NormalizedSide } from './types';
import { parseCsvText, getField, safeDateIso } from './csv';

interface Exec {
  external_id: string;
  symbol: string;
  side: NormalizedSide;
  qty: number;
  price: number;
  commission: number;
  date: string | null;
}

const num = (v: string | undefined): number => {
  if (!v) return 0;
  const n = Number(String(v).replace(/[$,()]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

export function parseNinjaTrader(csvText: string): ParseResult {
  const errors: { row: number; message: string }[] = [];
  const rows = parseCsvText(csvText);
  if (!rows.length) return { broker: 'ninjatrader', trades: [], errors: [{ row: 0, message: 'קובץ ריק' }] };

  const execs: Exec[] = [];
  rows.forEach((row, idx) => {
    const sym = getField(row, 'Instrument', 'instrument', 'Symbol');
    if (!sym) return;
    const sideRaw = getField(row, 'B/S', 'Side', 'Action').toUpperCase();
    const side: NormalizedSide = sideRaw.startsWith('B') || sideRaw === 'BUY' ? 'long' : 'short';
    const qty = Math.abs(num(getField(row, 'Quantity', 'Qty')));
    const price = Math.abs(num(getField(row, 'Price')));
    const commission = Math.abs(num(getField(row, 'Commission')));
    const dateStr = getField(row, 'Time', 'Date', 'Date/Time');
    const date = safeDateIso(dateStr);
    const id = getField(row, 'Trade #', 'TradeID', 'ID') || `nt-${idx}`;
    if (!qty || !price) {
      errors.push({ row: idx + 1, message: `שורה ללא כמות/מחיר: ${sym}` });
      return;
    }
    execs.push({ external_id: id, symbol: sym, side, qty, price, commission, date });
  });

  const out: NormalizedTrade[] = [];
  const groups = new Map<string, Exec[]>();
  for (const e of execs) {
    if (!groups.has(e.symbol)) groups.set(e.symbol, []);
    groups.get(e.symbol)!.push(e);
  }
  for (const [sym, list] of groups) {
    list.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    interface Lot { exec: Exec; remaining: number; side: NormalizedSide; }
    const open: Lot[] = [];
    for (const e of list) {
      if (!open.length || open[0].side === e.side) {
        open.push({ exec: e, remaining: e.qty, side: e.side });
        continue;
      }
      let toClose = e.qty;
      while (toClose > 0 && open.length && open[0].side !== e.side) {
        const lot = open[0];
        const matched = Math.min(lot.remaining, toClose);
        const gross = lot.side === 'long'
          ? (e.price - lot.exec.price) * matched
          : (lot.exec.price - e.price) * matched;
        const comm = lot.exec.commission * (matched / lot.exec.qty) +
                     e.commission * (matched / e.qty);
        out.push({
          external_id: `nt-${lot.exec.external_id}-${e.external_id}`,
          group_key: null, symbol: sym, asset_class: 'stock',
          side: lot.side, quantity: matched,
          entry_price: lot.exec.price, exit_price: e.price,
          entry_date: lot.exec.date, exit_date: e.date,
          commission: Number(comm.toFixed(2)),
          net_pnl: Number((gross - comm).toFixed(2)),
          status: 'closed', option_strategy: null, option_legs: null,
          strike: null, expiry_date: null, notes: null,
        });
        lot.remaining -= matched;
        toClose -= matched;
        if (lot.remaining <= 0) open.shift();
      }
      if (toClose > 0) open.push({ exec: e, remaining: toClose, side: e.side });
    }
    for (const lot of open) {
      out.push({
        external_id: `nt-${lot.exec.external_id}`,
        group_key: null, symbol: sym, asset_class: 'stock',
        side: lot.side, quantity: lot.remaining,
        entry_price: lot.exec.price, exit_price: null,
        entry_date: lot.exec.date, exit_date: null,
        commission: Number(lot.exec.commission.toFixed(2)),
        net_pnl: null, status: 'open',
        option_strategy: null, option_legs: null,
        strike: null, expiry_date: null, notes: null,
      });
    }
  }
  return { broker: 'ninjatrader', trades: out, errors };
}
