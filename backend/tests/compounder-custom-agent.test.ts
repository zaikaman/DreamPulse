import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CompounderService, compounderService } from '../src/services/compounder-service.js';
import { CustomAgentService, customAgentService, STARTER_TEMPLATES } from '../src/services/custom-agent-service.js';
import { sessionService } from '../src/services/session-service.js';
import { operatorAccount } from '../src/config/somnia.js';
import type { Address } from 'viem';
import type { CustomAgentDefinition } from '../src/types/index.js';

describe('CompounderService & CustomAgentService Comprehensive Suite', () => {
  const userAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
  const poolAddress = '0x2222222222222222222222222222222222222222' as Address;

  describe('CompounderService', () => {
    let service: CompounderService;

    beforeEach(() => {
      service = new CompounderService();
      vi.spyOn(sessionService, 'getUserActiveSession').mockResolvedValue({
        id: 'sess-comp-1',
        userAddress,
        operatorAddress: operatorAccount.address,
        permissions: ['placeOrderFor', 'cancelOrderFor'],
        maxTradeSize: 100,
        dailyVolumeCap: 1000,
        spentToday: 50,
        lastSpendResetTimestamp: Date.now(),
        nonce: 0,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    it('compounds proceeds and updates total compounded amount and cycles', async () => {
      const initialStats = service.getUserCompoundedStats(userAddress);
      expect(initialStats.totalCompoundedAmount).toBe(0);

      const allocation = await service.compoundProceeds(userAddress, 25.5);
      expect(allocation.totalCompoundedAmount).toBe(25.5);
      expect(allocation.reinvestedCycles).toBe(1);

      // Rehydrate / compound again
      const nextAllocation = await service.compoundProceeds(userAddress, 10.0);
      expect(nextAllocation.totalCompoundedAmount).toBe(35.5);
      expect(nextAllocation.reinvestedCycles).toBe(2);
    });

    it('records historical sweeps correctly', () => {
      service.recordHistoricalSweep(userAddress, 50.0, '2026-08-30T10:00:00.000Z');
      const stats = service.getUserCompoundedStats(userAddress);
      expect(stats.totalCompoundedAmount).toBe(50.0);
      expect(stats.reinvestedCycles).toBe(1);
      expect(stats.lastCompoundedAt).toBe('2026-08-30T10:00:00.000Z');
    });
  });

  describe('CustomAgentService', () => {
    let service: CustomAgentService;

    beforeEach(() => {
      service = new CustomAgentService();
    });

    it('loads starter templates in memory on initialization', async () => {
      const agents = await service.getCustomAgents(userAddress);
      expect(agents.length).toBeGreaterThanOrEqual(STARTER_TEMPLATES.length);
      expect(agents.some((a) => a.name.includes('RSI'))).toBe(true);
    });

    it('creates, updates, pauses, deploys, and deletes custom agents in memory', async () => {
      const newAgent: Omit<CustomAgentDefinition, 'id' | 'createdAt'> = {
        userAddress,
        name: 'ETH Breakout Hunter',
        description: 'Enters on 15m Bollinger Band breakouts',
        symbol: 'ETH/USD',
        timeframe: '15m',
        strategyType: 'BREAKOUT',
        color: '#3b82f6',
        icon: 'ChartBarIcon',
        isActive: true,
        isDeployed: false,
        allocatedAllowance: 100,
        spentAllowance: 0,
        rules: {
          operator: 'AND',
          conditions: [
            {
              id: 'c-1',
              indicator: 'BOLLINGER_UPPER',
              period: 20,
              stdDev: 2.0,
              operator: 'GREATER_THAN',
              value: 0,
            },
          ],
          action: {
            direction: 'CALL',
            durationSec: 300,
            stakeType: 'FIXED',
            stakeAmount: 15,
          },
        } as any,
      };

      const created = await service.createCustomAgent(newAgent as any);
      expect(created.id).toBeDefined();
      expect(created.name).toBe('ETH Breakout Hunter');

      // Deploy
      const deployed = await service.deployAgent(created.id, userAddress, 300);
      expect(deployed?.isDeployed).toBe(true);
      expect(deployed?.allocatedAllowance).toBe(300);

      // Pause
      const paused = await service.pauseAgent(created.id, userAddress);
      expect(paused?.isDeployed).toBe(false);

      // Record trade settlement
      await service.recordTradeSettlement(created.id, 12.5, true);

      // Top agents
      const top = await service.getTopCustomAgents(10);
      expect(Array.isArray(top)).toBe(true);

      // Delete
      const deleted = await service.deleteCustomAgent(created.id, userAddress);
      expect(deleted).toBe(true);
    });

    it('manages custom multi-agent swarms', async () => {
      const swarmPayload = {
        userAddress,
        name: 'Alpha Quant Multi-Agent Swarm',
        description: 'Combines mean-reversion and trend following',
        color: '#10b981',
        icon: 'CpuChipIcon',
        agents: [
          {
            agentId: STARTER_TEMPLATES[0].id,
            allocationPercentage: 50,
            priority: 1,
            role: 'Scalper',
          },
        ],
        isActive: true,
      };

      const created = await service.createCustomSwarm(swarmPayload as any);
      expect(created.id).toBeDefined();
      expect(created.name).toBe('Alpha Quant Multi-Agent Swarm');

      const list = await service.getCustomSwarms(userAddress);
      expect(list.length).toBeGreaterThanOrEqual(1);

      const deleted = await service.deleteCustomSwarm(created.id, userAddress);
      expect(deleted).toBe(true);
    });

    it('maps database rows to CustomAgentDefinition structure', () => {
      const row = {
        id: '12345678-1234-1234-1234-123456789012',
        user_address: userAddress,
        name: 'Test DB Agent',
        description: 'Test Description',
        symbol: 'BTC/USD',
        timeframe: '5m',
        strategy_type: 'MOMENTUM',
        rules: {},
        color: '#ff0000',
        icon: 'BoltIcon',
        is_active: true,
        is_deployed: true,
        allocated_allowance: 500,
        spent_allowance: 100,
        pnl: 75.0,
        win_rate: 65,
        trades_count: 20,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const agent = service.mapDbRowToAgent(row);
      expect(agent.id).toBe(row.id);
      expect(agent.userAddress).toBe(userAddress);
      expect(agent.allocatedAllowance).toBe(500);
      expect(agent.pnl).toBe(75.0);
    });
  });
});
