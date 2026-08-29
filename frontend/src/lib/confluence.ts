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

/**
 * Calculates continuous regularized sigmoid probability centered on strike.
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
  const diffText = spotDiff >= 0
    ? `+$${spotDiff < 1 ? spotDiff.toFixed(4) : spotDiff.toFixed(2)} (+${spotDiffPct.toFixed(2)}%) above strike`
    : `-$${Math.abs(spotDiff) < 1 ? Math.abs(spotDiff).toFixed(4) : Math.abs(spotDiff).toFixed(2)} (${Math.abs(spotDiffPct).toFixed(2)}%) below strike`;

  // 1. Resolve or compute Price Action
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
  }

  // 2. Resolve Probabilities & Edge
  const smoothFallback = getSigmoidFallbackProb(spot, strike);
  const impliedProbYes = isSyntheticOrSeed ? 0.50 : (liveTick?.impliedProb ?? market.impliedProbYes ?? (market.bestAskYes > 0 ? market.bestAskYes : smoothFallback));
  const fairValueYes = liveTick?.fairValue ?? market.fairValueYes ?? smoothFallback;
  const rawEdge = isSyntheticOrSeed ? 0 : (liveTick?.edge ?? (fairValueYes - impliedProbYes));
  // Small deadband to stabilize edge
  const edge = Math.abs(rawEdge) < 0.004 ? 0 : rawEdge;

  const isYesEdge = edge >= 0.015;
  const isNoEdge = edge <= -0.015;

  // 3. Counter-trend conflict detection
  // Conflict A: YES edge / BSM UP, but price is actively dumping towards or through strike
  const isBullishEdgeConflict = (isYesEdge || fairValueYes >= 0.55) && (isPlunging || trendScore <= -0.25);
  // Conflict B: NO edge / BSM DOWN, but price is surging upwards with breakout momentum
  const isBearishEdgeConflict = (isNoEdge || fairValueYes <= 0.45) && (isSurging || trendScore >= 0.25);
  const isCounterTrendConflict = isBullishEdgeConflict || isBearishEdgeConflict;

  // 4. Resolve Conviction & Recommendation
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
  } else if (isYesEdge && trendScore >= -0.05) {
    const isHigh = Math.abs(edge) >= 0.025 && (trendScore >= 0.15 || spotDiff > 0);
    convictionState = isHigh ? 'HIGH_CONVICTION' : 'MODERATE';
    recommendedAction = 'BUY_UP';
    recommendedOutcome = 'YES';
    confidenceScore = Math.min(96, Math.round(65 + Math.abs(edge) * 120 + Math.max(0, trendScore) * 15));
    winProbability = Math.min(94, Math.max(62, Math.round(fairValueYes * 100)));
    const edgeLabel = `+${(edge * 100).toFixed(1)}% YES Alpha`;
    rationale = `High Conviction UP: Spot is ${diffText} with ${trend.replace('_', ' ')} price action (${change1m >= 0 ? '+' : ''}${(change1m * 100).toFixed(2)}% 1m). Confluence fair ${(fairValueYes * 100).toFixed(1)}% vs CLOB ${(impliedProbYes * 100).toFixed(1)}% yields ${edgeLabel} with ${winProbability}% estimated win probability.`;
  } else if (isNoEdge && trendScore <= 0.05) {
    const isHigh = Math.abs(edge) >= 0.025 && (trendScore <= -0.15 || spotDiff < 0);
    convictionState = isHigh ? 'HIGH_CONVICTION' : 'MODERATE';
    recommendedAction = 'BUY_DOWN';
    recommendedOutcome = 'NO';
    confidenceScore = Math.min(96, Math.round(65 + Math.abs(edge) * 120 + Math.abs(Math.min(0, trendScore)) * 15));
    winProbability = Math.min(94, Math.max(62, Math.round((1 - fairValueYes) * 100)));
    const edgeLabel = `+${(Math.abs(edge) * 100).toFixed(1)}% NO Alpha`;
    rationale = `High Conviction DOWN: Spot is ${diffText} with ${trend.replace('_', ' ')} price action (${(change1m * 100).toFixed(2)}% 1m). Confluence fair ${(fairValueYes * 100).toFixed(1)}% vs CLOB ${(impliedProbYes * 100).toFixed(1)}% yields ${edgeLabel} with ${winProbability}% estimated win probability.`;
  } else {
    convictionState = 'NEUTRAL';
    recommendedAction = 'WAIT';
    recommendedOutcome = 'NONE';
    confidenceScore = 50;
    winProbability = Math.round(fairValueYes * 100);
    const signedEdge = `${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)}%`;
    rationale = `Observing: Market is balanced near strike (${diffText}). Price action is ${trend.replace('_', ' ')} with minimal edge (${signedEdge} Alpha vs CLOB). Waiting for high-conviction breakout or mispricing setup.`;
  }

  // Allow high-conviction thought override if not contradicting
  if (agentReasoningOverride && !isCounterTrendConflict && Math.abs(edge) < 0.03) {
    rationale = agentReasoningOverride;
  }

  // 5. Build Stylized Badge Presentation
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
