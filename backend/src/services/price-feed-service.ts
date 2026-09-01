import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { calculateRealizedVolatility, calculatePriceActionMetrics, type PriceActionMetrics } from '../quantitative/pricing.js';

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
  priceAction?: PriceActionMetrics;
}

const SYMBOL_MAPPINGS: Record<string, string> = {
  BTCUSDT: 'BTC/USD',
  ETHUSDT: 'ETH/USD',
};

const REVERSE_SYMBOL_MAPPINGS: Record<string, string> = {
  'BTC/USD': 'BTCUSDT',
  'ETH/USD': 'ETHUSDT',
};

const COINBASE_PAIRS: Record<string, string> = {
  'BTC/USD': 'BTC-USD',
  'ETH/USD': 'ETH-USD',
};

export class PriceFeedService extends EventEmitter {
  private spotPrices: Map<string, SpotTicker> = new Map();
  private ws: WebSocket | null = null;
  private isRunning: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private restFallbackInterval: NodeJS.Timeout | null = null;
  private lastWsMessageTime: number = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setMaxListeners(100);
    this.seedDefaultTickers();
  }

  private seedDefaultTickers(): void {
    const now = Date.now();
    const defaults: Record<string, { price: number; high: number; low: number; vol: number }> = {
      'BTC/USD': { price: 96450.0, high: 97800.0, low: 95200.0, vol: 18450.2 },
      'ETH/USD': { price: 2745.5, high: 2820.0, low: 2690.0, vol: 84200.5 },
    };

    for (const [symbol, data] of Object.entries(defaults)) {
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
   * Starts live price feed ingestion.
   */
  public async initialize(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. Immediate REST seed fetch for instant live data
    await this.fetchRestSnapshot().catch((err) => {
      console.warn('[PriceFeed] Initial REST snapshot seed error, will rely on WebSocket:', err.message);
    });

    // 2. Connect to live Binance WebSocket stream
    this.connectWebSocket();

    // 3. Heartbeat / watchdog monitor (checks every 5s if WebSocket is receiving messages)
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      if (this.ws && this.ws.readyState === WebSocket.OPEN && now - this.lastWsMessageTime > 15000) {
        console.warn('[PriceFeed] WebSocket feed quiet for >15s, triggering reconnect...');
        this.ws.terminate();
      }
    }, 5000);
  }

  /**
   * Fetches latest 24hr ticker data via REST API.
   */
  public async fetchRestSnapshot(): Promise<void> {
    try {
      const symbolsParam = JSON.stringify(Object.keys(SYMBOL_MAPPINGS));
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Binance REST HTTP ${res.status}`);
      }

      const data = await res.json() as Array<{
        symbol: string;
        lastPrice: string;
        highPrice: string;
        lowPrice: string;
        volume: string;
        closeTime: number;
      }>;

      for (const item of data) {
        const canonical = SYMBOL_MAPPINGS[item.symbol];
        if (canonical) {
          const price = parseFloat(item.lastPrice);
          const high = parseFloat(item.highPrice);
          const low = parseFloat(item.lowPrice);
          const volume = parseFloat(item.volume);
          const timestamp = item.closeTime || Date.now();

          if (!isNaN(price) && price > 0) {
            this.recordPriceUpdate(canonical, price, high, low, volume, timestamp);
          }
        }
      }
    } catch (err: any) {
      // Fallback to Coinbase REST if Binance is geo-blocked or fails
      await this.fetchCoinbaseFallback().catch((_cbErr) => {});
    }
  }

  /**
   * Secondary REST fallback using Coinbase API.
   */
  private async fetchCoinbaseFallback(): Promise<void> {
    for (const [symbol, pair] of Object.entries(COINBASE_PAIRS)) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const body = (await res.json()) as { data?: { amount?: string } };
          const price = parseFloat(body.data?.amount || '0');
          if (price > 0) {
            const current = this.spotPrices.get(symbol);
            this.recordPriceUpdate(
              symbol,
              price,
              current ? Math.max(current.high24h, price) : price,
              current ? Math.min(current.low24h, price) : price,
              current?.volume24h || 0,
              Date.now()
            );
          }
        }
      } catch (_err) {
        // Ignore single pair error
      }
    }
  }

  /**
   * Connects to live Binance WebSocket ticker stream.
   */
  private connectWebSocket(): void {
    if (!this.isRunning) return;

    try {
      const streams = Object.keys(SYMBOL_MAPPINGS).map((s) => `${s.toLowerCase()}@ticker`).join('/');
      const wsUrl = `wss://stream.binance.com:9443/ws/${streams}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('[PriceFeed] Live WebSocket price stream connected to Binance');
        this.lastWsMessageTime = Date.now();
        if (this.restFallbackInterval) {
          clearInterval(this.restFallbackInterval);
          this.restFallbackInterval = null;
        }
      });

      this.ws.on('message', (raw: WebSocket.RawData) => {
        try {
          this.lastWsMessageTime = Date.now();
          const msg = JSON.parse(raw.toString());

          // Handle single ticker message
          const rawSymbol = msg.s;
          const canonical = SYMBOL_MAPPINGS[rawSymbol];
          if (canonical && msg.c) {
            const price = parseFloat(msg.c);
            const high = parseFloat(msg.h || '0');
            const low = parseFloat(msg.l || '0');
            const volume = parseFloat(msg.v || '0');
            const timestamp = msg.E || Date.now();

            if (!isNaN(price) && price > 0) {
              this.recordPriceUpdate(canonical, price, high, low, volume, timestamp);
            }
          }
        } catch (_parseErr) {
          // Ignore malformed tick
        }
      });

      this.ws.on('close', () => {
        console.warn('[PriceFeed] WebSocket disconnected. Activating REST fallback & reconnecting...');
        this.ws = null;
        this.startRestFallback();
        this.scheduleReconnect();
      });

      this.ws.on('error', (err: Error) => {
        console.warn('[PriceFeed] WebSocket error:', err.message);
        if (this.ws) {
          this.ws.close();
        }
      });
    } catch (err: any) {
      console.error('[PriceFeed] Error creating WebSocket:', err.message);
      this.startRestFallback();
      this.scheduleReconnect();
    }
  }

  private startRestFallback(): void {
    if (this.restFallbackInterval || !this.isRunning) return;
    this.restFallbackInterval = setInterval(async () => {
      await this.fetchRestSnapshot().catch(() => {});
    }, 3000);
  }

  private scheduleReconnect(): void {
    if (!this.isRunning || this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connectWebSocket();
    }, 4000);
  }

  /**
   * Ingests a new price observation, updates rolling ring buffer, calculates drift, and emits event.
   */
  public recordPriceUpdate(
    symbol: string,
    price: number,
    high: number,
    low: number,
    volume: number,
    timestamp: number = Date.now()
  ): void {
    const existing = this.spotPrices.get(symbol) || {
      symbol,
      price,
      change1m: 0,
      change5m: 0,
      high24h: high || price,
      low24h: low || price,
      volume24h: volume || 0,
      timestamp,
      priceHistory: [],
    };

    // Append to rolling history (max 600 data points / ~10 mins)
    existing.priceHistory.push({ timestamp, price });
    if (existing.priceHistory.length > 600) {
      existing.priceHistory.shift();
    }

    // Calculate 1m and 5m drift
    const cutoff1m = timestamp - 60000;
    const cutoff5m = timestamp - 300000;

    const p1m = existing.priceHistory.find((p) => p.timestamp >= cutoff1m)?.price || existing.priceHistory[0].price;
    const p5m = existing.priceHistory.find((p) => p.timestamp >= cutoff5m)?.price || existing.priceHistory[0].price;

    existing.price = price;
    existing.high24h = high > 0 ? high : Math.max(existing.high24h, price);
    existing.low24h = low > 0 ? low : Math.min(existing.low24h, price);
    existing.volume24h = volume > 0 ? volume : existing.volume24h;
    existing.timestamp = timestamp;
    existing.change1m = Number(((price - p1m) / p1m).toFixed(5));
    existing.change5m = Number(((price - p5m) / p5m).toFixed(5));
    existing.priceAction = calculatePriceActionMetrics(existing.priceHistory, price);

    this.spotPrices.set(symbol, existing);
    this.emit('spotUpdate', existing);
  }

  /**
   * Helper for tests/simulations to inject micro price changes.
   */
  public simulateMicroTick(symbol: string, delta: number): void {
    const ticker = this.spotPrices.get(symbol);
    if (!ticker) return;
    const newPrice = Number((ticker.price + delta).toFixed(2));
    this.recordPriceUpdate(symbol, newPrice, ticker.high24h, ticker.low24h, ticker.volume24h);
  }

  public getRealizedVolatility(symbol: string, windowSeconds?: number): number {
    const ticker = this.spotPrices.get(symbol);
    return calculateRealizedVolatility(ticker?.priceHistory, symbol, windowSeconds);
  }

  public getSpotTicker(symbol: string): SpotTicker | undefined {
    return this.spotPrices.get(symbol);
  }

  /**
   * Checks if the price ticker for a symbol is stale (older than maxAgeMs, default 6000ms).
   */
  public isPriceStale(symbol: string, maxAgeMs: number = 6000): boolean {
    const ticker = this.spotPrices.get(symbol);
    if (!ticker) return true;
    return Date.now() - ticker.timestamp > maxAgeMs;
  }

  public getAllSpotTickers(): Record<string, SpotTicker> {
    const result: Record<string, SpotTicker> = {};
    for (const [k, v] of this.spotPrices.entries()) {
      result[k] = { ...v };
    }
    return result;
  }

  private historicalPriceCache = new Map<string, number>();

  /**
   * Fetches historical close price for a symbol at a specific timestamp (used for accurate post-expiry settlement).
   * Caches results permanently in memory since historical candle prices for past timestamps are immutable.
   * Falls back to current spot if fetch fails.
   */
  public async getHistoricalPriceAt(symbol: string, targetTimestampMs: number): Promise<number | null> {
    const cacheKey = `${symbol}:${targetTimestampMs}`;
    if (this.historicalPriceCache.has(cacheKey)) {
      return this.historicalPriceCache.get(cacheKey)!;
    }

    // Fast in-memory lookup from recent priceHistory ring buffer
    const ticker = this.spotPrices.get(symbol);
    if (ticker?.priceHistory && ticker.priceHistory.length > 0) {
      let closestFromHistory: number | null = null;
      let minHistoryDiff = Number.MAX_SAFE_INTEGER;
      for (const pt of ticker.priceHistory) {
        const diff = Math.abs(pt.timestamp - targetTimestampMs);
        if (diff < minHistoryDiff) {
          minHistoryDiff = diff;
          closestFromHistory = pt.price;
        }
      }
      // If we have a local price tick within 15 seconds of target timestamp, use it
      if (closestFromHistory != null && minHistoryDiff <= 15000) {
        if (this.historicalPriceCache.size > 2000) {
          const firstKey = this.historicalPriceCache.keys().next().value;
          if (firstKey) this.historicalPriceCache.delete(firstKey);
        }
        this.historicalPriceCache.set(cacheKey, closestFromHistory);
        return closestFromHistory;
      }
    }

    try {
      const binanceSymbol = REVERSE_SYMBOL_MAPPINGS[symbol] || symbol.replace('/', '');
      // Binance klines are inclusive; fetch 1m candle containing target time
      const startMs = targetTimestampMs - 60000;
      const endMs = targetTimestampMs + 60000;
      const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1m&startTime=${startMs}&endTime=${endMs}&limit=5`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return ticker?.price ?? null;
      const klines = (await res.json()) as Array<Array<string | number>>;
      if (!Array.isArray(klines) || klines.length === 0) return ticker?.price ?? null;
      // Find candle whose closeTime is closest to target
      let closest: number | null = null;
      let minDiff = Number.MAX_SAFE_INTEGER;
      for (const k of klines) {
        const closeTime = Number(k[6]);
        const closePrice = parseFloat(String(k[4]));
        const diff = Math.abs(closeTime - targetTimestampMs);
        if (diff < minDiff && !isNaN(closePrice)) {
          minDiff = diff;
          closest = closePrice;
        }
      }
      if (closest != null) {
        if (this.historicalPriceCache.size > 2000) {
          const firstKey = this.historicalPriceCache.keys().next().value;
          if (firstKey) this.historicalPriceCache.delete(firstKey);
        }
        this.historicalPriceCache.set(cacheKey, closest);
      }
      return closest ?? ticker?.price ?? null;
    } catch {
      return ticker?.price ?? null;
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.restFallbackInterval) {
      clearInterval(this.restFallbackInterval);
      this.restFallbackInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
  }
}

export const priceFeedService = new PriceFeedService();
