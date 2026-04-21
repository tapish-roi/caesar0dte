import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { PositionResult, Side } from '@/lib/positionCalc';

interface Props {
  result: PositionResult;
  ticker: string;
  side: Side;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
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
  hint,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'primary' | 'success' | 'danger' | 'warn';
  big?: boolean;
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
    <div className={`rounded-xl p-3 border ${toneClass}`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`${big ? 'text-2xl' : 'text-base'} font-bold tabular-nums mt-0.5`}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{hint}</div>}
    </div>
  );
}

export default function ResultsPanel({
  result,
  ticker,
  side,
  entryPrice,
  stopPrice,
  targetPrice,
  hasTarget,
  hasCurrentPrice,
}: Props) {
  const { toast } = useToast();
  if (!result.isValid) return null;

  const liveTone =
    result.liveRMultiple > 0 ? 'success' : result.liveRMultiple < 0 ? 'danger' : 'default';

  const handleCopy = async () => {
    const lines = [
      `Symbol: ${ticker || '—'}`,
      `Side: ${side === 'long' ? 'LONG' : 'SHORT'}`,
      `Shares: ${fmtInt(result.shares)}`,
      `Entry: ${fmtMoney(entryPrice)}`,
      `Stop: ${fmtMoney(stopPrice)}`,
      hasTarget && targetPrice ? `Target: ${fmtMoney(targetPrice)}` : null,
      `Risk: ${fmtMoney(result.totalRiskDollars)} (${fmtNum(result.riskPctOfAccount)}%)`,
      hasTarget ? `R:R = ${fmtNum(result.rrRatio)}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(lines);
      toast({ title: 'הועתק', description: 'תוכנית העסקה הועתקה ללוח' });
    } catch {
      toast({
        title: 'שגיאת העתקה',
        description: 'לא ניתן לגשת ללוח',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="bg-card rounded-2xl card-shadow border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">תוצאות חישוב</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="text-xs"
        >
          <Copy className="w-3.5 h-3.5" />
          העתק תוכנית
        </Button>
      </div>

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
