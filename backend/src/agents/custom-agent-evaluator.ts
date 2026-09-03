import type {
  CustomAgentDefinition,
  ConditionRule,
  Market,
  SessionGrant,
  OutcomeType,
  OrderExecution,
} from '../types/index.js';
import type { IAgentContext, IAgentDecision } from './base-agent.js';
import { quantizePrice, quantizeLotSize } from '../quantitative/quantizer.js';
import { backtestService, type HistoricalCandle } from '../services/backtest-service.js';
import { priceFeedService } from '../services/price-feed-service.js';
import { orderService } from '../services/order-service.js';

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
  if (candles.length === 1) return candles[0].close;
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

export function calculateSeriesMACD(
  candles: HistoricalCandle[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { macd: number; signal: number; histogram: number; prevMacd: number; prevSignal: number; prevHistogram: number } {
  if (candles.length < 2) {
    return { macd: 0, signal: 0, histogram: 0, prevMacd: 0, prevSignal: 0, prevHistogram: 0 };
  }

  // Calculate MACD series across all candles
  const macdSeries: number[] = [];
  const kFast = 2 / (fastPeriod + 1);
  const kSlow = 2 / (slowPeriod + 1);

  let fastEma = candles[0].close;
  let slowEma = candles[0].close;

  for (let i = 0; i < candles.length; i++) {
    const close = candles[i].close;
    if (i > 0) {
      fastEma = (close * kFast) + (fastEma * (1 - kFast));
      slowEma = (close * kSlow) + (slowEma * (1 - kSlow));
    }
    macdSeries.push(fastEma - slowEma);
  }

  // Calculate Signal line series (EMA of MACD series)
  const kSignal = 2 / (signalPeriod + 1);
  let signalEma = macdSeries[0];
  const signalSeries: number[] = [signalEma];

  for (let i = 1; i < macdSeries.length; i++) {
    signalEma = (macdSeries[i] * kSignal) + (signalEma * (1 - kSignal));
    signalSeries.push(signalEma);
  }

  const lastIdx = macdSeries.length - 1;
  const prevIdx = Math.max(0, lastIdx - 1);

  const macd = macdSeries[lastIdx];
  const signal = signalSeries[lastIdx];
  const histogram = macd - signal;

  const prevMacd = macdSeries[prevIdx];
  const prevSignal = signalSeries[prevIdx];
  const prevHistogram = prevMacd - prevSignal;

  return { macd, signal, histogram, prevMacd, prevSignal, prevHistogram };
}

export function calculateSeriesStochastic(
  candles: HistoricalCandle[],
  kPeriod = 14,
  dPeriod = 3
): { k: number; d: number; prevK: number; prevD: number } {
  if (candles.length < kPeriod) {
    return { k: 50, d: 50, prevK: 50, prevD: 50 };
  }

  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const window = candles.slice(i - kPeriod + 1, i + 1);
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (const c of window) {
      if (c.high > highestHigh) highestHigh = c.high;
      if (c.low < lowestLow) lowestLow = c.low;
    }
    const currentClose = candles[i].close;
    const diff = highestHigh - lowestLow;
    const k = diff === 0 ? 50 : Math.min(100, Math.max(0, ((currentClose - lowestLow) / diff) * 100));
    kValues.push(k);
  }

  const dValues: number[] = [];
  for (let i = 0; i < kValues.length; i++) {
    const slice = kValues.slice(Math.max(0, i - dPeriod + 1), i + 1);
    const sum = slice.reduce((a, b) => a + b, 0);
    dValues.push(sum / slice.length);
  }

  const lastIdx = kValues.length - 1;
  const prevIdx = Math.max(0, lastIdx - 1);

  return {
    k: kValues[lastIdx] ?? 50,
    d: dValues[lastIdx] ?? 50,
    prevK: kValues[prevIdx] ?? 50,
    prevD: dValues[prevIdx] ?? 50,
  };
}

export function calculateSeriesATR(candles: HistoricalCandle[], period = 14): number {
  if (candles.length < 2) return candles[0]?.close * 0.005 || 1;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close)
    );
    trs.push(tr);
  }

  const slice = trs.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / slice.length;
}

