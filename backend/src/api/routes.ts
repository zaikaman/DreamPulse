import { Router, Request, Response } from 'express';
import { marketService } from '../services/market-service.js';
import { anomalyService } from '../services/anomaly-service.js';
import { sessionService } from '../services/session-service.js';
import { swarmRunner } from '../agents/swarm-runner.js';
import { orderService } from '../services/order-service.js';
import { settlementService } from '../services/settlement-service.js';
import { compounderService } from '../services/compounder-service.js';
import { backtestService } from '../services/backtest-service.js';
import { operatorAccount, SOMNIA_ADDRESSES, publicClient, somniaExchange } from '../config/somnia.js';
import type { MarketStatus, AgentType, OrderStatus } from '../types/index.js';
import { type Address, type Hex, isAddress, getAddress, parseAbi } from 'viem';
import { analyticsService, type AnalyticsRange } from '../services/analytics-service.js';
import { userSwarmService } from '../services/user-swarm-service.js';

export const apiRouter = Router();

// ------------------------------------------------------------------------------
// 1. Markets & Edge Radar Endpoints
// ------------------------------------------------------------------------------
apiRouter.get('/markets', (req: Request, res: Response) => {
  const { symbol, window, status } = req.query;

  const markets = marketService.getActiveMarkets({
    symbol: typeof symbol === 'string' ? symbol : undefined,
    window: typeof window === 'string' ? window : undefined,
    status: typeof status === 'string' ? (status as MarketStatus) : undefined,
  });

  res.json({
    success: true,
    count: markets.length,
    data: markets,
  });
});

apiRouter.get('/markets/historical', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 60;
  const history = marketService.getHistoricalMarkets(limit);
  res.json({
    success: true,
    count: history.length,
    data: history,
  });
});

apiRouter.get('/markets/spot', (_req: Request, res: Response) => {
  const spots = marketService.getAllSpotTickers();
  res.json({
    success: true,
    data: spots,
  });
});

apiRouter.get('/markets/anomalies', (req: Request, res: Response) => {
  const threshold = req.query.threshold ? parseFloat(req.query.threshold as string) : undefined;
  const spotPrices = marketService.getAllSpotTickers();
  const spotMap: Record<string, number> = {};
  for (const [k, v] of Object.entries(spotPrices)) {
    spotMap[k] = v.price;
  }

  const markets = marketService.getActiveMarkets();
  const anomalies = anomalyService.scanMarkets(markets, spotMap, threshold);

  res.json({
    success: true,
    count: anomalies.length,
    data: anomalies,
  });
});

apiRouter.get('/markets/:id/depth', (req: Request, res: Response) => {
  const { id } = req.params;
  const depth = marketService.getMarketDepth(id);

  if (!depth) {
    // If exact ID not found, check if a market exists or return default levels
    const market = marketService.getMarketById(id);
    if (!market) {
      // Fallback depth structure
      return res.json({
        success: true,
        marketId: id,
        depth: {
          marketId: id,
          symbol: 'BTC/USD',
          bestBidYes: 0.49,
          bestAskYes: 0.51,
          bestBidNo: 0.49,
          bestAskNo: 0.51,
          yesBids: [
            { price: 0.49, quantity: 200, total: 98.0 },
            { price: 0.48, quantity: 450, total: 216.0 },
            { price: 0.47, quantity: 800, total: 376.0 },
          ],
          yesAsks: [
            { price: 0.51, quantity: 180, total: 91.8 },
            { price: 0.52, quantity: 500, total: 260.0 },
            { price: 0.53, quantity: 900, total: 477.0 },
          ],
          noBids: [],
          noAsks: [],
          updatedAt: Date.now(),
        },
      });
    }
  }

  res.json({
    success: true,
    marketId: id,
    depth,
  });
});

// Cache for /markets/pools/future (30s TTL)
const futurePoolsCache = new Map<string, { data: { success: boolean; count: number; pools: Address[]; horizonHours: number; window: string }; expiresAt: number }>();

