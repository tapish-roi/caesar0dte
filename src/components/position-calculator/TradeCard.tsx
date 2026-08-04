import { PlusIcon, ResetIcon, TrendDownIcon, TrendIcon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ADD_ON_R_LEVELS,
  R_LEVELS,
  formatCurrency,
  formatInt,
  formatR,
  type AddOnCalc,
  type BaseCalc,
  type CalculatorBox,
} from '@/lib/positionCalc';

interface Props {
  box: CalculatorBox;
  base: BaseCalc | null;
  addOn: AddOnCalc | null;
  /** Latest cached ATR(14) for box.ticker, when there is one. */
  atr?: number;
  /** Tickers the user currently tracks in the ATR calculator. */
  atrTickers: string[];
  onChange: (patch: Partial<CalculatorBox>) => void;
  onClear: () => void;
  onUseAtrStop: () => void;
}

export default function TradeCard({
  box,
  base,
  addOn,
  atr,
  atrTickers,
  onChange,
  onClear,
  onUseAtrStop,
}: Props) {
  const hasAtr = (atr ?? 0) > 0;

  // The dropdown is driven by the ATR list. A ticker already saved on this box
  // but no longer in that list still needs to show, so union it in.
  const tickerOptions = box.ticker && !atrTickers.includes(box.ticker)
    ? [box.ticker, ...atrTickers]
    : atrTickers;

  return (
    <Card className="relative rounded-2xl p-5 pt-10">
      {/* Whole-card direction accent — green when the trade computes as long,
          red when short. A translucent inset overlay so it tints over the glass
          without clobbering the card's own shadow/edge. */}
      {base && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ${
            base.isLong
              ? 'bg-[rgba(52,211,153,0.06)] ring-[rgba(52,211,153,0.35)]'
              : 'bg-[rgba(244,63,94,0.07)] ring-[rgba(244,63,94,0.4)]'
          }`}
        />
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClear}
        className="absolute top-2 end-2 h-7 w-7 text-muted-foreground hover:text-foreground z-10"
        title="נקה כרטיס"
      >
        <ResetIcon className="w-3.5 h-3.5" />
      </Button>

      {/* Ticker only feeds the ATR lookup — it takes no part in the math.
          Direction is inferred from entry vs stop, never a user toggle.
          The list is the tickers the user tracks in the ATR calculator. */}
      <div className="mb-3 flex items-center gap-2 -mt-6">
        <Select
          value={box.ticker || undefined}
          onValueChange={(v) => onChange({ ticker: v })}
        >
          <SelectTrigger
            dir="ltr"
            className="aurora-mono uppercase tracking-wider w-28 h-9 rounded-xl px-3 text-sm"
          >
            <SelectValue placeholder="סימול" />
          </SelectTrigger>
          <SelectContent>
            {tickerOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                אין סימולים במחשבון ה-ATR
              </div>
            ) : (
              tickerOptions.map((t) => (
                <SelectItem key={t} value={t} dir="ltr" className="aurora-mono">
                  {t}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {base && (
          <Badge
            variant={base.isLong ? 'success' : 'destructive'}
            className="gap-1 text-[11px]"
          >
            {base.isLong ? (
              <>
                <TrendIcon solid className="w-3 h-3" /> לונג
              </>
            ) : (
              <>
                <TrendDownIcon solid className="w-3 h-3" /> שורט
              </>
            )}
          </Badge>
        )}
        {/* One-click stop from the cached ATR. It lives here rather than inside
            the stop field — that field is one of three in a narrow grid and has
            no room for an overlay without clipping the value. */}
        {hasAtr && (
          <button
            type="button"
            onClick={onUseAtrStop}
            className="aurora-chip aurora-chip-cyan rounded-lg px-2 py-1 text-[10px] aurora-mono text-[#a5d8e6] whitespace-nowrap transition-all hover:text-[#d3eef6] hover:shadow-[0_0_16px_-5px_rgba(90,200,230,0.6)]"
            title={`קבע סטופ לפי ATR (${(atr as number).toFixed(2)})`}
          >
            ATR {(atr as number).toFixed(2)}
          </button>
        )}
      </div>

      {/* ── Inputs ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={box.entryPrice}
          onChange={(e) => onChange({ entryPrice: e.target.value })}
          className="aurora-mono aurora-field-emerald min-w-0"
          dir="ltr"
          placeholder="מחיר כניסה ($)"
        />

        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={box.stopLoss}
          onChange={(e) => onChange({ stopLoss: e.target.value })}
          className="aurora-mono aurora-field-rose min-w-0"
          dir="ltr"
          placeholder="מחיר סטופ ($)"
        />

        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={box.currentPrice}
          onChange={(e) => onChange({ currentPrice: e.target.value })}
          className="aurora-mono min-w-0"
          dir="ltr"
          placeholder="מחיר נוכחי ($)"
        />
      </div>

      {/* ── Computed outputs ──────────────────────────────────────────────── */}
      {base && (
        <>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat
              label="גודל הסטופ"
              value={formatCurrency(base.stopSize)}
              tone="danger"
            />
            <Stat
              label="כמות מניות"
              value={formatInt(base.shares)}
              tone={base.exceedsMaxRisk ? 'danger' : 'primary'}
              big
            />
            <Stat
              label="מקסימום מניות (3%)"
              value={formatInt(base.maxSize)}
            />
          </div>

          <div className="mt-3">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              יעדי R
            </div>
            {/* dir="ltr" orders the targets 0.8R (leftmost) → 2R (rightmost),
                overriding the page's RTL flow. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" dir="ltr">
              {R_LEVELS.map((n) => (
                <div
                  key={n}
                  className="aurora-alert aurora-alert-emerald rounded-xl p-3 text-center"
                >
                  {/* dir="ltr" keeps the leading sign on the left — in the RTL
                      page a bare "+" is bidi-reordered to the end. */}
                  <div className="text-[10px] text-[#6ee7b7]/80 uppercase tracking-wider" dir="ltr">
                    +{n}R
                  </div>
                  <div className="text-base font-bold aurora-mono mt-0.5 text-foreground" dir="ltr">
                    {formatCurrency(base.target(n))}
                  </div>
                  <div className="text-[11px] text-[#6ee7b7] aurora-mono mt-0.5" dir="ltr">
                    +{formatCurrency(base.shares * n * base.stopSize)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {base.currentR !== null && (
            <div className="mt-3 aurora-alert aurora-alert-neutral rounded-xl p-3 flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                R חי
              </span>
              <span
                dir="ltr"
                className={`text-lg font-bold aurora-mono ${
                  base.currentR > 0
                    ? 'text-[#6ee7b7]'
                    : base.currentR < 0
                      ? 'text-[#fda4af]'
                      : 'text-foreground'
                }`}
              >
                {formatR(base.currentR)}R
              </span>
            </div>
          )}

          {/* ── Add to Position ───────────────────────────────────────────── */}
          <div className="mt-5 pt-4 border-t border-[var(--lg-border)]">
            <div className="flex items-center gap-2 mb-3">
              <PlusIcon className="w-4 h-4 text-[#e2b54e]" />
              <h4 className="text-sm font-semibold text-foreground">הוספה לעסקה</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={box.addOnPrice}
                onChange={(e) => onChange({ addOnPrice: e.target.value })}
                className="aurora-mono aurora-field-emerald min-w-0"
                dir="ltr"
                placeholder="מחיר הוספה ($)"
              />

              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={box.newStopLoss}
                onChange={(e) => onChange({ newStopLoss: e.target.value })}
                className="aurora-mono aurora-field-rose min-w-0"
                dir="ltr"
                placeholder="סטופ חדש ($)"
              />

              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={box.currentPriceAddOn}
                onChange={(e) => onChange({ currentPriceAddOn: e.target.value })}
                className="aurora-mono min-w-0"
                dir="ltr"
                placeholder="מחיר נוכחי ($)"
              />
            </div>

            {addOn && (
              <>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat
                    label="גודל סטופ חדש"
                    value={formatCurrency(addOn.addOnStop)}
                    tone="danger"
                  />
                  <Stat
                    label="כמות להוספה"
                    value={formatInt(addOn.addOnSize)}
                    tone="primary"
                  />
                  <Stat label="מחיר ממוצע" value={formatCurrency(addOn.avgPrice)} />
                  <Stat
                    label="סה״כ מניות"
                    value={formatInt(addOn.totalShares)}
                  />
                </div>

                <div className="mt-3">
                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    יעדי R חדשים (מהממוצע)
                  </div>
                  {/* dir="ltr" orders the add-on targets +1R (leftmost) → +3R
                      (rightmost), overriding the page's RTL flow. */}
                  <div className="grid grid-cols-3 gap-2" dir="ltr">
                    {ADD_ON_R_LEVELS.map((n) => (
                      <div
                        key={n}
                        className="aurora-alert aurora-alert-emerald rounded-xl p-3 text-center"
                      >
                        <div className="text-[10px] text-[#6ee7b7]/80 uppercase tracking-wider">
                          <span dir="ltr">+{n}R</span> חדש
                        </div>
                        <div className="text-base font-bold aurora-mono mt-0.5 text-foreground" dir="ltr">
                          {formatCurrency(addOn.newTarget(n))}
                        </div>
                        <div className="text-[11px] text-[#6ee7b7] aurora-mono mt-0.5" dir="ltr">
                          +{formatCurrency(addOn.totalShares * n * addOn.newStopDistance)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {addOn.currentRAddOn !== null && (
                  <div className="mt-3 aurora-alert aurora-alert-neutral rounded-xl p-3 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      R חי לאחר הוספה
                    </span>
                    <span
                      dir="ltr"
                      className={`text-lg font-bold aurora-mono ${
                        addOn.currentRAddOn > 0
                          ? 'text-[#6ee7b7]'
                          : addOn.currentRAddOn < 0
                            ? 'text-[#fda4af]'
                            : 'text-foreground'
                      }`}
                    >
                      {formatR(addOn.currentRAddOn)}R
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
  big = false,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'primary' | 'danger';
  big?: boolean;
}) {
  const toneClass =
    tone === 'primary'
      ? 'aurora-alert-gold text-[#e2b54e]'
      : tone === 'danger'
        ? 'aurora-alert-rose text-[#fda4af]'
        : 'aurora-alert-neutral text-foreground';
  return (
    <div className={`aurora-alert rounded-xl p-3 min-w-0 ${toneClass}`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight break-words">{label}</div>
      <div className={`${big ? 'text-2xl' : 'text-base'} font-bold aurora-mono mt-0.5 break-words`}>
        {value}
      </div>
    </div>
  );
}
