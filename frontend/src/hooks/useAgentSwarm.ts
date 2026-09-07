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

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

function updateSharedState(
  updater: (
    prevDetailed: Record<string, AgentDetail>,
    prevSummary: SwarmStatusSummary,
  ) => { detailed?: Record<string, AgentDetail>; summary?: SwarmStatusSummary },
) {
  const result = updater(sharedDetailed, sharedSummary);
  if (result.detailed) sharedDetailed = result.detailed;
  if (result.summary) sharedSummary = result.summary;
  notifyListeners();
}

let activeSubscribers = 0;
let pollingIntervalId: number | null = null;
let globalUnsubs: Array<() => void> = [];
let wsDebounceTimer: number | null = null;
let inFlightFetch = false;
let lastFetchAt = 0;

const fetchSwarmStatusGlobal = async () => {
  const now = Date.now();
  if (inFlightFetch) return;
  if (now - lastFetchAt < 1000) return;
  lastFetchAt = now;
  inFlightFetch = true;

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
            tradesToday: (statusRes.agents.titan as any)?.tradesToday ?? prevDetailed.titan.tradesToday,
            pnlAmount: parseVal(statusRes.agents.titan?.spreadCaptured || (statusRes.agents.titan as any)?.pnl) ?? prevDetailed.titan.pnlAmount,
            evalLatencyMs: (statusRes.agents.titan as any)?.evalLatencyMs ?? prevDetailed.titan.evalLatencyMs,
            status: (statusRes.agents.titan?.status || prevDetailed.titan.status) as AgentDetail['status'],
          },
          sweeper: {
            ...prevDetailed.sweeper,
            tradesToday: (statusRes.agents.sweeper as any)?.tradesToday ?? prevDetailed.sweeper.tradesToday,
            pnlAmount: parseVal(statusRes.agents.sweeper?.totalClaimed || (statusRes.agents.sweeper as any)?.pnl) ?? prevDetailed.sweeper.pnlAmount,
            evalLatencyMs: (statusRes.agents.sweeper as any)?.evalLatencyMs ?? prevDetailed.sweeper.evalLatencyMs,
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
  } catch (err: any) {
    console.warn('[useAgentSwarm] Error fetching global swarm status:', err?.message);
  } finally {
    inFlightFetch = false;
  }
};

