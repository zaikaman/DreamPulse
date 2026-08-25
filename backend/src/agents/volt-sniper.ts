import {
  BaseAgent,
  type IAgentContext,
  type IAgentDecision,
  type AgentRiskConfig,
} from './base-agent.js';
import type { AgentType, SessionGrant, OrderExecution, SettlementSweep } from '../types/index.js';
import { calculateFairValue } from '../quantitative/pricing.js';
import { quantizePrice, quantizeLotSize } from '../quantitative/quantizer.js';
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
   * If spot price jumped or dumped faster than resting quotes adjusted, fires IOC taker order.
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
    const drift = spotTicker.change1m; // 1-minute spot drift ratio
    const absDrift = Math.abs(drift);

    // If spot has not drifted significantly, hold
    if (absDrift < this.voltConfig.driftThreshold) {
      return {
        agentType: 'Volt',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Spot drift (${(drift * 100).toFixed(2)}%) is below sniper trigger threshold (${(this.voltConfig.driftThreshold * 100).toFixed(2)}%).`,
      };
    }

    // Time remaining until resolution in seconds
    const closeTime = new Date(market.closeTimestamp).getTime();
    const now = Date.now();
    const timeLeftSeconds = Math.max(1, Math.floor((closeTime - now) / 1000));

    // Execution window calibration: latency momentum sniping is highest conviction in the final 120s before expiry
    // If >120s remain, require 2x spot drift (0.40%) to avoid getting caught in mean-reverting intra-candle swings
    const requiredDrift = timeLeftSeconds > 120 ? this.voltConfig.driftThreshold * 2.0 : this.voltConfig.driftThreshold;
    if (absDrift < requiredDrift) {
      return {
        agentType: 'Volt',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Spot drift (${(drift * 100).toFixed(2)}%) is below current window threshold (${(requiredDrift * 100).toFixed(2)}% with ${timeLeftSeconds}s remaining).`,
      };
    }

    // Calculate theoretical Black-Scholes fair value with latest drifted spot price
    const fair = calculateFairValue(spotTicker.price, market.strikePrice, timeLeftSeconds, market.symbol);

    // 1. Bullish Spot Spike -> Snipe Lagging YES Asks
    if (drift > 0) {
      const bestAskYes = market.bestAskYes > 0
        ? market.bestAskYes
        : (depth.yesAsks[0]?.price ?? 0);

      if (bestAskYes > 0 && bestAskYes <= 0.99) {
        const edge = fair.fairValueYes - bestAskYes;

        if (edge >= this.voltConfig.minEdge) {
          const snappedPrice = quantizePrice(bestAskYes);

          // Safe probability envelope: avoid extreme tail buying (<0.15 or >0.85) to eliminate negative skew steamroller risk
          if (snappedPrice < 0.15 || snappedPrice > 0.85) {
            return {
              agentType: 'Volt',
              action: 'HOLD',
              targetMarketId: market.id,
              confidence: 0.5,
              rationale: `YES ask price (${snappedPrice.toFixed(2)}) is outside the optimal risk/reward boundary [0.15, 0.85]. Holding.`,
            };
          }

          // Dynamic risk-adjusted position sizing: caps maximum capital at risk to ~$2.50 per trade
          const targetRiskUsd = Math.min(2.5, this.voltConfig.maxTradeSize > 0 ? this.voltConfig.maxTradeSize : 2.5);
          const dynamicLots = Math.max(1, Math.min(this.voltConfig.lotSize, Math.floor(targetRiskUsd / snappedPrice)));
          const lotSize = quantizeLotSize(dynamicLots);
          const confidence = Math.min(0.99, Number((0.75 + edge * 2.0).toFixed(2)));

          const rationale = `[SPOT JUMP] ${market.symbol} surged +${(drift * 100).toFixed(2)}%. Resting YES ask at ${bestAskYes.toFixed(2)} is lagging theoretical fair value ${fair.fairValueYes.toFixed(2)} (Edge: +${(edge * 100).toFixed(1)}%). Firing IOC taker buy (${lotSize} lots at ${snappedPrice.toFixed(2)}).`;

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
              fairValue: fair.fairValueYes,
              bestAsk: bestAskYes,
              edge,
            },
            createdAt: new Date().toISOString(),
          });

          return decision;
        }
      }
    }

    // 2. Bearish Spot Dump -> Snipe Lagging NO Asks
    if (drift < 0) {
      const bestAskNo = market.bestAskNo > 0
        ? market.bestAskNo
        : (market.bestBidYes > 0 ? Number((1.0 - market.bestBidYes).toFixed(4)) : 0);

      if (bestAskNo > 0 && bestAskNo <= 0.99) {
        const edge = fair.fairValueNo - bestAskNo;

        if (edge >= this.voltConfig.minEdge) {
          const snappedPrice = quantizePrice(bestAskNo);

          // Safe probability envelope: avoid extreme tail buying (<0.15 or >0.85) to eliminate negative skew steamroller risk
          if (snappedPrice < 0.15 || snappedPrice > 0.85) {
            return {
              agentType: 'Volt',
              action: 'HOLD',
              targetMarketId: market.id,
              confidence: 0.5,
              rationale: `NO ask price (${snappedPrice.toFixed(2)}) is outside the optimal risk/reward boundary [0.15, 0.85]. Holding.`,
            };
          }

          // Dynamic risk-adjusted position sizing: caps maximum capital at risk to ~$2.50 per trade
          const targetRiskUsd = Math.min(2.5, this.voltConfig.maxTradeSize > 0 ? this.voltConfig.maxTradeSize : 2.5);
          const dynamicLots = Math.max(1, Math.min(this.voltConfig.lotSize, Math.floor(targetRiskUsd / snappedPrice)));
          const lotSize = quantizeLotSize(dynamicLots);
          const confidence = Math.min(0.99, Number((0.75 + edge * 2.0).toFixed(2)));

          const rationale = `[SPOT DUMP] ${market.symbol} dropped ${(drift * 100).toFixed(2)}%. Resting NO ask at ${bestAskNo.toFixed(2)} is lagging theoretical fair value ${fair.fairValueNo.toFixed(2)} (Edge: +${(edge * 100).toFixed(1)}%). Firing IOC taker buy (${lotSize} lots at ${snappedPrice.toFixed(2)}).`;

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
              fairValue: fair.fairValueNo,
              bestAsk: bestAskNo,
              edge,
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
