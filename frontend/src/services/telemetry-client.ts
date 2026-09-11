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
  | 'order_cancelled'
  | 'sweep_completed'
  | 'pnl_update'
  | 'swarm_pnl_tick';

export interface OrderCancelledData {
  userAddress: string;
  orderId: string;
  marketId: string;
  txHash?: string;
  timestamp: number;
}

export type TelemetryEventCallback<T = any> = (data: T) => void;

class TelemetryClient {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private latencyMs = 18;
  private pingTime = 0;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private userAddress: string | null = null;
  private authToken: string | null = null;
  private isDebugEnabled = false;

  // PERF-07: application-level watchdog. Browser WebSocket handles protocol
  // ping frames silently (no JS events), so a silently black-holed path
  // leaves readyState === OPEN forever while telemetry freezes. If no packet
  // arrives for STALE_MS, probe with an app-level ping; if the ping goes
  // unanswered, force a reconnect.
  private lastMessageAt = 0;
  private pingSentAt = 0;
  private watchdogTimer: number | null = null;
  private static readonly WATCHDOG_STALE_MS = 30_000;
  private static readonly WATCHDOG_CHECK_MS = 10_000;

  private listeners: Map<TelemetryEventType, Set<TelemetryEventCallback>> = new Map();

  constructor() {
    // Auto-connect when browser window is ready
    if (typeof window !== 'undefined') {
      this.connect();
      this.startWatchdog();

      // Optimize on background tab / foreground visibility change
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
          this.reconnectAttempts = 0;
          this.connect();
        }
      });
    }
  }

  private startWatchdog(): void {
    if (this.watchdogTimer !== null) return;
    this.watchdogTimer = window.setInterval(() => this.checkWatchdog(), TelemetryClient.WATCHDOG_CHECK_MS);
  }

  private checkWatchdog(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - this.lastMessageAt <= TelemetryClient.WATCHDOG_STALE_MS) return;

    if (this.pingSentAt > this.lastMessageAt) {
      // App-level ping went unanswered — half-open zombie socket. Kill it;
      // handleDisconnect() schedules the reconnect with backoff.
      try {
        ws.close();
      } catch {
        // Ignore close errors — handleDisconnect() covers the reconnect.
      }
      this.pingSentAt = 0;
      this.handleDisconnect();
      return;
    }

    // Stale but unprobed — dispatch an app-level ping (server replies 'pong').
    try {
      ws.send(JSON.stringify({ action: 'ping' }));
      this.pingSentAt = now;
    } catch {
      this.handleDisconnect();
    }
  }

  private getWsUrl(): string {
    const rawWsUrl = ((import.meta as any).env?.VITE_BACKEND_WS_URL || '').trim();
    let base: string;
    if (rawWsUrl) {
      const trimmed = rawWsUrl.replace(/\/+$/, '');
      base = trimmed.endsWith('/ws/telemetry') ? trimmed : `${trimmed}/ws/telemetry`;
    } else {
      const rawHttpUrl = ((import.meta as any).env?.VITE_BACKEND_HTTP_URL || '').trim();
      if (rawHttpUrl && (rawHttpUrl.startsWith('http://') || rawHttpUrl.startsWith('https://'))) {
        const wsProtocol = rawHttpUrl.startsWith('https://') ? 'wss://' : 'ws://';
        const cleanHttp = rawHttpUrl.replace(/^https?:\/\//, '').replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
        base = `${wsProtocol}${cleanHttp}/ws/telemetry`;
      } else {
        const loc = window.location;
        const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = loc.hostname;
        const port = (loc.port === '5173' || loc.port === '5174') ? '5000' : loc.port || '5000';
        base = `${protocol}//${host}:${port}/ws/telemetry`;
      }
    }

    // SEC-08: prove wallet ownership at handshake so the server can authorize
    // the private user_portfolio channel. Token refreshes on every (re)connect.
    const token = this.getAuthToken();
    if (token) {
      const sep = base.includes('?') ? '&' : '?';
      return `${base}${sep}token=${encodeURIComponent(token)}`;
    }
    return base;
  }

  /**
   * SEC-08: cached DreamPulse JWT (minted via POST /auth/wallet-verify).
   * Explicitly-set token wins; otherwise read the non-expired cached JWT.
   */
  private getAuthToken(): string | null {
    if (this.authToken) return this.authToken;
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const t = localStorage.getItem('dreampulse_supabase_jwt');
        const e = localStorage.getItem('dreampulse_supabase_jwt_exp');
        if (t && e && t.length > 20) {
          const exp = Number(e);
          if (Number.isFinite(exp) && exp > Math.floor(Date.now() / 1000) + 60) {
            return t;
          }
        }
      }
    } catch {
      // Ignore storage errors — connect unauthenticated (public channels only).
    }
    return null;
  }

  /** Set (or rotate) the JWT used for WS authentication. Reconnects to re-handshake if already connected. */
  public setAuthToken(token?: string | null): void {
    const next = token && token.length > 20 ? token : null;
    if (this.authToken === next) return;
    this.authToken = next;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (next) {
        try {
          this.ws.send(JSON.stringify({ action: 'auth', token: next }));
        } catch {
          // Ignore — resubscribe on next reconnect covers it.
        }
      }
      this.resubscribeAll();
    }
  }

  public clearAuthToken(): void {
    this.setAuthToken(null);
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
        this.lastMessageAt = Date.now();
        this.pingSentAt = 0;
        this.emit('status', { isConnected: true, latencyMs: this.latencyMs });

        // Send initial channel subscriptions
        this.resubscribeAll();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        // Any socket data proves liveness — stamp before parsing.
        this.lastMessageAt = Date.now();
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

    // 0. SEC-08: (re)authenticate first — covers token rotation between reconnects.
    const token = this.getAuthToken();
    if (token) {
      this.ws.send(JSON.stringify({ action: 'auth', token }));
    }

    // 1. Markets channel (public — no identity binding)
    this.ws.send(
      JSON.stringify({
        action: 'subscribe',
        channel: 'markets',
        params: {
          symbols: ['BTC/USD', 'ETH/USD'],
          agentTypes: ['Volt', 'Oracle', 'Titan', 'Sweeper'],
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

  // SECURITY: prototype pollution guard — JSON.parse with __proto__ can pollute Object.prototype (P4)
  private static safeParse(raw: string): any | null {
    try {
      // Use reviver to strip dangerous keys before they are assigned
      const parsed = JSON.parse(raw, (key, value) => {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
        return value;
      });
      // Additional shallow guard: ensure parsed is plain object and does not contain polluted keys at top level
      if (parsed && typeof parsed === 'object') {
        if ('__proto__' in parsed || 'constructor' in parsed) return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  // Lightweight tick validator — replaces full zod for bundle size, but guards malformed tick injection
  private static isValidTick(tick: any): boolean {
    if (!tick || typeof tick !== 'object' || Array.isArray(tick)) return false;
    if (typeof tick.marketId !== 'string' || tick.marketId.length === 0 || tick.marketId.length > 200) return false;
    if (typeof tick.symbol !== 'string') return false;
    if (tick.spotPrice !== undefined && typeof tick.spotPrice !== 'number') return false;
    if (tick.impliedProb !== undefined && typeof tick.impliedProb !== 'number') return false;
    // Reject objects that still contain __proto__ after reviver
    if ('__proto__' in tick || 'constructor' in tick) return false;
    return true;
  }

  private handleMessage(rawData: string): void {
    try {
      const payload = TelemetryClient.safeParse(rawData);
      if (!payload || typeof payload !== 'object') return;
      const now = Date.now();

      switch (payload.event) {
        case 'connected':
          this.latencyMs = Math.max(4, now - this.pingTime);
          this.emit('status', { isConnected: true, latencyMs: this.latencyMs });
          break;

        case 'pong':
          // Watchdog probe reply — refresh the latency readout.
          this.latencyMs = this.pingSentAt > 0 ? Math.max(1, now - this.pingSentAt) : this.latencyMs;
          break;

        case 'market_ticks':
          if (Array.isArray(payload.data)) {
            const validTicks = (payload.data as any[]).filter(TelemetryClient.isValidTick);
            if (validTicks.length > 0) {
              this.emit('market_ticks', validTicks);
              for (const tick of validTicks) {
                this.emit('market_tick', tick);
              }
            }
          }
          break;

        case 'market_tick':
          if (payload.data?.marketId && TelemetryClient.isValidTick(payload.data)) {
            const tick: MarketTickData = {
              marketId: String(payload.data.marketId),
              symbol: String(payload.data.symbol || ''),
              spotPrice: Number(payload.data.spotPrice) || 0,
              strikePrice: Number(payload.data.strikePrice) || 0,
              timeLeftSeconds: Number(payload.data.timeLeftSeconds) || 0,
              impliedProb: Number(payload.data.impliedProb) || 0,
              fairValue: Number(payload.data.fairValue) || 0,
              edge: Number(payload.data.edge) || 0,
              hasAnomaly: Boolean(payload.data.hasAnomaly),
              timestamp: Number(payload.timestamp) || now,
              convictionState: payload.data.convictionState,
              recommendedAction: payload.data.recommendedAction,
              recommendedOutcome: payload.data.recommendedOutcome,
              winProbability: payload.data.winProbability !== undefined ? Number(payload.data.winProbability) : undefined,
              confidenceScore: payload.data.confidenceScore !== undefined ? Number(payload.data.confidenceScore) : undefined,
              priceActionTrend: payload.data.priceActionTrend,
              priceActionScore: payload.data.priceActionScore !== undefined ? Number(payload.data.priceActionScore) : undefined,
              confluenceRationale: typeof payload.data.confluenceRationale === 'string' ? payload.data.confluenceRationale.slice(0, 500) : undefined,
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
            agentType: payload.agentType || payload.agent || 'Volt',
            marketId: payload.marketId,
            triggerEvent: payload.triggerEvent || (payload.isExecution ? 'EXECUTION_CONFIRMED' : 'ALPHA_SIGNAL'),
            confidence: typeof payload.confidence === 'number' ? payload.confidence : 0.94,
            actionTaken: payload.actionTaken || payload.action || 'EXECUTED',
            reasoningText: payload.reasoningText || payload.thought || 'Evaluated Shannon CLOB market.',
            txHash: payload.txHash,
            isExecution: payload.isExecution ?? Boolean(payload.txHash),
            price: payload.price,
            lotSize: payload.lotSize,
            outcome: payload.outcome,
            metadata: payload.metadata,
            createdAt: payload.createdAt || new Date(payload.timestamp || now).toISOString(),
          };
          this.emit('agent_thought', execThought);
          break;

        case 'debug_thought':
          const debugThought: AgentThoughtLog = {
            id: payload.id || `debug-${now}-${Math.random().toString(36).slice(2, 6)}`,
            agentType: payload.agentType || payload.agent || 'Volt',
            marketId: payload.marketId,
            triggerEvent: payload.triggerEvent || 'EVALUATION_TICK',
            confidence: typeof payload.confidence === 'number' ? payload.confidence : 0.90,
            actionTaken: payload.actionTaken || payload.action || 'EVALUATE',
            reasoningText: payload.reasoningText || payload.thought || 'Continuous depth evaluation.',
            isExecution: false,
            metadata: payload.metadata,
            createdAt: payload.createdAt || new Date(payload.timestamp || now).toISOString(),
          };
          this.emit('debug_thought', debugThought);
          break;

        case 'order_filled':
          // Guard: suppress stale account events if disconnected or address mismatch
          if (!this.userAddress) break;
          if (payload.userAddress && payload.userAddress.toLowerCase() !== this.userAddress) break;
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

        case 'order_cancelled':
          if (!this.userAddress) break;
          if (payload.userAddress && payload.userAddress.toLowerCase() !== this.userAddress) break;
          const orderCancelled: OrderCancelledData = {
            userAddress: payload.userAddress,
            orderId: payload.orderId,
            marketId: payload.marketId,
            txHash: payload.txHash,
            timestamp: payload.timestamp || now,
          };
          this.emit('order_cancelled', orderCancelled);
          break;

        case 'sweep_completed':
          if (!this.userAddress) break;
          if (payload.userAddress && payload.userAddress.toLowerCase() !== this.userAddress) break;
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
          if (!this.userAddress) break;
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
    const prevAddress = this.userAddress;
    this.userAddress = formatted;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (prevAddress) {
        this.ws.send(
          JSON.stringify({
            action: 'unsubscribe',
            channel: 'user_portfolio',
            params: { userAddress: prevAddress },
          }),
        );
      }

      if (formatted) {
        // SEC-08: prove ownership before subscribing — the server rejects
        // user_portfolio for unauthenticated sockets and drops spoofed addresses.
        const token = this.getAuthToken();
        if (token) {
          this.ws.send(JSON.stringify({ action: 'auth', token }));
        }
        this.ws.send(
          JSON.stringify({
            action: 'subscribe',
            channel: 'user_portfolio',
            params: { userAddress: formatted },
          }),
        );
      }
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
