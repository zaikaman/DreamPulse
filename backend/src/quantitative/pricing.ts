import { calculateBinaryYesProbability, calculateZScore } from './cdf.js';
import { quantizeLotSize } from './quantizer.js';

export const DEFAULT_ANNUAL_VOLATILITY: Record<string, number> = {
  'BTC/USD': 0.52,
  'ETH/USD': 0.68,
  'SOL/USD': 0.85,
  'BNB/USD': 0.65,
  'DOGE/USD': 0.95,
  DEFAULT: 0.60,
};

export const MIN_ANNUAL_VOLATILITY: Record<string, number> = {
  'BTC/USD': 0.35,
  'ETH/USD': 0.45,
  'SOL/USD': 0.55,
  'BNB/USD': 0.45,
  'DOGE/USD': 0.60,
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

  const avgDtSeconds = timeDeltas.reduce((sum, dt) => sum + dt, 0) / timeDeltas.length;
  if (avgDtSeconds <= 0) return fallback;

  // Compute EWMA variance with reverse exponential weighting
  let weightedVariance = 0;
  let weightSum = 0;
  let currentWeight = 1.0;

  for (let i = logReturns.length - 1; i >= 0; i--) {
    const r = logReturns[i];
    weightedVariance += currentWeight * Math.pow(r, 2);
    weightSum += currentWeight;
    currentWeight *= lambda;
  }

  const ewmaVariance = weightSum > 0 ? weightedVariance / weightSum : 0;
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
  // Momentum sigmoid: transforms percentage drift into a probability modifier [0, 1]
  const momentumSignal = 1 / (1 + Math.exp(-(spotDrift1m * 250 + spotDrift5m * 150)));

  // Depth imbalance modifier in [0.35, 0.65]
  const depthSignal = 0.5 + Math.max(-1, Math.min(1, orderBookSkew)) * 0.15;

  // Multi-factor blend: 60% BSM Model + 28% Spot Momentum + 12% Depth Imbalance
  const blended = 0.60 * bsmProbYes + 0.28 * momentumSignal + 0.12 * depthSignal;

  return Number(Math.min(0.99, Math.max(0.01, blended)).toFixed(4));
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

