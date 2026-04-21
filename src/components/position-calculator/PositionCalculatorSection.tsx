import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AccountCard from './AccountCard';
import TradeSetupCard from './TradeSetupCard';
import LiveTrackerCard from './LiveTrackerCard';
import WarningsBanner from './WarningsBanner';
import ResultsPanel from './ResultsPanel';
import RTargetsLadder from './RTargetsLadder';
import ScaleOutPlan from './ScaleOutPlan';
import { calculatePosition, type Side } from '@/lib/positionCalc';

// ──────────────────────────────────────────────────────────────────────────────
// Single-instance position calculator. Account-level inputs (size + risk $)
// persist to user_calculator_settings; per-trade inputs persist to
// localStorage["position-calc-state"]. All math is reactive via useMemo.
// ──────────────────────────────────────────────────────────────────────────────

const PER_TRADE_KEY = 'position-calc-state';

interface PerTradeState {
  ticker: string;
  side: Side;
  entryPrice: string;
  stopPrice: string;
  targetPrice: string;
  currentPrice: string;
  commissionPerShare: string;
  maxPositionPct: string;
}

type Action =
  | { type: 'patch'; patch: Partial<PerTradeState> }
  | { type: 'clearTrade' }
  | { type: 'clearLive' };

const initialPerTrade: PerTradeState = {
  ticker: '',
  side: 'long',
  entryPrice: '',
  stopPrice: '',
  targetPrice: '',
  currentPrice: '',
  commissionPerShare: '',
  maxPositionPct: '100',
};

function reducer(state: PerTradeState, action: Action): PerTradeState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    case 'clearTrade':
      return {
        ...state,
        ticker: '',
        entryPrice: '',
        stopPrice: '',
        targetPrice: '',
      };
    case 'clearLive':
      return { ...state, currentPrice: '', commissionPerShare: '' };
    default:
      return state;
  }
}

function readPerTrade(): PerTradeState {
  try {
    const raw = localStorage.getItem(PER_TRADE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...initialPerTrade, ...(parsed as PerTradeState) };
      }
    }
  } catch {
    /* noop */
  }
  return initialPerTrade;
}

