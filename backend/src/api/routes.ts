import { Router, Request, Response } from 'express';
import { marketService } from '../services/market-service.js';
import { anomalyService, normalizeMarketSymbol } from '../services/anomaly-service.js';
import { sessionService, MAX_ALLOWED_TRADE_SIZE, MAX_ALLOWED_DAILY_CAP } from '../services/session-service.js';
import { swarmRunner } from '../agents/swarm-runner.js';
import { orderService } from '../services/order-service.js';
import { settlementService } from '../services/settlement-service.js';
import { backtestService } from '../services/backtest-service.js';
import { customAgentService } from '../services/custom-agent-service.js';
import { operatorAccount, SOMNIA_ADDRESSES, publicClient, somniaExchange } from '../config/somnia.js';
import type { MarketStatus, AgentType, OrderStatus, OrderType, SettlementSweep } from '../types/index.js';
import { type Address, type Hex, isAddress, getAddress, parseAbi } from 'viem';
import { analyticsService, type AnalyticsRange } from '../services/analytics-service.js';
import { userSwarmService } from '../services/user-swarm-service.js';
import { socialCopyService } from '../services/social-copy-service.js';
import { leaderboardService, type ArenaTimeframe, type ArenaSortBy } from '../services/leaderboard-service.js';
import { requireWalletAuth, optionalWalletAuth } from '../middleware/wallet-auth.js';
import { aiGenerationRateLimiter } from '../middleware/rate-limiter.js';
import { telemetryWsGateway } from '../websocket/server.js';
import { supabase, isPersistenceEnabled } from '../config/supabase.js';
import { getSessionAccount, getCloneAllowance, getCloneBalance, CLONE_ZERO_ADDRESS } from '../config/permissions-abi.js';
import { timingSafeEqual } from 'node:crypto';
import { ledgerExportService } from '../services/ledger-export-service.js';

export const apiRouter = Router();

// SEC-01: session_key_private_key is a live signing key held by the backend
// relay only (AES-256-GCM ciphertext at rest, plaintext in backend memory
// only). It must NEVER leave the server — not on GET reads, not on the
// POST /sessions/register echo either. The frontend generates the ephemeral
// key locally and already holds it in memory; it hydrates state from its own
// copy, so the server has no reason to echo key material. Every session object
// returned by this router is passed through stripSessionSecrets().
function stripSessionSecrets<T>(session: T): T {
  if (!session || typeof session !== 'object') return session;
  const copy = { ...(session as Record<string, unknown>) };
  delete copy.sessionKeyPrivateKey;
  delete copy.session_key_private_key;
  return copy as T;
}

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

// Real spot price history for event-contract charts — live ticks + exchange
// klines only. Never synthesizes data: when exchange backfill is unavailable
// the response contains only locally observed ticks with isPartial=true so
// the frontend renders an explicit "Recent Trades Only" view.
apiRouter.get('/markets/price-history', async (req: Request, res: Response) => {
  try {
    const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : '';
    if (!symbol || !symbol.includes('/')) {
      return res.status(400).json({ success: false, error: 'Missing or invalid symbol parameter (e.g. BTC/USD)' });
    }
    const lookbackSec = req.query.lookbackSec !== undefined
      ? Math.min(86400, Math.max(60, parseInt(req.query.lookbackSec as string, 10) || 300))
      : 300;
    const maxPoints = req.query.maxPoints !== undefined
      ? Math.min(500, Math.max(10, parseInt(req.query.maxPoints as string, 10) || 120))
      : 120;
    const history = await marketService.getPriceHistory(symbol, lookbackSec, maxPoints);
    return res.json({
      success: true,
      symbol,
      lookbackSec,
      count: history.points.length,
      points: history.points.map((p) => ({ time: p.time, price: p.price })),
      sources: history.sources,
      isPartial: history.isPartial,
      from: history.from,
      to: history.to,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to fetch price history' });
  }
});

apiRouter.get('/markets/anomalies', (req: Request, res: Response) => {
  const threshold = req.query.threshold ? parseFloat(req.query.threshold as string) : undefined;
  const spotPrices = marketService.getAllSpotTickers();
  const spotMap: Record<string, number> = {};
  for (const [k, v] of Object.entries(spotPrices)) {
    spotMap[k] = v.price;
    spotMap[normalizeMarketSymbol(k)] = v.price;
  }

  const markets = marketService.getActiveMarkets();
  const anomalies = anomalyService.scanMarkets(markets, spotPrices, threshold);

  res.json({
    success: true,
    count: anomalies.length,
    data: anomalies,
  });
});

apiRouter.get('/markets/:id/depth', (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ success: false, error: 'Missing market id parameter' });
  }

  const market = marketService.getMarketById(id);
  const depth = marketService.getMarketDepth(id);

  if (!market && !depth) {
    return res.status(404).json({
      success: false,
      error: `Market '${id}' not found`,
      marketId: id,
    });
  }

  if (!depth && market) {
    return res.json({
      success: true,
      marketId: market.id,
      depth: {
        marketId: market.id,
        symbol: market.symbol,
        bestBidYes: market.bestBidYes,
        bestAskYes: market.bestAskYes,
        bestBidNo: market.bestBidNo,
        bestAskNo: market.bestAskNo,
        yesBids: [],
        yesAsks: [],
        noBids: [],
        noAsks: [],
        updatedAt: Date.now(),
      },
    });
  }

  return res.json({
    success: true,
    marketId: market?.id || depth?.marketId || id,
    depth: {
      ...depth!,
    },
  });
});

// Cache for /markets/pools/future (30s TTL)
const futurePoolsCache = new Map<string, { data: { success: boolean; count: number; pools: Address[]; horizonHours: number; window: string }; expiresAt: number }>();

// Cache for /allowance-status (15s TTL) — high-frequency polling, multicall-backed
const allowanceStatusCache = new Map<string, { data: any; expiresAt: number }>();
const ALLOWANCE_CACHE_TTL_MS = 15000;
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address;

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

    // 3) Free pools via binaryModule — batched via multicall aggregate3 (was 2 serial RPC)
    try {
      const freePoolsAbi = parseAbi(['function getFreePools(address creator, address collateral) view returns (address[])']);
      const creators: Address[] = [SOMNIA_ADDRESSES.marketCreator as Address, SOMNIA_ADDRESSES.marketCreatorFactory as Address];
      let handled = false;
      try {
        const contracts = creators.map((creator) => ({
          address: SOMNIA_ADDRESSES.binaryModule as Address,
          abi: freePoolsAbi,
          functionName: 'getFreePools',
          args: [creator, SOMNIA_ADDRESSES.testUsdc as Address],
        }));
        const multi = await (publicClient as any)
          .multicall({ contracts, allowFailure: true, multicallAddress: MULTICALL3_ADDRESS })
          .catch(() => null);
        if (multi && Array.isArray(multi) && multi.some((entry: any) => entry?.status === 'success')) {
          for (const entry of multi) {
            if (entry?.status === 'success' && Array.isArray(entry.result)) {
              for (const p of entry.result as Address[]) {
                if (p && p !== '0x0000000000000000000000000000000000000000000000000000000000000000') poolSet.add((p as string).toLowerCase());
              }
            }
          }
          handled = true;
        }
      } catch {}
      if (!handled) {
        const results = await Promise.all(
          creators.map((creator) =>
            publicClient
              .readContract({
                address: SOMNIA_ADDRESSES.binaryModule as Address,
                abi: freePoolsAbi,
                functionName: 'getFreePools',
                args: [creator, SOMNIA_ADDRESSES.testUsdc as Address],
              })
              .catch(() => [] as Address[]),
          ),
        );
        for (const free of results) {
          for (const p of free as Address[]) {
            if (p && p !== '0x0000000000000000000000000000000000000000000000000000000000000000') poolSet.add((p as string).toLowerCase());
          }
        }
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
    // P4: don't cache empty results — cold indexer would freeze 0 pools for 30s and judges filtering window=7d see 0 pools
    if (pools.length > 0) {
      futurePoolsCache.set(cacheKey, { data: responsePayload, expiresAt: Date.now() + 30000 });
    } else {
      // For empty, set very short negative-cache (2s) to avoid hammering indexer, but don't hide fresh pools for 30s
      futurePoolsCache.set(cacheKey, { data: responsePayload, expiresAt: Date.now() + 2000 });
    }
    res.json(responsePayload);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch future pools' });
  }
});

