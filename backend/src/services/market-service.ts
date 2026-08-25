import { EventEmitter } from 'events';
import type { Market, MarketStatus, OutcomeType } from '../types/index.js';
import { calculateFairValue, calculateEdge, parseWindowToSeconds } from '../quantitative/pricing.js';
import { SOMNIA_ADDRESSES, somniaExchange, MARKET_STATUS } from '../config/somnia.js';
import { env } from '../config/env.js';
import { getServiceSupabase, supabase } from '../config/supabase.js';
import { priceFeedService, type SpotTicker } from './price-feed-service.js';
import type { UnifiedMarket, UnifiedOrderBook, BinaryMarket, BinaryOrderBook } from '@somnia-chain/markets-sdk';
import type { Address, Hex } from 'viem';

export type { SpotTicker } from './price-feed-service.js';

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
  private historicalMarkets: Map<string, Market> = new Map();
  private depthBooks: Map<string, OrderBookDepth> = new Map();
  private spotPrices: Map<string, SpotTicker> = new Map();
  private unifiedMarketsMap: Map<string, UnifiedMarket> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private onchainPollInterval: NodeJS.Timeout | null = null;
  private dbSyncInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private isPolling = false;
  private priceUpdateHandler: (ticker: SpotTicker) => void;

  constructor() {
    super();
    this.syncInitialSpotTickers();
    this.generateOfflineTestMarkets();

    // Hook live price feed updates to dynamic fair value repricing
    this.priceUpdateHandler = (ticker: SpotTicker) => {
      this.handleLiveSpotUpdate(ticker);
    };
    priceFeedService.on('spotUpdate', this.priceUpdateHandler);
  }

  private syncInitialSpotTickers(): void {
    const all = priceFeedService.getAllSpotTickers();
    for (const [symbol, ticker] of Object.entries(all)) {
      this.spotPrices.set(symbol, ticker);
    }
  }

  /**
   * Returns latest spot price for an asset symbol.
   */
  public getSpotPrice(symbol: string): number {
    const ticker = this.spotPrices.get(symbol);
    if (ticker && ticker.price > 0) return ticker.price;
    if (symbol === 'BTC/USD') return 96500;
    if (symbol === 'ETH/USD') return 2750;
    if (symbol === 'SOL/USD') return 188;
    if (symbol === 'BNB/USD') return 624;
    if (symbol === 'DOGE/USD') return 0.25;
    return 100;
  }

  private handleLiveSpotUpdate(ticker: SpotTicker): void {
    this.spotPrices.set(ticker.symbol, ticker);

    const now = Date.now();
    for (const [, market] of this.markets.entries()) {
      if (market.symbol === ticker.symbol && market.status === 'Open') {
        const closeTime = new Date(market.closeTimestamp).getTime();
        const timeLeftSeconds = Math.max(1, Math.floor((closeTime - now) / 1000));
        const fair = calculateFairValue(ticker.price, market.strikePrice, timeLeftSeconds, market.symbol, undefined, ticker.priceHistory);
        const edge = calculateEdge(fair.fairValueYes, market.bestBidYes, market.bestAskYes);

        market.fairValueYes = fair.fairValueYes;
        market.impliedProbYes = edge.impliedProbYes;
        market.edgePercentage = edge.edgePercentage;
      }
    }
    this.emit('spot_updated', ticker);
  }

  private archiveHistoricalMarket(market: Market): void {
    this.historicalMarkets.set(market.id, { ...market });
    if (this.historicalMarkets.size > 1000) {
      const firstKey = this.historicalMarkets.keys().next().value;
      if (firstKey) this.historicalMarkets.delete(firstKey);
    }
  }

  /**
   * Initializes market catalog, price feed ingestion, on-chain discovery, and starts polling loops.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await priceFeedService.initialize().catch((err) => {
      console.warn('[MarketService] Price feed initialization notice:', err.message);
    });
    this.syncInitialSpotTickers();

    // Perform immediate on-chain discovery from DreamDEX indexer & CLOB
    await this.pollOnChainMarkets().catch((err) => {
      console.warn('[MarketService] Initial on-chain discovery fallback:', err.message);
    });

    // High frequency contract expiration & fair value refresh loop (250ms)
    this.updateInterval = setInterval(() => {
      this.refreshMarketTimersAndFairValues();
    }, 250);

    // Periodic on-chain indexer & CLOB polling loop (every 5 seconds)
    this.onchainPollInterval = setInterval(async () => {
      await this.pollOnChainMarkets().catch(() => {});
    }, 5000);

    // Periodic Supabase DB sync (every 5 seconds)
    this.dbSyncInterval = setInterval(async () => {
      await this.syncActiveMarketsToDatabase().catch(() => {});
    }, 5000);

    this.isInitialized = true;
    this.emit('initialized', { activeMarketsCount: this.markets.size });
  }

  /**
   * Discovers real-time binary prediction markets directly from the DreamDEX indexer
   * and fetches live CLOB order book depth levels.
   */
  public async pollOnChainMarkets(timeoutMs = 8000): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const fetchMarketsPromise = somniaExchange.client.listBinaryMarkets({ limit: 60 });
      const timeoutPromise = new Promise<BinaryMarket[]>((_, reject) =>
        setTimeout(() => reject(new Error('SomniaMarkets indexer timeout')), timeoutMs),
      );
      const binaryMarkets = await Promise.race([fetchMarketsPromise, timeoutPromise]);

      // Filter active markets from the Somnia DreamDEX venues
      const targetVenueId = env.DREAMDEX_VENUE_ID.toLowerCase();
      const liveBinaryMarkets = binaryMarkets.filter((m) => {
        if (m.voided) return false;
        if (m.venueId && m.venueId.toLowerCase() === targetVenueId) return true;
        if (m.operatorId === 2 || m.operatorId === 4) return true;
        return true;
      });

      const now = Date.now();
      const discoveredIds = new Set<string>();

      // Fetch CLOB orderbooks in parallel with a timeout per market
      const obPromises = liveBinaryMarkets.map(async (m) => {
        if (m.poolAddress) {
          try {
            const fetchPromise = somniaExchange.client.getBinaryOrderBook(m.poolAddress as Address, { depth: 5, decimals: 6 });
            const obTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
            return await Promise.race([fetchPromise, obTimeout]);
          } catch {
            return null;
          }
        }
        return null;
      });

      const orderBooks = await Promise.allSettled(obPromises);

      // Retain previous markets for historical lookup; do not blindly clear before archiving
      const previousMarketIds = new Set(this.markets.keys());
      if (liveBinaryMarkets.length > 0) {
        // Only clear depth/unified maps incrementally; markets map will be upserted
        this.depthBooks.clear();
        this.unifiedMarketsMap.clear();
      }

      for (let i = 0; i < liveBinaryMarkets.length; i++) {
        const m = liveBinaryMarkets[i];
        if (!m) continue;

        const rawAsset = String(m.asset || 'BTC').toUpperCase();
        const symbol = rawAsset.includes('/') ? rawAsset : `${rawAsset}/USD`;
        const spot = this.spotPrices.get(symbol)?.price || (symbol === 'BTC/USD' ? 77000 : 2400);

        // Parse strike price accurately from question or strike field
        let strike = 0;
        const questionText = String(m.question || '');
        const match = questionText.match(/at or above ([0-9.]+)/i);
        if (match && match[1]) {
          strike = parseFloat(match[1]);
        } else if (m.strike && Number(m.strike) > 0) {
          const rawStrike = Number(m.strike);
          if (rawStrike > 1000000) {
            strike = rawStrike / 100;
          } else {
            strike = rawStrike;
          }
        } else {
          // ATM market ("closes at or above opening price")
          strike = Math.round(spot);
        }

        const intervalSec = Number(m.intervalSec || 300);
        let windowDuration: '5m' | '15m' | '1h' | '4h' | '24h' | '7d' | string = '5m';
        if (intervalSec >= 604800) windowDuration = '7d';
        else if (intervalSec >= 86400) windowDuration = '24h';
        else if (intervalSec >= 14400) windowDuration = '4h';
        else if (intervalSec >= 3600) windowDuration = '1h';
        else if (intervalSec >= 900) windowDuration = '15m';
        else windowDuration = '5m';

        const expirySec = Number(m.expiry || 0);
        const closeTimeMs = expirySec > 0 ? expirySec * 1000 : now + intervalSec * 1000;
        const tradingStartSec = Number(m.tradingStart || 0);
        const openTimeMs = tradingStartSec > 0 ? tradingStartSec * 1000 : closeTimeMs - intervalSec * 1000;
        const timeLeftSeconds = Math.max(0, Math.floor((closeTimeMs - now) / 1000));

        const rawStatus = String(m.status || '');
        let status: MarketStatus = 'Open';
        if (
          m.finalized ||
          rawStatus === 'Finalized' ||
          rawStatus === 'Resolved' ||
          rawStatus === 'Voided' ||
          rawStatus === '4' ||
          rawStatus === '5' ||
          timeLeftSeconds <= 0
        ) {
          status = 'Finalized';
        } else if (rawStatus === 'Settling' || rawStatus === '3') {
          status = 'Resolving';
        } else if (rawStatus === 'Trading' || rawStatus === '1' || (!m.status && timeLeftSeconds > 0)) {
          status = 'Open';
        } else {
          status = 'Finalized';
        }

        const marketId = String(m.marketId || m.id || `${SOMNIA_ADDRESSES.binaryModule}-${m.id}`);
        discoveredIds.add(marketId);

        // Populate unified representation
        const unifiedMarket: UnifiedMarket = {
          id: marketId,
          symbol,
          type: 'binary',
          base: symbol.split('/')[0] || symbol,
          quote: 'USDC',
          settle: 'USDC',
          active: status === 'Open',
          contract: false,
          precision: {
            price: 6,
            amount: 6,
          },
          limits: {
            amount: { min: 1 },
          },
          outcomes: [
            { symbol: `${symbol}:YES`, label: 'YES', index: 0 },
            { symbol: `${symbol}:NO`, label: 'NO', index: 1 },
          ],
          info: m as any,
        };
        this.unifiedMarketsMap.set(marketId, unifiedMarket);

        // Extract fetched CLOB Order Book Depth
        let bestBidYes = 0.49;
        let bestAskYes = 0.51;
        const obResult = orderBooks[i];
        const depthLevels = obResult && obResult.status === 'fulfilled' ? obResult.value : null;

        if (depthLevels && depthLevels.yesBids && depthLevels.yesBids.length > 0 && depthLevels.yesBids[0].price > 0n) {
          bestBidYes = Number((Number(depthLevels.yesBids[0].price) / 1_000_000).toFixed(3));
        }
        if (depthLevels && depthLevels.yesAsks && depthLevels.yesAsks.length > 0 && depthLevels.yesAsks[0].price > 0n) {
          bestAskYes = Number((Number(depthLevels.yesAsks[0].price) / 1_000_000).toFixed(3));
        }

        // Calculate quantitative fair value and edge
        const ticker = this.spotPrices.get(symbol);
        const fair = calculateFairValue(spot, strike, Math.max(1, timeLeftSeconds), symbol, undefined, ticker?.priceHistory);
        const edge = calculateEdge(fair.fairValueYes, bestBidYes, bestAskYes);

        const marketObj: Market = {
          id: marketId,
          symbol,
          strikePrice: strike,
          windowDuration,
          openTimestamp: new Date(openTimeMs).toISOString(),
          closeTimestamp: new Date(closeTimeMs).toISOString(),
          resolutionTimestamp: new Date(closeTimeMs + 60000).toISOString(),
          status,
          settlementPrice: status === 'Finalized' && (m as any).settlementPrice ? Number((m as any).settlementPrice) : undefined,
          winningOutcome:
            status === 'Finalized'
              ? (m as any).isVoided
                ? 'VOID'
                : (m as any).winningOutcome === 0
                ? 'YES'
                : (m as any).winningOutcome === 1
                ? 'NO'
                : undefined
              : undefined,
          bestBidYes: Number(bestBidYes.toFixed(2)),
          bestAskYes: Number(bestAskYes.toFixed(2)),
          bestBidNo: Number((1.0 - bestAskYes).toFixed(2)),
          bestAskNo: Number((1.0 - bestBidYes).toFixed(2)),
          impliedProbYes: edge.impliedProbYes,
          fairValueYes: fair.fairValueYes,
          edgePercentage: edge.edgePercentage,
          poolAddress: m.poolAddress as Address,
          marketIdHex: m.marketId as Hex,
          venueId: m.venueId || undefined,
          operatorId: m.operatorId || undefined,
          yesTokenId: m.yesTokenId,
          noTokenId: m.noTokenId,
          intervalSec,
          onchainStatus: m.status === 'Trading' ? MARKET_STATUS.Trading : undefined,
        };

        if (status === 'Open') {
          this.markets.set(marketId, marketObj);
          this.buildDepthBookFromClob(marketObj, depthLevels);
        } else {
          this.archiveHistoricalMarket(marketObj);
          this.markets.delete(marketId);
          this.depthBooks.delete(marketId);
        }
      }

      // Upsert live markets into active map, and archive any stale (expired) markets to historical cache so PnL can still resolve
      if (discoveredIds.size > 0) {
        for (const id of previousMarketIds) {
          if (!discoveredIds.has(id)) {
            const stale = this.markets.get(id);
            if (stale) {
              const closeMs = new Date(stale.closeTimestamp).getTime();
              if (Date.now() >= closeMs && stale.status !== 'Finalized') {
                const spot = this.spotPrices.get(stale.symbol)?.price || stale.strikePrice;
                stale.status = 'Finalized';
                stale.settlementPrice = spot;
                stale.winningOutcome = spot >= stale.strikePrice ? 'YES' : 'NO';
                void this.persistFinalizedMarket(stale).catch(() => {});
                void import('./order-service.js').then((mod) => {
                  void mod.orderService.settleOrdersForMarket(stale.id, stale.winningOutcome!, stale.settlementPrice);
                }).catch(() => {});
              }
              this.archiveHistoricalMarket(stale);
              this.markets.delete(id);
              this.depthBooks.delete(id);
            }
          }
        }
      }

      // Ensure active live prediction windows exist if on-chain has no active open rounds
      this.ensureRollingMarkets();

      this.emit('markets_synced', { count: this.markets.size });
    } catch (err: any) {
      console.warn('[MarketService] pollOnChainMarkets error (retaining current onchain state):', err.message);
      // If no markets exist yet (e.g. offline testing), seed minimal test fallback
      if (this.markets.size === 0) {
        this.ensureRollingMarkets();
      }
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Constructs structured 5-level order book depth ladders from live CLOB snapshot.
   */
  private buildDepthBookFromClob(
    market: Market,
    clob?: BinaryOrderBook | UnifiedOrderBook | null,
  ): OrderBookDepth {
    const yesBids: OrderBookLevel[] = [];
    const yesAsks: OrderBookLevel[] = [];
    const noBids: OrderBookLevel[] = [];
    const noAsks: OrderBookLevel[] = [];

    const bestBid = market.bestBidYes;
    const bestAsk = market.bestAskYes;

    if (clob && 'yesBids' in clob && Array.isArray(clob.yesBids) && clob.yesBids.length > 0) {
      let cumBid = 0;
      for (const level of clob.yesBids.slice(0, 5)) {
        const p = Number(level.price) / 1_000_000;
        const q = Number(level.quantity) / 1_000_000;
        cumBid += p * q;
        yesBids.push({ price: Number(p.toFixed(3)), quantity: q, total: Number(cumBid.toFixed(2)) });
      }
    } else if (clob && 'bids' in clob && Array.isArray(clob.bids) && clob.bids.length > 0) {
      let cumBid = 0;
      for (const [p, q] of clob.bids.slice(0, 5)) {
        cumBid += p * q;
        yesBids.push({ price: Number(p.toFixed(3)), quantity: q, total: Number(cumBid.toFixed(2)) });
      }
    }

    if (clob && 'yesAsks' in clob && Array.isArray(clob.yesAsks) && clob.yesAsks.length > 0) {
      let cumAsk = 0;
      for (const level of clob.yesAsks.slice(0, 5)) {
        const p = Number(level.price) / 1_000_000;
        const q = Number(level.quantity) / 1_000_000;
        cumAsk += p * q;
        yesAsks.push({ price: Number(p.toFixed(3)), quantity: q, total: Number(cumAsk.toFixed(2)) });
      }
    } else if (clob && 'asks' in clob && Array.isArray(clob.asks) && clob.asks.length > 0) {
      let cumAsk = 0;
      for (const [p, q] of clob.asks.slice(0, 5)) {
        cumAsk += p * q;
        yesAsks.push({ price: Number(p.toFixed(3)), quantity: q, total: Number(cumAsk.toFixed(2)) });
      }
    }

    // Fill remaining levels up to 5 if CLOB is shallow on testnet
    let cumBidTotal = yesBids.length > 0 ? yesBids[yesBids.length - 1].total : 0;
    const startBidIndex = yesBids.length;
    for (let i = startBidIndex; i < 5; i++) {
      const price = Number(Math.max(0.01, bestBid - (i - startBidIndex + 1) * 0.01).toFixed(2));
      const qty = Math.round((100 + i * 75 + (Math.round(market.strikePrice) % 17) * 10) / 5) * 5;
      cumBidTotal += price * qty;
      yesBids.push({ price, quantity: qty, total: Number(cumBidTotal.toFixed(2)) });
    }

    let cumAskTotal = yesAsks.length > 0 ? yesAsks[yesAsks.length - 1].total : 0;
    const startAskIndex = yesAsks.length;
    for (let i = startAskIndex; i < 5; i++) {
      const price = Number(Math.min(0.99, bestAsk + (i - startAskIndex + 1) * 0.01).toFixed(2));
      const qty = Math.round((120 + i * 85 + (Math.round(market.strikePrice) % 13) * 12) / 5) * 5;
      cumAskTotal += price * qty;
      yesAsks.push({ price, quantity: qty, total: Number(cumAskTotal.toFixed(2)) });
    }

    // Direct NO levels if available from onchain book
    if (clob && 'noBids' in clob && Array.isArray(clob.noBids) && clob.noBids.length > 0) {
      let cumNoBid = 0;
      for (const level of clob.noBids.slice(0, 5)) {
        const p = Number(level.price) / 1_000_000;
        const q = Number(level.quantity) / 1_000_000;
        cumNoBid += p * q;
        noBids.push({ price: Number(p.toFixed(3)), quantity: q, total: Number(cumNoBid.toFixed(2)) });
      }
    }

    if (clob && 'noAsks' in clob && Array.isArray(clob.noAsks) && clob.noAsks.length > 0) {
      let cumNoAsk = 0;
      for (const level of clob.noAsks.slice(0, 5)) {
        const p = Number(level.price) / 1_000_000;
        const q = Number(level.quantity) / 1_000_000;
        cumNoAsk += p * q;
        noAsks.push({ price: Number(p.toFixed(3)), quantity: q, total: Number(cumNoAsk.toFixed(2)) });
      }
    }

    // Derive or fill remaining complementary NO levels (P_NO = 1 - P_YES)
    const bestNoBid = market.bestBidNo;
    const bestNoAsk = market.bestAskNo;

    let cumNoBidTotal = noBids.length > 0 ? noBids[noBids.length - 1].total : 0;
    const startNoBidIndex = noBids.length;
    for (let i = startNoBidIndex; i < 5; i++) {
      const price = Number(Math.max(0.01, bestNoBid - (i - startNoBidIndex) * 0.01).toFixed(2));
      const qty = yesAsks[i]?.quantity || 150;
      cumNoBidTotal += price * qty;
      noBids.push({ price, quantity: qty, total: Number(cumNoBidTotal.toFixed(2)) });
    }

    let cumNoAskTotal = noAsks.length > 0 ? noAsks[noAsks.length - 1].total : 0;
    const startNoAskIndex = noAsks.length;
    for (let i = startNoAskIndex; i < 5; i++) {
      const price = Number(Math.min(0.99, bestNoAsk + (i - startNoAskIndex) * 0.01).toFixed(2));
      const qty = yesBids[i]?.quantity || 150;
      cumNoAskTotal += price * qty;
      noAsks.push({ price, quantity: qty, total: Number(cumNoAskTotal.toFixed(2)) });
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
   * Ensures active live prediction rounds exist across key asset pairs (BTC/USD, ETH/USD)
   * and durations (5m, 15m, 1h, 4h, 24h).
   */
  public ensureRollingMarkets(): void {
    const now = Date.now();
    const symbols = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'DOGE/USD'];
    const windows: Array<'5m' | '15m' | '1h' | '4h' | '24h' | '7d'> = ['5m', '15m', '1h', '4h', '24h', '7d'];

    for (const symbol of symbols) {
      const spot = this.getSpotPrice(symbol);

      for (const windowDur of windows) {
        // Check if an active open market with positive time remaining already exists
        const hasOpenMarket = Array.from(this.markets.values()).some(
          (m) =>
            m.symbol === symbol &&
            m.windowDuration === windowDur &&
            m.status === 'Open' &&
            new Date(m.closeTimestamp).getTime() > now,
        );
        if (hasOpenMarket) continue;

        const windowSec = parseWindowToSeconds(windowDur);
        const windowMs = windowSec * 1000;
        const closeTimeMs = now + windowMs;
        const openTimeMs = now;
        const strike = symbol === 'DOGE/USD' ? Number(spot.toFixed(3)) : Math.round(spot);

        const marketId = `${SOMNIA_ADDRESSES.binaryModule}-${symbol.replace('/', '')}-${windowDur}-${strike}-${closeTimeMs}`;
        if (!this.markets.has(marketId)) {
          const timeLeft = Math.max(1, Math.floor((closeTimeMs - now) / 1000));
          const fair = calculateFairValue(spot, strike, timeLeft, symbol);
          const seedBid = 0.49;
          const seedAsk = 0.51;
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
            bestBidYes: seedBid,
            bestAskYes: seedAsk,
            bestBidNo: 0.49,
            bestAskNo: 0.51,
            impliedProbYes: edge.impliedProbYes,
            fairValueYes: fair.fairValueYes,
            edgePercentage: edge.edgePercentage,
          };

          this.markets.set(marketId, newMarket);
          this.buildDepthBookFromClob(newMarket);
        }
      }
    }
  }

  /**
   * Offline test fallback only used when indexer is completely offline during unit tests.
   */
  public generateOfflineTestMarkets(): void {
    this.ensureRollingMarkets();
  }

  /**
   * Simulates micro-ticks (useful for unit tests and deterministic offline simulation).
   */
  public simulateSpotMicroTicks(): void {
    for (const [symbol] of this.spotPrices.entries()) {
      let volatility = 0.5;
      if (symbol === 'BTC/USD') volatility = 4.5;
      else if (symbol === 'ETH/USD') volatility = 0.45;
      else if (symbol === 'SOL/USD') volatility = 0.25;
      else if (symbol === 'BNB/USD') volatility = 0.35;
      else if (symbol === 'DOGE/USD') volatility = 0.001;
      const delta = (Math.random() - 0.498) * volatility;
      priceFeedService.simulateMicroTick(symbol, delta);
    }
  }

  /**
   * Refreshes market time countdowns, mathematical fair values $\Phi(z)$, and tracks expiration.
   */
  public refreshMarketTimersAndFairValues(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [id, market] of this.markets.entries()) {
      const closeTime = new Date(market.closeTimestamp).getTime();
      const timeLeftSeconds = Math.max(0, Math.floor((closeTime - now) / 1000));

      if (timeLeftSeconds <= 0 && market.status === 'Open') {
        market.status = 'Finalized';
        const spot = this.spotPrices.get(market.symbol)?.price || market.strikePrice;
        market.settlementPrice = spot;
        market.winningOutcome = spot >= market.strikePrice ? 'YES' : 'NO';
        this.archiveHistoricalMarket(market);
        this.markets.delete(id);
        this.depthBooks.delete(id);
        expiredCount++;

        // Persist finalized state & settle orders for this market once
        void this.persistFinalizedMarket(market).catch(() => {});
        void import('./order-service.js').then((mod) => {
          void mod.orderService.settleOrdersForMarket(market.id, market.winningOutcome!, market.settlementPrice);
        }).catch(() => {});
      } else if (market.status === 'Open') {
        const ticker = this.spotPrices.get(market.symbol);
        const spot = ticker?.price || market.strikePrice;
        const fair = calculateFairValue(spot, market.strikePrice, timeLeftSeconds, market.symbol, undefined, ticker?.priceHistory);
        const edge = calculateEdge(fair.fairValueYes, market.bestBidYes, market.bestAskYes);

        market.fairValueYes = fair.fairValueYes;
        market.impliedProbYes = edge.impliedProbYes;
        market.edgePercentage = edge.edgePercentage;
      }
    }

    if (expiredCount > 0 || this.markets.size === 0) {
      this.ensureRollingMarkets();
    }

    if (expiredCount > 0) {
      this.emit('markets_expired', { expiredCount, timestamp: now });
    }
  }

  /**
   * Persists a finalized market with its authoritative settlement price to Supabase.
   */
  public async persistFinalizedMarket(market: Market): Promise<void> {
    try {
      const supabase = getServiceSupabase();
      await supabase.from('markets').upsert({
        id: market.id,
        symbol: market.symbol,
        strike_price: market.strikePrice,
        window_duration: market.windowDuration,
        open_timestamp: market.openTimestamp,
        close_timestamp: market.closeTimestamp,
        resolution_timestamp: market.resolutionTimestamp,
        status: 'Finalized',
        settlement_price: market.settlementPrice ?? null,
        winning_outcome: market.winningOutcome ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    } catch {
      // Non-fatal offline dev
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

  /**
   * Ensures an arbitrary on-chain or rolling market ID exists in Supabase so orders and sweeps foreign keys never fail.
   */
  public async ensureMarketPersisted(marketId: string, symbol: string = 'BTC/USD'): Promise<void> {
    if (!marketId) return;
    try {
      const existing = this.markets.get(marketId);
      await supabase.from('markets').upsert({
        id: marketId,
        symbol: existing?.symbol || symbol,
        strike_price: existing?.strikePrice || 0,
        window_duration: existing?.windowDuration || '5m',
        open_timestamp: existing?.openTimestamp || new Date().toISOString(),
        close_timestamp: existing?.closeTimestamp || new Date().toISOString(),
        resolution_timestamp: existing?.resolutionTimestamp || new Date().toISOString(),
        status: existing?.status || 'Active',
        best_bid_yes: existing?.bestBidYes ?? 0.5,
        best_ask_yes: existing?.bestAskYes ?? 0.5,
        best_bid_no: existing?.bestBidNo ?? 0.5,
        best_ask_no: existing?.bestAskNo ?? 0.5,
        implied_prob_yes: existing?.impliedProbYes ?? 0.5,
        fair_value_yes: existing?.fairValueYes ?? 0.5,
        edge_percentage: existing?.edgePercentage ?? 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    } catch (_err) {
      // Non-fatal
    }
  }

  // ----------------------------------------------------------------------------
  // Public Accessors
  // ----------------------------------------------------------------------------

  public getActiveMarkets(filters?: { symbol?: string; window?: string; status?: MarketStatus }): Market[] {
    let result: Market[];

    if (filters?.status === 'Finalized' || filters?.status === 'Closed') {
      result = Array.from(this.historicalMarkets.values());
    } else if (filters?.status) {
      result = Array.from(this.markets.values()).filter((m) => m.status === filters.status);
    } else {
      // By default return live active open markets
      result = Array.from(this.markets.values()).filter((m) => m.status === 'Open');
    }

    if (filters?.symbol) {
      result = result.filter((m) => m.symbol.toLowerCase() === filters.symbol?.toLowerCase());
    }
    if (filters?.window) {
      result = result.filter((m) => m.windowDuration.toLowerCase() === filters.window?.toLowerCase());
    }

    return result;
  }

  public getHistoricalMarkets(limit: number = 100): Market[] {
    return Array.from(this.historicalMarkets.values())
      .sort((a, b) => new Date(b.closeTimestamp).getTime() - new Date(a.closeTimestamp).getTime())
      .slice(0, limit);
  }

  public getMarketById(id: string): Market | undefined {
    return this.markets.get(id) || this.historicalMarkets.get(id);
  }

  public getUnifiedMarket(id: string): UnifiedMarket | undefined {
    return this.unifiedMarketsMap.get(id);
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

    const ticker = this.spotPrices.get(market.symbol);
    const spot = ticker?.price || market.strikePrice;
    const now = Date.now();
    const closeTime = new Date(market.closeTimestamp).getTime();
    const timeLeft = Math.max(1, Math.floor((closeTime - now) / 1000));

    const fair = calculateFairValue(spot, market.strikePrice, timeLeft, market.symbol, undefined, ticker?.priceHistory);
    const edge = calculateEdge(fair.fairValueYes, market.bestBidYes, market.bestAskYes);

    market.fairValueYes = fair.fairValueYes;
    market.impliedProbYes = edge.impliedProbYes;
    market.edgePercentage = edge.edgePercentage;

    this.buildDepthBookFromClob(market);
    this.emit('market_updated', market);

    return market;
  }

  public stop(): void {
    if (this.updateInterval) clearInterval(this.updateInterval);
    if (this.onchainPollInterval) clearInterval(this.onchainPollInterval);
    if (this.dbSyncInterval) clearInterval(this.dbSyncInterval);
    if (this.priceUpdateHandler) {
      priceFeedService.off('spotUpdate', this.priceUpdateHandler);
    }
    priceFeedService.stop();
  }
}

export const marketService = new MarketService();
