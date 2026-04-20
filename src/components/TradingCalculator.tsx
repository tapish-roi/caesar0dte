import React, { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Calculator, Search, TrendingUp, AlertCircle, Loader2, CalendarRange, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type CalcTab = 'atr' | 'position' | 'calendar';

const TABS: { id: CalcTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'atr', label: 'ATR ומחיר', icon: TrendingUp },
  { id: 'position', label: 'גודל פוזיציה', icon: Calculator },
  { id: 'calendar', label: 'לוח אירועים', icon: CalendarRange },
];

// ──────────────────────────────────────────────────────────────────────────────
// Trading Calculator (מחשבון מסחר)
//   • ATR & price lookup (Finviz via edge function, cached daily)
//   • Position size calculator (account size, risk %, stop distance, R)
//   • Investing.com economic calendar (embedded)
// ──────────────────────────────────────────────────────────────────────────────

interface AtrResult {
  ticker: string;
  price: number | null;
  atr: number | null;
  date: string;
  source: 'cache' | 'finviz';
}

const fmtMoney = (n: number) =>
  n.toLocaleString('he-IL', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const fmtNum = (n: number, d = 2) =>
  n.toLocaleString('he-IL', { maximumFractionDigits: d, minimumFractionDigits: d });

export default function TradingCalculator() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<CalcTab>('atr');

  // ── ATR lookup ─────────────────────────────────────────────────────────────
  const [ticker, setTicker] = useState('');
  const [atrLoading, setAtrLoading] = useState(false);
  const [atrResult, setAtrResult] = useState<AtrResult | null>(null);
  const [atrError, setAtrError] = useState<string | null>(null);

  const fetchAtr = async () => {
    const t = ticker.trim().toUpperCase();
    if (!t) {
      setAtrError('הזן סימול מניה');
      return;
    }
    setAtrLoading(true);
    setAtrError(null);
    setAtrResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-atr', {
        body: { ticker: t },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setAtrResult(data as AtrResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה בטעינת נתונים';
      setAtrError(msg);
      toast({ title: 'שגיאה', description: msg, variant: 'destructive' });
    } finally {
      setAtrLoading(false);
    }
  };

  // Push ATR result into the position-size calculator.
  const useAtrAsStop = () => {
    if (!atrResult?.atr) return;
    setStopDistance(String(atrResult.atr.toFixed(2)));
    if (atrResult.price) setEntryPrice(String(atrResult.price.toFixed(2)));
    setActiveTab('position');
    toast({ title: 'הוזן למחשבון', description: `ATR ${atrResult.atr.toFixed(2)} הועבר כמרחק סטופ` });
  };

  // ── Position-size calculator ───────────────────────────────────────────────
  const [accountSize, setAccountSize] = useState('10000');
  const [riskPct, setRiskPct] = useState('1');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopDistance, setStopDistance] = useState('');
  const [rMultiple, setRMultiple] = useState('2');

  const calc = useMemo(() => {
    const acct = parseFloat(accountSize);
    const risk = parseFloat(riskPct);
    const entry = parseFloat(entryPrice);
    const stopD = parseFloat(stopDistance);
    const rMult = parseFloat(rMultiple);

    if (!Number.isFinite(acct) || !Number.isFinite(risk) || !Number.isFinite(stopD) || stopD <= 0 || acct <= 0) {
      return null;
    }
    const riskDollars = acct * (risk / 100);
    const sharesRaw = riskDollars / stopD;
    const shares = Math.floor(sharesRaw);
    const positionValue = Number.isFinite(entry) && entry > 0 ? shares * entry : null;
    const targetMove = Number.isFinite(rMult) ? stopD * rMult : null;
    const targetPrice =
      Number.isFinite(entry) && entry > 0 && targetMove !== null ? entry + targetMove : null;
    const stopPrice =
      Number.isFinite(entry) && entry > 0 ? entry - stopD : null;
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
  }, [accountSize, riskPct, entryPrice, stopDistance, rMultiple]);

  const slideVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto" dir="rtl">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Calculator className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">מחשבון מסחר</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              ATR ומחיר עדכני, מחשבון גודל פוזיציה, ולוח אירועים כלכליים
            </p>
          </div>
        </div>
      </div>

      {/* ──────── Sub-tabs ──────── */}
      <div className="mb-4 flex gap-1 p-1 bg-muted/40 rounded-xl border border-border w-full md:w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {active && (
                <motion.div
                  layoutId="calc-tab-pill"
                  className="absolute inset-0 bg-primary rounded-lg"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <Icon className="w-4 h-4" />
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ──────── Slides ──────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'atr' && (
          <motion.div
            key="atr"
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2 }}
            className="bg-card rounded-2xl card-shadow border border-border p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">חיפוש ATR ומחיר</h2>
              <span className="ms-auto text-[10px] text-muted-foreground bg-muted/40 rounded-full px-2 py-0.5">
                נתונים מ-Finviz
              </span>
            </div>

            <div className="flex gap-2">
              <Input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') fetchAtr();
                }}
                placeholder="לדוגמה: AAPL, SPY, QQQ"
                maxLength={10}
                className="font-mono uppercase"
              />
              <Button onClick={fetchAtr} disabled={atrLoading} className="shrink-0">
                {atrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                חפש
              </Button>
            </div>

            {atrError && (
              <div className="mt-3 flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {atrError}
              </div>
            )}

            {atrResult && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 space-y-3"
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-muted/30 rounded-xl p-3 border border-border">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">סימול</div>
                    <div className="text-lg font-bold text-foreground font-mono">{atrResult.ticker}</div>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-3 border border-border">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">תאריך</div>
                    <div className="text-sm font-medium text-foreground">{atrResult.date}</div>
                  </div>
                  <div className="bg-primary/5 rounded-xl p-3 border border-primary/20">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">מחיר נוכחי</div>
                    <div className="text-lg font-bold text-primary tabular-nums">
                      {atrResult.price !== null ? `$${fmtNum(atrResult.price)}` : '—'}
                    </div>
                  </div>
                  <div className="bg-accent/5 rounded-xl p-3 border border-accent/20">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">ATR (14)</div>
                    <div className="text-lg font-bold text-accent tabular-nums">
                      {atrResult.atr !== null ? fmtNum(atrResult.atr) : '—'}
                    </div>
                  </div>
                </div>
                {atrResult.atr !== null && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={useAtrAsStop}
                    className="w-full"
                  >
                    השתמש כמרחק סטופ במחשבון ←
                  </Button>
                )}
                <div className="text-[10px] text-muted-foreground text-center">
                  {atrResult.source === 'cache' ? 'נתונים מהמטמון של היום' : 'נתונים טריים'}
                </div>
              </motion.div>
            )}
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
            className="bg-card rounded-2xl card-shadow border border-border p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <Calculator className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">מחשבון גודל פוזיציה</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <FieldNum label="גודל חשבון ($)" value={accountSize} onChange={setAccountSize} />
              <FieldNum label="סיכון לעסקה (%)" value={riskPct} onChange={setRiskPct} step="0.1" />
              <FieldNum label="מחיר כניסה ($)" value={entryPrice} onChange={setEntryPrice} step="0.01" />
              <FieldNum label="מרחק סטופ ($)" value={stopDistance} onChange={setStopDistance} step="0.01" />
              <FieldNum label="יחס יעד (R)" value={rMultiple} onChange={setRMultiple} step="0.5" />
            </div>

            {calc ? (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                <ResultCard label="סיכון בדולרים" value={fmtMoney(calc.riskDollars)} tone="warn" />
                <ResultCard label="כמות מניות" value={calc.shares.toLocaleString('he-IL')} tone="primary" big />
                {calc.positionValue !== null && (
                  <ResultCard label="שווי פוזיציה" value={fmtMoney(calc.positionValue)} />
                )}
                {calc.leverage !== null && (
                  <ResultCard label="מינוף" value={`${calc.leverage.toFixed(2)}x`} />
                )}
                {calc.stopPrice !== null && (
                  <ResultCard label="מחיר סטופ" value={`$${fmtNum(calc.stopPrice)}`} tone="danger" />
                )}
                {calc.targetPrice !== null && (
                  <ResultCard label={`מחיר יעד (${rMultiple}R)`} value={`$${fmtNum(calc.targetPrice)}`} tone="success" />
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
            ) : (
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
                <Info className="w-4 h-4 shrink-0" />
                מלא את שדות החובה: גודל חשבון, סיכון % ומרחק סטופ
              </div>
            )}
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
            <div className="flex items-center gap-2 p-4 border-b border-border">
              <CalendarRange className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">לוח אירועים כלכליים</h2>
              <span className="ms-auto text-[10px] text-muted-foreground bg-muted/40 rounded-full px-2 py-0.5">
                מ-Investing.com
              </span>
            </div>
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
            <div className="px-4 py-2 text-[10px] text-muted-foreground text-center border-t border-border" dir="ltr">
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
