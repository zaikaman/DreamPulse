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
});