apiRouter.get('/markets/pools/future', async (req: Request, res: Response) => {
  try {
    const horizonHours = req.query.horizonHours ? parseInt(req.query.horizonHours as string, 10) : 24;
    const windowFilter = typeof req.query.window === 'string' ? (req.query.window as string).toLowerCase() : undefined;
    const cacheKey = `${horizonHours}:${windowFilter || 'all'}`;
    const nowMs = Date.now();

    const cached = futurePoolsCache.get(cacheKey);
    if (cached && nowMs < cached.expiresAt) {
      return res.json(cached.data);
    }

    const horizonSec = Math.floor(Date.now() / 1000) + Math.max(1, Math.min(168, horizonHours)) * 3600;
    const poolSet = new Set<string>();

    // 1) Current Open + Listed via indexer (covers deployed pools for next windows)
    try {
      const all = await somniaExchange.client.listBinaryMarkets({ limit: 200 } as any).catch(() => [] as any[]);
      for (const m of all as any[]) {
        const expiry = Number(m.expiry || 0);
        const pool = m.poolAddress as string | undefined;
        if (!pool || pool === SOMNIA_ADDRESSES.binaryModule) continue;
        const intervalSec = Number((m as any).intervalSec || 0);
        let win: string = '5m';
        if (intervalSec >= 604800) win = '7d';
        else if (intervalSec >= 86400) win = '24h';
        else if (intervalSec >= 14400) win = '4h';
        else if (intervalSec >= 3600) win = '1h';
        else if (intervalSec >= 900) win = '15m';
        else win = '5m';
        if (windowFilter && win !== windowFilter && windowFilter !== 'all') continue;
        const status = String(m.status || '');
        const isRelevant = (expiry > 0 && expiry >= Math.floor(Date.now()/1000) - 3600 && expiry <= horizonSec + 3600) || status === 'Trading' || status === 'Listed' || status === '1' || status === '0';
        if (isRelevant) poolSet.add(pool.toLowerCase());
      }
    } catch {}

    // 2) Also include pools from active in-memory markets (fallback for synthetic/rolling)
    for (const m of marketService.getActiveMarkets({ status: 'Open' })) {
      if (m.poolAddress) poolSet.add(m.poolAddress.toLowerCase());
    }

    // 3) Free pools via binaryModule (deployed but not yet bound to a market) — covers next windows pre-deployed
    try {
      const freePoolsAbi = parseAbi(['function getFreePools(address creator, address collateral) view returns (address[])']);
      const creators: Address[] = [SOMNIA_ADDRESSES.marketCreator as Address, SOMNIA_ADDRESSES.marketCreatorFactory as Address];
      for (const creator of creators) {
        try {
          const free = (await publicClient.readContract({
            address: SOMNIA_ADDRESSES.binaryModule as Address,
            abi: freePoolsAbi,
            functionName: 'getFreePools',
            args: [creator, SOMNIA_ADDRESSES.testUsdc as Address],
          })) as Address[];
          for (const p of free) {
            if (p && p !== '0x0000000000000000000000000000000000000000') poolSet.add(p.toLowerCase());
          }
        } catch {}
      }
    } catch {}

    // 4) Ensure 7d pools are included even when horizon is large — group by window+symbol and take next pool per group
    if (windowFilter === '7d' || horizonHours >= 24) {
      const byWindow = new Map<string, string>();
      try {
        const all = await somniaExchange.client.listBinaryMarkets({ limit: 200 } as any).catch(() => [] as any[]);
        for (const m of all as any[]) {
          const pool = m.poolAddress as string | undefined;
          if (!pool) continue;
          const intervalSec = Number((m as any).intervalSec || 0);
          let win: string = '5m';
          if (intervalSec >= 604800) win = '7d';
          else if (intervalSec >= 86400) win = '24h';
          else if (intervalSec >= 14400) win = '4h';
          else if (intervalSec >= 3600) win = '1h';
          else if (intervalSec >= 900) win = '15m';
          else win = '5m';
          if (windowFilter && windowFilter !== 'all' && win !== windowFilter) continue;
          const key = `${win}-${(m as any).asset || 'BTC'}`;
          if (!byWindow.has(key)) byWindow.set(key, pool.toLowerCase());
        }
      } catch {}
      for (const [, pool] of byWindow) poolSet.add(pool);
    }
    const maxPools = windowFilter === '7d' ? 20 : horizonHours >= 168 ? 120 : 80;
    const pools = [...poolSet].slice(0, maxPools) as Address[];
    const responsePayload = { success: true, count: pools.length, pools, horizonHours: Math.max(1, Math.min(168, horizonHours)), window: windowFilter || 'all' };
    futurePoolsCache.set(cacheKey, { data: responsePayload, expiresAt: Date.now() + 30000 });
    res.json(responsePayload);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch future pools' });
  }
});

