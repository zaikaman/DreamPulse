import {
  BaseAgent,
  type IAgentContext,
  type IAgentDecision,
  type AgentRiskConfig,
} from './base-agent.js';
import type { AgentType, SessionGrant, OrderExecution, SettlementSweep } from '../types/index.js';
import {
  calculateFairValue,
  calculateDepthVWAP,
  calculateNetExecutableEdge,
  calculateVolatilityNormalizedDriftThreshold,
  calculateEdgeProportionalLots,
} from '../quantitative/pricing.js';
import { quantizePrice } from '../quantitative/quantizer.js';
import { orderService } from '../services/order-service.js';

export interface VoltConfig extends AgentRiskConfig {
  driftThreshold: number; // e.g. 0.0020 (0.20%)
  lotSize: number;
}

export class VoltSniperAgent extends BaseAgent {
  public readonly agentType: AgentType = 'Volt';
  public voltConfig: VoltConfig;

  constructor(config?: Partial<VoltConfig>) {
    super(config);
    this.voltConfig = {
      minEdge: config?.minEdge ?? 0.03,
      maxTradeSize: config?.maxTradeSize ?? 20.0,
      maxDailyVolume: config?.maxDailyVolume ?? 200.0,
      maxSlippage: config?.maxSlippage ?? 0.02,
      driftThreshold: config?.driftThreshold ?? 0.002, // 0.20% spot drift
      lotSize: config?.lotSize ?? 5.0,
    };
  }

