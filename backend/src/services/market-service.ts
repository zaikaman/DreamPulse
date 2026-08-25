import { EventEmitter } from 'events';
import type { Market, MarketStatus } from '../types/index.js';
import { calculateFairValue, calculateEdge, parseWindowToSeconds } from '../quantitative/pricing.js';
import { snapTickPrice, snapLotQuantity } from '../quantitative/quantizer.js';
import { SOMNIA_ADDRESSES } from '../config/somnia.js';
import { getServiceSupabase } from '../config/supabase.js';

export interface SpotTicker {
  symbol: string;
  price: number;
  change1m: number;
  change5m: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
  priceHistory: Array<{ timestamp: number; price: number }>;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBookDepth {
  marketId: string;
  symbol: string;
  bestBidYes: number;
  bestAskYes: number;
  bestBidNo: number;
  bestAskNo: number;
  yesBids: OrderBookLevel[];
  yesAsks: OrderBookLevel[];
  noBids: OrderBookLevel[];
  noAsks: OrderBookLevel[];
  updatedAt: number;
}

export class MarketService extends EventEmitter {
  private markets: Map<string, Market> = new Map();
  private depthBooks: Map<string, OrderBookDepth> = new Map();
  private spotPrices: Map<string, SpotTicker> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private dbSyncInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  constructor() {
    super();
    this.initializeSpotTickers();
    this.generateRollingMarkets();
    this.updateAllFairValuesAndDepths();
  }

  private initializeSpotTickers(): void {
    const now = Date.now();
    const defaultTickers: Record<string, { price: number; high: number; low: number; vol: number }> = {
      'BTC/USD': { price: 96450.0, high: 97800.0, low: 95200.0, vol: 18450.2 },
      'ETH/USD': { price: 2745.5, high: 2820.0, low: 2690.0, vol: 84200.5 },
      'SOL/USD': { price: 188.25, high: 196.0, low: 181.5, vol: 320100.0 },
    };

    for (const [symbol, data] of Object.entries(defaultTickers)) {
      this.spotPrices.set(symbol, {
        symbol,
        price: data.price,
        change1m: 0.0,
        change5m: 0.0,
        high24h: data.high,
        low24h: data.low,
        volume24h: data.vol,
        timestamp: now,
        priceHistory: [{ timestamp: now, price: data.price }],
      });
    }
  }

  /**
   * Initializes market catalog, generates initial rolling event contracts, and starts polling loops.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.generateRollingMarkets();
    this.updateAllFairValuesAndDepths();

    // High frequency price & contract tick loop (100ms)
    this.updateInterval = setInterval(() => {
      this.simulateSpotMicroTicks();
      this.refreshMarketTimersAndFairValues();
    }, 100);

    // Periodic Supabase DB sync (every 5 seconds)
    this.dbSyncInterval = setInterval(async () => {
      await this.syncActiveMarketsToDatabase().catch((_err) => {});
    }, 5000);

    this.isInitialized = true;
    this.emit('initialized', { activeMarketsCount: this.markets.size });
  }

  /**
   * Generates continuous active rolling binary prediction markets (5m, 15m, 1h)
   * anchored around current spot prices and block time boundaries.
   */
  public generateRollingMarkets(): void {
    const now = Date.now();
    const symbols = ['BTC/USD', 'ETH/USD'];
    const windows: Array<'5m' | '15m' | '1h'> = ['5m', '15m', '1h'];

    for (const symbol of symbols) {
      const spot = this.spotPrices.get(symbol)?.price || (symbol === 'BTC/USD' ? 96500 : 2750);

      for (const windowDur of windows) {
        const windowSec = parseWindowToSeconds(windowDur);
        const windowMs = windowSec * 1000;

        // Align window close to next round boundary
        const currentWindowIndex = Math.floor(now / windowMs);
        const closeTimeMs = (currentWindowIndex + 1) * windowMs;
        const openTimeMs = currentWindowIndex * windowMs;

        // Strike offset variations (At-The-Money strike near current round price)
        const roundBase = symbol === 'BTC/USD' ? 50 : 5;
        const atmStrike = Math.round(spot / roundBase) * roundBase;

        const strikes = [
          atmStrike,
          symbol === 'BTC/USD' ? atmStrike + 100 : atmStrike + 15,
          symbol === 'BTC/USD' ? atmStrike - 100 : atmStrike - 15,
        ];

        for (const strike of strikes) {
          const marketId = `${SOMNIA_ADDRESSES.binaryModule}-${symbol.replace('/', '')}-${windowDur}-${strike}-${closeTimeMs}`;

          if (!this.markets.has(marketId)) {
            const timeLeft = Math.max(1, Math.floor((closeTimeMs - now) / 1000));
            const fair = calculateFairValue(spot, strike, timeLeft, symbol);

            // Seed realistic initial resting order book prices around fair value
            const spread = 0.02;
            const seedBid = Math.max(0.01, Math.min(0.98, fair.fairValueYes - spread / 2));
            const seedAsk = Math.max(0.02, Math.min(0.99, fair.fairValueYes + spread / 2));

            const edge = calculateEdge(fair.fairValueYes, seedBid, seedAsk);

            const newMarket: Market = {
              id: marketId,
              symbol,
              strikePrice: strike,
              windowDuration: windowDur,
              openTimestamp: new Date(openTimeMs).toISOString(),
              closeTimestamp: new Date(closeTimeMs).toISOString(),
              resolutionTimestamp: new Date(closeTimeMs + 60000).toISOString(),
              status: 'Open',
              bestBidYes: Number(seedBid.toFixed(2)),
              bestAskYes: Number(seedAsk.toFixed(2)),
              bestBidNo: Number((1.0 - seedAsk).toFixed(2)),
              bestAskNo: Number((1.0 - seedBid).toFixed(2)),
              impliedProbYes: edge.impliedProbYes,
              fairValueYes: fair.fairValueYes,
              edgePercentage: edge.edgePercentage,
            };

            this.markets.set(marketId, newMarket);
            this.generateDepthBook(newMarket);
          }
        }
      }
    }
  }

