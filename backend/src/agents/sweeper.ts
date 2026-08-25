import {
  BaseAgent,
  type IAgentContext,
  type IAgentDecision,
  type AgentRiskConfig,
} from './base-agent.js';
import type { AgentType, SessionGrant, OrderExecution, SettlementSweep } from '../types/index.js';
import { settlementService } from '../services/settlement-service.js';

export interface SweeperConfig extends AgentRiskConfig {
  autoCompound: boolean;
  minClaimableAmount: number; // Minimum STT to trigger claim
  sweepIntervalMs: number;
}

export class SweeperAgent extends BaseAgent {
  public readonly agentType: AgentType = 'Sweeper';
  public sweeperConfig: SweeperConfig;
  private lastSweepTimestamp: number = 0;

  constructor(config?: Partial<SweeperConfig>) {
    super(config);
    this.sweeperConfig = {
      minEdge: config?.minEdge ?? 0.0,
      maxTradeSize: config?.maxTradeSize ?? 100.0,
      maxDailyVolume: config?.maxDailyVolume ?? 1000.0,
      maxSlippage: config?.maxSlippage ?? 0.0,
      autoCompound: config?.autoCompound ?? true,
      minClaimableAmount: config?.minClaimableAmount ?? 0.5,
      sweepIntervalMs: config?.sweepIntervalMs ?? 30000, // 30 seconds
    };
  }

  /**
   * Scans market context to detect resolved / finalized prediction contracts with unclaimed payouts.
   */
  public async evaluate(context: IAgentContext): Promise<IAgentDecision> {
    if (!this.isEnabled) {
      return {
        agentType: 'Sweeper',
        action: 'HOLD',
        targetMarketId: context.market.id,
        confidence: 0,
        rationale: 'Sweeper settlement daemon is currently disabled.',
      };
    }

    const { market } = context;
    const isFinalized = market.status === 'Finalized' || market.status === 'Closed' || market.status === 'Resolving';

    if (!isFinalized) {
      return {
        agentType: 'Sweeper',
        action: 'HOLD',
        targetMarketId: market.id,
        confidence: 0.5,
        rationale: `Market ${market.symbol} (${market.windowDuration}) is currently ${market.status}. Payout redemptions open upon resolution.`,
      };
    }

    const now = Date.now();
    const timeSinceLastSweep = now - this.lastSweepTimestamp;

    // Check if we should trigger batch sweep
    const winningOutcome = market.winningOutcome || 'YES';
    const confidence = 0.98;
    const rationale = `[SETTLEMENT SWEEP] Market ${market.symbol} resolved with winning outcome ${winningOutcome}. Redeeming unclaimed collateral and auto-compounding to trading balance.`;

    const decision: IAgentDecision = {
      agentType: 'Sweeper',
      action: 'BATCH_SWEEP',
      targetMarketId: market.id,
      targetOutcome: winningOutcome === 'YES' ? 'YES' : 'NO',
      price: 1.0, // Payout token par value
      lotSize: 10.0,
      confidence,
      rationale,
    };

    if (timeSinceLastSweep >= this.sweeperConfig.sweepIntervalMs) {
      this.lastSweepTimestamp = now;
      this.emitThought({
        id: `thought-${crypto.randomUUID()}`,
        agentType: 'Sweeper',
        marketId: market.id,
        triggerEvent: 'MARKET_SETTLEMENT_RESOLVED',
        confidence,
        actionTaken: 'BATCH_CLAIM_PAYOUTS',
        reasoningText: rationale,
        metadata: {
          symbol: market.symbol,
          winningOutcome,
          status: market.status,
          autoCompound: this.sweeperConfig.autoCompound,
        },
        createdAt: new Date().toISOString(),
      });
    }

    return decision;
  }

  /**
   * Executes batch settlement redemption on Somnia Shannon Testnet.
   */
  public async execute(
    decision: IAgentDecision,
    session: SessionGrant,
  ): Promise<OrderExecution | SettlementSweep | null> {
    const sweep = await settlementService.claimMarketPayout(
      decision.targetMarketId,
      session.userAddress,
      decision.targetOutcome || 'YES',
      this.sweeperConfig.autoCompound,
    );

    return sweep;
  }
}

export const sweeperAgent = new SweeperAgent();
