import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { sessionService } from '../src/services/session-service.js';
import { orderService } from '../src/services/order-service.js';
import { marketService } from '../src/services/market-service.js';
import { socialCopyService } from '../src/services/social-copy-service.js';
import { operatorAccount, somniaExchange } from '../src/config/somnia.js';
import type { Market } from '../src/types/index.js';
import type { Address, Hex } from 'viem';

describe('Social Forecaster Mirror Trading', () => {
  const forecasterAddress = '0x327e766EB317e5A3FA6dB30c0A5b9735Ad1aEdae';
  const copierAddress = '0x46cC04De981E603958e4612f877D72427c5b6544';
  let mockMarketId: string;

  beforeEach(async () => {
    // Clear in-memory caches
    orderService.clearCache();

    // Register active mock onchain market
    const now = Date.now();
    const marketIdHex = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
    const market: Market = {
      id: marketIdHex,
      marketIdHex,
      poolAddress: '0x2222222222222222222222222222222222222222' as Address,
      symbol: 'BTC/USD',
      strikePrice: 95000,
      windowDuration: '5m',
      openTimestamp: new Date(now - 60000).toISOString(),
      closeTimestamp: new Date(now + 240000).toISOString(),
      resolutionTimestamp: new Date(now + 300000).toISOString(),
      status: 'Open',
      bestBidYes: 0.48,
      bestAskYes: 0.52,
      bestBidNo: 0.48,
      bestAskNo: 0.52,
      impliedProbYes: 0.50,
      fairValueYes: 0.50,
      edgePercentage: 0.04,
    };
    (marketService as any).markets.set(market.id, market);
    mockMarketId = market.id;

    vi.spyOn(somniaExchange.client, 'getMarketOnchain').mockResolvedValue({
      pool: '0x2222222222222222222222222222222222222222' as Address,
      status: 1, // Trading
      expiry: BigInt(Math.floor(Date.now() / 1000) + 300),
      outcomeToken: '0x3333333333333333333333333333333333333333' as Address,
      yesId: 1n,
      noId: 2n,
      collateral: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E' as Address,
    } as any);

    vi.spyOn(somniaExchange.trader, 'placeOrder').mockImplementation(async (params: any) => {
      return {
        hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        orderId: 101n,
        fills: [{ quantityFilled: params.quantity }],
        receipt: { status: 'success' },
      } as any;
    });

    // Register active session for Copier
    await sessionService.registerSession({
      userAddress: copierAddress,
      operatorAddress: operatorAccount.address,
      maxTradeSize: 100,
      dailyVolumeCap: 1000,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      onChainAuthorized: true,
      copyTradeEnabled: true,
    });

    // Register active session for Forecaster
    await sessionService.registerSession({
      userAddress: forecasterAddress,
      operatorAddress: operatorAccount.address,
      maxTradeSize: 100,
      dailyVolumeCap: 1000,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      onChainAuthorized: true,
      copyTradeEnabled: false,
    });
  });

  it('allows copier to toggle social mirror on forecaster', async () => {
    const res = await request(app)
      .post('/api/arena/copytrade/toggle')
      .send({
        userAddress: copierAddress,
        targetAddress: forecasterAddress,
        enabled: true,
        maxTradeSize: 50,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isCopying).toBe(true);
    expect(res.body.config.copierAddress.toLowerCase()).toBe(copierAddress.toLowerCase());
    expect(res.body.config.targetAddress.toLowerCase()).toBe(forecasterAddress.toLowerCase());

    // Check status endpoint
    const statusRes = await request(app)
      .get(`/api/arena/copytrade/status?userAddress=${copierAddress}&targetAddress=${forecasterAddress}`);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.success).toBe(true);
    expect(statusRes.body.isCopying).toBe(true);
    expect(statusRes.body.config.maxTradeSize).toBe(50);

    // Check following endpoint
    const followingRes = await request(app)
      .get(`/api/arena/copytrade/following?userAddress=${copierAddress}`);

    expect(followingRes.status).toBe(200);
    expect(followingRes.body.success).toBe(true);
    expect(followingRes.body.count).toBe(1);
    expect(followingRes.body.data[0].targetAddress.toLowerCase()).toBe(forecasterAddress.toLowerCase());
  });

  it('automatically executes mirror trade for copier when forecaster places manual trade', async () => {
    // 1. Activate social copy
    await socialCopyService.toggleSocialCopy(copierAddress, forecasterAddress, true, 50);
    expect(socialCopyService.isUserCopyingTarget(copierAddress, forecasterAddress)).toBe(true);

    // 2. Forecaster places a manual trade in Trade Terminal
    const forecasterOrder = await orderService.submitUserOrder({
      userAddress: forecasterAddress as any,
      marketId: mockMarketId,
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'IOC',
      price: 0.55,
      lotSize: 10,
    });

    expect(forecasterOrder).toBeDefined();
    expect(forecasterOrder.userAddress.toLowerCase()).toBe(forecasterAddress.toLowerCase());
    expect(forecasterOrder.status).toBe('FILLED');

    // Allow async non-blocking social copy dispatch to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 3. Query Trade Terminal history for Copier
    const copierOrders = orderService.getOrders({
      userAddress: copierAddress,
      marketId: mockMarketId,
      source: 'TERMINAL',
    });

    expect(copierOrders.length).toBe(1);
    const copiedOrder = copierOrders[0];
    expect(copiedOrder.userAddress.toLowerCase()).toBe(copierAddress.toLowerCase());
    expect(copiedOrder.marketId).toBe(mockMarketId);
    expect(copiedOrder.outcome).toBe('YES');
    expect(copiedOrder.price).toBe(0.55);
    expect(copiedOrder.lotSize).toBe(10);
    expect(copiedOrder.status).toBe('FILLED');
    expect(copiedOrder.source).toBe('TERMINAL');
    expect(copiedOrder.agentType).toBe('Manual');

    // 4. Check that Copier's session recorded the spend
    const copierSession = await sessionService.getUserActiveSession(copierAddress);
    expect(copierSession?.spentToday).toBeGreaterThan(0);
  });

  it('does not mirror trades when copier disables mirror toggle', async () => {
    // Turn off copy trading
    await socialCopyService.toggleSocialCopy(copierAddress, forecasterAddress, false);
    expect(socialCopyService.isUserCopyingTarget(copierAddress, forecasterAddress)).toBe(false);

    // Forecaster places order
    await orderService.submitUserOrder({
      userAddress: forecasterAddress as any,
      marketId: mockMarketId,
      outcome: 'NO',
      direction: 'BUY',
      orderType: 'IOC',
      price: 0.45,
      lotSize: 5,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Copier should have NO orders for this market
    const copierOrders = orderService.getOrders({
      userAddress: copierAddress,
      marketId: mockMarketId,
      source: 'TERMINAL',
    });
    expect(copierOrders.length).toBe(0);
  });

  it('caps copied position size according to configured maxTradeSize', async () => {
    // Copier sets maxTradeSize of $2.50 tUSDC
    await socialCopyService.toggleSocialCopy(copierAddress, forecasterAddress, true, 2.50, 500);

    // Forecaster places a large 20-lot order at $0.50 ($10 total cost)
    await orderService.submitUserOrder({
      userAddress: forecasterAddress as any,
      marketId: mockMarketId,
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'IOC',
      price: 0.50,
      lotSize: 20,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Copier order should be capped at $2.50 / $0.50 = 5 lots
    const copierOrders = orderService.getOrders({
      userAddress: copierAddress,
      marketId: mockMarketId,
      source: 'TERMINAL',
    });

    expect(copierOrders.length).toBe(1);
    expect(copierOrders[0].lotSize).toBe(5);
    expect(copierOrders[0].totalCost).toBeCloseTo(2.50, 2);
  });

  it('respects per-forecaster daily volume cap and pauses copy trades when exceeded', async () => {
    // Copier sets daily cap of $5.00 tUSDC
    await socialCopyService.toggleSocialCopy(copierAddress, forecasterAddress, true, 50, 5.00);

    // Trade 1: Forecaster places order costing $4.00 (8 lots at $0.50) -> should be mirrored
    await orderService.submitUserOrder({
      userAddress: forecasterAddress as any,
      marketId: mockMarketId,
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'IOC',
      price: 0.50,
      lotSize: 8,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    let copierOrders = orderService.getOrders({
      userAddress: copierAddress,
      marketId: mockMarketId,
      source: 'TERMINAL',
    });
    expect(copierOrders.length).toBe(1);

    // Trade 2: Forecaster places another order costing $4.00 -> would exceed $5 daily cap ($4 + $4 = $8 > $5)
    await orderService.submitUserOrder({
      userAddress: forecasterAddress as any,
      marketId: mockMarketId,
      outcome: 'NO',
      direction: 'BUY',
      orderType: 'IOC',
      price: 0.50,
      lotSize: 8,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    copierOrders = orderService.getOrders({
      userAddress: copierAddress,
      marketId: mockMarketId,
      source: 'TERMINAL',
    });
    // Still only 1 copied order because 2nd was skipped due to daily volume cap
    expect(copierOrders.length).toBe(1);
  });
});
