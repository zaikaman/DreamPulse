import React, { useState, useEffect, useMemo } from 'react';
import {
  BoltIcon,
  AdjustmentsHorizontalIcon,
  ArrowTrendingUpIcon,
  SparklesIcon,
  Square3Stack3DIcon,
  PowerIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  SignalIcon,
  UserIcon,
  ArrowPathIcon,
  BeakerIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  PlusIcon,
  PauseIcon,
  RocketLaunchIcon,
  BanknotesIcon,
  PencilSquareIcon,
  CheckIcon,
  XMarkIcon,
  PlayIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';
import type { AgentType, CustomAgentDefinition } from '../types/index.js';
import { usePersonalSwarm } from '../hooks/usePersonalSwarm.js';
import { useCustomAgents } from '../hooks/useCustomAgents.js';
import { AgentSwarmCockpit } from './AgentSwarmCockpit.js';
import { useAgentSwarm } from '../hooks/useAgentSwarm.js';
import { Spinner } from './ui/Spinner.js';
import { Badge } from './ui/badge.js';
import { cn } from '../lib/utils.js';

interface PersonalSwarmCockpitProps {
  userAddress?: string;
  onForkToStudio?: (agentType: AgentType, config: Record<string, any>) => void;
  onOpenSessionModal?: () => void;
  onConnectWallet?: () => Promise<void>;
  hasActiveSession?: boolean;
  isOperator?: boolean;
}

const AGENT_THEME: Record<string, { color: string; bg: string; border: string; Icon: React.ElementType; label: string; sub: string }> = {
  volt: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.18)', Icon: BoltIcon, label: 'Volt Sniper', sub: 'Personal Latency Drift' },
  oracle: { color: '#2dd4bf', bg: 'rgba(45,212,191,0.08)', border: 'rgba(45,212,191,0.18)', Icon: ArrowTrendingUpIcon, label: 'Oracle Vol Arb', sub: 'Personal Black-Scholes Φ(z)' },
  titan: { color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.18)', Icon: Square3Stack3DIcon, label: 'Titan MM', sub: 'Personal Inventory Skew' },
  sweeper: { color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.18)', Icon: SparklesIcon, label: 'Sweeper Daemon', sub: 'Personal Settlement' },
};

