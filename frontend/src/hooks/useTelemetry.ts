import { useState, useEffect, useRef, useCallback } from 'react';
import type { AgentThoughtLog } from '../types/index.js';
import { api } from '../services/api.js';
import { subscribeToTable, removeRealtimeChannel } from '../services/supabase.js';
import { soundEngine } from '../services/audio.js';
import {
  telemetryClient,
  type MarketTickData,
  type DepthUpdateData,
  type OrderFillData,
  type SweepCompleteData,
  type PnlUpdateData,
  type SwarmPnlTickData,
} from '../services/telemetry-client.js';

export type {
  MarketTickData,
  DepthUpdateData,
  OrderFillData,
  SweepCompleteData,
  PnlUpdateData,
  SwarmPnlTickData,
};

export function useTelemetry(userAddress?: string) {
  const initialStatus = telemetryClient.getStatus();
  const [isConnected, setIsConnected] = useState<boolean>(initialStatus.isConnected);
  const [latencyMs, setLatencyMs] = useState<number>(initialStatus.latencyMs);
  const [liveTicks, setLiveTicks] = useState<Map<string, MarketTickData>>(new Map());
  const [depthMap, setDepthMap] = useState<Map<string, DepthUpdateData>>(new Map());
  const [agentThoughts, setAgentThoughts] = useState<AgentThoughtLog[]>([]);
  const [debugThoughts, setDebugThoughts] = useState<AgentThoughtLog[]>([]);
  const [isDebugEnabled, setIsDebugEnabled] = useState<boolean>(false);
  const [recentOrders, setRecentOrders] = useState<OrderFillData[]>([]);
  const [lastSweep, setLastSweep] = useState<SweepCompleteData | null>(null);
  const [lastPnlUpdate, setLastPnlUpdate] = useState<PnlUpdateData | null>(null);
  const [lastSwarmPnlTick, setLastSwarmPnlTick] = useState<SwarmPnlTickData | null>(null);

  const pendingTicksRef = useRef<Map<string, MarketTickData>>(new Map());
  const tickRafRef = useRef<number | null>(null);
  const pendingDepthRef = useRef<Map<string, DepthUpdateData>>(new Map());
  const depthRafRef = useRef<number | null>(null);

  // Sync user address with multiplexed client & clean up on disconnect / unmount
  useEffect(() => {
    if (userAddress) {
      telemetryClient.setUserAddress(userAddress);
    } else {
      telemetryClient.setUserAddress(null);
      setRecentOrders([]);
      setLastSweep(null);
      setLastPnlUpdate(null);
    }

    return () => {
      telemetryClient.setUserAddress(null);
      setRecentOrders([]);
      setLastSweep(null);
      setLastPnlUpdate(null);
    };
  }, [userAddress]);

  const toggleDebugThoughts = useCallback((enable?: boolean) => {
    setIsDebugEnabled((prev) => {
      const nextVal = enable !== undefined ? enable : !prev;
      telemetryClient.setDebugEnabled(nextVal);
      return nextVal;
    });
  }, []);

  // Hydrate initial historical thoughts & maintain real-time sync via Supabase Realtime + polling heartbeat
  useEffect(() => {
    let isMounted = true;

    const parseLogItem = (raw: any): AgentThoughtLog => {
      const meta = raw.metadata || {};
      const tx = raw.txHash || raw.tx_hash || meta.txHash;
      const isExec = raw.isExecution ?? (meta.isExecution ?? Boolean(tx));
      const agent = raw.agentType || raw.agent_type || raw.agent || 'Volt';
      const action = raw.actionTaken || raw.action_taken || raw.action || (isExec ? 'EXECUTED' : 'ALPHA_SIGNAL');
      const reasoning = raw.reasoningText || raw.reasoning_text || raw.thought || (meta.rationale ?? 'Evaluated Shannon CLOB market.');

      return {
        id: String(raw.id || `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
        agentType: agent,
        marketId: raw.marketId || raw.market_id || meta.marketId,
        triggerEvent: raw.triggerEvent || raw.trigger_event || (isExec ? 'EXECUTION_CONFIRMED' : 'ALPHA_SIGNAL'),
        confidence: typeof raw.confidence === 'number' ? raw.confidence : (meta.confidence ?? 0.94),
        actionTaken: action,
        reasoningText: reasoning,
        txHash: tx,
        isExecution: isExec,
        price: raw.price ?? meta.price,
        lotSize: raw.lotSize ?? meta.lotSize,
        outcome: raw.outcome ?? meta.outcome,
        metadata: meta,
        createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
      };
    };

    const loadThoughts = async () => {
      try {
        const res = await api.getAgentLogs(undefined, 100);
        if (!isMounted || !res?.logs || !Array.isArray(res.logs)) return;

        const allParsed = res.logs.map(parseLogItem);
        const sorted = allParsed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setAgentThoughts((prev) => {
          const map = new Map<string, AgentThoughtLog>();
          // Existing newest stream items take precedence
          for (const item of prev) {
            map.set(item.id, item);
          }
          for (const item of sorted) {
            if (!map.has(item.id)) {
              map.set(item.id, item);
            }
          }
          return Array.from(map.values())
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 100);
        });

        const debugOnly = sorted.filter((t) => !t.isExecution);
        setDebugThoughts((prev) => {
          const map = new Map<string, AgentThoughtLog>();
          for (const item of prev) {
            map.set(item.id, item);
          }
          for (const item of debugOnly) {
            if (!map.has(item.id)) {
              map.set(item.id, item);
            }
          }
          return Array.from(map.values())
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 100);
        });
      } catch (err) {
        console.warn('[useTelemetry] Non-critical: could not sync thoughts:', err);
      }
    };

    // Initial load
    loadThoughts();

    // Redundant Supabase Realtime channel for instant DB push notifications
    const realtimeChannel = subscribeToTable('agent_logs', (newRow) => {
      if (!isMounted || !newRow) return;
      const item = parseLogItem(newRow);

      setAgentThoughts((prev) => {
        const isDup = prev.slice(0, 15).some((t) => (item.txHash && t.txHash === item.txHash) || t.id === item.id);
        if (isDup) return prev;

        if (item.isExecution || item.txHash) {
          soundEngine.playAgentExecution();
        } else if (item.confidence >= 0.95) {
          soundEngine.playAnomalyAlert();
        } else {
          soundEngine.playAgentThought();
        }

        return [item, ...prev.slice(0, 99)];
      });

      if (!item.isExecution) {
        setDebugThoughts((prev) => {
          const isDup = prev.slice(0, 15).some((t) => t.id === item.id);
          if (isDup) return prev;
          return [item, ...prev.slice(0, 99)];
        });
      }
    });

    // 4-second polling heartbeat as bulletproof fallback when tab is visible
    const interval = setInterval(() => {
      if (!isMounted) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      loadThoughts();
    }, 4000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      removeRealtimeChannel(realtimeChannel);
    };
  }, []);

  useEffect(() => {
    // 1. Connection Status
    const unsubStatus = telemetryClient.on('status', (status: { isConnected: boolean; latencyMs: number }) => {
      setIsConnected(status.isConnected);
      setLatencyMs(status.latencyMs);
    });

    // 2. Batched Market Ticks with RAF Coalescing (60 FPS)
    const unsubTicks = telemetryClient.on('market_ticks', (ticks: MarketTickData[]) => {
      for (const tick of ticks) {
        if (tick.marketId) {
          pendingTicksRef.current.set(tick.marketId, tick);
        }
      }
      if (tickRafRef.current == null) {
        tickRafRef.current = requestAnimationFrame(() => {
          setLiveTicks(new Map(pendingTicksRef.current));
          tickRafRef.current = null;
        });
      }
    });

    // 3. Depth Ladder Updates with RAF Coalescing
    const unsubDepth = telemetryClient.on('depth_update', (depth: DepthUpdateData) => {
      if (depth.marketId) {
        pendingDepthRef.current.set(depth.marketId, depth);
        if (depthRafRef.current == null) {
          depthRafRef.current = requestAnimationFrame(() => {
            setDepthMap(new Map(pendingDepthRef.current));
            depthRafRef.current = null;
          });
        }
      }
    });

    // 4. Executed Agent Thoughts
    const unsubThought = telemetryClient.on('agent_thought', (thought: AgentThoughtLog) => {
      setAgentThoughts((prev) => {
        const isDuplicate = prev.slice(0, 10).some(
          (t) => (t.txHash && t.txHash === thought.txHash) || t.id === thought.id,
        );
        if (isDuplicate) return prev;

        if (thought.isExecution || thought.txHash) {
          soundEngine.playAgentExecution();
        } else if (thought.confidence >= 0.95) {
          soundEngine.playAnomalyAlert();
        } else {
          soundEngine.playAgentThought();
        }

        return [thought, ...prev.slice(0, 79)];
      });
    });

    // 5. Opt-in Debug Thoughts
    const unsubDebug = telemetryClient.on('debug_thought', (thought: AgentThoughtLog) => {
      setDebugThoughts((prev) => {
        const isDuplicate = prev.slice(0, 5).some(
          (t) => t.agentType === thought.agentType && t.reasoningText === thought.reasoningText,
        );
        if (isDuplicate) return prev;
        soundEngine.playAgentThought();
        return [thought, ...prev.slice(0, 99)];
      });
    });

    // 6. User Order Fills
    const unsubOrder = telemetryClient.on('order_filled', (order: OrderFillData) => {
      setRecentOrders((prev) => [order, ...prev.slice(0, 19)]);
      soundEngine.playTradeFill();
    });

    // 7. Sweeper Claims
    const unsubSweep = telemetryClient.on('sweep_completed', (sweep: SweepCompleteData) => {
      setLastSweep(sweep);
      soundEngine.playWinChime();
    });

    // 8. PnL Updates
    const unsubPnl = telemetryClient.on('pnl_update', (pnl: PnlUpdateData) => {
      setLastPnlUpdate(pnl);
    });

    // 9. Swarm PnL Tick
    const unsubSwarmPnl = telemetryClient.on('swarm_pnl_tick', (swarmPnl: SwarmPnlTickData) => {
      setLastSwarmPnlTick(swarmPnl);
    });

    return () => {
      // Clean up all multiplexed WebSocket telemetry listeners to avoid memory leaks on view switching.
      // (Supabase Realtime channels in hooks like usePersonalSwarm/useMarkets/useSessionKey
      // call supabase.removeChannel(channel) alongside channel.unsubscribe() on teardown).
      unsubStatus();
      unsubTicks();
      unsubDepth();
      unsubThought();
      unsubDebug();
      unsubOrder();
      unsubSweep();
      unsubPnl();
      unsubSwarmPnl();

      if (tickRafRef.current != null) {
        cancelAnimationFrame(tickRafRef.current);
        tickRafRef.current = null;
      }
      if (depthRafRef.current != null) {
        cancelAnimationFrame(depthRafRef.current);
        depthRafRef.current = null;
      }
    };
  }, []);

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