// ------------------------------------------------------------------------------
// 2. Session Key Delegation Endpoints
// ------------------------------------------------------------------------------
apiRouter.post('/sessions/register', async (req: Request, res: Response) => {
  try {
    const {
      userAddress,
      operatorAddress,
      maxTradeSize,
      dailyVolumeCap,
      expiresAt,
      signature,
      nonce,
      permissions,
      onChainTxHash,
      vaultDepositAmount,
      targetPoolAddress,
      onChainAuthorized,
    } = req.body;

    if (!userAddress) {
      return res.status(400).json({ success: false, error: 'Missing required userAddress parameter' });
    }

    const session = await sessionService.registerSession({
      userAddress,
      operatorAddress,
      maxTradeSize,
      dailyVolumeCap,
      expiresAt,
      signature,
      nonce,
      permissions,
      onChainTxHash,
      vaultDepositAmount,
      targetPoolAddress,
      onChainAuthorized,
    });

    return res.status(201).json({
      success: true,
      session,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to register session',
    });
  }
});

apiRouter.get('/sessions/:userAddress', async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.params;
    const activeOnly = req.query.active === 'true';

    const activeSession = await sessionService.getUserActiveSession(userAddress);
    if (activeSession) {
      const userOrders = orderService.getOrders({ userAddress });
      const realSpend = userOrders
        .filter((o) => o.status === 'FILLED' || o.status === 'PENDING')
        .reduce((sum, o) => sum + (o.totalCost || 0), 0);

      if (activeSession.spentToday > realSpend) {
        activeSession.spentToday = Number(realSpend.toFixed(4));
        sessionService.updateSessionSpend(activeSession.id, activeSession.spentToday);
      }
    }

    if (activeOnly) {
      return res.json({
        success: true,
        session: activeSession,
      });
    }

    const sessions = sessionService.listUserSessions(userAddress);

    return res.json({
      success: true,
      count: sessions.length,
      activeSession,
      sessions,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to query user sessions',
    });
  }
});

apiRouter.post('/sessions/:userAddress/reset-spend', async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.params;
    const session = await sessionService.getUserActiveSession(userAddress);
    if (!session) {
      return res.status(404).json({ success: false, error: 'No active session found for user' });
    }
    sessionService.updateSessionSpend(session.id, 0);
    return res.json({
      success: true,
      message: 'Session spend reset to 0 tUSDC',
      session: { ...session, spentToday: 0 },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to reset session spend' });
  }
});

apiRouter.post('/sessions/:id/revoke', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const revoked = await sessionService.revokeSession(id);

    return res.json({
      success: true,
      revoked,
      message: revoked ? 'Session successfully revoked' : 'Session not found or already revoked',
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to revoke session',
    });
  }
});

