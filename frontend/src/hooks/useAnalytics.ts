import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/api.js';
import type { WalletState } from './useSessionKey.js';

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

export function useAnalytics(wallet?: WalletState, initialRange: AnalyticsRange = '30d'): UseAnalyticsReturn {
  const address = wallet?.address || undefined;
  const [range, setRange] = useState<AnalyticsRange>(initialRange);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);

  const fetchData = useCallback(async (force = false) => {
    const now = Date.now();
    if (inFlightRef.current) return;
    if (!force && now - lastFetchAtRef.current < 900) return;
    inFlightRef.current = true;
    lastFetchAtRef.current = now;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.getAnalytics(address, range);
      if (res.success && res.data) {
        setData(res.data as AnalyticsData);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, [address, range]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Realtime refresh on pnl updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let debounceTimer: number | null = null;

    const schedule = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => fetchData(true), 800);
    };

    const connect = () => {
      try {
        const wsUrl = (import.meta as any).env?.VITE_BACKEND_WS_URL
          ? (import.meta as any).env.VITE_BACKEND_WS_URL
          : (() => {
              const loc = window.location;
              const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
              const host = loc.hostname;
              const port = loc.port === '5173' ? '5000' : loc.port || '5000';
              return `${protocol}//${host}:${port}/ws/telemetry`;
            })();
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          try { ws?.send(JSON.stringify({ action: 'subscribe', channel: 'user_portfolio' })); } catch {}
          try { ws?.send(JSON.stringify({ action: 'subscribe', channel: 'markets' })); } catch {}
        };
        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse((event as MessageEvent).data);
            if (payload.event === 'pnl_update' || payload.event === 'order_filled' || payload.event === 'sweep_completed' || payload.event === 'swarm_pnl_tick') {
              schedule();
            }
          } catch {}
        };
        ws.onclose = () => { reconnectTimer = window.setTimeout(connect, 3000); };
        ws.onerror = () => { try { ws?.close(); } catch {} };
      } catch {
        reconnectTimer = window.setTimeout(connect, 3000);
      }
    };
    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      try { ws?.close(); } catch {}
    };
  }, [fetchData]);

  return { data, isLoading, error, range, setRange, refresh: () => fetchData(true) };
}
