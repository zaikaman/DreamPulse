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
import { shouldPoll } from '../lib/polling.js';

export type ArenaTrackType = 'AGENTS' | 'TRADERS';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const ARENA_CACHE_TTL_MS = 60_000; // 60s TTL for cache freshness

// Module-level caches persist across navigation / route unmounts
const agentsCache = new Map<string, CacheEntry<ArenaAgentEntry[]>>();
const tradersCache = new Map<string, CacheEntry<ArenaTraderEntry[]>>();
let statsCache: CacheEntry<ArenaGlobalStats> | null = null;
let lastVisibilityFetchTime = 0;

function getAgentsCacheKey(
  timeframe: string,
  symbol: string,
  strategy: string,
  sortBy: string,
  search?: string
): string {
  return `${timeframe}:${symbol}:${strategy}:${sortBy}:${(search || '').trim().toLowerCase()}`;
}

function getTradersCacheKey(timeframe: string, sortBy: string, search?: string): string {
  return `${timeframe}:${sortBy}:${(search || '').trim().toLowerCase()}`;
}

function sortAgentsLocal(list: ArenaAgentEntry[], sortBy: ArenaSortBy): ArenaAgentEntry[] {
  const copy = [...list];
  copy.sort((a, b) => {
    switch (sortBy) {
      case 'winRate':
        return b.winRate - a.winRate;
      case 'trades':
        return b.tradesCount - a.tradesCount;
      case 'sharpe':
        return b.sharpeRatio - a.sharpeRatio;
      case 'pnl':
      default:
        return b.pnl - a.pnl;
    }
  });
  return copy.map((item, idx) => ({ ...item, rank: idx + 1 }));
}

function sortTradersLocal(list: ArenaTraderEntry[], sortBy: ArenaSortBy): ArenaTraderEntry[] {
  const copy = [...list];
  copy.sort((a, b) => {
    switch (sortBy) {
      case 'winRate':
        return b.winRate - a.winRate;
      case 'trades':
        return b.tradesCount - a.tradesCount;
      case 'volume':
        return (b.volume ?? 0) - (a.volume ?? 0);
      case 'streak':
        return (b.currentStreak ?? 0) - (a.currentStreak ?? 0);
      case 'pnl':
      default:
        return b.realizedPnl - a.realizedPnl;
    }
  });
  return copy.map((item, idx) => ({ ...item, rank: idx + 1 }));
}

