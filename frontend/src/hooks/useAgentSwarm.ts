import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/api.js';
import type { AgentType, OrderExecution, SwarmStatusSummary } from '../types/index.js';
import {
  telemetryClient,
  type SwarmPnlTickData,
  type OrderFillData,
  type SweepCompleteData,
  type PnlUpdateData,
} from '../services/telemetry-client.js';
import { shouldPoll, STALE_TIMES } from '../lib/polling.js';

export interface AgentDetail {
  agentType: AgentType;
  isEnabled: boolean;
  status: 'ACTIVE' | 'PAUSED' | 'IDLE' | 'ERROR';
  evalLatencyMs: number;
  tradesToday: number;
  pnlAmount: number;
  lastAction: string;
  lastActionTimestamp: number;
  config?: Record<string, any>;
}

export interface UseAgentSwarmReturn {
  summary: SwarmStatusSummary;
  detailed: Record<string, AgentDetail>;
  orders: OrderExecution[];
  isLoading: boolean;
  error: string | null;
  toggleAgent: (agentType: AgentType, enabled: boolean) => Promise<boolean>;
  updateConfig: (agentType: AgentType, config: Record<string, any>) => Promise<boolean>;
  refreshOrders: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

let sharedSummary: SwarmStatusSummary = {
  volt: { status: 'ACTIVE', evalLatencyMs: 0, tradesToday: 0, pnl: '+0.00 tUSDC' },
  oracle: { status: 'ACTIVE', evalLatencyMs: 0, tradesToday: 0, pnl: '+0.00 tUSDC' },
  titan: { status: 'ACTIVE', activeQuotes: 0, spreadCaptured: '+0.00 tUSDC' },
  sweeper: { status: 'ACTIVE', lastSweep: new Date().toISOString(), totalClaimed: '0.00 tUSDC' },
};

let sharedDetailed: Record<string, AgentDetail> = {
  volt: {
    agentType: 'Volt',
    isEnabled: true,
    status: 'ACTIVE',
    evalLatencyMs: 0,
    tradesToday: 0,
    pnlAmount: 0.0,
    lastAction: 'INITIALIZING',
    lastActionTimestamp: Date.now(),
    config: { driftThreshold: 0.002, minEdge: 0.03, lotSize: 5.0 },
  },
  oracle: {
    agentType: 'Oracle',
    isEnabled: true,
    status: 'ACTIVE',
    evalLatencyMs: 0,
    tradesToday: 0,
    pnlAmount: 0.0,
    lastAction: 'INITIALIZING',
    lastActionTimestamp: Date.now(),
    config: { minEdge: 0.035, lotSize: 5.0 },
  },
  titan: {
    agentType: 'Titan',
    isEnabled: true,
    status: 'ACTIVE',
    evalLatencyMs: 0,
    tradesToday: 0,
    pnlAmount: 0.0,
    lastAction: 'INITIALIZING',
    lastActionTimestamp: Date.now(),
    config: { targetSpread: 0.04, inventoryAversion: 0.015, lotSize: 2.0 },
  },
  sweeper: {
    agentType: 'Sweeper',
    isEnabled: true,
    status: 'ACTIVE',
    evalLatencyMs: 0,
    tradesToday: 0,
    pnlAmount: 0.0,
    lastAction: 'INITIALIZING',
    lastActionTimestamp: Date.now(),
    config: {},
  },
};

const listeners = new Set<() => void>();

function updateSharedState(updater: (prevDetailed: Record<string, AgentDetail>, prevSummary: SwarmStatusSummary) => { detailed?: Record<string, AgentDetail>; summary?: SwarmStatusSummary }) {
  const result = updater(sharedDetailed, sharedSummary);
  if (result.detailed) sharedDetailed = result.detailed;
  if (result.summary) sharedSummary = result.summary;
  listeners.forEach((fn) => fn());
}

export const useAgentSwarm = (operatorAddress?: string): UseAgentSwarmReturn => {
  const [summary, setSummary] = useState<SwarmStatusSummary>(sharedSummary);
  const [detailed, setDetailed] = useState<Record<string, AgentDetail>>(sharedDetailed);

  // Subscribe to global shared updates
  useEffect(() => {
    const onUpdate = () => {
      setSummary(sharedSummary);
      setDetailed(sharedDetailed);
    };
    listeners.add(onUpdate);
    return () => {
      listeners.delete(onUpdate);
    };
  }, []);

  // Orders are now server-paginated inside OrderHistoryTable — this hook keeps a
  // deprecated empty array for backwards compat but no longer bulk-loads trades.
  const [orders] = useState<OrderExecution[]>([]);
  const [isLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Throttle + dedupe to prevent ERR_INSUFFICIENT_RESOURCES storm
  const lastFetchAtRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);
  const wsDebounceRef = useRef<number | null>(null);

  const fetchSwarmStatus = useCallback(async () => {
    const now = Date.now();
    if (inFlightRef.current) return;
    if (now - lastFetchAtRef.current < 1000) return;
    lastFetchAtRef.current = now;
    inFlightRef.current = true;
    try {
      const [statusRes, detailedRes] = await Promise.all([
        apiClient.getSwarmStatus().catch(() => null),
        apiClient.getDetailedAgents().catch(() => null),
      ]);

      if (statusRes?.agents) {
        const parseVal = (str?: string) => {
          if (!str) return 0;
          const n = parseFloat(str.replace(/[^0-9.-]/g, ''));
          return isNaN(n) ? 0 : n;
        };
        updateSharedState((prevDetailed) => ({
          summary: statusRes.agents,
          detailed: {
            ...prevDetailed,
            volt: {
              ...prevDetailed.volt,
              tradesToday: statusRes.agents.volt?.tradesToday ?? prevDetailed.volt.tradesToday,
              pnlAmount: parseVal(statusRes.agents.volt?.pnl) ?? prevDetailed.volt.pnlAmount,
              evalLatencyMs: statusRes.agents.volt?.evalLatencyMs ?? prevDetailed.volt.evalLatencyMs,
              status: (statusRes.agents.volt?.status || prevDetailed.volt.status) as AgentDetail['status'],
            },
            oracle: {
              ...prevDetailed.oracle,
              tradesToday: statusRes.agents.oracle?.tradesToday ?? prevDetailed.oracle.tradesToday,
              pnlAmount: parseVal(statusRes.agents.oracle?.pnl) ?? prevDetailed.oracle.pnlAmount,
              evalLatencyMs: statusRes.agents.oracle?.evalLatencyMs ?? prevDetailed.oracle.evalLatencyMs,
              status: (statusRes.agents.oracle?.status || prevDetailed.oracle.status) as AgentDetail['status'],
            },
            titan: {
              ...prevDetailed.titan,
              tradesToday: statusRes.agents.titan?.activeQuotes ?? prevDetailed.titan.tradesToday,
              pnlAmount: parseVal(statusRes.agents.titan?.spreadCaptured) ?? prevDetailed.titan.pnlAmount,
              status: (statusRes.agents.titan?.status || prevDetailed.titan.status) as AgentDetail['status'],
            },
            sweeper: {
              ...prevDetailed.sweeper,
              pnlAmount: parseVal(statusRes.agents.sweeper?.totalClaimed) ?? prevDetailed.sweeper.pnlAmount,
              status: (statusRes.agents.sweeper?.status || prevDetailed.sweeper.status) as AgentDetail['status'],
            },
          },
        }));
      }
      if (detailedRes?.agents) {
        updateSharedState(() => ({
          detailed: detailedRes.agents,
        }));
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch swarm status');
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // Deprecated no-op: OrderHistoryTable now fetches its own paginated page on demand.
  const fetchOrders = useCallback(async () => {}, []);

  useEffect(() => {
    fetchSwarmStatus();

    // Relaxed polling interval (30s heartbeat fallback) — paused when hidden
    const interval = window.setInterval(() => {
      if (!shouldPoll()) return;
      fetchSwarmStatus();
    }, STALE_TIMES.swarm);

    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchSwarmStatus();
    };
    document.addEventListener('visibilitychange', onVisible);

    // 1. Direct 0ms Real-Time PnL Stream Update via shared telemetry client
    const unsubSwarmPnl = telemetryClient.on('swarm_pnl_tick', (payload: SwarmPnlTickData) => {
      const voltPnl = typeof payload.volt === 'number' ? payload.volt : undefined;
      const oraclePnl = typeof payload.oracle === 'number' ? payload.oracle : undefined;
      const titanPnl = typeof payload.titan === 'number' ? payload.titan : undefined;
      const sweeperPnl = typeof payload.sweeper === 'number' ? payload.sweeper : undefined;

      updateSharedState((prevDetailed, prevSummary) => ({
        detailed: {
          ...prevDetailed,
          volt: { ...prevDetailed.volt, pnlAmount: voltPnl !== undefined ? voltPnl : prevDetailed.volt.pnlAmount },
          oracle: { ...prevDetailed.oracle, pnlAmount: oraclePnl !== undefined ? oraclePnl : prevDetailed.oracle.pnlAmount },
          titan: { ...prevDetailed.titan, pnlAmount: titanPnl !== undefined ? titanPnl : prevDetailed.titan.pnlAmount },
          sweeper: { ...prevDetailed.sweeper, pnlAmount: sweeperPnl !== undefined ? sweeperPnl : prevDetailed.sweeper.pnlAmount },
        },
        summary: {
          ...prevSummary,
          volt: {
            ...prevSummary.volt,
            pnl: voltPnl !== undefined ? `${voltPnl >= 0 ? '+' : ''}${voltPnl.toFixed(2)} tUSDC` : prevSummary.volt.pnl,
          },
          oracle: {
            ...prevSummary.oracle,
            pnl: oraclePnl !== undefined ? `${oraclePnl >= 0 ? '+' : ''}${oraclePnl.toFixed(2)} tUSDC` : prevSummary.oracle.pnl,
          },
          titan: {
            ...prevSummary.titan,
            spreadCaptured: titanPnl !== undefined ? `${titanPnl >= 0 ? '+' : ''}${titanPnl.toFixed(2)} tUSDC` : prevSummary.titan.spreadCaptured,
          },
          sweeper: {
            ...prevSummary.sweeper,
            totalClaimed: sweeperPnl !== undefined ? `+${sweeperPnl.toFixed(2)} tUSDC` : prevSummary.sweeper.totalClaimed,
          },
        },
      }));
    });

    // 2. Direct Trade Fill Increment
    const unsubOrder = telemetryClient.on('order_filled', (payload: OrderFillData) => {
      const rawAgent = payload.agentType || '';
      const agentKey = rawAgent.toLowerCase();
      if (agentKey && (agentKey === 'volt' || agentKey === 'oracle' || agentKey === 'titan')) {
        setDetailed((prev) => ({
          ...prev,
          [agentKey]: {
            ...prev[agentKey],
            tradesToday: (prev[agentKey]?.tradesToday ?? 0) + 1,
            lastAction: `TAKER_BUY_${payload.outcome || 'YES'}`,
            lastActionTimestamp: Date.now(),
          },
        }));
        if (agentKey === 'volt') {
          setSummary((prev) => ({
            ...prev,
            volt: { ...prev.volt, tradesToday: prev.volt.tradesToday + 1 },
          }));
        } else if (agentKey === 'oracle') {
          setSummary((prev) => ({
            ...prev,
            oracle: { ...prev.oracle, tradesToday: prev.oracle.tradesToday + 1 },
          }));
        }
      }
    });

    // 3. Direct Sweep Completion Update
    const unsubSweep = telemetryClient.on('sweep_completed', (payload: SweepCompleteData) => {
      const claimed = parseFloat(payload.claimedAmount || '0') || 0;
      setDetailed((prev) => ({
        ...prev,
        sweeper: {
          ...prev.sweeper,
          tradesToday: (prev.sweeper?.tradesToday ?? 0) + 1,
          pnlAmount: (prev.sweeper?.pnlAmount ?? 0) + claimed,
          lastAction: 'BATCH_SWEEP_CLAIM',
          lastActionTimestamp: Date.now(),
        },
      }));
      if (wsDebounceRef.current) window.clearTimeout(wsDebounceRef.current);
      wsDebounceRef.current = window.setTimeout(() => {
        wsDebounceRef.current = null;
        fetchSwarmStatus();
      }, 200);
    });

    // 4. Background reconciliation on PnL resolution
    const unsubPnl = telemetryClient.on('pnl_update', (_payload: PnlUpdateData) => {
      if (wsDebounceRef.current) window.clearTimeout(wsDebounceRef.current);
      wsDebounceRef.current = window.setTimeout(() => {
        wsDebounceRef.current = null;
        fetchSwarmStatus();
      }, 200);
    });

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      if (wsDebounceRef.current) window.clearTimeout(wsDebounceRef.current);
      unsubSwarmPnl();
      unsubOrder();
      unsubSweep();
      unsubPnl();
    };
  }, [fetchSwarmStatus]);

  const toggleAgent = useCallback(
    async (agentType: AgentType, enabled: boolean): Promise<boolean> => {
      try {
        const res = await apiClient.toggleAgent(agentType, enabled, operatorAddress);
        if (res.success) {
          const key = agentType.toLowerCase();
          setDetailed((prev) => ({
            ...prev,
            [key]: {
              ...prev[key],
              isEnabled: enabled,
              status: enabled ? 'ACTIVE' : 'PAUSED',
            },
          }));
          setSummary((prev) => ({
            ...prev,
            [key]: {
              ...prev[key as keyof SwarmStatusSummary],
              status: enabled ? 'ACTIVE' : 'PAUSED',
            },
          }));
          return true;
        }
        return false;
      } catch (err: any) {
        setError(err.message || 'Failed to toggle agent');
        return false;
      }
    },
    [operatorAddress],
  );

  const updateConfig = useCallback(
    async (agentType: AgentType, config: Record<string, any>): Promise<boolean> => {
      try {
        const res = await apiClient.updateAgentConfig(agentType, config);
        if (res.success) {
          const key = agentType.toLowerCase();
          setDetailed((prev) => ({
            ...prev,
            [key]: {
              ...prev[key],
              config: { ...prev[key]?.config, ...config },
            },
          }));
          return true;
        }
        return false;
      } catch (err: any) {
        setError(err.message || 'Failed to update agent config');
        return false;
      }
    },
    [],
  );

  return {
    summary,
    detailed,
    orders,
    isLoading,
    error,
    toggleAgent,
    updateConfig,
    refreshOrders: fetchOrders,
    refreshStatus: fetchSwarmStatus,
  };
};
