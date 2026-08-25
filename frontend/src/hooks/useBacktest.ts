import { useState, useEffect, useCallback } from 'react';
import type { AgentType } from '../types/index.js';
import { apiClient } from '../services/api.js';

export interface FrictionParams {
  slippageBps?: number;
  feeBps?: number;
  latencyMs?: number;
}

export interface BacktestParams {
  agentType: AgentType;
  symbol: string;
  timeframe?: '1m' | '5m' | '15m' | '1h';
  period?: '24h' | '3d' | '7d' | '14d' | '30d' | 'custom';
  startDate?: string;
  endDate?: string;
  initialCapital?: number;
  strategyConfig: {
    minEdge?: number;
    driftThreshold?: number;
    targetSpread?: number;
    inventoryAversion?: number;
    lotSize?: number;
    maxTradeSize?: number;
    confidenceThreshold?: number;
  };
  frictionConfig?: FrictionParams;
}

export interface BacktestEquityPoint {
  timestamp: string;
  equity: number;
  pnl: number;
}

export interface BacktestUnderwaterPoint {
  timestamp: string;
  drawdownPct: number;
}

export interface BacktestTradeFill {
  id: string;
  timestamp: string;
  action: string;
  outcome: 'YES' | 'NO';
  price: number;
  lots: number;
  grossPnl: number;
  fee: number;
  pnl: number;
  cumulativePnl: number;
}

export interface BacktestDetailedResult {
  id: string;
  userAddress: string;
  agentType: AgentType;
  symbol: string;
  timeframe: string;
  period: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  strategyConfig: Record<string, any>;
  totalTrades: number;
  winRate: number;
  netPnl: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  profitFactor: number;
  expectancy: number;
  payoffRatio: number;
  avgWin: number;
  avgLoss: number;
  totalWins: number;
  totalLosses: number;
  totalFeesPaid: number;
  createdAt: string;
  equityCurve: BacktestEquityPoint[];
  underwaterCurve: BacktestUnderwaterPoint[];
  trades: BacktestTradeFill[];
}

export const useBacktest = (userAddress?: string) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentResult, setCurrentResult] = useState<BacktestDetailedResult | null>(null);
  const [history, setHistory] = useState<BacktestDetailedResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/backtest/history${userAddress ? `?userAddress=${userAddress}` : ''}`).then((r) => r.json());
      if (res?.data) {
        setHistory(res.data);
      }
    } catch {
      // ignore
    }
  }, [userAddress]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const runSimulation = useCallback(
    async (params: BacktestParams): Promise<BacktestDetailedResult | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const payload = {
          userAddress: userAddress || undefined,
          ...params,
        };

        const response = await fetch('/api/v1/backtest/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then((r) => r.json());

        if (response?.success && response.result) {
          setCurrentResult(response.result);
          setHistory((prev) => [response.result, ...prev]);
          return response.result;
        } else {
          throw new Error(response?.error || 'Simulation failed');
        }
      } catch (err: any) {
        setError(err.message || 'Simulation execution error');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [userAddress],
  );

  const deployToSwarm = useCallback(
    async (result: BacktestDetailedResult): Promise<boolean> => {
      try {
        const agentType = result.agentType;
        const config = result.strategyConfig;
        const res = await apiClient.updateAgentConfig(agentType, config);
        return res.success;
      } catch (err: any) {
        console.warn('[useBacktest] Error deploying strategy to swarm:', err);
        return false;
      }
    },
    [],
  );

  return {
    isLoading,
    currentResult,
    history,
    error,
    runSimulation,
    deployToSwarm,
    fetchHistory,
  };
};
