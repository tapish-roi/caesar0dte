import { parseIbkrTrades } from '../ibkr-import';
import type { ParseResult, NormalizedTrade } from './types';

export function parseIbkr(csvText: string): ParseResult {
  const trades = parseIbkrTrades(csvText) as unknown as NormalizedTrade[];
  return { broker: 'ibkr', trades, errors: [] };
}
