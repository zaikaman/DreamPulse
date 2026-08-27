import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChartBarIcon,
  AdjustmentsHorizontalIcon,
  PlayIcon,
  ArrowUpRightIcon,
  ArrowTrendingUpIcon,
  CpuChipIcon,
  CheckCircleIcon,
  QueueListIcon,
  SparklesIcon,
  BoltIcon,
  ArrowDownTrayIcon,
  CalendarIcon,
  ClockIcon,
  ShieldExclamationIcon,
  CurrencyDollarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  WalletIcon,
  KeyIcon,
  RocketLaunchIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline';
import type { AgentType, SessionGrant, CustomAgentDefinition, CustomAgentRules } from '../types/index.js';
import type { WalletState } from '../hooks/useSessionKey.js';
import { useBacktest } from '../hooks/useBacktest.js';
import { useCustomAgents } from '../hooks/useCustomAgents.js';
import { useUserRole } from '../hooks/useUserRole.js';
import { soundEngine } from '../services/audio.js';
import { StrategyStudioSkeleton } from './ui/Skeleton.js';
import { Spinner } from './ui/Spinner.js';
import { Badge } from './ui/badge.js';
import { cn } from '../lib/utils.js';

const MARKET_OPTIONS = [
  { symbol: 'BTC/USD', name: 'BTC/USD', label: '5m Binary Contracts', badge: 'BTC · 5m', color: '#fbbf24' },
  { symbol: 'ETH/USD', name: 'ETH/USD', label: '15m Binary Contracts', badge: 'ETH · 15m', color: '#2dd4bf' },
  { symbol: 'SOL/USD', name: 'SOL/USD', label: '1h Binary Contracts', badge: 'SOL · 1h', color: '#a78bfa' },
  { symbol: 'BNB/USD', name: 'BNB/USD', label: '5m Binary Contracts', badge: 'BNB · 5m', color: '#eab308' },
  { symbol: 'DOGE/USD', name: 'DOGE/USD', label: '5m Binary Contracts', badge: 'DOGE · 5m', color: '#d97706' },
];

export type BacktestAgentType = 'Volt' | 'Oracle' | 'Titan';

const STRATEGY_THEME: Record<BacktestAgentType, { color: string; bg: string; border: string; iconBg: string; Icon: React.ElementType; tag: string; desc: string }> = {
  Volt: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.22)', iconBg: 'rgba(245,158,11,0.12)', Icon: BoltIcon, tag: 'Latency Drift', desc: 'Capitalizes on spot velocity drift jumps before resting order book quotes update.' },
  Oracle: { color: '#2dd4bf', bg: 'rgba(45,212,191,0.08)', border: 'rgba(45,212,191,0.22)', iconBg: 'rgba(45,212,191,0.12)', Icon: SparklesIcon, tag: 'Black-Scholes Φ(z)', desc: 'Exploits pricing divergences against theoretical cumulative normal distribution pricing.' },
  Titan: { color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.22)', iconBg: 'rgba(167,139,250,0.12)', Icon: AdjustmentsHorizontalIcon, tag: 'Avellaneda-Stoikov', desc: 'Continuous two-sided liquidity provision with dynamic inventory aversion skewing.' },
};

export interface StrategyStudioProps {
  initialConfig?: {
    agentType: AgentType;
    config?: Record<string, any>;
    customAgentId?: string;
    customDraft?: Partial<CustomAgentDefinition>;
    customRules?: CustomAgentRules;
    symbol?: string;
    timeframe?: '1m' | '5m' | '15m' | '1h';
  } | null;
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
  const { isLoading, currentResult, runSimulation, deployToSwarm } = useBacktest(wallet.address || undefined);

  const initialAgent: BacktestAgentType = (initialConfig?.agentType === 'Oracle' || initialConfig?.agentType === 'Titan')
    ? initialConfig.agentType
    : 'Volt';
  const [selectedAgent, setSelectedAgent] = useState<BacktestAgentType>(initialAgent);
  const [agentCategory, setAgentCategory] = useState<'PROTOCOL' | 'CUSTOM'>(() => {
    if (
      initialConfig?.agentType === 'CUSTOM' ||
      initialConfig?.customAgentId ||
      initialConfig?.customDraft ||
      initialConfig?.customRules
    ) {
      return 'CUSTOM';
    }
    return 'PROTOCOL';
  });
  const { agents: customAgents, createAgent, deployAgent } = useCustomAgents(wallet.address || undefined);
  const [selectedCustomAgentId, setSelectedCustomAgentId] = useState<string>(() => {
    return initialConfig?.customAgentId || '';
  });

  const [deploymentAllowance, setDeploymentAllowance] = useState<number>(100);
  const [isDeployingToFleet, setIsDeployingToFleet] = useState<boolean>(false);
  const [fleetDeploySuccessMsg, setFleetDeploySuccessMsg] = useState<string | null>(null);

  const activeCustomAgent = useMemo(() => {
    if (selectedCustomAgentId) {
      const found = customAgents.find((a) => a.id === selectedCustomAgentId);
      if (found) return found;
    }
    if (initialConfig?.customDraft) {
      return {
        id: initialConfig.customAgentId || 'draft-preview',
        name: initialConfig.customDraft.name || 'Custom Draft Strategy',
        symbol: initialConfig.customDraft.symbol || 'BTC/USD',
        timeframe: (initialConfig.customDraft.timeframe as any) || '5m',
        strategyType: initialConfig.customDraft.strategyType || 'CUSTOM',
        rules: initialConfig.customRules || initialConfig.customDraft.rules!,
        description: initialConfig.customDraft.description || 'Active Draft Strategy from Studio',
        color: initialConfig.customDraft.color || '#2dd4bf',
        userAddress: wallet.address || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as CustomAgentDefinition;
    }
    return customAgents[0] || null;
  }, [customAgents, selectedCustomAgentId, initialConfig, wallet.address]);

  const displayedCustomAgents = useMemo(() => {
    const list = [...customAgents];
    if (
      activeCustomAgent &&
      activeCustomAgent.id === 'draft-preview' &&
      !list.some((a) => a.id === 'draft-preview')
    ) {
      return [activeCustomAgent, ...list];
    }
    return list;
  }, [customAgents, activeCustomAgent]);

  const [symbol, setSymbol] = useState<string>(() => {
    if (initialConfig?.symbol) return initialConfig.symbol;
    if (initialConfig?.customDraft?.symbol) return initialConfig.customDraft.symbol;
    return 'BTC/USD';
  });
  const [isMarketDropdownOpen, setIsMarketDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsMarketDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedMarketOption = MARKET_OPTIONS.find((m) => m.symbol === symbol) || MARKET_OPTIONS[0];

  const [period, setPeriod] = useState<'24h' | '3d' | '7d' | '14d' | '30d' | 'custom'>('7d');
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '15m' | '1h'>(() => {
    if (initialConfig?.timeframe) return initialConfig.timeframe;
    if (initialConfig?.customDraft?.timeframe) return initialConfig.customDraft.timeframe as any;
    return '5m';
  });
  const [customStartDate, setCustomStartDate] = useState<string>(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 16));
  const [customEndDate, setCustomEndDate] = useState<string>(() => new Date().toISOString().slice(0, 16));

  const [initialCapital, setInitialCapital] = useState<number>(1000.0);
  const [lotSize, setLotSize] = useState<number>(5.0);

  const [driftThreshold, setDriftThreshold] = useState<number>(0.002);
  const [minEdge, setMinEdge] = useState<number>(0.03);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.8);
  const [targetSpread, setTargetSpread] = useState<number>(0.04);
  const [inventoryAversion, setInventoryAversion] = useState<number>(0.015);