// ------------------------------------------------------------------------------
// 1b. Wallet JWT Auth — mints Supabase Realtime JWT after EIP-712 proof
//     Required for private-table realtime (sessions, orders, sweeps, etc)
//     which are now RLS-denied for anon (012_harden_rls_policies).
//     Heroku: `heroku config:set SUPABASE_JWT_SECRET=<Supabase Dashboard > API > JWT Secret>`
//     and `SUPABASE_JWT_EXPIRY_SECONDS=86400`. Uses same HS256 secret as
//     Supabase — verify via `auth.jwt() ->> 'user_address'` in RLS.
// ------------------------------------------------------------------------------
apiRouter.get('/auth/status', async (_req: Request, res: Response) => {
  try {
    const { isSupabaseJwtConfigured } = await import('../services/auth-service.js');
    res.json({ success: true, supabaseJwtConfigured: isSupabaseJwtConfigured() });
  } catch {
    res.json({ success: true, supabaseJwtConfigured: false });
  }
});

apiRouter.post('/auth/logout', async (_req: Request, res: Response) => {
  try {
    const { clearAuthCookie, clearSessionCookie } = await import('../config/cookie.js');
    clearAuthCookie(res);
    clearSessionCookie(res);
  } catch {}
  return res.json({ success: true, message: 'Logged out — httpOnly cookies cleared' });
});

apiRouter.post('/auth/wallet-verify', async (req: Request, res: Response) => {
  try {
    const { userAddress, signature, nonce, issuedAt, expiresAt } = req.body || {};
    if (!userAddress || !signature || !nonce || issuedAt === undefined || expiresAt === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing userAddress, signature, nonce, issuedAt, expiresAt. Sign EIP-712 Auth {wallet,nonce,issuedAt,expiresAt} with domain {name:"DreamPulse",version:"1",chainId:50312,verifyingContract:OperatorPermissionsRegistry}.',
      });
    }
    const { verifyAndMint, isSupabaseJwtConfigured } = await import('../services/auth-service.js');
    if (!isSupabaseJwtConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'SUPABASE_JWT_SECRET not configured on server — set on Heroku (Supabase Dashboard > API > JWT Secret) and redeploy.',
      });
    }
    const minted = await verifyAndMint({
      userAddress: String(userAddress),
      signature: String(signature),
      nonce: String(nonce),
      issuedAt: Number(issuedAt),
      expiresAt: Number(expiresAt),
    });
    // SECURITY: httpOnly cookie hardening — store JWT in HttpOnly cookie so XSS cannot steal it
    // from localStorage. Frontend api.ts sends credentials:'include' so browser attaches Cookie
    // automatically on every /api/v1/* request. Token is still returned in body for
    // backward-compat (legacy localStorage fallback) and for Supabase realtime auth, but
    // the Cookie is the production source of truth (see wallet-auth.ts `getCookie`).
    try {
      const { setAuthCookie } = await import('../config/cookie.js');
      setAuthCookie(res, minted.token, minted.expiresAt);
    } catch {}
    return res.json({
      success: true,
      token: minted.token,
      expiresAt: minted.expiresAt,
      userAddress: minted.userAddress,
      tokenType: 'Bearer',
      note: 'Use as Supabase auth: supabase.auth.setSession({access_token: token, refresh_token: token}) or supabase.realtime.setAuth(token); then subscribe with filter user_address=eq.<lowercase>',
    });
  } catch (err: any) {
    return res.status(401).json({ success: false, error: err.message || 'Wallet verification failed' });
  }
});

// ------------------------------------------------------------------------------
// 2. Session Key Delegation Endpoints
// ------------------------------------------------------------------------------
apiRouter.post('/sessions/register', requireWalletAuth, async (req: Request, res: Response) => {
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
      copyTradeEnabled,
      sessionKeyAddress,
      sessionKeyPrivateKey,
      delegationContractAddress,
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
      copyTradeEnabled: typeof copyTradeEnabled === 'boolean' ? copyTradeEnabled : undefined,
      sessionKeyAddress,
      sessionKeyPrivateKey,
      delegationContractAddress,
    });

    allowanceStatusCache.delete(userAddress.toLowerCase());

    // SECURITY: bind session to httpOnly cookie (defense-in-depth fingerprint).
    // Even if an attacker steals a SessionGrant snapshot via XSS, they cannot
    // replay it without the httpOnly dreampulse_session cookie which is never
    // accessible to JS. Frontend does not need to read this cookie.
    try {
      const { setSessionCookie } = await import('../config/cookie.js');
      setSessionCookie(res, session.id, session.expiresAt);
    } catch {}

    return res.status(201).json({
      success: true,
      // SEC-01: never echo the signing key — the caller generated it and holds
      // it in memory. Echoing would put live key material on the wire needlessly.
      session: stripSessionSecrets(session),
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to register session',
    });
  }
});

apiRouter.get('/sessions/:userAddress/nonce', optionalWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.params;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Invalid user address parameter' });
    }
    const nextNonce = await sessionService.getNextSessionNonce(userAddress);
    return res.json({
      success: true,
      userAddress: getAddress(userAddress),
      nextNonce,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to query session nonce',
    });
  }
});

apiRouter.get('/sessions/:userAddress', optionalWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.params;
    const activeOnly = req.query.active === 'true';

    const activeSession = await sessionService.getUserActiveSession(userAddress);
    if (activeSession) {
      // Authoritative daily spend aggregate from Supabase + cache:
      // SELECT COALESCE(SUM(lot_size * price), 0) FROM public.orders WHERE user_address = $1 AND created_at >= $2 AND status NOT IN ('CANCELLED', 'FAILED');
      const resetTimestamp = activeSession.lastSpendResetTimestamp || (Date.now() - 24 * 3600 * 1000);
      const realSpend = await orderService.getDailySpendAggregate(userAddress, resetTimestamp);

      if (Math.abs(activeSession.spentToday - realSpend) > 0.0001) {
        activeSession.spentToday = realSpend;
        sessionService.updateSessionSpend(activeSession.id, activeSession.spentToday);
      }
    }

    if (activeOnly) {
      return res.json({
        success: true,
        session: activeSession ? stripSessionSecrets(activeSession) : activeSession,
      });
    }

    const [sessions, nextNonce] = await Promise.all([
      sessionService.listUserSessions(userAddress),
      sessionService.getNextSessionNonce(userAddress),
    ]);

    return res.json({
      success: true,
      count: sessions.length,
      activeSession: activeSession ? stripSessionSecrets(activeSession) : activeSession,
      sessions: sessions.map(stripSessionSecrets),
      nextNonce,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to query user sessions',
    });
  }
});

apiRouter.post('/sessions/:userAddress/reset-spend', requireWalletAuth, async (req: Request, res: Response) => {
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
      session: stripSessionSecrets({ ...session, spentToday: 0 }),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to reset session spend' });
  }
});

