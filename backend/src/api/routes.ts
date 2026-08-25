import { Router, Request, Response } from 'express';
import { calculateFairValue, calculateEdge } from '../quantitative/pricing.js';

export const apiRouter = Router();

// In-memory mock markets store for foundational testing and development
const MOCK_MARKETS = [
  {
    id: '0x3ecC694Cef705358864a646142ac17A90E29e388-BTC-5m-96500',
    symbol: 'BTC/USD',
    strikePrice: 96500.0,
    windowDuration: '5m',
    status: 'Open',
    bestBidYes: 0.48,
    bestAskYes: 0.51,
    bestBidNo: 0.49,
    bestAskNo: 0.52,
    impliedProbYes: 0.495,
    fairValueYes: 0.582,
    edgePercentage: 0.087,
    openTimestamp: new Date(Date.now() - 150000).toISOString(),
    closeTimestamp: new Date(Date.now() + 150000).toISOString(),
    resolutionTimestamp: new Date(Date.now() + 150000).toISOString(),
  },
  {
    id: '0x3ecC694Cef705358864a646142ac17A90E29e388-ETH-15m-2750',
    symbol: 'ETH/USD',
    strikePrice: 2750.0,
    windowDuration: '15m',
    status: 'Open',
    bestBidYes: 0.52,
    bestAskYes: 0.54,
    bestBidNo: 0.46,
    bestAskNo: 0.48,
    impliedProbYes: 0.53,
    fairValueYes: 0.495,
    edgePercentage: -0.035,
    openTimestamp: new Date(Date.now() - 400000).toISOString(),
    closeTimestamp: new Date(Date.now() + 500000).toISOString(),
    resolutionTimestamp: new Date(Date.now() + 500000).toISOString(),
  },
];

// In-memory sessions store
const SESSIONS_STORE = new Map<string, any>();

// ------------------------------------------------------------------------------
// 1. Markets & Edge Radar Endpoints
// ------------------------------------------------------------------------------
apiRouter.get('/markets', (_req: Request, res: Response) => {
  res.json({
    success: true,
    count: MOCK_MARKETS.length,
    data: MOCK_MARKETS,
  });
});

apiRouter.get('/markets/:id/depth', (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({
    success: true,
    marketId: id,
    depth: {
      yesBids: [
        { price: 0.48, quantity: 250, total: 120.0 },
        { price: 0.46, quantity: 500, total: 230.0 },
        { price: 0.44, quantity: 1200, total: 528.0 },
      ],
      yesAsks: [
        { price: 0.51, quantity: 180, total: 91.8 },
        { price: 0.53, quantity: 400, total: 212.0 },
        { price: 0.55, quantity: 850, total: 467.5 },
      ],
    },
  });
});

// ------------------------------------------------------------------------------
// 2. Session Key Delegation Endpoints
// ------------------------------------------------------------------------------
apiRouter.post('/sessions/register', (req: Request, res: Response) => {
  const { userAddress, operatorAddress, maxTradeSize, dailyVolumeCap, expiresAt, signature } = req.body;

  if (!userAddress || !operatorAddress) {
    return res.status(400).json({ success: false, error: 'Missing required session parameters' });
  }

  const session = {
    id: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userAddress,
    operatorAddress,
    maxTradeSize: Number(maxTradeSize) || 10,
    dailyVolumeCap: Number(dailyVolumeCap) || 100,
    spentToday: 0,
    expiresAt: expiresAt || new Date(Date.now() + 86400000).toISOString(),
    signature,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  SESSIONS_STORE.set(session.id, session);

  res.status(201).json({
    success: true,
    session,
  });
});

apiRouter.post('/sessions/:id/revoke', (req: Request, res: Response) => {
  const { id } = req.params;
  const session = SESSIONS_STORE.get(id);
  if (session) {
    session.isActive = false;
  }
  res.json({
    success: true,
    message: 'Session successfully revoked',
  });
});

// ------------------------------------------------------------------------------
// 3. Swarm Agents Status & Telemetry Endpoints
// ------------------------------------------------------------------------------
apiRouter.get('/agents/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    agents: {
      volt: { status: 'ACTIVE', evalLatencyMs: 42, tradesToday: 18, pnl: '+24.50 STT' },
      oracle: { status: 'ACTIVE', evalLatencyMs: 68, tradesToday: 12, pnl: '+19.80 STT' },
      titan: { status: 'ACTIVE', activeQuotes: 6, spreadCaptured: '+8.20 STT' },
      sweeper: { status: 'ACTIVE', lastSweep: new Date().toISOString(), totalClaimed: '145.00 STT' },
    },
  });
});

apiRouter.get('/agents/logs', (_req: Request, res: Response) => {
  res.json({
    success: true,
    logs: [
      {
        id: 'log-001',
        agentType: 'Volt',
        triggerEvent: 'SPOT_DRIFT',
        confidence: 0.94,
        actionTaken: 'TAKER_SNIPE',
        reasoningText: 'BTC spot drifted +0.32% in 3s. Resting YES ask on 5m contract priced at 0.48 vs fair 0.58. Executed 5-lot IOC taker buy.',
        createdAt: new Date().toISOString(),
      },
    ],
  });
});

// ------------------------------------------------------------------------------
// 4. Sweeper & Backtest Simulation Endpoints
// ------------------------------------------------------------------------------
apiRouter.post('/sweeper/trigger', (req: Request, res: Response) => {
  const { userAddress } = req.body;
  res.json({
    success: true,
    userAddress: userAddress || '0x0000000000000000000000000000000000000000',
    claimedMarketsCount: 2,
    totalClaimedAmount: '40.00 STT',
    txHash: '0x3344556677889900aabbccddeeff00112233445566778899aabbccddeeff0011',
  });
});

apiRouter.post('/backtest/run', (req: Request, res: Response) => {
  const { agentType, symbol, initialCapital } = req.body;
  res.json({
    success: true,
    result: {
      agentType: agentType || 'Volt',
      symbol: symbol || 'BTC/USD',
      initialCapital: initialCapital || 1000.0,
      totalTrades: 64,
      winRate: 76.56,
      netPnl: 348.2,
      maxDrawdown: 4.12,
      sharpeRatio: 2.84,
      createdAt: new Date().toISOString(),
    },
  });
});

// ------------------------------------------------------------------------------
// 5. Health Check Endpoint
// ------------------------------------------------------------------------------
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'DreamPulse Engine',
    timestamp: new Date().toISOString(),
  });
});
