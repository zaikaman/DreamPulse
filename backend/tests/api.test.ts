import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { settlementService } from '../src/services/settlement-service.js';

describe('Express REST API Endpoints', () => {
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

  it('GET /api/v1/markets/:id/depth returns order book depth levels', async () => {
    const res = await request(app).get('/api/v1/markets/test-market-id/depth');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.depth).toHaveProperty('yesBids');
    expect(res.body.depth).toHaveProperty('yesAsks');
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

  it('GET /api/v1/sweeper/summary returns live unclaimed and compounding metrics', async () => {
    const res = await request(app).get('/api/v1/sweeper/summary?userAddress=0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('unclaimedAmount');
    expect(res.body.data).toHaveProperty('totalClaimedAllTime');
    expect(res.body.data).toHaveProperty('compoundedStats');
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
      .send({ userAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', autoCompound: true });
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
});

