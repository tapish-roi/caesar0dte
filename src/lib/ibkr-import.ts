/**
 * IBKR Flex Query CSV importer
 *
 * Supports the standard "Trades" section of an IBKR Flex Query CSV.
 * Two formats are accepted:
 *   1) Header-prefixed rows (default Flex CSV): every row starts with a section
 *      identifier ("Trades") and a HEADER/DATA marker. We use the HEADER row as
 *      the column dictionary and parse each DATA row into a record.
 *   2) "Plain" CSV: the first non-empty row is the header, all subsequent rows
 *      are data. Useful when users export from Trader Workstation directly.
 *
 * Output: a list of `ParsedTrade` rows ready to insert into `public.trades`.
 *  - Stocks: one row per executed lot.
 *  - Options: legs are grouped by (symbol root, expiry) into a single
 *    multi-leg trade; opens are FIFO-matched against closes/expirations.
 *  - Each leg keeps a stable `external_id` (IBKR's `TradeID`) so re-imports
 *    are idempotent. Multi-leg trades use a deterministic `group_key`.
 */

export type ParsedSide = 'long' | 'short';
export type ParsedStatus = 'open' | 'closed' | 'expired' | 'cancelled';

export interface ParsedOptionLeg {
  external_id: string;        // IBKR TradeID
  right: 'C' | 'P';           // Call / Put
  strike: number;
  expiry: string;             // ISO date
  side: ParsedSide;           // long = bought to open, short = sold to open
  quantity: number;           // contracts (always positive)
  open_price: number | null;
  close_price: number | null;
  open_date: string | null;
  close_date: string | null;
  commission: number;
  pnl: number | null;         // realized P&L for this leg (USD)
  status: ParsedStatus;
}

export interface ParsedTrade {
  /** Stable external id used for de-dup. For multi-leg, deterministic from group_key. */
  external_id: string;
  /** For multi-leg options, all legs share this key. Null for single stock fills. */
  group_key: string | null;
  symbol: string;             // underlying root for options, ticker for stocks
  asset_class: 'stock' | 'option';
  side: ParsedSide;           // net direction (long if first leg is long)
  quantity: number;           // shares for stocks, contracts for the front leg
  entry_price: number | null;
  exit_price: number | null;
  entry_date: string | null;
  exit_date: string | null;
  commission: number;
  net_pnl: number | null;
  status: ParsedStatus;
  option_strategy: string | null; // 'long_call' | 'vertical' | 'iron_condor' ...
  option_legs: ParsedOptionLeg[] | null;
  strike: number | null;          // single-leg only
  expiry_date: string | null;     // ISO date (option expiry)
  notes: string | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// CSV parsing
// ──────────────────────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else cur += ch;
    } else {
      if (ch === ',') { out.push(cur); cur = ''; }
      else if (ch === '"') inQuotes = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

interface RawRow { [key: string]: string }

function extractTradeRows(csvText: string): RawRow[] {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  const firstCols = parseCsvLine(lines[0]);
  const isFlexFormat =
    firstCols[0]?.toLowerCase() === 'trades' &&
    (firstCols[1]?.toLowerCase() === 'header' || firstCols[1]?.toLowerCase() === 'data');

  if (isFlexFormat) {
    let header: string[] | null = null;
    const rows: RawRow[] = [];
    for (const line of lines) {
      const cols = parseCsvLine(line);
      if (cols[0]?.toLowerCase() !== 'trades') continue;
      const marker = cols[1]?.toLowerCase();
      if (marker === 'header') { header = cols; continue; }
      if (marker === 'data' && header) {
        const rec: RawRow = {};
        for (let i = 2; i < header.length; i++) rec[header[i]] = cols[i] ?? '';
        rows.push(rec);
      }
    }
    return rows;
  }

  // Plain CSV — first line is header
  const header = firstCols;
  const rows: RawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const rec: RawRow = {};
    for (let j = 0; j < header.length; j++) rec[header[j]] = cols[j] ?? '';
    rows.push(rec);
  }
  return rows;
}

