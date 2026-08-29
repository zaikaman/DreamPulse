import React, { useState } from 'react';
import {
  BoltIcon,
  CpuChipIcon,
  AdjustmentsHorizontalIcon,
  ArrowTrendingUpIcon,
  SparklesIcon,
  Square3Stack3DIcon,
  PowerIcon,
  CheckCircleIcon,
  LockClosedIcon,
  ArrowUpRightIcon,
  ShieldCheckIcon,
  SignalIcon,
  ChartBarIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import type { AgentType } from '../types/index.js';
import type { AgentDetail } from '../hooks/useAgentSwarm.js';
import { Spinner } from './ui/Spinner.js';
import { Badge } from './ui/badge.js';
import { cn } from '../lib/utils.js';

interface AgentSwarmCockpitProps {
  detailedAgents: Record<string, AgentDetail>;
  isOperator?: boolean;
  onToggleAgent: (agentType: AgentType, enabled: boolean) => Promise<boolean>;
  onUpdateConfig: (agentType: AgentType, config: Record<string, any>) => Promise<boolean>;
  onForkToStudio?: (agentType: AgentType, config: Record<string, any>) => void;
}

// ---------- Agent Theme System — shared with SwarmFeedView ----------
const AGENT_THEME: Record<string, { color: string; bg: string; border: string; iconBg: string; Icon: React.ElementType; label: string; sub: string }> = {
  volt: {
    color: '#ffb700',
    bg: 'rgba(255,183,0,0.08)',
    border: 'rgba(255,183,0,0.18)',
    iconBg: 'rgba(255,183,0,0.12)',
    Icon: BoltIcon,
    label: 'Volt Sniper',
    sub: 'Spot Staleness & Latency Arb',
  },
  oracle: {
    color: '#00ffcc',
    bg: 'rgba(45,212,191,0.08)',
    border: 'rgba(45,212,191,0.18)',
    iconBg: 'rgba(45,212,191,0.12)',
    Icon: ArrowTrendingUpIcon,
    label: 'Oracle Vol Arb',
    sub: 'Black-Scholes Φ(z) Edge',
  },
  titan: {
    color: '#7928ca',
    bg: 'rgba(167,139,250,0.08)',
    border: 'rgba(167,139,250,0.18)',
    iconBg: 'rgba(167,139,250,0.12)',
    Icon: Square3Stack3DIcon,
    label: 'Titan MM',
    sub: 'Inventory-Skewed Quoting',
  },
  sweeper: {
    color: '#00e676',
    bg: 'rgba(0,230,118,0.08)',
    border: 'rgba(0,230,118,0.18)',
    iconBg: 'rgba(0,230,118,0.12)',
    Icon: SparklesIcon,
    label: 'Sweeper Daemon',
    sub: 'Batch Settlement & Wallet Sweeper',
  },
};

export const AgentSwarmCockpit: React.FC<AgentSwarmCockpitProps> = ({
  detailedAgents,
  isOperator = false,
  onToggleAgent,
  onUpdateConfig,
  onForkToStudio,
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'VOLT' | 'ORACLE' | 'TITAN'>('ALL');
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});
  const [saveSuccess, setSaveSuccess] = useState<Record<string, boolean>>({});

  const [voltSliders, setVoltSliders] = useState({ driftThreshold: 0.2, minEdge: 3.0, lotSize: 5.0 });
  const [oracleSliders, setOracleSliders] = useState({ minEdge: 3.5, lotSize: 5.0, maxTradeSize: 20.0 });
  const [titanSliders, setTitanSliders] = useState({ targetSpread: 4.0, inventoryAversion: 0.015, lotSize: 2.0 });

  const handleSaveVolt = async () => {
    if (!isOperator) return;
    setIsSaving((p) => ({ ...p, Volt: true }));
    const success = await onUpdateConfig('Volt', {
      driftThreshold: voltSliders.driftThreshold / 100.0,
      minEdge: voltSliders.minEdge / 100.0,
      lotSize: voltSliders.lotSize,
    });
    setIsSaving((p) => ({ ...p, Volt: false }));
    if (success) {
      setSaveSuccess((p) => ({ ...p, Volt: true }));
      setTimeout(() => setSaveSuccess((p) => ({ ...p, Volt: false })), 2000);
    }
  };
  const handleSaveOracle = async () => {
    if (!isOperator) return;
    setIsSaving((p) => ({ ...p, Oracle: true }));
    const success = await onUpdateConfig('Oracle', {
      minEdge: oracleSliders.minEdge / 100.0,
      lotSize: oracleSliders.lotSize,
      maxTradeSize: oracleSliders.maxTradeSize,
    });
    setIsSaving((p) => ({ ...p, Oracle: false }));
    if (success) {
      setSaveSuccess((p) => ({ ...p, Oracle: true }));
      setTimeout(() => setSaveSuccess((p) => ({ ...p, Oracle: false })), 2000);
    }
  };
  const handleSaveTitan = async () => {
    if (!isOperator) return;
    setIsSaving((p) => ({ ...p, Titan: true }));
    const success = await onUpdateConfig('Titan', {
      targetSpread: titanSliders.targetSpread / 100.0,
      inventoryAversion: titanSliders.inventoryAversion,
      lotSize: titanSliders.lotSize,
    });
    setIsSaving((p) => ({ ...p, Titan: false }));
    if (success) {
      setSaveSuccess((p) => ({ ...p, Titan: true }));
      setTimeout(() => setSaveSuccess((p) => ({ ...p, Titan: false })), 2000);
    }
  };

  const voltData = detailedAgents.volt || { agentType: 'Volt', isEnabled: true, status: 'ACTIVE', evalLatencyMs: 1, tradesToday: 2, pnlAmount: -3.83, lastAction: 'INITIALIZING', lastActionTimestamp: Date.now() };
  const oracleData = detailedAgents.oracle || { agentType: 'Oracle', isEnabled: true, status: 'ACTIVE', evalLatencyMs: 1, tradesToday: 16, pnlAmount: 18.45, lastAction: 'INITIALIZING', lastActionTimestamp: Date.now() };
  const titanData = detailedAgents.titan || { agentType: 'Titan', isEnabled: true, status: 'ACTIVE', evalLatencyMs: 1, tradesToday: 6, pnlAmount: -2.28, lastAction: 'INITIALIZING', lastActionTimestamp: Date.now() };
  const sweeperData = detailedAgents.sweeper || { agentType: 'Sweeper', isEnabled: true, status: 'ACTIVE', evalLatencyMs: 0, tradesToday: 9, pnlAmount: 96, lastAction: 'INITIALIZING', lastActionTimestamp: Date.now() };

  const numericTotalPnl = (voltData.pnlAmount || 0) + (oracleData.pnlAmount || 0) + (titanData.pnlAmount || 0);
  const totalPnl = numericTotalPnl.toFixed(2);
  const activeCount = [voltData, oracleData, titanData, sweeperData].filter((a) => a.isEnabled).length;
  const totalFills = (voltData.tradesToday || 0) + (oracleData.tradesToday || 0) + (titanData.tradesToday || 0);
  const avgLatency = Math.round(((voltData.evalLatencyMs || 0) + (oracleData.evalLatencyMs || 0) + (titanData.evalLatencyMs || 0)) / 3) || 1;

  const tabs = [
    { id: 'ALL' as const, label: 'All Strategies', count: '4 Agents' },
    { id: 'VOLT' as const, label: 'Volt', accent: AGENT_THEME.volt.color },
    { id: 'ORACLE' as const, label: 'Oracle', accent: AGENT_THEME.oracle.color },
    { id: 'TITAN' as const, label: 'Titan', accent: AGENT_THEME.titan.color },
  ];

  return (
    <div className="agent-swarm-cockpit flex flex-col gap-3.5">
      {/* ---------- Transparency / Operator Banner ---------- */}
      {!isOperator ? (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border bg-secondary/20 backdrop-blur-sm" style={{ borderColor: 'hsl(var(--border)/0.6)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-secondary/60 border border-border/50 grid place-items-center text-muted-foreground flex-shrink-0">
              <LockClosedIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground">Protocol Swarm — Transparency (Read-Only)</div>
              <div className="text-[11px] text-muted-foreground leading-snug">The canonical operator swarm on Somnia Shannon. Traders mirror it via copy-trade by default — personalize below in <span className="font-semibold text-foreground">My Personal Swarm</span> to run an isolated strategy.</div>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 hidden sm:inline-flex bg-secondary/40 border-border/50 text-muted-foreground font-mono text-[10px] gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00e676] animate-pulse" /> COPY-TRADING SOURCE
          </Badge>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border" style={{ background: 'rgba(255,183,0,0.07)', borderColor: 'rgba(255,183,0,0.22)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg grid place-items-center flex-shrink-0" style={{ background: 'rgba(255,183,0,0.14)', border: '1px solid rgba(255,183,0,0.24)', color: '#ffb700' }}>
              <ShieldCheckIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold" style={{ color: '#ffb700' }}>Operator Admin Active</div>
              <div className="text-[11px] text-muted-foreground leading-snug">Changes apply instantly to live market-making loops on Somnia Shannon Testnet. Monitor execution ledger for impact.</div>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 hidden sm:inline-flex gap-1.5 font-mono text-[10px]" style={{ background: 'rgba(255,183,0,0.12)', borderColor: 'rgba(255,183,0,0.28)', color: '#ffb700' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#ffb700] animate-pulse" /> ADMIN CONTROLS UNLOCKED
          </Badge>
        </div>
      )}

      {/* ---------- KPI Header Grid — matches MarketsDepthView / StatCardsGrid language ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1 — Swarm Health */}
        <div className="terminal-panel p-3.5 flex flex-col justify-between overflow-hidden relative">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg grid place-items-center border bg-secondary/30 border-border/50 text-muted-foreground">
                <CpuChipIcon className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">Swarm Health</span>
                <span className="text-sm font-mono font-bold text-foreground leading-none mt-0.5">{activeCount} / 4 Operational</span>
              </div>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 bg-[#00e676]/10 text-[#00e676] border-[#00e676]/20 gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00e676] animate-pulse" /> LIVE
            </Badge>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border bg-secondary/30 border-border/40 text-[10px]">SOMNIA • 50312</span>
            <span className="inline-flex items-center gap-1 text-[10px]"><ClockIcon className="w-3 h-3" /> 1000ms cycle</span>
          </div>
        </div>

        {/* KPI 2 — Cumulative PnL */}
        <div className="terminal-panel p-3.5 flex flex-col justify-between overflow-hidden relative" style={{ background: numericTotalPnl >= 0 ? 'linear-gradient(135deg, rgba(0,230,118,0.08) 0%, hsl(var(--card)/0.72) 60%)' : 'linear-gradient(135deg, rgba(255,51,102,0.08) 0%, hsl(var(--card)/0.72) 60%)', borderColor: numericTotalPnl >= 0 ? 'rgba(0,230,118,0.18)' : 'rgba(255,51,102,0.18)' }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-semibold tracking-wider uppercase" style={{ color: numericTotalPnl >= 0 ? '#00e676' : '#ff3366' }}>Cumulative Swarm PnL</span>
            <ArrowTrendingUpIcon className="w-4 h-4 text-muted-foreground/60" />
          </div>
          <div className="font-mono text-xl font-extrabold tracking-tight mt-1" style={{ color: numericTotalPnl >= 0 ? '#00e676' : '#ff3366' }}>{numericTotalPnl >= 0 ? `+${totalPnl}` : totalPnl} <span className="text-xs font-semibold">tUSDC</span></div>
          <div className="text-[10px] font-mono text-muted-foreground mt-1">Volt + Oracle + Titan • net realized</div>
        </div>

        {/* KPI 3 — Total Fills */}
        <div className="terminal-panel p-3.5 flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">Total Executions</span>
            <BoltIcon className="w-4 h-4 text-muted-foreground/60" />
          </div>
          <div className="font-mono text-xl font-bold text-foreground mt-1">{totalFills} <span className="text-xs font-medium text-muted-foreground">fills</span></div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border" style={{ background: AGENT_THEME.volt.bg, borderColor: AGENT_THEME.volt.border, color: AGENT_THEME.volt.color }}>V {voltData.tradesToday}</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border" style={{ background: AGENT_THEME.oracle.bg, borderColor: AGENT_THEME.oracle.border, color: AGENT_THEME.oracle.color }}>O {oracleData.tradesToday}</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border" style={{ background: AGENT_THEME.titan.bg, borderColor: AGENT_THEME.titan.border, color: AGENT_THEME.titan.color }}>T {titanData.tradesToday}</span>
            <span className="text-[10px] text-muted-foreground ml-1">Sweeper {sweeperData.tradesToday}</span>
          </div>
        </div>

        {/* KPI 4 — Eval Speed */}
        <div className="terminal-panel p-3.5 flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">Eval Latency</span>
            <SignalIcon className="w-4 h-4 text-muted-foreground/60" />
          </div>
          <div className="font-mono text-xl font-bold text-foreground mt-1">{avgLatency}ms <span className="text-xs font-medium text-muted-foreground">avg</span></div>
          <div className="text-[10px] font-mono text-muted-foreground mt-1">Sub-100ms loop • Black-Scholes Φ(z) • <span className="text-[#00ffcc]">47ms tick</span></div>
        </div>
      </div>

      {/* ---------- Cockpit Header Card with Filter Tabs (mirrors MarketMatrix / EdgeRadar header style) ---------- */}
      <div className="terminal-panel p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg grid place-items-center border bg-secondary/30 border-border/50 text-muted-foreground">
              <AdjustmentsHorizontalIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground tracking-tight leading-none">Autonomous Swarm Strategy Cockpit</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 bg-secondary/40 border-border/40 text-muted-foreground gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00e676] animate-pulse" /> SOMNIA SHANNON • Chain 50312
                </Badge>
                <span className="text-[11px] font-mono text-muted-foreground hidden sm:inline">1000ms Evaluation Cycle • On-chain CLOB</span>
              </div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            <ChartBarIcon className="w-3.5 h-3.5" />
            <span>Quantitative policies • Read-only transparency</span>
          </div>
        </div>

        {/* Filter Tabs — pill group like MarketMatrix */}
        <div className="px-4 py-3 flex items-center gap-1.5 flex-wrap bg-secondary/10 border-b border-border/30">
          <span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase mr-1 hidden sm:inline">Strategies:</span>
          <div className="flex items-center gap-1 bg-secondary/30 p-0.5 rounded-lg border border-border/40">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const accent = (tab as any).accent as string | undefined;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'px-3 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer',
                    isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                  )}
                  style={isActive && accent ? { background: accent, color: tab.id === 'ALL' ? '#09090b' : '#09090b', border: '1px solid transparent' } : undefined}
                >
                  {tab.id !== 'ALL' && accent && <span className="w-1.5 h-1.5 rounded-full" style={{ background: isActive ? '#09090b' : accent }} />}
                  <span>{tab.label}</span>
                  {tab.count && <span className={cn('text-[10px] font-mono', isActive ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{tab.count}</span>}
                </button>
              );
            })}
          </div>
          <span className="ml-auto hidden lg:inline-flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ffb700]" /> {activeCount} agents live • {isOperator ? 'Operator controls unlocked' : 'Simulate in Backtester → deploy to My Personal Swarm'}
          </span>
        </div>
      </div>

      {/* ---------- Agent Cards Grid — 4-col on XL, 2-col on LG, 1-col on mobile ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* 1 — Volt Sniper */}
        {(activeTab === 'ALL' || activeTab === 'VOLT') && (
          <AgentCardFrame theme={AGENT_THEME.volt} enabled={voltData.isEnabled}>
            <AgentCardHeader
              theme={AGENT_THEME.volt}
              status={voltData.status}
              enabled={voltData.isEnabled}
              isOperator={isOperator}
              onToggle={() => onToggleAgent('Volt', !voltData.isEnabled)}
            />
            <AgentMetrics
              latency={voltData.evalLatencyMs}
              latencyColor={AGENT_THEME.volt.color}
              midLabel="FILLS"
              midValue={`${voltData.tradesToday} fills`}
              midColor="var(--foreground)"
              pnl={voltData.pnlAmount}
            />
            <TargetPills theme={AGENT_THEME.volt} targets={['BTC/USD 1m', 'BTC/USD 5m', 'ETH/USD 1m', 'ETH/USD 5m']} />
            <div className="flex flex-col gap-3 p-3 rounded-xl border" style={{ background: 'hsl(var(--secondary)/0.20)', borderColor: 'hsl(var(--border)/0.6)' }}>
              <SliderRow label="Spot Drift Trigger" value={`${voltSliders.driftThreshold.toFixed(2)}%`} color={AGENT_THEME.volt.color}>
                <input type="range" min="0.05" max="1.0" step="0.05" disabled={!isOperator} value={voltSliders.driftThreshold} onChange={(e) => setVoltSliders({ ...voltSliders, driftThreshold: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: AGENT_THEME.volt.color, cursor: isOperator ? 'pointer' : 'default', opacity: isOperator ? 1 : 0.6 }} />
              </SliderRow>
              <SliderRow label="Minimum Mispricing Edge" value={`${voltSliders.minEdge.toFixed(1)}%`} color={AGENT_THEME.volt.color}>
                <input type="range" min="1.0" max="10.0" step="0.5" disabled={!isOperator} value={voltSliders.minEdge} onChange={(e) => setVoltSliders({ ...voltSliders, minEdge: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: AGENT_THEME.volt.color, cursor: isOperator ? 'pointer' : 'default', opacity: isOperator ? 1 : 0.6 }} />
              </SliderRow>
              <SliderRow label="Order Lot Size" value={`${voltSliders.lotSize.toFixed(0)} lots`} color={AGENT_THEME.volt.color}>
                <input type="range" min="1" max="20" step="1" disabled={!isOperator} value={voltSliders.lotSize} onChange={(e) => setVoltSliders({ ...voltSliders, lotSize: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: AGENT_THEME.volt.color, cursor: isOperator ? 'pointer' : 'default', opacity: isOperator ? 1 : 0.6 }} />
              </SliderRow>
              <AgentActionButton isOperator={isOperator} isSaving={!!isSaving.Volt} saveSuccess={!!saveSuccess.Volt} color={AGENT_THEME.volt.color} onApply={handleSaveVolt} onFork={() => onForkToStudio?.('Volt', { driftThreshold: voltSliders.driftThreshold / 100.0, minEdge: voltSliders.minEdge / 100.0, lotSize: voltSliders.lotSize })} />
            </div>
          </AgentCardFrame>
        )}

        {/* 2 — Oracle Vol Arb */}
        {(activeTab === 'ALL' || activeTab === 'ORACLE') && (
          <AgentCardFrame theme={AGENT_THEME.oracle} enabled={oracleData.isEnabled}>
            <AgentCardHeader theme={AGENT_THEME.oracle} status={oracleData.status} enabled={oracleData.isEnabled} isOperator={isOperator} onToggle={() => onToggleAgent('Oracle', !oracleData.isEnabled)} />
            <AgentMetrics latency={oracleData.evalLatencyMs} latencyColor={AGENT_THEME.oracle.color} midLabel="FILLS" midValue={`${oracleData.tradesToday} fills`} midColor="var(--foreground)" pnl={oracleData.pnlAmount} />
            <TargetPills theme={AGENT_THEME.oracle} targets={['BTC/USD 5m', 'BTC/USD 15m', 'ETH/USD 5m', 'ETH/USD 15m']} />
            <div className="flex flex-col gap-3 p-3 rounded-xl border" style={{ background: 'hsl(var(--secondary)/0.20)', borderColor: 'hsl(var(--border)/0.6)' }}>
              <SliderRow label="Min Mathematical Edge Φ(z)" value={`${oracleSliders.minEdge.toFixed(1)}%`} color={AGENT_THEME.oracle.color}>
                <input type="range" min="1.5" max="12.0" step="0.5" disabled={!isOperator} value={oracleSliders.minEdge} onChange={(e) => setOracleSliders({ ...oracleSliders, minEdge: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: AGENT_THEME.oracle.color, cursor: isOperator ? 'pointer' : 'default', opacity: isOperator ? 1 : 0.6 }} />
              </SliderRow>
              <SliderRow label="Order Lot Size" value={`${oracleSliders.lotSize.toFixed(0)} lots`} color={AGENT_THEME.oracle.color}>
                <input type="range" min="1" max="25" step="1" disabled={!isOperator} value={oracleSliders.lotSize} onChange={(e) => setOracleSliders({ ...oracleSliders, lotSize: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: AGENT_THEME.oracle.color, cursor: isOperator ? 'pointer' : 'default', opacity: isOperator ? 1 : 0.6 }} />
              </SliderRow>
              <AgentActionButton isOperator={isOperator} isSaving={!!isSaving.Oracle} saveSuccess={!!saveSuccess.Oracle} color={AGENT_THEME.oracle.color} onApply={handleSaveOracle} onFork={() => onForkToStudio?.('Oracle', { minEdge: oracleSliders.minEdge / 100.0, lotSize: oracleSliders.lotSize, maxTradeSize: oracleSliders.maxTradeSize })} />
            </div>
          </AgentCardFrame>
        )}

        {/* 3 — Titan MM */}
        {(activeTab === 'ALL' || activeTab === 'TITAN') && (
          <AgentCardFrame theme={AGENT_THEME.titan} enabled={titanData.isEnabled}>
            <AgentCardHeader theme={AGENT_THEME.titan} status={titanData.status} enabled={titanData.isEnabled} isOperator={isOperator} onToggle={() => onToggleAgent('Titan', !titanData.isEnabled)} />
            <AgentMetrics latency={titanData.evalLatencyMs} latencyColor={AGENT_THEME.titan.color} midLabel="Active Quotes" midValue="6 levels" midColor="#fafafa" pnl={titanData.pnlAmount} isSpread />
            <TargetPills theme={AGENT_THEME.titan} targets={['BTC/USD 1m', 'BTC/USD 5m', 'ETH/USD 1m', 'ETH/USD 5m']} />
            <div className="flex flex-col gap-3 p-3 rounded-xl border" style={{ background: 'hsl(var(--secondary)/0.20)', borderColor: 'hsl(var(--border)/0.6)' }}>
              <SliderRow label="Target Bid-Ask Spread" value={`${titanSliders.targetSpread.toFixed(1)}%`} color={AGENT_THEME.titan.color}>
                <input type="range" min="2.0" max="8.0" step="0.5" disabled={!isOperator} value={titanSliders.targetSpread} onChange={(e) => setTitanSliders({ ...titanSliders, targetSpread: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: AGENT_THEME.titan.color, cursor: isOperator ? 'pointer' : 'default', opacity: isOperator ? 1 : 0.6 }} />
              </SliderRow>
              <SliderRow label="Inventory Skew Damping (γ)" value={titanSliders.inventoryAversion.toFixed(3)} color={AGENT_THEME.titan.color}>
                <input type="range" min="0.005" max="0.040" step="0.005" disabled={!isOperator} value={titanSliders.inventoryAversion} onChange={(e) => setTitanSliders({ ...titanSliders, inventoryAversion: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: AGENT_THEME.titan.color, cursor: isOperator ? 'pointer' : 'default', opacity: isOperator ? 1 : 0.6 }} />
              </SliderRow>
              <AgentActionButton isOperator={isOperator} isSaving={!!isSaving.Titan} saveSuccess={!!saveSuccess.Titan} color={AGENT_THEME.titan.color} onApply={handleSaveTitan} onFork={() => onForkToStudio?.('Titan', { targetSpread: titanSliders.targetSpread / 100.0, inventoryAversion: titanSliders.inventoryAversion, lotSize: titanSliders.lotSize })} />
            </div>
          </AgentCardFrame>
        )}

        {/* 4 — Sweeper Daemon */}
        {activeTab === 'ALL' && (
          <AgentCardFrame theme={AGENT_THEME.sweeper} enabled={sweeperData.isEnabled}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg grid place-items-center border flex-shrink-0 bg-secondary/30 border-border/50 text-muted-foreground">
                  <SparklesIcon className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12.5px] font-bold text-foreground tracking-tight">{AGENT_THEME.sweeper.label}</span>
                    <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 border" style={{ background: AGENT_THEME.sweeper.bg, color: AGENT_THEME.sweeper.color, borderColor: AGENT_THEME.sweeper.border }}>ACTIVE (30s)</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-medium">{AGENT_THEME.sweeper.sub}</div>
                </div>
              </div>
              <div className="w-7 h-7 rounded-full grid place-items-center border bg-secondary/30 border-border/50 text-muted-foreground">
                <CheckCircleIcon className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Total Paid Out</span>
                <span className="text-xs font-mono font-bold" style={{ color: sweeperData.pnlAmount >= 0 ? '#00e676' : '#ff3366' }}>{sweeperData.pnlAmount >= 0 ? `+${sweeperData.pnlAmount.toFixed(2)}` : sweeperData.pnlAmount.toFixed(2)} <span className="text-[10px]">tUSDC</span></span>
              </div>
              <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Markets Swept</span>
                <span className="text-xs font-mono font-bold text-foreground">{sweeperData.tradesToday} <span className="text-[10px] font-medium text-muted-foreground">contracts</span></span>
              </div>
              <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Payout Mode</span>
                <span className="text-xs font-mono font-bold text-muted-foreground">100% WALLET</span>
              </div>
            </div>

            <div className="p-3 rounded-xl border bg-secondary/20 border-border/50 flex gap-2.5 items-start">
              <div className="w-7 h-7 rounded-lg bg-secondary/30 border border-border/50 grid place-items-center text-muted-foreground flex-shrink-0 mt-0.5">
                <ShieldCheckIcon className="w-3.5 h-3.5" />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground m-0">
                Background daemon continuously scans Somnia contracts for finalized markets with positive payouts, automatically claiming and transferring <span className="font-semibold text-foreground">100% of proceeds directly</span> to user wallets.
              </p>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground pt-1 border-t border-border/30 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00e676] animate-pulse" />
              <span>Auto-settlement active • Non-custodial • Verified on-chain</span>
            </div>
          </AgentCardFrame>
        )}
      </div>
    </div>
  );
};

// ---------- Subcomponents ----------

const AgentCardFrame: React.FC<{ theme: { color: string; bg: string; border: string }; enabled: boolean; children: React.ReactNode }> = ({ theme, enabled, children }) => (
  <div className="terminal-panel p-0 overflow-hidden flex flex-col relative">
    <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: enabled ? theme.color : '#3f3f46', opacity: enabled ? 0.9 : 0.45 }} />
    <div className="p-3.5 flex flex-col gap-3 pt-4">{children}</div>
  </div>
);

const AgentCardHeader: React.FC<{
  theme: { color: string; bg: string; border: string; iconBg: string; Icon: React.ElementType; label: string; sub: string };
  status: string;
  enabled: boolean;
  isOperator: boolean;
  onToggle: () => void;
}> = ({ theme, status, enabled, isOperator, onToggle }) => {
  const Icon = theme.Icon;
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-lg grid place-items-center border flex-shrink-0 bg-secondary/30 border-border/50 text-muted-foreground">
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-bold text-foreground tracking-tight">{theme.label}</span>
            <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 font-bold border" style={{ background: enabled ? 'rgba(0,230,118,0.08)' : 'rgba(255,51,102,0.08)', color: enabled ? '#00e676' : '#ff3366', borderColor: enabled ? 'rgba(0,230,118,0.18)' : 'rgba(255,51,102,0.18)' }}>
              {status}
            </Badge>
          </div>
          <div className="text-[11px] font-medium text-muted-foreground truncate">{theme.sub}</div>
        </div>
      </div>
      {isOperator ? (
        <button
          type="button"
          onClick={onToggle}
          className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-colors cursor-pointer flex-shrink-0')}
          style={{
            background: enabled ? theme.color : '#27272a',
            color: enabled ? '#09090b' : '#a1a1aa',
            borderColor: enabled ? theme.color : '#3f3f46',
            boxShadow: enabled ? `0 0 10px ${theme.color}30` : 'none',
          }}
        >
          <PowerIcon className="w-3 h-3" />
          <span>{enabled ? 'ON' : 'OFF'}</span>
        </button>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-mono font-bold flex-shrink-0" style={{ background: enabled ? 'rgba(0,230,118,0.10)' : 'rgba(113,113,122,0.12)', color: enabled ? '#00e676' : '#a1a1aa', borderColor: enabled ? 'rgba(0,230,118,0.22)' : 'rgba(113,113,122,0.18)' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: enabled ? '#00e676' : '#71717a' }} />
          {enabled ? 'AUTONOMOUS' : 'PAUSED'}
        </span>
      )}
    </div>
  );
};

