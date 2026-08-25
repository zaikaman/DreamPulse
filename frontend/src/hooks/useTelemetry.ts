import { useState, useEffect, useRef, useCallback } from 'react';
import type { AgentThoughtLog } from '../types/index.js';
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

  // Sync user address with multiplexed client
  useEffect(() => {
    if (userAddress) {
      telemetryClient.setUserAddress(userAddress);
    }
  }, [userAddress]);

  const toggleDebugThoughts = useCallback((enable?: boolean) => {
    setIsDebugEnabled((prev) => {
      const nextVal = enable !== undefined ? enable : !prev;
      telemetryClient.setDebugEnabled(nextVal);
      return nextVal;
    });
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
        return [thought, ...prev.slice(0, 99)];
      });
    });

    // 6. User Order Fills
    const unsubOrder = telemetryClient.on('order_filled', (order: OrderFillData) => {
      setRecentOrders((prev) => [order, ...prev.slice(0, 19)]);
    });

    // 7. Sweeper Claims
    const unsubSweep = telemetryClient.on('sweep_completed', (sweep: SweepCompleteData) => {
      setLastSweep(sweep);
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