export default function PositionCalculatorSection() {
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id;

  // ── Account-level (server-persisted, debounced) ─────────────────────────────
  const [accountSize, setAccountSize] = useState<string>('100000');
  const [riskAmount, setRiskAmount] = useState<string>('1000');
  const [accountLoaded, setAccountLoaded] = useState(false);

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
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!userId || !accountLoaded) return;
    const acct = parseFloat(accountSize);
    const risk = parseFloat(riskAmount);
    if (!Number.isFinite(acct) || acct <= 0) return;
    if (!Number.isFinite(risk) || risk <= 0) return;
    if (risk > acct) return;

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

  // ── Per-trade reducer (localStorage-persisted) ──────────────────────────────
  const [trade, dispatch] = useReducer(reducer, undefined, readPerTrade);

  useEffect(() => {
    try {
      localStorage.setItem(PER_TRADE_KEY, JSON.stringify(trade));
    } catch {
      /* noop */
    }
  }, [trade]);

  // ── ATR cache lookup ────────────────────────────────────────────────────────
  const tickerKey = trade.ticker.toUpperCase();
  const { data: atrRow } = useQuery({
    queryKey: ['stock-atr-data-for-position', tickerKey],
    queryFn: async () => {
      if (!tickerKey) return null;
      const { data, error } = await supabase
        .from('stock_atr_data')
        .select('atr, close_price, data_date')
        .eq('ticker', tickerKey)
        .order('data_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tickerKey,
    staleTime: 5 * 60 * 1000,
  });

  const atr = atrRow?.atr ? Number(atrRow.atr) : undefined;
  const closeFromAtr = atrRow?.close_price ? Number(atrRow.close_price) : undefined;

  // ── Calculation ─────────────────────────────────────────────────────────────
  const inputs = useMemo(() => {
    const acct = parseFloat(accountSize);
    const risk = parseFloat(riskAmount);
    return {
      accountSize: Number.isFinite(acct) ? acct : 0,
      riskAmount: Number.isFinite(risk) ? risk : 0,
      side: trade.side,
      entryPrice: parseFloat(trade.entryPrice) || 0,
      stopPrice: parseFloat(trade.stopPrice) || 0,
      targetPrice: parseFloat(trade.targetPrice) || undefined,
      currentPrice: parseFloat(trade.currentPrice) || undefined,
      commissionPerShare: parseFloat(trade.commissionPerShare) || 0,
      maxPositionPct: parseFloat(trade.maxPositionPct) || 100,
    };
  }, [accountSize, riskAmount, trade]);

  const result = useMemo(() => calculatePosition(inputs), [inputs]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleClearAccount = () => {
    setAccountSize('100000');
    setRiskAmount('1000');
    dispatch({ type: 'patch', patch: { maxPositionPct: '100' } });
    toast({ title: 'אופס', description: 'גודל חשבון, סיכון וחשיפה הוחזרו לברירת מחדל' });
  };

  const handleUseAtrStop = () => {
    if (!atr || !inputs.entryPrice) return;
    const stop =
      trade.side === 'long' ? inputs.entryPrice - atr : inputs.entryPrice + atr;
    dispatch({ type: 'patch', patch: { stopPrice: stop.toFixed(2) } });
  };

  const handleSetTargetByR = (n: number) => {
    if (result.riskPerShare <= 0) return;
    const t =
      trade.side === 'long'
        ? inputs.entryPrice + n * result.riskPerShare
        : inputs.entryPrice - n * result.riskPerShare;
    dispatch({ type: 'patch', patch: { targetPrice: t.toFixed(2) } });
  };

  const handleSyncFromAtr = () => {
    if (!closeFromAtr) return;
    dispatch({ type: 'patch', patch: { currentPrice: closeFromAtr.toFixed(2) } });
  };

  const hasTarget = !!(inputs.targetPrice && inputs.targetPrice > 0);
  const hasCurrentPrice = !!(inputs.currentPrice && inputs.currentPrice > 0);

  return (
    <div className="space-y-4">
      {/* Top row — input cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AccountCard
          accountSize={accountSize}
          riskAmount={riskAmount}
          maxPositionPct={trade.maxPositionPct}
          onAccountSizeChange={setAccountSize}
          onRiskAmountChange={setRiskAmount}
          onMaxPositionPctChange={(v) => dispatch({ type: 'patch', patch: { maxPositionPct: v } })}
          onClear={handleClearAccount}
        />

        <TradeSetupCard
          ticker={trade.ticker}
          side={trade.side}
          entryPrice={trade.entryPrice}
          stopPrice={trade.stopPrice}
          targetPrice={trade.targetPrice}
          atr={atr}
          riskPerShare={result.riskPerShare}
          rrRatio={result.rrRatio}
          stopDistancePct={result.stopDistancePct}
          onTickerChange={(v) => dispatch({ type: 'patch', patch: { ticker: v } })}
          onSideChange={(s) => dispatch({ type: 'patch', patch: { side: s } })}
          onEntryChange={(v) => dispatch({ type: 'patch', patch: { entryPrice: v } })}
          onStopChange={(v) => dispatch({ type: 'patch', patch: { stopPrice: v } })}
          onTargetChange={(v) => dispatch({ type: 'patch', patch: { targetPrice: v } })}
          onClear={() => dispatch({ type: 'clearTrade' })}
          onUseAtrStop={handleUseAtrStop}
          onSetTarget={handleSetTargetByR}
        />

        <LiveTrackerCard
          currentPrice={trade.currentPrice}
          commissionPerShare={trade.commissionPerShare}
          liveRMultiple={result.liveRMultiple}
          hasCurrentPrice={hasCurrentPrice}
          closePriceFromAtr={closeFromAtr}
          onCurrentPriceChange={(v) => dispatch({ type: 'patch', patch: { currentPrice: v } })}
          onCommissionPerShareChange={(v) =>
            dispatch({ type: 'patch', patch: { commissionPerShare: v } })
          }
          onClear={() => dispatch({ type: 'clearLive' })}
          onSyncFromAtr={handleSyncFromAtr}
        />
      </div>

      {/* Warnings */}
      <WarningsBanner result={result} riskAmount={inputs.riskAmount} />

      {/* Results */}
      <ResultsPanel
        result={result}
        ticker={trade.ticker}
        side={trade.side}
        entryPrice={inputs.entryPrice}
        stopPrice={inputs.stopPrice}
        targetPrice={inputs.targetPrice}
        hasTarget={hasTarget}
        hasCurrentPrice={hasCurrentPrice}
      />

      {/* Add-ons */}
      {result.isValid && result.shares > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RTargetsLadder
            side={trade.side}
            entryPrice={inputs.entryPrice}
            riskPerShare={result.riskPerShare}
            shares={result.shares}
            onSetAsTarget={(price) =>
              dispatch({ type: 'patch', patch: { targetPrice: price.toFixed(2) } })
            }
          />
          {hasTarget && inputs.targetPrice && (
            <ScaleOutPlan
              side={trade.side}
              entryPrice={inputs.entryPrice}
              riskPerShare={result.riskPerShare}
              shares={result.shares}
              rrRatio={result.rrRatio}
              targetPrice={inputs.targetPrice}
              commissionTotal={result.commissionTotal}
            />
          )}
        </div>
      )}
    </div>
  );
}
