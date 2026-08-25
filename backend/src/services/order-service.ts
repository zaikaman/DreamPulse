import { type Hex, type Address, parseAbi, getAddress, isAddress, encodeFunctionData } from 'viem';
import { supabase } from '../config/supabase.js';
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
  limit?: number;
  offset?: number;
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

/**
 * Ensures the operator wallet has sufficient TestUSDC collateral for swarm order execution.
 * Concurrent callers await the same faucet promise instead of silently skipping.
 */
export async function ensureOperatorCollateral(minCollateral: bigint = 5_000n * 1_000_000n): Promise<void> {
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
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`[OrderService] Successfully funded operator wallet (${operatorAddress}) with 10,000 TestUSDC (tx: ${hash})`);
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
  // --- Cumulative PnL fast-path cache ---
  private lastPnlSyncAt = 0;
  private pnlSyncInFlight: Promise<void> | null = null;
  private cachedPnlByKey = new Map<string, { sum: number; timestamp: number }>();
  private stateChangeListeners: Array<() => void> = [];

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
      const matchingQuotes = activeQuotes.filter(
        (q) => q.outcome === outcome && (isAsk ? q.direction === 'SELL' : q.direction === 'BUY'),
      );
      if (matchingQuotes.length === 0) return [...levels];

      const sanitized: OrderBookLevel[] = [];
      for (const lvl of levels) {
        // Find total swarm-owned resting lot size at this tick
        const ownQty = matchingQuotes
          .filter((q) => Math.abs(q.price - lvl.price) < 0.005)
          .reduce((sum, q) => sum + q.lotSize, 0);

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

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error || !data || data.length === 0) {
      this.seedInitialOrders();
      return;
    }

    for (const row of data) {
      // Exclude mock test artifacts and dummy placeholder orders
      if (
        row.tx_hash === '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' ||
        row.market_id === '0x1111222233334444555566667777888899990000' ||
        row.user_address?.toLowerCase() === '0x15c7e8ce38f021c5b45d098aad788f63090bf20a'
      ) {
        continue;
      }

      const pnlVal = row.pnl !== null && row.pnl !== undefined ? Number(row.pnl) : 0;
      const isSettled = row.is_settled === true || (row.is_settled !== false && (row.settled_at != null || (row.pnl != null && pnlVal !== 0)));

      const order: OrderExecution = {
        id: row.id,
        userAddress: row.user_address,
        sessionId: row.session_id || undefined,
        marketId: row.market_id,
        agentType: row.agent_type as AgentType,
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

      this.orderMap.set(order.id, order);
      this.orders.push(order);
    }

    // Hydrate missing market snapshots from DB so old orders (without snapshot) can still settle to accurate PnL even if market evicted from memory
    await this.hydrateMarketSnapshotsFromDb().catch(() => {});

    // Authoritative on-chain healing: verify all on-chain hex orders against actual smart contract settlements
    await this.reconcileSettledOrdersWithOnChain().catch(() => {});

    // Reconcile remaining unsettled orders whose market expired
    await this.syncResolvedOrdersPnLAsync({ force: true }).catch(() => {});
  }

  private async hydrateMarketSnapshotsFromDb(): Promise<void> {
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
            const symbol = rawSymbol.startsWith('BTC') ? 'BTC/USD' : rawSymbol.startsWith('ETH') ? 'ETH/USD' : 'SOL/USD';
            const strikePrice = Number(parts[3]);
            const closeTimeMs = Number(parts[4]);
            if (!isNaN(strikePrice) && !isNaN(closeTimeMs)) {
              order.marketSnapshot = {
                symbol,
                strikePrice,
                closeTimestamp: new Date(closeTimeMs).toISOString(),
                windowDuration: '5m',
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
  ): Promise<OrderExecution | null> {
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
      console.warn(`[OrderService] Trade skipped: requested size ${rawLotSize} rounds to 0 lots`);
      return null;
    }

    // Validate risk guardrails against session
    const registeredSession = sessionService.getSessionById(session.id);
    if (registeredSession) {
      const riskAllowance = sessionService.validateTradeAllowance(session.id, totalCost);
      if (!riskAllowance.allowed) {
        console.warn(`[OrderService] Trade rejected: ${riskAllowance.reason}`);
        return null;
      }
    } else {
      if (!session.isActive) {
        console.warn('[OrderService] Trade rejected: Session is inactive');
        return null;
      }
      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        console.warn('[OrderService] Trade rejected: Session has expired');
        return null;
      }
      if (totalCost > session.maxTradeSize) {
        console.warn(`[OrderService] Trade rejected: Trade cost (${totalCost}) exceeds maxTradeSize (${session.maxTradeSize})`);
        return null;
      }
      if (session.spentToday + totalCost > session.dailyVolumeCap) {
        console.warn(`[OrderService] Trade rejected: Trade cost exceeds dailyVolumeCap`);
        return null;
      }
    }

    // Resolve market and on-chain state
    const market = marketService.getMarketById(decision.targetMarketId);
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

        // Skip on-chain transaction submission if market is expiring within 30 seconds or already expired
        const hasTimeRemaining = onchainExpiry > 0
          ? onchainExpiry - nowSec > 30
          : (market ? (new Date(market.closeTimestamp).getTime() - Date.now()) / 1000 > 30 : false);

        if (hasTimeRemaining) {
          const expiresAtSec = onchainExpiry > 0
            ? Math.min(nowSec + 300, onchainExpiry)
            : Math.floor(new Date(market!.closeTimestamp).getTime() / 1000);
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
                  console.warn(`[OrderService] Transfer proceeds failed to copy-trader ${targetTrader}:`, trErr.message);
                }
              }
            }
          }
        }
      } catch (err: any) {
        const msg: string = err?.message || String(err);
        const isAllowanceError = msg.includes('Insufficient TestUSDC allowance') || msg.includes('allowance') || msg.includes('ERC20InsufficientAllowance');
        const isCollateralError = msg.includes('Insufficient collateral') || msg.includes('ERC20InsufficientBalance') || msg.includes('insufficient balance');
        const isTimeoutError = msg.includes('Timed out while waiting') || msg.includes('timeout') || msg.includes('waitForTransactionReceipt');
        const isGasFundsError = msg.includes('insufficient funds for gas') || msg.includes('insufficient native balance') || msg.includes('exceeds balance') || msg.includes('Insufficient native STT gas balance');
        const isOutOfGasError = msg.includes('out of gas') || msg.includes('OUT_OF_GAS') || msg.includes('gas limit reached');

        // Allowance/collateral/timeout are user-fixable or infra-timeout — do NOT burn circuit breaker or per-pool 10m cooldown
        if (isAllowanceError || isCollateralError) {
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
      return null;
    }

    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();

    const actualLotSize = fillsQuantity > 0 ? fillsQuantity : quantizedSize;
    const actualTotalCost = Number((quantizedPrice * actualLotSize).toFixed(4));

    const orderExecution: OrderExecution = {
      id: orderId,
      userAddress: session.userAddress,
      sessionId: session.id,
      marketId: decision.targetMarketId,
      agentType: decision.agentType,
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

    // Store in-memory with bounded capacity (evict oldest from both array and map)
    this.orderMap.set(orderId, orderExecution);
    this.orders.unshift(orderExecution);
    if (this.orders.length > 5000) {
      const evicted = this.orders.pop();
      if (evicted) {
        this.orderMap.delete(evicted.id);
        this.restingMakerQuotes.delete(evicted.id);
      }
    }

    // Register resting limit quote for swarm cross-agent self-trade protection
    if (orderExecution.orderType === 'LIMIT' || decision.action === 'LIMIT_QUOTE') {
      this.registerRestingMakerQuote({
        orderId,
        marketId: decision.targetMarketId,
        userAddress: session.userAddress.toLowerCase(),
        agentType: decision.agentType,
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
      agentType: decision.agentType,
      outcome: orderExecution.outcome,
      direction: orderExecution.direction,
      price: quantizedPrice,
      lotSize: orderExecution.lotSize,
      txHash,
    });

    this.notifyStateChange();

    // Persist to Supabase asynchronously (skip fake test artifacts)
    if (
      txHash !== '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' &&
      session.userAddress.toLowerCase() !== '0x15c7e8ce38f021c5b45d098aad788f63090bf20a'
    ) {
      try {
        await marketService.ensureMarketPersisted(decision.targetMarketId);
        const isUuid = session.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.id);
        const insertPayload: any = {
          id: orderId,
          user_address: session.userAddress,
          session_id: isUuid ? session.id : null,
          market_id: decision.targetMarketId,
          agent_type: decision.agentType,
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
        };
        const insertRes = await supabase.from('orders').insert(insertPayload);
        if (insertRes.error && insertRes.error.message.includes('is_settled')) {
          delete insertPayload.is_settled;
          await supabase.from('orders').insert(insertPayload);
        }
      } catch (_err) {
        // Non-fatal: Supabase sync can fail silently in offline/local dev mode
      }
    }

    return orderExecution;
  }

  /**
   * Retrieves filtered order executions.
   */
  public getOrders(params?: QueryOrdersParams): OrderExecution[] {
    let result = [...this.orders];

    if (params?.swarmOnly || params?.scope === 'SWARM') {
      const opAddr = (operatorAccount?.address || SOMNIA_ADDRESSES.operatorAccount).toLowerCase();
      result = result.filter((o) => o.userAddress && o.userAddress.toLowerCase() === opAddr);
    } else if (params?.userAddress) {
      try {
        if (!isAddress(params.userAddress)) return [];
        const normalized = getAddress(params.userAddress).toLowerCase();
        result = result.filter((o) => o.userAddress && o.userAddress.toLowerCase() === normalized);
      } catch {
        return [];
      }
    }

    if (params?.agentType) {
      result = result.filter((o) => o.agentType.toLowerCase() === params.agentType!.toLowerCase());
    }

    if (params?.marketId) {
      result = result.filter((o) => o.marketId.toLowerCase() === params.marketId!.toLowerCase());
    }

    if (params?.status) {
      result = result.filter((o) => o.status === params.status);
    }

    if (params?.outcome) {
      result = result.filter((o) => o.outcome === params.outcome);
    }

    if (params?.searchQuery && params.searchQuery.trim()) {
      const q = params.searchQuery.toLowerCase();
      result = result.filter(
        (o) =>
          (o.marketId && o.marketId.toLowerCase().includes(q)) ||
          (o.userAddress && o.userAddress.toLowerCase().includes(q)) ||
          (o.txHash && o.txHash.toLowerCase().includes(q))
      );
    }

    if (params?.offset && params.offset > 0) {
      result = result.slice(params.offset);
    }

    if (params?.limit !== undefined && params.limit > 0) {
      result = result.slice(0, params.limit);
    }

    return result;
  }

  /**
   * Calculates exact statistics (total fills and executed volume) for the given filter parameters.
   */
  public getOrderStats(params?: Omit<QueryOrdersParams, 'limit' | 'offset'>): {
    totalCount: number;
    totalFills: number;
    totalVolume: number;
  } {
    const all = this.getOrders({ ...params, limit: undefined, offset: undefined });
    const fills = all.filter((o) => o.status === 'FILLED');
    const totalVolume = Number(
      fills.reduce((sum, o) => sum + (o.totalCost || 0), 0).toFixed(4)
    );
    return {
      totalCount: all.length,
      totalFills: fills.length,
      totalVolume,
    };
  }

  /**
   * Queries orders with pagination metadata and accurate totals.
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
    const allMatching = this.getOrders({
      userAddress: params?.userAddress,
      agentType: params?.agentType,
      status: params?.status,
      outcome: params?.outcome,
      marketId: params?.marketId,
      searchQuery: params?.searchQuery,
      scope: params?.scope,
      swarmOnly: params?.swarmOnly,
      limit: undefined,
      offset: undefined,
    });

    const total = allMatching.length;
    const filled = allMatching.filter((o) => o.status === 'FILLED');
    const totalFills = filled.length;
    const totalVolume = Number(
      filled.reduce((sum, o) => sum + (o.totalCost || 0), 0).toFixed(4)
    );

    const pageSize = params?.pageSize || params?.limit || 50;
    const page = Math.max(1, params?.page || 1);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const startIndex = (page - 1) * pageSize;
    const paginatedOrders = allMatching.slice(startIndex, startIndex + pageSize);

    return {
      orders: paginatedOrders,
      total,
      totalFills,
      totalVolume,
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

    await Promise.allSettled(dbUpdates);

    if (updatedEvents.length > 0) {
      try {
        telemetryWsGateway.broadcastPnlUpdate({ updatedOrders: updatedEvents, timestamp: Date.now() });
        this.cachedPnlByKey.clear();
        const voltPnl = this.getTotalRealizedPnl('Volt');
        const oraclePnl = this.getTotalRealizedPnl('Oracle');
        const titanPnl = this.getTotalRealizedPnl('Titan');
        telemetryWsGateway.broadcastSwarmPnl({
          volt: voltPnl,
          oracle: oraclePnl,
          titan: titanPnl,
          sweeper: 0,
          totalSwarm: Number((voltPnl + oraclePnl + titanPnl).toFixed(2)),
          timestamp: Date.now(),
        });
      } catch {}
      this.notifyStateChange();
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
            const symbol = rawSymbol.startsWith('BTC') ? 'BTC/USD' : rawSymbol.startsWith('ETH') ? 'ETH/USD' : 'SOL/USD';
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

      // Now settle candidates
      const onchainMarketCache = new Map<string, any>();
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
            let onchain = onchainMarketCache.get(order.marketId);
            if (onchain === undefined) {
              onchain = await Promise.race([
                somniaExchange.client.getMarketOnchain(order.marketId as Hex).catch(() => null),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
              ]);
              onchainMarketCache.set(order.marketId, onchain);
            }
            if (onchain && (onchain.isResolved || onchain.finalized)) {
              shouldResolve = true;
              if (onchain.isVoided) {
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
            const symbol = rawSymbol.startsWith('BTC') ? 'BTC/USD' : rawSymbol.startsWith('ETH') ? 'ETH/USD' : 'SOL/USD';
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

      if (updatedOrderPnlEvents.length > 0) {
        try {
          telemetryWsGateway.broadcastPnlUpdate({ updatedOrders: updatedOrderPnlEvents, timestamp: Date.now() });

          this.cachedPnlByKey.clear();
          const voltPnl = this.getTotalRealizedPnl('Volt');
          const oraclePnl = this.getTotalRealizedPnl('Oracle');
          const titanPnl = this.getTotalRealizedPnl('Titan');

          telemetryWsGateway.broadcastSwarmPnl({
            volt: voltPnl,
            oracle: oraclePnl,
            titan: titanPnl,
            sweeper: 0,
            totalSwarm: Number((voltPnl + oraclePnl + titanPnl).toFixed(2)),
            timestamp: Date.now(),
          });

          void import('./settlement-service.js').then((m) => m.settlementService.invalidateCache()).catch(() => {});
          void import('./analytics-service.js').then((m) => m.analyticsService.invalidateCache()).catch(() => {});
        } catch {}
      }
      this.lastPnlSyncAt = Date.now();
      this.notifyStateChange();
    };
    this.pnlSyncInFlight = doSync().finally(() => { this.pnlSyncInFlight = null; });
    return this.pnlSyncInFlight;
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
    const sum = Number(
      this.orders
        .filter((o) => {
          if (targetAgent && (!o.agentType || o.agentType.toLowerCase() !== targetAgent)) return false;
          if (targetAddr && (!o.userAddress || o.userAddress.toLowerCase() !== targetAddr)) return false;
          return true;
        })
        .reduce((acc, o) => acc + (o.pnl || 0), 0)
        .toFixed(2),
    );
    this.cachedPnlByKey.set(key, { sum, timestamp: now });
    return sum;
  }

  public async getTotalRealizedPnlAsync(agentType?: AgentType, userAddress?: string): Promise<number> {
    return this.getTotalRealizedPnl(agentType, userAddress);
  }
}

export const orderService = new OrderService();
