import { describe, it, expect } from 'vitest';
import { normalCdf, normalPdf, erf, calculateZScore, calculateBinaryYesProbability } from '../src/quantitative/cdf.js';
import { calculateFairValue, calculateEdge, calculateSpotDrift, parseWindowToSeconds, secondsToYears } from '../src/quantitative/pricing.js';
import { quantizePrice, quantizeLotSize, toContractUnits, fromContractUnits } from '../src/quantitative/quantizer.js';

describe('Quantitative CDF & Black-Scholes Math', () => {
  it('computes erf(x) accurately for standard test points', () => {
    expect(erf(0)).toBeCloseTo(0.0, 5);
    expect(erf(1)).toBeCloseTo(0.8427, 4);
    expect(erf(-1)).toBeCloseTo(-0.8427, 4);
    expect(erf(2)).toBeCloseTo(0.9953, 4);
  });

  it('computes normalPdf(z) accurately', () => {
    // Peak at 0 is 1/sqrt(2pi) ≈ 0.39894
    expect(normalPdf(0)).toBeCloseTo(0.39894, 4);
    expect(normalPdf(1)).toBeCloseTo(0.24197, 4);
    expect(normalPdf(-1)).toBeCloseTo(0.24197, 4);
  });

  it('computes normal cumulative distribution Φ(z) across standard deviations', () => {
    // Φ(0) = 0.5000
    expect(normalCdf(0)).toBeCloseTo(0.5, 4);
    // Φ(1.96) ≈ 0.9750
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    // Φ(-1.96) ≈ 0.0250
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
    // Φ(1.0) ≈ 0.8413
    expect(normalCdf(1.0)).toBeCloseTo(0.8413, 3);
    // Extreme values
    expect(normalCdf(10)).toBeGreaterThan(0.999);
    expect(normalCdf(-10)).toBeLessThan(0.001);
  });

  it('computes binary prediction contract probability correctly', () => {
    const spot = 96000;
    const strike = 96000;
    const vol = 0.5;
    const timeYears = secondsToYears(300); // 5 minutes

    const probAtm = calculateBinaryYesProbability(spot, strike, vol, timeYears);
    // Near ATM with small drift is roughly ~0.50
    expect(probAtm).toBeGreaterThan(0.48);
    expect(probAtm).toBeLessThan(0.52);

    // Deep in-the-money
    const probItm = calculateBinaryYesProbability(105000, 95000, vol, timeYears);
    expect(probItm).toBeGreaterThan(0.95);

    // Deep out-of-the-money
    const probOtm = calculateBinaryYesProbability(85000, 95000, vol, timeYears);
    expect(probOtm).toBeLessThan(0.05);
  });

  it('handles expired contracts safely in calculateZScore', () => {
    const itmZ = calculateZScore(100, 90, 0.5, 0);
    expect(itmZ).toBe(10.0);

    const otmZ = calculateZScore(90, 100, 0.5, 0);
    expect(otmZ).toBe(-10.0);
  });
});

describe('Quantitative Pricing & Edge Calculation Engine', () => {
  it('parses window strings to seconds accurately', () => {
    expect(parseWindowToSeconds('5m')).toBe(300);
    expect(parseWindowToSeconds('15m')).toBe(900);
    expect(parseWindowToSeconds('1h')).toBe(3600);
    expect(parseWindowToSeconds('24h')).toBe(86400);
  });

  it('calculates spot price percentage drift', () => {
    expect(calculateSpotDrift(96500, 96000)).toBeCloseTo(0.005208, 5);
    expect(calculateSpotDrift(95000, 96000)).toBeCloseTo(-0.010417, 5);
    expect(calculateSpotDrift(96000, 0)).toBe(0);
  });

  it('calculates fair values for YES and NO contracts', () => {
    const res = calculateFairValue(96500, 96000, 300, 'BTC/USD');
    expect(res.fairValueYes).toBeGreaterThan(0.5);
    expect(res.fairValueNo).toBeLessThan(0.5);
    expect(res.fairValueYes + res.fairValueNo).toBeCloseTo(1.0, 3);
  });

  it('detects edge discrepancies and anomalies accurately', () => {
    // Fair value 0.65 vs market resting ask 0.55 -> Positive edge on YES
    const edgeBuyYes = calculateEdge(0.65, 0.50, 0.55, 0.03);
    expect(edgeBuyYes.hasAnomaly).toBe(true);
    expect(edgeBuyYes.actionRecommendation).toBe('BUY_YES');
    expect(edgeBuyYes.edgePercentage).toBeCloseTo(0.125, 2);

    // Fair value 0.40 vs market resting bid 0.55 -> Negative edge on YES (Buy NO)
    const edgeBuyNo = calculateEdge(0.40, 0.55, 0.60, 0.03);
    expect(edgeBuyNo.hasAnomaly).toBe(true);
    expect(edgeBuyNo.actionRecommendation).toBe('BUY_NO');

    // Fair value aligned with market -> No anomaly
    const edgeNeutral = calculateEdge(0.50, 0.49, 0.51, 0.03);
    expect(edgeNeutral.hasAnomaly).toBe(false);
    expect(edgeNeutral.actionRecommendation).toBe('NONE');
  });
});

describe('Quantizer & Protocol Increment Rules', () => {
  it('snaps raw prices to valid tick increments and clamps bounds', () => {
    expect(quantizePrice(0.4831, 0.01)).toBe(0.48);
    expect(quantizePrice(0.4879, 0.01)).toBe(0.49);
    expect(quantizePrice(0.001, 0.01)).toBe(0.01);
    expect(quantizePrice(1.05, 0.01)).toBe(0.99);
  });

  it('snaps lot sizes to step increments and enforces minimums', () => {
    expect(quantizeLotSize(5.8, 1.0, 1.0)).toBe(5.0);
    expect(quantizeLotSize(0.4, 1.0, 1.0)).toBe(1.0);
    expect(quantizeLotSize(12.5, 0.5, 1.0)).toBe(12.5);
    expect(quantizeLotSize(50, 1.0, 1.0, 20)).toBe(20.0);
  });

  it('converts between human token units and BigInt contract units', () => {
    expect(toContractUnits(10.5, 6)).toBe(10500000n);
    expect(toContractUnits(1.0, 18)).toBe(1000000000000000000n);

    expect(fromContractUnits(10500000n, 6)).toBe(10.5);
    expect(fromContractUnits(1000000000000000000n, 18)).toBe(1.0);
  });
});
