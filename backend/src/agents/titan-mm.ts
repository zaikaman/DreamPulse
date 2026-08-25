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

export interface TitanConfig extends AgentRiskConfig {
  targetSpread: number; // e.g. 0.04 (4% spread)
  inventoryAversion: number; // gamma skew coefficient e.g. 0.015
  lotSize: number;
}

export class TitanMMAgent extends BaseAgent {
  public readonly agentType: AgentType = 'Titan';
  public titanConfig: TitanConfig;
  private inventoryMap = new Map<string, number>(); // marketId -> netInventory (YES - NO)
  private lastThoughtTimes = new Map<string, number>(); // marketId -> last timestamp
  private lastQuotes = new Map<string, { bid: number; ask: number }>();

  constructor(config?: Partial<TitanConfig>) {
    super(config);
    this.titanConfig = {
      minEdge: config?.minEdge ?? 0.02,
      maxTradeSize: config?.maxTradeSize ?? 20.0,
      maxDailyVolume: config?.maxDailyVolume ?? 200.0,
      maxSlippage: config?.maxSlippage ?? 0.02,
      targetSpread: config?.targetSpread ?? 0.04, // 4% target spread
      inventoryAversion: config?.inventoryAversion ?? 0.015,
      lotSize: config?.lotSize ?? 2.0,
    };
  }

  /**
   * Sets current inventory balance for skewing calculation.
   */
  public setInventory(marketId: string, netInventory: number): void {
    this.inventoryMap.set(marketId, netInventory);
  }

  /**
   * Evaluates order book state and quotes two-sided liquidity centered on theoretical fair value Φ(z) with inventory skew.
   */
  public async evaluate(context: IAgentContext): Promise<IAgentDecision> {
    if (!this.isEnabled) {
      return {
        agentType: 'Titan',
        action: 'HOLD',
        targetMarketId: context.market.id,
        confidence: 0,
        rationale: 'Titan Market Maker agent is currently disabled.',
      };
    }

    const { spotTicker, market } = context;
    const closeTime = new Date(market.closeTimestamp).getTime();
    const now = Date.now();
    const timeLeftSeconds = Math.max(1, Math.floor((closeTime - now) / 1000));

    // Do not quote in the last 15 seconds before expiry to avoid settlement lock latency
    if (timeLeftSeconds < 15) {
      return {
        agentType: 'Titan',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: 'Market is in final 15s expiration window. Pulling quotes to avoid settlement risk.',
      };
    }

    // Theoretical Black-Scholes fair value Φ(z)
    const fair = calculateFairValue(spotTicker.price, market.strikePrice, timeLeftSeconds, market.symbol);
    const netInventory = this.inventoryMap.get(market.id) || 0;

    // Calculate spread and inventory skew:
    // Bid = Φ(z) - Spread/2 - gamma * Inventory
    // Ask = Φ(z) + Spread/2 - gamma * Inventory
    const halfSpread = this.titanConfig.targetSpread / 2.0;
    const inventorySkew = netInventory * this.titanConfig.inventoryAversion;

    const rawBid = Math.max(0.05, fair.fairValueYes - halfSpread - inventorySkew);
    const rawAsk = Math.min(0.95, fair.fairValueYes + halfSpread - inventorySkew);

    let snappedBid = quantizePrice(rawBid);
    let snappedAsk = quantizePrice(rawAsk);

    // Invariant: Bid must strictly be less than Ask
    if (snappedBid >= snappedAsk) {
      snappedBid = Math.max(0.05, quantizePrice(snappedAsk - 0.02));
    }

    const lotSize = quantizeLotSize(this.titanConfig.lotSize);
    const confidence = 0.88;

    const rationale = `[MM QUOTE] Providing two-sided liquidity around Φ(z) = ${(fair.fairValueYes * 100).toFixed(1)}%. Quoting Bid: ${snappedBid.toFixed(2)} / Ask: ${snappedAsk.toFixed(2)} with net inventory skew (${netInventory >= 0 ? '+' : ''}${netInventory.toFixed(1)} lots).`;

    const decision: IAgentDecision = {
      agentType: 'Titan',
      action: 'LIMIT_QUOTE',
      targetMarketId: market.id,
      targetOutcome: 'YES',
      price: snappedBid,
      lotSize,
      confidence,
      rationale,
    };

    // Throttle thoughts: only emit if price shifted >= 0.02 or at least 4s has elapsed
    const lastTime = this.lastThoughtTimes.get(market.id) || 0;
    const lastQuote = this.lastQuotes.get(market.id);
    const priceShifted = !lastQuote || Math.abs(lastQuote.bid - snappedBid) >= 0.02 || Math.abs(lastQuote.ask - snappedAsk) >= 0.02;

    if (priceShifted || now - lastTime >= 4000) {
      this.lastThoughtTimes.set(market.id, now);
      this.lastQuotes.set(market.id, { bid: snappedBid, ask: snappedAsk });

      this.emitThought({
        id: `thought-${crypto.randomUUID()}`,
        agentType: 'Titan',
        marketId: market.id,
        triggerEvent: 'CONTINUOUS_MARKET_MAKING',
        confidence,
        actionTaken: 'LIMIT_QUOTE_YES',
        reasoningText: rationale,
        metadata: {
          spot: spotTicker.price,
          strike: market.strikePrice,
          fairValue: fair.fairValueYes,
          bid: snappedBid,
          ask: snappedAsk,
          netInventory,
        },
        createdAt: new Date().toISOString(),
      });
    }

    return decision;
  }

  /**
   * Executes limit quote placement via Order Service under session key delegation.
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

export const titanMMAgent = new TitanMMAgent();