function setupGlobalSubscription() {
  fetchSwarmStatusGlobal();

  // Polling heartbeat fallback
  pollingIntervalId = window.setInterval(() => {
    if (!shouldPoll()) return;
    fetchSwarmStatusGlobal();
  }, STALE_TIMES.swarm);

  const onVisible = () => {
    if (document.visibilityState === 'visible') fetchSwarmStatusGlobal();
  };
  document.addEventListener('visibilitychange', onVisible);

  // 1. Direct 0ms Real-Time PnL Stream Update via singleton telemetry client
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

  // 2. Direct Trade Fill Increment — executed ONCE globally
  const unsubOrder = telemetryClient.on('order_filled', (payload: OrderFillData) => {
    const rawAgent = payload.agentType || '';
    const agentKey = rawAgent.toLowerCase();
    if (agentKey && (agentKey === 'volt' || agentKey === 'oracle' || agentKey === 'titan')) {
      updateSharedState((prevDetailed, prevSummary) => {
        const nextDetailed = {
          ...prevDetailed,
          [agentKey]: {
            ...prevDetailed[agentKey],
            tradesToday: (prevDetailed[agentKey]?.tradesToday ?? 0) + 1,
            lastAction: `TAKER_BUY_${payload.outcome || 'YES'}`,
            lastActionTimestamp: Date.now(),
          },
        };

        const nextSummary = { ...prevSummary };
        if (agentKey === 'volt') {
          nextSummary.volt = { ...nextSummary.volt, tradesToday: nextSummary.volt.tradesToday + 1 };
        } else if (agentKey === 'oracle') {
          nextSummary.oracle = { ...nextSummary.oracle, tradesToday: nextSummary.oracle.tradesToday + 1 };
        }

        return {
          detailed: nextDetailed,
          summary: nextSummary,
        };
      });
    }
  });

  // 3. Direct Sweep Completion Update — executed ONCE globally
  const unsubSweep = telemetryClient.on('sweep_completed', (payload: SweepCompleteData) => {
    const claimed = parseFloat(payload.claimedAmount || '0') || 0;
    updateSharedState((prevDetailed, prevSummary) => {
      const prevClaimedVal = parseFloat((prevSummary.sweeper?.totalClaimed || '0').replace(/[^0-9.-]/g, '')) || 0;
      const newTotal = prevClaimedVal + claimed;
      return {
        detailed: {
          ...prevDetailed,
          sweeper: {
            ...prevDetailed.sweeper,
            tradesToday: (prevDetailed.sweeper?.tradesToday ?? 0) + 1,
            pnlAmount: (prevDetailed.sweeper?.pnlAmount ?? 0) + claimed,
            lastAction: 'BATCH_SWEEP_CLAIM',
            lastActionTimestamp: Date.now(),
          },
        },
        summary: {
          ...prevSummary,
          sweeper: {
            ...prevSummary.sweeper,
            totalClaimed: `+${newTotal.toFixed(2)} tUSDC`,
            lastSweep: new Date().toISOString(),
          },
        },
      };
    });

    if (wsDebounceTimer) window.clearTimeout(wsDebounceTimer);
    wsDebounceTimer = window.setTimeout(() => {
      wsDebounceTimer = null;
      fetchSwarmStatusGlobal();
    }, 200);
  });

  // 4. Background reconciliation on PnL resolution
  const unsubPnl = telemetryClient.on('pnl_update', (_payload: PnlUpdateData) => {
    if (wsDebounceTimer) window.clearTimeout(wsDebounceTimer);
    wsDebounceTimer = window.setTimeout(() => {
      wsDebounceTimer = null;
      fetchSwarmStatusGlobal();
    }, 200);
  });

  globalUnsubs = [
    () => {
      if (pollingIntervalId !== null) {
        window.clearInterval(pollingIntervalId);
        pollingIntervalId = null;
      }
    },
    () => document.removeEventListener('visibilitychange', onVisible),
    () => {
      if (wsDebounceTimer) {
        window.clearTimeout(wsDebounceTimer);
        wsDebounceTimer = null;
      }
    },
    unsubSwarmPnl,
    unsubOrder,
    unsubSweep,
    unsubPnl,
  ];
}

function teardownGlobalSubscription() {
  globalUnsubs.forEach((unsub) => {
    try {
      unsub();
    } catch {}
  });
  globalUnsubs = [];
}

