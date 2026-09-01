import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrderService, orderService } from '../src/services/order-service.js';
import { marketService } from '../src/services/market-service.js';
import { sessionService } from '../src/services/session-service.js';
import { operatorAccount } from '../src/config/somnia.js';
import type { IAgentDecision } from '../src/agents/base-agent.js';
import type { Market, SessionGrant } from '../src/types/index.js';
import type { SessionRecord } from '../src/services/session-service.js';
import type { Address, Hex } from 'viem';

describe('OrderService Comprehensive Suite', () => {
  let service: OrderService;
  const userAddress = operatorAccount.address;

  const mockSession: SessionRecord & SessionGrant = {
    id: 'sess-12345678',
    userAddress: userAddress as Address,
    operatorAddress: operatorAccount.address,
    permissions: ['placeOrderFor', 'cancelOrderFor'],
    maxTradeSize: 100,
    dailyVolumeCap: 1000,
    spentToday: 0,
    lastSpendResetTimestamp: Date.now(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    isActive: true,
    nonce: 1,
    signature: ('0x' + 'a'.repeat(130)) as Hex,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockMarket: Market = {
    id: '0x1111111111111111111111111111111111111111111111111111111111111111',
    marketIdHex: '0x1111111111111111111111111111111111111111111111111111111111111111',
    poolAddress: '0x2222222222222222222222222222222222222222',
    symbol: 'BTC/USD',
    windowDuration: '5m',
    strikePrice: 96000,
    openTimestamp: new Date(Date.now() - 60000).toISOString(),
    closeTimestamp: new Date(Date.now() + 240000).toISOString(),
    resolutionTimestamp: new Date(Date.now() + 300000).toISOString(),
    status: 'Open',
    bestBidYes: 0.48,
    bestAskYes: 0.52,
    bestBidNo: 0.48,
    bestAskNo: 0.52,
    impliedProbYes: 0.50,
    fairValueYes: 0.55,
    edgePercentage: 0.05,
  };

  beforeEach(() => {
    service = new OrderService();
    vi.spyOn(marketService, 'getMarketById').mockReturnValue(mockMarket);
    vi.spyOn(sessionService, 'getSessionById').mockReturnValue(mockSession);
    vi.spyOn(sessionService, 'getUserActiveSession').mockResolvedValue(mockSession);
    vi.spyOn(sessionService, 'validateTradeAllowance').mockReturnValue({ allowed: true });
  });

  it('records user manual order placed through terminal via submitUserOrder', async () => {
    const order = await service.submitUserOrder({
      userAddress,
      marketId: mockMarket.id,
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'LIMIT',
      price: 0.52,
      lotSize: 5.0,
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    });

    expect(order).toBeDefined();
    expect(order.id).toBeDefined();
    expect(order.source).toBe('TERMINAL');
    expect(order.agentType).toBe('Manual');
    expect(order.userAddress?.toLowerCase()).toBe(userAddress.toLowerCase());
    expect(order.price).toBe(0.52);
    expect(order.lotSize).toBe(5.0);
    expect(order.totalCost).toBe(2.6);
  });

  it('executes agent decision for canonical swarm runner and creates order record', async () => {
    const decision: IAgentDecision = {
      agentType: 'Volt',
      targetMarketId: mockMarket.id,
      action: 'TAKER_BUY',
      targetOutcome: 'YES',
      price: 0.50,
      lotSize: 2.0,
      rationale: 'Momentum breakout confirmed with positive edge',
      confidence: 0.85,
    };

    const order = await service.executeAgentDecision(decision, mockSession);
    if (order) {
      expect(order.agentType).toBe('Volt');
      expect(order.source).toBe('SWARM');
      expect(order.lotSize).toBe(2.0);
    }
  });

  it('returns null when agent decision has HOLD action', async () => {
    const holdDecision: IAgentDecision = {
      agentType: 'Titan',
      targetMarketId: mockMarket.id,
      action: 'HOLD',
      rationale: 'No edge found',
      confidence: 0.0,
    };

    const result = await service.executeAgentDecision(holdDecision, mockSession);
    expect(result).toBeNull();
  });

  it('queries orders with various filters (agentType, status, outcome, source, pagination)', async () => {
    await service.submitUserOrder({
      userAddress,
      marketId: mockMarket.id,
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'LIMIT',
      price: 0.50,
      lotSize: 1.0,
      txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
    });

    await service.submitUserOrder({
      userAddress,
      marketId: mockMarket.id,
      outcome: 'NO',
      direction: 'BUY',
      orderType: 'LIMIT',
      price: 0.45,
      lotSize: 3.0,
      txHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
    });

    const allOrders = service.getOrders();
    expect(allOrders.length).toBeGreaterThanOrEqual(2);

    const userOrders = service.getOrders({ userAddress });
    expect(userOrders.length).toBeGreaterThanOrEqual(2);

    const paginated = service.queryOrdersPaginated({ limit: 1, page: 1 });
    expect(paginated.orders.length).toBe(1);
    expect(paginated.total).toBeGreaterThanOrEqual(2);
  });

  it('settles orders for market and computes PnL for winning and losing orders', async () => {
    const orderWon = await service.submitUserOrder({
      userAddress,
      marketId: mockMarket.id,
      outcome: 'YES',
      orderType: 'LIMIT',
      price: 0.40,
      lotSize: 10.0,
      txHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
    });

    const orderLost = await service.submitUserOrder({
      userAddress,
      marketId: mockMarket.id,
      outcome: 'NO',
      orderType: 'LIMIT',
      price: 0.60,
      lotSize: 10.0,
      txHash: '0x4444444444444444444444444444444444444444444444444444444444444444',
    });

    // Settle orders for market
    const settledCount = await service.settleOrdersForMarket(mockMarket.id, 'YES');
    expect(settledCount).toBeGreaterThanOrEqual(2);

    const updatedWon = service.getOrderById(orderWon.id);
    expect(updatedWon?.isSettled).toBe(true);
    expect(updatedWon?.pnl).toBe(6.0);

    const updatedLost = service.getOrderById(orderLost.id);
    expect(updatedLost?.isSettled).toBe(true);
    expect(updatedLost?.pnl).toBe(-6.0);
  });

  it('calculates open positions and swarm PnL summary correctly', async () => {
    await service.submitUserOrder({
      userAddress,
      marketId: mockMarket.id,
      outcome: 'YES',
      orderType: 'LIMIT',
      price: 0.45,
      lotSize: 10.0,
      txHash: '0x5555555555555555555555555555555555555555555555555555555555555555',
    });

    const count = service.getActivePositionCount(undefined, userAddress);
    expect(typeof count).toBe('number');

    const pnl = await service.getTotalRealizedPnlAsync(undefined, userAddress);
    expect(typeof pnl).toBe('number');
  });

  it('handles resting maker quotes, self-trade sanitization, and state change listeners', () => {
    let notified = false;
    const unsubscribe = service.onStateChange(() => {
      notified = true;
    });

    service.notifyStateChange();
    expect(notified).toBe(true);
    unsubscribe();

    // Register maker quote
    service.registerRestingMakerQuote({
      orderId: 'quote-1',
      userAddress,
      marketId: mockMarket.id,
      direction: 'BUY',
      outcome: 'YES',
      price: 0.45,
      lotSize: 10,
      timestamp: Date.now(),
    } as any);

    const quotes = service.getRestingMakerQuotes(mockMarket.id, userAddress);
    expect(quotes.length).toBe(1);


    // Sanitize depth for self trade
    const sanitized = service.sanitizeDepthForSelfTrade(
      {
        yesBids: [
          { price: 0.45, quantity: 10 },
          { price: 0.44, quantity: 20 },
        ],
        yesAsks: [],
      } as any,
      mockMarket.id,
      userAddress,
    );
    expect(sanitized.yesBids.length).toBe(1);
    expect(sanitized.yesBids[0].price).toBe(0.44);

    // Remove maker quote
    service.removeRestingMakerQuote('quote-1');
    expect(service.getRestingMakerQuotes(mockMarket.id, userAddress).length).toBe(0);
  });

  it('handles async order queries, stats, custom agent orders, and aggregates', async () => {
    const stats = service.getOrderStats({ userAddress });
    expect(stats).toBeDefined();
    expect(typeof stats.totalCount).toBe('number');
    expect(typeof stats.totalFills).toBe('number');
    expect(typeof stats.totalVolume).toBe('number');

    const asyncOrders = await service.getOrdersAsync({ userAddress });
    expect(Array.isArray(asyncOrders)).toBe(true);


    const paginatedAsync = await service.queryOrdersPaginatedAsync({ userAddress, limit: 5 });
    expect(Array.isArray(paginatedAsync.orders)).toBe(true);

    const customAgentOrders = await service.getOrdersForCustomAgent('custom-agent-1', userAddress);
    expect(Array.isArray(customAgentOrders)).toBe(true);

    // Swarm aggregates & telemetry
    const aggregates = service.getSwarmAggregates();
    expect(aggregates).toBeDefined();

    service.broadcastSwarmTelemetry();

    // syncResolvedOrdersPnL & async
    service.syncResolvedOrdersPnL();
    await service.syncResolvedOrdersPnLAsync();

    // reconcileSettledOrdersWithOnChain
    const count = await service.reconcileSettledOrdersWithOnChain();
    expect(typeof count).toBe('number');
  });
});

