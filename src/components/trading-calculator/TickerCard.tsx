import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Pencil, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface TickerCardProps {
  ticker: string;
  closePrice: number;
  atr: number;
  onTickerChange: (newTicker: string) => void;
  onAddToList: (ticker: string, side: 'long' | 'short') => void;
  animationDelay?: number;
}

const fmt = (n: number, d = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export default function TickerCard({
  ticker,
  closePrice,
  atr,
  onTickerChange,
  onAddToList,
  animationDelay = 0,
}: TickerCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(ticker);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(ticker), [ticker]);
  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  const empty = closePrice === 0 && atr === 0;
  const pctAtr = closePrice > 0 ? (atr / closePrice) * 100 : 0;
  const atrLong = closePrice + atr;
  const atrShort = closePrice - atr;
  const halfAtrLong = closePrice + atr / 2;
  const halfAtrShort = closePrice - atr / 2;

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: animationDelay / 1000, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="p-5 h-full flex flex-col gap-4">
        {/* ── Header: editable ticker ─────────────────────────────────────── */}
        <div className="flex items-center justify-between" dir="ltr">
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
              className="font-mono text-2xl font-bold uppercase h-10 w-32"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="group inline-flex items-center gap-2 font-mono text-2xl font-bold tracking-tight text-foreground hover:text-primary transition-colors"
            >
              {ticker}
              <Pencil className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
            </button>
          )}
          {empty && (
            <span className="text-[10px] text-muted-foreground bg-muted/40 rounded-full px-2 py-0.5">
              אין נתונים
            </span>
          )}
        </div>

        {/* ── Price / ATR rows ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">סגירה</div>
            <div className="text-lg font-bold text-primary tabular-nums">
              {empty ? '—' : `$${fmt(closePrice)}`}
            </div>
          </div>
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">ATR (14)</div>
            <div className="text-lg font-bold text-accent tabular-nums">
              {empty ? '—' : fmt(atr)}
            </div>
          </div>
        </div>

        {/* ── Derived helpers ─────────────────────────────────────────────── */}
        {!empty && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground uppercase">ATR ללונג</div>
                <div className="text-sm font-semibold tabular-nums text-emerald-400">
                  ${fmt(atrLong)}
                </div>
              </div>
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground uppercase">ATR לשורט</div>
                <div className="text-sm font-semibold tabular-nums text-rose-400">
                  ${fmt(atrShort)}
                </div>
              </div>
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground uppercase">50% ATR ללונג</div>
                <div className="text-sm font-semibold tabular-nums text-emerald-400">
                  ${fmt(halfAtrLong)}
                </div>
              </div>
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground uppercase">50% ATR לשורט</div>
                <div className="text-sm font-semibold tabular-nums text-rose-400">
                  ${fmt(halfAtrShort)}
                </div>
              </div>
            </div>
            <div className="bg-muted/30 border border-border rounded-lg p-2 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">% ATR</div>
              <div className="text-sm font-semibold tabular-nums">{fmt(pctAtr, 1)}%</div>
            </div>
          </div>
        )}

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2 mt-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onAddToList(ticker, 'long')}
            disabled={empty}
            className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
          >
            <ArrowUpRight className="w-4 h-4" />
            הוסף ללונג
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onAddToList(ticker, 'short')}
            disabled={empty}
            className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
          >
            <ArrowDownRight className="w-4 h-4" />
            הוסף לשורט
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
