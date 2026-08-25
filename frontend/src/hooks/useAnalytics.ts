import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/api.js';
import type { WalletState } from './useSessionKey.js';
import { telemetryClient } from '../services/telemetry-client.js';

export type AnalyticsRange = '24h' | '7d' | '30d' | '90d' | 'ALL';

export interface EquityPoint {
  date: string;
  timestamp: number;
  cumulativePnl: number;
  dailyPnl: number;
  trades: number;
  volume: number;
  wins: number;
  losses: number;
}

export interface DailyBar {
  date: string;
  timestamp: number;
  pnl: number;
  volume: number;
  trades: number;
  wins: number;
  losses: number;
}

export interface AgentBreakdown {
  agentType: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  volume: number;
  avgPnl: number;
}

export interface LedgerRow {
  date: string;
  timestamp: number;
  startBalance: number;
  endBalance: number;
  dailyPnl: number;
  trades: number;
  wins: number;
  losses: number;
  volume: number;
}

export interface AnalyticsSummary {
  totalPnl: number;
  realizedPnl: number;
  unclaimedPnl: number;
  totalTrades: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  totalVolume: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  payoffRatio: number;
  expectancy: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  bestDay: number;
  worstDay: number;
  avgDailyPnl: number;
  currentStreak: number;
  sharpeApprox: number;
  totalClaimed: number;
}

export interface AnalyticsData {
  range: AnalyticsRange;
  userAddress: string;
  isOperator: boolean;
  generatedAt: string;
  summary: AnalyticsSummary;
  equityCurve: EquityPoint[];
  swarmEquityCurve: EquityPoint[];
  dailyBars: DailyBar[];
  agentBreakdown: AgentBreakdown[];
  swarmAgentBreakdown: AgentBreakdown[];
  outcomeBreakdown: { outcome: string; pnl: number; trades: number; winRate: number }[];
  symbolBreakdown: { symbol: string; pnl: number; trades: number; winRate: number }[];
  windowBreakdown: { window: string; pnl: number; trades: number }[];
  ledger: LedgerRow[];
  recentTrades: any[];
}

export interface UseAnalyticsReturn {
  data: AnalyticsData | null;
  isLoading: boolean;
  error: string | null;
  range: AnalyticsRange;
  setRange: (r: AnalyticsRange) => void;
  refresh: () => Promise<void>;
}

const LOCAL_ANALYTICS_PREFIX = 'dreampulse_analytics_';

export function useAnalytics(wallet?: WalletState, initialRange: AnalyticsRange = '30d'): UseAnalyticsReturn {
  const address = wallet?.address || undefined;
  const [range, setRange] = useState<AnalyticsRange>(initialRange);
  const cacheKey = `${LOCAL_ANALYTICS_PREFIX}${address || 'swarm'}_${range}`;

  const [data, setData] = useState<AnalyticsData | null>(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(!data);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);

  // Sync cache if active wallet or range changes
  useEffect(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setData(JSON.parse(cached));
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
    } catch {}
  }, [cacheKey]);

  const fetchData = useCallback(async (force = false) => {
    const now = Date.now();
    if (inFlightRef.current) return;
    if (!force && now - lastFetchAtRef.current < 900) return;
    inFlightRef.current = true;
    lastFetchAtRef.current = now;
    setError(null);
    try {
      const res = await apiClient.getAnalytics(address, range);
      if (res.success && res.data) {
        setData(res.data as AnalyticsData);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(res.data));
        } catch {}
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, [address, range, cacheKey]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Realtime refresh on user trade & settlement events via multiplexed telemetry bus
  useEffect(() => {
    let debounceTimer: number | null = null;

    const schedule = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => fetchData(true), 800);
    };

    const unsubPnl = telemetryClient.on('pnl_update', schedule);
    const unsubOrder = telemetryClient.on('order_filled', schedule);
    const unsubSweep = telemetryClient.on('sweep_completed', schedule);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubPnl();
      unsubOrder();
      unsubSweep();
    };
  }, [fetchData]);

  return { data, isLoading, error, range, setRange, refresh: () => fetchData(true) };
}
