import { AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import type { PositionResult } from '@/lib/positionCalc';

interface Props {
  result: PositionResult;
  riskAmount: number;
}

const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export default function WarningsBanner({ result, riskAmount }: Props) {
  // §3 — Validation errors take priority (destructive)
  if (!result.isValid && result.errors.length > 0) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-1">
        {result.errors.map((err, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-destructive">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{err}</span>
          </div>
        ))}
      </div>
    );
  }

  if (!result.isValid) return null;

  const warnings: { icon: typeof Info; tone: 'warn' | 'info'; text: string }[] = [];

  // Capped by max position
  if (result.cappedByMaxPosition && riskAmount > 0) {
    warnings.push({
      icon: ShieldAlert,
      tone: 'warn',
      text: `הפוזיציה הוגבלה ע״י החשיפה המקסימלית — סיכון בפועל ${fmtMoney(
        result.totalRiskDollars,
      )} מתוך תקציב של ${fmtMoney(riskAmount)}`,
    });
  }

  // Buying-power / margin
  if (result.marginRequired > 0) {
    warnings.push({
      icon: ShieldAlert,
      tone: 'warn',
      text: `הפוזיציה ${fmtMoney(result.positionSize)} חורגת מגודל החשבון — נדרש מינוף של ${fmtMoney(
        result.marginRequired,
      )}`,
    });
  }

  // Risk-of-ruin proxy
  if (
    result.consecutiveLossesUntilHalvedCount > 0 &&
    result.consecutiveLossesUntilHalvedCount < 20
  ) {
    warnings.push({
      icon: AlertTriangle,
      tone: 'warn',
      text: `סיכון גבוה: ${result.consecutiveLossesUntilHalvedCount} הפסדים רצופים יחציו את החשבון`,
    });
  }

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {warnings.map((w, i) => {
        const Icon = w.icon;
        const cls =
          w.tone === 'warn'
            ? 'border-amber-500/30 bg-amber-500/5 text-amber-500'
            : 'border-primary/30 bg-primary/5 text-primary';
        return (
          <div
            key={i}
            className={`rounded-xl border ${cls} p-3 flex items-center gap-2 text-xs`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span>{w.text}</span>
          </div>
        );
      })}
    </div>
  );
}
