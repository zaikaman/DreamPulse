import { calculateBinaryYesProbability, calculateZScore } from './cdf.js';
import { quantizeLotSize } from './quantizer.js';

export const DEFAULT_ANNUAL_VOLATILITY: Record<string, number> = {
  'BTC/USD': 0.52,
  'ETH/USD': 0.68,
  DEFAULT: 0.60,
};

export const MIN_ANNUAL_VOLATILITY: Record<string, number> = {
  'BTC/USD': 0.35,
  'ETH/USD': 0.45,
  DEFAULT: 0.30,
};

const SECONDS_PER_YEAR = 365.25 * 24 * 3600;

/**
 * Converts duration in seconds to fractional years for Black-Scholes formulas.
 */
export function secondsToYears(seconds: number): number {
  return Math.max(0, seconds) / SECONDS_PER_YEAR;
}

/**
 * Parses window duration string ("5m", "15m", "1h") to total seconds.
 */
export function parseWindowToSeconds(window: string): number {
  switch (window.toLowerCase()) {
    case '1m':
    case '60s':
      return 60;
    case '5m':
      return 300;
    case '15m':
      return 900;
    case '1h':
      return 3600;
    case '4h':
      return 14400;
    case '24h':
    case '1d':
      return 86400;
    case '7d':
      return 604800;
    default:
      return 300;
  }
}

/**
 * Calculates percentage spot price drift: (Current - Reference) / Reference.
 */
export function calculateSpotDrift(currentSpot: number, referenceSpot: number): number {
  if (referenceSpot <= 0) return 0;
  return (currentSpot - referenceSpot) / referenceSpot;
}

/**
 * Calculates rolling annualized realized volatility from high-frequency tick/price history.
 * Uses sample variance of log returns scaled to annual fractional factor.
 * 
 * @param priceHistory Historical timestamp and price observations
 * @param symbol Fallback asset symbol for baseline prior
 * @param windowSeconds Window length in seconds (defaults to 300s / 5m)
 * @returns Annualized volatility bounded between asset min floor and 250%
 */
export function calculateRealizedVolatility(
  priceHistory?: Array<{ timestamp: number; price: number }>,
  symbol: string = 'BTC/USD',
  windowSeconds: number = 300,
): number {
  const fallback = DEFAULT_ANNUAL_VOLATILITY[symbol] ?? DEFAULT_ANNUAL_VOLATILITY.DEFAULT;
  const minFloor = MIN_ANNUAL_VOLATILITY[symbol] ?? MIN_ANNUAL_VOLATILITY.DEFAULT;
  if (!priceHistory || priceHistory.length < 5) {
    return fallback;
  }

  const now = priceHistory[priceHistory.length - 1].timestamp;
  const cutoff = now - windowSeconds * 1000;
  const windowPrices = priceHistory.filter((p) => p.timestamp >= cutoff && p.price > 0);

  if (windowPrices.length < 4) {
    return fallback;
  }

  // Calculate log returns between consecutive observations
  const logReturns: number[] = [];
  const timeDeltas: number[] = [];
  for (let i = 1; i < windowPrices.length; i++) {
    const pPrev = windowPrices[i - 1].price;
    const pCurr = windowPrices[i].price;
    const dt = (windowPrices[i].timestamp - windowPrices[i - 1].timestamp) / 1000; // in seconds
    if (pPrev > 0 && pCurr > 0 && dt > 0) {
      logReturns.push(Math.log(pCurr / pPrev));
      timeDeltas.push(dt);
    }
  }

  if (logReturns.length < 3) {
    return fallback;
  }

  // Mean return
  const mean = logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;

  // Total elapsed time in window
  const totalDtSeconds = timeDeltas.reduce((sum, dt) => sum + dt, 0);
  if (totalDtSeconds <= 0) return fallback;

  // Sample variance of log returns
  const variance = logReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (logReturns.length - 1);
  const avgDtSeconds = totalDtSeconds / logReturns.length;

  // Annualize variance: Var_annual = (Var_dt / avgDt) * SECONDS_PER_YEAR
  const annualizedVariance = (variance / avgDtSeconds) * SECONDS_PER_YEAR;
  const rawVol = Math.sqrt(Math.max(0, annualizedVariance));

  // Blend with baseline prior based on sample size confidence (Bayesian shrinkage)
  // Requires ~60 ticks in window to reach 100% confidence, preventing rapid collapse on quiet 5m ticks
  const confidenceWeight = Math.min(1.0, logReturns.length / 60);
  const blendedVol = confidenceWeight * rawVol + (1 - confidenceWeight) * fallback;

  // Clamp to realistic asset boundaries [minFloor, 250%]
  return Number(Math.min(2.50, Math.max(minFloor, blendedVol)).toFixed(4));
}

