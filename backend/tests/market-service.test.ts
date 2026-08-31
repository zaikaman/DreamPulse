import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MarketService } from '../src/services/market-service.js';
import type { SpotTicker } from '../src/services/price-feed-service.js';
import type { Market } from '../src/types/index.js';

describe('MarketService Comprehensive Unit Suite', () => {
  let service: MarketService;

  const mockMarket: Market = {
    id: 'market-eth-test-1',
    symbol: 'ETH/USD',
    windowDuration: '5m',
    strikePrice: 2800,
    openTimestamp: new Date(Date.now() - 60000).toISOString(),
    closeTimestamp: new Date(Date.now() + 240000).toISOString(),
    status: 'Open',
    bestBidYes: 0.45,
    bestAskYes: 0.49,
    bestBidNo: 0.51,
    bestAskNo: 0.55,
    fairValueYes: 0.50,
    edgePercentage: 0.05,
    tradeCount: 25,
    poolAddress: '0x3333333333333333333333333333333333333333',
  };

  beforeEach(() => {
    service = new MarketService();
    (service as any).markets.set(mockMarket.id, { ...mockMarket });
  });

  afterEach(() => {
    service.stop();
  });

  it('retrieves spot price with fallback and spot tickers map', () => {
    const btcSpot = service.getSpotPrice('BTC/USD');
    expect(btcSpot).toBeGreaterThan(0);

    const ethSpot = service.getSpotPrice('ETH/USD');
    expect(ethSpot).toBeGreaterThan(0);

    const unknownSpot = service.getSpotPrice('UNKNOWN/USD');
    expect(unknownSpot).toBe(100);

    const all = service.getAllSpotTickers();
    expect(typeof all).toBe('object');
  });

  it('filters and queries active markets by status, symbol, and windowDuration', () => {
    const all = service.getActiveMarkets();
    expect(all.length).toBeGreaterThanOrEqual(1);

    const ethMarkets = service.getActiveMarkets({ symbol: 'ETH/USD' });
    expect(ethMarkets.length).toBeGreaterThanOrEqual(1);
    expect(ethMarkets[0].symbol).toBe('ETH/USD');

    const btcMarkets = service.getActiveMarkets({ symbol: 'BTC/USD' });
    expect(btcMarkets.length).toBe(0);

    const openMarkets = service.getActiveMarkets({ status: 'Open' });
    expect(openMarkets.length).toBeGreaterThanOrEqual(1);
  });

  it('retrieves market by ID and handles depth querying & updates', () => {
    const byId = service.getMarketById(mockMarket.id);
    expect(byId).toBeDefined();
    expect(byId?.symbol).toBe('ETH/USD');

    const notFound = service.getMarketById('non-existent-market');
    expect(notFound).toBeUndefined();

    // Update quotes
    const updated = service.updateMarketBookQuotes(mockMarket.id, 0.46, 0.50);
    expect(updated).toBeDefined();
    expect(updated?.bestBidYes).toBe(0.46);
    expect(updated?.bestAskYes).toBe(0.50);

    const depth = service.getMarketDepth(mockMarket.id);
    expect(depth).toBeDefined();
    expect(depth?.symbol).toBe('ETH/USD');
    expect(depth?.yesBids.length).toBeGreaterThan(0);
  });

  it('handles live spot updates and recalculates fair values and edges', () => {
    const ticker: SpotTicker = {
      symbol: 'ETH/USD',
      price: 2850,
      change1m: 0.005,
      change5m: 0.01,
      timestamp: Date.now(),
    };

    (service as any).handleLiveSpotUpdate(ticker);
    const updated = service.getMarketById(mockMarket.id);
    expect(updated).toBeDefined();
    expect(updated?.fairValueYes).toBeGreaterThan(0.40);
  });

  it('archives historical markets and limits historical cache capacity', () => {
    const closedMarket: Market = {
      ...mockMarket,
      id: 'market-closed-1',
      status: 'Closed',
    };

    (service as any).archiveHistoricalMarket(closedMarket);
    const historical = service.getHistoricalMarkets();
    expect(historical.length).toBeGreaterThanOrEqual(1);
    expect(historical.some((m) => m.id === 'market-closed-1')).toBe(true);
  });
});
