import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockInitialize,
  mockGetActiveMarkets,
  mockGetAllSpotTickers,
  mockGetMarketDepth,
  mockBroadcastTicks,
  mockBroadcastDepth,
} = vi.hoisted(() => ({
  mockInitialize: vi.fn(),
  mockGetActiveMarkets: vi.fn(),
  mockGetAllSpotTickers: vi.fn(),
  mockGetMarketDepth: vi.fn(),
  mockBroadcastTicks: vi.fn(),
  mockBroadcastDepth: vi.fn(),
}));

vi.mock('../src/services/market-service.js', () => ({
  marketService: {
    initialize: mockInitialize,
    getActiveMarkets: mockGetActiveMarkets,
    getAllSpotTickers: mockGetAllSpotTickers,
    getMarketDepth: mockGetMarketDepth,
  },
}));

vi.mock('../src/websocket/server.js', () => ({
  telemetryWsGateway: {
    broadcastMarketTicksBatch: mockBroadcastTicks,
    broadcastDepthUpdate: mockBroadcastDepth,
  },
}));

import { startMarketEmitter, stopMarketEmitter } from '../src/websocket/market-emitter.js';

function makeMarket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-btc-1',
    symbol: 'BTC/USD',
    strikePrice: 100000,
    closeTimestamp: new Date(Date.now() + 300000).toISOString(),
    edgePercentage: 0.05,
    impliedProbYes: 0.5,
    fairValueYes: 0.55,
    convictionState: 'MODERATE',
    recommendedAction: 'BUY_UP',
    recommendedOutcome: 'YES',
    winProbability: 70,
    confidenceScore: 72,
    priceActionTrend: 'BULLISH',
    priceActionScore: 0.3,
    confluenceRationale: 'test rationale',
    ...overrides,
  };
}

describe('startMarketEmitter / stopMarketEmitter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockGetActiveMarkets.mockReturnValue([]);
    mockGetAllSpotTickers.mockReturnValue({});
    mockGetMarketDepth.mockReturnValue(undefined);
  });

  afterEach(() => {
    stopMarketEmitter();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('initializes the market service once and ignores duplicate starts', () => {
    startMarketEmitter(100);
    startMarketEmitter(100);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  it('broadcasts a tick batch with anomaly flag and round-robin depth', () => {
    mockGetActiveMarkets.mockReturnValue([makeMarket()]);
    mockGetAllSpotTickers.mockReturnValue({ 'BTC/USD': { price: 100500 } });
    mockGetMarketDepth.mockReturnValue({
      bestBidYes: 0.45,
      bestAskYes: 0.49,
      yesBids: [{ price: 0.45, quantity: 10 }],
      yesAsks: [{ price: 0.49, quantity: 8 }],
    });

    startMarketEmitter(100);
    vi.advanceTimersByTime(100);

    expect(mockBroadcastTicks).toHaveBeenCalledTimes(1);
    const batch = mockBroadcastTicks.mock.calls[0][0];
    expect(batch).toHaveLength(1);
    expect(batch[0]).toMatchObject({
      marketId: 'm-btc-1',
      symbol: 'BTC/USD',
      spotPrice: 100500,
      hasAnomaly: true, // |0.05| >= 0.03
    });
    expect(batch[0].timeLeftSeconds).toBeGreaterThan(0);

    expect(mockBroadcastDepth).toHaveBeenCalledTimes(1);
    expect(mockBroadcastDepth.mock.calls[0][0]).toMatchObject({
      marketId: 'm-btc-1',
      bestBid: 0.45,
      bestAsk: 0.49,
      bids: [[0.45, 10]],
      asks: [[0.49, 8]],
    });
  });

  it('marks small edges as non-anomalous and falls back to strike when no ticker', () => {
    mockGetActiveMarkets.mockReturnValue([makeMarket({ edgePercentage: 0.01 })]);
    mockGetAllSpotTickers.mockReturnValue({});
    mockGetMarketDepth.mockReturnValue(undefined);

    startMarketEmitter(100);
    vi.advanceTimersByTime(100);

    const batch = mockBroadcastTicks.mock.calls[0][0];
    expect(batch[0].hasAnomaly).toBe(false);
    expect(batch[0].spotPrice).toBe(100000);
    expect(mockBroadcastDepth).not.toHaveBeenCalled();
  });

  it('does nothing when there are no active markets', () => {
    startMarketEmitter(100);
    vi.advanceTimersByTime(500);
    expect(mockBroadcastTicks).not.toHaveBeenCalled();
    expect(mockBroadcastDepth).not.toHaveBeenCalled();
  });

  it('stops broadcasting after stopMarketEmitter', () => {
    mockGetActiveMarkets.mockReturnValue([makeMarket()]);
    mockGetAllSpotTickers.mockReturnValue({});
    mockGetMarketDepth.mockReturnValue(undefined);

    startMarketEmitter(100);
    vi.advanceTimersByTime(100);
    expect(mockBroadcastTicks).toHaveBeenCalledTimes(1);

    stopMarketEmitter();
    vi.advanceTimersByTime(500);
    expect(mockBroadcastTicks).toHaveBeenCalledTimes(1);
  });

  it('survives broadcast errors without killing the loop', () => {
    mockGetActiveMarkets.mockReturnValue([makeMarket()]);
    mockGetAllSpotTickers.mockReturnValue({});
    mockBroadcastTicks.mockImplementationOnce(() => {
      throw new Error('socket boom');
    });

    startMarketEmitter(100);
    vi.advanceTimersByTime(100);
    vi.advanceTimersByTime(100);
    // First tick threw (caught internally), second tick still broadcast.
    expect(mockBroadcastTicks).toHaveBeenCalledTimes(2);
  });
});
