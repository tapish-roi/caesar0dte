/** Unified shape produced by every broker parser. */
export type NormalizedSide = 'long' | 'short';
export type NormalizedAssetClass = 'stock' | 'option';
export type NormalizedStatus = 'open' | 'closed' | 'expired' | 'cancelled';

export interface NormalizedOptionLeg {
  external_id: string;
  right: 'C' | 'P';
  strike: number;
  expiry: string; // ISO date YYYY-MM-DD
  side: NormalizedSide;
  quantity: number;
  open_price: number | null;
  close_price: number | null;
  open_date: string | null;
  close_date: string | null;
  commission: number;
  pnl: number | null;
  status: NormalizedStatus;
}

export interface NormalizedTrade {
  external_id: string;
  group_key: string | null;
  symbol: string;
  asset_class: NormalizedAssetClass;
  side: NormalizedSide;
  quantity: number;
  entry_price: number | null;
  exit_price: number | null;
  entry_date: string | null;
  exit_date: string | null;
  commission: number;
  net_pnl: number | null;
  status: NormalizedStatus;
  option_strategy: string | null;
  option_legs: NormalizedOptionLeg[] | null;
  strike: number | null;
  expiry_date: string | null;
  notes: string | null;
}

export type BrokerName = 'ibkr' | 'tdameritrade' | 'ninjatrader' | 'unknown';

export interface ParseResult {
  broker: BrokerName;
  trades: NormalizedTrade[];
  errors: { row: number; message: string }[];
}
