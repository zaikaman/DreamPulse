import { voltSniperAgent, VoltSniperAgent } from './volt-sniper.js';
import { oracleArbAgent, OracleArbAgent } from './oracle-arb.js';
import { titanMMAgent, TitanMMAgent } from './titan-mm.js';
import { sweeperAgent, SweeperAgent } from './sweeper.js';
import { marketService } from '../services/market-service.js';
import { sessionService, type SessionRecord } from '../services/session-service.js';
import { orderService, isOnChainCircuitBroken } from '../services/order-service.js';
import { settlementService } from '../services/settlement-service.js';
import { userSwarmService } from '../services/user-swarm-service.js';
import { customAgentService } from '../services/custom-agent-service.js';
import { customAgentEvaluator } from './custom-agent-evaluator.js';
import { operatorAccount, hasOperatorGas } from '../config/somnia.js';
import { telemetryWsGateway } from '../websocket/server.js';
import type { IAgentContext, IAgentDecision } from './base-agent.js';
import type { AgentType, SwarmAgentType, SessionGrant, SwarmStatusSummary, CustomAgentDefinition } from '../types/index.js';

export interface AgentTelemetryState {
  agentType: SwarmAgentType;
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
  // Personal swarm isolated state per wallet
  private personalLastTradeTimes = new Map<string, number>(); // key: `${userAddress}:${agentType}`
  private personalLastOpportunityKeys = new Map<string, number>(); // key: `${userAddress}:${marketId}:${agentType}:${action}:${outcome}:${price}`
  // Custom deployed agents state per wallet/agent
  private customAgentLastTradeTimes = new Map<string, number>(); // key: `${agentId}`
  private customAgentLastOppKeys = new Map<string, number>(); // key: `${agentId}:${marketId}:${outcome}:${price}`