/**
 * Calculates exponentially weighted moving average (EWMA) realized volatility from tick history.
 * Standard RiskMetrics decay factor lambda = 0.94 provides smooth, responsive volatility estimates.
 */
export function calculateEWMARealizedVolatility(
  priceHistory?: Array<{ timestamp: number; price: number }>,
  symbol: string = 'BTC/USD',
  lambda: number = 0.94,
  windowSeconds: number = 300,
): number {
  const fallback = DEFAULT_ANNUAL_VOLATILITY[symbol] ?? DEFAULT_ANNUAL_VOLATILITY.DEFAULT;
  const minFloor = MIN_ANNUAL_VOLATILITY[symbol] ?? MIN_ANNUAL_VOLATILITY.DEFAULT;
  if (!priceHistory || priceHistory.length < 5) {
    return fallback;
  }

  const now = priceHistory[priceHistory.length - 1].timestamp;
  const cutoff = now - windowSeconds * 1000;
  const windowPrices = priceHistory.filter((p) => p.timestamp >= cutoff && p.price > 0);

  if (windowPrices.length < 4) {
    return fallback;
  }

  const logReturns: number[] = [];
  const timeDeltas: number[] = [];
  for (let i = 1; i < windowPrices.length; i++) {
    const pPrev = windowPrices[i - 1].price;
    const pCurr = windowPrices[i].price;
    const dt = (windowPrices[i].timestamp - windowPrices[i - 1].timestamp) / 1000;
    if (pPrev > 0 && pCurr > 0 && dt > 0) {
      logReturns.push(Math.log(pCurr / pPrev));
      timeDeltas.push(dt);
    }
  }

  if (logReturns.length < 3) {
    return fallback;
  }

  // Compute EWMA weighted return and weighted time delta
  let weightedReturn = 0;
  let weightedDt = 0;
  let weightSum = 0;
  let currentWeight = 1.0;

  for (let i = logReturns.length - 1; i >= 0; i--) {
    const r = logReturns[i];
    const dt = timeDeltas[i];
    weightedReturn += currentWeight * r;
    weightedDt += currentWeight * dt;
    weightSum += currentWeight;
    currentWeight *= lambda;
  }

  if (weightSum <= 0) return fallback;

  const ewmaMean = weightedReturn / weightSum;
  const avgDtSeconds = weightedDt / weightSum;
  if (avgDtSeconds <= 0) return fallback;

  // Compute EWMA variance with de-meaned returns normalized by total weight
  let weightedVariance = 0;
  currentWeight = 1.0;
  for (let i = logReturns.length - 1; i >= 0; i--) {
    const r = logReturns[i];
    weightedVariance += currentWeight * Math.pow(r - ewmaMean, 2);
    currentWeight *= lambda;
  }

  const ewmaVariance = weightedVariance / weightSum;
  const annualizedVariance = (ewmaVariance / avgDtSeconds) * SECONDS_PER_YEAR;
  const rawVol = Math.sqrt(Math.max(0, annualizedVariance));

  // Bayesian prior blending with asset baseline (60-sample horizon for stable confidence)
  const sampleConfidence = Math.min(1.0, logReturns.length / 60);
  const blendedVol = sampleConfidence * rawVol + (1.0 - sampleConfidence) * fallback;

  return Number(Math.min(2.50, Math.max(minFloor, blendedVol)).toFixed(4));
}

export interface DepthVWAPResult {
  vwapPrice: number;
  topPrice: number;
  availableLots: number;
  filledLots: number;
  fullyFilled: boolean;
  slippageVsTop: number;
  effectiveTotalCost: number;
}

/**
 * Walks the order book depth ladder to calculate the volume-weighted average price (VWAP)
 * and assess market impact / liquidity depth for a requested lot size.
 */
export function calculateDepthVWAP(
  levels: Array<{ price: number; quantity: number }> | undefined,
  requestedLots: number,
): DepthVWAPResult {
  if (!levels || levels.length === 0 || requestedLots <= 0) {
    return {
      vwapPrice: 0,
      topPrice: 0,
      availableLots: 0,
      filledLots: 0,
      fullyFilled: false,
      slippageVsTop: 0,
      effectiveTotalCost: 0,
    };
  }

  const topPrice = levels[0].price;
  let remainingLots = requestedLots;
  let totalCost = 0;
  let filledLots = 0;
  let totalAvailable = 0;

  for (const level of levels) {
    totalAvailable += level.quantity;
    if (remainingLots > 0 && level.quantity > 0) {
      const takeQty = Math.min(remainingLots, level.quantity);
      totalCost += takeQty * level.price;
      filledLots += takeQty;
      remainingLots -= takeQty;
    }
  }

  const vwapPrice = filledLots > 0 ? Number((totalCost / filledLots).toFixed(4)) : topPrice;
  const slippageVsTop = topPrice > 0 ? Number((Math.abs(vwapPrice - topPrice) / topPrice).toFixed(4)) : 0;

  return {
    vwapPrice,
    topPrice,
    availableLots: totalAvailable,
    filledLots,
    fullyFilled: remainingLots <= 0.0001,
    slippageVsTop,
    effectiveTotalCost: Number(totalCost.toFixed(4)),
  };
}

