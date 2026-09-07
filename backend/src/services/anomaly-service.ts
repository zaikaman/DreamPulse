import { EventEmitter } from 'events';
import type { Market } from '../types/index.js';
import { calculateFairValue, calculateEdge } from '../quantitative/pricing.js';
import { priceFeedService } from './price-feed-service.js';

export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AnomalyReport {
  marketId: string;
  symbol: string;
  windowDuration: '1m' | '5m' | '15m' | '1h' | '4h' | string;
  strikePrice: number;
  spotPrice: number;
  timeLeftSeconds: number;
  bestBidYes: number;
  bestAskYes: number;
  impliedProbYes: number;
  fairValueYes: number;
  edgePercentage: number;
  absoluteEdge: number;
  severity: AnomalySeverity;
  actionRecommendation: 'BUY_YES' | 'BUY_NO' | 'NONE';
  expectedEdgeValue: number;
  detectedAt: number;
  expiresAt?: number;
}

export interface AnomalyServiceOptions {
  threshold?: number;
  ttlMs?: number;
  cleanupIntervalMs?: number;
  autoCleanup?: boolean;
}

/**
 * Normalizes an asset/market symbol string to standard pair format (e.g. 'BTC/USD', 'ETH/USD').
 */
export function normalizeMarketSymbol(raw: string): string {
  if (!raw) return 'BTC/USD';
  const s = raw.trim().toUpperCase().replace(/\/USD\/USD$/i, '/USD');
  if (s.includes('ETH')) return 'ETH/USD';
  if (s.includes('BTC')) return 'BTC/USD';
  if (s.includes('/')) return s;
  if (s.endsWith('USD')) return `${s.slice(0, -3)}/USD`;
  if (s.endsWith('USDT')) return `${s.slice(0, -4)}/USD`;
  return `${s}/USD`;
}

