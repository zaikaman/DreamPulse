import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api.js';
import type {
  CustomAgentDefinition,
  CustomSwarmDefinition,
  CustomAgentRules,
} from '../types/index.js';

export interface UseCustomAgentsReturn {
  agents: CustomAgentDefinition[];
  swarms: CustomSwarmDefinition[];
  isLoading: boolean;
  isSaving: boolean;
  isGenerating: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveLocalDraft: (payload: {
    id?: string;
    name: string;
    description?: string;
    symbol: string;
    timeframe: string;
    strategyType: string;
    rules: CustomAgentRules;
    color?: string;
    icon?: string;
    allocatedAllowance?: number;
  }) => CustomAgentDefinition;
  createAgent: (payload: {
    name: string;
    description?: string;
    symbol: string;
    timeframe: string;
    strategyType: string;
    rules: CustomAgentRules;
    color?: string;
    icon?: string;
    isDeployed?: boolean;
    allocatedAllowance?: number;
  }) => Promise<CustomAgentDefinition | null>;
  updateAgent: (id: string, payload: Partial<CustomAgentDefinition>) => Promise<CustomAgentDefinition | null>;
  deleteAgent: (id: string) => Promise<boolean>;
  deployAgent: (id: string, allowance?: number) => Promise<boolean>;
  pauseAgent: (id: string) => Promise<boolean>;
  setAgentAllowance: (id: string, allowance: number) => Promise<boolean>;
  generateFromPrompt: (prompt: string) => Promise<Partial<CustomAgentDefinition> | null>;
  createSwarm: (payload: {
    name: string;
    description?: string;
    agents: Array<{ agentId: string; agentName: string; role: string; weight: number }>;
    consensusRule: string;
    confidenceThreshold?: number;
  }) => Promise<CustomSwarmDefinition | null>;
  deleteSwarm: (id: string) => Promise<boolean>;
}

const LOCAL_STORAGE_DRAFTS_KEY = 'dreampulse_studio_local_drafts';

