import { describe, it, expect, beforeEach } from 'vitest';
import { customAgentService, STARTER_TEMPLATES } from '../src/services/custom-agent-service.js';
import { customAgentEvaluator } from '../src/agents/custom-agent-evaluator.js';
import type { CustomAgentDefinition, Market, SessionGrant } from '../src/types/index.js';
import type { IAgentContext } from '../src/agents/base-agent.js';

describe('Custom Deployed Agents & Evaluation Engine', () => {
  const testUser = '0x327e766eb317e5a3fa6db30c0a5b9735ad1aedae';

  it('preserves pristine starter templates while loading deployed agents', async () => {
    // Other clean user
    const otherUser = '0x9999999999999999999999999999999999999999';
    const otherAgents = await customAgentService.getCustomAgents(otherUser);

    expect(otherAgents.length).toBeGreaterThanOrEqual(3);
    const template3 = otherAgents.find((a) => a.id === '00000000-0000-0000-0000-000000000003');
    expect(template3).toBeDefined();
    expect(template3?.userAddress).toBe('0x0000000000000000000000000000000000000000');
    expect(template3?.isDeployed).toBe(false);

    // Target user who deployed Fast EMA Momentum Rider
    const userAgents = await customAgentService.getCustomAgents(testUser);
    const deployedFastEMA = userAgents.find((a) => a.name === 'Fast EMA Momentum Rider' && a.isDeployed);
    expect(deployedFastEMA).toBeDefined();
    expect(deployedFastEMA?.isDeployed).toBe(true);
    expect(deployedFastEMA?.allocatedAllowance).toBe(200);
  });

  it('getActiveDeployedAgents returns active deployed custom agents', async () => {
    const deployed = await customAgentService.getActiveDeployedAgents();
    expect(deployed.length).toBeGreaterThanOrEqual(1);

    const hasFastEMA = deployed.some((a) => a.name === 'Fast EMA Momentum Rider' && a.isDeployed);
    expect(hasFastEMA).toBe(true);
  });

  it('evaluates Fast EMA Momentum Rider rules and generates actionable decision', async () => {
    const agent: CustomAgentDefinition = {
      id: 'test-fast-ema-agent',
      userAddress: testUser,
      name: 'Fast EMA Momentum Rider',
      description: 'Test Fast EMA Momentum Strategy',
      symbol: 'SOL/USD',
      timeframe: '5m',
      strategyType: 'MOMENTUM',
      color: '#3b82f6',
      icon: 'BoltIcon',
      isActive: true,
      isDeployed: true,
      allocatedAllowance: 200,
      spentAllowance: 0,
      createdAt: new Date().toISOString(),
      rules: {
        operator: 'AND',
        conditions: [
          {
            id: 'c-1',
            indicator: 'EMA',
            period: 9,
            secondaryPeriod: 21,
            operator: 'CROSS_ABOVE',
            value: 0,
          },
          {
            id: 'c-2',
            indicator: 'PRICE_DRIFT',
            period: 5,
            operator: 'GREATER_THAN',
            value: 0.0015,
          },
        ],
        action: {
          direction: 'CALL',
          durationSec: 300,
          stakeType: 'FIXED',
          stakeAmount: 20,
        },
        risk: {
          maxConsecutiveLosses: 2,
          cooldownMinutes: 1,
          minPoolPayoutPct: 75,
        },
      },
    };

    const mockMarket: Market = {
      id: '0x3ecC694Cef705358864a646142ac17A90E29e388-SOLUSD-5m-188-1787895207306',
      symbol: 'SOL/USD',
      strikePrice: 188,
      windowDuration: '5m',
      openTimestamp: new Date(Date.now() - 60000).toISOString(),
      closeTimestamp: new Date(Date.now() + 240000).toISOString(),
      resolutionTimestamp: new Date(Date.now() + 240000).toISOString(),
      status: 'Open',
      bestBidYes: 0.49,
      bestAskYes: 0.51,
      bestBidNo: 0.49,
      bestAskNo: 0.51,
      impliedProbYes: 0.5,
      fairValueYes: 0.5,
      edgePercentage: 0.02,
    };

    const mockSession: SessionGrant = {
      id: 'session-test-123',
      userAddress: testUser as any,
      operatorAddress: '0x93e300607c363E7D7a47e50f5c9fDf1723e859Cf' as any,
      permissions: ['placeOrderFor', 'cancelOrderFor'],
      maxTradeSize: 50,
      dailyVolumeCap: 500,
      spentToday: 0,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      isActive: true,
      onChainAuthorized: true,
    };

    const context: IAgentContext = {
      spotTicker: {
        symbol: 'SOL/USD',
        price: 188.5,
        change1m: 0.002,
        change5m: 0.0025, // passes > 0.0015
        timestamp: Date.now(),
      },
      market: mockMarket,
      depth: {
        yesBids: [{ price: 0.49, quantity: 100, total: 49 }],
        yesAsks: [{ price: 0.51, quantity: 100, total: 51 }],
      },
      activeSessions: [mockSession],
    };

    const decision = await customAgentEvaluator.evaluate(agent, context, mockSession);

    expect(decision).toBeDefined();
    expect(decision.agentType).toBe('CUSTOM');
    expect(decision.action).toBe('TAKER_BUY');
    expect(decision.targetOutcome).toBe('YES');
    expect(decision.price).toBeGreaterThan(0.4);
    expect(decision.price).toBeLessThan(0.6);
    expect(decision.lotSize).toBeGreaterThanOrEqual(1);
    expect(decision.confidence).toBeGreaterThanOrEqual(0.88);
    expect(decision.rationale).toContain('Fast EMA Momentum Rider');
  });

  it('rejects execution when bankroll allowance is exhausted', async () => {
    const exhaustedAgent: CustomAgentDefinition = {
      id: 'exhausted-agent',
      userAddress: testUser,
      name: 'Exhausted Strategy',
      description: 'Exhausted allowance test strategy',
      symbol: 'SOL/USD',
      timeframe: '5m',
      strategyType: 'MOMENTUM',
      color: '#ef4444',
      icon: 'ShieldExclamationIcon',
      isActive: true,
      isDeployed: true,
      allocatedAllowance: 100,
      spentAllowance: 100, // No allowance left
      createdAt: new Date().toISOString(),
      rules: {
        operator: 'AND',
        conditions: [],
        action: {
          direction: 'CALL',
          durationSec: 300,
          stakeType: 'FIXED',
          stakeAmount: 10,
        },
        risk: {
          maxConsecutiveLosses: 2,
          cooldownMinutes: 1,
          minPoolPayoutPct: 75,
        },
      },
    };

    const mockMarket: Market = {
      id: '0x3ecC694Cef705358864a646142ac17A90E29e388-SOLUSD-5m-188-1787895207306',
      symbol: 'SOL/USD',
      strikePrice: 188,
      windowDuration: '5m',
      openTimestamp: new Date(Date.now() - 60000).toISOString(),
      closeTimestamp: new Date(Date.now() + 240000).toISOString(),
      resolutionTimestamp: new Date(Date.now() + 240000).toISOString(),
      status: 'Open',
      bestBidYes: 0.49,
      bestAskYes: 0.51,
      bestBidNo: 0.49,
      bestAskNo: 0.51,
      impliedProbYes: 0.5,
      fairValueYes: 0.5,
      edgePercentage: 0.02,
    };

    const context: IAgentContext = {
      spotTicker: { symbol: 'SOL/USD', price: 188, change1m: 0, change5m: 0, timestamp: Date.now() },
      market: mockMarket,
      depth: { yesBids: [], yesAsks: [] },
      activeSessions: [],
    };

    const decision = await customAgentEvaluator.evaluate(exhaustedAgent, context);
    expect(decision.action).toBe('HOLD');
    expect(decision.rationale).toContain('allowance exhausted');
  });

  it('records trade fills and settlements updating metrics', async () => {
    const dummy = await customAgentService.createCustomAgent({
      userAddress: '0x0000000000000000000000000000000000000002',
      name: 'Unit Test Isolated Agent',
      description: 'Isolated test agent for metrics',
      symbol: 'SOL/USD',
      timeframe: '5m',
      strategyType: 'MOMENTUM',
      color: '#3b82f6',
      icon: 'BoltIcon',
      isActive: true,
      rules: {
        operator: 'AND',
        conditions: [],
        action: { direction: 'CALL', durationSec: 300, stakeType: 'FIXED', stakeAmount: 10 },
        risk: { maxConsecutiveLosses: 2, cooldownMinutes: 1, minPoolPayoutPct: 75 },
      },
    });
    const testId = dummy.id;

    try {
      const initial = await customAgentService.getCustomAgentById(testId);
      expect(initial).toBeDefined();

      const initialTrades = initial?.tradesCount ?? 0;
      const initialSpent = initial?.spentAllowance ?? 0;

      await customAgentService.recordTradeFill(testId, 15.5);
      const afterFill = await customAgentService.getCustomAgentById(testId);
      expect(afterFill?.tradesCount).toBe(initialTrades + 1);
      expect(afterFill?.spentAllowance).toBe(Number((initialSpent + 15.5).toFixed(4)));

      await customAgentService.recordTradeSettlement(testId, 12.0, true);
      const afterSettlement = await customAgentService.getCustomAgentById(testId);
      expect(afterSettlement?.pnl).toBe(Number(((initial?.pnl ?? 0) + 12.0).toFixed(2)));
      expect(afterSettlement?.winRate).toBeGreaterThan(0);
    } finally {
      await customAgentService.deleteCustomAgent(testId, dummy.userAddress);
    }
  });
});
