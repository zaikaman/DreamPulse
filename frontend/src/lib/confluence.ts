import type { Market } from '../types/index.js';
import type { MarketTickData } from '../services/telemetry-client.js';

export interface ConfluenceEvaluation {
  convictionState: 'HIGH_CONVICTION' | 'MODERATE' | 'CAUTION_COUNTER_TREND' | 'NEUTRAL';
  recommendedAction: 'BUY_UP' | 'BUY_DOWN' | 'WAIT';
  recommendedOutcome: 'YES' | 'NO' | 'NONE';
  winProbability: number;
  confidenceScore: number;
  fairValueYes: number;
  impliedProbYes: number;
  edgePercentage: number;
  signedEdgeLabel: string;
  priceActionTrend: 'BULLISH_EXPANSION' | 'BULLISH' | 'RANGE_BOUND' | 'BEARISH' | 'BEARISH_BREAKDOWN';
  priceActionLabel: string;
  priceActionScore: number;
  strikeRunwayZ: number;
  spotDiff: number;
  spotDiffPct: number;
  diffText: string;
  isCounterTrendConflict: boolean;
  isYesEdge: boolean;
  isNoEdge: boolean;
  rationale: string;
  badgeStyle: {
    bg: string;
    border: string;
    text: string;
    iconColor: string;
    glow: string;
    label: string;
  };
}

const SQRT_2 = Math.SQRT2;
const SECONDS_PER_YEAR = 365.25 * 24 * 3600;

export const DEFAULT_VOLATILITY: Record<string, number> = {
  'BTC/USD': 0.52,
  'ETH/USD': 0.68,
  DEFAULT: 0.60,
};

/**
 * High-precision Error Function erf(x) using Abramowitz & Stegun rational approximation (formula 7.1.26).
 */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const p = 0.3275911;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const t = 1.0 / (1.0 + p * absX);
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  const y = 1.0 - poly * Math.exp(-absX * absX);
  return sign * y;
}

/**
 * Standard Normal Cumulative Distribution Function Φ(z).
 */
export function normalCdf(z: number): number {
  if (z <= -8) return 0.00000001;
  if (z >= 8) return 0.99999999;
  return 0.5 * (1.0 + erf(z / SQRT_2));
}

/**
 * Computes fair theoretical Black-Scholes probability for binary YES contract outcome.
 */
export function calculateBinaryYesProbability(
  spot: number,
  strike: number,
  annualVolatility: number,
  timeToExpiryYears: number,
  riskFreeRate: number = 0.0,
): number {
  if (spot <= 0 || strike <= 0) return 0.50;
  if (timeToExpiryYears <= 0) return spot >= strike ? 0.9999 : 0.0001;

  // Short-horizon diffusion regularizer (45s floor) to prevent cliff degeneration
  const minHorizonYears = 45 / (365.25 * 86400);
  const effectiveTimeYears = Math.max(timeToExpiryYears, minHorizonYears);

  const volSqrtT = annualVolatility * Math.sqrt(effectiveTimeYears);
  const drift = (riskFreeRate - 0.5 * annualVolatility * annualVolatility) * effectiveTimeYears;
  const z = (Math.log(spot / strike) + drift) / volSqrtT;

  return Number(normalCdf(z).toFixed(4));
}

/**
 * Continuous regularized sigmoid probability centered on strike.
 */
export function getSigmoidFallbackProb(spot: number, strike: number): number {
  if (!strike || strike <= 0) return 0.50;
  const relOffset = (spot - strike) / (strike * 0.005);
  const sigmoid = 1 / (1 + Math.exp(-Math.max(-4, Math.min(4, relOffset * 2))));
  return Number(sigmoid.toFixed(4));
}

/**
 * Evaluates real-time confluence combining live telemetry, market state, and price action history.
 */
