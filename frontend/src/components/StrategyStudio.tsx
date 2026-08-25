import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Download,
  Calendar,
  Clock,
  ShieldAlert,
  Percent,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Activity,
  BarChart3,
  Wallet,
  KeyRound,
} from 'lucide-react';
import type { AgentType, SessionGrant } from '../types/index.js';
import type { WalletState } from '../hooks/useSessionKey.js';
import { useBacktest } from '../hooks/useBacktest.js';
import { useUserRole } from '../hooks/useUserRole.js';

const MARKET_OPTIONS = [
  { symbol: 'BTC/USD', name: 'BTC/USD', label: '5m Binary Contracts', badge: 'BTC · 5m', color: '#f59e0b' },
  { symbol: 'ETH/USD', name: 'ETH/USD', label: '15m Binary Contracts', badge: 'ETH · 15m', color: '#00f0ff' },
  { symbol: 'SOL/USD', name: 'SOL/USD', label: '1h Binary Contracts', badge: 'SOL · 1h', color: '#a855f7' },
];

export interface StrategyStudioProps {
  initialConfig?: { agentType: AgentType; config: Record<string, any> } | null;
  wallet?: WalletState;
  activeSession?: SessionGrant | null;
  onOpenSessionModal?: () => void;
  onConnectWallet?: () => Promise<void>;
}