const AgentMetrics: React.FC<{ latency: number; latencyColor: string; midLabel: string; midValue: string; midColor: string; pnl: number; isSpread?: boolean }> = ({ latency, latencyColor, midLabel, midValue, midColor, pnl, isSpread }) => (
  <div className="grid grid-cols-3 gap-2">
    <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5">
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <SignalIcon className="w-3 h-3" /> Eval Latency
      </span>
      <span className="text-xs font-mono font-bold" style={{ color: latencyColor }}>
        {latency}ms
      </span>
    </div>
    <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5">
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{midLabel}</span>
      <span className="text-xs font-mono font-bold" style={{ color: midColor }}>
        {midValue}
      </span>
    </div>
    <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5">
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{isSpread ? 'Spread PnL' : 'Captured PnL'}</span>
      <span className="text-xs font-mono font-bold" style={{ color: pnl >= 0 ? '#00e676' : '#ff3366' }}>
        {pnl >= 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2)} <span className="text-[10px]">tUSDC</span>
      </span>
    </div>
  </div>
);

const TargetPills: React.FC<{ theme: { color: string; bg: string; border: string }; targets: string[] }> = ({ theme, targets }) => (
  <div className="flex items-center gap-1.5 flex-wrap">
    <span className="text-[10px] font-mono text-muted-foreground font-medium">Targets (5):</span>
    {targets.map((t) => (
      <span key={t} className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-md border" style={{ background: theme.bg, color: theme.color, borderColor: theme.border }}>
        {t}
      </span>
    ))}
  </div>
);