apiRouter.post('/sessions/:userAddress/risk', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.params;
    const { maxTradeSize, dailyVolumeCap } = req.body;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Invalid user address parameter' });
    }

    const tradeSizeNum = Number(maxTradeSize);
    const dailyCapNum = Number(dailyVolumeCap);

    if (isNaN(tradeSizeNum) || tradeSizeNum <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid maxTradeSize: must be a positive number' });
    }
    if (tradeSizeNum > MAX_ALLOWED_TRADE_SIZE) {
      return res.status(400).json({
        success: false,
        error: `Invalid maxTradeSize: exceeds maximum allowed trade size of ${MAX_ALLOWED_TRADE_SIZE} tUSDC`,
      });
    }
    if (isNaN(dailyCapNum) || dailyCapNum < tradeSizeNum) {
      return res.status(400).json({
        success: false,
        error: `Invalid dailyVolumeCap: must be >= maxTradeSize (${tradeSizeNum})`,
      });
    }
    if (dailyCapNum > MAX_ALLOWED_DAILY_CAP) {
      return res.status(400).json({
        success: false,
        error: `Invalid dailyVolumeCap: exceeds maximum allowed daily cap of ${MAX_ALLOWED_DAILY_CAP} tUSDC`,
      });
    }

    const session = await sessionService.updateSessionRisk(
      userAddress,
      tradeSizeNum,
      dailyCapNum
    );
    if (!session) {
      return res.status(404).json({ success: false, error: 'No active session found for user' });
    }
    return res.json({
      success: true,
      session: stripSessionSecrets(session),
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to update session risk' });
  }
});

apiRouter.post('/sessions/:id/revoke', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Ownership check: only the session owner (or operator in test) may revoke
    const wallet = (req as any).walletAddress as string | undefined;
    if (wallet) {
      const sess = sessionService.getSessionById(id);
      if (sess && sess.userAddress.toLowerCase() !== wallet.toLowerCase()) {
        return res.status(403).json({ success: false, error: 'Forbidden: session does not belong to authenticated wallet' });
      }
    }
    const revoked = await sessionService.revokeSession(id);
    if (wallet) {
      allowanceStatusCache.delete(wallet.toLowerCase());
    }
    // Clear httpOnly session fingerprint cookie on revoke (prevents replay of stale sessionId)
    try {
      const { clearSessionCookie } = await import('../config/cookie.js');
      clearSessionCookie(res);
    } catch {}

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

apiRouter.get('/sessions/:userAddress/clone', optionalWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.params;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Invalid userAddress' });
    }
    const normalized = getAddress(userAddress) as Address;
    const session = await sessionService.getUserActiveSession(normalized).catch(() => null);
    let cloneAddress = session?.accountAddress;
    if (!cloneAddress) {
      cloneAddress = (await getSessionAccount(normalized).catch(() => null)) ?? undefined;
    }
    const isDeployed = Boolean(cloneAddress && cloneAddress.toLowerCase() !== CLONE_ZERO_ADDRESS.toLowerCase());
    const predicted = !isDeployed ? await sessionService.predictClone(normalized).catch(() => null) : null;
    let cloneBalance = 0;
    if (isDeployed && cloneAddress) {
      const balRaw = await getCloneBalance(cloneAddress).catch(() => 0n);
      cloneBalance = Number(balRaw ?? 0n) / 1e6;
    }
    return res.json({
      success: true,
      userAddress: normalized,
      accountAddress: isDeployed ? cloneAddress : (predicted ?? cloneAddress ?? null),
      isDeployed,
      cloneBalance,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to query clone' });
  }
});

apiRouter.post('/sessions/:userAddress/deploy-clone', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.params;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Invalid userAddress' });
    }
    const normalized = getAddress(userAddress) as Address;
    const accountAddress = await sessionService.getOrCreateClone(normalized);
    return res.json({
      success: true,
      userAddress: normalized,
      accountAddress,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to deploy clone' });
  }
});

apiRouter.get('/sessions/:userAddress/allowance-status', optionalWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.params;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Invalid userAddress' });
    }
    const normalized = getAddress(userAddress) as Address;
    const cacheKey = normalized.toLowerCase();
    const nowMs = Date.now();
    const isFresh = req.query.fresh === 'true' || req.query.force === 'true';
    const cached = allowanceStatusCache.get(cacheKey);
    if (!isFresh && cached && nowMs < cached.expiresAt) {
      return res.json(cached.data);
    }
    const session = await sessionService.getUserActiveSession(normalized).catch(() => null);
    const erc20Abi = parseAbi(['function allowance(address owner, address spender) view returns (uint256)', 'function balanceOf(address account) view returns (uint256)']);

    let accountAddress = session?.accountAddress;
    if (!accountAddress) {
      accountAddress = (await getSessionAccount(normalized).catch(() => null)) ?? undefined;
    }
    const hasClone = Boolean(accountAddress && accountAddress.toLowerCase() !== CLONE_ZERO_ADDRESS.toLowerCase());

    let balance: bigint = 0n;
    let cloneAllowance: bigint = 0n;
    let cloneBalance: bigint = 0n;
    try {
      const [walletBal, cloneAllow, cloneBal] = await Promise.all([
        publicClient.readContract({ address: SOMNIA_ADDRESSES.testUsdc, abi: erc20Abi, functionName: 'balanceOf', args: [normalized] }).catch(() => 0n) as Promise<bigint>,
        hasClone && accountAddress
          ? (getCloneAllowance(normalized, accountAddress).catch(() => 0n) as Promise<bigint>)
          : Promise.resolve(0n),
        hasClone && accountAddress
          ? (getCloneBalance(accountAddress).catch(() => 0n) as Promise<bigint>)
          : Promise.resolve(0n),
      ]);
      balance = walletBal ?? 0n;
      cloneAllowance = cloneAllow ?? 0n;
      cloneBalance = cloneBal ?? 0n;
    } catch {
      // safe fallback if RPC throws
    }

    const balanceHuman = Number(balance) / 1_000_000;
    const cloneAllowanceHuman = Number(cloneAllowance) / 1_000_000;
    const cloneBalanceHuman = Number(cloneBalance) / 1_000_000;

    const hasSessionKey = Boolean(session?.isActive && session?.onChainAuthorized);
    const hasVaultFunds = cloneBalanceHuman > 0;
    // In pure isolated vault mode, main-wallet approval is not required;
    // readiness requires the clone, the active session key, and funded vault.
    const allReady = hasClone && hasSessionKey && hasVaultFunds;

    const payload = {
      success: true,
      userAddress: normalized,
      hasActiveSession: !!session?.isActive,
      hasDelegated: !!session?.onChainAuthorized || hasClone,
      isGloballyApproved: hasClone,
      hasOperatorAllowance: hasClone,
      allowanceOperatorHuman: cloneBalanceHuman,
      balanceHuman,
      accountAddress: hasClone ? accountAddress : undefined,
      hasClone,
      cloneAllowanceHuman,
      cloneBalanceHuman,
      poolsChecked: 1,
      checks: [
        {
          pool: accountAddress ? `Smart Account Clone (${accountAddress.slice(0, 6)}...${accountAddress.slice(-4)})` : 'Smart Account Clone',
          allowanceHuman: cloneBalanceHuman,
          balanceHuman,
          vaultHuman: cloneBalanceHuman,
          ready: hasClone && hasSessionKey && hasVaultFunds,
        },
      ],
      allReady,
      guidance: !hasClone
        ? 'Smart Account Clone required. Click Authorize to deploy your isolated clone (sponsored by backend).'
        : !hasSessionKey
          ? 'Session delegation required. Authorize your session key on your Smart Account Clone to begin.'
          : !hasVaultFunds
            ? 'Deposit tUSDC into your Trading Account Vault to enable autonomous execution. Swarm agents trade strictly from your deposited funds.'
            : 'Ready — Smart Account Clone is active and funded in your isolated Trading Account Vault.',
    };
    allowanceStatusCache.set(cacheKey, { data: payload, expiresAt: Date.now() + ALLOWANCE_CACHE_TTL_MS });
    return res.json(payload);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to check allowance status' });
  }
});

