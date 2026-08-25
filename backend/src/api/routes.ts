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
import { type Address, isAddress, getAddress, parseAbi } from 'viem';

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

apiRouter.get('/markets/pools/future', async (_req: Request, res: Response) => {
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const horizonSec = nowSec + 24 * 3600;
    const poolSet = new Set<string>();

    // 1) Current Open + Listed via indexer (covers deployed pools for next windows)
    try {
      const all = await somniaExchange.client.listBinaryMarkets({ limit: 100 } as any).catch(() => [] as any[]);
      for (const m of all as any[]) {
        const expiry = Number(m.expiry || 0);
        const pool = m.poolAddress as string | undefined;
        if (!pool || pool === SOMNIA_ADDRESSES.binaryModule) continue;
        // Include if expiry within 24h horizon or status is Trading/Listed and not voided
        const status = String(m.status || '');
        const isRelevant = (expiry > 0 && expiry >= nowSec - 3600 && expiry <= horizonSec + 3600) || status === 'Trading' || status === 'Listed' || status === '1' || status === '0';
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

    // 4) Fallback: if still empty, use known venue pools from recent markets
    const pools = [...poolSet].slice(0, 80) as Address[];
    res.json({ success: true, count: pools.length, pools, horizonHours: 24 });
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
    // Build pool set covering current Open + Listed + FreePools for 24h horizon (same as /pools/future)
    const poolSet = new Set<string>();
    for (const m of marketService.getActiveMarkets({ status: 'Open' }).slice(0, 20)) {
      if (m.poolAddress) poolSet.add(m.poolAddress.toLowerCase());
    }
    try {
      const all = await somniaExchange.client.listBinaryMarkets({ limit: 100 } as any).catch(() => [] as any[]);
      const nowSec = Math.floor(Date.now() / 1000);
      const horizonSec = nowSec + 24 * 3600;
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
    const pools = [...poolSet].slice(0, 40) as Address[];

    const erc20Abi = parseAbi(['function allowance(address owner, address spender) view returns (uint256)', 'function balanceOf(address account) view returns (uint256)']);
    const checks = await Promise.all(
      pools.map(async (pool) => {
        try {
          const [allowance, balance, vault] = await Promise.all([
            publicClient.readContract({ address: SOMNIA_ADDRESSES.testUsdc, abi: erc20Abi, functionName: 'allowance', args: [normalized, pool] }).catch(() => 0n),
            publicClient.readContract({ address: SOMNIA_ADDRESSES.testUsdc, abi: erc20Abi, functionName: 'balanceOf', args: [normalized] }).catch(() => 0n),
            // Vault balance via SDK (per-pool vault)
            (async () => {
              try {
                const { somniaExchange } = await import('../config/somnia.js');
                return await somniaExchange.client.getVaultBalance({ vault: pool, owner: normalized, token: SOMNIA_ADDRESSES.testUsdc }).catch(() => 0n);
              } catch {
                return 0n;
              }
            })(),
          ]);
          const allowanceHuman = Number(allowance) / 1_000_000;
          const balanceHuman = Number(balance) / 1_000_000;
          const vaultHuman = Number(vault) / 1_000_000;
          const ready = allowanceHuman >= 1000 || vaultHuman >= 10;
          return { pool, allowance: allowance.toString(), allowanceHuman, balanceHuman, vaultHuman, ready };
        } catch (e: any) {
          return { pool, error: e.message, ready: false };
        }
      }),
    );

    const hasDelegated = !!session?.onChainAuthorized;
    const allReady = checks.length === 0 ? true : checks.every((c: any) => c.ready);
    return res.json({
      success: true,
      userAddress: normalized,
      hasActiveSession: !!session?.isActive,
      hasDelegated,
      poolsChecked: checks.length,
      allReady,
      checks,
      guidance: !hasDelegated
        ? 'No on-chain operator delegation found — approve OperatorPermissionsRegistry first.'
        : !allReady
          ? 'One or more pools have insufficient TestUSDC allowance (<1000) and vault (<10). Call wallet approve for those pools via frontend.'
          : 'All checked pools have sufficient allowance/vault for copy-trades.',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to check allowance status' });
  }
});

// ------------------------------------------------------------------------------
// 3. Swarm Agents Status & Telemetry Endpoints (cached 2s to prevent ERR_INSUFFICIENT_RESOURCES storm)
// ------------------------------------------------------------------------------
let cachedSwarmStatus: { at: number; data: any } | null = null;
let cachedSwarmDetailed: { at: number; data: any } | null = null;
const SWARM_CACHE_MS = 2000;

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
  const headerOp = (req.headers['x-operator-address'] as string) || (req.headers['x-operator-auth-address'] as string);
  const userAddress = req.body.operatorAddress || req.body.userAddress || headerOp;

  if (operatorSecret && authHeader === `Bearer ${operatorSecret}`) {
    return true;
  }
  if (userAddress && typeof userAddress === 'string' && userAddress.toLowerCase() === operatorAccount.address.toLowerCase()) {
    return true;
  }
  if (!operatorSecret) {
    // If no secret env set, allow if no address provided (legacy) or if it matches operator
    return !userAddress || userAddress.toLowerCase() === operatorAccount.address.toLowerCase();
  }
  return false;
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
// 4. Order Execution & History Endpoints
// ------------------------------------------------------------------------------
apiRouter.get('/orders', (req: Request, res: Response) => {
  // Fire-and-forget PnL settlement — do not block paginated reads. Previous `await` caused
  // `priceFeedService.getHistoricalPriceAt` network stalls to hang the entire table on Loading forever.
  orderService.syncResolvedOrdersPnL();
  const { userAddress, agentType, status, outcome, marketId, limit, page, pageSize, search } = req.query;

  const result = orderService.queryOrdersPaginated({
    userAddress: typeof userAddress === 'string' ? userAddress : undefined,
    agentType: typeof agentType === 'string' ? (agentType as AgentType) : undefined,
    status: typeof status === 'string' ? (status as OrderStatus) : undefined,
    outcome: typeof outcome === 'string' && (outcome === 'YES' || outcome === 'NO' || outcome === 'VOID') ? (outcome as any) : undefined,
    marketId: typeof marketId === 'string' ? marketId : undefined,
    searchQuery: typeof search === 'string' ? search : undefined,
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
// 6. Strategy Studio & Historical Backtesting Simulator
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
// 7. Health Check Endpoint
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


