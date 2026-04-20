import { useEffect, useMemo, useReducer, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AccountCard from './AccountCard';
import TradeCard from './TradeCard';
import WarningsBanner from './WarningsBanner';
import { calculatePosition, type Side } from '@/lib/positionCalc';

// ──────────────────────────────────────────────────────────────────────────────
// Position Calculator slide. Account-level inputs (size + risk $) persist to
// Supabase user_calculator_settings; per-trade inputs persist to localStorage
// so multiple instances each remember their own state across reloads.
// ──────────────────────────────────────────────────────────────────────────────

const PER_TRADE_KEY = 'position-calc-state';

interface PerTradeState {
  id: string;
  ticker: string;
  side: Side;
  entryPrice: string;
  stopPrice: string;
  targetPrice: string;
  currentPrice: string;
  commissionPerShare: string;
  maxPositionPct: string;
  addPrice: string;
  addStopPrice: string;
}

const newInstance = (): PerTradeState => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  ticker: '',
  side: 'long',
  entryPrice: '',
  stopPrice: '',
  targetPrice: '',
  currentPrice: '',
  commissionPerShare: '',
  maxPositionPct: '100',
  addPrice: '',
  addStopPrice: '',
});

function readPerTrade(): PerTradeState[] {
  try {
    const raw = localStorage.getItem(PER_TRADE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as PerTradeState[];
    }
  } catch {/* noop */}
  return [newInstance()];
}