  /**
   * Evaluates spot velocity vs order book quote latency.
   * If spot price jumped or dumped faster than resting quotes adjusted, fires IOC taker order with VWAP depth awareness.
   */
  public async evaluate(context: IAgentContext): Promise<IAgentDecision> {
    if (!this.isEnabled) {
      return {
        agentType: 'Volt',
        action: 'HOLD',
        targetMarketId: context.market.id,
        confidence: 0,
        rationale: 'Volt Sniper agent is currently disabled.',
      };
    }

    const { spotTicker, market, depth } = context;
    const closeTime = new Date(market.closeTimestamp).getTime();
    const now = Date.now();
    const timeLeftSeconds = Math.max(1, Math.floor((closeTime - now) / 1000));

    // Expiry block boundary guard: avoid execution in final 15s to prevent on-chain block mining reverts
    if (timeLeftSeconds < 15) {
      return {
        agentType: 'Volt',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Market in final 15s expiration countdown (${timeLeftSeconds}s remaining). Holding to prevent block boundary reverts.`,
      };
    }

    // Calculate theoretical Black-Scholes fair value with latest drifted spot price & dynamic EWMA volatility
    const fair = calculateFairValue(spotTicker.price, market.strikePrice, timeLeftSeconds, market.symbol, undefined, spotTicker.priceHistory);

    // Dynamic volatility-normalized drift threshold (scaled to asset's EWMA 1m standard deviation)
    const volAdaptiveThreshold = calculateVolatilityNormalizedDriftThreshold(fair.volatilityUsed, 2.5, 60);
    const baseDriftThreshold = this.voltConfig.driftThreshold !== 0.002
      ? this.voltConfig.driftThreshold
      : volAdaptiveThreshold;

    const drift = spotTicker.change1m; // 1-minute spot drift ratio
    const absDrift = Math.abs(drift);

    // Execution window calibration: latency momentum sniping is highest conviction in the final 120s before expiry
    // If >120s remain, require 1.8x spot drift to avoid getting caught in mean-reverting intra-candle swings
    const requiredDrift = timeLeftSeconds > 120 ? baseDriftThreshold * 1.8 : baseDriftThreshold;
    if (absDrift < requiredDrift) {
      return {
        agentType: 'Volt',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Spot drift (${(drift * 100).toFixed(2)}%) is below current window threshold (${(requiredDrift * 100).toFixed(2)}% with ${timeLeftSeconds}s remaining, σ=${(fair.volatilityUsed * 100).toFixed(1)}%).`,
      };
    }

    // 1. Bullish Spot Spike -> Snipe Lagging YES Asks
    if (drift > 0) {
      // Macro trend confluence: 5-minute trend cannot be crashing against the 1-minute spike
      if (spotTicker.change5m < -0.0010) {
        return {
          agentType: 'Volt',
          action: 'HOLD',
          targetMarketId: market.id,
          confidence: 0.5,
          rationale: `[SPOT JUMP] 1m drift (+${(drift * 100).toFixed(2)}%) conflicts with 5m macro downtrend (${(spotTicker.change5m * 100).toFixed(2)}%). Holding.`,
        };
      }

      const rawAsks = depth.yesAsks && depth.yesAsks.length > 0
        ? depth.yesAsks
        : (market.bestAskYes > 0 ? [{ price: market.bestAskYes, quantity: 200, total: 100 }] : []);

      const topAskYes = rawAsks[0]?.price ?? 0;

      if (topAskYes > 0 && topAskYes <= 0.99) {
        // Preliminary sizing estimate
        const targetRiskUsd = Math.min(2.5, this.voltConfig.maxTradeSize > 0 ? this.voltConfig.maxTradeSize : 2.5);
        const estimatedLots = Math.max(1, Math.min(this.voltConfig.lotSize, Math.floor(targetRiskUsd / topAskYes)));
        
        // Calculate depth VWAP across order book levels
        const vwapResult = calculateDepthVWAP(rawAsks, estimatedLots);
        const effectivePrice = vwapResult.vwapPrice > 0 ? vwapResult.vwapPrice : topAskYes;
        const snappedPrice = quantizePrice(effectivePrice);

        // Safe probability envelope: avoid extreme tail buying (<0.15 or >0.85)
        if (snappedPrice < 0.15 || snappedPrice > 0.85) {
          return {
            agentType: 'Volt',
            action: 'HOLD',
            targetMarketId: market.id,
            confidence: 0.5,
            rationale: `YES ask price (${snappedPrice.toFixed(2)}) is outside the optimal risk/reward boundary [0.15, 0.85]. Holding.`,
          };
        }

        // Slippage Guard
        if (vwapResult.slippageVsTop > this.voltConfig.maxSlippage) {
          return {
            agentType: 'Volt',
            action: 'HOLD',
            targetMarketId: market.id,
            confidence: 0.5,
            rationale: `Order book depth slippage (${(vwapResult.slippageVsTop * 100).toFixed(2)}%) exceeds max allowed (${(this.voltConfig.maxSlippage * 100).toFixed(2)}%). Holding.`,
          };
        }

        // Net edge after fee & gas friction
        const netEdge = calculateNetExecutableEdge(fair.fairValueYes, snappedPrice);

        if (netEdge >= this.voltConfig.minEdge) {
          const lotSize = calculateEdgeProportionalLots(
            this.voltConfig.lotSize,
            netEdge,
            this.voltConfig.minEdge,
            targetRiskUsd,
            snappedPrice,
          );
          const confidence = Math.min(0.99, Number((0.82 + netEdge * 2.5).toFixed(2)));

          const rationale = `[SPOT JUMP] ${market.symbol} surged +${(drift * 100).toFixed(2)}% (5m: ${(spotTicker.change5m * 100).toFixed(2)}%, σ=${(fair.volatilityUsed * 100).toFixed(1)}%). Depth VWAP YES ask at ${snappedPrice.toFixed(2)} is lagging fair value ${fair.fairValueYes.toFixed(2)} (Net Executable Edge: +${(netEdge * 100).toFixed(1)}%). Firing IOC taker buy (${lotSize} lots).`;

          const decision: IAgentDecision = {
            agentType: 'Volt',
            action: 'TAKER_BUY',
            targetMarketId: market.id,
            targetOutcome: 'YES',
            price: snappedPrice,
            lotSize,
            confidence,
            rationale,
          };

          this.emitThought({
            id: `thought-${crypto.randomUUID()}`,
            agentType: 'Volt',
            marketId: market.id,
            triggerEvent: 'SPOT_STALENESS_SNIPE',
            confidence,
            actionTaken: 'TAKER_BUY_YES',
            reasoningText: rationale,
            metadata: {
              spot: spotTicker.price,
              strike: market.strikePrice,
              drift,
              drift5m: spotTicker.change5m,
              fairValue: fair.fairValueYes,
              bestAsk: topAskYes,
              vwapPrice: snappedPrice,
              netEdge,
              slippage: vwapResult.slippageVsTop,
            },
            createdAt: new Date().toISOString(),
          });

          return decision;
        }
      }
    }

    // 2. Bearish Spot Dump -> Snipe Lagging NO Asks
    if (drift < 0) {
      // Macro trend confluence: 5-minute trend cannot be pumping against the 1-minute dump
      if (spotTicker.change5m > 0.0010) {
        return {
          agentType: 'Volt',
          action: 'HOLD',
          targetMarketId: market.id,
          confidence: 0.5,
          rationale: `[SPOT DUMP] 1m drift (${(drift * 100).toFixed(2)}%) conflicts with 5m macro uptrend (+${(spotTicker.change5m * 100).toFixed(2)}%). Holding.`,
        };
      }

      const rawNoAsks = depth.noAsks && depth.noAsks.length > 0
        ? depth.noAsks
        : (market.bestAskNo > 0
            ? [{ price: market.bestAskNo, quantity: 200, total: 100 }]
            : (market.bestBidYes > 0 ? [{ price: Number((1.0 - market.bestBidYes).toFixed(4)), quantity: 200, total: 100 }] : []));

      const topAskNo = rawNoAsks[0]?.price ?? 0;

      if (topAskNo > 0 && topAskNo <= 0.99) {
        // Preliminary sizing estimate
        const targetRiskUsd = Math.min(2.5, this.voltConfig.maxTradeSize > 0 ? this.voltConfig.maxTradeSize : 2.5);
        const estimatedLots = Math.max(1, Math.min(this.voltConfig.lotSize, Math.floor(targetRiskUsd / topAskNo)));

        // Calculate depth VWAP across order book levels
        const vwapResult = calculateDepthVWAP(rawNoAsks, estimatedLots);
        const effectivePrice = vwapResult.vwapPrice > 0 ? vwapResult.vwapPrice : topAskNo;
        const snappedPrice = quantizePrice(effectivePrice);

        // Safe probability envelope: avoid extreme tail buying (<0.15 or >0.85)
        if (snappedPrice < 0.15 || snappedPrice > 0.85) {
          return {
            agentType: 'Volt',
            action: 'HOLD',
            targetMarketId: market.id,
            confidence: 0.5,
            rationale: `NO ask price (${snappedPrice.toFixed(2)}) is outside the optimal risk/reward boundary [0.15, 0.85]. Holding.`,
          };
        }

        // Slippage Guard
        if (vwapResult.slippageVsTop > this.voltConfig.maxSlippage) {
          return {
            agentType: 'Volt',
            action: 'HOLD',
            targetMarketId: market.id,
            confidence: 0.5,
            rationale: `Order book depth slippage (${(vwapResult.slippageVsTop * 100).toFixed(2)}%) exceeds max allowed (${(this.voltConfig.maxSlippage * 100).toFixed(2)}%). Holding.`,
          };
        }

        // Net edge after fee & gas friction
        const netEdge = calculateNetExecutableEdge(fair.fairValueNo, snappedPrice);

        if (netEdge >= this.voltConfig.minEdge) {
          const lotSize = calculateEdgeProportionalLots(
            this.voltConfig.lotSize,
            netEdge,
            this.voltConfig.minEdge,
            targetRiskUsd,
            snappedPrice,
          );
          const confidence = Math.min(0.99, Number((0.82 + netEdge * 2.5).toFixed(2)));

          const rationale = `[SPOT DUMP] ${market.symbol} dropped ${(drift * 100).toFixed(2)}% (5m: ${(spotTicker.change5m * 100).toFixed(2)}%, σ=${(fair.volatilityUsed * 100).toFixed(1)}%). Depth VWAP NO ask at ${snappedPrice.toFixed(2)} is lagging fair value ${fair.fairValueNo.toFixed(2)} (Net Executable Edge: +${(netEdge * 100).toFixed(1)}%). Firing IOC taker buy (${lotSize} lots).`;

          const decision: IAgentDecision = {
            agentType: 'Volt',
            action: 'TAKER_BUY',
            targetMarketId: market.id,
            targetOutcome: 'NO',
            price: snappedPrice,
            lotSize,
            confidence,
            rationale,
          };

          this.emitThought({
            id: `thought-${crypto.randomUUID()}`,
            agentType: 'Volt',
            marketId: market.id,
            triggerEvent: 'SPOT_STALENESS_SNIPE',
            confidence,
            actionTaken: 'TAKER_BUY_NO',
            reasoningText: rationale,
            metadata: {
              spot: spotTicker.price,
              strike: market.strikePrice,
              drift,
              drift5m: spotTicker.change5m,
              fairValue: fair.fairValueNo,
              bestAsk: topAskNo,
              vwapPrice: snappedPrice,
              netEdge,
              slippage: vwapResult.slippageVsTop,
            },
            createdAt: new Date().toISOString(),
          });

          return decision;
        }
      }
    }

    return {
      agentType: 'Volt',
      action: 'HOLD',
      targetMarketId: market.id,
      confidence: 0.6,
      rationale: `Spot drift detected (${(drift * 100).toFixed(2)}%), but order book has already adjusted or edge is below minimum threshold (${(this.voltConfig.minEdge * 100).toFixed(1)}%).`,
    };
  }

  /**
   * Executes approved taker snipe order via Order Service under session key delegation.
   */
  public async execute(
    decision: IAgentDecision,
    session: SessionGrant,
  ): Promise<OrderExecution | SettlementSweep | null> {
    if (!this.validateRisk(decision, session)) {
      return null;
    }

    return orderService.executeAgentDecision(decision, session);
  }
}

export const voltSniperAgent = new VoltSniperAgent();
