import type {
  Market,
  OrderBookDepth,
  SessionGrant,
  SwarmStatusSummary,
  AgentThoughtLog,
  BacktestResult,
  SettlementSweep,
  SweeperSummary,
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
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.symbol && params.symbol !== 'ALL') searchParams.append('symbol', params.symbol);
    if (params?.window && params.window !== 'ALL') searchParams.append('window', params.window);
    const query = searchParams.toString();
    const endpoint = query ? `/markets?${query}` : '/markets';
    return fetchJson<{ success: boolean; count: number; data: Market[] }>(endpoint);
  },

  async getMarketDepth(marketId: string): Promise<{ success: boolean; marketId: string; depth: OrderBookDepth }> {
    return fetchJson<{ success: boolean; marketId: string; depth: OrderBookDepth }>(`/markets/${encodeURIComponent(marketId)}/depth`);
  },

  async getSpotPrices(): Promise<{ success: boolean; data: Record<string, { symbol: string; price: number; change1m: number; change5m: number; high24h: number; low24h: number; volume24h: number; timestamp: number }> }> {
    return fetchJson<{ success: boolean; data: Record<string, { symbol: string; price: number; change1m: number; change5m: number; high24h: number; low24h: number; volume24h: number; timestamp: number }> }>('/markets/spot');
  },

  // Sessions
  async registerSession(payload: {
    userAddress: string;
    operatorAddress: string;
    maxTradeSize: number;
    dailyVolumeCap: number;
    expiresAt?: string;
    signature?: string;
    onChainTxHash?: string;
    vaultDepositAmount?: number;
    targetPoolAddress?: string;
    onChainAuthorized?: boolean;
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

  async getDetailedAgents(): Promise<{ success: boolean; agents: Record<string, any>; isRunning: boolean; intervalMs: number }> {
    return fetchJson<{ success: boolean; agents: Record<string, any>; isRunning: boolean; intervalMs: number }>('/agents/detailed');
  },

  async toggleAgent(agentType: string, enabled: boolean): Promise<{ success: boolean; agentType: string; enabled: boolean; message: string }> {
    return fetchJson('/agents/toggle', {
      method: 'POST',
      body: JSON.stringify({ agentType, enabled }),
    });
  },

  async updateAgentConfig(agentType: string, config: Record<string, unknown>): Promise<{ success: boolean; agentType: string; message: string }> {
    return fetchJson('/agents/config', {
      method: 'POST',
      body: JSON.stringify({ agentType, config }),
    });
  },

  async getAgentLogs(agentType?: string, limit: number = 50): Promise<{ success: boolean; logs: AgentThoughtLog[] }> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (agentType) params.append('agentType', agentType);
    return fetchJson<{ success: boolean; logs: AgentThoughtLog[] }>(`/agents/logs?${params.toString()}`);
  },

  // Orders
  async getOrders(params?: {
    userAddress?: string;
    agentType?: string;
    status?: string;
    limit?: number;
  }): Promise<{ success: boolean; count: number; data: any[] }> {
    const searchParams = new URLSearchParams();
    if (params?.userAddress) searchParams.append('userAddress', params.userAddress);
    if (params?.agentType && params.agentType !== 'ALL') searchParams.append('agentType', params.agentType);
    if (params?.status && params.status !== 'ALL') searchParams.append('status', params.status);
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    const query = searchParams.toString();
    const endpoint = query ? `/orders?${query}` : '/orders';
    return fetchJson(endpoint);
  },

  // Sweeper & Backtest
  async getSweepHistory(userAddress?: string): Promise<{ success: boolean; count: number; data: SettlementSweep[] }> {
    const endpoint = userAddress ? `/sweeper/history?userAddress=${encodeURIComponent(userAddress)}` : '/sweeper/history';
    return fetchJson(endpoint);
  },

  async getSweeperSummary(userAddress?: string): Promise<{ success: boolean; data: SweeperSummary }> {
    const endpoint = userAddress ? `/sweeper/summary?userAddress=${encodeURIComponent(userAddress)}` : '/sweeper/summary';
    return fetchJson(endpoint);
  },

  async triggerSweep(userAddress: string, autoCompound: boolean = true): Promise<{
    success: boolean;
    claimedMarketsCount: number;
    totalClaimedAmount: string;
    txHash: string;
    sweeps?: SettlementSweep[];
  }> {
    return fetchJson('/sweeper/trigger', {
      method: 'POST',
      body: JSON.stringify({ userAddress, autoCompound }),
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