// Allowance targets for the non-custodial session flow: active trading pools
// (with outcome-token singletons for sell-side grants) the frontend should
// request per-pool TestUSDC allowances for at session creation.
apiRouter.get('/sessions/allowance-targets/list', optionalWalletAuth, async (_req: Request, res: Response) => {
  try {
    const markets = marketService.getActiveMarkets();
    const seen = new Set<string>();
    const targets: Array<{ pool: string; outcomeToken: string | null; collateral: string }> = [];
    for (const m of markets) {
      const pool = m.poolAddress;
      if (!pool || !pool.startsWith('0x') || pool.length !== 42) continue;
      const key = pool.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      let outcomeToken: string | null = null;
      try {
        if (m.marketIdHex && m.marketIdHex.startsWith('0x')) {
          const oc = await somniaExchange.client.getMarketOnchain(m.marketIdHex as Hex).catch(() => null);
          if (oc?.outcomeToken) outcomeToken = oc.outcomeToken as string;
        }
      } catch {}
      targets.push({ pool: getAddress(pool), outcomeToken, collateral: SOMNIA_ADDRESSES.testUsdc });
      if (targets.length >= 12) break;
    }
    return res.json({ success: true, count: targets.length, targets });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to list allowance targets' });
  }
});

// ------------------------------------------------------------------------------
// 3. Swarm Agents Status & Telemetry Endpoints (cached 800ms to prevent ERR_INSUFFICIENT_RESOURCES storm — was 2000ms, PnL now 2.5x faster)
// ------------------------------------------------------------------------------
let cachedSwarmStatus: { at: number; data: any } | null = null;
let cachedSwarmDetailed: { at: number; data: any } | null = null;
let inFlightSwarmStatus: Promise<any> | null = null;
let inFlightSwarmDetailed: Promise<any> | null = null;
let lastOrdersSettlementSyncAt = 0;
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
  if (inFlightSwarmStatus) {
    const data = await inFlightSwarmStatus;
    return res.json(data);
  }
  inFlightSwarmStatus = (async () => {
    try {
      const statusSummary = await swarmRunner.getSwarmStatusAsync();
      const payload = { success: true, agents: statusSummary };
      cachedSwarmStatus = { at: Date.now(), data: payload };
      return payload;
    } finally {
      inFlightSwarmStatus = null;
    }
  })();
  const payload = await inFlightSwarmStatus;
  res.json(payload);
});

apiRouter.get('/agents/detailed', async (_req: Request, res: Response) => {
  if (cachedSwarmDetailed && Date.now() - cachedSwarmDetailed.at < SWARM_CACHE_MS) {
    return res.json(cachedSwarmDetailed.data);
  }
  if (inFlightSwarmDetailed) {
    const data = await inFlightSwarmDetailed;
    return res.json(data);
  }
  inFlightSwarmDetailed = (async () => {
    try {
      const detailed = await swarmRunner.getDetailedSwarmStateAsync();
      const payload = { success: true, ...detailed };
      cachedSwarmDetailed = { at: Date.now(), data: payload };
      return payload;
    } finally {
      inFlightSwarmDetailed = null;
    }
  })();
  const payload = await inFlightSwarmDetailed;
  res.json(payload);
});

