import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, TrashIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AccountCard from './AccountCard';
import TradeCard from './TradeCard';

import { calcAddOn, calcBase, emptyBox, type CalculatorBox } from '@/lib/positionCalc';

// ──────────────────────────────────────────────────────────────────────────────
// Position Calculator — an array of independent boxes.
//
// Persistence has two layers with different scopes:
//   • localStorage  — the entire box array, every field, written on any change.
//   • Supabase      — risk_amount + account_size only, one row per user, used as
//                     the default for any box that has no value yet.
// ──────────────────────────────────────────────────────────────────────────────

const BOXES_KEY = 'position_calculator_boxes';
const INITIAL_BOXES = 4;
const SAVE_DEBOUNCE_MS = 1000;

const freshBoxes = (): CalculatorBox[] =>
  Array.from({ length: INITIAL_BOXES }, () => emptyBox());

/** Corrupt JSON must never reach render — fall back to fresh boxes. */
function readBoxes(): CalculatorBox[] {
  try {
    const raw = localStorage.getItem(BOXES_KEY);
    if (!raw) return freshBoxes();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return freshBoxes();
    // Pick only known fields, so junk from an older shape never persists.
    return parsed.map((b) => {
      const o = (b && typeof b === 'object' ? b : {}) as Partial<CalculatorBox>;
      const str = (v: unknown) => (typeof v === 'string' ? v : '');
      return emptyBox({
        ...(typeof o.id === 'string' && o.id ? { id: o.id } : {}),
        ticker: str(o.ticker),
        entryPrice: str(o.entryPrice),
        stopLoss: str(o.stopLoss),
        riskAmount: str(o.riskAmount),
        accountSize: str(o.accountSize),
        currentPrice: str(o.currentPrice),
        addOnPrice: str(o.addOnPrice),
        newStopLoss: str(o.newStopLoss),
        currentPriceAddOn: str(o.currentPriceAddOn),
      });
    });
  } catch {
    return freshBoxes();
  }
}

interface PositionCalculatorSectionProps {
  /** Tickers the user tracks in the ATR calculator — the dropdown source. */
  atrTickers: string[];
}

