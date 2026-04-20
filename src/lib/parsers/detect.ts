import type { BrokerName, ParseResult } from './types';
import { parseIbkr } from './ibkr';
import { parseTdAmeritrade } from './tdameritrade';
import { parseNinjaTrader } from './ninjatrader';

export function detectBroker(csvText: string): BrokerName {
  const head = csvText.slice(0, 4096).toLowerCase();
  if (head.startsWith('trades,header') || head.includes('trades,data,')) return 'ibkr';
  if (head.includes('assetclass') || head.includes('ibcommission') || head.includes('underlyingsymbol')) return 'ibkr';
  if (head.includes('transaction id') && head.includes('description') && head.includes('symbol')) return 'tdameritrade';
  if (head.includes('instrument') && (head.includes('b/s') || head.includes('cum. net profit'))) return 'ninjatrader';
  return 'unknown';
}

export function parseAny(csvText: string, hint?: BrokerName): ParseResult {
  const broker = hint && hint !== 'unknown' ? hint : detectBroker(csvText);
  switch (broker) {
    case 'ibkr':         return parseIbkr(csvText);
    case 'tdameritrade': return parseTdAmeritrade(csvText);
    case 'ninjatrader':  return parseNinjaTrader(csvText);
    default:
      return { broker: 'unknown', trades: [], errors: [{ row: 0, message: 'לא זוהה ברוקר נתמך. נתמכים: IBKR, TD Ameritrade, NinjaTrader' }] };
  }
}
