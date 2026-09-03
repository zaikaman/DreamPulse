import { describe, it, expect } from 'vitest';
import { normalCdf, normalPdf, erf, calculateZScore, calculateBinaryYesProbability } from '../src/quantitative/cdf.js';
import {
  calculateFairValue,
  calculateConfluenceProbability,
  calculateEdge,
  calculateSpotDrift,
  calculatePriceActionMetrics,
  evaluateMultiFactorConfluence,
  parseWindowToSeconds,
  secondsToYears,
  calculateRealizedVolatility,
  calculateVolatilityNormalizedDriftThreshold,
  calculateEdgeProportionalLots,
  calculateRoiEdge,
  calculateNetExecutableEdge,
  DEFAULT_TAKER_FEE_RATE,
  DEFAULT_GAS_HURDLE,
  DEFAULT_TOTAL_LIVE_HURDLE,
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

  it('calculates stabilized multi-factor confluence probability correctly', () => {
    // Neutral drift and neutral orderbook -> matches BSM probability closely
    const neutral = calculateConfluenceProbability(0.55, 0, 0, 0);
    expect(neutral).toBeCloseTo(0.53, 1);

    // Strong upward spot drift (+0.3%) boosts probability
    const bullish = calculateConfluenceProbability(0.55, 0.003, 0.005, 0.5);
    expect(bullish).toBeGreaterThan(0.60);

    // Strong downward spot drift (-0.3%) dampens probability
    const bearish = calculateConfluenceProbability(0.55, -0.003, -0.005, -0.5);
    expect(bearish).toBeLessThan(0.45);
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

    // High-volatility asset with 100% vol: higher vol produces proportionally higher drift threshold
    const highVolThreshold = calculateVolatilityNormalizedDriftThreshold(1.0, 2.5, 60);
    expect(highVolThreshold).toBeGreaterThan(btcThreshold);
    expect(highVolThreshold).toBeLessThanOrEqual(0.0080);

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

  it('calculates net executable edge accounting for live taker fee and gas friction', () => {
    // 0.30% taker fee + 0.40% gas hurdle = 0.70% total live friction hurdle
    expect(DEFAULT_TAKER_FEE_RATE).toBe(0.003);
    expect(DEFAULT_GAS_HURDLE).toBe(0.004);
    expect(DEFAULT_TOTAL_LIVE_HURDLE).toBe(0.007);

    // Fair value 0.55 vs execution price 0.50 -> raw edge 0.05
    // Friction: 0.50 * 0.003 (0.0015) + 0.004 = 0.0055
    // Net edge = 0.05 - 0.0055 = 0.0445
    const netEdge = calculateNetExecutableEdge(0.55, 0.50);
    expect(netEdge).toBe(0.0445);

    // Custom fee & gas params
    const customNetEdge = calculateNetExecutableEdge(0.55, 0.50, 0.001, 0.002);
    // Friction: 0.50 * 0.001 (0.0005) + 0.002 = 0.0025 -> Net = 0.05 - 0.0025 = 0.0475
    expect(customNetEdge).toBe(0.0475);

    // Negative raw edge: fair value 0.50 vs execution price 0.55 -> raw edge -0.05
    // Friction must shrink absolute edge toward zero, never expand it away from zero
    // Total friction: 0.55 * 0.003 (0.00165) + 0.004 = 0.00565
    // Net edge = -(0.05 - 0.00565) = -0.04435 -> rounded to -0.0444
    const negativeNetEdge = calculateNetExecutableEdge(0.50, 0.55);
    expect(negativeNetEdge).toBe(-0.0444);
    expect(Math.abs(negativeNetEdge)).toBeLessThan(0.05);

    // Negative raw edge smaller than friction should clamp to 0
    // rawEdge = 0.50 - 0.502 = -0.002, friction ~0.0055 > 0.002 -> net edge 0
    expect(calculateNetExecutableEdge(0.50, 0.502)).toBe(0);

    // Zero edge
    expect(calculateNetExecutableEdge(0.50, 0.50)).toBe(0);

    // Invalid prices
    expect(calculateNetExecutableEdge(0, 0.50)).toBe(-1);
    expect(calculateNetExecutableEdge(0.55, 0)).toBe(-1);
  });
});

describe('Quantizer & Protocol Increment Rules', () => {
  it('snaps raw prices to valid tick increments and clamps bounds', () => {
    expect(quantizePrice(0.4831, 0.01)).toBe(0.48);
    expect(quantizePrice(0.4879, 0.01)).toBe(0.49);
    expect(quantizePrice(0.001, 0.01)).toBe(0.01);
    expect(quantizePrice(1.05, 0.01)).toBe(0.99);

    // Default tick size 0.001 (MM_TICK=1000 on 6 decimals)
    expect(quantizePrice(0.015)).toBe(0.015);
    expect(quantizePrice(0.4831)).toBe(0.483);
    expect(quantizePrice(0.4839)).toBe(0.484);
    expect(quantizePrice(0.0001)).toBe(0.001);
    expect(quantizePrice(1.05)).toBe(0.999);
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

  it('calculates ROI-on-risk edge correctly', () => {
    expect(calculateRoiEdge(0.04, 0.50)).toBe(0.08); // 8% ROI
    expect(calculateRoiEdge(0.035, 0.25)).toBe(0.14); // 14% ROI
    expect(calculateRoiEdge(0.035, 0.70)).toBe(0.05); // 5% ROI (fails 8% hurdle)
    expect(calculateRoiEdge(0.05, 0)).toBe(0);
  });

  it('rejects trades outside the [0.25, 0.68] optimal risk/reward envelope', async () => {
    const { OracleArbAgent } = await import('../src/agents/oracle-arb.js');
    const agent = new OracleArbAgent({ minEdge: 0.035 });

    const now = Date.now();
    // High ask price 0.75 (> 0.68)
    const contextHigh = {
      spotTicker: { symbol: 'BTC/USD', price: 96500, change1m: 0.0005, change5m: 0.001, timestamp: now },
      market: {
        id: 'market-high',
        symbol: 'BTC/USD',
        strikePrice: 96000,
        windowDuration: '15m',
        openTimestamp: new Date(now - 300000).toISOString(),
        closeTimestamp: new Date(now + 600000).toISOString(),
        resolutionTimestamp: new Date(now + 660000).toISOString(),
        status: 'Open' as const,
        bestBidYes: 0.73,
        bestAskYes: 0.75,
        bestBidNo: 0.25,
        bestAskNo: 0.27,
        impliedProbYes: 0.74,
        fairValueYes: 0.88,
        edgePercentage: 0.14,
      },
      depth: {
        yesBids: [{ price: 0.73, quantity: 100, total: 73 }],
        yesAsks: [{ price: 0.75, quantity: 100, total: 75 }],
      },
      activeSessions: [],
    };

    const decision = await agent.evaluate(contextHigh);
    expect(decision.action).toBe('HOLD');
    expect(decision.rationale).toContain('optimal risk/reward boundary [0.25, 0.68]');
  });
});

describe('Multi-Factor Confluence & High-Conviction AI Copilot Engine', () => {
  it('calculates price action metrics, EMAs, velocity, and trend classification accurately', () => {
    const now = Date.now();
    const history: Array<{ timestamp: number; price: number }> = [];

    // Simulate an upward surging price series (higher highs, higher velocity)
    let current = 96000;
    for (let i = 25; i >= 0; i--) {
      current += 20; // Upward trending
      history.push({ timestamp: now - i * 3000, price: current });
    }

    const pa = calculatePriceActionMetrics(history, current);
    expect(pa.trend).toMatch(/BULLISH/);
    expect(pa.trendScore).toBeGreaterThan(0.20);
    expect(pa.change1m).toBeGreaterThan(0);
    expect(pa.emaFast).toBeGreaterThanOrEqual(pa.emaSlow);
    expect(pa.velocity).toBeGreaterThan(0);
  });

  it('generates HIGH_CONVICTION BUY_UP trade when price action and mathematical edge align', () => {
    const now = Date.now();
    const history: Array<{ timestamp: number; price: number }> = [];

    // Upward price action
    let current = 96200;
    for (let i = 20; i >= 0; i--) {
      current += 15;
      history.push({ timestamp: now - i * 3000, price: current });
    }

    // Spot = 96500, Strike = 96000 (Spot is $500 above strike, price action is bullish)
    // CLOB ask = 0.55 (undervalued vs theoretical ~0.65+)
    const result = evaluateMultiFactorConfluence(
      96500,
      96000,
      300, // 5m left
      'BTC/USD',
      0.53,
      0.55,
      history,
    );

    expect(result.convictionState).toBe('HIGH_CONVICTION');
    expect(result.recommendedAction).toBe('BUY_UP');
    expect(result.recommendedOutcome).toBe('YES');
    expect(result.winProbability).toBeGreaterThanOrEqual(60);
    expect(result.isCounterTrendConflict).toBe(false);
    expect(result.rationale).toContain('High Conviction UP');
  });

  it('generates HIGH_CONVICTION BUY_DOWN trade when price action and negative edge align', () => {
    const now = Date.now();
    const history: Array<{ timestamp: number; price: number }> = [];

    // Downward price action
    let current = 95800;
    for (let i = 20; i >= 0; i--) {
      current -= 15;
      history.push({ timestamp: now - i * 3000, price: current });
    }

    // Spot = 95500, Strike = 96000 (Spot is $500 below strike, price action is bearish)
    // CLOB bid = 0.45 (YES is overpriced vs theoretical ~0.35, so NO is underpriced)
    const result = evaluateMultiFactorConfluence(
      95500,
      96000,
      300,
      'BTC/USD',
      0.45,
      0.47,
      history,
    );

    expect(result.convictionState).toBe('HIGH_CONVICTION');
    expect(result.recommendedAction).toBe('BUY_DOWN');
    expect(result.recommendedOutcome).toBe('NO');
    expect(result.winProbability).toBeGreaterThanOrEqual(60);
    expect(result.isCounterTrendConflict).toBe(false);
    expect(result.rationale).toContain('High Conviction DOWN');
  });

  it('triggers CAUTION_COUNTER_TREND and blocks BUY_UP when price is dumping despite spot > strike (Falling Knife Safeguard)', () => {
    const now = Date.now();
    const history: Array<{ timestamp: number; price: number }> = [];

    // Spot was 96800 and is crashing down towards strike 96000
    let current = 96800;
    for (let i = 20; i >= 0; i--) {
      current -= 30; // Sharp downward plunge
      history.push({ timestamp: now - i * 3000, price: current });
    }

    // Current spot = 96200 (still $200 above strike 96000), but momentum is plunging hard
    const result = evaluateMultiFactorConfluence(
      96200,
      96000,
      300,
      'BTC/USD',
      0.52,
      0.54,
      history,
    );

    // Safeguard MUST activate: do not suggest buying UP into a falling knife!
    expect(result.convictionState).toBe('CAUTION_COUNTER_TREND');
    expect(result.isCounterTrendConflict).toBe(true);
    expect(result.recommendedAction).toBe('WAIT');
    expect(result.recommendedOutcome).toBe('NONE');
    expect(result.rationale).toContain('Caution: Counter-trend divergence');
    expect(result.rationale).toContain('WAITING for price stabilization');
  });

  it('triggers CAUTION_COUNTER_TREND and blocks BUY_DOWN when price is surging despite spot < strike (Breakout Rally Safeguard)', () => {
    const now = Date.now();
    const history: Array<{ timestamp: number; price: number }> = [];

    // Spot was 95200 and is surging vertically up towards strike 96000
    let current = 95200;
    for (let i = 20; i >= 0; i--) {
      current += 30; // Sharp breakout rally
      history.push({ timestamp: now - i * 3000, price: current });
    }

    // Current spot = 95800 (still $200 below strike 96000), but momentum is surging hard
    const result = evaluateMultiFactorConfluence(
      95800,
      96000,
      300,
      'BTC/USD',
      0.46,
      0.48,
      history,
    );

    // Safeguard MUST activate: do not suggest buying DOWN into a surging breakout!
    expect(result.convictionState).toBe('CAUTION_COUNTER_TREND');
    expect(result.isCounterTrendConflict).toBe(true);
    expect(result.recommendedAction).toBe('WAIT');
    expect(result.recommendedOutcome).toBe('NONE');
    expect(result.rationale).toContain('Caution: Counter-trend divergence');
  });

  it('maintains NEUTRAL state when market is fairly priced and ranging', () => {
    const now = Date.now();
    const history: Array<{ timestamp: number; price: number }> = [];

    // Oscillating flat price around 96000
    for (let i = 20; i >= 0; i--) {
      const price = 96000 + (i % 2 === 0 ? 5 : -5);
      history.push({ timestamp: now - i * 3000, price });
    }

    const result = evaluateMultiFactorConfluence(
      96000,
      96000,
      300,
      'BTC/USD',
      0.49,
      0.51,
      history,
    );

    expect(result.convictionState).toBe('NEUTRAL');
    expect(result.recommendedAction).toBe('WAIT');
    expect(result.recommendedOutcome).toBe('NONE');
    expect(result.rationale).toContain('Observing');
  });

  it('stabilizes edge transitions with smoothing and deadbands (eliminates micro-jitter)', () => {
    // 0.3% dislocation (within 0.5% deadband)
    const result = evaluateMultiFactorConfluence(
      96000,
      96000,
      300,
      'BTC/USD',
      0.498,
      0.502,
      [],
      0,
      0.501, // Previous smoothed fair
    );

    expect(Math.abs(result.edgePercentage)).toBe(0); // Deadband suppresses jitter
  });

  it('covers cdf.ts error throwing on non-positive spot, strike, and volatility and expired contracts', () => {
    expect(() => calculateZScore(0, 100, 0.5, 1)).toThrow('Spot (0) and Strike (100) must be strictly positive.');
    expect(() => calculateZScore(100, 0, 0.5, 1)).toThrow('Spot (100) and Strike (0) must be strictly positive.');
    expect(() => calculateZScore(100, 100, 0, 1)).toThrow('Volatility (0) must be strictly positive.');
    expect(() => calculateZScore(100, 100, -0.2, 1)).toThrow('Volatility (-0.2) must be strictly positive.');

    // Expired contract (timeToExpiryYears <= 0)
    expect(calculateZScore(105, 100, 0.5, 0)).toBe(10.0);
    expect(calculateZScore(95, 100, 0.5, -1)).toBe(-10.0);
  });

  it('covers quantizer.ts fallback and edge cases', () => {
    expect(quantizePrice(NaN)).toBe(0.001);
    expect(quantizePrice(Infinity)).toBe(0.001);
    expect(quantizePrice(0.0001, 0.001)).toBe(0.001);
    expect(quantizePrice(0.9999, 0.001)).toBe(0.999);

    expect(quantizeLotSize(NaN)).toBe(1.0);
    expect(quantizeLotSize(0)).toBe(1.0);
    expect(quantizeLotSize(-5)).toBe(1.0);
    expect(quantizeLotSize(0.5, 1.0, 1.0)).toBe(1.0);
    expect(quantizeLotSize(10, 1.0, 1.0, 5)).toBe(5);

    expect(toContractUnits(NaN)).toBe(0n);
    expect(toContractUnits(0)).toBe(0n);
    expect(toContractUnits(-10)).toBe(0n);
    expect(toContractUnits(12.5, 6)).toBe(12500000n);
    expect(fromContractUnits(12500000n, 6)).toBe(12.5);
  });

  it('covers pricing.ts parseWindowToSeconds, spotDrift, and realizedVolatility edge paths', () => {
    expect(parseWindowToSeconds('1m')).toBe(60);
    expect(parseWindowToSeconds('60s')).toBe(60);
    expect(parseWindowToSeconds('5m')).toBe(300);
    expect(parseWindowToSeconds('15m')).toBe(900);
    expect(parseWindowToSeconds('1h')).toBe(3600);
    expect(parseWindowToSeconds('4h')).toBe(14400);
    expect(parseWindowToSeconds('24h')).toBe(86400);
    expect(parseWindowToSeconds('1d')).toBe(86400);
    expect(parseWindowToSeconds('7d')).toBe(604800);
    expect(parseWindowToSeconds('unknown_window')).toBe(300);

    expect(secondsToYears(-10)).toBe(0);
    expect(calculateSpotDrift(100, 0)).toBe(0);
    expect(calculateSpotDrift(105, 100)).toBeCloseTo(0.05, 4);

    // realizedVolatility edge paths
    expect(calculateRealizedVolatility(undefined, 'BTC/USD')).toBe(0.52);
    expect(calculateRealizedVolatility([], 'ETH/USD')).toBe(0.68);
    expect(calculateRealizedVolatility([{ timestamp: 1000, price: 100 }], 'UNKNOWN')).toBe(0.60);

    const now = Date.now();
    // filtered windowPrices < 4
    const oldPrices = [
      { timestamp: now - 1000000, price: 100 },
      { timestamp: now - 800000, price: 101 },
      { timestamp: now - 500, price: 102 },
      { timestamp: now, price: 103 },
    ];
    expect(calculateRealizedVolatility(oldPrices, 'BTC/USD', 300)).toBe(0.52);


    // logReturns < 3 (e.g. invalid <= 0 prices or same timestamps)
    const invalidPrices = [
      { timestamp: now - 2000, price: 0 },
      { timestamp: now - 1500, price: 100 },
      { timestamp: now - 1000, price: 0 },
      { timestamp: now - 500, price: 100 },
      { timestamp: now, price: 100 },
    ];
    expect(calculateRealizedVolatility(invalidPrices, 'BTC/USD', 300)).toBe(0.52);
  });

  it('covers calculateEdge and calculateEdgeProportionalLots branches', () => {
    // Empty orderbook
    const emptyEdge = calculateEdge(0.5, 0, 0);
    expect(emptyEdge.edgePercentage).toBe(0);
    expect(emptyEdge.actionRecommendation).toBe('NONE');

    // Only bestBid > 0
    const bidOnlyEdge = calculateEdge(0.6, 0.5, 0, 0.03);
    expect(bidOnlyEdge.impliedProbYes).toBe(0.5);

    // Only bestAsk > 0
    const askOnlyEdge = calculateEdge(0.4, 0, 0.55, 0.03);
    expect(askOnlyEdge.impliedProbYes).toBe(0.55);

    // BUY_NO recommendation (overpriced YES)
    const overEdge = calculateEdge(0.40, 0.55, 0.60, 0.03);
    expect(overEdge.hasAnomaly).toBe(true);
    expect(overEdge.actionRecommendation).toBe('BUY_NO');

    // calculateVolatilityNormalizedDriftThreshold bounds
    expect(calculateVolatilityNormalizedDriftThreshold(0.01, 2.5, 60, 0.0010, 0.0080)).toBe(0.0010);
    expect(calculateVolatilityNormalizedDriftThreshold(5.0, 10.0, 600, 0.0010, 0.0080)).toBe(0.0080);

    // calculateEdgeProportionalLots invalid bounds
    expect(calculateEdgeProportionalLots(0, 0.05, 0.02, 100, 0.5)).toBe(0);
    expect(calculateEdgeProportionalLots(10, 0.05, 0.02, 100, 0)).toBe(0);
    // maxTradeSizeUsd <= 0 fallback to targetLots
    const noCapLots = calculateEdgeProportionalLots(10, 0.08, 0.02, 0, 0.5);
    expect(noCapLots).toBeGreaterThan(10);
  });
});



