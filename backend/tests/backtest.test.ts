import { describe, it, expect } from 'vitest';
import { BacktestService } from '../src/services/backtest-service.js';

describe('Phase 7 Strategy Studio & Historical Backtest Tests', () => {
  it('runs backtest simulation for Volt Sniper and computes quantitative metrics', () => {
    const backtestService = new BacktestService();
    const userAddress = '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A';

    const result = backtestService.runSimulation({
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
    expect(result.winRate).toBeGreaterThan(50); // Win rate > 50%
    expect(result.netPnl).toBeGreaterThan(0);
    expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
    expect(result.sharpeRatio).toBeGreaterThan(0);
    expect(result.equityCurve.length).toBeGreaterThan(0);
    expect(result.trades.length).toBe(result.totalTrades);

    // Verify first equity point starts at initial capital
    expect(result.equityCurve[0].equity).toBe(1000.0);
  });

  it('runs backtest simulation for Oracle Volatility Arb with custom params', () => {
    const backtestService = new BacktestService();
    const userAddress = '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A';

    const result = backtestService.runSimulation({
      userAddress,
      agentType: 'Oracle',
      symbol: 'ETH/USD',
      initialCapital: 2000.0,
      strategyConfig: {
        minEdge: 0.04,
        lotSize: 8.0,
      },
    });

    expect(result.agentType).toBe('Oracle');
    expect(result.symbol).toBe('ETH/USD');
    expect(result.initialCapital).toBe(2000.0);
    expect(result.totalTrades).toBeGreaterThan(0);
    expect(result.winRate).toBeGreaterThan(50);

    const history = backtestService.getBacktestHistory(userAddress);
    expect(history.length).toBeGreaterThan(0);
  });

  it('runs backtest simulation for Titan Market Maker with spread configuration', () => {
    const backtestService = new BacktestService();
    const result = backtestService.runSimulation({
      agentType: 'Titan',
      symbol: 'BTC/USD',
      initialCapital: 1500.0,
      strategyConfig: {
        targetSpread: 0.05,
        inventoryAversion: 0.02,
        lotSize: 2.0,
      },
    });

    expect(result.agentType).toBe('Titan');
    expect(result.winRate).toBeGreaterThan(60);
    expect(result.netPnl).toBeGreaterThan(0);
  });
});
