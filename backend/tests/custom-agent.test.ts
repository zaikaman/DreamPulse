import { describe, it, expect, beforeEach } from 'vitest';
import { CustomAgentService, customAgentService, STARTER_TEMPLATES } from '../src/services/custom-agent-service.js';
import type { Address } from 'viem';
import type { CustomAgentDefinition } from '../src/types/index.js';

describe('CustomAgentService Comprehensive Suite', () => {
  const userAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;

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

    it('covers getCustomAgentById, updateCustomAgent, setAgentAllowance, and permission checks', async () => {
      const template = STARTER_TEMPLATES[0];
      const found = await service.getCustomAgentById(template.id);
      expect(found).toBeDefined();

      const notFound = await service.getCustomAgentById('non-existent-agent-id');
      expect(notFound).toBeNull();

      // Set allowance
      const updatedAllow = await service.setAgentAllowance(template.id, template.userAddress, 250);
      expect(updatedAllow?.allocatedAllowance).toBe(250);

      // Update custom agent
      const updatedAgent = await service.updateCustomAgent(template.id, {
        name: 'Renamed Template Agent',
      }, template.userAddress);
      expect(updatedAgent?.name).toBe('Renamed Template Agent');

      // Update with wrong user address on a user-owned agent (throws Forbidden error)
      const userAgent = await service.createCustomAgent({
        userAddress,
        name: 'My Protected Alpha',
        symbol: 'BTC/USD',
        timeframe: '5m',
        strategyType: 'MOMENTUM',
        rules: {},
        isActive: true,
      } as any);

      const otherUser = '0x1111222233334444555566667777888899990000' as Address;
      await expect(service.updateCustomAgent(userAgent.id, { name: 'Hack' }, otherUser)).rejects.toThrow('Forbidden');

      // Delete with wrong user address throws Forbidden
      await expect(service.deleteCustomAgent(userAgent.id, otherUser)).rejects.toThrow('Forbidden');

      // Delete with correct user address returns true
      const validDelete = await service.deleteCustomAgent(userAgent.id, userAddress);
      expect(validDelete).toBe(true);

      // getActiveDeployedAgents
      const deployed = await service.getActiveDeployedAgents();
      expect(Array.isArray(deployed)).toBe(true);
    });
  });
});
