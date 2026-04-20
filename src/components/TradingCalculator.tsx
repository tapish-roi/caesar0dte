import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Calculator,
  CalendarRange,
  RefreshCw,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import PageToggle, { type CalcSection } from './trading-calculator/PageToggle';
import TickerCard from './trading-calculator/TickerCard';
import TickerInputTable from './trading-calculator/TickerInputTable';
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

const fmtMoney = (n: number) =>
  n.toLocaleString('he-IL', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const fmtNum = (n: number, d = 2) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

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

  const handleReset = useCallback(() => {
    setTickers([...DEFAULT_TICKERS]);
    toast({ title: 'אופס', description: 'רשימת הסימולים שוחזרה לברירת מחדל' });
  }, [toast]);

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

  // ── Position calculator state ──────────────────────────────────────────────
  // Account size & risk % are SHARED across all calculators and persisted in localStorage.
  const ACCOUNT_KEY = 'pos-account-size';
  const RISK_KEY = 'pos-risk-pct';
  const CALCS_KEY = 'pos-calcs';

  const [accountSize, setAccountSize] = useState<string>(() => {
    try {
      return localStorage.getItem(ACCOUNT_KEY) ?? '10000';
    } catch {
      return '10000';
    }
  });
  const [riskPct, setRiskPct] = useState<string>(() => {
    try {
      return localStorage.getItem(RISK_KEY) ?? '1';
    } catch {
      return '1';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(ACCOUNT_KEY, accountSize);
    } catch {/* noop */}
  }, [accountSize]);
  useEffect(() => {
    try {
      localStorage.setItem(RISK_KEY, riskPct);
    } catch {/* noop */}
  }, [riskPct]);

  // Per-trade calculators (each with its own entry / stop / R-target)
  type PosCalc = { id: string; entryPrice: string; stopDistance: string; rMultiple: string };
  const makeCalc = (): PosCalc => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    entryPrice: '',
    stopDistance: '',
    rMultiple: '2',
  });
  const [posCalcs, setPosCalcs] = useState<PosCalc[]>(() => {
    try {
      const raw = sessionStorage.getItem(CALCS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as PosCalc[];
      }
    } catch {/* noop */}
    return [makeCalc()];
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(CALCS_KEY, JSON.stringify(posCalcs));
    } catch {/* noop */}
  }, [posCalcs]);

  const updateCalc = (id: string, patch: Partial<PosCalc>) => {
    setPosCalcs((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const addCalc = () => setPosCalcs((prev) => [...prev, makeCalc()]);
  const removeCalc = (id: string) =>
    setPosCalcs((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.id !== id)));

  const computeCalc = (c: PosCalc) => {
    const acct = parseFloat(accountSize);
    const risk = parseFloat(riskPct);
    const entry = parseFloat(c.entryPrice);
    const stopD = parseFloat(c.stopDistance);
    const rMult = parseFloat(c.rMultiple);
    if (
      !Number.isFinite(acct) ||
      !Number.isFinite(risk) ||
      !Number.isFinite(stopD) ||
      stopD <= 0 ||
      acct <= 0
    ) {
      return null;
    }
    const riskDollars = acct * (risk / 100);
    const sharesRaw = riskDollars / stopD;
    const shares = Math.floor(sharesRaw);
    const positionValue = Number.isFinite(entry) && entry > 0 ? shares * entry : null;
    const targetMove = Number.isFinite(rMult) ? stopD * rMult : null;
    const targetPrice =
      Number.isFinite(entry) && entry > 0 && targetMove !== null ? entry + targetMove : null;
    const stopPrice = Number.isFinite(entry) && entry > 0 ? entry - stopD : null;
    const potentialProfit = targetMove !== null ? shares * targetMove : null;
    const leverage = positionValue !== null && acct > 0 ? positionValue / acct : null;
    return {
      riskDollars,
      shares,
      positionValue,
      targetMove,
      targetPrice,
      stopPrice,
      potentialProfit,
      leverage,
    };
  };

  const slideVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto" dir="rtl">
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
              <Button variant="outline" size="sm" onClick={handleReset} title="שחזר ברירת מחדל">
                <RotateCcw className="w-4 h-4" />
                איפוס
              </Button>
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
      <AnimatePresence mode="wait">
        {activeTab === 'atr' && (
          <motion.div
            key="atr"
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
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
          </motion.div>
        )}

        {activeTab === 'position' && (
          <motion.div
            key="position"
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Shared account-level inputs (persisted across sessions) */}
            <div className="bg-card rounded-2xl card-shadow border border-border p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FieldNum label="גודל חשבון ($)" value={accountSize} onChange={setAccountSize} />
                <FieldNum label="סיכון לעסקה (%)" value={riskPct} onChange={setRiskPct} step="0.1" />
              </div>
            </div>

            {/* One card per calculator instance */}
            {posCalcs.map((c, idx) => {
              const calc = computeCalc(c);
              return (
                <div
                  key={c.id}
                  className="bg-card rounded-2xl card-shadow border border-border p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      פוזיציה #{idx + 1}
                    </h3>
                    {posCalcs.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCalc(c.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="מחק מחשבון"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <FieldNum
                      label="מחיר כניסה ($)"
                      value={c.entryPrice}
                      onChange={(v) => updateCalc(c.id, { entryPrice: v })}
                      step="0.01"
                    />
                    <FieldNum
                      label="מרחק סטופ ($)"
                      value={c.stopDistance}
                      onChange={(v) => updateCalc(c.id, { stopDistance: v })}
                      step="0.01"
                    />
                    <FieldNum
                      label="יחס יעד (R)"
                      value={c.rMultiple}
                      onChange={(v) => updateCalc(c.id, { rMultiple: v })}
                      step="0.5"
                    />
                  </div>

                  {calc && (
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                      <ResultCard
                        label="סיכון בדולרים"
                        value={fmtMoney(calc.riskDollars)}
                        tone="warn"
                      />
                      <ResultCard
                        label="כמות מניות"
                        value={calc.shares.toLocaleString('he-IL')}
                        tone="primary"
                        big
                      />
                      {calc.positionValue !== null && (
                        <ResultCard
                          label="שווי פוזיציה"
                          value={fmtMoney(calc.positionValue)}
                        />
                      )}
                      {calc.leverage !== null && (
                        <ResultCard label="מינוף" value={`${calc.leverage.toFixed(2)}x`} />
                      )}
                      {calc.stopPrice !== null && (
                        <ResultCard
                          label="מחיר סטופ"
                          value={`$${fmtNum(calc.stopPrice)}`}
                          tone="danger"
                        />
                      )}
                      {calc.targetPrice !== null && (
                        <ResultCard
                          label={`מחיר יעד (${c.rMultiple}R)`}
                          value={`$${fmtNum(calc.targetPrice)}`}
                          tone="success"
                        />
                      )}
                      {calc.potentialProfit !== null && (
                        <ResultCard
                          label="רווח פוטנציאלי"
                          value={fmtMoney(calc.potentialProfit)}
                          tone="success"
                          className="col-span-2"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <Button
              onClick={addCalc}
              variant="outline"
              className="w-full border-dashed"
            >
              <Plus className="w-4 h-4" />
              הוסף מחשבון פוזיציה
            </Button>
          </motion.div>
        )}

        {activeTab === 'calendar' && (
          <motion.div
            key="calendar"
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2 }}
            className="bg-card rounded-2xl card-shadow border border-border overflow-hidden"
          >
            <div className="bg-white" dir="ltr">
              <iframe
                src="https://sslecal2.investing.com?columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&category=_employment,_economicActivity,_inflation,_credit,_centralBanks,_confidenceIndex,_balance,_Bonds&importance=2,3&features=datepicker,timezone&countries=5,72,4,17,37,32,12&calType=week&timeZone=15&lang=1"
                title="Economic Calendar"
                width="100%"
                height="600"
                frameBorder="0"
                style={{ border: 0 }}
                loading="lazy"
              />
            </div>
            <div
              className="px-4 py-2 text-[10px] text-muted-foreground text-center border-t border-border"
              dir="ltr"
            >
              Real Time Economic Calendar provided by{' '}
              <a
                href="https://www.investing.com/"
                rel="nofollow noopener"
                target="_blank"
                className="underline hover:text-primary"
              >
                Investing.com
              </a>
              .
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Local helpers
// ──────────────────────────────────────────────────────────────────────────────

function FieldNum({
  label,
  value,
  onChange,
  step = '1',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 tabular-nums"
        dir="ltr"
      />
    </label>
  );
}

function ResultCard({
  label,
  value,
  tone = 'default',
  big = false,
  className = '',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'primary' | 'success' | 'danger' | 'warn';
  big?: boolean;
  className?: string;
}) {
  const toneClass =
    tone === 'primary'
      ? 'bg-primary/5 border-primary/20 text-primary'
      : tone === 'success'
        ? 'bg-accent/5 border-accent/20 text-accent'
        : tone === 'danger'
          ? 'bg-destructive/5 border-destructive/20 text-destructive'
          : tone === 'warn'
            ? 'bg-yellow-500/5 border-yellow-500/20 text-yellow-600 dark:text-yellow-400'
            : 'bg-muted/30 border-border text-foreground';

  return (
    <div className={`rounded-xl p-3 border ${toneClass} ${className}`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`${big ? 'text-2xl' : 'text-base'} font-bold tabular-nums mt-0.5`}>{value}</div>
    </div>
  );
}