export const useAgentSwarm = (operatorAddress?: string): UseAgentSwarmReturn => {
  const [summary, setSummary] = useState<SwarmStatusSummary>(sharedSummary);
  const [detailed, setDetailed] = useState<Record<string, AgentDetail>>(sharedDetailed);
  const [orders, setOrders] = useState<OrderExecution[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Normalized operator scope: user-scoped orders when an address is provided,
  // swarm-wide recent fills otherwise. Kept in a ref so the fetcher never goes stale.
  const normalizedOperator = operatorAddress?.trim().toLowerCase() ?? null;
  const operatorRef = useRef<string | null>(normalizedOperator);
  operatorRef.current = normalizedOperator;

  const ordersInFlightRef = useRef<boolean>(false);
  const lastOrdersFetchAtRef = useRef<number>(0);
  const ordersDebounceRef = useRef<number | null>(null);
  const ordersGenRef = useRef<number>(0);

  // Subscribe to global shared updates with reference-counted telemetry listener
  useEffect(() => {
    if (activeSubscribers === 0) {
      setupGlobalSubscription();
    }
    activeSubscribers++;

    const onUpdate = () => {
      setSummary(sharedSummary);
      setDetailed(sharedDetailed);
    };
    listeners.add(onUpdate);

    // Initial sync
    setSummary(sharedSummary);
    setDetailed(sharedDetailed);

    return () => {
      listeners.delete(onUpdate);
      activeSubscribers--;
      if (activeSubscribers <= 0) {
        activeSubscribers = 0;
        teardownGlobalSubscription();
      }
    };
  }, []);

  // Production-ready orders fetcher: user-scoped when operatorAddress is set
  // (includes SWARM + TERMINAL + COPY_TRADE fills so onboarding Quest #4 sees
  // any first trade), swarm-wide recent fills otherwise for fleet telemetry.
  const fetchOrders = useCallback(async () => {
    const target = operatorRef.current;
    const now = Date.now();
    if (ordersInFlightRef.current) return;
    if (now - lastOrdersFetchAtRef.current < 1000) return;
    lastOrdersFetchAtRef.current = now;
    ordersInFlightRef.current = true;
    const gen = ++ordersGenRef.current;
    setIsLoading(true);

    try {
      const res = target
        ? await apiClient.getOrders({ userAddress: target, limit: 100 })
        : await apiClient.getOrders({ limit: 50 });
      if (gen !== ordersGenRef.current) return;
      if (res?.success && Array.isArray(res.data)) {
        setOrders(res.data);
        setError(null);
      }
    } catch (err: any) {
      if (gen !== ordersGenRef.current) return;
      // Preserve last-good orders; surface the error for consumers.
      setError(err?.message || 'Failed to fetch orders');
    } finally {
      ordersInFlightRef.current = false;
      if (gen === ordersGenRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Orders lifecycle: initial fetch, visibility-aware polling, and real-time
  // refresh on trade fills / sweeps / PnL updates. Orders are cleared on scope
  // change so a guest swarm list can never leak into a user quest count.
  useEffect(() => {
    setOrders([]);
    setError(null);
    fetchOrders();

    const intervalId = window.setInterval(() => {
      if (!shouldPoll()) return;
      fetchOrders();
    }, STALE_TIMES.swarm);

    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchOrders();
    };
    document.addEventListener('visibilitychange', onVisible);

    const debouncedRefresh = (delay = 200) => {
      if (ordersDebounceRef.current) window.clearTimeout(ordersDebounceRef.current);
      ordersDebounceRef.current = window.setTimeout(() => {
        ordersDebounceRef.current = null;
        fetchOrders();
      }, delay);
    };

    const unsubOrder = telemetryClient.on('order_filled', (payload: OrderFillData) => {
      const target = operatorRef.current;
      if (!target) {
        debouncedRefresh();
        return;
      }
      const payloadUser = (payload as { userAddress?: string })?.userAddress?.toLowerCase();
      // Ignore fills belonging to other traders when user-scoped.
      if (payloadUser && payloadUser !== target) return;
      debouncedRefresh();
    });
    const unsubSweep = telemetryClient.on('sweep_completed', () => {
      debouncedRefresh();
    });
    const unsubPnl = telemetryClient.on('pnl_update', () => {
      debouncedRefresh();
    });

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      if (ordersDebounceRef.current) {
        window.clearTimeout(ordersDebounceRef.current);
        ordersDebounceRef.current = null;
      }
      ordersGenRef.current++;
      try {
        unsubOrder();
      } catch {}
      try {
        unsubSweep();
      } catch {}
      try {
        unsubPnl();
      } catch {}
    };
  }, [normalizedOperator, fetchOrders]);

  const toggleAgent = useCallback(
    async (agentType: AgentType, enabled: boolean): Promise<boolean> => {
      try {
        const res = await apiClient.toggleAgent(agentType, enabled, operatorAddress);
        if (res.success) {
          const key = agentType.toLowerCase();
          updateSharedState((prevDetailed, prevSummary) => ({
            detailed: {
              ...prevDetailed,
              [key]: {
                ...prevDetailed[key],
                isEnabled: enabled,
                status: enabled ? 'ACTIVE' : 'PAUSED',
              },
            },
            summary: {
              ...prevSummary,
              [key]: {
                ...prevSummary[key as keyof SwarmStatusSummary],
                status: enabled ? 'ACTIVE' : 'PAUSED',
              },
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
          updateSharedState((prevDetailed) => ({
            detailed: {
              ...prevDetailed,
              [key]: {
                ...prevDetailed[key],
                config: { ...prevDetailed[key]?.config, ...config },
              },
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
    refreshStatus: fetchSwarmStatusGlobal,
  };
};
