import { Router, Request, Response } from 'express';
import { marketService } from '../services/market-service.js';
import { anomalyService } from '../services/anomaly-service.js';
import { sessionService } from '../services/session-service.js';
import { swarmRunner } from '../agents/swarm-runner.js';
import { orderService } from '../services/order-service.js';
import { settlementService } from '../services/settlement-service.js';
import { backtestService } from '../services/backtest-service.js';
import type { MarketStatus, AgentType, OrderStatus } from '../types/index.js';

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

// ------------------------------------------------------------------------------
// 2. Session Key Delegation Endpoints
// ------------------------------------------------------------------------------
apiRouter.post('/sessions/register', async (req: Request, res: Response) => {
  try {
    const { userAddress, operatorAddress, maxTradeSize, dailyVolumeCap, expiresAt, signature, nonce, permissions } = req.body;

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

    if (activeOnly) {
      const activeSession = await sessionService.getUserActiveSession(userAddress);
      return res.json({
        success: true,
        session: activeSession,
      });
    }

    const sessions = sessionService.listUserSessions(userAddress);
    const activeSession = await sessionService.getUserActiveSession(userAddress);

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

// ------------------------------------------------------------------------------
// 3. Swarm Agents Status & Telemetry Endpoints
// ------------------------------------------------------------------------------
apiRouter.get('/agents/status', (_req: Request, res: Response) => {
  const statusSummary = swarmRunner.getSwarmStatus();
  res.json({
    success: true,
    agents: statusSummary,
  });
});

apiRouter.get('/agents/detailed', (_req: Request, res: Response) => {
  const detailed = swarmRunner.getDetailedSwarmState();
  res.json({
    success: true,
    ...detailed,
  });
});

apiRouter.post('/agents/toggle', (req: Request, res: Response) => {
  try {
    const { agentType, enabled } = req.body;
    if (!agentType || typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Missing agentType or enabled boolean' });
    }

    const updated = swarmRunner.toggleAgent(agentType as AgentType, enabled);
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
    const { agentType, config } = req.body;
    if (!agentType || !config || typeof config !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing agentType or config payload' });
    }

    const updated = swarmRunner.updateAgentConfig(agentType as AgentType, config);
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
  const { userAddress, agentType, status, marketId, limit } = req.query;

  const orders = orderService.getOrders({
    userAddress: typeof userAddress === 'string' ? userAddress : undefined,
    agentType: typeof agentType === 'string' ? (agentType as AgentType) : undefined,
    status: typeof status === 'string' ? (status as OrderStatus) : undefined,
    marketId: typeof marketId === 'string' ? marketId : undefined,
    limit: limit ? parseInt(limit as string, 10) : 50,
  });

  res.json({
    success: true,
    count: orders.length,
    data: orders,
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

// ------------------------------------------------------------------------------
// 5. Sweeper Settlement & Payout Redemptions
// ------------------------------------------------------------------------------
apiRouter.get('/sweeper/summary', async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.query;
    const summary = await settlementService.getSweeperSummary(
      typeof userAddress === 'string' ? userAddress : undefined,
    );
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
    const unclaimed = await settlementService.scanUnclaimedSettlements(
      typeof userAddress === 'string' ? userAddress : undefined,
    );
    const totalUnclaimed = Number(
      unclaimed.reduce((acc, p) => acc + p.claimableAmount, 0).toFixed(4),
    );
    return res.json({
      success: true,
      count: unclaimed.length,
      totalUnclaimedAmount: `${totalUnclaimed.toFixed(2)} STT`,
      unclaimedAmountNum: totalUnclaimed,
      positions: unclaimed,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to scan unclaimed settlements' });
  }
});

apiRouter.post('/sweeper/trigger', async (req: Request, res: Response) => {
  try {
    const { userAddress, autoCompound } = req.body;
    const result = await settlementService.triggerBatchSweep(
      userAddress || '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A',
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
  const history = settlementService.getSweepHistory(typeof userAddress === 'string' ? userAddress : undefined);
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
    const { userAddress, agentType, symbol, startDate, endDate, initialCapital, strategyConfig } = req.body;

    const result = await backtestService.runSimulation({
      userAddress,
      agentType: agentType || 'Volt',
      symbol: symbol || 'BTC/USD',
      startDate,
      endDate,
      initialCapital: initialCapital ? parseFloat(initialCapital) : 1000.0,
      strategyConfig: strategyConfig || {},
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


