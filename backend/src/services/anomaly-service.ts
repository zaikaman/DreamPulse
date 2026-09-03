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

  constructor(threshold: number = 0.03) {
    super();
    this.defaultThreshold = threshold;
  }

  /**
   * Evaluates an individual market for Black-Scholes pricing discrepancies.
   */
  public evaluateMarket(market: Market, currentSpot: number, customThreshold?: number): AnomalyReport | null {
    const threshold = customThreshold ?? this.defaultThreshold;
    const now = Date.now();
    const closeTime = new Date(market.closeTimestamp).getTime();
    const timeLeft = Math.max(0, Math.floor((closeTime - now) / 1000));

    if (market.status !== 'Open' || timeLeft <= 0) {
      return null;
    }

    // Suppress actionable anomaly alerts on synthetic rolling markets or unseeded dummy books (0.49/0.51 fallback)
    if (market.isSynthetic || market.isSeedDepth) {
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
   * Returns all currently cached active anomalies.
   */
  public getActiveAnomalies(): AnomalyReport[] {
    return Array.from(this.activeAnomalies.values()).sort((a, b) => b.absoluteEdge - a.absoluteEdge);
  }

  public setThreshold(threshold: number): void {
    this.defaultThreshold = threshold;
  }

  public getThreshold(): number {
    return this.defaultThreshold;
  }
}

export const anomalyService = new AnomalyService();
