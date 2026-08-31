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

export const useCustomAgents = (userAddress?: string): UseCustomAgentsReturn => {
  const [agents, setAgents] = useState<CustomAgentDefinition[]>([]);
  const [swarms, setSwarms] = useState<CustomSwarmDefinition[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [agentsRes, swarmsRes] = await Promise.all([
        apiClient.getCustomAgents(userAddress).catch(() => ({ success: true, count: 0, data: [] })),
        apiClient.getCustomSwarms(userAddress).catch(() => ({ success: true, count: 0, data: [] })),
      ]);

      if (agentsRes?.data) {
        setAgents(agentsRes.data);
      }
      if (swarmsRes?.data) {
        setSwarms(swarmsRes.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load custom agents and swarms');
    } finally {
      setIsLoading(false);
    }
  }, [userAddress]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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
      const targetAddress = userAddress || '0x0000000000000000000000000000000000000001';
      setIsSaving(true);
      setError(null);
      try {
        const res = await apiClient.createCustomAgent({
          ...payload,
          userAddress: targetAddress,
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
    [userAddress]
  );

  const updateAgent = useCallback(
    async (id: string, payload: Partial<CustomAgentDefinition>): Promise<CustomAgentDefinition | null> => {
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
    [userAddress]
  );

  const deleteAgent = useCallback(
    async (id: string): Promise<boolean> => {
      const targetAddress = userAddress || '';
      try {
        await apiClient.deleteCustomAgent(id, targetAddress);
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
      const targetAddress = userAddress || '0x0000000000000000000000000000000000000001';
      try {
        const res = await apiClient.deployCustomAgent(id, targetAddress, allowance);
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

  const pauseAgent = useCallback(
    async (id: string): Promise<boolean> => {
      const targetAddress = userAddress || '0x0000000000000000000000000000000000000001';
      try {
        const res = await apiClient.pauseCustomAgent(id, targetAddress);
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
      const targetAddress = userAddress || '0x0000000000000000000000000000000000000001';
      try {
        const res = await apiClient.setCustomAgentAllowance(id, targetAddress, allowance);
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
      const targetAddress = userAddress || '0x0000000000000000000000000000000000000001';
      setIsSaving(true);
      setError(null);
      try {
        const res = await apiClient.createCustomSwarm({
          ...payload,
          userAddress: targetAddress,
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
      const targetAddress = userAddress || '';
      try {
        await apiClient.deleteCustomSwarm(id, targetAddress);
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
