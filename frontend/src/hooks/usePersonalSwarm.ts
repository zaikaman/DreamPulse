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

export interface UsePersonalSwarmOptions {
  initialCopyTradeEnabled?: boolean;
}

// In-memory module cache across page navigation (strictly JS heap memory, zero persistence in localStorage)
const swarmConfigMemoryCache = new Map<string, PersonalSwarmConfig>();
const swarmStatusMemoryCache = new Map<string, PersonalSwarmStatus>();

export const usePersonalSwarm = (
  userAddress?: string,
  options?: UsePersonalSwarmOptions,
): UsePersonalSwarmReturn => {
  const normAddress = userAddress?.toLowerCase();
  const [config, setConfig] = useState<PersonalSwarmConfig | null>(() => {
    if (!normAddress) return null;
    return swarmConfigMemoryCache.get(normAddress) || null;
  });
  const [status, setStatus] = useState<PersonalSwarmStatus | null>(() => {
    if (!normAddress) return null;
    return swarmStatusMemoryCache.get(normAddress) || null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (normAddress && swarmConfigMemoryCache.has(normAddress)) return false;
    return Boolean(normAddress);
  });
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!userAddress) {
      setConfig(null);
      setStatus(null);
      setIsLoading(false);
      return;
    }
    const lower = userAddress.toLowerCase();
    if (!swarmConfigMemoryCache.has(lower)) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const [cfgRes, statusRes] = await Promise.all([
        apiClient.getPersonalSwarmConfig(userAddress).catch(() => null),
        apiClient.getPersonalSwarmStatus(userAddress).catch(() => null),
      ]);
      if (cfgRes?.config) {
        swarmConfigMemoryCache.set(lower, cfgRes.config);
        setConfig(cfgRes.config);
      }
      if (statusRes?.status) {
        swarmStatusMemoryCache.set(lower, statusRes.status);
        setStatus(statusRes.status);
      }
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
          const nextCfg: PersonalSwarmConfig = {
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
          };
          swarmConfigMemoryCache.set(lower, nextCfg);
          setConfig(nextCfg);
        },
        (row: any) => {
          if (!row || !row.user_address || row.user_address.toLowerCase() !== lower) return;
          const nextCfg: PersonalSwarmConfig = {
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
          };
          swarmConfigMemoryCache.set(lower, nextCfg);
          setConfig(nextCfg);
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

  // Synchronize with cross-component session updates (e.g. SessionStatusBar, SessionDelegationModal)
  useEffect(() => {
    if (!userAddress) return;
    const lower = userAddress.toLowerCase();
    const handleSessionUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ copyTradeEnabled?: boolean }>).detail;
      if (typeof detail?.copyTradeEnabled === 'boolean') {
        const next = detail.copyTradeEnabled;
        setConfig((prev) => {
          if (!prev) {
            const cached = swarmConfigMemoryCache.get(lower);
            if (cached) {
              const updated = { ...cached, copyTradeEnabled: next };
              swarmConfigMemoryCache.set(lower, updated);
              return updated;
            }
            return null;
          }
          const updated = { ...prev, copyTradeEnabled: next };
          swarmConfigMemoryCache.set(lower, updated);
          return updated;
        });
      }
    };
    window.addEventListener('dreampulse:session-update', handleSessionUpdate);
    return () => window.removeEventListener('dreampulse:session-update', handleSessionUpdate);
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
      const lower = userAddress.toLowerCase();
      let snapshotConfig: PersonalSwarmConfig | null = null;
      setConfig((prev) => {
        snapshotConfig = prev;
        const updated = prev ? { ...prev, mode } : null;
        if (updated) swarmConfigMemoryCache.set(lower, updated);
        return updated;
      });
      setIsSaving(true);
      try {
        const res = await apiClient.setPersonalSwarmMode(userAddress, mode);
        if (res?.config) {
          swarmConfigMemoryCache.set(lower, res.config);
          setConfig(res.config);
          // refresh status in background without blocking
          void apiClient.getPersonalSwarmStatus(userAddress)
            .then((s) => {
              if (s?.status) {
                swarmStatusMemoryCache.set(lower, s.status);
                setStatus(s.status);
              }
            })
            .catch(() => {});
        }
        return true;
      } catch (err: any) {
        if (snapshotConfig) {
          swarmConfigMemoryCache.set(lower, snapshotConfig);
          setConfig(snapshotConfig);
        }
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
      const lower = userAddress.toLowerCase();
      let snapshotConfig: PersonalSwarmConfig | null = null;
      // Optimistic update: instantly reflect in React state, memory cache, and in-memory event
      setConfig((prev) => {
        snapshotConfig = prev;
        const updated = prev ? { ...prev, copyTradeEnabled: enabled } : null;
        if (updated) swarmConfigMemoryCache.set(lower, updated);
        return updated;
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dreampulse:session-update', { detail: { copyTradeEnabled: enabled } }));
      }
      setIsSaving(true);
      try {
        const res = await apiClient.toggleCopyTrade(userAddress, enabled);
        if (res?.config) {
          swarmConfigMemoryCache.set(lower, res.config);
          setConfig(res.config);
        }
        // Non-blocking background sync of status so UI transition remains instant
        void apiClient.getPersonalSwarmStatus(userAddress)
          .then((s) => {
            if (s?.status) {
              swarmStatusMemoryCache.set(lower, s.status);
              setStatus(s.status);
            }
          })
          .catch(() => {});
        return true;
      } catch (err: any) {
        // Rollback optimistic update
        if (snapshotConfig) {
          swarmConfigMemoryCache.set(lower, snapshotConfig);
          setConfig(snapshotConfig);
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('dreampulse:session-update', { detail: { copyTradeEnabled: !enabled } }));
        }
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
      const lower = userAddress.toLowerCase();
      let snapshotConfig: PersonalSwarmConfig | null = null;
      const key = agentType.toLowerCase();
      setConfig((prev) => {
        snapshotConfig = prev;
        if (!prev) return null;
        let updated = { ...prev };
        if (key === 'volt') updated = { ...prev, voltEnabled: enabled };
        else if (key === 'oracle') updated = { ...prev, oracleEnabled: enabled };
        else if (key === 'titan') updated = { ...prev, titanEnabled: enabled };
        else if (key === 'sweeper') updated = { ...prev, sweeperEnabled: enabled };
        swarmConfigMemoryCache.set(lower, updated);
        return updated;
      });
      setIsSaving(true);
      try {
        const res = await apiClient.togglePersonalAgent(userAddress, agentType, enabled);
        if (res?.config) {
          swarmConfigMemoryCache.set(lower, res.config);
          setConfig(res.config);
        }
        return true;
      } catch (err: any) {
        if (snapshotConfig) {
          swarmConfigMemoryCache.set(lower, snapshotConfig);
          setConfig(snapshotConfig);
        }
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
      const lower = userAddress.toLowerCase();
      setIsSaving(true);
      try {
        const res = await apiClient.updatePersonalAgentConfig(userAddress, agentType, cfg);
        if (res?.config) {
          swarmConfigMemoryCache.set(lower, res.config);
          setConfig(res.config);
        }
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
      const lower = userAddress.toLowerCase();
      setIsSaving(true);
      try {
        const res = await apiClient.updateFleetConfig(userAddress, configs);
        if (res?.config) {
          swarmConfigMemoryCache.set(lower, res.config);
          setConfig(res.config);
        }
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
    const lower = userAddress.toLowerCase();
    setIsSaving(true);
    try {
      const res = await apiClient.resetPersonalSwarm(userAddress);
      if (res?.config) {
        swarmConfigMemoryCache.set(lower, res.config);
        setConfig(res.config);
      }
      const s = await apiClient.getPersonalSwarmStatus(userAddress).catch(() => null);
      if (s?.status) {
        swarmStatusMemoryCache.set(lower, s.status);
        setStatus(s.status);
      }
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to reset');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [userAddress]);

  // SECURITY: copyTradeEnabled is determined by backend config or initial verified session state.
  // In-memory module cache keeps UI persistent across tab switching with zero flash to copilot.
  const copyEnabled = config
    ? config.copyTradeEnabled === true
    : (options?.initialCopyTradeEnabled ?? false);

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