export class AnomalyService extends EventEmitter {
  private defaultThreshold: number = 0.03; // 3.0% edge
  private activeAnomalies: Map<string, AnomalyReport> = new Map();
  private ttlMs: number = 60 * 60 * 1000; // 1 hour default TTL
  private cleanupIntervalMs: number = 5 * 60 * 1000; // 5 minutes periodic sweep
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    thresholdOrOptions: number | AnomalyServiceOptions = 0.03,
    options?: AnomalyServiceOptions,
  ) {
    super();
    let opts: AnomalyServiceOptions = {};
    if (typeof thresholdOrOptions === 'number') {
      this.defaultThreshold = thresholdOrOptions;
      if (options) opts = options;
    } else if (typeof thresholdOrOptions === 'object' && thresholdOrOptions !== null) {
      opts = thresholdOrOptions;
      if (typeof opts.threshold === 'number') {
        this.defaultThreshold = opts.threshold;
      }
    }
    if (typeof opts.ttlMs === 'number' && opts.ttlMs > 0) {
      this.ttlMs = opts.ttlMs;
    }
    if (typeof opts.cleanupIntervalMs === 'number' && opts.cleanupIntervalMs > 0) {
      this.cleanupIntervalMs = opts.cleanupIntervalMs;
    }

    if (opts.autoCleanup !== false) {
      this.startCleanupTimer();
    }
  }

  /**
   * Starts periodic timer to prune expired anomalies and prevent memory leak.
   */
  public startCleanupTimer(intervalMs?: number): void {
    this.stopCleanupTimer();
    if (intervalMs && intervalMs > 0) {
      this.cleanupIntervalMs = intervalMs;
    }
    this.cleanupTimer = setInterval(() => {
      this.pruneExpired();
    }, this.cleanupIntervalMs);

    // Unref so background interval does not block Node process or test runners from exiting
    if (this.cleanupTimer && typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stops the periodic cleanup timer.
   */
  public stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Cleanup method to halt background tasks and clear cache.
   */
  public stop(): void {
    this.stopCleanupTimer();
  }

  /**
   * Prunes anomalies that have exceeded their TTL or whose market duration has elapsed (+ 60s grace period).
   * Returns the count of pruned anomalies.
   */
  public pruneExpired(now: number = Date.now()): number {
    let prunedCount = 0;
    for (const [marketId, report] of this.activeAnomalies.entries()) {
      const isTtlExpired = (now - report.detectedAt) >= this.ttlMs;
      const isMarketExpired = report.timeLeftSeconds > 0 &&
        now >= (report.detectedAt + (report.timeLeftSeconds + 60) * 1000);
      const isExplicitlyExpired = typeof report.expiresAt === 'number' && now >= report.expiresAt;

      if (isTtlExpired || isMarketExpired || isExplicitlyExpired) {
        this.activeAnomalies.delete(marketId);
        prunedCount++;
        this.emit('anomaly_expired', { marketId, report });
      }
    }

    if (prunedCount > 0) {
      this.emit('anomalies_pruned', { prunedCount, remainingCount: this.activeAnomalies.size });
    }

    return prunedCount;
  }

  /**
   * Explicitly removes a market from active anomalies cache (e.g. when closed, resolved, cancelled, or archived).
   */
  public pruneMarket(marketId: string): boolean {
    const deleted = this.activeAnomalies.delete(marketId);
    if (deleted) {
      this.emit('anomaly_removed', { marketId });
    }
    return deleted;
  }

  /**
   * Explicitly prunes multiple markets by IDs.
   */
  public pruneMarkets(marketIds: string[]): number {
    let pruned = 0;
    for (const id of marketIds) {
      if (this.activeAnomalies.delete(id)) {
        pruned++;
      }
    }
    if (pruned > 0) {
      this.emit('anomalies_pruned', { prunedCount: pruned, remainingCount: this.activeAnomalies.size });
    }
    return pruned;
  }

  /**
   * Prunes cached anomalies for markets whose status is RESOLVED, CANCELLED, CLOSED, or FINALIZED.
   */
  public pruneResolvedOrCancelled(markets: Array<{ id: string; status?: string }>): number {
    let pruned = 0;
    for (const m of markets) {
      const s = (m.status || '').toUpperCase();
      if (s === 'RESOLVED' || s === 'CANCELLED' || s === 'CLOSED' || s === 'FINALIZED' || s === 'RESOLVING') {
        if (this.activeAnomalies.delete(m.id)) {
          pruned++;
        }
      }
    }
    if (pruned > 0) {
      this.emit('anomalies_pruned', { prunedCount: pruned, remainingCount: this.activeAnomalies.size });
    }
    return pruned;
  }

  /**
   * Prunes all entries in activeAnomalies whose IDs are not in the provided active market IDs set.
   */
  public pruneInactiveMarkets(activeMarketIds: Iterable<string>): number {
    const activeSet = activeMarketIds instanceof Set ? activeMarketIds : new Set(activeMarketIds);
    let pruned = 0;
    for (const marketId of this.activeAnomalies.keys()) {
      if (!activeSet.has(marketId)) {
        this.activeAnomalies.delete(marketId);
        pruned++;
      }
    }
    if (pruned > 0) {
      this.emit('anomalies_pruned', { prunedCount: pruned, remainingCount: this.activeAnomalies.size });
    }
    return pruned;
  }

  /**
   * Clears all cached anomalies.
   */
  public clear(): void {
    this.activeAnomalies.clear();
  }

  /**
   * Returns current count of cached active anomalies.
   */
  public getCacheSize(): number {
    return this.activeAnomalies.size;
  }

  /**
   * Evaluates an individual market for Black-Scholes pricing discrepancies.
   */
  public evaluateMarket(market: Market, currentSpot: number, customThreshold?: number): AnomalyReport | null {
    const threshold = customThreshold ?? this.defaultThreshold;
    const now = Date.now();
    const closeTime = new Date(market.closeTimestamp).getTime();
    const timeLeft = Math.max(0, Math.floor((closeTime - now) / 1000));

    const statusNorm = String(market.status || '').toUpperCase();
    const isClosedOrResolved =
      statusNorm === 'RESOLVED' ||
      statusNorm === 'CANCELLED' ||
      statusNorm === 'FINALIZED' ||
      statusNorm === 'CLOSED' ||
      statusNorm !== 'OPEN' ||
      timeLeft <= 0;

    if (isClosedOrResolved) {
      this.activeAnomalies.delete(market.id);
      return null;
    }

    // Guard against stale price feeds during REST fallback delays or disconnects
    if (process.env.NODE_ENV !== 'test' && priceFeedService.isPriceStale(market.symbol, 6000)) {
      return null;
    }

    const fair = calculateFairValue(
      currentSpot,
      market.strikePrice,
      timeLeft,
      market.symbol,
      undefined,
      priceFeedService.getSpotTicker(market.symbol)?.priceHistory,
    );
    const edge = calculateEdge(fair.fairValueYes, market.bestBidYes, market.bestAskYes, threshold);

    const absEdge = Math.abs(edge.edgePercentage);

    if (edge.hasAnomaly || absEdge >= threshold) {
      let severity: AnomalySeverity = 'LOW';
      if (absEdge >= 0.10) {
        severity = 'HIGH';
      } else if (absEdge >= 0.05) {
        severity = 'MEDIUM';
      }

      // Expected edge in dollar/tUSDC terms per 1-lot position
      const expectedEdgeValue = Number((absEdge * 1.0).toFixed(4));
      const expiresAt = now + Math.min(this.ttlMs, (timeLeft + 60) * 1000);

      const report: AnomalyReport = {
        marketId: market.id,
        symbol: market.symbol,
        windowDuration: market.windowDuration,
        strikePrice: market.strikePrice,
        spotPrice: currentSpot,
        timeLeftSeconds: timeLeft,
        bestBidYes: market.bestBidYes,
        bestAskYes: market.bestAskYes,
        impliedProbYes: edge.impliedProbYes,
        fairValueYes: fair.fairValueYes,
        edgePercentage: edge.edgePercentage,
        absoluteEdge: absEdge,
        severity,
        actionRecommendation: edge.actionRecommendation,
        expectedEdgeValue,
        detectedAt: now,
        expiresAt,
      };

      const isNew = !this.activeAnomalies.has(market.id);
      this.activeAnomalies.set(market.id, report);

      if (isNew || severity === 'HIGH') {
        this.emit('anomaly_detected', report);
      }

      return report;
    } else {
      this.activeAnomalies.delete(market.id);
      return null;
    }
  }

  /**
   * Scans a collection of active markets and returns all detected pricing anomalies sorted by edge magnitude.
   */
  public scanMarkets(
    markets: Market[],
    spotPrices: Record<string, number | { price?: number }>,
    threshold?: number,
  ): AnomalyReport[] {
    // Lazily purge any expired anomalies first
    this.pruneExpired();

    const reports: AnomalyReport[] = [];

    const resolvePrice = (val: number | { price?: number } | undefined): number | undefined => {
      if (typeof val === 'number') return val;
      if (val && typeof (val as { price?: number }).price === 'number') return (val as { price: number }).price;
      return undefined;
    };

    for (const market of markets) {
      const normSym = normalizeMarketSymbol(market.symbol);
      const spot =
        resolvePrice(spotPrices[normSym]) ??
        resolvePrice(spotPrices[market.symbol]) ??
        market.strikePrice;
      const report = this.evaluateMarket(market, spot, threshold);
      if (report) {
        reports.push(report);
      }
    }

    // Sort descending by highest absolute edge
    reports.sort((a, b) => b.absoluteEdge - a.absoluteEdge);
    return reports;
  }

  /**
   * Returns all currently cached active anomalies, purging any expired entries first.
   */
  public getActiveAnomalies(): AnomalyReport[] {
    this.pruneExpired();
    return Array.from(this.activeAnomalies.values()).sort((a, b) => b.absoluteEdge - a.absoluteEdge);
  }

  public setTtlMs(ttlMs: number): void {
    if (ttlMs > 0) {
      this.ttlMs = ttlMs;
    }
  }

  public getTtlMs(): number {
    return this.ttlMs;
  }

  public setThreshold(threshold: number): void {
    this.defaultThreshold = threshold;
  }

  public getThreshold(): number {
    return this.defaultThreshold;
  }
}

export const anomalyService = new AnomalyService();
