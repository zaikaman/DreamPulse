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
    const res = await request(app).get('/api/v1/sweeper/summary?userAddress=0x15C7e8CE38F021c5b45d098AaD788f63090bF20A');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('unclaimedAmount');
    expect(res.body.data).toHaveProperty('totalClaimedAllTime');
    expect(res.body.data).toHaveProperty('compoundedStats');
  });

  it('GET /api/v1/sweeper/unclaimed scans positions across finalized markets', async () => {
    const res = await request(app).get('/api/v1/sweeper/unclaimed?userAddress=0x15C7e8CE38F021c5b45d098AaD788f63090bF20A');
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
      .send({ userAddress: '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A', autoCompound: true });
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
      userAddress: '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A',
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
    expect(res.body.data.txHash).toBe(payload.txHash);
  });
});
