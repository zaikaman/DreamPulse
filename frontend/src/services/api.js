const API_BASE_URL = import.meta.env.VITE_BACKEND_HTTP_URL || '/api/v1';
async function fetchJson(endpoint, options) {
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
    return response.json();
}
export const apiClient = {
    // Markets & Depth
    async getMarkets(params) {
        const query = new URLSearchParams(params).toString();
        const endpoint = query ? `/markets?${query}` : '/markets';
        return fetchJson(endpoint);
    },
    async getMarketDepth(marketId) {
        return fetchJson(`/markets/${encodeURIComponent(marketId)}/depth`);
    },
    // Sessions
    async registerSession(payload) {
        return fetchJson('/sessions/register', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },
    async revokeSession(sessionId) {
        return fetchJson(`/sessions/${encodeURIComponent(sessionId)}/revoke`, {
            method: 'POST',
        });
    },
    // Swarm Agents
    async getSwarmStatus() {
        return fetchJson('/agents/status');
    },
    async getAgentLogs(agentType, limit = 50) {
        const params = new URLSearchParams({ limit: limit.toString() });
        if (agentType)
            params.append('agentType', agentType);
        return fetchJson(`/agents/logs?${params.toString()}`);
    },
    // Sweeper & Backtest
    async triggerSweep(userAddress) {
        return fetchJson('/sweeper/trigger', {
            method: 'POST',
            body: JSON.stringify({ userAddress }),
        });
    },
    async runBacktest(config) {
        return fetchJson('/backtest/run', {
            method: 'POST',
            body: JSON.stringify(config),
        });
    },
};
