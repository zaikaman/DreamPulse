import { EventEmitter } from 'events';
import type { AgentType, Market, SessionGrant, OrderExecution, SettlementSweep, AgentThoughtLog } from '../types/index.js';

export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBookDepth {
  yesBids: OrderBookLevel[];
  yesAsks: OrderBookLevel[];
}

export interface IAgentContext {
  spotTicker: {
    symbol: string;
    price: number;
    change1m: number;
    change5m: number;
    timestamp: number;
  };
  market: Market;
  depth: OrderBookDepth;
  activeSessions: SessionGrant[];
}

export interface IAgentDecision {
  agentType: AgentType;
  action: 'TAKER_BUY' | 'TAKER_SELL' | 'LIMIT_QUOTE' | 'CANCEL_QUOTE' | 'BATCH_SWEEP' | 'HOLD';
  targetMarketId: string;
  targetOutcome?: 'YES' | 'NO';
  price?: number;
  lotSize?: number;
  confidence: number;
  rationale: string;
}

export interface AgentRiskConfig {
  minEdge: number;
  maxTradeSize: number;
  maxDailyVolume: number;
  maxSlippage: number;
}

export abstract class BaseAgent extends EventEmitter {
  public abstract readonly agentType: AgentType;
  public isEnabled: boolean = true;
  protected riskConfig: AgentRiskConfig;

  constructor(riskConfig?: Partial<AgentRiskConfig>) {
    super();
    this.riskConfig = {
      minEdge: riskConfig?.minEdge ?? 0.03,
      maxTradeSize: riskConfig?.maxTradeSize ?? 20.0,
      maxDailyVolume: riskConfig?.maxDailyVolume ?? 200.0,
      maxSlippage: riskConfig?.maxSlippage ?? 0.02,
    };
  }

  /**
   * Initializes agent state and connections.
   */
  public async initialize(): Promise<void> {
    this.emit('initialized', { agentType: this.agentType });
  }

  /**
   * Evaluates current market state and returns a structured trading or liquidity decision.
   */
  public abstract evaluate(context: IAgentContext): Promise<IAgentDecision>;

  /**
   * Enforces non-custodial risk invariants before executing orders.
   */
  public validateRisk(decision: IAgentDecision, session: SessionGrant): boolean {
    if (!session.isActive) {
      this.emit('risk_rejected', { reason: 'Session is inactive', decision });
      return false;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      this.emit('risk_rejected', { reason: 'Session has expired', decision });
      return false;
    }

    if (decision.action === 'HOLD' || decision.action === 'CANCEL_QUOTE') {
      return true;
    }

    const tradePrice = decision.price ?? 0;
    const lotSize = decision.lotSize ?? 0;
    const totalCost = tradePrice * lotSize;

    // 1. Max Single Trade Size Check
    const effectiveMaxTrade = Math.min(this.riskConfig.maxTradeSize, session.maxTradeSize);
    if (totalCost > effectiveMaxTrade) {
      this.emit('risk_rejected', {
        reason: `Trade cost (${totalCost.toFixed(2)}) exceeds max trade limit (${effectiveMaxTrade.toFixed(2)})`,
        decision,
      });
      return false;
    }

    // 2. Rolling Daily Volume Cap Check
    const effectiveDailyCap = Math.min(this.riskConfig.maxDailyVolume, session.dailyVolumeCap);
    if (session.spentToday + totalCost > effectiveDailyCap) {
      this.emit('risk_rejected', {
        reason: `Trade cost would breach daily volume ceiling (${(session.spentToday + totalCost).toFixed(2)} > ${effectiveDailyCap.toFixed(2)})`,
        decision,
      });
      return false;
    }

    return true;
  }

  /**
   * Executes the approved agent decision against Somnia CLOB via Session Key.
   */
  public abstract execute(
    decision: IAgentDecision,
    session: SessionGrant,
  ): Promise<OrderExecution | SettlementSweep | null>;

  /**
   * Emits a transparent AI reasoning thought event to WebSocket subscribers and logs.
   */
  protected emitThought(thought: AgentThoughtLog): void {
    this.emit('thought', thought);
  }
}
