import { TrendingUp, TrendingDown, Target, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Side } from '@/lib/positionCalc';

interface Props {
  ticker: string;
  side: Side;
  entryPrice: string;
  stopPrice: string;
  targetPrice: string;
  atr?: number; // optional, from stock_atr_data cache
  onTickerChange: (v: string) => void;
  onSideChange: (s: Side) => void;
  onEntryChange: (v: string) => void;
  onStopChange: (v: string) => void;
  onTargetChange: (v: string) => void;
  onClear: () => void;
  onUseAtrStop: () => void;
}

export default function TradeSetupCard({
  ticker,
  side,
  entryPrice,
  stopPrice,
  targetPrice,
  atr,
  onTickerChange,
  onSideChange,
  onEntryChange,
  onStopChange,
  onTargetChange,
  onClear,
  onUseAtrStop,
}: Props) {
  const handleTicker = (v: string) => {
    const cleaned = v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
    onTickerChange(cleaned);
  };

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
        <h3 className="text-sm font-semibold text-foreground">פרטי העסקה</h3>
      </div>

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
          <div className="flex items-center justify-between">
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
                השתמש ב-ATR ({atr.toFixed(2)})
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
            מחיר יעד ($) — אופציונלי
          </span>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={targetPrice}
            onChange={(e) => onTargetChange(e.target.value)}
            className="mt-1 tabular-nums"
            dir="ltr"
            placeholder="0.00"
          />
        </label>
      </div>
    </div>
  );
}
