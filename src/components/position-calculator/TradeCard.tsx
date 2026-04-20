import { TrendingUp, TrendingDown, Target, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { rPriceAt, type Side, type PositionResult } from '@/lib/positionCalc';

interface Props {
  ticker: string;
  side: Side;
  entryPrice: string;
  stopPrice: string;
  currentPrice: string;
  atr?: number;
  result: PositionResult;
  accountSize: number;
  onTickerChange: (v: string) => void;
  onSideChange: (s: Side) => void;
  onEntryChange: (v: string) => void;
  onStopChange: (v: string) => void;
  onCurrentPriceChange: (v: string) => void;
  onClear: () => void;
  onUseAtrStop: () => void;
}

const fmtNum = (n: number, d = 2) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtInt = (n: number) => n.toLocaleString('en-US');

// R-levels requested by the user
const R_LEVELS = [0.8, 1, 1.2, 2];
// Leverage cap for "מקסימום מניות" — per user spec: 3x
const MAX_LEVERAGE = 3;

export default function TradeCard({
  ticker,
  side,
  entryPrice,
  stopPrice,
  currentPrice,
  atr,
  result,
  accountSize,
  onTickerChange,
  onSideChange,
  onEntryChange,
  onStopChange,
  onCurrentPriceChange,
  onClear,
  onUseAtrStop,
}: Props) {
  const handleTicker = (v: string) => {
    const cleaned = v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
    onTickerChange(cleaned);
  };

  const entryNum = parseFloat(entryPrice) || 0;
  const maxSharesByLeverage =
    entryNum > 0 && accountSize > 0
      ? Math.floor((accountSize * MAX_LEVERAGE) / entryNum)
      : 0;

  const showResults = result.isValid && result.riskPerShare > 0;

  return (
    <div className="relative bg-card rounded-2xl card-shadow border border-border p-5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClear}
        className="absolute top-2 start-2 h-7 w-7 text-muted-foreground hover:text-foreground"
        title="נקה כרטיס"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </Button>

      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">פרטי עסקה ותוצאות</h3>
      </div>

      {/* ── Inputs ──────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              סימול
            </span>
            <Input
              value={ticker}
              onChange={(e) => handleTicker(e.target.value)}
              className="mt-1 uppercase font-bold tracking-wider"
              dir="ltr"
              maxLength={5}
              placeholder="AAPL"
            />
          </label>

          <div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              כיוון
            </span>
            <div className="mt-1 grid grid-cols-2 gap-1 rounded-md border border-border p-0.5 bg-background">
              <button
                type="button"
                onClick={() => onSideChange('long')}
                className={`flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-semibold transition-colors ${
                  side === 'long'
                    ? 'bg-emerald-500/15 text-emerald-500'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                לונג
              </button>
              <button
                type="button"
                onClick={() => onSideChange('short')}
                className={`flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-semibold transition-colors ${
                  side === 'short'
                    ? 'bg-rose-500/15 text-rose-500'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                שורט
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              מחיר כניסה ($)
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={entryPrice}
              onChange={(e) => onEntryChange(e.target.value)}
              className="mt-1 tabular-nums"
              dir="ltr"
              placeholder="0.00"
            />
          </label>

          <label className="block">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                מחיר סטופ ($)
              </span>
              {atr && atr > 0 && (
                <button
                  type="button"
                  onClick={onUseAtrStop}
                  className="text-[10px] text-primary hover:underline"
                  title={`השתמש ב-ATR (${atr.toFixed(2)}) לחישוב סטופ`}
                >
                  ATR ({atr.toFixed(2)})
                </button>
              )}
            </div>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={stopPrice}
              onChange={(e) => onStopChange(e.target.value)}
              className="mt-1 tabular-nums"
              dir="ltr"
              placeholder="0.00"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              מחיר נוכחי ($)
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={currentPrice}
              onChange={(e) => onCurrentPriceChange(e.target.value)}
              className="mt-1 tabular-nums"
              dir="ltr"
              placeholder="0.00"
            />
          </label>
        </div>
      </div>

      {/* ── Computed outputs ──────────────────────────────────────────────── */}
      {showResults && (
        <>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat
              label="גודל הסטופ"
              value={`$${fmtNum(result.riskPerShare)}`}
              hint={`${fmtNum(result.stopDistancePct)}% מהכניסה`}
              tone="danger"
            />
            <Stat
              label="כמות מניות"
              value={fmtInt(result.shares)}
              tone="primary"
              big
            />
            <Stat
              label={`מקסימום מניות (${MAX_LEVERAGE}x)`}
              value={fmtInt(maxSharesByLeverage)}
              hint="לפי מינוף מקס׳"
            />
          </div>

          <div className="mt-3">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              יעדי R
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {R_LEVELS.map((n) => {
                const price = rPriceAt(n, side, entryNum, result.riskPerShare);
                const profit = result.shares * n * result.riskPerShare;
                return (
                  <div
                    key={n}
                    className="rounded-xl border border-border bg-muted/30 p-3 text-center"
                  >
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      +{n}R
                    </div>
                    <div className="text-base font-bold tabular-nums mt-0.5 text-foreground">
                      ${fmtNum(price)}
                    </div>
                    <div className="text-[11px] text-emerald-500 tabular-nums mt-0.5">
                      +${fmtNum(profit)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {currentPrice && parseFloat(currentPrice) > 0 && (
            <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3 flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                R חי
              </span>
              <span
                className={`text-lg font-bold tabular-nums ${
                  result.liveRMultiple > 0
                    ? 'text-emerald-500'
                    : result.liveRMultiple < 0
                      ? 'text-rose-500'
                      : 'text-foreground'
                }`}
              >
                {result.liveRMultiple >= 0 ? '+' : ''}
                {fmtNum(result.liveRMultiple)}R
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'default',
  big = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'primary' | 'danger';
  big?: boolean;
}) {
  const toneClass =
    tone === 'primary'
      ? 'bg-primary/5 border-primary/20 text-primary'
      : tone === 'danger'
        ? 'bg-destructive/5 border-destructive/20 text-destructive'
        : 'bg-muted/30 border-border text-foreground';
  return (
    <div className={`rounded-xl p-3 border ${toneClass}`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`${big ? 'text-2xl' : 'text-base'} font-bold tabular-nums mt-0.5`}>
        {value}
      </div>
      {hint && (
        <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{hint}</div>
      )}
    </div>
  );
}
