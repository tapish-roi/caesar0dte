import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { CalculatorIcon, CalendarIcon, LoaderIcon, PlusIcon, PulseIcon, RefreshIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

interface AtrRow {
  ticker: string;
  close_price: number;
  atr: number;
  data_date: string;
}

const normalizeTicker = (v: string) =>
  v.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);

function readTickers(): string[] {
  try {
    const raw = localStorage.getItem(TICKERS_KEY);
    if (!raw) return [...DEFAULT_TICKERS];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const cleaned = parsed
        .map((t) => normalizeTicker(String(t ?? '')))
        .filter(Boolean);
      if (cleaned.length > 0) return cleaned;
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
  const [newTicker, setNewTicker] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Tickers whose Finviz data is currently being fetched — drives the per-card
  // loading state so a just-changed ticker reads as "loading", not "no data".
  const [pendingTickers, setPendingTickers] = useState<Set<string>>(() => new Set());
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
    if (tickers.length === 0) return;
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

  // Fetch a single ticker immediately, then let the query pick the row up.
  const fetchOne = useCallback(
    async (v: string) => {
      setPendingTickers((prev) => {
        const next = new Set(prev);
        next.add(v);
        return next;
      });
      try {
        await invokeFinviz([v]);
        await queryClient.invalidateQueries({ queryKey: ['stock-atr-data'] });
        await refetch();
      } catch (err) {
        toast({
          title: 'שגיאה',
          description: err instanceof Error ? err.message : 'נכשל לטעון סימול',
          variant: 'destructive',
        });
      } finally {
        setPendingTickers((prev) => {
          const next = new Set(prev);
          next.delete(v);
          return next;
        });
      }
    },
    [invokeFinviz, queryClient, refetch, toast],
  );

  const handleTickerChange = useCallback(
    async (index: number, newTicker: string) => {
      const v = normalizeTicker(newTicker);
      if (!v) return;
      setTickers((prev) => {
        if (prev[index] === v) return prev;
        const next = [...prev];
        next[index] = v;
        return next;
      });
      await fetchOne(v);
    },
    [fetchOne],
  );

  const handleAddTicker = useCallback(
    async (raw: string) => {
      const v = normalizeTicker(raw);
      if (!v) return;
      if (tickers.includes(v)) {
        toast({ title: 'כבר ברשימה', description: `${v} כבר נמצא ברשימת הסימולים` });
        return;
      }
      setTickers((prev) => (prev.includes(v) ? prev : [...prev, v]));
      await fetchOne(v);
    },
    [tickers, fetchOne, toast],
  );

  const handleRemoveTicker = useCallback((index: number) => {
    setTickers((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  }, []);


  // ── Position calculator state lives in PositionCalculatorSection ─────────


  return (
    <div className={`calc-typeface p-4 md:p-8 mx-auto ${activeTab === 'position' ? 'max-w-7xl' : 'max-w-6xl'}`} dir="rtl">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="aurora-chip aurora-chip-cyan w-10 h-10 rounded-xl flex items-center justify-center">
            {activeTab === 'atr' ? (
              <PulseIcon className="w-5 h-5 text-[#e2b54e]" />
            ) : activeTab === 'position' ? (
              <CalculatorIcon solid className="w-5 h-5 text-[#e2b54e]" />
            ) : (
              <CalendarIcon solid className="w-5 h-5 text-[#e2b54e]" />
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
            {activeTab === 'calendar' && (
              <p className="text-sm text-muted-foreground mt-0.5">
                אירועים מאקרו-כלכליים מ-Investing.com
              </p>
            )}
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
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddTicker(newTicker);
                  setNewTicker('');
                }}
                className="flex items-center gap-2"
              >
                <Input
                  value={newTicker}
                  onChange={(e) =>
                    setNewTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5))
                  }
                  maxLength={5}
                  dir="ltr"
                  placeholder="AAPL"
                  className="aurora-mono uppercase tracking-wider w-28 h-9 rounded-xl text-center text-sm"
                />
                <Button type="submit" size="sm" variant="secondary" disabled={!newTicker}>
                  <PlusIcon className="w-4 h-4" />
                  הוסף
                </Button>
              </form>
              <Button onClick={handleRefresh} disabled={isRefreshing} size="sm">
                {isRefreshing ? (
                  <LoaderIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshIcon className="w-4 h-4" />
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
                ? Array.from({ length: Math.max(tickers.length, 1) }).map((_, i) => (
                    <Skeleton key={i} className="h-64 rounded-3xl" />
                  ))
                : tickers.map((t, i) => {
                    const row = latestByTicker[t];
                    return (
                      <TickerCard
                        key={`${t}-${i}`}
                        ticker={t}
                        closePrice={row ? row.close_price : 0}
                        atr={row ? row.atr : 0}
                        loading={pendingTickers.has(t) && !row}
                        onTickerChange={(newT) => handleTickerChange(i, newT)}
                        onRemove={() => handleRemoveTicker(i)}
                        animationDelay={i * 100}
                      />
                    );
                  })}
            </div>

            <TickerInputTable />
          </div>
        </div>

        <div className={activeTab === 'position' ? 'block' : 'hidden'}>
          <PositionCalculatorSection atrTickers={tickers} />
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

