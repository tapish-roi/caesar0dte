import { Activity, RotateCcw, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Props {
  currentPrice: string;
  commissionPerShare: string;
  liveRMultiple: number;
  hasCurrentPrice: boolean;
  closePriceFromAtr?: number;
  onCurrentPriceChange: (v: string) => void;
  onCommissionPerShareChange: (v: string) => void;
  onClear: () => void;
  onSyncFromAtr: () => void;
}

const fmt = (n: number, d = 2) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

export default function LiveTrackerCard({
  currentPrice,
  commissionPerShare,
  liveRMultiple,
  hasCurrentPrice,
  closePriceFromAtr,
  onCurrentPriceChange,
  onCommissionPerShareChange,
  onClear,
  onSyncFromAtr,
}: Props) {
  const liveColor =
    liveRMultiple > 0 ? 'text-emerald-500' : liveRMultiple < 0 ? 'text-rose-500' : 'text-foreground';

  return (
    <div className="relative bg-card rounded-2xl card-shadow border border-border p-5 h-full">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClear}
        className="absolute top-2 end-2 h-7 w-7 text-muted-foreground hover:text-foreground"
        title="נקה כרטיס"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </Button>

      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">מעקב חי ועלויות</h3>
      </div>

      <div className="space-y-3">
        <label className="block">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              מחיר נוכחי ($)
            </span>
            {closePriceFromAtr && closePriceFromAtr > 0 && (
              <button
                type="button"
                onClick={onSyncFromAtr}
                className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                סנכרן מ-Finviz ({closePriceFromAtr.toFixed(2)})
              </button>
            )}
          </div>
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
          {hasCurrentPrice && (
            <span className={`text-[11px] mt-1 block tabular-nums font-semibold ${liveColor}`}>
              R חי: {liveRMultiple >= 0 ? '+' : ''}
              {fmt(liveRMultiple)}R
            </span>
          )}
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            עמלה למניה ($)
          </span>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.001"
            value={commissionPerShare}
            onChange={(e) => onCommissionPerShareChange(e.target.value)}
            className="mt-1 tabular-nums"
            dir="ltr"
            placeholder="0.00"
          />
          <span className="text-[10px] text-muted-foreground mt-1 block">
            עמלה לכיוון אחד · מחושב הלוך-ושוב
          </span>
        </label>
      </div>
    </div>
  );
}
