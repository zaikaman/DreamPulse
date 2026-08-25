import { voltSniperAgent, VoltSniperAgent } from './volt-sniper.js';
import { oracleArbAgent, OracleArbAgent } from './oracle-arb.js';
import { titanMMAgent, TitanMMAgent } from './titan-mm.js';
import { sweeperAgent, SweeperAgent } from './sweeper.js';
import { marketService } from '../services/market-service.js';
import { sessionService } from '../services/session-service.js';
import { orderService } from '../services/order-service.js';
import { settlementService } from '../services/settlement-service.js';
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
  private lastTradeTimes = new Map<string, number>(); // Rate limiting per agent
  private lastOpportunityKeys = new Map<string, number>(); // Opportunity deduplication
  private lastThoughtTimes = new Map<AgentType, number>(); // Rate limiting per agent
  private lastThoughtTexts = new Map<AgentType, string>(); // Deduplication

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
    // Hook thought events from agents to broadcast via WebSocket with strict pacing & deduplication
    [voltSniperAgent, oracleArbAgent, titanMMAgent, sweeperAgent].forEach((agent) => {
      agent.on('thought', (thought) => {
        const now = Date.now();
        const agentType = thought.agentType as AgentType;
        const lastTime = this.lastThoughtTimes.get(agentType) || 0;
        const lastText = this.lastThoughtTexts.get(agentType) || '';

        // 1. Strict deduplication: minimum 15.0s before the same agent can broadcast the exact same reasoning text
        if (lastText === thought.reasoningText && now - lastTime < 15000) {
          return;
        }

        // 2. Strict per-agent pacing: minimum 3.5s between any thoughts from the same agent
        if (now - lastTime < 3500) {
          return;
        }

        this.lastThoughtTimes.set(agentType, now);
        this.lastThoughtTexts.set(agentType, thought.reasoningText);

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
    orderService.syncResolvedOrdersPnL();
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

        // Check if decision is actionable (not HOLD) and meets strict high conviction threshold (>= 88%)
        if (decision && decision.action !== 'HOLD' && decision.action !== 'CANCEL_QUOTE' && decision.confidence >= 0.88) {
          const now = Date.now();
          const lastTradeTime = this.lastTradeTimes.get(type) || 0;

          // 1. Conservative In-Flight Risk Control: Wait for existing trade to resolve before opening a new one
          if (decision.action !== 'BATCH_SWEEP') {
            // A. Don't enter another position on the same market until the current window resolves
            if (orderService.hasActivePosition(type, market.id)) {
              continue;
            }

            // B. Max 1 active trade at a time per agent (wait for settlement/expiry)
            if (orderService.getActivePositionCount(type) >= 1) {
              continue;
            }

            // C. Max 3 active positions concurrently across the entire swarm portfolio
            if (orderService.getActivePositionCount() >= 3) {
              continue;
            }
          }

          // 2. Strict per-agent trading cooldown: minimum 30,000ms (30 seconds) between trade attempts
          if (now - lastTradeTime < 30000) {
            continue;
          }

          // 3. Strict opportunity deduplication: minimum 60,000ms (60 seconds) before trading the same market/direction/price
          const oppKey = `${type}:${market.id}:${decision.action}:${decision.targetOutcome || 'YES'}:${decision.price || 0}`;
          const lastOppTime = this.lastOpportunityKeys.get(oppKey) || 0;
          if (now - lastOppTime < 60000) {
            continue;
          }

          // Immediately record attempt timestamps to prevent rapid-fire loop if on-chain transaction fails/reverts
          this.lastTradeTimes.set(type, now);
          this.lastOpportunityKeys.set(oppKey, now);

          state.lastAction = `${decision.action}_${decision.targetOutcome || 'YES'}`;
          state.lastActionTimestamp = now;

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
            await sweeperAgent.execute(decision, defaultSession);
          } else {
            await orderService.executeAgentDecision(decision, defaultSession);

            // Autonomous Copy-Trading: Mirror trade signal to all active delegated user sessions
            const activeUserSessions = sessionService.getActiveSessions();
            for (const userSession of activeUserSessions) {
              if (userSession.userAddress.toLowerCase() === systemOperatorAddress.toLowerCase()) {
                continue;
              }
              const estCost = (decision.price ?? 0.5) * (decision.lotSize ?? 1.0);
              const allowance = sessionService.validateTradeAllowance(userSession.id, estCost);
              if (!allowance.allowed) {
                continue;
              }
              try {
                const sessionGrant: SessionGrant = {
                  id: userSession.id,
                  userAddress: userSession.userAddress,
                  operatorAddress: userSession.operatorAddress,
                  permissions: userSession.permissions as Array<'placeOrderFor' | 'cancelOrderFor'>,
                  maxTradeSize: userSession.maxTradeSize,
                  dailyVolumeCap: userSession.dailyVolumeCap,
                  spentToday: userSession.spentToday,
                  expiresAt: userSession.expiresAt,
                  isActive: userSession.isActive,
                  onChainTxHash: userSession.onChainTxHash,
                  vaultDepositAmount: userSession.vaultDepositAmount,
                  targetPoolAddress: userSession.targetPoolAddress,
                  onChainAuthorized: userSession.onChainAuthorized,
                };
                await orderService.executeAgentDecision(decision, sessionGrant);
              } catch (copyErr: any) {
                console.warn(`[SwarmRunner] Copy-trade skipped for user ${userSession.userAddress}:`, copyErr.message);
              }
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
    const voltPnl = orderService.getTotalRealizedPnl('Volt');
    const oraclePnl = orderService.getTotalRealizedPnl('Oracle');
    const titanPnl = orderService.getTotalRealizedPnl('Titan');

    this.telemetry.Volt.pnlAmount = voltPnl;
    this.telemetry.Oracle.pnlAmount = oraclePnl;
    this.telemetry.Titan.pnlAmount = titanPnl;

    this.telemetry.Volt.tradesToday = orderService.getOrders({ agentType: 'Volt' }).length;
    this.telemetry.Oracle.tradesToday = orderService.getOrders({ agentType: 'Oracle' }).length;
    this.telemetry.Titan.tradesToday = orderService.getOrders({ agentType: 'Titan' }).length;

    const userSweeps = settlementService.getSweepHistory(operatorAccount.address);
    const confirmedSweeps = userSweeps.filter(
      (s) => s.status === 'CONFIRMED' && s.txHash && s.txHash !== '0x0000000000000000000000000000000000000000000000000000000000000000',
    );
    const sweeperPnl = confirmedSweeps.reduce((acc, s) => acc + (s.claimableAmount || 0), 0);
    this.telemetry.Sweeper.pnlAmount = Number(sweeperPnl.toFixed(2));
    this.telemetry.Sweeper.tradesToday = confirmedSweeps.length;

    const voltPrefix = voltPnl >= 0 ? '+' : '';
    const oraclePrefix = oraclePnl >= 0 ? '+' : '';
    const titanPrefix = titanPnl >= 0 ? '+' : '';

    return {
      volt: {
        status: this.telemetry.Volt.status,
        evalLatencyMs: this.telemetry.Volt.evalLatencyMs,
        tradesToday: this.telemetry.Volt.tradesToday,
        pnl: `${voltPrefix}${voltPnl.toFixed(2)} tUSDC`,
      },
      oracle: {
        status: this.telemetry.Oracle.status,
        evalLatencyMs: this.telemetry.Oracle.evalLatencyMs,
        tradesToday: this.telemetry.Oracle.tradesToday,
        pnl: `${oraclePrefix}${oraclePnl.toFixed(2)} tUSDC`,
      },
      titan: {
        status: this.telemetry.Titan.status,
        activeQuotes: 6,
        spreadCaptured: `${titanPrefix}${titanPnl.toFixed(2)} tUSDC`,
      },
      sweeper: {
        status: this.telemetry.Sweeper.status,
        lastSweep: new Date(this.telemetry.Sweeper.lastActionTimestamp).toISOString(),
        totalClaimed: `+${this.telemetry.Sweeper.pnlAmount.toFixed(2)} tUSDC`,
      },
    };
  }

  /**
   * Returns detailed agent configurations and telemetry for cockpit.
   */
  public getDetailedSwarmState(): Record<string, any> {
    this.getSwarmStatus();
    return {
      agents: {
        volt: {
          ...this.telemetry.Volt,
          pnlAmount: this.telemetry.Volt.pnlAmount,
          tradesToday: this.telemetry.Volt.tradesToday,
          config: voltSniperAgent.voltConfig,
        },
        oracle: {
          ...this.telemetry.Oracle,
          pnlAmount: this.telemetry.Oracle.pnlAmount,
          tradesToday: this.telemetry.Oracle.tradesToday,
          config: oracleArbAgent.oracleConfig,
        },
        titan: {
          ...this.telemetry.Titan,
          pnlAmount: this.telemetry.Titan.pnlAmount,
          tradesToday: this.telemetry.Titan.tradesToday,
          config: titanMMAgent.titanConfig,
        },
        sweeper: {
          ...this.telemetry.Sweeper,
          pnlAmount: this.telemetry.Sweeper.pnlAmount,
          tradesToday: this.telemetry.Sweeper.tradesToday,
        },
      },
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
    };
  }
}

export const swarmRunner = new MultiAgentSwarmRunner();
