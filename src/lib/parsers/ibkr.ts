import { parseIbkrFlexCsv } from '../ibkr-import';
import type { ParseResult, NormalizedTrade } from './types';

export function parseIbkr(csvText: string): ParseResult {
  const result = parseIbkrFlexCsv(csvText);
  return {
    broker: 'ibkr',
    trades: result.trades as unknown as NormalizedTrade[],
    errors: (result.warnings ?? []).map((m, i) => ({ row: i, message: m })),
  };
}
