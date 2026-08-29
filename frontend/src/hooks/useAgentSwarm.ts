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

export const useAgentSwarm = (operatorAddress?: string): UseAgentSwarmReturn => {
  const [summary, setSummary] = useState<SwarmStatusSummary>({
    volt: { status: 'ACTIVE', evalLatencyMs: 0, tradesToday: 0, pnl: '+0.00 tUSDC' },
    oracle: { status: 'ACTIVE', evalLatencyMs: 0, tradesToday: 0, pnl: '+0.00 tUSDC' },
    titan: { status: 'ACTIVE', activeQuotes: 0, spreadCaptured: '+0.00 tUSDC' },
    sweeper: { status: 'ACTIVE', lastSweep: new Date().toISOString(), totalClaimed: '0.00 tUSDC' },
  });

  const [detailed, setDetailed] = useState<Record<string, AgentDetail>>({
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
  });

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
        setSummary(statusRes.agents);
        const parseVal = (str?: string) => {
          if (!str) return 0;
          const n = parseFloat(str.replace(/[^0-9.-]/g, ''));
          return isNaN(n) ? 0 : n;
        };
        setDetailed((prev) => ({
          ...prev,
          volt: {
            ...prev.volt,
            tradesToday: statusRes.agents.volt?.tradesToday ?? prev.volt.tradesToday,
            pnlAmount: parseVal(statusRes.agents.volt?.pnl) || prev.volt.pnlAmount,
            evalLatencyMs: statusRes.agents.volt?.evalLatencyMs ?? prev.volt.evalLatencyMs,
            status: (statusRes.agents.volt?.status || prev.volt.status) as AgentDetail['status'],
          },
          oracle: {
            ...prev.oracle,
            tradesToday: statusRes.agents.oracle?.tradesToday ?? prev.oracle.tradesToday,
            pnlAmount: parseVal(statusRes.agents.oracle?.pnl) || prev.oracle.pnlAmount,
            evalLatencyMs: statusRes.agents.oracle?.evalLatencyMs ?? prev.oracle.evalLatencyMs,
            status: (statusRes.agents.oracle?.status || prev.oracle.status) as AgentDetail['status'],
          },
          titan: {
            ...prev.titan,
            tradesToday: statusRes.agents.titan?.activeQuotes ?? prev.titan.tradesToday,
            pnlAmount: parseVal(statusRes.agents.titan?.spreadCaptured) || prev.titan.pnlAmount,
            status: (statusRes.agents.titan?.status || prev.titan.status) as AgentDetail['status'],
          },
          sweeper: {
            ...prev.sweeper,
            pnlAmount: parseVal(statusRes.agents.sweeper?.totalClaimed) || prev.sweeper.pnlAmount,
            status: (statusRes.agents.sweeper?.status || prev.sweeper.status) as AgentDetail['status'],
          },
        }));
      }
      if (detailedRes?.agents) {
        setDetailed(detailedRes.agents);
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

      setDetailed((prev) => ({
        ...prev,
        volt: { ...prev.volt, pnlAmount: voltPnl !== undefined ? voltPnl : prev.volt.pnlAmount },
        oracle: { ...prev.oracle, pnlAmount: oraclePnl !== undefined ? oraclePnl : prev.oracle.pnlAmount },
        titan: { ...prev.titan, pnlAmount: titanPnl !== undefined ? titanPnl : prev.titan.pnlAmount },
        sweeper: { ...prev.sweeper, pnlAmount: sweeperPnl !== undefined ? sweeperPnl : prev.sweeper.pnlAmount },
      }));

      setSummary((prev) => ({
        ...prev,
        volt: {
          ...prev.volt,
          pnl: voltPnl !== undefined ? `${voltPnl >= 0 ? '+' : ''}${voltPnl.toFixed(2)} tUSDC` : prev.volt.pnl,
        },
        oracle: {
          ...prev.oracle,
          pnl: oraclePnl !== undefined ? `${oraclePnl >= 0 ? '+' : ''}${oraclePnl.toFixed(2)} tUSDC` : prev.oracle.pnl,
        },
        titan: {
          ...prev.titan,
          spreadCaptured: titanPnl !== undefined ? `${titanPnl >= 0 ? '+' : ''}${titanPnl.toFixed(2)} tUSDC` : prev.titan.spreadCaptured,
        },
        sweeper: {
          ...prev.sweeper,
          totalClaimed: sweeperPnl !== undefined ? `+${sweeperPnl.toFixed(2)} tUSDC` : prev.sweeper.totalClaimed,
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
