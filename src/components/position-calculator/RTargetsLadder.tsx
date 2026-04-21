import { Button } from '@/components/ui/button';
import type { Side } from '@/lib/positionCalc';
import { rPriceAt } from '@/lib/positionCalc';

interface Props {
  side: Side;
  entryPrice: number;
  riskPerShare: number;
  shares: number;
  onSetAsTarget: (price: number) => void;
}

const fmtNum = (n: number, d = 2) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

const LEVELS = [1, 2, 3, 5];

export default function RTargetsLadder({
  side,
  entryPrice,
  riskPerShare,
  shares,
  onSetAsTarget,
}: Props) {
  if (entryPrice <= 0 || riskPerShare <= 0 || shares <= 0) return null;

  return (
    <div className="bg-card rounded-2xl card-shadow border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3">סולם יעדי R</h3>
      <div className="space-y-1.5">
        {LEVELS.map((n) => {
          const price = rPriceAt(n, side, entryPrice, riskPerShare);
          const profit = shares * n * riskPerShare;
          return (
            <div
              key={n}
              className="flex items-center justify-between rounded-lg bg-muted/30 border border-border px-3 py-2 text-xs"
            >
              <span className="text-muted-foreground font-semibold">+{n}R</span>
              <div className="flex items-center gap-3 tabular-nums">
                <span className="font-bold text-foreground">${fmtNum(price)}</span>
                <span className="text-emerald-500">{fmtMoney(profit)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onSetAsTarget(price)}
                  className="h-6 text-[10px] text-primary hover:text-primary"
                >
                  קבע כיעד
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
