import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api.js';
import { supabase } from '../services/supabase.js';
import type { AgentType, PersonalSwarmConfig, PersonalSwarmStatus } from '../types/index.js';

export interface UsePersonalSwarmReturn {
  config: PersonalSwarmConfig | null;
  status: PersonalSwarmStatus | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  isCopyTradeEnabled: boolean;
  isCopyMode: boolean;
  isPersonalMode: boolean;
  refresh: () => Promise<void>;
  setMode: (mode: 'COPY' | 'PERSONAL') => Promise<boolean>;
  toggleCopyTrade: (enabled: boolean) => Promise<boolean>;
  toggleAgent: (agentType: AgentType, enabled: boolean) => Promise<boolean>;
  updateAgentConfig: (agentType: AgentType, config: Record<string, any>) => Promise<boolean>;
  resetToCopy: () => Promise<boolean>;
}

export const usePersonalSwarm = (userAddress?: string): UsePersonalSwarmReturn => {
  const [config, setConfig] = useState<PersonalSwarmConfig | null>(null);
  const [status, setStatus] = useState<PersonalSwarmStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!userAddress) {
      setConfig(null);
      setStatus(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [cfgRes, statusRes] = await Promise.all([
        apiClient.getPersonalSwarmConfig(userAddress).catch(() => null),
        apiClient.getPersonalSwarmStatus(userAddress).catch(() => null),
      ]);
      if (cfgRes?.config) setConfig(cfgRes.config);
      if (statusRes?.status) setStatus(statusRes.status);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch personal swarm');
    } finally {
      setIsLoading(false);
    }
  }, [userAddress]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime subscription for user_swarm_configs table in Supabase
  useEffect(() => {
    if (!userAddress) return;
    const targetAddr = userAddress.toLowerCase();
    const channel = supabase
      .channel(`public:user_swarm_configs:${targetAddr}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_swarm_configs',
        },
        (payload: { eventType: string; new: any }) => {
          if (payload.new && payload.new.user_address && payload.new.user_address.toLowerCase() === targetAddr) {
            const row = payload.new;
            setConfig({
              userAddress: row.user_address,
              mode: row.mode || 'COPY',
              copyTradeEnabled: row.copy_trade_enabled === true,
              voltEnabled: row.volt_enabled ?? true,
              oracleEnabled: row.oracle_enabled ?? true,
              titanEnabled: row.titan_enabled ?? true,
              sweeperEnabled: row.sweeper_enabled ?? true,
              voltConfig: row.volt_config || { driftThreshold: 0.002, minEdge: 0.03, lotSize: 5, maxTradeSize: 20 },
              oracleConfig: row.oracle_config || { minEdge: 0.035, lotSize: 5, maxTradeSize: 20 },
              titanConfig: row.titan_config || { targetSpread: 0.04, inventoryAversion: 0.015, lotSize: 2 },
              customizedAt: row.customized_at || undefined,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userAddress]);

  const setMode = useCallback(
    async (mode: 'COPY' | 'PERSONAL'): Promise<boolean> => {
      if (!userAddress) return false;
      setIsSaving(true);
      try {
        const res = await apiClient.setPersonalSwarmMode(userAddress, mode);
        if (res?.config) {
          setConfig(res.config);
          // refresh status too
          const s = await apiClient.getPersonalSwarmStatus(userAddress).catch(() => null);
          if (s?.status) setStatus(s.status);
        }
        return true;
      } catch (err: any) {
        setError(err.message || 'Failed to switch mode');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [userAddress],
  );

  const toggleCopyTrade = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      if (!userAddress) return false;
      setIsSaving(true);
      try {
        const res = await apiClient.toggleCopyTrade(userAddress, enabled);
        if (res?.config) {
          setConfig(res.config);
          const s = await apiClient.getPersonalSwarmStatus(userAddress).catch(() => null);
          if (s?.status) setStatus(s.status);
        }
        return true;
      } catch (err: any) {
        setError(err.message || 'Failed to toggle copy trading');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [userAddress],
  );

  const toggleAgent = useCallback(
    async (agentType: AgentType, enabled: boolean): Promise<boolean> => {
      if (!userAddress) return false;
      setIsSaving(true);
      try {
        const res = await apiClient.togglePersonalAgent(userAddress, agentType, enabled);
        if (res?.config) setConfig(res.config);
        return true;
      } catch (err: any) {
        setError(err.message || 'Failed to toggle agent');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [userAddress],
  );

  const updateAgentConfig = useCallback(
    async (agentType: AgentType, cfg: Record<string, any>): Promise<boolean> => {
      if (!userAddress) return false;
      setIsSaving(true);
      try {
        const res = await apiClient.updatePersonalAgentConfig(userAddress, agentType, cfg);
        if (res?.config) setConfig(res.config);
        return true;
      } catch (err: any) {
        setError(err.message || 'Failed to update config');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [userAddress],
  );

  const resetToCopy = useCallback(async (): Promise<boolean> => {
    if (!userAddress) return false;
    setIsSaving(true);
    try {
      const res = await apiClient.resetPersonalSwarm(userAddress);
      if (res?.config) setConfig(res.config);
      const s = await apiClient.getPersonalSwarmStatus(userAddress).catch(() => null);
      if (s?.status) setStatus(s.status);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to reset');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [userAddress]);

  return {
    config,
    status,
    isLoading,
    isSaving,
    error,
    isCopyTradeEnabled: config?.copyTradeEnabled === true,
    isCopyMode: config?.mode === 'COPY' && config?.copyTradeEnabled === true,
    isPersonalMode: config?.mode === 'PERSONAL' && config?.copyTradeEnabled === true,
    refresh: fetchAll,
    setMode,
    toggleCopyTrade,
    toggleAgent,
    updateAgentConfig,
    resetToCopy,
  };
};
