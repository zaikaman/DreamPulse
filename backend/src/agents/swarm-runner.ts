import { voltSniperAgent, VoltSniperAgent } from './volt-sniper.js';
import { oracleArbAgent, OracleArbAgent } from './oracle-arb.js';
import { titanMMAgent, TitanMMAgent } from './titan-mm.js';
import { sweeperAgent, SweeperAgent } from './sweeper.js';
import { marketService } from '../services/market-service.js';
import { sessionService, type SessionRecord } from '../services/session-service.js';
import { orderService, isOnChainCircuitBroken } from '../services/order-service.js';
import { settlementService } from '../services/settlement-service.js';
import { operatorAccount, hasOperatorGas } from '../config/somnia.js';
import { telemetryWsGateway } from '../websocket/server.js';
import type { IAgentContext, IAgentDecision } from './base-agent.js';
import type { AgentType, SessionGrant, SwarmStatusSummary } from '../types/index.js';

export interface AgentTelemetryState {
  agentType: AgentType;
  isEnabled: boolean;
  status: 'ACTIVE' | 'PAUSED' | 'IDLE' | 'ERROR';
  evalLatencyMs: number;
  tradesToday: number; // Total all-time fills (renamed semantics per UX request: overview shows total, not daily)
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
  private copyTradeCursor: number = 0; // Fair round-robin rotation for delegated copy-trading

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
    // Keep agent flag in sync with telemetry
    titanMMAgent.isEnabled = true;
    // Hook thought events from agents to broadcast via WebSocket debug channel with strict pacing & deduplication
    [voltSniperAgent, oracleArbAgent, titanMMAgent, sweeperAgent].forEach((agent) => {
      agent.on('thought', (thought) => {
        const now = Date.now();
        const agentType = thought.agentType as AgentType;
        const lastTime = this.lastThoughtTimes.get(agentType) || 0;
        const lastText = this.lastThoughtTexts.get(agentType) || '';

        // 1. Strict deduplication: minimum 30.0s before the same agent can broadcast the exact same reasoning text
        if (lastText === thought.reasoningText && now - lastTime < 30000) {
          return;
        }

        // 2. Strict per-agent pacing: minimum 30.0s between unexecuted debug thoughts from the same agent
        if (now - lastTime < 30000) {
          return;
        }

        // 3. Filter out generic mock fallback spam (gsk_mock 0.92) unless it contains actual calculated rationale
        if (
          thought.reasoningText.includes('Evaluated quantitative edge on Somnia Shannon CLOB') &&
          thought.confidence === 0.92
        ) {
          return;
        }

        this.lastThoughtTimes.set(agentType, now);
        this.lastThoughtTexts.set(agentType, thought.reasoningText);

        telemetryWsGateway.broadcastDebugThought({
          id: thought.id,
          agent: thought.agentType,
          marketId: thought.marketId,
          confidence: thought.confidence,
          action: thought.actionTaken,
          thought: thought.reasoningText,
          triggerEvent: thought.triggerEvent,
          metadata: thought.metadata,
          isExecution: false,
          timestamp: now,
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
   * Includes gas & circuit-breaker preflight so depositing STT doesn't instantly
   * unleash a storm of reverting orders that burns the fresh gas.
   */
  private async evaluateCycle(): Promise<void> {
    orderService.syncResolvedOrdersPnL();
    // Global circuit breaker: if recent orders reverted repeatedly, pause the whole swarm to preserve gas
    if (isOnChainCircuitBroken()) {
      return;
    }
    // If operator has no gas, skip evaluation entirely — all placements would revert anyway
    try {
      const hasGas = await hasOperatorGas();
      if (!hasGas) return;
    } catch {
      return;
    }
    const openMarkets = marketService.getActiveMarkets({ status: 'Open' });
    const spotTickers = marketService.getAllSpotTickers();

    // 1. Evaluate Quantitative Trading Agents (Volt, Oracle, Titan) on open order book markets
    const tradingAgents = [
      { agent: voltSniperAgent, type: 'Volt' as AgentType },
      { agent: oracleArbAgent, type: 'Oracle' as AgentType },
      { agent: titanMMAgent, type: 'Titan' as AgentType },
    ];

    if (openMarkets.length > 0) {
      for (const { agent, type } of tradingAgents) {
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
        for (const market of openMarkets) {
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
          const requiredConfidence = 0.88;
          if (decision && decision.action !== 'HOLD' && decision.action !== 'CANCEL_QUOTE' && decision.confidence >= requiredConfidence) {
            const now = Date.now();
            const lastTradeTime = this.lastTradeTimes.get(type) || 0;

            // 1. Conservative In-Flight Risk Control: Wait for existing trade to resolve before opening a new one
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

            // 2. Strict per-agent trading cooldown: minimum 60,000ms (60 seconds) between trade attempts
            if (now - lastTradeTime < 60000) {
              continue;
            }

            // 3. Strict opportunity deduplication: minimum 120,000ms (120 seconds) before trading the same market/direction/price
            const oppKey = `${type}:${market.id}:${decision.action}:${decision.targetOutcome || 'YES'}:${decision.price || 0}`;
            const lastOppTime = this.lastOpportunityKeys.get(oppKey) || 0;
            if (now - lastOppTime < 120000) {
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

            // Check circuit breaker before burning gas on master order
            if (isOnChainCircuitBroken()) {
              continue;
            }
            const masterResult = await orderService.executeAgentDecision(decision, defaultSession);
            if (!masterResult) {
              continue;
            }

            // Broadcast authentic on-chain execution to main stream
            if ('txHash' in masterResult && masterResult.txHash) {
              telemetryWsGateway.broadcastAgentThought({
                id: `exec-${masterResult.id}`,
                agent: decision.agentType,
                marketId: decision.targetMarketId,
                confidence: decision.confidence,
                action: decision.action + (decision.targetOutcome ? `_${decision.targetOutcome}` : ''),
                thought: decision.rationale || `Executed ${decision.action} on ${decision.targetMarketId} at ${(decision.price ?? 0).toFixed(2)}`,
                txHash: masterResult.txHash,
                price: masterResult.price ?? decision.price,
                lotSize: masterResult.lotSize ?? decision.lotSize,
                outcome: decision.targetOutcome || 'YES',
                isExecution: true,
                timestamp: Date.now(),
              });
            }

            // Autonomous Copy-Trading: only wallets that actually granted this operator on-chain
            await sessionService.refreshOnChainAuthorizations(systemOperatorAddress);
            const delegated = sessionService.getDelegatedCopyTradeSessions(systemOperatorAddress);
            if (delegated.length === 0) {
              console.warn(
                `[SwarmRunner] Master fill ${masterResult.id} has no on-chain-authorized copy-trade sessions`,
              );
              continue;
            }

            const n = delegated.length;
            const MAX_COPIES_PER_SIGNAL = 5;
            let batch: SessionRecord[];
            if (n <= MAX_COPIES_PER_SIGNAL) {
              batch = delegated;
            } else {
              const startIdx = this.copyTradeCursor % n;
              this.copyTradeCursor = (startIdx + MAX_COPIES_PER_SIGNAL) % n;
              batch = [];
              for (let i = 0; i < MAX_COPIES_PER_SIGNAL; i++) {
                batch.push(delegated[(startIdx + i) % n]);
              }
            }

            let copiesDone = 0;
            for (const userSession of batch) {
              if (copiesDone >= MAX_COPIES_PER_SIGNAL) break;
              if (isOnChainCircuitBroken()) break;
              const estCost = (decision.price ?? 0.5) * (decision.lotSize ?? 1.0);
              const allowance = sessionService.validateTradeAllowance(userSession.id, estCost);
              if (!allowance.allowed) {
                console.warn(
                  `[SwarmRunner] Copy-trade skipped for ${userSession.userAddress}: ${allowance.reason}`,
                );
                continue;
              }
              if (userSession.onChainAuthorized !== true || !userSession.isActive) {
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
                const copyRes = await orderService.executeAgentDecision(decision, sessionGrant);
                if (copyRes) {
                  copiesDone++;
                  console.log(`[SwarmRunner] Copy-trade executed for user ${userSession.userAddress} (Order: ${copyRes.id}, tx: ${copyRes.txHash || 'filled'})`);
                }
                if (copiesDone > 0 && copiesDone < batch.length) {
                  await new Promise((r) => setTimeout(r, 600));
                }
              } catch (copyErr: any) {
                console.warn(`[SwarmRunner] Copy-trade skipped for user ${userSession.userAddress}:`, copyErr.message);
              }
            }
          }
        }
      }
    }

    // 2. Autonomous Settlement Sweeper & Compounding Daemon
    const sweeperState = this.telemetry['Sweeper'];
    if (!sweeperAgent.isEnabled) {
      sweeperState.status = 'PAUSED';
    } else if (sweeperState.consecutiveErrors >= 5) {
      sweeperState.status = 'ERROR';
    } else {
      sweeperState.status = 'ACTIVE';
      const now = Date.now();
      const lastSweepTime = this.lastTradeTimes.get('Sweeper') || 0;
      const sweepInterval = sweeperAgent.sweeperConfig.sweepIntervalMs || 30000;

      if (now - lastSweepTime >= sweepInterval) {
        try {
          const startEvalTime = performance.now();
          const targetAddress = operatorAccount.address;
          const unclaimed = await settlementService.scanUnclaimedSettlements(targetAddress);
          sweeperState.evalLatencyMs = Math.max(1, Math.round(performance.now() - startEvalTime));
          sweeperState.consecutiveErrors = 0;

          const totalUnclaimed = unclaimed.reduce((sum, u) => sum + (u.claimableAmount || 0), 0);

          if (unclaimed.length > 0 && totalUnclaimed >= sweeperAgent.sweeperConfig.minClaimableAmount) {
            this.lastTradeTimes.set('Sweeper', now);
            sweeperState.lastAction = 'BATCH_SWEEP';
            sweeperState.lastActionTimestamp = now;

            const sweepResult = await settlementService.triggerBatchSweep(
              targetAddress,
              sweeperAgent.sweeperConfig.autoCompound,
            );

            if (sweepResult.claimedMarketsCount > 0) {
              const claimedNum = parseFloat(sweepResult.totalClaimedAmount.replace(/[^0-9.]/g, '')) || 0;
              sweeperState.tradesToday += sweepResult.claimedMarketsCount;
              sweeperState.pnlAmount = Number((sweeperState.pnlAmount + claimedNum).toFixed(2));

              telemetryWsGateway.broadcastAgentThought({
                id: `exec-sweep-${Date.now()}`,
                agent: 'Sweeper',
                marketId: sweepResult.sweeps[0]?.marketId || 'BATCH_CLAIM',
                confidence: 0.99,
                action: 'BATCH_CLAIM_PAYOUTS',
                thought: `[AUTONOMOUS SWEEPER] Swept ${sweepResult.claimedMarketsCount} resolved market payout(s) (+${sweepResult.totalClaimedAmount}) with 100% auto-compounding to trading capital.`,
                txHash: sweepResult.txHash,
                outcome: 'YES',
                isExecution: true,
                timestamp: Date.now(),
              });
            }
          }
        } catch (sweeperErr: any) {
          sweeperState.consecutiveErrors++;
          console.warn('[SwarmRunner] Sweeper evaluation cycle error:', sweeperErr.message);
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
   * Returns current swarm telemetry status summary with precise per-trade realized PnL.
   * `tradesToday` now represents **total all-time fills** (per product request: overview shows total, not daily).
   */
  public getSwarmStatus(): SwarmStatusSummary {
    // Fast sync path for hot loop (uses current spot); for historically accurate use getSwarmStatusAsync()
    orderService.syncResolvedOrdersPnL();

    const voltPnl = orderService.getTotalRealizedPnl('Volt');
    const oraclePnl = orderService.getTotalRealizedPnl('Oracle');
    const titanPnl = orderService.getTotalRealizedPnl('Titan');

    this.telemetry.Volt.pnlAmount = voltPnl;
    this.telemetry.Oracle.pnlAmount = oraclePnl;
    this.telemetry.Titan.pnlAmount = titanPnl;

    // Total all-time fills per agent (FILLED + PENDING that have been persisted)
    this.telemetry.Volt.tradesToday = orderService.getOrders({ agentType: 'Volt', status: 'FILLED' }).length + orderService.getOrders({ agentType: 'Volt', status: 'PENDING' }).length;
    // Fallback to all statuses if filtering returns 0 due to no FILLED yet, count total all-time
    if (this.telemetry.Volt.tradesToday === 0) this.telemetry.Volt.tradesToday = orderService.getOrders({ agentType: 'Volt' }).length;
    this.telemetry.Oracle.tradesToday = orderService.getOrders({ agentType: 'Oracle', status: 'FILLED' }).length + orderService.getOrders({ agentType: 'Oracle', status: 'PENDING' }).length;
    if (this.telemetry.Oracle.tradesToday === 0) this.telemetry.Oracle.tradesToday = orderService.getOrders({ agentType: 'Oracle' }).length;
    this.telemetry.Titan.tradesToday = orderService.getOrders({ agentType: 'Titan', status: 'FILLED' }).length + orderService.getOrders({ agentType: 'Titan', status: 'PENDING' }).length;
    if (this.telemetry.Titan.tradesToday === 0) this.telemetry.Titan.tradesToday = orderService.getOrders({ agentType: 'Titan' }).length;

    const userSweeps = settlementService.getSweepHistory(operatorAccount.address);
    const confirmedSweeps = userSweeps.filter(
      (s) => s.status === 'CONFIRMED' && s.txHash && s.txHash !== '0x0000000000000000000000000000000000000000000000000000000000000000',
    );
    const sweeperPnl = confirmedSweeps.reduce((acc, s) => acc + (s.claimableAmount || 0), 0);
    this.telemetry.Sweeper.pnlAmount = Number(sweeperPnl.toFixed(2));
    this.telemetry.Sweeper.tradesToday = confirmedSweeps.length;

    // Broadcast aggregated swarm PnL tick for realtime KPI streaming (drives StatCardsGrid without polling delay)
    try {
      telemetryWsGateway.broadcastSwarmPnl({
        volt: voltPnl,
        oracle: oraclePnl,
        titan: titanPnl,
        sweeper: sweeperPnl,
        totalSwarm: Number((voltPnl + oraclePnl + titanPnl).toFixed(2)),
        timestamp: Date.now(),
      });
    } catch {
      // Non-fatal
    }

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

  public async getSwarmStatusAsync(): Promise<SwarmStatusSummary> {
    // Single throttled sync, then parallel cached sums — was sequential + 3x blocking hist fetches (~6-9s)
    await orderService.syncResolvedOrdersPnLAsync();
    const [voltPnl, oraclePnl, titanPnl] = await Promise.all([
      orderService.getTotalRealizedPnlAsync('Volt'),
      orderService.getTotalRealizedPnlAsync('Oracle'),
      orderService.getTotalRealizedPnlAsync('Titan'),
    ]);
    this.telemetry.Volt.pnlAmount = voltPnl;
    this.telemetry.Oracle.pnlAmount = oraclePnl;
    this.telemetry.Titan.pnlAmount = titanPnl;
    this.telemetry.Volt.tradesToday = orderService.getOrders({ agentType: 'Volt', status: 'FILLED' }).length + orderService.getOrders({ agentType: 'Volt', status: 'PENDING' }).length;
    if (this.telemetry.Volt.tradesToday === 0) this.telemetry.Volt.tradesToday = orderService.getOrders({ agentType: 'Volt' }).length;
    this.telemetry.Oracle.tradesToday = orderService.getOrders({ agentType: 'Oracle', status: 'FILLED' }).length + orderService.getOrders({ agentType: 'Oracle', status: 'PENDING' }).length;
    if (this.telemetry.Oracle.tradesToday === 0) this.telemetry.Oracle.tradesToday = orderService.getOrders({ agentType: 'Oracle' }).length;
    this.telemetry.Titan.tradesToday = orderService.getOrders({ agentType: 'Titan', status: 'FILLED' }).length + orderService.getOrders({ agentType: 'Titan', status: 'PENDING' }).length;
    if (this.telemetry.Titan.tradesToday === 0) this.telemetry.Titan.tradesToday = orderService.getOrders({ agentType: 'Titan' }).length;
    const userSweeps = settlementService.getSweepHistory(operatorAccount.address);
    const confirmedSweeps = userSweeps.filter((s) => s.status === 'CONFIRMED' && s.txHash && s.txHash !== '0x0000000000000000000000000000000000000000000000000000000000000000');
    const sweeperPnl = confirmedSweeps.reduce((acc, s) => acc + (s.claimableAmount || 0), 0);
    this.telemetry.Sweeper.pnlAmount = Number(sweeperPnl.toFixed(2));
    this.telemetry.Sweeper.tradesToday = confirmedSweeps.length;
    try {
      telemetryWsGateway.broadcastSwarmPnl({ volt: voltPnl, oracle: oraclePnl, titan: titanPnl, sweeper: sweeperPnl, totalSwarm: Number((voltPnl + oraclePnl + titanPnl).toFixed(2)), timestamp: Date.now() });
    } catch {}
    const voltPrefix = voltPnl >= 0 ? '+' : '';
    const oraclePrefix = oraclePnl >= 0 ? '+' : '';
    const titanPrefix = titanPnl >= 0 ? '+' : '';
    return {
      volt: { status: this.telemetry.Volt.status, evalLatencyMs: this.telemetry.Volt.evalLatencyMs, tradesToday: this.telemetry.Volt.tradesToday, pnl: `${voltPrefix}${voltPnl.toFixed(2)} tUSDC` },
      oracle: { status: this.telemetry.Oracle.status, evalLatencyMs: this.telemetry.Oracle.evalLatencyMs, tradesToday: this.telemetry.Oracle.tradesToday, pnl: `${oraclePrefix}${oraclePnl.toFixed(2)} tUSDC` },
      titan: { status: this.telemetry.Titan.status, activeQuotes: 6, spreadCaptured: `${titanPrefix}${titanPnl.toFixed(2)} tUSDC` },
      sweeper: { status: this.telemetry.Sweeper.status, lastSweep: new Date(this.telemetry.Sweeper.lastActionTimestamp).toISOString(), totalClaimed: `+${this.telemetry.Sweeper.pnlAmount.toFixed(2)} tUSDC` },
    };
  }

  public async getDetailedSwarmStateAsync(): Promise<Record<string, any>> {
    await this.getSwarmStatusAsync();
    return {
      agents: {
        volt: { ...this.telemetry.Volt, pnlAmount: this.telemetry.Volt.pnlAmount, tradesToday: this.telemetry.Volt.tradesToday, config: voltSniperAgent.voltConfig },
        oracle: { ...this.telemetry.Oracle, pnlAmount: this.telemetry.Oracle.pnlAmount, tradesToday: this.telemetry.Oracle.tradesToday, config: oracleArbAgent.oracleConfig },
        titan: { ...this.telemetry.Titan, pnlAmount: this.telemetry.Titan.pnlAmount, tradesToday: this.telemetry.Titan.tradesToday, config: titanMMAgent.titanConfig },
        sweeper: { ...this.telemetry.Sweeper, pnlAmount: this.telemetry.Sweeper.pnlAmount, tradesToday: this.telemetry.Sweeper.tradesToday },
      },
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
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
