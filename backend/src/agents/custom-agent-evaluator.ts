import type {
  CustomAgentDefinition,
  ConditionRule,
  Market,
  SessionGrant,
  OutcomeType,
} from '../types/index.js';
import type { IAgentContext, IAgentDecision } from './base-agent.js';
import { quantizePrice, quantizeLotSize } from '../quantitative/quantizer.js';
import { backtestService, type HistoricalCandle } from '../services/backtest-service.js';
import { priceFeedService } from '../services/price-feed-service.js';

export function calculateSeriesRSI(candles: HistoricalCandle[], period = 14): number {
  if (candles.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - (100 / (1 + rs));
}

export function calculateSeriesEMA(candles: HistoricalCandle[], period = 20): number {
  if (candles.length === 0) return 0;
  if (candles.length < period) return candles[candles.length - 1].close;
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  for (let i = 1; i < candles.length; i++) {
    ema = (candles[i].close * k) + (ema * (1 - k));
  }
  return ema;
}

export function calculateSeriesSMA(candles: HistoricalCandle[], period = 20): number {
  if (candles.length === 0) return 0;
  const slice = candles.slice(-period);
  const sum = slice.reduce((acc, c) => acc + c.close, 0);
  return sum / slice.length;
}

export function calculateSeriesBollinger(
  candles: HistoricalCandle[],
  period = 20,
  stdDev = 2.0
): { upper: number; middle: number; lower: number } {
  if (candles.length < period) {
    const last = candles[candles.length - 1]?.close || 0;
    return { upper: last * 1.01, middle: last, lower: last * 0.99 };
  }
  const slice = candles.slice(-period);
  const sum = slice.reduce((acc, c) => acc + c.close, 0);
  const mean = sum / period;
  const variance = slice.reduce((acc, c) => acc + Math.pow(c.close - mean, 2), 0) / period;
  const sd = Math.sqrt(variance);
  return {
    upper: mean + (stdDev * sd),
    middle: mean,
    lower: mean - (stdDev * sd),
  };
}

export class CustomAgentEvaluator {
  private candleCache = new Map<string, { candles: HistoricalCandle[]; fetchedAt: number }>();
  private lastTradeTimes = new Map<string, number>(); // key: agentId

  public getLastTradeTime(agentId: string): number {
    return this.lastTradeTimes.get(agentId) || 0;
  }

  public recordTradeAttempt(agentId: string, timestamp: number = Date.now()): void {
    this.lastTradeTimes.set(agentId, timestamp);
  }

  /**
   * Retrieves rolling candles for the symbol and timeframe with live tick appended.
   */
  public async getRecentCandles(symbol: string, timeframe: string = '5m'): Promise<HistoricalCandle[]> {
    const key = `${symbol}:${timeframe}`;
    const now = Date.now();
    const cached = this.candleCache.get(key);

    let baseCandles: HistoricalCandle[] = [];
    if (cached && now - cached.fetchedAt < 30000) {
      baseCandles = cached.candles;
    } else {
      try {
        const tfMs = timeframe === '1m' ? 60000 : timeframe === '15m' ? 900000 : timeframe === '1h' ? 3600000 : 300000;
        const start = now - 50 * tfMs; // 50 bars back
        const fetched = await backtestService.fetchHistoricalCandles(symbol, start, now, timeframe);
        if (fetched && fetched.length > 0) {
          baseCandles = fetched;
          this.candleCache.set(key, { candles: fetched, fetchedAt: now });
        } else if (cached) {
          baseCandles = cached.candles;
        }
      } catch (_err) {
        if (cached) baseCandles = cached.candles;
      }
    }

    const currentSpot = priceFeedService.getSpotTicker(symbol)?.price || 0;
    if (baseCandles.length === 0) {
      // Fallback dummy bars around current spot
      const fallbackPrice = currentSpot > 0 ? currentSpot : 100;
      return [
        { timestamp: now - 300000, open: fallbackPrice, high: fallbackPrice, low: fallbackPrice, close: fallbackPrice, volume: 100 },
        { timestamp: now, open: fallbackPrice, high: fallbackPrice, low: fallbackPrice, close: fallbackPrice, volume: 100 },
      ];
    }

    // Clone and append/update current live price as active bar
    const result = baseCandles.map((c) => ({ ...c }));
    if (currentSpot > 0) {
      const last = result[result.length - 1];
      if (now - last.timestamp < 300000) {
        last.close = currentSpot;
        last.high = Math.max(last.high, currentSpot);
        last.low = Math.min(last.low, currentSpot);
      } else {
        result.push({
          timestamp: now,
          open: currentSpot,
          high: currentSpot,
          low: currentSpot,
          close: currentSpot,
          volume: 0,
        });
      }
    }

    return result;
  }

  /**
   * Evaluates a custom agent definition against the current market and spot context.
   */
  public async evaluate(
    agent: CustomAgentDefinition,
    context: IAgentContext,
    session?: SessionGrant | null
  ): Promise<IAgentDecision> {
    const { market, spotTicker, depth } = context;
    const now = Date.now();

    // 1. Basic Agent State Checks
    if (!agent.isActive || !agent.isDeployed) {
      return {
        agentType: 'CUSTOM',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0,
        rationale: `Agent "${agent.name}" is not active or not deployed.`,
      };
    }

    // 2. Market Time Remaining & Expiry Block Boundary Guard (avoid final 15s)
    const closeTime = new Date(market.closeTimestamp).getTime();
    const timeLeftSeconds = Math.max(0, Math.floor((closeTime - now) / 1000));
    if (timeLeftSeconds < 15) {
      return {
        agentType: 'CUSTOM',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Market near expiry (${timeLeftSeconds}s remaining). Holding to avoid block boundary reverts.`,
      };
    }

    // 3. Bankroll Allowance Check
    const allocated = agent.allocatedAllowance ?? 100;
    const spent = agent.spentAllowance ?? 0;
    const remainingAllowance = Math.max(0, allocated - spent);
    const requestedStake = agent.rules?.action?.stakeAmount || 10;
    if (remainingAllowance < 1.0) {
      return {
        agentType: 'CUSTOM',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0,
        rationale: `Agent "${agent.name}" bankroll allowance exhausted (${spent.toFixed(2)} / ${allocated.toFixed(2)} tUSDC spent).`,
      };
    }

    // 4. Cooldown Risk Rule
    const cooldownMins = agent.rules?.risk?.cooldownMinutes || 3;
    const lastTrade = this.getLastTradeTime(agent.id);
    if (now - lastTrade < cooldownMins * 60000) {
      const waitSec = Math.ceil((cooldownMins * 60000 - (now - lastTrade)) / 1000);
      return {
        agentType: 'CUSTOM',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Agent "${agent.name}" in cooldown (${waitSec}s remaining).`,
      };
    }

    // 5. Evaluate Technical Conditions
    const rules = agent.rules;
    if (!rules || !rules.conditions || rules.conditions.length === 0) {
      return {
        agentType: 'CUSTOM',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0,
        rationale: 'No strategy conditions defined.',
      };
    }

    const candles = await this.getRecentCandles(market.symbol, agent.timeframe || '5m');
    const currentSpot = spotTicker.price > 0 ? spotTicker.price : (candles[candles.length - 1]?.close || 100);

    const conditionResults: Array<{ id: string; passed: boolean; detail: string }> = [];

    for (const cond of rules.conditions) {
      let passed = false;
      let detail = '';

      switch (cond.indicator) {
        case 'EMA': {
          const fastPeriod = cond.period || 9;
          const slowPeriod = cond.secondaryPeriod || 21;
          const fastEma = calculateSeriesEMA(candles, fastPeriod);
          const slowEma = calculateSeriesEMA(candles, slowPeriod);

          const prevSlice = candles.length > 1 ? candles.slice(0, -1) : candles;
          const prevFast = calculateSeriesEMA(prevSlice, fastPeriod);
          const prevSlow = calculateSeriesEMA(prevSlice, slowPeriod);

          if (cond.operator === 'CROSS_ABOVE' || cond.operator === 'GREATER_THAN') {
            // Golden cross (recent crossover or fast EMA riding above slow EMA)
            const isCrossing = prevFast <= prevSlow && fastEma > slowEma;
            const isRiding = fastEma > slowEma;
            passed = isCrossing || isRiding;
            detail = `EMA(${fastPeriod}) [${fastEma.toFixed(2)}] > EMA(${slowPeriod}) [${slowEma.toFixed(2)}] (${passed ? 'PASS' : 'FAIL'})`;
          } else {
            // Death cross (fast EMA below slow EMA)
            const isCrossing = prevFast >= prevSlow && fastEma < slowEma;
            const isFalling = fastEma < slowEma;
            passed = isCrossing || isFalling;
            detail = `EMA(${fastPeriod}) [${fastEma.toFixed(2)}] < EMA(${slowPeriod}) [${slowEma.toFixed(2)}] (${passed ? 'PASS' : 'FAIL'})`;
          }
          break;
        }

        case 'SMA': {
          const period = cond.period || 20;
          const sma = calculateSeriesSMA(candles, period);
          if (cond.operator === 'GREATER_THAN' || cond.operator === 'CROSS_ABOVE') {
            passed = currentSpot > sma;
            detail = `Spot [${currentSpot.toFixed(2)}] > SMA(${period}) [${sma.toFixed(2)}] (${passed ? 'PASS' : 'FAIL'})`;
          } else {
            passed = currentSpot < sma;
            detail = `Spot [${currentSpot.toFixed(2)}] < SMA(${period}) [${sma.toFixed(2)}] (${passed ? 'PASS' : 'FAIL'})`;
          }
          break;
        }

        case 'RSI': {
          const period = cond.period || 14;
          const rsi = calculateSeriesRSI(candles, period);
          const threshold = cond.value ?? 50;
          if (cond.operator === 'LESS_THAN') {
            passed = rsi < threshold;
            detail = `RSI(${period}) [${rsi.toFixed(1)}] < ${threshold} (${passed ? 'PASS' : 'FAIL'})`;
          } else if (cond.operator === 'GREATER_THAN') {
            passed = rsi > threshold;
            detail = `RSI(${period}) [${rsi.toFixed(1)}] > ${threshold} (${passed ? 'PASS' : 'FAIL'})`;
          } else {
            passed = Math.abs(rsi - threshold) < 3;
            detail = `RSI(${period}) [${rsi.toFixed(1)}] near ${threshold} (${passed ? 'PASS' : 'FAIL'})`;
          }
          break;
        }

        case 'BOLLINGER_LOWER': {
          const period = cond.period || 20;
          const stdDev = cond.stdDev || 2.0;
          const bb = calculateSeriesBollinger(candles, period, stdDev);
          passed = currentSpot <= bb.lower;
          detail = `Spot [${currentSpot.toFixed(2)}] <= BB Lower [${bb.lower.toFixed(2)}] (${passed ? 'PASS' : 'FAIL'})`;
          break;
        }

        case 'BOLLINGER_UPPER': {
          const period = cond.period || 20;
          const stdDev = cond.stdDev || 2.0;
          const bb = calculateSeriesBollinger(candles, period, stdDev);
          passed = currentSpot >= bb.upper;
          detail = `Spot [${currentSpot.toFixed(2)}] >= BB Upper [${bb.upper.toFixed(2)}] (${passed ? 'PASS' : 'FAIL'})`;
          break;
        }

        case 'PRICE_DRIFT': {
          // Check spot velocity drift: prefer 5m drift if period >= 5, else 1m drift
          const driftPeriod = cond.period || 1;
          let actualDrift = driftPeriod >= 5 ? spotTicker.change5m : spotTicker.change1m;

          // Robust fallback: if ticker change is zero or missing, calculate directly from recent candle closes
          if (actualDrift === 0 && candles.length >= 2) {
            const barsBack = driftPeriod >= 15 ? 3 : driftPeriod >= 5 ? 1 : 1;
            const refIdx = Math.max(0, candles.length - 1 - barsBack);
            const refPrice = candles[refIdx]?.close || currentSpot;
            if (refPrice > 0) {
              actualDrift = Number(((currentSpot - refPrice) / refPrice).toFixed(5));
            }
          }

          const threshold = cond.value ?? 0.0015;

          if (cond.operator === 'GREATER_THAN') {
            passed = actualDrift > threshold;
            detail = `Drift(${driftPeriod}m) [${(actualDrift * 100).toFixed(2)}%] > ${(threshold * 100).toFixed(2)}% (${passed ? 'PASS' : 'FAIL'})`;
          } else if (cond.operator === 'LESS_THAN') {
            passed = actualDrift < threshold;
            detail = `Drift(${driftPeriod}m) [${(actualDrift * 100).toFixed(2)}%] < ${(threshold * 100).toFixed(2)}% (${passed ? 'PASS' : 'FAIL'})`;
          } else {
            passed = Math.abs(actualDrift) >= Math.abs(threshold);
            detail = `|Drift(${driftPeriod}m)| [${(Math.abs(actualDrift) * 100).toFixed(2)}%] >= ${(Math.abs(threshold) * 100).toFixed(2)}% (${passed ? 'PASS' : 'FAIL'})`;
          }
          break;
        }

        default:
          passed = true;
          detail = `Unknown indicator ${cond.indicator} (PASS)`;
          break;
      }

      conditionResults.push({ id: cond.id, passed, detail });
    }

    const isOrOperator = rules.operator === 'OR';
    const allPassed = isOrOperator
      ? conditionResults.some((c) => c.passed)
      : conditionResults.every((c) => c.passed);

    if (!allPassed) {
      const summary = conditionResults.map((c) => c.detail).join('; ');
      return {
        agentType: 'CUSTOM',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Rules not met (${rules.operator}): ${summary}`,
      };
    }

    // 6. Formulate Trading Action
    const direction = rules.action?.direction || 'CALL';
    const targetOutcome: OutcomeType = direction === 'PUT' ? 'NO' : 'YES';

    // Pricing from order book depth
    let rawPrice = targetOutcome === 'YES'
      ? (depth.yesAsks?.[0]?.price || market.bestAskYes || 0.51)
      : (depth.noAsks?.[0]?.price || market.bestAskNo || (1.0 - (depth.yesBids?.[0]?.price || market.bestBidYes || 0.49)));

    // Fallback sanity clamp
    rawPrice = Math.max(0.05, Math.min(0.95, rawPrice));
    const price = quantizePrice(rawPrice);

    // 7. Minimum Pool Payout Risk Filter
    const minPayoutPct = rules.risk?.minPoolPayoutPct || 70;
    const impliedPayoutPct = ((1.0 - price) / price) * 100;
    if (price > 0.85 || impliedPayoutPct < minPayoutPct * 0.5) {
      return {
        agentType: 'CUSTOM',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Market odds unfavorable (Price: ${price.toFixed(2)}, Implied payout: ${impliedPayoutPct.toFixed(1)}% vs target ${minPayoutPct}%).`,
      };
    }

    // 8. Lot Sizing (scale to requested stakeAmount, capped by remaining allowance and session limits)
    const effectiveStake = Math.min(requestedStake, remainingAllowance);
    const maxAllowedCost = Math.min(
      effectiveStake,
      session?.maxTradeSize ?? effectiveStake,
      remainingAllowance
    );

    const calculatedLots = Math.max(1, Math.floor(maxAllowedCost / (price || 0.5)));
    const lotSize = quantizeLotSize(calculatedLots);

    const rationale = `[CUSTOM: ${agent.name}] Triggered ${direction} signal on ${market.symbol} (${conditionResults.map((c) => c.detail).join(', ')}). Buying ${targetOutcome} @ ${price.toFixed(2)} (${lotSize} lots).`;

    return {
      agentType: 'CUSTOM',
      action: 'TAKER_BUY',
      targetMarketId: market.id,
      targetOutcome: targetOutcome === 'YES' ? 'YES' : 'NO',
      price,
      lotSize,
      confidence: 0.92,
      rationale,
    };
  }
}

export const customAgentEvaluator = new CustomAgentEvaluator();
