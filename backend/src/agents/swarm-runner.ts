import { voltSniperAgent, VoltSniperAgent } from './volt-sniper.js';
import { oracleArbAgent, OracleArbAgent } from './oracle-arb.js';
import { titanMMAgent, TitanMMAgent } from './titan-mm.js';
import { sweeperAgent, SweeperAgent } from './sweeper.js';
import { marketService } from '../services/market-service.js';
import { sessionService } from '../services/session-service.js';
import { orderService } from '../services/order-service.js';
import { operatorAccount } from '../config/somnia.js';
import { telemetryWsGateway } from '../websocket/server.js';
import type { IAgentContext, IAgentDecision } from './base-agent.js';
import type { AgentType, SessionGrant, SwarmStatusSummary } from '../types/index.js';

export interface AgentTelemetryState {
  agentType: AgentType;
  isEnabled: boolean;
  status: 'ACTIVE' | 'PAUSED' | 'IDLE' | 'ERROR';
  evalLatencyMs: number;
  tradesToday: number;
  pnlAmount: number;
  lastAction: string;
  lastActionTimestamp: number;
  consecutiveErrors: number;
}

export class MultiAgentSwarmRunner {
  private isRunning: boolean = false;
  private intervalHandle: NodeJS.Timeout | null = null;
  private intervalMs: number = 100;
  private lastTradeTimes = new Map<AgentType, number>(); // Rate limiting per agent

  private telemetry: Record<AgentType, AgentTelemetryState> = {
    Volt: {
      agentType: 'Volt',
      isEnabled: true,
      status: 'ACTIVE',
      evalLatencyMs: 0,
      tradesToday: 0,
      pnlAmount: 0.0,
      lastAction: 'IDLE',
      lastActionTimestamp: Date.now(),
      consecutiveErrors: 0,
    },
    Oracle: {
      agentType: 'Oracle',
      isEnabled: true,
      status: 'ACTIVE',
      evalLatencyMs: 0,
      tradesToday: 0,
      pnlAmount: 0.0,
      lastAction: 'IDLE',
      lastActionTimestamp: Date.now(),
      consecutiveErrors: 0,
    },
    Titan: {
      agentType: 'Titan',
      isEnabled: true,
      status: 'ACTIVE',
      evalLatencyMs: 0,
      tradesToday: 0,
      pnlAmount: 0.0,
      lastAction: 'IDLE',
      lastActionTimestamp: Date.now(),
      consecutiveErrors: 0,
    },
    Sweeper: {
      agentType: 'Sweeper',
      isEnabled: true,
      status: 'ACTIVE',
      evalLatencyMs: 0,
      tradesToday: 0,
      pnlAmount: 0.0,
      lastAction: 'IDLE',
      lastActionTimestamp: Date.now(),
      consecutiveErrors: 0,
    },
  };

  constructor() {
    // Hook thought events from agents to broadcast via WebSocket
    [voltSniperAgent, oracleArbAgent, titanMMAgent, sweeperAgent].forEach((agent) => {
      agent.on('thought', (thought) => {
        telemetryWsGateway.broadcastAgentThought({
          agent: thought.agentType,
          marketId: thought.marketId,
          confidence: thought.confidence,
          action: thought.actionTaken,
          thought: thought.reasoningText,
        });
      });
    });
  }

  /**
   * Starts high-frequency 100ms multi-agent evaluation loop.
   */
  public start(intervalMs: number = 100): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalMs = intervalMs;

    console.log(`[SwarmRunner] Multi-agent swarm evaluation loop started (${this.intervalMs}ms cadence)`);