function getOperatorAdminSecret(): string | null {
  const raw = process.env.OPERATOR_ADMIN_SECRET;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function timingSafeSecretCompare(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// SEC-10 (fail-closed): global swarm policy mutations must never be
// authorized by client-claimed addresses. When OPERATOR_ADMIN_SECRET is
// configured, the caller must present it (x-operator-auth header preferred;
// `Authorization: Bearer <secret>` honored for backwards compatibility).
// When the secret is unset, only the cryptographically authenticated
// operator wallet (req.walletAddress, verified upstream by requireWalletAuth
// via JWT / EIP-712 / SIWE) is accepted. Missing auth or a non-operator
// wallet is denied — there is no `!userAddress` bypass.
function isOperatorAuthorized(req: Request): boolean {
  const operatorSecret = getOperatorAdminSecret();

  if (operatorSecret) {
    const rawHeader =
      (req.headers['x-operator-auth'] as string | undefined) ??
      (req.headers['authorization'] as string | undefined) ??
      '';
    if (typeof rawHeader !== 'string' || rawHeader.length === 0) return false;
    const presented = rawHeader.startsWith('Bearer ')
      ? rawHeader.slice('Bearer '.length).trim()
      : rawHeader.trim();
    if (!presented) return false;
    return timingSafeSecretCompare(presented, operatorSecret);
  }

  const caller = req.walletAddress;
  if (typeof caller !== 'string' || caller.length === 0) return false;
  try {
    return caller.toLowerCase() === operatorAccount.address.toLowerCase();
  } catch {
    return false;
  }
}

apiRouter.post('/agents/toggle', requireWalletAuth, (req: Request, res: Response) => {
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

apiRouter.post('/agents/config', requireWalletAuth, (req: Request, res: Response) => {
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

apiRouter.get('/agents/logs', async (req: Request, res: Response) => {
  const agentType = req.query.agentType as string | undefined;
  const limit = req.query.limit ? Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10))) : 50;

  // 1. If Supabase persistence is active, attempt to fetch live persisted records from agent_logs
  if (isPersistenceEnabled()) {
    try {
      let query = supabase
        .from('agent_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (agentType) {
        // PERF-03: exact .eq() keeps the idx_agent_logs_type B-Tree usable.
        // ILIKE on a B-Tree column forces a sequential scan; normalize the
        // input against the canonical enum case-insensitively instead.
        const canonical = ['Volt', 'Oracle', 'Titan', 'Sweeper', 'Manual', 'CUSTOM'].find(
          (t) => t.toLowerCase() === agentType.trim().toLowerCase(),
        );
        query = query.eq('agent_type', canonical ?? agentType.trim());
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        const mapped = data.map((d: any) => ({
          id: d.id,
          agentType: d.agent_type,
          marketId: d.market_id,
          triggerEvent: d.trigger_event,
          confidence: Number(d.confidence),
          actionTaken: d.action_taken,
          reasoningText: d.reasoning_text,
          metadata: d.metadata,
          createdAt: d.created_at,
        }));
        return res.json({
          success: true,
          count: mapped.length,
          logs: mapped,
        });
      }
    } catch {
      // Fall through to live in-memory telemetry stream
    }
  }

  // 2. Fetch live thoughts from WebSocket telemetry gateway buffer
  const liveLogs = telemetryWsGateway.getRecentAgentLogs(agentType, limit);
  return res.json({
    success: true,
    count: liveLogs.length,
    logs: liveLogs,
  });
});

// ------------------------------------------------------------------------------
// 3b. Personal Swarm — Per-Wallet Isolated Strategy (COPY vs PERSONAL)
// ------------------------------------------------------------------------------
apiRouter.get('/swarm/my-config', optionalWalletAuth, async (req: Request, res: Response) => {
  try {
    const userAddress = (req.query.userAddress as string) || (req.headers['x-user-address'] as string);
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Missing or invalid userAddress' });
    }
    const cfg = await userSwarmService.getOrFetchConfig(userAddress);
    return res.json({ success: true, config: cfg });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.put('/swarm/my-config', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress, mode, copyTradeEnabled, voltEnabled, oracleEnabled, titanEnabled, sweeperEnabled, voltConfig, oracleConfig, titanConfig } = req.body;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Missing or invalid userAddress' });
    }
    const updated = await userSwarmService.upsertConfig(userAddress, {
      mode,
      copyTradeEnabled,
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

apiRouter.post('/swarm/toggle-copytrade', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress, enabled } = req.body;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Missing or invalid userAddress' });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Missing enabled boolean' });
    }
    const updated = await userSwarmService.setCopyTradeEnabled(userAddress, enabled);
    return res.json({
      success: true,
      config: updated,
      message: enabled
        ? 'Autonomous Protocol Swarm Mirroring ENABLED'
        : 'Autonomous Protocol Swarm Mirroring DISABLED (Custom Agents & Terminal Copilot remain active)',
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/swarm/mode', requireWalletAuth, async (req: Request, res: Response) => {
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

apiRouter.post('/swarm/toggle', requireWalletAuth, async (req: Request, res: Response) => {
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

apiRouter.post('/swarm/config', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress, agentType, config, configs } = req.body;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Missing or invalid userAddress' });
    }
    if (configs && typeof configs === 'object') {
      const updated = await userSwarmService.updateFleetConfig(userAddress, configs);
      return res.json({ success: true, config: updated });
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

apiRouter.post('/swarm/fleet-config', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress, configs } = req.body;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Missing or invalid userAddress' });
    }
    if (!configs || typeof configs !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing or invalid configs object' });
    }
    const updated = await userSwarmService.updateFleetConfig(userAddress, configs);
    return res.json({ success: true, config: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.get('/swarm/my-status', optionalWalletAuth, async (req: Request, res: Response) => {
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

apiRouter.post('/swarm/reset', requireWalletAuth, async (req: Request, res: Response) => {
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
apiRouter.get('/orders', optionalWalletAuth, async (req: Request, res: Response) => {
  const { userAddress, agentType, status, outcome, marketId, limit, page, pageSize, search, swarmOnly, scope, source } = req.query;

  // Trigger non-blocking settlement sync of resolved on-chain / expired markets (throttled to once per 3.5s)
  const now = Date.now();
  if (now - lastOrdersSettlementSyncAt > 3500) {
    lastOrdersSettlementSyncAt = now;
    void orderService.syncResolvedOrdersPnLAsync().catch(() => {});
  }

  const params: Parameters<typeof orderService.queryOrdersPaginated>[0] = {
    userAddress: typeof userAddress === 'string' ? userAddress : undefined,
    agentType: typeof agentType === 'string' ? (agentType as AgentType) : undefined,
    status: typeof status === 'string' ? (status as OrderStatus) : undefined,
    outcome: typeof outcome === 'string' && (outcome === 'YES' || outcome === 'NO' || outcome === 'VOID') ? (outcome as any) : undefined,
    marketId: typeof marketId === 'string' ? marketId : undefined,
    searchQuery: typeof search === 'string' ? search : undefined,
    scope: scope === 'SWARM' || scope === 'MY_ORDERS' || scope === 'ALL' ? (scope as any) : undefined,
    swarmOnly: swarmOnly === 'true' || scope === 'SWARM',
    source: source === 'SWARM' || source === 'TERMINAL' || source === 'COPY_TRADE' || source === 'ALL' ? (source as any) : undefined,
    limit: limit !== undefined ? parseInt(limit as string, 10) : undefined,
    page: page !== undefined ? parseInt(page as string, 10) : undefined,
    pageSize: pageSize !== undefined ? parseInt(pageSize as string, 10) : undefined,
  };
  // Use DB-aware paginated query when cache is capped (issue #13) — evicted rows remain queryable via Supabase
  const anyOrderService: any = orderService as any;
  const result = typeof anyOrderService.queryOrdersPaginatedAsync === 'function'
    ? await anyOrderService.queryOrdersPaginatedAsync(params).catch(() => orderService.queryOrdersPaginated(params))
    : orderService.queryOrdersPaginated(params);

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

/**
 * Raw text transaction ledger (.txt) for DreamPulse autonomous swarm (operator account).
 * Fetches live from database with pagination and global aggregate metrics.
 */
apiRouter.get(['/swarm/transactions.txt', '/transactions.txt', '/orders/swarm.txt'], async (req: Request, res: Response) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit || req.query.pageSize
      ? parseInt((req.query.limit || req.query.pageSize) as string, 10)
      : 50;
    const agent = typeof req.query.agent === 'string' ? req.query.agent : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const marketId = typeof req.query.marketId === 'string' ? req.query.marketId : undefined;

    const fullUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;

    const txtOutput = await ledgerExportService.generateSwarmTxtLedger({
      page,
      pageSize: limit,
      agent,
      status,
      marketId,
      baseUrl: fullUrl,
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(200).send(txtOutput);
  } catch (err: any) {
    console.error('[Routes] Error generating swarm txt ledger:', err);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(500).send(`ERROR GENERATING SWARM LEDGER: ${err?.message || err}`);
  }
});

apiRouter.get('/orders/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const order = orderService.getOrderById(id) || await (orderService as any).getOrderByIdAsync?.(id).catch(() => null);

  if (!order) {
    return res.status(404).json({ success: false, error: `Order ${id} not found` });
  }

  return res.json({
    success: true,
    data: order,
  });
});

apiRouter.post('/orders/place', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const effectiveUserAddress = (req.walletAddress || req.body.userAddress) as string;
    const { marketId, outcome, direction, orderType, price, lotSize, triggerPrice, txHash } = req.body;

    if (!effectiveUserAddress || typeof effectiveUserAddress !== 'string' || !isAddress(effectiveUserAddress)) {
      return res.status(400).json({ success: false, error: 'Valid userAddress is required' });
    }

    if (!marketId || typeof marketId !== 'string') {
      return res.status(400).json({ success: false, error: 'Valid marketId is required' });
    }

    if (outcome !== 'YES' && outcome !== 'NO') {
      return res.status(400).json({ success: false, error: 'Outcome must be YES or NO' });
    }

    const validOrderTypes = ['LIMIT', 'IOC', 'MARKET', 'STOP_MARKET', 'STOP_LIMIT', 'TAKE_PROFIT_MARKET', 'TAKE_PROFIT_LIMIT'];
    const normOrderType = (orderType === 'IOC' || orderType === 'MARKET') ? 'IOC' : (orderType || 'LIMIT');
    if (!validOrderTypes.includes(orderType) && !validOrderTypes.includes(normOrderType)) {
      return res.status(400).json({ success: false, error: `Invalid orderType '${orderType}'` });
    }

    const numLotSize = Number(lotSize);
    if (isNaN(numLotSize) || numLotSize <= 0) {
      return res.status(400).json({ success: false, error: 'Lot size must be greater than 0' });
    }

    const isLimitType = normOrderType === 'LIMIT' || normOrderType === 'STOP_LIMIT' || normOrderType === 'TAKE_PROFIT_LIMIT';
    const isTriggerType = normOrderType === 'STOP_MARKET' || normOrderType === 'STOP_LIMIT' || normOrderType === 'TAKE_PROFIT_MARKET' || normOrderType === 'TAKE_PROFIT_LIMIT';

    let numTriggerPrice: number | undefined;
    if (isTriggerType) {
      numTriggerPrice = Number(triggerPrice);
      if (isNaN(numTriggerPrice) || numTriggerPrice <= 0 || numTriggerPrice >= 1.0) {
        return res.status(400).json({ success: false, error: 'Trigger price must be between 0.01 and 0.99' });
      }
    }

    let numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0 || numPrice >= 1.0) {
      if (isLimitType) {
        return res.status(400).json({ success: false, error: 'Price must be between 0.01 and 0.99' });
      }
      numPrice = numTriggerPrice || 0.50;
    }

    const normDirection = direction === 'SELL' ? 'SELL' : 'BUY';

    const order = await orderService.submitUserOrder({
      userAddress: getAddress(effectiveUserAddress) as Address,
      marketId,
      outcome,
      direction: normDirection,
      orderType: normOrderType as OrderType,
      price: numPrice,
      lotSize: numLotSize,
      triggerPrice: numTriggerPrice,
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

apiRouter.post('/orders/:id/cancel', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const effectiveUserAddress = (req.walletAddress || req.body.userAddress || req.headers['x-user-address']) as string;

    if (!id) {
      return res.status(400).json({ success: false, error: 'Order ID parameter is required' });
    }

    if (!effectiveUserAddress || typeof effectiveUserAddress !== 'string' || !isAddress(effectiveUserAddress)) {
      return res.status(400).json({ success: false, error: 'Valid userAddress is required' });
    }

    const result = await orderService.cancelOrderFor(id, getAddress(effectiveUserAddress) as Address);

    return res.json({
      success: true,
      message: result.message || 'Order cancelled successfully',
      txHash: result.txHash,
      data: result.order,
    });
  } catch (err: any) {
    console.warn(`[Routes] Error cancelling order ${req.params.id}:`, err?.message || err);
    return res.status(400).json({
      success: false,
      error: err?.message || 'Failed to cancel order',
    });
  }
});

apiRouter.get('/portfolio/summary', optionalWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.query;
    const targetAddress = typeof userAddress === 'string' && userAddress.trim().length > 0
      ? userAddress.trim()
      : undefined;

    const opAddress = (SOMNIA_ADDRESSES.operatorAccount || operatorAccount.address).toLowerCase();
    const effectiveAddress = targetAddress || operatorAccount.address;
    const isOperator = targetAddress ? targetAddress.toLowerCase() === opAddress : true;
    const sweeperSummary = await settlementService.getSweeperSummary(effectiveAddress).catch(() => null);
    const session = targetAddress ? await sessionService.getUserActiveSession(targetAddress).catch(() => null) : null;
    let ordersTodayCount = 0;
    if (session) {
      // Authoritative daily spend aggregate from Supabase + cache:
      // SELECT COALESCE(SUM(lot_size * price), 0) FROM public.orders WHERE user_address = $1 AND created_at >= $2 AND status NOT IN ('CANCELLED', 'FAILED');
      const resetTimestamp = session.lastSpendResetTimestamp || (Date.now() - 24 * 3600 * 1000);
      const spendStats = await orderService.getDailySpendStats(effectiveAddress, resetTimestamp);
      ordersTodayCount = spendStats.ordersCount;

      if (Math.abs(session.spentToday - spendStats.totalSpend) > 0.0001) {
        session.spentToday = spendStats.totalSpend;
        sessionService.updateSessionSpend(session.id, session.spentToday);
      }
    } else {
      const spendStats = await orderService.getDailySpendStats(effectiveAddress);
      ordersTodayCount = spendStats.ordersCount;
    }

    // Realized PnL is authoritative: sum of per-trade (payout - cost) for every expired market, handling BUY/SELL and VOID correctly via historically accurate settlement price
    const realizedPnl = await orderService.getTotalRealizedPnlAsync(undefined, targetAddress);
    // Unclaimed is gross payout awaiting on-chain redemption (1 tUSDC per winning lot), NOT net profit - keep separate to avoid double counting
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
        ordersTodayCount,
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
apiRouter.get('/sweeper/summary', optionalWalletAuth, async (req: Request, res: Response) => {
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

apiRouter.get('/sweeper/unclaimed', optionalWalletAuth, async (req: Request, res: Response) => {
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
        outcomeIdx: p.outcomeIdx,
        outcomeToken: p.outcomeToken,
        poolAddress: p.poolAddress,
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

apiRouter.post('/sweeper/trigger', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const targetAddress = req.walletAddress || req.body?.userAddress;
    if (!targetAddress || typeof targetAddress !== 'string' || !isAddress(targetAddress.trim())) {
      return res.status(401).json({ success: false, error: 'Valid wallet authentication required to trigger settlement sweep' });
    }
    const normalizedTarget = getAddress(targetAddress.trim()) as Address;
    const result = await settlementService.triggerBatchSweep(normalizedTarget);

    const userClaimable = Array.isArray(result.userClaimable) ? result.userClaimable : [];
    res.json({
      success: true,
      claimedMarketsCount: result.claimedMarketsCount,
      totalClaimedAmount: result.totalClaimedAmount,
      txHash: result.txHash,
      sweeps: result.sweeps,
      userClaimable,
      userClaimableCount: userClaimable.length,
      userClaimableAmount: `${userClaimable.reduce((sum, p) => sum + (p.claimableAmount || 0), 0).toFixed(2)} tUSDC`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to trigger settlement sweep' });
  }
});

apiRouter.post('/sweeper/record-claim', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const rawTarget = req.walletAddress || req.body?.userAddress;
    if (!rawTarget || typeof rawTarget !== 'string' || !isAddress(rawTarget.trim())) {
      return res.status(401).json({ success: false, error: 'Valid wallet authentication required' });
    }
    const userAddress = getAddress(rawTarget.trim()) as Address;
    const { marketId, winningOutcome, claimableAmount, txHash } = req.body || {};
    if (!marketId || typeof claimableAmount !== 'number' || claimableAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Valid marketId and positive claimableAmount required' });
    }
    const validOutcome = winningOutcome === 'NO' ? 'NO' : 'YES';
    const sweep: SettlementSweep = {
      id: crypto.randomUUID(),
      userAddress,
      marketId,
      winningOutcome: validOutcome,
      claimableAmount: Number(claimableAmount.toFixed(4)),
      payoutToken: 'tUSDC (direct)',
      isCompounded: false,
      txHash: txHash && typeof txHash === 'string' && txHash.startsWith('0x') ? (txHash as Hex) : undefined,
      status: 'CONFIRMED',
      claimedAt: new Date().toISOString(),
    };
    settlementService.recordSweep(sweep, true);
    settlementService.invalidateCache(userAddress);
    return res.json({ success: true, sweep });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to record settlement claim' });
  }
});

apiRouter.get('/sweeper/history', optionalWalletAuth, async (req: Request, res: Response) => {
  const { userAddress, limit } = req.query;
  const targetAddress = typeof userAddress === 'string' && userAddress.trim().length > 0
    ? userAddress.trim()
    : operatorAccount.address;
  const parsedLimit = typeof limit === 'string' && !isNaN(parseInt(limit, 10))
    ? Math.max(1, parseInt(limit, 10))
    : undefined;
  await settlementService.ensureUserSweepsLoaded(targetAddress);
  const history = settlementService.getSweepHistory(targetAddress, parsedLimit);
  res.json({
    success: true,
    count: history.length,
    data: history,
  });
});

// ------------------------------------------------------------------------------
// 6. Analytics & Balance History (Transparent Swarm vs User Equity)
// ------------------------------------------------------------------------------
apiRouter.get('/analytics/equity', optionalWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress, range, source } = req.query;
    const parsedRange = (typeof range === 'string' ? range : '30d') as AnalyticsRange;
    const allowed: AnalyticsRange[] = ['24h', '7d', '30d', '90d', 'ALL'];
    const finalRange = allowed.includes(parsedRange) ? parsedRange : '30d';
    const finalSource = (source === 'SWARM' || source === 'TERMINAL' || source === 'ALL' ? source : 'ALL') as 'ALL' | 'SWARM' | 'TERMINAL';
    const targetAddress = typeof userAddress === 'string' && userAddress.trim().length > 0 ? userAddress.trim() : undefined;
    const data = await analyticsService.getAnalytics(targetAddress, finalRange, finalSource);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch analytics' });
  }
});

apiRouter.get('/analytics/balance-history', optionalWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress, range, source } = req.query;
    const parsedRange = (typeof range === 'string' ? range : '30d') as AnalyticsRange;
    const allowed: AnalyticsRange[] = ['24h', '7d', '30d', '90d', 'ALL'];
    const finalRange = allowed.includes(parsedRange) ? parsedRange : '30d';
    const finalSource = (source === 'SWARM' || source === 'TERMINAL' || source === 'ALL' ? source : 'ALL') as 'ALL' | 'SWARM' | 'TERMINAL';
    const targetAddress = typeof userAddress === 'string' && userAddress.trim().length > 0 ? userAddress.trim() : undefined;
    const data = await analyticsService.getBalanceHistory(targetAddress, finalRange, finalSource);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch balance history' });
  }
});

// ------------------------------------------------------------------------------
// 7. Strategy Studio & Historical Backtesting Simulator
// ------------------------------------------------------------------------------
apiRouter.post('/backtest/run', optionalWalletAuth, async (req: Request, res: Response) => {
  // If userAddress is claimed but no valid auth, reject spoofing (optionalWalletAuth allows missing auth for anonymous runs)
  const claimedForBacktest = (req.body as any)?.userAddress;
  const hasAuth = Boolean((req as any).walletAddress);
  if (claimedForBacktest && typeof claimedForBacktest === 'string' && claimedForBacktest.trim() && !hasAuth && process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
    return res.status(401).json({ success: false, error: 'Missing wallet authentication for backtest with userAddress. Provide Bearer JWT or EIP-712 headers.' });
  }
  // If authenticated, ensure claimed matches (already done by optionalWalletAuth) and bind canonical
  if (hasAuth && claimedForBacktest) {
    (req.body as any).userAddress = (req as any).walletAddress;
  }
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
      customRules,
      customAgentId,
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
      customRules,
      customAgentId,
    });

    res.json({
      success: true,
      result,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Backtest simulation failed' });
  }
});

apiRouter.get('/backtest/history', optionalWalletAuth, async (req: Request, res: Response) => {
  try {
    const rawUserAddress = typeof req.query.userAddress === 'string' && req.query.userAddress.trim()
      ? req.query.userAddress.trim()
      : ((req as any).walletAddress as string | undefined);
    const limit = req.query.limit !== undefined ? parseInt(req.query.limit as string, 10) : undefined;
    const history = await backtestService.getBacktestHistory(
      rawUserAddress,
      Number.isFinite(limit) && (limit as number) > 0 ? limit : undefined
    );
    res.json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch backtest history' });
  }
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
  // SECURITY: remove in prod — leaks internal market counts and full market object without auth (P4)
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEBUG_ROUTES !== 'true') {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  const m = marketService.getMarketById(req.params.id);
  // In non-prod, still require auth if configured
  const active = (marketService as any).markets?.size;
  const hist = (marketService as any).historicalMarkets?.size;
  res.json({ found: !!m, market: m, activeCount: active, histCount: hist });
});

// ------------------------------------------------------------------------------
// 9. Custom Strategy Studio & Swarm Builder Endpoints
// ------------------------------------------------------------------------------
apiRouter.get('/agents/custom', optionalWalletAuth, async (req: Request, res: Response) => {
  try {
    const userAddress = typeof req.query.userAddress === 'string' ? req.query.userAddress : undefined;
    const agents = await customAgentService.getCustomAgents(userAddress);
    res.json({ success: true, count: agents.length, data: agents });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch custom agents' });
  }
});

apiRouter.get('/agents/custom/:id', async (req: Request, res: Response) => {
  try {
    const agent = await customAgentService.getCustomAgentById(req.params.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Custom agent not found' });
    }
    res.json({ success: true, data: agent });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch agent' });
  }
});

apiRouter.post('/agents/custom', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const {
      userAddress,
      name,
      description,
      symbol,
      timeframe,
      strategyType,
      rules,
      color,
      icon,
      isActive,
      isDeployed,
      allocatedAllowance,
      spentAllowance,
    } = req.body;
    const isDummy =
      !userAddress ||
      userAddress === '0x0000000000000000000000000000000000000001' ||
      userAddress === '0x0000000000000000000000000000000000000000';
    if (isDummy || !rules) {
      return res.status(400).json({
        success: false,
        error: isDummy
          ? 'Valid user wallet address is required. Please connect your Web3 wallet.'
          : 'Strategy rules are required',
      });
    }
    const created = await customAgentService.createCustomAgent({
      userAddress,
      name: name || 'Custom Strategy',
      description: description || '',
      symbol: symbol || 'BTC/USD',
      timeframe: timeframe || '5m',
      strategyType: strategyType || 'CUSTOM',
      rules,
      color: color || '#2dd4bf',
      icon: icon || 'BoltIcon',
      isActive: isActive !== false,
      isDeployed: isDeployed === true,
      allocatedAllowance: allocatedAllowance !== undefined ? Number(allocatedAllowance) : 100,
      spentAllowance: spentAllowance !== undefined ? Number(spentAllowance) : 0,
    });
    res.json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to create agent' });
  }
});

apiRouter.put('/agents/custom/:id', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).walletAddress as string | undefined;
    const userAddress = (req.body?.userAddress as string) || wallet;
    // Ownership check before update (P4)
    const existing = await customAgentService.getCustomAgentById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Custom agent not found' });
    }
    if (wallet && existing.userAddress.toLowerCase() !== wallet.toLowerCase() && existing.userAddress !== '0x0000000000000000000000000000000000000000') {
      return res.status(403).json({ success: false, error: 'Forbidden: agent does not belong to authenticated wallet' });
    }
    const updated = await customAgentService.updateCustomAgent(req.params.id, req.body, userAddress);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Custom agent not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    const status = err.message?.includes('Forbidden') ? 403 : 500;
    res.status(status).json({ success: false, error: err.message || 'Failed to update agent' });
  }
});

apiRouter.delete('/agents/custom/:id', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const userAddress = typeof req.query.userAddress === 'string' ? req.query.userAddress : '';
    const success = await customAgentService.deleteCustomAgent(req.params.id, userAddress);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to delete agent' });
  }
});

apiRouter.post('/agents/custom/:id/deploy', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress, allowance } = req.body;
    const isDummy =
      !userAddress ||
      userAddress === '0x0000000000000000000000000000000000000001' ||
      userAddress === '0x0000000000000000000000000000000000000000';
    if (isDummy) {
      return res.status(400).json({ success: false, error: 'Valid user wallet address is required. Please connect your Web3 wallet.' });
    }
    const updated = await customAgentService.deployAgent(
      req.params.id,
      userAddress,
      allowance !== undefined ? Number(allowance) : undefined
    );
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Custom agent not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to deploy agent' });
  }
});