const SliderRow: React.FC<{ label: string; value: string; color: string; children: React.ReactNode }> = ({ label, value, color, children }) => (
  <div>
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded border" style={{ background: `${color}14`, color, borderColor: `${color}28` }}>
        {value}
      </span>
    </div>
    {children}
  </div>
);

const AgentActionButton: React.FC<{ isOperator: boolean; isSaving: boolean; saveSuccess: boolean; color: string; onApply: () => void; onFork: () => void }> = ({ isOperator, isSaving, saveSuccess, color, onApply, onFork }) =>
  isOperator ? (
    <button type="button" onClick={onApply} disabled={isSaving} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer" style={{ background: saveSuccess ? 'rgba(0,230,118,0.12)' : color, color: saveSuccess ? '#00e676' : '#09090b', borderColor: saveSuccess ? 'rgba(0,230,118,0.22)' : color, opacity: isSaving ? 0.7 : 1 }}>
      {saveSuccess ? (
        <>
          <CheckCircleIcon className="w-3.5 h-3.5" /> Parameters Synced
        </>
      ) : (
        <>
          {isSaving ? <Spinner size="xs" variant="amber" /> : <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />} {isSaving ? 'Saving...' : 'Apply Strategy Parameters'}
        </>
      )}
    </button>
  ) : (
    <button type="button" onClick={onFork} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer bg-secondary/30 hover:bg-secondary/50" style={{ color, borderColor: `${color}2a` }}>
      <ArrowUpRightIcon className="w-3.5 h-3.5" /> Simulate in Backtester
    </button>
  );
