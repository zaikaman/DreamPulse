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
  calculateRoiEdge,
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
   * Evaluates spot velocity vs order book quote latency using pure static functional evaluation.
   */
  public static evaluateDecision(context: IAgentContext, partialConfig?: Partial<VoltConfig>): IAgentDecision {
    const config: VoltConfig = {
      minEdge: partialConfig?.minEdge ?? 0.03,
      maxTradeSize: partialConfig?.maxTradeSize ?? 20.0,
      maxDailyVolume: partialConfig?.maxDailyVolume ?? 200.0,
      maxSlippage: partialConfig?.maxSlippage ?? 0.02,
      driftThreshold: partialConfig?.driftThreshold ?? 0.002,
      lotSize: partialConfig?.lotSize ?? 5.0,
    };
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

    // Strike Pin-Risk Noise Boundary: In the final 120s, if spot is within 0.04% of strike, hold to avoid noise chop
    const spotDistancePct = Math.abs(spotTicker.price - market.strikePrice) / market.strikePrice;
    if (timeLeftSeconds < 120 && spotDistancePct < 0.0004) {
      return {
        agentType: 'Volt',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Spot is within micro-noise band (${(spotDistancePct * 100).toFixed(3)}% of strike with ${timeLeftSeconds}s remaining). Holding to avoid gamma pin-risk whipsaw.`,
      };
    }

    // Calculate theoretical Black-Scholes fair value with latest drifted spot price & dynamic EWMA volatility
    const fair = calculateFairValue(spotTicker.price, market.strikePrice, timeLeftSeconds, market.symbol, undefined, spotTicker.priceHistory);

    // Dynamic volatility-normalized drift threshold (scaled to asset's EWMA 1m standard deviation)
    const volAdaptiveThreshold = calculateVolatilityNormalizedDriftThreshold(fair.volatilityUsed, 2.5, 60);
    const baseDriftThreshold = config.driftThreshold !== 0.002
      ? config.driftThreshold
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

    const minRoiHurdle = 0.08; // Minimum 8.0% expected return on capital at risk

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

      if (topAskYes > 0 && topAskYes <= 0.99 && fair.fairValueYes >= 0.45) {
        // Preliminary sizing estimate
        const targetRiskUsd = Math.min(2.5, config.maxTradeSize > 0 ? config.maxTradeSize : 2.5);
        const estimatedLots = Math.max(1, Math.min(config.lotSize, Math.floor(targetRiskUsd / topAskYes)));
        
        // Calculate depth VWAP across order book levels
        const vwapResult = calculateDepthVWAP(rawAsks, estimatedLots);
        const effectivePrice = vwapResult.vwapPrice > 0 ? vwapResult.vwapPrice : topAskYes;
        const snappedPrice = quantizePrice(effectivePrice);

        // Safe probability envelope: restrict taker buys to [0.25, 0.68] to ensure favorable R:R
        if (snappedPrice < 0.25 || snappedPrice > 0.68) {
          return {
            agentType: 'Volt',
            action: 'HOLD',
            targetMarketId: market.id,
            confidence: 0.5,
            rationale: `YES ask price (${snappedPrice.toFixed(2)}) is outside the optimal risk/reward boundary [0.25, 0.68]. Holding.`,
          };
        }

        // Slippage Guard
        if (vwapResult.slippageVsTop > config.maxSlippage) {
          return {
            agentType: 'Volt',
            action: 'HOLD',
            targetMarketId: market.id,
            confidence: 0.5,
            rationale: `Order book depth slippage (${(vwapResult.slippageVsTop * 100).toFixed(2)}%) exceeds max allowed (${(config.maxSlippage * 100).toFixed(2)}%). Holding.`,
          };
        }

        // Net edge after fee & gas friction
        const netEdge = calculateNetExecutableEdge(fair.fairValueYes, snappedPrice);
        const roiEdge = calculateRoiEdge(netEdge, snappedPrice);

        // Require both absolute probability edge and minimum 8.0% return-on-risk hurdle
        if (netEdge >= config.minEdge && roiEdge >= minRoiHurdle) {
          const lotSize = calculateEdgeProportionalLots(
            config.lotSize,
            netEdge,
            config.minEdge,
            targetRiskUsd,
            snappedPrice,
          );
          const confidence = Math.min(0.99, Number((0.82 + netEdge * 2.5).toFixed(2)));

          const rationale = `[SPOT JUMP] ${market.symbol} surged +${(drift * 100).toFixed(2)}% (5m: ${(spotTicker.change5m * 100).toFixed(2)}%, σ=${(fair.volatilityUsed * 100).toFixed(1)}%). Depth VWAP YES ask at ${snappedPrice.toFixed(2)} is lagging fair value ${fair.fairValueYes.toFixed(2)} (Net Edge: +${(netEdge * 100).toFixed(1)}%, ROI/Risk: +${(roiEdge * 100).toFixed(1)}%). Firing limit taker buy (${lotSize} lots).`;

          return {
            agentType: 'Volt',
            action: 'TAKER_BUY',
            targetMarketId: market.id,
            targetOutcome: 'YES',
            price: snappedPrice,
            lotSize,
            confidence,
            rationale,
          };
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

      if (topAskNo > 0 && topAskNo <= 0.99 && fair.fairValueNo >= 0.45) {
        // Preliminary sizing estimate
        const targetRiskUsd = Math.min(2.5, config.maxTradeSize > 0 ? config.maxTradeSize : 2.5);
        const estimatedLots = Math.max(1, Math.min(config.lotSize, Math.floor(targetRiskUsd / topAskNo)));

        // Calculate depth VWAP across order book levels
        const vwapResult = calculateDepthVWAP(rawNoAsks, estimatedLots);
        const effectivePrice = vwapResult.vwapPrice > 0 ? vwapResult.vwapPrice : topAskNo;
        const snappedPrice = quantizePrice(effectivePrice);

        // Safe probability envelope: restrict taker buys to [0.25, 0.68] to ensure favorable R:R
        if (snappedPrice < 0.25 || snappedPrice > 0.68) {
          return {
            agentType: 'Volt',
            action: 'HOLD',
            targetMarketId: market.id,
            confidence: 0.5,
            rationale: `NO ask price (${snappedPrice.toFixed(2)}) is outside the optimal risk/reward boundary [0.25, 0.68]. Holding.`,
          };
        }

        // Slippage Guard
        if (vwapResult.slippageVsTop > config.maxSlippage) {
          return {
            agentType: 'Volt',
            action: 'HOLD',
            targetMarketId: market.id,
            confidence: 0.5,
            rationale: `Order book depth slippage (${(vwapResult.slippageVsTop * 100).toFixed(2)}%) exceeds max allowed (${(config.maxSlippage * 100).toFixed(2)}%). Holding.`,
          };
        }

        // Net edge after fee & gas friction
        const netEdge = calculateNetExecutableEdge(fair.fairValueNo, snappedPrice);
        const roiEdge = calculateRoiEdge(netEdge, snappedPrice);

        // Require both absolute probability edge and minimum 8.0% return-on-risk hurdle
        if (netEdge >= config.minEdge && roiEdge >= minRoiHurdle) {
          const lotSize = calculateEdgeProportionalLots(
            config.lotSize,
            netEdge,
            config.minEdge,
            targetRiskUsd,
            snappedPrice,
          );
          const confidence = Math.min(0.99, Number((0.82 + netEdge * 2.5).toFixed(2)));

          const rationale = `[SPOT DUMP] ${market.symbol} dropped ${(drift * 100).toFixed(2)}% (5m: ${(spotTicker.change5m * 100).toFixed(2)}%, σ=${(fair.volatilityUsed * 100).toFixed(1)}%). Depth VWAP NO ask at ${snappedPrice.toFixed(2)} is lagging fair value ${fair.fairValueNo.toFixed(2)} (Net Edge: +${(netEdge * 100).toFixed(1)}%, ROI/Risk: +${(roiEdge * 100).toFixed(1)}%). Firing limit taker buy (${lotSize} lots).`;

          return {
            agentType: 'Volt',
            action: 'TAKER_BUY',
            targetMarketId: market.id,
            targetOutcome: 'NO',
            price: snappedPrice,
            lotSize,
            confidence,
            rationale,
          };
        }
      }
    }

    return {
      agentType: 'Volt',
      action: 'HOLD',
      targetMarketId: market.id,
      confidence: 0.6,
      rationale: `Spot drift detected (${(drift * 100).toFixed(2)}%), but order book has already adjusted or edge is below minimum threshold (${(config.minEdge * 100).toFixed(1)}%).`,
    };
  }

  /**
   * Evaluates spot velocity vs order book quote latency.
   * If spot price jumped or dumped faster than resting quotes adjusted, fires limit taker order with VWAP depth awareness.
   */
  public async evaluate(context: IAgentContext, configOverride?: Partial<VoltConfig>): Promise<IAgentDecision> {
    if (!this.isEnabled) {
      return {
        agentType: 'Volt',
        action: 'HOLD',
        targetMarketId: context.market.id,
        confidence: 0,
        rationale: 'Volt Sniper agent is currently disabled.',
      };
    }

    const config = configOverride ? { ...this.voltConfig, ...configOverride } : this.voltConfig;
    const decision = VoltSniperAgent.evaluateDecision(context, config);

    if (decision.action !== 'HOLD' && !configOverride) {
      this.emitThought({
        id: `thought-${crypto.randomUUID()}`,
        agentType: 'Volt',
        marketId: context.market.id,
        triggerEvent: 'SPOT_STALENESS_SNIPE',
        confidence: decision.confidence,
        actionTaken: decision.targetOutcome === 'YES' ? 'TAKER_BUY_YES' : 'TAKER_BUY_NO',
        reasoningText: decision.rationale,
        metadata: {
          spot: context.spotTicker.price,
          strike: context.market.strikePrice,
          drift: context.spotTicker.change1m,
          drift5m: context.spotTicker.change5m,
          vwapPrice: decision.price,
        },
        createdAt: new Date().toISOString(),
      });
    }

    return decision;
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