export function useArenaLeaderboard(userAddress?: string | null) {
  const [activeTrack, setActiveTrack] = useState<ArenaTrackType>('AGENTS');
  const [timeframe, setTimeframe] = useState<ArenaTimeframe>('7d');
  const [symbolFilter, setSymbolFilter] = useState<string>('ALL');
  const [strategyFilter, setStrategyFilter] = useState<string>('ALL');
  const [agentSortBy, setAgentSortBy] = useState<ArenaSortBy>('pnl');
  const [traderSortBy, setTraderSortBy] = useState<ArenaSortBy>('pnl');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');

  // Debounce search query to prevent request storms on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Seed initial state from module cache if already fetched in this session
  const initialAgentsKey = getAgentsCacheKey('7d', 'ALL', 'ALL', 'pnl', '');
  const initialTradersKey = getTradersCacheKey('7d', 'pnl', '');
  const cachedInitialAgents = agentsCache.get(initialAgentsKey);
  const cachedInitialTraders = tradersCache.get(initialTradersKey);

  const [agents, setAgents] = useState<ArenaAgentEntry[]>(() => cachedInitialAgents?.data || []);
  const [traders, setTraders] = useState<ArenaTraderEntry[]>(() => cachedInitialTraders?.data || []);
  const [stats, setStats] = useState<ArenaGlobalStats | null>(() => statsCache?.data || null);

  const [isLoading, setIsLoading] = useState<boolean>(() => !cachedInitialAgents || !cachedInitialTraders);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Unified sortBy based on currently active track
  const sortBy = activeTrack === 'AGENTS' ? agentSortBy : traderSortBy;

  const setSortBy = useCallback((newSort: ArenaSortBy) => {
    if (activeTrack === 'AGENTS') {
      setAgentSortBy(newSort);
      // Optimistic instant re-sort in memory for 0ms visual feedback
      setAgents((prev) => sortAgentsLocal(prev, newSort));
    } else {
      setTraderSortBy(newSort);
      // Optimistic instant re-sort in memory for 0ms visual feedback
      setTraders((prev) => sortTradersLocal(prev, newSort));
    }
  }, [activeTrack]);

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

  // Fetch Leaderboard Data with Stale-While-Revalidate and In-Memory Caching
  // Note: activeTrack is intentionally NOT a dependency so switching tracks never triggers network requests!
  const fetchLeaderboardData = useCallback(async (forceRefresh = false) => {
    const effectiveSearch = debouncedSearchQuery.trim() || undefined;
    const agentsKey = getAgentsCacheKey(timeframe, symbolFilter, strategyFilter, agentSortBy, effectiveSearch);
    const tradersKey = getTradersCacheKey(timeframe, traderSortBy, effectiveSearch);
    const now = Date.now();

    const cachedAgents = agentsCache.get(agentsKey);
    const cachedTraders = tradersCache.get(tradersKey);
    const hasValidAgentsCache = cachedAgents && (now - cachedAgents.timestamp < ARENA_CACHE_TTL_MS);
    const hasValidTradersCache = cachedTraders && (now - cachedTraders.timestamp < ARENA_CACHE_TTL_MS);

    // 1. If not forcing a refresh, immediately serve cached entries (stale-while-revalidate)
    if (!forceRefresh) {
      if (cachedAgents) {
        setAgents(cachedAgents.data);
      }
      if (cachedTraders) {
        setTraders(cachedTraders.data);
      }
      if (statsCache && (now - statsCache.timestamp < ARENA_CACHE_TTL_MS)) {
        setStats(statsCache.data);
      }

      // If both caches are still fresh, skip network round-trip completely
      if (hasValidAgentsCache && hasValidTradersCache) {
        setIsLoading(false);
        setIsRefreshing(false);
        fetchFollowing();
        return;
      }
    }

    // 2. Decide loading indicator: if we already have visible data, use quiet refreshing without blanking table
    const hasAnyData = agents.length > 0 || traders.length > 0 || Boolean(cachedAgents) || Boolean(cachedTraders);
    if (hasAnyData || forceRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      // Fetch Arena Stats if expired or missing
      if (forceRefresh || !statsCache || (now - statsCache.timestamp >= ARENA_CACHE_TTL_MS)) {
        apiClient.getArenaStats().then((res) => {
          if (isMountedRef.current && res.success && res.data) {
            statsCache = { data: res.data, timestamp: Date.now() };
            setStats(res.data);
          }
        }).catch(() => {});
      }

      fetchFollowing();

      // Fetch both Agents and Traders in parallel
      const [agentsRes, tradersRes] = await Promise.all([
        apiClient.getArenaAgents({
          timeframe,
          symbol: symbolFilter,
          strategyType: strategyFilter,
          sortBy: agentSortBy,
          search: effectiveSearch,
        }).catch(() => null),
        apiClient.getArenaTraders({
          range: timeframe,
          sortBy: traderSortBy,
          search: effectiveSearch,
        }).catch(() => null),
      ]);

      if (isMountedRef.current) {
        if (agentsRes?.success && Array.isArray(agentsRes.data)) {
          agentsCache.set(agentsKey, { data: agentsRes.data, timestamp: Date.now() });
          setAgents(agentsRes.data);
        }
        if (tradersRes?.success && Array.isArray(tradersRes.data)) {
          tradersCache.set(tradersKey, { data: tradersRes.data, timestamp: Date.now() });
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
  }, [timeframe, symbolFilter, strategyFilter, agentSortBy, traderSortBy, debouncedSearchQuery, fetchFollowing, agents.length, traders.length]);

  useEffect(() => {
    isMountedRef.current = true;
    if (shouldPoll()) {
      fetchLeaderboardData();
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        // Throttle visibility refetches so rapid tabbing doesn't trigger storms
        if (now - lastVisibilityFetchTime > 15_000) {
          lastVisibilityFetchTime = now;
          fetchLeaderboardData(true);
        }
      }
    };
    const onFocus = () => {
      if (shouldPoll()) {
        const now = Date.now();
        if (now - lastVisibilityFetchTime > 15_000) {
          lastVisibilityFetchTime = now;
          fetchLeaderboardData(true);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      isMountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
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
        // Invalidate agent cache so fresh clone count is reflected
        agentsCache.clear();
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
  ): Promise<boolean> => {
    if (!userAddress) {
      setError('Please connect your wallet to enable social copy-trading');
      return false;
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
        return true;
      }
      return false;
    } catch (err: any) {
      setError(err.message || 'Failed to update copy-trading settings');
      return false;
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
