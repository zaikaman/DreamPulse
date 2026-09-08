import { describe, it, expect } from 'vitest';
import {
  erf,
  normalCdf,
  calculateBinaryYesProbability,
  getSigmoidFallbackProb,
  evaluateTradeConfluence,
  DEFAULT_VOLATILITY,
} from './confluence.js';
import type { Market } from '../types/index.js';

function makeMarket(overrides: Partial<Market> = {}): Market {
  return {
    id: 'm-test-1',
    symbol: 'BTC/USD',
    strikePrice: 100000,
    openTimestamp: new Date().toISOString(),
    closeTimestamp: new Date(Date.now() + 300000).toISOString(),
    status: 'Open',
    bestBidYes: 0.45,
    bestAskYes: 0.49,
    ...overrides,
  } as Market;
}

describe('erf', () => {
  it('matches known values', () => {
    expect(erf(0)).toBeCloseTo(0, 6);
    expect(erf(1)).toBeCloseTo(0.8427, 3);
    expect(erf(-1)).toBeCloseTo(-0.8427, 3);
  });
});

describe('normalCdf', () => {
  it('is 0.5 at zero and clamps tails', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(-8)).toBeLessThan(0.0001);
    expect(normalCdf(8)).toBeGreaterThan(0.9999);
  });

  it('is monotonically increasing', () => {
    expect(normalCdf(1)).toBeGreaterThan(normalCdf(0));
    expect(normalCdf(0)).toBeGreaterThan(normalCdf(-1));
  });
});

describe('calculateBinaryYesProbability', () => {
  it('returns 0.5 for invalid spot/strike', () => {
    expect(calculateBinaryYesProbability(0, 100, 0.5, 0.01)).toBe(0.5);
    expect(calculateBinaryYesProbability(100, 0, 0.5, 0.01)).toBe(0.5);
  });

  it('resolves expired contracts deterministically', () => {
    expect(calculateBinaryYesProbability(101, 100, 0.5, 0)).toBe(0.9999);
    expect(calculateBinaryYesProbability(99, 100, 0.5, -1)).toBe(0.0001);
  });

  it('favors YES when spot is above strike', () => {
    const prob = calculateBinaryYesProbability(101000, 100000, DEFAULT_VOLATILITY['BTC/USD'], 300 / 31557600);
    expect(prob).toBeGreaterThan(0.5);
  });

  it('favors NO when spot is below strike', () => {
    const prob = calculateBinaryYesProbability(99000, 100000, DEFAULT_VOLATILITY['BTC/USD'], 300 / 31557600);
    expect(prob).toBeLessThan(0.5);
  });
});

describe('getSigmoidFallbackProb', () => {
  it('returns 0.5 for invalid strike', () => {
    expect(getSigmoidFallbackProb(100, 0)).toBe(0.5);
  });

  it('increases with spot relative to strike', () => {
    const below = getSigmoidFallbackProb(99, 100);
    const above = getSigmoidFallbackProb(101, 100);
    expect(above).toBeGreaterThan(0.5);
    expect(below).toBeLessThan(0.5);
  });
});

describe('evaluateTradeConfluence', () => {
  it('returns NEUTRAL when telemetry is missing', () => {
    const result = evaluateTradeConfluence(makeMarket({ strikePrice: 0 }), undefined, 0);
    expect(result.convictionState).toBe('NEUTRAL');
    expect(result.recommendedAction).toBe('WAIT');
    expect(result.winProbability).toBe(50);
  });

  it('produces bullish YES edge when spot is above strike and book is cheap', () => {
    const result = evaluateTradeConfluence(
      makeMarket({ strikePrice: 100000, bestBidYes: 0.4, bestAskYes: 0.44 }),
      undefined,
      100500,
    );
    expect(result.spotDiff).toBeGreaterThan(0);
    expect(result.isYesEdge).toBe(true);
    expect(result.recommendedAction).toBe('BUY_UP');
    expect(result.recommendedOutcome).toBe('YES');
    expect(result.signedEdgeLabel).toMatch(/^\+/);
  });

  it('produces bearish NO edge when spot is below strike and book is rich', () => {
    const result = evaluateTradeConfluence(
      makeMarket({ strikePrice: 100000, bestBidYes: 0.6, bestAskYes: 0.64 }),
      undefined,
      99500,
    );
    expect(result.spotDiff).toBeLessThan(0);
    expect(result.isNoEdge).toBe(true);
    expect(result.recommendedAction).toBe('BUY_DOWN');
    expect(result.recommendedOutcome).toBe('NO');
  });

  it('flags counter-trend conflict on plunging price action with YES edge', () => {
    const now = Date.now();
    const priceHistory = Array.from({ length: 10 }, (_, i) => ({
      timestamp: now - (9 - i) * 6000,
      price: 101000 - i * 60,
    }));
    const result = evaluateTradeConfluence(
      makeMarket({ strikePrice: 100000, bestBidYes: 0.4, bestAskYes: 0.44 }),
      undefined,
      100800,
      priceHistory,
    );
    expect(result.isCounterTrendConflict).toBe(true);
    expect(result.convictionState).toBe('CAUTION_COUNTER_TREND');
    expect(result.recommendedAction).toBe('WAIT');
  });

  it('builds badge styles per conviction state', () => {
    const neutral = evaluateTradeConfluence(makeMarket({ strikePrice: 0 }), undefined, 0);
    expect(neutral.badgeStyle.label).toContain('NEUTRAL');
  });
});
