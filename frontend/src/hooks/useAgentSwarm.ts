import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api.js';
import type { AgentType, OrderExecution, SwarmStatusSummary } from '../types/index.js';

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

export const useAgentSwarm = (): UseAgentSwarmReturn => {
  const [summary, setSummary] = useState<SwarmStatusSummary>({
    volt: { status: 'ACTIVE', evalLatencyMs: 38, tradesToday: 18, pnl: '+24.50 STT' },
    oracle: { status: 'ACTIVE', evalLatencyMs: 64, tradesToday: 12, pnl: '+19.80 STT' },
    titan: { status: 'ACTIVE', activeQuotes: 6, spreadCaptured: '+8.20 STT' },
    sweeper: { status: 'ACTIVE', lastSweep: new Date().toISOString(), totalClaimed: '145.00 STT' },
  });

  const [detailed, setDetailed] = useState<Record<string, AgentDetail>>({
    volt: {
      agentType: 'Volt',
      isEnabled: true,
      status: 'ACTIVE',
      evalLatencyMs: 38,
      tradesToday: 18,
      pnlAmount: 24.5,
      lastAction: 'TAKER_SNIPE_YES',
      lastActionTimestamp: Date.now() - 15000,
      config: { driftThreshold: 0.002, minEdge: 0.03, lotSize: 5.0 },
    },
    oracle: {
      agentType: 'Oracle',
      isEnabled: true,
      status: 'ACTIVE',
      evalLatencyMs: 64,
      tradesToday: 12,
      pnlAmount: 19.8,
      lastAction: 'TAKER_BUY_NO',
      lastActionTimestamp: Date.now() - 32000,
      config: { minEdge: 0.035, lotSize: 5.0 },
    },
    titan: {
      agentType: 'Titan',
      isEnabled: true,
      status: 'ACTIVE',
      evalLatencyMs: 42,
      tradesToday: 34,
      pnlAmount: 8.2,
      lastAction: 'LIMIT_QUOTE_YES',
      lastActionTimestamp: Date.now() - 5000,
      config: { targetSpread: 0.04, inventoryAversion: 0.015, lotSize: 2.0 },
    },
    sweeper: {
      agentType: 'Sweeper',
      isEnabled: true,
      status: 'ACTIVE',
      evalLatencyMs: 15,
      tradesToday: 6,
      pnlAmount: 145.0,
      lastAction: 'BATCH_CLAIM_PAYOUTS',
      lastActionTimestamp: Date.now() - 120000,
      config: {},
    },
  });

  const [orders, setOrders] = useState<OrderExecution[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSwarmStatus = useCallback(async () => {
    try {
      const [statusRes, detailedRes] = await Promise.all([
        apiClient.getSwarmStatus().catch(() => null),
        apiClient.getDetailedAgents().catch(() => null),
      ]);

      if (statusRes?.agents) {
        setSummary(statusRes.agents);
      }
      if (detailedRes?.agents) {
        setDetailed(detailedRes.agents);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch swarm status');
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiClient.getOrders({ limit: 50 });
      if (res?.data) {
        setOrders(res.data);
      }
    } catch (err: any) {
      console.warn('[useAgentSwarm] Error fetching orders:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSwarmStatus();
    fetchOrders();

    const interval = setInterval(() => {
      fetchSwarmStatus();
      fetchOrders();
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchSwarmStatus, fetchOrders]);

  const toggleAgent = useCallback(
    async (agentType: AgentType, enabled: boolean): Promise<boolean> => {
      try {
        const res = await apiClient.toggleAgent(agentType, enabled);
        if (res.success) {
          // Optimistic local state update
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
        setError(err.message || `Failed to toggle agent ${agentType}`);
        return false;
      }
    },
    [],
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
              config: {
                ...prev[key]?.config,
                ...config,
              },
            },
          }));
          return true;
        }
        return false;
      } catch (err: any) {
        setError(err.message || `Failed to update configuration for ${agentType}`);
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