/**
 * Calculates net executable edge after accounting for exchange taker fees and gas friction.
 */
export function calculateNetExecutableEdge(
  fairValue: number,
  executionPrice: number,
  takerFeeRate: number = 0.003, // 0.30% taker fee
  gasHurdle: number = 0.004,    // 0.40% equivalent gas hurdle
): number {
  if (executionPrice <= 0 || fairValue <= 0) return -1;
  const rawEdge = fairValue - executionPrice;
  const totalCostFriction = executionPrice * takerFeeRate + gasHurdle;
  return Number((rawEdge - totalCostFriction).toFixed(4));
}

/**
 * Calculates ROI-on-risk edge: netEdge / executionPrice.
 * Ensures the trade provides sufficient percentage return relative to capital risked.
 */
export function calculateRoiEdge(netEdge: number, executionPrice: number): number {
  if (executionPrice <= 0) return 0;
  return Number((netEdge / executionPrice).toFixed(4));
}

export interface FairValueResult {
  fairValueYes: number;
  fairValueNo: number;
  zScore: number;
  volatilityUsed: number;
  timeRemainingSeconds: number;
}

/**
 * Calculates fair theoretical value for binary YES and NO event contracts.
 */
export function calculateFairValue(
  spot: number,
  strike: number,
  timeRemainingSeconds: number,
  symbol: string = 'BTC/USD',
  customVolatility?: number,
  priceHistory?: Array<{ timestamp: number; price: number }>,
): FairValueResult {
  let vol: number;
  if (customVolatility !== undefined && customVolatility > 0) {
    vol = customVolatility;
  } else if (priceHistory && priceHistory.length >= 5) {
    vol = calculateEWMARealizedVolatility(priceHistory, symbol);
  } else {
    vol = DEFAULT_ANNUAL_VOLATILITY[symbol] ?? DEFAULT_ANNUAL_VOLATILITY.DEFAULT;
  }
  const timeYears = secondsToYears(Math.max(1, timeRemainingSeconds));

  const z = calculateZScore(spot, strike, vol, timeYears);
  const fairYes = calculateBinaryYesProbability(spot, strike, vol, timeYears);
  const fairNo = Number((1.0 - fairYes).toFixed(4));

  return {
    fairValueYes: Number(fairYes.toFixed(4)),
    fairValueNo: fairNo,
    zScore: Number(z.toFixed(4)),
    volatilityUsed: Number(vol.toFixed(4)),
    timeRemainingSeconds: Math.max(0, Math.floor(timeRemainingSeconds)),
  };
}

/**
 * Price action analysis metrics derived from high-frequency tick history.
 */
export interface PriceActionMetrics {
  trend: 'BULLISH_EXPANSION' | 'BULLISH' | 'RANGE_BOUND' | 'BEARISH' | 'BEARISH_BREAKDOWN';
  trendScore: number; // Normalized in [-1.0, 1.0] (bearish -> bullish)
  velocity: number; // Price velocity per second (in USD)
  emaFast: number; // 9-sample Exponential Moving Average
  emaSlow: number; // 21-sample Exponential Moving Average
  rsiShort: number; // 7-period fast Relative Strength Index [0, 100]
  change1m: number;
  change5m: number;
  isPlunging: boolean; // Aggressive downward momentum
  isSurging: boolean; // Aggressive upward breakout momentum
}

function findLastItem<T>(arr: T[], predicate: (item: T) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return arr[i];
  }
  return undefined;
}

/**
 * Calculates high-frequency technical price action indicators from rolling price observations.
 */
