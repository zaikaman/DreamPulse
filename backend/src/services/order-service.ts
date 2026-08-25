import { type Hex, type Address, parseAbi, getAddress, isAddress } from 'viem';
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
} from '../config/somnia.js';
import { ORDER_TYPE, type BinarySide, type MarketOnchain } from '@somnia-chain/markets-sdk';
import type { IAgentDecision } from '../agents/base-agent.js';
import type {
  OrderExecution,
  SessionGrant,
  AgentType,
  OutcomeType,
  OrderDirection,
  OrderType,
  OrderStatus,
} from '../types/index.js';

export interface QueryOrdersParams {
  userAddress?: string;
  agentType?: AgentType;
  marketId?: string;
  status?: OrderStatus;
  limit?: number;
}

const testUsdcAbi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function faucet(uint256 amount)',
]);

let isFauceting = false;
let lastGasWarningTime = 0;
const GAS_WARN_THROTTLE_MS = 60_000;

/**
 * Ensures the operator wallet has sufficient TestUSDC collateral for swarm order execution.
 */
export async function ensureOperatorCollateral(minCollateral: bigint = 5_000n * 1_000_000n): Promise<void> {
  if (isFauceting) return;
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
      const hash = await walletClient.writeContract({
        address: SOMNIA_ADDRESSES.testUsdc,
        abi: testUsdcAbi,
        functionName: 'faucet',
        args: [faucetAmount],
        chain: somniaShannonTestnet,
        account: operatorAccount,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`[OrderService] Successfully funded operator wallet (${operatorAddress}) with 10,000 TestUSDC (tx: ${hash})`);
    }
  } catch (err: any) {
    console.warn(`[OrderService] Collateral faucet check notice:`, err.message);
  } finally {
    isFauceting = false;
  }
}

const SIDES: Record<string, BinarySide> = {
  'YES-BUY': 'BUY_YES',
  'YES-SELL': 'SELL_YES',
  'NO-BUY': 'BUY_NO',
  'NO-SELL': 'SELL_NO',
};

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
  lotStep = BigInt(process.env.MM_LOT || 1),
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

  if (!onchain) return;

  if (side === 'SELL') {
    const outcomeId = outcome === 'YES' ? onchain.yesId : onchain.noId;
    try {
      const held = await somniaExchange.client.getOutcomeBalance({
        outcomeToken: onchain.outcomeToken,
        account: operatorAddress,
        id: outcomeId,
      });
      if (held < rawQuantity && held > 0n) {
        throw new Error(
          `Insufficient ${outcome} outcome tokens to sell: held ${held} raw, need ${rawQuantity} raw.`,
        );
      }
    } catch (err: any) {
      if (err.message.includes('Insufficient')) throw err;
    }
  } else {
    // BUY: requires price * quantity collateral
    const need = (rawPriceOwn * rawQuantity) / one;
    try {
      let [wallet, vault] = await Promise.all([
        somniaExchange.client.getErc20Balance(onchain.collateral, operatorAddress).catch(() => 0n),
        somniaExchange.client.getVaultBalance({
          vault: onchain.pool,
          owner: operatorAddress,
          token: onchain.collateral,
        }).catch(() => 0n),
      ]);

      if (wallet + vault < need) {
        await ensureOperatorCollateral(need).catch(() => {});
        wallet = await somniaExchange.client.getErc20Balance(onchain.collateral, operatorAddress).catch(() => 0n);
      }

      if (wallet + vault < need && wallet + vault > 0n) {
        throw new Error(
          `Insufficient collateral for ${operatorAddress}: available ${wallet + vault} raw, need ${need} raw for ${outcome} buy.`,
        );
      }
    } catch (err: any) {
      if (err.message.includes('Insufficient')) throw err;
    }
  }
}

export class OrderService {
  private orders: OrderExecution[] = [];
  private orderMap = new Map<string, OrderExecution>();

