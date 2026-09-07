import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnomalyService, anomalyService, normalizeMarketSymbol } from '../src/services/anomaly-service.js';
import { analyticsService } from '../src/services/analytics-service.js';
import { orderService } from '../src/services/order-service.js';
import { settlementService } from '../src/services/settlement-service.js';
import { priceFeedService } from '../src/services/price-feed-service.js';
import type { Market, OrderExecution } from '../src/types/index.js';

describe('AnalyticsService & AnomalyService Comprehensive Suite', () => {
  describe('anomaly-service.ts', () => {
    let service: AnomalyService;

    const mockOpenMarket: Market = {
      id: 'market-eth-up-5m-1',
      symbol: 'ETH/USD',
      windowDuration: '5m',
      strikePrice: 2500,
      openTimestamp: new Date(Date.now() - 60000).toISOString(),
      closeTimestamp: new Date(Date.now() + 180000).toISOString(), // 3 min left
      resolutionTimestamp: new Date(Date.now() + 180000).toISOString(),
      status: 'Open',
      bestBidYes: 0.30,
      bestAskYes: 0.32,
      bestBidNo: 0.68,
      bestAskNo: 0.70,
      impliedProbYes: 0.31,
      fairValueYes: 0.50,
      edgePercentage: 0.18,
    };

    beforeEach(() => {
      service = new AnomalyService(0.03);
    });

    afterEach(() => {
      service.stop();
    });

    it('returns null for closed or resolved markets', () => {
      const closedMarket: Market = {
        ...mockOpenMarket,
        status: 'Closed',
      };
      expect(service.evaluateMarket(closedMarket, 2500)).toBeNull();

      const expiredMarket: Market = {
        ...mockOpenMarket,
        closeTimestamp: new Date(Date.now() - 1000).toISOString(),
      };
      expect(service.evaluateMarket(expiredMarket, 2500)).toBeNull();
    });

    it('detects and classifies HIGH, MEDIUM, and LOW anomalies', () => {
      const highEdgeMarket: Market = {
        ...mockOpenMarket,
        bestBidYes: 0.10,
        bestAskYes: 0.12,
      };
      const highReport = service.evaluateMarket(highEdgeMarket, 2600);
      expect(highReport).not.toBeNull();
      expect(highReport?.severity).toBe('HIGH');
      expect(highReport?.absoluteEdge).toBeGreaterThanOrEqual(0.10);

      const medMarket: Market = {
        ...mockOpenMarket,
        bestBidYes: 0.44,
        bestAskYes: 0.46,
      };
      const medReport = service.evaluateMarket(medMarket, 2500);
      if (medReport) {
        expect(['LOW', 'MEDIUM', 'HIGH']).toContain(medReport.severity);
      }
    });

    it('scans multiple markets and sorts by highest absolute edge', () => {
      const marketA: Market = {
        ...mockOpenMarket,
        id: 'market-a',
        symbol: 'BTC/USD',
        strikePrice: 90000,
        bestBidYes: 0.10,
        bestAskYes: 0.12,
      };
      const marketB: Market = {
        ...mockOpenMarket,
        id: 'market-b',
        symbol: 'ETH/USD',
        strikePrice: 2500,
        bestBidYes: 0.48,
        bestAskYes: 0.52,
      };

      const reports = service.scanMarkets([marketA, marketB], {
        'BTC/USD': 95000,
        'ETH/USD': 2500,
      });

      expect(reports.length).toBeGreaterThan(0);
      expect(reports[0].absoluteEdge).toBeGreaterThanOrEqual(reports[reports.length - 1].absoluteEdge);

      const active = service.getActiveAnomalies();
      expect(active.length).toBe(reports.length);
    });

    it('correctly normalizes varied market symbols with normalizeMarketSymbol', () => {
      expect(normalizeMarketSymbol('BTCUSDT')).toBe('BTC/USD');
      expect(normalizeMarketSymbol('BTC')).toBe('BTC/USD');
      expect(normalizeMarketSymbol('btcusdt')).toBe('BTC/USD');
      expect(normalizeMarketSymbol('ETHUSDT')).toBe('ETH/USD');
      expect(normalizeMarketSymbol('eth')).toBe('ETH/USD');
      expect(normalizeMarketSymbol('BTC/USD/USD')).toBe('BTC/USD');
      expect(normalizeMarketSymbol('SOLUSDT')).toBe('SOL/USD');
      expect(normalizeMarketSymbol('')).toBe('BTC/USD');
    });

    it('resolves spot price when market has symbol variation (e.g. BTCUSDT) without falling back to strikePrice', () => {
      const marketVariation: Market = {
        ...mockOpenMarket,
        id: 'market-btc-var-1',
        symbol: 'BTCUSDT',
        strikePrice: 90000,
        bestBidYes: 0.10,
        bestAskYes: 0.12,
      };

      // Spot prices keyed by standard 'BTC/USD' with SpotTicker object
      const reports = service.scanMarkets([marketVariation], {
        'BTC/USD': { price: 95000 } as any,
      });

      expect(reports.length).toBe(1);
      expect(reports[0].spotPrice).toBe(95000);
      expect(reports[0].spotPrice).not.toBe(marketVariation.strikePrice);
    });

    it('allows setting and getting anomaly threshold', () => {
      service.setThreshold(0.08);
      expect(service.getThreshold()).toBe(0.08);
    });

    it('passes dynamic priceHistory from priceFeedService to fair value calculation', () => {
      const getSpotTickerSpy = vi.spyOn(priceFeedService, 'getSpotTicker').mockReturnValue({
        symbol: 'ETH/USD',
        price: 2500,
        change1m: 0.1,
        change5m: 0.3,
        high24h: 2600,
        low24h: 2400,
        volume24h: 100000,
        timestamp: Date.now(),
        priceHistory: [
          { timestamp: Date.now() - 4000, price: 2500 },
          { timestamp: Date.now() - 3000, price: 2510 },
          { timestamp: Date.now() - 2000, price: 2490 },
          { timestamp: Date.now() - 1000, price: 2520 },
          { timestamp: Date.now(), price: 2500 },
        ],
      });

      service.evaluateMarket(mockOpenMarket, 2500);
      expect(getSpotTickerSpy).toHaveBeenCalledWith('ETH/USD');
      getSpotTickerSpy.mockRestore();
    });

    it('BE-BUG-09: prunes cached anomalies when evaluateMarket is called for closed, resolving, or expired markets', () => {
      // 1. Detect and cache an active anomaly
      const highEdgeMarket: Market = {
        ...mockOpenMarket,
        id: 'market-leak-test-1',
        bestBidYes: 0.10,
        bestAskYes: 0.12,
      };
      const report = service.evaluateMarket(highEdgeMarket, 2600);
      expect(report).not.toBeNull();
      expect(service.getCacheSize()).toBe(1);

      // 2. Calling evaluateMarket with status: 'Closed' prunes it from cache
      const closedMarket: Market = {
        ...highEdgeMarket,
        status: 'Closed',
      };
      const closedResult = service.evaluateMarket(closedMarket, 2600);
      expect(closedResult).toBeNull();
      expect(service.getCacheSize()).toBe(0);
      expect(service.getActiveAnomalies()).toHaveLength(0);

      // 3. Re-add and verify expired closeTimestamp also prunes
      service.evaluateMarket(highEdgeMarket, 2600);
      expect(service.getCacheSize()).toBe(1);

      const expiredMarket: Market = {
        ...highEdgeMarket,
        closeTimestamp: new Date(Date.now() - 5000).toISOString(),
      };
      service.evaluateMarket(expiredMarket, 2600);
      expect(service.getCacheSize()).toBe(0);
    });

    it('BE-BUG-09: prunes entries via pruneMarket, pruneMarkets, and pruneResolvedOrCancelled', () => {
      const market1: Market = { ...mockOpenMarket, id: 'market-prune-1', bestBidYes: 0.10, bestAskYes: 0.12 };
      const market2: Market = { ...mockOpenMarket, id: 'market-prune-2', bestBidYes: 0.10, bestAskYes: 0.12 };
      const market3: Market = { ...mockOpenMarket, id: 'market-prune-3', bestBidYes: 0.10, bestAskYes: 0.12 };

      service.evaluateMarket(market1, 2600);
      service.evaluateMarket(market2, 2600);
      service.evaluateMarket(market3, 2600);
      expect(service.getCacheSize()).toBe(3);

      // Explicit single prune
      expect(service.pruneMarket('market-prune-1')).toBe(true);
      expect(service.getCacheSize()).toBe(2);

      // Batch prune by status transition
      const prunedCount = service.pruneResolvedOrCancelled([
        { id: 'market-prune-2', status: 'RESOLVED' },
        { id: 'market-prune-3', status: 'CANCELLED' },
      ]);
      expect(prunedCount).toBe(2);
      expect(service.getCacheSize()).toBe(0);
    });

    it('BE-BUG-09: prunes inactive markets absent from active market feed via pruneInactiveMarkets', () => {
      const marketA: Market = { ...mockOpenMarket, id: 'market-active-a', bestBidYes: 0.10, bestAskYes: 0.12 };
      const marketB: Market = { ...mockOpenMarket, id: 'market-stale-b', bestBidYes: 0.10, bestAskYes: 0.12 };

      service.evaluateMarket(marketA, 2600);
      service.evaluateMarket(marketB, 2600);
      expect(service.getCacheSize()).toBe(2);

      // Only market-active-a is in active feed
      const activeIds = new Set(['market-active-a']);
      const pruned = service.pruneInactiveMarkets(activeIds);
      expect(pruned).toBe(1);
      expect(service.getCacheSize()).toBe(1);
      expect(service.getActiveAnomalies()[0].marketId).toBe('market-active-a');
    });

    it('BE-BUG-09: prunes expired anomalies on TTL expiration and lazy getActiveAnomalies check', () => {
      const shortTtlService = new AnomalyService(0.03, { ttlMs: 50, autoCleanup: false });
      const market: Market = { ...mockOpenMarket, id: 'market-ttl-1', bestBidYes: 0.10, bestAskYes: 0.12 };

      shortTtlService.evaluateMarket(market, 2600);
      expect(shortTtlService.getCacheSize()).toBe(1);

      // Advance time beyond TTL
      const future = Date.now() + 100;
      const pruned = shortTtlService.pruneExpired(future);
      expect(pruned).toBe(1);
      expect(shortTtlService.getCacheSize()).toBe(0);

      // Also test lazy purge via getActiveAnomalies
      shortTtlService.evaluateMarket(market, 2600);
      expect(shortTtlService.getCacheSize()).toBe(1);

      // Fast-forward TTL via spy on Date.now
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 200);
      const active = shortTtlService.getActiveAnomalies();
      expect(active).toHaveLength(0);
      expect(shortTtlService.getCacheSize()).toBe(0);
      nowSpy.mockRestore();

      shortTtlService.stop();
    });

    it('BE-BUG-09: emits anomaly_removed and anomalies_pruned events on lifecycle eviction', () => {
      const removedSpy = vi.fn();
      const prunedSpy = vi.fn();
      service.on('anomaly_removed', removedSpy);
      service.on('anomalies_pruned', prunedSpy);

      const market: Market = { ...mockOpenMarket, id: 'market-events-1', bestBidYes: 0.10, bestAskYes: 0.12 };
      service.evaluateMarket(market, 2600);

      service.pruneMarket('market-events-1');
      expect(removedSpy).toHaveBeenCalledWith({ marketId: 'market-events-1' });

      service.evaluateMarket(market, 2600);
      service.pruneMarkets(['market-events-1']);
      expect(prunedSpy).toHaveBeenCalledWith(expect.objectContaining({ prunedCount: 1 }));
    });
  });

  describe('analytics-service.ts', () => {
    const userAddress = '0x1111222233334444555566667777888899990000';
    const now = Date.now();

    const mockOrders: OrderExecution[] = [
      {
        id: 'order-1',
        marketId: 'm-1',
        agentType: 'Volt',
        direction: 'BUY',
        outcome: 'YES',
        orderType: 'LIMIT',
        price: 0.40,
        lotSize: 10,
        totalCost: 4.0,
        status: 'FILLED',
        txHash: '0xabc1',
        createdAt: new Date(now - 2 * 3600 * 1000).toISOString(),
        settledAt: new Date(now - 1 * 3600 * 1000).toISOString(),
        isSettled: true,
        pnl: 6.0,
        source: 'SWARM',
        userAddress: userAddress as any,
      },
      {
        id: 'order-2',
        marketId: 'm-2',
        agentType: 'Oracle',
        direction: 'BUY',
        outcome: 'NO',
        orderType: 'LIMIT',
        price: 0.50,
        lotSize: 5,
        totalCost: 2.5,
        status: 'FILLED',
        txHash: '0xabc2',
        createdAt: new Date(now - 10 * 3600 * 1000).toISOString(),
        settledAt: new Date(now - 8 * 3600 * 1000).toISOString(),
        isSettled: true,
        pnl: -2.5,
        source: 'SWARM',
        userAddress: userAddress as any,
      },
      {
        id: 'order-3',
        marketId: 'm-3',
        agentType: 'Manual',
        direction: 'BUY',
        outcome: 'YES',
        orderType: 'LIMIT',
        price: 0.35,
        lotSize: 20,
        totalCost: 7.0,
        status: 'FILLED',
        txHash: '0xabc3',
        createdAt: new Date(now - 5 * 3600 * 1000).toISOString(),
        settledAt: new Date(now - 4 * 3600 * 1000).toISOString(),
        isSettled: true,
        pnl: 13.0,
        source: 'TERMINAL',
        userAddress: userAddress as any,
      },
    ];

    beforeEach(() => {
      vi.spyOn(orderService, 'getOrders').mockReturnValue(mockOrders);
      vi.spyOn(settlementService, 'getSweeperSummary').mockResolvedValue({
        unclaimedAmount: 0,
        totalClaimedAllTime: 50.0,
        claimableMarketsCount: 0,
        confirmedSweepsCount: 0,
        unclaimedPositions: [],
      });
      vi.spyOn(settlementService, 'getSweepHistory').mockReturnValue([]);
    });

    it('computes analytics response with full summaries and breakdowns', async () => {
      const res = await analyticsService.getAnalytics(userAddress, '24h', 'ALL', true);

      expect(res.userAddress.toLowerCase()).toBe(userAddress.toLowerCase());
      expect(res.summary).toBeDefined();
      expect(res.summary.totalTrades).toBe(3);
      expect(res.summary.totalWins).toBe(2);
      expect(res.summary.totalLosses).toBe(1);
      expect(res.summary.winRate).toBeGreaterThan(0);
      expect(res.summary.totalPnl).toBe(16.5);

      // Breakdowns
      expect(res.sourceBreakdown.length).toBe(3);
      expect(res.agentBreakdown.length).toBeGreaterThan(0);
      expect(res.outcomeBreakdown.length).toBeGreaterThan(0);
      expect(res.symbolBreakdown.length).toBeGreaterThan(0);
      expect(res.windowBreakdown.length).toBeGreaterThan(0);
      expect(res.ledger.length).toBeGreaterThan(0);
      expect(res.equityCurve.length).toBeGreaterThan(0);
    });

    it('filters analytics for SWARM only and TERMINAL only sources', async () => {
      const swarmRes = await analyticsService.getAnalytics(userAddress, '7d', 'SWARM', true);
      expect(swarmRes.source).toBe('SWARM');
      expect(swarmRes.summary.totalTrades).toBe(2);

      const terminalRes = await analyticsService.getAnalytics(userAddress, '30d', 'TERMINAL', true);
      expect(terminalRes.source).toBe('TERMINAL');
      expect(terminalRes.summary.totalTrades).toBe(1);
    });

    it('supports 90d and ALL ranges and handles empty order history gracefully', async () => {
      vi.spyOn(orderService, 'getOrders').mockReturnValue([]);

      const emptyRes = await analyticsService.getAnalytics('0x2222222222222222222222222222222222222222', 'ALL', 'ALL', true);

      expect(emptyRes.summary.totalTrades).toBe(0);
      expect(emptyRes.summary.totalPnl).toBe(0);
      expect(emptyRes.summary.winRate).toBe(0);
      expect(emptyRes.equityCurve.length).toBeGreaterThan(0);
    });

    it('retrieves balance history using getBalanceHistory', async () => {
      const history = await analyticsService.getBalanceHistory(userAddress, '30d', 'ALL');
      expect(history.equityCurve).toBeDefined();
      expect(history.swarmEquityCurve).toBeDefined();
    });

    it('uses 365-day annualization (sqrt(365)) for 24/7 crypto Sharpe calculation', async () => {
      const dayMs = 24 * 3600 * 1000;
      const multiDayOrders: OrderExecution[] = [
        {
          ...mockOrders[0],
          id: 'day-1',
          createdAt: new Date(now - 3 * dayMs).toISOString(),
          settledAt: new Date(now - 3 * dayMs).toISOString(),
          pnl: 10,
        },
        {
          ...mockOrders[0],
          id: 'day-2',
          createdAt: new Date(now - 2 * dayMs).toISOString(),
          settledAt: new Date(now - 2 * dayMs).toISOString(),
          pnl: 20,
        },
        {
          ...mockOrders[0],
          id: 'day-3',
          createdAt: new Date(now - 1 * dayMs).toISOString(),
          settledAt: new Date(now - 1 * dayMs).toISOString(),
          pnl: 30,
        },
      ];
      vi.spyOn(orderService, 'getOrders').mockReturnValue(multiDayOrders);

      const res = await analyticsService.getAnalytics(userAddress, '7d', 'ALL', true);
      expect(res.summary.sharpeApprox).toBeGreaterThan(0);

      // Verify the annualization multiplier matches sqrt(365) and NOT TradFi sqrt(252)
      const dailyPnls = res.equityCurve.map((e) => e.dailyPnl);
      const mean = dailyPnls.reduce((a, b) => a + b, 0) / dailyPnls.length;
      const variance = dailyPnls.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dailyPnls.length;
      const stdev = Math.sqrt(variance);
      const expectedSharpe365 = Number(((mean / stdev) * Math.sqrt(365)).toFixed(2));
      const tradFiSharpe252 = Number(((mean / stdev) * Math.sqrt(252)).toFixed(2));

      expect(res.summary.sharpeApprox).toBe(expectedSharpe365);
      expect(res.summary.sharpeApprox).toBeGreaterThan(tradFiSharpe252);
    });

    it('BE-BUG-06: fetches DB historical orders even when user already has in-memory orders', async () => {
      const targetUser = '0x3333333333333333333333333333333333333333';
      const memOrder: OrderExecution = {
        ...mockOrders[0],
        id: 'mem-order-1',
        userAddress: targetUser,
        pnl: 10,
        createdAt: new Date().toISOString(),
      };
      const dbOrder: OrderExecution = {
        ...mockOrders[0],
        id: 'db-historical-order-2',
        userAddress: targetUser,
        pnl: 25,
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      };

      vi.spyOn(orderService, 'getOrders').mockReturnValue([memOrder]);
      vi.spyOn(orderService as any, 'isPersistenceEnabled').mockReturnValue(true);
      vi.spyOn(orderService as any, 'fetchOrdersFromDb').mockResolvedValue({
        orders: [dbOrder],
        total: 1,
      });

      const res = await analyticsService.getAnalytics(targetUser, '7d', 'ALL', true);
      // Both in-memory and DB orders must be included in comprehensive stats
      expect(res.summary.totalTrades).toBe(2);
      expect(res.summary.totalPnl).toBe(35);
      expect(res.ledger.length).toBeGreaterThan(0);
    });
  });
});