export function calculatePriceActionMetrics(
  priceHistory?: Array<{ timestamp: number; price: number }>,
  currentSpot: number = 0,
): PriceActionMetrics {
  if (!priceHistory || priceHistory.length < 3) {
    return {
      trend: 'RANGE_BOUND',
      trendScore: 0,
      velocity: 0,
      emaFast: currentSpot,
      emaSlow: currentSpot,
      rsiShort: 50,
      change1m: 0,
      change5m: 0,
      isPlunging: false,
      isSurging: false,
    };
  }

  const prices = priceHistory.map((p) => p.price);
  const now = priceHistory[priceHistory.length - 1].timestamp;

  // 1. Calculate Fast (k=9) and Slow (k=21) Exponential Moving Averages
  const kFast = 2 / (Math.min(9, prices.length) + 1);
  const kSlow = 2 / (Math.min(21, prices.length) + 1);

  let emaFast = prices[0];
  let emaSlow = prices[0];
  for (let i = 1; i < prices.length; i++) {
    emaFast = prices[i] * kFast + emaFast * (1 - kFast);
    emaSlow = prices[i] * kSlow + emaSlow * (1 - kSlow);
  }

  // 2. Multi-timeframe deltas (1m and 5m)
  const cutoff1m = now - 60000;
  const cutoff5m = now - 300000;
  const p1m = findLastItem(priceHistory, (p) => p.timestamp <= cutoff1m)?.price
    || priceHistory.find((p) => p.timestamp >= cutoff1m)?.price
    || prices[0];
  const p5m = findLastItem(priceHistory, (p) => p.timestamp <= cutoff5m)?.price
    || priceHistory.find((p) => p.timestamp >= cutoff5m)?.price
    || prices[0];
  const change1m = p1m > 0 ? (currentSpot - p1m) / p1m : 0;
  const change5m = p5m > 0 ? (currentSpot - p5m) / p5m : 0;

  // 3. Fast RSI (7 periods)
  const rsiWindow = Math.min(8, prices.length);
  let gainSum = 0;
  let lossSum = 0;
  for (let i = prices.length - rsiWindow + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }
  const avgGain = gainSum / Math.max(1, rsiWindow - 1);
  const avgLoss = lossSum / Math.max(1, rsiWindow - 1);
  const rs = avgLoss > 0 ? avgGain / avgLoss : avgGain > 0 ? 10 : 1;
  const rsiShort = Number((100 - (100 / (1 + rs))).toFixed(1));

  // 4. Instantaneous Velocity (USD/sec over last 15 seconds)
  const cutoff15s = now - 15000;
  const p15sObj = findLastItem(priceHistory, (p) => p.timestamp <= cutoff15s)
    || priceHistory.find((p) => p.timestamp >= cutoff15s);
  const p15s = p15sObj?.price || prices[Math.max(0, prices.length - 4)];
  const dtSeconds = Math.max(1, (now - (p15sObj?.timestamp || (now - 15000))) / 1000);
  const velocity = Number(((currentSpot - p15s) / dtSeconds).toFixed(4));

  // 5. Composite Trend Score in [-1.0, 1.0]
  // Combines EMA spread, 1m/5m return momentum, and RSI deviation
  const emaSpreadPct = currentSpot > 0 ? (emaFast - emaSlow) / currentSpot : 0;
  const rawScore = (
    emaSpreadPct * 400 +
    change1m * 120 +
    change5m * 60 +
    ((rsiShort - 50) / 50) * 0.35
  );
  const trendScore = Number(Math.max(-1.0, Math.min(1.0, rawScore)).toFixed(3));

  // 6. Plunge / Surge detection:
  // Plunge: rapid downward momentum (> -0.15% in 1m OR fast negative velocity with RSI < 32)
  const isPlunging = change1m < -0.0015 || (change1m < -0.0008 && velocity < 0 && rsiShort < 35);
  // Surge: rapid upward momentum (> +0.15% in 1m OR fast positive velocity with RSI > 68)
  const isSurging = change1m > 0.0015 || (change1m > 0.0008 && velocity > 0 && rsiShort > 65);

  let trend: 'BULLISH_EXPANSION' | 'BULLISH' | 'RANGE_BOUND' | 'BEARISH' | 'BEARISH_BREAKDOWN';
  if (isSurging || trendScore > 0.55) {
    trend = 'BULLISH_EXPANSION';
  } else if (trendScore > 0.15) {
    trend = 'BULLISH';
  } else if (isPlunging || trendScore < -0.55) {
    trend = 'BEARISH_BREAKDOWN';
  } else if (trendScore < -0.15) {
    trend = 'BEARISH';
  } else {
    trend = 'RANGE_BOUND';
  }

  return {
    trend,
    trendScore,
    velocity,
    emaFast: Number(emaFast.toFixed(2)),
    emaSlow: Number(emaSlow.toFixed(2)),
    rsiShort,
    change1m: Number(change1m.toFixed(5)),
    change5m: Number(change5m.toFixed(5)),
    isPlunging,
    isSurging,
  };
}