  /**
   * Generates structured order book depth ladders (5 levels) for YES and NO legs.
   */
  private generateDepthBook(market: Market): OrderBookDepth {
    const yesBids: OrderBookLevel[] = [];
    const yesAsks: OrderBookLevel[] = [];
    const noBids: OrderBookLevel[] = [];
    const noAsks: OrderBookLevel[] = [];

    const bestBid = market.bestBidYes;
    const bestAsk = market.bestAskYes;

    // Build 5 levels for YES Bids (descending from bestBid)
    let cumulativeBidTotal = 0;
    for (let i = 0; i < 5; i++) {
      const price = Number(Math.max(0.01, bestBid - i * 0.01).toFixed(2));
      const qty = Math.round((100 + i * 85 + (market.strikePrice % 17) * 12) / 5) * 5;
      cumulativeBidTotal += price * qty;
      yesBids.push({
        price,
        quantity: qty,
        total: Number(cumulativeBidTotal.toFixed(2)),
      });
    }

    // Build 5 levels for YES Asks (ascending from bestAsk)
    let cumulativeAskTotal = 0;
    for (let i = 0; i < 5; i++) {
      const price = Number(Math.min(0.99, bestAsk + i * 0.01).toFixed(2));
      const qty = Math.round((120 + i * 95 + (market.strikePrice % 13) * 15) / 5) * 5;
      cumulativeAskTotal += price * qty;
      yesAsks.push({
        price,
        quantity: qty,
        total: Number(cumulativeAskTotal.toFixed(2)),
      });
    }

    // Derive NO levels (P_NO = 1 - P_YES)
    const bestNoBid = market.bestBidNo;
    const bestNoAsk = market.bestAskNo;

    let cumNoBid = 0;
    for (let i = 0; i < 5; i++) {
      const price = Number(Math.max(0.01, bestNoBid - i * 0.01).toFixed(2));
      const qty = yesAsks[i]?.quantity || 150;
      cumNoBid += price * qty;
      noBids.push({ price, quantity: qty, total: Number(cumNoBid.toFixed(2)) });
    }

    let cumNoAsk = 0;
    for (let i = 0; i < 5; i++) {
      const price = Number(Math.min(0.99, bestNoAsk + i * 0.01).toFixed(2));
      const qty = yesBids[i]?.quantity || 150;
      cumNoAsk += price * qty;
      noAsks.push({ price, quantity: qty, total: Number(cumNoAsk.toFixed(2)) });
    }

    const depth: OrderBookDepth = {
      marketId: market.id,
      symbol: market.symbol,
      bestBidYes: market.bestBidYes,
      bestAskYes: market.bestAskYes,
      bestBidNo: market.bestBidNo,
      bestAskNo: market.bestAskNo,
      yesBids,
      yesAsks,
      noBids,
      noAsks,
      updatedAt: Date.now(),
    };

    this.depthBooks.set(market.id, depth);
    return depth;
  }