export function calculateSeriesVWAP(candles: HistoricalCandle[]): number {
  if (candles.length === 0) return 0;
  let cumulativeTypicalVol = 0;
  let cumulativeVol = 0;

  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 100;
    cumulativeTypicalVol += typicalPrice * vol;
    cumulativeVol += vol;
  }

  if (cumulativeVol === 0) return candles[candles.length - 1].close;
  return cumulativeTypicalVol / cumulativeVol;
}

export function calculateSeriesVolumeSurge(candles: HistoricalCandle[], period = 20): number {
  if (candles.length < 2) return 1.0;
  const currentVol = candles[candles.length - 1].volume || 100;
  const prevSlice = candles.slice(Math.max(0, candles.length - period - 1), candles.length - 1);
  if (prevSlice.length === 0) return 1.0;
  const avgVol = prevSlice.reduce((acc, c) => acc + (c.volume || 100), 0) / prevSlice.length;
  if (avgVol === 0) return 1.0;
  return currentVol / avgVol;
}

export function calculateSeriesADX(
  candles: HistoricalCandle[],
  period = 14
): { adx: number; pdi: number; ndi: number } {
  if (candles.length < period + 2) {
    return { adx: 25, pdi: 25, ndi: 25 };
  }

  const trs: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];

    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    trs.push(tr);

    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;

    if (upMove > downMove && upMove > 0) plusDMs.push(upMove);
    else plusDMs.push(0);

    if (downMove > upMove && downMove > 0) minusDMs.push(downMove);
    else minusDMs.push(0);
  }

  // Smooth TR, +DM, -DM over period
  const trSlice = trs.slice(-period);
  const plusSlice = plusDMs.slice(-period);
  const minusSlice = minusDMs.slice(-period);

  const smoothedTR = trSlice.reduce((a, b) => a + b, 0) || 0.0001;
  const smoothedPlusDM = plusSlice.reduce((a, b) => a + b, 0);
  const smoothedMinusDM = minusSlice.reduce((a, b) => a + b, 0);

  const pdi = (smoothedPlusDM / smoothedTR) * 100;
  const ndi = (smoothedMinusDM / smoothedTR) * 100;

  const dxSum = pdi + ndi;
  const dx = dxSum === 0 ? 0 : (Math.abs(pdi - ndi) / dxSum) * 100;

  return { adx: dx, pdi, ndi };
}

export function calculateSeriesCCI(candles: HistoricalCandle[], period = 20): number {
  if (candles.length < period) return 0;
  const tps = candles.map((c) => (c.high + c.low + c.close) / 3);
  const slice = tps.slice(-period);
  const smaTP = slice.reduce((a, b) => a + b, 0) / period;
  const meanDev = slice.reduce((acc, tp) => acc + Math.abs(tp - smaTP), 0) / period;
  if (meanDev === 0) return 0;
  const currentTP = tps[tps.length - 1];
  return (currentTP - smaTP) / (0.015 * meanDev);
}

export function calculateSeriesWilliamsR(candles: HistoricalCandle[], period = 14): number {
  if (candles.length < period) return -50;
  const slice = candles.slice(-period);
  let highestHigh = -Infinity;
  let lowestLow = Infinity;
  for (const c of slice) {
    if (c.high > highestHigh) highestHigh = c.high;
    if (c.low < lowestLow) lowestLow = c.low;
  }
  const currentClose = candles[candles.length - 1].close;
  const diff = highestHigh - lowestLow;
  if (diff === 0) return -50;
  return ((highestHigh - currentClose) / diff) * -100;
}

export function calculateConsecutiveStreak(
  orders: Array<{ isSettled?: boolean; pnl?: number; settledAt?: string; createdAt?: string }>
): number {
  const settled = orders
    .filter((o) => o.isSettled)
    .sort((a, b) => new Date(a.settledAt || a.createdAt || 0).getTime() - new Date(b.settledAt || b.createdAt || 0).getTime());

  let currentStreak = 0;
  for (const o of settled) {
    const pnl = o.pnl ?? 0;
    if (Math.abs(pnl) < 0.01) continue;
    if (pnl > 0) {
      currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
    } else if (pnl < 0) {
      currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
    }
  }
  return currentStreak;
}