/**
 * Institutional Multi-Factor Confluence Analysis Result.
 */
export interface MultiFactorConfluenceResult {
  confluenceProbYes: number;
  fairValueYes: number;
  impliedProbYes: number;
  edgePercentage: number;
  signedEdgeLabel: string;
  convictionState: 'HIGH_CONVICTION' | 'MODERATE' | 'CAUTION_COUNTER_TREND' | 'NEUTRAL';
  recommendedAction: 'BUY_UP' | 'BUY_DOWN' | 'WAIT';
  recommendedOutcome: 'YES' | 'NO' | 'NONE';
  winProbability: number; // 0 to 100
  confidenceScore: number; // 0 to 100
  priceAction: PriceActionMetrics;
  strikeRunwayZ: number; // Z-score buffer from strike
  isCounterTrendConflict: boolean;
  rationale: string;
}

/**
 * Evaluates full multi-factor confluence combining:
 * 1. Mathematical theoretical fair value (BSM)
 * 2. High-frequency price action and momentum (EMA, drift, velocity, RSI)
 * 3. Strike proximity & trajectory runway (Z-score distance vs remaining time)
 * 4. Order book depth skew
 *
 * Enforces Counter-Trend Safeguards and suppresses false signals when price action conflicts with edge.
 */
export function evaluateMultiFactorConfluence(
  spot: number,
  strike: number,
  timeLeftSeconds: number,
  symbol: string = 'BTC/USD',
  bestBidYes: number = 0.50,
  bestAskYes: number = 0.50,
  priceHistory?: Array<{ timestamp: number; price: number }>,
  orderBookSkew: number = 0,
  previousFair?: number,
): MultiFactorConfluenceResult {
  // 1. Calculate Base BSM Fair Value
  const bsm = calculateFairValue(spot, strike, timeLeftSeconds, symbol, undefined, priceHistory);
  const rawBsmFairYes = bsm.fairValueYes;

  // 2. Calculate Price Action Metrics
  const pa = calculatePriceActionMetrics(priceHistory, spot);

  // 3. Strike Proximity & Expected Move Runway
  const vol = bsm.volatilityUsed || 0.60;
  const timeYears = secondsToYears(Math.max(1, timeLeftSeconds));
  const expectedMove = strike * vol * Math.sqrt(Math.max(0.00001, timeYears));
  const spotDiff = spot - strike;
  const strikeRunwayZ = expectedMove > 0 ? Number((spotDiff / expectedMove).toFixed(3)) : 0;

  // 4. Calculate Stabilized Confluence Probability
  const clampedProb = Math.min(0.999, Math.max(0.001, rawBsmFairYes));
  const baseLogit = Math.log(clampedProb / (1.0 - clampedProb));

  // Multi-factor momentum weighting (incorporating trend score and velocity)
  const momentumAdjustment = Math.max(-0.90, Math.min(0.90,
    pa.trendScore * 0.45 +
    pa.change1m * 70 +
    pa.change5m * 35 +
    Math.max(-1, Math.min(1, orderBookSkew)) * 0.15
  ));

  const totalLogit = baseLogit + momentumAdjustment;
  const rawConfluenceProb = 1.0 / (1.0 + Math.exp(-Math.max(-8, Math.min(8, totalLogit))));

  // Adaptive smoothing to eliminate high-frequency micro-jitter
  const prevProb = previousFair !== undefined && previousFair > 0 ? previousFair : rawConfluenceProb;
  const smoothedProb = Number((0.20 * rawConfluenceProb + 0.80 * prevProb).toFixed(4));

  // 5. Order Book Midpoint & Edge Dislocation
  let midYes = 0.50;
  if (bestBidYes > 0 && bestAskYes > 0) {
    midYes = Number(((bestBidYes + bestAskYes) / 2).toFixed(4));
  } else if (bestAskYes > 0) {
    midYes = bestAskYes;
  } else if (bestBidYes > 0) {
    midYes = bestBidYes;
  }

  const rawEdge = Number((smoothedProb - midYes).toFixed(4));
  // Apply a small deadband (0.5%) to stabilize edge transitions
  const stabilizedEdge = Math.abs(rawEdge) < 0.005 ? 0 : rawEdge;

  // 6. Confluence & Counter-Trend Alignment Engine
  const EDGE_THRESHOLD = 0.015; // 1.5% edge hurdle
  const isYesEdge = stabilizedEdge >= EDGE_THRESHOLD;
  const isNoEdge = stabilizedEdge <= -EDGE_THRESHOLD;

  // Check for Counter-Trend Conflict:
  // Conflict A: YES Edge / Above Strike, but price action is plunging or bearish breakdown
  const isBullishEdgeConflict = (isYesEdge || smoothedProb >= 0.55) && (pa.isPlunging || pa.trendScore <= -0.30);
  // Conflict B: NO Edge / Below Strike, but price action is surging or bullish breakout
  const isBearishEdgeConflict = (isNoEdge || smoothedProb <= 0.45) && (pa.isSurging || pa.trendScore >= 0.30);

  const isCounterTrendConflict = isBullishEdgeConflict || isBearishEdgeConflict;

  let convictionState: 'HIGH_CONVICTION' | 'MODERATE' | 'CAUTION_COUNTER_TREND' | 'NEUTRAL';
  let recommendedAction: 'BUY_UP' | 'BUY_DOWN' | 'WAIT';
  let recommendedOutcome: 'YES' | 'NO' | 'NONE';
  let winProbability: number;
  let confidenceScore: number;

  const pctDiff = strike > 0 ? ((spotDiff / strike) * 100).toFixed(2) : '0.00';
  const spotDiffStr = spotDiff >= 0
    ? `+$${spotDiff < 1 ? spotDiff.toFixed(4) : spotDiff.toFixed(2)} (+${pctDiff}%) above strike`
    : `-$${Math.abs(spotDiff) < 1 ? Math.abs(spotDiff).toFixed(4) : Math.abs(spotDiff).toFixed(2)} (${pctDiff}%) below strike`;

  let rationale = '';

  if (isCounterTrendConflict) {
    convictionState = 'CAUTION_COUNTER_TREND';
    recommendedAction = 'WAIT';
    recommendedOutcome = 'NONE';
    confidenceScore = 40;
    winProbability = 50;

    if (isBullishEdgeConflict) {
      rationale = `Caution: Counter-trend divergence. Spot is ${spotDiffStr}, but aggressive downward momentum (${(pa.change1m * 100).toFixed(2)}% 1m, ${pa.trend.replace('_', ' ')}) threatens the strike. AI Copilot advises WAITING for price stabilization before buying UP.`;
    } else {
      rationale = `Caution: Counter-trend divergence. Spot is ${spotDiffStr}, but aggressive upward momentum (+${(pa.change1m * 100).toFixed(2)}% 1m, ${pa.trend.replace('_', ' ')}) is breaking out. AI Copilot advises WAITING for price stabilization before buying DOWN.`;
    }
  } else if (isYesEdge && smoothedProb >= 0.50 && pa.trendScore >= -0.05) {
    // Aligned Bullish Setup
    const isHighConviction = stabilizedEdge >= 0.020 && (pa.trendScore >= 0.15 || spotDiff > 0);
    convictionState = isHighConviction ? 'HIGH_CONVICTION' : 'MODERATE';
    recommendedAction = 'BUY_UP';
    recommendedOutcome = 'YES';
    confidenceScore = Math.min(96, Math.round(65 + Math.abs(stabilizedEdge) * 120 + Math.max(0, pa.trendScore) * 15));
    winProbability = Math.min(96, Math.max(50, Math.round(smoothedProb * 100)));
    const edgeLabel = `+${(stabilizedEdge * 100).toFixed(1)}% YES Alpha`;

    rationale = `High Conviction UP: Spot is ${spotDiffStr} with ${pa.trend.replace('_', ' ')} price action (${pa.change1m >= 0 ? '+' : ''}${(pa.change1m * 100).toFixed(2)}% 1m). Confluence fair ${(smoothedProb * 100).toFixed(1)}% vs CLOB ${(midYes * 100).toFixed(1)}% gives ${edgeLabel} with ${winProbability}% estimated win probability.`;
  } else if (isNoEdge && smoothedProb <= 0.50 && pa.trendScore <= 0.05) {
    // Aligned Bearish Setup
    const isHighConviction = stabilizedEdge <= -0.020 && (pa.trendScore <= -0.15 || spotDiff < 0);
    convictionState = isHighConviction ? 'HIGH_CONVICTION' : 'MODERATE';
    recommendedAction = 'BUY_DOWN';
    recommendedOutcome = 'NO';
    confidenceScore = Math.min(96, Math.round(65 + Math.abs(stabilizedEdge) * 120 + Math.abs(Math.min(0, pa.trendScore)) * 15));
    winProbability = Math.min(96, Math.max(50, Math.round((1 - smoothedProb) * 100)));
    const edgeLabel = `+${(Math.abs(stabilizedEdge) * 100).toFixed(1)}% NO Alpha`;

    rationale = `High Conviction DOWN: Spot is ${spotDiffStr} with ${pa.trend.replace('_', ' ')} price action (${(pa.change1m * 100).toFixed(2)}% 1m). Confluence fair ${(smoothedProb * 100).toFixed(1)}% vs CLOB ${(midYes * 100).toFixed(1)}% gives ${edgeLabel} with ${winProbability}% estimated win probability.`;
  } else if ((isYesEdge && smoothedProb < 0.50) || (isNoEdge && smoothedProb > 0.50)) {
    // Out-of-the-Money Dislocation: Suppress low-probability speculative execution to protect capital
    convictionState = 'NEUTRAL';
    recommendedAction = 'WAIT';
    recommendedOutcome = 'NONE';
    confidenceScore = 50;
    winProbability = Math.round(Math.max(smoothedProb, 1 - smoothedProb) * 100);
    const edgeLabel = `${stabilizedEdge >= 0 ? '+' : ''}${(stabilizedEdge * 100).toFixed(1)}%`;
    rationale = `Observing: OTM mathematical dislocation detected (${edgeLabel} Alpha vs CLOB, Fair ${(smoothedProb * 100).toFixed(1)}%), but spot is ${spotDiffStr}. Swarm suppresses low-probability OTM speculation to preserve capital.`;
  } else {
    // Neutral / Fairly Priced / Ranging
    convictionState = 'NEUTRAL';
    recommendedAction = 'WAIT';
    recommendedOutcome = 'NONE';
    confidenceScore = 50;
    winProbability = Math.round(Math.max(smoothedProb, 1 - smoothedProb) * 100);
    const signedEdge = `${stabilizedEdge >= 0 ? '+' : ''}${(stabilizedEdge * 100).toFixed(1)}%`;

    rationale = `Observing: Market is balanced near strike (${spotDiffStr}). Price action is ${pa.trend.replace('_', ' ')} with minimal edge (${signedEdge} Alpha vs CLOB). Waiting for a high-conviction breakout or mispricing setup.`;
  }

  const signedEdgeLabel = `${stabilizedEdge >= 0 ? '+' : ''}${(stabilizedEdge * 100).toFixed(1)}%`;

  return {
    confluenceProbYes: smoothedProb,
    fairValueYes: smoothedProb,
    impliedProbYes: midYes,
    edgePercentage: stabilizedEdge,
    signedEdgeLabel,
    convictionState,
    recommendedAction,
    recommendedOutcome,
    winProbability,
    confidenceScore,
    priceAction: pa,
    strikeRunwayZ,
    isCounterTrendConflict,
    rationale,
  };
}

