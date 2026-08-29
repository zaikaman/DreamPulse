import type { AgentThoughtLog } from '../types/index.js';

export interface MarketTickData {
  marketId: string;
  symbol: string;
  spotPrice: number;
  strikePrice: number;
  timeLeftSeconds: number;
  impliedProb: number;
  fairValue: number;
  edge: number;
  hasAnomaly: boolean;
  timestamp: number;
  convictionState?: 'HIGH_CONVICTION' | 'MODERATE' | 'CAUTION_COUNTER_TREND' | 'NEUTRAL';
  recommendedAction?: 'BUY_UP' | 'BUY_DOWN' | 'WAIT';
  recommendedOutcome?: 'YES' | 'NO' | 'NONE';
  winProbability?: number;
  confidenceScore?: number;
  priceActionTrend?: string;
  priceActionScore?: number;
  confluenceRationale?: string;
}

export interface DepthUpdateData {
  marketId: string;
  bestBid: number;
  bestAsk: number;
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  timestamp: number;
}

export interface OrderFillData {
  userAddress: string;
  orderId: string;
  marketId: string;
  agentType?: string;
  outcome: string;
  direction: string;
  price: number;
  lotSize: number;
  txHash?: string;
  timestamp: number;
}

export interface SweepCompleteData {
  userAddress: string;
  marketId: string;
  claimedAmount: string;
  txHash?: string;
  timestamp: number;
}

export interface PnlUpdateData {
  updatedOrders: Array<{ orderId: string; marketId: string; pnl: number; outcome: string; winningOutcome: string }>;
  timestamp: number;
}

export interface SwarmPnlTickData {
  volt: number;
  oracle: number;
  titan: number;
  sweeper: number;
  totalSwarm: number;
  timestamp: number;
}

export type TelemetryEventType =
  | 'status'
  | 'market_tick'
  | 'market_ticks'
  | 'depth_update'
  | 'agent_thought'
  | 'debug_thought'
  | 'order_filled'
  | 'sweep_completed'
  | 'pnl_update'
  | 'swarm_pnl_tick';

export type TelemetryEventCallback<T = any> = (data: T) => void;

class TelemetryClient {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private latencyMs = 18;
  private pingTime = 0;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private userAddress: string | null = null;
  private isDebugEnabled = false;

  private listeners: Map<TelemetryEventType, Set<TelemetryEventCallback>> = new Map();