// ──────────────────────────────────────────────────────────────────────────────
// Field helpers (Flex column names vary slightly by report version)
// ──────────────────────────────────────────────────────────────────────────────
const num = (v: unknown): number => {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const get = (row: RawRow, ...keys: string[]): string => {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') return row[k];
  }
  return '';
};

/** Parse IBKR date/time strings: "YYYYMMDD;HHMMSS" or "YYYY-MM-DD, HH:MM:SS". */
function parseIbkrDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // YYYYMMDD;HHMMSS or YYYYMMDDHHMMSS
  let m = s.match(/^(\d{4})(\d{2})(\d{2})[;\s]?(\d{2})?(\d{2})?(\d{2})?$/);
  if (m) {
    const [, y, mo, d, hh = '00', mm = '00', ss = '00'] = m;
    return new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`).toISOString();
  }
  // YYYY-MM-DD[, HH:MM:SS]
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ ,T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, y, mo, d, hh = '00', mm = '00', ss = '00'] = m;
    return new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`).toISOString();
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function parseExpiry(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

// ──────────────────────────────────────────────────────────────────────────────
// Normalize a Flex row into an internal "execution"
// ──────────────────────────────────────────────────────────────────────────────
interface Execution {
  external_id: string;
  asset_class: 'stock' | 'option';
  symbol: string;
  underlying: string;
  right: 'C' | 'P' | null;
  strike: number | null;
  expiry: string | null;
  quantity: number;          // signed: + buy, − sell
  price: number;
  commission: number;        // positive (cost)
  fees: number;
  realized_pnl: number;      // IBKR fifoPnlRealized (USD) — non-zero on closing
  date: string | null;       // ISO
  open_close: 'O' | 'C' | '';
  notes: string | null;
}

function rowToExecution(row: RawRow, idx: number): Execution | null {
  const assetCategory = get(row, 'AssetClass', 'AssetCategory').toUpperCase();
  if (!assetCategory) return null;

  // Skip non-trade rows (forex, dividends, interest, etc.)
  if (!['STK', 'OPT', 'FOP'].includes(assetCategory)) return null;

  const symbol = get(row, 'Symbol');
  if (!symbol) return null;

  const tradeId = get(row, 'TradeID', 'IBOrderID', 'OrderID') || `row-${idx}`;
  const qty = num(get(row, 'Quantity'));
  const price = num(get(row, 'TradePrice', 'Price'));
  const commission = Math.abs(num(get(row, 'IBCommission', 'Commission')));
  const fees = Math.abs(num(get(row, 'Taxes', 'Fees')));
  const realized = num(get(row, 'FifoPnlRealized', 'RealizedPnL', 'RealizedPL'));
  const openClose = (get(row, 'Open/CloseIndicator', 'OpenClose').toUpperCase() as 'O' | 'C' | '') || '';
  const dateRaw = get(row, 'DateTime', 'TradeDate', 'Date/Time', 'OrderTime');
  const date = parseIbkrDate(dateRaw);

  if (assetCategory === 'STK') {
    return {
      external_id: tradeId,
      asset_class: 'stock',
      symbol,
      underlying: symbol,
      right: null,
      strike: null,
      expiry: null,
      quantity: qty,
      price,
      commission,
      fees,
      realized_pnl: realized,
      date,
      open_close: openClose,
      notes: null,
    };
  }

  // Option / future option
  const underlying = get(row, 'UnderlyingSymbol') || symbol.split(/\s|_/)[0];
  const expiry = parseExpiry(get(row, 'Expiry', 'ExpirationDate', 'LastTradingDay'));
  const strike = numOrNull(get(row, 'Strike'));
  const putCall = (get(row, 'Put/Call', 'PutCall', 'Right').toUpperCase() as 'C' | 'P' | '') || null;
  const right: 'C' | 'P' | null =
    putCall === 'C' || putCall === 'P' ? putCall :
    putCall === 'CALL' as string ? 'C' :
    putCall === 'PUT' as string ? 'P' : null;

  return {
    external_id: tradeId,
    asset_class: 'option',
    symbol: underlying,
    underlying,
    right,
    strike,
    expiry,
    quantity: qty,
    price,
    commission,
    fees,
    realized_pnl: realized,
    date,
    open_close: openClose,
    notes: null,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Stock aggregation: FIFO match buy/sell lots per symbol
// ──────────────────────────────────────────────────────────────────────────────
function buildStockTrades(execs: Execution[]): ParsedTrade[] {
  const bySymbol = new Map<string, Execution[]>();
  for (const e of execs) {
    if (!bySymbol.has(e.symbol)) bySymbol.set(e.symbol, []);
    bySymbol.get(e.symbol)!.push(e);
  }

  const out: ParsedTrade[] = [];
  for (const [symbol, list] of bySymbol) {
    list.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

    // FIFO queue of open lots
    interface OpenLot { exec: Execution; remaining: number; side: ParsedSide; }
    const open: OpenLot[] = [];

    for (const e of list) {
      const isOpen = e.open_close === 'O' || (open.length === 0);
      const isClose = e.open_close === 'C';

      if (isOpen && !isClose) {
        open.push({
          exec: e,
          remaining: Math.abs(e.quantity),
          side: e.quantity > 0 ? 'long' : 'short',
        });
        continue;
      }

      // Closing fill — match against opposite-side open lots
      let toClose = Math.abs(e.quantity);
      const closingSide: ParsedSide = e.quantity > 0 ? 'long' : 'short';
      while (toClose > 0 && open.length > 0) {
        const lot = open[0];
        // Match opposite direction; if same direction, treat as additional open
        if (lot.side === closingSide) break;
        const matched = Math.min(lot.remaining, toClose);
        const grossPnl =
          lot.side === 'long'
            ? (e.price - lot.exec.price) * matched
            : (lot.exec.price - e.price) * matched;
        const commPortion =
          lot.exec.commission * (matched / Math.abs(lot.exec.quantity)) +
          e.commission * (matched / Math.abs(e.quantity));

        out.push({
          external_id: `${lot.exec.external_id}-${e.external_id}`,
          group_key: null,
          symbol,
          asset_class: 'stock',
          side: lot.side,
          quantity: matched,
          entry_price: lot.exec.price,
          exit_price: e.price,
          entry_date: lot.exec.date,
          exit_date: e.date,
          commission: Number(commPortion.toFixed(2)),
          net_pnl: Number((grossPnl - commPortion).toFixed(2)),
          status: 'closed',
          option_strategy: null,
          option_legs: null,
          strike: null,
          expiry_date: null,
          notes: null,
        });

        lot.remaining -= matched;
        toClose -= matched;
        if (lot.remaining <= 0) open.shift();
      }

      // Any leftover closing qty (no matching open) → treat as a new open in the
      // closing direction (rare; shouldn't happen in a valid Flex export).
      if (toClose > 0) {
        open.push({
          exec: { ...e, quantity: closingSide === 'long' ? toClose : -toClose },
          remaining: toClose,
          side: closingSide,
        });
      }
    }

    // Anything still open → emit as an open trade
    for (const lot of open) {
      out.push({
        external_id: lot.exec.external_id,
        group_key: null,
        symbol,
        asset_class: 'stock',
        side: lot.side,
        quantity: lot.remaining,
        entry_price: lot.exec.price,
        exit_price: null,
        entry_date: lot.exec.date,
        exit_date: null,
        commission: Number(lot.exec.commission.toFixed(2)),
        net_pnl: null,
        status: 'open',
        option_strategy: null,
        option_legs: null,
        strike: null,
        expiry_date: null,
        notes: null,
      });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Option grouping: cluster legs by (underlying, expiry), FIFO match per
// (right, strike), classify the strategy.
// ──────────────────────────────────────────────────────────────────────────────
interface BuiltLeg extends ParsedOptionLeg { open_exec_id: string; }

function buildOptionTrades(execs: Execution[]): ParsedTrade[] {
  const groups = new Map<string, Execution[]>();
  for (const e of execs) {
    if (!e.expiry || !e.right || e.strike == null) continue;
    const key = `${e.underlying}__${e.expiry}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const out: ParsedTrade[] = [];

  for (const [groupKey, list] of groups) {
    list.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

    // FIFO per contract (right + strike)
    interface OpenLeg { exec: Execution; remaining: number; side: ParsedSide; }
    const openByContract = new Map<string, OpenLeg[]>();
    const builtLegs: BuiltLeg[] = [];

    for (const e of list) {
      const ck = `${e.right}_${e.strike}`;
      if (!openByContract.has(ck)) openByContract.set(ck, []);
      const queue = openByContract.get(ck)!;

      const explicitlyClose = e.open_close === 'C';
      const explicitlyOpen = e.open_close === 'O';
      const closingSide: ParsedSide = e.quantity > 0 ? 'long' : 'short';

      // OPENING leg
      if (explicitlyOpen || (!explicitlyClose && queue.length === 0)) {
        queue.push({
          exec: e,
          remaining: Math.abs(e.quantity),
          side: e.quantity > 0 ? 'long' : 'short',
        });
        continue;
      }

      // CLOSING leg — match FIFO against opposite-direction open
      let toClose = Math.abs(e.quantity);
      const isExpiration = e.price === 0 && e.realized_pnl !== 0
        || /expir/i.test(e.notes ?? '');

      while (toClose > 0 && queue.length > 0) {
        const lot = queue[0];
        if (lot.side === closingSide) break;
        const matched = Math.min(lot.remaining, toClose);

        const grossPnl =
          lot.side === 'long'
            ? (e.price - lot.exec.price) * matched * 100
            : (lot.exec.price - e.price) * matched * 100;
        const commPortion =
          lot.exec.commission * (matched / Math.abs(lot.exec.quantity)) +
          e.commission * (matched / Math.abs(e.quantity));

        // If the closing fill price is 0, treat as expired
        const status: ParsedStatus =
          e.price === 0 ? 'expired' : 'closed';

        builtLegs.push({
          open_exec_id: lot.exec.external_id,
          external_id: `${lot.exec.external_id}-${e.external_id}`,
          right: e.right!,
          strike: e.strike!,
          expiry: e.expiry!,
          side: lot.side,
          quantity: matched,
          open_price: lot.exec.price,
          close_price: status === 'expired' ? 0 : e.price,
          open_date: lot.exec.date,
          close_date: e.date,
          commission: Number(commPortion.toFixed(2)),
          pnl: Number((grossPnl - commPortion).toFixed(2)),
          status,
        });

        lot.remaining -= matched;
        toClose -= matched;
        if (lot.remaining <= 0) queue.shift();
      }

      if (toClose > 0) {
        // Unmatched: keep as new open in closing direction
        queue.push({
          exec: { ...e, quantity: closingSide === 'long' ? toClose : -toClose },
          remaining: toClose,
          side: closingSide,
        });
      }
      void isExpiration; // (placeholder if we later want explicit expired flag)
    }

    // Anything still open at end of group → emit as open legs
    for (const queue of openByContract.values()) {
      for (const lot of queue) {
        builtLegs.push({
          open_exec_id: lot.exec.external_id,
          external_id: lot.exec.external_id,
          right: lot.exec.right!,
          strike: lot.exec.strike!,
          expiry: lot.exec.expiry!,
          side: lot.side,
          quantity: lot.remaining,
          open_price: lot.exec.price,
          close_price: null,
          open_date: lot.exec.date,
          close_date: null,
          commission: Number(lot.exec.commission.toFixed(2)),
          pnl: null,
          status: 'open',
        });
      }
    }

    if (builtLegs.length === 0) continue;

    // Classify strategy
    const [underlying, expiry] = groupKey.split('__');
    const strategyName = classifyStrategy(builtLegs);
    const allClosed = builtLegs.every(l => l.status !== 'open');
    const status: ParsedStatus = allClosed
      ? (builtLegs.every(l => l.status === 'expired') ? 'expired' : 'closed')
      : 'open';
    const totalPnl = allClosed
      ? builtLegs.reduce((s, l) => s + (l.pnl ?? 0), 0)
      : null;
    const totalComm = builtLegs.reduce((s, l) => s + l.commission, 0);
    const opens = builtLegs.map(l => l.open_date).filter(Boolean) as string[];
    const closes = builtLegs.map(l => l.close_date).filter(Boolean) as string[];
    const front = builtLegs[0];

    out.push({
      external_id: `${groupKey}__${front.open_exec_id}`,
      group_key: groupKey,
      symbol: underlying,
      asset_class: 'option',
      side: front.side,
      quantity: front.quantity,
      entry_price: front.open_price,
      exit_price: builtLegs.length === 1 ? front.close_price : null,
      entry_date: opens.length ? opens.sort()[0] : null,
      exit_date: closes.length === builtLegs.length ? closes.sort().slice(-1)[0] : null,
      commission: Number(totalComm.toFixed(2)),
      net_pnl: totalPnl == null ? null : Number(totalPnl.toFixed(2)),
      status,
      option_strategy: strategyName,
      option_legs: builtLegs.map(({ open_exec_id, ...rest }) => { void open_exec_id; return rest; }),
      strike: builtLegs.length === 1 ? front.strike : null,
      expiry_date: expiry,
      notes: null,
    });
  }

  return out;
}

function classifyStrategy(legs: ParsedOptionLeg[]): string {
  if (legs.length === 1) {
    const l = legs[0];
    if (l.right === 'C') return l.side === 'long' ? 'long_call' : 'short_call';
    return l.side === 'long' ? 'long_put' : 'short_put';
  }
  if (legs.length === 2) {
    const calls = legs.filter(l => l.right === 'C');
    const puts = legs.filter(l => l.right === 'P');
    if (calls.length === 2 || puts.length === 2) return 'vertical_spread';
    if (calls.length === 1 && puts.length === 1) {
      if (calls[0].strike === puts[0].strike && calls[0].side === puts[0].side) {
        return calls[0].side === 'long' ? 'long_straddle' : 'short_straddle';
      }
      return calls[0].side === puts[0].side
        ? (calls[0].side === 'long' ? 'long_strangle' : 'short_strangle')
        : 'risk_reversal';
    }
  }
  if (legs.length === 4) {
    const calls = legs.filter(l => l.right === 'C');
    const puts = legs.filter(l => l.right === 'P');
    if (calls.length === 2 && puts.length === 2) return 'iron_condor';
  }
  if (legs.length === 3) return 'butterfly';
  return 'multi_leg';
}

// ──────────────────────────────────────────────────────────────────────────────
// Public entry point
// ──────────────────────────────────────────────────────────────────────────────
export interface ParseResult {
  trades: ParsedTrade[];
  rawCount: number;
  skipped: number;
  warnings: string[];
}

export function parseIbkrFlexCsv(csvText: string): ParseResult {
  const warnings: string[] = [];
  const rows = extractTradeRows(csvText);
  if (rows.length === 0) {
    return { trades: [], rawCount: 0, skipped: 0, warnings: ['לא נמצאו שורות עסקאות בקובץ.'] };
  }

  const execs: Execution[] = [];
  let skipped = 0;
  rows.forEach((r, i) => {
    const e = rowToExecution(r, i);
    if (e) execs.push(e);
    else skipped++;
  });

  const stocks = execs.filter(e => e.asset_class === 'stock');
  const options = execs.filter(e => e.asset_class === 'option');

  const trades = [...buildStockTrades(stocks), ...buildOptionTrades(options)];
  trades.sort((a, b) => (b.entry_date ?? '').localeCompare(a.entry_date ?? ''));

  if (trades.length === 0) warnings.push('לא ניתן היה לבנות עסקאות מהשורות שנותחו.');

  return { trades, rawCount: rows.length, skipped, warnings };
}
