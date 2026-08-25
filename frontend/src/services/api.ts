import type {
  Market,
  OrderBookDepth,
  OrderExecution,
  SessionGrant,
  SwarmStatusSummary,
  AgentThoughtLog,
  BacktestResult,
  SettlementSweep,
  SweeperSummary,
  PortfolioSummary,
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

  async getHistoricalMarkets(limit: number = 60): Promise<{ success: boolean; count: number; data: Market[] }> {
    return fetchJson<{ success: boolean; count: number; data: Market[] }>(`/markets/historical?limit=${limit}`);
  },

  async getMarketDepth(marketId: string): Promise<{ success: boolean; marketId: string; depth: OrderBookDepth }> {
    return fetchJson<{ success: boolean; marketId: string; depth: OrderBookDepth }>(`/markets/${encodeURIComponent(marketId)}/depth`);
  },

  async getSpotPrices(): Promise<{ success: boolean; data: Record<string, { symbol: string; price: number; change1m: number; change5m: number; high24h: number; low24h: number; volume24h: number; timestamp: number }> }> {
    return fetchJson<{ success: boolean; data: Record<string, { symbol: string; price: number; change1m: number; change5m: number; high24h: number; low24h: number; volume24h: number; timestamp: number }> }>('/markets/spot');
  },

  async getFuturePools(params?: { horizonHours?: number; window?: string }): Promise<{ success: boolean; count: number; pools: string[]; horizonHours: number }> {
    const qp = new URLSearchParams();
    if (params?.horizonHours) qp.append('horizonHours', params.horizonHours.toString());
    if (params?.window) qp.append('window', params.window);
    const q = qp.toString();
    return fetchJson<{ success: boolean; count: number; pools: string[]; horizonHours: number }>(`/markets/pools/future${q ? `?${q}` : ''}`);
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

  async getAllowanceStatus(userAddress: string): Promise<{
    success: boolean;
    hasActiveSession: boolean;
    hasDelegated: boolean;
    poolsChecked: number;
    allReady: boolean;
    checks: Array<{ pool: string; allowanceHuman: number; balanceHuman: number; vaultHuman: number; ready: boolean }>;
    guidance: string;
  }> {
    return fetchJson(`/sessions/${encodeURIComponent(userAddress)}/allowance-status`);
  },

  // Swarm Agents
  async getSwarmStatus(): Promise<{ success: boolean; agents: SwarmStatusSummary }> {
    return fetchJson<{ success: boolean; agents: SwarmStatusSummary }>('/agents/status');
  },

  async getDetailedAgents(): Promise<{ success: boolean; agents: Record<string, any>; isRunning: boolean; intervalMs: number }> {
    return fetchJson<{ success: boolean; agents: Record<string, any>; isRunning: boolean; intervalMs: number }>('/agents/detailed');
  },

  async toggleAgent(agentType: string, enabled: boolean, operatorAddress?: string): Promise<{ success: boolean; agentType: string; enabled: boolean; message: string }> {
    const headers: Record<string, string> = {};
    if (operatorAddress) headers['x-operator-address'] = operatorAddress;
    return fetchJson('/agents/toggle', {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentType, enabled, operatorAddress }),
    });
  },

  async updateAgentConfig(agentType: string, config: Record<string, unknown>, operatorAddress?: string): Promise<{ success: boolean; agentType: string; message: string }> {
    const headers: Record<string, string> = {};
    if (operatorAddress) headers['x-operator-address'] = operatorAddress;
    return fetchJson('/agents/config', {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentType, config, operatorAddress }),
    });
  },

  async getAgentLogs(agentType?: string, limit: number = 50): Promise<{ success: boolean; logs: AgentThoughtLog[] }> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (agentType) params.append('agentType', agentType);
    return fetchJson<{ success: boolean; logs: AgentThoughtLog[] }>(`/agents/logs?${params.toString()}`);
  },

  async getOrders(params?: {
    userAddress?: string;
    agentType?: string;
    status?: string;
    outcome?: string;
    marketId?: string;
    limit?: number;
    page?: number;
    pageSize?: number;
    search?: string;
  }): Promise<{
    success: boolean;
    count: number;
    total?: number;
    totalFills?: number;
    totalVolume?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    data: OrderExecution[];
  }> {
    const searchParams = new URLSearchParams();
    if (params?.userAddress) searchParams.append('userAddress', params.userAddress);
    if (params?.agentType && params.agentType !== 'ALL') searchParams.append('agentType', params.agentType);
    if (params?.status && params.status !== 'ALL') searchParams.append('status', params.status);
    if (params?.outcome && params.outcome !== 'ALL') searchParams.append('outcome', params.outcome);
    if (params?.marketId) searchParams.append('marketId', params.marketId);
    if (params?.limit !== undefined) searchParams.append('limit', params.limit.toString());
    if (params?.page !== undefined) searchParams.append('page', params.page.toString());
    if (params?.pageSize !== undefined) searchParams.append('pageSize', params.pageSize.toString());
    if (params?.search) searchParams.append('search', params.search);
    const query = searchParams.toString();
    const endpoint = query ? `/orders?${query}` : '/orders';
    return fetchJson(endpoint);
  },

  async getPortfolioSummary(userAddress?: string): Promise<{ success: boolean; data: PortfolioSummary }> {
    const endpoint = userAddress ? `/portfolio/summary?userAddress=${encodeURIComponent(userAddress)}` : '/portfolio/summary';
    return fetchJson<{ success: boolean; data: PortfolioSummary }>(endpoint);
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

  async getAnalytics(userAddress?: string, range: string = '30d'): Promise<{ success: boolean; data: any }> {
    const params = new URLSearchParams();
    if (userAddress) params.append('userAddress', userAddress);
    if (range) params.append('range', range);
    const q = params.toString();
    return fetchJson(`/analytics/equity${q ? `?${q}` : ''}`);
  },

  async getBalanceHistory(userAddress?: string, range: string = '30d'): Promise<{ success: boolean; data: any }> {
    const params = new URLSearchParams();
    if (userAddress) params.append('userAddress', userAddress);
    if (range) params.append('range', range);
    const q = params.toString();
    return fetchJson(`/analytics/balance-history${q ? `?${q}` : ''}`);
  },
};