    this.intervalHandle = setInterval(() => {
      this.evaluateCycle().catch((err) => {
        console.error('[SwarmRunner] Cycle evaluation error:', err);
      });
    }, this.intervalMs);
  }

  /**
   * Stops multi-agent evaluation loop.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    console.log('[SwarmRunner] Swarm loop stopped');
  }

  /**
   * Executes a single evaluation tick across all active markets for all agents.
   */
  private async evaluateCycle(): Promise<void> {
    const markets = marketService.getActiveMarkets();
    if (markets.length === 0) return;

    const spotTickers = marketService.getAllSpotTickers();
    const agents = [
      { agent: voltSniperAgent, type: 'Volt' as AgentType },
      { agent: oracleArbAgent, type: 'Oracle' as AgentType },
      { agent: titanMMAgent, type: 'Titan' as AgentType },
      { agent: sweeperAgent, type: 'Sweeper' as AgentType },
    ];

    for (const { agent, type } of agents) {
      const state = this.telemetry[type];
      if (!state.isEnabled) {
        state.status = 'PAUSED';
        continue;
      }

      // Circuit breaker: pause agent if 5 consecutive errors occur
      if (state.consecutiveErrors >= 5) {
        state.status = 'ERROR';
        continue;
      }

      state.status = 'ACTIVE';

      // Evaluate each active market
      for (const market of markets) {
        const spot = spotTickers[market.symbol] || {
          symbol: market.symbol,
          price: market.strikePrice,
          change1m: 0,
          change5m: 0,
          timestamp: Date.now(),
        };

        const depth = marketService.getMarketDepth(market.id) || {
          yesBids: [{ price: market.bestBidYes || 0.49, quantity: 200, total: 98 }],
          yesAsks: [{ price: market.bestAskYes || 0.51, quantity: 200, total: 102 }],
        };

        const context: IAgentContext = {
          spotTicker: spot,
          market,
          depth,
          activeSessions: [],
        };

        const startEvalTime = performance.now();
        let decision: IAgentDecision;

        try {
          decision = await agent.evaluate(context);
          state.evalLatencyMs = Math.max(1, Math.round(performance.now() - startEvalTime));
          state.consecutiveErrors = 0;
        } catch (evalErr) {
          state.consecutiveErrors++;
          console.warn(`[SwarmRunner] Error in ${type} agent evaluation:`, evalErr);
          continue;
        }

        // Check if decision is actionable (not HOLD) and meets confidence threshold
        if (decision && decision.action !== 'HOLD' && decision.action !== 'CANCEL_QUOTE' && decision.confidence >= 0.75) {
          state.lastAction = `${decision.action}_${decision.targetOutcome || 'YES'}`;
          state.lastActionTimestamp = Date.now();

          // Rate limit: Max 1 execution per 15,000ms (15 seconds) per agent
          const lastTradeTime = this.lastTradeTimes.get(type) || 0;
          const now = Date.now();
          if (now - lastTradeTime < 15000) {
            continue;
          }

          // Execute under configured system operator address
          const systemOperatorAddress = operatorAccount.address;
          const defaultSession: SessionGrant = {
            id: `session-${type.toLowerCase()}`,
            userAddress: systemOperatorAddress,
            operatorAddress: systemOperatorAddress,
            permissions: ['placeOrderFor', 'cancelOrderFor'],
            maxTradeSize: 50.0,
            dailyVolumeCap: 500.0,
            spentToday: 0,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            isActive: true,
          };

          if (decision.action === 'BATCH_SWEEP') {
            const sweep = await sweeperAgent.execute(decision, defaultSession);
            if (sweep && 'claimableAmount' in sweep && (sweep.claimableAmount ?? 0) > 0) {
              this.lastTradeTimes.set(type, now);
              state.tradesToday++;
              state.pnlAmount = Number((state.pnlAmount + (sweep.claimableAmount || 0)).toFixed(2));
            }
          } else {
            const order = await orderService.executeAgentDecision(decision, defaultSession);
            if (order && (order.status === 'FILLED' || order.status === 'PENDING') && order.txHash && order.txHash !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
              this.lastTradeTimes.set(type, now);
              state.tradesToday++;
              // Real PnL accumulation based on actual order executions & settlement outcomes
              state.pnlAmount = Number((state.pnlAmount + (order.pnl || 0)).toFixed(2));
            }
          }
        }
      }
    }
  }

  /**
   * Toggles individual agent ON / OFF.
   */
  public toggleAgent(agentType: AgentType, enabled: boolean): boolean {
    const state = this.telemetry[agentType];
    if (!state) return false;

    state.isEnabled = enabled;
    state.status = enabled ? 'ACTIVE' : 'PAUSED';

    switch (agentType) {
      case 'Volt':
        voltSniperAgent.isEnabled = enabled;
        break;
      case 'Oracle':
        oracleArbAgent.isEnabled = enabled;
        break;
      case 'Titan':
        titanMMAgent.isEnabled = enabled;
        break;
      case 'Sweeper':
        sweeperAgent.isEnabled = enabled;
        break;
      default:
        break;
    }

    return true;
  }

  /**
   * Updates agent risk and strategy parameters.
   */
  public updateAgentConfig(agentType: AgentType, config: Record<string, any>): boolean {
    switch (agentType) {
      case 'Volt':
        if (config.driftThreshold !== undefined) voltSniperAgent.voltConfig.driftThreshold = Number(config.driftThreshold);
        if (config.minEdge !== undefined) voltSniperAgent.voltConfig.minEdge = Number(config.minEdge);
        if (config.lotSize !== undefined) voltSniperAgent.voltConfig.lotSize = Number(config.lotSize);
        if (config.maxTradeSize !== undefined) voltSniperAgent.voltConfig.maxTradeSize = Number(config.maxTradeSize);
        break;
      case 'Oracle':
        if (config.minEdge !== undefined) oracleArbAgent.oracleConfig.minEdge = Number(config.minEdge);
        if (config.lotSize !== undefined) oracleArbAgent.oracleConfig.lotSize = Number(config.lotSize);
        if (config.maxTradeSize !== undefined) oracleArbAgent.oracleConfig.maxTradeSize = Number(config.maxTradeSize);
        break;
      case 'Titan':
        if (config.targetSpread !== undefined) titanMMAgent.titanConfig.targetSpread = Number(config.targetSpread);
        if (config.inventoryAversion !== undefined) titanMMAgent.titanConfig.inventoryAversion = Number(config.inventoryAversion);
        if (config.lotSize !== undefined) titanMMAgent.titanConfig.lotSize = Number(config.lotSize);
        break;
      case 'Sweeper':
        if (config.autoCompound !== undefined) sweeperAgent.sweeperConfig.autoCompound = Boolean(config.autoCompound);
        if (config.minClaimableAmount !== undefined) sweeperAgent.sweeperConfig.minClaimableAmount = Number(config.minClaimableAmount);
        if (config.sweepIntervalMs !== undefined) sweeperAgent.sweeperConfig.sweepIntervalMs = Number(config.sweepIntervalMs);
        break;
      default:
        return false;
    }
    return true;
  }

  /**
   * Returns current swarm telemetry status summary.
   */
  public getSwarmStatus(): SwarmStatusSummary {
    const voltPrefix = this.telemetry.Volt.pnlAmount >= 0 ? '+' : '';
    const oraclePrefix = this.telemetry.Oracle.pnlAmount >= 0 ? '+' : '';
    const titanPrefix = this.telemetry.Titan.pnlAmount >= 0 ? '+' : '';

    return {
      volt: {
        status: this.telemetry.Volt.status,
        evalLatencyMs: this.telemetry.Volt.evalLatencyMs,
        tradesToday: this.telemetry.Volt.tradesToday,
        pnl: `${voltPrefix}${this.telemetry.Volt.pnlAmount.toFixed(2)} STT`,
      },
      oracle: {
        status: this.telemetry.Oracle.status,
        evalLatencyMs: this.telemetry.Oracle.evalLatencyMs,
        tradesToday: this.telemetry.Oracle.tradesToday,
        pnl: `${oraclePrefix}${this.telemetry.Oracle.pnlAmount.toFixed(2)} STT`,
      },
      titan: {
        status: this.telemetry.Titan.status,
        activeQuotes: 6,
        spreadCaptured: `${titanPrefix}${this.telemetry.Titan.pnlAmount.toFixed(2)} STT`,
      },
      sweeper: {
        status: this.telemetry.Sweeper.status,
        lastSweep: new Date(this.telemetry.Sweeper.lastActionTimestamp).toISOString(),
        totalClaimed: `${this.telemetry.Sweeper.pnlAmount.toFixed(2)} STT`,
      },
    };
  }

  /**
   * Returns detailed agent configurations and telemetry for cockpit.
   */
  public getDetailedSwarmState(): Record<string, any> {
    return {
      agents: {
        volt: {
          ...this.telemetry.Volt,
          config: voltSniperAgent.voltConfig,
        },
        oracle: {
          ...this.telemetry.Oracle,
          config: oracleArbAgent.oracleConfig,
        },
        titan: {
          ...this.telemetry.Titan,
          config: titanMMAgent.titanConfig,
        },
        sweeper: {
          ...this.telemetry.Sweeper,
        },
      },
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
    };
  }
}

export const swarmRunner = new MultiAgentSwarmRunner();
