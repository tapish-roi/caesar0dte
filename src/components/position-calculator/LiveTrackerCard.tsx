import { Activity, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Props {
  currentPrice: string;
  commissionPerShare: string;
  maxPositionPct: string;
  onCurrentPriceChange: (v: string) => void;
  onCommissionChange: (v: string) => void;
  onMaxPositionPctChange: (v: string) => void;
  onClear: () => void;
}

export default function LiveTrackerCard({
  currentPrice,
  commissionPerShare,
  maxPositionPct,
  onCurrentPriceChange,
  onCommissionChange,
  onMaxPositionPctChange,
  onClear,
}: Props) {
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
        <Activity className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">מעקב חי ועלויות</h3>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            מחיר נוכחי ($) — למעקב R
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
            onChange={(e) => onCommissionChange(e.target.value)}
            className="mt-1 tabular-nums"
            dir="ltr"
            placeholder="0.00"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            חשיפה מקסימלית (% מהחשבון)
          </span>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="1"
            value={maxPositionPct}
            onChange={(e) => onMaxPositionPctChange(e.target.value)}
            className="mt-1 tabular-nums"
            dir="ltr"
            placeholder="100"
          />
        </label>
      </div>
    </div>
  );
}
