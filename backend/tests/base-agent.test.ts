import { describe, it, expect, vi } from 'vitest';
import { BaseAgent, type IAgentDecision, type IAgentContext } from '../src/agents/base-agent.js';
import type { SessionGrant, OrderExecution, SettlementSweep } from '../src/types/index.js';

class ConcreteTestAgent extends BaseAgent {
  public readonly agentType = 'Volt' as const;

  public async evaluate(context: IAgentContext): Promise<IAgentDecision> {
    return {
      agentType: 'Volt',
      action: 'TAKER_BUY',
      targetMarketId: context.market.id,
      targetOutcome: 'YES',
      price: 0.50,
      lotSize: 10,
      confidence: 0.8,
      rationale: 'Test',
    };
  }

  public async execute(decision: IAgentDecision, session: SessionGrant): Promise<OrderExecution | SettlementSweep | null> {
    return null;
  }

  public testEmitThought(thought: any) {
    this.emitThought(thought);
  }
}

describe('BaseAgent Abstract Class & Risk Validation Suite', () => {
  const mockSession: SessionGrant = {
    id: 'sess-base-1',
    userAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    operatorAddress: '0x93e300607c363E7D7a47e50f5c9fDf1723e859Cf',
    permissions: ['placeOrderFor', 'cancelOrderFor'],
    maxTradeSize: 20.0,
    dailyVolumeCap: 200.0,
    spentToday: 0.0,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    isActive: true,
  };

  it('initializes agent and emits initialized event', async () => {
    const agent = new ConcreteTestAgent();
    const spy = vi.fn();
    agent.on('initialized', spy);

    await agent.initialize();
    expect(spy).toHaveBeenCalledWith({ agentType: 'Volt' });
  });

  it('validates risk limits on active sessions', () => {
    const agent = new ConcreteTestAgent({ maxTradeSize: 15, maxDailyVolume: 150 });

    const validDecision: IAgentDecision = {
      agentType: 'Volt',
      action: 'TAKER_BUY',
      targetMarketId: 'm-1',
      price: 0.50,
      lotSize: 20, // 0.50 * 20 = 10.0 <= 15
      confidence: 0.9,
      rationale: 'Ok',
    };

    expect(agent.validateRisk(validDecision, mockSession)).toBe(true);

    // Trade cost exceeds single trade limit
    const oversizedDecision: IAgentDecision = {
      agentType: 'Volt',
      action: 'TAKER_BUY',
      targetMarketId: 'm-1',
      price: 0.50,
      lotSize: 40, // 20.0 > 15
      confidence: 0.9,
      rationale: 'Too big',
    };
    expect(agent.validateRisk(oversizedDecision, mockSession)).toBe(false);

    // Cumulative volume cap breach
    const cappedSession: SessionGrant = {
      ...mockSession,
      spentToday: 145.0,
    };
    expect(agent.validateRisk(validDecision, cappedSession)).toBe(false);

    // Inactive or expired session
    const inactiveSession: SessionGrant = {
      ...mockSession,
      isActive: false,
    };
    expect(agent.validateRisk(validDecision, inactiveSession)).toBe(false);

    const expiredSession: SessionGrant = {
      ...mockSession,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    expect(agent.validateRisk(validDecision, expiredSession)).toBe(false);

    // HOLD and CANCEL_QUOTE always pass risk check
    const holdDecision: IAgentDecision = {
      agentType: 'Volt',
      action: 'HOLD',
      targetMarketId: 'm-1',
      confidence: 0,
      rationale: 'Holding',
    };
    expect(agent.validateRisk(holdDecision, mockSession)).toBe(true);
  });

  it('emits transparent thought logs', () => {
    const agent = new ConcreteTestAgent();
    const spy = vi.fn();
    agent.on('thought', spy);

    agent.testEmitThought({
      agentType: 'Volt',
      marketId: 'm-1',
      timestamp: Date.now(),
      rationale: 'Analyzing book imbalance',
    });

    expect(spy).toHaveBeenCalled();
  });
});