/**
 * Calculates a stabilized, multi-factor confluence probability for binary event contracts.
 * Blends Black-Scholes theoretical value with short-term drift momentum and depth skew,
 * eliminating single-tick pin-risk flip-flopping.
 *
 * @param bsmProbYes Theoretical BSM cumulative normal probability
 * @param spotDrift1m 1-minute percentage spot drift (e.g. +0.002 for +0.20%)
 * @param spotDrift5m 5-minute percentage spot drift
 * @param orderBookSkew Normalized order book depth skew in [-1, 1]
 */
export function calculateConfluenceProbability(
  bsmProbYes: number,
  spotDrift1m: number = 0,
  spotDrift5m: number = 0,
  orderBookSkew: number = 0,
): number {
  // Clamp input probability to safe domain for log-odds conversion
  const clampedProb = Math.min(0.999, Math.max(0.001, bsmProbYes));

  // Base logit (log-odds) from theoretical Black-Scholes probability
  const baseLogit = Math.log(clampedProb / (1.0 - clampedProb));

  // Clamp raw drift inputs to institutional bounds (max ±1.0%)
  const clampedDrift1m = Math.max(-0.010, Math.min(0.010, spotDrift1m));
  const clampedDrift5m = Math.max(-0.010, Math.min(0.010, spotDrift5m));

  // Dynamic momentum adjustment in log-odds space (capped to ±0.60 logit ≈ ±12% max probability shift around ATM)
  const rawMomentum = clampedDrift1m * 60 + clampedDrift5m * 40;
  const momentumAdjustment = Math.max(-0.60, Math.min(0.60, rawMomentum));

  // Depth imbalance modifier in log-odds space (normalized in [-1, 1], max ±0.20 logit)
  const depthAdjustment = Math.max(-1, Math.min(1, orderBookSkew)) * 0.20;

  // Combined log-odds
  const totalLogit = baseLogit + momentumAdjustment + depthAdjustment;

  // Sigmoid conversion back to probability domain [0.001, 0.999]
  const blended = 1.0 / (1.0 + Math.exp(-Math.max(-8, Math.min(8, totalLogit))));

  return Number(Math.min(0.999, Math.max(0.001, blended)).toFixed(4));
}

