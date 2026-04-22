import type { Side } from '@/lib/positionCalc';
import { rPriceAt } from '@/lib/positionCalc';

interface Props {
  side: Side;
  entryPrice: number;
  riskPerShare: number;
  shares: number;
}

const fmtNum = (n: number, d = 2) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

const LEVELS = [1, 2, 3];

export default function RTargetsLadder({ side, entryPrice, riskPerShare, shares }: Props) {
  if (entryPrice <= 0 || riskPerShare <= 0 || shares <= 0) return null;

  return (
    <div className="bg-card rounded-2xl card-shadow border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3">סולם יעדי R</h3>
      <div className="grid grid-cols-3 gap-2">
        {LEVELS.map((n) => {
          const price = rPriceAt(n, side, entryPrice, riskPerShare);
          const profit = shares * n * riskPerShare;
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
                {fmtMoney(profit)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
