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
  CustomAgentDefinition,
  CustomSwarmDefinition,
  CustomAgentRules,
  ArenaAgentEntry,
  ArenaTraderEntry,
  TraderProfileDetail,
  ArenaGlobalStats,
  ArenaTimeframe,
  ArenaSortBy,
  SocialCopyConfig,
} from '../types/index.js';

const rawApiUrl = ((import.meta as any).env?.VITE_BACKEND_HTTP_URL || '').trim();
const API_BASE_URL = rawApiUrl
  ? rawApiUrl.replace(/\/+$/, '').endsWith('/api/v1')
    ? rawApiUrl.replace(/\/+$/, '')
    : `${rawApiUrl.replace(/\/+$/, '')}/api/v1`
  : '/api/v1';

function getAuthHeadersForRequest(): Record<string, string> {
  try {
    // Lazy import to avoid circular deps — api-auth is standalone and has no deps on api.ts
    // Use dynamic check via localStorage directly to keep fetchJson sync (no await)
    const jwtKey = 'dreampulse_supabase_jwt';
    const jwtExpKey = 'dreampulse_supabase_jwt_exp';
    const apiAuthKey = 'dreampulse_api_auth';
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const t = localStorage.getItem(jwtKey);
      const e = localStorage.getItem(jwtExpKey);
      if (t && e) {
        const exp = Number(e);
        if (Number.isFinite(exp) && exp > Math.floor(Date.now() / 1000) + 60 && t.length > 20) {
          return { Authorization: `Bearer ${t}` };
        }
      }
      const raw = localStorage.getItem(apiAuthKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { address: string; signature: string; nonce: string; issuedAt: number; expiresAt: number };
          if (parsed.address && parsed.signature && parsed.nonce && parsed.issuedAt && parsed.expiresAt) {
            const nowSec = Math.floor(Date.now() / 1000);
            if (parsed.expiresAt > nowSec + 60 && Math.abs(nowSec - parsed.issuedAt) <= 240 && parsed.signature.length >= 132) {
              return {
                'x-user-address': parsed.address,
                'x-auth-signature': parsed.signature,
                'x-auth-nonce': parsed.nonce,
                'x-auth-issued-at': String(parsed.issuedAt),
                'x-auth-expires-at': String(parsed.expiresAt),
              };
            }
          }
        } catch {}
      }
    }
  } catch {}
  return {};
}

