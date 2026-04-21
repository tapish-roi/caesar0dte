import { Wallet, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface Props {
  accountSize: string;
  riskAmount: string;
  maxPositionPct: string;
  onAccountSizeChange: (v: string) => void;
  onRiskAmountChange: (v: string) => void;
  onMaxPositionPctChange: (v: string) => void;
  onClear: () => void;
}

export default function AccountCard({
  accountSize,
  riskAmount,
  maxPositionPct,
  onAccountSizeChange,
  onRiskAmountChange,
  onMaxPositionPctChange,
  onClear,
}: Props) {
  const acct = parseFloat(accountSize);
  const risk = parseFloat(riskAmount);
  const maxPct = parseFloat(maxPositionPct);

  const riskPctOfAccount =
    Number.isFinite(acct) && acct > 0 && Number.isFinite(risk) ? (risk / acct) * 100 : 0;

  const applyPreset = (pct: number) => {
    if (!Number.isFinite(acct) || acct <= 0) return;
    onRiskAmountChange((acct * pct).toFixed(2));
  };

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
        <Wallet className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">חשבון וסיכון</h3>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            גודל חשבון ($)
          </span>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="100"
            value={accountSize}
            onChange={(e) => onAccountSizeChange(e.target.value)}
            className="mt-1 tabular-nums"
            dir="ltr"
            placeholder="100000"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            סיכון לעסקה ($)
          </span>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="10"
            value={riskAmount}
            onChange={(e) => onRiskAmountChange(e.target.value)}
            className="mt-1 tabular-nums"
            dir="ltr"
            placeholder="1000"
          />
          {riskPctOfAccount > 0 && (
            <span className="text-[10px] text-muted-foreground mt-1 block tabular-nums">
              ≈ {riskPctOfAccount.toFixed(2)}% מהחשבון
            </span>
          )}
        </label>

        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: '0.5R', pct: 0.005 },
            { label: '1R', pct: 0.01 },
            { label: '2R', pct: 0.02 },
          ].map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset(p.pct)}
              className="text-[11px] h-8"
            >
              {p.label}
            </Button>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              חשיפה מקסימלית (%)
            </span>
            <Input
              type="number"
              min="0"
              max="100"
              step="1"
              value={maxPositionPct}
              onChange={(e) => onMaxPositionPctChange(e.target.value)}
              className="mt-1 w-20 h-8 text-xs tabular-nums"
              dir="ltr"
            />
          </div>
          <Slider
            value={[Number.isFinite(maxPct) ? Math.max(0, Math.min(100, maxPct)) : 100]}
            onValueChange={(v) => onMaxPositionPctChange(String(v[0]))}
            min={0}
            max={100}
            step={1}
            className="mt-3"
          />
        </div>
      </div>
    </div>
  );
}
