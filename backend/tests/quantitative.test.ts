import { describe, it, expect } from 'vitest';
import { normalCdf, normalPdf, erf, calculateZScore, calculateBinaryYesProbability } from '../src/quantitative/cdf.js';
import {
  calculateFairValue,
  calculateEdge,
  calculateSpotDrift,
  parseWindowToSeconds,
  secondsToYears,
  calculateRealizedVolatility,
  calculateVolatilityNormalizedDriftThreshold,
  calculateEdgeProportionalLots,
} from '../src/quantitative/pricing.js';
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

  it('calculates rolling realized volatility from price history with shrinkage and bounds', () => {
    // 1. Fallback for empty or small history
    expect(calculateRealizedVolatility([], 'BTC/USD')).toBe(0.52);
    expect(calculateRealizedVolatility(undefined, 'ETH/USD')).toBe(0.68);

    // 2. Realistic tick history
    const now = Date.now();
    const ticks: Array<{ timestamp: number; price: number }> = [];
    let price = 96000;
    for (let i = 20; i >= 0; i--) {
      // 5-second intervals with micro price oscillations
      price = price + (i % 2 === 0 ? 15 : -12);
      ticks.push({ timestamp: now - i * 5000, price });
    }

    const vol = calculateRealizedVolatility(ticks, 'BTC/USD', 300);
    expect(vol).toBeGreaterThanOrEqual(0.15);
    expect(vol).toBeLessThanOrEqual(2.50);
  });

  it('calculates fair values for YES and NO contracts with dynamic volatility', () => {
    const res = calculateFairValue(96500, 96000, 300, 'BTC/USD');
    expect(res.fairValueYes).toBeGreaterThan(0.5);
    expect(res.fairValueNo).toBeLessThan(0.5);
    expect(res.fairValueYes + res.fairValueNo).toBeCloseTo(1.0, 3);
    expect(res.volatilityUsed).toBe(0.52);

    // With explicit custom volatility
    const resCustom = calculateFairValue(96500, 96000, 300, 'BTC/USD', 0.80);
    expect(resCustom.volatilityUsed).toBe(0.80);
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

  it('calculates volatility-normalized drift thresholds dynamically', () => {
    // BTC with 52% vol: 1m std dev ≈ 0.0717% -> 2.5 sigma ≈ 0.18% (0.0018)
    const btcThreshold = calculateVolatilityNormalizedDriftThreshold(0.52, 2.5, 60);
    expect(btcThreshold).toBeGreaterThanOrEqual(0.0015);
    expect(btcThreshold).toBeLessThanOrEqual(0.0025);

    // SOL with 100% vol: higher vol produces proportionally higher drift threshold
    const solThreshold = calculateVolatilityNormalizedDriftThreshold(1.0, 2.5, 60);
    expect(solThreshold).toBeGreaterThan(btcThreshold);
    expect(solThreshold).toBeLessThanOrEqual(0.0080);

    // Enforces institutional bounds [0.0010, 0.0080]
    expect(calculateVolatilityNormalizedDriftThreshold(0.01, 2.5, 60)).toBe(0.0010);
    expect(calculateVolatilityNormalizedDriftThreshold(5.0, 5.0, 60)).toBe(0.0080);
  });

  it('scales lot sizing proportionally to mathematical edge (Fractional Kelly)', () => {
    const baseLots = 5.0;
    const minEdge = 0.03;
    const maxTradeUsd = 20.0;
    const price = 0.50; // Max affordable = 40 lots

    // 1. Edge equals minEdge -> scale ≈ 1.0x -> 5.0 lots
    const lotsAtBase = calculateEdgeProportionalLots(baseLots, 0.03, minEdge, maxTradeUsd, price);
    expect(lotsAtBase).toBe(5.0);

    // 2. High edge (3x minEdge) -> scale scales up to ~2.5x -> 12.0 - 13.0 lots
    const lotsHighEdge = calculateEdgeProportionalLots(baseLots, 0.09, minEdge, maxTradeUsd, price);
    expect(lotsHighEdge).toBeGreaterThan(lotsAtBase);
    expect(lotsHighEdge).toBeLessThanOrEqual(13.0);

    // 3. Sub-minimum edge -> scale dampens to 0.5x -> floor/dampened lots
    const lotsLowEdge = calculateEdgeProportionalLots(baseLots, 0.01, minEdge, maxTradeUsd, price);
    expect(lotsLowEdge).toBeLessThan(lotsAtBase);

    // 4. Respects maxTradeSizeUsd ceiling
    const smallCapUsd = 2.0; // max 4 lots at $0.50
    const lotsCapped = calculateEdgeProportionalLots(baseLots, 0.15, minEdge, smallCapUsd, price);
    expect(lotsCapped).toBe(4.0);
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

describe('Oracle Arbitrage Agent Decision & Filter Invariants', () => {
  it('evaluates actionable BUY_YES when net post-spread edge exceeds threshold', async () => {
    const { OracleArbAgent } = await import('../src/agents/oracle-arb.js');
    const agent = new OracleArbAgent({ minEdge: 0.035 });

    const now = Date.now();
    const context = {
      spotTicker: {
        symbol: 'BTC/USD',
        price: 96500,
        change1m: 0.0005, // Slightly positive drift
        change5m: 0.0010,
        timestamp: now,
      },
      market: {
        id: 'market-1',
        symbol: 'BTC/USD',
        strikePrice: 96000,
        windowDuration: '15m',
        openTimestamp: new Date(now - 300000).toISOString(),
        closeTimestamp: new Date(now + 600000).toISOString(), // 10m left
        resolutionTimestamp: new Date(now + 660000).toISOString(),
        status: 'Open' as const,
        bestBidYes: 0.52,
        bestAskYes: 0.54, // Ask is 0.54 vs Fair ~0.65+
        bestBidNo: 0.46,
        bestAskNo: 0.48,
        impliedProbYes: 0.53,
        fairValueYes: 0.65,
        edgePercentage: 0.12,
      },
      depth: {
        yesBids: [{ price: 0.52, quantity: 100, total: 52 }],
        yesAsks: [{ price: 0.54, quantity: 100, total: 54 }],
      },
      activeSessions: [],
    };

    const decision = await agent.evaluate(context);
    expect(decision.action).toBe('TAKER_BUY');
    expect(decision.targetOutcome).toBe('YES');
    expect(decision.confidence).toBeGreaterThanOrEqual(0.88);
  });

  it('rejects BUY_YES when spot is actively dumping (adverse selection filter)', async () => {
    const { OracleArbAgent } = await import('../src/agents/oracle-arb.js');
    const agent = new OracleArbAgent({ minEdge: 0.035 });

    const now = Date.now();
    const context = {
      spotTicker: {
        symbol: 'BTC/USD',
        price: 96500,
        change1m: -0.0025, // Sharp dump -0.25%
        change5m: -0.0030,
        timestamp: now,
      },
      market: {
        id: 'market-1',
        symbol: 'BTC/USD',
        strikePrice: 96000,
        windowDuration: '15m',
        openTimestamp: new Date(now - 300000).toISOString(),
        closeTimestamp: new Date(now + 600000).toISOString(),
        resolutionTimestamp: new Date(now + 660000).toISOString(),
        status: 'Open' as const,
        bestBidYes: 0.52,
        bestAskYes: 0.54,
        bestBidNo: 0.46,
        bestAskNo: 0.48,
        impliedProbYes: 0.53,
        fairValueYes: 0.65,
        edgePercentage: 0.12,
      },
      depth: {
        yesBids: [{ price: 0.52, quantity: 100, total: 52 }],
        yesAsks: [{ price: 0.54, quantity: 100, total: 54 }],
      },
      activeSessions: [],
    };

    const decision = await agent.evaluate(context);
    expect(decision.action).toBe('HOLD');
    expect(decision.rationale).toContain('adverse selection');
  });

  it('holds when time remaining is under 45 seconds (pin-risk filter)', async () => {
    const { OracleArbAgent } = await import('../src/agents/oracle-arb.js');
    const agent = new OracleArbAgent({ minEdge: 0.035 });

    const now = Date.now();
    const context = {
      spotTicker: {
        symbol: 'BTC/USD',
        price: 96500,
        change1m: 0.0001,
        change5m: 0.0002,
        timestamp: now,
      },
      market: {
        id: 'market-1',
        symbol: 'BTC/USD',
        strikePrice: 96000,
        windowDuration: '5m',
        openTimestamp: new Date(now - 280000).toISOString(),
        closeTimestamp: new Date(now + 20000).toISOString(), // only 20s remaining
        resolutionTimestamp: new Date(now + 80000).toISOString(),
        status: 'Open' as const,
        bestBidYes: 0.52,
        bestAskYes: 0.54,
        bestBidNo: 0.46,
        bestAskNo: 0.48,
        impliedProbYes: 0.53,
        fairValueYes: 0.85,
        edgePercentage: 0.32,
      },
      depth: {
        yesBids: [{ price: 0.52, quantity: 100, total: 52 }],
        yesAsks: [{ price: 0.54, quantity: 100, total: 54 }],
      },
      activeSessions: [],
    };

    const decision = await agent.evaluate(context);
    expect(decision.action).toBe('HOLD');
    expect(decision.rationale).toContain('pin-risk');
  });
});
