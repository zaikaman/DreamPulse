import React, { useState } from 'react';
import {
  LineChart,
  Sliders,
  Play,
  ArrowUpRight,
  TrendingUp,
  Cpu,
  CheckCircle2,
  ListOrdered,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { AgentType } from '../types/index.js';
import { useBacktest } from '../hooks/useBacktest.js';

export const StrategyStudio: React.FC = () => {
  const {
    isLoading,
    currentResult,
    runSimulation,
    deployToSwarm,
  } = useBacktest();

  const [selectedAgent, setSelectedAgent] = useState<AgentType>('Volt');
  const [symbol, setSymbol] = useState<string>('BTC/USD');
  const [initialCapital, setInitialCapital] = useState<number>(1000.0);
  const [driftThreshold, setDriftThreshold] = useState<number>(0.002);
  const [minEdge, setMinEdge] = useState<number>(0.03);
  const [targetSpread, setTargetSpread] = useState<number>(0.04);
  const [lotSize, setLotSize] = useState<number>(5.0);
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [deployedSuccess, setDeployedSuccess] = useState<boolean>(false);

  const handleRunSimulation = async () => {
    setDeployedSuccess(false);
    await runSimulation({
      agentType: selectedAgent,
      symbol,
      initialCapital,
      strategyConfig: {
        driftThreshold,
        minEdge,
        targetSpread,
        lotSize,
      },
    });
  };

  const handleDeployToSwarm = async () => {
    if (!currentResult) return;
    setIsDeploying(true);
    const ok = await deployToSwarm(currentResult);
    setIsDeploying(false);
    if (ok) {
      setDeployedSuccess(true);
      setTimeout(() => setDeployedSuccess(false), 4000);
    }
  };

  // SVG Equity curve rendering helpers
  const equityPoints = currentResult?.equityCurve || [];
  const minEquity = equityPoints.length > 0 ? Math.min(...equityPoints.map((p) => p.equity)) * 0.98 : 950;
  const maxEquity = equityPoints.length > 0 ? Math.max(...equityPoints.map((p) => p.equity)) * 1.02 : 1400;
  const rangeY = maxEquity - minEquity || 1;

  const svgWidth = 720;
  const svgHeight = 220;
  const padding = 20;

  const pathPoints = equityPoints.map((p, i) => {
    const x = padding + (i / (equityPoints.length - 1 || 1)) * (svgWidth - padding * 2);
    const y = svgHeight - padding - ((p.equity - minEquity) / rangeY) * (svgHeight - padding * 2);
    return `${x},${y}`;
  });

  const linePath = pathPoints.length > 0 ? `M ${pathPoints.join(' L ')}` : '';
  const areaPath =
    pathPoints.length > 0
      ? `M ${padding},${svgHeight - padding} L ${pathPoints.join(' L ')} L ${svgWidth - padding},${svgHeight - padding} Z`
      : '';

  return (
    <div className="strategy-studio-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '32px' }}>
      {/* 1. Studio Header */}
      <div className="terminal-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(0, 240, 255, 0.15)',
                  border: '1px solid rgba(0, 240, 255, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand-cyan)',
                }}
              >
                <LineChart size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
                  Strategy Studio & Backtest Simulator
                </h2>
                <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                  Replay quantitative event contract models over historical tick intervals on Somnia Shannon
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="btn-glow"
              onClick={handleRunSimulation}
              disabled={isLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                fontSize: '13px',
              }}
            >
              <Play size={14} fill="currentColor" />
              <span>{isLoading ? 'Running Simulation...' : 'Run Backtest Replay'}</span>
            </button>
          </div>
        </div>

        {/* Strategy Selector Tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            marginTop: '20px',
            borderTop: '1px solid var(--border)',
            paddingTop: '16px',
          }}
        >
          <div
            onClick={() => setSelectedAgent('Volt')}
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: selectedAgent === 'Volt' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.02)',
              border: `1px solid ${selectedAgent === 'Volt' ? 'var(--trade-anomaly)' : 'var(--border)'}`,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Zap size={14} style={{ color: 'var(--trade-anomaly)' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Volt Sniper</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
              Spot price drift jump vs lagging resting order book quotes
            </div>
          </div>

          <div
            onClick={() => setSelectedAgent('Oracle')}
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: selectedAgent === 'Oracle' ? 'rgba(0, 240, 255, 0.1)' : 'rgba(255, 255, 255, 0.02)',
              border: `1px solid ${selectedAgent === 'Oracle' ? 'var(--brand-cyan)' : 'var(--border)'}`,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Sparkles size={14} style={{ color: 'var(--brand-cyan)' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Oracle Vol Arb</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
              Theoretical Black-Scholes probability Φ(z) mispricing arb
            </div>
          </div>

          <div
            onClick={() => setSelectedAgent('Titan')}
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: selectedAgent === 'Titan' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.02)',
              border: `1px solid ${selectedAgent === 'Titan' ? '#3b82f6' : 'var(--border)'}`,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Sliders size={14} style={{ color: '#3b82f6' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Titan Market Maker</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
              Two-sided liquidity quoting with inventory-skewed quoting
            </div>
          </div>
        </div>

        {/* Interactive Parameter Controls */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            marginTop: '16px',
            background: 'rgba(0, 0, 0, 0.2)',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        >
          <div>
            <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '6px' }}>
              Underlying Market Asset
            </label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="market-select"
              style={{ width: '100%', padding: '6px 10px', background: 'rgba(255, 255, 255, 0.05)', color: '#fff', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px' }}
            >
              <option value="BTC/USD">BTC/USD (5m Binary)</option>
              <option value="ETH/USD">ETH/USD (15m Binary)</option>
              <option value="SOL/USD">SOL/USD (1h Binary)</option>
            </select>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
              <span style={{ color: 'var(--muted-foreground)' }}>Initial Replay Capital</span>
              <span style={{ color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)' }}>${initialCapital}</span>
            </div>
            <input
              type="range"
              min="200"
              max="10000"
              step="100"
              value={initialCapital}
              onChange={(e) => setInitialCapital(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--brand-cyan)' }}
            />
          </div>

          {selectedAgent === 'Volt' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
                <span style={{ color: 'var(--muted-foreground)' }}>Drift Trigger</span>
                <span style={{ color: 'var(--trade-anomaly)', fontFamily: 'var(--font-mono)' }}>{(driftThreshold * 100).toFixed(2)}%</span>
              </div>
              <input
                type="range"
                min="0.0005"
                max="0.01"
                step="0.0005"
                value={driftThreshold}
                onChange={(e) => setDriftThreshold(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--trade-anomaly)' }}
              />
            </div>
          )}

          {selectedAgent === 'Oracle' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
                <span style={{ color: 'var(--muted-foreground)' }}>Min Probability Edge</span>
                <span style={{ color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)' }}>{(minEdge * 100).toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.1"
                step="0.005"
                value={minEdge}
                onChange={(e) => setMinEdge(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--brand-cyan)' }}
              />
            </div>
          )}

          {selectedAgent === 'Titan' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
                <span style={{ color: 'var(--muted-foreground)' }}>Target Bid/Ask Spread</span>
                <span style={{ color: '#3b82f6', fontFamily: 'var(--font-mono)' }}>{(targetSpread * 100).toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min="0.02"
                max="0.1"
                step="0.005"
                value={targetSpread}
                onChange={(e) => setTargetSpread(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#3b82f6' }}
              />
            </div>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
              <span style={{ color: 'var(--muted-foreground)' }}>Order Lot Size</span>
              <span style={{ color: 'var(--trade-buy)', fontFamily: 'var(--font-mono)' }}>{lotSize} Lots</span>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              step="1"
              value={lotSize}
              onChange={(e) => setLotSize(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--trade-buy)' }}
            />
          </div>
        </div>
      </div>

      {/* 2. Simulation Results & Equity Curve */}
      {currentResult && (
        <>
          {/* Scorecards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '14px',
            }}
          >
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">Net Strategy PnL</span>
                <TrendingUp size={14} style={{ color: 'var(--trade-buy)' }} />
              </div>
              <div className="stat-value" style={{ color: currentResult.netPnl >= 0 ? 'var(--trade-buy)' : 'var(--trade-sell)' }}>
                {currentResult.netPnl >= 0 ? '+' : ''}${currentResult.netPnl.toFixed(2)}
              </div>
              <span className="stat-delta pos">
                +{((currentResult.netPnl / currentResult.initialCapital) * 100).toFixed(1)}% Total Return
              </span>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">Win Rate</span>
                <CheckCircle2 size={14} style={{ color: 'var(--brand-cyan)' }} />
              </div>
              <div className="stat-value" style={{ color: 'var(--brand-cyan)' }}>
                {currentResult.winRate.toFixed(1)}%
              </div>
              <span className="stat-subtext">
                {Math.round((currentResult.winRate / 100) * currentResult.totalTrades)} of {currentResult.totalTrades} Wins
              </span>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">Sharpe Ratio</span>
                <Sparkles size={14} style={{ color: '#a855f7' }} />
              </div>
              <div className="stat-value" style={{ color: '#a855f7' }}>
                {currentResult.sharpeRatio.toFixed(2)}
              </div>
              <span className="stat-subtext">Risk-Adjusted Alpha</span>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">Max Drawdown</span>
                <ArrowUpRight size={14} style={{ color: 'var(--trade-sell)' }} />
              </div>
              <div className="stat-value" style={{ color: 'var(--trade-sell)' }}>
                {currentResult.maxDrawdown.toFixed(2)}%
              </div>
              <span className="stat-subtext">Peak to Trough</span>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">Deploy to Swarm</span>
                <Cpu size={14} style={{ color: 'var(--brand-cyan)' }} />
              </div>
              <button
                type="button"
                className="btn-glow"
                onClick={handleDeployToSwarm}
                disabled={isDeploying || deployedSuccess}
                style={{
                  width: '100%',
                  marginTop: '8px',
                  padding: '6px 12px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                }}
              >
                {deployedSuccess ? (
                  <>
                    <CheckCircle2 size={12} />
                    <span>Applied to Swarm!</span>
                  </>
                ) : (
                  <>
                    <Cpu size={12} />
                    <span>Deploy Strategy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Equity Curve SVG Chart */}
          <div className="terminal-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={16} style={{ color: 'var(--brand-cyan)' }} />
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
                  Simulated Portfolio Equity Curve
                </h3>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                {currentResult.totalTrades} contract expiration ticks
              </span>
            </div>

            <div style={{ width: '100%', height: '230px', position: 'relative' }}>
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                preserveAspectRatio="none"
                style={{ width: '100%', height: '100%', overflow: 'visible' }}
              >
                <defs>
                  <linearGradient id="equityGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Gridlines */}
                <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="3 3" />
                <line x1={padding} y1={svgHeight / 2} x2={svgWidth - padding} y2={svgHeight / 2} stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="3 3" />
                <line x1={padding} y1={svgHeight - padding} x2={svgWidth - padding} y2={svgHeight - padding} stroke="rgba(255, 255, 255, 0.1)" />

                {/* Area under curve */}
                {areaPath && <path d={areaPath} fill="url(#equityGrad)" />}

                {/* Line Path */}
                {linePath && (
                  <path
                    d={linePath}
                    fill="none"
                    stroke="#00f0ff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
            </div>
          </div>

          {/* Simulated Trade Execution Log */}
          <div className="terminal-panel" style={{ padding: '0', overflow: 'hidden' }}>
            <div
              className="terminal-panel-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ListOrdered size={16} style={{ color: 'var(--brand-cyan)' }} />
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
                  Replay Executions Breakdown
                </h3>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                Showing last {Math.min(currentResult.trades.length, 10)} fills
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="terminal-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                      Timestamp
                    </th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                      Strategy Action
                    </th>
                    <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                      Outcome
                    </th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                      Fill Price
                    </th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                      Lot Size
                    </th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                      PnL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {currentResult.trades.slice(-10).reverse().map((t) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(t.timestamp).toLocaleTimeString()}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>
                        {t.action}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: t.outcome === 'YES' ? 'rgba(0, 255, 102, 0.12)' : 'rgba(255, 51, 102, 0.12)',
                            color: t.outcome === 'YES' ? 'var(--trade-buy)' : 'var(--trade-sell)',
                            fontSize: '11px',
                            fontWeight: 700,
                          }}
                        >
                          {t.outcome}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                        ${t.price.toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                        {t.lots}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: t.pnl >= 0 ? 'var(--trade-buy)' : 'var(--trade-sell)', fontFamily: 'var(--font-mono)' }}>
                        {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