  private telemetry: Record<SwarmAgentType, AgentTelemetryState> = {
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

  private pruneStaleState(): void {
    if (this.lastOpportunityKeys.size > 500) {
      const now = Date.now();
      for (const [key, timestamp] of this.lastOpportunityKeys.entries()) {
        if (now - timestamp > 600000) {
          this.lastOpportunityKeys.delete(key);
        }
      }
    }
  }

  /**
   * Executes a single evaluation tick across all active markets for all agents.
   * Includes gas & circuit-breaker preflight so depositing STT doesn't instantly
   * unleash a storm of reverting orders that burns the fresh gas.
   */
  private async evaluateCycle(): Promise<void> {
    this.pruneStaleState();
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
    const nowMs = Date.now();
    const openMarkets = marketService.getActiveMarkets({ status: 'Open' }).filter((m) => {
      const expiryMs = new Date(m.closeTimestamp).getTime();
      return Number.isFinite(expiryMs) && expiryMs - nowMs > 20_000;
    });
    const spotTickers = marketService.getAllSpotTickers();

    // 1. Evaluate Quantitative Trading Agents (Volt, Oracle, Titan) on open order book markets
    const tradingAgents: { agent: any; type: SwarmAgentType }[] = [
      { agent: voltSniperAgent, type: 'Volt' },
      { agent: oracleArbAgent, type: 'Oracle' },
      { agent: titanMMAgent, type: 'Titan' },
    ];

    if (openMarkets.length > 0) {
      for (const { agent, type } of tradingAgents) {
        const state = this.telemetry[type];
        if (!state.isEnabled) {
          state.status = 'PAUSED';
          continue;
        }

        // Circuit breaker with self-healing cooldown (60s): auto-retry instead of permanent latch
        if (state.consecutiveErrors >= 5) {
          if (nowMs - state.lastActionTimestamp > 60000) {
            state.consecutiveErrors = 0;
            state.status = 'ACTIVE';
          } else {
            state.status = 'ERROR';
            continue;
          }
        }

        state.status = 'ACTIVE';

        // Evaluate each active market
        for (const market of openMarkets) {
          if (type === 'Titan') {
            const operatorAddr = operatorAccount.address;
            // Cross-agent swarm portfolio delta tracking: aggregate open unsettled fills across Volt, Oracle, and Titan
            const activeSwarmOrders = orderService
              .getOrders({ marketId: market.id, userAddress: operatorAddr, status: 'FILLED' })
              .filter((o) => !o.isSettled);
            const netSwarmDelta = activeSwarmOrders.reduce(
              (acc, o) => acc + (o.outcome === 'YES' ? o.lotSize : -o.lotSize),
              0,
            );
            titanMMAgent.setInventory(market.id, netSwarmDelta);
          }

          const spot = spotTickers[market.symbol] || {
            symbol: market.symbol,
            price: market.strikePrice,
            change1m: 0,
            change5m: 0,
            timestamp: Date.now(),
          };

          const rawDepth = marketService.getMarketDepth(market.id) || {
            yesBids: [{ price: market.bestBidYes || 0.49, quantity: 200, total: 98 }],
            yesAsks: [{ price: market.bestAskYes || 0.51, quantity: 200, total: 102 }],
          };

          // Sanitize order book depth for taker agents (Volt, Oracle) to prevent self-crossing against Titan's resting maker orders
          const depth = (type === 'Volt' || type === 'Oracle')
            ? orderService.sanitizeDepthForSelfTrade(rawDepth, market.id, operatorAccount.address)
            : rawDepth;

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
            // A. Don't enter another position on the same market until the current window resolves (swarm-wide single market cap)
            if (orderService.hasActivePosition(undefined, market.id)) {
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

            // Check circuit breaker before burning gas on orders
            if (isOnChainCircuitBroken()) {
              continue;
            }

            // Trigger non-blocking background authorization refresh
            sessionService.refreshOnChainAuthorizations(systemOperatorAddress).catch(() => {});

            // Fetch active on-chain-authorized copy-trade targets (personal swarm users are excluded — they run isolated strategies)
            const delegated = sessionService.getDelegatedCopyTradeSessions(systemOperatorAddress);
            const sortedDelegated = [...delegated].sort(
              (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime(),
            );
            const MAX_COPIES_PER_SIGNAL = 10;
            const eligibleCopySessions: SessionGrant[] = [];

            for (const userSession of sortedDelegated) {
              if (eligibleCopySessions.length >= MAX_COPIES_PER_SIGNAL) break;
              if (userSession.onChainAuthorized !== true || !userSession.isActive) continue;
              // Personal swarm isolation: skip copy-trade for users who customized to PERSONAL mode or disabled copy-trade
              try {
                const personalCfg = userSwarmService.getConfig(userSession.userAddress);
                if (!personalCfg.copyTradeEnabled || personalCfg.mode === 'PERSONAL') continue;
              } catch {}
              const estCost = (decision.price ?? 0.5) * (decision.lotSize ?? 1.0);
              const allowance = sessionService.validateTradeAllowance(userSession.id, estCost);
              if (!allowance.allowed) {
                console.warn(
                  `[SwarmRunner] Copy-trade skipped for ${userSession.userAddress}: ${allowance.reason}`,
                );
                continue;
              }
              eligibleCopySessions.push({
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
              });
            }

            // Execute Master Order and Copy-Traded Orders concurrently in parallel (instant placement)
            const masterOrderPromise = orderService.executeAgentDecision(decision, defaultSession).then((masterResult) => {
              if (masterResult && 'txHash' in masterResult && masterResult.txHash) {
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
              return masterResult;
            }).catch((err) => {
              console.warn(`[SwarmRunner] Master order error:`, err?.message || err);
              return null;
            });

            const copyTradePromises = eligibleCopySessions.map((sessionGrant) =>
              orderService
                .executeAgentDecision(decision, sessionGrant)
                .then((copyRes) => {
                  if (copyRes) {
                    console.log(
                      `[SwarmRunner] Instant copy-trade executed for user ${sessionGrant.userAddress} (Order: ${copyRes.id}, tx: ${copyRes.txHash || 'filled'})`,
                    );
                  }
                  return copyRes;
                })
                .catch((copyErr: any) => {
                  console.warn(`[SwarmRunner] Copy-trade skipped for user ${sessionGrant.userAddress}:`, copyErr.message);
                  return null;
                }),
            );

            // Await all orders in flight
            await Promise.allSettled([masterOrderPromise, ...copyTradePromises]);
          }
        }
      }
    }
    // 2. Autonomous Settlement Sweeper Daemon
    const sweeperState = this.telemetry['Sweeper'];
    if (!sweeperAgent.isEnabled) {
      sweeperState.status = 'PAUSED';
    } else {
      const now = Date.now();
      const lastSweepTime = this.lastTradeTimes.get('Sweeper') || 0;
      // Auto-retry cooldown: if consecutive errors occurred, retry after 60s instead of permanent freeze
      const sweepInterval = sweeperState.consecutiveErrors >= 5
        ? 60000
        : (sweeperAgent.sweeperConfig.sweepIntervalMs || 30000);

      if (now - lastSweepTime >= sweepInterval) {
        this.lastTradeTimes.set('Sweeper', now);
        sweeperState.status = 'ACTIVE';

        try {
          const startEvalTime = performance.now();
          const candidateTargets = settlementService.getCandidateSweeperTargets();
          const uniqueTargets = Array.from(new Set(candidateTargets.map((a) => a.toLowerCase()))).slice(0, 15);

          let totalClaimedAcrossUsers = 0;
          let totalMarketsClaimedAcrossUsers = 0;

          // Process targets sequentially so on-chain transfers never race against operator nonce/balance
          for (const targetAddress of uniqueTargets) {
            try {
              const unclaimed = await settlementService.scanUnclaimedSettlements(targetAddress);
              const totalUnclaimed = unclaimed.reduce((sum, u) => sum + (u.claimableAmount || 0), 0);
              if (unclaimed.length > 0 && totalUnclaimed >= sweeperAgent.sweeperConfig.minClaimableAmount) {
                const sweepResult = await settlementService.triggerBatchSweep(
                  targetAddress,
                  sweeperAgent.sweeperConfig.autoCompound,
                );
                if (sweepResult.claimedMarketsCount > 0) {
                  const claimedNum = parseFloat(sweepResult.totalClaimedAmount.replace(/[^0-9.]/g, '')) || 0;
                  console.log(
                    `[SwarmRunner] Autonomous sweep completed for ${targetAddress}: ${sweepResult.claimedMarketsCount} market(s) (${sweepResult.totalClaimedAmount}, tx: ${sweepResult.txHash})`,
                  );
                  telemetryWsGateway.broadcastAgentThought({
                    id: `exec-sweep-${Date.now()}-${targetAddress.slice(0, 6)}`,
                    agent: 'Sweeper',
                    marketId: sweepResult.sweeps[0]?.marketId || 'BATCH_CLAIM',
                    confidence: 0.99,
                    action: 'BATCH_CLAIM_PAYOUTS',
                    thought: `[AUTONOMOUS SWEEPER] Swept ${sweepResult.claimedMarketsCount} resolved market payout(s) (+${sweepResult.totalClaimedAmount}) for ${targetAddress.slice(0, 6)}...${targetAddress.slice(-4)} with 100% direct on-chain payout to user wallet.`,
                    txHash: sweepResult.txHash,
                    outcome: 'YES',
                    isExecution: true,
                    timestamp: Date.now(),
                  });
                  totalClaimedAcrossUsers += claimedNum;
                  totalMarketsClaimedAcrossUsers += sweepResult.claimedMarketsCount;
                }
              }
            } catch (userSweepErr: any) {
              console.warn(`[SwarmRunner] User sweep error for ${targetAddress}:`, userSweepErr.message);
            }
          }

          sweeperState.evalLatencyMs = Math.max(1, Math.round(performance.now() - startEvalTime));
          sweeperState.consecutiveErrors = 0;

          if (totalMarketsClaimedAcrossUsers > 0) {
            sweeperState.lastAction = 'BATCH_SWEEP';
            sweeperState.lastActionTimestamp = now;
            sweeperState.tradesToday += totalMarketsClaimedAcrossUsers;
            sweeperState.pnlAmount = Number((sweeperState.pnlAmount + totalClaimedAcrossUsers).toFixed(2));
          }
        } catch (sweeperErr: any) {
          sweeperState.consecutiveErrors++;
          console.warn('[SwarmRunner] Sweeper evaluation cycle error:', sweeperErr.message);
        }
      }
    }

    // 3. Personal Swarm Evaluation — isolated per-wallet strategy execution (non-copy mode)
    await this.evaluatePersonalSwarms(openMarkets, spotTickers);

    // 4. Custom Strategy Agents Evaluation — user-deployed AST agents (e.g. Fast EMA Momentum Rider)
    await this.evaluateCustomAgents(openMarkets, spotTickers);
  }

  private async evaluatePersonalSwarms(
    openMarkets: ReturnType<typeof marketService.getActiveMarkets>,
    spotTickers: Record<string, any>,
  ): Promise<void> {
    if (openMarkets.length === 0) return;
    if (isOnChainCircuitBroken()) return;
    let personalConfigs: ReturnType<typeof userSwarmService.getAllPersonalConfigs> = [];
    try {
      personalConfigs = userSwarmService.getAllPersonalConfigs();
    } catch {
      return;
    }
    if (personalConfigs.length === 0) return;

    // Bound concurrency: max 30 personal users per cycle to preserve 100ms loop SLA
    const slice = personalConfigs.slice(0, 30);

    for (const personal of slice) {
      const userAddr = personal.userAddress;
      // Must have active delegated session
      let session: SessionRecord | null = null;
      try {
        session = await sessionService.getUserActiveSession(userAddr);
      } catch {
        continue;
      }
      if (!session || !session.isActive || session.onChainAuthorized !== true) continue;

      const sessionGrant: SessionGrant = {
        id: session.id,
        userAddress: session.userAddress,
        operatorAddress: session.operatorAddress,
        permissions: session.permissions as any,
        maxTradeSize: session.maxTradeSize,
        dailyVolumeCap: session.dailyVolumeCap,
        spentToday: session.spentToday,
        expiresAt: session.expiresAt,
        isActive: session.isActive,
        onChainTxHash: session.onChainTxHash,
        vaultDepositAmount: session.vaultDepositAmount,
        targetPoolAddress: session.targetPoolAddress,
        onChainAuthorized: session.onChainAuthorized,
      };

      // Per-user per-agent enabled checks
      const agentsToEval: Array<{ type: AgentType; enabled: boolean }> = [
        { type: 'Volt', enabled: personal.voltEnabled },
        { type: 'Oracle', enabled: personal.oracleEnabled },
        { type: 'Titan', enabled: personal.titanEnabled },
      ];

      for (const market of openMarkets) {
        // Per-user single-market guard: one active position per market across entire personal portfolio
        const hasPositionOnMarket = orderService.getOrders({ userAddress: userAddr, status: 'FILLED' }).some((o) => o.marketId.toLowerCase() === market.id.toLowerCase() && !o.isSettled) ||
          orderService.getOrders({ userAddress: userAddr, status: 'PENDING' }).some((o) => o.marketId.toLowerCase() === market.id.toLowerCase());
        // Use lighter check: if any unsettled fill exists for this user+market, skip
        if (hasPositionOnMarket) {
          // verify market not finalized
          const m = marketService.getMarketById(market.id);
          if (m && m.status !== 'Finalized') continue;
        }
        // Global per-user active position limit (3 concurrent)
        if (orderService.getActivePositionCount(undefined, userAddr) >= 3) break;

        for (const { type, enabled } of agentsToEval) {
          if (!enabled) continue;
          // Per-agent active position limit
          if (orderService.getActivePositionCount(type, userAddr) >= 1) continue;

          const key = `${userAddr.toLowerCase()}:${type}`;
          const now = Date.now();
          const lastTrade = this.personalLastTradeTimes.get(key) || 0;
          if (now - lastTrade < 60000) continue;

          // Prepare ephemeral agent with personal config
          let agentInstance: VoltSniperAgent | OracleArbAgent | TitanMMAgent | null = null;
          if (type === 'Volt') {
            agentInstance = new VoltSniperAgent({
              driftThreshold: personal.voltConfig.driftThreshold,
              minEdge: personal.voltConfig.minEdge,
              lotSize: personal.voltConfig.lotSize,
              maxTradeSize: personal.voltConfig.maxTradeSize ?? 20,
            });
          } else if (type === 'Oracle') {
            agentInstance = new OracleArbAgent({
              minEdge: personal.oracleConfig.minEdge,
              lotSize: personal.oracleConfig.lotSize,
              maxTradeSize: personal.oracleConfig.maxTradeSize,
            });
          } else if (type === 'Titan') {
            agentInstance = new TitanMMAgent({
              targetSpread: personal.titanConfig.targetSpread,
              inventoryAversion: personal.titanConfig.inventoryAversion,
              lotSize: personal.titanConfig.lotSize,
            });
            // Personal inventory: aggregate user's own unsettled fills on this market
            const userSwarmOrders = orderService.getOrders({ marketId: market.id, userAddress: userAddr, status: 'FILLED' }).filter((o) => !o.isSettled);
            const netDelta = userSwarmOrders.reduce((acc, o) => acc + (o.outcome === 'YES' ? o.lotSize : -o.lotSize), 0);
            (agentInstance as TitanMMAgent).setInventory(market.id, netDelta);
          }
          if (!agentInstance) continue;

          const spot = spotTickers[market.symbol] || { symbol: market.symbol, price: market.strikePrice, change1m: 0, change5m: 0, timestamp: Date.now() };
          const rawDepth = marketService.getMarketDepth(market.id) || { yesBids: [{ price: market.bestBidYes || 0.49, quantity: 200, total: 98 }], yesAsks: [{ price: market.bestAskYes || 0.51, quantity: 200, total: 102 }] };
          const depth = type === 'Volt' || type === 'Oracle' ? orderService.sanitizeDepthForSelfTrade(rawDepth, market.id, userAddr) : rawDepth;

          const context: IAgentContext = { spotTicker: spot, market, depth, activeSessions: [] };
          let decision: IAgentDecision;
          try {
            decision = await agentInstance.evaluate(context);
          } catch (e) {
            continue;
          }
          if (!decision || decision.action === 'HOLD' || decision.action === 'CANCEL_QUOTE' || decision.confidence < 0.88) continue;

          const oppKey = `${userAddr.toLowerCase()}:${market.id}:${type}:${decision.action}:${decision.targetOutcome || 'YES'}:${decision.price || 0}`;
          const lastOpp = this.personalLastOpportunityKeys.get(oppKey) || 0;
          if (now - lastOpp < 120000) continue;

          // Validate allowance before execution
          const estCost = (decision.price ?? 0.5) * (decision.lotSize ?? 1.0);
          const allowance = sessionService.validateTradeAllowance(session.id, estCost);
          if (!allowance.allowed) continue;

          this.personalLastTradeTimes.set(key, now);
          this.personalLastOpportunityKeys.set(oppKey, now);

          try {
            const result = await orderService.executeAgentDecision(decision, sessionGrant);
            if (result && 'txHash' in result && result.txHash) {
              telemetryWsGateway.broadcastAgentThought({
                id: `personal-${result.id}`,
                agent: decision.agentType,
                marketId: decision.targetMarketId,
                confidence: decision.confidence,
                action: `${decision.action}_${decision.targetOutcome || 'YES'}_PERSONAL`,
                thought: `[PERSONAL SWARM ${userAddr.slice(0, 6)}...] ${decision.rationale}`,
                txHash: result.txHash,
                price: result.price ?? decision.price,
                lotSize: result.lotSize ?? decision.lotSize,
                outcome: decision.targetOutcome || 'YES',
                isExecution: true,
                timestamp: Date.now(),
              });
            }
          } catch (err: any) {
            console.warn(`[SwarmRunner] Personal swarm error for ${userAddr} ${type}:`, err.message?.slice(0, 300));
          }
          // One trade per market per user per cycle to avoid spam
          break;
        }
      }
    }
  }

  private async evaluateCustomAgents(
    openMarkets: ReturnType<typeof marketService.getActiveMarkets>,
    spotTickers: Record<string, any>,
  ): Promise<void> {
    if (openMarkets.length === 0) return;
    if (isOnChainCircuitBroken()) return;

    let deployedAgents: CustomAgentDefinition[] = [];
    try {
      deployedAgents = await customAgentService.getActiveDeployedAgents();
    } catch {
      return;
    }
    if (deployedAgents.length === 0) return;

    // Bound concurrency: evaluate up to 20 custom agents per cycle
    const candidateAgents = deployedAgents.slice(0, 20);

    for (const agent of candidateAgents) {
      const userAddr = agent.userAddress;
      if (!userAddr || userAddr === '0x0000000000000000000000000000000000000000') continue;

      // 1. Fetch user active delegated session
      let session: SessionRecord | null = null;
      try {
        session = await sessionService.getUserActiveSession(userAddr);
      } catch {
        continue;
      }
      if (!session || !session.isActive || session.onChainAuthorized !== true) {
        continue;
      }

      // Check allowance remaining
      const allocated = agent.allocatedAllowance ?? 100;
      const spent = agent.spentAllowance ?? 0;
      if (allocated - spent < 1.0) continue;

      // Filter markets matching agent symbol and timeframe window
      const agentTf = (agent.timeframe || '').toLowerCase();
      let matchingMarkets = openMarkets.filter((m) => {
        const symbolMatch = m.symbol.toUpperCase() === agent.symbol.toUpperCase();
        if (!symbolMatch) return false;
        if (agentTf && agentTf !== 'all' && m.windowDuration) {
          return m.windowDuration.toLowerCase() === agentTf;
        }
        return true;
      });
      // Fallback to symbol match if no exact timeframe match is currently active
      if (matchingMarkets.length === 0) {
        matchingMarkets = openMarkets.filter(
          (m) => m.symbol.toUpperCase() === agent.symbol.toUpperCase()
        );
      }
      if (matchingMarkets.length === 0) continue;

      const sessionGrant: SessionGrant = {
        id: session.id,
        userAddress: session.userAddress,
        operatorAddress: session.operatorAddress,
        permissions: session.permissions as any,
        maxTradeSize: session.maxTradeSize,
        dailyVolumeCap: session.dailyVolumeCap,
        spentToday: session.spentToday,
        expiresAt: session.expiresAt,
        isActive: session.isActive,
        onChainTxHash: session.onChainTxHash,
        vaultDepositAmount: session.vaultDepositAmount,
        targetPoolAddress: session.targetPoolAddress,
        onChainAuthorized: session.onChainAuthorized,
      };

      for (const market of matchingMarkets) {
        // Per-user single-market position guard: avoid duplicate open positions on same market
        const hasPosition = orderService.getOrders({ userAddress: userAddr, status: 'FILLED' })
          .some((o) => o.marketId.toLowerCase() === market.id.toLowerCase() && !o.isSettled) ||
          orderService.getOrders({ userAddress: userAddr, status: 'PENDING' })
          .some((o) => o.marketId.toLowerCase() === market.id.toLowerCase());
        if (hasPosition) continue;

        // Per-agent rate limiting & cooldown:
        const now = Date.now();
        const lastTrade = this.customAgentLastTradeTimes.get(agent.id) || 0;
        const cooldownMs = (agent.rules?.risk?.cooldownMinutes || 3) * 60000;
        if (now - lastTrade < cooldownMs) continue;

        const spot = spotTickers[market.symbol] || {
          symbol: market.symbol,
          price: market.strikePrice,
          change1m: 0,
          change5m: 0,
          timestamp: Date.now(),
        };

        const rawDepth = marketService.getMarketDepth(market.id) || {
          yesBids: [{ price: market.bestBidYes || 0.49, quantity: 200, total: 98 }],
          yesAsks: [{ price: market.bestAskYes || 0.51, quantity: 200, total: 102 }],
        };

        const depth = orderService.sanitizeDepthForSelfTrade(rawDepth, market.id, userAddr);
        const context: IAgentContext = { spotTicker: spot, market, depth, activeSessions: [] };

        let decision: IAgentDecision;
        try {
          decision = await customAgentEvaluator.evaluate(agent, context, sessionGrant);
        } catch (_evalErr) {
          continue;
        }

        if (!decision || decision.action === 'HOLD' || decision.action === 'CANCEL_QUOTE' || decision.confidence < 0.85) {
          continue;
        }

        // Deduplication guard
        const oppKey = `${agent.id}:${market.id}:${decision.targetOutcome || 'YES'}:${decision.price || 0}`;
        const lastOpp = this.customAgentLastOppKeys.get(oppKey) || 0;
        if (now - lastOpp < 120000) continue;

        // Allowance check with order service
        const estCost = (decision.price ?? 0.5) * (decision.lotSize ?? 1.0);
        const allowance = sessionService.validateTradeAllowance(session.id, estCost);
        if (!allowance.allowed) continue;

        this.customAgentLastTradeTimes.set(agent.id, now);
        this.customAgentLastOppKeys.set(oppKey, now);
        customAgentEvaluator.recordTradeAttempt(agent.id, now);

        try {
          decision.customAgentId = agent.id;
          decision.customAgentName = agent.name;
          const result = await orderService.executeAgentDecision(decision, sessionGrant);
          if (result) {
            const executedCost = result.totalCost || estCost;
            await customAgentService.recordTradeFill(agent.id, executedCost);

            telemetryWsGateway.broadcastAgentThought({
              id: `custom-${result.id}`,
              agent: 'CUSTOM',
              marketId: decision.targetMarketId,
              confidence: decision.confidence,
              action: `${decision.action}_${decision.targetOutcome || 'YES'}_CUSTOM`,
              thought: `[CUSTOM AGENT: ${agent.name}] ${decision.rationale}`,
              txHash: result.txHash,
              price: result.price ?? decision.price,
              lotSize: result.lotSize ?? decision.lotSize,
              outcome: decision.targetOutcome || 'YES',
              isExecution: true,
              timestamp: Date.now(),
            });

            console.log(
              `[SwarmRunner] Custom Agent "${agent.name}" executed trade on ${market.symbol} for ${userAddr} (Order: ${result.id}, tx: ${result.txHash || 'filled'})`
            );
          }
        } catch (err: any) {
          console.warn(`[SwarmRunner] Custom Agent error for ${agent.name} (${userAddr}):`, err.message?.slice(0, 300));
        }

        // Limit to one trade per agent per cycle
        break;
      }
    }
  }

  /**
   * Toggles individual agent ON / OFF.
   */
  public toggleAgent(agentType: AgentType | string, enabled: boolean): boolean {
    if (agentType === 'Manual') return false;
    const state = this.telemetry[agentType as SwarmAgentType];
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
    const operatorAddr = operatorAccount.address;
    const agg = orderService.getSwarmAggregates(operatorAddr);
    const voltPnl = agg.voltPnl;
    const oraclePnl = agg.oraclePnl;
    const titanPnl = agg.titanPnl;

    this.telemetry.Volt.pnlAmount = voltPnl;
    this.telemetry.Oracle.pnlAmount = oraclePnl;
    this.telemetry.Titan.pnlAmount = titanPnl;

    // Total all-time fills per agent — strictly operator wallet (canonical swarm)
    this.telemetry.Volt.tradesToday = agg.voltTrades;
    this.telemetry.Oracle.tradesToday = agg.oracleTrades;
    this.telemetry.Titan.tradesToday = agg.titanTrades;

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
    return this.getSwarmStatus();
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

  // --------------------------------------------------------------------------
  // Personal Swarm: per-wallet isolated telemetry & config exposure
  // --------------------------------------------------------------------------
  public getPersonalSwarmStatus(userAddress: string): any {
    const cfg = userSwarmService.getConfig(userAddress);
    const voltPnl = orderService.getTotalRealizedPnl('Volt', userAddress);
    const oraclePnl = orderService.getTotalRealizedPnl('Oracle', userAddress);
    const titanPnl = orderService.getTotalRealizedPnl('Titan', userAddress);
    const voltFills = orderService.getOrders({ agentType: 'Volt', userAddress }).length;
    const oracleFills = orderService.getOrders({ agentType: 'Oracle', userAddress }).length;
    const titanFills = orderService.getOrders({ agentType: 'Titan', userAddress }).length;
    const sweeperSweeps = settlementService.getSweepHistory(userAddress).filter((s) => s.status === 'CONFIRMED');
    const sweeperPnl = sweeperSweeps.reduce((acc, s) => acc + (s.claimableAmount || 0), 0);
    return {
      mode: cfg.mode,
      volt: { enabled: cfg.voltEnabled, config: cfg.voltConfig, pnl: voltPnl, tradesToday: voltFills },
      oracle: { enabled: cfg.oracleEnabled, config: cfg.oracleConfig, pnl: oraclePnl, tradesToday: oracleFills },
      titan: { enabled: cfg.titanEnabled, config: cfg.titanConfig, pnl: titanPnl, tradesToday: titanFills },
      sweeper: { enabled: cfg.sweeperEnabled, pnl: sweeperPnl, sweeps: sweeperSweeps.length },
      customizedAt: cfg.customizedAt,
      isCopyMode: cfg.mode === 'COPY',
    };
  }

  public async getPersonalSwarmStatusAsync(userAddress: string): Promise<any> {
    const cfg = userSwarmService.getConfig(userAddress);
    const [voltPnl, oraclePnl, titanPnl] = await Promise.all([
      orderService.getTotalRealizedPnlAsync('Volt', userAddress),
      orderService.getTotalRealizedPnlAsync('Oracle', userAddress),
      orderService.getTotalRealizedPnlAsync('Titan', userAddress),
    ]);
    const voltFills = orderService.getOrders({ agentType: 'Volt', userAddress }).length;
    const oracleFills = orderService.getOrders({ agentType: 'Oracle', userAddress }).length;
    const titanFills = orderService.getOrders({ agentType: 'Titan', userAddress }).length;
    const sweeperSweeps = settlementService.getSweepHistory(userAddress).filter((s) => s.status === 'CONFIRMED');
    const sweeperPnl = sweeperSweeps.reduce((acc, s) => acc + (s.claimableAmount || 0), 0);
    return {
      mode: cfg.mode,
      volt: { enabled: cfg.voltEnabled, config: cfg.voltConfig, pnl: voltPnl, tradesToday: voltFills },
      oracle: { enabled: cfg.oracleEnabled, config: cfg.oracleConfig, pnl: oraclePnl, tradesToday: oracleFills },
      titan: { enabled: cfg.titanEnabled, config: cfg.titanConfig, pnl: titanPnl, tradesToday: titanFills },
      sweeper: { enabled: cfg.sweeperEnabled, pnl: sweeperPnl, sweeps: sweeperSweeps.length },
      customizedAt: cfg.customizedAt,
      isCopyMode: cfg.mode === 'COPY',
    };
  }
}

export const swarmRunner = new MultiAgentSwarmRunner();
