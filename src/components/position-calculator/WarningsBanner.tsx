import { AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import type { PositionResult } from '@/lib/positionCalc';
import { consecutiveLossesUntilHalved } from '@/lib/positionCalc';

interface Props {
  result: PositionResult;
  accountSize: number;
  atr?: number;
  riskPerShareForAtr?: number;
}

const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const fmtNum = (n: number, d = 1) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

export default function WarningsBanner({
  result,
  accountSize,
  atr,
  riskPerShareForAtr,
}: Props) {
  // Validation errors take priority
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

  // Buying-power check
  if (result.positionSize > accountSize) {
    warnings.push({
      icon: ShieldAlert,
      tone: 'warn',
      text: `הפוזיציה חורגת מגודל החשבון — נדרש מינוף של ${fmtMoney(result.positionSize - accountSize)}`,
    });
  }

  // Capped by max position
  if (result.cappedByMaxPosition) {
    warnings.push({
      icon: Info,
      tone: 'info',
      text: `כמות המניות הוגבלה ע״י תקרת החשיפה (${result.shares.toLocaleString()} במקום ${result.rawShares.toLocaleString()})`,
    });
  }

  // Risk-of-ruin sanity check
  if (result.riskPctOfAccount > 0 && result.riskPctOfAccount < 100) {
    const ruinN = consecutiveLossesUntilHalved(result.riskPctOfAccount);
    if (ruinN > 0 && ruinN < 20) {
      warnings.push({
        icon: AlertTriangle,
        tone: 'warn',
        text: `סיכון גבוה: ${ruinN} הפסדים רצופים יחציו את החשבון`,
      });
    }
  }

  // ATR-vs-stop ratio
  if (atr && atr > 0 && riskPerShareForAtr && riskPerShareForAtr > 0) {
    const ratio = riskPerShareForAtr / atr;
    if (ratio < 0.5) {
      warnings.push({
        icon: Info,
        tone: 'info',
        text: `הסטופ צמוד מאוד — ${fmtNum(ratio)}× ATR (פחות מחצי ATR)`,
      });
    } else if (ratio > 3) {
      warnings.push({
        icon: Info,
        tone: 'info',
        text: `הסטופ רחב מאוד — ${fmtNum(ratio)}× ATR`,
      });
    }
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
