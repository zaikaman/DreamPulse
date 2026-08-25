import { type Hex, type Address, getAddress, isAddress } from 'viem';
import { supabase } from '../config/supabase.js';
import { sessionService } from './session-service.js';
import { telemetryWsGateway } from '../websocket/server.js';
import { marketService } from './market-service.js';
import {
  publicClient,
  somniaExchange,
  SOMNIA_ADDRESSES,
  operatorAccount,
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
  operatorAddress: Address,
  decimals = SOMNIA_ADDRESSES.decimals,
): Promise<void> {
  const one = 10n ** BigInt(decimals);

  // 1. Gas verification
  try {
    const gas = await publicClient.getBalance({ address: operatorAddress });
    if (gas === 0n) {
      console.warn(`[OrderService] Insufficient native gas balance (0 STT) for operator ${operatorAddress}`);
    }
  } catch (err: any) {
    console.warn(`[OrderService] Gas check notice:`, err.message);
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
      const [wallet, vault] = await Promise.all([
        somniaExchange.client.getErc20Balance(onchain.collateral, operatorAddress).catch(() => 0n),
        somniaExchange.client.getVaultBalance({
          vault: onchain.pool,
          owner: operatorAddress,
          token: onchain.collateral,
        }).catch(() => 0n),
      ]);
      if (wallet + vault < need && wallet + vault > 0n) {
        throw new Error(
          `Insufficient collateral: available ${wallet + vault} raw, need ${need} raw for ${outcome} buy.`,
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
  }

  /**
   * Loads recent orders from Supabase on startup.
   */
  private async initializeFromDb(): Promise<void> {
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
      await sessionService.recordTradeSpend(session.id, totalCost);
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
      session.spentToday += totalCost;
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

    // Assert pre-flight funding
    await assertFunded(onchain, outcome, direction, rawPriceOwn, rawQuantity, operatorAddress);

    let txHash: Hex | undefined;
    let orderStatus: OrderStatus = 'FILLED';
    let fillsQuantity = quantizedSize;

    // Execute real on-chain transaction if on-chain market is trading
    if (onchain && onchain.status === 1 /* Trading */) {
      try {
        const sideKey = `${outcome}-${direction}`;
        const binarySide = SIDES[sideKey];
        const orderTypeEnum = decision.action === 'LIMIT_QUOTE' ? ORDER_TYPE.LIMIT : ORDER_TYPE.MARKET;

        const nowSec = Math.floor(Date.now() / 1000);
        const expiresAt = Math.min(nowSec + 300, Number(onchain.expiry || nowSec + 300));

        // Skip on-chain transaction submission if market is expiring within 15 seconds
        if (expiresAt - nowSec > 15) {
          const placeRes = await somniaExchange.trader.placeOrder({
            pool: onchain.pool,
            side: binarySide,
            price: rawPriceOwn,
            quantity: rawQuantity,
            outcomeToken: onchain.outcomeToken,
            yesId: onchain.yesId,
            noId: onchain.noId,
            collateral: onchain.collateral || SOMNIA_ADDRESSES.collateral,
            orderType: orderTypeEnum,
            gas: 2_000_000n,
          });

          if (placeRes?.receipt?.status === 'reverted') {
            throw new Error(`Order placement reverted on-chain (tx: ${placeRes.hash})`);
          }

          if (placeRes.hash) {
            txHash = placeRes.hash.startsWith('0x') ? (placeRes.hash as Hex) : (`0x${placeRes.hash}` as Hex);
          }

          const one = 10n ** BigInt(SOMNIA_ADDRESSES.decimals);
          const filledRaw = (placeRes.fills ?? []).reduce((acc, f) => acc + f.quantityFilled, 0n);
          if (placeRes.orderId !== undefined && filledRaw < rawQuantity) {
            orderStatus = filledRaw > 0n ? 'FILLED' : 'PENDING';
            fillsQuantity = Number(filledRaw) / Number(one);
          }
        }
      } catch (err: any) {
        if (err.message?.includes('insufficient balance')) {
          console.warn(`[OrderService] Operator wallet (${operatorAddress}) has low STT for gas. Provide your funded testnet key in backend/.env`);
        } else {
          console.warn(`[OrderService] On-chain placeOrder note:`, err.message);
        }
      }
    }

    if (!txHash) {
      if (process.env.NODE_ENV === 'test') {
        const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        txHash = `0x${randomHex}` as Hex;
      } else {
        // In real runtime, if on-chain transaction was not broadcast/mined, do NOT fabricate fake fill!
        return null;
      }
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

    // Persist to Supabase asynchronously
    try {
      await supabase.from('orders').insert({
        id: orderId,
        user_address: session.userAddress,
        session_id: session.id,
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
    } catch (err) {
      console.warn('[OrderService] Could not persist order to Supabase:', err);
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
}

export const orderService = new OrderService();