export interface EdgeEvaluation {
  impliedProbYes: number;
  fairValueYes: number;
  edgePercentage: number;
  hasAnomaly: boolean;
  actionRecommendation: 'BUY_YES' | 'BUY_NO' | 'NONE';
}

/**
 * Evaluates edge percentage between CLOB midpoint and mathematical theoretical fair value.
 * Anomaly threshold defaults to 3.0% (0.030).
 */
export function calculateEdge(
  fairValueYes: number,
  bestBidYes: number,
  bestAskYes: number,
  anomalyThreshold: number = 0.03,
): EdgeEvaluation {
  // If order book is empty or uninitialized
  if (bestBidYes <= 0 && bestAskYes <= 0) {
    return {
      impliedProbYes: fairValueYes,
      fairValueYes,
      edgePercentage: 0,
      hasAnomaly: false,
      actionRecommendation: 'NONE',
    };
  }

  // Calculate order book mid implied probability
  let midYes: number;
  if (bestBidYes > 0 && bestAskYes > 0) {
    midYes = (bestBidYes + bestAskYes) / 2.0;
  } else if (bestBidYes > 0) {
    midYes = bestBidYes;
  } else {
    midYes = bestAskYes;
  }

  midYes = Number(midYes.toFixed(4));
  const discrepancy = fairValueYes - midYes;
  const edgePct = Number(discrepancy.toFixed(4));
  const absEdge = Math.abs(edgePct);
  const hasAnomaly = absEdge >= anomalyThreshold;

  let action: 'BUY_YES' | 'BUY_NO' | 'NONE' = 'NONE';
  if (hasAnomaly) {
    if (discrepancy > 0 && bestAskYes > 0 && bestAskYes < fairValueYes) {
      // Underpriced YES in book -> buy YES
      action = 'BUY_YES';
    } else if (discrepancy < 0 && bestBidYes > 0 && (1.0 - bestBidYes) < (1.0 - fairValueYes)) {
      // Overpriced YES in book -> buy NO
      action = 'BUY_NO';
    }
  }

  return {
    impliedProbYes: midYes,
    fairValueYes,
    edgePercentage: edgePct,
    hasAnomaly,
    actionRecommendation: action,
  };
}

