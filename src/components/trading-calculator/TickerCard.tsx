import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownRightIcon, ArrowUpRightIcon, EditIcon, LoaderIcon, TrashIcon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { addToList, type ListSide } from '@/lib/atrLists';

interface TickerCardProps {
  ticker: string;
  closePrice: number;
  atr: number;
  /** True while this ticker's data is being (re)fetched from Finviz. */
  loading?: boolean;
  onTickerChange: (newTicker: string) => void;
  onRemove: () => void;
  animationDelay?: number;
}

const fmt = (n: number, d = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const SIDE_LABEL: Record<ListSide, string> = { long: 'הלונגים', short: 'השורטים' };

export default function TickerCard({
  ticker,
  closePrice,
  atr,
  loading = false,
  onTickerChange,
  onRemove,
  animationDelay = 0,
}: TickerCardProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(ticker);
  const inputRef = useRef<HTMLInputElement>(null);

  // Optional per-card overrides. Blank means "use the close price".
  const [longBaseInput, setLongBaseInput] = useState('');
  const [shortBaseInput, setShortBaseInput] = useState('');

  useEffect(() => setDraft(ticker), [ticker]);
  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  const empty = closePrice === 0 && atr === 0;

  const longBase = parseFloat(longBaseInput) || closePrice;
  const shortBase = parseFloat(shortBaseInput) || closePrice;
  const halfAtr = atr * 0.5;

  const long50 = longBase + halfAtr;
  const long100 = longBase + atr;
  const short50 = shortBase - halfAtr;
  const short100 = shortBase - atr;

  const commit = () => {
    const v = draft.trim().toUpperCase();
    if (/^[A-Z]{1,5}$/.test(v) && v !== ticker) onTickerChange(v);
    else setDraft(ticker);
    setIsEditing(false);
  };

  const cancel = () => {
    setDraft(ticker);
    setIsEditing(false);
  };

  // The single add-to-list implementation. The page does not duplicate this.
  const handleAddToList = (side: ListSide) => {
    const result = addToList(side, ticker);
    if (result === 'duplicate') {
      toast({
        title: 'כבר ברשימה',
        description: `${ticker} כבר נמצא ברשימת ${SIDE_LABEL[side]}`,
      });
      return;
    }
    if (result === 'full') {
      toast({
        title: 'הרשימה מלאה',
        description: `אין מקום פנוי ב${SIDE_LABEL[side]}`,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'נוסף', description: `${ticker} נוסף ל${SIDE_LABEL[side]}` });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: animationDelay / 1000, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="rounded-2xl p-5 h-full flex flex-col gap-4">
        {/* ── Header: editable ticker ─────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-2" dir="ltr">
          {isEditing ? (
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) =>
                setDraft(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5))
              }
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') cancel();
              }}
              dir="auto"
              maxLength={5}
              className="aurora-mono text-2xl font-bold uppercase h-10 w-32"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="group inline-flex items-center gap-2 aurora-mono text-2xl font-bold tracking-tight text-foreground hover:text-[#e2b54e] transition-colors"
            >
              {ticker}
              <EditIcon className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
            </button>
          )}
          <div className="flex items-center gap-2">
            {loading ? (
              <span className="aurora-chip aurora-chip-cyan inline-flex items-center gap-1 text-[10px] text-[#a5d8e6] rounded-full px-2 py-0.5">
                <LoaderIcon className="w-3 h-3 animate-spin" />
                טוען
              </span>
            ) : (
              empty && (
                <span className="aurora-chip aurora-chip-cyan text-[10px] text-[#a5d8e6] rounded-full px-2 py-0.5">
                  אין נתונים
                </span>
              )
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onRemove}
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              title="הסר סימול"
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* ── Price / ATR rows ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          <div className="aurora-alert aurora-alert-gold rounded-xl p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">מחיר סגירה</div>
            <div className="text-lg font-bold text-[#e2b54e] aurora-mono">
              {empty ? '—' : `$${fmt(closePrice)}`}
            </div>
          </div>
          <div className="aurora-alert aurora-alert-cyan rounded-xl p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">ATR (14)</div>
            <div className="text-lg font-bold text-[#a5d8e6] aurora-mono">
              {empty ? '—' : fmt(atr)}
            </div>
          </div>
        </div>

        {/* ── Optional base overrides (blank = close price) ────────────────── */}
        {/* Emerald / rose edges carry the long / short meaning, same as the
            entry / stop fields in the position calculator. */}
        {!empty && (
          <div className="space-y-1.5">
            {/* dir="ltr" pins the long column to the left and short to the right,
                overriding the page's RTL flow. */}
            <div className="grid grid-cols-2 gap-2" dir="ltr">
              <label className="block min-w-0">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  לונג
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={longBaseInput}
                  onChange={(e) => setLongBaseInput(e.target.value)}
                  className="mt-1 aurora-mono aurora-field-emerald h-9 rounded-xl px-3 text-sm text-center"
                  dir="ltr"
                  placeholder={fmt(closePrice)}
                />
              </label>
              <label className="block min-w-0">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  שורט
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={shortBaseInput}
                  onChange={(e) => setShortBaseInput(e.target.value)}
                  className="mt-1 aurora-mono aurora-field-rose h-9 rounded-xl px-3 text-sm text-center"
                  dir="ltr"
                  placeholder={fmt(closePrice)}
                />
              </label>
            </div>
          </div>
        )}

        {/* ── Derived helpers ─────────────────────────────────────────────── */}
        {/* dir="ltr" on the delta lines only — a leading +/- is bidi-neutral and
            would otherwise be reordered to the end in RTL. Scoped to the number
            so the grid keeps its RTL column order. */}
        {!empty && (
          <div className="space-y-2">
            {/* dir="ltr" keeps the long targets on the left, short on the right. */}
            <div className="grid grid-cols-2 gap-2 text-center" dir="ltr">
              <div className="aurora-alert aurora-alert-emerald rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground uppercase">50% ATR ללונג</div>
                <div className="text-sm font-semibold aurora-mono text-[#6ee7b7]">
                  ${fmt(long50)}
                </div>
                <div className="text-[10px] aurora-mono text-[#6ee7b7]/70" dir="ltr">+{fmt(halfAtr)}</div>
              </div>
              <div className="aurora-alert aurora-alert-rose rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground uppercase">50% ATR לשורט</div>
                <div className="text-sm font-semibold aurora-mono text-[#fda4af]">
                  ${fmt(short50)}
                </div>
                <div className="text-[10px] aurora-mono text-[#fda4af]/70" dir="ltr">-{fmt(halfAtr)}</div>
              </div>
              <div className="aurora-alert aurora-alert-emerald rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground uppercase">100% ATR ללונג</div>
                <div className="text-sm font-semibold aurora-mono text-[#6ee7b7]">
                  ${fmt(long100)}
                </div>
                <div className="text-[10px] aurora-mono text-[#6ee7b7]/70" dir="ltr">+{fmt(atr)}</div>
              </div>
              <div className="aurora-alert aurora-alert-rose rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground uppercase">100% ATR לשורט</div>
                <div className="text-sm font-semibold aurora-mono text-[#fda4af]">
                  ${fmt(short100)}
                </div>
                <div className="text-[10px] aurora-mono text-[#fda4af]/70" dir="ltr">-{fmt(atr)}</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2 mt-auto" dir="ltr">
          {/* Semantic long/short controls. Raw buttons on the Aurora chip surface
              (the same one the success/destructive badges use) — the <Button>
              variants all paint their own bg/border, which would cover the
              chip's gradient edge. */}
          {/* dir="ltr" on the grid so the long action sits left, short right,
              matching the calc columns above. */}
          <button
            type="button"
            onClick={() => handleAddToList('long')}
            disabled={empty}
            className="aurora-chip aurora-chip-emerald inline-flex h-10 items-center justify-center gap-1 rounded-xl px-2 min-w-0 text-[11px] sm:text-xs font-semibold whitespace-nowrap text-[#6ee7b7] transition-all hover:text-[#a7f3d0] hover:shadow-[0_0_20px_-6px_rgba(52,211,153,0.55)] disabled:pointer-events-none disabled:opacity-45"
          >
            <ArrowUpRightIcon solid className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">הוסף ללונג</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddToList('short')}
            disabled={empty}
            className="aurora-chip aurora-chip-rose inline-flex h-10 items-center justify-center gap-1 rounded-xl px-2 min-w-0 text-[11px] sm:text-xs font-semibold whitespace-nowrap text-[#fda4af] transition-all hover:text-[#fecdd3] hover:shadow-[0_0_20px_-6px_rgba(244,63,94,0.55)] disabled:pointer-events-none disabled:opacity-45"
          >
            <ArrowDownRightIcon solid className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">הוסף לשורט</span>
          </button>
        </div>
      </Card>
    </motion.div>
  );
}
