import { describe, expect, it } from 'vitest';
import { calculatePosition } from '@/lib/positionCalc';

describe('calculatePosition', () => {
  it('sizes shares from risk amount only without capping by account size', () => {
    const result = calculatePosition({
      accountSize: 7800,
      riskAmount: 100,
      side: 'long',
      entryPrice: 100,
      stopPrice: 99,
    });

    expect(result.isValid).toBe(true);
    expect(result.riskPerShare).toBe(1);
    expect(result.rawShares).toBe(100);
    expect(result.shares).toBe(100);
    expect(result.cappedByMaxPosition).toBe(false);
  });
});