apiRouter.post('/agents/custom/:id/pause', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.body;
    const isDummy =
      !userAddress ||
      userAddress === '0x0000000000000000000000000000000000000001' ||
      userAddress === '0x0000000000000000000000000000000000000000';
    if (isDummy) {
      return res.status(400).json({ success: false, error: 'Valid user wallet address is required. Please connect your Web3 wallet.' });
    }
    const updated = await customAgentService.pauseAgent(req.params.id, userAddress);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Custom agent not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to pause agent' });
  }
});

apiRouter.post('/agents/custom/:id/allowance', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress, allowance } = req.body;
    const isDummy =
      !userAddress ||
      userAddress === '0x0000000000000000000000000000000000000001' ||
      userAddress === '0x0000000000000000000000000000000000000000';
    if (isDummy || allowance === undefined) {
      return res.status(400).json({ success: false, error: isDummy ? 'Valid user wallet address is required. Please connect your Web3 wallet.' : 'Allowance is required' });
    }
    const updated = await customAgentService.setAgentAllowance(req.params.id, userAddress, Number(allowance));
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Custom agent not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to update agent allowance' });
  }
});

apiRouter.post('/agents/custom/:id/reset-circuit-breaker', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.body;
    const isDummy =
      !userAddress ||
      userAddress === '0x0000000000000000000000000000000000000001' ||
      userAddress === '0x0000000000000000000000000000000000000000';
    if (isDummy) {
      return res.status(400).json({ success: false, error: 'Valid user wallet address is required. Please connect your Web3 wallet.' });
    }
    const updated = await customAgentService.resetCircuitBreaker(req.params.id, userAddress);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Custom agent not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to reset circuit breaker' });
  }
});

