import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';

export interface ClientSubscription {
  ws: WebSocket;
  channels: Set<string>;
  symbols: Set<string>;
  agentTypes: Set<string>;
  userAddresses: Set<string>;
}

export class TelemetryWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ClientSubscription> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  /**
   * Initializes WebSocket server attached to the main Express HTTP server.
   */
  public initialize(server: HttpServer): WebSocketServer {
    this.wss = new WebSocketServer({ server, path: '/ws/telemetry' });

    this.wss.on('connection', (ws: WebSocket) => {
      const subscription: ClientSubscription = {
        ws,
        channels: new Set(['markets', 'agent_thoughts']), // Default channels
        symbols: new Set(['BTC/USD', 'ETH/USD']),
        agentTypes: new Set(['Volt', 'Oracle', 'Titan', 'Sweeper']),
        userAddresses: new Set(),
      };

      this.clients.set(ws, subscription);

      ws.on('message', (data: Buffer | string) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(ws, message);
        } catch (_err) {
          // Ignore malformed JSON
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });

      // Send initial welcome
      this.sendToClient(ws, {
        event: 'connected',
        timestamp: Date.now(),
        message: 'DreamPulse High-Frequency Telemetry Stream Connected',
      });
    });

    // Heartbeat to keep connections alive
    this.pingInterval = setInterval(() => {
      if (!this.wss) return;
      for (const [ws] of this.clients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }
    }, 30000);

    return this.wss;
  }

  /**
   * Handles incoming client messages and channel subscriptions.
   */
  private handleClientMessage(ws: WebSocket, message: Record<string, any>): void {
    const sub = this.clients.get(ws);
    if (!sub) return;

    if (message.action === 'subscribe') {
      const channel = message.channel;
      if (channel) {
        sub.channels.add(channel);
      }
      if (message.params?.symbols && Array.isArray(message.params.symbols)) {
        message.params.symbols.forEach((s: string) => sub.symbols.add(s));
      }
      if (message.params?.agentTypes && Array.isArray(message.params.agentTypes)) {
        message.params.agentTypes.forEach((a: string) => sub.agentTypes.add(a));
      }
      if (message.params?.userAddress) {
        sub.userAddresses.add(message.params.userAddress.toLowerCase());
      }

      this.sendToClient(ws, {
        event: 'subscribed',
        channel,
        status: 'ok',
      });
    } else if (message.action === 'unsubscribe') {
      if (message.channel) {
        sub.channels.delete(message.channel);
      }
    }
  }

  /**
   * Broadcasts a 100ms market tick update to subscribers.
   */
  public broadcastMarketTick(data: {
    marketId: string;
    symbol: string;
    spotPrice: number;
    strikePrice: number;
    timeLeftSeconds: number;
    impliedProb: number;
    fairValue: number;
    edge: number;
    hasAnomaly: boolean;
  }): void {
    const payload = {
      event: 'market_tick',
      timestamp: Date.now(),
      data,
    };

    for (const [, sub] of this.clients) {
      if (
        sub.ws.readyState === WebSocket.OPEN &&
        sub.channels.has('markets') &&
        (sub.symbols.size === 0 || sub.symbols.has(data.symbol))
      ) {
        sub.ws.send(JSON.stringify(payload));
      }
    }
  }

  /**
   * Broadcasts order book depth ladder updates.
   */
  public broadcastDepthUpdate(data: {
    marketId: string;
    bestBid: number;
    bestAsk: number;
    bids: Array<[number, number]>;
    asks: Array<[number, number]>;
  }): void {
    const payload = {
      event: 'depth_update',
      timestamp: Date.now(),
      ...data,
    };

    for (const [, sub] of this.clients) {
      if (sub.ws.readyState === WebSocket.OPEN && sub.channels.has('markets')) {
        sub.ws.send(JSON.stringify(payload));
      }
    }
  }

  /**
   * Broadcasts live executed AI agent trade log on main feed.
   */
  public broadcastAgentThought(thought: {
    id?: string;
    agent: string;
    marketId?: string;
    confidence: number;
    action: string;
    thought: string;
    txHash?: string;
    price?: number;
    lotSize?: number;
    outcome?: string;
    isExecution?: boolean;
    timestamp?: number;
  }): void {
    const payload = {
      event: 'agent_thought',
      timestamp: thought.timestamp || Date.now(),
      isExecution: thought.isExecution ?? true,
      ...thought,
    };

    for (const [, sub] of this.clients) {
      if (
        sub.ws.readyState === WebSocket.OPEN &&
        sub.channels.has('agent_thoughts') &&
        (sub.agentTypes.size === 0 || sub.agentTypes.has(thought.agent))
      ) {
        sub.ws.send(JSON.stringify(payload));
      }
    }
  }

  /**
   * Broadcasts raw evaluation trace thoughts exclusively to opt-in debug channel subscribers.
   */
  public broadcastDebugThought(thought: {
    id?: string;
    agent: string;
    marketId?: string;
    confidence: number;
    action: string;
    thought: string;
    triggerEvent?: string;
    metadata?: Record<string, unknown>;
    isExecution?: boolean;
    timestamp?: number;
  }): void {
    const payload = {
      event: 'debug_thought',
      timestamp: thought.timestamp || Date.now(),
      isExecution: false,
      ...thought,
    };

    for (const [, sub] of this.clients) {
      if (
        sub.ws.readyState === WebSocket.OPEN &&
        sub.channels.has('debug_thoughts') &&
        (sub.agentTypes.size === 0 || sub.agentTypes.has(thought.agent))
      ) {
        sub.ws.send(JSON.stringify(payload));
      }
    }
  }

  /**
   * Broadcasts order fill confirmation to user portfolio subscribers.
   */
  public broadcastOrderFilled(order: {
    userAddress: string;
    orderId: string;
    marketId: string;
    agentType?: string;
    outcome: string;
    direction: string;
    price: number;
    lotSize: number;
    txHash?: string;
  }): void {
    const payload = {
      event: 'order_filled',
      timestamp: Date.now(),
      ...order,
    };

    for (const [, sub] of this.clients) {
      if (
        sub.ws.readyState === WebSocket.OPEN &&
        (sub.channels.has('user_portfolio') || sub.userAddresses.has(order.userAddress.toLowerCase()))
      ) {
        sub.ws.send(JSON.stringify(payload));
      }
    }
  }

  /**
   * Broadcasts completed settlement sweep confirmation.
   */
  public broadcastSweepCompleted(sweep: {
    userAddress: string;
    marketId: string;
    claimedAmount: string;
    txHash?: string;
  }): void {
    const payload = {
      event: 'sweep_completed',
      timestamp: Date.now(),
      ...sweep,
    };

    for (const [, sub] of this.clients) {
      if (
        sub.ws.readyState === WebSocket.OPEN &&
        (sub.channels.has('user_portfolio') || sub.userAddresses.has(sweep.userAddress.toLowerCase()))
      ) {
        sub.ws.send(JSON.stringify(payload));
      }
    }
  }

  /**
   * Broadcasts realtime PnL settlement updates (per-trade resolved PnL) to all clients.
   * This ensures swarm and portfolio PnL reflect true trade-by-trade results instantly without polling delay.
   */
  public broadcastPnlUpdate(data: {
    updatedOrders: Array<{ orderId: string; marketId: string; pnl: number; outcome: string; winningOutcome: string }>;
    timestamp: number;
  }): void {
    const payload = {
      event: 'pnl_update',
      timestamp: data.timestamp,
      updatedOrders: data.updatedOrders,
    };
    for (const [, sub] of this.clients) {
      if (sub.ws.readyState === WebSocket.OPEN) {
        // Broadcast to all connected clients; frontends filter by user if needed
        sub.ws.send(JSON.stringify(payload));
      }
    }
  }

  /**
   * Broadcasts aggregated swarm PnL telementry tick (for header KPI streaming).
   */
  public broadcastSwarmPnl(telemetry: {
    volt: number;
    oracle: number;
    titan: number;
    sweeper: number;
    totalSwarm: number;
    timestamp: number;
  }): void {
    const payload = {
      event: 'swarm_pnl_tick',
      ...telemetry,
    };
    for (const [, sub] of this.clients) {
      if (sub.ws.readyState === WebSocket.OPEN) {
        sub.ws.send(JSON.stringify(payload));
      }
    }
  }

  private sendToClient(ws: WebSocket, payload: Record<string, any>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  public getConnectedClientCount(): number {
    return this.clients.size;
  }

  public close(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.wss) this.wss.close();
  }
}

export const telemetryWsGateway = new TelemetryWebSocketServer();