  /**
   * Simulates high-frequency micro-ticks and spot price drift.
   */
  public simulateSpotMicroTicks(): void {
    const now = Date.now();

    for (const [symbol, ticker] of this.spotPrices.entries()) {
      // Deterministic Brownian micro-variation: mean-reverting drift + random walk
      const volatility = symbol === 'BTC/USD' ? 4.5 : symbol === 'ETH/USD' ? 0.45 : 0.08;
      const delta = (Math.random() - 0.498) * volatility;
      const newPrice = Number((ticker.price + delta).toFixed(2));

      // Append to rolling history
      ticker.priceHistory.push({ timestamp: now, price: newPrice });
      if (ticker.priceHistory.length > 300) {
        ticker.priceHistory.shift();
      }

      // Calculate 1m and 5m drift
      const cutoff1m = now - 60000;
      const cutoff5m = now - 300000;

      const p1m = ticker.priceHistory.find((p) => p.timestamp >= cutoff1m)?.price || ticker.priceHistory[0].price;
      const p5m = ticker.priceHistory.find((p) => p.timestamp >= cutoff5m)?.price || ticker.priceHistory[0].price;

      ticker.price = newPrice;
      ticker.change1m = Number(((newPrice - p1m) / p1m).toFixed(5));
      ticker.change5m = Number(((newPrice - p5m) / p5m).toFixed(5));
      ticker.timestamp = now;
      ticker.high24h = Math.max(ticker.high24h, newPrice);
      ticker.low24h = Math.min(ticker.low24h, newPrice);
    }
  }

  /**
   * Refreshes market time countdowns, mathematical fair values $\Phi(z)$, and rolls expired windows.
   */
  public refreshMarketTimersAndFairValues(): void {
    const now = Date.now();
    let hasExpired = false;

    for (const [id, market] of this.markets.entries()) {
      const closeTime = new Date(market.closeTimestamp).getTime();
      const timeLeftSeconds = Math.max(0, Math.floor((closeTime - now) / 1000));

      if (timeLeftSeconds <= 0) {
        // Market expired -> Mark resolved and trigger rolling replacement
        market.status = 'Finalized';
        const spot = this.spotPrices.get(market.symbol)?.price || 0;
        market.settlementPrice = spot;
        market.winningOutcome = spot >= market.strikePrice ? 'YES' : 'NO';
        hasExpired = true;
      } else {
        // Active market: compute fair value and edge
        const spot = this.spotPrices.get(market.symbol)?.price || market.strikePrice;
        const fair = calculateFairValue(spot, market.strikePrice, timeLeftSeconds, market.symbol);
        const edge = calculateEdge(fair.fairValueYes, market.bestBidYes, market.bestAskYes);

        market.fairValueYes = fair.fairValueYes;
        market.impliedProbYes = edge.impliedProbYes;
        market.edgePercentage = edge.edgePercentage;
      }
    }

    if (hasExpired) {
      // Purge finalized markets older than 10 minutes and generate fresh active ones
      const tenMinutesAgo = now - 600000;
      for (const [id, m] of this.markets.entries()) {
        if (m.status === 'Finalized' && new Date(m.closeTimestamp).getTime() < tenMinutesAgo) {
          this.markets.delete(id);
          this.depthBooks.delete(id);
        }
      }
      this.generateRollingMarkets();
    }
  }

  private updateAllFairValuesAndDepths(): void {
    const now = Date.now();
    for (const [, market] of this.markets.entries()) {
      const closeTime = new Date(market.closeTimestamp).getTime();
      const timeLeft = Math.max(1, Math.floor((closeTime - now) / 1000));
      const spot = this.spotPrices.get(market.symbol)?.price || market.strikePrice;
      const fair = calculateFairValue(spot, market.strikePrice, timeLeft, market.symbol);
      const edge = calculateEdge(fair.fairValueYes, market.bestBidYes, market.bestAskYes);

      market.fairValueYes = fair.fairValueYes;
      market.impliedProbYes = edge.impliedProbYes;
      market.edgePercentage = edge.edgePercentage;
      this.generateDepthBook(market);
    }
  }