export default function PositionCalculatorSection() {
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id;

  // ── Account-level (server-persisted, debounced) ─────────────────────────────
  const [accountSize, setAccountSize] = useState<string>('100000');
  const [riskAmount, setRiskAmount] = useState<string>('1000');
  const [accountLoaded, setAccountLoaded] = useState(false);

  // Initial load from Supabase
  useEffect(() => {
    if (!userId) {
      setAccountLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('user_calculator_settings')
        .select('account_size, risk_amount')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('Failed to load calculator settings', error);
      } else if (data) {
        setAccountSize(String(data.account_size));
        setRiskAmount(String(data.risk_amount));
      }
      setAccountLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Debounced upsert
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!userId || !accountLoaded) return;
    const acct = parseFloat(accountSize);
    const risk = parseFloat(riskAmount);
    if (!Number.isFinite(acct) || acct <= 0) return;
    if (!Number.isFinite(risk) || risk <= 0) return;
    if (risk > acct) return; // respect DB CHECK & spec validation

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      const { error } = await supabase
        .from('user_calculator_settings')
        .upsert(
          { user_id: userId, account_size: acct, risk_amount: risk },
          { onConflict: 'user_id' },
        );
      if (error) console.error('Failed to save calculator settings', error);
    }, 500);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [accountSize, riskAmount, userId, accountLoaded]);

  // ── Per-trade instances (localStorage-persisted) ────────────────────────────
  const [instances, setInstances] = useReducer(
    (_prev: PerTradeState[], next: PerTradeState[]) => next,
    undefined,
    readPerTrade,
  );

  useEffect(() => {
    try {
      localStorage.setItem(PER_TRADE_KEY, JSON.stringify(instances));
    } catch {/* noop */}
  }, [instances]);

  const updateInstance = useCallback((id: string, patch: Partial<PerTradeState>) => {
    setInstances(instances.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, [instances]);

  const addInstance = () => setInstances([...instances, newInstance()]);
  const removeInstance = (id: string) => {
    if (instances.length <= 1) return;
    setInstances(instances.filter((it) => it.id !== id));
  };

  // Per-card Clear (resets only this card's inputs — never wipes account size)
  const clearAccountCard = () => {
    setAccountSize('100000');
    setRiskAmount('1000');
    toast({ title: 'אופס', description: 'גודל חשבון וסיכון לעסקה הוחזרו לברירת מחדל' });
  };

  // ── ATR cache lookup for tickers (used for stop-distance ratio + ATR-stop) ──
  const tickersForAtr = useMemo(
    () => Array.from(new Set(instances.map((i) => i.ticker.toUpperCase()).filter(Boolean))),
    [instances],
  );

  const { data: atrRows = [] } = useQuery({
    queryKey: ['stock-atr-data-for-position', tickersForAtr],
    queryFn: async () => {
      if (tickersForAtr.length === 0) return [];
      const { data, error } = await supabase
        .from('stock_atr_data')
        .select('ticker, atr, data_date')
        .in('ticker', tickersForAtr)
        .order('data_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: tickersForAtr.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const atrByTicker = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of atrRows) {
      if (!map[r.ticker]) map[r.ticker] = Number(r.atr);
    }
    return map;
  }, [atrRows]);

  // ── Render ──────────────────────────────────────────────────────────────────
  const acctNum = parseFloat(accountSize);
  const riskNum = parseFloat(riskAmount);

  return (
    <div className="space-y-4">
      {/* Shared account/risk inputs (server-persisted) */}
      <AccountCard
        accountSize={accountSize}
        riskAmount={riskAmount}
        onAccountSizeChange={setAccountSize}
        onRiskAmountChange={setRiskAmount}
        onClear={clearAccountCard}
      />

      {instances.map((inst, idx) => {
        const atr = inst.ticker ? atrByTicker[inst.ticker.toUpperCase()] : undefined;
        const inputs = {
          accountSize: Number.isFinite(acctNum) ? acctNum : 0,
          riskAmount: Number.isFinite(riskNum) ? riskNum : 0,
          side: inst.side,
          entryPrice: parseFloat(inst.entryPrice) || 0,
          stopPrice: parseFloat(inst.stopPrice) || 0,
          targetPrice: parseFloat(inst.targetPrice) || undefined,
          currentPrice: parseFloat(inst.currentPrice) || undefined,
          commissionPerShare: parseFloat(inst.commissionPerShare) || 0,
          maxPositionPct: parseFloat(inst.maxPositionPct) || 100,
        };
        const result = calculatePosition(inputs);

        const handleUseAtrStop = () => {
          const entry = parseFloat(inst.entryPrice);
          if (!atr || !Number.isFinite(entry) || entry <= 0) return;
          const stop = inst.side === 'long' ? entry - atr : entry + atr;
          updateInstance(inst.id, { stopPrice: stop.toFixed(2) });
        };

        return (
          <div key={inst.id} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                פוזיציה #{idx + 1}
              </h2>
              {instances.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeInstance(inst.id)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  title="מחק פוזיציה"
                >
                  <Trash2 className="w-4 h-4" />
                  הסר
                </Button>
              )}
            </div>

            <TradeCard
              entryPrice={inst.entryPrice}
              stopPrice={inst.stopPrice}
              currentPrice={inst.currentPrice}
              addPrice={inst.addPrice}
              addStopPrice={inst.addStopPrice}
              atr={atr}
              result={result}
              accountSize={inputs.accountSize}
              riskAmount={inputs.riskAmount}
              onEntryChange={(v) => updateInstance(inst.id, { entryPrice: v })}
              onStopChange={(v) => updateInstance(inst.id, { stopPrice: v })}
              onCurrentPriceChange={(v) => updateInstance(inst.id, { currentPrice: v })}
              onAddPriceChange={(v) => updateInstance(inst.id, { addPrice: v })}
              onAddStopChange={(v) => updateInstance(inst.id, { addStopPrice: v })}
              onSideDetected={(s) => {
                if (s !== inst.side) updateInstance(inst.id, { side: s });
              }}
              onClear={() =>
                updateInstance(inst.id, {
                  entryPrice: '',
                  stopPrice: '',
                  currentPrice: '',
                  addPrice: '',
                  addStopPrice: '',
                })
              }
              onUseAtrStop={handleUseAtrStop}
            />

            <WarningsBanner
              result={result}
              accountSize={inputs.accountSize}
              atr={atr}
              riskPerShareForAtr={result.riskPerShare}
            />

            {idx < instances.length - 1 && (
              <div className="border-t border-border pt-2" />
            )}
          </div>
        );
      })}

      <Button onClick={addInstance} variant="outline" className="w-full border-dashed">
        <Plus className="w-4 h-4" />
        הוסף מחשבון פוזיציה
      </Button>
    </div>
  );
}
