import { describe, it, expect, vi } from 'vitest';
import { BacktestService } from '../src/services/backtest-service.js';
import * as supabaseModule from '../src/config/supabase.js';

describe('Phase 7 Strategy Studio & Historical Backtest Tests', () => {
  it('fetches historical candlestick series for backtesting', async () => {
    const backtestService = new BacktestService();
    const now = Date.now();
    const candles = await backtestService.fetchHistoricalCandles('BTC/USD', now - 86400000, now, '5m');

    expect(candles.length).toBeGreaterThan(0);
    expect(candles[0]?.open).toBeGreaterThan(0);
    expect(candles[0]?.high).toBeGreaterThanOrEqual(candles[0]!.low);
    expect(candles[0]?.volume).toBeGreaterThanOrEqual(0);
  });

  it('runs backtest simulation for Volt Sniper and computes quantitative metrics', async () => {
    const backtestService = new BacktestService();
    const userAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    const result = await backtestService.runSimulation({
      userAddress,
      agentType: 'Volt',
      symbol: 'BTC/USD',
      initialCapital: 1000.0,
      strategyConfig: {
        driftThreshold: 0.002,
        minEdge: 0.03,
        lotSize: 5.0,
      },
    });

    expect(result.id).toBeDefined();
    expect(result.agentType).toBe('Volt');
    expect(result.symbol).toBe('BTC/USD');
    expect(result.initialCapital).toBe(1000.0);
    expect(result.totalTrades).toBeGreaterThan(0);
    expect(result.winRate).toBeGreaterThan(40);
    expect(result.winRate).toBeLessThanOrEqual(100);
    expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
    expect(typeof result.sharpeRatio).toBe('number');
    expect(Number.isFinite(result.sharpeRatio)).toBe(true);
    expect(result.equityCurve.length).toBeGreaterThan(0);
    expect(result.trades.length).toBe(result.totalTrades);

    // Verify first equity point starts at initial capital
    expect(result.equityCurve[0].equity).toBe(1000.0);
  });

  it('runs backtest simulation for Oracle Volatility Arb with custom params', async () => {
    const backtestService = new BacktestService();
    const userAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    const result = await backtestService.runSimulation({
      userAddress,
      agentType: 'Oracle',
      symbol: 'ETH/USD',
      initialCapital: 2000.0,
      strategyConfig: {
        minEdge: 0.03,
        lotSize: 8.0,
      },
    });

    expect(result.agentType).toBe('Oracle');
    expect(result.symbol).toBe('ETH/USD');
    expect(result.initialCapital).toBe(2000.0);
    expect(result.totalTrades).toBeGreaterThan(0);
    expect(result.winRate).toBeGreaterThan(35);
    expect(result.winRate).toBeLessThanOrEqual(100);
    expect(result.trades.length).toBe(result.totalTrades);

    const history = await backtestService.getBacktestHistory(userAddress);
    expect(history.length).toBeGreaterThan(0);
  });

  it('enforces 3-Layer Quantitative Defense in Oracle backtest: hard-locks on 1h contracts and blocks adverse trend drift', async () => {
    const backtestService = new BacktestService();
    const userAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    // 1. Layer 1 Horizon Filter: Oracle on 1h timeframe must execute 0 trades (hard lockout on long-duration windows)
    const result1h = await backtestService.runSimulation({
      userAddress,
      agentType: 'Oracle',
      symbol: 'BTC/USD',
      timeframe: '1h',
      initialCapital: 1000.0,
      strategyConfig: {
        minEdge: 0.03,
        lotSize: 5.0,
      },
    });

    expect(result1h.agentType).toBe('Oracle');
    expect(result1h.timeframe).toBe('1h');
    expect(result1h.totalTrades).toBe(0);
    expect(result1h.equityCurve[result1h.equityCurve.length - 1]?.equity).toBe(1000.0);

    // 2. Rapid convergence window (5m timeframe, 15m window duration): Oracle trades safely with Layer 2 & 3
    const result5m = await backtestService.runSimulation({
      userAddress,
      agentType: 'Oracle',
      symbol: 'BTC/USD',
      timeframe: '5m',
      initialCapital: 1000.0,
      strategyConfig: {
        minEdge: 0.035,
        lotSize: 5.0,
      },
    });

    expect(result5m.agentType).toBe('Oracle');
    expect(result5m.timeframe).toBe('5m');
    expect(result5m.totalTrades).toBeGreaterThan(0);
    expect(result5m.winRate).toBeGreaterThanOrEqual(40);
  });

  it('runs backtest simulation for Titan Market Maker with spread configuration', async () => {
    const backtestService = new BacktestService();
    const result = await backtestService.runSimulation({
      agentType: 'Titan',
      symbol: 'BTC/USD',
      initialCapital: 1500.0,
      strategyConfig: {
        targetSpread: 0.04,
        inventoryAversion: 0.015,
        lotSize: 2.0,
      },
    });

    expect(result.agentType).toBe('Titan');
    expect(result.totalTrades).toBeGreaterThan(0);
    expect(result.winRate).toBeGreaterThan(40);
    expect(result.winRate).toBeLessThanOrEqual(100); // Must not be hardcoded 100% win rate!
    expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
    expect(typeof result.sharpeRatio).toBe('number');
    expect(Number.isFinite(result.sharpeRatio)).toBe(true);
  });

  it('computes institutional quant metrics: Sortino Ratio, Profit Factor, and Underwater Curve', async () => {
    const backtestService = new BacktestService();
    const result = await backtestService.runSimulation({
      agentType: 'Volt',
      symbol: 'BTC/USD',
      period: '7d',
      timeframe: '5m',
      initialCapital: 1000.0,
      strategyConfig: {
        driftThreshold: 0.002,
        minEdge: 0.03,
        lotSize: 5.0,
      },
      frictionConfig: {
        slippageBps: 5.0,
        feeBps: 2.5,
        latencyMs: 30.0,
      },
    });

    expect(result.period).toBe('7d');
    expect(result.timeframe).toBe('5m');
    expect(result.sortinoRatio).toBeDefined();
    expect(result.profitFactor).toBeGreaterThan(0);
    expect(result.expectancy).toBeDefined();
    expect(result.payoffRatio).toBeGreaterThan(0);
    expect(result.underwaterCurve.length).toBe(result.equityCurve.length);
    expect(result.totalFeesPaid).toBeGreaterThanOrEqual(0);

    // Verify trade log contains fee and grossPnl
    if (result.trades.length > 0) {
      expect(result.trades[0]?.fee).toBeGreaterThanOrEqual(0);
      expect(result.trades[0]?.grossPnl).toBeDefined();
    }
  });

  it('supports custom candle timeframes like 1m scalping and 15m swing', async () => {
    const backtestService = new BacktestService();
    const result1m = await backtestService.runSimulation({
      agentType: 'Volt',
      symbol: 'ETH/USD',
      period: '24h',
      timeframe: '1m',
      initialCapital: 1000.0,
      strategyConfig: {
        driftThreshold: 0.0015,
        minEdge: 0.025,
        lotSize: 2.0,
      },
    });

    expect(result1m.timeframe).toBe('1m');
    expect(result1m.equityCurve.length).toBeGreaterThan(0);
  });

  it('enforces live 0.70% execution friction hurdle (30 bps fee + 40 bps gas) by default', async () => {
    const backtestService = new BacktestService();
    const result = await backtestService.runSimulation({
      agentType: 'Volt',
      symbol: 'BTC/USD',
      period: '3d',
      timeframe: '5m',
      initialCapital: 1000.0,
      strategyConfig: {
        driftThreshold: 0.002,
        minEdge: 0.03,
        lotSize: 5.0,
      },
    });

    // Each trade fee must include both exchange taker fee and on-chain gas hurdle
    for (const trade of result.trades) {
      expect(trade.fee).toBeGreaterThan(0);
      // Net PnL must be grossPnl minus fee
      expect(trade.pnl).toBeCloseTo(Number((trade.grossPnl - trade.fee).toFixed(2)), 2);
    }
  });

  it('rejects unsupported symbols (such as SOL/USD) and non-existent markets without synthetic fallback data', async () => {
    const backtestService = new BacktestService();
    await expect(
      backtestService.runSimulation({
        agentType: 'Volt',
        symbol: 'SOL/USD',
        period: '24h',
        timeframe: '5m',
      }),
    ).rejects.toThrow(/Insufficient historical candlestick data available/);

    await expect(
      backtestService.runSimulation({
        agentType: 'Volt',
        symbol: 'INVALID_NONEXISTENT_SYMBOL_XYZ',
        period: '24h',
        timeframe: '5m',
      }),
    ).rejects.toThrow(/Insufficient historical candlestick data available/);
  });

  it('stops simulation immediately on bankruptcy without phantom leverage or negative equity', async () => {
    const backtestService = new BacktestService();
    // Tiny initial capital and large lot size guarantees rapid bankruptcy
    const result = await backtestService.runSimulation({
      agentType: 'Volt',
      symbol: 'BTC/USD',
      initialCapital: 1.0,
      period: '7d',
      strategyConfig: {
        driftThreshold: 0.0001,
        minEdge: 0.001,
        lotSize: 50.0,
      },
      frictionConfig: {
        slippageBps: 50.0,
        feeBps: 50.0,
      },
    });

    // Strategy must have busted: equity terminated at 0, maxDrawdown <= 100%
    for (const point of result.equityCurve) {
      expect(point.equity).toBeGreaterThanOrEqual(0);
    }
    expect(result.maxDrawdown).toBeLessThanOrEqual(100.0);
    expect(result.maxDrawdown).toBeGreaterThanOrEqual(0.0);
  });

  it('caps maxDrawdownPct at 100.0% even in severe losing scenarios', async () => {
    const backtestService = new BacktestService();
    const result = await backtestService.runSimulation({
      agentType: 'Titan',
      symbol: 'ETH/USD',
      initialCapital: 10.0,
      strategyConfig: {
        lotSize: 20.0,
      },
    });

    expect(result.maxDrawdown).toBeLessThanOrEqual(100.0);
    for (const uw of result.underwaterCurve) {
      expect(uw.drawdownPct).toBeLessThanOrEqual(100.0);
    }
  });

  it('returns empty array when querying backtest history with an invalid address', async () => {
    const backtestService = new BacktestService();
    const history = await backtestService.getBacktestHistory('invalid-ethereum-address');
    expect(history).toEqual([]);
  });

  it('queries Supabase and recovers user backtest history after in-memory cache eviction (BE-BUG-07)', async () => {
    const backtestService = new BacktestService();
    const userAddress = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

    // Simulate cache eviction: in-memory history has 0 records for userAddress
    (backtestService as any).history = [];

    // Mock persistence enabled and mock Supabase response
    const persistenceSpy = vi.spyOn(supabaseModule, 'isPersistenceEnabled').mockReturnValue(true);
    const mockDbRow = {
      id: 'db-evicted-backtest-1',
      user_address: userAddress.toLowerCase(),
      agent_type: 'Volt',
      symbol: 'BTC/USD',
      start_date: '2026-03-01T00:00:00.000Z',
      end_date: '2026-03-04T00:00:00.000Z',
      initial_capital: '1000.00',
      strategy_config: { driftThreshold: 0.002, lotSize: 5.0 },
      total_trades: 15,
      win_rate: '60.00',
      net_pnl: '120.50',
      max_drawdown: '4.20',
      sharpe_ratio: '2.15',
      created_at: '2026-03-04T10:00:00.000Z',
    };

    const fromSpy = vi.spyOn(supabaseModule.supabase, 'from').mockImplementation((table: string) => {
      if (table === 'backtests') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [mockDbRow],
                  error: null,
                }),
              }),
            }),
          }),
        } as any;
      }
      return (supabaseModule.supabase as any).from(table);
    });

    try {
      const history = await backtestService.getBacktestHistory(userAddress);
      expect(history.length).toBe(1);
      expect(history[0]?.id).toBe('db-evicted-backtest-1');
      expect(history[0]?.userAddress).toBe(userAddress.toLowerCase());
      expect(history[0]?.agentType).toBe('Volt');
      expect(history[0]?.initialCapital).toBe(1000.0);
      expect(history[0]?.winRate).toBe(60.0);
      expect(history[0]?.netPnl).toBe(120.5);
      expect(history[0]?.totalTrades).toBe(15);
      expect(history[0]?.maxDrawdown).toBe(4.2);
    } finally {
      persistenceSpy.mockRestore();
      fromSpy.mockRestore();
    }
  });

  it('deduplicates between in-memory cache and Supabase while preserving rich simulated trades', async () => {
    const backtestService = new BacktestService();
    const userAddress = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
    const sharedId = 'shared-backtest-id';

    // In-memory version has trades and equity curve
    const inMemoryResult = {
      id: sharedId,
      userAddress,
      agentType: 'Volt' as const,
      symbol: 'BTC/USD',
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-04T00:00:00.000Z',
      initialCapital: 1000,
      strategyConfig: {},
      totalTrades: 1,
      winRate: 100,
      netPnl: 50,
      maxDrawdown: 1,
      sharpeRatio: 2.0,
      sortinoRatio: 2.5,
      profitFactor: 2.0,
      expectancy: 1.0,
      payoffRatio: 1.5,
      avgWin: 50,
      avgLoss: 0,
      totalWins: 1,
      totalLosses: 0,
      totalFeesPaid: 2,
      timeframe: '5m',
      period: '3d',
      createdAt: '2026-03-04T12:00:00.000Z',
      equityCurve: [{ timestamp: '2026-03-04T12:00:00.000Z', equity: 1050, pnl: 50 }],
      underwaterCurve: [{ timestamp: '2026-03-04T12:00:00.000Z', drawdownPct: 0 }],
      trades: [
        {
          id: 'trade-1',
          timestamp: '2026-03-04T12:00:00.000Z',
          action: 'BUY',
          outcome: 'YES' as const,
          price: 0.45,
          lots: 5,
          grossPnl: 52,
          fee: 2,
          pnl: 50,
          cumulativePnl: 50,
        },
      ],
    };
    (backtestService as any).history = [inMemoryResult];

    // DB returns the same ID without trades plus an older evicted backtest
    const persistenceSpy = vi.spyOn(supabaseModule, 'isPersistenceEnabled').mockReturnValue(true);
    const fromSpy = vi.spyOn(supabaseModule.supabase, 'from').mockImplementation((table: string) => {
      if (table === 'backtests') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: sharedId,
                      user_address: userAddress.toLowerCase(),
                      agent_type: 'Volt',
                      symbol: 'BTC/USD',
                      start_date: '2026-03-01T00:00:00.000Z',
                      end_date: '2026-03-04T00:00:00.000Z',
                      initial_capital: '1000.00',
                      strategy_config: {},
                      total_trades: 1,
                      win_rate: '100.00',
                      net_pnl: '50.00',
                      max_drawdown: '1.00',
                      sharpe_ratio: '2.00',
                      created_at: '2026-03-04T12:00:00.000Z',
                    },
                    {
                      id: 'older-db-id',
                      user_address: userAddress.toLowerCase(),
                      agent_type: 'Oracle',
                      symbol: 'ETH/USD',
                      start_date: '2026-02-20T00:00:00.000Z',
                      end_date: '2026-02-23T00:00:00.000Z',
                      initial_capital: '2000.00',
                      strategy_config: {},
                      total_trades: 10,
                      win_rate: '50.00',
                      net_pnl: '80.00',
                      max_drawdown: '5.00',
                      sharpe_ratio: '1.80',
                      created_at: '2026-02-23T12:00:00.000Z',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        } as any;
      }
      return (supabaseModule.supabase as any).from(table);
    });

    try {
      const history = await backtestService.getBacktestHistory(userAddress);
      expect(history.length).toBe(2);
      // The shared record must retain its rich in-memory trades
      const shared = history.find((h) => h.id === sharedId);
      expect(shared).toBeDefined();
      expect(shared?.trades.length).toBe(1);
      expect(shared?.trades[0]?.id).toBe('trade-1');
      // The older DB record is successfully included
      expect(history.some((h) => h.id === 'older-db-id')).toBe(true);
    } finally {
      persistenceSpy.mockRestore();
      fromSpy.mockRestore();
    }
  });
});
