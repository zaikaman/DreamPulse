import { type Hex, type Address, parseAbi, getAddress, isAddress, encodeFunctionData } from 'viem';
import { supabase, isPersistenceEnabled } from '../config/supabase.js';
import { sessionService } from './session-service.js';
import { telemetryWsGateway } from '../websocket/server.js';
import { marketService } from './market-service.js';
import {
  publicClient,
  walletClient,
  somniaExchange,
  SOMNIA_ADDRESSES,
  operatorAccount,
  somniaShannonTestnet,
  getOperatorGasBalance,
  hasOperatorGas,
  MIN_OPERATOR_GAS_WEI,
  executeOperatorTx,
  executeOperatorWriteContract,
} from '../config/somnia.js';
import { ORDER_TYPE, type BinarySide, type MarketOnchain } from '@somnia-chain/markets-sdk';
import { BINARY_POOL_WRITE_ABI, OPERATOR_PERMISSIONS_REGISTRY_ABI, OPERATOR_SELECTORS, ERC20_ABI } from '../config/permissions-abi.js';
import type { IAgentDecision, OrderBookDepth, OrderBookLevel } from '../agents/base-agent.js';
import type {
  OrderExecution,
  SessionGrant,
  AgentType,
  OrderSource,
  OutcomeType,
  OrderDirection,
  OrderType,
  OrderStatus,
} from '../types/index.js';

export interface RestingMakerQuote {
  orderId: string;
  marketId: string;
  userAddress: string;
  agentType: AgentType;
  outcome: OutcomeType;
  direction: OrderDirection;
  price: number;
  lotSize: number;
  createdAt: number;
}

export interface QueryOrdersParams {
  userAddress?: string;
  agentType?: AgentType;
  marketId?: string;
  status?: OrderStatus;
  outcome?: OutcomeType;
  searchQuery?: string;
  scope?: 'SWARM' | 'MY_ORDERS' | 'ALL';
  swarmOnly?: boolean;
  source?: 'SWARM' | 'TERMINAL' | 'ALL';
  limit?: number;
  offset?: number;
}

export interface UserOrderSubmissionParams {
  userAddress: Address;
  marketId: string;
  outcome: OutcomeType;
  direction?: OrderDirection;
  orderType: 'LIMIT' | 'IOC';
  price: number;
  lotSize: number;
  txHash?: Hex;
}

const testUsdcAbi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function faucet(uint256 amount)',
]);

const erc20AllowanceAbi = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
]);

let isFauceting = false;
let faucetingPromise: Promise<void> | null = null;
let lastGasWarningTime = 0;
let lastOnChainErrorTime = 0;
let consecutiveOnChainReverts = 0;
let circuitBreakerUntil = 0;
const GAS_WARN_THROTTLE_MS = 60_000;
const ONCHAIN_ERROR_THROTTLE_MS = 10_000;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 120_000;
const poolFailureUntil = new Map<string, number>();
const POOL_FAILURE_COOLDOWN_MS = 10 * 60 * 1000; // per-pool 10m cooldown after revert to avoid gas drain on bad pools
const orderOnchainMarketCache = new Map<string, { data: MarketOnchain; expiresAt: number }>();

function parseSymbolFromRaw(raw: string): string {
  const upper = (raw || '').toUpperCase().trim();
  if (upper.includes('ETH')) return 'ETH/USD';
  if (upper.includes('BTC')) return 'BTC/USD';
  if (upper.includes('/')) return upper;
  if (upper.endsWith('USD')) return `${upper.slice(0, -3)}/USD`;
  if (upper.endsWith('USDT')) return `${upper.slice(0, -4)}/USD`;
  return 'BTC/USD';
}

/**
 * Ensures the operator wallet has sufficient TestUSDC collateral for swarm order execution.
 * Concurrent callers await the same faucet promise instead of silently skipping.
 */
export async function ensureOperatorCollateral(minCollateral: bigint = 5_000n * 1_000_000n): Promise<void> {
  if (process.env.NODE_ENV === 'test') return;
  if (faucetingPromise) return faucetingPromise;
  // Circuit breaker: if we recently hit many reverts, pause faucet attempts briefly to avoid gas burn
  if (Date.now() < circuitBreakerUntil) return;
  const task = (async () => {
    try {
      const operatorAddress = operatorAccount.address;
      const hasGas = await hasOperatorGas();
      if (!hasGas) {
        // Do not attempt faucet transaction if operator has no native STT for gas
        return;
      }

      const currentBal = await publicClient.readContract({
        address: SOMNIA_ADDRESSES.testUsdc,
        abi: testUsdcAbi,
        functionName: 'balanceOf',
        args: [operatorAddress],
      }).catch(() => 0n);

      if (currentBal < minCollateral) {
        isFauceting = true;
        console.log(`[OrderService] Operator balance (${currentBal} raw) is below required ${minCollateral} raw. Calling TestUSDC faucet...`);
        const faucetAmount = 10_000n * 1_000_000n; // 10,000 USDC
        const hash = await executeOperatorWriteContract({
          address: SOMNIA_ADDRESSES.testUsdc,
          abi: testUsdcAbi,
          functionName: 'faucet',
          args: [faucetAmount],
        });
        if (hash) {
          await publicClient.waitForTransactionReceipt({ hash, timeout: 10_000 }).catch(() => {});
          console.log(`[OrderService] Successfully funded operator wallet (${operatorAddress}) with 10,000 TestUSDC (tx: ${hash})`);
        }
        // Reset revert counter on successful funding
        consecutiveOnChainReverts = 0;
      }
    } catch (err: any) {
      console.warn(`[OrderService] Collateral faucet check notice:`, err.message);
    } finally {
      isFauceting = false;
    }
  })();
  faucetingPromise = task;
  try {
    await task;
  } finally {
    faucetingPromise = null;
  }
}

/**
 * Returns true if on-chain writes are currently circuit-broken due to repeated reverts.
 */
export function isOnChainCircuitBroken(): boolean {
  return Date.now() < circuitBreakerUntil;
}

/**
 * Records an on-chain revert for circuit breaking and throttled logging.
 * Returns true if caller should log this error (throttled), false if suppressed.
 */
function recordOnChainRevert(): boolean {
  consecutiveOnChainReverts++;
  if (consecutiveOnChainReverts >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
    console.warn(`[OrderService] Circuit breaker triggered: ${consecutiveOnChainReverts} consecutive on-chain reverts. Pausing on-chain placements for ${CIRCUIT_BREAKER_COOLDOWN_MS / 1000}s to preserve gas.`);
  }
  const now = Date.now();
  if (now - lastOnChainErrorTime > ONCHAIN_ERROR_THROTTLE_MS) {
    lastOnChainErrorTime = now;
    return true;
  }
  return false;
}

function recordOnChainSuccess(): void {
  consecutiveOnChainReverts = 0;
}

const SIDES: Record<string, BinarySide> = {
  'YES-BUY': 'BUY_YES',
  'YES-SELL': 'SELL_YES',
  'NO-BUY': 'BUY_NO',
  'NO-SELL': 'SELL_NO',
};

