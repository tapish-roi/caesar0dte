import type { PositionResult } from '@/lib/positionCalc';

interface Props {
  result: PositionResult;
  hasTarget: boolean;
  hasCurrentPrice: boolean;
}

const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const fmtNum = (n: number, d = 2) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtInt = (n: number) => n.toLocaleString('en-US');

function Cell({
  label,
  value,
  tone = 'default',
  big = false,
  className = '',
  hint,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'primary' | 'success' | 'danger' | 'warn';
  big?: boolean;
  className?: string;
  hint?: string;
}) {
  const toneClass =
    tone === 'primary'
      ? 'bg-primary/5 border-primary/20 text-primary'
      : tone === 'success'
        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500'
        : tone === 'danger'
          ? 'bg-destructive/5 border-destructive/20 text-destructive'
          : tone === 'warn'
            ? 'bg-amber-500/5 border-amber-500/20 text-amber-500'
            : 'bg-muted/30 border-border text-foreground';
  return (
    <div className={`rounded-xl p-3 border ${toneClass} ${className}`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`${big ? 'text-2xl' : 'text-base'} font-bold tabular-nums mt-0.5`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{hint}</div>}
    </div>
  );
}

export default function ResultsPanel({ result, hasTarget, hasCurrentPrice }: Props) {
  if (!result.isValid) return null;

  const liveTone =
    result.liveRMultiple > 0 ? 'success' : result.liveRMultiple < 0 ? 'danger' : 'default';

  return (
    <div className="bg-card rounded-2xl card-shadow border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3">תוצאות חישוב</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        <Cell label="כמות מניות" value={fmtInt(result.shares)} tone="primary" big />
        <Cell
          label="סיכון בפועל"
          value={fmtMoney(result.totalRiskDollars)}
          tone="warn"
          hint={`${fmtNum(result.riskPctOfAccount)}% מהחשבון`}
        />
        <Cell
          label="שווי פוזיציה"
          value={fmtMoney(result.positionSize)}
          hint={`${fmtNum(result.positionPctOfAccount)}% מהחשבון`}
        />
        <Cell
          label="מרחק סטופ"
          value={`$${fmtNum(result.riskPerShare)}`}
          tone="danger"
          hint={`${fmtNum(result.stopDistancePct)}% מהכניסה`}
        />
        <Cell label="ברייקאיבן" value={`$${fmtNum(result.breakevenPrice)}`} />
        <Cell label="עמלות סה״כ" value={fmtMoney(result.commissionTotal)} />
        {hasTarget && (
          <>
            <Cell
              label="יחס סיכוי/סיכון"
              value={`${fmtNum(result.rrRatio)}R`}
              tone="success"
              hint={`${fmtNum(result.targetDistancePct)}% מהכניסה`}
            />
            <Cell label="רווח פוטנציאלי" value={fmtMoney(result.rewardDollars)} tone="success" />
          </>
        )}
        {hasCurrentPrice && (
          <Cell
            label="R חי"
            value={`${result.liveRMultiple >= 0 ? '+' : ''}${fmtNum(result.liveRMultiple)}R`}
            tone={liveTone}
            big
          />
        )}
        {result.cappedByMaxPosition && (
          <Cell
            label="כמות גולמית (לפני קאפ)"
            value={fmtInt(result.rawShares)}
            tone="warn"
            hint="הוגבלה ע״י חשיפה מקסימלית"
          />
        )}
      </div>
    </div>
  );
}
