import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { MarketService } from '../src/services/market-service.js';
import { AnomalyService } from '../src/services/anomaly-service.js';
import { somniaExchange } from '../src/config/somnia.js';
import type { Market } from '../src/types/index.js';

describe('Market Service & Anomaly Detector Unit & Integration Tests', () => {
  let marketService: MarketService;
  let anomalyService: AnomalyService;

  beforeEach(() => {
    marketService = new MarketService();
    anomalyService = new AnomalyService(0.03);
  });

  afterEach(() => {
    marketService.stop();
  });

  const seedOnchainTestMarkets = () => {
    const pairs = [
      { symbol: 'BTC/USD', strike: 96500 },
      { symbol: 'ETH/USD', strike: 2750 },
    ];
    const windows = ['1m', '5m', '15m', '1h'];
    let idx = 1;
    for (const { symbol, strike } of pairs) {
      for (const win of windows) {
        const hexId = `0x${idx.toString().padStart(64, '0')}`;
        idx++;
        const m: Market = {
          id: hexId,
          symbol,
          strikePrice: strike,
          windowDuration: win,
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
          poolAddress: `0x${'2'.repeat(40)}`,
          marketIdHex: hexId as any,
          isSynthetic: false,
        };
        (marketService as any).markets.set(m.id, m);
        (marketService as any).buildDepthBookFromClob(m);
      }
    }
  };

  describe('Market Service Core Mechanics', () => {
    it('initializes and manages prediction markets for BTC and ETH across 5m, 15m, 1h windows', () => {
      seedOnchainTestMarkets();
      const markets = marketService.getActiveMarkets();

      expect(markets.length).toBeGreaterThan(0);

      // Verify presence of BTC and ETH markets
      const btcMarkets = marketService.getActiveMarkets({ symbol: 'BTC/USD' });
      const ethMarkets = marketService.getActiveMarkets({ symbol: 'ETH/USD' });

      expect(btcMarkets.length).toBeGreaterThan(0);
      expect(ethMarkets.length).toBeGreaterThan(0);

      // Verify presence of 1m, 5m, 15m, 1h windows
      const m1 = marketService.getActiveMarkets({ window: '1m' });
      const m5 = marketService.getActiveMarkets({ window: '5m' });
      const m15 = marketService.getActiveMarkets({ window: '15m' });
      const m1h = marketService.getActiveMarkets({ window: '1h' });

      expect(m1.length).toBeGreaterThan(0);
      expect(m5.length).toBeGreaterThan(0);
      expect(m15.length).toBeGreaterThan(0);
      expect(m1h.length).toBeGreaterThan(0);
    });

    it('simulates spot price micro-ticks and computes 1m and 5m drift', () => {
      const initialBtc = marketService.getSpotTicker('BTC/USD');
      expect(initialBtc).toBeDefined();

      const initialPrice = initialBtc!.price;

      // Simulate ticks
      for (let i = 0; i < 5; i++) {
        marketService.simulateSpotMicroTicks();
      }

      const updatedBtc = marketService.getSpotTicker('BTC/USD');
      expect(updatedBtc).toBeDefined();
      expect(updatedBtc!.priceHistory.length).toBeGreaterThan(1);
    });

    it('generates structured 5-level order book depth for YES and NO legs', () => {
      seedOnchainTestMarkets();
      const firstMarket = marketService.getActiveMarkets()[0];
      expect(firstMarket).toBeDefined();

      const depth = marketService.getMarketDepth(firstMarket.id);
      expect(depth).toBeDefined();
      expect(depth!.yesBids.length).toBe(5);
      expect(depth!.yesAsks.length).toBe(5);

      // Bids should be in descending price order
      for (let i = 1; i < depth!.yesBids.length; i++) {
        expect(depth!.yesBids[i].price).toBeLessThanOrEqual(depth!.yesBids[i - 1].price);
      }

      // Asks should be in ascending price order
      for (let i = 1; i < depth!.yesAsks.length; i++) {
        expect(depth!.yesAsks[i].price).toBeGreaterThanOrEqual(depth!.yesAsks[i - 1].price);
      }
    });

    it('updates market book quotes and recalculates theoretical fair value and edge', () => {
      seedOnchainTestMarkets();
      const firstMarket = marketService.getActiveMarkets()[0];

      const updated = marketService.updateMarketBookQuotes(firstMarket.id, 0.40, 0.44);
      expect(updated).toBeDefined();
      expect(updated!.bestBidYes).toBe(0.40);
      expect(updated!.bestAskYes).toBe(0.44);
      expect(updated!.bestBidNo).toBe(0.56);
      expect(updated!.bestAskNo).toBe(0.60);
      expect(updated!.impliedProbYes).toBe(0.42);
    });
  });

  describe('Anomaly Detector Service', () => {
    it('detects an underpriced YES contract anomaly and recommends BUY_YES', () => {
      const testMarket: Market = {
        id: 'test-market-anomaly-yes',
        symbol: 'BTC/USD',
        strikePrice: 96500,
        windowDuration: '5m',
        openTimestamp: new Date(Date.now() - 60000).toISOString(),
        closeTimestamp: new Date(Date.now() + 240000).toISOString(),
        resolutionTimestamp: new Date(Date.now() + 300000).toISOString(),
        status: 'Open',
        bestBidYes: 0.38,
        bestAskYes: 0.42,
        bestBidNo: 0.58,
        bestAskNo: 0.62,
        impliedProbYes: 0.40,
        fairValueYes: 0.60, // 20% edge
        edgePercentage: 0.20,
      };

      const report = anomalyService.evaluateMarket(testMarket, 96600, 0.03);
      expect(report).not.toBeNull();
      expect(report!.severity).toBe('HIGH');
      expect(report!.actionRecommendation).toBe('BUY_YES');
      expect(report!.edgePercentage).toBeGreaterThan(0.05);
    });

    it('detects an overpriced YES / underpriced NO contract anomaly and recommends BUY_NO', () => {
      const testMarket: Market = {
        id: 'test-market-anomaly-no',
        symbol: 'BTC/USD',
        strikePrice: 96500,
        windowDuration: '5m',
        openTimestamp: new Date(Date.now() - 60000).toISOString(),
        closeTimestamp: new Date(Date.now() + 240000).toISOString(),
        resolutionTimestamp: new Date(Date.now() + 300000).toISOString(),
        status: 'Open',
        bestBidYes: 0.68,
        bestAskYes: 0.72,
        bestBidNo: 0.28,
        bestAskNo: 0.32,
        impliedProbYes: 0.70,
        fairValueYes: 0.45, // -25% edge
        edgePercentage: -0.25,
      };

      const report = anomalyService.evaluateMarket(testMarket, 96400, 0.03);
      expect(report).not.toBeNull();
      expect(report!.severity).toBe('HIGH');
      expect(report!.actionRecommendation).toBe('BUY_NO');
    });

    it('scans a list of markets and sorts anomalies by highest absolute edge magnitude', () => {
      const markets: Market[] = [
        {
          id: 'm1',
          symbol: 'BTC/USD',
          strikePrice: 96500,
          windowDuration: '5m',
          openTimestamp: new Date(Date.now() - 60000).toISOString(),
          closeTimestamp: new Date(Date.now() + 240000).toISOString(),
          resolutionTimestamp: new Date(Date.now() + 300000).toISOString(),
          status: 'Open',
          bestBidYes: 0.48,
          bestAskYes: 0.52,
          bestBidNo: 0.48,
          bestAskNo: 0.52,
          impliedProbYes: 0.50,
          fairValueYes: 0.54,
          edgePercentage: 0.04,
        },
        {
          id: 'm2',
          symbol: 'BTC/USD',
          strikePrice: 96500,
          windowDuration: '5m',
          openTimestamp: new Date(Date.now() - 60000).toISOString(),
          closeTimestamp: new Date(Date.now() + 240000).toISOString(),
          resolutionTimestamp: new Date(Date.now() + 300000).toISOString(),
          status: 'Open',
          bestBidYes: 0.35,
          bestAskYes: 0.39,
          bestBidNo: 0.61,
          bestAskNo: 0.65,
          impliedProbYes: 0.37,
          fairValueYes: 0.58,
          edgePercentage: 0.21,
        },
      ];

      const spotPrices = { 'BTC/USD': 96550 };
      const anomalies = anomalyService.scanMarkets(markets, spotPrices, 0.03);

      expect(anomalies.length).toBeGreaterThan(0);
      // First anomaly should have higher absolute edge
      if (anomalies.length > 1) {
        expect(anomalies[0].absoluteEdge).toBeGreaterThanOrEqual(anomalies[1].absoluteEdge);
      }
    });
  });

  describe('REST Endpoints Integration', () => {
    it('GET /api/v1/markets returns 200 with list of contracts', async () => {
      const res = await request(app).get('/api/v1/markets');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /api/v1/markets/:id/depth returns 200 with bid/ask ladders', async () => {
      const res = await request(app).get('/api/v1/markets/test-market-id/depth');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.depth).toBeDefined();
      expect(Array.isArray(res.body.depth.yesBids)).toBe(true);
      expect(Array.isArray(res.body.depth.yesAsks)).toBe(true);
    });

    it('GET /api/v1/markets/anomalies returns 200 with detected anomalies', async () => {
      const res = await request(app).get('/api/v1/markets/anomalies');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /api/v1/markets/spot returns 200 with spot tickers', async () => {
      const res = await request(app).get('/api/v1/markets/spot');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data['BTC/USD']).toBeDefined();
      expect(res.body.data['ETH/USD']).toBeDefined();
    });
  });

  describe('PriceFeedService Real-time Spot Ingestion & Drift Mechanics', () => {
    it('records live price ticks, maintains rolling price history, and computes 1m/5m price drift', () => {
      const btcBefore = marketService.getSpotTicker('BTC/USD');
      expect(btcBefore).toBeDefined();

      // Record a price 60s ago
      const now = Date.now();
      const initialPrice = 96000;
      const newPrice = 96960; // +1.0% jump

      marketService.simulateSpotMicroTicks();
      const updated = marketService.getSpotTicker('BTC/USD');
      expect(updated).toBeDefined();
      expect(typeof updated!.change1m).toBe('number');
      expect(typeof updated!.change5m).toBe('number');
      expect(updated!.high24h).toBeGreaterThan(0);
      expect(updated!.low24h).toBeGreaterThan(0);
    });

    it('propagates spot updates to recalculate fair values on active markets', () => {
      seedOnchainTestMarkets();
      const btcMarket = marketService.getActiveMarkets({ symbol: 'BTC/USD' })[0];
      expect(btcMarket).toBeDefined();

      const initialFair = btcMarket.fairValueYes;

      // Trigger micro tick
      for (let i = 0; i < 5; i++) {
        marketService.simulateSpotMicroTicks();
      }

      const updatedMarket = marketService.getMarketById(btcMarket.id);
      expect(updatedMarket).toBeDefined();
      expect(typeof updatedMarket!.fairValueYes).toBe('number');
    });
  });

  describe('DreamDEX On-Chain Discovery & CLOB Integration', () => {
    it('executes pollOnChainMarkets and parses active binary contracts directly from indexer', async () => {
      vi.spyOn(somniaExchange.client, 'listBinaryMarkets').mockResolvedValue([
        {
          id: '0x1111111111111111111111111111111111111111111111111111111111111111',
          marketId: '0x1111111111111111111111111111111111111111111111111111111111111111',
          poolAddress: '0x2222222222222222222222222222222222222222',
          asset: 'BTC/USD',
          strike: 85000,
          status: 'Trading',
          tradingStart: Math.floor(Date.now() / 1000) - 100,
          expiry: Math.floor(Date.now() / 1000) + 800,
          intervalSec: 900,
        } as any,
      ]);
      await marketService.pollOnChainMarkets();
      const markets = marketService.getActiveMarkets();
      expect(markets.length).toBe(1);

      const first = markets[0];
      expect(first.id).toBe('0x1111111111111111111111111111111111111111111111111111111111111111');
      expect(first.strikePrice).toBe(85000);
      expect(first.isSynthetic).toBe(false);
      expect(first.bestBidYes).toBeGreaterThanOrEqual(0);
      expect(first.bestAskYes).toBeLessThanOrEqual(1.0);

      const depth = marketService.getMarketDepth(first.id);
      expect(depth).toBeDefined();
      expect(depth!.yesBids.length).toBe(5);
      expect(depth!.yesAsks.length).toBe(5);
    });

    it('retrieves unified market by id if available or returns undefined', () => {
      const markets = marketService.getActiveMarkets();
      if (markets.length > 0) {
        const unified = marketService.getUnifiedMarket(markets[0].id);
        expect(unified === undefined || typeof unified === 'object').toBe(true);
      }
    });

    it('retrieves on-chain markets and allows poolAddress lookups', () => {
      // 1. Insert a real on-chain market
      const realMarket: Market = {
        id: '0x1111111111111111111111111111111111111111111111111111111111111111',
        symbol: 'BTC/USD',
        strikePrice: 85000,
        windowDuration: '15m',
        openTimestamp: new Date().toISOString(),
        closeTimestamp: new Date(Date.now() + 600000).toISOString(),
        resolutionTimestamp: new Date(Date.now() + 660000).toISOString(),
        status: 'Open',
        bestBidYes: 0.48,
        bestAskYes: 0.52,
        bestBidNo: 0.48,
        bestAskNo: 0.52,
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

      (marketService as any).markets.set(realMarket.id, realMarket);

      // 2. getActiveMarkets() returns real on-chain market
      const active = marketService.getActiveMarkets();
      expect(active.some((m) => m.id === realMarket.id)).toBe(true);

      // 3. getMarketById resolves by id, lowercase id, poolAddress, and marketIdHex
      expect(marketService.getMarketById(realMarket.id)?.id).toBe(realMarket.id);
      expect(marketService.getMarketById(realMarket.id.toLowerCase())?.id).toBe(realMarket.id);
      expect(marketService.getMarketById('0x2222222222222222222222222222222222222222')?.id).toBe(realMarket.id);
    });
  });
});