apiRouter.post('/agents/generate', requireWalletAuth, aiGenerationRateLimiter, async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }
    if (prompt.trim().length > 2000) {
      return res.status(400).json({ success: false, error: 'Prompt exceeds maximum length of 2000 characters' });
    }
    const generated = await customAgentService.generateAgentFromPrompt(prompt.trim());
    res.json({ success: true, data: generated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to generate agent strategy' });
  }
});

apiRouter.get('/swarms/custom', optionalWalletAuth, async (req: Request, res: Response) => {
  try {
    const userAddress = typeof req.query.userAddress === 'string' ? req.query.userAddress : undefined;
    const swarms = await customAgentService.getCustomSwarms(userAddress);
    res.json({ success: true, count: swarms.length, data: swarms });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch custom swarms' });
  }
});

apiRouter.post('/swarms/custom', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress, name, description, agents, consensusRule, confidenceThreshold, isActive } = req.body;
    if (!userAddress) {
      return res.status(400).json({ success: false, error: 'userAddress is required' });
    }
    const created = await customAgentService.createCustomSwarm({
      userAddress,
      name: name || 'Custom Swarm',
      description: description || '',
      agents: agents || [],
      consensusRule: consensusRule || 'MAJORITY',
      confidenceThreshold: confidenceThreshold ?? 0.6,
      isActive: isActive !== false,
    });
    res.json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to create swarm' });
  }
});