export class CustomAgentEvaluator {
  private candleCache = new Map<string, { candles: HistoricalCandle[]; fetchedAt: number }>();
  private lastTradeTimes = new Map<string, number>(); // key: agentId
  private activeLossStreaks = new Map<string, number>(); // key: agentId -> count of active consecutive losses

  public getLastTradeTime(agentId: string): number {
    return this.lastTradeTimes.get(agentId) || 0;
  }

  public recordTradeAttempt(agentId: string, timestamp: number = Date.now()): void {
    this.lastTradeTimes.set(agentId, timestamp);
  }

  public getActiveLossStreak(agentId: string): number {
    return this.activeLossStreaks.get(agentId) || 0;
  }

  public setActiveLossStreak(agentId: string, streak: number): void {
    this.activeLossStreaks.set(agentId, Math.max(0, streak));
  }

  /**
   * Retrieves rolling candles for the symbol and timeframe with live tick appended.
   */
  public async getRecentCandles(
    symbol: string,
    timeframe: string = '5m',
    contextSpot?: number,
    driftHint?: number
  ): Promise<HistoricalCandle[]> {
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

    const ticker = priceFeedService.getSpotTicker(symbol);
    const currentSpot = (contextSpot && contextSpot > 0) ? contextSpot : (ticker?.price || (baseCandles[baseCandles.length - 1]?.close || 100));
    const drift = (driftHint !== undefined) ? driftHint : (ticker?.change5m || 0.002);

    if (baseCandles.length === 0) {
      // Synthesize 50 bars ending at currentSpot with realistic momentum gradient
      const tfMs = timeframe === '1m' ? 60000 : timeframe === '15m' ? 900000 : timeframe === '1h' ? 3600000 : 300000;
      const startPrice = currentSpot / (1 + drift);
      const generated: HistoricalCandle[] = [];
      for (let i = 0; i < 50; i++) {
        const progress = i / 49;
        const barClose = startPrice + (currentSpot - startPrice) * progress;
        generated.push({
          timestamp: now - (50 - i) * tfMs,
          open: barClose * 0.999,
          high: barClose * 1.001,
          low: barClose * 0.998,
          close: barClose,
          volume: 100 + i * 5,
        });
      }
      return generated;
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

    // 2. Market Time Remaining & Expiry Block Boundary Guard (avoid final N seconds)
    const closeTime = new Date(market.closeTimestamp).getTime();
    const timeLeftSeconds = Math.max(0, Math.floor((closeTime - now) / 1000));
    const expiryBuffer = agent.rules?.risk?.expiryBufferSec ?? 15;
    if (timeLeftSeconds < expiryBuffer) {
      return {
        agentType: 'CUSTOM',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Market near expiry (${timeLeftSeconds}s remaining, buffer: ${expiryBuffer}s). Holding to avoid block boundary reverts.`,
      };
    }

    // 3. Bankroll Allowance & Advanced Profit/Drawdown Guards
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

    // Take-Profit Target Lock Filter
    if (agent.rules?.risk?.takeProfitTargetPct && agent.pnl !== undefined && allocated > 0) {
      const pnlPct = (agent.pnl / allocated) * 100;
      if (pnlPct >= agent.rules.risk.takeProfitTargetPct) {
        return {
          agentType: 'CUSTOM',
          action: 'HOLD',
          targetMarketId: market.id,
          confidence: 0.5,
          rationale: `Agent "${agent.name}" locked profits (+${pnlPct.toFixed(1)}% vs target +${agent.rules.risk.takeProfitTargetPct}%).`,
        };
      }
    }

    // Daily Drawdown Circuit Breaker
    if (agent.rules?.risk?.dailyDrawdownLimitPct && agent.pnl !== undefined && allocated > 0) {
      const pnlPct = (agent.pnl / allocated) * 100;
      if (pnlPct <= -Math.abs(agent.rules.risk.dailyDrawdownLimitPct)) {
        return {
          agentType: 'CUSTOM',
          action: 'HOLD',
          targetMarketId: market.id,
          confidence: 0.5,
          rationale: `Agent "${agent.name}" daily drawdown circuit breaker triggered (${pnlPct.toFixed(1)}% vs max -${Math.abs(agent.rules.risk.dailyDrawdownLimitPct)}%).`,
        };
      }
    }

    // Consecutive Loss Circuit Breaker
    const maxConsecutiveLosses = agent.rules?.risk?.maxConsecutiveLosses;
    let currentStreak = 0;
    if (
      (maxConsecutiveLosses !== undefined && maxConsecutiveLosses > 0) ||
      (agent.rules?.risk?.martingaleMultiplier && agent.rules.risk.martingaleMultiplier > 1.0)
    ) {
      let recentOrders: OrderExecution[] = [];
      try {
        recentOrders = await orderService.getOrdersForCustomAgent(agent.id, agent.userAddress);
      } catch {
        recentOrders = [];
      }
      const agentOrders = recentOrders.filter((o) => {
        if (o.customAgentId) return o.customAgentId === agent.id;
        if (o.sessionId) return o.sessionId === agent.id;
        return true;
      });
      currentStreak = calculateConsecutiveStreak(agentOrders);
      // Track active loss streak in runtime state
      const activeLosses = currentStreak < 0 ? Math.abs(currentStreak) : 0;
      this.setActiveLossStreak(agent.id, activeLosses);
    }

    if (maxConsecutiveLosses !== undefined && maxConsecutiveLosses > 0 && currentStreak <= -maxConsecutiveLosses) {
      return {
        agentType: 'CUSTOM',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Consecutive loss limit reached (streak: ${Math.abs(currentStreak)} >= ${maxConsecutiveLosses}). Halting to protect capital.`,
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

    const driftHint = spotTicker.change5m || spotTicker.change1m || 0.002;
    const candles = await this.getRecentCandles(market.symbol, agent.timeframe || '5m', spotTicker.price, driftHint);
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
            const isCrossing = prevFast <= prevSlow && fastEma > slowEma;
            const isRiding = fastEma > slowEma;
            passed = isCrossing || isRiding;
            detail = `EMA(${fastPeriod}) [${fastEma.toFixed(2)}] > EMA(${slowPeriod}) [${slowEma.toFixed(2)}] (${passed ? 'PASS' : 'FAIL'})`;
          } else {
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

        case 'MACD': {
          const fast = cond.period || 12;
          const slow = cond.secondaryPeriod || 26;
          const signal = cond.signalPeriod || 9;
          const macdRes = calculateSeriesMACD(candles, fast, slow, signal);

          if (cond.operator === 'CROSS_ABOVE') {
            const isCrossing = macdRes.prevMacd <= macdRes.prevSignal && macdRes.macd > macdRes.signal;
            const isAbove = macdRes.macd > macdRes.signal;
            passed = isCrossing || isAbove;
            detail = `MACD Line [${macdRes.macd.toFixed(3)}] > Signal [${macdRes.signal.toFixed(3)}] (${passed ? 'PASS' : 'FAIL'})`;
          } else if (cond.operator === 'CROSS_BELOW') {
            const isCrossing = macdRes.prevMacd >= macdRes.prevSignal && macdRes.macd < macdRes.signal;
            const isBelow = macdRes.macd < macdRes.signal;
            passed = isCrossing || isBelow;
            detail = `MACD Line [${macdRes.macd.toFixed(3)}] < Signal [${macdRes.signal.toFixed(3)}] (${passed ? 'PASS' : 'FAIL'})`;
          } else if (cond.operator === 'GREATER_THAN') {
            passed = macdRes.histogram > (cond.value || 0);
            detail = `MACD Hist [${macdRes.histogram.toFixed(3)}] > ${cond.value || 0} (${passed ? 'PASS' : 'FAIL'})`;
          } else {
            passed = macdRes.histogram < (cond.value || 0);
            detail = `MACD Hist [${macdRes.histogram.toFixed(3)}] < ${cond.value || 0} (${passed ? 'PASS' : 'FAIL'})`;
          }
          break;
        }

        case 'STOCHASTIC': {
          const kPeriod = cond.period || 14;
          const dPeriod = cond.secondaryPeriod || 3;
          const stoch = calculateSeriesStochastic(candles, kPeriod, dPeriod);
          const threshold = cond.value ?? 50;

          if (cond.operator === 'LESS_THAN') {
            passed = stoch.k < threshold;
            detail = `Stoch %K [${stoch.k.toFixed(1)}] < ${threshold} (${passed ? 'PASS' : 'FAIL'})`;
          } else if (cond.operator === 'GREATER_THAN') {
            passed = stoch.k > threshold;
            detail = `Stoch %K [${stoch.k.toFixed(1)}] > ${threshold} (${passed ? 'PASS' : 'FAIL'})`;
          } else if (cond.operator === 'CROSS_ABOVE') {
            passed = (stoch.prevK <= stoch.prevD && stoch.k > stoch.d) || stoch.k > stoch.d;
            detail = `Stoch %K [${stoch.k.toFixed(1)}] > %D [${stoch.d.toFixed(1)}] (${passed ? 'PASS' : 'FAIL'})`;
          } else {
            passed = (stoch.prevK >= stoch.prevD && stoch.k < stoch.d) || stoch.k < stoch.d;
            detail = `Stoch %K [${stoch.k.toFixed(1)}] < %D [${stoch.d.toFixed(1)}] (${passed ? 'PASS' : 'FAIL'})`;
          }
          break;
        }

        case 'ATR': {
          const period = cond.period || 14;
          const atr = calculateSeriesATR(candles, period);
          const threshold = cond.value ?? (currentSpot * 0.002);
          if (cond.operator === 'GREATER_THAN' || cond.operator === 'CROSS_ABOVE') {
            passed = atr > threshold;
            detail = `ATR(${period}) [${atr.toFixed(2)}] > ${threshold.toFixed(2)} (${passed ? 'PASS' : 'FAIL'})`;
          } else {
            passed = atr < threshold;
            detail = `ATR(${period}) [${atr.toFixed(2)}] < ${threshold.toFixed(2)} (${passed ? 'PASS' : 'FAIL'})`;
          }
          break;
        }

        case 'VWAP': {
          const vwap = calculateSeriesVWAP(candles);
          if (cond.operator === 'GREATER_THAN' || cond.operator === 'CROSS_ABOVE') {
            passed = currentSpot > vwap;
            detail = `Spot [${currentSpot.toFixed(2)}] > VWAP [${vwap.toFixed(2)}] (${passed ? 'PASS' : 'FAIL'})`;
          } else {
            passed = currentSpot < vwap;
            detail = `Spot [${currentSpot.toFixed(2)}] < VWAP [${vwap.toFixed(2)}] (${passed ? 'PASS' : 'FAIL'})`;
          }
          break;
        }

        case 'VOLUME_SURGE': {
          const period = cond.period || 20;
          const surge = calculateSeriesVolumeSurge(candles, period);
          const threshold = cond.multiplier || cond.value || 1.5;
          if (cond.operator === 'GREATER_THAN' || cond.operator === 'CROSS_ABOVE') {
            passed = surge > threshold;
            detail = `Volume Surge [${surge.toFixed(2)}x] > ${threshold}x (${passed ? 'PASS' : 'FAIL'})`;
          } else {
            passed = surge < threshold;
            detail = `Volume Surge [${surge.toFixed(2)}x] < ${threshold}x (${passed ? 'PASS' : 'FAIL'})`;
          }
          break;
        }

        case 'ADX': {
          const period = cond.period || 14;
          const adxRes = calculateSeriesADX(candles, period);
          const threshold = cond.value ?? 25;
          if (cond.operator === 'GREATER_THAN' || cond.operator === 'CROSS_ABOVE') {
            passed = adxRes.adx > threshold;
            detail = `ADX(${period}) [${adxRes.adx.toFixed(1)}] > ${threshold} (${passed ? 'PASS' : 'FAIL'})`;
          } else {
            passed = adxRes.adx < threshold;
            detail = `ADX(${period}) [${adxRes.adx.toFixed(1)}] < ${threshold} (${passed ? 'PASS' : 'FAIL'})`;
          }
          break;
        }

        case 'CCI': {
          const period = cond.period || 20;
          const cci = calculateSeriesCCI(candles, period);
          const threshold = cond.value ?? 0;
          if (cond.operator === 'GREATER_THAN') {
            passed = cci > threshold;
            detail = `CCI(${period}) [${cci.toFixed(1)}] > ${threshold} (${passed ? 'PASS' : 'FAIL'})`;
          } else {
            passed = cci < threshold;
            detail = `CCI(${period}) [${cci.toFixed(1)}] < ${threshold} (${passed ? 'PASS' : 'FAIL'})`;
          }
          break;
        }

        case 'WILLIAMS_R': {
          const period = cond.period || 14;
          const wr = calculateSeriesWilliamsR(candles, period);
          const threshold = cond.value ?? -50;
          if (cond.operator === 'GREATER_THAN') {
            passed = wr > threshold;
            detail = `Williams %R(${period}) [${wr.toFixed(1)}] > ${threshold} (${passed ? 'PASS' : 'FAIL'})`;
          } else {
            passed = wr < threshold;
            detail = `Williams %R(${period}) [${wr.toFixed(1)}] < ${threshold} (${passed ? 'PASS' : 'FAIL'})`;
          }
          break;
        }

        case 'PRICE_DRIFT': {
          const driftPeriod = cond.period || 1;
          let actualDrift = driftPeriod >= 5 ? spotTicker.change5m : spotTicker.change1m;

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

    // Pricing calculation & Order Engine Rules
    let rawPrice = targetOutcome === 'YES'
      ? (depth.yesAsks?.[0]?.price || market.bestAskYes || 0.51)
      : (depth.noAsks?.[0]?.price || market.bestAskNo || (1.0 - (depth.yesBids?.[0]?.price || market.bestBidYes || 0.49)));

    // Advanced Limit Order pricing offset support
    if (rules.action?.orderType === 'LIMIT') {
      const bestBid = depth.yesBids?.[0]?.price || market.bestBidYes || 0.49;
      const bestAsk = depth.yesAsks?.[0]?.price || market.bestAskYes || 0.51;
      const midpoint = (bestBid + bestAsk) / 2;

      if (rules.action.limitPricing === 'MIDPOINT') {
        rawPrice = midpoint;
      } else if (rules.action.limitPricing === 'DISCOUNT_OFFSET') {
        const offset = (rules.action.limitOffsetBps || 10) * 0.0001;
        rawPrice = targetOutcome === 'YES' ? Math.max(0.05, bestAsk - offset) : Math.max(0.05, rawPrice - offset);
      }
    }

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

    // 8. Lot Sizing (scale to requested stakeAmount with optional Martingale multiplier)
    let dynamicStake = requestedStake;
    if (rules.risk?.martingaleMultiplier && rules.risk.martingaleMultiplier > 1.0) {
      // If consecutive losses occurred, scale stake safely up to remaining allowance using actual active loss streak
      const consecutiveLosses = currentStreak < 0 ? Math.abs(currentStreak) : (this.getActiveLossStreak(agent.id) || 0);
      if (consecutiveLosses > 0) {
        dynamicStake = requestedStake * Math.min(3.0, Math.pow(rules.risk.martingaleMultiplier, Math.min(2, consecutiveLosses)));
      }
    }

    const effectiveStake = Math.min(dynamicStake, remainingAllowance);
    const maxAllowedCost = Math.min(
      effectiveStake,
      session?.maxTradeSize ?? effectiveStake,
      remainingAllowance
    );

    const calculatedLots = Math.max(1, Math.floor(maxAllowedCost / (price || 0.5)));
    const lotSize = quantizeLotSize(calculatedLots);

    const actionType = rules.action?.orderType === 'LIMIT' ? 'LIMIT_QUOTE' : 'TAKER_BUY';
    const rationale = `[CUSTOM: ${agent.name}] Triggered ${direction} signal on ${market.symbol} (${conditionResults.map((c) => c.detail).join(', ')}). ${actionType} ${targetOutcome} @ ${price.toFixed(2)} (${lotSize} lots).`;

    return {
      agentType: 'CUSTOM',
      customAgentId: agent.id,
      customAgentName: agent.name,
      action: actionType,
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
