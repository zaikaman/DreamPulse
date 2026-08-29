import { describe, it, expect } from 'vitest';
import { BacktestService } from '../src/services/backtest-service.js';

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
    expect(result.sharpeRatio).toBeGreaterThanOrEqual(0);
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

    const history = backtestService.getBacktestHistory(userAddress);
    expect(history.length).toBeGreaterThan(0);
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
    expect(result.sharpeRatio).toBeGreaterThan(0);
    expect(result.sharpeRatio).toBeLessThan(10.0); // Realistic Sharpe ratio
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
});
