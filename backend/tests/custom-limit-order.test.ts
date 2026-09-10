import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { orderService } from '../src/services/order-service.js';
import { marketService } from '../src/services/market-service.js';
import { sessionService } from '../src/services/session-service.js';
import type { Market, SessionGrant } from '../src/types/index.js';
import type { Address } from 'viem';

describe('Custom Limit & Advanced Order Placement Tests', () => {
  const testWallet = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
  const testMarketId = 'market-custom-limit-test-1';

  const mockMarket: Market = {
    id: testMarketId,
    symbol: 'BTC/USD',
    strikePrice: 90000,
    windowDuration: '15m',
    openTimestamp: new Date(Date.now() - 60000).toISOString(),
    closeTimestamp: new Date(Date.now() + 600000).toISOString(),
    resolutionTimestamp: new Date(Date.now() + 600000).toISOString(),
    status: 'Open',
    bestBidYes: 0.40,
    bestAskYes: 0.42,
    bestBidNo: 0.58,
    bestAskNo: 0.60,
    impliedProbYes: 0.41,
    fairValueYes: 0.41,
    edgePercentage: 0.02,
    marketIdHex: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    poolAddress: '0x1111111111111111111111111111111111111111',
  };

  const mockSession: SessionGrant = {
    id: 'session-limit-test-1',
    userAddress: testWallet as Address,
    operatorAddress: testWallet as Address,
    permissions: ['placeOrderFor', 'cancelOrderFor'],
    maxTradeSize: 500,
    dailyVolumeCap: 5000,
    spentToday: 0,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    isActive: true,
  };

  beforeEach(() => {
    vi.spyOn(marketService, 'getMarketById').mockReturnValue(mockMarket);
    vi.spyOn(sessionService, 'getUserActiveSession').mockResolvedValue(mockSession as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('successfully places a custom LIMIT order at $0.35', async () => {
    const res = await request(app)
      .post('/api/v1/orders/place')
      .set('x-wallet-address', testWallet)
      .send({
        userAddress: testWallet,
        marketId: testMarketId,
        outcome: 'YES',
        orderType: 'LIMIT',
        price: 0.35,
        lotSize: 10,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orderType).toBe('LIMIT');
    expect(res.body.data.price).toBe(0.35);
    expect(res.body.data.outcome).toBe('YES');
  });

  it('rejects a LIMIT order if price is outside 0.01 - 0.99', async () => {
    const resLow = await request(app)
      .post('/api/v1/orders/place')
      .set('x-wallet-address', testWallet)
      .send({
        userAddress: testWallet,
        marketId: testMarketId,
        outcome: 'YES',
        orderType: 'LIMIT',
        price: 0.0,
        lotSize: 10,
      });

    expect(resLow.status).toBe(400);
    expect(resLow.body.error).toContain('Price must be between 0.01 and 0.99');

    const resHigh = await request(app)
      .post('/api/v1/orders/place')
      .set('x-wallet-address', testWallet)
      .send({
        userAddress: testWallet,
        marketId: testMarketId,
        outcome: 'YES',
        orderType: 'LIMIT',
        price: 1.0,
        lotSize: 10,
      });

    expect(resHigh.status).toBe(400);
    expect(resHigh.body.error).toContain('Price must be between 0.01 and 0.99');
  });

  it('successfully places an advanced STOP_LIMIT order with triggerPrice and limit price', async () => {
    const res = await request(app)
      .post('/api/v1/orders/place')
      .set('x-wallet-address', testWallet)
      .send({
        userAddress: testWallet,
        marketId: testMarketId,
        outcome: 'YES',
        orderType: 'STOP_LIMIT',
        triggerPrice: 0.30,
        price: 0.32,
        lotSize: 5,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orderType).toBe('STOP_LIMIT');
    expect(res.body.data.triggerPrice).toBe(0.30);
    expect(res.body.data.price).toBe(0.32);
    expect(res.body.data.status).toBe('PENDING');
  });

  it('successfully places an advanced TAKE_PROFIT_MARKET order with triggerPrice', async () => {
    const res = await request(app)
      .post('/api/v1/orders/place')
      .set('x-wallet-address', testWallet)
      .send({
        userAddress: testWallet,
        marketId: testMarketId,
        outcome: 'YES',
        orderType: 'TAKE_PROFIT_MARKET',
        triggerPrice: 0.65,
        lotSize: 5,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orderType).toBe('TAKE_PROFIT_MARKET');
    expect(res.body.data.triggerPrice).toBe(0.65);
    expect(res.body.data.status).toBe('PENDING');
  });

  it('rejects trigger orders without valid triggerPrice', async () => {
    const res = await request(app)
      .post('/api/v1/orders/place')
      .set('x-wallet-address', testWallet)
      .send({
        userAddress: testWallet,
        marketId: testMarketId,
        outcome: 'YES',
        orderType: 'STOP_MARKET',
        lotSize: 5,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Trigger price must be between 0.01 and 0.99');
  });
});
