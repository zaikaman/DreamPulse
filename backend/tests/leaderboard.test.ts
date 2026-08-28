import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { apiRouter } from '../src/api/routes.js';
import { leaderboardService } from '../src/services/leaderboard-service.js';
import { customAgentService } from '../src/services/custom-agent-service.js';
import { orderService } from '../src/services/order-service.js';

describe('Swarm Arena & Strategy Leaderboard Tests', () => {
  let app: express.Express;
  const testUser = '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A';

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api', apiRouter);

    // Record a genuine terminal order for testUser
    await orderService.submitUserOrder({
      userAddress: testUser as `0x${string}`,
      marketId: '0x1111111111111111111111111111111111111111',
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'IOC',
      price: 0.5,
      lotSize: 20,
      txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });

    // Seed at least two Swarm agent executions so the arena (which now only shows agents
    // with ≥1 trade/order) is non-empty. Inject directly into OrderService in-memory store
    // to avoid on-chain gas / allowance coupling in unit tests.
    const nowIso = new Date().toISOString();
    const { randomUUID } = await import('crypto');
    const injectSwarmOrder = (agentType: 'Volt' | 'Oracle' | 'Titan', pnl: number) => {
      const id = randomUUID();
      const order: any = {
        id,
        userAddress: '0x0000000000000000000000000000000000000001' as `0x${string}`,
        sessionId: undefined,
        marketId: '0x2222222222222222222222222222222222222222',
        agentType,
        source: 'SWARM' as const,
        outcome: 'YES' as const,
        direction: 'BUY' as const,
        orderType: 'IOC' as const,
        price: 0.52,
        lotSize: 10,
        totalCost: 5.2,
        status: 'FILLED' as const,
        txHash: `0x${'b'.repeat(64)}` as `0x${string}`,
        pnl,
        isSettled: true,
        settledAt: nowIso,
        createdAt: nowIso,
        filledAt: nowIso,
        marketSnapshot: {
          symbol: agentType === 'Oracle' ? 'ETH/USD' : 'BTC/USD',
          strikePrice: agentType === 'Oracle' ? 3200 : 68000,
          closeTimestamp: new Date(Date.now() + 300000).toISOString(),
          windowDuration: agentType === 'Titan' ? '15m' : agentType === 'Oracle' ? '5m' : '1m',
        },
      };
      (orderService as any).orders.unshift(order);
      (orderService as any).orderMap.set(id, order);
      // Ensure state cache invalidation mirrors real execution path
      (orderService as any).notifyStateChange?.();
    };

    injectSwarmOrder('Volt', 12.5);
    injectSwarmOrder('Volt', 8.0);
    injectSwarmOrder('Oracle', 5.0);
    injectSwarmOrder('Titan', 3.5);
  });

  describe('Leaderboard Service Unit Tests', () => {
    it('ranks AI agents by PnL and computes Sharpe and tier badges', async () => {
      const result = await leaderboardService.getAgentLeaderboard({
        timeframe: '7d',
        sortBy: 'pnl',
      });

      expect(result.count).toBeGreaterThan(0);
      expect(result.data.length).toBeGreaterThan(0);
      // All arena agents must have executed at least one trade/order
      for (const a of result.data) {
        expect(a.tradesCount).toBeGreaterThan(0);
      }

      // Verify #1 ranked agent has APEX tier badge
      const topAgent = result.data[0];
      expect(topAgent.rank).toBe(1);
      expect(topAgent.tierBadge).toBe('APEX');
      if (result.data.length > 1) {
        expect(topAgent.pnl).toBeGreaterThanOrEqual(result.data[1].pnl);
      }
      expect(topAgent.sharpeRatio).toBeGreaterThanOrEqual(0);
      expect(topAgent.sparkline.length).toBe(8);
    });

    it('filters agent leaderboard by symbol and strategyType', async () => {
      const btcResult = await leaderboardService.getAgentLeaderboard({
        symbol: 'BTC/USD',
      });
      for (const agent of btcResult.data) {
        expect(agent.symbol === 'BTC/USD' || agent.symbol === 'ALL').toBe(true);
        expect(agent.tradesCount).toBeGreaterThan(0);
      }

      const momentumResult = await leaderboardService.getAgentLeaderboard({
        strategyType: 'MOMENTUM',
      });
      for (const agent of momentumResult.data) {
        expect(agent.strategyType).toBe('MOMENTUM');
        expect(agent.tradesCount).toBeGreaterThan(0);
      }
    });

    it('excludes agents with zero trades from arena leaderboard', async () => {
      const all = await leaderboardService.getAgentLeaderboard({ timeframe: 'ALL' });
      // Every returned agent must have at least one trade
      for (const a of all.data) {
        expect(a.tradesCount).toBeGreaterThan(0);
      }
      // Starter templates with zero trades should not appear at all
      const starterIds = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'];
      for (const id of starterIds) {
        expect(all.data.some((a) => a.id === id)).toBe(false);
      }
    });

    it('ranks human traders and computes win streaks and Copilot synergy', async () => {
      const result = await leaderboardService.getTraderLeaderboard({
        range: '7d',
        sortBy: 'pnl',
      });

      expect(result.data.length).toBeGreaterThan(0);
      const topTrader = result.data[0];
      expect(topTrader.rank).toBe(1);
      expect(topTrader.tierBadge).toBe('APEX');
      expect(topTrader.realizedPnl).toBeGreaterThanOrEqual(0);
      expect(topTrader.copilotSynergyScore).toBeGreaterThanOrEqual(0);
      expect(topTrader.copilotSynergyScore).toBeLessThanOrEqual(100);
      expect(topTrader.userAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('retrieves detailed trader profile with distribution and equity curve', async () => {
      const profile = await leaderboardService.getTraderProfile(testUser);
      expect(profile).not.toBeNull();
      expect(profile!.summary.userAddress.toLowerCase()).toBe(testUser.toLowerCase());
      expect(profile!.assetDistribution.length).toBeGreaterThan(0);
      expect(profile!.timeframeDistribution.length).toBeGreaterThan(0);
      expect(profile!.equityCurve.length).toBeGreaterThan(0);
    });

    it('clones an agent strategy into a user custom agent copy', async () => {
      const agents = await leaderboardService.getAgentLeaderboard({});
      const targetAgent = agents.data[0];

      const cloned = await leaderboardService.cloneAgentStrategy(targetAgent.id, testUser);
      expect(cloned).not.toBeNull();
      expect(cloned!.userAddress.toLowerCase()).toBe(testUser.toLowerCase());
      expect(cloned!.name).toContain('(Clone)');
      expect(cloned!.isDeployed).toBe(false);
      expect(cloned!.rules).toBeDefined();
    });

    it('computes global arena statistics', async () => {
      const stats = await leaderboardService.getArenaStats();
      expect(stats.totalArenaVolume).toBeGreaterThanOrEqual(0);
      expect(stats.totalCommunityPnl).toBeDefined();
      expect(stats.totalActiveAgents).toBeGreaterThan(0);
      expect(stats.apexWinStreak).toBeGreaterThanOrEqual(0);
    });
  });

  describe('REST Endpoints Integration', () => {
    it('GET /api/arena/leaderboard/agents returns ranked agents list', async () => {
      const res = await request(app).get('/api/arena/leaderboard/agents?timeframe=7d&sortBy=pnl');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].tierBadge).toBe('APEX');
      for (const a of res.body.data) {
        expect(a.tradesCount).toBeGreaterThan(0);
      }
    });

    it('GET /api/arena/leaderboard/traders returns ranked human traders', async () => {
      const res = await request(app).get('/api/arena/leaderboard/traders?range=7d&sortBy=winRate');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0].winRate).toBeGreaterThanOrEqual(res.body.data[1]?.winRate || 0);
    });

    it('GET /api/arena/trader/:address/profile returns detailed trader profile', async () => {
      const res = await request(app).get(`/api/arena/trader/${testUser}/profile`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBeDefined();
      expect(res.body.data.assetDistribution).toBeDefined();
    });

    it('POST /api/arena/agent/:id/clone clones an agent strategy', async () => {
      const agentsRes = await request(app).get('/api/arena/leaderboard/agents');
      const agentId = agentsRes.body.data[0].id;

      const cloneRes = await request(app)
        .post(`/api/arena/agent/${agentId}/clone`)
        .send({ userAddress: testUser });

      expect(cloneRes.status).toBe(201);
      expect(cloneRes.body.success).toBe(true);
      expect(cloneRes.body.data.name).toContain('(Clone)');
    });

    it('POST /api/arena/copytrade/toggle configures copy-trading', async () => {
      const res = await request(app)
        .post('/api/arena/copytrade/toggle')
        .send({
          userAddress: testUser,
          targetAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
          enabled: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.config.copyTradeEnabled).toBe(true);
    });

    it('GET /api/arena/stats returns aggregate platform statistics', async () => {
      const res = await request(app).get('/api/arena/stats');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalArenaVolume).toBeGreaterThanOrEqual(0);
      expect(res.body.data.totalCommunityPnl).toBeDefined();
    });
  });
});
