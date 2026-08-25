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

export interface OracleConfig extends AgentRiskConfig {
  lotSize: number;
}

export class OracleArbAgent extends BaseAgent {
  public readonly agentType: AgentType = 'Oracle';
  public oracleConfig: OracleConfig;

  constructor(config?: Partial<OracleConfig>) {
    super(config);
    this.oracleConfig = {
      minEdge: config?.minEdge ?? 0.035, // 3.5% EV edge
      maxTradeSize: config?.maxTradeSize ?? 20.0,
      maxDailyVolume: config?.maxDailyVolume ?? 200.0,
      maxSlippage: config?.maxSlippage ?? 0.02,
      lotSize: config?.lotSize ?? 5.0,
    };
  }

  /**
   * Evaluates mathematical pricing discrepancies between CLOB mid prices and Black-Scholes Φ(z) fair value.
   */
  public async evaluate(context: IAgentContext): Promise<IAgentDecision> {
    if (!this.isEnabled) {
      return {
        agentType: 'Oracle',
        action: 'HOLD',
        targetMarketId: context.market.id,
        confidence: 0,
        rationale: 'Oracle Arbitrage agent is currently disabled.',
      };
    }

    const { spotTicker, market } = context;
    const closeTime = new Date(market.closeTimestamp).getTime();
    const now = Date.now();
    const timeLeftSeconds = Math.max(1, Math.floor((closeTime - now) / 1000));

    // Calculate Black-Scholes normal cumulative distribution Φ(z)
    const fair = calculateFairValue(spotTicker.price, market.strikePrice, timeLeftSeconds, market.symbol);

    // Compute implied probability from market mid quote
    let impliedProbYes = market.impliedProbYes;
    if (market.bestBidYes > 0 && market.bestAskYes > 0) {
      impliedProbYes = Number(((market.bestBidYes + market.bestAskYes) / 2.0).toFixed(4));
    }

    const edge = fair.fairValueYes - impliedProbYes;
    const absEdge = Math.abs(edge);

    // If mathematical edge does not exceed risk ceiling, hold
    if (absEdge < this.oracleConfig.minEdge) {
      return {
        agentType: 'Oracle',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Market implied probability (${(impliedProbYes * 100).toFixed(1)}%) aligns with theoretical fair value Φ(z) (${(fair.fairValueYes * 100).toFixed(1)}%). Edge ${(absEdge * 100).toFixed(1)}% < min ${(this.oracleConfig.minEdge * 100).toFixed(1)}%.`,
      };
    }

    // 1. Underpriced YES in Order Book (+EV to Buy YES)
    if (edge > 0) {
      const askPrice = market.bestAskYes > 0 ? market.bestAskYes : quantizePrice(impliedProbYes);

      if (askPrice < fair.fairValueYes) {
        const snappedPrice = quantizePrice(askPrice);
        const maxLots = this.oracleConfig.maxTradeSize > 0
          ? Math.floor(this.oracleConfig.maxTradeSize / snappedPrice)
          : this.oracleConfig.lotSize;
        const lotSize = quantizeLotSize(Math.min(this.oracleConfig.lotSize, Math.max(1, maxLots)));
        const confidence = Math.min(0.99, Number((0.72 + absEdge * 2.5).toFixed(2)));

        const rationale = `[VOL ARB] Mathematical mispricing detected: Theoretical Φ(z) = ${(fair.fairValueYes * 100).toFixed(1)}% exceeds market price ${(askPrice * 100).toFixed(1)}% by +${(edge * 100).toFixed(1)}% EV edge. Buying YES.`;

        const decision: IAgentDecision = {
          agentType: 'Oracle',
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
          agentType: 'Oracle',
          marketId: market.id,
          triggerEvent: 'VOLATILITY_SURFACE_DISCREPANCY',
          confidence,
          actionTaken: 'TAKER_BUY_YES',
          reasoningText: rationale,
          metadata: {
            spot: spotTicker.price,
            strike: market.strikePrice,
            impliedProb: impliedProbYes,
            fairValue: fair.fairValueYes,
            edge,
          },
          createdAt: new Date().toISOString(),
        });

        return decision;
      }
    }

    // 2. Overpriced YES in Order Book (+EV to Buy NO)
    if (edge < 0) {
      const askPriceNo = market.bestAskNo > 0
        ? market.bestAskNo
        : (market.bestBidYes > 0 ? Number((1.0 - market.bestBidYes).toFixed(4)) : (1.0 - impliedProbYes));

      if (askPriceNo < fair.fairValueNo) {
        const snappedPrice = quantizePrice(askPriceNo);
        const maxLots = this.oracleConfig.maxTradeSize > 0
          ? Math.floor(this.oracleConfig.maxTradeSize / snappedPrice)
          : this.oracleConfig.lotSize;
        const lotSize = quantizeLotSize(Math.min(this.oracleConfig.lotSize, Math.max(1, maxLots)));
        const confidence = Math.min(0.99, Number((0.72 + absEdge * 2.5).toFixed(2)));

        const rationale = `[VOL ARB] Mathematical mispricing detected: Market YES is overpriced vs theoretical Φ(z) = ${(fair.fairValueYes * 100).toFixed(1)}% (NO EV Edge: +${(absEdge * 100).toFixed(1)}%). Buying NO.`;

        const decision: IAgentDecision = {
          agentType: 'Oracle',
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
          agentType: 'Oracle',
          marketId: market.id,
          triggerEvent: 'VOLATILITY_SURFACE_DISCREPANCY',
          confidence,
          actionTaken: 'TAKER_BUY_NO',
          reasoningText: rationale,
          metadata: {
            spot: spotTicker.price,
            strike: market.strikePrice,
            impliedProb: impliedProbYes,
            fairValue: fair.fairValueNo,
            edge: absEdge,
          },
          createdAt: new Date().toISOString(),
        });

        return decision;
      }
    }

    return {
      agentType: 'Oracle',
      action: 'HOLD',
      targetMarketId: market.id,
      confidence: 0.6,
      rationale: `Theoretical discrepancy observed, but book spread does not provide actionable taker execution threshold.`,
    };
  }

  /**
   * Executes approved arbitrage order via Order Service under session key delegation.
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

export const oracleArbAgent = new OracleArbAgent();