function loadLocalDrafts(): CustomAgentDefinition[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalDraftToStorage(draft: CustomAgentDefinition): void {
  try {
    const drafts = loadLocalDrafts();
    const idx = drafts.findIndex((d) => d.id === draft.id);
    if (idx >= 0) {
      drafts[idx] = draft;
    } else {
      drafts.unshift(draft);
    }
    localStorage.setItem(LOCAL_STORAGE_DRAFTS_KEY, JSON.stringify(drafts));
  } catch (err) {
    console.warn('[useCustomAgents] failed to save draft to localStorage', err);
  }
}

function removeLocalDraftFromStorage(id: string): void {
  try {
    const drafts = loadLocalDrafts().filter((d) => d.id !== id);
    localStorage.setItem(LOCAL_STORAGE_DRAFTS_KEY, JSON.stringify(drafts));
  } catch (err) {
    console.warn('[useCustomAgents] failed to remove draft from localStorage', err);
  }
}

// In-memory module cache across page navigation (strictly JS heap memory, zero persistence in localStorage)
const customAgentsMemoryCache = new Map<string, CustomAgentDefinition[]>();
const customSwarmsMemoryCache = new Map<string, CustomSwarmDefinition[]>();

export const useCustomAgents = (userAddress?: string): UseCustomAgentsReturn => {
  const cacheKey = (userAddress || 'anon').toLowerCase();
  const [agents, setAgents] = useState<CustomAgentDefinition[]>(() => {
    const cached = customAgentsMemoryCache.get(cacheKey);
    if (cached && cached.length > 0) return cached;
    return loadLocalDrafts();
  });
  const [swarms, setSwarms] = useState<CustomSwarmDefinition[]>(() => {
    return customSwarmsMemoryCache.get(cacheKey) || [];
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    return !customAgentsMemoryCache.has(cacheKey);
  });
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state mutations to memory cache for zero-flash tab navigation
  useEffect(() => {
    if (agents.length > 0) {
      customAgentsMemoryCache.set(cacheKey, agents);
    }
  }, [cacheKey, agents]);

  useEffect(() => {
    if (swarms.length > 0) {
      customSwarmsMemoryCache.set(cacheKey, swarms);
    }
  }, [cacheKey, swarms]);

  const fetchAll = useCallback(async () => {
    if (!customAgentsMemoryCache.has(cacheKey)) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const localDrafts = loadLocalDrafts();
      const [agentsRes, swarmsRes] = await Promise.all([
        apiClient.getCustomAgents(userAddress).catch(() => ({ success: true, count: 0, data: [] })),
        apiClient.getCustomSwarms(userAddress).catch(() => ({ success: true, count: 0, data: [] })),
      ]);

      const remoteAgents = agentsRes?.data || [];
      const combined = [...localDrafts];
      for (const remote of remoteAgents) {
        if (!combined.some((a) => a.id === remote.id)) {
          combined.push(remote);
        }
      }

      customAgentsMemoryCache.set(cacheKey, combined);
      setAgents(combined);
      if (swarmsRes?.data) {
        customSwarmsMemoryCache.set(cacheKey, swarmsRes.data);
        setSwarms(swarmsRes.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load custom agents and swarms');
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, cacheKey]);

  // Synchronizes agent/swarm definitions via REST. Supabase Realtime subscriptions
  // for active swarms and sessions are handled by usePersonalSwarm/useSessionKey,
  // which invoke supabase.removeChannel(channel) alongside channel.unsubscribe() on teardown.
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const saveLocalDraft = useCallback(
    (payload: {
      id?: string;
      name: string;
      description?: string;
      symbol: string;
      timeframe: string;
      strategyType: string;
      rules: CustomAgentRules;
      color?: string;
      icon?: string;
      allocatedAllowance?: number;
    }): CustomAgentDefinition => {
      const draftId = payload.id || `local-draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();
      const draftAgent: CustomAgentDefinition = {
        id: draftId,
        userAddress: userAddress || 'offline',
        name: payload.name,
        description: payload.description || '',
        symbol: payload.symbol,
        timeframe: (payload.timeframe as any) || '5m',
        strategyType: (payload.strategyType as any) || 'CUSTOM',
        rules: payload.rules,
        color: payload.color || '#2dd4bf',
        icon: payload.icon || 'BoltIcon',
        isActive: true,
        isDeployed: false,
        allocatedAllowance: payload.allocatedAllowance || 100,
        spentAllowance: 0,
        pnl: 0,
        winRate: 0,
        tradesCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      saveLocalDraftToStorage(draftAgent);
      setAgents((prev) => {
        const idx = prev.findIndex((a) => a.id === draftId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = draftAgent;
          return next;
        }
        return [draftAgent, ...prev];
      });
      return draftAgent;
    },
    [userAddress]
  );

  const createAgent = useCallback(
    async (payload: {
      name: string;
      description?: string;
      symbol: string;
      timeframe: string;
      strategyType: string;
      rules: CustomAgentRules;
      color?: string;
      icon?: string;
      isDeployed?: boolean;
      allocatedAllowance?: number;
    }): Promise<CustomAgentDefinition | null> => {
      // If user is not connected, save to local storage as offline draft
      if (!userAddress || userAddress === '0x0000000000000000000000000000000000000001') {
        const localDraft = saveLocalDraft(payload);
        return localDraft;
      }
      setIsSaving(true);
      setError(null);
      try {
        const res = await apiClient.createCustomAgent({
          ...payload,
          userAddress,
        });
        if (res?.success && res.data) {
          setAgents((prev) => [res.data, ...prev]);
          return res.data;
        }
        throw new Error('Failed to create agent');
      } catch (err: any) {
        setError(err.message || 'Failed to create strategy agent');
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [userAddress, saveLocalDraft]
  );

  const updateAgent = useCallback(
    async (id: string, payload: Partial<CustomAgentDefinition>): Promise<CustomAgentDefinition | null> => {
      if (id.startsWith('local-draft-') || !userAddress || userAddress === '0x0000000000000000000000000000000000000001') {
        const existing = agents.find((a) => a.id === id);
        const defaultRules: CustomAgentRules = {
          operator: 'AND',
          conditions: [],
          action: { direction: 'CALL', durationSec: 60, stakeType: 'FIXED', stakeAmount: 10 },
          risk: { maxConsecutiveLosses: 2, cooldownMinutes: 3, minPoolPayoutPct: 78 },
        };
        const updated: CustomAgentDefinition = {
          id,
          userAddress: userAddress || 'offline',
          name: payload.name || existing?.name || 'Draft Strategy',
          description: payload.description ?? existing?.description ?? '',
          symbol: payload.symbol || existing?.symbol || 'BTC/USD',
          timeframe: (payload.timeframe || existing?.timeframe || '5m') as any,
          strategyType: (payload.strategyType || existing?.strategyType || 'CUSTOM') as any,
          rules: payload.rules || existing?.rules || defaultRules,
          color: payload.color || existing?.color || '#2dd4bf',
          icon: payload.icon || existing?.icon || 'BoltIcon',
          isActive: payload.isActive ?? existing?.isActive ?? true,
          isDeployed: payload.isDeployed ?? existing?.isDeployed ?? false,
          allocatedAllowance: payload.allocatedAllowance ?? existing?.allocatedAllowance ?? 100,
          spentAllowance: payload.spentAllowance ?? existing?.spentAllowance ?? 0,
          pnl: payload.pnl ?? existing?.pnl ?? 0,
          winRate: payload.winRate ?? existing?.winRate ?? 0,
          tradesCount: payload.tradesCount ?? existing?.tradesCount ?? 0,
          createdAt: existing?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        saveLocalDraftToStorage(updated);
        setAgents((prev) => prev.map((a) => (a.id === id ? updated : a)));
        return updated;
      }
      setIsSaving(true);
      setError(null);
      try {
        const res = await apiClient.updateCustomAgent(id, {
          ...payload,
          userAddress: userAddress || undefined,
        });
        if (res?.success && res.data) {
          setAgents((prev) => prev.map((a) => (a.id === id ? res.data : a)));
          return res.data;
        }
        throw new Error('Failed to update agent');
      } catch (err: any) {
        setError(err.message || 'Failed to update strategy agent');
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [userAddress, agents]
  );

  const deleteAgent = useCallback(
    async (id: string): Promise<boolean> => {
      if (id.startsWith('local-draft-') || !userAddress || userAddress === '0x0000000000000000000000000000000000000001') {
        removeLocalDraftFromStorage(id);
        setAgents((prev) => prev.filter((a) => a.id !== id));
        return true;
      }
      try {
        await apiClient.deleteCustomAgent(id, userAddress);
        setAgents((prev) => prev.filter((a) => a.id !== id));
        return true;
      } catch {
        return false;
      }
    },
    [userAddress]
  );

  const deployAgent = useCallback(
    async (id: string, allowance?: number): Promise<boolean> => {
      if (!userAddress || userAddress === '0x0000000000000000000000000000000000000001') {
        setError('Wallet not connected. Connect your Web3 wallet to deploy autonomous agents.');
        return false;
      }
      let targetId = id;
      if (id.startsWith('local-draft-')) {
        const draft = agents.find((a) => a.id === id);
        if (draft) {
          try {
            const res = await apiClient.createCustomAgent({
              name: draft.name,
              description: draft.description,
              symbol: draft.symbol,
              timeframe: draft.timeframe,
              strategyType: draft.strategyType,
              rules: draft.rules,
              color: draft.color,
              icon: draft.icon,
              isDeployed: true,
              allocatedAllowance: allowance || draft.allocatedAllowance || 100,
              userAddress,
            });
            if (res?.success && res.data) {
              removeLocalDraftFromStorage(id);
              setAgents((prev) => [res.data, ...prev.filter((a) => a.id !== id)]);
              return true;
            }
          } catch (err: any) {
            setError(err.message || 'Failed to deploy local strategy');
            return false;
          }
        }
      }

      try {
        const res = await apiClient.deployCustomAgent(targetId, userAddress, allowance);
        if (res?.success && res.data) {
          setAgents((prev) =>
            prev.map((a) => (a.id === targetId ? res.data : a))
          );
          return true;
        }
        return false;
      } catch (err: any) {
        setError(err.message || 'Failed to deploy agent');
        return false;
      }
    },
    [userAddress, agents]
  );

  const pauseAgent = useCallback(
    async (id: string): Promise<boolean> => {
      if (!userAddress || userAddress === '0x0000000000000000000000000000000000000001') {
        setError('Wallet not connected.');
        return false;
      }
      try {
        const res = await apiClient.pauseCustomAgent(id, userAddress);
        if (res?.success && res.data) {
          setAgents((prev) =>
            prev.map((a) => (a.id === id ? res.data : a))
          );
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [userAddress]
  );

  const setAgentAllowance = useCallback(
    async (id: string, allowance: number): Promise<boolean> => {
      if (!userAddress || userAddress === '0x0000000000000000000000000000000000000001') {
        setError('Wallet not connected.');
        return false;
      }
      try {
        const res = await apiClient.setCustomAgentAllowance(id, userAddress, allowance);
        if (res?.success && res.data) {
          setAgents((prev) =>
            prev.map((a) => (a.id === id ? res.data : a))
          );
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [userAddress]
  );

  const generateFromPrompt = useCallback(
    async (prompt: string): Promise<Partial<CustomAgentDefinition> | null> => {
      setIsGenerating(true);
      setError(null);
      try {
        const res = await apiClient.generateAgentFromPrompt(prompt);
        if (res?.success && res.data) {
          return res.data;
        }
        throw new Error('Failed to generate agent');
      } catch (err: any) {
        setError(err.message || 'AI generator encountered an error');
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    []
  );

  const createSwarm = useCallback(
    async (payload: {
      name: string;
      description?: string;
      agents: Array<{ agentId: string; agentName: string; role: string; weight: number }>;
      consensusRule: string;
      confidenceThreshold?: number;
    }): Promise<CustomSwarmDefinition | null> => {
      if (!userAddress || userAddress === '0x0000000000000000000000000000000000000001') {
        setError('Wallet not connected. Connect your Web3 wallet to create custom swarms.');
        return null;
      }
      setIsSaving(true);
      setError(null);
      try {
        const res = await apiClient.createCustomSwarm({
          ...payload,
          userAddress,
        });
        if (res?.success && res.data) {
          setSwarms((prev) => [res.data, ...prev]);
          return res.data;
        }
        throw new Error('Failed to create swarm');
      } catch (err: any) {
        setError(err.message || 'Failed to create swarm council');
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [userAddress]
  );

  const deleteSwarm = useCallback(
    async (id: string): Promise<boolean> => {
      if (!userAddress || userAddress === '0x0000000000000000000000000000000000000001') {
        return false;
      }
      try {
        await apiClient.deleteCustomSwarm(id, userAddress);
        setSwarms((prev) => prev.filter((s) => s.id !== id));
        return true;
      } catch {
        return false;
      }
    },
    [userAddress]
  );

  return {
    agents,
    swarms,
    isLoading,
    isSaving,
    isGenerating,
    error,
    refresh: fetchAll,
    saveLocalDraft,
    createAgent,
    updateAgent,
    deleteAgent,
    deployAgent,
    pauseAgent,
    setAgentAllowance,
    generateFromPrompt,
    createSwarm,
    deleteSwarm,
  };
};
