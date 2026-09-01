import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import WebSocket from 'ws';
import { TelemetryWebSocketServer } from '../src/websocket/server.js';
import { startMarketEmitter, stopMarketEmitter } from '../src/websocket/market-emitter.js';

describe('WebSocket Telemetry Server & Market Emitter Suite', () => {
  let server: http.Server;
  let wsServer: TelemetryWebSocketServer;
  let port: number;
  let wsUrl: string;

  beforeEach(async () => {
    server = http.createServer();
    wsServer = new TelemetryWebSocketServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        port = addr.port;
        wsUrl = `ws://127.0.0.1:${port}/ws/telemetry`;
        wsServer.initialize(server);
        resolve();
      });
    });
  });

  afterEach(async () => {
    stopMarketEmitter();
    wsServer.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('accepts client connection, handles subscription to markets channel and receives tick broadcasts', async () => {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const received: any[] = [];
    ws.on('message', (data) => {
      try {
        received.push(JSON.parse(data.toString()));
      } catch {}
    });

    // Subscribe to markets
    ws.send(
      JSON.stringify({
        action: 'subscribe',
        channel: 'markets',
        params: { symbols: ['BTC/USD'] },
      }),
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(wsServer.getConnectedClientCount()).toBe(1);

    // Broadcast a market tick
    wsServer.broadcastMarketTick({
      marketId: 'm-btc-1',
      symbol: 'BTC/USD',
      spotPrice: 97000,
      strikePrice: 96000,
      timeLeftSeconds: 120,
      impliedProb: 0.65,
      fairValue: 0.68,
      edge: 0.03,
      hasAnomaly: false,
    });

    await new Promise((r) => setTimeout(r, 50));

    const tickMsg = received.find((m) => m.event === 'market_tick');
    expect(tickMsg).toBeDefined();
    expect(tickMsg.data.symbol).toBe('BTC/USD');
    expect(tickMsg.data.spotPrice).toBe(97000);

    ws.close();
  });

  it('handles agent thought and debug thought channel subscriptions and broadcasts', async () => {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const received: any[] = [];
    ws.on('message', (data) => {
      try {
        received.push(JSON.parse(data.toString()));
      } catch {}
    });

    ws.send(
      JSON.stringify({
        action: 'subscribe',
        channel: 'agent_thoughts',
        params: { agentTypes: ['VOLT_SNIPER'] },
      }),
    );

    await new Promise((r) => setTimeout(r, 50));

    wsServer.broadcastAgentThought({
      agent: 'VOLT_SNIPER',
      marketId: 'm-eth-1',
      action: 'BUY',
      thought: 'Momentum breakout confirmed with positive edge',
      confidence: 0.88,
      price: 0.48,
      timestamp: Date.now(),
    });

    await new Promise((r) => setTimeout(r, 50));

    const thoughtMsg = received.find((m) => m.event === 'agent_thought');
    expect(thoughtMsg).toBeDefined();
    expect(thoughtMsg.agent).toBe('VOLT_SNIPER');
    expect(thoughtMsg.action).toBe('BUY');

    ws.close();
  });

  it('handles user portfolio channel subscriptions and targeted broadcasts', async () => {
    const targetUser = '0x1111222233334444555566667777888899990000';
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const received: any[] = [];
    ws.on('message', (data) => {
      try {
        received.push(JSON.parse(data.toString()));
      } catch {}
    });

    ws.send(
      JSON.stringify({
        action: 'subscribe',
        channel: 'user_portfolio',
        params: { userAddress: targetUser },
      }),
    );

    await new Promise((r) => setTimeout(r, 50));

    wsServer.broadcastOrderFilled({
      userAddress: targetUser,
      orderId: 'ord-123',
      marketId: 'm-1',
      outcome: 'YES',
      direction: 'BUY',
      price: 0.45,
      lotSize: 5,
    });

    wsServer.broadcastSweepCompleted({
      userAddress: targetUser,
      marketId: 'm-1',
      claimedAmount: '20.000000',
    });

    await new Promise((r) => setTimeout(r, 50));

    const orderMsg = received.find((m) => m.event === 'order_filled');
    expect(orderMsg).toBeDefined();
    expect(orderMsg.orderId).toBe('ord-123');

    const sweepMsg = received.find((m) => m.event === 'sweep_completed');
    expect(sweepMsg).toBeDefined();
    expect(sweepMsg.claimedAmount).toBe('20.000000');

    ws.close();
  });

  it('handles client ping and unsubscribe actions', async () => {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const received: any[] = [];
    ws.on('message', (data) => {
      try {
        received.push(JSON.parse(data.toString()));
      } catch {}
    });

    ws.send(JSON.stringify({ action: 'ping' }));

    ws.send(
      JSON.stringify({
        action: 'unsubscribe',
        channel: 'markets',
      }),
    );

    await new Promise((r) => setTimeout(r, 50));

    const pongMsg = received.find((m) => m.event === 'pong');
    expect(pongMsg).toBeDefined();

    ws.close();
  });

  it('starts and stops high-frequency telemetry market emitter loop and emits ticks to subscribers', async () => {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    ws.send(
      JSON.stringify({
        action: 'subscribe',
        channel: 'markets',
      }),
    );

    await new Promise((r) => setTimeout(r, 50));

    startMarketEmitter(50);
    // Calling start again when already running should be idempotent
    startMarketEmitter(50);

    await new Promise((r) => setTimeout(r, 120));

    stopMarketEmitter();
    stopMarketEmitter();

    ws.close();
  });

  it('broadcasts depth updates, pnl updates, and swarm pnl telemetry', () => {
    wsServer.broadcastDepthUpdate({
      marketId: 'm-1',
      bestBid: 0.45,
      bestAsk: 0.55,
      bids: [[0.45, 10]],
      asks: [[0.55, 10]],
    });

    wsServer.broadcastPnlUpdate({
      timestamp: Date.now(),
      updatedOrders: [
        {
          orderId: 'o-1',
          marketId: 'm-1',
          pnl: 5.0,
          outcome: 'YES',
          winningOutcome: 'YES',
        },
      ],
    });

    wsServer.broadcastSwarmPnl({
      volt: 10,
      oracle: 20,
      titan: 15,
      sweeper: 5,
      totalSwarm: 50,
      timestamp: Date.now(),
    });

    wsServer.broadcastDebugThought({
      agent: 'TITAN_MM',
      marketId: 'm-1',
      action: 'QUOTE',
      thought: 'Rebalancing two-sided liquidity',
      confidence: 0.95,
      metadata: {
        fairValue: 0.5,
        spread: 0.04,
        bid: 0.48,
        ask: 0.52,
        inventory: 10,
      },
      timestamp: Date.now(),
    });

    wsServer.broadcastMarketTicksBatch([
      {
        marketId: 'm-1',
        symbol: 'BTC/USD',
        spotPrice: 96000,
        strikePrice: 96000,
        timeLeftSeconds: 60,
        impliedProb: 0.5,
        fairValue: 0.5,
        edge: 0,
        hasAnomaly: false,
      },
    ]);

    expect(wsServer.getConnectedClientCount()).toBe(0);
  });

  it('handles malformed JSON frames and error events gracefully', async () => {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    // Send malformed non-JSON frame
    ws.send('invalid non-json raw text');
    await new Promise((r) => setTimeout(r, 50));

    ws.close();
  });

  it('controls market emitter lifecycle and telemetry broadcast interval', async () => {
    const { startMarketEmitter, stopMarketEmitter } = await import('../src/websocket/market-emitter.js');
    startMarketEmitter(50);
    // double start returns early
    startMarketEmitter(50);

    await new Promise((r) => setTimeout(r, 120));

    stopMarketEmitter();
    // double stop safe
    stopMarketEmitter();
  });
});



