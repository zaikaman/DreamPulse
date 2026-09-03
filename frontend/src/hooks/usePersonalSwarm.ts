import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api.js';
import type { AgentType, PersonalSwarmConfig, PersonalSwarmStatus } from '../types/index.js';
import { supabase, subscribeToPrivateTable } from '../services/supabase.js';
import { ensureSupabaseAuthForWallet } from '../services/supabase-auth.js';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { shouldPoll, STALE_TIMES } from '../lib/polling.js';

export interface UsePersonalSwarmReturn {
  config: PersonalSwarmConfig | null;
  status: PersonalSwarmStatus | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  isCopyTradeEnabled: boolean;
  isCopyMode: boolean;
  isPersonalMode: boolean;
  isProtocolCopyActive: boolean;
  isPersonalSwarmActive: boolean;
  refresh: () => Promise<void>;
  setMode: (mode: 'COPY' | 'PERSONAL') => Promise<boolean>;
  toggleCopyTrade: (enabled: boolean) => Promise<boolean>;
  toggleAgent: (agentType: AgentType, enabled: boolean) => Promise<boolean>;
  updateAgentConfig: (agentType: AgentType, config: Record<string, any>) => Promise<boolean>;
  updateFleetConfig: (configs: { volt?: Record<string, any>; oracle?: Record<string, any>; titan?: Record<string, any> }) => Promise<boolean>;
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

  // Authenticated Realtime for private `user_swarm_configs` — filtered by user_address
  // plus polling fallback. Uses JWT from wallet-verify (user_address claim) so
  // RLS `lower(auth.jwt()->>'user_address')=lower(user_address)` passes.
  useEffect(() => {
    if (!userAddress) return;
    const lower = userAddress.toLowerCase();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    (async () => {
      await ensureSupabaseAuthForWallet(userAddress as any).catch(() => null);
      if (cancelled) return;
      channel = subscribeToPrivateTable<any>(
        'user_swarm_configs',
        lower,
        // onInsert/update both upsert config
        (row: any) => {
          if (!row || !row.user_address || row.user_address.toLowerCase() !== lower) return;
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
        },
        (row: any) => {
          if (!row || !row.user_address || row.user_address.toLowerCase() !== lower) return;
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
        },
      );
      if (cancelled && channel) {
        channel.unsubscribe();
        supabase.removeChannel(channel);
      }
    })();
    return () => {
      cancelled = true;
      if (channel) {
        channel.unsubscribe();
        supabase.removeChannel(channel);
      }
    };
  }, [userAddress]);

  // Light polling restores cross-tab near-realtime without Supabase realtime
  useEffect(() => {
    if (!userAddress) return;
    if (shouldPoll()) {
      fetchAll().catch(() => {});
    }
    const interval = setInterval(() => {
      if (!shouldPoll()) return;
      fetchAll().catch(() => {});
    }, STALE_TIMES.swarm);
    const onFocus = () => {
      if (shouldPoll()) fetchAll().catch(() => {});
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') fetchAll().catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [userAddress, fetchAll]);

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
        // SECURITY: no localStorage SessionGrant mutation — session is memory-only + backend truth.
        // Notify other hooks via in-memory event only.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('dreampulse:session-update', { detail: { copyTradeEnabled: enabled } }));
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

  const updateFleetConfig = useCallback(
    async (configs: {
      volt?: Record<string, any>;
      oracle?: Record<string, any>;
      titan?: Record<string, any>;
    }): Promise<boolean> => {
      if (!userAddress) return false;
      setIsSaving(true);
      try {
        const res = await apiClient.updateFleetConfig(userAddress, configs);
        if (res?.config) setConfig(res.config);
        return true;
      } catch (err: any) {
        setError(err.message || 'Failed to update fleet config');
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

  // SECURITY: copyTradeEnabled is determined solely by backend config.
  // Legacy localStorage fallback removed — prevented XSS from injecting copyTradeEnabled via dreampulse_active_session.
  const copyEnabled = config ? config.copyTradeEnabled === true : false;

  return {
    config,
    status,
    isLoading,
    isSaving,
    error,
    isCopyTradeEnabled: copyEnabled,
    isCopyMode: (config?.mode ?? 'COPY') === 'COPY',
    isPersonalMode: config?.mode === 'PERSONAL',
    isProtocolCopyActive: (config?.mode ?? 'COPY') === 'COPY' && copyEnabled,
    isPersonalSwarmActive: config?.mode === 'PERSONAL' && copyEnabled,
    refresh: fetchAll,
    setMode,
    toggleCopyTrade,
    toggleAgent,
    updateAgentConfig,
    updateFleetConfig,
    resetToCopy,
  };
};