  constructor() {
    // Auto-connect when browser window is ready
    if (typeof window !== 'undefined') {
      this.connect();

      // Optimize on background tab / foreground visibility change
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
          this.reconnectAttempts = 0;
          this.connect();
        }
      });
    }
  }

  private getWsUrl(): string {
    const rawWsUrl = ((import.meta as any).env?.VITE_BACKEND_WS_URL || '').trim();
    if (rawWsUrl) {
      const trimmed = rawWsUrl.replace(/\/+$/, '');
      return trimmed.endsWith('/ws/telemetry') ? trimmed : `${trimmed}/ws/telemetry`;
    }

    const rawHttpUrl = ((import.meta as any).env?.VITE_BACKEND_HTTP_URL || '').trim();
    if (rawHttpUrl && (rawHttpUrl.startsWith('http://') || rawHttpUrl.startsWith('https://'))) {
      const wsProtocol = rawHttpUrl.startsWith('https://') ? 'wss://' : 'ws://';
      const cleanHttp = rawHttpUrl.replace(/^https?:\/\//, '').replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
      return `${wsProtocol}${cleanHttp}/ws/telemetry`;
    }

    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = loc.hostname;
    const port = (loc.port === '5173' || loc.port === '5174') ? '5000' : loc.port || '5000';
    return `${protocol}//${host}:${port}/ws/telemetry`;
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      const url = this.getWsUrl();
      this.ws = new WebSocket(url);
      this.pingTime = Date.now();

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('status', { isConnected: true, latencyMs: this.latencyMs });

        // Send initial channel subscriptions
        this.resubscribeAll();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        this.handleDisconnect();
      };

      this.ws.onerror = () => {
        this.handleDisconnect();
      };
    } catch {
      this.handleDisconnect();
    }
  }

  private handleDisconnect(): void {
    if (this.isConnected) {
      this.isConnected = false;
      this.emit('status', { isConnected: false, latencyMs: this.latencyMs });
    }
    this.ws = null;

    if (!this.reconnectTimer && typeof window !== 'undefined') {
      const delay = Math.min(10000, 1000 * Math.pow(1.5, this.reconnectAttempts) + Math.random() * 500);
      this.reconnectAttempts++;
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
    }
  }

  private resubscribeAll(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // 1. Markets channel
    this.ws.send(
      JSON.stringify({
        action: 'subscribe',
        channel: 'markets',
        params: {
          symbols: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'DOGE/USD'],
          agentTypes: ['Volt', 'Oracle', 'Titan', 'Sweeper'],
          userAddress: this.userAddress || undefined,
        },
      }),
    );

    // 2. Executed Agent Thoughts channel
    this.ws.send(
      JSON.stringify({
        action: 'subscribe',
        channel: 'agent_thoughts',
      }),
    );

    // 3. User Portfolio channel
    if (this.userAddress) {
      this.ws.send(
        JSON.stringify({
          action: 'subscribe',
          channel: 'user_portfolio',
          params: { userAddress: this.userAddress },
        }),
      );
    }

    // 4. Opt-in Debug Thoughts channel
    if (this.isDebugEnabled) {
      this.ws.send(
        JSON.stringify({
          action: 'subscribe',
          channel: 'debug_thoughts',
        }),
      );
    }
  }

  private handleMessage(rawData: string): void {
    try {
      const payload = JSON.parse(rawData);
      const now = Date.now();

      switch (payload.event) {
        case 'connected':
          this.latencyMs = Math.max(4, now - this.pingTime);
          this.emit('status', { isConnected: true, latencyMs: this.latencyMs });
          break;

        case 'market_ticks':
          if (Array.isArray(payload.data)) {
            this.emit('market_ticks', payload.data);
            for (const tick of payload.data) {
              this.emit('market_tick', tick);
            }
          }
          break;

        case 'market_tick':
          if (payload.data?.marketId) {
            const tick: MarketTickData = {
              ...payload.data,
              timestamp: payload.timestamp || now,
            };
            this.emit('market_tick', tick);
            this.emit('market_ticks', [tick]);
          }
          break;

        case 'depth_update':
          if (payload.marketId) {
            const depth: DepthUpdateData = {
              marketId: payload.marketId,
              bestBid: payload.bestBid,
              bestAsk: payload.bestAsk,
              bids: payload.bids || [],
              asks: payload.asks || [],
              timestamp: payload.timestamp || now,
            };
            this.emit('depth_update', depth);
          }
          break;

        case 'agent_thought':
          const execThought: AgentThoughtLog = {
            id: payload.id || `exec-${now}-${Math.random().toString(36).slice(2, 6)}`,
            agentType: payload.agent || payload.agentType || 'Volt',
            marketId: payload.marketId,
            triggerEvent: payload.triggerEvent || 'EXECUTION_CONFIRMED',
            confidence: payload.confidence ?? 0.94,
            actionTaken: payload.action || 'EXECUTED',
            reasoningText: payload.thought || 'Trade executed on Somnia Shannon CLOB.',
            txHash: payload.txHash,
            isExecution: payload.isExecution ?? true,
            price: payload.price,
            lotSize: payload.lotSize,
            outcome: payload.outcome,
            createdAt: new Date(payload.timestamp || now).toISOString(),
          };
          this.emit('agent_thought', execThought);
          break;

        case 'debug_thought':
          const debugThought: AgentThoughtLog = {
            id: payload.id || `debug-${now}-${Math.random().toString(36).slice(2, 6)}`,
            agentType: payload.agent || payload.agentType || 'Volt',
            marketId: payload.marketId,
            triggerEvent: payload.triggerEvent || 'EVALUATION_TICK',
            confidence: payload.confidence ?? 0.90,
            actionTaken: payload.action || 'EVALUATE',
            reasoningText: payload.thought || 'Continuous depth evaluation.',
            isExecution: false,
            metadata: payload.metadata,
            createdAt: new Date(payload.timestamp || now).toISOString(),
          };
          this.emit('debug_thought', debugThought);
          break;

        case 'order_filled':
          const orderFill: OrderFillData = {
            userAddress: payload.userAddress,
            orderId: payload.orderId,
            marketId: payload.marketId,
            agentType: payload.agentType || payload.agent,
            outcome: payload.outcome,
            direction: payload.direction,
            price: payload.price,
            lotSize: payload.lotSize,
            txHash: payload.txHash,
            timestamp: payload.timestamp || now,
          };
          this.emit('order_filled', orderFill);
          break;

        case 'sweep_completed':
          const sweep: SweepCompleteData = {
            userAddress: payload.userAddress,
            marketId: payload.marketId,
            claimedAmount: payload.claimedAmount,
            txHash: payload.txHash,
            timestamp: payload.timestamp || now,
          };
          this.emit('sweep_completed', sweep);
          break;

        case 'pnl_update':
          const pnlData: PnlUpdateData = {
            updatedOrders: payload.updatedOrders || [],
            timestamp: payload.timestamp || now,
          };
          this.emit('pnl_update', pnlData);
          break;

        case 'swarm_pnl_tick':
          const swarmPnl: SwarmPnlTickData = {
            volt: payload.volt ?? 0,
            oracle: payload.oracle ?? 0,
            titan: payload.titan ?? 0,
            sweeper: payload.sweeper ?? 0,
            totalSwarm: payload.totalSwarm ?? 0,
            timestamp: payload.timestamp || now,
          };
          this.emit('swarm_pnl_tick', swarmPnl);
          break;

        default:
          break;
      }
    } catch {
      // Ignore malformed payloads
    }
  }

  public on<T = any>(event: TelemetryEventType, callback: TelemetryEventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(callback as TelemetryEventCallback);

    // If registering for status, immediately emit current connection state
    if (event === 'status') {
      callback({ isConnected: this.isConnected, latencyMs: this.latencyMs } as any);
    }

    return () => {
      set.delete(callback as TelemetryEventCallback);
    };
  }

  private emit(event: TelemetryEventType, data: any): void {
    const set = this.listeners.get(event);
    if (set && set.size > 0) {
      for (const cb of set) {
        try {
          cb(data);
        } catch (err) {
          console.error(`[TelemetryClient] Error in listener for ${event}:`, err);
        }
      }
    }
  }

  public setUserAddress(address?: string | null): void {
    const formatted = address ? address.toLowerCase() : null;
    if (this.userAddress === formatted) return;
    this.userAddress = formatted;

    if (this.ws && this.ws.readyState === WebSocket.OPEN && formatted) {
      this.ws.send(
        JSON.stringify({
          action: 'subscribe',
          channel: 'user_portfolio',
          params: { userAddress: formatted },
        }),
      );
    }
  }

  public setDebugEnabled(enabled: boolean): void {
    if (this.isDebugEnabled === enabled) return;
    this.isDebugEnabled = enabled;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          action: enabled ? 'subscribe' : 'unsubscribe',
          channel: 'debug_thoughts',
        }),
      );
    }
  }

  public getStatus(): { isConnected: boolean; latencyMs: number } {
    return { isConnected: this.isConnected, latencyMs: this.latencyMs };
  }
}

export const telemetryClient = new TelemetryClient();
