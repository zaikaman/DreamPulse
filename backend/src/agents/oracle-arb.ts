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
      minEdge: config?.minEdge ?? 0.035, // 3.5% base EV edge
      maxTradeSize: config?.maxTradeSize ?? 20.0,
      maxDailyVolume: config?.maxDailyVolume ?? 200.0,
      maxSlippage: config?.maxSlippage ?? 0.02,
      lotSize: config?.lotSize ?? 5.0,
    };
  }

  /**
   * Evaluates mathematical pricing discrepancies between CLOB order book prices and
   * dynamic EWMA realized-volatility Black-Scholes Φ(d2) fair values.
   *
   * Features:
   * 1. EWMA Realized Volatility: Uses smoothed rolling tick history rather than noisy raw variance.
   * 2. Depth VWAP Execution: Evaluates full order book ladder up to target lots.
   * 3. Time-Decay Theta Calibration: Scales required edge dynamically in short horizons (<300s).
   * 4. Adverse Selection Protection: Filters out trades fighting short-term spot momentum dumps/surges.
   * 5. Optimal Risk/Reward Envelope [0.25, 0.68] & ROI-on-Risk Hurdle (≥8.0% expected return on capital).
   * 6. Expiry Envelope: Avoids gamma pin-risk (<45s) and low-velocity horizon (>7200s).
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

    const { spotTicker, market, depth } = context;
    const closeTime = new Date(market.closeTimestamp).getTime();
    const now = Date.now();
    const timeLeftSeconds = Math.max(1, Math.floor((closeTime - now) / 1000));

    // 1. Expiry Horizon Filter: Avoid extreme pin-risk (<45s) and slow convergence (>2h)
    if (timeLeftSeconds < 45) {
      return {
        agentType: 'Oracle',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Market is near expiration (${timeLeftSeconds}s < 45s). Holding to avoid gamma pin-risk.`,
      };
    }
    if (timeLeftSeconds > 7200) {
      return {
        agentType: 'Oracle',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Market window is too far (${Math.round(timeLeftSeconds / 60)}m > 120m) for quantitative mispricing convergence. Holding.`,
      };
    }

    // Strike Pin-Risk Noise Boundary: In the final 120s, if spot is within 0.04% of strike, hold to avoid noise chop
    const spotDistancePct = Math.abs(spotTicker.price - market.strikePrice) / market.strikePrice;
    if (timeLeftSeconds < 120 && spotDistancePct < 0.0004) {
      return {
        agentType: 'Oracle',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Spot is within micro-noise band (${(spotDistancePct * 100).toFixed(3)}% of strike with ${timeLeftSeconds}s remaining). Holding to avoid gamma pin-risk whipsaw.`,
      };
    }

    // Dynamic theta edge scaling: demand higher margin of safety as expiry nears (high gamma regime)
    const timeDecayFactor = timeLeftSeconds < 300
      ? 1.0 + ((300 - timeLeftSeconds) / 300) * 0.40 // Up to +40% edge required in final 5m
      : 1.0;
    const dynamicMinEdge = Number((this.oracleConfig.minEdge * timeDecayFactor).toFixed(4));
    const minRoiHurdle = 0.08; // Minimum 8.0% expected return on capital at risk

    // 2. Dynamic Fair Value calculation utilizing real-time EWMA realized volatility
    const fair = calculateFairValue(
      spotTicker.price,
      market.strikePrice,
      timeLeftSeconds,
      market.symbol,
      undefined,
      spotTicker.priceHistory,
    );

    // Compute implied probability from market mid quote
    let impliedProbYes = market.impliedProbYes;
    if (market.bestBidYes > 0 && market.bestAskYes > 0) {
      impliedProbYes = Number(((market.bestBidYes + market.bestAskYes) / 2.0).toFixed(4));
    }

    const midDiscrepancy = fair.fairValueYes - impliedProbYes;
    const volPct = (fair.volatilityUsed * 100).toFixed(1);

    // Dynamic volatility-normalized adverse selection drift threshold (1.5 sigma of 1m move)
    const adverseDriftThreshold = calculateVolatilityNormalizedDriftThreshold(fair.volatilityUsed, 1.5, 60, 0.0008, 0.0050);

    // 3. Evaluate YES Executable Edge with Depth VWAP
    const rawAsksYes = depth.yesAsks && depth.yesAsks.length > 0
      ? depth.yesAsks
      : (market.bestAskYes > 0 ? [{ price: market.bestAskYes, quantity: 200, total: 100 }] : []);

    const topAskYes = rawAsksYes[0]?.price ?? 0;

    if (topAskYes > 0 && topAskYes <= 0.99 && fair.fairValueYes >= 0.45) {
      const targetRiskUsd = Math.min(2.5, this.oracleConfig.maxTradeSize > 0 ? this.oracleConfig.maxTradeSize : 2.5);
      const estimatedLots = Math.max(1, Math.min(this.oracleConfig.lotSize, Math.floor(targetRiskUsd / topAskYes)));
      
      const vwapResult = calculateDepthVWAP(rawAsksYes, estimatedLots);
      const effectivePrice = vwapResult.vwapPrice > 0 ? vwapResult.vwapPrice : topAskYes;
      const snappedPrice = quantizePrice(effectivePrice);

      // Optimal Risk/Reward Envelope: restrict taker buys to [0.25, 0.68]
      if (snappedPrice < 0.25 || snappedPrice > 0.68) {
        return {
          agentType: 'Oracle',
          action: 'HOLD',
          targetMarketId: market.id,
          confidence: 0.5,
          rationale: `YES ask price (${snappedPrice.toFixed(2)}) is outside the optimal risk/reward boundary [0.25, 0.68]. Holding to avoid asymmetric tail risk.`,
        };
      }

      if (vwapResult.slippageVsTop <= this.oracleConfig.maxSlippage) {
        // Adverse selection check: do NOT buy YES if spot is actively dumping hard
        if (spotTicker.change1m < -adverseDriftThreshold) {
          return {
            agentType: 'Oracle',
            action: 'HOLD',
            targetMarketId: market.id,
            confidence: 0.5,
            rationale: `Theoretical YES edge detected, but spot is dumping (${(spotTicker.change1m * 100).toFixed(2)}% in 1m vs dynamic threshold -${(adverseDriftThreshold * 100).toFixed(2)}%). Holding to avoid adverse selection.`,
          };
        }

        const netEdgeYes = calculateNetExecutableEdge(fair.fairValueYes, snappedPrice);
        const roiEdgeYes = calculateRoiEdge(netEdgeYes, snappedPrice);

        // Require both absolute probability edge and ROI-on-risk percentage hurdle
        if (netEdgeYes >= dynamicMinEdge && roiEdgeYes >= minRoiHurdle) {
          const lotSize = calculateEdgeProportionalLots(
            this.oracleConfig.lotSize,
            netEdgeYes,
            dynamicMinEdge,
            targetRiskUsd,
            snappedPrice,
          );
          const confidence = Math.min(0.99, Number((0.80 + netEdgeYes * 2.8).toFixed(2)));

          const rationale = `[VOL ARB] Mathematical mispricing (EWMA σ=${volPct}%): Theoretical Φ(d2)=${(fair.fairValueYes * 100).toFixed(1)}% vs Depth VWAP ${(snappedPrice * 100).toFixed(1)}% (Net Edge: +${(netEdgeYes * 100).toFixed(1)}%, ROI/Risk: +${(roiEdgeYes * 100).toFixed(1)}%, Req: ${(dynamicMinEdge * 100).toFixed(1)}%). Buying YES (${lotSize} lots).`;

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
              realizedVol: fair.volatilityUsed,
              fairValue: fair.fairValueYes,
              askPrice: topAskYes,
              vwapPrice: snappedPrice,
              netEdge: netEdgeYes,
              roiEdge: roiEdgeYes,
              requiredEdge: dynamicMinEdge,
              spotChange1m: spotTicker.change1m,
              slippage: vwapResult.slippageVsTop,
            },
            createdAt: new Date().toISOString(),
          });

          return decision;
        }
      }
    }

    // 4. Evaluate NO Executable Edge with Depth VWAP
    const rawAsksNo = depth.noAsks && depth.noAsks.length > 0
      ? depth.noAsks
      : (market.bestAskNo > 0
          ? [{ price: market.bestAskNo, quantity: 200, total: 100 }]
          : (market.bestBidYes > 0 ? [{ price: Number((1.0 - market.bestBidYes).toFixed(4)), quantity: 200, total: 100 }] : []));

    const topAskNo = rawAsksNo[0]?.price ?? 0;

    if (topAskNo > 0 && topAskNo <= 0.99 && fair.fairValueNo >= 0.45) {
      const targetRiskUsd = Math.min(2.5, this.oracleConfig.maxTradeSize > 0 ? this.oracleConfig.maxTradeSize : 2.5);
      const estimatedLots = Math.max(1, Math.min(this.oracleConfig.lotSize, Math.floor(targetRiskUsd / topAskNo)));

      const vwapResult = calculateDepthVWAP(rawAsksNo, estimatedLots);
      const effectivePrice = vwapResult.vwapPrice > 0 ? vwapResult.vwapPrice : topAskNo;
      const snappedPrice = quantizePrice(effectivePrice);

      // Optimal Risk/Reward Envelope: restrict taker buys to [0.25, 0.68]
      if (snappedPrice < 0.25 || snappedPrice > 0.68) {
        return {
          agentType: 'Oracle',
          action: 'HOLD',
          targetMarketId: market.id,
          confidence: 0.5,
          rationale: `NO ask price (${snappedPrice.toFixed(2)}) is outside the optimal risk/reward boundary [0.25, 0.68]. Holding to avoid asymmetric tail risk.`,
        };
      }

      if (vwapResult.slippageVsTop <= this.oracleConfig.maxSlippage) {
        // Adverse selection check: do NOT buy NO if spot is actively surging hard
        if (spotTicker.change1m > adverseDriftThreshold) {
          return {
            agentType: 'Oracle',
            action: 'HOLD',
            targetMarketId: market.id,
            confidence: 0.5,
            rationale: `Theoretical NO edge detected, but spot is surging (+${(spotTicker.change1m * 100).toFixed(2)}% in 1m vs dynamic threshold +${(adverseDriftThreshold * 100).toFixed(2)}%). Holding to avoid adverse selection.`,
          };
        }

        const netEdgeNo = calculateNetExecutableEdge(fair.fairValueNo, snappedPrice);
        const roiEdgeNo = calculateRoiEdge(netEdgeNo, snappedPrice);

        // Require both absolute probability edge and ROI-on-risk percentage hurdle
        if (netEdgeNo >= dynamicMinEdge && roiEdgeNo >= minRoiHurdle) {
          const lotSize = calculateEdgeProportionalLots(
            this.oracleConfig.lotSize,
            netEdgeNo,
            dynamicMinEdge,
            targetRiskUsd,
            snappedPrice,
          );
          const confidence = Math.min(0.99, Number((0.80 + netEdgeNo * 2.8).toFixed(2)));

          const rationale = `[VOL ARB] Mathematical mispricing (EWMA σ=${volPct}%): Theoretical NO Φ(d2)=${(fair.fairValueNo * 100).toFixed(1)}% vs Depth VWAP ${(snappedPrice * 100).toFixed(1)}% (Net Edge: +${(netEdgeNo * 100).toFixed(1)}%, ROI/Risk: +${(roiEdgeNo * 100).toFixed(1)}%, Req: ${(dynamicMinEdge * 100).toFixed(1)}%). Buying NO (${lotSize} lots).`;

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
              realizedVol: fair.volatilityUsed,
              fairValue: fair.fairValueNo,
              askPrice: topAskNo,
              vwapPrice: snappedPrice,
              netEdge: netEdgeNo,
              roiEdge: roiEdgeNo,
              requiredEdge: dynamicMinEdge,
              spotChange1m: spotTicker.change1m,
              slippage: vwapResult.slippageVsTop,
            },
            createdAt: new Date().toISOString(),
          });

          return decision;
        }
      }
    }

    return {
      agentType: 'Oracle',
      action: 'HOLD',
      targetMarketId: market.id,
      confidence: 0.55,
      rationale: `Market is efficiently priced under EWMA σ=${volPct}%. Theoretical mid edge (${(Math.abs(midDiscrepancy) * 100).toFixed(1)}%) or post-spread ask margin is below dynamic threshold (${(dynamicMinEdge * 100).toFixed(1)}%).`,
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