export function evaluateTradeConfluence(
  market: Market,
  liveTick?: MarketTickData,
  currentSpot?: number,
  priceHistory?: Array<{ timestamp?: number; time?: number; price: number }>,
  agentReasoningOverride?: string,
): ConfluenceEvaluation {
  const strike = market.strikePrice || 79613.4;
  const spot = currentSpot || liveTick?.spotPrice || market.strikePrice || 79664.46;
  const isSyntheticOrSeed = Boolean(market.isSynthetic || market.isSeedDepth);

  const spotDiff = spot - strike;
  const spotDiffPct = strike > 0 ? (spotDiff / strike) * 100 : 0;
  const pctDiffFormatted = Math.abs(spotDiffPct).toFixed(2);
  const diffText = spotDiff >= 0
    ? `+$${spotDiff < 1 ? spotDiff.toFixed(4) : spotDiff.toFixed(2)} (+${pctDiffFormatted}%) above strike`
    : `-$${Math.abs(spotDiff) < 1 ? Math.abs(spotDiff).toFixed(4) : Math.abs(spotDiff).toFixed(2)} (-${pctDiffFormatted}%) below strike`;

  // 1. Resolve or compute Price Action Metrics
  let trend: 'BULLISH_EXPANSION' | 'BULLISH' | 'RANGE_BOUND' | 'BEARISH' | 'BEARISH_BREAKDOWN' = 'RANGE_BOUND';
  let trendScore = 0;
  let change1m = 0;
  let isPlunging = false;
  let isSurging = false;

  if (priceHistory && priceHistory.length >= 3) {
    const lastItem = priceHistory[priceHistory.length - 1];
    const now = lastItem.timestamp || lastItem.time || Date.now();
    const cutoff1m = now - 60000;
    const p1m = priceHistory.find((p) => (p.timestamp || p.time || 0) >= cutoff1m)?.price || priceHistory[0].price;
    change1m = p1m > 0 ? (spot - p1m) / p1m : 0;

    const prices = priceHistory.map((p) => p.price);
    const kFast = 2 / (Math.min(9, prices.length) + 1);
    const kSlow = 2 / (Math.min(21, prices.length) + 1);
    let emaFast = prices[0];
    let emaSlow = prices[0];
    for (let i = 1; i < prices.length; i++) {
      emaFast = prices[i] * kFast + emaFast * (1 - kFast);
      emaSlow = prices[i] * kSlow + emaSlow * (1 - kSlow);
    }
    const emaSpreadPct = spot > 0 ? (emaFast - emaSlow) / spot : 0;
    trendScore = Number(Math.max(-1, Math.min(1, emaSpreadPct * 400 + change1m * 150)).toFixed(3));

    isPlunging = change1m < -0.0015;
    isSurging = change1m > 0.0015;

    if (isSurging || trendScore > 0.55) trend = 'BULLISH_EXPANSION';
    else if (trendScore > 0.15) trend = 'BULLISH';
    else if (isPlunging || trendScore < -0.55) trend = 'BEARISH_BREAKDOWN';
    else if (trendScore < -0.15) trend = 'BEARISH';
    else trend = 'RANGE_BOUND';
  } else if (liveTick?.priceActionTrend) {
    trend = liveTick.priceActionTrend as any;
    trendScore = liveTick.priceActionScore ?? 0;
    change1m = trendScore * 0.001;
    isPlunging = trend === 'BEARISH_BREAKDOWN' || trendScore < -0.50;
    isSurging = trend === 'BULLISH_EXPANSION' || trendScore > 0.50;
  } else {
    // Derive baseline price action from spot distance relative to strike
    if (spotDiffPct > 0.08) {
      trend = 'BULLISH';
      trendScore = Math.min(1, spotDiffPct * 3);
      change1m = (spotDiffPct / 100) * 0.5;
    } else if (spotDiffPct < -0.08) {
      trend = 'BEARISH';
      trendScore = Math.max(-1, spotDiffPct * 3);
      change1m = (spotDiffPct / 100) * 0.5;
      isPlunging = spotDiffPct < -0.15;
    }
  }

  // 2. Resolve Time Remaining and Volatility
  const now = Date.now();
  const closeTimeMs = market.closeTimestamp ? new Date(market.closeTimestamp).getTime() : (now + 300000);
  const timeLeftSeconds = liveTick?.timeLeftSeconds ?? Math.max(1, Math.floor((closeTimeMs - now) / 1000));
  const timeToExpiryYears = timeLeftSeconds / SECONDS_PER_YEAR;
  const vol = DEFAULT_VOLATILITY[market.symbol] ?? DEFAULT_VOLATILITY.DEFAULT;

  // 3. Compute Theoretical Dynamic Fair Value
  const bsmFairProb = calculateBinaryYesProbability(spot, strike, vol, timeToExpiryYears);
  const fairValueYes = isSyntheticOrSeed ? 0.50 : (liveTick?.fairValue && Math.abs(liveTick.spotPrice - spot) < 5 ? liveTick.fairValue : bsmFairProb);

  // 4. Resolve Order Book Implied Probability & Mathematical Edge
  let midYes = 0.50;
  if (market.bestBidYes > 0 && market.bestAskYes > 0) {
    midYes = Number(((market.bestBidYes + market.bestAskYes) / 2).toFixed(4));
  } else if (market.bestAskYes > 0) {
    midYes = market.bestAskYes;
  } else if (market.bestBidYes > 0) {
    midYes = market.bestBidYes;
  } else if (liveTick?.impliedProb !== undefined && liveTick.impliedProb > 0) {
    midYes = liveTick.impliedProb;
  } else {
    midYes = bsmFairProb;
  }

  const impliedProbYes = isSyntheticOrSeed ? 0.50 : midYes;
  const rawEdge = isSyntheticOrSeed ? 0 : Number((fairValueYes - impliedProbYes).toFixed(4));
  const edge = Math.abs(rawEdge) < 0.004 ? 0 : rawEdge;

  const isYesEdge = edge >= 0.015;
  const isNoEdge = edge <= -0.015;

  // 5. Counter-trend conflict detection
  // Conflict A: YES edge, but price is actively dumping towards or through strike
  const isBullishEdgeConflict = (isYesEdge || fairValueYes >= 0.55) && (isPlunging || trendScore <= -0.25);
  // Conflict B: NO edge, but price is surging upwards with breakout momentum
  const isBearishEdgeConflict = (isNoEdge || fairValueYes <= 0.45) && (isSurging || trendScore >= 0.25);
  const isCounterTrendConflict = isBullishEdgeConflict || isBearishEdgeConflict;

  // 6. Resolve Conviction & Recommendation
  let convictionState: 'HIGH_CONVICTION' | 'MODERATE' | 'CAUTION_COUNTER_TREND' | 'NEUTRAL';
  let recommendedAction: 'BUY_UP' | 'BUY_DOWN' | 'WAIT';
  let recommendedOutcome: 'YES' | 'NO' | 'NONE';
  let winProbability: number;
  let confidenceScore: number;
  let rationale: string;

  if (isSyntheticOrSeed) {
    convictionState = 'NEUTRAL';
    recommendedAction = 'WAIT';
    recommendedOutcome = 'NONE';
    winProbability = 50;
    confidenceScore = 50;
    rationale = `Market is synthetic/seed depth. Titan BSM & Confluence engine is observing initial quotes (${diffText}).`;
  } else if (isCounterTrendConflict) {
    convictionState = 'CAUTION_COUNTER_TREND';
    recommendedAction = 'WAIT';
    recommendedOutcome = 'NONE';
    confidenceScore = 40;
    winProbability = 50;
    if (isBullishEdgeConflict) {
      rationale = `Caution: Counter-trend divergence. Spot is ${diffText}, but aggressive downward momentum (${(change1m * 100).toFixed(2)}% 1m, ${trend.replace('_', ' ')}) threatens the strike. AI Copilot advises WAITING for price stabilization before buying UP.`;
    } else {
      rationale = `Caution: Counter-trend divergence. Spot is ${diffText}, but aggressive upward momentum (+${(change1m * 100).toFixed(2)}% 1m, ${trend.replace('_', ' ')}) is breaking out. AI Copilot advises WAITING for price stabilization before buying DOWN.`;
    }
  } else if (isYesEdge && fairValueYes >= 0.50 && trendScore >= -0.05) {
    // Aligned Bullish High Conviction Trade
    const isHigh = Math.abs(edge) >= 0.020 && (trendScore >= 0.15 || spotDiff > 0);
    convictionState = isHigh ? 'HIGH_CONVICTION' : 'MODERATE';
    recommendedAction = 'BUY_UP';
    recommendedOutcome = 'YES';
    confidenceScore = Math.min(96, Math.round(65 + Math.abs(edge) * 120 + Math.max(0, trendScore) * 15));
    winProbability = Math.min(96, Math.max(50, Math.round(fairValueYes * 100)));
    const edgeLabel = `+${(edge * 100).toFixed(1)}% YES Alpha`;
    rationale = `High Conviction UP: Spot is ${diffText} with ${trend.replace('_', ' ')} price action (${change1m >= 0 ? '+' : ''}${(change1m * 100).toFixed(2)}% 1m). Confluence fair ${(fairValueYes * 100).toFixed(1)}% vs CLOB ${(impliedProbYes * 100).toFixed(1)}% yields ${edgeLabel} with ${winProbability}% estimated win probability.`;
  } else if (isNoEdge && fairValueYes <= 0.50 && trendScore <= 0.05) {
    // Aligned Bearish High Conviction Trade
    const isHigh = Math.abs(edge) >= 0.020 && (trendScore <= -0.15 || spotDiff < 0);
    convictionState = isHigh ? 'HIGH_CONVICTION' : 'MODERATE';
    recommendedAction = 'BUY_DOWN';
    recommendedOutcome = 'NO';
    confidenceScore = Math.min(96, Math.round(65 + Math.abs(edge) * 120 + Math.abs(Math.min(0, trendScore)) * 15));
    winProbability = Math.min(96, Math.max(50, Math.round((1 - fairValueYes) * 100)));
    const edgeLabel = `+${(Math.abs(edge) * 100).toFixed(1)}% NO Alpha`;
    rationale = `High Conviction DOWN: Spot is ${diffText} with ${trend.replace('_', ' ')} price action (${(change1m * 100).toFixed(2)}% 1m). Confluence fair ${(fairValueYes * 100).toFixed(1)}% vs CLOB ${(impliedProbYes * 100).toFixed(1)}% yields ${edgeLabel} with ${winProbability}% estimated win probability.`;
  } else if (isYesEdge && fairValueYes < 0.50) {
    // Speculative OTM YES Mispricing Dislocation
    convictionState = 'MODERATE';
    recommendedAction = 'BUY_UP';
    recommendedOutcome = 'YES';
    confidenceScore = Math.min(90, Math.round(60 + Math.abs(edge) * 100));
    winProbability = Math.round(fairValueYes * 100);
    const edgeLabel = `+${(edge * 100).toFixed(1)}% YES Alpha`;
    rationale = `Moderate Value UP: Spot is ${diffText}. Asymmetric mispricing yields ${edgeLabel} (Fair ${(fairValueYes * 100).toFixed(1)}% vs CLOB ${(impliedProbYes * 100).toFixed(1)}%) with ${winProbability}% estimated win probability.`;
  } else if (isNoEdge && fairValueYes > 0.50) {
    // Speculative OTM NO Mispricing Dislocation
    convictionState = 'MODERATE';
    recommendedAction = 'BUY_DOWN';
    recommendedOutcome = 'NO';
    confidenceScore = Math.min(90, Math.round(60 + Math.abs(edge) * 100));
    winProbability = Math.round((1 - fairValueYes) * 100);
    const edgeLabel = `+${(Math.abs(edge) * 100).toFixed(1)}% NO Alpha`;
    rationale = `Moderate Value DOWN: Spot is ${diffText}. Asymmetric mispricing yields ${edgeLabel} (Fair ${(fairValueYes * 100).toFixed(1)}% vs CLOB ${(impliedProbYes * 100).toFixed(1)}%) with ${winProbability}% estimated win probability.`;
  } else {
    // Neutral / Fairly Priced / Ranging
    convictionState = 'NEUTRAL';
    recommendedAction = 'WAIT';
    recommendedOutcome = 'NONE';
    confidenceScore = 50;
    winProbability = Math.round(Math.max(fairValueYes, 1 - fairValueYes) * 100);
    const signedEdge = `${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)}%`;
    rationale = `Observing: Market is balanced near strike (${diffText}). Price action is ${trend.replace('_', ' ')} with minimal edge (${signedEdge} Alpha vs CLOB). Waiting for high-conviction breakout or mispricing setup.`;
  }

  // Allow high-conviction thought override if not contradicting
  if (agentReasoningOverride && !isCounterTrendConflict && Math.abs(edge) < 0.03) {
    rationale = agentReasoningOverride;
  }

  // 7. Build Stylized Badge Presentation
  let badgeStyle = {
    bg: 'bg-secondary/40',
    border: 'border-border/40',
    text: 'text-muted-foreground',
    iconColor: 'text-muted-foreground',
    glow: '',
    label: 'NEUTRAL • OBSERVING',
  };

  if (convictionState === 'HIGH_CONVICTION') {
    if (recommendedAction === 'BUY_UP') {
      badgeStyle = {
        bg: 'bg-[#00e676]/15',
        border: 'border-[#00e676]/40',
        text: 'text-[#00e676]',
        iconColor: 'text-[#00e676]',
        glow: 'shadow-[0_0_15px_rgba(0,230,118,0.15)]',
        label: 'HIGH CONVICTION • BUY UP',
      };
    } else {
      badgeStyle = {
        bg: 'bg-[#ff3366]/15',
        border: 'border-[#ff3366]/40',
        text: 'text-[#ff3366]',
        iconColor: 'text-[#ff3366]',
        glow: 'shadow-[0_0_15px_rgba(255,51,102,0.15)]',
        label: 'HIGH CONVICTION • BUY DOWN',
      };
    }
  } else if (convictionState === 'MODERATE') {
    badgeStyle = {
      bg: 'bg-brand-cyan/15',
      border: 'border-brand-cyan/40',
      text: 'text-brand-cyan',
      iconColor: 'text-brand-cyan',
      glow: 'shadow-[0_0_12px_rgba(0,229,255,0.12)]',
      label: `MODERATE • ${recommendedAction === 'BUY_UP' ? 'UP' : 'DOWN'}`,
    };
  } else if (convictionState === 'CAUTION_COUNTER_TREND') {
    badgeStyle = {
      bg: 'bg-[#ffb700]/15',
      border: 'border-[#ffb700]/40',
      text: 'text-[#ffb700]',
      iconColor: 'text-[#ffb700]',
      glow: 'shadow-[0_0_12px_rgba(255,183,0,0.15)]',
      label: 'CAUTION • COUNTER-TREND',
    };
  }

  const priceActionLabel = trend === 'BULLISH_EXPANSION'
    ? 'Bullish Expansion'
    : trend === 'BULLISH'
    ? 'Bullish Trend'
    : trend === 'BEARISH_BREAKDOWN'
    ? 'Bearish Breakdown'
    : trend === 'BEARISH'
    ? 'Bearish Trend'
    : 'Range Bound / Chop';

  const signedEdgeLabel = `${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)}%`;

  return {
    convictionState,
    recommendedAction,
    recommendedOutcome,
    winProbability,
    confidenceScore,
    fairValueYes,
    impliedProbYes,
    edgePercentage: edge,
    signedEdgeLabel,
    priceActionTrend: trend,
    priceActionLabel,
    priceActionScore: trendScore,
    strikeRunwayZ: 0,
    spotDiff,
    spotDiffPct,
    diffText,
    isCounterTrendConflict,
    isYesEdge,
    isNoEdge,
    rationale,
    badgeStyle,
  };
}
