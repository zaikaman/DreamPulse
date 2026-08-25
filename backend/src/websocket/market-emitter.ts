import { telemetryWsGateway } from './server.js';
import { marketService } from '../services/market-service.js';
import { anomalyService } from '../services/anomaly-service.js';
import { generateAgentThought, type AgentRole } from '../llm/reasoning-service.js';

let emitterInterval: NodeJS.Timeout | null = null;
let thoughtInterval: NodeJS.Timeout | null = null;
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

  // Periodic AI Agent Thought Generation (every 4-6 seconds)
  const agentRoles: AgentRole[] = ['Volt', 'Oracle', 'Titan', 'Sweeper'];
  let currentRoleIdx = 0;

  thoughtInterval = setInterval(async () => {
    try {
      const activeMarkets = marketService.getActiveMarkets({ status: 'Open' });
      if (activeMarkets.length === 0) return;

      const randomMarket = activeMarkets[Math.floor(Math.random() * activeMarkets.length)];
      const spotTicker = marketService.getSpotTicker(randomMarket.symbol);
      const spot = spotTicker?.price || randomMarket.strikePrice;

      const role = agentRoles[currentRoleIdx % agentRoles.length];
      currentRoleIdx++;

      const closeTime = new Date(randomMarket.closeTimestamp).getTime();
      const timeLeftSeconds = Math.max(1, Math.floor((closeTime - Date.now()) / 1000));

      let trigger = 'SPOT_DRIFT';
      let action = 'TAKER_SNIPE';

      if (role === 'Oracle') {
        trigger = 'VOL_MISPRICING';
        action = 'ARB_SURFACE';
      } else if (role === 'Titan') {
        trigger = 'SPREAD_CAPTURE';
        action = 'QUOTE_TWO_SIDED';
      } else if (role === 'Sweeper') {
        trigger = 'EXPIRY_RESOLUTION';
        action = 'BATCH_CLAIM';
      }

      const thought = await generateAgentThought({
        agentType: role,
        symbol: randomMarket.symbol,
        spotPrice: spot,
        strikePrice: randomMarket.strikePrice,
        timeLeftSeconds,
        bestBidYes: randomMarket.bestBidYes,
        bestAskYes: randomMarket.bestAskYes,
        impliedProbYes: randomMarket.impliedProbYes,
        fairValueYes: randomMarket.fairValueYes,
        edgePercentage: randomMarket.edgePercentage,
        driftPercentage: spotTicker?.change1m || 0.0012,
        triggerEvent: trigger,
        actionPlanned: action,
      });

      telemetryWsGateway.broadcastAgentThought({
        agent: thought.agent,
        marketId: randomMarket.id,
        confidence: thought.confidence,
        action: thought.action,
        thought: thought.thought,
      });
    } catch (_err) {
      // Non-fatal thought generation
    }
  }, 4500);

  console.log(`[Market Emitter] Telemetry broadcaster started (${tickIntervalMs}ms tick rate)`);
}

/**
 * Stops the market broadcaster loop.
 */
export function stopMarketEmitter(): void {
  if (emitterInterval) {
    clearInterval(emitterInterval);
    emitterInterval = null;
  }
  if (thoughtInterval) {
    clearInterval(thoughtInterval);
    thoughtInterval = null;
  }
  isRunning = false;
  console.log('[Market Emitter] Broadcaster stopped');
}