/**
 * Calculates a dynamic volatility-normalized drift threshold:
 * threshold = kSigma * sigma_annual * sqrt(intervalSeconds / SECONDS_PER_YEAR)
 * Clamped to safe institutional bounds [0.0010, 0.0080] (0.10% to 0.80%).
 */
export function calculateVolatilityNormalizedDriftThreshold(
  volatility: number,
  kSigma: number = 2.5,
  intervalSeconds: number = 60,
  minBound: number = 0.0010,
  maxBound: number = 0.0080,
): number {
  const safeVol = Math.max(0.10, Math.min(3.0, volatility));
  const dtFraction = Math.max(1, intervalSeconds) / SECONDS_PER_YEAR;
  const sigmaInterval = safeVol * Math.sqrt(dtFraction);
  const rawThreshold = kSigma * sigmaInterval;
  return Number(Math.max(minBound, Math.min(maxBound, rawThreshold)).toFixed(4));
}

/**
 * Calculates edge-proportional (Fractional Kelly) lot size allocation.
 * Scales base lots up on high-conviction mathematical edges and down on marginal edges,
 * strictly bounded by the risk capital limit (maxTradeSizeUsd).
 */
export function calculateEdgeProportionalLots(
  baseLots: number,
  netEdge: number,
  minEdge: number,
  maxTradeSizeUsd: number,
  executionPrice: number,
  lotStep: number = 1.0,
  minLotSize: number = 1.0,
): number {
  if (executionPrice <= 0 || baseLots <= 0) return 0;
  const safeMinEdge = Math.max(0.005, minEdge);

  // Edge scale ratio: 1.0 at minEdge, scales up to 2.5x at 3x minEdge, floors at 0.5x
  const edgeRatio = netEdge / safeMinEdge;
  const scaleMultiplier = Math.max(0.5, Math.min(2.5, 1.0 + (edgeRatio - 1.0) * 0.75));
  const targetLots = baseLots * scaleMultiplier;

  const maxAffordableLots = maxTradeSizeUsd > 0
    ? Math.floor(maxTradeSizeUsd / executionPrice)
    : targetLots;

  const finalLots = Math.max(minLotSize, Math.min(targetLots, maxAffordableLots));
  return quantizeLotSize(finalLots, lotStep, minLotSize);
}

