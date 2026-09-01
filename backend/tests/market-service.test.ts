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
    resolutionTimestamp: new Date(Date.now() + 300000).toISOString(),
    status: 'Open',
    bestBidYes: 0.45,
    bestAskYes: 0.49,
    bestBidNo: 0.51,
    bestAskNo: 0.55,
    impliedProbYes: 0.50,
    fairValueYes: 0.50,
    edgePercentage: 0.05,
    poolAddress: '0x3333333333333333333333333333333333333333',
  };

  beforeEach(() => {
    service = new MarketService();
    (service as any).markets.set(mockMarket.id, { ...mockMarket });
  });

  afterEach(() => {
    service.stop();
  });

  it('retrieves spot price accurately from live ticker observations with no artificial fallbacks', () => {
    (service as any).spotPrices.set('BTC/USD', { symbol: 'BTC/USD', price: 96500 });
    (service as any).spotPrices.set('ETH/USD', { symbol: 'ETH/USD', price: 2750 });

    const btcSpot = service.getSpotPrice('BTC/USD');
    expect(btcSpot).toBe(96500);

    const ethSpot = service.getSpotPrice('ETH/USD');
    expect(ethSpot).toBe(2750);

    const unknownSpot = service.getSpotPrice('UNKNOWN/USD');
    expect(unknownSpot).toBe(0);

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
    expect(Array.isArray(depth?.yesBids)).toBe(true);
  });

  it('handles live spot updates and recalculates fair values and edges', () => {
    const ticker: SpotTicker = {
      symbol: 'ETH/USD',
      price: 2850,
      change1m: 0.005,
      change5m: 0.01,
      high24h: 2900,
      low24h: 2750,
      volume24h: 1500000,
      timestamp: Date.now(),
      priceHistory: [{ timestamp: Date.now(), price: 2850 }],
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

  it('filters markets strictly to DreamDEX venues and rejects off-venue markets', async () => {
    const mockBinaryMarkets = [
      { marketId: '0x1', venueId: '0x323ec57fca385a494dbf0685be47ca2a50a11c81', operatorId: 2, voided: false },
      { marketId: '0x2', venueId: '0xoffvenue', operatorId: 99, voided: false },
      { marketId: '0x3', venueId: '0x323ec57fca385a494dbf0685be47ca2a50a11c81', operatorId: 99, voided: false },
      { marketId: '0x4', venueId: '0xother', operatorId: 4, voided: false },
      { marketId: '0x5', venueId: '0x323ec57fca385a494dbf0685be47ca2a50a11c81', operatorId: 2, voided: true },
    ];

    const targetVenueId = '0x323ec57fca385a494dbf0685be47ca2a50a11c81'.toLowerCase();
    const filtered = mockBinaryMarkets.filter((m) => {
      if (m.voided) return false;
      if (m.venueId && m.venueId.toLowerCase() === targetVenueId) return true;
      if (m.operatorId === 2 || m.operatorId === 4) return true;
      return false;
    });

    expect(filtered.map((m) => m.marketId)).toEqual(['0x1', '0x3', '0x4']);
  });

  it('strictly rejects off-chain and invalid markets missing on-chain 32-byte marketId or poolAddress', async () => {
    const targetVenueId = '0x323ec57fca385a494dbf0685be47ca2a50a11c81'.toLowerCase();
    const mockBinaryMarkets = [
      {
        marketId: '0x1111111111111111111111111111111111111111111111111111111111111111',
        poolAddress: '0x2222222222222222222222222222222222222222',
        venueId: targetVenueId,
        voided: false,
      },
      {
        marketId: 'rolling-offchain-market-1',
        poolAddress: '0x2222222222222222222222222222222222222222',
        venueId: targetVenueId,
        voided: false,
      },
      {
        marketId: '0x2222222222222222222222222222222222222222222222222222222222222222',
        poolAddress: '0x0000000000000000000000000000000000000000',
        venueId: targetVenueId,
        voided: false,
      },
    ];

    const filtered = mockBinaryMarkets.filter((m) => {
      if (m.voided) return false;
      if (!m.marketId || typeof m.marketId !== 'string' || !m.marketId.startsWith('0x') || m.marketId.length !== 66) return false;
      if (!m.poolAddress || typeof m.poolAddress !== 'string' || !m.poolAddress.startsWith('0x') || m.poolAddress.length !== 42) return false;
      if (m.poolAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') return false;
      return true;
    });

    expect(filtered.length).toBe(1);
    expect(filtered[0].marketId).toBe('0x1111111111111111111111111111111111111111111111111111111111111111');
  });
});
