import { useState, useEffect, useRef, useCallback } from 'react';
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

export function useTelemetry(userAddress?: string) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [latencyMs, setLatencyMs] = useState<number>(18);
  const [liveTicks, setLiveTicks] = useState<Map<string, MarketTickData>>(new Map());
  const [depthMap, setDepthMap] = useState<Map<string, DepthUpdateData>>(new Map());
  const [agentThoughts, setAgentThoughts] = useState<AgentThoughtLog[]>([]);
  const [debugThoughts, setDebugThoughts] = useState<AgentThoughtLog[]>([]);
  const [isDebugEnabled, setIsDebugEnabled] = useState<boolean>(false);
  const [recentOrders, setRecentOrders] = useState<OrderFillData[]>([]);
  const [lastSweep, setLastSweep] = useState<SweepCompleteData | null>(null);
  const [lastPnlUpdate, setLastPnlUpdate] = useState<PnlUpdateData | null>(null);
  const [lastSwarmPnlTick, setLastSwarmPnlTick] = useState<SwarmPnlTickData | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingTimeRef = useRef<number>(0);
  const isDebugEnabledRef = useRef<boolean>(isDebugEnabled);
  isDebugEnabledRef.current = isDebugEnabled;

  const getWsUrl = useCallback(() => {
    if (import.meta.env.VITE_BACKEND_WS_URL) {
      return import.meta.env.VITE_BACKEND_WS_URL;
    }
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    // If running in Vite dev mode on 5173, backend defaults to 5000
    const host = loc.hostname;
    const port = loc.port === '5173' ? '5000' : loc.port || '5000';
    return `${protocol}//${host}:${port}/ws/telemetry`;
  }, []);

  const connect = useCallback(() => {
    try {
      const url = getWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        pingTimeRef.current = Date.now();

        // Subscribe to public telemetry channels and optional user channel
        const subMessage = {
          action: 'subscribe',
          channel: 'markets',
          params: {
            symbols: ['BTC/USD', 'ETH/USD'],
            agentTypes: ['Volt', 'Oracle', 'Titan', 'Sweeper'],
            userAddress: userAddress || undefined,
          },
        };
        ws.send(JSON.stringify(subMessage));

        // Subscribe to main executed agent thoughts channel
        ws.send(
          JSON.stringify({
            action: 'subscribe',
            channel: 'agent_thoughts',
          }),
        );

        // If debug was active prior to reconnect, subscribe to debug thoughts
        if (isDebugEnabledRef.current) {
          ws.send(
            JSON.stringify({
              action: 'subscribe',
              channel: 'debug_thoughts',
            }),
          );
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const now = Date.now();

          switch (payload.event) {
            case 'connected':
              setLatencyMs(Math.max(4, now - pingTimeRef.current));
              break;

            case 'market_tick':
              if (payload.data?.marketId) {
                setLiveTicks((prev) => {
                  const next = new Map(prev);
                  next.set(payload.data.marketId, {
                    ...payload.data,
                    timestamp: payload.timestamp || now,
                  });
                  return next;
                });
              }
              break;

            case 'depth_update':
              if (payload.marketId) {
                setDepthMap((prev) => {
                  const next = new Map(prev);
                  next.set(payload.marketId, {
                    marketId: payload.marketId,
                    bestBid: payload.bestBid,
                    bestAsk: payload.bestAsk,
                    bids: payload.bids || [],
                    asks: payload.asks || [],
                    timestamp: payload.timestamp || now,
                  });
                  return next;
                });
              }
              break;

            // Main stream: Authentic executed agent decisions and on-chain trades
            case 'agent_thought':
              const newExecThought: AgentThoughtLog = {
                id: payload.id || `exec-${now}-${Math.random().toString(36).slice(2, 6)}`,
                agentType: payload.agent || 'Volt',
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

              setAgentThoughts((prev) => {
                const isDuplicate = prev.slice(0, 10).some(
                  (t) => (t.txHash && t.txHash === newExecThought.txHash) || (t.id === newExecThought.id),
                );
                if (isDuplicate) {
                  return prev;
                }
                return [newExecThought, ...prev.slice(0, 79)];
              });
              break;

            // Opt-in debug stream: Internal evaluation traces
            case 'debug_thought':
              const newDebugThought: AgentThoughtLog = {
                id: payload.id || `debug-${now}-${Math.random().toString(36).slice(2, 6)}`,
                agentType: payload.agent || 'Volt',
                marketId: payload.marketId,
                triggerEvent: payload.triggerEvent || 'EVALUATION_TICK',
                confidence: payload.confidence ?? 0.90,
                actionTaken: payload.action || 'EVALUATE',
                reasoningText: payload.thought || 'Continuous depth evaluation.',
                isExecution: false,
                metadata: payload.metadata,
                createdAt: new Date(payload.timestamp || now).toISOString(),
              };

              setDebugThoughts((prev) => {
                const isDuplicate = prev.slice(0, 5).some(
                  (t) => t.agentType === newDebugThought.agentType && t.reasoningText === newDebugThought.reasoningText,
                );
                if (isDuplicate) {
                  return prev;
                }
                return [newDebugThought, ...prev.slice(0, 99)];
              });
              break;

            case 'order_filled':
              const orderData: OrderFillData = {
                userAddress: payload.userAddress,
                orderId: payload.orderId,
                marketId: payload.marketId,
                outcome: payload.outcome,
                direction: payload.direction,
                price: payload.price,
                lotSize: payload.lotSize,
                txHash: payload.txHash,
                timestamp: payload.timestamp || now,
              };
              setRecentOrders((prev) => [orderData, ...prev.slice(0, 19)]);
              break;

            case 'sweep_completed':
              const sweepData: SweepCompleteData = {
                userAddress: payload.userAddress,
                marketId: payload.marketId,
                claimedAmount: payload.claimedAmount,
                txHash: payload.txHash,
                timestamp: payload.timestamp || now,
              };
              setLastSweep(sweepData);
              break;

            case 'pnl_update':
              setLastPnlUpdate({
                updatedOrders: payload.updatedOrders || [],
                timestamp: payload.timestamp || now,
              });
              break;

            case 'swarm_pnl_tick':
              setLastSwarmPnlTick({
                volt: payload.volt ?? 0,
                oracle: payload.oracle ?? 0,
                titan: payload.titan ?? 0,
                sweeper: payload.sweeper ?? 0,
                totalSwarm: payload.totalSwarm ?? 0,
                timestamp: payload.timestamp || now,
              });
              break;

            default:
              break;
          }
        } catch (_err) {
          // Ignore message parse errors
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        // Exponential backoff reconnect
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setIsConnected(false);
      };
    } catch (_err) {
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    }
  }, [getWsUrl, userAddress]);

  const toggleDebugThoughts = useCallback((enable?: boolean) => {
    setIsDebugEnabled((prev) => {
      const nextVal = enable !== undefined ? enable : !prev;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        if (nextVal) {
          wsRef.current.send(JSON.stringify({ action: 'subscribe', channel: 'debug_thoughts' }));
        } else {
          wsRef.current.send(JSON.stringify({ action: 'unsubscribe', channel: 'debug_thoughts' }));
        }
      }
      return nextVal;
    });
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected,
    latencyMs,
    liveTicks,
    depthMap,
    agentThoughts,
    debugThoughts,
    isDebugEnabled,
    toggleDebugThoughts,
    recentOrders,
    lastSweep,
    lastPnlUpdate,
    lastSwarmPnlTick,
  };
}