apiRouter.get('/sessions/:userAddress/allowance-status', async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.params;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Invalid userAddress' });
    }
    const normalized = getAddress(userAddress) as Address;
    const session = await sessionService.getUserActiveSession(normalized).catch(() => null);
    // Build pool set covering current Open + Listed + FreePools for 7D horizon (168h) — covers 5m…7d
    const poolSet = new Set<string>();
    for (const m of marketService.getActiveMarkets({ status: 'Open' }).slice(0, 20)) {
      if (m.poolAddress) poolSet.add(m.poolAddress.toLowerCase());
    }
    try {
      const all = await somniaExchange.client.listBinaryMarkets({ limit: 200 } as any).catch(() => [] as any[]);
      const nowSec = Math.floor(Date.now() / 1000);
      const horizonSec = nowSec + 7 * 24 * 3600;
      for (const m of all as any[]) {
        const expiry = Number(m.expiry || 0);
        const pool = m.poolAddress as string | undefined;
        if (!pool || pool === SOMNIA_ADDRESSES.binaryModule) continue;
        const status = String(m.status || '');
        const isRelevant = (expiry > 0 && expiry >= nowSec - 3600 && expiry <= horizonSec + 3600) || status === 'Trading' || status === 'Listed' || status === '1' || status === '0';
        if (isRelevant) poolSet.add(pool.toLowerCase());
      }
    } catch {}
    try {
      const freePoolsAbi = parseAbi(['function getFreePools(address creator, address collateral) view returns (address[])']);
      for (const creator of [SOMNIA_ADDRESSES.marketCreator as Address, SOMNIA_ADDRESSES.marketCreatorFactory as Address]) {
        try {
          const free = (await publicClient.readContract({
            address: SOMNIA_ADDRESSES.binaryModule as Address,
            abi: freePoolsAbi,
            functionName: 'getFreePools',
            args: [creator, SOMNIA_ADDRESSES.testUsdc as Address],
          })) as Address[];
          for (const p of free) if (p && p !== '0x0000000000000000000000000000000000000000') poolSet.add(p.toLowerCase());
        } catch {}
      }
    } catch {}
    const pools = [...poolSet].slice(0, 60) as Address[];

    const erc20Abi = parseAbi(['function allowance(address owner, address spender) view returns (uint256)', 'function balanceOf(address account) view returns (uint256)']);
    const registryAbi = parseAbi(['function isApprovedForPool(address pool, address owner, address operator, bytes4 selector) view returns (bool)', 'function isGloballyApproved(address owner, address operator, bytes4 selector) view returns (bool)']);
    const operatorAddr = (SOMNIA_ADDRESSES.operatorAccount || '0x93e300607c363E7D7a47e50f5c9fDf1723e859Cf') as Address;
    const selector = '0x80054449' as `0x${string}`;

    const [allowanceOperator, balance, isGlobal] = await Promise.all([
      publicClient.readContract({ address: SOMNIA_ADDRESSES.testUsdc, abi: erc20Abi, functionName: 'allowance', args: [normalized, operatorAddr] }).catch(() => 0n),
      publicClient.readContract({ address: SOMNIA_ADDRESSES.testUsdc, abi: erc20Abi, functionName: 'balanceOf', args: [normalized] }).catch(() => 0n),
      publicClient.readContract({ address: SOMNIA_ADDRESSES.operatorPermissionsRegistry, abi: registryAbi, functionName: 'isGloballyApproved', args: [normalized, operatorAddr, selector] }).catch(() => false),
    ]);

    const allowanceOperatorHuman = Number(allowanceOperator) / 1_000_000;
    const balanceHuman = Number(balance) / 1_000_000;
    const hasOperatorAllowance = allowanceOperatorHuman >= 100;
    const allReady = hasOperatorAllowance && balanceHuman > 0;

    return res.json({
      success: true,
      userAddress: normalized,
      hasActiveSession: !!session?.isActive,
      hasDelegated: !!session?.onChainAuthorized || Boolean(isGlobal),
      isGloballyApproved: Boolean(isGlobal),
      hasOperatorAllowance,
      allowanceOperatorHuman,
      balanceHuman,
      allReady,
      guidance: !hasOperatorAllowance
        ? 'TestUSDC allowance to operator required. Click Approve to grant 1-time session trading allowance.'
        : balanceHuman <= 0
          ? 'Wallet TestUSDC balance is 0. Claim TestUSDC from the faucet to begin copy-trading.'
          : 'Ready — Operator authorization and TestUSDC allowance active across all binary prediction markets.',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to check allowance status' });
  }
});

// ------------------------------------------------------------------------------
// 3. Swarm Agents Status & Telemetry Endpoints (cached 800ms to prevent ERR_INSUFFICIENT_RESOURCES storm — was 2000ms, PnL now 2.5x faster)
// ------------------------------------------------------------------------------
let cachedSwarmStatus: { at: number; data: any } | null = null;
let cachedSwarmDetailed: { at: number; data: any } | null = null;
const SWARM_CACHE_MS = 800;

export function invalidateSwarmCache(): void {
  cachedSwarmStatus = null;
  cachedSwarmDetailed = null;
}

orderService.onStateChange(invalidateSwarmCache);

apiRouter.get('/agents/status', async (_req: Request, res: Response) => {
  if (cachedSwarmStatus && Date.now() - cachedSwarmStatus.at < SWARM_CACHE_MS) {
    return res.json(cachedSwarmStatus.data);
  }
  const statusSummary = await swarmRunner.getSwarmStatusAsync();
  const payload = { success: true, agents: statusSummary };
  cachedSwarmStatus = { at: Date.now(), data: payload };
  res.json(payload);
});

apiRouter.get('/agents/detailed', async (_req: Request, res: Response) => {
  if (cachedSwarmDetailed && Date.now() - cachedSwarmDetailed.at < SWARM_CACHE_MS) {
    return res.json(cachedSwarmDetailed.data);
  }
  const detailed = await swarmRunner.getDetailedSwarmStateAsync();
  const payload = { success: true, ...detailed };
  cachedSwarmDetailed = { at: Date.now(), data: payload };
  res.json(payload);
});