  constructor() {
    this.initializeFromDb().catch((err) => {
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
      .limit(100);

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
        pnl: row.pnl ? Number(row.pnl) : 0,
        createdAt: row.created_at,
        filledAt: row.filled_at || undefined,
      };

      this.orderMap.set(order.id, order);
      this.orders.push(order);
    }
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
      try {
        onchain = await somniaExchange.client.getMarketOnchain(market.marketIdHex as Hex);
      } catch {
        // Fallback for rolling markets
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

    // Execute real on-chain transaction if on-chain market is trading
    if (onchain && onchain.status === 1 /* Trading */) {
      try {
        const sideKey = `${outcome}-${direction}`;
        const binarySide = SIDES[sideKey];
        // Use LIMIT (0) so orders match any crossing book liquidity immediately and rest remaining, avoiding ImmediateOrCancelNoFill reverts
        const orderTypeEnum = ORDER_TYPE.LIMIT;
        const one = 10n ** BigInt(SOMNIA_ADDRESSES.decimals);
        const priceYes = outcome === 'YES' ? rawPriceOwn : one - rawPriceOwn;
        const nowSec = Math.floor(Date.now() / 1000);
        const onchainExpiry = Number(onchain.expiry || 0);

        // Skip on-chain transaction submission if market is expiring within 30 seconds or already expired
        if (onchainExpiry === 0 || onchainExpiry - nowSec > 30) {
          const expiresAtSec = onchainExpiry > 0
            ? Math.min(nowSec + 300, onchainExpiry)
            : nowSec + 300;
          const expireTimestampNs = BigInt(expiresAtSec) * 1_000_000_000n;

          const placeRes = await somniaExchange.trader.placeOrder({
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
            gas: 400_000n,
          });

          if (placeRes?.receipt?.status === 'reverted') {
            throw new Error(`Order placement reverted on-chain (tx: ${placeRes.hash})`);
          }

          if (placeRes?.hash) {
            txHash = placeRes.hash.startsWith('0x') ? (placeRes.hash as Hex) : (`0x${placeRes.hash}` as Hex);
          }

          const filledRaw = (placeRes?.fills ?? []).reduce((acc, f) => acc + f.quantityFilled, 0n);
          if (placeRes?.orderId !== undefined && filledRaw < rawQuantity) {
            orderStatus = filledRaw > 0n ? 'FILLED' : 'PENDING';
            fillsQuantity = Number(filledRaw) / Number(one);
          }
        }
      } catch (err: any) {
        if (err.message?.includes('ImmediateOrCancelNoFill')) {
          console.info(`[OrderService] IOC trade skipped: no crossing liquidity on CLOB book at tick ${quantizedPrice}`);
        } else if (err.message?.includes('ERC20InsufficientBalance') || err.message?.includes('insufficient balance')) {
          console.warn(`[OrderService] Insufficient ERC20 collateral balance for ${targetTrader}: ${err.message}`);
          if (isOperatorMaster) ensureOperatorCollateral().catch(() => {});
        } else if (
          err.message?.includes('gas') ||
          err.message?.includes('native balance') ||
          err.message?.includes('Missing or invalid parameters') ||
          err.message?.includes('account does not exist')
        ) {
          const now = Date.now();
          if (now - lastGasWarningTime > GAS_WARN_THROTTLE_MS) {
            lastGasWarningTime = now;
            console.warn(
              `[OrderService] Operator wallet (${operatorAddress}) has low or zero STT for gas. Fund the operator address on Somnia Shannon Testnet to enable live on-chain trades.`,
            );
          }
        } else {
          console.warn(`[OrderService] On-chain placeOrder note for ${targetTrader}:`, err.message);
        }
      }
    }

    if (!txHash) {
      return null;
    }

    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();

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
      lotSize: fillsQuantity > 0 ? fillsQuantity : quantizedSize,
      totalCost,
      status: orderStatus,
      txHash,
      pnl: 0, // Realized PnL starts at 0, updated on redemption
      createdAt: now,
      filledAt: orderStatus === 'FILLED' ? now : undefined,
    };

    // Record spend against session now that order has executed
    if (registeredSession) {
      await sessionService.recordTradeSpend(session.id, totalCost);
    } else {
      session.spentToday = Number((session.spentToday + totalCost).toFixed(4));
    }

    // Store in-memory
    this.orderMap.set(orderId, orderExecution);
    this.orders.unshift(orderExecution);
    if (this.orders.length > 500) {
      this.orders.pop();
    }

    // Broadcast order fill event over WebSocket telemetry stream
    telemetryWsGateway.broadcastOrderFilled({
      userAddress: session.userAddress,
      orderId,
      marketId: decision.targetMarketId,
      outcome: orderExecution.outcome,
      direction: orderExecution.direction,
      price: quantizedPrice,
      lotSize: orderExecution.lotSize,
      txHash,
    });

    // Persist to Supabase asynchronously (skip fake test artifacts)
    if (
      txHash !== '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' &&
      session.userAddress.toLowerCase() !== '0x15c7e8ce38f021c5b45d098aad788f63090bf20a'
    ) {
      try {
        await marketService.ensureMarketPersisted(decision.targetMarketId);
        const isUuid = session.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.id);
        await supabase.from('orders').insert({
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
          total_cost: totalCost,
          status: orderStatus,
          tx_hash: txHash,
          pnl: 0,
          created_at: now,
          filled_at: orderStatus === 'FILLED' ? now : null,
        });
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

    if (params?.userAddress) {
      try {
        if (!isAddress(params.userAddress)) return [];
        const normalized = getAddress(params.userAddress).toLowerCase();
        result = result.filter((o) => o.userAddress.toLowerCase() === normalized);
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

    const limit = params?.limit ?? 50;
    return result.slice(0, limit);
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
  public hasActivePosition(agentType: AgentType, marketId?: string): boolean {
    const now = Date.now();
    return this.orders.some((o) => {
      if (o.agentType !== agentType) return false;
      if (o.status !== 'FILLED' && o.status !== 'PENDING') return false;
      if (marketId && o.marketId.toLowerCase() !== marketId.toLowerCase()) return false;

      // Check if market has finished its resolution window
      const market = marketService.getMarketById(o.marketId);
      if (!market) return false;

      const isFinalized = market.status === 'Finalized';
      const isPastResolution = market.resolutionTimestamp
        ? new Date(market.resolutionTimestamp).getTime() <= now
        : false;

      return !isFinalized && !isPastResolution;
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

      const isFinalized = market.status === 'Finalized';
      const isPastResolution = market.resolutionTimestamp
        ? new Date(market.resolutionTimestamp).getTime() <= now
        : false;

      return !isFinalized && !isPastResolution;
    }).length;
  }

  /**
   * Synchronizes and calculates realized PnL for filled orders against finalized / expired markets.
   */
  public syncResolvedOrdersPnL(): void {
    const now = Date.now();
    for (const order of this.orders) {
      if (order.status !== 'FILLED' && order.status !== 'PENDING') continue;
      const market = marketService.getMarketById(order.marketId);

      if (market) {
        const isFinalized = market.status === 'Finalized';
        const isPastResolution = market.closeTimestamp
          ? new Date(market.closeTimestamp).getTime() <= now
          : false;

        if (isFinalized || isPastResolution) {
          const spot = market.settlementPrice || marketService.getSpotPrice(market.symbol) || 0;
          const winningOutcome = market.winningOutcome || (spot >= market.strikePrice ? 'YES' : 'NO');

          const isWin = order.outcome === winningOutcome;
          order.pnl = isWin
            ? Number(((1.0 - order.price) * order.lotSize).toFixed(2))
            : Number((-order.totalCost).toFixed(2));

          if (order.status === 'PENDING') {
            order.status = 'FILLED';
          }

          void supabase
            .from('orders')
            .update({ pnl: order.pnl, status: order.status })
            .eq('id', order.id);
        }
      } else if (order.marketId.includes('-')) {
        // Parse contract metadata (symbol, strike price, and expiry) embedded directly in the market ID
        const parts = order.marketId.split('-');
        if (parts.length >= 5) {
          const rawSymbol = parts[1];
          const symbol = rawSymbol.startsWith('BTC') ? 'BTC/USD' : rawSymbol.startsWith('ETH') ? 'ETH/USD' : 'SOL/USD';
          const strikePrice = Number(parts[3]);
          const closeTimeMs = Number(parts[4]);

          if (!isNaN(strikePrice) && !isNaN(closeTimeMs) && now >= closeTimeMs) {
            const spot = marketService.getSpotPrice(symbol) || strikePrice;
            const winningOutcome = spot >= strikePrice ? 'YES' : 'NO';
            const isWin = order.outcome === winningOutcome;
            order.pnl = isWin
              ? Number(((1.0 - order.price) * order.lotSize).toFixed(2))
              : Number((-order.totalCost).toFixed(2));

            if (order.status === 'PENDING') {
              order.status = 'FILLED';
            }

            void supabase
              .from('orders')
              .update({ pnl: order.pnl, status: order.status })
              .eq('id', order.id);
          }
        }
      }
    }
  }

  /**
   * Returns total cumulative realized PnL for an agent type or across the entire portfolio/user.
   */
  public getTotalRealizedPnl(agentType?: AgentType, userAddress?: string): number {
    this.syncResolvedOrdersPnL();
    return Number(
      this.orders
        .filter((o) => {
          if (agentType && o.agentType.toLowerCase() !== agentType.toLowerCase()) return false;
          if (userAddress && (!o.userAddress || o.userAddress.toLowerCase() !== userAddress.toLowerCase())) return false;
          return true;
        })
        .reduce((acc, o) => acc + (o.pnl || 0), 0)
        .toFixed(2),
    );
  }
}

export const orderService = new OrderService();