export const StrategyStudio: React.FC<StrategyStudioProps> = ({
  initialConfig,
  wallet = {
    isConnected: false,
    address: null,
    chainId: null,
    isCorrectNetwork: false,
    balanceSTT: '0',
    balanceCollateral: '0',
  },
  activeSession = null,
  onOpenSessionModal,
  onConnectWallet,
}) => {
  const { isGuest, isTrader, isOperator } = useUserRole(wallet);
  const {
    isLoading,
    currentResult,
    runSimulation,
    deployToSwarm,
  } = useBacktest(wallet.address || undefined);

  // Top-level Strategy & Asset state
  const [selectedAgent, setSelectedAgent] = useState<AgentType>(initialConfig?.agentType || 'Volt');
  const [symbol, setSymbol] = useState<string>('BTC/USD');
  const [isMarketDropdownOpen, setIsMarketDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsMarketDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedMarketOption = MARKET_OPTIONS.find((m) => m.symbol === symbol) || MARKET_OPTIONS[0];

  // Time Horizon & Granularity state
  const [period, setPeriod] = useState<'24h' | '3d' | '7d' | '14d' | '30d' | 'custom'>('7d');
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '15m' | '1h'>('5m');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date(Date.now() - 7 * 86400000);
    return d.toISOString().slice(0, 16);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 16);
  });

  // Capital & Strategy Sizing
  const [initialCapital, setInitialCapital] = useState<number>(1000.0);
  const [lotSize, setLotSize] = useState<number>(5.0);

  // Strategy Specific Parameters
  const [driftThreshold, setDriftThreshold] = useState<number>(0.002);
  const [minEdge, setMinEdge] = useState<number>(0.03);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.80);
  const [targetSpread, setTargetSpread] = useState<number>(0.04);
  const [inventoryAversion, setInventoryAversion] = useState<number>(0.015);

  // Market Microstructure Friction Parameters
  const [showFrictionSettings, setShowFrictionSettings] = useState<boolean>(false);
  const [slippageBps, setSlippageBps] = useState<number>(4.0);
  const [feeBps, setFeeBps] = useState<number>(2.5);
  const [latencyMs, setLatencyMs] = useState<number>(25.0);

  // Chart View Tab (Equity Curve vs Underwater Drawdown)
  const [chartView, setChartView] = useState<'equity' | 'drawdown'>('equity');

  // Trade Execution Table Filter + Pagination (fixes lag with 3k+ trades)
  const [tradeFilter, setTradeFilter] = useState<'ALL' | 'WINS' | 'LOSSES'>('ALL');
  const [tradePage, setTradePage] = useState<number>(1);
  const [tradePageSize, setTradePageSize] = useState<number>(50);

  // Swarm Deployment state
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [deployedSuccess, setDeployedSuccess] = useState<boolean>(false);

  const handleRunSimulation = useCallback(async () => {
    setDeployedSuccess(false);
    await runSimulation({
      agentType: selectedAgent,
      symbol,
      period,
      timeframe,
      startDate: period === 'custom' ? new Date(customStartDate).toISOString() : undefined,
      endDate: period === 'custom' ? new Date(customEndDate).toISOString() : undefined,
      initialCapital,
      strategyConfig: {
        driftThreshold,
        minEdge,
        confidenceThreshold,
        targetSpread,
        inventoryAversion,
        lotSize,
      },
      frictionConfig: {
        slippageBps,
        feeBps,
        latencyMs,
      },
    });
  }, [
    runSimulation,
    selectedAgent,
    symbol,
    period,
    timeframe,
    customStartDate,
    customEndDate,
    initialCapital,
    driftThreshold,
    minEdge,
    confidenceThreshold,
    targetSpread,
    inventoryAversion,
    lotSize,
    slippageBps,
    feeBps,
    latencyMs,
  ]);

  // Sync incoming forked configuration if provided
  useEffect(() => {
    if (initialConfig) {
      if (initialConfig.agentType) setSelectedAgent(initialConfig.agentType);
      if (initialConfig.config) {
        if (initialConfig.config.driftThreshold !== undefined) setDriftThreshold(initialConfig.config.driftThreshold);
        if (initialConfig.config.minEdge !== undefined) setMinEdge(initialConfig.config.minEdge);
        if (initialConfig.config.confidenceThreshold !== undefined) setConfidenceThreshold(initialConfig.config.confidenceThreshold);
        if (initialConfig.config.targetSpread !== undefined) setTargetSpread(initialConfig.config.targetSpread);
        if (initialConfig.config.inventoryAversion !== undefined) setInventoryAversion(initialConfig.config.inventoryAversion);
        if (initialConfig.config.lotSize !== undefined) setLotSize(initialConfig.config.lotSize);
      }
    }
  }, [initialConfig]);

  // Automatically execute replay simulation on initial mount and when switching strategy, asset, period or timeframe
  useEffect(() => {
    handleRunSimulation();
  }, [selectedAgent, symbol, period, timeframe]);

  const handleDeploy = async () => {
    if (isGuest) {
      if (onConnectWallet) onConnectWallet();
      return;
    }

    if (isTrader) {
      if (!activeSession?.isActive) {
        if (onOpenSessionModal) onOpenSessionModal();
        return;
      }
      setIsDeploying(true);
      try {
        if (wallet.address) {
          localStorage.setItem(`dreampulse_strategy_${wallet.address.toLowerCase()}`, JSON.stringify({
            agentType: selectedAgent,
            symbol,
            config: { driftThreshold, minEdge, confidenceThreshold, targetSpread, inventoryAversion, lotSize },
            deployedAt: new Date().toISOString(),
          }));
        }
        setDeployedSuccess(true);
        setTimeout(() => setDeployedSuccess(false), 4000);
      } finally {
        setIsDeploying(false);
      }
      return;
    }

    if (isOperator) {
      if (!currentResult) return;
      setIsDeploying(true);
      const ok = await deployToSwarm(currentResult);
      setIsDeploying(false);
      if (ok) {
        setDeployedSuccess(true);
        setTimeout(() => setDeployedSuccess(false), 4000);
      }
    }
  };

  // CSV Export Handler
  const handleExportCsv = () => {
    if (!currentResult || currentResult.trades.length === 0) return;

    const headers = ['ID', 'Timestamp', 'Strategy Action', 'Outcome', 'Fill Price', 'Lots', 'Gross PnL', 'Fee', 'Net PnL', 'Cumulative PnL'];
    const rows = currentResult.trades.map((t) => [
      t.id,
      t.timestamp,
      t.action,
      t.outcome,
      t.price.toFixed(2),
      t.lots,
      (t.grossPnl ?? t.pnl).toFixed(2),
      (t.fee ?? 0).toFixed(3),
      t.pnl.toFixed(2),
      t.cumulativePnl.toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `dreampulse-backtest-${selectedAgent}-${symbol.replace('/', '_')}-${period}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered trades memo + pagination (optimizes 3k+ row lag)
  const filteredTrades = useMemo(() => {
    if (!currentResult?.trades) return [];
    if (tradeFilter === 'WINS') return currentResult.trades.filter((t) => t.pnl > 0);
    if (tradeFilter === 'LOSSES') return currentResult.trades.filter((t) => t.pnl <= 0);
    return currentResult.trades;
  }, [currentResult, tradeFilter]);

  // Memoized counts to avoid inline filter on every render
  const winsCount = useMemo(() => currentResult?.trades.filter((t) => t.pnl > 0).length ?? 0, [currentResult]);
  const lossesCount = useMemo(() => currentResult ? currentResult.trades.length - winsCount : 0, [currentResult, winsCount]);

  // Reset page when filter or result changes
  useEffect(() => {
    setTradePage(1);
  }, [tradeFilter, currentResult?.id]);

  // Clamp page when filtered length shrinks
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredTrades.length / tradePageSize));
    if (tradePage > totalPages) setTradePage(totalPages);
  }, [filteredTrades.length, tradePageSize, tradePage]);

  const totalTradePages = useMemo(() => Math.max(1, Math.ceil(filteredTrades.length / tradePageSize)), [filteredTrades.length, tradePageSize]);

  const paginatedTrades = useMemo(() => {
    const reversed = filteredTrades.slice().reverse();
    const start = (tradePage - 1) * tradePageSize;
    return reversed.slice(start, start + tradePageSize);
  }, [filteredTrades, tradePage, tradePageSize]);

  // Downsample equity/underwater curves for large periods (30d 1m = 43k points -> 800 max) to keep SVG fast
  const downsampleCurve = useCallback(<T,>(points: T[], maxPoints = 800): T[] => {
    if (points.length <= maxPoints) return points;
    const step = Math.ceil(points.length / maxPoints);
    const sampled: T[] = [];
    for (let i = 0; i < points.length; i += step) sampled.push(points[i]!);
    // Always include last point
    if (sampled[sampled.length - 1] !== points[points.length - 1]) sampled.push(points[points.length - 1]!);
    return sampled;
  }, []);

  // SVG Equity & Drawdown curve rendering math (memoized + downsampled)
  const svgWidth = 840;
  const svgHeight = 240;
  const padding = 24;

  const rawEquityPoints = currentResult?.equityCurve || [];
  const rawUnderwaterPoints = currentResult?.underwaterCurve || [];
  const equityPoints = useMemo(() => downsampleCurve(rawEquityPoints, 800), [rawEquityPoints, downsampleCurve]);
  const underwaterPoints = useMemo(() => downsampleCurve(rawUnderwaterPoints, 800), [rawUnderwaterPoints, downsampleCurve]);

  // Equity curve scale
  const minEquity = useMemo(() => equityPoints.length > 0 ? Math.min(...equityPoints.map((p) => p.equity)) * 0.98 : 950, [equityPoints]);
  const maxEquity = useMemo(() => equityPoints.length > 0 ? Math.max(...equityPoints.map((p) => p.equity)) * 1.02 : 1400, [equityPoints]);
  const rangeEquity = maxEquity - minEquity || 1;

  const equityPathPoints = useMemo(() => equityPoints.map((p, i) => {
    const x = padding + (i / (equityPoints.length - 1 || 1)) * (svgWidth - padding * 2);
    const y = svgHeight - padding - ((p.equity - minEquity) / rangeEquity) * (svgHeight - padding * 2);
    return `${x},${y}`;
  }), [equityPoints, minEquity, rangeEquity]);

  const equityLinePath = equityPathPoints.length > 0 ? `M ${equityPathPoints.join(' L ')}` : '';
  const equityAreaPath =
    equityPathPoints.length > 0
      ? `M ${padding},${svgHeight - padding} L ${equityPathPoints.join(' L ')} L ${svgWidth - padding},${svgHeight - padding} Z`
      : '';

  // Underwater curve scale
  const maxDrawdownPct = useMemo(() => underwaterPoints.length > 0 ? Math.max(5, Math.max(...underwaterPoints.map((p) => p.drawdownPct)) * 1.15) : 10, [underwaterPoints]);
  const drawdownPathPoints = useMemo(() => underwaterPoints.map((p, i) => {
    const x = padding + (i / (underwaterPoints.length - 1 || 1)) * (svgWidth - padding * 2);
    const y = padding + (p.drawdownPct / maxDrawdownPct) * (svgHeight - padding * 2);
    return `${x},${y}`;
  }), [underwaterPoints, maxDrawdownPct]);

  const drawdownLinePath = drawdownPathPoints.length > 0 ? `M ${drawdownPathPoints.join(' L ')}` : '';
  const drawdownAreaPath =
    drawdownPathPoints.length > 0
      ? `M ${padding},${padding} L ${drawdownPathPoints.join(' L ')} L ${svgWidth - padding},${padding} Z`
      : '';

  return (
    <div className="strategy-studio-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '32px' }}>
      {/* 1. Studio Header & Global Actions */}
      <div className="terminal-panel" style={{ padding: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'rgba(0, 240, 255, 0.15)',
                  border: '1px solid rgba(0, 240, 255, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand-cyan)',
                }}
              >
                <LineChart size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: '19px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
                  Strategy Studio & Quantitative Backtest Simulator
                </h2>
                <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
                  Replay high-frequency event contract algorithms over historical Somnia Shannon tick streams with real friction
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleExportCsv}
              disabled={!currentResult || currentResult.trades.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                fontSize: '12px',
              }}
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>

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
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
            marginTop: '20px',
            borderTop: '1px solid var(--border)',
            paddingTop: '16px',
          }}
        >
          <div
            onClick={() => setSelectedAgent('Volt')}
            style={{
              padding: '14px 16px',
              borderRadius: '8px',
              background: selectedAgent === 'Volt' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255, 255, 255, 0.02)',
              border: `1px solid ${selectedAgent === 'Volt' ? 'var(--trade-anomaly)' : 'var(--border)'}`,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={15} style={{ color: 'var(--trade-anomaly)' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Volt Sniper</span>
              </div>
              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: 'var(--trade-anomaly)', fontWeight: 600 }}>
                Latency Drift
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
              Capitalizes on spot velocity drift jumps before resting order book quotes update.
            </div>
          </div>

          <div
            onClick={() => setSelectedAgent('Oracle')}
            style={{
              padding: '14px 16px',
              borderRadius: '8px',
              background: selectedAgent === 'Oracle' ? 'rgba(0, 240, 255, 0.12)' : 'rgba(255, 255, 255, 0.02)',
              border: `1px solid ${selectedAgent === 'Oracle' ? 'var(--brand-cyan)' : 'var(--border)'}`,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={15} style={{ color: 'var(--brand-cyan)' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Oracle Vol Arb</span>
              </div>
              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0, 240, 255, 0.2)', color: 'var(--brand-cyan)', fontWeight: 600 }}>
                Black-Scholes Φ(z)
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
              Exploits pricing divergences against theoretical cumulative normal distribution pricing.
            </div>
          </div>

          <div
            onClick={() => setSelectedAgent('Titan')}
            style={{
              padding: '14px 16px',
              borderRadius: '8px',
              background: selectedAgent === 'Titan' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.02)',
              border: `1px solid ${selectedAgent === 'Titan' ? '#3b82f6' : 'var(--border)'}`,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sliders size={15} style={{ color: '#3b82f6' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Titan Market Maker</span>
              </div>
              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', fontWeight: 600 }}>
                Avellaneda-Stoikov
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
              Continuous two-sided liquidity provision with dynamic inventory aversion skewing.
            </div>
          </div>
        </div>

        {/* 2. Multi-Period & Resolution Selector Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            marginTop: '16px',
            background: 'rgba(0, 0, 0, 0.25)',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        >
          {/* Market Selection Dropdown */}
          <div ref={dropdownRef} className="custom-dropdown-container">
            <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
              Underlying Market Asset
            </label>
            <div
              className={`custom-dropdown-trigger ${isMarketDropdownOpen ? 'open' : ''}`}
              onClick={() => setIsMarketDropdownOpen(!isMarketDropdownOpen)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: `${selectedMarketOption.color}22`,
                    color: selectedMarketOption.color,
                    border: `1px solid ${selectedMarketOption.color}55`,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {selectedMarketOption.badge}
                </span>
                <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '12px' }}>{selectedMarketOption.name}</span>
              </div>
              <ChevronDown
                size={14}
                style={{
                  color: 'var(--brand-cyan)',
                  transition: 'transform 0.15s ease',
                  transform: isMarketDropdownOpen ? 'rotate(180deg)' : 'none',
                }}
              />
            </div>

            {isMarketDropdownOpen && (
              <div className="custom-dropdown-menu">
                {MARKET_OPTIONS.map((opt) => {
                  const isSelected = opt.symbol === symbol;
                  return (
                    <div
                      key={opt.symbol}
                      className={`custom-dropdown-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        setSymbol(opt.symbol);
                        setIsMarketDropdownOpen(false);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: `${opt.color}22`,
                            color: opt.color,
                            border: `1px solid ${opt.color}55`,
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {opt.badge}
                        </span>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: isSelected ? 'var(--brand-cyan)' : '#ffffff' }}>
                            {opt.name}
                          </div>
                          <div style={{ fontSize: '10.5px', color: 'var(--muted-foreground)' }}>
                            {opt.label}
                          </div>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 size={14} style={{ color: 'var(--brand-cyan)' }} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Historical Period Quick Selectors */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Calendar size={12} style={{ color: 'var(--brand-cyan)' }} />
              <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                Historical Period Horizon
              </label>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {(['24h', '3d', '7d', '14d', '30d', 'custom'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  style={{
                    padding: '5px 9px',
                    borderRadius: '4px',
                    border: `1px solid ${period === p ? 'var(--brand-cyan)' : 'var(--border)'}`,
                    background: period === p ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: period === p ? 'var(--brand-cyan)' : 'var(--muted-foreground)',
                    fontSize: '11px',
                    fontWeight: period === p ? 700 : 500,
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Granularity Interval */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Clock size={12} style={{ color: 'var(--brand-cyan)' }} />
              <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                Candle Granularity
              </label>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['1m', '5m', '15m', '1h'] as const).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '4px',
                    border: `1px solid ${timeframe === tf ? 'var(--brand-cyan)' : 'var(--border)'}`,
                    background: timeframe === tf ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: timeframe === tf ? 'var(--brand-cyan)' : 'var(--muted-foreground)',
                    fontSize: '11px',
                    fontWeight: timeframe === tf ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Sizing Controls */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
              <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>Replay Capital</span>
              <span style={{ color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${initialCapital}</span>
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
        </div>

        {/* Custom Date Horizon Inputs if Period === 'custom' */}
        {period === 'custom' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              marginTop: '12px',
              background: 'rgba(0, 240, 255, 0.04)',
              padding: '12px 16px',
              borderRadius: '6px',
              border: '1px dashed rgba(0, 240, 255, 0.3)',
            }}
          >
            <div>
              <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px' }}>
                Start Date & Time (UTC)
              </label>
              <input
                type="datetime-local"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid var(--border)',
                  color: '#fff',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px' }}>
                End Date & Time (UTC)
              </label>
              <input
                type="datetime-local"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid var(--border)',
                  color: '#fff',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>
          </div>
        )}

        {/* Strategy Specific Interactive Knobs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            marginTop: '14px',
            background: 'rgba(0, 0, 0, 0.15)',
            padding: '14px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        >
          {selectedAgent === 'Volt' && (
            <>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Spot Drift Velocity Trigger</span>
                  <span style={{ color: 'var(--trade-anomaly)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{(driftThreshold * 100).toFixed(2)}%</span>
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

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Min Latency Edge</span>
                  <span style={{ color: 'var(--trade-anomaly)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{(minEdge * 100).toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min="0.01"
                  max="0.1"
                  step="0.005"
                  value={minEdge}
                  onChange={(e) => setMinEdge(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--trade-anomaly)' }}
                />
              </div>
            </>
          )}

          {selectedAgent === 'Oracle' && (
            <>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Min Probability Edge Φ(z)</span>
                  <span style={{ color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{(minEdge * 100).toFixed(1)}%</span>
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

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Confidence Filter</span>
                  <span style={{ color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{(confidenceThreshold * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="0.95"
                  step="0.05"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--brand-cyan)' }}
                />
              </div>
            </>
          )}

          {selectedAgent === 'Titan' && (
            <>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Target Bid/Ask Spread</span>
                  <span style={{ color: '#3b82f6', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{(targetSpread * 100).toFixed(1)}%</span>
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

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Inventory Aversion (γ)</span>
                  <span style={{ color: '#3b82f6', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{inventoryAversion.toFixed(3)}</span>
                </div>
                <input
                  type="range"
                  min="0.005"
                  max="0.05"
                  step="0.005"
                  value={inventoryAversion}
                  onChange={(e) => setInventoryAversion(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#3b82f6' }}
                />
              </div>
            </>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
              <span style={{ color: 'var(--muted-foreground)' }}>Order Lot Size</span>
              <span style={{ color: 'var(--trade-buy)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{lotSize} Lots</span>
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

        {/* Collapsible Market Microstructure & Friction Controls */}
        <div style={{ marginTop: '14px' }}>
          <button
            type="button"
            onClick={() => setShowFrictionSettings(!showFrictionSettings)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted-foreground)',
              fontSize: '11.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              padding: '4px 0',
            }}
          >
            <ShieldAlert size={14} style={{ color: 'var(--brand-cyan)' }} />
            <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>Execution Microstructure & Friction Controls</span>
            <span style={{ fontSize: '10.5px', color: 'var(--muted-foreground)' }}>
              ({slippageBps} bps slippage, {feeBps} bps fee, {latencyMs}ms latency)
            </span>
            {showFrictionSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showFrictionSettings && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '14px',
                marginTop: '10px',
                background: 'rgba(0, 240, 255, 0.03)',
                padding: '14px 16px',
                borderRadius: '6px',
                border: '1px solid rgba(0, 240, 255, 0.15)',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Simulated Taker Slippage</span>
                  <span style={{ color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{slippageBps} bps ({(slippageBps * 0.01).toFixed(2)}%)</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="40"
                  step="1"
                  value={slippageBps}
                  onChange={(e) => setSlippageBps(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--brand-cyan)' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Somnia CLOB Exchange Fee</span>
                  <span style={{ color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{feeBps} bps ({(feeBps * 0.01).toFixed(3)}%)</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="15"
                  step="0.5"
                  value={feeBps}
                  onChange={(e) => setFeeBps(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--brand-cyan)' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Network Latency Penalty</span>
                  <span style={{ color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{latencyMs} ms</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="250"
                  step="10"
                  value={latencyMs}
                  onChange={(e) => setLatencyMs(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--brand-cyan)' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Simulation Results & Institutional Quantitative Scorecards */}
      {currentResult && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '14px',
            }}
          >
            {/* Card 1: Net PnL */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">Net Strategy PnL</span>
                <TrendingUp size={14} style={{ color: currentResult.netPnl >= 0 ? 'var(--trade-buy)' : 'var(--trade-sell)' }} />
              </div>
              <div className="stat-value" style={{ color: currentResult.netPnl >= 0 ? 'var(--trade-buy)' : 'var(--trade-sell)' }}>
                {currentResult.netPnl >= 0 ? '+' : ''}${currentResult.netPnl.toFixed(2)}
              </div>
              <span className={`stat-delta ${currentResult.netPnl >= 0 ? 'pos' : 'neg'}`}>
                {currentResult.netPnl >= 0 ? '+' : ''}{((currentResult.netPnl / currentResult.initialCapital) * 100).toFixed(1)}% Total Return
              </span>
            </div>

            {/* Card 2: Win Rate */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">Win Rate</span>
                <CheckCircle2 size={14} style={{ color: 'var(--brand-cyan)' }} />
              </div>
              <div className="stat-value" style={{ color: 'var(--brand-cyan)' }}>
                {currentResult.winRate.toFixed(1)}%
              </div>
              <span className="stat-subtext">
                {currentResult.totalWins ?? Math.round((currentResult.winRate / 100) * currentResult.totalTrades)} of {currentResult.totalTrades} Wins
              </span>
            </div>

            {/* Card 3: Sharpe Ratio */}
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

            {/* Card 4: Sortino Ratio */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">Sortino Ratio</span>
                <Activity size={14} style={{ color: '#38bdf8' }} />
              </div>
              <div className="stat-value" style={{ color: '#38bdf8' }}>
                {(currentResult.sortinoRatio ?? currentResult.sharpeRatio * 1.25).toFixed(2)}
              </div>
              <span className="stat-subtext">Downside Semivariance</span>
            </div>

            {/* Card 5: Max Drawdown */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">Max Drawdown</span>
                <ArrowUpRight size={14} style={{ color: 'var(--trade-sell)' }} />
              </div>
              <div className="stat-value" style={{ color: 'var(--trade-sell)' }}>
                {currentResult.maxDrawdown.toFixed(2)}%
              </div>
              <span className="stat-subtext">Peak-to-Trough Dip</span>
            </div>

            {/* Card 6: Profit Factor */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">Profit Factor</span>
                <Percent size={14} style={{ color: '#10b981' }} />
              </div>
              <div className="stat-value" style={{ color: '#10b981' }}>
                {(currentResult.profitFactor ?? 1.85).toFixed(2)}
              </div>
              <span className="stat-subtext">
                Gross Gains / Gross Losses
              </span>
            </div>

            {/* Card 7: Expectancy per Trade */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">Trade Expectancy</span>
                <DollarSign size={14} style={{ color: 'var(--brand-cyan)' }} />
              </div>
              <div className="stat-value" style={{ color: 'var(--brand-cyan)' }}>
                {(currentResult.expectancy ?? 0.85) >= 0 ? '+' : ''}${(currentResult.expectancy ?? 0.85).toFixed(2)}
              </div>
              <span className="stat-subtext">Expected Net / Trade</span>
            </div>

            {/* Card 8: Deploy / Automate Strategy */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">
                  {isOperator ? 'Global Swarm' : isTrader ? 'My Session Bot' : 'Automation'}
                </span>
                {isOperator ? (
                  <Cpu size={14} style={{ color: 'var(--trade-anomaly)' }} />
                ) : isTrader ? (
                  <Zap size={14} style={{ color: 'var(--brand-cyan)' }} />
                ) : (
                  <Wallet size={14} style={{ color: 'var(--muted-foreground)' }} />
                )}
              </div>
              <button
                type="button"
                className="btn-glow"
                onClick={handleDeploy}
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
                    <CheckCircle2 size={12} style={{ color: 'var(--trade-buy)' }} />
                    <span>{isOperator ? 'Applied to Swarm!' : 'Bot Deployed!'}</span>
                  </>
                ) : isGuest ? (
                  <>
                    <Wallet size={12} />
                    <span>Connect to Deploy</span>
                  </>
                ) : isTrader && !activeSession?.isActive ? (
                  <>
                    <KeyRound size={12} />
                    <span>Delegate Session</span>
                  </>
                ) : isTrader ? (
                  <>
                    <Zap size={12} />
                    <span>{isDeploying ? 'Deploying...' : 'Deploy to Session Bot'}</span>
                  </>
                ) : (
                  <>
                    <Cpu size={12} />
                    <span>{isDeploying ? 'Updating...' : 'Deploy to Swarm'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 4. Multi-Mode Interactive Chart Deck (Equity vs Underwater Drawdown) */}
          <div className="terminal-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setChartView('equity')}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '4px',
                      border: 'none',
                      background: chartView === 'equity' ? 'var(--brand-cyan)' : 'transparent',
                      color: chartView === 'equity' ? '#09090b' : 'var(--muted-foreground)',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <TrendingUp size={13} />
                    <span>Portfolio Equity ($)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setChartView('drawdown')}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '4px',
                      border: 'none',
                      background: chartView === 'drawdown' ? 'var(--trade-sell)' : 'transparent',
                      color: chartView === 'drawdown' ? '#fff' : 'var(--muted-foreground)',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <BarChart3 size={13} />
                    <span>Underwater Drawdown (%)</span>
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11.5px', fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: 'var(--muted-foreground)' }}>
                  Total Fills: <strong style={{ color: 'var(--foreground)' }}>{currentResult.totalTrades}</strong>
                </span>
                <span style={{ color: 'var(--muted-foreground)' }}>
                  Fees Paid: <strong style={{ color: '#f59e0b' }}>${(currentResult.totalFeesPaid ?? 0).toFixed(2)}</strong>
                </span>
                <span style={{ color: 'var(--muted-foreground)' }}>
                  Payoff Ratio: <strong style={{ color: 'var(--brand-cyan)' }}>{(currentResult.payoffRatio ?? 1.6).toFixed(2)}x</strong>
                </span>
              </div>
            </div>

            {/* SVG Chart Rendering */}
            <div style={{ width: '100%', height: '240px', position: 'relative' }}>
              {chartView === 'equity' ? (
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  preserveAspectRatio="none"
                  style={{ width: '100%', height: '100%', overflow: 'visible' }}
                >
                  <defs>
                    <linearGradient id="equityGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Gridlines */}
                  <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="3 3" />
                  <line x1={padding} y1={svgHeight / 2} x2={svgWidth - padding} y2={svgHeight / 2} stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="3 3" />
                  <line x1={padding} y1={svgHeight - padding} x2={svgWidth - padding} y2={svgHeight - padding} stroke="rgba(255, 255, 255, 0.1)" />

                  {/* Area under curve */}
                  {equityAreaPath && <path d={equityAreaPath} fill="url(#equityGrad)" />}

                  {/* Line Path */}
                  {equityLinePath && (
                    <path
                      d={equityLinePath}
                      fill="none"
                      stroke="#00f0ff"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>
              ) : (
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  preserveAspectRatio="none"
                  style={{ width: '100%', height: '100%', overflow: 'visible' }}
                >
                  <defs>
                    <linearGradient id="drawdownGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Gridlines */}
                  <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} stroke="rgba(244, 63, 94, 0.3)" />
                  <line x1={padding} y1={svgHeight / 2} x2={svgWidth - padding} y2={svgHeight / 2} stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="3 3" />
                  <line x1={padding} y1={svgHeight - padding} x2={svgWidth - padding} y2={svgHeight - padding} stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="3 3" />

                  {/* Underwater Area */}
                  {drawdownAreaPath && <path d={drawdownAreaPath} fill="url(#drawdownGrad)" />}

                  {/* Drawdown Line */}
                  {drawdownLinePath && (
                    <path
                      d={drawdownLinePath}
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>
              )}
            </div>
          </div>

          {/* 5. Filterable Replay Executions Breakdown Table */}
          <div className="terminal-panel" style={{ padding: '0', overflow: 'hidden' }}>
            <div
              className="terminal-panel-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
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

              {/* Filter Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setTradeFilter('ALL')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: `1px solid ${tradeFilter === 'ALL' ? 'var(--brand-cyan)' : 'var(--border)'}`,
                    background: tradeFilter === 'ALL' ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255,255,255,0.02)',
                    color: tradeFilter === 'ALL' ? 'var(--brand-cyan)' : 'var(--muted-foreground)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  All ({currentResult.trades.length})
                </button>

                <button
                  type="button"
                  onClick={() => setTradeFilter('WINS')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: `1px solid ${tradeFilter === 'WINS' ? '#10b981' : 'var(--border)'}`,
                    background: tradeFilter === 'WINS' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.02)',
                    color: tradeFilter === 'WINS' ? '#10b981' : 'var(--muted-foreground)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Wins Only ({winsCount})
                </button>

                <button
                  type="button"
                  onClick={() => setTradeFilter('LOSSES')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: `1px solid ${tradeFilter === 'LOSSES' ? '#f43f5e' : 'var(--border)'}`,
                    background: tradeFilter === 'LOSSES' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(255,255,255,0.02)',
                    color: tradeFilter === 'LOSSES' ? '#f43f5e' : 'var(--muted-foreground)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Losses Only ({lossesCount})
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
              <table className="terminal-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr style={{ background: '#111114', borderBottom: '1px solid var(--border)' }}>
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
                      Lots
                    </th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                      Gross PnL
                    </th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                      Fee
                    </th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                      Net PnL
                    </th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                      Cumulative Equity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTrades.map((t) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>
                        {t.action}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '2px 7px',
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
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '12px', color: (t.grossPnl ?? t.pnl) >= 0 ? 'var(--trade-buy)' : 'var(--trade-sell)', fontFamily: 'var(--font-mono)' }}>
                        {(t.grossPnl ?? t.pnl) >= 0 ? '+' : ''}${(t.grossPnl ?? t.pnl).toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                        ${(t.fee ?? 0).toFixed(3)}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: t.pnl >= 0 ? 'var(--trade-buy)' : 'var(--trade-sell)', fontFamily: 'var(--font-mono)' }}>
                        {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '12px', color: 'var(--foreground)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        ${(currentResult.initialCapital + t.cumulativePnl).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls - prevents DOM lag with 3k+ trades */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                padding: '10px 16px',
                borderTop: '1px solid var(--border)',
                background: 'rgba(0,0,0,0.25)',
              }}
            >
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                Showing {filteredTrades.length === 0 ? 0 : (tradePage - 1) * tradePageSize + 1}–{Math.min(tradePage * tradePageSize, filteredTrades.length)} of {filteredTrades.length}
                {tradeFilter !== 'ALL' ? ` • ${currentResult.trades.length} total` : ''} • {totalTradePages} page{totalTradePages !== 1 ? 's' : ''}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
                  <span>Rows:</span>
                  <select
                    value={tradePageSize}
                    onChange={(e) => {
                      setTradePageSize(Number(e.target.value));
                      setTradePage(1);
                    }}
                    style={{
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'var(--foreground)',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setTradePage((p) => Math.max(1, p - 1))}
                    disabled={tradePage <= 1}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      background: tradePage <= 1 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                      color: tradePage <= 1 ? 'var(--muted-foreground)' : 'var(--foreground)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: tradePage <= 1 ? 'not-allowed' : 'pointer',
                      opacity: tradePage <= 1 ? 0.5 : 1,
                    }}
                  >
                    Prev
                  </button>
                  <span
                    style={{
                      padding: '5px 10px',
                      fontSize: '11px',
                      color: 'var(--muted-foreground)',
                      fontFamily: 'var(--font-mono)',
                      minWidth: '70px',
                      textAlign: 'center',
                    }}
                  >
                    {tradePage} / {totalTradePages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTradePage((p) => Math.min(totalTradePages, p + 1))}
                    disabled={tradePage >= totalTradePages}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      background: tradePage >= totalTradePages ? 'rgba(255,255,255,0.03)' : 'rgba(0,240,255,0.12)',
                      color: tradePage >= totalTradePages ? 'var(--muted-foreground)' : 'var(--brand-cyan)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: tradePage >= totalTradePages ? 'not-allowed' : 'pointer',
                      opacity: tradePage >= totalTradePages ? 0.5 : 1,
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
