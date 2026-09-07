import {
  BaseAgent,
  type IAgentContext,
  type IAgentDecision,
  type AgentRiskConfig,
} from './base-agent.js';
import type { AgentType, SessionGrant, OrderExecution, SettlementSweep } from '../types/index.js';
import { calculateFairValue, calculateVolatilityNormalizedDriftThreshold } from '../quantitative/pricing.js';
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
   * Calculates two-sided reservation prices centered on theoretical fair value Φ(z)
   * with super-linear inventory aversion and order book depth imbalance scaling using pure static evaluation.
   */
  public static calculateReservationQuotes(
    context: IAgentContext,
    partialConfig?: Partial<TitanConfig>,
    netInventory: number = 0,
  ): {
    snappedBid: number;
    snappedAsk: number;
    effectiveSpread: number;
    fairValueYes: number;
    realizedVol: number;
    netInventory: number;
  } {
    const config: TitanConfig = {
      minEdge: partialConfig?.minEdge ?? 0.02,
      maxTradeSize: partialConfig?.maxTradeSize ?? 20.0,
      maxDailyVolume: partialConfig?.maxDailyVolume ?? 200.0,
      maxSlippage: partialConfig?.maxSlippage ?? 0.02,
      targetSpread: partialConfig?.targetSpread ?? 0.04,
      inventoryAversion: partialConfig?.inventoryAversion ?? 0.015,
      lotSize: partialConfig?.lotSize ?? 2.0,
    };
    const { spotTicker, market, depth } = context;
    const closeTime = new Date(market.closeTimestamp).getTime();
    const now = Date.now();
    const timeLeftSeconds = Math.max(1, Math.floor((closeTime - now) / 1000));

    const fair = calculateFairValue(
      spotTicker.price,
      market.strikePrice,
      timeLeftSeconds,
      market.symbol,
      undefined,
      spotTicker.priceHistory,
    );

    // 1. Order book depth imbalance factor
    let depthImbalance = 0;
    const totalBidQty = (depth.yesBids || []).reduce((sum, b) => sum + b.quantity, 0);
    const totalAskQty = (depth.yesAsks || []).reduce((sum, a) => sum + a.quantity, 0);
    if (totalBidQty + totalAskQty > 0) {
      depthImbalance = Math.abs((totalBidQty - totalAskQty) / (totalBidQty + totalAskQty));
    }

    // 2. Volatility, drift, depth imbalance, and tail-adaptive dynamic spread
    const volRatio = (fair.volatilityUsed - 0.50) / 0.50;
    const driftTerm = Math.abs(spotTicker.change1m) * 2.5;
    const imbalanceTerm = depthImbalance * 0.4;

    // Tail spread expansion: widen spread when fair value drifts into extreme probability wings (>0.70 or <0.30)
    const tailDistance = Math.abs(fair.fairValueYes - 0.50);
    const tailExpansion = tailDistance > 0.20 ? (tailDistance - 0.20) * 0.8 : 0;

    const spreadMultiplier = Math.max(0.7, 1.0 + 0.6 * volRatio + driftTerm + imbalanceTerm + tailExpansion);
    const effectiveSpread = Math.max(0.025, Math.min(0.090, Number((config.targetSpread * spreadMultiplier).toFixed(4))));
    const halfSpread = effectiveSpread / 2.0;

    // 3. Super-Linear Inventory Skew: Gamma aversion scales non-linearly with position size
    const sign = netInventory >= 0 ? 1 : -1;
    const absInv = Math.abs(netInventory);
    const inventorySkew = Number((sign * config.inventoryAversion * Math.pow(absInv, 1.25)).toFixed(4));

    // 4. Calculate reservation prices with asymmetric tail shading
    let rawBid = fair.fairValueYes - halfSpread - inventorySkew;
    let rawAsk = fair.fairValueYes + halfSpread - inventorySkew;

    // Asymmetric tail shading: shade bids down when fair is high (>0.70) to avoid buying expensive contracts,
    // and shade asks up when fair is low (<0.30) to avoid selling cheap contracts
    if (fair.fairValueYes > 0.70) {
      const tailShade = (fair.fairValueYes - 0.70) * 0.50;
      rawBid -= tailShade;
    } else if (fair.fairValueYes < 0.30) {
      const tailShade = (0.30 - fair.fairValueYes) * 0.50;
      rawAsk += tailShade;
    }

    // Hard bounds: Bids strictly capped at 0.70 (max risk 0.70, minimum R:R ~0.43:1) and floored at 0.05
    // Asks strictly floored at 0.30 and capped at 0.95
    const boundedBid = Math.max(0.05, Math.min(0.70, rawBid));
    const boundedAsk = Math.min(0.95, Math.max(0.30, rawAsk));

    let snappedBid = quantizePrice(boundedBid);
    let snappedAsk = quantizePrice(boundedAsk);

    // Invariant: Bid must strictly be less than Ask
    if (snappedBid >= snappedAsk) {
      snappedBid = Math.max(0.05, quantizePrice(snappedAsk - 0.02));
    }

    return {
      snappedBid,
      snappedAsk,
      effectiveSpread,
      fairValueYes: fair.fairValueYes,
      realizedVol: fair.volatilityUsed,
      netInventory,
    };
  }

  /**
   * Calculates two-sided reservation prices on instance.
   */
  public calculateReservationQuotes(context: IAgentContext, configOverride?: Partial<TitanConfig>, inventoryOverride?: number): {
    snappedBid: number;
    snappedAsk: number;
    effectiveSpread: number;
    fairValueYes: number;
    realizedVol: number;
    netInventory: number;
  } {
    const config = configOverride ? { ...this.titanConfig, ...configOverride } : this.titanConfig;
    const inv = inventoryOverride !== undefined ? inventoryOverride : (this.inventoryMap.get(context.market.id) || 0);
    return TitanMMAgent.calculateReservationQuotes(context, config, inv);
  }

  /**
   * Evaluates order book state and quotes liquidity using pure static functional evaluation.
   */
  public static evaluateDecision(
    context: IAgentContext,
    partialConfig?: Partial<TitanConfig>,
    netInventory: number = 0,
  ): IAgentDecision {
    const config: TitanConfig = {
      minEdge: partialConfig?.minEdge ?? 0.02,
      maxTradeSize: partialConfig?.maxTradeSize ?? 20.0,
      maxDailyVolume: partialConfig?.maxDailyVolume ?? 200.0,
      maxSlippage: partialConfig?.maxSlippage ?? 0.02,
      targetSpread: partialConfig?.targetSpread ?? 0.04,
      inventoryAversion: partialConfig?.inventoryAversion ?? 0.015,
      lotSize: partialConfig?.lotSize ?? 2.0,
    };
    const { spotTicker, market } = context;
    const closeTime = new Date(market.closeTimestamp).getTime();
    const now = Date.now();
    const timeLeftSeconds = Math.max(1, Math.floor((closeTime - now) / 1000));

    // 1. Expiry Horizon Protection
    if (timeLeftSeconds < 30) {
      return {
        agentType: 'Titan',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Market is in final 30s expiration window (${timeLeftSeconds}s remaining). Pulling quotes to eliminate settlement pin-risk.`,
      };
    }

    // 2. Compute two-sided reservation quotes
    const quotes = TitanMMAgent.calculateReservationQuotes(context, config, netInventory);
    const { snappedBid, snappedAsk, effectiveSpread, fairValueYes, realizedVol } = quotes;

    // 3. Toxic Flow Protection: Auto-pull quotes during dynamic volatility-normalized spot velocity spikes (3.0 sigma of 1m move)
    const toxicDriftThreshold = calculateVolatilityNormalizedDriftThreshold(realizedVol, 3.0, 60, 0.0015, 0.0080);
    if (Math.abs(spotTicker.change1m) >= toxicDriftThreshold) {
      return {
        agentType: 'Titan',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Spot velocity surge detected (${(spotTicker.change1m * 100).toFixed(2)}% in 1m vs dynamic threshold ±${(toxicDriftThreshold * 100).toFixed(2)}%, σ=${(realizedVol * 100).toFixed(1)}%). Pulling quotes to eliminate toxic taker adverse selection.`,
      };
    }

    const lotSize = quantizeLotSize(config.lotSize);
    const confidence = 0.88;

    // 4. Asymmetric Two-Sided Quote Side Selection based on inventory & time-to-expiry
    let quotePrice = snappedBid;
    let quoteSide: 'YES' | 'NO' = 'YES';

    if (timeLeftSeconds < 90) {
      if (netInventory > 1.0) {
        // Heavy long YES -> Quote complementary NO at (1 - Ask) to balance net delta before expiry
        quoteSide = 'NO';
        quotePrice = quantizePrice(Math.max(0.05, Math.min(0.95, 1.0 - snappedAsk)));
      } else if (netInventory < -1.0) {
        // Heavy short YES -> Quote Bid on YES to cover delta
        quoteSide = 'YES';
        quotePrice = snappedBid;
      } else {
        quoteSide = netInventory > 0 ? 'NO' : 'YES';
        quotePrice = netInventory > 0
          ? quantizePrice(Math.max(0.05, Math.min(0.95, 1.0 - snappedAsk)))
          : snappedBid;
      }
    } else {
      // General regime: quote the side that reduces net inventory skew towards delta-neutral
      if (netInventory >= 1.0) {
        quoteSide = 'NO';
        quotePrice = quantizePrice(Math.max(0.05, Math.min(0.95, 1.0 - snappedAsk)));
      } else {
        quoteSide = 'YES';
        quotePrice = snappedBid;
      }
    }

    const rationale = `[MM QUOTE] Providing liquidity around Φ(z) = ${(fairValueYes * 100).toFixed(1)}% (Spread: ${(effectiveSpread * 100).toFixed(1)}%, EWMA σ=${(realizedVol * 100).toFixed(1)}%). Quoting ${quoteSide}: ${quotePrice.toFixed(2)} (Bid: ${snappedBid.toFixed(2)} / Ask: ${snappedAsk.toFixed(2)}) with net inventory (${netInventory >= 0 ? '+' : ''}${netInventory.toFixed(1)} lots).`;

    return {
      agentType: 'Titan',
      action: 'LIMIT_QUOTE',
      targetMarketId: market.id,
      targetOutcome: quoteSide,
      price: quotePrice,
      lotSize,
      confidence,
      rationale,
    };
  }

  /**
   * Evaluates order book state and quotes liquidity centered on theoretical fair value Φ(z) with inventory skew.
   */
  public async evaluate(context: IAgentContext, configOverride?: Partial<TitanConfig>, inventoryOverride?: number): Promise<IAgentDecision> {
    if (!this.isEnabled) {
      return {
        agentType: 'Titan',
        action: 'HOLD',
        targetMarketId: context.market.id,
        confidence: 0,
        rationale: 'Titan Market Maker agent is currently disabled.',
      };
    }

    const config = configOverride ? { ...this.titanConfig, ...configOverride } : this.titanConfig;
    const inv = inventoryOverride !== undefined ? inventoryOverride : (this.inventoryMap.get(context.market.id) || 0);
    const decision = TitanMMAgent.evaluateDecision(context, config, inv);

    if (decision.action !== 'HOLD' && !configOverride) {
      const now = Date.now();
      const lastTime = this.lastThoughtTimes.get(context.market.id) || 0;
      const lastQuote = this.lastQuotes.get(context.market.id);
      const quotes = TitanMMAgent.calculateReservationQuotes(context, config, inv);
      const priceShifted = !lastQuote || Math.abs(lastQuote.bid - quotes.snappedBid) >= 0.02 || Math.abs(lastQuote.ask - quotes.snappedAsk) >= 0.02;

      if (priceShifted || now - lastTime >= 4000) {
        this.lastThoughtTimes.set(context.market.id, now);
        this.lastQuotes.set(context.market.id, { bid: quotes.snappedBid, ask: quotes.snappedAsk });

        this.emitThought({
          id: `thought-${crypto.randomUUID()}`,
          agentType: 'Titan',
          marketId: context.market.id,
          triggerEvent: 'CONTINUOUS_MARKET_MAKING',
          confidence: decision.confidence,
          actionTaken: decision.targetOutcome === 'YES' ? 'LIMIT_QUOTE_YES' : 'LIMIT_QUOTE_NO',
          reasoningText: decision.rationale,
          metadata: {
            spot: context.spotTicker.price,
            strike: context.market.strikePrice,
            fairValue: quotes.fairValueYes,
            bid: quotes.snappedBid,
            ask: quotes.snappedAsk,
            effectiveSpread: quotes.effectiveSpread,
            realizedVol: quotes.realizedVol,
            netInventory: quotes.netInventory,
            quoteSide: decision.targetOutcome,
            quotePrice: decision.price,
          },
          createdAt: new Date().toISOString(),
        });
      }
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