export const PersonalSwarmCockpit: React.FC<PersonalSwarmCockpitProps> = ({
  userAddress,
  onForkToStudio,
  onOpenSessionModal,
  onConnectWallet,
  hasActiveSession = false,
  isOperator = false,
}) => {
  const {
    config,
    status,
    isLoading: isPersonalLoading,
    isSaving,
    isCopyTradeEnabled,
    isCopyMode,
    isPersonalMode,
    setMode,
    toggleCopyTrade,
    toggleAgent,
    updateAgentConfig,
    resetToCopy,
  } = usePersonalSwarm(userAddress);

  // Custom Agents Integration for Fleet Command
  const {
    agents: customAgents,
    deployAgent,
    pauseAgent,
    setAgentAllowance,
  } = useCustomAgents(userAddress);

  // Protocol Benchmark Swarm Data
  const {
    detailed: benchmarkDetailed,
    toggleAgent: benchmarkToggle,
    updateConfig: benchmarkUpdate,
  } = useAgentSwarm(userAddress);

  // Navigation tab state: 'FLEET' (Active Fleet) vs 'BENCHMARK' (Protocol Swarm)
  const [activeFleetTab, setActiveFleetTab] = useState<'FLEET' | 'BENCHMARK'>('FLEET');

  const [voltSliders, setVoltSliders] = useState({ driftThreshold: 0.2, minEdge: 3.0, lotSize: 5.0 });
  const [oracleSliders, setOracleSliders] = useState({ minEdge: 3.5, lotSize: 5.0, maxTradeSize: 20.0 });
  const [titanSliders, setTitanSliders] = useState({ targetSpread: 4.0, inventoryAversion: 0.015, lotSize: 2.0 });
  const [saveSuccess, setSaveSuccess] = useState<Record<string, boolean>>({});
  const [isSwitching, setIsSwitching] = useState(false);

  // Custom agent inline allowance editing state
  const [editingAllowanceId, setEditingAllowanceId] = useState<string | null>(null);
  const [tempAllowanceVal, setTempAllowanceVal] = useState<number>(100);
  const [customActionLoadingId, setCustomActionLoadingId] = useState<string | null>(null);

  // Sync sliders from fetched config
  useEffect(() => {
    if (!config) return;
    setVoltSliders({
      driftThreshold: Number((config.voltConfig.driftThreshold * 100).toFixed(2)),
      minEdge: Number((config.voltConfig.minEdge * 100).toFixed(1)),
      lotSize: config.voltConfig.lotSize,
    });
    setOracleSliders({
      minEdge: Number((config.oracleConfig.minEdge * 100).toFixed(1)),
      lotSize: config.oracleConfig.lotSize,
      maxTradeSize: config.oracleConfig.maxTradeSize,
    });
    setTitanSliders({
      targetSpread: Number((config.titanConfig.targetSpread * 100).toFixed(1)),
      inventoryAversion: config.titanConfig.inventoryAversion,
      lotSize: config.titanConfig.lotSize,
    });
  }, [config]);

  const handleToggleMode = async () => {
    setIsSwitching(true);
    if (config?.mode === 'COPY') await setMode('PERSONAL');
    else await resetToCopy();
    setIsSwitching(false);
  };

  const handleSaveVolt = async () => {
    const ok = await updateAgentConfig('Volt', {
      driftThreshold: voltSliders.driftThreshold / 100.0,
      minEdge: voltSliders.minEdge / 100.0,
      lotSize: voltSliders.lotSize,
    });
    if (ok) {
      setSaveSuccess((p) => ({ ...p, Volt: true }));
      setTimeout(() => setSaveSuccess((p) => ({ ...p, Volt: false })), 2000);
    }
  };

  const handleSaveOracle = async () => {
    const ok = await updateAgentConfig('Oracle', {
      minEdge: oracleSliders.minEdge / 100.0,
      lotSize: oracleSliders.lotSize,
      maxTradeSize: oracleSliders.maxTradeSize,
    });
    if (ok) {
      setSaveSuccess((p) => ({ ...p, Oracle: true }));
      setTimeout(() => setSaveSuccess((p) => ({ ...p, Oracle: false })), 2000);
    }
  };

  const handleSaveTitan = async () => {
    const ok = await updateAgentConfig('Titan', {
      targetSpread: titanSliders.targetSpread / 100.0,
      inventoryAversion: titanSliders.inventoryAversion,
      lotSize: titanSliders.lotSize,
    });
    if (ok) {
      setSaveSuccess((p) => ({ ...p, Titan: true }));
      setTimeout(() => setSaveSuccess((p) => ({ ...p, Titan: false })), 2000);
    }
  };

  // Custom Agent Handlers
  const handleToggleCustomDeploy = async (agent: CustomAgentDefinition) => {
    setCustomActionLoadingId(agent.id);
    try {
      if (agent.isDeployed) {
        await pauseAgent(agent.id);
      } else {
        await deployAgent(agent.id, agent.allocatedAllowance || 100);
      }
    } finally {
      setCustomActionLoadingId(null);
    }
  };

  const handleSaveCustomAllowance = async (agentId: string) => {
    if (tempAllowanceVal <= 0) return;
    setCustomActionLoadingId(agentId);
    try {
      await setAgentAllowance(agentId, tempAllowanceVal);
      setEditingAllowanceId(null);
    } finally {
      setCustomActionLoadingId(null);
    }
  };

  // Master Pause / Resume All Fleet
  const handleMasterToggleFleet = async () => {
    setIsSwitching(true);
    try {
      const nextState = !isCopyTradeEnabled;
      await toggleCopyTrade(nextState);
      // If pausing all fleet, also pause active custom agents
      if (!nextState) {
        for (const agent of customAgents) {
          if (agent.isDeployed) {
            await pauseAgent(agent.id);
          }
        }
      }
    } finally {
      setIsSwitching(false);
    }
  };

  // PnL & Stats Calculations
  const voltPnl = status?.volt.pnl ?? 0;
  const oraclePnl = status?.oracle.pnl ?? 0;
  const titanPnl = status?.titan.pnl ?? 0;
  const totalCorePnl = voltPnl + oraclePnl + titanPnl;
  const totalCoreFills = (status?.volt.tradesToday ?? 0) + (status?.oracle.tradesToday ?? 0) + (status?.titan.tradesToday ?? 0);

  // Fleet Metric Aggregations
  const activeCoreCount = (config?.voltEnabled ? 1 : 0) + (config?.oracleEnabled ? 1 : 0) + (config?.titanEnabled ? 1 : 0);
  const deployedCustomAgents = useMemo(() => customAgents.filter((a) => a.isDeployed), [customAgents]);
  const activeCustomCount = deployedCustomAgents.length;
  const totalActiveFleetCount = isCopyTradeEnabled ? activeCoreCount + activeCustomCount : 0;

  const totalCustomAllocated = useMemo(
    () => deployedCustomAgents.reduce((sum, a) => sum + (a.allocatedAllowance || 100), 0),
    [deployedCustomAgents]
  );
  const totalCustomPnl = useMemo(
    () => deployedCustomAgents.reduce((sum, a) => sum + (a.pnl ?? 0), 0),
    [deployedCustomAgents]
  );
  const totalCustomFills = useMemo(
    () => deployedCustomAgents.reduce((sum, a) => sum + (a.tradesCount ?? 0), 0),
    [deployedCustomAgents]
  );

  const totalFleetPnl = Number((totalCorePnl + totalCustomPnl).toFixed(2));
  const totalFleetFills = totalCoreFills + totalCustomFills;
  const totalCoreAllocated = isCopyTradeEnabled ? (activeCoreCount > 0 ? activeCoreCount * 100 : 0) : 0;
  const totalFleetAllocated = totalCoreAllocated + totalCustomAllocated;

  const isEditable = isPersonalMode && hasActiveSession && isCopyTradeEnabled;
  const needsDelegation = isPersonalMode && !hasActiveSession;

  if (!userAddress) {
    return (
      <div className="terminal-panel p-5 overflow-hidden">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg grid place-items-center border bg-secondary/30 border-border/50 text-muted-foreground">
            <UserIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground tracking-tight">Autonomous Fleet Command</h3>
            <p className="text-[11px] text-muted-foreground">Unified control center for all running Core Protocol bots and Custom Strategy Agents.</p>
          </div>
        </div>
        <div className="rounded-xl border border-dashed bg-secondary/10 border-border/40 p-4 flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 rounded-full bg-secondary/40 border border-border/40 grid place-items-center text-muted-foreground">
            <ShieldCheckIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-foreground">Connect your wallet to launch Fleet Command</div>
            <div className="text-[11px] text-muted-foreground mt-1 max-w-md">
              Deploy unlimited custom agents with dedicated tUSDC bankroll allowances, tune real-time execution parameters, or copy the protocol benchmark swarm with zero custody.
            </div>
          </div>
          {onConnectWallet && (
            <button
              type="button"
              onClick={onConnectWallet}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors cursor-pointer"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isPersonalLoading && !config) {
    return (
      <div className="terminal-panel p-6 flex items-center justify-center gap-2">
        <Spinner size="sm" />
        <span className="text-xs text-muted-foreground font-mono">Loading Autonomous Fleet Command telemetry…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ========================================================================= */}
      {/* 1. GLOBAL FLEET TELEMETRY BANNER & EMERGENCY KILLSWITCH */}
      {/* ========================================================================= */}
      <div className="terminal-panel p-0 overflow-hidden border-border/60 bg-card/60 backdrop-blur-md">
        {/* Header Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border/40 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl grid place-items-center border bg-primary/10 border-primary/30 text-primary flex-shrink-0">
              <BoltIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-bold text-foreground tracking-tight leading-none">
                  Autonomous Fleet Command
                </h1>
                <Badge
                  variant="outline"
                  className={cn(
                    'font-mono text-[10px] px-2 py-0.5 border gap-1 font-bold',
                    !isCopyTradeEnabled
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : isPersonalMode
                      ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  )}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      !isCopyTradeEnabled ? 'bg-amber-400' : isPersonalMode ? 'bg-purple-400' : 'bg-emerald-400 animate-pulse'
                    )}
                  />
                  {!isCopyTradeEnabled
                    ? 'FLEET: PAUSED (COPILOT ONLY)'
                    : isPersonalMode
                    ? 'PERSONAL ISOLATED FLEET'
                    : 'COPY PROTOCOL SWARM'}
                </Badge>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                <span>
                  {!isCopyTradeEnabled
                    ? 'Autonomous fleet trading is currently paused. Manual 1-click Copilot execution remains active.'
                    : isPersonalMode
                    ? 'Running isolated per-wallet execution on Somnia Shannon CLOB.'
                    : 'Mirroring canonical protocol swarm with dedicated session risk leashes.'}
                </span>
                {config?.customizedAt && (
                  <span className="font-mono text-[10px] text-muted-foreground/70 border-l border-border/40 pl-2">
                    Synced {new Date(config.customizedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Master Actions Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Shortcut: Deploy New Agent in Studio */}
            <button
              type="button"
              onClick={() => {
                window.location.hash = '#studio';
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-all cursor-pointer shadow-sm"
              title="Open Strategy Studio to create, prompt, or backtest a new custom agent"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Deploy New Agent</span>
            </button>

            {/* Master Emergency Killswitch */}
            <button
              type="button"
              onClick={handleMasterToggleFleet}
              disabled={isSwitching || isSaving}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all disabled:opacity-60 cursor-pointer shadow-sm',
                isCopyTradeEnabled
                  ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border-rose-500/40'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 border-emerald-500'
              )}
              title={isCopyTradeEnabled ? 'Pause all running bots in your active fleet immediately' : 'Resume autonomous fleet execution'}
            >
              {isSwitching ? (
                <Spinner size="xs" />
              ) : isCopyTradeEnabled ? (
                <PauseIcon className="w-3.5 h-3.5" />
              ) : (
                <PowerIcon className="w-3.5 h-3.5" />
              )}
              <span>{isCopyTradeEnabled ? 'Emergency Pause Fleet' : 'Resume All Fleet'}</span>
            </button>

            {isCopyTradeEnabled && (
              <>
                <div className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground border border-border/30 rounded-full px-2 py-1 bg-secondary/20">
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', config?.mode === 'COPY' ? 'bg-sky-500 text-white' : 'text-muted-foreground')}>COPY</span>
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', config?.mode === 'PERSONAL' ? 'bg-purple-500 text-white' : 'text-muted-foreground')}>PERSONAL</span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleMode}
                  disabled={isSwitching || isSaving}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors disabled:opacity-60 cursor-pointer',
                    config?.mode === 'PERSONAL'
                      ? 'bg-secondary/30 hover:bg-secondary/50 border-border/50 text-muted-foreground'
                      : 'bg-purple-600 hover:bg-purple-500 text-white border-purple-500'
                  )}
                >
                  {isSwitching ? <Spinner size="xs" /> : config?.mode === 'PERSONAL' ? <ArrowPathIcon className="w-3.5 h-3.5" /> : <BeakerIcon className="w-3.5 h-3.5" />}
                  <span>{config?.mode === 'PERSONAL' ? 'Revert to Copy' : 'Personalize Core Bots'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* 4 Live Fleet Metrics KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3.5 bg-secondary/10 border-b border-border/30">
          {/* Card 1: Active Running Fleet */}
          <div className="p-3 rounded-xl border bg-card/70 border-border/50 flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Active Running Fleet</span>
              <CpuChipIcon className="w-3.5 h-3.5 text-muted-foreground/60" />
            </div>
            <div className="text-base font-mono font-bold text-foreground">
              {totalActiveFleetCount} <span className="text-xs font-normal text-muted-foreground">Agents Live</span>
            </div>
            <div className="text-[10px] text-muted-foreground font-mono truncate">
              {activeCoreCount} Core Protocol · {activeCustomCount} Custom Deployed
            </div>
          </div>

          {/* Card 2: Total Capital Allocated */}
          <div className="p-3 rounded-xl border bg-card/70 border-border/50 flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Total Capital Allocated</span>
              <BanknotesIcon className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-base font-mono font-bold text-emerald-400 truncate">
              ${totalFleetAllocated.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">tUSDC</span>
            </div>
            <div className="text-[10px] text-muted-foreground font-mono truncate">
              Dedicated isolated allowance budget
            </div>
          </div>

          {/* Card 3: Fleet Realized PnL (24h) */}
          <div className="p-3 rounded-xl border bg-card/70 border-border/50 flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Fleet Realized PnL (24h)</span>
              <SignalIcon className="w-3.5 h-3.5 text-muted-foreground/60" />
            </div>
            <div
              className="text-base font-mono font-bold truncate"
              style={{ color: totalFleetPnl >= 0 ? '#6ee7b7' : '#fda4af' }}
            >
              {totalFleetPnl >= 0 ? `+${totalFleetPnl.toFixed(2)}` : totalFleetPnl.toFixed(2)}{' '}
              <span className="text-xs font-normal text-muted-foreground">tUSDC</span>
            </div>
            <div className="text-[10px] text-muted-foreground font-mono truncate">
              {totalFleetFills} on-chain contract executions
            </div>
          </div>

          {/* Card 4: Session Status */}
          <div className="p-3 rounded-xl border bg-card/70 border-border/50 flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Session Key Auth</span>
              <ShieldCheckIcon className="w-3.5 h-3.5 text-muted-foreground/60" />
            </div>
            <div
              className="text-base font-mono font-bold truncate"
              style={{ color: hasActiveSession ? '#6ee7b7' : '#fda4af' }}
            >
              {hasActiveSession ? 'DELEGATED' : 'NOT DELEGATED'}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono flex items-center justify-between">
              <span>{hasActiveSession ? '1-Click Execution' : 'Direct mode only'}</span>
              {!hasActiveSession && onOpenSessionModal && (
                <button
                  type="button"
                  onClick={onOpenSessionModal}
                  className="text-amber-400 hover:underline font-bold cursor-pointer"
                >
                  Delegate →
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Notices and warnings if needed */}
        {needsDelegation && (
          <div className="mx-3.5 my-3 p-3 rounded-xl border bg-amber-500/5 border-amber-500/20 flex gap-2.5 items-start">
            <ExclamationTriangleIcon className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-amber-300">Session delegation required for autonomous background execution</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Your fleet parameters are saved, but autonomous order placement requires an active on-chain session grant. Delegate once to let your agents trade directly from your wallet with zero fund lockups.
              </p>
              {onOpenSessionModal && (
                <button
                  type="button"
                  onClick={onOpenSessionModal}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-950 text-xs font-bold hover:bg-amber-400 transition-colors cursor-pointer"
                >
                  Delegate Session Now
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. DUAL-TAB ARCHITECTURE: MY ACTIVE FLEET vs PROTOCOL BENCHMARK SWARM */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-secondary/30 border border-border/50 self-start">
        <button
          type="button"
          onClick={() => setActiveFleetTab('FLEET')}
          className={cn(
            'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
            activeFleetTab === 'FLEET'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
          )}
        >
          <BoltIcon className="w-3.5 h-3.5" />
          <span>My Active Fleet</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-background/30 text-foreground font-semibold">
            {3 + customAgents.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFleetTab('BENCHMARK')}
          className={cn(
            'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
            activeFleetTab === 'BENCHMARK'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
          )}
        >
          <CpuChipIcon className="w-3.5 h-3.5" />
          <span>Protocol Benchmark Swarm</span>
          <Badge variant="outline" className="text-[9px] font-mono border-border/50 text-muted-foreground">
            0x93e3...59Cf
          </Badge>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB A: MY ACTIVE FLEET (CORE PROTOCOL BOTS + CUSTOM STRATEGY AGENTS) */}
      {/* ========================================================================= */}
      {activeFleetTab === 'FLEET' && (
        <div className="flex flex-col gap-4">
          {/* Section Header */}
          <div className="flex items-center justify-between border-b border-border/40 pb-2 flex-wrap gap-2">
            <div>
              <h2 className="text-xs font-bold text-foreground font-mono uppercase tracking-wider flex items-center gap-2">
                <span>Autonomous Fleet Roster</span>
                <Badge variant="outline" className="text-[9px] font-mono border-border/60 text-muted-foreground">
                  {3 + customAgents.length} Total Registered
                </Badge>
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Core canonical protocol agents and custom strategy agents running under dedicated allowances.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                window.location.hash = '#studio';
              }}
              className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-primary hover:underline cursor-pointer"
            >
              <span>Launch Visual Strategy Studio</span>
              <ArrowRightIcon className="w-3 h-3" />
            </button>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* ------------------------------------------------------------- */}
            {/* CORE BOT 1: VOLT SNIPER */}
            {/* ------------------------------------------------------------- */}
            <div className="terminal-panel p-0 overflow-hidden flex flex-col justify-between relative border-border/50 bg-card/60">
              <div
                className="absolute top-0 left-0 right-0 h-[3px]"
                style={{
                  background: config?.voltEnabled ? AGENT_THEME.volt.color : '#3f3f46',
                  opacity: config?.voltEnabled ? 0.9 : 0.45,
                }}
              />
              <div className="p-3.5 flex flex-col gap-3 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg grid place-items-center border flex-shrink-0 bg-secondary/30 border-border/50 text-amber-400">
                      <BoltIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-bold text-foreground tracking-tight truncate">
                          {AGENT_THEME.volt.label}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[9px] font-mono px-1.5 py-0 font-bold border"
                          style={{
                            background: config?.voltEnabled ? 'rgba(52,211,153,0.08)' : 'rgba(244,63,94,0.08)',
                            color: config?.voltEnabled ? '#6ee7b7' : '#fda4af',
                            borderColor: config?.voltEnabled ? 'rgba(52,211,153,0.18)' : 'rgba(244,63,94,0.18)',
                          }}
                        >
                          {config?.voltEnabled ? 'RUNNING' : 'PAUSED'}
                        </Badge>
                        <Badge variant="outline" className="text-[9px] font-mono border-border text-foreground">
                          CORE
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{AGENT_THEME.volt.sub}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!isPersonalMode}
                    onClick={() => toggleAgent('Volt', !config?.voltEnabled)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-colors flex-shrink-0',
                      isPersonalMode ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                    )}
                    style={{
                      background: config?.voltEnabled ? AGENT_THEME.volt.color : '#27272a',
                      color: config?.voltEnabled ? '#09090b' : '#a1a1aa',
                      borderColor: config?.voltEnabled ? AGENT_THEME.volt.color : '#3f3f46',
                    }}
                  >
                    <PowerIcon className="w-3 h-3" />
                    <span>{config?.voltEnabled ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-1">
                      <SignalIcon className="w-3 h-3" /> 24h PnL
                    </span>
                    <span
                      className="text-xs font-mono font-bold"
                      style={{ color: voltPnl >= 0 ? '#6ee7b7' : '#fda4af' }}
                    >
                      {voltPnl >= 0 ? `+${voltPnl.toFixed(2)}` : voltPnl.toFixed(2)} <span className="text-[10px]">tUSDC</span>
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase">Fills</span>
                    <span className="text-xs font-mono font-bold text-foreground">
                      {status?.volt.tradesToday ?? 0} trades
                    </span>
                  </div>
                </div>

                <div
                  className="flex flex-col gap-3 p-3 rounded-xl border"
                  style={{
                    background: 'hsl(var(--secondary)/0.20)',
                    borderColor: 'hsl(var(--border)/0.6)',
                    opacity: isEditable ? 1 : 0.6,
                  }}
                >
                  <SliderRow label="Spot Drift Trigger" value={`${voltSliders.driftThreshold.toFixed(2)}%`} color={AGENT_THEME.volt.color}>
                    <input
                      type="range"
                      min="0.05"
                      max="1.0"
                      step="0.05"
                      disabled={!isEditable}
                      value={voltSliders.driftThreshold}
                      onChange={(e) => setVoltSliders({ ...voltSliders, driftThreshold: parseFloat(e.target.value) })}
                      style={{ width: '100%', accentColor: AGENT_THEME.volt.color, cursor: isEditable ? 'pointer' : 'default' }}
                    />
                  </SliderRow>
                  <SliderRow label="Minimum Mispricing Edge" value={`${voltSliders.minEdge.toFixed(1)}%`} color={AGENT_THEME.volt.color}>
                    <input
                      type="range"
                      min="1.0"
                      max="10.0"
                      step="0.5"
                      disabled={!isEditable}
                      value={voltSliders.minEdge}
                      onChange={(e) => setVoltSliders({ ...voltSliders, minEdge: parseFloat(e.target.value) })}
                      style={{ width: '100%', accentColor: AGENT_THEME.volt.color, cursor: isEditable ? 'pointer' : 'default' }}
                    />
                  </SliderRow>
                  <SliderRow label="Order Lot Size" value={`${voltSliders.lotSize.toFixed(0)} lots`} color={AGENT_THEME.volt.color}>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="1"
                      disabled={!isEditable}
                      value={voltSliders.lotSize}
                      onChange={(e) => setVoltSliders({ ...voltSliders, lotSize: parseFloat(e.target.value) })}
                      style={{ width: '100%', accentColor: AGENT_THEME.volt.color, cursor: isEditable ? 'pointer' : 'default' }}
                    />
                  </SliderRow>
                  <button
                    type="button"
                    onClick={handleSaveVolt}
                    disabled={!isEditable || isSaving}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer disabled:opacity-60"
                    style={{
                      background: saveSuccess.Volt ? 'rgba(52,211,153,0.12)' : AGENT_THEME.volt.color,
                      color: saveSuccess.Volt ? '#6ee7b7' : '#09090b',
                      borderColor: saveSuccess.Volt ? 'rgba(52,211,153,0.22)' : AGENT_THEME.volt.color,
                    }}
                  >
                    {saveSuccess.Volt ? (
                      <>
                        <CheckCircleIcon className="w-3.5 h-3.5" /> Saved
                      </>
                    ) : (
                      <>
                        <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" /> {isCopyMode ? 'Save & Personalize' : 'Save Volt Tuning'}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onForkToStudio?.('Volt', {
                        driftThreshold: voltSliders.driftThreshold / 100.0,
                        minEdge: voltSliders.minEdge / 100.0,
                        lotSize: voltSliders.lotSize,
                      })
                    }
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold bg-secondary/30 hover:bg-secondary/50 transition-all cursor-pointer"
                    style={{ color: AGENT_THEME.volt.color, borderColor: `${AGENT_THEME.volt.color}2a` }}
                  >
                    <BeakerIcon className="w-3.5 h-3.5" />
                    <span>Backtest Volt Replay</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* CORE BOT 2: ORACLE VOL ARB */}
            {/* ------------------------------------------------------------- */}
            <div className="terminal-panel p-0 overflow-hidden flex flex-col justify-between relative border-border/50 bg-card/60">
              <div
                className="absolute top-0 left-0 right-0 h-[3px]"
                style={{
                  background: config?.oracleEnabled ? AGENT_THEME.oracle.color : '#3f3f46',
                  opacity: config?.oracleEnabled ? 0.9 : 0.45,
                }}
              />
              <div className="p-3.5 flex flex-col gap-3 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg grid place-items-center border flex-shrink-0 bg-secondary/30 border-border/50 text-teal-400">
                      <ArrowTrendingUpIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-bold text-foreground tracking-tight truncate">
                          {AGENT_THEME.oracle.label}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[9px] font-mono px-1.5 py-0 font-bold border"
                          style={{
                            background: config?.oracleEnabled ? 'rgba(52,211,153,0.08)' : 'rgba(244,63,94,0.08)',
                            color: config?.oracleEnabled ? '#6ee7b7' : '#fda4af',
                            borderColor: config?.oracleEnabled ? 'rgba(52,211,153,0.18)' : 'rgba(244,63,94,0.18)',
                          }}
                        >
                          {config?.oracleEnabled ? 'RUNNING' : 'PAUSED'}
                        </Badge>
                        <Badge variant="outline" className="text-[9px] font-mono border-border text-foreground">
                          CORE
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{AGENT_THEME.oracle.sub}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!isPersonalMode}
                    onClick={() => toggleAgent('Oracle', !config?.oracleEnabled)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-colors flex-shrink-0',
                      isPersonalMode ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                    )}
                    style={{
                      background: config?.oracleEnabled ? AGENT_THEME.oracle.color : '#27272a',
                      color: config?.oracleEnabled ? '#09090b' : '#a1a1aa',
                      borderColor: config?.oracleEnabled ? AGENT_THEME.oracle.color : '#3f3f46',
                    }}
                  >
                    <PowerIcon className="w-3 h-3" />
                    <span>{config?.oracleEnabled ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-1">
                      <SignalIcon className="w-3 h-3" /> 24h PnL
                    </span>
                    <span
                      className="text-xs font-mono font-bold"
                      style={{ color: oraclePnl >= 0 ? '#6ee7b7' : '#fda4af' }}
                    >
                      {oraclePnl >= 0 ? `+${oraclePnl.toFixed(2)}` : oraclePnl.toFixed(2)} <span className="text-[10px]">tUSDC</span>
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase">Fills</span>
                    <span className="text-xs font-mono font-bold text-foreground">
                      {status?.oracle.tradesToday ?? 0} trades
                    </span>
                  </div>
                </div>

                <div
                  className="flex flex-col gap-3 p-3 rounded-xl border"
                  style={{
                    background: 'hsl(var(--secondary)/0.20)',
                    borderColor: 'hsl(var(--border)/0.6)',
                    opacity: isEditable ? 1 : 0.6,
                  }}
                >
                  <SliderRow label="Min Mathematical Edge Φ(z)" value={`${oracleSliders.minEdge.toFixed(1)}%`} color={AGENT_THEME.oracle.color}>
                    <input
                      type="range"
                      min="1.5"
                      max="12.0"
                      step="0.5"
                      disabled={!isEditable}
                      value={oracleSliders.minEdge}
                      onChange={(e) => setOracleSliders({ ...oracleSliders, minEdge: parseFloat(e.target.value) })}
                      style={{ width: '100%', accentColor: AGENT_THEME.oracle.color, cursor: isEditable ? 'pointer' : 'default' }}
                    />
                  </SliderRow>
                  <SliderRow label="Order Lot Size" value={`${oracleSliders.lotSize.toFixed(0)} lots`} color={AGENT_THEME.oracle.color}>
                    <input
                      type="range"
                      min="1"
                      max="25"
                      step="1"
                      disabled={!isEditable}
                      value={oracleSliders.lotSize}
                      onChange={(e) => setOracleSliders({ ...oracleSliders, lotSize: parseFloat(e.target.value) })}
                      style={{ width: '100%', accentColor: AGENT_THEME.oracle.color, cursor: isEditable ? 'pointer' : 'default' }}
                    />
                  </SliderRow>
                  <SliderRow label="Max Trade Size (tUSDC)" value={`${oracleSliders.maxTradeSize.toFixed(0)}`} color={AGENT_THEME.oracle.color}>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      step="1"
                      disabled={!isEditable}
                      value={oracleSliders.maxTradeSize}
                      onChange={(e) => setOracleSliders({ ...oracleSliders, maxTradeSize: parseFloat(e.target.value) })}
                      style={{ width: '100%', accentColor: AGENT_THEME.oracle.color, cursor: isEditable ? 'pointer' : 'default' }}
                    />
                  </SliderRow>
                  <button
                    type="button"
                    onClick={handleSaveOracle}
                    disabled={!isEditable || isSaving}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer disabled:opacity-60"
                    style={{
                      background: saveSuccess.Oracle ? 'rgba(52,211,153,0.12)' : AGENT_THEME.oracle.color,
                      color: saveSuccess.Oracle ? '#6ee7b7' : '#09090b',
                      borderColor: saveSuccess.Oracle ? 'rgba(52,211,153,0.22)' : AGENT_THEME.oracle.color,
                    }}
                  >
                    {saveSuccess.Oracle ? (
                      <>
                        <CheckCircleIcon className="w-3.5 h-3.5" /> Saved
                      </>
                    ) : (
                      <>
                        <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" /> {isCopyMode ? 'Save & Personalize' : 'Save Oracle Tuning'}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onForkToStudio?.('Oracle', {
                        minEdge: oracleSliders.minEdge / 100.0,
                        lotSize: oracleSliders.lotSize,
                        maxTradeSize: oracleSliders.maxTradeSize,
                      })
                    }
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold bg-secondary/30 hover:bg-secondary/50 transition-all cursor-pointer"
                    style={{ color: AGENT_THEME.oracle.color, borderColor: `${AGENT_THEME.oracle.color}2a` }}
                  >
                    <BeakerIcon className="w-3.5 h-3.5" />
                    <span>Backtest Oracle Replay</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* CORE BOT 3: TITAN MM */}
            {/* ------------------------------------------------------------- */}
            <div className="terminal-panel p-0 overflow-hidden flex flex-col justify-between relative border-border/50 bg-card/60">
              <div
                className="absolute top-0 left-0 right-0 h-[3px]"
                style={{
                  background: config?.titanEnabled ? AGENT_THEME.titan.color : '#3f3f46',
                  opacity: config?.titanEnabled ? 0.9 : 0.45,
                }}
              />
              <div className="p-3.5 flex flex-col gap-3 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg grid place-items-center border flex-shrink-0 bg-secondary/30 border-border/50 text-purple-400">
                      <Square3Stack3DIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-bold text-foreground tracking-tight truncate">
                          {AGENT_THEME.titan.label}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[9px] font-mono px-1.5 py-0 font-bold border"
                          style={{
                            background: config?.titanEnabled ? 'rgba(52,211,153,0.08)' : 'rgba(244,63,94,0.08)',
                            color: config?.titanEnabled ? '#6ee7b7' : '#fda4af',
                            borderColor: config?.titanEnabled ? 'rgba(52,211,153,0.18)' : 'rgba(244,63,94,0.18)',
                          }}
                        >
                          {config?.titanEnabled ? 'RUNNING' : 'PAUSED'}
                        </Badge>
                        <Badge variant="outline" className="text-[9px] font-mono border-border text-foreground">
                          CORE
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{AGENT_THEME.titan.sub}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!isPersonalMode}
                    onClick={() => toggleAgent('Titan', !config?.titanEnabled)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-colors flex-shrink-0',
                      isPersonalMode ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                    )}
                    style={{
                      background: config?.titanEnabled ? AGENT_THEME.titan.color : '#27272a',
                      color: config?.titanEnabled ? '#09090b' : '#a1a1aa',
                      borderColor: config?.titanEnabled ? AGENT_THEME.titan.color : '#3f3f46',
                    }}
                  >
                    <PowerIcon className="w-3 h-3" />
                    <span>{config?.titanEnabled ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-1">
                      <SignalIcon className="w-3 h-3" /> 24h PnL
                    </span>
                    <span
                      className="text-xs font-mono font-bold"
                      style={{ color: titanPnl >= 0 ? '#6ee7b7' : '#fda4af' }}
                    >
                      {titanPnl >= 0 ? `+${titanPnl.toFixed(2)}` : titanPnl.toFixed(2)} <span className="text-[10px]">tUSDC</span>
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase">Fills</span>
                    <span className="text-xs font-mono font-bold text-foreground">
                      {status?.titan.tradesToday ?? 0} trades
                    </span>
                  </div>
                </div>

                <div
                  className="flex flex-col gap-3 p-3 rounded-xl border"
                  style={{
                    background: 'hsl(var(--secondary)/0.20)',
                    borderColor: 'hsl(var(--border)/0.6)',
                    opacity: isEditable ? 1 : 0.6,
                  }}
                >
                  <SliderRow label="Target Bid-Ask Spread" value={`${titanSliders.targetSpread.toFixed(1)}%`} color={AGENT_THEME.titan.color}>
                    <input
                      type="range"
                      min="2.0"
                      max="8.0"
                      step="0.5"
                      disabled={!isEditable}
                      value={titanSliders.targetSpread}
                      onChange={(e) => setTitanSliders({ ...titanSliders, targetSpread: parseFloat(e.target.value) })}
                      style={{ width: '100%', accentColor: AGENT_THEME.titan.color, cursor: isEditable ? 'pointer' : 'default' }}
                    />
                  </SliderRow>
                  <SliderRow label="Inventory Skew Damping (γ)" value={titanSliders.inventoryAversion.toFixed(3)} color={AGENT_THEME.titan.color}>
                    <input
                      type="range"
                      min="0.005"
                      max="0.040"
                      step="0.005"
                      disabled={!isEditable}
                      value={titanSliders.inventoryAversion}
                      onChange={(e) => setTitanSliders({ ...titanSliders, inventoryAversion: parseFloat(e.target.value) })}
                      style={{ width: '100%', accentColor: AGENT_THEME.titan.color, cursor: isEditable ? 'pointer' : 'default' }}
                    />
                  </SliderRow>
                  <button
                    type="button"
                    onClick={handleSaveTitan}
                    disabled={!isEditable || isSaving}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer disabled:opacity-60"
                    style={{
                      background: saveSuccess.Titan ? 'rgba(52,211,153,0.12)' : AGENT_THEME.titan.color,
                      color: saveSuccess.Titan ? '#6ee7b7' : '#09090b',
                      borderColor: saveSuccess.Titan ? 'rgba(52,211,153,0.22)' : AGENT_THEME.titan.color,
                    }}
                  >
                    {saveSuccess.Titan ? (
                      <>
                        <CheckCircleIcon className="w-3.5 h-3.5" /> Saved
                      </>
                    ) : (
                      <>
                        <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" /> {isCopyMode ? 'Save & Personalize' : 'Save Titan Tuning'}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onForkToStudio?.('Titan', {
                        targetSpread: titanSliders.targetSpread / 100.0,
                        inventoryAversion: titanSliders.inventoryAversion,
                        lotSize: titanSliders.lotSize,
                      })
                    }
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold bg-secondary/30 hover:bg-secondary/50 transition-all cursor-pointer"
                    style={{ color: AGENT_THEME.titan.color, borderColor: `${AGENT_THEME.titan.color}2a` }}
                  >
                    <BeakerIcon className="w-3.5 h-3.5" />
                    <span>Backtest Titan Replay</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* CUSTOM STRATEGY AGENTS DEPLOYED FROM STRATEGY STUDIO */}
            {/* ------------------------------------------------------------- */}
            {customAgents.map((agent) => {
              const agentColor = agent.color || '#2dd4bf';
              const allocated = agent.allocatedAllowance ?? 100;
              const spent = agent.spentAllowance ?? 0;
              const remaining = Math.max(0, allocated - spent);
              const pctUsed = Math.min(100, Math.round((spent / (allocated || 1)) * 100));
              const isEditingThis = editingAllowanceId === agent.id;

              return (
                <div
                  key={agent.id}
                  className="terminal-panel p-0 overflow-hidden flex flex-col justify-between relative border-border/50 bg-card/60 transition-all hover:border-border"
                >
                  <div
                    className="absolute top-0 left-0 right-0 h-[3px]"
                    style={{
                      background: agent.isDeployed ? agentColor : '#3f3f46',
                      opacity: agent.isDeployed ? 0.9 : 0.45,
                    }}
                  />
                  <div className="p-3.5 flex flex-col gap-3 pt-4">
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-8 h-8 rounded-lg grid place-items-center border flex-shrink-0 bg-secondary/30 border-border/50"
                          style={{ color: agentColor }}
                        >
                          <SparklesIcon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[13px] font-bold text-foreground tracking-tight truncate">
                              {agent.name}
                            </span>
                            {agent.isDeployed ? (
                              <Badge
                                variant="outline"
                                className="text-[9px] font-mono px-1.5 py-0 font-bold border border-emerald-500/30 text-emerald-400 bg-emerald-500/10 flex items-center gap-1"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span>DEPLOYED</span>
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[9px] font-mono px-1.5 py-0 font-semibold border-border/50 text-muted-foreground bg-secondary/30"
                              >
                                <span>PAUSED</span>
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[9px] font-mono border-border text-foreground">
                              {agent.strategyType}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {agent.symbol} · {agent.timeframe} · {agent.rules?.action?.direction || 'CALL'}
                          </div>
                        </div>
                      </div>

                      {/* 1-Click Deploy / Pause Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleCustomDeploy(agent)}
                        disabled={customActionLoadingId === agent.id}
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all flex-shrink-0 cursor-pointer disabled:opacity-50 shadow-xs',
                          agent.isDeployed
                            ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-400'
                            : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/40 text-emerald-400'
                        )}
                        title={agent.isDeployed ? 'Pause this agent' : 'Deploy agent to active fleet'}
                      >
                        {customActionLoadingId === agent.id ? (
                          <Spinner size="xs" />
                        ) : agent.isDeployed ? (
                          <PauseIcon className="w-3 h-3" />
                        ) : (
                          <RocketLaunchIcon className="w-3 h-3" />
                        )}
                        <span>{agent.isDeployed ? 'PAUSE' : 'DEPLOY'}</span>
                      </button>
                    </div>

                    {/* Custom Agent Realized PnL & Performance KPI Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5">
                        <span className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-1">
                          <SignalIcon className="w-3 h-3" /> 24h PnL
                        </span>
                        <span
                          className="text-xs font-mono font-bold"
                          style={{
                            color:
                              (agent.pnl ?? 0) > 0
                                ? '#6ee7b7'
                                : (agent.pnl ?? 0) < 0
                                ? '#fda4af'
                                : 'hsl(var(--muted-foreground))',
                          }}
                        >
                          {(agent.pnl ?? 0) > 0
                            ? `+${(agent.pnl ?? 0).toFixed(2)}`
                            : (agent.pnl ?? 0).toFixed(2)}{' '}
                          <span className="text-[10px]">tUSDC</span>
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5">
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">Win Rate & Fills</span>
                        <span className="text-xs font-mono font-bold text-foreground">
                          {(agent.tradesCount ?? 0) > 0
                            ? `${agent.tradesCount} fills · ${(agent.winRate ?? 0).toFixed(0)}% WR`
                            : '0 fills · —'}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 m-0">
                      {agent.description || 'Custom autonomous AST trading agent'}
                    </p>

                    {/* Dedicated Bankroll Allowance Meter */}
                    <div className="p-2.5 rounded-xl bg-background/80 border border-border/60 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-muted-foreground flex items-center gap-1 font-semibold">
                          <BanknotesIcon className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Bankroll Allowance:</span>
                        </span>
                        <span className="font-bold text-foreground">${allocated.toFixed(2)} tUSDC</span>
                      </div>

                      {/* Visual Progress Bar */}
                      <div className="w-full h-1.5 rounded-full bg-secondary/80 overflow-hidden">
                        <div
                          className={cn(
                            'h-full transition-all duration-300',
                            pctUsed > 85 ? 'bg-rose-400' : pctUsed > 60 ? 'bg-amber-400' : 'bg-emerald-400'
                          )}
                          style={{ width: `${Math.max(4, pctUsed)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                        <span>Spent: ${spent.toFixed(2)}</span>
                        <span className={cn(remaining <= 10 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-semibold')}>
                          Remaining: ${remaining.toFixed(2)}
                        </span>
                      </div>

                      {/* Inline Allowance Modifier */}
                      {isEditingThis ? (
                        <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/30">
                          <span className="text-[10px] font-mono text-muted-foreground">New Limit:</span>
                          <input
                            type="number"
                            min={1}
                            max={10000}
                            value={tempAllowanceVal}
                            onChange={(e) => setTempAllowanceVal(Number(e.target.value))}
                            className="w-20 px-1.5 py-0.5 rounded bg-background border border-border text-xs font-mono font-bold text-foreground text-right"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveCustomAllowance(agent.id)}
                            disabled={customActionLoadingId === agent.id}
                            className="p-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 transition-colors cursor-pointer"
                            title="Save Allowance"
                          >
                            <CheckIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingAllowanceId(null)}
                            className="p-1 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            title="Cancel"
                          >
                            <XMarkIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end pt-1 border-t border-border/30">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAllowanceId(agent.id);
                              setTempAllowanceVal(allocated);
                            }}
                            className="text-[10px] font-mono text-primary hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                          >
                            <PencilSquareIcon className="w-3 h-3" />
                            <span>Modify Allowance</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Actions Deck */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          onForkToStudio?.('CUSTOM', {
                            customAgentId: agent.id,
                            customDraft: agent,
                            customRules: agent.rules,
                            symbol: agent.symbol,
                            timeframe: agent.timeframe,
                          });
                        }}
                        className="inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border/60 bg-secondary/30 hover:bg-secondary/60 text-xs font-semibold transition-all cursor-pointer text-foreground"
                      >
                        <PlayIcon className="w-3.5 h-3.5 text-primary" />
                        <span>Backtest</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          window.location.hash = '#studio';
                        }}
                        className="inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border/60 bg-secondary/30 hover:bg-secondary/60 text-xs font-semibold transition-all cursor-pointer text-muted-foreground hover:text-foreground"
                      >
                        <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
                        <span>Edit Studio</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Persistent '+ Build New Custom Agent' Card */}
            <div
              onClick={() => {
                window.location.hash = '#studio';
              }}
              className="rounded-xl border border-dashed border-border/70 hover:border-primary/60 bg-secondary/10 hover:bg-secondary/25 p-6 flex flex-col items-center justify-center gap-3 text-center transition-all cursor-pointer min-h-[280px] group"
            >
              <div className="w-12 h-12 rounded-2xl bg-secondary/40 group-hover:bg-primary/15 border border-border/50 group-hover:border-primary/30 grid place-items-center text-muted-foreground group-hover:text-primary transition-all">
                <PlusIcon className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                  Create Custom Agent
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 max-w-xs leading-relaxed">
                  Design bespoke momentum snipers, mean-reversion capsules, and EMA cross riders with dedicated tUSDC bankroll allowances.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-primary group-hover:translate-x-0.5 transition-transform">
                <span>Launch Strategy Studio</span>
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB B: PROTOCOL BENCHMARK SWARM (OPERATOR REFERENCE 0x93e3...59Cf) */}
      {/* ========================================================================= */}
      {activeFleetTab === 'BENCHMARK' && (
        <div className="flex flex-col gap-3">
          <div className="p-3 rounded-xl border border-sky-500/20 bg-sky-500/5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/30 grid place-items-center text-sky-400 flex-shrink-0">
                <CpuChipIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-foreground">Protocol Benchmark Swarm (Operator Reference)</div>
                <div className="text-[11px] text-muted-foreground">
                  Read-only telemetry streaming from operator <span className="font-mono text-foreground">0x93e3...59Cf</span> on Somnia Shannon Testnet.
                </div>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono border-sky-500/30 text-sky-400 bg-sky-500/10">
              Reference Benchmark
            </Badge>
          </div>

          <AgentSwarmCockpit
            detailedAgents={benchmarkDetailed}
            isOperator={isOperator}
            onToggleAgent={benchmarkToggle}
            onUpdateConfig={benchmarkUpdate}
            onForkToStudio={onForkToStudio}
          />
        </div>
      )}
    </div>
  );
};

const SliderRow: React.FC<{ label: string; value: string; color: string; children: React.ReactNode }> = ({
  label,
  value,
  color,
  children,
}) => (
  <div>
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span
        className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded border"
        style={{ background: `${color}14`, color, borderColor: `${color}28` }}
      >
        {value}
      </span>
    </div>
    {children}
  </div>
);
