import { useState, useEffect } from 'react';
import { TrashIcon, ArrowUpRightIcon, ArrowDownRightIcon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  LONGS_KEY,
  SHORTS_KEY,
  emptySlots,
  keyForSide,
  readList,
  writeList,
  type ListSide,
} from '@/lib/atrLists';

interface TickerInputTableProps {
  onTickersChange?: (longs: string[], shorts: string[]) => void;
}

export default function TickerInputTable({ onTickersChange }: TickerInputTableProps) {
  const [longs, setLongs] = useState<string[]>(() => readList(LONGS_KEY));
  const [shorts, setShorts] = useState<string[]>(() => readList(SHORTS_KEY));

  // Re-read whenever a ticker card writes. That write dispatches a manual
  // `storage` event, because the native one never fires in the same tab.
  useEffect(() => {
    const onStorage = () => {
      setLongs(readList(LONGS_KEY));
      setShorts(readList(SHORTS_KEY));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    onTickersChange?.(longs, shorts);
  }, [longs, shorts, onTickersChange]);

  const setSlot = (side: ListSide, index: number, value: string) => {
    const setter = side === 'long' ? setLongs : setShorts;
    setter((prev) => {
      const next = [...prev];
      next[index] = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
      writeList(keyForSide(side), next);
      return next;
    });
  };

  const clearSlot = (side: ListSide, index: number) => setSlot(side, index, '');

  const clearAll = (side: ListSide) => {
    writeList(keyForSide(side), emptySlots());
    if (side === 'long') setLongs(emptySlots());
    else setShorts(emptySlots());
  };

  const renderColumn = (
    side: ListSide,
    title: string,
    Icon: React.ComponentType<{ className?: string; solid?: boolean }>,
    arr: string[],
    accent: string,
  ) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* solid so the long/short accent color survives instead of the gradient */}
          <Icon solid className={`w-4 h-4 ${accent}`} />
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => clearAll(side)}
          className="text-xs text-muted-foreground hover:text-destructive h-7 px-2"
        >
          <TrashIcon className="w-3.5 h-3.5" />
          נקה הכל
        </Button>
      </div>
      <div className="space-y-1.5">
        {arr.map((value, i) => {
          const isLong = side === 'long';
          const wrapperClass = isLong
            ? 'aurora-chip aurora-chip-emerald hover:shadow-[0_0_18px_-6px_rgba(52,211,153,0.5)]'
            : 'aurora-chip aurora-chip-rose hover:shadow-[0_0_18px_-6px_rgba(244,63,94,0.5)]';
          const tickerColor = isLong ? 'text-[#6ee7b7]' : 'text-[#fda4af]';
          return (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-lg p-1.5 transition-all ${wrapperClass}`}
            >
              <span className="text-[10px] text-muted-foreground aurora-mono w-4 ps-1">{i + 1}.</span>
              {/* Deliberately a bare input, not <Input>: the chip is already the
                  surface, and .aurora-field paints its edge with background-image,
                  so a nested field would draw a second ring inside the chip. */}
              <input
                value={value}
                onChange={(e) => setSlot(side, i, e.target.value)}
                maxLength={5}
                dir="ltr"
                placeholder="—"
                className={`min-w-0 flex-1 h-9 bg-transparent border-0 outline-none focus:outline-none placeholder:text-muted-foreground/40 aurora-mono uppercase tracking-wider text-sm font-semibold ${
                  value ? tickerColor : 'text-muted-foreground/50'
                }`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => clearSlot(side, i)}
                disabled={!value}
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Card className="rounded-2xl p-5">
      <div className="grid md:grid-cols-2 gap-6">
        {renderColumn('long', 'לונגים', ArrowUpRightIcon, longs, 'text-emerald-400')}
        {renderColumn('short', 'שורטים', ArrowDownRightIcon, shorts, 'text-rose-400')}
      </div>
    </Card>
  );
}
