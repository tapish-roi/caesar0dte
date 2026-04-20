import type { Side } from '@/lib/positionCalc';
import { rPriceAt, blendedScaleOutR } from '@/lib/positionCalc';

interface Props {
  side: Side;
  entryPrice: number;
  riskPerShare: number;
  shares: number;
  rrRatio: number;
  targetPrice: number;
  commissionTotal: number;
}

const fmtNum = (n: number, d = 2) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString('en-US');

export default function ScaleOutPlan({
  side,
  entryPrice,
  riskPerShare,
  shares,
  rrRatio,
  targetPrice,
  commissionTotal,
}: Props) {
  if (shares <= 0 || riskPerShare <= 0 || rrRatio <= 0 || targetPrice <= 0) return null;

  const leg1Shares = Math.floor(shares / 3);
  const leg2Shares = Math.floor(shares / 3);
  const leg3Shares = shares - leg1Shares - leg2Shares;

  const blendedR = blendedScaleOutR(rrRatio);
  const blendedPnL = shares * riskPerShare * blendedR - commissionTotal;

  const legs = [
    { label: '1/3 ב-+1R', sharesQty: leg1Shares, price: rPriceAt(1, side, entryPrice, riskPerShare) },
    { label: '1/3 ב-+2R', sharesQty: leg2Shares, price: rPriceAt(2, side, entryPrice, riskPerShare) },
    { label: '1/3 ביעד', sharesQty: leg3Shares, price: targetPrice },
  ];

  return (
    <div className="bg-card rounded-2xl card-shadow border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">תכנית יציאה (Scale-out)</h3>
        <div className="text-[11px] text-muted-foreground">
          R ממוצע משוקלל:{' '}
          <span className="font-bold text-emerald-500 tabular-nums">{fmtNum(blendedR)}R</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {legs.map((leg, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg bg-muted/30 border border-border px-3 py-2 text-xs"
          >
            <span className="text-muted-foreground">{leg.label}</span>
            <div className="flex items-center gap-3 tabular-nums">
              <span className="text-foreground">{fmtInt(leg.sharesQty)} מניות</span>
              <span className="font-bold text-foreground">${fmtNum(leg.price)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-2 text-xs flex items-center justify-between">
        <span className="text-muted-foreground">רווח צפוי בתכנית זו</span>
        <span className="font-bold text-emerald-500 tabular-nums">{fmtMoney(blendedPnL)}</span>
      </div>
    </div>
  );
}
