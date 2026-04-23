import { useState, useEffect } from 'react';
import { Trash2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const SLOTS = 6;
const EMPTY: string[] = Array.from({ length: SLOTS }, () => '');
const LONGS_KEY = 'atr-longs';
const SHORTS_KEY = 'atr-shorts';

interface TickerInputTableProps {
  onTickersChange?: (longs: string[], shorts: string[]) => void;
}

function readSession(key: string): string[] {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return [...EMPTY];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === SLOTS) return parsed.map((s) => String(s ?? ''));
  } catch {
    /* noop */
  }
  return [...EMPTY];
}

function writeSession(key: string, arr: string[]) {
  sessionStorage.setItem(key, JSON.stringify(arr));
}

export default function TickerInputTable({ onTickersChange }: TickerInputTableProps) {
  const [longs, setLongs] = useState<string[]>(() => readSession(LONGS_KEY));
  const [shorts, setShorts] = useState<string[]>(() => readSession(SHORTS_KEY));

  // Re-hydrate on storage events (TradingCalculator dispatches one after add-to-list)
  useEffect(() => {
    const onStorage = () => {
      setLongs(readSession(LONGS_KEY));
      setShorts(readSession(SHORTS_KEY));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    onTickersChange?.(longs, shorts);
  }, [longs, shorts, onTickersChange]);

  const clearSlot = (side: 'long' | 'short', index: number) => {
    const setter = side === 'long' ? setLongs : setShorts;
    const key = side === 'long' ? LONGS_KEY : SHORTS_KEY;
    setter((prev) => {
      const next = [...prev];
      next[index] = '';
      writeSession(key, next);
      return next;
    });
  };

  const clearAll = (side: 'long' | 'short') => {
    const key = side === 'long' ? LONGS_KEY : SHORTS_KEY;
    writeSession(key, [...EMPTY]);
    if (side === 'long') setLongs([...EMPTY]);
    else setShorts([...EMPTY]);
  };

  const renderColumn = (
    side: 'long' | 'short',
    title: string,
    Icon: React.ComponentType<{ className?: string }>,
    arr: string[],
    accent: string,
  ) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${accent}`} />
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => clearAll(side)}
          className="text-xs text-muted-foreground hover:text-destructive h-7 px-2"
        >
          <Trash2 className="w-3.5 h-3.5" />
          נקה הכל
        </Button>
      </div>
      <div className="space-y-1.5">
        {arr.map((value, i) => {
          const isLong = side === 'long';
          const wrapperClass = isLong
            ? 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50 hover:shadow-[0_0_18px_-6px_rgb(16,185,129,0.45)]'
            : 'border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50 hover:shadow-[0_0_18px_-6px_rgb(244,63,94,0.45)]';
          const tickerColor = isLong ? 'text-emerald-300' : 'text-rose-300';
          return (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-lg border p-1.5 transition-all ${wrapperClass}`}
            >
              <span className="text-[10px] text-muted-foreground tabular-nums w-4 ps-1">{i + 1}.</span>
              <div
                className={`flex-1 h-9 flex items-center font-mono uppercase tracking-wider text-sm font-semibold ${
                  value ? tickerColor : 'text-muted-foreground/50'
                }`}
                dir="ltr"
              >
                {value || '—'}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => clearSlot(side, i)}
                disabled={!value}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Card className="p-5">
      <div className="grid md:grid-cols-2 gap-6">
        {renderColumn('long', 'לונגים', ArrowUpRight, longs, 'text-emerald-400')}
        {renderColumn('short', 'שורטים', ArrowDownRight, shorts, 'text-rose-400')}
      </div>
    </Card>
  );
}