const inFlightGetRequests = new Map<string, Promise<any>>();
const customAgentsCache = new Map<string, { at: number; data: any }>();
const CUSTOM_AGENTS_CACHE_TTL_MS = 30000;

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const isGet = !options?.method || options.method.toUpperCase() === 'GET';
  const url = `${API_BASE_URL}${endpoint}`;

  const authHeaders = getAuthHeadersForRequest();
  const callerHeaders = (options?.headers as Record<string, string> | undefined) || {};
  const walletFromHeader = callerHeaders['x-user-address'] || callerHeaders['X-User-Address'] || authHeaders['x-user-address'] || '';
  const walletLower = walletFromHeader.toLowerCase();
  const dedupKey = `${url}|${walletLower}`;

  if (isGet && inFlightGetRequests.has(dedupKey)) {
    return inFlightGetRequests.get(dedupKey)! as Promise<T>;
  }

  // Merge: explicit caller headers win over cached auth (allows override for wallet-verify which must NOT send stale auth)
  const mergedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders,
    ...callerHeaders,
  };
  // For /auth/wallet-verify we must not send stale Bearer that would be verified before mint — strip if present
  const isAuthVerify = endpoint.includes('/auth/wallet-verify');
  if (isAuthVerify) {
    delete (mergedHeaders as any)['Authorization'];
    delete (mergedHeaders as any)['authorization'];
  }
  const { headers: _ignoredHeaders, credentials: _ignoredCreds, ...restOptions } = (options as Record<string, any>) || {};

  const executeFetch = async (): Promise<T> => {
    const response = await fetch(url, {
      ...restOptions,
      // SECURITY: httpOnly cookie hardening — backend sets dreampulse_jwt as HttpOnly (see wallet-auth.ts).
      credentials: 'include',
      headers: mergedHeaders,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMsg = errorBody;
      try {
        const parsed = JSON.parse(errorBody);
        if (parsed && typeof parsed.error === 'string') {
          errorMsg = parsed.error;
        }
      } catch {}
      throw new Error(errorMsg);
    }

    return response.json() as Promise<T>;
  };

  if (isGet) {
    const p = executeFetch().finally(() => {
      inFlightGetRequests.delete(dedupKey);
    });
    inFlightGetRequests.set(dedupKey, p);
    return p;
  }

  return executeFetch();
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
  async getSessionNonce(userAddress: string): Promise<{ success: boolean; userAddress: string; nextNonce: number }> {
    return fetchJson<{ success: boolean; userAddress: string; nextNonce: number }>(`/sessions/${encodeURIComponent(userAddress)}/nonce`);
  },

  async getActiveSession(userAddress: string): Promise<{ success: boolean; session: SessionGrant | null }> {
    return fetchJson<{ success: boolean; session: SessionGrant | null }>(`/sessions/${encodeURIComponent(userAddress)}?active=true`);
  },

  async getUserSessions(userAddress: string): Promise<{ success: boolean; count: number; activeSession: SessionGrant | null; sessions: SessionGrant[]; nextNonce?: number }> {
    return fetchJson(`/sessions/${encodeURIComponent(userAddress)}`);
  },

  async registerSession(payload: {
    userAddress: string;
    operatorAddress: string;
    maxTradeSize: number;
    dailyVolumeCap: number;
    expiresAt?: string;
    signature?: string;
    nonce?: number;
    onChainTxHash?: string;
    vaultDepositAmount?: number;
    targetPoolAddress?: string;
    onChainAuthorized?: boolean;
    copyTradeEnabled?: boolean;
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
    userAddress?: string;
    hasActiveSession?: boolean;
    hasDelegated?: boolean;
    isGloballyApproved?: boolean;
    hasOperatorAllowance?: boolean;
    allowanceOperatorHuman?: number;
    balanceHuman?: number;
    poolsChecked?: number;
    allReady: boolean;
    checks?: Array<{ pool: string; allowanceHuman: number; balanceHuman: number; vaultHuman: number; ready: boolean }>;
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
    scope?: 'ALL_SWARM' | 'MY_ORDERS' | 'ALL';
    swarmOnly?: boolean;
    source?: 'SWARM' | 'TERMINAL' | 'ALL';
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
    if (params?.swarmOnly || params?.scope === 'ALL_SWARM') searchParams.append('swarmOnly', 'true');
    if (params?.source) searchParams.append('source', params.source);
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

  async placeOrder(payload: {
    userAddress: string;
    marketId: string;
    outcome: 'YES' | 'NO';
    direction?: 'BUY' | 'SELL';
    orderType: 'LIMIT' | 'IOC';
    price: number;
    lotSize: number;
    txHash?: string;
  }): Promise<{ success: boolean; message: string; data: OrderExecution }> {
    return fetchJson<{ success: boolean; message: string; data: OrderExecution }>('/orders/place', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async cancelOrder(
    orderId: string,
    userAddress?: string,
  ): Promise<{ success: boolean; message: string; txHash?: string; data?: OrderExecution }> {
    return fetchJson<{ success: boolean; message: string; txHash?: string; data?: OrderExecution }>(
      `/orders/${encodeURIComponent(orderId)}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ userAddress }),
      },
    );
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

  async getBacktestHistory(userAddress?: string): Promise<{ success: boolean; data: any[] }> {
    const q = userAddress ? `?userAddress=${encodeURIComponent(userAddress)}` : '';
    return fetchJson(`/backtest/history${q}`);
  },

  async runBacktest(config: {
    userAddress?: string;
    agentType: string;
    symbol: string;
    period?: string;
    timeframe?: string;
    startDate?: string;
    endDate?: string;
    initialCapital?: number;
    strategyConfig?: Record<string, any>;
    frictionConfig?: Record<string, any>;
    customRules?: CustomAgentRules;
    customAgentId?: string;
  }): Promise<{ success: boolean; result: BacktestResult }> {
    return fetchJson('/backtest/run', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },

  async getAnalytics(userAddress?: string, range: string = '30d', source: string = 'ALL'): Promise<{ success: boolean; data: any }> {
    const params = new URLSearchParams();
    if (userAddress) params.append('userAddress', userAddress);
    if (range) params.append('range', range);
    if (source && source !== 'ALL') params.append('source', source);
    const q = params.toString();
    return fetchJson(`/analytics/equity${q ? `?${q}` : ''}`);
  },

  async getBalanceHistory(userAddress?: string, range: string = '30d', source: string = 'ALL'): Promise<{ success: boolean; data: any }> {
    const params = new URLSearchParams();
    if (userAddress) params.append('userAddress', userAddress);
    if (range) params.append('range', range);
    if (source && source !== 'ALL') params.append('source', source);
    const q = params.toString();
    return fetchJson(`/analytics/balance-history${q ? `?${q}` : ''}`);
  },

  // Supabase Realtime JWT — wallet EIP-712 → backend mints HS256 JWT with user_address for RLS
  async verifyWalletAuth(payload: {
    userAddress: string;
    signature: string;
    nonce: string;
    issuedAt: number;
    expiresAt: number;
  }): Promise<{ success: boolean; token: string; expiresAt: number; userAddress: string }> {
    return fetchJson('/auth/wallet-verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getAuthStatus(): Promise<{ success: boolean; supabaseJwtConfigured: boolean }> {
    return fetchJson('/auth/status');
  },

  async logout(): Promise<{ success: boolean; message: string }> {
    try {
      return await fetchJson('/auth/logout', { method: 'POST' });
    } catch (e: any) {
      // Best-effort — clearing local state matters even if backend unreachable
      return { success: true, message: 'Local logout (backend unreachable)' };
    }
  },

  // Personal Swarm — per-wallet isolated strategy
  async getPersonalSwarmConfig(userAddress: string): Promise<{ success: boolean; config: import('../types/index.js').PersonalSwarmConfig }> {
    return fetchJson(`/swarm/my-config?userAddress=${encodeURIComponent(userAddress)}`);
  },
  async updatePersonalSwarmConfig(
    userAddress: string,
    payload: Partial<import('../types/index.js').PersonalSwarmConfig>,
  ): Promise<{ success: boolean; config: import('../types/index.js').PersonalSwarmConfig }> {
    return fetchJson('/swarm/my-config', { method: 'PUT', body: JSON.stringify({ userAddress, ...payload }) });
  },
  async setPersonalSwarmMode(userAddress: string, mode: 'COPY' | 'PERSONAL'): Promise<{ success: boolean; config: import('../types/index.js').PersonalSwarmConfig }> {
    return fetchJson('/swarm/mode', { method: 'POST', body: JSON.stringify({ userAddress, mode }) });
  },
  async togglePersonalAgent(userAddress: string, agentType: string, enabled: boolean): Promise<{ success: boolean; config: import('../types/index.js').PersonalSwarmConfig }> {
    return fetchJson('/swarm/toggle', { method: 'POST', body: JSON.stringify({ userAddress, agentType, enabled }) });
  },
  async updatePersonalAgentConfig(userAddress: string, agentType: string, config: Record<string, unknown>): Promise<{ success: boolean; config: import('../types/index.js').PersonalSwarmConfig }> {
    return fetchJson('/swarm/config', { method: 'POST', body: JSON.stringify({ userAddress, agentType, config }) });
  },
  async toggleCopyTrade(userAddress: string, enabled: boolean): Promise<{ success: boolean; config: import('../types/index.js').PersonalSwarmConfig; message: string }> {
    return fetchJson('/swarm/toggle-copytrade', { method: 'POST', body: JSON.stringify({ userAddress, enabled }) });
  },
  async getPersonalSwarmStatus(userAddress: string): Promise<{ success: boolean; status: import('../types/index.js').PersonalSwarmStatus }> {
    return fetchJson(`/swarm/my-status?userAddress=${encodeURIComponent(userAddress)}`);
  },
  async resetPersonalSwarm(userAddress: string): Promise<{ success: boolean; config: import('../types/index.js').PersonalSwarmConfig }> {
    return fetchJson('/swarm/reset', { method: 'POST', body: JSON.stringify({ userAddress }) });
  },

  // Custom Agent & Swarm Studio
  async getCustomAgents(userAddress?: string): Promise<{ success: boolean; count: number; data: CustomAgentDefinition[] }> {
    const key = (userAddress || 'GLOBAL').toLowerCase();
    const cached = customAgentsCache.get(key);
    if (cached && Date.now() - cached.at < CUSTOM_AGENTS_CACHE_TTL_MS) {
      return cached.data;
    }
    const q = userAddress ? `?userAddress=${encodeURIComponent(userAddress)}` : '';
    const res = await fetchJson<{ success: boolean; count: number; data: CustomAgentDefinition[] }>(`/agents/custom${q}`);
    if (res?.success) {
      customAgentsCache.set(key, { at: Date.now(), data: res });
    }
    return res;
  },

  async getCustomAgentById(id: string): Promise<{ success: boolean; data: CustomAgentDefinition }> {
    return fetchJson(`/agents/custom/${encodeURIComponent(id)}`);
  },

  async createCustomAgent(payload: {
    userAddress: string;
    name: string;
    description?: string;
    symbol: string;
    timeframe: string;
    strategyType: string;
    rules: CustomAgentRules;
    color?: string;
    icon?: string;
    isActive?: boolean;
    isDeployed?: boolean;
    allocatedAllowance?: number;
  }): Promise<{ success: boolean; data: CustomAgentDefinition }> {
    customAgentsCache.clear();
    return fetchJson('/agents/custom', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateCustomAgent(id: string, payload: Partial<CustomAgentDefinition>): Promise<{ success: boolean; data: CustomAgentDefinition }> {
    customAgentsCache.clear();
    return fetchJson(`/agents/custom/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteCustomAgent(id: string, userAddress: string): Promise<{ success: boolean }> {
    customAgentsCache.clear();
    return fetchJson(`/agents/custom/${encodeURIComponent(id)}?userAddress=${encodeURIComponent(userAddress)}`, {
      method: 'DELETE',
    });
  },

  async deployCustomAgent(id: string, userAddress: string, allowance?: number): Promise<{ success: boolean; data: CustomAgentDefinition }> {
    customAgentsCache.clear();
    return fetchJson(`/agents/custom/${encodeURIComponent(id)}/deploy`, {
      method: 'POST',
      body: JSON.stringify({ userAddress, allowance }),
    });
  },

  async pauseCustomAgent(id: string, userAddress: string): Promise<{ success: boolean; data: CustomAgentDefinition }> {
    customAgentsCache.clear();
    return fetchJson(`/agents/custom/${encodeURIComponent(id)}/pause`, {
      method: 'POST',
      body: JSON.stringify({ userAddress }),
    });
  },

  async setCustomAgentAllowance(id: string, userAddress: string, allowance: number): Promise<{ success: boolean; data: CustomAgentDefinition }> {
    customAgentsCache.clear();
    return fetchJson(`/agents/custom/${encodeURIComponent(id)}/allowance`, {
      method: 'POST',
      body: JSON.stringify({ userAddress, allowance }),
    });
  },

  async generateAgentFromPrompt(prompt: string): Promise<{ success: boolean; data: Partial<CustomAgentDefinition> }> {
    return fetchJson('/agents/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    });
  },

  async getCustomSwarms(userAddress?: string): Promise<{ success: boolean; count: number; data: CustomSwarmDefinition[] }> {
    const q = userAddress ? `?userAddress=${encodeURIComponent(userAddress)}` : '';
    return fetchJson(`/swarms/custom${q}`);
  },

  async createCustomSwarm(payload: {
    userAddress: string;
    name: string;
    description?: string;
    agents: Array<{ agentId: string; agentName: string; role: string; weight: number }>;
    consensusRule: string;
    confidenceThreshold?: number;
    isActive?: boolean;
  }): Promise<{ success: boolean; data: CustomSwarmDefinition }> {
    return fetchJson('/swarms/custom', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteCustomSwarm(id: string, userAddress: string): Promise<{ success: boolean }> {
    return fetchJson(`/swarms/custom/${encodeURIComponent(id)}?userAddress=${encodeURIComponent(userAddress)}`, {
      method: 'DELETE',
    });
  },

  // Swarm Arena & Strategy Leaderboard
  async getArenaAgents(params?: {
    timeframe?: ArenaTimeframe;
    symbol?: string;
    strategyType?: string;
    sortBy?: ArenaSortBy;
    search?: string;
  }): Promise<{ success: boolean; count: number; data: ArenaAgentEntry[] }> {
    const q = new URLSearchParams();
    if (params?.timeframe) q.append('timeframe', params.timeframe);
    if (params?.symbol && params.symbol !== 'ALL') q.append('symbol', params.symbol);
    if (params?.strategyType && params.strategyType !== 'ALL') q.append('strategyType', params.strategyType);
    if (params?.sortBy) q.append('sortBy', params.sortBy);
    if (params?.search) q.append('search', params.search);
    const queryString = q.toString();
    return fetchJson(`/arena/leaderboard/agents${queryString ? `?${queryString}` : ''}`);
  },

  async getArenaTraders(params?: {
    range?: ArenaTimeframe;
    sortBy?: ArenaSortBy;
    search?: string;
  }): Promise<{ success: boolean; count: number; data: ArenaTraderEntry[] }> {
    const q = new URLSearchParams();
    if (params?.range) q.append('range', params.range);
    if (params?.sortBy) q.append('sortBy', params.sortBy);
    if (params?.search) q.append('search', params.search);
    const queryString = q.toString();
    return fetchJson(`/arena/leaderboard/traders${queryString ? `?${queryString}` : ''}`);
  },

  async getTraderProfile(address: string): Promise<{ success: boolean; data: TraderProfileDetail }> {
    return fetchJson(`/arena/trader/${encodeURIComponent(address)}/profile`);
  },

  async cloneArenaAgent(agentId: string, userAddress: string): Promise<{ success: boolean; message: string; data: CustomAgentDefinition }> {
    return fetchJson(`/arena/agent/${encodeURIComponent(agentId)}/clone`, {
      method: 'POST',
      body: JSON.stringify({ userAddress }),
    });
  },

  async toggleSocialCopyTrade(payload: {
    userAddress: string;
    targetAddress?: string;
    enabled: boolean;
    maxTradeSize?: number;
    dailyVolumeCap?: number;
  }): Promise<{ success: boolean; isCopying?: boolean; config: SocialCopyConfig; message: string }> {
    return fetchJson('/arena/copytrade/toggle', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getSocialCopyTradeStatus(
    userAddress: string,
    targetAddress: string,
  ): Promise<{ success: boolean; isCopying: boolean; config: SocialCopyConfig | null }> {
    const params = new URLSearchParams({ userAddress, targetAddress });
    return fetchJson(`/arena/copytrade/status?${params.toString()}`);
  },

  async getSocialCopyFollowing(
    userAddress: string,
  ): Promise<{ success: boolean; count: number; data: SocialCopyConfig[] }> {
    const params = new URLSearchParams({ userAddress });
    return fetchJson(`/arena/copytrade/following?${params.toString()}`);
  },

  async getArenaStats(): Promise<{ success: boolean; data: ArenaGlobalStats }> {
    return fetchJson('/arena/stats');
  },
};

