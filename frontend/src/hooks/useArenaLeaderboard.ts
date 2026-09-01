import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/api.js';
import type {
  ArenaAgentEntry,
  ArenaTraderEntry,
  TraderProfileDetail,
  ArenaGlobalStats,
  ArenaTimeframe,
  ArenaSortBy,
  CustomAgentDefinition,
  SocialCopyConfig,
} from '../types/index.js';

export type ArenaTrackType = 'AGENTS' | 'TRADERS';

export function useArenaLeaderboard(userAddress?: string | null) {
  const [activeTrack, setActiveTrack] = useState<ArenaTrackType>('AGENTS');
  const [timeframe, setTimeframe] = useState<ArenaTimeframe>('7d');
  const [symbolFilter, setSymbolFilter] = useState<string>('ALL');
  const [strategyFilter, setStrategyFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<ArenaSortBy>('pnl');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [agents, setAgents] = useState<ArenaAgentEntry[]>([]);
  const [traders, setTraders] = useState<ArenaTraderEntry[]>([]);
  const [stats, setStats] = useState<ArenaGlobalStats | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Trader Profile Drawer state
  const [selectedTraderAddress, setSelectedTraderAddress] = useState<string | null>(null);
  const [traderProfile, setTraderProfile] = useState<TraderProfileDetail | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(false);

  // Cloning & Copy-Trading Action states
  const [cloningAgentId, setCloningAgentId] = useState<string | null>(null);
  const [cloneSuccessMsg, setCloneSuccessMsg] = useState<string | null>(null);
  const [clonedAgentResult, setClonedAgentResult] = useState<CustomAgentDefinition | null>(null);

  const [copyTradingTarget, setCopyTradingTarget] = useState<string | null>(null);
  const [isCopyTradeLoading, setIsCopyTradeLoading] = useState<boolean>(false);
  const [copyTradeStatusMsg, setCopyTradeStatusMsg] = useState<string | null>(null);
  const [mirroredTargets, setMirroredTargets] = useState<Set<string>>(new Set());
  const [followingConfigs, setFollowingConfigs] = useState<SocialCopyConfig[]>([]);

  const isMountedRef = useRef<boolean>(true);

  // Fetch following list
  const fetchFollowing = useCallback(async () => {
    if (!userAddress) {
      setMirroredTargets(new Set());
      setFollowingConfigs([]);
      return;
    }
    try {
      const res = await apiClient.getSocialCopyFollowing(userAddress);
      if (isMountedRef.current && res.success && Array.isArray(res.data)) {
        setFollowingConfigs(res.data);
        const set = new Set<string>(
          res.data
            .filter((r) => r.isActive !== false)
            .map((r: any) => (r.targetAddress || r.target_address || '').toLowerCase())
            .filter(Boolean)
        );
        setMirroredTargets(set);
      }
    } catch {}
  }, [userAddress]);

  // Fetch Leaderboard Data
  const fetchLeaderboardData = useCallback(async (showRefreshingState = false) => {
    if (showRefreshingState) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      // 1. Fetch Arena Stats and Following in parallel
      apiClient.getArenaStats().then((res) => {
        if (isMountedRef.current && res.success && res.data) {
          setStats(res.data);
        }
      }).catch(() => {});

      fetchFollowing();

      // 2. Fetch both Agents and Traders in parallel so both counts are always populated immediately
      const [agentsRes, tradersRes] = await Promise.all([
        apiClient.getArenaAgents({
          timeframe,
          symbol: symbolFilter,
          strategyType: strategyFilter,
          sortBy: activeTrack === 'AGENTS' ? sortBy : 'pnl',
          search: searchQuery,
        }).catch(() => null),
        apiClient.getArenaTraders({
          range: timeframe,
          sortBy: activeTrack === 'TRADERS' ? sortBy : 'pnl',
          search: searchQuery,
        }).catch(() => null),
      ]);

      if (isMountedRef.current) {
        if (agentsRes?.success) {
          setAgents(agentsRes.data);
        }
        if (tradersRes?.success) {
          setTraders(tradersRes.data);
        }
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setError(err.message || 'Failed to load leaderboard data');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [activeTrack, timeframe, symbolFilter, strategyFilter, sortBy, searchQuery]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchLeaderboardData();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchLeaderboardData]);

  // Fetch Trader Profile
  const fetchTraderProfile = useCallback(async (address: string) => {
    setSelectedTraderAddress(address);
    setIsLoadingProfile(true);
    try {
      const res = await apiClient.getTraderProfile(address);
      if (isMountedRef.current && res.success) {
        setTraderProfile(res.data);
      }
    } catch (err: any) {
      console.warn('[useArenaLeaderboard] Profile fetch error:', err.message);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingProfile(false);
      }
    }
  }, []);

  const closeTraderProfile = useCallback(() => {
    setSelectedTraderAddress(null);
    setTraderProfile(null);
  }, []);

  // 1-Click Strategy Clone
  const cloneStrategy = useCallback(async (agentId: string, targetAddress?: string): Promise<CustomAgentDefinition | null> => {
    const effectiveUser = targetAddress || userAddress;
    if (!effectiveUser) {
      setError('Please connect your wallet to clone this strategy');
      return null;
    }

    setCloningAgentId(agentId);
    setCloneSuccessMsg(null);
    setError(null);

    try {
      const res = await apiClient.cloneArenaAgent(agentId, effectiveUser);
      if (res.success && res.data) {
        setCloneSuccessMsg(`Strategy "${res.data.name}" cloned to your studio library!`);
        setClonedAgentResult(res.data);
        // Refresh agents list to update clone counts
        fetchLeaderboardData(true);
        return res.data;
      }
      return null;
    } catch (err: any) {
      setError(err.message || 'Failed to clone strategy');
      return null;
    } finally {
      setCloningAgentId(null);
    }
  }, [userAddress, fetchLeaderboardData]);

  // Social Copy-Trading Toggle & Risk Configuration
  const toggleSocialCopyTrading = useCallback(async (
    targetAddress: string,
    enabled: boolean,
    maxTradeSize?: number,
    dailyVolumeCap?: number,
  ) => {
    if (!userAddress) {
      setError('Please connect your wallet to enable social copy-trading');
      return;
    }

    setCopyTradingTarget(targetAddress);
    setIsCopyTradeLoading(true);
    setCopyTradeStatusMsg(null);
    setError(null);

    try {
      const res = await apiClient.toggleSocialCopyTrade({
        userAddress,
        targetAddress,
        enabled,
        maxTradeSize,
        dailyVolumeCap,
      });
      if (res.success) {
        setCopyTradeStatusMsg(res.message);
        setMirroredTargets((prev) => {
          const next = new Set(prev);
          if (enabled) {
            next.add(targetAddress.toLowerCase());
          } else {
            next.delete(targetAddress.toLowerCase());
          }
          return next;
        });
        // Update following configs state immediately
        setFollowingConfigs((prev) => {
          const targetLower = targetAddress.toLowerCase();
          const filtered = prev.filter(
            (c) => (c.targetAddress || '').toLowerCase() !== targetLower
          );
          if (enabled && res.config) {
            return [...filtered, res.config];
          }
          return filtered;
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update copy-trading settings');
    } finally {
      setIsCopyTradeLoading(false);
      setCopyTradingTarget(null);
    }
  }, [userAddress]);

  const isForecasterMirrored = useCallback((targetAddress: string): boolean => {
    if (!targetAddress) return false;
    return mirroredTargets.has(targetAddress.toLowerCase());
  }, [mirroredTargets]);

  const getCopierConfig = useCallback((targetAddress: string): SocialCopyConfig | undefined => {
    if (!targetAddress) return undefined;
    const targetLower = targetAddress.toLowerCase();
    return followingConfigs.find(
      (c) => (c.targetAddress || '').toLowerCase() === targetLower
    );
  }, [followingConfigs]);

  const clearMessages = useCallback(() => {
    setCloneSuccessMsg(null);
    setCopyTradeStatusMsg(null);
    setError(null);
    setClonedAgentResult(null);
  }, []);

  return {
    activeTrack,
    setActiveTrack,
    timeframe,
    setTimeframe,
    symbolFilter,
    setSymbolFilter,
    strategyFilter,
    setStrategyFilter,
    sortBy,
    setSortBy,
    searchQuery,
    setSearchQuery,
    agents,
    traders,
    stats,
    isLoading,
    isRefreshing,
    error,
    refresh: () => fetchLeaderboardData(true),
    selectedTraderAddress,
    traderProfile,
    isLoadingProfile,
    openTraderProfile: fetchTraderProfile,
    closeTraderProfile,
    cloningAgentId,
    cloneSuccessMsg,
    clonedAgentResult,
    cloneStrategy,
    copyTradingTarget,
    isCopyTradeLoading,
    copyTradeStatusMsg,
    mirroredTargets,
    followingConfigs,
    isForecasterMirrored,
    getCopierConfig,
    toggleSocialCopyTrading,
    clearMessages,
  };
}

