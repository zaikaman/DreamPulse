import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { settlementService } from '../src/services/settlement-service.js';
import { marketService } from '../src/services/market-service.js';
import { orderService } from '../src/services/order-service.js';
import { somniaExchange, publicClient } from '../src/config/somnia.js';
import type { Market } from '../src/types/index.js';

describe('Express REST API Endpoints', () => {
  beforeAll(() => {
    vi.spyOn(somniaExchange.client, 'listBinaryMarkets').mockResolvedValue([] as any);
    vi.spyOn(publicClient as any, 'multicall').mockResolvedValue([] as any);

    const testOnchainMarket: Market = {
      id: '0x1111111111111111111111111111111111111111111111111111111111111111',
      symbol: 'BTC/USD',
      strikePrice: 96500,
      windowDuration: '15m',
      openTimestamp: new Date().toISOString(),
      closeTimestamp: new Date(Date.now() + 600000).toISOString(),
      resolutionTimestamp: new Date(Date.now() + 660000).toISOString(),
      status: 'Open',
      bestBidYes: 0.49,
      bestAskYes: 0.51,
      bestBidNo: 0.49,
      bestAskNo: 0.51,
      impliedProbYes: 0.50,
      fairValueYes: 0.50,
      edgePercentage: 0,
      convictionState: 'NEUTRAL',
      recommendedAction: 'WAIT',
      recommendedOutcome: 'NONE',
      winProbability: 50,
      confidenceScore: 50,
      priceActionTrend: 'NEUTRAL',
      priceActionScore: 50,
      poolAddress: '0x2222222222222222222222222222222222222222',
      marketIdHex: '0x1111111111111111111111111111111111111111111111111111111111111111',
      isSynthetic: false,
    };
    (marketService as any).markets.set(testOnchainMarket.id, testOnchainMarket);
    (marketService as any).markets.set('test-market-id', { ...testOnchainMarket, id: 'test-market-id' });
  });

  it('GET /api/health returns ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('DreamPulse Engine');
  });

  it('GET /api/v1/markets returns list of active contracts', async () => {
    const res = await request(app).get('/api/v1/markets');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('strikePrice');
    expect(res.body.data[0]).toHaveProperty('fairValueYes');
  });

  it('GET /api/v1/markets/:id/depth returns order book depth levels for known market', async () => {
    const res = await request(app).get('/api/v1/markets/test-market-id/depth');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.depth).toHaveProperty('yesBids');
    expect(res.body.depth).toHaveProperty('yesAsks');
  });

  it('GET /api/v1/markets/:id/depth returns 404 for unknown market id', async () => {
    const res = await request(app).get('/api/v1/markets/unknown-random-market-12345/depth');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('not found');
  });

  it('POST /api/v1/sessions/register creates a non-custodial session', async () => {
    const payload = {
      userAddress: '0x1234567890123456789012345678901234567890',
      operatorAddress: '0x0987654321098765432109876543210987654321',
      maxTradeSize: 15.0,
      dailyVolumeCap: 150.0,
    };

    const res = await request(app).post('/api/v1/sessions/register').send(payload);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.session.isActive).toBe(true);
    expect(res.body.session.userAddress).toBe(payload.userAddress);
  });

  it('GET /api/v1/agents/status returns swarm telemetry', async () => {
    const res = await request(app).get('/api/v1/agents/status');
    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveProperty('volt');
    expect(res.body.agents).toHaveProperty('oracle');
    expect(res.body.agents).toHaveProperty('titan');
    expect(res.body.agents).toHaveProperty('sweeper');
  });

  it('GET /api/v1/sweeper/summary returns live unclaimed and settlement metrics', async () => {
    const res = await request(app).get('/api/v1/sweeper/summary?userAddress=0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('unclaimedAmount');
    expect(res.body.data).toHaveProperty('totalClaimedAllTime');
    expect(res.body.data).toHaveProperty('unclaimedPositions');
  });

  it('GET /api/v1/sweeper/unclaimed scans positions across finalized markets', async () => {
    const res = await request(app).get('/api/v1/sweeper/unclaimed?userAddress=0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('totalUnclaimedAmount');
    expect(Array.isArray(res.body.positions)).toBe(true);
  });

  it('POST /api/v1/sweeper/trigger executes batch sweep and returns claim confirmation', async () => {
    vi.spyOn(settlementService, 'triggerBatchSweep').mockResolvedValueOnce({
      success: true,
      claimedMarketsCount: 1,
      totalClaimedAmount: '10.00 tUSDC',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      sweeps: [],
    });

    const res = await request(app)
      .post('/api/v1/sweeper/trigger')
      .send({ userAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.txHash).toMatch(/^0x[a-f0-9]{64}$/i);
    expect(res.body.claimedMarketsCount).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v1/orders returns paginated orders with total fills and executed volume', async () => {
    const res = await request(app).get('/api/v1/orders?page=1&pageSize=10');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('totalFills');
    expect(res.body).toHaveProperty('totalVolume');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('pageSize', 10);
    expect(res.body).toHaveProperty('totalPages');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.totalVolume).toBe('number');
  });

  it('GET /api/v1/orders?swarmOnly=true filters exclusively to canonical operator swarm orders', async () => {
    const res = await request(app).get('/api/v1/orders?swarmOnly=true&page=1&pageSize=10');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('totalFills');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /api/v1/orders/place rejects missing or invalid parameters', async () => {
    const res1 = await request(app).post('/api/v1/orders/place').send({});
    expect(res1.status).toBe(400);
    expect(res1.body.success).toBe(false);

    const res2 = await request(app).post('/api/v1/orders/place').send({
      userAddress: 'invalid-address',
      marketId: 'test-market-id',
      outcome: 'YES',
      price: 0.5,
      lotSize: 10,
    });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toContain('Valid userAddress is required');
  });

  it('POST /api/v1/orders/place records client-signed order with txHash', async () => {
    const payload = {
      userAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      marketId: 'test-market-id',
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'LIMIT',
      price: 0.45,
      lotSize: 20,
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    };

    const res = await request(app).post('/api/v1/orders/place').send(payload);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.price).toBe(0.45);
    expect(res.body.data.lotSize).toBe(20);
    expect(res.body.data.outcome).toBe('YES');
    expect(res.body.data.status).toBe('FILLED');
    expect(res.body.data.source).toBe('TERMINAL');
    expect(res.body.data.agentType).toBe('Manual');
    expect(res.body.data.txHash).toBe(payload.txHash);

    // Verify GET /api/v1/orders with source filter
    const termRes = await request(app).get(`/api/v1/orders?userAddress=${payload.userAddress}&source=TERMINAL`);
    expect(termRes.status).toBe(200);
    expect(termRes.body.data.some((o: any) => o.id === res.body.data.id)).toBe(true);

    const swarmRes = await request(app).get(`/api/v1/orders?userAddress=${payload.userAddress}&source=SWARM`);
    expect(swarmRes.status).toBe(200);
    expect(swarmRes.body.data.some((o: any) => o.id === res.body.data.id)).toBe(false);
  });

  it('POST /api/v1/orders/:id/cancel cancels a resting limit order and returns updated status', async () => {
    const payload = {
      userAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      marketId: '0x1111111111111111111111111111111111111111111111111111111111111111',
      outcome: 'NO',
      direction: 'BUY',
      orderType: 'LIMIT',
      price: 0.35,
      lotSize: 10,
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    };

    const placeRes = await request(app).post('/api/v1/orders/place').send(payload);
    expect(placeRes.status).toBe(201);
    const orderId = placeRes.body.data.id;

    // Simulate resting status on the CLOB book
    const order = orderService.getOrderById(orderId);
    if (order) order.status = 'PENDING';

    const cancelRes = await request(app)
      .post(`/api/v1/orders/${orderId}/cancel`)
      .send({ userAddress: payload.userAddress });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.success).toBe(true);
    expect(cancelRes.body.data.status).toBe('CANCELLED');
    expect(cancelRes.body).toHaveProperty('txHash');
  });

  it('POST /api/v1/swarm/toggle-copytrade enables and disables autonomous copy-trading', async () => {
    const user = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    // Toggle ON
    const resOn = await request(app)
      .post('/api/v1/swarm/toggle-copytrade')
      .send({ userAddress: user, enabled: true });
    expect(resOn.status).toBe(200);
    expect(resOn.body.success).toBe(true);
    expect(resOn.body.config.copyTradeEnabled).toBe(true);

    // Check config
    const resCfg1 = await request(app).get(`/api/v1/swarm/my-config?userAddress=${user}`);
    expect(resCfg1.status).toBe(200);
    expect(resCfg1.body.config.copyTradeEnabled).toBe(true);

    // Toggle OFF
    const resOff = await request(app)
      .post('/api/v1/swarm/toggle-copytrade')
      .send({ userAddress: user, enabled: false });
    expect(resOff.status).toBe(200);
    expect(resOff.body.success).toBe(true);
    expect(resOff.body.config.copyTradeEnabled).toBe(false);

    // Check config
    const resCfg2 = await request(app).get(`/api/v1/swarm/my-config?userAddress=${user}`);
    expect(resCfg2.status).toBe(200);
    expect(resCfg2.body.config.copyTradeEnabled).toBe(false);
  });

  it('GET /api/v1/analytics/equity and /api/v1/analytics/balance-history', async () => {
    const res1 = await request(app).get('/api/v1/analytics/equity?range=30d&source=ALL');
    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    expect(res1.body.data).toHaveProperty('summary');

    const res2 = await request(app).get('/api/v1/analytics/balance-history?range=7d&source=SWARM');
    expect(res2.status).toBe(200);
    expect(res2.body.success).toBe(true);
  });

  it('GET /api/v1/arena/leaderboard/* and /api/v1/arena/stats endpoints return rankings', async () => {
    const agentsRes = await request(app).get('/api/v1/arena/leaderboard/agents');
    expect(agentsRes.status).toBe(200);
    expect(agentsRes.body.success).toBe(true);

    const tradersRes = await request(app).get('/api/v1/arena/leaderboard/traders');
    expect(tradersRes.status).toBe(200);
    expect(tradersRes.body.success).toBe(true);

    const statsRes = await request(app).get('/api/v1/arena/stats');
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.success).toBe(true);
  });

  it('GET /api/v1/portfolio/summary returns portfolio metrics', async () => {
    const res = await request(app).get('/api/v1/portfolio/summary?userAddress=0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('realizedPnl');
  });

  it('GET /api/v1/markets/pools/future and /api/v1/markets/:id/depth', async () => {
    const resPools = await request(app).get('/api/v1/markets/pools/future?horizonHours=24');
    expect(resPools.status).toBe(200);
    expect(resPools.body.success).toBe(true);

    const resDepth = await request(app).get('/api/v1/markets/test-market-id/depth');
    expect(resDepth.status).toBe(200);
    expect(resDepth.body.success).toBe(true);
  });

  it('POST /api/v1/backtest/run executes historical backtest simulation', async () => {
    const res = await request(app)
      .post('/api/v1/backtest/run')
      .send({
        agentType: 'Volt',
        symbol: 'BTC/USD',
        period: '7d',
        timeframe: '5m',
        initialCapital: 1000,
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('manages custom agents and custom swarms via API routes', async () => {
    const user = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    // List agents
    const listRes = await request(app).get(`/api/v1/agents/custom?userAddress=${user}`);
    expect(listRes.status).toBe(200);

    // Create custom swarm
    const swarmRes = await request(app)
      .post('/api/v1/swarms/custom')
      .send({
        userAddress: user,
        name: 'Alpha Quant Swarm',
        description: 'Multi-agent high frequency strategy',
        agents: [],
      });
    expect(swarmRes.status).toBe(200);

    // List swarms
    const swarmsList = await request(app).get(`/api/v1/swarms/custom?userAddress=${user}`);
    expect(swarmsList.status).toBe(200);

    // Delete custom swarm
    if (swarmRes.body.data?.id) {
      const delRes = await request(app).delete(`/api/v1/swarms/custom/${swarmRes.body.data.id}?userAddress=${user}`);
      expect(delRes.status).toBe(200);
    }
  });

  it('handles swarm reset and status queries', async () => {
    const user = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    const statusRes = await request(app).get(`/api/v1/swarm/my-status?userAddress=${user}`);
    expect(statusRes.status).toBe(200);

    const resetRes = await request(app).post('/api/v1/swarm/reset').send({ userAddress: user });
    expect(resetRes.status).toBe(200);
  });

  it('GET /api/v1/auth/status and POST /api/v1/auth/logout', async () => {
    const sessRes = await request(app).get('/api/v1/auth/status');
    expect(sessRes.status).toBe(200);
    expect(sessRes.body.success).toBe(true);

    const logoutRes = await request(app).post('/api/v1/auth/logout');
    expect(logoutRes.status).toBe(200);
  });

  describe('CORS and Security Headers', () => {
    it('allows requests from localhost with credentials support', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:5173');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('allows requests from Vercel deployments with credentials support', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://dreampulse-demo.vercel.app');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://dreampulse-demo.vercel.app');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('handles CORS preflight OPTIONS requests cleanly', async () => {
      const res = await request(app)
        .options('/api/v1/markets')
        .set('Origin', 'https://dreampulse.vercel.app')
        .set('Access-Control-Request-Method', 'GET');

      expect([200, 204]).toContain(res.status);
      expect(res.headers['access-control-allow-origin']).toBe('https://dreampulse.vercel.app');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('blocks disallowed origins when custom origin list is configured', async () => {
      const express = (await import('express')).default;
      const cors = (await import('cors')).default;
      const { errorHandler } = await import('../src/api/middleware.js');

      const customApp = express();
      const customAllowedOrigins = ['https://dreampulse.vercel.app'];
      customApp.use(
        cors({
          origin: (origin, callback) => {
            if (!origin || customAllowedOrigins.includes('*')) {
              return callback(null, true);
            }
            const normalizedOrigin = origin.replace(/\/+$/, '');
            try {
              const url = new URL(normalizedOrigin);
              const hostname = url.hostname.toLowerCase();
              if (
                customAllowedOrigins.includes(normalizedOrigin) ||
                hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname === 'vercel.app' ||
                hostname.endsWith('.vercel.app')
              ) {
                return callback(null, true);
              }
            } catch {
              if (customAllowedOrigins.includes(normalizedOrigin)) {
                return callback(null, true);
              }
            }
            return callback(new Error('Not allowed by CORS'));
          },
          credentials: true,
        })
      );
      customApp.get('/test', (_req, res) => res.json({ ok: true }));
      customApp.use(errorHandler);

      const okRes = await request(customApp)
        .get('/test')
        .set('Origin', 'https://dreampulse.vercel.app');
      expect(okRes.status).toBe(200);
      expect(okRes.headers['access-control-allow-origin']).toBe('https://dreampulse.vercel.app');

      const blockedRes = await request(customApp)
        .get('/test')
        .set('Origin', 'https://malicious-external-site.com');
      expect(blockedRes.status).toBe(403);
      expect(blockedRes.body.error).toBe('Not allowed by CORS');
    });
  });

  it('GET /api/v1/agents/logs returns live agent logs payload', async () => {
    const res = await request(app).get('/api/v1/agents/logs');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.logs)).toBe(true);
  });

  it('GET /api/v1/markets/historical, /spot, /anomalies, and /debug/market/:id', async () => {
    const histRes = await request(app).get('/api/v1/markets/historical?limit=10');
    expect(histRes.status).toBe(200);
    expect(histRes.body.success).toBe(true);

    const spotRes = await request(app).get('/api/v1/markets/spot');
    expect(spotRes.status).toBe(200);
    expect(spotRes.body.success).toBe(true);

    const anomalyRes = await request(app).get('/api/v1/markets/anomalies');
    expect(anomalyRes.status).toBe(200);
    expect(anomalyRes.body.success).toBe(true);

    const debugRes = await request(app).get('/api/v1/debug/market/test-market-id');
    expect(debugRes.status).toBe(200);
    expect(debugRes.body.found).toBe(true);

    const debugNotFound = await request(app).get('/api/v1/debug/market/non-existent-market');
    expect(debugNotFound.status).toBe(200);
    expect(debugNotFound.body.found).toBe(false);
  });

  it('handles auth/wallet-verify, session nonces, reset-spend, and allowance-status', async () => {
    const testUser = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    // GET /sessions/:userAddress/nonce
    const nonceRes = await request(app).get(`/api/v1/sessions/${testUser}/nonce`);
    expect(nonceRes.status).toBe(200);
    expect(nonceRes.body.success).toBe(true);
    expect(typeof nonceRes.body.nextNonce).toBe('number');

    // GET /sessions/:userAddress
    const sessionRes = await request(app).get(`/api/v1/sessions/${testUser}`);
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.success).toBe(true);

    // POST /sessions/:userAddress/reset-spend on user without active session returns 404
    const resetSpendNotFound = await request(app).post(`/api/v1/sessions/${testUser}/reset-spend`);
    expect(resetSpendNotFound.status).toBe(404);

    // POST /sessions/:id/revoke with non-existent session
    const revokeRes = await request(app).post(`/api/v1/sessions/non-existent-uuid/revoke`);
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.revoked).toBe(false);

    // GET /sessions/:userAddress/allowance-status
    const allowRes = await request(app).get(`/api/v1/sessions/${testUser}/allowance-status`);
    expect(allowRes.status).toBe(200);
    expect(allowRes.body.success).toBe(true);

    // POST /auth/wallet-verify rejection on missing fields
    const badVerify = await request(app).post('/api/v1/auth/wallet-verify').send({});
    expect(badVerify.status).toBe(400);
  });

  it('manages agents/detailed, toggle, config, and swarm fine-grained routes', async () => {
    const testUser = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    const { operatorAccount } = await import('../src/config/somnia.js');

    // GET /agents/detailed
    const detailRes = await request(app).get('/api/v1/agents/detailed');
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.success).toBe(true);

    // POST /agents/toggle with operator address
    const toggleRes = await request(app)
      .post('/api/v1/agents/toggle')
      .set('x-operator-address', operatorAccount.address)
      .set('x-user-address', operatorAccount.address)
      .send({
        operatorAddress: operatorAccount.address,
        userAddress: operatorAccount.address,
        agentType: 'VOLT',
        enabled: false,
      });
    expect([200, 403]).toContain(toggleRes.status);

    // POST /agents/config with operator address
    const agentCfgRes = await request(app)
      .post('/api/v1/agents/config')
      .set('x-operator-address', operatorAccount.address)
      .set('x-user-address', operatorAccount.address)
      .send({
        operatorAddress: operatorAccount.address,
        userAddress: operatorAccount.address,
        agentType: 'VOLT',
        config: { driftThreshold: 0.003 },
      });
    expect([200, 403]).toContain(agentCfgRes.status);


    // PUT /swarm/my-config
    const putCfg = await request(app).put('/api/v1/swarm/my-config').send({
      userAddress: testUser,
      updates: { mode: 'PERSONAL', voltEnabled: true },
    });
    expect(putCfg.status).toBe(200);

    // POST /swarm/mode
    const modeRes = await request(app).post('/api/v1/swarm/mode').send({
      userAddress: testUser,
      mode: 'PERSONAL',
    });
    expect(modeRes.status).toBe(200);

    // POST /swarm/toggle
    const swarmToggle = await request(app).post('/api/v1/swarm/toggle').send({
      userAddress: testUser,
      agentType: 'oracle',
      enabled: true,
    });
    expect(swarmToggle.status).toBe(200);

    // POST /swarm/config
    const swarmCfg = await request(app).post('/api/v1/swarm/config').send({
      userAddress: testUser,
      agentType: 'titan',
      config: { targetSpread: 0.04 },
    });
    expect(swarmCfg.status).toBe(200);
  });

  it('handles orders/:id, sweeper/history, and backtest/history', async () => {
    // GET /orders/:id
    const orderRes = await request(app).get('/api/v1/orders/random-missing-order-id');
    expect(orderRes.status).toBe(404);

    // GET /sweeper/history
    const sweepHist = await request(app).get('/api/v1/sweeper/history?limit=5');
    expect(sweepHist.status).toBe(200);
    expect(sweepHist.body.success).toBe(true);

    // GET /backtest/history
    const btHist = await request(app).get('/api/v1/backtest/history?limit=5');
    expect(btHist.status).toBe(200);
    expect(btHist.body.success).toBe(true);
  });

  it('manages custom agent creation, lifecycle, and AI strategy generation', async () => {
    const testUser = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    // POST /agents/custom
    const createRes = await request(app).post('/api/v1/agents/custom').send({
      userAddress: testUser,
      name: 'Custom Breakout Alpha',
      role: 'SNIPER',
      targetAsset: 'BTC/USD',
      rules: {
        entry: { condition: 'RSI_OVERSOLD', threshold: 30 },
        action: { direction: 'CALL', lotSize: 5 },
      },
    });
    expect(createRes.status).toBe(200);
    expect(createRes.body.success).toBe(true);
    const agentId = createRes.body.data.id;

    // GET /agents/custom/:id
    const getRes = await request(app).get(`/api/v1/agents/custom/${agentId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.name).toBe('Custom Breakout Alpha');

    // PUT /agents/custom/:id
    const putRes = await request(app).put(`/api/v1/agents/custom/${agentId}`).send({
      userAddress: testUser,
      name: 'Updated Alpha Name',
    });
    expect(putRes.status).toBe(200);

    // POST /agents/custom/:id/deploy
    const deployRes = await request(app).post(`/api/v1/agents/custom/${agentId}/deploy`).send({
      userAddress: testUser,
    });
    expect(deployRes.status).toBe(200);

    // POST /agents/custom/:id/pause
    const pauseRes = await request(app).post(`/api/v1/agents/custom/${agentId}/pause`).send({
      userAddress: testUser,
    });
    expect(pauseRes.status).toBe(200);

    // POST /agents/custom/:id/allowance
    const allowRes = await request(app).post(`/api/v1/agents/custom/${agentId}/allowance`).send({
      userAddress: testUser,
      allowance: 50,
    });
    expect(allowRes.status).toBe(200);

    // POST /agents/generate (Strategy Studio LLM synthesis)
    const genRes = await request(app).post('/api/v1/agents/generate').send({
      prompt: 'High-frequency momentum sniper on ETH breakouts',
    });
    expect(genRes.status).toBe(200);
    expect(genRes.body.success).toBe(true);

    // Reject dummy address 0x000...001 on POST /agents/custom
    const rejectDummyRes = await request(app).post('/api/v1/agents/custom').send({
      userAddress: '0x0000000000000000000000000000000000000001',
      name: 'Dummy Fail Strategy',
      rules: { entry: { condition: 'RSI_OVERSOLD' } },
    });
    expect(rejectDummyRes.status).toBe(400);
    expect(rejectDummyRes.body.success).toBe(false);
    expect(rejectDummyRes.body.error).toContain('Valid user wallet address is required');

    // Reject dummy address on deploy
    const rejectDeployRes = await request(app).post(`/api/v1/agents/custom/${agentId}/deploy`).send({
      userAddress: '0x0000000000000000000000000000000000000001',
    });
    expect(rejectDeployRes.status).toBe(400);
    expect(rejectDeployRes.body.success).toBe(false);

    // DELETE /agents/custom/:id
    const delRes = await request(app).delete(`/api/v1/agents/custom/${agentId}?userAddress=${testUser}`);
    expect(delRes.status).toBe(200);
  });

  it('handles arena social, analytics, copytrade, and profile endpoints', async () => {
    const testUser = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    const targetUser = '0x327e766EB317e5A3FA6dB30c0A5b9735Ad1aEdae';

    // GET /arena/trader/:address/profile
    const traderRes = await request(app).get(`/api/v1/arena/trader/${testUser}/profile`);
    expect(traderRes.status).toBe(200);

    // GET /arena/leaderboard/agents
    const agentRes = await request(app).get('/api/v1/arena/leaderboard/agents');
    expect(agentRes.status).toBe(200);

    // GET /arena/stats
    const statsRes = await request(app).get('/api/v1/arena/stats');
    expect(statsRes.status).toBe(200);

    // POST /arena/copytrade/toggle
    const toggleCopyRes = await request(app).post('/api/v1/arena/copytrade/toggle').send({
      userAddress: testUser,
      targetAddress: targetUser,
      enabled: true,
    });
    expect(toggleCopyRes.status).toBe(200);

    // GET /arena/copytrade/status
    const copyStatus = await request(app).get(`/api/v1/arena/copytrade/status?userAddress=${testUser}&targetAddress=${targetUser}`);
    expect(copyStatus.status).toBe(200);

    // GET /arena/copytrade/following
    const followingRes = await request(app).get(`/api/v1/arena/copytrade/following?userAddress=${testUser}`);
    expect(followingRes.status).toBe(200);
  });
});



