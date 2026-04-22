import { useEffect, useMemo } from 'react';
import { RotateCcw, PlusCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { rPriceAt, type Side, type PositionResult } from '@/lib/positionCalc';

interface Props {
  entryPrice: string;
  stopPrice: string;
  currentPrice: string;
  addPrice: string;
  addStopPrice: string;
  atr?: number;
  result: PositionResult;
  accountSize: number;
  riskAmount: number;
  onEntryChange: (v: string) => void;
  onStopChange: (v: string) => void;
  onCurrentPriceChange: (v: string) => void;
  onAddPriceChange: (v: string) => void;
  onAddStopChange: (v: string) => void;
  onSideDetected: (s: Side) => void;
  onClear: () => void;
  onUseAtrStop: () => void;
}

const fmtNum = (n: number, d = 2) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtInt = (n: number) => n.toLocaleString('en-US');

const R_LEVELS = [0.8, 1, 1.2, 2];
const ADD_R_LEVELS = [1, 2, 3];
const MAX_LEVERAGE = 3;

export default function TradeCard({
  entryPrice,
  stopPrice,
  currentPrice,
  addPrice,
  addStopPrice,
  atr,
  result,
  accountSize,
  riskAmount,
  onEntryChange,
  onStopChange,
  onCurrentPriceChange,
  onAddPriceChange,
  onAddStopChange,
  onSideDetected,
  onClear,
  onUseAtrStop,
}: Props) {
  const entryNum = parseFloat(entryPrice) || 0;
  const stopNum = parseFloat(stopPrice) || 0;

  // Auto-detect side: stop below entry → long, stop above entry → short
  const detectedSide: Side | null = useMemo(() => {
    if (!entryNum || !stopNum || entryNum === stopNum) return null;
    return stopNum < entryNum ? 'long' : 'short';
  }, [entryNum, stopNum]);

  // Notify parent so calculation logic uses the detected side
  useEffect(() => {
    if (detectedSide) onSideDetected(detectedSide);
  }, [detectedSide, onSideDetected]);

  const sideForCalc: Side = detectedSide ?? 'long';

  const maxSharesByLeverage =
    entryNum > 0 && accountSize > 0
      ? Math.floor((accountSize * MAX_LEVERAGE) / entryNum)
      : 0;

  const showResults = result.isValid && result.riskPerShare > 0;

  // ── Add-to-position math ──────────────────────────────────────────────────
  // Goal: total $ risk on the COMBINED position (from blended avg → new stop)
  // must stay equal to the user-defined riskAmount.
  //
  //   originalShares*(entry − newStop) + addShares*(addPrice − newStop) = riskAmount
  // ⇒ addShares = (riskAmount − originalShares*(entry − newStop)) / (addPrice − newStop)
  //
  // Sign-aware via absolute values so it works for both long and short.
  const addPriceNum = parseFloat(addPrice) || 0;
  const addStopNum = parseFloat(addStopPrice) || 0;
  const newRiskPerShare = addPriceNum && addStopNum && addPriceNum !== addStopNum
    ? Math.abs(addPriceNum - addStopNum)
    : 0;

  const originalRiskAtNewStop =
    addStopNum && entryNum ? result.shares * Math.abs(entryNum - addStopNum) : 0;
  const remainingRiskBudget = riskAmount - originalRiskAtNewStop;
  const addShares = newRiskPerShare > 0 && remainingRiskBudget > 0
    ? Math.floor(remainingRiskBudget / newRiskPerShare)
    : 0;

  // Combined position (original shares + add shares)
  const combinedShares = result.shares + addShares;
  const avgPrice = combinedShares > 0
    ? (result.shares * entryNum + addShares * addPriceNum) / combinedShares
    : 0;

  // R for targets = distance from blended avg to the new stop
  const newRForBlended = avgPrice && addStopNum && avgPrice !== addStopNum
    ? Math.abs(avgPrice - addStopNum)
    : 0;
  const newSide: Side = avgPrice && addStopNum
    ? (addStopNum < avgPrice ? 'long' : 'short')
    : sideForCalc;

  // Live R for the combined position
  const currentNum = parseFloat(currentPrice) || 0;
  const liveRAfterAdd = currentNum > 0 && newRForBlended > 0
    ? (newSide === 'long'
        ? (currentNum - avgPrice) / newRForBlended
        : (avgPrice - currentNum) / newRForBlended)
    : 0;

  const showAddResults = addShares > 0 && newRForBlended > 0;

  return (
    <div className="relative bg-card rounded-2xl card-shadow border border-border p-5">
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

      {detectedSide && (
        <div className="mb-3 flex justify-start">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
              detectedSide === 'long'
                ? 'bg-emerald-500/15 text-emerald-500'
                : 'bg-rose-500/15 text-rose-500'
            }`}
          >
            {detectedSide === 'long' ? (
              <>
                <TrendingUp className="w-3 h-3" /> לונג
              </>
            ) : (
              <>
                <TrendingDown className="w-3 h-3" /> שורט
              </>
            )}
          </span>
        </div>
      )}

      {/* ── Inputs ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="block">
          <span className="text-[11px] font-medium text-emerald-500 uppercase tracking-wider">
            מחיר כניסה ($)
          </span>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={entryPrice}
            onChange={(e) => onEntryChange(e.target.value)}
            className="mt-1 tabular-nums border-emerald-500/40 bg-emerald-500/5 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/30 hover:border-emerald-500/60 hover:shadow-[0_0_18px_-4px_rgb(16,185,129,0.35)] transition-all"
            dir="ltr"
            placeholder="0.00"
          />
        </label>

        <label className="block">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-medium text-rose-500 uppercase tracking-wider">
              מחיר סטופ ($)
            </span>
            {atr && atr > 0 && (
              <button
                type="button"
                onClick={onUseAtrStop}
                className="text-[10px] text-primary hover:underline"
                title={`השתמש ב-ATR (${atr.toFixed(2)}) לחישוב סטופ`}
              >
                ATR ({atr.toFixed(2)})
              </button>
            )}
          </div>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={stopPrice}
            onChange={(e) => onStopChange(e.target.value)}
            className="mt-1 tabular-nums border-rose-500/40 bg-rose-500/5 focus-visible:border-rose-500 focus-visible:ring-rose-500/30 hover:border-rose-500/60 hover:shadow-[0_0_18px_-4px_rgb(244,63,94,0.35)] transition-all"
            dir="ltr"
            placeholder="0.00"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            מחיר נוכחי ($)
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
      </div>

      {/* ── Computed outputs ──────────────────────────────────────────────── */}
      {showResults && (
        <>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat
              label="גודל הסטופ"
              value={`$${fmtNum(result.riskPerShare)}`}
              hint={`${fmtNum(result.stopDistancePct)}% מהכניסה`}
              tone="danger"
            />
            <Stat label="כמות מניות" value={fmtInt(result.shares)} tone="primary" big />
            <Stat
              label={`מקסימום מניות (${MAX_LEVERAGE}x)`}
              value={fmtInt(maxSharesByLeverage)}
              hint="לפי מינוף מקס׳"
            />
          </div>

          <div className="mt-3">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              יעדי R
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {R_LEVELS.map((n) => {
                const price = rPriceAt(n, sideForCalc, entryNum, result.riskPerShare);
                const profit = result.shares * n * result.riskPerShare;
                return (
                  <div
                    key={n}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-center shadow-[0_0_22px_-10px_rgb(16,185,129,0.45)]"
                  >
                    <div className="text-[10px] text-emerald-500/80 uppercase tracking-wider">
                      +{n}R
                    </div>
                    <div className="text-base font-bold tabular-nums mt-0.5 text-foreground">
                      ${fmtNum(price)}
                    </div>
                    <div className="text-[11px] text-emerald-500 tabular-nums mt-0.5">
                      +${fmtNum(profit)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {currentPrice && parseFloat(currentPrice) > 0 && (
            <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3 flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                R חי
              </span>
              <span
                className={`text-lg font-bold tabular-nums ${
                  result.liveRMultiple > 0
                    ? 'text-emerald-500'
                    : result.liveRMultiple < 0
                      ? 'text-rose-500'
                      : 'text-foreground'
                }`}
              >
                {result.liveRMultiple >= 0 ? '+' : ''}
                {fmtNum(result.liveRMultiple)}R
              </span>
            </div>
          )}

          {/* ── Add to Position ───────────────────────────────────────────── */}
          <div className="mt-5 pt-4 border-t border-border">
            <div className="flex items-center gap-2 mb-3">
              <PlusCircle className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">הוספה לעסקה</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] font-medium text-emerald-500 uppercase tracking-wider">
                  מחיר הוספה ($)
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={addPrice}
                  onChange={(e) => onAddPriceChange(e.target.value)}
                  className="mt-1 tabular-nums border-emerald-500/40 bg-emerald-500/5 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/30 hover:border-emerald-500/60 hover:shadow-[0_0_18px_-4px_rgb(16,185,129,0.35)] transition-all"
                  dir="ltr"
                  placeholder="0.00"
                />
              </label>

              <label className="block">
                <span className="text-[11px] font-medium text-rose-500 uppercase tracking-wider">
                  סטופ חדש ($)
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={addStopPrice}
                  onChange={(e) => onAddStopChange(e.target.value)}
                  className="mt-1 tabular-nums border-rose-500/40 bg-rose-500/5 focus-visible:border-rose-500 focus-visible:ring-rose-500/30 hover:border-rose-500/60 hover:shadow-[0_0_18px_-4px_rgb(244,63,94,0.35)] transition-all"
                  dir="ltr"
                  placeholder="0.00"
                />
              </label>
            </div>

            {showAddResults && (
              <>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat
                    label="גודל סטופ חדש"
                    value={`$${fmtNum(newRiskPerShare)}`}
                    tone="danger"
                  />
                  <Stat
                    label="כמות להוספה"
                    value={fmtInt(addShares)}
                    tone="primary"
                  />
                  <Stat label="מחיר ממוצע" value={`$${fmtNum(avgPrice)}`} />
                  <Stat
                    label="סה״כ מניות"
                    value={fmtInt(combinedShares)}
                  />
                </div>

                <div className="mt-3">
                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    יעדי R חדשים (מהממוצע)
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {ADD_R_LEVELS.map((n) => {
                      const price = rPriceAt(n, newSide, avgPrice, newRForBlended);
                      const profit = combinedShares * n * newRForBlended;
                      return (
                        <div
                          key={n}
                          className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-center shadow-[0_0_22px_-10px_rgb(16,185,129,0.45)]"
                        >
                          <div className="text-[10px] text-emerald-500/80 uppercase tracking-wider">
                            +{n}R חדש
                          </div>
                          <div className="text-base font-bold tabular-nums mt-0.5 text-foreground">
                            ${fmtNum(price)}
                          </div>
                          <div className="text-[11px] text-emerald-500 tabular-nums mt-0.5">
                            +${fmtNum(profit)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {currentNum > 0 && (
                  <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      R חי לאחר הוספה
                    </span>
                    <span
                      className={`text-lg font-bold tabular-nums ${
                        liveRAfterAdd > 0
                          ? 'text-emerald-500'
                          : liveRAfterAdd < 0
                            ? 'text-rose-500'
                            : 'text-foreground'
                      }`}
                    >
                      {liveRAfterAdd >= 0 ? '+' : ''}
                      {fmtNum(liveRAfterAdd)}R
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'default',
  big = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'primary' | 'danger';
  big?: boolean;
}) {
  const toneClass =
    tone === 'primary'
      ? 'bg-primary/5 border-primary/20 text-primary'
      : tone === 'danger'
        ? 'bg-destructive/5 border-destructive/20 text-destructive'
        : 'bg-muted/30 border-border text-foreground';
  return (
    <div className={`rounded-xl p-3 border ${toneClass}`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`${big ? 'text-2xl' : 'text-base'} font-bold tabular-nums mt-0.5`}>
        {value}
      </div>
      {hint && (
        <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{hint}</div>
      )}
    </div>
  );
}
