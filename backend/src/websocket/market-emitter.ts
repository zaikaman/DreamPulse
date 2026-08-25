import { telemetryWsGateway } from './server.js';
import { marketService } from '../services/market-service.js';

let emitterInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Starts high-frequency telemetry broadcast loop emitting market ticks, depth updates, and AI agent thoughts.
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
      const spotMap = marketService.getAllSpotTickers();

      for (const market of activeMarkets) {
        const spot = spotMap[market.symbol]?.price || market.strikePrice;
        const closeTime = new Date(market.closeTimestamp).getTime();
        const timeLeftSeconds = Math.max(0, Math.floor((closeTime - Date.now()) / 1000));
        const absEdge = Math.abs(market.edgePercentage);
        const hasAnomaly = absEdge >= 0.03;

        // 1. Broadcast Market Tick
        telemetryWsGateway.broadcastMarketTick({
          marketId: market.id,
          symbol: market.symbol,
          spotPrice: spot,
          strikePrice: market.strikePrice,
          timeLeftSeconds,
          impliedProb: market.impliedProbYes,
          fairValue: market.fairValueYes,
          edge: market.edgePercentage,
          hasAnomaly,
        });

        // 2. Broadcast Depth Update (throttled to every ~5 ticks per market)
        if (Math.random() < 0.2) {
          const depth = marketService.getMarketDepth(market.id);
          if (depth) {
            telemetryWsGateway.broadcastDepthUpdate({
              marketId: market.id,
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

  console.log(`[Market Emitter] Market & depth telemetry broadcaster started (${tickIntervalMs}ms tick rate)`);
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
