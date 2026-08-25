import type {
  Market,
  OrderBookDepth,
  SessionGrant,
  SwarmStatusSummary,
  AgentThoughtLog,
  BacktestResult,
} from '../types/index.js';

const API_BASE_URL = import.meta.env.VITE_BACKEND_HTTP_URL || '/api/v1';

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Request Failed [${response.status}]: ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  // Markets & Depth
  async getMarkets(params?: { status?: string; symbol?: string; window?: string }): Promise<{ success: boolean; count: number; data: Market[] }> {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    const endpoint = query ? `/markets?${query}` : '/markets';
    return fetchJson<{ success: boolean; count: number; data: Market[] }>(endpoint);
  },

  async getMarketDepth(marketId: string): Promise<{ success: boolean; marketId: string; depth: OrderBookDepth }> {
    return fetchJson<{ success: boolean; marketId: string; depth: OrderBookDepth }>(`/markets/${encodeURIComponent(marketId)}/depth`);
  },

  // Sessions
  async registerSession(payload: {
    userAddress: string;
    operatorAddress: string;
    maxTradeSize: number;
    dailyVolumeCap: number;
    expiresAt?: string;
    signature?: string;
  }): Promise<{ success: boolean; session: SessionGrant }> {
    return fetchJson<{ success: boolean; session: SessionGrant }>('/sessions/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async revokeSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    return fetchJson<{ success: boolean; message: string }>(`/sessions/${encodeURIComponent(sessionId)}/revoke`, {
      method: 'POST',
    });
  },

  // Swarm Agents
  async getSwarmStatus(): Promise<{ success: boolean; agents: SwarmStatusSummary }> {
    return fetchJson<{ success: boolean; agents: SwarmStatusSummary }>('/agents/status');
  },

  async getAgentLogs(agentType?: string, limit: number = 50): Promise<{ success: boolean; logs: AgentThoughtLog[] }> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (agentType) params.append('agentType', agentType);
    return fetchJson<{ success: boolean; logs: AgentThoughtLog[] }>(`/agents/logs?${params.toString()}`);
  },

  // Sweeper & Backtest
  async triggerSweep(userAddress: string): Promise<{
    success: boolean;
    claimedMarketsCount: number;
    totalClaimedAmount: string;
    txHash: string;
  }> {
    return fetchJson('/sweeper/trigger', {
      method: 'POST',
      body: JSON.stringify({ userAddress }),
    });
  },

  async runBacktest(config: {
    agentType: string;
    symbol: string;
    startDate?: string;
    endDate?: string;
    initialCapital?: number;
    strategyConfig?: Record<string, unknown>;
  }): Promise<{ success: boolean; result: BacktestResult }> {
    return fetchJson('/backtest/run', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },
};
