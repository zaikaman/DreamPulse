import { telemetryWsGateway } from './server.js';
import { marketService } from '../services/market-service.js';

let emitterInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let depthCycleCounter = 0;

/**
 * Starts high-frequency telemetry broadcast loop emitting batched market ticks, depth updates, and AI agent thoughts.
 */
export function startMarketEmitter(tickIntervalMs: number = 100): void {
  if (isRunning) return;
  isRunning = true;

  // Initialize market service
  marketService.initialize();

  // High-Frequency Market & Depth Telemetry Broadcast (every 100ms)
  emitterInterval = setInterval(() => {
    try {
      const activeMarkets = marketService.getActiveMarkets({ status: 'Open' });
      if (activeMarkets.length === 0) return;

      const spotMap = marketService.getAllSpotTickers();
      const now = Date.now();
      const ticksBatch: Array<{
        marketId: string;
        symbol: string;
        spotPrice: number;
        strikePrice: number;
        timeLeftSeconds: number;
        impliedProb: number;
        fairValue: number;
        edge: number;
        hasAnomaly: boolean;
        convictionState?: 'HIGH_CONVICTION' | 'MODERATE' | 'CAUTION_COUNTER_TREND' | 'NEUTRAL';
        recommendedAction?: 'BUY_UP' | 'BUY_DOWN' | 'WAIT';
        recommendedOutcome?: 'YES' | 'NO' | 'NONE';
        winProbability?: number;
        confidenceScore?: number;
        priceActionTrend?: string;
        priceActionScore?: number;
        confluenceRationale?: string;
      }> = [];

      for (const market of activeMarkets) {
        const spot = spotMap[market.symbol]?.price || market.strikePrice;
        const closeTime = new Date(market.closeTimestamp).getTime();
        const timeLeftSeconds = Math.max(0, Math.floor((closeTime - now) / 1000));
        const absEdge = Math.abs(market.edgePercentage);
        const hasAnomaly = absEdge >= 0.03 && !market.isSynthetic && !market.isSeedDepth;

        ticksBatch.push({
          marketId: market.id,
          symbol: market.symbol,
          spotPrice: spot,
          strikePrice: market.strikePrice,
          timeLeftSeconds,
          impliedProb: market.impliedProbYes,
          fairValue: market.fairValueYes,
          edge: market.edgePercentage,
          hasAnomaly,
          convictionState: market.convictionState,
          recommendedAction: market.recommendedAction,
          recommendedOutcome: market.recommendedOutcome,
          winProbability: market.winProbability,
          confidenceScore: market.confidenceScore,
          priceActionTrend: market.priceActionTrend,
          priceActionScore: market.priceActionScore,
          confluenceRationale: market.confluenceRationale,
        });
      }

      // 1. Broadcast Batched Market Ticks in a single pre-serialized JSON frame
      if (ticksBatch.length > 0) {
        telemetryWsGateway.broadcastMarketTicksBatch(ticksBatch);
      }

      // 2. Coordinated Depth Ladder Broadcast (round-robin 1 market depth per tick cycle)
      depthCycleCounter++;
      if (activeMarkets.length > 0) {
        const targetMarket = activeMarkets[depthCycleCounter % activeMarkets.length];
        if (targetMarket) {
          const depth = marketService.getMarketDepth(targetMarket.id);
          if (depth) {
            telemetryWsGateway.broadcastDepthUpdate({
              marketId: targetMarket.id,
              bestBid: depth.bestBidYes,
              bestAsk: depth.bestAskYes,
              bids: depth.yesBids.map((b) => [b.price, b.quantity]),
              asks: depth.yesAsks.map((a) => [a.price, a.quantity]),
            });
          }
        }
      }
    } catch (_err) {
      // Ignore broadcast tick errors
    }
  }, tickIntervalMs);

  console.log(`[Market Emitter] Batched market & depth telemetry broadcaster started (${tickIntervalMs}ms tick rate)`);
}

/**
 * Stops the market broadcaster loop.
 */
export function stopMarketEmitter(): void {
  if (emitterInterval) {
    clearInterval(emitterInterval);
    emitterInterval = null;
  }
  isRunning = false;
  console.log('[Market Emitter] Broadcaster stopped');
}