  /**
   * Syncs active markets to Supabase database.
   */
  public async syncActiveMarketsToDatabase(): Promise<void> {
    try {
      const supabase = getServiceSupabase();
      const rows = Array.from(this.markets.values()).map((m) => ({
        id: m.id,
        symbol: m.symbol,
        strike_price: m.strikePrice,
        window_duration: m.windowDuration,
        open_timestamp: m.openTimestamp,
        close_timestamp: m.closeTimestamp,
        resolution_timestamp: m.resolutionTimestamp,
        status: m.status,
        settlement_price: m.settlementPrice ?? null,
        winning_outcome: m.winningOutcome ?? null,
        best_bid_yes: m.bestBidYes,
        best_ask_yes: m.bestAskYes,
        best_bid_no: m.bestBidNo,
        best_ask_no: m.bestAskNo,
        implied_prob_yes: m.impliedProbYes,
        fair_value_yes: m.fairValueYes,
        edge_percentage: m.edgePercentage,
        updated_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        await supabase.from('markets').upsert(rows, { onConflict: 'id' });
      }
    } catch (_err) {
      // Non-fatal: Supabase sync can fail silently in offline/local dev mode
    }
  }

  // ----------------------------------------------------------------------------
  // Public Accessors
  // ----------------------------------------------------------------------------

  public getActiveMarkets(filters?: { symbol?: string; window?: string; status?: MarketStatus }): Market[] {
    let result = Array.from(this.markets.values());

    if (filters?.symbol) {
      result = result.filter((m) => m.symbol.toLowerCase() === filters.symbol?.toLowerCase());
    }
    if (filters?.window) {
      result = result.filter((m) => m.windowDuration.toLowerCase() === filters.window?.toLowerCase());
    }
    if (filters?.status) {
      result = result.filter((m) => m.status === filters.status);
    }

    return result;
  }

  public getMarketById(id: string): Market | undefined {
    return this.markets.get(id);
  }

  public getMarketDepth(id: string): OrderBookDepth | undefined {
    return this.depthBooks.get(id);
  }

  public getSpotTicker(symbol: string): SpotTicker | undefined {
    return this.spotPrices.get(symbol);
  }

  public getAllSpotTickers(): Record<string, SpotTicker> {
    const res: Record<string, SpotTicker> = {};
    for (const [k, v] of this.spotPrices.entries()) {
      res[k] = v;
    }
    return res;
  }

  /**
   * Updates resting prices on a market book and recalculates depth & edge.
   */
  public updateMarketBookQuotes(
    marketId: string,
    bestBidYes: number,
    bestAskYes: number,
  ): Market | undefined {
    const market = this.markets.get(marketId);
    if (!market) return undefined;

    market.bestBidYes = Number(bestBidYes.toFixed(2));
    market.bestAskYes = Number(bestAskYes.toFixed(2));
    market.bestBidNo = Number((1.0 - bestAskYes).toFixed(2));
    market.bestAskNo = Number((1.0 - bestBidYes).toFixed(2));

    const spot = this.spotPrices.get(market.symbol)?.price || market.strikePrice;
    const now = Date.now();
    const closeTime = new Date(market.closeTimestamp).getTime();
    const timeLeft = Math.max(1, Math.floor((closeTime - now) / 1000));

    const fair = calculateFairValue(spot, market.strikePrice, timeLeft, market.symbol);
    const edge = calculateEdge(fair.fairValueYes, market.bestBidYes, market.bestAskYes);

    market.fairValueYes = fair.fairValueYes;
    market.impliedProbYes = edge.impliedProbYes;
    market.edgePercentage = edge.edgePercentage;

    this.generateDepthBook(market);
    this.emit('market_updated', market);

    return market;
  }

  public stop(): void {
    if (this.updateInterval) clearInterval(this.updateInterval);
    if (this.dbSyncInterval) clearInterval(this.dbSyncInterval);
  }
}

export const marketService = new MarketService();