function isOperatorAuthorized(req: Request): boolean {
  const operatorSecret = process.env.OPERATOR_ADMIN_SECRET;
  const authHeader = req.headers['x-operator-auth'] || req.headers['authorization'];

  if (operatorSecret) {
    return authHeader === `Bearer ${operatorSecret}` || authHeader === operatorSecret;
  }

  // In development / test environment without OPERATOR_ADMIN_SECRET configured:
  const headerOp = (req.headers['x-operator-address'] as string) || (req.headers['x-operator-auth-address'] as string);
  const userAddress = req.body?.operatorAddress || req.body?.userAddress || headerOp;

  return !userAddress || (typeof userAddress === 'string' && userAddress.toLowerCase() === operatorAccount.address.toLowerCase());
}

apiRouter.post('/agents/toggle', (req: Request, res: Response) => {
  try {
    if (!isOperatorAuthorized(req)) {
      return res.status(403).json({ success: false, error: 'Forbidden: Only the protocol operator can modify global swarm policies' });
    }

    const { agentType, enabled } = req.body;
    if (!agentType || typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Missing agentType or enabled boolean' });
    }

    const updated = swarmRunner.toggleAgent(agentType as AgentType, enabled);
    invalidateSwarmCache();
    return res.json({
      success: updated,
      agentType,
      enabled,
      message: updated ? `Agent ${agentType} toggled ${enabled ? 'ON' : 'OFF'}` : 'Unknown agent type',
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/agents/config', (req: Request, res: Response) => {
  try {
    if (!isOperatorAuthorized(req)) {
      return res.status(403).json({ success: false, error: 'Forbidden: Only the protocol operator can modify global swarm policies' });
    }

    const { agentType, config } = req.body;
    if (!agentType || !config || typeof config !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing agentType or config payload' });
    }

    const updated = swarmRunner.updateAgentConfig(agentType as AgentType, config);
    invalidateSwarmCache();
    return res.json({
      success: updated,
      agentType,
      config,
      message: updated ? `Agent ${agentType} configuration updated` : 'Failed to update agent configuration',
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.get('/agents/logs', (req: Request, res: Response) => {
  const agentType = req.query.agentType as string | undefined;

  const sampleLogs = [
    {
      id: 'log-001',
      agentType: 'Volt',
      triggerEvent: 'SPOT_DRIFT',
      confidence: 0.94,
      actionTaken: 'TAKER_SNIPE',
      reasoningText: 'BTC spot surged +0.35% in 1m. Resting YES ask on 5m contract priced at 0.48 vs fair 0.58. Executed 5-lot IOC taker buy.',
      createdAt: new Date(Date.now() - 15000).toISOString(),
    },
    {
      id: 'log-002',
      agentType: 'Oracle',
      triggerEvent: 'VOLATILITY_SURFACE_DISCREPANCY',
      confidence: 0.91,
      actionTaken: 'TAKER_BUY_NO',
      reasoningText: 'ETH 15m implied probability 62.0% deviates from Black-Scholes Φ(z) 48.5%. Buying underpriced NO outcome.',
      createdAt: new Date(Date.now() - 45000).toISOString(),
    },
    {
      id: 'log-003',
      agentType: 'Titan',
      triggerEvent: 'CONTINUOUS_MARKET_MAKING',
      confidence: 0.88,
      actionTaken: 'LIMIT_QUOTE_YES',
      reasoningText: 'Providing two-sided liquidity around Φ(z) = 52.0%. Quoting Bid: 0.49 / Ask: 0.53 with inventory skew.',
      createdAt: new Date(Date.now() - 75000).toISOString(),
    },
  ];

  const filtered = agentType
    ? sampleLogs.filter((l) => l.agentType.toLowerCase() === agentType.toLowerCase())
    : sampleLogs;

  res.json({
    success: true,
    count: filtered.length,
    logs: filtered,
  });
});

// ------------------------------------------------------------------------------
// 3b. Personal Swarm — Per-Wallet Isolated Strategy (COPY vs PERSONAL)
// ------------------------------------------------------------------------------
apiRouter.get('/swarm/my-config', (req: Request, res: Response) => {
  try {
    const userAddress = (req.query.userAddress as string) || (req.headers['x-user-address'] as string);
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Missing or invalid userAddress' });
    }
    const cfg = userSwarmService.getConfig(userAddress);
    return res.json({ success: true, config: cfg });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.put('/swarm/my-config', async (req: Request, res: Response) => {
  try {
    const { userAddress, mode, voltEnabled, oracleEnabled, titanEnabled, sweeperEnabled, voltConfig, oracleConfig, titanConfig } = req.body;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Missing or invalid userAddress' });
    }
    const updated = await userSwarmService.upsertConfig(userAddress, {
      mode,
      voltEnabled,
      oracleEnabled,
      titanEnabled,
      sweeperEnabled,
      voltConfig,
      oracleConfig,
      titanConfig,
    });
    return res.json({ success: true, config: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/swarm/mode', async (req: Request, res: Response) => {
  try {
    const { userAddress, mode } = req.body;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Missing or invalid userAddress' });
    }
    if (mode !== 'COPY' && mode !== 'PERSONAL') {
      return res.status(400).json({ success: false, error: 'mode must be COPY or PERSONAL' });
    }
    const updated = await userSwarmService.setMode(userAddress, mode);
    return res.json({ success: true, config: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/swarm/toggle', async (req: Request, res: Response) => {
  try {
    const { userAddress, agentType, enabled } = req.body;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Missing or invalid userAddress' });
    }
    if (!agentType || typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Missing agentType or enabled boolean' });
    }
    const updated = await userSwarmService.toggleAgent(userAddress, agentType as AgentType, enabled);
    return res.json({ success: true, config: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/swarm/config', async (req: Request, res: Response) => {
  try {
    const { userAddress, agentType, config } = req.body;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Missing or invalid userAddress' });
    }
    if (!agentType || !config || typeof config !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing agentType or config' });
    }
    const updated = await userSwarmService.updateAgentConfig(userAddress, agentType as AgentType, config);
    return res.json({ success: true, config: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.get('/swarm/my-status', async (req: Request, res: Response) => {
  try {
    const userAddress = (req.query.userAddress as string) || (req.headers['x-user-address'] as string);
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Missing or invalid userAddress' });
    }
    const status = await swarmRunner.getPersonalSwarmStatusAsync(userAddress);
    return res.json({ success: true, status });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/swarm/reset', async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.body;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Missing or invalid userAddress' });
    }
    const updated = await userSwarmService.resetToCopy(userAddress);
    return res.json({ success: true, config: updated, message: 'Reset to COPY mode — now mirroring protocol swarm via copy-trade' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ------------------------------------------------------------------------------
// 4. Order Execution & History Endpoints
// ------------------------------------------------------------------------------
apiRouter.get('/orders', (req: Request, res: Response) => {
  const { userAddress, agentType, status, outcome, marketId, limit, page, pageSize, search, swarmOnly, scope } = req.query;

  const result = orderService.queryOrdersPaginated({
    userAddress: typeof userAddress === 'string' ? userAddress : undefined,
    agentType: typeof agentType === 'string' ? (agentType as AgentType) : undefined,
    status: typeof status === 'string' ? (status as OrderStatus) : undefined,
    outcome: typeof outcome === 'string' && (outcome === 'YES' || outcome === 'NO' || outcome === 'VOID') ? (outcome as any) : undefined,
    marketId: typeof marketId === 'string' ? marketId : undefined,
    searchQuery: typeof search === 'string' ? search : undefined,
    scope: scope === 'SWARM' || scope === 'MY_ORDERS' || scope === 'ALL' ? scope : undefined,
    swarmOnly: swarmOnly === 'true' || scope === 'SWARM',
    limit: limit !== undefined ? parseInt(limit as string, 10) : undefined,
    page: page !== undefined ? parseInt(page as string, 10) : undefined,
    pageSize: pageSize !== undefined ? parseInt(pageSize as string, 10) : undefined,
  });

  res.json({
    success: true,
    count: result.orders.length,
    total: result.total,
    totalFills: result.totalFills,
    totalVolume: result.totalVolume,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
    data: result.orders,
  });
});

apiRouter.get('/orders/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const order = orderService.getOrderById(id);

  if (!order) {
    return res.status(404).json({ success: false, error: `Order ${id} not found` });
  }

  return res.json({
    success: true,
    data: order,
  });
});

apiRouter.post('/orders/place', async (req: Request, res: Response) => {
  try {
    const { userAddress, marketId, outcome, direction, orderType, price, lotSize, txHash } = req.body;

    if (!userAddress || typeof userAddress !== 'string' || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Valid userAddress is required' });
    }

    if (!marketId || typeof marketId !== 'string') {
      return res.status(400).json({ success: false, error: 'Valid marketId is required' });
    }

    if (outcome !== 'YES' && outcome !== 'NO') {
      return res.status(400).json({ success: false, error: 'Outcome must be YES or NO' });
    }

    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0 || numPrice >= 1.0) {
      return res.status(400).json({ success: false, error: 'Price must be between 0.01 and 0.99' });
    }

    const numLotSize = Number(lotSize);
    if (isNaN(numLotSize) || numLotSize <= 0) {
      return res.status(400).json({ success: false, error: 'Lot size must be greater than 0' });
    }

    const normOrderType = orderType === 'IOC' || orderType === 'MARKET' ? 'IOC' : 'LIMIT';
    const normDirection = direction === 'SELL' ? 'SELL' : 'BUY';

    const order = await orderService.submitUserOrder({
      userAddress: getAddress(userAddress) as Address,
      marketId,
      outcome,
      direction: normDirection,
      orderType: normOrderType,
      price: numPrice,
      lotSize: numLotSize,
      txHash: typeof txHash === 'string' && txHash.startsWith('0x') ? (txHash as Hex) : undefined,
    });

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: order,
    });
  } catch (err: any) {
    console.warn('[Routes] Error placing order:', err.message);
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to place order',
    });
  }
});

apiRouter.get('/portfolio/summary', async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.query;
    const targetAddress = typeof userAddress === 'string' && userAddress.trim().length > 0
      ? userAddress.trim()
      : undefined;

    const opAddress = (SOMNIA_ADDRESSES.operatorAccount || operatorAccount.address).toLowerCase();
    const effectiveAddress = targetAddress || operatorAccount.address;
    const isOperator = targetAddress ? targetAddress.toLowerCase() === opAddress : true;
    const sweeperSummary = await settlementService.getSweeperSummary(effectiveAddress).catch(() => null);
    const userOrders = orderService.getOrders({ userAddress: targetAddress });
    const session = targetAddress ? await sessionService.getUserActiveSession(targetAddress).catch(() => null) : null;
    if (session) {
      const realSpend = userOrders
        .filter((o) => o.status === 'FILLED' || o.status === 'PENDING')
        .reduce((sum, o) => sum + (o.totalCost || 0), 0);

      if (session.spentToday > realSpend) {
        session.spentToday = Number(realSpend.toFixed(4));
        sessionService.updateSessionSpend(session.id, session.spentToday);
      }
    }

    // Realized PnL is authoritative: sum of per-trade (payout - cost) for every expired market, handling BUY/SELL and VOID correctly via historically accurate settlement price
    const realizedPnl = await orderService.getTotalRealizedPnlAsync(undefined, targetAddress);
    // Unclaimed is gross payout awaiting on-chain redemption (1 USDC per winning lot), NOT net profit - keep separate to avoid double counting
    const unclaimedPnl = sweeperSummary?.unclaimedAmount || 0;
    const totalClaimed = sweeperSummary?.totalClaimedAllTime || 0;
    // Total portfolio PnL = net realized profit (already includes wins even if not yet swept). Do NOT add gross unclaimed.
    const totalPnl = Number(realizedPnl.toFixed(2));
    const activePositionsCount = orderService.getActivePositionCount(undefined, targetAddress);

    return res.json({
      success: true,
      data: {
        userAddress: effectiveAddress,
        isOperator,
        realizedPnl,
        unclaimedPnl,
        totalClaimedAllTime: totalClaimed,
        totalPnl,
        activePositionsCount,
        ordersTodayCount: userOrders.length,
        volumeToday: session?.spentToday || 0,
        dailyVolumeCap: session?.dailyVolumeCap || 100,
        maxTradeSize: session?.maxTradeSize || 10,
        hasActiveSession: !!session?.isActive,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch portfolio summary' });
  }
});

// ------------------------------------------------------------------------------
// 5. Sweeper Settlement & Payout Redemptions
// ------------------------------------------------------------------------------
apiRouter.get('/sweeper/summary', async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.query;
    const targetAddress = typeof userAddress === 'string' && userAddress.trim().length > 0
      ? userAddress.trim()
      : operatorAccount.address;
    const summary = await settlementService.getSweeperSummary(targetAddress);
    return res.json({
      success: true,
      data: summary,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch sweeper summary' });
  }
});

apiRouter.get('/sweeper/unclaimed', async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.query;
    const targetAddress = typeof userAddress === 'string' && userAddress.trim().length > 0
      ? userAddress.trim()
      : operatorAccount.address;
    const unclaimed = await settlementService.scanUnclaimedSettlements(targetAddress);
    const totalUnclaimed = Number(
      unclaimed.reduce((acc, p) => acc + p.claimableAmount, 0).toFixed(4),
    );
    return res.json({
      success: true,
      count: unclaimed.length,
      totalUnclaimedAmount: `${totalUnclaimed.toFixed(2)} tUSDC`,
      unclaimedAmountNum: totalUnclaimed,
      positions: unclaimed.map((p) => ({
        marketId: p.marketId,
        symbol: p.symbol,
        marketIdHex: p.marketIdHex,
        winningOutcome: p.winningOutcome,
        claimableAmount: p.claimableAmount,
        rawAmount: p.rawAmount.toString(),
        isVoided: p.isVoided,
        status: p.status,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to scan unclaimed settlements' });
  }
});

apiRouter.post('/sweeper/trigger', async (req: Request, res: Response) => {
  try {
    const { userAddress, autoCompound } = req.body;
    const result = await settlementService.triggerBatchSweep(
      userAddress || operatorAccount.address,
      autoCompound ?? true,
    );

    res.json({
      success: true,
      claimedMarketsCount: result.claimedMarketsCount,
      totalClaimedAmount: result.totalClaimedAmount,
      txHash: result.txHash,
      sweeps: result.sweeps,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to trigger settlement sweep' });
  }
});

apiRouter.get('/sweeper/history', (req: Request, res: Response) => {
  const { userAddress } = req.query;
  const targetAddress = typeof userAddress === 'string' && userAddress.trim().length > 0
    ? userAddress.trim()
    : operatorAccount.address;
  const history = settlementService.getSweepHistory(targetAddress);
  res.json({
    success: true,
    count: history.length,
    data: history,
  });
});

// ------------------------------------------------------------------------------
// 6. Analytics & Balance History (Transparent Swarm vs User Equity)
// ------------------------------------------------------------------------------
apiRouter.get('/analytics/equity', async (req: Request, res: Response) => {
  try {
    const { userAddress, range } = req.query;
    const parsedRange = (typeof range === 'string' ? range : '30d') as AnalyticsRange;
    const allowed: AnalyticsRange[] = ['24h', '7d', '30d', '90d', 'ALL'];
    const finalRange = allowed.includes(parsedRange) ? parsedRange : '30d';
    const targetAddress = typeof userAddress === 'string' && userAddress.trim().length > 0 ? userAddress.trim() : undefined;
    const data = await analyticsService.getAnalytics(targetAddress, finalRange);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch analytics' });
  }
});

apiRouter.get('/analytics/balance-history', async (req: Request, res: Response) => {
  try {
    const { userAddress, range } = req.query;
    const parsedRange = (typeof range === 'string' ? range : '30d') as AnalyticsRange;
    const allowed: AnalyticsRange[] = ['24h', '7d', '30d', '90d', 'ALL'];
    const finalRange = allowed.includes(parsedRange) ? parsedRange : '30d';
    const targetAddress = typeof userAddress === 'string' && userAddress.trim().length > 0 ? userAddress.trim() : undefined;
    const data = await analyticsService.getBalanceHistory(targetAddress, finalRange);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch balance history' });
  }
});

// ------------------------------------------------------------------------------
// 7. Strategy Studio & Historical Backtesting Simulator
// ------------------------------------------------------------------------------
apiRouter.post('/backtest/run', async (req: Request, res: Response) => {
  try {
    const {
      userAddress,
      agentType,
      symbol,
      period,
      timeframe,
      startDate,
      endDate,
      initialCapital,
      strategyConfig,
      frictionConfig,
    } = req.body;

    const result = await backtestService.runSimulation({
      userAddress,
      agentType: agentType || 'Volt',
      symbol: symbol || 'BTC/USD',
      period,
      timeframe,
      startDate,
      endDate,
      initialCapital: initialCapital ? parseFloat(initialCapital) : 1000.0,
      strategyConfig: strategyConfig || {},
      frictionConfig: frictionConfig || {},
    });

    res.json({
      success: true,
      result,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Backtest simulation failed' });
  }
});

apiRouter.get('/backtest/history', (req: Request, res: Response) => {
  const { userAddress } = req.query;
  const history = backtestService.getBacktestHistory(typeof userAddress === 'string' ? userAddress : undefined);
  res.json({
    success: true,
    count: history.length,
    data: history,
  });
});

// ------------------------------------------------------------------------------
// 8. Health Check Endpoint
// ------------------------------------------------------------------------------
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'DreamPulse Engine',
    timestamp: new Date().toISOString(),
  });
});

apiRouter.get('/debug/market/:id', (req: Request, res: Response) => {
  const m = marketService.getMarketById(req.params.id);
  const active = (marketService as any).markets?.size;
  const hist = (marketService as any).historicalMarkets?.size;
  res.json({ found: !!m, market: m, activeCount: active, histCount: hist });
});