export default function PositionCalculatorSection({
  atrTickers,
}: PositionCalculatorSectionProps) {
  const { user } = useAuth();
  const userId = user?.id;

  const [boxes, setBoxes] = useState<CalculatorBox[]>(readBoxes);

  // Gate the localStorage write until the account defaults have been applied,
  // so the pre-hydration state can never overwrite what was saved.
  const [isLoading, setIsLoading] = useState(true);

  // ── Load account-level defaults from Supabase ───────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!userId) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_calculator_settings')
        .select('account_size, risk_amount')
        .eq('user_id', userId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('Failed to load calculator settings', error);
      } else if (data) {
        const account = data.account_size == null ? '' : String(data.account_size);
        const risk = data.risk_amount == null ? '' : String(data.risk_amount);
        // Defaults only — a box that already carries a value keeps it.
        setBoxes((prev) =>
          prev.map((b) => ({
            ...b,
            accountSize: b.accountSize || account,
            riskAmount: b.riskAmount || risk,
          })),
        );
      }

      setIsLoading(false);
    })();

    return () => { cancelled = true; };
  }, [userId]);

  // ── Persist the whole array to localStorage on every change ─────────────────
  useEffect(() => {
    if (isLoading) return;
    try {
      localStorage.setItem(BOXES_KEY, JSON.stringify(boxes));
    } catch {
      /* storage unavailable — in-memory state still works */
    }
  }, [boxes, isLoading]);

  // ── Debounced save of the account-level fields ──────────────────────────────
  // boxes[0] is the canonical pair: it is what new boxes inherit.
  const accountSize = boxes[0]?.accountSize ?? '';
  const riskAmount = boxes[0]?.riskAmount ?? '';
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading || !userId) return;

    const account = parseFloat(accountSize);
    const risk = parseFloat(riskAmount);
    if (!Number.isFinite(account) || account <= 0) return;
    if (!Number.isFinite(risk) || risk <= 0) return;

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      const { error } = await supabase
        .from('user_calculator_settings')
        .upsert(
          { user_id: userId, account_size: account, risk_amount: risk },
          { onConflict: 'user_id' },
        );
      if (error) console.error('Failed to save calculator settings', error);
    }, SAVE_DEBOUNCE_MS);

    // Also cancels the pending save on unmount.
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [accountSize, riskAmount, userId, isLoading]);

  // ── Box operations ──────────────────────────────────────────────────────────
  const updateBox = useCallback((id: string, patch: Partial<CalculatorBox>) => {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);

  const addBox = useCallback(() => {
    setBoxes((prev) => [
      ...prev,
      emptyBox({
        riskAmount: prev[0]?.riskAmount ?? '',
        accountSize: prev[0]?.accountSize ?? '',
      }),
    ]);
  }, []);

  const removeBox = useCallback((id: string) => {
    setBoxes((prev) => (prev.length > 1 ? prev.filter((b) => b.id !== id) : prev));
  }, []);

  /** Clear resets every field except the account-level pair. */
  const clearBox = useCallback((id: string) => {
    setBoxes((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              ticker: '',
              entryPrice: '',
              stopLoss: '',
              currentPrice: '',
              addOnPrice: '',
              newStopLoss: '',
              currentPriceAddOn: '',
            }
          : b,
      ),
    );
  }, []);

  /**
   * risk_amount and account_size are shared by every box (that is what the
   * single per-user settings row means), so one control drives them all and
   * boxes[0] stays the canonical pair that new boxes inherit.
   */
  const setAccountField = useCallback(
    (patch: Partial<Pick<CalculatorBox, 'riskAmount' | 'accountSize'>>) => {
      setBoxes((prev) => prev.map((b) => ({ ...b, ...patch })));
    },
    [],
  );

  const clearAccountFields = useCallback(
    () => setAccountField({ riskAmount: '', accountSize: '' }),
    [setAccountField],
  );

  // ── ATR cache lookup, for the one-click stop on each card ───────────────────
  const tickersForAtr = useMemo(
    () =>
      Array.from(
        new Set(boxes.map((b) => b.ticker.trim().toUpperCase()).filter(Boolean)),
      ),
    [boxes],
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

  // Rows come back newest-first, so the first one seen per ticker is the latest.
  const atrByTicker = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of atrRows) if (!map[r.ticker]) map[r.ticker] = Number(r.atr);
    return map;
  }, [atrRows]);

  // ── Derived math, memoized per box ──────────────────────────────────────────
  const calcs = useMemo(
    () =>
      boxes.map((box) => {
        const base = calcBase(box);
        return { base, addOn: calcAddOn(box, base) };
      }),
    [boxes],
  );

  return (
    <div className="space-y-4">
      {/* Shared account/risk inputs — server-persisted, debounced */}
      <AccountCard
        accountSize={accountSize}
        riskAmount={riskAmount}
        onAccountSizeChange={(v) => setAccountField({ accountSize: v })}
        onRiskAmountChange={(v) => setAccountField({ riskAmount: v })}
        onClear={clearAccountFields}
      />

      <div className={boxes.length > 1 ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 items-start' : 'space-y-4'}>
        {boxes.map((box, idx) => {
          const { base, addOn } = calcs[idx];

          return (
            <div key={box.id} className="space-y-4 h-full flex flex-col">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">
                  פוזיציה #{idx + 1}
                </h2>
                {boxes.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeBox(box.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="מחק פוזיציה"
                  >
                    <TrashIcon solid className="w-4 h-4" />
                    הסר
                  </Button>
                )}
              </div>

              <div className="flex-1">
                <TradeCard
                  box={box}
                  base={base}
                  addOn={addOn}
                  atr={atrByTicker[box.ticker.trim().toUpperCase()]}
                  atrTickers={atrTickers}
                  onChange={(patch) => updateBox(box.id, patch)}
                  onClear={() => clearBox(box.id)}
                  onUseAtrStop={() => {
                    const atr = atrByTicker[box.ticker.trim().toUpperCase()];
                    const entry = parseFloat(box.entryPrice);
                    if (!atr || !Number.isFinite(entry) || entry <= 0) return;
                    // Direction comes from the existing stop when there is one;
                    // with nothing to infer from, assume long.
                    const isLong = base ? base.isLong : true;
                    const stop = isLong ? entry - atr : entry + atr;
                    updateBox(box.id, { stopLoss: stop.toFixed(2) });
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <Button onClick={addBox} variant="add" className="w-full">
        <PlusIcon className="w-4 h-4" />
        הוסף מחשבון פוזיציה נוסף
      </Button>
    </div>
  );
}
