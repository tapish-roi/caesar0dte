import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  Activity,
  Calculator,
  CalendarRange,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import PageToggle, { type CalcSection } from './trading-calculator/PageToggle';
import TickerCard from './trading-calculator/TickerCard';
import TickerInputTable from './trading-calculator/TickerInputTable';
import EconomicCalendar from './trading-calculator/EconomicCalendar';
import PositionCalculatorSection from './position-calculator/PositionCalculatorSection';

// ──────────────────────────────────────────────────────────────────────────────
// Trading Calculator (מחשבון מסחר) — 3 sections via PageToggle:
//   • atr       — 6 editable ticker cards from Finviz (cached)
//   • position  — Position-size calculator
//   • calendar  — Investing.com economic calendar
// ──────────────────────────────────────────────────────────────────────────────

const DEFAULT_TICKERS = ['NFLX', 'ORCL', 'GOOG', 'PLTR', 'PANW', 'OKLO'];
const TICKERS_KEY = 'atr-tickers';
const LONGS_KEY = 'atr-longs';
const SHORTS_KEY = 'atr-shorts';
const SLOTS = 6;

interface AtrRow {
  ticker: string;
  close_price: number;
  atr: number;
  data_date: string;
}



function readTickers(): string[] {
  try {
    const raw = localStorage.getItem(TICKERS_KEY);
    if (!raw) return [...DEFAULT_TICKERS];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const cleaned = parsed
        .map((t) => String(t ?? '').trim().toUpperCase())
        .filter((t) => /^[A-Z]{1,5}$/.test(t))
        .slice(0, 6);
      if (cleaned.length > 0) {
        // Pad to 6
        while (cleaned.length < 6) cleaned.push(DEFAULT_TICKERS[cleaned.length]);
        return cleaned;
      }
    }
  } catch {
    /* noop */
  }
  return [...DEFAULT_TICKERS];
}

