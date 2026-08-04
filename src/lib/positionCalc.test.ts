import { describe, expect, it } from 'vitest';
import {
  calcAddOn,
  calcBase,
  emptyBox,
  formatCurrency,
  formatR,
  type CalculatorBox,
} from '@/lib/positionCalc';

const box = (o: Partial<CalculatorBox>) => emptyBox(o);

describe('calcBase', () => {
  it('returns null until entry, stop and risk are all present', () => {
    expect(calcBase(box({ entryPrice: '100', stopLoss: '95' }))).toBeNull();
    expect(calcBase(box({ entryPrice: '100', riskAmount: '500' }))).toBeNull();
    expect(calcBase(box({ stopLoss: '95', riskAmount: '500' }))).toBeNull();
  });

  it('infers long from entry above stop and sizes on the risk budget', () => {
    const r = calcBase(box({ entryPrice: '100', stopLoss: '95', riskAmount: '500' }))!;
    expect(r.isLong).toBe(true);
    expect(r.stopSize).toBe(5);
    expect(r.shares).toBe(100);
  });

  it('infers short from entry below stop', () => {
    const r = calcBase(box({ entryPrice: '95', stopLoss: '100', riskAmount: '500' }))!;
    expect(r.isLong).toBe(false);
    expect(r.stopSize).toBe(5);
    expect(r.shares).toBe(100);
  });

  it('floors shares — never fractional', () => {
    const r = calcBase(box({ entryPrice: '100', stopLoss: '97', riskAmount: '500' }))!;
    expect(r.shares).toBe(166); // 500 / 3 = 166.67
  });

  it('caps max size at 3% of the account', () => {
    const r = calcBase(
      box({ entryPrice: '100', stopLoss: '95', riskAmount: '500', accountSize: '50000' }),
    )!;
    expect(r.maxRisk).toBe(1500);
    expect(r.maxSize).toBe(300);
    expect(r.exceedsMaxRisk).toBe(false);
  });

  it('flags a risk budget above the 3% cap', () => {
    const r = calcBase(
      box({ entryPrice: '100', stopLoss: '95', riskAmount: '500', accountSize: '10000' }),
    )!;
    expect(r.maxRisk).toBe(300);
    expect(r.exceedsMaxRisk).toBe(true);
  });

  it('leaves currentR null when current price is untouched', () => {
    const r = calcBase(box({ entryPrice: '100', stopLoss: '95', riskAmount: '500' }))!;
    expect(r.currentR).toBeNull();
  });

  it('signs currentR by inferred direction', () => {
    const long = calcBase(
      box({ entryPrice: '100', stopLoss: '95', riskAmount: '500', currentPrice: '110' }),
    )!;
    expect(long.currentR).toBe(2);

    const short = calcBase(
      box({ entryPrice: '95', stopLoss: '100', riskAmount: '500', currentPrice: '85' }),
    )!;
    expect(short.currentR).toBe(2);
  });

  it('places targets on the correct side of entry', () => {
    const long = calcBase(box({ entryPrice: '100', stopLoss: '95', riskAmount: '500' }))!;
    expect(long.target(0.8)).toBe(104);
    expect(long.target(2)).toBe(110);

    const short = calcBase(box({ entryPrice: '95', stopLoss: '100', riskAmount: '500' }))!;
    expect(short.target(1)).toBe(90);
  });

  it('never divides by zero when entry equals stop', () => {
    const r = calcBase(box({ entryPrice: '100', stopLoss: '100', riskAmount: '500' }))!;
    expect(r.stopSize).toBe(0);
    expect(r.shares).toBe(0);
    expect(Number.isFinite(r.target(1))).toBe(true);
  });
});

describe('calcAddOn', () => {
  const base = calcBase(
    box({ entryPrice: '100', stopLoss: '95', riskAmount: '500', accountSize: '50000' }),
  )!;

  it('returns null without both add-on price and new stop', () => {
    expect(calcAddOn(box({ addOnPrice: '105' }), base)).toBeNull();
    expect(calcAddOn(box({ newStopLoss: '99' }), base)).toBeNull();
    expect(calcAddOn(box({ addOnPrice: '105', newStopLoss: '99' }), null)).toBeNull();
  });

  it('funds the add-on from the risk freed by the raised stop', () => {
    const b = box({
      entryPrice: '100',
      stopLoss: '95',
      riskAmount: '500',
      addOnPrice: '105',
      newStopLoss: '99',
    });
    const r = calcAddOn(b, base)!;
    expect(r.addOnStop).toBe(6);                 // |105 - 99|
    expect(r.newRiskOnOriginal).toBe(100);       // 100 shares * |100 - 99|
    expect(r.freedUpRisk).toBe(400);             // 500 - 100
    expect(r.addOnSize).toBe(66);                // floor(400 / 6)
    expect(r.totalShares).toBe(166);
    expect(r.avgPrice).toBeCloseTo(101.99, 2);
    expect(r.newStopDistance).toBeCloseTo(2.99, 2);
  });

  it('clamps freed-up risk at zero when the stop consumes the whole budget', () => {
    const b = box({
      entryPrice: '100',
      stopLoss: '95',
      riskAmount: '500',
      addOnPrice: '105',
      newStopLoss: '80',
    });
    const r = calcAddOn(b, base)!;
    expect(r.freedUpRisk).toBe(0);
    expect(r.addOnSize).toBe(0);
    expect(r.totalShares).toBe(100);
  });

  it('leaves currentRAddOn null when its own price input is untouched', () => {
    const b = box({
      entryPrice: '100',
      stopLoss: '95',
      riskAmount: '500',
      addOnPrice: '105',
      newStopLoss: '99',
    });
    expect(calcAddOn(b, base)!.currentRAddOn).toBeNull();
  });

  it('measures currentRAddOn from the blended average', () => {
    const b = box({
      entryPrice: '100',
      stopLoss: '95',
      riskAmount: '500',
      addOnPrice: '105',
      newStopLoss: '99',
      currentPriceAddOn: '110',
    });
    const r = calcAddOn(b, base)!;
    expect(r.currentRAddOn).toBeCloseTo((110 - r.avgPrice) / r.newStopDistance, 6);
  });
});

describe('formatting', () => {
  it('formats currency with two decimals', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });

  it('always signs R values', () => {
    expect(formatR(1.2)).toBe('+1.20');
    expect(formatR(0)).toBe('+0.00');
    expect(formatR(-0.35)).toBe('-0.35');
  });
});
