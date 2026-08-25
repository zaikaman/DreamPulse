import { calculateBinaryYesProbability, calculateZScore } from './cdf.js';

export const DEFAULT_ANNUAL_VOLATILITY: Record<string, number> = {
  'BTC/USD': 0.52,
  'ETH/USD': 0.68,
  'SOL/USD': 0.85,
  DEFAULT: 0.60,
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

export interface FairValueResult {
  fairValueYes: number;
  fairValueNo: number;
  zScore: number;
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
): FairValueResult {
  const vol = customVolatility ?? DEFAULT_ANNUAL_VOLATILITY[symbol] ?? DEFAULT_ANNUAL_VOLATILITY.DEFAULT;
  const timeYears = secondsToYears(Math.max(1, timeRemainingSeconds));

  const z = calculateZScore(spot, strike, vol, timeYears);
  const fairYes = calculateBinaryYesProbability(spot, strike, vol, timeYears);
  const fairNo = Number((1.0 - fairYes).toFixed(4));

  return {
    fairValueYes: Number(fairYes.toFixed(4)),
    fairValueNo: fairNo,
    zScore: Number(z.toFixed(4)),
    timeRemainingSeconds: Math.max(0, Math.floor(timeRemainingSeconds)),
  };
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
