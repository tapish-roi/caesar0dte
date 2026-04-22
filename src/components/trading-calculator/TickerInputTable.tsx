import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trash2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

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

const fmt = (n: number, d = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

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

  const allTickers = Array.from(
    new Set([...longs, ...shorts].map((t) => t.trim().toUpperCase()).filter(Boolean)),
  );

  const { data: cached = {} } = useQuery({
    queryKey: ['atr-cache-side-table', allTickers],
    queryFn: async () => {
      if (allTickers.length === 0) return {} as Record<string, { close_price: number; atr: number }>;
      const { data, error } = await supabase
        .from('stock_atr_data')
        .select('ticker, close_price, atr, data_date')
        .in('ticker', allTickers)
        .order('data_date', { ascending: false });
      if (error) throw error;
      const map: Record<string, { close_price: number; atr: number }> = {};
      for (const row of data ?? []) {
        if (!map[row.ticker]) map[row.ticker] = { close_price: Number(row.close_price), atr: Number(row.atr) };
      }
      return map;
    },
    enabled: allTickers.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const updateSlot = useCallback(
    (side: 'long' | 'short', index: number, value: string) => {
      const cleaned = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
      const setter = side === 'long' ? setLongs : setShorts;
      const key = side === 'long' ? LONGS_KEY : SHORTS_KEY;
      setter((prev) => {
        const next = [...prev];
        next[index] = cleaned;
        writeSession(key, next);
        return next;
      });
    },
    [],
  );

  const clearSlot = (side: 'long' | 'short', index: number) => updateSlot(side, index, '');

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
          const inputClass = isLong
            ? 'font-mono uppercase h-9 flex-1 border-emerald-500/30 bg-transparent focus-visible:border-emerald-500 focus-visible:ring-emerald-500/30'
            : 'font-mono uppercase h-9 flex-1 border-rose-500/30 bg-transparent focus-visible:border-rose-500 focus-visible:ring-rose-500/30';
          return (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-lg border p-1.5 transition-all ${wrapperClass}`}
            >
              <span className="text-[10px] text-muted-foreground tabular-nums w-4 ps-1">{i + 1}.</span>
              <Input
                value={value}
                onChange={(e) => updateSlot(side, i, e.target.value)}
                placeholder="—"
                maxLength={5}
                dir="ltr"
                className={inputClass}
              />
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
