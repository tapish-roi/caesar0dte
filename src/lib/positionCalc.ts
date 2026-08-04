// ──────────────────────────────────────────────────────────────────────────────
// Position-size calculator — pure math only. No React. Fully unit-testable.
//
// Direction is INFERRED from entry vs stop (entry > stop → long). There is no
// user-facing long/short toggle anywhere in this module.
// ──────────────────────────────────────────────────────────────────────────────

export interface CalculatorBox {
  id: string;
  /** Only used to look up this symbol's ATR for the one-click stop. */
  ticker: string;
  entryPrice: string;
  stopLoss: string;
  riskAmount: string;      // dollars risked on this trade
  accountSize: string;
  currentPrice: string;
  addOnPrice: string;
  newStopLoss: string;
  currentPriceAddOn: string;
}

/** Hard cap on what a single trade may risk: 3% of the account. */
export const MAX_RISK_PCT = 0.03;

export const R_LEVELS = [0.8, 1, 1.2, 2] as const;
export const ADD_ON_R_LEVELS = [1, 2, 3] as const;

const uuid = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const emptyBox = (
  overrides: Partial<CalculatorBox> = {},
): CalculatorBox => ({
  id: uuid(),
  ticker: '',
  entryPrice: '',
  stopLoss: '',
  riskAmount: '',
  accountSize: '',
  currentPrice: '',
  addOnPrice: '',
  newStopLoss: '',
  currentPriceAddOn: '',
  ...overrides,
});

/** Every field on a box is a raw input string. Anything unparseable is 0. */
export const num = (v: string | undefined): number => parseFloat(v ?? '') || 0;

/** Division is only ever performed with a positive denominator. */
const div = (n: number, d: number): number => (d > 0 ? n / d : 0);

/** An input is "empty" only when the user has typed nothing — "0" is a value. */
const isBlank = (v: string | undefined): boolean => (v ?? '').trim() === '';

// ── Base calculations ───────────────────────────────────────────────────────

export interface BaseCalc {
  isLong: boolean;
  entry: number;
  stop: number;
  risk: number;
  accountSize: number;
  stopSize: number;
  shares: number;
  /** 3% of the account — the most this trade is allowed to risk. */
  maxRisk: number;
  /** Share count that 3% of the account would buy at this stop distance. */
  maxSize: number;
  /** True when the requested risk exceeds the 3% account cap. */
  exceedsMaxRisk: boolean;
  positionCost: number;
  totalRisk: number;
  /** null while currentPrice is untouched — the UI must not render 0. */
  currentR: number | null;
  target: (r: number) => number;
}

export function calcBase(box: CalculatorBox): BaseCalc | null {
  const entry = num(box.entryPrice);
  const stop = num(box.stopLoss);
  const risk = num(box.riskAmount);
  const accountSize = num(box.accountSize);

  // Empty state until the three inputs sizing depends on are all present.
  if (!entry || !stop || !risk) return null;

  const isLong = entry > stop;
  const stopSize = Math.abs(entry - stop);
  const shares = Math.floor(div(risk, stopSize));
  const maxRisk = accountSize * MAX_RISK_PCT;
  const maxSize = Math.floor(div(maxRisk, stopSize));

  const current = num(box.currentPrice);
  const currentR = isBlank(box.currentPrice)
    ? null
    : div(isLong ? current - entry : entry - current, stopSize);

  return {
    isLong,
    entry,
    stop,
    risk,
    accountSize,
    stopSize,
    shares,
    maxRisk,
    maxSize,
    exceedsMaxRisk: maxRisk > 0 && risk > maxRisk,
    positionCost: shares * entry,
    totalRisk: shares * stopSize,
    currentR,
    target: (r: number) => (isLong ? entry + stopSize * r : entry - stopSize * r),
  };
}

// ── Add-on calculations ─────────────────────────────────────────────────────
//
// Raising the stop on the original position reduces the risk that position
// still consumes; the freed-up budget is what funds the add-on.

export interface AddOnCalc {
  addOnStop: number;
  newRiskOnOriginal: number;
  freedUpRisk: number;
  addOnSize: number;
  totalShares: number;
  avgPrice: number;
  newStopDistance: number;
  /** null while currentPriceAddOn is untouched. */
  currentRAddOn: number | null;
  newTarget: (r: number) => number;
}

export function calcAddOn(
  box: CalculatorBox,
  base: BaseCalc | null,
): AddOnCalc | null {
  if (!base) return null;

  const addOnPrice = num(box.addOnPrice);
  const newStop = num(box.newStopLoss);
  if (!addOnPrice || !newStop) return null;

  const addOnStop = Math.abs(addOnPrice - newStop);
  const newRiskOnOriginal = base.shares * Math.abs(base.entry - newStop);
  const freedUpRisk = Math.max(0, base.risk - newRiskOnOriginal);
  const addOnSize = Math.floor(div(freedUpRisk, addOnStop));

  const totalShares = base.shares + addOnSize;
  const avgPrice = div(
    base.shares * base.entry + addOnSize * addOnPrice,
    totalShares,
  );
  const newStopDistance = Math.abs(avgPrice - newStop);

  const currentAddOn = num(box.currentPriceAddOn);
  const currentRAddOn = isBlank(box.currentPriceAddOn)
    ? null
    : div(
        base.isLong ? currentAddOn - avgPrice : avgPrice - currentAddOn,
        newStopDistance,
      );

  return {
    addOnStop,
    newRiskOnOriginal,
    freedUpRisk,
    addOnSize,
    totalShares,
    avgPrice,
    newStopDistance,
    currentRAddOn,
    newTarget: (r: number) =>
      base.isLong
        ? avgPrice + newStopDistance * r
        : avgPrice - newStopDistance * r,
  };
}

// ── Formatting ──────────────────────────────────────────────────────────────

const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

export const formatCurrency = (n: number): string =>
  currencyFmt.format(Number.isFinite(n) ? n : 0);

export const formatInt = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-US');

/** R multiples always carry an explicit sign: "+1.20" / "-0.35". */
export const formatR = (n: number): string => {
  const v = Number.isFinite(n) ? n : 0;
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
};
