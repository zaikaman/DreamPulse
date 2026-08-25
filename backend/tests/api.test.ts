import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';

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
});