export default function TradingCalculator() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<CalcSection>('atr');

  // ── ATR section state ──────────────────────────────────────────────────────
  const [tickers, setTickers] = useState<string[]>(() => readTickers());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const initialFetchRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(TICKERS_KEY, JSON.stringify(tickers));
  }, [tickers]);

  const { data: atrRows = [], isLoading, refetch } = useQuery({
    queryKey: ['stock-atr-data', tickers],
    queryFn: async () => {
      if (tickers.length === 0) return [] as AtrRow[];
      const { data, error } = await supabase
        .from('stock_atr_data')
        .select('ticker, close_price, atr, data_date')
        .in('ticker', tickers)
        .order('data_date', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ticker: r.ticker,
        close_price: Number(r.close_price),
        atr: Number(r.atr),
        data_date: r.data_date,
      })) as AtrRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Reduce to latest row per ticker
  const latestByTicker = useMemo(() => {
    const map: Record<string, AtrRow> = {};
    for (const row of atrRows) {
      if (!map[row.ticker]) map[row.ticker] = row;
    }
    return map;
  }, [atrRows]);

  const latestDate = useMemo(() => {
    let max = '';
    for (const r of atrRows) if (r.data_date > max) max = r.data_date;
    return max;
  }, [atrRows]);

  const invokeFinviz = useCallback(
    async (forTickers: string[]) => {
      const { error } = await supabase.functions.invoke('fetch-finviz-data', {
        body: { tickers: forTickers },
      });
      if (error) throw new Error(error.message);
    },
    [],
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await invokeFinviz(tickers);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['stock-atr-data'] });
      toast({ title: 'נתונים עודכנו', description: 'נמשכו מ-Finviz בהצלחה' });
    } catch (err) {
      toast({
        title: 'שגיאה',
        description: err instanceof Error ? err.message : 'נכשל לעדכן נתונים',
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [tickers, invokeFinviz, refetch, queryClient, toast]);

  // First-load auto-populate when cache empty
  useEffect(() => {
    if (initialFetchRef.current) return;
    if (isLoading) return;
    if (atrRows.length === 0 && tickers.length > 0) {
      initialFetchRef.current = true;
      handleRefresh();
    } else if (atrRows.length > 0) {
      initialFetchRef.current = true;
    }
  }, [isLoading, atrRows.length, tickers.length, handleRefresh]);

  const handleTickerChange = useCallback(
    async (index: number, newTicker: string) => {
      const v = newTicker.trim().toUpperCase();
      if (!/^[A-Z]{1,5}$/.test(v)) return;
      setTickers((prev) => {
        const next = [...prev];
        next[index] = v;
        return next;
      });
      try {
        await invokeFinviz([v]);
        queryClient.invalidateQueries({ queryKey: ['stock-atr-data'] });
      } catch (err) {
        toast({
          title: 'שגיאה',
          description: err instanceof Error ? err.message : 'נכשל לטעון סימול',
          variant: 'destructive',
        });
      }
    },
    [invokeFinviz, queryClient, toast],
  );


  const handleAddToList = useCallback(
    (ticker: string, side: 'long' | 'short') => {
      const key = side === 'long' ? LONGS_KEY : SHORTS_KEY;
      const empty = Array.from({ length: SLOTS }, () => '');
      let arr = empty;
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length === SLOTS) {
            arr = parsed.map((s) => String(s ?? ''));
          }
        }
      } catch {
        /* noop */
      }
      if (arr.includes(ticker)) {
        toast({ title: 'כבר ברשימה', description: `${ticker} כבר נמצא ברשימת ${side === 'long' ? 'הלונגים' : 'השורטים'}` });
        return;
      }
      const slot = arr.findIndex((s) => !s);
      if (slot === -1) {
        toast({
          title: 'הרשימה מלאה',
          description: `אין מקום פנוי ב${side === 'long' ? 'לונגים' : 'שורטים'}`,
          variant: 'destructive',
        });
        return;
      }
      arr[slot] = ticker;
      sessionStorage.setItem(key, JSON.stringify(arr));
      window.dispatchEvent(new Event('storage'));
      toast({
        title: 'נוסף',
        description: `${ticker} נוסף ל${side === 'long' ? 'לונגים' : 'שורטים'}`,
      });
    },
    [toast],
  );

  // ── Position calculator state lives in PositionCalculatorSection ─────────


  return (
    <div className={`p-4 md:p-8 mx-auto ${activeTab === 'position' ? 'max-w-7xl' : 'max-w-6xl'}`} dir="rtl">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            {activeTab === 'atr' ? (
              <Activity className="w-5 h-5 text-primary" />
            ) : activeTab === 'position' ? (
              <Calculator className="w-5 h-5 text-primary" />
            ) : (
              <CalendarRange className="w-5 h-5 text-primary" />
            )}
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              {activeTab === 'atr'
                ? 'מחשבון ATR'
                : activeTab === 'position'
                  ? 'מחשבון גודל פוזיציה'
                  : 'לוח אירועים כלכליים'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {activeTab === 'atr'
                ? 'מחיר סגירה ו-ATR(14) לסימולים נבחרים, נתונים מ-Finviz'
                : activeTab === 'position'
                  ? 'חשב כמות מניות לפי גודל חשבון, סיכון ומרחק סטופ'
                  : 'אירועים מאקרו-כלכליים מ-Investing.com'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <PageToggle active={activeTab} onChange={setActiveTab} />
          {activeTab === 'atr' && (
            <>
              {latestDate && (
                <span className="text-xs text-muted-foreground hidden md:inline">
                  נתונים מ-Finviz · {latestDate}
                </span>
              )}
              <Button onClick={handleRefresh} disabled={isRefreshing} size="sm">
                {isRefreshing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                רענון
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Slides ───────────────────────────────────────────────────────── */}
      {/* Keep all sections mounted so per-section state (inputs, scroll, fetched data) survives tab switching. Only the active one is visible. */}
      <div className="relative">
        <div className={activeTab === 'atr' ? 'block' : 'hidden'}>
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-64 rounded-2xl" />
                  ))
                : tickers.map((t, i) => {
                    const row = latestByTicker[t];
                    return (
                      <TickerCard
                        key={`${t}-${i}`}
                        ticker={t}
                        closePrice={row ? row.close_price : 0}
                        atr={row ? row.atr : 0}
                        onTickerChange={(newT) => handleTickerChange(i, newT)}
                        onAddToList={handleAddToList}
                        animationDelay={i * 100}
                      />
                    );
                  })}
            </div>

            <TickerInputTable />
          </div>
        </div>

        <div className={activeTab === 'position' ? 'block' : 'hidden'}>
          <PositionCalculatorSection />
        </div>

        <div className={activeTab === 'calendar' ? 'block' : 'hidden'}>
          <EconomicCalendar />
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────
// (Position-calculator UI moved to PositionCalculatorSection)
// ──────────────────────────────────────────────────────────────────────────────

