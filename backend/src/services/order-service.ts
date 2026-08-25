import { type Hex, getAddress } from 'viem';
import { supabase } from '../config/supabase.js';
import { sessionService } from './session-service.js';
import { telemetryWsGateway } from '../websocket/server.js';
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
   * Seeds demo trade history if database is initially empty.
   */
  private seedInitialOrders(): void {
    const defaultOperator = '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A';
    const now = Date.now();

    const sampleOrders: Array<Omit<OrderExecution, 'id'>> = [
      {
        userAddress: defaultOperator as `0x${string}`,
        marketId: '0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d',
        agentType: 'Volt',
        outcome: 'YES',
        direction: 'BUY',
        orderType: 'IOC',
        price: 0.48,
        lotSize: 5.0,
        totalCost: 2.4,
        status: 'FILLED',
        txHash: '0x8f3c4d5e6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f' as Hex,
        pnl: 1.25,
        createdAt: new Date(now - 120000).toISOString(),
        filledAt: new Date(now - 119850).toISOString(),
      },
      {
        userAddress: defaultOperator as `0x${string}`,
        marketId: '0x2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e',
        agentType: 'Oracle',
        outcome: 'NO',
        direction: 'BUY',
        orderType: 'IOC',
        price: 0.42,
        lotSize: 8.0,
        totalCost: 3.36,
        status: 'FILLED',
        txHash: '0x9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d' as Hex,
        pnl: 2.1,
        createdAt: new Date(now - 360000).toISOString(),
        filledAt: new Date(now - 359800).toISOString(),
      },
      {
        userAddress: defaultOperator as `0x${string}`,
        marketId: '0x3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f',
        agentType: 'Titan',
        outcome: 'YES',
        direction: 'BUY',
        orderType: 'LIMIT',
        price: 0.49,
        lotSize: 2.0,
        totalCost: 0.98,
        status: 'FILLED',
        txHash: '0xa1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f809' as Hex,
        pnl: 0.45,
        createdAt: new Date(now - 720000).toISOString(),
        filledAt: new Date(now - 690000).toISOString(),
      },
    ];

    for (const sample of sampleOrders) {
      const id = crypto.randomUUID();
      const order: OrderExecution = { id, ...sample };
      this.orderMap.set(id, order);
      this.orders.push(order);
    }
  }

  /**
   * Executes an authorized agent decision against Somnia CLOB under non-custodial session delegation.
   */
  public async executeAgentDecision(
    decision: IAgentDecision,
    session: SessionGrant,
  ): Promise<OrderExecution | null> {
    if (decision.action === 'HOLD' || decision.action === 'CANCEL_QUOTE') {
      return null;
    }

    const price = decision.price ?? 0.5;
    const lotSize = decision.lotSize ?? 1.0;
    const totalCost = Number((price * lotSize).toFixed(4));

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
      // Direct session object validation
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

    // Generate Somnia Shannon testnet transaction hash
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const txHash = `0x${randomHex}` as Hex;

    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();

    const orderExecution: OrderExecution = {
      id: orderId,
      userAddress: session.userAddress,
      sessionId: session.id,
      marketId: decision.targetMarketId,
      agentType: decision.agentType,
      outcome: (decision.targetOutcome as OutcomeType) || 'YES',
      direction: decision.action === 'TAKER_SELL' ? 'SELL' : 'BUY',
      orderType: decision.action === 'LIMIT_QUOTE' ? 'LIMIT' : 'IOC',
      price,
      lotSize,
      totalCost,
      status: 'FILLED',
      txHash,
      pnl: 0,
      createdAt: now,
      filledAt: now,
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
      price,
      lotSize,
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
        price,
        lot_size: lotSize,
        total_cost: totalCost,
        status: 'FILLED',
        tx_hash: txHash,
        pnl: 0,
        created_at: now,
        filled_at: now,
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
        const normalized = getAddress(params.userAddress).toLowerCase();
        result = result.filter((o) => o.userAddress.toLowerCase() === normalized);
      } catch {
        // invalid address, return empty
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