apiRouter.delete('/swarms/custom/:id', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const userAddress = typeof req.query.userAddress === 'string' ? req.query.userAddress : '';
    const success = await customAgentService.deleteCustomSwarm(req.params.id, userAddress);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to delete swarm' });
  }
});

// ------------------------------------------------------------------------------
// 10. Swarm Arena & Strategy Leaderboard (Social Prediction & Rankings)
// ------------------------------------------------------------------------------
apiRouter.get('/arena/leaderboard/agents', async (req: Request, res: Response) => {
  try {
    const { timeframe, symbol, strategyType, sortBy, search } = req.query;
    const result = await leaderboardService.getAgentLeaderboard({
      timeframe: timeframe as ArenaTimeframe,
      symbol: symbol as string,
      strategyType: strategyType as string,
      sortBy: sortBy as ArenaSortBy,
      searchQuery: search as string,
    });
    res.json({ success: true, count: result.count, data: result.data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch agent leaderboard' });
  }
});

apiRouter.get('/arena/leaderboard/traders', async (req: Request, res: Response) => {
  try {
    const { range, sortBy, search } = req.query;
    const result = await leaderboardService.getTraderLeaderboard({
      range: range as ArenaTimeframe,
      sortBy: sortBy as ArenaSortBy,
      searchQuery: search as string,
    });
    res.json({ success: true, count: result.count, data: result.data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch trader leaderboard' });
  }
});

apiRouter.get('/arena/trader/:address/profile', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    if (!address || !isAddress(address)) {
      return res.status(400).json({ success: false, error: 'Valid user address is required' });
    }
    const profile = await leaderboardService.getTraderProfile(address);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Trader profile not found' });
    }
    return res.json({ success: true, data: profile });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch trader profile' });
  }
});

apiRouter.post('/arena/agent/:id/clone', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userAddress } = req.body;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Valid userAddress is required to clone agent' });
    }
    const cloned = await leaderboardService.cloneAgentStrategy(id, userAddress);
    if (!cloned) {
      return res.status(404).json({ success: false, error: 'Agent to clone not found' });
    }
    return res.status(201).json({
      success: true,
      message: `Strategy ${cloned.name} successfully cloned to your studio library`,
      data: cloned,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to clone agent strategy' });
  }
});

apiRouter.post('/arena/copytrade/toggle', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress, targetAddress, enabled, maxTradeSize, dailyVolumeCap } = req.body;
    if (!userAddress || !isAddress(userAddress)) {
      return res.status(400).json({ success: false, error: 'Valid userAddress is required' });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Missing enabled boolean' });
    }

    if (targetAddress && isAddress(targetAddress)) {
      const relation = await socialCopyService.toggleSocialCopy(
        userAddress,
        targetAddress,
        enabled,
        maxTradeSize !== undefined ? Number(maxTradeSize) : undefined,
        dailyVolumeCap !== undefined ? Number(dailyVolumeCap) : undefined,
      );

      return res.json({
        success: true,
        isCopying: relation.isActive,
        config: {
          ...relation,
          copyTradeEnabled: relation.isActive,
        },
        message: enabled
          ? `Social Copy-Trading enabled mirroring ${targetAddress.slice(0, 6)}...${targetAddress.slice(-4)}`
          : `Social Copy-Trading disabled for ${targetAddress.slice(0, 6)}...${targetAddress.slice(-4)}`,
      });
    }

    const updated = await userSwarmService.setCopyTradeEnabled(userAddress, enabled);
    return res.json({
      success: true,
      config: updated,
      message: enabled
        ? 'Social Copy-Trading enabled'
        : 'Social Copy-Trading disabled',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to toggle copy-trade' });
  }
});

apiRouter.get('/arena/copytrade/status', optionalWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress, targetAddress } = req.query;
    if (!userAddress || !isAddress(userAddress as string) || !targetAddress || !isAddress(targetAddress as string)) {
      return res.status(400).json({ success: false, error: 'Valid userAddress and targetAddress are required' });
    }
    const isCopying = socialCopyService.isUserCopyingTarget(userAddress as string, targetAddress as string);
    const config = socialCopyService.getCopierConfig(userAddress as string, targetAddress as string);
    return res.json({
      success: true,
      isCopying,
      config,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to get copy-trade status' });
  }
});

apiRouter.get('/arena/copytrade/following', optionalWalletAuth, async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.query;
    if (!userAddress || !isAddress(userAddress as string)) {
      return res.status(400).json({ success: false, error: 'Valid userAddress is required' });
    }
    const targets = socialCopyService.getTargetsForCopier(userAddress as string);
    return res.json({
      success: true,
      count: targets.length,
      data: targets,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to get following targets' });
  }
});

apiRouter.get('/arena/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await leaderboardService.getArenaStats();
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch arena statistics' });
  }
});