  const [showFrictionSettings, setShowFrictionSettings] = useState<boolean>(false);
  const [slippageBps, setSlippageBps] = useState<number>(4.0);
  const [feeBps, setFeeBps] = useState<number>(2.5);
  const [latencyMs, setLatencyMs] = useState<number>(25.0);

  const [chartView, setChartView] = useState<'equity' | 'drawdown'>('equity');

  const [tradeFilter, setTradeFilter] = useState<'ALL' | 'WINS' | 'LOSSES'>('ALL');
  const [tradePage, setTradePage] = useState<number>(1);
  const [tradePageSize, setTradePageSize] = useState<number>(50);

  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [deployedSuccess, setDeployedSuccess] = useState<boolean>(false);

  const handleRunSimulation = useCallback(async () => {
    setDeployedSuccess(false);
    if (agentCategory === 'CUSTOM' && activeCustomAgent) {
      await runSimulation({
        agentType: 'CUSTOM',
        symbol: activeCustomAgent.symbol || symbol,
        period,
        timeframe: (activeCustomAgent.timeframe as any) || timeframe,
        startDate: period === 'custom' ? new Date(customStartDate).toISOString() : undefined,
        endDate: period === 'custom' ? new Date(customEndDate).toISOString() : undefined,
        initialCapital,
        strategyConfig: { lotSize },
        frictionConfig: { slippageBps, feeBps, latencyMs },
        customRules: activeCustomAgent.rules,
        customAgentId: activeCustomAgent.id,
      });
    } else {
      await runSimulation({
        agentType: selectedAgent,
        symbol,
        period,
        timeframe,
        startDate: period === 'custom' ? new Date(customStartDate).toISOString() : undefined,
        endDate: period === 'custom' ? new Date(customEndDate).toISOString() : undefined,
        initialCapital,
        strategyConfig: { driftThreshold, minEdge, confidenceThreshold, targetSpread, inventoryAversion, lotSize },
        frictionConfig: { slippageBps, feeBps, latencyMs },
      });
    }
  }, [
    agentCategory,
    activeCustomAgent,
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

  useEffect(() => {
    if (initialConfig) {
      if (
        initialConfig.agentType === 'CUSTOM' ||
        initialConfig.customAgentId ||
        initialConfig.customDraft ||
        initialConfig.customRules
      ) {
        setAgentCategory('CUSTOM');
        if (initialConfig.customAgentId) {
          setSelectedCustomAgentId(initialConfig.customAgentId);
        }
        if (initialConfig.symbol) {
          setSymbol(initialConfig.symbol);
        } else if (initialConfig.customDraft?.symbol) {
          setSymbol(initialConfig.customDraft.symbol);
        }
        if (initialConfig.timeframe) {
          setTimeframe(initialConfig.timeframe);
        } else if (initialConfig.customDraft?.timeframe) {
          setTimeframe(initialConfig.customDraft.timeframe as any);
        }
      } else if (
        initialConfig.agentType === 'Volt' ||
        initialConfig.agentType === 'Oracle' ||
        initialConfig.agentType === 'Titan'
      ) {
        setAgentCategory('PROTOCOL');
        setSelectedAgent(initialConfig.agentType);
      }
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

  // When customAgents finish loading, select the requested custom agent if specified
  useEffect(() => {
    if (initialConfig?.customAgentId && customAgents.length > 0) {
      const found = customAgents.find((a) => a.id === initialConfig.customAgentId);
      if (found) {
        setSelectedCustomAgentId(found.id);
        if (found.symbol) setSymbol(found.symbol);
        if (found.timeframe) setTimeframe(found.timeframe as any);
      }
    }
  }, [initialConfig?.customAgentId, customAgents]);

  // Keep symbol & timeframe in sync with active custom agent
  useEffect(() => {
    if (agentCategory === 'CUSTOM' && activeCustomAgent) {
      if (activeCustomAgent.symbol && activeCustomAgent.symbol !== symbol) {
        setSymbol(activeCustomAgent.symbol);
      }
      if (activeCustomAgent.timeframe && activeCustomAgent.timeframe !== timeframe) {
        setTimeframe(activeCustomAgent.timeframe as any);
      }
    }
  }, [agentCategory, activeCustomAgent?.id]);

  useEffect(() => {
    handleRunSimulation();
  }, [agentCategory, selectedAgent, selectedCustomAgentId, symbol, period, timeframe]);

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
      if (!wallet.address) return;
      setIsDeploying(true);
      try {
        // Deploy backtested parameters to isolated personal swarm (activates PERSONAL mode)
        const personalConfig: Record<string, any> = {};
        if (selectedAgent === 'Volt') personalConfig.driftThreshold = driftThreshold;
        if (selectedAgent === 'Volt' || selectedAgent === 'Oracle') personalConfig.minEdge = minEdge;
        if (selectedAgent === 'Oracle') personalConfig.confidenceThreshold = confidenceThreshold;
        if (selectedAgent === 'Titan') {
          personalConfig.targetSpread = targetSpread;
          personalConfig.inventoryAversion = inventoryAversion;
        }
        personalConfig.lotSize = lotSize;
        if (currentResult) {
          const { apiClient } = await import('../services/api.js');
          const ok = await apiClient.updatePersonalAgentConfig(wallet.address, selectedAgent, personalConfig);
          if (ok?.success) {
            // Ensure mode is PERSONAL
            await apiClient.setPersonalSwarmMode(wallet.address, 'PERSONAL').catch(() => {});
            setDeployedSuccess(true);
            setTimeout(() => setDeployedSuccess(false), 4000);
          }
        } else {
          // No backtest yet — deploy current slider values directly
          const { apiClient } = await import('../services/api.js');
          const ok = await apiClient.updatePersonalAgentConfig(wallet.address, selectedAgent, personalConfig);
          if (ok?.success) {
            await apiClient.setPersonalSwarmMode(wallet.address, 'PERSONAL').catch(() => {});
            setDeployedSuccess(true);
            setTimeout(() => setDeployedSuccess(false), 4000);
          }
        }
      } catch (e) {
        console.warn('[StrategyStudio] personal deploy failed', e);
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

  const handleDeployToFleet = async () => {
    if (isGuest) {
      if (onConnectWallet) await onConnectWallet();
      return;
    }
    if (!wallet.address) return;
    setIsDeployingToFleet(true);
    try {
      if (agentCategory === 'CUSTOM' && activeCustomAgent) {
        if (
          activeCustomAgent.id &&
          activeCustomAgent.id !== 'draft-preview' &&
          !activeCustomAgent.id.startsWith('draft-') &&
          customAgents.some((a) => a.id === activeCustomAgent.id)
        ) {
          await deployAgent(activeCustomAgent.id, deploymentAllowance);
        } else {
          await createAgent({
            name: activeCustomAgent.name || `${symbol.split('/')[0]} Custom Strategy`,
            description: activeCustomAgent.description || 'Deployed from Backtester Lab',
            symbol: activeCustomAgent.symbol || symbol,
            timeframe: activeCustomAgent.timeframe || timeframe,
            strategyType: activeCustomAgent.strategyType || 'CUSTOM',
            rules: activeCustomAgent.rules,
            color: activeCustomAgent.color || '#2dd4bf',
            icon: activeCustomAgent.icon || 'BoltIcon',
            isDeployed: true,
            allocatedAllowance: deploymentAllowance,
          });
        }
        soundEngine.playWinChime();
        setFleetDeploySuccessMsg(`Successfully deployed to Fleet Command ($${deploymentAllowance} tUSDC)!`);
        setTimeout(() => {
          window.location.hash = '#cockpit';
        }, 900);
      } else {
        const personalConfig: Record<string, any> = {};
        if (selectedAgent === 'Volt') personalConfig.driftThreshold = driftThreshold;
        if (selectedAgent === 'Volt' || selectedAgent === 'Oracle') personalConfig.minEdge = minEdge;
        if (selectedAgent === 'Oracle') personalConfig.confidenceThreshold = confidenceThreshold;
        if (selectedAgent === 'Titan') {
          personalConfig.targetSpread = targetSpread;
          personalConfig.inventoryAversion = inventoryAversion;
        }
        personalConfig.lotSize = lotSize;
        const { apiClient } = await import('../services/api.js');
        await apiClient.updatePersonalAgentConfig(wallet.address, selectedAgent, personalConfig);
        await apiClient.setPersonalSwarmMode(wallet.address, 'PERSONAL').catch(() => {});
        soundEngine.playWinChime();
        setFleetDeploySuccessMsg(`Successfully updated and deployed ${selectedAgent} in Fleet Command!`);
        setTimeout(() => {
          window.location.hash = '#cockpit';
        }, 900);
      }
    } catch (e: any) {
      console.warn('[StrategyStudio] deploy to fleet failed', e);
    } finally {
      setIsDeployingToFleet(false);
    }
  };

  const handleExportCsv = () => {
    if (!currentResult || currentResult.trades.length === 0) return;
    const headers = ['ID', 'Timestamp', 'Strategy Action', 'Outcome', 'Fill Price', 'Lots', 'Gross PnL', 'Fee', 'Net PnL', 'Cumulative PnL'];
    const rows = currentResult.trades.map((t) => [t.id, t.timestamp, t.action, t.outcome, t.price.toFixed(2), t.lots, (t.grossPnl ?? t.pnl).toFixed(2), (t.fee ?? 0).toFixed(3), t.pnl.toFixed(2), t.cumulativePnl.toFixed(2)]);
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

  const filteredTrades = useMemo(() => {
    if (!currentResult?.trades) return [];
    if (tradeFilter === 'WINS') return currentResult.trades.filter((t) => t.pnl > 0);
    if (tradeFilter === 'LOSSES') return currentResult.trades.filter((t) => t.pnl <= 0);
    return currentResult.trades;
  }, [currentResult, tradeFilter]);

  const winsCount = useMemo(() => currentResult?.trades.filter((t) => t.pnl > 0).length ?? 0, [currentResult]);
  const lossesCount = useMemo(() => (currentResult ? currentResult.trades.length - winsCount : 0), [currentResult, winsCount]);

  useEffect(() => {
    setTradePage(1);
  }, [tradeFilter, currentResult?.id]);

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

  const downsampleCurve = useCallback(<T,>(points: T[], maxPoints = 800): T[] => {
    if (points.length <= maxPoints) return points;
    const step = Math.ceil(points.length / maxPoints);
    const sampled: T[] = [];
    for (let i = 0; i < points.length; i += step) sampled.push(points[i]!);
    if (sampled[sampled.length - 1] !== points[points.length - 1]) sampled.push(points[points.length - 1]!);
    return sampled;
  }, []);

  const svgWidth = 840;
  const svgHeight = 240;
  const padding = 24;

  const rawEquityPoints = currentResult?.equityCurve || [];
  const rawUnderwaterPoints = currentResult?.underwaterCurve || [];
  const equityPoints = useMemo(() => downsampleCurve(rawEquityPoints, 800), [rawEquityPoints, downsampleCurve]);
  const underwaterPoints = useMemo(() => downsampleCurve(rawUnderwaterPoints, 800), [rawUnderwaterPoints, downsampleCurve]);

  const minEquity = useMemo(() => (equityPoints.length > 0 ? Math.min(...equityPoints.map((p) => p.equity)) * 0.98 : 950), [equityPoints]);
  const maxEquity = useMemo(() => (equityPoints.length > 0 ? Math.max(...equityPoints.map((p) => p.equity)) * 1.02 : 1400), [equityPoints]);
  const rangeEquity = maxEquity - minEquity || 1;

  const equityPathPoints = useMemo(() => equityPoints.map((p, i) => {
    const x = padding + (i / (equityPoints.length - 1 || 1)) * (svgWidth - padding * 2);
    const y = svgHeight - padding - ((p.equity - minEquity) / rangeEquity) * (svgHeight - padding * 2);
    return `${x},${y}`;
  }), [equityPoints, minEquity, rangeEquity]);

  const equityLinePath = equityPathPoints.length > 0 ? `M ${equityPathPoints.join(' L ')}` : '';
  const equityAreaPath = equityPathPoints.length > 0 ? `M ${padding},${svgHeight - padding} L ${equityPathPoints.join(' L ')} L ${svgWidth - padding},${svgHeight - padding} Z` : '';

  const maxDrawdownPct = useMemo(() => (underwaterPoints.length > 0 ? Math.max(5, Math.max(...underwaterPoints.map((p) => p.drawdownPct)) * 1.15) : 10), [underwaterPoints]);
  const drawdownPathPoints = useMemo(() => underwaterPoints.map((p, i) => {
    const x = padding + (i / (underwaterPoints.length - 1 || 1)) * (svgWidth - padding * 2);
    const y = padding + (p.drawdownPct / maxDrawdownPct) * (svgHeight - padding * 2);
    return `${x},${y}`;
  }), [underwaterPoints, maxDrawdownPct]);

  const drawdownLinePath = drawdownPathPoints.length > 0 ? `M ${drawdownPathPoints.join(' L ')}` : '';
  const drawdownAreaPath = drawdownPathPoints.length > 0 ? `M ${padding},${padding} L ${drawdownPathPoints.join(' L ')} L ${svgWidth - padding},${padding} Z` : '';

  const activeColor = agentCategory === 'CUSTOM' ? (activeCustomAgent?.color || '#2dd4bf') : (STRATEGY_THEME[selectedAgent] ?? STRATEGY_THEME.Volt).color;
  const theme = STRATEGY_THEME[selectedAgent] ?? STRATEGY_THEME.Volt;
  const lotColor = activeColor;

  return (
    <div className="flex flex-col gap-3.5 pb-8">
      {/* ---------- 1. Studio Header + Strategy Selector ---------- */}
      <div className="terminal-panel p-0 overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border/40 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg grid place-items-center border flex-shrink-0 bg-secondary/30 border-border/50 text-muted-foreground">
              <ChartBarIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold tracking-tight text-foreground leading-none">Quantitative Backtester & Strategy Lab</h2>
              <p className="text-[11px] text-muted-foreground mt-1 hidden sm:block">Replay protocol agents and custom user strategies over historical candlestick data with real market friction</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button type="button" onClick={handleExportCsv} disabled={!currentResult || currentResult.trades.length === 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-secondary/30 border-border/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button type="button" onClick={handleRunSimulation} disabled={isLoading} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg border text-xs font-bold transition-all disabled:opacity-60" style={{ background: activeColor, color: '#09090b', borderColor: activeColor, boxShadow: `0 0 12px ${activeColor}28` }}>
              {isLoading ? <Spinner size="xs" variant="amber" /> : <PlayIcon className="w-3.5 h-3.5 fill-current" />}
              <span>{isLoading ? 'Simulating…' : 'Run Backtest Replay'}</span>
            </button>
          </div>
        </div>

        {/* Category Switcher: Protocol vs Custom */}
        <div className="flex items-center justify-between px-3.5 pt-3.5 pb-1 border-b border-border/30 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-secondary/30 border border-border/50">
            <button
              type="button"
              onClick={() => setAgentCategory('PROTOCOL')}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-semibold transition-all',
                agentCategory === 'PROTOCOL' ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Protocol Swarm Agents ({Object.keys(STRATEGY_THEME).length})
            </button>
            <button
              type="button"
              onClick={() => setAgentCategory('CUSTOM')}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
                agentCategory === 'CUSTOM' ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <SparklesIcon className="w-3.5 h-3.5" />
              Custom User Agents ({customAgents.length})
            </button>
          </div>
          {agentCategory === 'CUSTOM' && (
            <a
              href="#studio"
              className="text-xs text-primary hover:underline font-mono flex items-center gap-1 font-semibold"
            >
              <span>+ Build New Agent in Studio</span>
              <ArrowUpRightIcon className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Strategy Selector — Cards */}
        {agentCategory === 'PROTOCOL' ? (
          <div className="p-3.5 grid grid-cols-1 md:grid-cols-3 gap-3">
            {(Object.keys(STRATEGY_THEME) as Array<BacktestAgentType>).map((key) => {
              const th = STRATEGY_THEME[key];
              const Icon = th.Icon;
              const isActive = selectedAgent === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedAgent(key)}
                  className={cn('relative text-left p-3.5 rounded-xl border flex flex-col gap-2 transition-all overflow-hidden')}
                  style={{
                    background: isActive ? th.bg : 'hsl(var(--secondary)/0.22)',
                    borderColor: isActive ? th.border : 'hsl(var(--border)/0.5)',
                    boxShadow: isActive ? `0 0 0 1px ${th.border}` : 'none',
                  }}
                >
                  <div className="absolute top-0 left-0 right-0 h-[2.5px]" style={{ background: th.color, opacity: isActive ? 1 : 0.35 }} />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg grid place-items-center border flex-shrink-0 bg-secondary/30 border-border/50 text-muted-foreground">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold tracking-tight text-foreground">{key} {key === 'Volt' ? 'Sniper' : key === 'Oracle' ? 'Vol Arb' : 'Market Maker'}</span>
                    </div>
                    <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 border font-semibold" style={{ background: th.bg, borderColor: th.border, color: th.color }}>
                      {th.tag}
                    </Badge>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2 m-0">{th.desc}</p>
                </button>
              );
            })}
          </div>
        ) : displayedCustomAgents.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <SparklesIcon className="w-8 h-8 text-primary/60" />
            <span className="text-xs font-semibold text-foreground">No Custom Strategies Found</span>
            <p className="text-[11px] max-w-sm">Create your first autonomous trading strategy in the Strategy Studio with Gemini natural language prompts or visual capsules.</p>
            <a href="#studio" className="mt-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold">Open Strategy Studio</a>
          </div>
        ) : (
          <div className="p-3.5 grid grid-cols-1 md:grid-cols-3 gap-3">
            {displayedCustomAgents.map((agent) => {
              const isActive = activeCustomAgent?.id === agent.id;
              const agentColor = agent.color || '#2dd4bf';
              const isDraft = agent.id === 'draft-preview';
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedCustomAgentId(agent.id)}
                  className={cn('relative text-left p-3.5 rounded-xl border flex flex-col gap-2 transition-all overflow-hidden')}
                  style={{
                    background: isActive ? `${agentColor}12` : 'hsl(var(--secondary)/0.22)',
                    borderColor: isActive ? agentColor : 'hsl(var(--border)/0.5)',
                    boxShadow: isActive ? `0 0 12px ${agentColor}25` : 'none',
                  }}
                >
                  <div className="absolute top-0 left-0 right-0 h-[2.5px]" style={{ background: agentColor, opacity: isActive ? 1 : 0.4 }} />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg grid place-items-center border flex-shrink-0 bg-secondary/30 border-border/50" style={{ color: agentColor }}>
                        <SparklesIcon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold tracking-tight text-foreground truncate">{agent.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {isDraft && (
                        <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 border font-semibold border-amber-500/50 text-amber-400 bg-amber-500/10">
                          Active Draft
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 border font-semibold" style={{ borderColor: `${agentColor}50`, color: agentColor }}>
                        {agent.strategyType}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2 m-0">{agent.description || 'Custom user strategy'}</p>
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-secondary/50 border border-border/50 text-foreground">
                      {agent.symbol} · {agent.timeframe}
                    </span>
                    <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-secondary/50 border border-border/50 text-foreground">
                      {agent.rules?.action?.direction || 'CALL'} · {agent.rules?.action?.durationSec || 60}s
                    </span>
                    <span
                      className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border"
                      style={{
                        background: (agent.pnl ?? 0) >= 0 ? 'rgba(52,211,153,0.1)' : 'rgba(244,63,94,0.1)',
                        borderColor: (agent.pnl ?? 0) >= 0 ? 'rgba(52,211,153,0.25)' : 'rgba(244,63,94,0.25)',
                        color: (agent.pnl ?? 0) >= 0 ? '#6ee7b7' : '#fda4af',
                      }}
                    >
                      {(agent.pnl ?? 0) >= 0 ? `+${(agent.pnl ?? 0).toFixed(2)}` : (agent.pnl ?? 0).toFixed(2)} tUSDC
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ---------- Controls Bar ---------- */}
        <div className="px-4 py-4 bg-secondary/10 border-t border-border/30 flex flex-col gap-4">
          {/* Row 1: Market / Period / Granularity / Capital */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Market */}
            <div ref={dropdownRef} className="custom-dropdown-container">
              <label className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5 mb-2">
                Underlying Market Asset
              </label>
              <div className={cn('custom-dropdown-trigger', isMarketDropdownOpen && 'open')} onClick={() => setIsMarketDropdownOpen(!isMarketDropdownOpen)}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border" style={{ background: `${selectedMarketOption.color}14`, color: selectedMarketOption.color, borderColor: `${selectedMarketOption.color}30` }}>{selectedMarketOption.badge}</span>
                  <span className="text-xs font-bold text-foreground">{selectedMarketOption.name}</span>
                </div>
                <ChevronDownIcon className="w-3.5 h-3.5 text-muted-foreground" style={{ transform: isMarketDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </div>
              {isMarketDropdownOpen && (
                <div className="custom-dropdown-menu">
                  {MARKET_OPTIONS.map((opt) => {
                    const isSel = opt.symbol === symbol;
                    return (
                      <div key={opt.symbol} className={cn('custom-dropdown-item', isSel && 'selected')} onClick={() => { setSymbol(opt.symbol); setIsMarketDropdownOpen(false); }}>
                        <div className="flex items-center gap-2.5">
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border" style={{ background: `${opt.color}14`, color: opt.color, borderColor: `${opt.color}30` }}>{opt.badge}</span>
                          <div>
                            <div className="text-xs font-bold" style={{ color: isSel ? '#2dd4bf' : '#fafafa' }}>{opt.name}</div>
                            <div className="text-[10px] text-muted-foreground">{opt.label}</div>
                          </div>
                        </div>
                        {isSel && <CheckCircleIcon className="w-3.5 h-3.5 text-teal-400" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Period */}
            <div>
              <label className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5 mb-2">
                <CalendarIcon className="w-3 h-3 text-muted-foreground" /> Historical Period Horizon
              </label>
              <div className="flex items-center gap-1 bg-secondary/30 p-0.5 rounded-lg border border-border/40 flex-wrap">
                {(['24h', '3d', '7d', '14d', '30d', 'custom'] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setPeriod(p)} className={cn('px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer', period === p ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50')}>
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Granularity */}
            <div>
              <label className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5 mb-2">
                <ClockIcon className="w-3 h-3 text-muted-foreground" /> Candle Granularity
              </label>
              <div className="flex items-center gap-1 bg-secondary/30 p-0.5 rounded-lg border border-border/40">
                {(['1m', '5m', '15m', '1h'] as const).map((tf) => (
                  <button key={tf} type="button" onClick={() => setTimeframe(tf)} className={cn('flex-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer', timeframe === tf ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50')}>
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Capital */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">Replay Capital</span>
                <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded border" style={{ background: `${theme.color}14`, color: theme.color, borderColor: `${theme.color}28` }}>${initialCapital.toLocaleString()}</span>
              </div>
              <input type="range" min={200} max={10000} step={100} value={initialCapital} onChange={(e) => setInitialCapital(parseFloat(e.target.value))} style={{ width: '100%', accentColor: theme.color }} />
            </div>
          </div>

          {/* Custom dates */}
          {period === 'custom' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-xl border border-dashed bg-secondary/20" style={{ borderColor: 'rgba(45,212,191,0.22)' }}>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground mb-1 block">Start Date & Time (UTC)</label>
                <input type="datetime-local" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/50 text-xs font-mono text-foreground focus:outline-none focus:border-border" />
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground mb-1 block">End Date & Time (UTC)</label>
                <input type="datetime-local" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/50 text-xs font-mono text-foreground focus:outline-none focus:border-border" />
              </div>
            </div>
          )}

          {/* Strategy knobs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3.5 rounded-xl border bg-secondary/20 border-border/50">
            {selectedAgent === 'Volt' && (
              <>
                <SliderMini label="Spot Drift Velocity Trigger" value={`${(driftThreshold * 100).toFixed(2)}%`} color={STRATEGY_THEME.Volt.color}>
                  <input type="range" min={0.0005} max={0.01} step={0.0005} value={driftThreshold} onChange={(e) => setDriftThreshold(parseFloat(e.target.value))} style={{ width: '100%', accentColor: STRATEGY_THEME.Volt.color }} />
                </SliderMini>
                <SliderMini label="Min Latency Edge" value={`${(minEdge * 100).toFixed(1)}%`} color={STRATEGY_THEME.Volt.color}>
                  <input type="range" min={0.01} max={0.1} step={0.005} value={minEdge} onChange={(e) => setMinEdge(parseFloat(e.target.value))} style={{ width: '100%', accentColor: STRATEGY_THEME.Volt.color }} />
                </SliderMini>
              </>
            )}
            {selectedAgent === 'Oracle' && (
              <>
                <SliderMini label="Min Probability Edge Φ(z)" value={`${(minEdge * 100).toFixed(1)}%`} color={STRATEGY_THEME.Oracle.color}>
                  <input type="range" min={0.01} max={0.1} step={0.005} value={minEdge} onChange={(e) => setMinEdge(parseFloat(e.target.value))} style={{ width: '100%', accentColor: STRATEGY_THEME.Oracle.color }} />
                </SliderMini>
                <SliderMini label="Confidence Filter" value={`${(confidenceThreshold * 100).toFixed(0)}%`} color={STRATEGY_THEME.Oracle.color}>
                  <input type="range" min={0.5} max={0.95} step={0.05} value={confidenceThreshold} onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))} style={{ width: '100%', accentColor: STRATEGY_THEME.Oracle.color }} />
                </SliderMini>
              </>
            )}
            {selectedAgent === 'Titan' && (
              <>
                <SliderMini label="Target Bid/Ask Spread" value={`${(targetSpread * 100).toFixed(1)}%`} color={STRATEGY_THEME.Titan.color}>
                  <input type="range" min={0.02} max={0.1} step={0.005} value={targetSpread} onChange={(e) => setTargetSpread(parseFloat(e.target.value))} style={{ width: '100%', accentColor: STRATEGY_THEME.Titan.color }} />
                </SliderMini>
                <SliderMini label="Inventory Aversion (γ)" value={inventoryAversion.toFixed(3)} color={STRATEGY_THEME.Titan.color}>
                  <input type="range" min={0.005} max={0.05} step={0.005} value={inventoryAversion} onChange={(e) => setInventoryAversion(parseFloat(e.target.value))} style={{ width: '100%', accentColor: STRATEGY_THEME.Titan.color }} />
                </SliderMini>
              </>
            )}
            <SliderMini label="Order Lot Size" value={`${lotSize} Lots`} color={lotColor}>
              <input type="range" min={1} max={50} step={1} value={lotSize} onChange={(e) => setLotSize(parseFloat(e.target.value))} style={{ width: '100%', accentColor: lotColor }} />
            </SliderMini>
          </div>

          {/* Friction */}
          <div>
            <button type="button" onClick={() => setShowFrictionSettings(!showFrictionSettings)} className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors">
              <ShieldExclamationIcon className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-semibold text-foreground">Execution Microstructure & Friction Controls</span>
              <span className="text-[10px]">({slippageBps} bps slippage, {feeBps} bps fee, {latencyMs}ms latency)</span>
              {showFrictionSettings ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
            </button>
            {showFrictionSettings && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 p-3.5 rounded-xl border bg-secondary/20 border-border/50">
                <SliderMini label="Simulated Taker Slippage" value={`${slippageBps} bps`} color="#2dd4bf">
                  <input type="range" min={0} max={40} step={1} value={slippageBps} onChange={(e) => setSlippageBps(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#2dd4bf' }} />
                </SliderMini>
                <SliderMini label="Somnia CLOB Exchange Fee" value={`${feeBps} bps`} color="#2dd4bf">
                  <input type="range" min={0} max={15} step={0.5} value={feeBps} onChange={(e) => setFeeBps(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#2dd4bf' }} />
                </SliderMini>
                <SliderMini label="Network Latency Penalty" value={`${latencyMs} ms`} color="#2dd4bf">
                  <input type="range" min={0} max={250} step={10} value={latencyMs} onChange={(e) => setLatencyMs(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#2dd4bf' }} />
                </SliderMini>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------- 2. Metrics Grid ---------- */}
      {isLoading && !currentResult ? (
        <StrategyStudioSkeleton />
      ) : currentResult ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Net Strategy PnL" value={`${currentResult.netPnl >= 0 ? '+' : ''}$${currentResult.netPnl.toFixed(2)}`} sub={`${((currentResult.netPnl / currentResult.initialCapital) * 100).toFixed(1)}% Total Return`} color={currentResult.netPnl >= 0 ? '#6ee7b7' : '#fda4af'} icon={ArrowTrendingUpIcon} />
          <MetricCard label="Win Rate" value={`${currentResult.winRate.toFixed(1)}%`} sub={`${currentResult.totalWins ?? Math.round((currentResult.winRate / 100) * currentResult.totalTrades)} of ${currentResult.totalTrades} Wins`} color="#2dd4bf" icon={CheckCircleIcon} />
          <MetricCard label="Sharpe Ratio" value={currentResult.sharpeRatio.toFixed(2)} sub="Risk-Adjusted Alpha" color="#a78bfa" icon={SparklesIcon} />
          <MetricCard label="Sortino Ratio" value={(currentResult.sortinoRatio ?? currentResult.sharpeRatio * 1.25).toFixed(2)} sub="Downside Semivariance" color="#7dd3fc" icon={ChartBarIcon} />
          <MetricCard label="Max Drawdown" value={`${currentResult.maxDrawdown.toFixed(2)}%`} sub="Peak-to-Trough Dip" color="#fda4af" icon={ArrowUpRightIcon} />
          <MetricCard label="Profit Factor" value={(currentResult.profitFactor ?? 1.85).toFixed(2)} sub="Gross Gains / Losses" color="#6ee7b7" icon={CurrencyDollarIcon} />
          <MetricCard label="Trade Expectancy" value={`${(currentResult.expectancy ?? 0.85) >= 0 ? '+' : ''}$${(currentResult.expectancy ?? 0.85).toFixed(2)}`} sub="Expected Net / Trade" color="#2dd4bf" icon={CurrencyDollarIcon} />
          <div className="terminal-panel p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">{isOperator ? 'Global Swarm (Operator)' : isTrader ? 'My Personal Swarm' : 'Automation'}</span>
              {isOperator ? <CpuChipIcon className="w-3.5 h-3.5 text-muted-foreground/60" /> : isTrader ? <BoltIcon className="w-3.5 h-3.5 text-muted-foreground/60" /> : <WalletIcon className="w-3.5 h-3.5 text-muted-foreground/60" />}
            </div>
            <button type="button" onClick={handleDeploy} disabled={isDeploying || deployedSuccess} className="mt-3 w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-bold transition-colors disabled:opacity-60" style={{ background: deployedSuccess ? 'rgba(52,211,153,0.12)' : isGuest ? 'hsl(var(--secondary)/0.4)' : theme.color, color: deployedSuccess ? '#6ee7b7' : isGuest ? 'var(--muted-foreground)' : '#09090b', borderColor: deployedSuccess ? 'rgba(52,211,153,0.22)' : isGuest ? 'hsl(var(--border)/0.5)' : theme.color }}>
              {deployedSuccess ? <><CheckCircleIcon className="w-3.5 h-3.5" /> {isOperator ? 'Applied to Global Swarm!' : 'Deployed to My Swarm!'}</> : isGuest ? <><WalletIcon className="w-3.5 h-3.5" /> Connect to Deploy</> : isTrader && !activeSession?.isActive ? <><KeyIcon className="w-3.5 h-3.5" /> Delegate Session First</> : isTrader ? <>{isDeploying ? <Spinner size="xs" variant="cyan" /> : <BoltIcon className="w-3.5 h-3.5" />}{isDeploying ? 'Deploying…' : 'Deploy to My Personal Swarm'}</> : <>{isDeploying ? <Spinner size="xs" variant="amber" /> : <CpuChipIcon className="w-3.5 h-3.5" />}{isDeploying ? 'Updating…' : 'Deploy to Global Swarm'}</>}
            </button>
            {isTrader && !deployedSuccess && (
              <div className="text-[10px] text-muted-foreground mt-1.5 leading-snug">Activates your isolated swarm — copy-trading is disabled once personalized. Revert in Swarm Cockpit.</div>
            )}
          </div>
        </div>
      ) : null}

      {/* ---------- High-Impact Fleet Deployment Action Card ---------- */}
      {currentResult && (
        <div className="terminal-panel p-4 border border-primary/40 bg-gradient-to-r from-primary/10 via-secondary/20 to-card/60 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/40 text-primary grid place-items-center flex-shrink-0 mt-0.5">
              <RocketLaunchIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-foreground">
                  Satisfied with this strategy's historical metrics?
                </h3>
                <Badge variant="outline" className="text-[9px] font-mono border-primary/40 text-primary bg-primary/10">
                  Fleet Command Bridge
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-xl leading-relaxed">
                Instantly deploy this configuration to your active running fleet with a dedicated tUSDC bankroll allowance. Autonomous evaluation begins immediately on Somnia CLOB.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
            {/* Allowance Preset Buttons */}
            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-background/80 border border-border/60">
              <span className="text-[10px] font-mono text-muted-foreground pl-1.5 pr-1 flex items-center gap-1">
                <BanknotesIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span>Allowance:</span>
              </span>
              {[50, 100, 250, 500].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setDeploymentAllowance(amt)}
                  className={cn(
                    'px-2 py-0.5 rounded text-xs font-mono font-bold transition-all cursor-pointer',
                    deploymentAllowance === amt
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  ${amt}
                </button>
              ))}
              <div className="flex items-center gap-1 border-l border-border/40 pl-1.5">
                <input
                  type="number"
                  min={10}
                  max={10000}
                  value={deploymentAllowance}
                  onChange={(e) => setDeploymentAllowance(Math.max(1, Number(e.target.value)))}
                  className="w-16 px-1 py-0.5 rounded bg-secondary/40 border border-border/60 text-xs font-mono font-bold text-foreground text-right"
                />
                <span className="text-[10px] font-mono text-muted-foreground pr-1">tUSDC</span>
              </div>
            </div>

            {/* Deployment Actions */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleDeployToFleet}
                disabled={isDeployingToFleet || Boolean(fleetDeploySuccessMsg)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-all cursor-pointer disabled:opacity-60 shadow-md whitespace-nowrap"
              >
                {isDeployingToFleet ? (
                  <Spinner size="xs" />
                ) : fleetDeploySuccessMsg ? (
                  <CheckCircleIcon className="w-4 h-4 text-zinc-950" />
                ) : (
                  <RocketLaunchIcon className="w-4 h-4" />
                )}
                <span>
                  {fleetDeploySuccessMsg
                    ? 'Deployed! Redirecting...'
                    : `Deploy to Active Fleet ($${deploymentAllowance} tUSDC)`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  window.location.hash = '#studio';
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-border/60 bg-secondary/40 hover:bg-secondary/70 text-xs font-bold text-muted-foreground hover:text-foreground transition-all cursor-pointer whitespace-nowrap"
                title="Open Strategy Studio to customize indicator rules and logic capsules"
              >
                <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Edit in Studio</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- 3. Chart Deck ---------- */}
      {currentResult && (
        <div className="terminal-panel p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40 flex-wrap">
            <div className="flex items-center gap-1 bg-secondary/30 p-0.5 rounded-lg border border-border/40">
              <button type="button" onClick={() => setChartView('equity')} className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold transition-colors', chartView === 'equity' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <ArrowTrendingUpIcon className="w-3.5 h-3.5" /> Portfolio Equity ($)
              </button>
              <button type="button" onClick={() => setChartView('drawdown')} className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold transition-colors', chartView === 'drawdown' ? 'bg-rose-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <ChartBarIcon className="w-3.5 h-3.5" /> Underwater Drawdown (%)
              </button>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground flex-wrap">
              <span>Total Fills: <strong className="text-foreground">{currentResult.totalTrades}</strong></span>
              <span>Fees Paid: <strong style={{ color: '#fbbf24' }}>${(currentResult.totalFeesPaid ?? 0).toFixed(2)}</strong></span>
              <span>Payoff Ratio: <strong className="text-teal-400">{(currentResult.payoffRatio ?? 1.6).toFixed(2)}x</strong></span>
            </div>
          </div>
          <div className="p-4">
            <div className="w-full h-[240px]">
              {chartView === 'equity' ? (
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
                  <defs><linearGradient id="equityGrad2" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor={theme.color} stopOpacity="0.28" /><stop offset="100%" stopColor={theme.color} stopOpacity="0" /></linearGradient></defs>
                  <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                  <line x1={padding} y1={svgHeight / 2} x2={svgWidth - padding} y2={svgHeight / 2} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                  <line x1={padding} y1={svgHeight - padding} x2={svgWidth - padding} y2={svgHeight - padding} stroke="rgba(255,255,255,0.1)" />
                  {equityAreaPath && <path d={equityAreaPath} fill="url(#equityGrad2)" />}
                  {equityLinePath && <path d={equityLinePath} fill="none" stroke={theme.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                </svg>
              ) : (
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
                  <defs><linearGradient id="drawdownGrad2" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#fda4af" stopOpacity="0.32" /><stop offset="100%" stopColor="#fda4af" stopOpacity="0" /></linearGradient></defs>
                  <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} stroke="rgba(244,63,94,0.3)" />
                  <line x1={padding} y1={svgHeight / 2} x2={svgWidth - padding} y2={svgHeight / 2} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                  <line x1={padding} y1={svgHeight - padding} x2={svgWidth - padding} y2={svgHeight - padding} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                  {drawdownAreaPath && <path d={drawdownAreaPath} fill="url(#drawdownGrad2)" />}
                  {drawdownLinePath && <path d={drawdownLinePath} fill="none" stroke="#fda4af" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
                </svg>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------- 4. Executions Table ---------- */}
      {currentResult && (
        <div className="terminal-panel p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40 flex-wrap">
            <div className="flex items-center gap-2">
              <QueueListIcon className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-xs font-bold tracking-tight text-foreground">Replay Executions Breakdown</h3>
              <Badge variant="outline" className="font-mono text-[10px] bg-secondary/40 border-border/50 text-muted-foreground">{currentResult.trades.length} trades</Badge>
            </div>
            <div className="flex items-center gap-1 bg-secondary/30 p-0.5 rounded-lg border border-border/40">
              {(['ALL', 'WINS', 'LOSSES'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setTradeFilter(f)} className={cn('px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors', tradeFilter === f ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  {f === 'ALL' ? `All (${currentResult.trades.length})` : f === 'WINS' ? `Wins Only (${winsCount})` : `Losses Only (${lossesCount})`}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-[#111114] border-b border-border/60">
                <tr className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  <th className="px-3 py-2.5 text-left font-semibold">Timestamp</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Strategy Action</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Outcome</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Fill Price</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Lots</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Gross PnL</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Fee</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Net PnL</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Cumulative Equity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {paginatedTrades.map((t) => (
                  <tr key={t.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                    <td className="px-3 py-2 font-semibold text-foreground">{t.action}</td>
                    <td className="px-3 py-2 text-center"><span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border" style={{ background: t.outcome === 'YES' ? 'rgba(52,211,153,0.10)' : 'rgba(244,63,94,0.12)', color: t.outcome === 'YES' ? '#6ee7b7' : '#fda4af', borderColor: t.outcome === 'YES' ? 'rgba(52,211,153,0.22)' : 'rgba(244,63,94,0.22)' }}>{t.outcome}</span></td>
                    <td className="px-3 py-2 text-right font-mono">${t.price.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">{t.lots}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: (t.grossPnl ?? t.pnl) >= 0 ? '#6ee7b7' : '#fda4af' }}>{(t.grossPnl ?? t.pnl) >= 0 ? '+' : ''}${(t.grossPnl ?? t.pnl).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono text-amber-400">${(t.fee ?? 0).toFixed(3)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: t.pnl >= 0 ? '#6ee7b7' : '#fda4af' }}>{t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">${(currentResult.initialCapital + t.cumulativePnl).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/40 bg-secondary/10 flex-wrap">
            <span className="text-[11px] font-mono text-muted-foreground">Showing {(filteredTrades.length === 0 ? 0 : (tradePage - 1) * tradePageSize + 1)}–{Math.min(tradePage * tradePageSize, filteredTrades.length)} of {filteredTrades.length}{tradeFilter !== 'ALL' ? ` • ${currentResult.trades.length} total` : ''} • {totalTradePages} page{totalTradePages !== 1 ? 's' : ''}</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>Rows:</span>
                <select value={tradePageSize} onChange={(e) => { setTradePageSize(Number(e.target.value)); setTradePage(1); }} className="px-2 py-1 rounded-md bg-secondary/40 border border-border/50 text-xs text-foreground focus:outline-none">
                  <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setTradePage((p) => Math.max(1, p - 1))} disabled={tradePage <= 1} className="px-3 py-1 rounded-md border bg-secondary/30 border-border/50 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary/50">Prev</button>
                <span className="px-2 text-xs font-mono text-muted-foreground min-w-[60px] text-center">{tradePage} / {totalTradePages}</span>
                <button type="button" onClick={() => setTradePage((p) => Math.min(totalTradePages, p + 1))} disabled={tradePage >= totalTradePages} className="px-3 py-1 rounded-md border bg-secondary/30 border-border/50 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary/50">Next</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------- helpers ----------
const SliderMini: React.FC<{ label: string; value: string; color: string; children: React.ReactNode }> = ({ label, value, color, children }) => (
  <div>
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded border" style={{ background: `${color}14`, color, borderColor: `${color}28` }}>{value}</span>
    </div>
    {children}
  </div>
);

const MetricCard: React.FC<{ label: string; value: string; sub: string; color: string; icon: React.ElementType }> = ({ label, value, sub, color, icon: Icon }) => (
  <div className="terminal-panel p-3.5 flex flex-col justify-between">
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">{label}</span>
      <Icon className="w-3.5 h-3.5 text-muted-foreground/60" />
    </div>
    <div className="text-lg font-mono font-bold mt-2" style={{ color }}>{value}</div>
    <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>
  </div>
);

export { StrategyStudio as Backtester };
