/**
 * TD Ameritrade "Transactions" CSV parser.
 *
 * Typical headers (varies by export version):
 *   DATE, TRANSACTION ID, DESCRIPTION, QUANTITY, SYMBOL, PRICE, COMMISSION, AMOUNT
 *
 * Strategy: take buy/sell stock & option rows, group per symbol+contract by FIFO,
 * emit closed positions when matched. Anything still open → status='open'.
 */
import type { ParseResult, NormalizedTrade, NormalizedSide, NormalizedStatus } from './types';
import { parseCsvText, getField } from './csv';

const isBuy = (desc: string) => /\bBOUGHT?\b|\bBUY\b|\bBOT\b/i.test(desc);
const isSell = (desc: string) => /\bSOLD?\b|\bSELL\b/i.test(desc);
const isOption = (desc: string, sym: string) =>
  /\bCALL\b|\bPUT\b/i.test(desc) || /\s+C\d|\s+P\d/.test(sym);

interface Exec {
  external_id: string;
  symbol: string;
  underlying: string;
  asset_class: 'stock' | 'option';
  right: 'C' | 'P' | null;
  strike: number | null;
  expiry: string | null;
  side: NormalizedSide;
  qty: number;
  price: number;
  commission: number;
  date: string | null;
  raw: Record<string, string>;
}

function parseOptionDescription(desc: string): { right: 'C' | 'P' | null; strike: number | null; expiry: string | null; underlying: string | null } {
  // Examples:
  //  "BOT +1 SPY 100 17 JAN 25 470 CALL @ 5.20"
  //  "SOLD -1 AAPL 100 (Weeklys) 21 FEB 25 180 PUT @ 1.50"
  const m = desc.match(/(?:BOT|SOLD|BOUGHT|SELL|BUY)\s+[+\-]?\d+\s+([A-Z\.]+)[^0-9]*?(\d{1,2})\s+([A-Z]{3})\s+(\d{2,4})\s+([\d.]+)\s+(CALL|PUT)/i);
  if (!m) return { right: null, strike: null, expiry: null, underlying: null };
  const months: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
  const dd = m[2].padStart(2, '0');
  const mm = months[m[3].toUpperCase()] ?? '01';
  const yyyy = m[4].length === 2 ? `20${m[4]}` : m[4];
  return {
    right: m[6].toUpperCase().startsWith('C') ? 'C' : 'P',
    strike: Number(m[5]),
    expiry: `${yyyy}-${mm}-${dd}`,
    underlying: m[1],
  };
}

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/[$,]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

export function parseTdAmeritrade(csvText: string): ParseResult {
  const errors: { row: number; message: string }[] = [];
  const rows = parseCsvText(csvText);
  if (!rows.length) return { broker: 'tdameritrade', trades: [], errors: [{ row: 0, message: 'קובץ ריק' }] };

  const execs: Exec[] = [];
  rows.forEach((row, idx) => {
    const desc = getField(row, 'DESCRIPTION', 'Description');
    const sym = getField(row, 'SYMBOL', 'Symbol');
    if (!desc) return;
    if (!isBuy(desc) && !isSell(desc)) return;

    const isOpt = isOption(desc, sym);
    const dateStr = getField(row, 'DATE', 'Date');
    const date = dateStr ? new Date(dateStr).toISOString() : null;
    const qty = Math.abs(num(getField(row, 'QUANTITY', 'Quantity')));
    const price = Math.abs(num(getField(row, 'PRICE', 'Price')));
    const commission = Math.abs(num(getField(row, 'COMMISSION', 'Commission')) +
                                num(getField(row, 'REG FEE', 'Reg Fee')));
    const side: NormalizedSide = isBuy(desc) ? 'long' : 'short';
    const tradeId = getField(row, 'TRANSACTION ID', 'Transaction ID') || `td-${idx}`;

    if (isOpt) {
      const opt = parseOptionDescription(desc);
      if (!opt.right || opt.strike == null || !opt.expiry) {
        errors.push({ row: idx + 1, message: `שורת אופציה לא תקינה: ${desc.slice(0, 60)}` });
        return;
      }
      execs.push({
        external_id: tradeId,
        symbol: opt.underlying ?? sym,
        underlying: opt.underlying ?? sym,
        asset_class: 'option',
        right: opt.right, strike: opt.strike, expiry: opt.expiry,
        side, qty, price, commission, date, raw: row,
      });
    } else {
      execs.push({
        external_id: tradeId,
        symbol: sym, underlying: sym, asset_class: 'stock',
        right: null, strike: null, expiry: null,
        side, qty, price, commission, date, raw: row,
      });
    }
  });

  const trades = fifoMatch(execs);
  return { broker: 'tdameritrade', trades, errors };
}

function fifoMatch(execs: Exec[]): NormalizedTrade[] {
  const out: NormalizedTrade[] = [];
  const groups = new Map<string, Exec[]>();
  for (const e of execs) {
    const k = e.asset_class === 'option'
      ? `O|${e.underlying}|${e.right}|${e.strike}|${e.expiry}`
      : `S|${e.symbol}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  for (const [k, list] of groups) {
    list.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    interface Lot { exec: Exec; remaining: number; side: NormalizedSide; }
    const open: Lot[] = [];
    for (const e of list) {
      const matchAgainstOpposite = open.length && open[0].side !== e.side;
      if (!matchAgainstOpposite) {
        open.push({ exec: e, remaining: e.qty, side: e.side });
        continue;
      }
      let toClose = e.qty;
      while (toClose > 0 && open.length && open[0].side !== e.side) {
        const lot = open[0];
        const matched = Math.min(lot.remaining, toClose);
        const mult = e.asset_class === 'option' ? 100 : 1;
        const gross = lot.side === 'long'
          ? (e.price - lot.exec.price) * matched * mult
          : (lot.exec.price - e.price) * matched * mult;
        const comm = lot.exec.commission * (matched / lot.exec.qty) +
                     e.commission * (matched / e.qty);
        out.push({
          external_id: `td-${lot.exec.external_id}-${e.external_id}`,
          group_key: e.asset_class === 'option' ? k : null,
          symbol: e.underlying,
          asset_class: e.asset_class,
          side: lot.side,
          quantity: matched,
          entry_price: lot.exec.price,
          exit_price: e.price,
          entry_date: lot.exec.date,
          exit_date: e.date,
          commission: Number(comm.toFixed(2)),
          net_pnl: Number((gross - comm).toFixed(2)),
          status: 'closed' as NormalizedStatus,
          option_strategy: e.asset_class === 'option' ? 'single' : null,
          option_legs: null,
          strike: e.strike,
          expiry_date: e.expiry,
          notes: null,
        });
        lot.remaining -= matched;
        toClose -= matched;
        if (lot.remaining <= 0) open.shift();
      }
      if (toClose > 0) open.push({ exec: e, remaining: toClose, side: e.side });
    }
    for (const lot of open) {
      out.push({
        external_id: `td-${lot.exec.external_id}`,
        group_key: lot.exec.asset_class === 'option' ? k : null,
        symbol: lot.exec.underlying,
        asset_class: lot.exec.asset_class,
        side: lot.side,
        quantity: lot.remaining,
        entry_price: lot.exec.price,
        exit_price: null,
        entry_date: lot.exec.date,
        exit_date: null,
        commission: Number(lot.exec.commission.toFixed(2)),
        net_pnl: null,
        status: 'open',
        option_strategy: lot.exec.asset_class === 'option' ? 'single' : null,
        option_legs: null,
        strike: lot.exec.strike,
        expiry_date: lot.exec.expiry,
        notes: null,
      });
    }
  }
  return out;
}
