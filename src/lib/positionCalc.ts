// ──────────────────────────────────────────────────────────────────────────────
// Position-size calculator — pure math only. No React. Fully unit-testable.
// Every output number traces back to one of the formulas in §3 of the spec.
// ──────────────────────────────────────────────────────────────────────────────

export type Side = 'long' | 'short';

export interface PositionInputs {
  accountSize: number;
  riskAmount: number;
  side: Side;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  currentPrice?: number;
  commissionPerShare?: number;
  maxPositionPct?: number; // 0–100
}

export interface PositionResult {
  isValid: boolean;
  errors: string[];
  riskPerShare: number;
  rawShares: number;
  shares: number;
  positionSize: number;
  positionPctOfAccount: number;
  totalRiskDollars: number;
  riskPctOfAccount: number;
  rewardPerShare: number;
  rewardDollars: number;
  rrRatio: number;
  breakevenPrice: number;
  commissionTotal: number;
  liveRMultiple: number;
  stopDistancePct: number;
  targetDistancePct: number;
  cappedByMaxPosition: boolean;
}

const ZEROS: Omit<PositionResult, 'isValid' | 'errors'> = {
  riskPerShare: 0,
  rawShares: 0,
  shares: 0,
  positionSize: 0,
  positionPctOfAccount: 0,
  totalRiskDollars: 0,
  riskPctOfAccount: 0,
  rewardPerShare: 0,
  rewardDollars: 0,
  rrRatio: 0,
  breakevenPrice: 0,
  commissionTotal: 0,
  liveRMultiple: 0,
  stopDistancePct: 0,
  targetDistancePct: 0,
  cappedByMaxPosition: false,
};

// §3.1 — side-aware validation
export function validate(i: PositionInputs): string[] {
  const e: string[] = [];
  if (!Number.isFinite(i.accountSize) || i.accountSize <= 0) e.push('גודל חשבון חייב להיות גדול מאפס');
  if (!Number.isFinite(i.riskAmount) || i.riskAmount <= 0) e.push('סיכון לעסקה חייב להיות גדול מאפס');
  if (i.riskAmount > i.accountSize) e.push('הסיכון לעסקה לא יכול לחרוג מגודל החשבון');
  if (i.entryPrice && (!Number.isFinite(i.entryPrice) || i.entryPrice < 0)) e.push('מחיר כניסה לא תקין');
  if (i.stopPrice && (!Number.isFinite(i.stopPrice) || i.stopPrice < 0)) e.push('מחיר סטופ לא תקין');
  if (!i.entryPrice || !i.stopPrice) return e; // silent until both filled
  if (i.entryPrice && i.stopPrice && i.entryPrice === i.stopPrice) e.push('הכניסה והסטופ חייבים להיות שונים');
  if (i.side === 'long' && i.stopPrice && i.entryPrice && i.stopPrice >= i.entryPrice)
    e.push('בלונג: הסטופ חייב להיות מתחת למחיר הכניסה');
  if (i.side === 'short' && i.stopPrice && i.entryPrice && i.stopPrice <= i.entryPrice)
    e.push('בשורט: הסטופ חייב להיות מעל מחיר הכניסה');
  if (
    i.targetPrice && i.targetPrice > 0 && i.entryPrice &&
    i.side === 'long' && i.targetPrice <= i.entryPrice
  )
    e.push('בלונג: היעד חייב להיות מעל מחיר הכניסה');
  if (
    i.targetPrice && i.targetPrice > 0 && i.entryPrice &&
    i.side === 'short' && i.targetPrice >= i.entryPrice
  )
    e.push('בשורט: היעד חייב להיות מתחת למחיר הכניסה');
  return e;
}

// §3.10 — orchestrator. Runs §3.2 → §3.9 in order.
export function calculatePosition(i: PositionInputs): PositionResult {
  const errors = validate(i);
  if (errors.length) return { isValid: false, errors, ...ZEROS };

  // §3.2 risk per share
  const riskPerShare = Math.abs(i.entryPrice - i.stopPrice);
  if (riskPerShare <= 0) return { isValid: false, errors: ['מרחק סטופ אפס'], ...ZEROS };

  // §3.3 raw shares — ALWAYS floor; never exceed risk budget
  const rawShares = Math.floor(i.riskAmount / riskPerShare);

  // §3.4 max-position cap
  const maxPct = i.maxPositionPct ?? 100;
  const maxNotional = i.accountSize * (maxPct / 100);
  const maxSharesByExposure = i.entryPrice > 0 ? Math.floor(maxNotional / i.entryPrice) : rawShares;
  const shares = Math.max(0, Math.min(rawShares, maxSharesByExposure));
  const cappedByMaxPosition = shares < rawShares;

  // §3.5 commission round-trip (open + close)
  const cps = i.commissionPerShare ?? 0;
  const commissionTotal = shares * cps * 2;
  const breakevenPrice = i.side === 'long'
    ? i.entryPrice + cps * 2
    : i.entryPrice - cps * 2;

  // §3.6 total risk in $ (true risk including commissions)
  const totalRiskDollars = shares * riskPerShare + commissionTotal;
  const riskPctOfAccount = (totalRiskDollars / i.accountSize) * 100;

  // §3.7 position size & exposure
  const positionSize = shares * i.entryPrice;
  const positionPctOfAccount = (positionSize / i.accountSize) * 100;

  // §3.8 reward & R-multiple (only if target provided)
  const hasTarget = !!(i.targetPrice && i.targetPrice > 0);
  const rewardPerShare = hasTarget ? Math.abs((i.targetPrice as number) - i.entryPrice) : 0;
  const rewardDollars = shares * rewardPerShare;
  const rrRatio = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0;
  const targetDistancePct = i.entryPrice > 0 ? (rewardPerShare / i.entryPrice) * 100 : 0;
  const stopDistancePct = i.entryPrice > 0 ? (riskPerShare / i.entryPrice) * 100 : 0;

  // §3.9 live R-multiple (signed by side)
  const liveRMultiple = i.currentPrice && i.currentPrice > 0 && riskPerShare > 0
    ? (i.side === 'long'
        ? (i.currentPrice - i.entryPrice) / riskPerShare
        : (i.entryPrice - i.currentPrice) / riskPerShare)
    : 0;

  return {
    isValid: true,
    errors: [],
    riskPerShare,
    rawShares,
    shares,
    positionSize,
    positionPctOfAccount,
    totalRiskDollars,
    riskPctOfAccount,
    rewardPerShare,
    rewardDollars,
    rrRatio,
    breakevenPrice,
    commissionTotal,
    liveRMultiple,
    stopDistancePct,
    targetDistancePct,
    cappedByMaxPosition,
  };
}

// §4 add-on helpers
export function rPriceAt(n: number, side: Side, entryPrice: number, riskPerShare: number): number {
  return side === 'long' ? entryPrice + n * riskPerShare : entryPrice - n * riskPerShare;
}

export function blendedScaleOutR(rrRatio: number): number {
  // 1/3 at +1R, 1/3 at +2R, 1/3 at target
  return (1 + 2 + rrRatio) / 3;
}

export function consecutiveLossesUntilHalved(riskPctOfAccount: number): number {
  // ln(0.5) / ln(1 − r), rounded
  if (riskPctOfAccount <= 0 || riskPctOfAccount >= 100) return 0;
  const r = riskPctOfAccount / 100;
  return Math.round(Math.log(0.5) / Math.log(1 - r));
}