const BINARY_ORDER_KIND: Record<BinarySide, number> = {
  BUY_YES: 0,
  SELL_YES: 1,
  BUY_NO: 2,
  SELL_NO: 3,
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

/**
 * Snap a human value to whole step units to avoid 18-decimal / 6-decimal floating-point drifts.
 */
export function toSteps(human: number, one: bigint, step: bigint, mode: 'round' | 'floor'): bigint {
  const stepsPerOne = Number(one / step);
  const n = human * stepsPerOne;
  const steps = mode === 'round' ? Math.round(n) : Math.floor(n + 1e-9);
  return BigInt(Math.max(0, steps)) * step;
}

/**
 * Quantize order prices and lot sizes to integer grid ticks.
 */
export function quantizeOrder(
  price: number,
  size: number,
  outcome: OutcomeType,
  decimals = SOMNIA_ADDRESSES.decimals,
  tickStep = BigInt(process.env.MM_TICK || 1000),
  lotStep = BigInt(process.env.MM_LOT || 1000),
): {
  rawQuantity: bigint;
  rawPriceOwn: bigint;
  rawPriceYes: bigint;
  quantizedSize: number;
  quantizedPrice: number;
  totalCost: number;
} {
  const one = 10n ** BigInt(decimals);

  // Size snaps down to lot grid (never trade more than intended)
  const rawQuantity = toSteps(size, one, lotStep, 'floor');

  // Price snaps to tick grid
  const rawPriceOwn = toSteps(price, one, tickStep, 'round');

  // Binary complement for NO order
  const rawPriceYes = outcome === 'YES' ? rawPriceOwn : one - rawPriceOwn;

  const quantizedSize = Number(rawQuantity) / Number(one);
  const quantizedPrice = Number(rawPriceOwn) / Number(one);
  const totalCost = Number((quantizedPrice * quantizedSize).toFixed(4));

  return {
    rawQuantity,
    rawPriceOwn,
    rawPriceYes,
    quantizedSize,
    quantizedPrice,
    totalCost,
  };
}

/**
 * Checks on-chain wallet balances before sending an order to prevent burning gas on reverts.
 */
export async function assertFunded(
  onchain: MarketOnchain | null,
  outcome: OutcomeType,
  side: 'BUY' | 'SELL',
  rawPriceOwn: bigint,
  rawQuantity: bigint,
  traderAddress: Address,
  decimals = SOMNIA_ADDRESSES.decimals,
): Promise<void> {
  const one = 10n ** BigInt(decimals);
  const operatorAddress = operatorAccount.address;

  // 1. Gas verification (operator pays gas for both master and delegated executions)
  const gas = await getOperatorGasBalance();
  if (gas < MIN_OPERATOR_GAS_WEI) {
    const now = Date.now();
    if (now - lastGasWarningTime > GAS_WARN_THROTTLE_MS) {
      lastGasWarningTime = now;
      console.warn(
        `[OrderService] Operator wallet (${operatorAddress}) has low STT gas balance (${(Number(gas) / 1e18).toFixed(4)} STT). Swarm on-chain order placement paused until operator wallet is funded with STT.`,
      );
    }
    throw new Error(
      `Insufficient native STT gas balance for operator (${(Number(gas) / 1e18).toFixed(4)} STT). Minimum 0.001 STT required for gas.`,
    );
  }

  // Circuit breaker: if we are in cool-down after repeated reverts, skip preflight quickly to avoid RPC spam
  if (isOnChainCircuitBroken()) {
    throw new Error('On-chain circuit breaker active — too many recent reverts, pausing placements to preserve gas.');
  }

  if (!onchain) return;

  const isOperatorTrader = traderAddress.toLowerCase() === operatorAddress.toLowerCase();

  if (side === 'SELL') {
    const outcomeId = outcome === 'YES' ? onchain.yesId : onchain.noId;
    try {
      const targetAccount = isOperatorTrader ? traderAddress : operatorAddress;
      const held = await somniaExchange.client.getOutcomeBalance({
        outcomeToken: onchain.outcomeToken,
        account: targetAccount,
        id: outcomeId,
      });
      if (held < rawQuantity && isOperatorTrader) {
        throw new Error(
          `Insufficient ${outcome} outcome tokens to sell for ${traderAddress}: held ${held} raw, need ${rawQuantity} raw.`,
        );
      }
    } catch (err: any) {
      if (err.message?.includes('Insufficient')) throw err;
    }
  } else {
    // BUY: requires price * quantity collateral
    const need = (rawPriceOwn * rawQuantity) / one;
    if (isOperatorTrader) {
      try {
        let [wallet, vault] = await Promise.all([
          somniaExchange.client.getErc20Balance(onchain.collateral, traderAddress).catch(() => 0n),
          somniaExchange.client.getVaultBalance({
            vault: onchain.pool,
            owner: traderAddress,
            token: onchain.collateral,
          }).catch(() => 0n),
        ]);

        if (wallet + vault < need) {
          await ensureOperatorCollateral(need).catch(() => {});
        }
      } catch (err: any) {
        if (err.message?.includes('circuit breaker')) throw err;
      }
    } else {
      // Copy trader: collateral is drawn via transferFrom(traderAddress, operatorAddress, need)
      // Verify trader's TestUSDC balance and 1-click allowance to operator
      try {
        const [wallet, allowanceOperator] = await Promise.all([
          somniaExchange.client.getErc20Balance(onchain.collateral || SOMNIA_ADDRESSES.testUsdc, traderAddress).catch(() => 0n),
          publicClient.readContract({
            address: onchain.collateral || SOMNIA_ADDRESSES.testUsdc,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [traderAddress, operatorAddress],
          }).catch(() => 0n),
        ]);

        if (wallet < need) {
          throw new Error(
            `Insufficient TestUSDC balance for copy-trader ${traderAddress}: balance ${wallet} raw, need ${need} raw for ${outcome} buy.`,
          );
        }
        if (allowanceOperator < need) {
          throw new Error(
            `Insufficient TestUSDC allowance to operator (${operatorAddress}) for copy-trader ${traderAddress}: allowance ${allowanceOperator} raw, need ${need} raw. User must approve TestUSDC to operator via frontend.`,
          );
        }
      } catch (err: any) {
        if (err.message?.includes('Insufficient')) throw err;
        if (err.message?.includes('circuit breaker')) throw err;
      }
    }
  }
}

export class OrderService {
  private orders: OrderExecution[] = [];
  private orderMap = new Map<string, OrderExecution>();
  private restingMakerQuotes = new Map<string, RestingMakerQuote>();
  // --- Bounded-cache config (issue #13) ---
  private static readonly MAX_CACHE_SIZE = 5000;
  // --- Cumulative PnL fast-path cache ---
  private lastPnlSyncAt = 0;
  private pnlSyncInFlight: Promise<void> | null = null;
  private cachedPnlByKey = new Map<string, { sum: number; timestamp: number }>();
  private stateChangeListeners: Array<() => void> = [];
  private lastExecutionFailureReason: string | null = null;

  private isPersistenceEnabled(): boolean {
    return isPersistenceEnabled();
  }

  private isGenericCustomName(name?: string | null): boolean {
    if (!name || typeof name !== 'string') return true;
    const n = name.trim();
    if (n.length === 0) return true;
    const lower = n.toLowerCase();
    return lower === 'custom strategy' || lower === 'custom' || lower === 'custom agent' || lower === 'custom swarm';
  }

  private resolveCustomAgentName(agentId?: string, _symbolOrMarketId?: string): string | undefined {
    // Truthful resolution: only map known starter template IDs that are actually persisted as templates.
    // Never synthesize a name from symbol — that was hallucinating "RSI Oversold" for any BTC order even when that agent was not deployed.
    if (agentId === '00000000-0000-0000-0000-000000000001') return 'RSI Oversold Dip Sniper';
    if (agentId === '00000000-0000-0000-0000-000000000002') return 'Bollinger Band Exhaustion Fade';
    if (agentId === '00000000-0000-0000-0000-000000000003') return 'Fast EMA Momentum Rider';
    return undefined;
  }

  private rowToOrder(row: any): OrderExecution {
    const pnlVal = row.pnl !== null && row.pnl !== undefined ? Number(row.pnl) : 0;
    const isSettled = row.is_settled === true || (row.is_settled !== false && (row.settled_at != null || (row.pnl != null && pnlVal !== 0)));
    const isManual = row.source === 'TERMINAL' || row.agent_type === 'Manual' || row.agent_type === 'MANUAL';
    const orderSource: OrderSource = isManual ? 'TERMINAL' : ((row.source as OrderSource) || 'SWARM');
    const agentType: AgentType = isManual ? 'Manual' : ((row.agent_type as AgentType) || 'Titan');
    const customAgentId = row.custom_agent_id || undefined;
    const rawCustomName: string | undefined = row.custom_agent_name || undefined;
    const hasRealCustomName = rawCustomName && !this.isGenericCustomName(rawCustomName);
    // Only heal with starter mapping if we have a known template ID; never synthesize from symbol (was fake data)
    const healedName = hasRealCustomName
      ? rawCustomName
      : (agentType === 'CUSTOM' ? this.resolveCustomAgentName(customAgentId) : undefined);
    const customAgentName = healedName;
    return {
      id: row.id,
      userAddress: row.user_address,
      sessionId: row.session_id || undefined,
      customAgentId,
      customAgentName,
      marketId: row.market_id,
      agentType,
      source: orderSource,
      outcome: row.outcome as OutcomeType,
      direction: row.direction as OrderDirection,
      orderType: row.order_type as OrderType,
      price: Number(row.price),
      lotSize: Number(row.lot_size),
      totalCost: Number(row.total_cost),
      status: row.status as OrderStatus,
      txHash: (row.tx_hash as Hex) || undefined,
      pnl: pnlVal,
      isSettled,
      settledAt: row.settled_at || (isSettled ? row.filled_at || row.created_at : undefined),
      createdAt: row.created_at,
      filledAt: row.filled_at || undefined,
    };
  }

  /**
   * Inserts into bounded cache, evicting oldest when cap is hit.
   * Caller must have already persisted to Supabase (or is about to) — evicted rows remain in DB for history queries.
   */
  private insertIntoCache(order: OrderExecution): void {
    this.orderMap.set(order.id, order);
    this.orders.unshift(order);
    if (this.orders.length > OrderService.MAX_CACHE_SIZE) {
      const evicted = this.orders.pop();
      if (evicted) {
        this.orderMap.delete(evicted.id);
        this.restingMakerQuotes.delete(evicted.id);
      }
    }
  }

  /**
   * Registers an active resting limit maker quote placed by an agent (e.g. Titan).
   */
  public registerRestingMakerQuote(quote: RestingMakerQuote): void {
    this.restingMakerQuotes.set(quote.orderId, quote);
  }

  /**
   * Removes a resting limit maker quote by order ID.
   */
  public removeRestingMakerQuote(orderId: string): void {
    this.restingMakerQuotes.delete(orderId);
  }

  /**
   * Returns all active resting maker quotes, optionally filtered by marketId and/or userAddress.
   */
  public getRestingMakerQuotes(marketId?: string, userAddress?: string): RestingMakerQuote[] {
    const targetMarket = marketId?.toLowerCase();
    const targetAddr = userAddress?.toLowerCase();
    const now = Date.now();

    const results: RestingMakerQuote[] = [];
    for (const [id, quote] of this.restingMakerQuotes.entries()) {
      // Auto-prune quotes on finalized/expired markets
      const market = marketService.getMarketById(quote.marketId);
      if (market) {
        const closeMs = market.closeTimestamp ? new Date(market.closeTimestamp).getTime() : Number.MAX_SAFE_INTEGER;
        if (market.status === 'Finalized' || now >= closeMs) {
          this.restingMakerQuotes.delete(id);
          continue;
        }
      }

      if (targetMarket && quote.marketId.toLowerCase() !== targetMarket) continue;
      if (targetAddr && quote.userAddress.toLowerCase() !== targetAddr) continue;
      results.push(quote);
    }
    return results;
  }

  /**
   * Cleanses order book depth by subtracting the swarm's own resting maker lot sizes.
   * This prevents taker snipers (Volt / Oracle) from crossing orders against Titan's resting
   * quotes from the same operator wallet, eliminating self-trade fees and internal liquidity cannibalization.
   */
  public sanitizeDepthForSelfTrade(
    depth: OrderBookDepth,
    marketId: string,
    operatorAddress?: string,
  ): OrderBookDepth {
    if (!depth) {
      return { yesBids: [], yesAsks: [] };
    }

    const activeQuotes = this.getRestingMakerQuotes(marketId, operatorAddress);
    if (activeQuotes.length === 0) {
      return depth;
    }

    const sanitizeLadder = (
      levels: OrderBookLevel[] | undefined,
      outcome: 'YES' | 'NO',
      isAsk: boolean,
    ): OrderBookLevel[] => {
      if (!levels || levels.length === 0) return [];

      const sanitized: OrderBookLevel[] = [];
      for (const lvl of levels) {
        // Find total swarm-owned resting lot size at this tick across direct and complementary quotes
        let ownQty = 0;
        for (const q of activeQuotes) {
          if (!isAsk) {
            // Direct Bid: matching outcome and BUY direction
            if (q.outcome === outcome && q.direction === 'BUY' && Math.abs(q.price - lvl.price) < 0.005) {
              ownQty += q.lotSize;
            }
          } else {
            // Ask side: either direct SELL on this outcome OR complementary BUY on the opposite outcome at (1 - p)
            const isDirectSell = q.outcome === outcome && q.direction === 'SELL' && Math.abs(q.price - lvl.price) < 0.005;
            const isComplementaryBuy = q.outcome !== outcome && q.direction === 'BUY' && Math.abs((1.0 - q.price) - lvl.price) < 0.005;
            if (isDirectSell || isComplementaryBuy) {
              ownQty += q.lotSize;
            }
          }
        }

        const externalQty = Math.max(0, Number((lvl.quantity - ownQty).toFixed(4)));
        if (externalQty > 0.0001) {
          sanitized.push({
            price: lvl.price,
            quantity: externalQty,
            total: Number((lvl.price * externalQty).toFixed(4)),
          });
        }
      }
      return sanitized;
    };

    return {
      yesBids: sanitizeLadder(depth.yesBids, 'YES', false),
      yesAsks: sanitizeLadder(depth.yesAsks, 'YES', true),
      noBids: sanitizeLadder(depth.noBids, 'NO', false),
      noAsks: sanitizeLadder(depth.noAsks, 'NO', true),
    };
  }

  public onStateChange(listener: () => void): () => void {
    this.stateChangeListeners.push(listener);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter((l) => l !== listener);
    };
  }

  public notifyStateChange(): void {
    this.cachedPnlByKey.clear();
    for (const listener of this.stateChangeListeners) {
      try {
        listener();
      } catch {}
    }
  }

  public readonly initPromise: Promise<void>;
  private lastOnChainReconcileTime: number = 0;

  constructor() {
    this.initPromise = this.initializeFromDb().catch((err) => {
      console.warn('[OrderService] DB load warning (using in-memory store):', err.message);
    });
    ensureOperatorCollateral().catch((err: any) => {
      console.warn('[OrderService] Initial operator funding check notice:', err.message);
    });
  }

  /**
   * Loads recent orders from Supabase on startup.
   */
  private async initializeFromDb(): Promise<void> {
    this.orders = [];
    this.orderMap.clear();

    // Paginated fetch to bypass PostgREST max_rows=1000 (fixes #14: previously only 1000 of 5000 were loaded, causing arena vs cockpit divergence)
    const allRows: any[] = [];
    const pageSize = 1000;
    for (let offset = 0; offset < OrderService.MAX_CACHE_SIZE; offset += pageSize) {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) {
        if (allRows.length === 0) {
          this.seedInitialOrders();
          return;
        }
        break;
      }
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < pageSize) break;
    }

    if (allRows.length === 0) {
      this.seedInitialOrders();
      return;
    }

    for (const row of allRows) {
      // Exclude test mock tx artifacts
      if (row.tx_hash === '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef') {
        continue;
      }
      const order = this.rowToOrder(row);
      this.orderMap.set(order.id, order);
      this.orders.push(order);
    }

    // Hydrate missing market snapshots from DB so old orders (without snapshot) can still settle to accurate PnL even if market evicted from memory
    await this.hydrateMarketSnapshotsFromDb().catch(() => {});

    // Authoritative on-chain healing: verify all on-chain hex orders against actual smart contract settlements
    await this.reconcileSettledOrdersWithOnChain().catch(() => {});

    // Reconcile remaining unsettled orders whose market expired
    await this.syncResolvedOrdersPnLAsync({ force: true }).catch(() => {});

    // Start periodic background settlement sync (every 3 seconds) for real-time order lifecycle & resolution
    if (process.env.NODE_ENV !== 'test') {
      setInterval(() => {
        void this.syncResolvedOrdersPnLAsync().catch(() => {});
      }, 3000);
    }
  }

  private async hydrateMarketSnapshotsFromDb(): Promise<void> {
    if (!this.isPersistenceEnabled()) return;
    try {
      const snapshotMissing = this.orders.filter((o) => !o.marketSnapshot);
      if (snapshotMissing.length === 0) return;
      const uniqueMarketIds = [...new Set(snapshotMissing.map((o) => o.marketId))].slice(0, 100);
      if (uniqueMarketIds.length === 0) return;
      const { data: markets, error } = await supabase.from('markets').select('id, symbol, strike_price, close_timestamp, settlement_price, winning_outcome, window_duration').in('id', uniqueMarketIds);
      if (error || !markets) return;
      const marketMap = new Map(markets.map((m: any) => [m.id, m]));
      for (const order of snapshotMissing) {
        const m = marketMap.get(order.marketId);
        if (m) {
          order.marketSnapshot = {
            symbol: m.symbol,
            strikePrice: Number(m.strike_price),
            closeTimestamp: m.close_timestamp,
            settlementPrice: m.settlement_price ? Number(m.settlement_price) : undefined,
            winningOutcome: m.winning_outcome as OutcomeType | undefined,
            windowDuration: m.window_duration,
          };
        } else if (order.marketId.includes('-')) {
          const parts = order.marketId.split('-');
          if (parts.length >= 5) {
            const rawSymbol = parts[1];
            const symbol = parseSymbolFromRaw(rawSymbol);
            const strikePrice = Number(parts[3]);
            const closeTimeMs = Number(parts[4]);
            const windowDuration = parts[2]?.endsWith('m') || parts[2]?.endsWith('h') || parts[2]?.endsWith('d') ? parts[2] : '5m';
            if (!isNaN(strikePrice) && !isNaN(closeTimeMs)) {
              order.marketSnapshot = {
                symbol,
                strikePrice,
                closeTimestamp: new Date(closeTimeMs).toISOString(),
                windowDuration,
              };
            }
          }
        }
      }
    } catch {}
  }

  /**
   * Cleans initial state when database is empty.
   */
  private seedInitialOrders(): void {
    this.orders = [];
    this.orderMap.clear();
  }

  /**
   * Executes an authorized agent decision with quantized ticks/lots and on-chain submission.
   */
  public async executeAgentDecision(
    decision: IAgentDecision,
    session: SessionGrant,
    source: OrderSource = 'SWARM',
  ): Promise<OrderExecution | null> {
    this.lastExecutionFailureReason = null;
    if (decision.action === 'HOLD' || decision.action === 'CANCEL_QUOTE') {
      return null;
    }

    const outcome: OutcomeType = (decision.targetOutcome as OutcomeType) || 'YES';
    const direction: OrderDirection = decision.action === 'TAKER_SELL' ? 'SELL' : 'BUY';
    const rawPrice = decision.price ?? 0.5;
    const rawLotSize = decision.lotSize ?? 1.0;

    // Integer tick and lot quantization
    const {
      rawQuantity,
      rawPriceOwn,
      rawPriceYes,
      quantizedSize,
      quantizedPrice,
      totalCost,
    } = quantizeOrder(rawPrice, rawLotSize, outcome);

    if (rawQuantity <= 0n) {
      this.lastExecutionFailureReason = `Requested order size ${rawLotSize} rounds to 0 lots`;
      console.warn(`[OrderService] Trade skipped: requested size ${rawLotSize} rounds to 0 lots`);
      return null;
    }

    // Validate risk guardrails against session
    const registeredSession = sessionService.getSessionById(session.id);
    if (registeredSession) {
      const riskAllowance = sessionService.validateTradeAllowance(session.id, totalCost);
      if (!riskAllowance.allowed) {
        this.lastExecutionFailureReason = `Session risk limit reached: ${riskAllowance.reason}`;
        console.warn(`[OrderService] Trade rejected: ${riskAllowance.reason}`);
        return null;
      }
    } else {
      if (!session.isActive) {
        this.lastExecutionFailureReason = 'Session is inactive. Please re-authorize your session.';
        console.warn('[OrderService] Trade rejected: Session is inactive');
        return null;
      }
      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        this.lastExecutionFailureReason = 'Session has expired. Please re-authorize your session.';
        console.warn('[OrderService] Trade rejected: Session has expired');
        return null;
      }
      if (totalCost > session.maxTradeSize) {
        this.lastExecutionFailureReason = `Trade cost ($${totalCost}) exceeds maxTradeSize ($${session.maxTradeSize})`;
        console.warn(`[OrderService] Trade rejected: Trade cost (${totalCost}) exceeds maxTradeSize (${session.maxTradeSize})`);
        return null;
      }
      if (session.spentToday + totalCost > session.dailyVolumeCap) {
        this.lastExecutionFailureReason = 'Trade cost exceeds dailyVolumeCap';
        console.warn(`[OrderService] Trade rejected: Trade cost exceeds dailyVolumeCap`);
        return null;
      }
    }

    // Resolve market and on-chain state
    let market = marketService.getMarketById(decision.targetMarketId);
    if (!market?.marketIdHex || market.marketIdHex.toLowerCase() === ZERO_ADDRESS.toLowerCase() || /^0x0+$/i.test(market.marketIdHex)) {
      const openOnChain = marketService.getActiveMarkets({ status: 'Open' }).find(
        (m) => m.symbol === (market?.symbol || decision.targetMarketId) && m.marketIdHex && !m.isSynthetic
      );
      if (openOnChain) {
        market = openOnChain;
      }
    }
    let onchain: MarketOnchain | null = null;

    if (market?.marketIdHex && market.marketIdHex.startsWith('0x')) {
      const cacheKey = market.marketIdHex.toLowerCase();
      const now = Date.now();
      const cached = orderOnchainMarketCache.get(cacheKey);
      if (cached && now < cached.expiresAt) {
        onchain = cached.data;
      } else {
        try {
          onchain = await somniaExchange.client.getMarketOnchain(market.marketIdHex as Hex);
          if (onchain) {
            orderOnchainMarketCache.set(cacheKey, { data: onchain, expiresAt: now + 2000 });
          }
        } catch {
          // Fallback for rolling markets
        }
      }
    }

    const operatorAddress = operatorAccount.address;
    const targetTrader = (session.userAddress as Address) || operatorAddress;
    const isOperatorMaster = targetTrader.toLowerCase() === operatorAddress.toLowerCase();

    // Assert pre-flight funding
    try {
      await assertFunded(onchain, outcome, direction, rawPriceOwn, rawQuantity, targetTrader);
    } catch (err: any) {
      this.lastExecutionFailureReason = err.message || 'Pre-flight funding check failed';
      if (!err.message?.includes('Insufficient native STT gas balance')) {
        console.warn(`[OrderService] Pre-flight funding check skipped trade for ${targetTrader}:`, err.message);
      }
      return null;
    }

    let txHash: Hex | undefined;
    let orderStatus: OrderStatus = 'FILLED';
    let fillsQuantity = quantizedSize;

    // Guard against synthetic/rolling fallback markets with zero marketIdHex (market 0x000...). Those have no on-chain market and always revert with no data.
    const isZeroMarketId = !market?.marketIdHex || market.marketIdHex.toLowerCase() === ZERO_ADDRESS.toLowerCase() || /^0x0+$/i.test(market.marketIdHex);
    if (isZeroMarketId && onchain) {
      // Synthetic market — do not attempt on-chain placement; would revert as placeBinaryOrder no data
      console.info(`[OrderService] Skipping synthetic market ${decision.targetMarketId} (marketIdHex zero) pool ${onchain.pool} — no on-chain binary market`);
      return null;
    }

    // Execute real on-chain transaction if on-chain market is trading
    if (onchain && onchain.status === 1 /* Trading */ && !onchain.finalized && !onchain.isResolved && !onchain.isVoided && !isZeroMarketId) {
      try {
        const sideKey = `${outcome}-${direction}`;
        const binarySide = SIDES[sideKey];
        // Per-pool cooldown: if this pool reverted recently, skip it to preserve STT
        const poolKey = onchain.pool.toLowerCase();
        const blockedUntil = poolFailureUntil.get(poolKey);
        if (blockedUntil && Date.now() < blockedUntil) {
          return null;
        }
        // Use LIMIT (0) so orders match any crossing book liquidity immediately and rest remaining, avoiding ImmediateOrCancelNoFill reverts
        const orderTypeEnum = ORDER_TYPE.LIMIT;
        const one = 10n ** BigInt(SOMNIA_ADDRESSES.decimals);
        const priceYes = outcome === 'YES' ? rawPriceOwn : one - rawPriceOwn;
        const nowSec = Math.floor(Date.now() / 1000);
        const onchainExpiry = Number(onchain.expiry || 0);

        const expiresAtSec = onchainExpiry > 0
          ? Math.min(nowSec + 300, onchainExpiry)
          : Math.floor(new Date(market!.closeTimestamp).getTime() / 1000);

        if (expiresAtSec <= nowSec + 15 || (onchainExpiry > 0 && onchainExpiry <= nowSec + 15)) {
          console.info(`[OrderService] Market ${market?.id || onchain.pool} expires in <= 15s (expiry: ${expiresAtSec}, now: ${nowSec}), skipping on-chain placement`);
          return null;
        }

        const expireTimestampNs = BigInt(expiresAtSec) * 1_000_000_000n;

        if (isOperatorMaster) {
            const placeRes = await executeOperatorTx(() =>
              somniaExchange.trader.placeOrder({
                pool: onchain.pool,
                side: binarySide,
                price: priceYes,
                quantity: rawQuantity,
                outcomeToken: onchain.outcomeToken,
                yesId: onchain.yesId,
                noId: onchain.noId,
                collateral: onchain.collateral || SOMNIA_ADDRESSES.collateral,
                orderType: orderTypeEnum,
                expireTimestampNs,
                gas: 10_000_000n,
              }),
            );

            if (placeRes?.receipt?.status === 'reverted') {
              throw new Error(`Order placement reverted on-chain (tx: ${placeRes.hash})`);
            }
            // Silent rejection: success==false with no OrderPlaced log (gotchas #8) — not a revert but also no fill
            if (placeRes && (placeRes as any).success === false) {
              console.info(`[OrderService] Operator order silently rejected (success=false) for ${onchain.pool} — no on-chain log, skipping`);
              return null;
            }

            if (placeRes?.hash) {
              txHash = placeRes.hash.startsWith('0x') ? (placeRes.hash as Hex) : (`0x${placeRes.hash}` as Hex);
              recordOnChainSuccess();
            }

            const filledRaw = (placeRes?.fills ?? []).reduce((acc, f) => acc + f.quantityFilled, 0n);
            if (placeRes?.orderId !== undefined && filledRaw < rawQuantity) {
              orderStatus = filledRaw > 0n ? 'FILLED' : 'PENDING';
              fillsQuantity = Number(filledRaw) / Number(one);
            }
          } else {
            // Copy-trade execution:
            // Collateral is pulled from user via transferFrom(targetTrader, operatorAddress, need)
            const tradeCost = (rawPriceOwn * rawQuantity) / one;
            let collateralPulled = false;

            const refundCollateralIfPulled = async () => {
              if (collateralPulled && tradeCost > 0n && process.env.NODE_ENV !== 'test') {
                try {
                  const refHash = await executeOperatorWriteContract({
                    address: SOMNIA_ADDRESSES.testUsdc,
                    abi: ERC20_ABI,
                    functionName: 'transfer',
                    args: [targetTrader, tradeCost],
                  });
                  await publicClient.waitForTransactionReceipt({ hash: refHash, timeout: 60_000 });
                  console.info(`[OrderService] Collateral of ${tradeCost} tUSDC auto-refunded to ${targetTrader} (tx: ${refHash})`);
                } catch (refErr: any) {
                  console.error(`[OrderService] CRITICAL: Collateral auto-refund to ${targetTrader} failed:`, refErr.message);
                }
              }
            };

            if (direction === 'BUY') {
              try {
                const tfHash = await executeOperatorWriteContract({
                  address: SOMNIA_ADDRESSES.testUsdc,
                  abi: ERC20_ABI,
                  functionName: 'transferFrom',
                  args: [targetTrader, operatorAddress, tradeCost],
                });
                if (tfHash) {
                  collateralPulled = true;
                }
              } catch (tfErr: any) {
                console.warn(`[OrderService] transferFrom failed for copy-trader ${targetTrader}:`, tfErr.message);
                return null;
              }
            }

            // Execute order placement via SDK
            let placeRes: any = null;
            try {
              placeRes = await executeOperatorTx(() =>
                somniaExchange.trader.placeOrder({
                  pool: onchain.pool,
                  side: binarySide,
                  price: priceYes,
                  quantity: rawQuantity,
                  outcomeToken: onchain.outcomeToken,
                  yesId: onchain.yesId,
                  noId: onchain.noId,
                  collateral: onchain.collateral || SOMNIA_ADDRESSES.collateral,
                  orderType: orderTypeEnum,
                  expireTimestampNs,
                  gas: 10_000_000n,
                }),
              );

              if (placeRes?.receipt?.status === 'reverted') {
                await refundCollateralIfPulled();
                throw new Error(`Copy-trade placement reverted on-chain (tx: ${placeRes.hash})`);
              }
              if (placeRes && (placeRes as any).success === false) {
                console.info(`[OrderService] Copy-trade order silently rejected (success=false) for ${onchain.pool} — refunding collateral`);
                await refundCollateralIfPulled();
                return null;
              }
            } catch (pErr: any) {
              await refundCollateralIfPulled();
              throw pErr;
            }

            if (placeRes?.hash) {
              txHash = placeRes.hash.startsWith('0x') ? (placeRes.hash as Hex) : (`0x${placeRes.hash}` as Hex);
              recordOnChainSuccess();
            }

            const filledRaw = ((placeRes?.fills ?? []) as Array<{ quantityFilled: bigint }>).reduce(
              (acc: bigint, f: { quantityFilled: bigint }) => acc + f.quantityFilled,
              0n,
            );
            if (placeRes?.orderId !== undefined && filledRaw < rawQuantity) {
              orderStatus = filledRaw > 0n ? 'FILLED' : 'PENDING';
              fillsQuantity = Number(filledRaw) / Number(one);
            }

            // For SELL copy-trades, return proceeds to user
            if (direction === 'SELL' && filledRaw > 0n) {
              const proceeds = (rawPriceOwn * filledRaw) / one;
              if (proceeds > 0n) {
                try {
                  await executeOperatorWriteContract({
                    address: SOMNIA_ADDRESSES.testUsdc,
                    abi: ERC20_ABI,
                    functionName: 'transfer',
                    args: [targetTrader, proceeds],
                  });
                } catch (trErr: any) {
                  console.warn(`[OrderService] Transfer proceeds failed to copy-trader ${targetTrader}:`, trErr?.message || trErr);
                }
              }
            }
          }
      } catch (err: any) {
        const msg: string = err?.message || String(err);
        this.lastExecutionFailureReason = `On-chain order placement failed: ${msg}`;
        const isAllowanceError = msg.includes('Insufficient TestUSDC allowance') || msg.includes('allowance') || msg.includes('ERC20InsufficientAllowance');
        const isCollateralError = msg.includes('Insufficient collateral') || msg.includes('ERC20InsufficientBalance') || msg.includes('insufficient balance');
        const isTimeoutError = msg.includes('Timed out while waiting') || msg.includes('timeout') || msg.includes('waitForTransactionReceipt');
        const isGasFundsError = msg.includes('insufficient funds for gas') || msg.includes('insufficient native balance') || msg.includes('exceeds balance') || msg.includes('Insufficient native STT gas balance');
        const isOutOfGasError = msg.includes('out of gas') || msg.includes('OUT_OF_GAS') || msg.includes('gas limit reached');

        if (isAllowanceError || isCollateralError) {
          this.lastExecutionFailureReason = isAllowanceError
            ? 'TestUSDC allowance to operator is required. Please re-authorize your session in the Session Modal.'
            : 'Insufficient TestUSDC balance in wallet to cover order cost.';
          console.warn(`[OrderService] Copy-trade skipped for ${targetTrader} on ${onchain?.pool}: ${msg.slice(0, 900)} — user must ensure TestUSDC balance and operator allowance via frontend.`);
          return null;
        }
        if (isTimeoutError) {
          console.warn(`[OrderService] Copy-trade receipt timeout for ${targetTrader} on ${onchain?.pool}: ${msg.slice(0, 500)} — not marking pool as failed.`);
          return null;
        }

        const shouldLog = recordOnChainRevert();
        // Per-pool cooldown only for genuine on-chain reverts where gas was burned and retry would waste more
        if (onchain?.pool) {
          poolFailureUntil.set(onchain.pool.toLowerCase(), Date.now() + POOL_FAILURE_COOLDOWN_MS);
        }
        if (msg.includes('ImmediateOrCancelNoFill')) {
          if (shouldLog) console.info(`[OrderService] IOC trade skipped: no crossing liquidity on CLOB book at tick ${quantizedPrice}`);
        } else if (isCollateralError) {
          if (shouldLog) console.warn(`[OrderService] Insufficient ERC20 collateral balance for ${targetTrader}: ${msg}`);
          if (isOperatorMaster) ensureOperatorCollateral().catch(() => {});
        } else if (isGasFundsError) {
          const now = Date.now();
          if (now - lastGasWarningTime > GAS_WARN_THROTTLE_MS) {
            lastGasWarningTime = now;
            console.warn(
              `[OrderService] Operator wallet (${operatorAddress}) has low or zero STT for gas. Fund the operator address on Somnia Shannon Testnet to enable live on-chain trades.`,
            );
          }
        } else if (isOutOfGasError) {
          if (shouldLog) console.warn(`[OrderService] Transaction ran out of gas on ${onchain?.pool}: ${msg.slice(0, 500)}`);
        } else {
          if (shouldLog) console.warn(`[OrderService] On-chain placeOrder note for ${targetTrader} on ${onchain?.pool} market ${decision.targetMarketId.slice(0, 10)}...:`, msg.slice(0, 800));
        }
      }
    }

    if (!txHash) {
      if (!this.lastExecutionFailureReason) {
        if (onchain && onchain.status !== 1) {
          const statusLabels = ['Listed', 'Trading', 'Locked', 'Settling', 'Resolved', 'Voided'];
          this.lastExecutionFailureReason = `Market is in ${statusLabels[onchain.status] || 'non-trading'} status and not accepting orders.`;
        } else {
          this.lastExecutionFailureReason = 'Order placement could not be completed on-chain. Please verify market status and try again.';
        }
      }
      return null;
    }

    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();

    const actualLotSize = fillsQuantity > 0 ? fillsQuantity : quantizedSize;
    const actualTotalCost = Number((quantizedPrice * actualLotSize).toFixed(4));

    const effectiveAgentType: AgentType = source === 'TERMINAL' ? 'Manual' : decision.agentType;

    const rawDecisionName = decision.customAgentName?.trim();
    const hasRealDecisionName = rawDecisionName && !this.isGenericCustomName(rawDecisionName);
    // Prefer real decision name supplied by evaluator (agent.name for deployed agents); only fallback to starter ID mapping, never symbol synthesis
    const resolvedCustomName = hasRealDecisionName
      ? rawDecisionName
      : (effectiveAgentType === 'CUSTOM' ? this.resolveCustomAgentName(decision.customAgentId) : undefined);

    const orderExecution: OrderExecution = {
      id: orderId,
      userAddress: session.userAddress,
      sessionId: session.id,
      customAgentId: decision.customAgentId,
      customAgentName: resolvedCustomName,
      marketId: decision.targetMarketId,
      agentType: effectiveAgentType,
      source,
      outcome,
      direction,
      orderType: decision.action === 'LIMIT_QUOTE' ? 'LIMIT' : 'IOC',
      price: quantizedPrice,
      lotSize: actualLotSize,
      totalCost: actualTotalCost,
      status: orderStatus,
      txHash,
      pnl: 0, // Realized PnL starts at 0, synchronously resolved upon market expiry
      isSettled: false,
      createdAt: now,
      filledAt: orderStatus === 'FILLED' ? now : undefined,
      marketSnapshot: market
        ? {
            symbol: market.symbol,
            strikePrice: market.strikePrice,
            closeTimestamp: market.closeTimestamp,
            settlementPrice: market.settlementPrice,
            winningOutcome: market.winningOutcome,
            windowDuration: market.windowDuration,
          }
        : undefined,
    };

    // Record spend against session now that order has executed (use actual filled cost)
    if (registeredSession) {
      await sessionService.recordTradeSpend(session.id, actualTotalCost);
    } else {
      session.spentToday = Number((session.spentToday + actualTotalCost).toFixed(4));
    }

    // Store in-memory with bounded capacity (evict oldest; history remains in Supabase for analytics/pagination)
    this.insertIntoCache(orderExecution);

    // Register resting limit quote for swarm cross-agent self-trade protection
    if (orderExecution.orderType === 'LIMIT' || decision.action === 'LIMIT_QUOTE') {
      this.registerRestingMakerQuote({
        orderId,
        marketId: decision.targetMarketId,
        userAddress: session.userAddress.toLowerCase(),
        agentType: effectiveAgentType,
        outcome,
        direction,
        price: quantizedPrice,
        lotSize: actualLotSize,
        createdAt: Date.now(),
      });
    }

    // Broadcast order fill event over WebSocket telemetry stream
    telemetryWsGateway.broadcastOrderFilled({
      userAddress: session.userAddress,
      orderId,
      marketId: decision.targetMarketId,
      agentType: effectiveAgentType,
      source,
      outcome: orderExecution.outcome,
      direction: orderExecution.direction,
      price: quantizedPrice,
      lotSize: orderExecution.lotSize,
      txHash,
    });

    this.notifyStateChange();

    // Persist to Supabase asynchronously
    if (
      this.isPersistenceEnabled() &&
      isAddress(session.userAddress) &&
      txHash !== '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    ) {
      try {
        await marketService.ensureMarketPersisted(decision.targetMarketId, market?.symbol);
        const isUuid = session.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.id);
        const insertPayload: any = {
          id: orderId,
          user_address: session.userAddress,
          session_id: isUuid ? session.id : null,
          market_id: decision.targetMarketId,
          agent_type: effectiveAgentType,
          source,
          outcome: orderExecution.outcome,
          direction: orderExecution.direction,
          order_type: orderExecution.orderType,
          price: quantizedPrice,
          lot_size: orderExecution.lotSize,
          total_cost: orderExecution.totalCost,
          status: orderStatus,
          tx_hash: txHash,
          pnl: 0,
          is_settled: false,
          created_at: now,
          filled_at: orderStatus === 'FILLED' ? now : null,
          custom_agent_id: orderExecution.customAgentId || null,
          custom_agent_name: orderExecution.customAgentName || null,
        };
        let insertRes = await supabase.from('orders').insert(insertPayload);
        if (insertRes.error) {
          const msg = insertRes.error.message || '';
          if (msg.includes('custom_agent_id') || msg.includes('custom_agent_name')) {
            // Column not yet migrated (pre-014) — retry without new columns
            const fallback = { ...insertPayload };
            delete fallback.custom_agent_id;
            delete fallback.custom_agent_name;
            if (msg.includes('is_settled')) delete (fallback as any).is_settled;
            insertRes = await supabase.from('orders').insert(fallback);
            if (insertRes.error && insertRes.error.message.includes('is_settled')) {
              delete (fallback as any).is_settled;
              await supabase.from('orders').insert(fallback);
            } else if (insertRes.error) {
              console.error('[OrderService] Supabase executeAgentDecision insert notice (fallback):', insertRes.error.message);
            }
          } else if (msg.includes('is_settled')) {
            delete (insertPayload as any).is_settled;
            await supabase.from('orders').insert(insertPayload);
          } else {
            console.error('[OrderService] Supabase executeAgentDecision insert notice:', msg);
          }
        }
      } catch (err: any) {
        console.error('[OrderService] Supabase executeAgentDecision insert exception:', err?.message || err);
      }
    }

    return orderExecution;
  }

  /**
   * Submits a direct user trade from the Trader Cockpit.
   * If client already signed via MetaMask (txHash provided), records and broadcasts the fill.
   * Otherwise, executes through the user's active session key via Somnia CLOB with zero gas for the user.
   */
  public async submitUserOrder(params: UserOrderSubmissionParams): Promise<OrderExecution> {
    const outcome = params.outcome;
    const direction = params.direction || 'BUY';
    const orderType = params.orderType;
    const rawPrice = params.price;
    const rawLotSize = params.lotSize;

    const {
      rawQuantity,
      rawPriceOwn,
      quantizedSize,
      quantizedPrice,
      totalCost,
    } = quantizeOrder(rawPrice, rawLotSize, outcome);

    if (rawQuantity <= 0n) {
      throw new Error(`Order size ${rawLotSize} rounds to 0 lots`);
    }

    // 1. If client already signed directly via MetaMask wallet
    if (params.txHash) {
      const orderId = crypto.randomUUID();
      const now = new Date().toISOString();
      const market = marketService.getMarketById(params.marketId);

      const orderExecution: OrderExecution = {
        id: orderId,
        userAddress: params.userAddress,
        sessionId: '',
        marketId: params.marketId,
        agentType: 'Manual',
        source: 'TERMINAL',
        outcome,
        direction,
        orderType,
        price: quantizedPrice,
        lotSize: quantizedSize,
        totalCost,
        status: 'FILLED',
        txHash: params.txHash,
        pnl: 0,
        isSettled: false,
        createdAt: now,
        filledAt: now,
        marketSnapshot: market
          ? {
              symbol: market.symbol,
              strikePrice: market.strikePrice,
              closeTimestamp: market.closeTimestamp,
              settlementPrice: market.settlementPrice,
              winningOutcome: market.winningOutcome,
              windowDuration: market.windowDuration,
            }
          : undefined,
      };

      this.insertIntoCache(orderExecution);

      telemetryWsGateway.broadcastOrderFilled({
        userAddress: params.userAddress,
        orderId,
        marketId: params.marketId,
        agentType: 'Manual',
        source: 'TERMINAL',
        outcome,
        direction,
        price: quantizedPrice,
        lotSize: quantizedSize,
        txHash: params.txHash,
      });

      this.notifyStateChange();

      // Persist to Supabase asynchronously
      if (this.isPersistenceEnabled()) {
        try {
          await marketService.ensureMarketPersisted(params.marketId, market?.symbol);
          const insertRes = await supabase.from('orders').insert({
            id: orderId,
            user_address: params.userAddress,
            session_id: null,
            market_id: params.marketId,
            agent_type: 'Manual',
            source: 'TERMINAL',
            outcome,
            direction,
            order_type: orderType,
            price: quantizedPrice,
            lot_size: quantizedSize,
            total_cost: totalCost,
            status: 'FILLED',
            tx_hash: params.txHash,
            pnl: 0,
            is_settled: false,
            created_at: now,
            filled_at: now,
          });
          if (insertRes.error) {
            console.error('[OrderService] Supabase submitUserOrder (direct) insert notice:', insertRes.error.message);
          }
        } catch (err: any) {
          console.error('[OrderService] Supabase submitUserOrder (direct) insert exception:', err?.message || err);
        }
      }

      return orderExecution;
    }

    // 2. Zero-gas session key execution
    const session = await sessionService.getUserActiveSession(params.userAddress);
    if (!session) {
      throw new Error(`No active session key found for address ${params.userAddress}. Please connect wallet or authorize session key.`);
    }

    if (outcome !== 'YES' && outcome !== 'NO') {
      throw new Error(`Invalid outcome '${outcome}'. Expected 'YES' or 'NO'.`);
    }

    const market = marketService.getMarketById(params.marketId);
    if (!market) {
      throw new Error(`Market '${params.marketId}' not found.`);
    }

    // Enforce market active status (30s lock removed — trading open until expiry)
    const closeTimeMs = new Date(market.closeTimestamp).getTime();
    const timeLeftSec = Math.floor((closeTimeMs - Date.now()) / 1000);
    if (market.status !== 'Open' || (!isNaN(timeLeftSec) && timeLeftSec <= 0)) {
      throw new Error(`Market ${market.symbol} is closed and resolving. Orders are no longer accepted for this round.`);
    }

    // Check risk limits directly
    const registeredSession = sessionService.getSessionById(session.id);
    if (registeredSession) {
      const riskAllowance = sessionService.validateTradeAllowance(session.id, totalCost);
      if (!riskAllowance.allowed) {
        throw new Error(`Session risk limit reached: ${riskAllowance.reason}`);
      }
    } else {
      if (!session.isActive) {
        throw new Error(`Session is inactive. Please re-authorize your session in the Session Modal.`);
      }
      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        throw new Error(`Session has expired. Please re-authorize your session in the Session Modal.`);
      }
      if (totalCost > session.maxTradeSize) {
        throw new Error(`Trade size ($${totalCost.toFixed(2)}) exceeds session single-trade limit of $${session.maxTradeSize.toFixed(2)}. Adjust size or update limits in the Session Modal.`);
      }
      if (session.spentToday + totalCost > session.dailyVolumeCap) {
        throw new Error(`Order would exceed daily volume cap of $${session.dailyVolumeCap.toFixed(2)} ($${session.spentToday.toFixed(2)} spent today).`);
      }
    }

    // Check user's on-chain TestUSDC balance and operator allowance
    const userAddress = getAddress(params.userAddress);
    const operatorAddress = operatorAccount.address;
    const one = 10n ** BigInt(SOMNIA_ADDRESSES.decimals);
    const needRaw = (rawPriceOwn * rawQuantity) / one;

    if (process.env.NODE_ENV !== 'test') {
      try {
        const [userBalanceRaw, userAllowanceRaw] = await Promise.all([
          somniaExchange.client.getErc20Balance(SOMNIA_ADDRESSES.testUsdc, userAddress).catch(() => null),
          publicClient.readContract({
            address: SOMNIA_ADDRESSES.testUsdc,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [userAddress, operatorAddress],
          }).catch(() => null),
        ]);

        if (userBalanceRaw !== null && userBalanceRaw < needRaw) {
          const balHuman = (Number(userBalanceRaw) / 1e6).toFixed(2);
          const needHuman = (Number(needRaw) / 1e6).toFixed(2);
          throw new Error(`Insufficient TestUSDC balance in wallet ($${balHuman} available, $${needHuman} needed). Please claim 1,000 TestUSDC from the faucet in the header.`);
        }

        if (userAllowanceRaw !== null && userAllowanceRaw < needRaw) {
          throw new Error(`TestUSDC allowance to operator is required for zero-gas trading. Please click 'Approve Collateral' or re-authorize your session in the Session Modal.`);
        }
      } catch (fundErr: any) {
        if (fundErr.message?.includes('Insufficient') || fundErr.message?.includes('allowance')) {
          throw fundErr;
        }
      }
    }

    const isZeroMarketId = !market?.marketIdHex || market.marketIdHex.toLowerCase() === ZERO_ADDRESS.toLowerCase() || /^0x0+$/i.test(market.marketIdHex);

    if (isZeroMarketId) {
      // Rolling market: execute inside DreamPulse CLOB engine
      sessionService.recordTradeSpend(session.id, totalCost);

      const orderId = crypto.randomUUID();
      const now = new Date().toISOString();
      const simTxHash = `0xsim_${orderId.replace(/-/g, '').slice(0, 40)}` as Hex;
      const orderExecution: OrderExecution = {
        id: orderId,
        userAddress: params.userAddress,
        sessionId: session.id,
        marketId: params.marketId,
        agentType: 'Manual',
        source: 'TERMINAL',
        outcome,
        direction,
        orderType,
        price: quantizedPrice,
        lotSize: quantizedSize,
        totalCost,
        status: 'FILLED',
        txHash: simTxHash,
        pnl: 0,
        isSettled: false,
        createdAt: now,
        filledAt: now,
        marketSnapshot: market
          ? {
              symbol: market.symbol,
              strikePrice: market.strikePrice,
              closeTimestamp: market.closeTimestamp,
              settlementPrice: market.settlementPrice,
              winningOutcome: market.winningOutcome,
              windowDuration: market.windowDuration,
            }
          : undefined,
      };

      this.insertIntoCache(orderExecution);

      telemetryWsGateway.broadcastOrderFilled({
        userAddress: params.userAddress,
        orderId,
        marketId: params.marketId,
        agentType: 'Manual',
        source: 'TERMINAL',
        outcome,
        direction,
        price: quantizedPrice,
        lotSize: quantizedSize,
        txHash: simTxHash,
      });

      this.notifyStateChange();

      if (this.isPersistenceEnabled()) {
        try {
          await marketService.ensureMarketPersisted(params.marketId, market?.symbol);
          const isUuid = session.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.id);
          const insertRes = await supabase.from('orders').insert({
            id: orderId,
            user_address: params.userAddress,
            session_id: isUuid ? session.id : null,
            market_id: params.marketId,
            agent_type: 'Manual',
            source: 'TERMINAL',
            outcome,
            direction,
            order_type: orderType,
            price: quantizedPrice,
            lot_size: quantizedSize,
            total_cost: totalCost,
            status: 'FILLED',
            tx_hash: simTxHash,
            pnl: 0,
            is_settled: false,
            created_at: now,
            filled_at: now,
          });
          if (insertRes.error) {
            console.error('[OrderService] Supabase submitUserOrder (rolling) insert notice:', insertRes.error.message);
          }
        } catch (err: any) {
          console.error('[OrderService] Supabase submitUserOrder (rolling) insert exception:', err?.message || err);
        }
      }

      return orderExecution;
    }

    const decision: IAgentDecision = {
      agentType: 'Manual',
      action: direction === 'SELL' ? 'TAKER_SELL' : (orderType === 'LIMIT' ? 'LIMIT_QUOTE' : 'TAKER_BUY'),
      targetMarketId: params.marketId,
      targetOutcome: outcome,
      price: quantizedPrice,
      lotSize: quantizedSize,
      confidence: 1.0,
      rationale: `Trader Cockpit user execution (${orderType} ${outcome}) by ${params.userAddress}`,
    };

    const executed = await this.executeAgentDecision(decision, session as unknown as SessionGrant, 'TERMINAL');
    if (!executed) {
      const reason = this.lastExecutionFailureReason || 'Order placement could not be completed on-chain. Please verify market status and try again.';
      throw new Error(reason);
    }

    return executed;
  }

  /**
   * Matches an order against compiled search criteria (0 allocations per row).
   */
  private matchesOrderCriteria(
    o: OrderExecution,
    criteria: {
      isTerminal: boolean;
      isSwarm: boolean;
      swarmOnly: boolean;
      opAddr: string;
      normalizedUser?: string;
      targetAgent?: string;
      targetMarket?: string;
      targetStatus?: OrderStatus;
      targetOutcome?: OutcomeType;
      searchQ?: string;
    },
  ): boolean {
    if (criteria.isTerminal) {
      if (o.source !== 'TERMINAL' && o.agentType !== 'Manual') return false;
    } else if (criteria.isSwarm) {
      if (o.source === 'TERMINAL' || o.agentType === 'Manual') return false;
      if (criteria.swarmOnly) {
        if (!o.userAddress || o.userAddress.toLowerCase() !== criteria.opAddr) return false;
      }
    }

    if (criteria.normalizedUser && !criteria.swarmOnly) {
      if (!o.userAddress || o.userAddress.toLowerCase() !== criteria.normalizedUser) return false;
    }

    if (criteria.targetAgent && (!o.agentType || o.agentType.toLowerCase() !== criteria.targetAgent)) {
      return false;
    }

    if (criteria.targetMarket && (!o.marketId || o.marketId.toLowerCase() !== criteria.targetMarket)) {
      return false;
    }

    if (criteria.targetStatus && o.status !== criteria.targetStatus) {
      return false;
    }

    if (criteria.targetOutcome && o.outcome !== criteria.targetOutcome) {
      return false;
    }

    if (criteria.searchQ) {
      const q = criteria.searchQ;
      const mMatch = o.marketId && o.marketId.toLowerCase().includes(q);
      const uMatch = o.userAddress && o.userAddress.toLowerCase().includes(q);
      const txMatch = o.txHash && o.txHash.toLowerCase().includes(q);
      if (!mMatch && !uMatch && !txMatch) return false;
    }

    return true;
  }

  /**
   * Retrieves filtered order executions with high-performance single-pass traversal.
   */
  public getOrders(params?: QueryOrdersParams): OrderExecution[] {
    let normalizedUser: string | undefined = undefined;
    if (params?.userAddress && !params?.swarmOnly && params?.scope !== 'SWARM') {
      try {
        if (!isAddress(params.userAddress)) return [];
        normalizedUser = getAddress(params.userAddress).toLowerCase();
      } catch {
        return [];
      }
    }

    const opAddr = (operatorAccount?.address || SOMNIA_ADDRESSES.operatorAccount).toLowerCase();
    const criteria = {
      isTerminal: params?.source === 'TERMINAL',
      isSwarm: params?.source === 'SWARM' || params?.swarmOnly || params?.scope === 'SWARM',
      swarmOnly: params?.swarmOnly || params?.scope === 'SWARM',
      opAddr,
      normalizedUser,
      targetAgent: params?.agentType ? params.agentType.toLowerCase() : undefined,
      targetMarket: params?.marketId ? params.marketId.toLowerCase() : undefined,
      targetStatus: params?.status,
      targetOutcome: params?.outcome,
      searchQ: params?.searchQuery?.trim() ? params.searchQuery.trim().toLowerCase() : undefined,
    };

    const offset = params?.offset && params.offset > 0 ? params.offset : 0;
    const limit = params?.limit && params.limit > 0 ? params.limit : undefined;
    const result: OrderExecution[] = [];
    let matchIdx = 0;

    const ordersList = this.orders;
    const len = ordersList.length;
    for (let i = 0; i < len; i++) {
      const o = ordersList[i];
      if (!this.matchesOrderCriteria(o, criteria)) continue;

      if (matchIdx >= offset) {
        result.push(o);
        if (limit !== undefined && result.length >= limit) {
          break;
        }
      }
      matchIdx++;
    }

    return result;
  }

  /**
   * Fetches orders from Supabase with the same filter semantics as getOrders.
   * Used as history fallback when in-memory cache has been truncated at MAX_CACHE_SIZE.
   */
  public async fetchOrdersFromDb(params?: QueryOrdersParams & { page?: number; pageSize?: number }): Promise<{ orders: OrderExecution[]; total: number }> {
    if (!this.isPersistenceEnabled()) return { orders: [], total: 0 };
    try {
      const pageSize = params?.pageSize || params?.limit || 1000;
      const page = params?.page || 1;
      const offset = params?.offset ?? (page - 1) * pageSize;
      let query = supabase.from('orders').select('*', { count: 'exact' }).order('created_at', { ascending: false });

      // Use eq on checksummed addresses for index-friendly lookups (functional lower() index backs RLS)
      if (params?.userAddress && isAddress(params.userAddress)) {
        try {
          query = query.eq('user_address', getAddress(params.userAddress));
        } catch {}
      }
      if (params?.agentType) query = query.eq('agent_type', params.agentType);
      if (params?.marketId) query = query.eq('market_id', params.marketId);
      if (params?.status) query = query.eq('status', params.status);
      if (params?.outcome) query = query.eq('outcome', params.outcome);
      // source filter maps to agent_type/source columns; handle via eq/in where possible
      if (params?.source === 'TERMINAL') {
        // TERMINAL = source TERMINAL OR agent_type Manual; Supabase OR filter
        query = query.or('source.eq.TERMINAL,agent_type.eq.Manual,agent_type.eq.MANUAL');
      } else if (params?.source === 'SWARM' || params?.swarmOnly || params?.scope === 'SWARM') {
        query = query.neq('source', 'TERMINAL').neq('agent_type', 'Manual');
        if (params?.swarmOnly || params?.scope === 'SWARM') {
          const opAddr = getAddress(operatorAccount.address);
          query = query.eq('user_address', opAddr);
        }
      }
      if (params?.searchQuery && params.searchQuery.trim()) {
        const q = params.searchQuery.trim().replace(/%/g, '').replace(/,/g, '');
        // PostgREST ilike search across market_id/tx_hash/user_address via or
        query = query.or(`market_id.ilike.%${q}%,tx_hash.ilike.%${q}%,user_address.ilike.%${q}%`);
      }

      // When caller wants all (limit undefined), paginate in 1000-row chunks up to 10k for analytics safety
      if (params?.limit === undefined && params?.pageSize === undefined && params?.offset === undefined) {
        const all: OrderExecution[] = [];
        let total = 0;
        const chunkSize = 1000;
        let from = 0;
        for (let iter = 0; iter < 10; iter++) {
          const { data, count, error } = await query.range(from, from + chunkSize - 1);
          if (error || !data) break;
          if (iter === 0 && count !== null) total = count;
          const mapped = data.filter((r: any) => r.tx_hash !== '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef').map((r: any) => this.rowToOrder(r));
          all.push(...mapped);
          if (data.length < chunkSize) break;
          from += chunkSize;
          if (all.length >= (count ?? 0)) break;
        }
        return { orders: all, total: total || all.length };
      }

      const { data, count, error } = await query.range(offset, offset + pageSize - 1);
      if (error || !data) return { orders: [], total: 0 };
      const mapped = data.filter((r: any) => r.tx_hash !== '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef').map((r: any) => this.rowToOrder(r));
      return { orders: mapped, total: count ?? mapped.length };
    } catch {
      return { orders: [], total: 0 };
    }
  }

  /**
   * Hybrid getOrders: returns in-memory if complete, otherwise merges Supabase history when cache is capped.
   * For analytics (limit undefined) this ensures evicted rows are included via DB fallback.
   */
  public async getOrdersAsync(params?: QueryOrdersParams): Promise<OrderExecution[]> {
    const mem = this.getOrders(params);
    // If cache is not at cap, in-memory is authoritative (all rows fit)
    if (this.orders.length < OrderService.MAX_CACHE_SIZE || !this.isPersistenceEnabled()) {
      return mem;
    }
    // Cache is capped — there may be evicted history. Fetch from DB and merge deduplicated.
    // Optimization: if mem already satisfies a bounded limit with offset, skip DB unless mem appears truncated
    const needsTotal = params?.limit === undefined;
    if (!needsTotal && mem.length < (params?.limit ?? 50)) {
      // Small page that fits in cache; assume cache covers recent pages 1-2. For deeper offsets, query DB.
      const offset = params?.offset ?? 0;
      if (offset + (params?.limit ?? 0) <= this.orders.length) return mem;
    }
    try {
      const { orders: dbOrders } = await this.fetchOrdersFromDb(params);
      if (dbOrders.length === 0) return mem;
      // Merge: prefer mem entries (most recent) but include db-only older rows
      const seen = new Set(mem.map((o) => o.id));
      const merged = [...mem];
      for (const o of dbOrders) {
        if (!seen.has(o.id)) {
          merged.push(o);
          seen.add(o.id);
        }
      }
      // Re-apply sort by createdAt desc for consistent pagination
      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      // Re-apply limit/offset if needed (fetchOrdersFromDb already did, but merge may have more)
      if (params?.limit !== undefined || params?.offset !== undefined) {
        const off = params?.offset ?? 0;
        const lim = params?.limit ?? merged.length;
        return merged.slice(off, off + lim);
      }
      return merged;
    } catch {
      return mem;
    }
  }

  /**
   * Retrieves all orders for a specific custom agent, querying Supabase directly by custom_agent_id
   * and merging with in-memory cache to ensure no trades are missed across timeframes.
   */
  public async getOrdersForCustomAgent(agentId: string, userAddress?: string, sinceMs?: number): Promise<OrderExecution[]> {
    const cleanUser = userAddress?.toLowerCase();
    const memOrders = this.orders.filter((o) => {
      if (o.customAgentId === agentId) return true;
      if (o.sessionId === agentId) return true;
      if (cleanUser && o.agentType === 'CUSTOM' && o.userAddress?.toLowerCase() === cleanUser) {
        return true;
      }
      return false;
    });

    const seenIds = new Set(memOrders.map((o) => o.id));
    const merged = [...memOrders];

    if (this.isPersistenceEnabled()) {
      try {
        let query = supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (agentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId)) {
          query = query.or(`custom_agent_id.eq.${agentId},session_id.eq.${agentId}`);
        } else if (cleanUser && isAddress(cleanUser)) {
          query = query.eq('user_address', getAddress(cleanUser)).eq('agent_type', 'CUSTOM');
        }
        if (sinceMs && sinceMs > 0) {
          query = query.gte('created_at', new Date(sinceMs).toISOString());
        }
        const { data, error } = await query.limit(1000);
        if (!error && Array.isArray(data)) {
          for (const row of data) {
            if (row.tx_hash === '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef') continue;
            const mapped = this.rowToOrder(row);
            if (!seenIds.has(mapped.id)) {
              merged.push(mapped);
              seenIds.add(mapped.id);
            }
          }
        }
      } catch {}
    }

    if (sinceMs && sinceMs > 0) {
      return merged.filter((o) => {
        const ts = o.settledAt ? new Date(o.settledAt).getTime() : new Date(o.createdAt).getTime();
        return ts >= sinceMs;
      });
    }

    return merged;
  }


  /**
   * Async paginated query that is DB-aware when cache is truncated.
   * Use for API/history; sync queryOrdersPaginated remains for hot-path callers.
   */
  public async queryOrdersPaginatedAsync(params?: {
    userAddress?: string;
    agentType?: AgentType;
    status?: OrderStatus;
    outcome?: OutcomeType;
    marketId?: string;
    searchQuery?: string;
    scope?: 'SWARM' | 'MY_ORDERS' | 'ALL';
    swarmOnly?: boolean;
    source?: 'SWARM' | 'TERMINAL' | 'ALL';
    limit?: number;
    page?: number;
    pageSize?: number;
  }): Promise<{ orders: OrderExecution[]; total: number; totalFills: number; totalVolume: number; page: number; pageSize: number; totalPages: number }> {
    const pageSize = params?.pageSize || params?.limit || 50;
    const page = Math.max(1, params?.page || 1);
    const useDb = this.orders.length >= OrderService.MAX_CACHE_SIZE && this.isPersistenceEnabled();
    if (!useDb) {
      return this.queryOrdersPaginated(params);
    }
    // DB-aware path: fetch accurate total count from Supabase
    const dbParams: any = { ...params, page, pageSize };
    const { orders, total } = await this.fetchOrdersFromDb(dbParams);
    // Also fetch fills/volume via a lightweight extra query if needed — approximate from fetched page + memory if DB count small
    // For accurate aggregates we fetch a separate count of fills if total is large; otherwise compute from allOrders merge
    let totalFills = 0;
    let totalVolume = 0;
    if (total <= 2000) {
      const { orders: allForAgg } = await this.fetchOrdersFromDb({ ...params, limit: undefined } as any);
      const fills = allForAgg.filter((o) => o.status === 'FILLED');
      totalFills = fills.length;
      totalVolume = Number(fills.reduce((s, o) => s + (o.totalCost || 0), 0).toFixed(4));
    } else {
      // For huge histories avoid full scan; estimate from fetched page and known syncResolved aggregates via getTotalRealizedPnl not volume
      const fills = orders.filter((o) => o.status === 'FILLED');
      // Fallback: compute totalFills via separate count query on Supabase
      try {
        let q = supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'FILLED');
        if (params?.userAddress && isAddress(params.userAddress)) q = q.eq('user_address', getAddress(params.userAddress));
        const { count } = await q;
        totalFills = count ?? fills.length;
      } catch {
        totalFills = fills.length;
      }
      totalVolume = Number(fills.reduce((s, o) => s + (o.totalCost || 0), 0).toFixed(4));
    }
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return { orders, total, totalFills, totalVolume, page, pageSize, totalPages };
  }

  /**
   * Calculates exact statistics (total fills and executed volume) for the given filter parameters.
   */
  public getOrderStats(params?: Omit<QueryOrdersParams, 'limit' | 'offset'>): {
    totalCount: number;
    totalFills: number;
    totalVolume: number;
  } {
    let normalizedUser: string | undefined = undefined;
    if (params?.userAddress && !params?.swarmOnly && params?.scope !== 'SWARM') {
      try {
        if (!isAddress(params.userAddress)) return { totalCount: 0, totalFills: 0, totalVolume: 0 };
        normalizedUser = getAddress(params.userAddress).toLowerCase();
      } catch {
        return { totalCount: 0, totalFills: 0, totalVolume: 0 };
      }
    }

    const opAddr = (operatorAccount?.address || SOMNIA_ADDRESSES.operatorAccount).toLowerCase();
    const criteria = {
      isTerminal: params?.source === 'TERMINAL',
      isSwarm: params?.source === 'SWARM' || params?.swarmOnly || params?.scope === 'SWARM',
      swarmOnly: params?.swarmOnly || params?.scope === 'SWARM',
      opAddr,
      normalizedUser,
      targetAgent: params?.agentType ? params.agentType.toLowerCase() : undefined,
      targetMarket: params?.marketId ? params.marketId.toLowerCase() : undefined,
      targetStatus: params?.status,
      targetOutcome: params?.outcome,
      searchQ: params?.searchQuery?.trim() ? params.searchQuery.trim().toLowerCase() : undefined,
    };

    let totalCount = 0;
    let totalFills = 0;
    let totalVolume = 0;

    const ordersList = this.orders;
    const len = ordersList.length;
    for (let i = 0; i < len; i++) {
      const o = ordersList[i];
      if (!this.matchesOrderCriteria(o, criteria)) continue;
      totalCount++;
      if (o.status === 'FILLED') {
        totalFills++;
        totalVolume += (o.totalCost || 0);
      }
    }

    return {
      totalCount,
      totalFills,
      totalVolume: Number(totalVolume.toFixed(4)),
    };
  }

  /**
   * Queries orders with pagination metadata and accurate totals in a single high-performance traversal.
   */
  public queryOrdersPaginated(params?: {
    userAddress?: string;
    agentType?: AgentType;
    status?: OrderStatus;
    outcome?: OutcomeType;
    marketId?: string;
    searchQuery?: string;
    scope?: 'SWARM' | 'MY_ORDERS' | 'ALL';
    swarmOnly?: boolean;
    source?: 'SWARM' | 'TERMINAL' | 'ALL';
    limit?: number;
    page?: number;
    pageSize?: number;
  }): {
    orders: OrderExecution[];
    total: number;
    totalFills: number;
    totalVolume: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } {
    const pageSize = params?.pageSize || params?.limit || 50;
    const page = Math.max(1, params?.page || 1);

    let normalizedUser: string | undefined = undefined;
    if (params?.userAddress && !params?.swarmOnly && params?.scope !== 'SWARM') {
      try {
        if (!isAddress(params.userAddress)) {
          return { orders: [], total: 0, totalFills: 0, totalVolume: 0, page: 1, pageSize, totalPages: 1 };
        }
        normalizedUser = getAddress(params.userAddress).toLowerCase();
      } catch {
        return { orders: [], total: 0, totalFills: 0, totalVolume: 0, page: 1, pageSize, totalPages: 1 };
      }
    }

    const opAddr = (operatorAccount?.address || SOMNIA_ADDRESSES.operatorAccount).toLowerCase();
    const criteria = {
      isTerminal: params?.source === 'TERMINAL',
      isSwarm: params?.source === 'SWARM' || params?.swarmOnly || params?.scope === 'SWARM',
      swarmOnly: params?.swarmOnly || params?.scope === 'SWARM',
      opAddr,
      normalizedUser,
      targetAgent: params?.agentType ? params.agentType.toLowerCase() : undefined,
      targetMarket: params?.marketId ? params.marketId.toLowerCase() : undefined,
      targetStatus: params?.status,
      targetOutcome: params?.outcome,
      searchQ: params?.searchQuery?.trim() ? params.searchQuery.trim().toLowerCase() : undefined,
    };

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedOrders: OrderExecution[] = [];
    let totalCount = 0;
    let totalFills = 0;
    let totalVolume = 0;

    const ordersList = this.orders;
    const len = ordersList.length;
    for (let i = 0; i < len; i++) {
      const o = ordersList[i];
      if (!this.matchesOrderCriteria(o, criteria)) continue;

      if (totalCount >= startIndex && totalCount < endIndex) {
        paginatedOrders.push(o);
      }
      totalCount++;

      if (o.status === 'FILLED') {
        totalFills++;
        totalVolume += (o.totalCost || 0);
      }
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    return {
      orders: paginatedOrders,
      total: totalCount,
      totalFills,
      totalVolume: Number(totalVolume.toFixed(4)),
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Retrieves single order by ID.
   */
  public getOrderById(id: string): OrderExecution | null {
    return this.orderMap.get(id) || null;
  }

  public async getOrderByIdAsync(id: string): Promise<OrderExecution | null> {
    const mem = this.orderMap.get(id);
    if (mem) return mem;
    if (!this.isPersistenceEnabled()) return null;
    try {
      const { data } = await supabase.from('orders').select('*').eq('id', id).limit(1).single();
      if (!data) return null;
      const order = this.rowToOrder(data);
      // Warm cache for future sync access
      this.orderMap.set(order.id, order);
      return order;
    } catch {
      return null;
    }
  }

  /**
   * Checks if an agent has an active in-flight trade on a specific market (or any market)
   * that has not yet reached resolution / finalization.
   */
  public hasActivePosition(agentType?: AgentType, marketId?: string): boolean {
    const now = Date.now();
    return this.orders.some((o) => {
      if (agentType && o.agentType !== agentType) return false;
      if (o.status !== 'FILLED' && o.status !== 'PENDING') return false;
      if (marketId && o.marketId.toLowerCase() !== marketId.toLowerCase()) return false;

      const market = marketService.getMarketById(o.marketId);
      if (!market) return false;
      if (market.status === 'Finalized') return false;
      const closeMs = market.closeTimestamp ? new Date(market.closeTimestamp).getTime() : Number.MAX_SAFE_INTEGER;
      const resolveMs = market.resolutionTimestamp ? new Date(market.resolutionTimestamp).getTime() : closeMs;
      const expiryMs = Math.min(closeMs, resolveMs);
      return now < expiryMs;
    });
  }

  /**
   * Returns count of active in-flight positions across the portfolio or for a given agent/user.
   */
  public getActivePositionCount(agentType?: AgentType, userAddress?: string): number {
    const now = Date.now();
    return this.orders.filter((o) => {
      if (agentType && o.agentType !== agentType) return false;
      if (userAddress && o.userAddress && o.userAddress.toLowerCase() !== userAddress.toLowerCase()) return false;
      if (o.status !== 'FILLED' && o.status !== 'PENDING') return false;

      const market = marketService.getMarketById(o.marketId);
      if (!market) return false;
      if (market.status === 'Finalized') return false;
      const closeMs = market.closeTimestamp ? new Date(market.closeTimestamp).getTime() : Number.MAX_SAFE_INTEGER;
      const resolveMs = market.resolutionTimestamp ? new Date(market.resolutionTimestamp).getTime() : closeMs;
      const expiryMs = Math.min(closeMs, resolveMs);
      return now < expiryMs;
    }).length;
  }

  /**
   * Authoritative, event-driven market settlement.
   * Settles all orders for the given market and persists their verified PnL to Supabase.
   */
  public async settleOrdersForMarket(
    marketId: string,
    winningOutcome: OutcomeType,
    settlementPrice?: number,
    isVoided = false,
  ): Promise<number> {
    const isVoid = isVoided || winningOutcome === 'VOID';
    const targetOrders = this.orders.filter(
      (o) => o.marketId.toLowerCase() === marketId.toLowerCase() && (o.status === 'FILLED' || o.status === 'PENDING' || !o.isSettled),
    );
    if (targetOrders.length === 0) return 0;

    const updatedEvents: Array<{ orderId: string; marketId: string; pnl: number; outcome: string; winningOutcome: string }> = [];
    const dbUpdates: Array<Promise<any>> = [];
    const nowIso = new Date().toISOString();

    for (const order of targetOrders) {
      const isBuy = order.direction === 'BUY';
      const entryCost = Number((order.price * order.lotSize).toFixed(4));
      let newPnl: number;
      if (isVoid) {
        const payoutVoid = 0.5 * order.lotSize;
        newPnl = isBuy ? Number((payoutVoid - entryCost).toFixed(2)) : Number((entryCost - payoutVoid).toFixed(2));
      } else {
        const payout = order.outcome === winningOutcome ? order.lotSize * 1.0 : 0;
        newPnl = isBuy ? Number((payout - entryCost).toFixed(2)) : Number((entryCost - payout).toFixed(2));
      }

      const pnlChanged = Math.abs((order.pnl || 0) - newPnl) > 0.001;
      const statusChanged = !order.isSettled || order.status === 'PENDING';

      if (!pnlChanged && !statusChanged) {
        continue;
      }

      order.pnl = newPnl;
      order.isSettled = true;
      order.settledAt = order.settledAt || nowIso;
      if (order.status === 'PENDING') order.status = 'FILLED';

      updatedEvents.push({
        orderId: order.id,
        marketId: order.marketId,
        pnl: order.pnl,
        outcome: order.outcome,
        winningOutcome: isVoid ? 'VOID' : winningOutcome,
      });

      // Synchronize realized PnL to originating custom agent (fixes #14 — previously only syncResolvedOrdersPnLAsync updated custom_agents)
      if (order.agentType === 'CUSTOM' && order.userAddress) {
        const isWinForAgent = (order.pnl || 0) > 0;
        void (async () => {
          try {
            const { customAgentService } = await import('./custom-agent-service.js');
            let targetAgentId = order.customAgentId;
            if (!targetAgentId) {
              const market = marketService.getMarketById(order.marketId);
              const symbol = market?.symbol || order.marketSnapshot?.symbol || '';
              const window = market?.windowDuration || order.marketSnapshot?.windowDuration || '';
              const agent = await customAgentService.findAgentForUserAndSymbol(order.userAddress, symbol, window);
              targetAgentId = agent?.id;
            }
            if (targetAgentId) {
              await customAgentService.recordTradeSettlement(targetAgentId, order.pnl || 0, isWinForAgent);
            }
          } catch {}
        })();
      }

      if (this.isPersistenceEnabled()) {
        dbUpdates.push(
          (async () => {
            try {
              const res = await supabase
                .from('orders')
                .update({
                  pnl: order.pnl,
                  status: order.status,
                  is_settled: true,
                  settled_at: order.settledAt,
                })
                .eq('id', order.id);
              if (res.error && res.error.message.includes('is_settled')) {
                await supabase.from('orders').update({ pnl: order.pnl, status: order.status }).eq('id', order.id);
              }
            } catch {}
          })(),
        );
      }
    }

    if (this.isPersistenceEnabled() && dbUpdates.length > 0) {
      await Promise.allSettled(dbUpdates);
    }

    if (updatedEvents.length > 0) {
      // Sync pre-aggregated daily_pnl for fast analytics (issue #16)
      void this.syncDailyPnlForOrders(targetOrders.filter((o) => updatedEvents.some((e) => e.orderId === o.id))).catch(() => {});
      try {
        telemetryWsGateway.broadcastPnlUpdate({ updatedOrders: updatedEvents, timestamp: Date.now() });
        this.cachedPnlByKey.clear();
        this.broadcastSwarmTelemetry();
      } catch {}
      this.notifyStateChange();

      // Autonomously trigger instant settlement sweeps for winning users (Trade Terminal & personal swarms)
      const winningUserAddresses = new Set<string>();
      for (const order of targetOrders) {
        const isWin = isVoid || (order.outcome === winningOutcome) || ((order.pnl ?? 0) > 0);
        if (isWin && order.userAddress) {
          winningUserAddresses.add(order.userAddress);
        }
      }

      if (winningUserAddresses.size > 0) {
        void import('./settlement-service.js').then(({ settlementService }) => {
          void import('./user-swarm-service.js').then(({ userSwarmService }) => {
            for (const userAddr of winningUserAddresses) {
              const personalCfg = userSwarmService.getConfig(userAddr);
              if (personalCfg.sweeperEnabled !== false) {
                void settlementService.triggerBatchSweep(userAddr, true).catch(() => {});
              }
            }
          }).catch(() => {});
        }).catch(() => {});
      }
    }

    return updatedEvents.length;
  }

  /**
   * Scans all stored orders against on-chain Somnia prediction markets to heal any mis-settled historical orders.
   */
  public async reconcileSettledOrdersWithOnChain(): Promise<number> {
    if (process.env.NODE_ENV === 'test') return 0;
    const hexOrders = this.orders.filter(
      (o) => o.marketId.startsWith('0x') && o.marketId.length === 66,
    );
    if (hexOrders.length === 0) return 0;

    const uniqueMarketIds = [...new Set(hexOrders.map((o) => o.marketId as Hex))];
    const onchainCache = new Map<string, any>();

    const CONCURRENCY = 8;
    for (let i = 0; i < uniqueMarketIds.length; i += CONCURRENCY) {
      const batch = uniqueMarketIds.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (mktId) => {
          try {
            const onchain = await Promise.race([
              somniaExchange.client.getMarketOnchain(mktId).catch(() => null),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
            ]);
            if (onchain && (onchain.isResolved || onchain.finalized)) {
              onchainCache.set(mktId.toLowerCase(), onchain);
            }
          } catch {}
        }),
      );
    }

    let correctedCount = 0;
    const dbUpdates: Array<Promise<any>> = [];
    const nowIso = new Date().toISOString();

    for (const order of hexOrders) {
      const onchain = onchainCache.get(order.marketId.toLowerCase());
      if (!onchain) continue;

      const isVoid = onchain.isVoided;
      const onchainWinner = isVoid ? 'VOID' : (onchain.winningOutcome === 0 ? 'YES' : 'NO');
      const isBuy = order.direction === 'BUY';
      const entryCost = Number((order.price * order.lotSize).toFixed(4));
      let truePnl: number;

      if (isVoid) {
        const payoutVoid = 0.5 * order.lotSize;
        truePnl = isBuy ? Number((payoutVoid - entryCost).toFixed(2)) : Number((entryCost - payoutVoid).toFixed(2));
      } else {
        const payout = order.outcome === onchainWinner ? order.lotSize * 1.0 : 0;
        truePnl = isBuy ? Number((payout - entryCost).toFixed(2)) : Number((entryCost - payout).toFixed(2));
      }

      const needsCorrection = Math.abs((order.pnl || 0) - truePnl) > 0.001 || !order.isSettled;
      if (needsCorrection) {
        correctedCount++;
        order.pnl = truePnl;
        order.isSettled = true;
        order.settledAt = order.settledAt || nowIso;
        if (order.status === 'PENDING') order.status = 'FILLED';

        dbUpdates.push(
          (async () => {
            try {
              const res = await supabase
                .from('orders')
                .update({
                  pnl: truePnl,
                  status: order.status,
                  is_settled: true,
                  settled_at: order.settledAt,
                })
                .eq('id', order.id);
              if (res.error && res.error.message.includes('is_settled')) {
                await supabase.from('orders').update({ pnl: truePnl, status: order.status }).eq('id', order.id);
              }
            } catch {}
          })(),
        );
      }
    }

    if (correctedCount > 0) {
      await Promise.allSettled(dbUpdates);
      this.cachedPnlByKey.clear();
      this.notifyStateChange();
      console.log(`[OrderService] Reconciled and corrected ${correctedCount} orders with on-chain truth.`);
    }

    return correctedCount;
  }

  /**
   * Computes accurate realized PnL per-trade for unsettled orders whose market has expired.
   * On-chain markets (0x...) are strictly evaluated against verified contract state.
   */
  public syncResolvedOrdersPnL(options?: { force?: boolean }): void {
    void this.syncResolvedOrdersPnLAsync(options);
  }

  public async syncResolvedOrdersPnLAsync(options?: { force?: boolean }): Promise<void> {
    const now = Date.now();
    const force = options?.force === true;
    if (this.pnlSyncInFlight) {
      if (force) {
        try { await this.pnlSyncInFlight; } catch {}
      } else {
        return this.pnlSyncInFlight;
      }
    }
    if (!force && now - this.lastPnlSyncAt < 700) return;
    const doSync = async () => {
      const updatedOrderPnlEvents: Array<{ orderId: string; marketId: string; pnl: number; outcome: string; winningOutcome: string }> = [];
      // Only unsettled candidates
      const candidates = this.orders.filter(
        (o) => !o.isSettled && (o.status === 'FILLED' || o.status === 'PENDING'),
      );
      if (candidates.length === 0) {
        this.lastPnlSyncAt = Date.now();
        return;
      }
      // Collect unique historical price keys first so we can fetch in parallel for synthetic/test markets
      const histKeys = new Set<string>();
      const candidateMeta = new Map<string, { closeMs: number; symbol: string; key: string }>();
      for (const order of candidates) {
        const isHexMarket = order.marketId.startsWith('0x') && order.marketId.length === 66;
        if (isHexMarket) continue; // On-chain markets are resolved strictly on-chain

        const market = marketService.getMarketById(order.marketId);
        if (market && market.settlementPrice == null) {
          const closeMs = market.closeTimestamp ? new Date(market.closeTimestamp).getTime() : NaN;
          if (!isNaN(closeMs) && now - closeMs < 24 * 3600000 && (market.status === 'Finalized' || Math.min(closeMs, market.resolutionTimestamp ? new Date(market.resolutionTimestamp).getTime() : closeMs) <= now)) {
            const k = `${market.symbol}-${closeMs}`;
            histKeys.add(k);
            candidateMeta.set(order.id, { closeMs, symbol: market.symbol, key: k });
          }
        } else if (!market && order.marketId.includes('-')) {
          const parts = order.marketId.split('-');
          if (parts.length >= 5) {
            const rawSymbol = parts[1];
            const symbol = parseSymbolFromRaw(rawSymbol);
            const closeTimeMs = Number(parts[4]);
            if (!isNaN(closeTimeMs) && now >= closeTimeMs) {
              const k = `${symbol}-${closeTimeMs}`;
              if (!order.marketSnapshot?.settlementPrice && !order.marketSnapshot?.winningOutcome) {
                histKeys.add(k);
                candidateMeta.set(order.id, { closeMs: closeTimeMs, symbol, key: k });
              }
            }
          }
        } else if (!market && order.marketSnapshot && order.marketSnapshot.settlementPrice == null && !order.marketSnapshot.winningOutcome) {
          const snap = order.marketSnapshot;
          const closeMs = snap.closeTimestamp ? new Date(snap.closeTimestamp).getTime() : NaN;
          if (!isNaN(closeMs) && now >= closeMs) {
            const k = `${snap.symbol}-${closeMs}`;
            histKeys.add(k);
            candidateMeta.set(order.id, { closeMs, symbol: snap.symbol, key: k });
          }
        }
      }

      // Parallel fetch with 1.2s timeout per key
      const histPriceCache = new Map<string, number | null>();
      if (histKeys.size > 0) {
        let priceFeedService: any = null;
        try {
          const mod = await import('./price-feed-service.js');
          priceFeedService = mod.priceFeedService;
        } catch {}
        if (priceFeedService) {
          const fetches = Array.from(histKeys).map(async (k) => {
            const closeMs = Number(k.slice(k.lastIndexOf('-') + 1));
            const sym = k.slice(0, k.lastIndexOf('-'));
            try {
              const p = await Promise.race([
                priceFeedService.getHistoricalPriceAt(sym, closeMs),
                new Promise<null>((_, rej) => setTimeout(() => rej(new Error('hist timeout')), 1200)),
              ]);
              histPriceCache.set(k, p as number | null);
            } catch {
              histPriceCache.set(k, null);
            }
          });
          await Promise.allSettled(fetches);
        }
      }

      // Pre-fetch unique on-chain markets in parallel with cache
      const onchainMarketCache = new Map<string, any>();
      const hexMarketIds = new Set<Hex>();
      for (const order of candidates) {
        if (order.isSettled) continue;
        if (order.marketId.startsWith('0x') && order.marketId.length === 66) {
          hexMarketIds.add(order.marketId as Hex);
        }
      }

      if (hexMarketIds.size > 0 && process.env.NODE_ENV !== 'test') {
        const fetchTasks = Array.from(hexMarketIds).map(async (mId) => {
          const cached = orderOnchainMarketCache.get(mId);
          if (cached && Date.now() < cached.expiresAt) {
            onchainMarketCache.set(mId, cached.data);
            return;
          }
          try {
            const onchain = await Promise.race([
              somniaExchange.client.getMarketOnchain(mId).catch(() => null),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
            ]);
            if (onchain) {
              orderOnchainMarketCache.set(mId, { data: onchain, expiresAt: Date.now() + 15000 });
              onchainMarketCache.set(mId, onchain);
            }
          } catch {}
        });
        await Promise.allSettled(fetchTasks);
      }

      for (const order of candidates) {
        if (order.isSettled) continue;
        const market = marketService.getMarketById(order.marketId);
        let shouldResolve = false;
        let winningOutcome: OutcomeType | undefined;
        let settlementPrice: number | undefined;
        let isVoided = false;
        const isOnChainHexMarket = order.marketId.startsWith('0x') && order.marketId.length === 66;

        if (isOnChainHexMarket && process.env.NODE_ENV !== 'test') {
          try {
            const onchain = onchainMarketCache.get(order.marketId);
            if (onchain && (onchain.isResolved || onchain.finalized || onchain.status === 4 || onchain.status === 5)) {
              shouldResolve = true;
              if (onchain.isVoided || onchain.status === 5) {
                winningOutcome = 'VOID';
                isVoided = true;
              } else {
                winningOutcome = onchain.winningOutcome === 0 ? 'YES' : 'NO';
              }
            }
          } catch {}

          // STRICT INVARIANT: If not yet resolved on-chain, skip and leave order pending!
          if (!shouldResolve) {
            continue;
          }
        }

        if (!shouldResolve && market && !isOnChainHexMarket) {
          const isFinalized = market.status === 'Finalized';
          const closeMs = market.closeTimestamp ? new Date(market.closeTimestamp).getTime() : Number.MAX_SAFE_INTEGER;
          const resolveMs = market.resolutionTimestamp ? new Date(market.resolutionTimestamp).getTime() : closeMs;
          const expiryMs = Math.min(closeMs, resolveMs);
          if (isFinalized || expiryMs <= now) {
            shouldResolve = true;
            if (market.settlementPrice != null) settlementPrice = market.settlementPrice;
            else if (!isNaN(closeMs) && histPriceCache.has(`${market.symbol}-${closeMs}`)) settlementPrice = histPriceCache.get(`${market.symbol}-${closeMs}`) ?? marketService.getSpotPrice(market.symbol) ?? 0;
            else settlementPrice = histPriceCache.get(candidateMeta.get(order.id)?.key ?? '') ?? marketService.getSpotPrice(market.symbol) ?? 0;
            if (market.winningOutcome === 'VOID') { winningOutcome = 'VOID'; isVoided = true; }
            else winningOutcome = market.winningOutcome || (settlementPrice >= market.strikePrice ? 'YES' : 'NO');
          }
        } else if (!shouldResolve && order.marketId.includes('-') && !isOnChainHexMarket) {
          const parts = order.marketId.split('-');
          if (parts.length >= 5) {
            const rawSymbol = parts[1];
            const symbol = parseSymbolFromRaw(rawSymbol);
            const strikePrice = Number(parts[3]);
            const closeTimeMs = Number(parts[4]);
            if (!isNaN(strikePrice) && !isNaN(closeTimeMs) && now >= closeTimeMs) {
              shouldResolve = true;
              const meta = candidateMeta.get(order.id);
              const hist = meta ? histPriceCache.get(meta.key) : undefined;
              const spot = hist ?? marketService.getSpotPrice(symbol) ?? strikePrice;
              settlementPrice = spot;
              winningOutcome = spot >= strikePrice ? 'YES' : 'NO';
            }
          }
        } else if (!shouldResolve && order.marketSnapshot && !isOnChainHexMarket) {
          const snap = order.marketSnapshot;
          const closeMs = snap.closeTimestamp ? new Date(snap.closeTimestamp).getTime() : NaN;
          if (!isNaN(closeMs) && now >= closeMs) {
            shouldResolve = true;
            if (snap.winningOutcome === 'VOID') { winningOutcome = 'VOID'; isVoided = true; }
            else if (snap.winningOutcome) winningOutcome = snap.winningOutcome;
            else if (snap.settlementPrice != null) { settlementPrice = snap.settlementPrice; winningOutcome = settlementPrice >= snap.strikePrice ? 'YES' : 'NO'; }
            else {
              const meta = candidateMeta.get(order.id);
              const hist = meta ? histPriceCache.get(meta.key) : undefined;
              const spot = hist ?? marketService.getSpotPrice(snap.symbol) ?? snap.strikePrice;
              settlementPrice = spot;
              winningOutcome = spot >= snap.strikePrice ? 'YES' : 'NO';
            }
          }
        }

        if (!shouldResolve || !winningOutcome) continue;
        const isBuy = order.direction === 'BUY';
        const entryCost = Number((order.price * order.lotSize).toFixed(4));
        let newPnl: number;
        if (isVoided || winningOutcome === 'VOID') {
          const payoutVoid = 0.5 * order.lotSize;
          newPnl = isBuy ? Number((payoutVoid - entryCost).toFixed(2)) : Number((entryCost - payoutVoid).toFixed(2));
        } else {
          const payout = order.outcome === winningOutcome ? order.lotSize * 1.0 : 0;
          newPnl = isBuy ? Number((payout - entryCost).toFixed(2)) : Number((entryCost - payout).toFixed(2));
        }

        order.pnl = newPnl;
        order.isSettled = true;
        order.settledAt = new Date().toISOString();
        this.restingMakerQuotes.delete(order.id);
        if (order.status === 'PENDING') order.status = 'FILLED';
        updatedOrderPnlEvents.push({ orderId: order.id, marketId: order.marketId, pnl: order.pnl, outcome: order.outcome, winningOutcome });
        if (this.isPersistenceEnabled()) {
          void (async () => {
            try {
              const res = await supabase.from('orders').update({
                pnl: order.pnl,
                status: order.status,
                is_settled: true,
                settled_at: order.settledAt,
              }).eq('id', order.id);
              if (res.error && res.error.message.includes('is_settled')) {
                await supabase.from('orders').update({ pnl: order.pnl, status: order.status }).eq('id', order.id);
              }
            } catch {}
          })();
        }
          // Synchronize realized PnL and win rate to matching deployed custom agent
          if (order.agentType === 'CUSTOM' && order.userAddress) {
            const isWin = (order.pnl || 0) > 0;
            void (async () => {
              try {
                const { customAgentService } = await import('./custom-agent-service.js');
                let targetAgentId = order.customAgentId;
                if (!targetAgentId) {
                  const market = marketService.getMarketById(order.marketId);
                  const symbol = market?.symbol || order.marketSnapshot?.symbol || '';
                  const window = market?.windowDuration || order.marketSnapshot?.windowDuration || '';
                  const agent = await customAgentService.findAgentForUserAndSymbol(order.userAddress, symbol, window);
                  targetAgentId = agent?.id;
                }
                if (targetAgentId) {
                  await customAgentService.recordTradeSettlement(targetAgentId, order.pnl || 0, isWin);
                }
              } catch {}
            })();
          }
        }

      if (updatedOrderPnlEvents.length > 0) {
        // Sync pre-aggregated daily_pnl for fast analytics (issue #16)
        const settledBatch = candidates.filter((c) => updatedOrderPnlEvents.some((e) => e.orderId === c.id));
        void this.syncDailyPnlForOrders(settledBatch).catch(() => {});
        try {
          telemetryWsGateway.broadcastPnlUpdate({ updatedOrders: updatedOrderPnlEvents, timestamp: Date.now() });

          this.cachedPnlByKey.clear();
          this.broadcastSwarmTelemetry();

          void import('./settlement-service.js').then((m) => m.settlementService.invalidateCache()).catch(() => {});
          void import('./analytics-service.js').then((m) => m.analyticsService.invalidateCache()).catch(() => {});

          // Autonomously trigger instant settlement sweeps for winning users (Trade Terminal & personal swarms)
          const winningUserAddresses = new Set<string>();
          for (const ev of updatedOrderPnlEvents) {
            const matched = candidates.find((c) => c.id === ev.orderId);
            if (matched && matched.userAddress && ((matched.pnl ?? 0) > 0 || ev.pnl > 0)) {
              winningUserAddresses.add(matched.userAddress);
            }
          }

          if (winningUserAddresses.size > 0) {
            void import('./settlement-service.js').then(({ settlementService }) => {
              void import('./user-swarm-service.js').then(({ userSwarmService }) => {
                for (const userAddr of winningUserAddresses) {
                  const personalCfg = userSwarmService.getConfig(userAddr);
                  if (personalCfg.sweeperEnabled !== false) {
                    void settlementService.triggerBatchSweep(userAddr, true).catch(() => {});
                  }
                }
              }).catch(() => {});
            }).catch(() => {});
          }
        } catch {}
      }

      if (now - this.lastOnChainReconcileTime > 15000) {
        this.lastOnChainReconcileTime = now;
        void this.reconcileSettledOrdersWithOnChain().catch(() => {});
      }

      this.lastPnlSyncAt = Date.now();
      this.notifyStateChange();
    };
    this.pnlSyncInFlight = doSync().finally(() => { this.pnlSyncInFlight = null; });
    return this.pnlSyncInFlight;
  }

  /**
   * Upserts pre-aggregated daily PnL rows for the given settled orders.
   * Covers issue #16: materialized daily_pnl avoids full table scans on analytics hot path.
   */
  private async syncDailyPnlForOrders(settledOrders: OrderExecution[]): Promise<void> {
    if (!this.isPersistenceEnabled() || settledOrders.length === 0) return;
    try {
      // Group by (user_address lower, source bucket, day)
      const bucket = new Map<string, { user_address: string; source: string; day: string; pnl: number; volume: number; trades: number; wins: number; losses: number }>();
      for (const o of settledOrders) {
        if (!o.userAddress || !isAddress(o.userAddress)) continue;
        const day = (o.settledAt ? new Date(o.settledAt) : new Date(o.createdAt)).toISOString().slice(0, 10);
        const userLower = getAddress(o.userAddress);
        const sources: Array<'ALL' | 'SWARM' | 'TERMINAL'> = ['ALL', (o.source === 'TERMINAL' || o.agentType === 'Manual' ? 'TERMINAL' : 'SWARM') as any];
        for (const src of sources) {
          const key = `${userLower.toLowerCase()}|${src}|${day}`;
          const entry = bucket.get(key) || { user_address: userLower, source: src, day, pnl: 0, volume: 0, trades: 0, wins: 0, losses: 0 };
          const pnl = o.pnl ?? 0;
          const isWin = (o.isSettled || pnl !== 0) && pnl > 0.01;
          const isLoss = (o.isSettled || pnl !== 0) && pnl < -0.01;
          entry.pnl += pnl;
          entry.volume += o.totalCost || 0;
          entry.trades += 1;
          if (isWin) entry.wins += 1;
          if (isLoss) entry.losses += 1;
          bucket.set(key, entry);
        }
      }
      // Upsert aggregated buckets. Need to merge with existing DB values, so fetch existing and sum correctly
      // For simplicity incremental upsert: we recompute day's true totals from current in-memory + DB for those keys via a fresh query.
      // Instead, do a precise upsert by reading current daily_pnl for those (user,day,source) and overwriting with recomputed totals from all orders for that day.
      // To avoid N queries, batch fetch existing daily_pnl for affected user/day combos
      const affectedUsers = new Set<string>();
      const affectedDays = new Set<string>();
      for (const v of bucket.values()) {
        affectedUsers.add(v.user_address.toLowerCase());
        affectedDays.add(v.day);
      }
      // Recompute authoritative totals per bucket from all orders (memory + DB fallback would be heavy; use memory which contains recent days)
      // For recent days (last 30), memory at 5000 cap is likely complete. For older days correctness is not critical for real-time equity.
      // So we can just upsert incremental deltas with on-conflict increment via RPC would be ideal; fallback: read-modify-write per bucket with retries
      for (const entry of bucket.values()) {
        try {
          // Read existing
          const { data: existing } = await supabase.from('daily_pnl').select('pnl, volume, trades, wins, losses').eq('user_address', entry.user_address).eq('source', entry.source).eq('day', entry.day).maybeSingle();
          if (existing) {
            // If already exists, we need to avoid double-counting on re-settlement; check if order already counted by comparing totals
            // Simplest: rebuild day total from all orders in memory for that user/day/source
            const dayOrders = this.orders.filter((o) => {
              if (!o.userAddress || o.userAddress.toLowerCase() !== entry.user_address.toLowerCase()) return false;
              const d = (o.settledAt ? new Date(o.settledAt) : new Date(o.createdAt)).toISOString().slice(0, 10);
              if (d !== entry.day) return false;
              const src = o.source === 'TERMINAL' || o.agentType === 'Manual' ? 'TERMINAL' : 'SWARM';
              return entry.source === 'ALL' || src === entry.source;
            });
            // Also include settledOrders that are the just-settled batch (they are already in this.orders at this point if called after insertion, but for settle path they are mutated in place)
            // Compute recomputed totals
            let rePnl = 0, reVol = 0, reTrades = 0, reWins = 0, reLosses = 0;
            for (const o of dayOrders) {
              if (!o.isSettled) continue;
              const pnl = o.pnl ?? 0;
              rePnl += pnl;
              reVol += o.totalCost || 0;
              reTrades += 1;
              if (pnl > 0.01) reWins += 1;
              else if (pnl < -0.01) reLosses += 1;
            }
            await supabase.from('daily_pnl').upsert({
              user_address: entry.user_address,
              source: entry.source,
              day: entry.day,
              pnl: Number(rePnl.toFixed(4)),
              volume: Number(reVol.toFixed(4)),
              trades: reTrades,
              wins: reWins,
              losses: reLosses,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_address,source,day' });
          } else {
            await supabase.from('daily_pnl').upsert({
              user_address: entry.user_address,
              source: entry.source,
              day: entry.day,
              pnl: Number(entry.pnl.toFixed(4)),
              volume: Number(entry.volume.toFixed(4)),
              trades: entry.trades,
              wins: entry.wins,
              losses: entry.losses,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_address,source,day' });
          }
        } catch {}
      }
    } catch {}
  }

  /**
   * Broadcasts truthful, operator-scoped swarm PnL telemetry tick to WebSocket clients.
   */
  public broadcastSwarmTelemetry(): void {
    try {
      const opAddr = (operatorAccount?.address || SOMNIA_ADDRESSES.operatorAccount).toLowerCase();
      const agg = this.getSwarmAggregates(opAddr);
      import('./settlement-service.js').then(({ settlementService }) => {
        let sweeperPnl = 0;
        try {
          const userSweeps = settlementService.getSweepHistory(opAddr);
          const confirmed = userSweeps.filter(
            (s) => s.status === 'CONFIRMED' && s.txHash && s.txHash !== '0x0000000000000000000000000000000000000000000000000000000000000000',
          );
          sweeperPnl = Number(confirmed.reduce((acc, s) => acc + (s.claimableAmount || 0), 0).toFixed(2));
        } catch {}
        telemetryWsGateway.broadcastSwarmPnl({
          volt: agg.voltPnl,
          oracle: agg.oraclePnl,
          titan: agg.titanPnl,
          sweeper: sweeperPnl,
          totalSwarm: Number((agg.voltPnl + agg.oraclePnl + agg.titanPnl).toFixed(2)),
          timestamp: Date.now(),
        });
      }).catch(() => {
        telemetryWsGateway.broadcastSwarmPnl({
          volt: agg.voltPnl,
          oracle: agg.oraclePnl,
          titan: agg.titanPnl,
          sweeper: 0,
          totalSwarm: Number((agg.voltPnl + agg.oraclePnl + agg.titanPnl).toFixed(2)),
          timestamp: Date.now(),
        });
      });
    } catch {}
  }

  /**
   * Pre-aggregates Swarm PnLs and trade fill counts in a single fast O(N) pass.
   */
  public getSwarmAggregates(operatorAddress?: string): {
    voltPnl: number;
    oraclePnl: number;
    titanPnl: number;
    voltTrades: number;
    oracleTrades: number;
    titanTrades: number;
  } {
    const opAddr = (operatorAddress || operatorAccount?.address || SOMNIA_ADDRESSES.operatorAccount).toLowerCase();
    let voltPnl = 0;
    let oraclePnl = 0;
    let titanPnl = 0;
    let voltTrades = 0;
    let oracleTrades = 0;
    let titanTrades = 0;

    const ordersList = this.orders;
    const len = ordersList.length;
    for (let i = 0; i < len; i++) {
      const o = ordersList[i];
      if (!o.userAddress || o.userAddress.toLowerCase() !== opAddr) continue;
      const ag = o.agentType?.toLowerCase();
      const pnl = o.pnl || 0;
      const isCountableTrade = o.status === 'FILLED' || o.status === 'PENDING';

      if (ag === 'volt') {
        voltPnl += pnl;
        if (isCountableTrade) voltTrades++;
      } else if (ag === 'oracle') {
        oraclePnl += pnl;
        if (isCountableTrade) oracleTrades++;
      } else if (ag === 'titan') {
        titanPnl += pnl;
        if (isCountableTrade) titanTrades++;
      }
    }

    return {
      voltPnl: Number(voltPnl.toFixed(2)),
      oraclePnl: Number(oraclePnl.toFixed(2)),
      titanPnl: Number(titanPnl.toFixed(2)),
      voltTrades,
      oracleTrades,
      titanTrades,
    };
  }

  /**
   * Returns total cumulative realized PnL for an agent type or across the entire portfolio/user.
   * Instant calculation summing stored order PnLs (0ms, zero network requests).
   */
  public getTotalRealizedPnl(agentType?: AgentType, userAddress?: string): number {
    const key = `${agentType ?? 'ALL'}|${userAddress?.toLowerCase() ?? 'ALL'}`;
    const now = Date.now();
    const cached = this.cachedPnlByKey.get(key);
    if (cached && now - cached.timestamp < 1000) {
      return cached.sum;
    }
    const targetAddr = userAddress?.toLowerCase();
    const targetAgent = agentType?.toLowerCase();

    let sum = 0;
    const ordersList = this.orders;
    const len = ordersList.length;
    for (let i = 0; i < len; i++) {
      const o = ordersList[i];
      if (targetAgent && (!o.agentType || o.agentType.toLowerCase() !== targetAgent)) continue;
      if (targetAddr && (!o.userAddress || o.userAddress.toLowerCase() !== targetAddr)) continue;
      sum += (o.pnl || 0);
    }
    const rounded = Number(sum.toFixed(2));
    this.cachedPnlByKey.set(key, { sum: rounded, timestamp: now });
    return rounded;
  }

  public async getTotalRealizedPnlAsync(agentType?: AgentType, userAddress?: string): Promise<number> {
    return this.getTotalRealizedPnl(agentType, userAddress);
  }
}

export const orderService = new OrderService();
