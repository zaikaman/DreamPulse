import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MultiAgentSwarmRunner } from '../src/agents/swarm-runner.js';
import {
  CustomAgentEvaluator,
  calculateSeriesRSI,
  calculateSeriesEMA,
  calculateSeriesSMA,
  calculateSeriesBollinger,
} from '../src/agents/custom-agent-evaluator.js';
import { marketService } from '../src/services/market-service.js';
import { sessionService } from '../src/services/session-service.js';
import { operatorAccount } from '../src/config/somnia.js';
import type { Market, SessionGrant, CustomAgentDefinition } from '../src/types/index.js';
import type { IAgentContext } from '../src/agents/base-agent.js';
import type { HistoricalCandle } from '../src/services/backtest-service.js';

describe('SwarmRunner, CustomAgentEvaluator & Agent System Suite', () => {
  const userAddress = operatorAccount.address;

  const mockSession: SessionGrant = {
    id: 'sess-eval-1234',
    userAddress,
    operatorAddress: operatorAccount.address,
    permissions: ['placeOrderFor', 'cancelOrderFor'],
    maxTradeSize: 50,
    dailyVolumeCap: 500,
    spentToday: 0,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    isActive: true,
  };

  const mockMarket: Market = {
    id: 'market-btc-runner-1',
    symbol: 'BTC/USD',
    windowDuration: '5m',
    strikePrice: 96000,
    openTimestamp: new Date(Date.now() - 60000).toISOString(),
    closeTimestamp: new Date(Date.now() + 240000).toISOString(),
    status: 'Open',
    bestBidYes: 0.48,
    bestAskYes: 0.52,
    bestBidNo: 0.48,
    bestAskNo: 0.52,
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

    const mockCandles: HistoricalCandle[] = Array.from({ length: 30 }, (_, i) => ({
      timestamp: Date.now() - (30 - i) * 60000,
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
        },
        risk: {
          maxConsecutiveLosses: 2,
          cooldownMinutes: 3,
          minPoolPayoutPct: 75,
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

      const ema = calculateSeriesEMA(mockCandles, 20);
      expect(ema).toBeGreaterThan(90000);

      const sma = calculateSeriesSMA(mockCandles, 20);
      expect(sma).toBeGreaterThan(90000);

      const bb = calculateSeriesBollinger(mockCandles, 20, 2.0);
      expect(bb.upper).toBeGreaterThan(bb.middle);
      expect(bb.middle).toBeGreaterThan(bb.lower);
    });

    it('evaluates custom agent against context and records trade attempt', async () => {
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
  });
});
