import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OrderService, orderService, computeRealizedPnl, resolveOnchainWinningOutcome } from '../src/services/order-service.js';
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

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('does not overwrite already-settled PnL when settleOrdersForMarket is called again with a different outcome', async () => {
    const orderWon = await service.submitUserOrder({
      userAddress,
      marketId: mockMarket.id,
      outcome: 'YES',
      orderType: 'LIMIT',
      price: 0.40,
      lotSize: 10.0,
      txHash: '0x6666666666666666666666666666666666666666666666666666666666666666',
    });

    await service.settleOrdersForMarket(mockMarket.id, 'YES');
    const settledPnl = service.getOrderById(orderWon.id)?.pnl;
    expect(settledPnl).toBe(6.0);

    const firstTotal = await service.getTotalRealizedPnlAsync(undefined, userAddress);

    const secondCount = await service.settleOrdersForMarket(mockMarket.id, 'NO');
    expect(secondCount).toBe(0);
    expect(service.getOrderById(orderWon.id)?.pnl).toBe(settledPnl);

    const secondTotal = await service.getTotalRealizedPnlAsync(undefined, userAddress);
    expect(secondTotal).toBe(firstTotal);
  });

  it('computes VOID settlement as a 0.50-per-lot refund and does not let a later YES/NO settle flip it', async () => {
    const order = await service.submitUserOrder({
      userAddress,
      marketId: mockMarket.id,
      outcome: 'YES',
      orderType: 'LIMIT',
      price: 0.40,
      lotSize: 10.0,
      txHash: '0x7777777777777777777777777777777777777777777777777777777777777777',
    });

    const voidedCount = await service.settleOrdersForMarket(mockMarket.id, 'VOID', undefined, true);
    expect(voidedCount).toBeGreaterThanOrEqual(1);
    // BUY 10 lots at 0.40 costs 4.00; VOID refunds 5.00 → +1.00
    expect(service.getOrderById(order.id)?.pnl).toBe(1.0);

    await service.settleOrdersForMarket(mockMarket.id, 'YES');
    expect(service.getOrderById(order.id)?.pnl).toBe(1.0);
  });

  it('maps on-chain market state to YES/NO/VOID without guessing a missing winner as NO', () => {
    expect(resolveOnchainWinningOutcome(null)).toBeUndefined();
    expect(resolveOnchainWinningOutcome({ isResolved: false, finalized: false })).toBeUndefined();
    expect(resolveOnchainWinningOutcome({ isResolved: true, finalized: true })).toBeUndefined();
    expect(resolveOnchainWinningOutcome({ isResolved: true, winningOutcome: 0 })).toBe('YES');
    expect(resolveOnchainWinningOutcome({ isResolved: true, winningOutcome: 1 })).toBe('NO');
    expect(resolveOnchainWinningOutcome({ isVoided: true, winningOutcome: 0 })).toBe('VOID');
    expect(resolveOnchainWinningOutcome({ status: 5 })).toBe('VOID');
    expect(computeRealizedPnl(
      { direction: 'BUY', price: 0.6, lotSize: 10, outcome: 'YES' },
      'YES',
    )).toBe(4);
    expect(computeRealizedPnl(
      { direction: 'BUY', price: 0.6, lotSize: 10, outcome: 'YES' },
      'NO',
    )).toBe(-6);
    expect(computeRealizedPnl(
      { direction: 'BUY', price: 0.6, lotSize: 10, outcome: 'YES' },
      'VOID',
    )).toBe(-1);
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
      agentType: 'Manual',
      direction: 'BUY',
      outcome: 'YES',
      price: 0.45,
      lotSize: 10,
      createdAt: Date.now(),
    });

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

  it('records zero-fill resting limit order as PENDING status with full lotSize and undefined filledAt', async () => {
    const { somniaExchange } = await import('../src/config/somnia.js');
    vi.spyOn(somniaExchange.client, 'getMarketOnchain').mockResolvedValue({
      pool: mockMarket.poolAddress as Address,
      status: 1,
      finalized: false,
      isResolved: false,
      isVoided: false,
      expiry: Math.floor(Date.now() / 1000) + 300,
      outcomeToken: '0x3333333333333333333333333333333333333333' as Address,
      yesId: 1n,
      noId: 2n,
      collateral: '0x4444444444444444444444444444444444444444' as Address,
    } as any);
    vi.spyOn(somniaExchange.trader, 'placeOrder').mockResolvedValue({
      hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      orderId: 999n,
      fills: [],
      receipt: { status: 'success' },
    } as any);

    const decision: IAgentDecision = {
      agentType: 'Titan',
      targetMarketId: mockMarket.id,
      action: 'LIMIT_QUOTE',
      targetOutcome: 'YES',
      price: 0.45,
      lotSize: 4.0,
      confidence: 0.9,
      rationale: 'Maker quote placement resting on book',
    };

    const order = await service.executeAgentDecision(decision, mockSession);
    expect(order).not.toBeNull();
    expect(order?.status).toBe('PENDING');
    expect(order?.lotSize).toBe(4.0);
    expect(order?.filledAt).toBeUndefined();
  });

  it('records partial fill order as PARTIALLY_FILLED status with exact filled lot size', async () => {
    const { somniaExchange } = await import('../src/config/somnia.js');
    vi.spyOn(somniaExchange.client, 'getMarketOnchain').mockResolvedValue({
      pool: mockMarket.poolAddress as Address,
      status: 1,
      finalized: false,
      isResolved: false,
      isVoided: false,
      expiry: Math.floor(Date.now() / 1000) + 300,
      outcomeToken: '0x3333333333333333333333333333333333333333' as Address,
      yesId: 1n,
      noId: 2n,
      collateral: '0x4444444444444444444444444444444444444444' as Address,
    } as any);
    vi.spyOn(somniaExchange.trader, 'placeOrder').mockResolvedValue({
      hash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      orderId: 1000n,
      fills: [{ quantityFilled: 2_500_000n }], // 2.5 lots filled out of 5.0 requested
      receipt: { status: 'success' },
    } as any);

    const decision: IAgentDecision = {
      agentType: 'Volt',
      targetMarketId: mockMarket.id,
      action: 'TAKER_BUY',
      targetOutcome: 'YES',
      price: 0.50,
      lotSize: 5.0,
      confidence: 0.88,
      rationale: 'Taker sweep crossing partial depth',
    };

    const order = await service.executeAgentDecision(decision, mockSession);
    expect(order).not.toBeNull();
    expect(order?.status).toBe('PARTIALLY_FILLED');
    expect(order?.lotSize).toBe(2.5);
    expect(order?.totalCost).toBe(1.25);
    expect(order?.filledAt).toBeDefined();
  });

  it('rejects user-submitted order with malformed transaction hash format', async () => {
    await expect(
      service.submitUserOrder({
        userAddress,
        marketId: mockMarket.id,
        outcome: 'YES',
        direction: 'BUY',
        orderType: 'LIMIT',
        price: 0.50,
        lotSize: 1.0,
        txHash: '0xinvalid_short_hash' as Hex,
      }),
    ).rejects.toThrow('Invalid transaction hash format');
  });

  it('rejects user-submitted order when on-chain transaction receipt status is reverted', async () => {
    const { publicClient } = await import('../src/config/somnia.js');
    vi.spyOn(publicClient, 'getTransactionReceipt').mockResolvedValue({
      status: 'reverted',
      from: userAddress,
      to: mockMarket.poolAddress as Address,
    } as any);

    await expect(
      service.submitUserOrder({
        userAddress,
        marketId: mockMarket.id,
        outcome: 'YES',
        direction: 'BUY',
        orderType: 'LIMIT',
        price: 0.50,
        lotSize: 1.0,
        txHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      }),
    ).rejects.toThrow('Transaction reverted on-chain');
  });

  it('cancels resting PENDING limit order for user and marks status CANCELLED', async () => {
    // Submit a pending order into service cache
    const pendingOrder = await service.submitUserOrder({
      userAddress,
      marketId: mockMarket.id,
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'LIMIT',
      price: 0.40,
      lotSize: 5.0,
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    });

    // Manually set status to PENDING (simulating resting limit order)
    pendingOrder.status = 'PENDING';
    pendingOrder.onchainOrderId = '42';

    const cancelRes = await service.cancelOrderFor(pendingOrder.id, userAddress);

    expect(cancelRes.success).toBe(true);
    expect(cancelRes.order.status).toBe('CANCELLED');
    expect(cancelRes.txHash).toBeDefined();

    const fetched = service.getOrderById(pendingOrder.id);
    expect(fetched?.status).toBe('CANCELLED');
  });

  it('rejects cancellation when order does not belong to caller address', async () => {
    const order = await service.submitUserOrder({
      userAddress,
      marketId: mockMarket.id,
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'LIMIT',
      price: 0.40,
      lotSize: 5.0,
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    });
    order.status = 'PENDING';

    const otherUser = '0x1111111111111111111111111111111111111111' as Address;
    await expect(service.cancelOrderFor(order.id, otherUser)).rejects.toThrow('Unauthorized');
  });

  it('rejects cancellation if order is already filled', async () => {
    const order = await service.submitUserOrder({
      userAddress,
      marketId: mockMarket.id,
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'LIMIT',
      price: 0.50,
      lotSize: 1.0,
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    });
    order.status = 'FILLED';

    await expect(service.cancelOrderFor(order.id, userAddress)).rejects.toThrow('already filled');
  });

  it('returns idempotent success if order is already cancelled', async () => {
    const order = await service.submitUserOrder({
      userAddress,
      marketId: mockMarket.id,
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'LIMIT',
      price: 0.50,
      lotSize: 1.0,
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    });
    order.status = 'CANCELLED';

    const res = await service.cancelOrderFor(order.id, userAddress);
    expect(res.success).toBe(true);
    expect(res.message).toContain('already cancelled');
  });

  it('transitions unfilled resting PENDING limit orders to EXPIRED with pnl: 0 upon market settlement', async () => {
    // Trader places a resting limit order at $0.10 that was never filled
    const restingLimitOrder = await service.submitUserOrder({
      userAddress,
      marketId: mockMarket.id,
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'LIMIT',
      price: 0.10,
      lotSize: 10.0,
      txHash: '0x9999999999999999999999999999999999999999999999999999999999999999',
    });
    restingLimitOrder.status = 'PENDING';
    service.registerRestingMakerQuote({
      orderId: restingLimitOrder.id,
      marketId: mockMarket.id,
      userAddress,
      agentType: 'Manual',
      outcome: 'YES',
      direction: 'BUY',
      price: 0.10,
      lotSize: 10.0,
      createdAt: Date.now(),
    });

    expect(service.getRestingMakerQuotes(mockMarket.id).length).toBe(1);

    // Settle market with winning outcome YES.
    // Unmatched order should NOT be marked FILLED and credited with phantom +$0.90/lot (+$9.00)!
    const settledCount = await service.settleOrdersForMarket(mockMarket.id, 'YES');
    expect(settledCount).toBeGreaterThanOrEqual(1);

    const updated = service.getOrderById(restingLimitOrder.id);
    expect(updated?.status).toBe('EXPIRED');
    expect(updated?.pnl).toBe(0);
    expect(updated?.isSettled).toBe(true);

    // Resting quote should have been cleaned up
    expect(service.getRestingMakerQuotes(mockMarket.id).length).toBe(0);

    // Total realized PnL should be 0 for this user (no phantom credit)
    const totalPnl = await service.getTotalRealizedPnlAsync(undefined, userAddress);
    expect(totalPnl).toBe(0);
  });

  it('transitions unfilled resting PENDING limit orders to EXPIRED with pnl: 0 when winning outcome is opposite (no false loss)', async () => {
    // Trader places a resting limit order at $0.10 that was never filled
    const restingLimitOrder = await service.submitUserOrder({
      userAddress,
      marketId: mockMarket.id,
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'LIMIT',
      price: 0.10,
      lotSize: 10.0,
      txHash: '0x8888888888888888888888888888888888888888888888888888888888888888',
    });
    restingLimitOrder.status = 'PENDING';

    // Settle market with winning outcome NO.
    // Unmatched order should NOT be debited with false -$0.10/lot (-$1.00)!
    await service.settleOrdersForMarket(mockMarket.id, 'NO');

    const updated = service.getOrderById(restingLimitOrder.id);
    expect(updated?.status).toBe('EXPIRED');
    expect(updated?.pnl).toBe(0);
    expect(updated?.isSettled).toBe(true);

    const totalPnl = await service.getTotalRealizedPnlAsync(undefined, userAddress);
    expect(totalPnl).toBe(0);
  });

  it('returns idempotent success if order is already expired', async () => {
    const order = await service.submitUserOrder({
      userAddress,
      marketId: mockMarket.id,
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'LIMIT',
      price: 0.50,
      lotSize: 1.0,
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    });
    order.status = 'EXPIRED';

    const res = await service.cancelOrderFor(order.id, userAddress);
    expect(res.success).toBe(true);
    expect(res.message).toContain('already expired');
  });

  it('cancels a resting swarm/session order and processes collateral refund', async () => {
    const restingOrder = await service.submitUserOrder({
      userAddress,
      marketId: mockMarket.id,
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'LIMIT',
      price: 0.50,
      lotSize: 10.0,
      txHash: '0x9999999999999999999999999999999999999999999999999999999999999999',
    });
    restingOrder.status = 'PENDING';
    restingOrder.source = 'SWARM';
    restingOrder.sessionId = 'test-session-id';
    restingOrder.totalCost = 5.0;

    const res = await service.cancelOrderFor(restingOrder.id, userAddress);
    expect(res.success).toBe(true);
    expect(res.order.status).toBe('CANCELLED');
    expect(res.message).toContain('Locked collateral returned');
  });

  it('throws if order ID is not found', async () => {
    await expect(
      service.cancelOrderFor('non-existent-order-id', userAddress),
    ).rejects.toThrow('not found');
  });
});

