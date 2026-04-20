import { Wallet, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Props {
  accountSize: string;
  riskAmount: string;
  onAccountSizeChange: (v: string) => void;
  onRiskAmountChange: (v: string) => void;
  onClear: () => void;
}


export default function AccountCard({
  accountSize,
  riskAmount,
  onAccountSizeChange,
  onRiskAmountChange,
  onClear,
}: Props) {
  const acct = parseFloat(accountSize);

  const riskPctOfAccount =
    Number.isFinite(acct) && acct > 0 && Number.isFinite(parseFloat(riskAmount))
      ? (parseFloat(riskAmount) / acct) * 100
      : 0;

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
      </div>
    </div>
  );
}
