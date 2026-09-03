import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MultiAgentSwarmRunner } from '../src/agents/swarm-runner.js';
import {
  CustomAgentEvaluator,
  calculateConsecutiveStreak,
  calculateSeriesRSI,
  calculateSeriesEMA,
  calculateSeriesSMA,
  calculateSeriesBollinger,
  calculateSeriesMACD,
  calculateSeriesStochastic,
  calculateSeriesATR,
  calculateSeriesVWAP,
  calculateSeriesVolumeSurge,
  calculateSeriesADX,
  calculateSeriesCCI,
  calculateSeriesWilliamsR,
} from '../src/agents/custom-agent-evaluator.js';
import { orderService } from '../src/services/order-service.js';
import { marketService } from '../src/services/market-service.js';
import { sessionService, type SessionRecord } from '../src/services/session-service.js';
import { operatorAccount } from '../src/config/somnia.js';
import type { Market, SessionGrant, CustomAgentDefinition } from '../src/types/index.js';
import type { IAgentContext } from '../src/agents/base-agent.js';
import type { HistoricalCandle } from '../src/services/backtest-service.js';

describe('SwarmRunner, CustomAgentEvaluator & Agent System Suite', () => {
  const userAddress = operatorAccount.address;

  const mockSession: SessionRecord & SessionGrant = {
    id: 'sess-eval-1234',
    userAddress,
    operatorAddress: operatorAccount.address,
    permissions: ['placeOrderFor', 'cancelOrderFor'],
    maxTradeSize: 50,
    dailyVolumeCap: 500,
    spentToday: 0,
    lastSpendResetTimestamp: Date.now(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    isActive: true,
    nonce: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockMarket: Market = {
    id: 'market-btc-runner-1',
    symbol: 'BTC/USD',
    windowDuration: '5m',
    strikePrice: 96000,
    openTimestamp: new Date(Date.now() - 60000).toISOString(),
    closeTimestamp: new Date(Date.now() + 240000).toISOString(),
    resolutionTimestamp: new Date(Date.now() + 300000).toISOString(),
    status: 'Open',
    bestBidYes: 0.48,
    bestAskYes: 0.52,
    bestBidNo: 0.48,
    bestAskNo: 0.52,
    impliedProbYes: 0.50,
    fairValueYes: 0.55,
    edgePercentage: 0.05,
  };

  beforeEach(() => {
    vi.spyOn(marketService, 'getMarketById').mockReturnValue(mockMarket);
    vi.spyOn(marketService, 'getActiveMarkets').mockReturnValue([mockMarket]);
    vi.spyOn(sessionService, 'getActiveSessions').mockReturnValue([mockSession]);
    vi.spyOn(sessionService, 'getUserActiveSession').mockResolvedValue(mockSession);
  });

  describe('MultiAgentSwarmRunner', () => {
    let runner: MultiAgentSwarmRunner;

    beforeEach(() => {
      runner = new MultiAgentSwarmRunner();
    });

    afterEach(() => {
      runner.stop();
    });

    it('initializes agents and retrieves status telemetry', async () => {
      const status = runner.getSwarmStatus();
      expect(status).toBeDefined();
      expect(status.volt).toBeDefined();
      expect(status.oracle).toBeDefined();
      expect(status.titan).toBeDefined();
      expect(status.sweeper).toBeDefined();

      const asyncStatus = await runner.getSwarmStatusAsync();
      expect(asyncStatus).toBeDefined();
    });

    it('retrieves detailed swarm state and per-wallet personal status', async () => {
      const detailed = runner.getDetailedSwarmState();
      expect(detailed.agents).toBeDefined();

      const asyncDetailed = await runner.getDetailedSwarmStateAsync();
      expect(asyncDetailed.agents).toBeDefined();

      const personal = runner.getPersonalSwarmStatus(userAddress);
      expect(personal).toBeDefined();
      expect(personal.volt).toBeDefined();
    });

    it('toggles agents and updates agent configurations', () => {
      const toggled = runner.toggleAgent('Volt', false);
      expect(toggled).toBe(true);

      const toggledBack = runner.toggleAgent('Volt', true);
      expect(toggledBack).toBe(true);

      const updated = runner.updateAgentConfig('Volt', { driftThreshold: 0.003 });
      expect(updated).toBe(true);
    });

    it('starts and stops background runner loop without errors', () => {
      runner.start(500);
      const detailed = runner.getDetailedSwarmState();
      expect(detailed.isRunning).toBe(true);

      runner.stop();
      const detailedStopped = runner.getDetailedSwarmState();
      expect(detailedStopped.isRunning).toBe(false);
    });
  });

  describe('Technical Indicators & CustomAgentEvaluator', () => {
    let evaluator: CustomAgentEvaluator;

    const mockCandles: HistoricalCandle[] = Array.from({ length: 40 }, (_, i) => ({
      timestamp: Date.now() - (40 - i) * 60000,
      open: 96000 + i * 10,
      high: 96050 + i * 10,
      low: 95950 + i * 10,
      close: 96020 + i * 10,
      volume: 100 + i * 5,
    }));

    const mockCustomAgent: CustomAgentDefinition = {
      id: 'agent-custom-1',
      userAddress,
      name: 'RSI Momentum Pro',
      description: 'Trades RSI momentum with risk guardrails',
      symbol: 'BTC/USD',
      timeframe: '5m',
      strategyType: 'MOMENTUM',
      color: '#10b981',
      icon: 'SparklesIcon',
      isActive: true,
      isDeployed: true,
      allocatedAllowance: 100,
      spentAllowance: 0,
      rules: {
        operator: 'AND',
        conditions: [
          {
            id: 'cond-1',
            indicator: 'RSI',
            operator: 'GREATER_THAN',
            value: 60,
          },
        ],
        action: {
          direction: 'CALL',
          durationSec: 300,
          stakeType: 'FIXED',
          stakeAmount: 10,
          orderType: 'LIMIT',
          limitPricing: 'DISCOUNT_OFFSET',
          limitOffsetBps: 15,
        },
        risk: {
          maxConsecutiveLosses: 2,
          cooldownMinutes: 3,
          minPoolPayoutPct: 75,
          martingaleMultiplier: 1.5,
          takeProfitTargetPct: 30,
          dailyDrawdownLimitPct: 20,
        },
      },
      tradesCount: 5,
      winRate: 80,
      pnl: 25.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    beforeEach(() => {
      evaluator = new CustomAgentEvaluator();
    });

    it('calculates technical indicators (RSI, EMA, SMA, Bollinger Bands)', () => {
      const rsi = calculateSeriesRSI(mockCandles, 14);
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);

      // Stagnant price action (flat market) evaluates to 50
      const flatCandles = Array.from({ length: 20 }, (_, idx) => ({
        timestamp: 1000 + idx * 60,
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 10,
      }));
      expect(calculateSeriesRSI(flatCandles, 14)).toBe(50);

      // Monotonically falling candles evaluate to 0
      const fallingCandles = Array.from({ length: 20 }, (_, idx) => ({
        timestamp: 1000 + idx * 60,
        open: 100 - idx,
        high: 100 - idx,
        low: 99 - idx,
        close: 99 - idx,
        volume: 10,
      }));
      expect(calculateSeriesRSI(fallingCandles, 14)).toBe(0);

      const ema = calculateSeriesEMA(mockCandles, 20);
      expect(ema).toBeGreaterThan(90000);

      const sma = calculateSeriesSMA(mockCandles, 20);
      expect(sma).toBeGreaterThan(90000);

      const bb = calculateSeriesBollinger(mockCandles, 20, 2.0);
      expect(bb.upper).toBeGreaterThan(bb.middle);
      expect(bb.middle).toBeGreaterThan(bb.lower);
    });

    it('calculates advanced quantitative indicators (MACD, Stochastic, ATR, VWAP, Volume Surge, ADX, CCI, Williams %R)', () => {
      const macd = calculateSeriesMACD(mockCandles, 12, 26, 9);
      expect(macd).toBeDefined();
      expect(typeof macd.macd).toBe('number');
      expect(typeof macd.signal).toBe('number');
      expect(typeof macd.histogram).toBe('number');

      const stoch = calculateSeriesStochastic(mockCandles, 14, 3);
      expect(stoch.k).toBeGreaterThanOrEqual(0);
      expect(stoch.k).toBeLessThanOrEqual(100);
      expect(stoch.d).toBeGreaterThanOrEqual(0);
      expect(stoch.d).toBeLessThanOrEqual(100);

      const atr = calculateSeriesATR(mockCandles, 14);
      expect(atr).toBeGreaterThan(0);

      const vwap = calculateSeriesVWAP(mockCandles);
      expect(vwap).toBeGreaterThan(90000);

      const surge = calculateSeriesVolumeSurge(mockCandles, 20);
      expect(surge).toBeGreaterThan(0);

      const adx = calculateSeriesADX(mockCandles, 14);
      expect(adx.adx).toBeGreaterThanOrEqual(0);
      expect(adx.adx).toBeLessThanOrEqual(100);

      const cci = calculateSeriesCCI(mockCandles, 20);
      expect(typeof cci).toBe('number');

      const willR = calculateSeriesWilliamsR(mockCandles, 14);
      expect(willR).toBeLessThanOrEqual(0);
      expect(willR).toBeGreaterThanOrEqual(-100);
    });

    it('evaluates custom agent against context with limit order pricing and martingale sizing', async () => {
      const context: IAgentContext = {
        market: mockMarket,
        spotTicker: {
          symbol: 'BTC/USD',
          price: 96500,
          change1m: 0.002,
          change5m: 0.005,
          timestamp: Date.now(),
        },
        depth: { yesBids: [], yesAsks: [] },
        activeSessions: [mockSession],
      };

      const decision = await evaluator.evaluate(mockCustomAgent, context, mockSession);
      expect(decision).toBeDefined();
      expect(decision.agentType).toBe('CUSTOM');

      evaluator.recordTradeAttempt(mockCustomAgent.id);
      expect(evaluator.getLastTradeTime(mockCustomAgent.id)).toBeGreaterThan(0);
    });

    it('holds when agent is inactive or market is near expiry', async () => {
      const inactiveAgent: CustomAgentDefinition = {
        ...mockCustomAgent,
        isActive: false,
      };

      const context: IAgentContext = {
        market: mockMarket,
        spotTicker: {
          symbol: 'BTC/USD',
          price: 96500,
          change1m: 0,
          change5m: 0,
          timestamp: Date.now(),
        },
        depth: { yesBids: [], yesAsks: [] },
        activeSessions: [mockSession],
      };

      const decision = await evaluator.evaluate(inactiveAgent, context);
      expect(decision.action).toBe('HOLD');
      expect(decision.confidence).toBe(0);

      // Expired market
      const expiredMarket: Market = {
        ...mockMarket,
        closeTimestamp: new Date(Date.now() + 5000).toISOString(), // 5s left < 15s
      };

      const decisionNearExpiry = await evaluator.evaluate(mockCustomAgent, { ...context, market: expiredMarket });
      expect(decisionNearExpiry.action).toBe('HOLD');
    });

    it('enforces take-profit target lock and daily drawdown breaker guardrails', async () => {
      const lockedAgent: CustomAgentDefinition = {
        ...mockCustomAgent,
        allocatedAllowance: 100,
        pnl: 35.0, // 35% profit > 30% takeProfitTargetPct
      };

      const context: IAgentContext = {
        market: mockMarket,
        spotTicker: {
          symbol: 'BTC/USD',
          price: 96500,
          change1m: 0.002,
          change5m: 0.005,
          timestamp: Date.now(),
        },
        depth: { yesBids: [], yesAsks: [] },
        activeSessions: [mockSession],
      };

      const tpDecision = await evaluator.evaluate(lockedAgent, context, mockSession);
      expect(tpDecision.action).toBe('HOLD');
      expect(tpDecision.rationale).toContain('locked profits');

      const drawdownAgent: CustomAgentDefinition = {
        ...mockCustomAgent,
        allocatedAllowance: 100,
        pnl: -25.0, // 25% drawdown > 20% dailyDrawdownLimitPct
      };

      const ddDecision = await evaluator.evaluate(drawdownAgent, context, mockSession);
      expect(ddDecision.action).toBe('HOLD');
      expect(ddDecision.rationale).toContain('drawdown circuit breaker');
    });

    it('calculates consecutive streak correctly across various trade sequences', () => {
      // Empty
      expect(calculateConsecutiveStreak([])).toBe(0);

      // Unsettled orders are ignored
      expect(
        calculateConsecutiveStreak([
          { isSettled: false, pnl: -10, createdAt: new Date(1000).toISOString() },
        ])
      ).toBe(0);

      // Winning streak
      expect(
        calculateConsecutiveStreak([
          { isSettled: true, pnl: 5, createdAt: new Date(1000).toISOString() },
          { isSettled: true, pnl: 10, createdAt: new Date(2000).toISOString() },
          { isSettled: true, pnl: 2, createdAt: new Date(3000).toISOString() },
        ])
      ).toBe(3);

      // Winning streak then losing streak
      expect(
        calculateConsecutiveStreak([
          { isSettled: true, pnl: 10, createdAt: new Date(1000).toISOString() },
          { isSettled: true, pnl: -5, createdAt: new Date(2000).toISOString() },
          { isSettled: true, pnl: -3, createdAt: new Date(3000).toISOString() },
        ])
      ).toBe(-2);

      // Losing streak then winning
      expect(
        calculateConsecutiveStreak([
          { isSettled: true, pnl: -5, createdAt: new Date(1000).toISOString() },
          { isSettled: true, pnl: -3, createdAt: new Date(2000).toISOString() },
          { isSettled: true, pnl: 8, createdAt: new Date(3000).toISOString() },
        ])
      ).toBe(1);
    });

    it('enforces consecutive loss circuit breaker and halts trading when streak limit reached', async () => {
      const streakAgent: CustomAgentDefinition = {
        ...mockCustomAgent,
        rules: {
          ...mockCustomAgent.rules,
          risk: {
            ...mockCustomAgent.rules.risk,
            maxConsecutiveLosses: 3,
          },
        },
      };

      const context: IAgentContext = {
        market: mockMarket,
        spotTicker: {
          symbol: 'BTC/USD',
          price: 96500,
          change1m: 0.002,
          change5m: 0.005,
          timestamp: Date.now(),
        },
        depth: { yesBids: [], yesAsks: [] },
        activeSessions: [mockSession],
      };

      // 3 consecutive settled losses
      const losingOrders = [
        {
          id: 'ord-loss-1',
          userAddress: streakAgent.userAddress as any,
          marketId: mockMarket.id,
          agentType: 'CUSTOM' as const,
          customAgentId: streakAgent.id,
          outcome: 'YES' as const,
          direction: 'BUY' as const,
          orderType: 'MARKET' as const,
          price: 0.5,
          lotSize: 10,
          totalCost: 5,
          status: 'SETTLED' as const,
          isSettled: true,
          pnl: -5.0,
          createdAt: new Date(Date.now() - 300000).toISOString(),
          settledAt: new Date(Date.now() - 250000).toISOString(),
        },
        {
          id: 'ord-loss-2',
          userAddress: streakAgent.userAddress as any,
          marketId: mockMarket.id,
          agentType: 'CUSTOM' as const,
          customAgentId: streakAgent.id,
          outcome: 'YES' as const,
          direction: 'BUY' as const,
          orderType: 'MARKET' as const,
          price: 0.5,
          lotSize: 10,
          totalCost: 5,
          status: 'SETTLED' as const,
          isSettled: true,
          pnl: -5.0,
          createdAt: new Date(Date.now() - 200000).toISOString(),
          settledAt: new Date(Date.now() - 150000).toISOString(),
        },
        {
          id: 'ord-loss-3',
          userAddress: streakAgent.userAddress as any,
          marketId: mockMarket.id,
          agentType: 'CUSTOM' as const,
          customAgentId: streakAgent.id,
          outcome: 'YES' as const,
          direction: 'BUY' as const,
          orderType: 'MARKET' as const,
          price: 0.5,
          lotSize: 10,
          totalCost: 5,
          status: 'SETTLED' as const,
          isSettled: true,
          pnl: -5.0,
          createdAt: new Date(Date.now() - 100000).toISOString(),
          settledAt: new Date(Date.now() - 50000).toISOString(),
        },
      ];

      vi.spyOn(orderService, 'getOrdersForCustomAgent').mockResolvedValue(losingOrders as any);

      const decision = await evaluator.evaluate(streakAgent, context, mockSession);
      expect(decision.action).toBe('HOLD');
      expect(decision.rationale).toBe(
        'Consecutive loss limit reached (streak: 3 >= 3). Halting to protect capital.'
      );

      // If there are only 2 losses and max is 3, circuit breaker should not trip
      vi.spyOn(orderService, 'getOrdersForCustomAgent').mockResolvedValue(losingOrders.slice(0, 2) as any);
      const decision2 = await evaluator.evaluate(streakAgent, context, mockSession);
      expect(decision2.rationale).not.toContain('Consecutive loss limit reached');
    });

    it('does not apply Martingale multiplier on Trade #1 (0 losses) and scales lotSize only on active loss streak', async () => {
      const martingaleAgent: CustomAgentDefinition = {
        ...mockCustomAgent,
        rules: {
          ...mockCustomAgent.rules,
          conditions: [
            {
              id: 'cond-1',
              indicator: 'RSI',
              operator: 'GREATER_THAN',
              value: 0,
            },
          ],
          action: {
            ...mockCustomAgent.rules.action,
            stakeAmount: 10,
          },
          risk: {
            ...mockCustomAgent.rules.risk,
            maxConsecutiveLosses: 3,
            martingaleMultiplier: 1.5,
          },
        },
      };

      const context: IAgentContext = {
        market: mockMarket,
        spotTicker: {
          symbol: 'BTC/USD',
          price: 96500,
          change1m: 0.002,
          change5m: 0.005,
          timestamp: Date.now(),
        },
        depth: { yesBids: [], yesAsks: [] },
        activeSessions: [mockSession],
      };

      // Trade #1: 0 previous trades / 0 losses
      vi.spyOn(orderService, 'getOrdersForCustomAgent').mockResolvedValue([]);
      const maidenDecision = await evaluator.evaluate(martingaleAgent, context, mockSession);
      expect(maidenDecision.action).not.toBe('HOLD');
      expect(evaluator.getActiveLossStreak(martingaleAgent.id)).toBe(0);

      // Trade #2: 1 consecutive loss -> 1.5x stake
      const singleLossOrder = [
        {
          id: 'ord-loss-1',
          userAddress: martingaleAgent.userAddress as any,
          marketId: mockMarket.id,
          agentType: 'CUSTOM' as const,
          customAgentId: martingaleAgent.id,
          outcome: 'YES' as const,
          direction: 'BUY' as const,
          orderType: 'MARKET' as const,
          price: 0.5,
          lotSize: 10,
          totalCost: 5,
          status: 'SETTLED' as const,
          isSettled: true,
          pnl: -5.0,
          createdAt: new Date(Date.now() - 60000).toISOString(),
          settledAt: new Date(Date.now() - 30000).toISOString(),
        },
      ];
      vi.spyOn(orderService, 'getOrdersForCustomAgent').mockResolvedValue(singleLossOrder as any);
      const singleLossDecision = await evaluator.evaluate(martingaleAgent, context, mockSession);
      expect(singleLossDecision.action).not.toBe('HOLD');
      expect(evaluator.getActiveLossStreak(martingaleAgent.id)).toBe(1);
      // singleLoss lotSize should be higher than maiden trade lotSize (1.5x stake vs 1.0x stake)
      expect(singleLossDecision.lotSize!).toBeGreaterThan(maidenDecision.lotSize!);

      // Trade #3: 2 consecutive losses -> 2.25x stake
      const doubleLossOrders = [
        ...singleLossOrder,
        {
          id: 'ord-loss-2',
          userAddress: martingaleAgent.userAddress as any,
          marketId: mockMarket.id,
          agentType: 'CUSTOM' as const,
          customAgentId: martingaleAgent.id,
          outcome: 'YES' as const,
          direction: 'BUY' as const,
          orderType: 'MARKET' as const,
          price: 0.5,
          lotSize: 15,
          totalCost: 7.5,
          status: 'SETTLED' as const,
          isSettled: true,
          pnl: -7.5,
          createdAt: new Date(Date.now() - 20000).toISOString(),
          settledAt: new Date(Date.now() - 10000).toISOString(),
        },
      ];
      vi.spyOn(orderService, 'getOrdersForCustomAgent').mockResolvedValue(doubleLossOrders as any);
      const doubleLossDecision = await evaluator.evaluate(martingaleAgent, context, mockSession);
      expect(doubleLossDecision.action).not.toBe('HOLD');
      expect(evaluator.getActiveLossStreak(martingaleAgent.id)).toBe(2);
      expect(doubleLossDecision.lotSize!).toBeGreaterThan(singleLossDecision.lotSize!);

      // Trade #4: Followed by a win -> streak resets to 0, stake reverts to base
      const winAfterLossOrders = [
        ...doubleLossOrders,
        {
          id: 'ord-win-3',
          userAddress: martingaleAgent.userAddress as any,
          marketId: mockMarket.id,
          agentType: 'CUSTOM' as const,
          customAgentId: martingaleAgent.id,
          outcome: 'YES' as const,
          direction: 'BUY' as const,
          orderType: 'MARKET' as const,
          price: 0.5,
          lotSize: 22,
          totalCost: 11,
          status: 'SETTLED' as const,
          isSettled: true,
          pnl: 11.0,
          createdAt: new Date(Date.now() - 5000).toISOString(),
          settledAt: new Date(Date.now() - 2000).toISOString(),
        },
      ];
      vi.spyOn(orderService, 'getOrdersForCustomAgent').mockResolvedValue(winAfterLossOrders as any);
      const winDecision = await evaluator.evaluate(martingaleAgent, context, mockSession);
      expect(winDecision.action).not.toBe('HOLD');
      expect(evaluator.getActiveLossStreak(martingaleAgent.id)).toBe(0);
      expect(winDecision.lotSize).toBe(maidenDecision.lotSize);
    });
  });
});
