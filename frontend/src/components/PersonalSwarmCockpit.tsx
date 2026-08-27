import React, { useState, useEffect } from 'react';
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
} from '@heroicons/react/24/outline';
import type { AgentType } from '../types/index.js';
import { usePersonalSwarm } from '../hooks/usePersonalSwarm.js';
import { Spinner } from './ui/Spinner.js';
import { Badge } from './ui/badge.js';
import { cn } from '../lib/utils.js';

interface PersonalSwarmCockpitProps {
  userAddress?: string;
  onForkToStudio?: (agentType: AgentType, config: Record<string, any>) => void;
  onOpenSessionModal?: () => void;
  onConnectWallet?: () => Promise<void>;
  hasActiveSession?: boolean;
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
}) => {
  const {
    config,
    status,
    isLoading,
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

  const [voltSliders, setVoltSliders] = useState({ driftThreshold: 0.2, minEdge: 3.0, lotSize: 5.0 });
  const [oracleSliders, setOracleSliders] = useState({ minEdge: 3.5, lotSize: 5.0, maxTradeSize: 20.0 });
  const [titanSliders, setTitanSliders] = useState({ targetSpread: 4.0, inventoryAversion: 0.015, lotSize: 2.0 });
  const [saveSuccess, setSaveSuccess] = useState<Record<string, boolean>>({});
  const [isSwitching, setIsSwitching] = useState(false);

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

  const handleToggleCopyTrade = async () => {
    setIsSwitching(true);
    await toggleCopyTrade(!isCopyTradeEnabled);
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

  if (!userAddress) {
    return (
      <div className="terminal-panel p-5 overflow-hidden">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg grid place-items-center border bg-secondary/30 border-border/50 text-muted-foreground">
            <UserIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground tracking-tight">My Personal Swarm</h3>
            <p className="text-[11px] text-muted-foreground">Isolated per-wallet strategy — copy the protocol swarm or run your own isolated swarm on Somnia.</p>
          </div>
        </div>
        <div className="rounded-xl border border-dashed bg-secondary/10 border-border/40 p-4 flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 rounded-full bg-secondary/40 border border-border/40 grid place-items-center text-muted-foreground">
            <ShieldCheckIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-foreground">Connect your wallet to personalize your swarm</div>
            <div className="text-[11px] text-muted-foreground mt-1 max-w-md">By default you automatically mirror the Protocol Swarm via copy-trade. Connect and delegate a session to unlock isolated tuning: adjust drift thresholds, volatility edges, spread & inventory aversion per wallet.</div>
          </div>
          {onConnectWallet && (
            <button type="button" onClick={onConnectWallet} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors">Connect Wallet</button>
          )}
        </div>
      </div>
    );
  }

  if (isLoading && !config) {
    return (
      <div className="terminal-panel p-6 flex items-center justify-center gap-2">
        <Spinner size="sm" /><span className="text-xs text-muted-foreground font-mono">Loading personal swarm config…</span>
      </div>
    );
  }

  const voltPnl = status?.volt.pnl ?? 0;
  const oraclePnl = status?.oracle.pnl ?? 0;
  const titanPnl = status?.titan.pnl ?? 0;
  const totalPersonalPnl = Number((voltPnl + oraclePnl + titanPnl).toFixed(2));
  const totalPersonalFills = (status?.volt.tradesToday ?? 0) + (status?.oracle.tradesToday ?? 0) + (status?.titan.tradesToday ?? 0);

  // If user is in COPY mode -> show disabled overlay cards with CTA to personalize
  const isEditable = isPersonalMode && hasActiveSession && isCopyTradeEnabled;
  const needsDelegation = isPersonalMode && !hasActiveSession;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Header + Mode Switch */}
      <div className="terminal-panel p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg grid place-items-center border bg-secondary/30 border-border/50 text-muted-foreground">
              <UserIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground tracking-tight leading-none flex items-center gap-2">
                My Personal Swarm
                <Badge variant="outline" className={cn('font-mono text-[10px] px-1.5 py-0 border gap-1', !isCopyTradeEnabled ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : isPersonalMode ? 'bg-purple-500/10 text-purple-300 border-purple-500/20' : 'bg-sky-500/10 text-sky-300 border-sky-500/20')}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', !isCopyTradeEnabled ? 'bg-amber-400' : isPersonalMode ? 'bg-purple-400' : 'bg-sky-400')} />
                  {!isCopyTradeEnabled ? 'SWARM: PAUSED (TERMINAL COPILOT ONLY)' : isPersonalMode ? 'PERSONAL MODE' : 'COPY MODE'}
                </Badge>
              </h2>
              <div className="text-[11px] text-muted-foreground mt-1">
                {!isCopyTradeEnabled
                  ? 'Automated swarm trading is paused. Your session is active for 1-click Copilot Terminal trading.'
                  : isCopyMode
                  ? 'Mirroring Protocol Swarm via real-time copy-trade (isolated execution, zero custody).'
                  : 'Isolated per-wallet swarm — your strategy executes independently on Somnia.'}
                {config?.customizedAt && <span className="font-mono ml-2 text-[10px] text-muted-foreground/70">Customized {new Date(config.customizedAt).toLocaleString()}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Master Copy-Trading Switch */}
            <button
              type="button"
              onClick={handleToggleCopyTrade}
              disabled={isSwitching || isSaving}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors disabled:opacity-60 cursor-pointer',
                isCopyTradeEnabled
                  ? 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border-sky-500/30'
                  : 'bg-amber-500 hover:bg-amber-400 text-zinc-900 border-amber-500'
              )}
              title="Enable or pause automated background trading for your wallet"
            >
              <PowerIcon className="w-3.5 h-3.5" />
              <span>{isCopyTradeEnabled ? 'Pause Swarm Trading' : 'Enable Swarm Trading'}</span>
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
                  <span>{config?.mode === 'PERSONAL' ? 'Revert to Copy Mode' : 'Personalize My Swarm'}</span>
                </button>
              </>
            )}
          </div>
        </div>
        {/* KPI strip for personal swarm */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3.5 bg-secondary/10 border-b border-border/30">
          <div className="p-2.5 rounded-lg border bg-card/60 border-border/50 flex flex-col gap-0.5">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">My Swarm PnL</span>
            <span className="text-xs font-mono font-bold" style={{ color: totalPersonalPnl >= 0 ? '#6ee7b7' : '#fda4af' }}>{totalPersonalPnl >= 0 ? `+${totalPersonalPnl.toFixed(2)}` : totalPersonalPnl.toFixed(2)} <span className="text-[10px]">tUSDC</span></span>
            <span className="text-[10px] text-muted-foreground font-mono">Volt {voltPnl.toFixed(2)} · Oracle {oraclePnl.toFixed(2)} · Titan {titanPnl.toFixed(2)}</span>
          </div>
          <div className="p-2.5 rounded-lg border bg-card/60 border-border/50 flex flex-col gap-0.5">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">My Fills</span>
            <span className="text-xs font-mono font-bold text-foreground">{totalPersonalFills} <span className="text-[10px] font-medium text-muted-foreground">executions</span></span>
            <span className="text-[10px] text-muted-foreground font-mono">V {status?.volt.tradesToday ?? 0} · O {status?.oracle.tradesToday ?? 0} · T {status?.titan.tradesToday ?? 0}</span>
          </div>
          <div className="p-2.5 rounded-lg border bg-card/60 border-border/50 flex flex-col gap-0.5">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Execution Mode</span>
            <span className="text-xs font-mono font-bold" style={{ color: !isCopyTradeEnabled ? '#fbbf24' : isPersonalMode ? '#c084fc' : '#7dd3fc' }}>
              {!isCopyTradeEnabled ? 'COPILOT ONLY (OFF)' : isPersonalMode ? 'ISOLATED SWARM' : 'COPY-TRADING'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {!isCopyTradeEnabled ? 'Background swarm disabled' : isPersonalMode ? 'Independent evaluation' : 'Mirrors protocol signals'}
            </span>
          </div>
          <div className="p-2.5 rounded-lg border bg-card/60 border-border/50 flex flex-col gap-0.5">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Session Status</span>
            <span className="text-xs font-mono font-bold" style={{ color: hasActiveSession ? '#6ee7b7' : '#fda4af' }}>{hasActiveSession ? 'DELEGATED' : 'NOT DELEGATED'}</span>
            <span className="text-[10px] text-muted-foreground">{hasActiveSession ? 'On-chain authorized' : 'Delegate to trade'}</span>
          </div>
        </div>
        {/* Copy mode / Off mode explainer */}
        {!isCopyTradeEnabled ? (
          <div className="mx-3.5 my-3 p-3 rounded-xl border bg-amber-500/5 border-amber-500/15 flex gap-2.5 items-start">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 grid place-items-center text-amber-400 flex-shrink-0 mt-0.5">
              <BoltIcon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-amber-300">Terminal Copilot Only — Swarm copy-trading is currently turned OFF</div>
              <p className="text-[11px] leading-relaxed text-muted-foreground m-0 mt-1">
                Your session delegation is ready for fast 1-click execution when you place trades with the AI Copilot in the Trade Terminal. The autonomous swarm will <strong>not</strong> execute any automatic trades from your wallet. Click <strong>Enable Swarm Trading</strong> if you want the bots to automatically mirror signals into your account.
              </p>
            </div>
          </div>
        ) : isCopyMode ? (
          <div className="mx-3.5 my-3 p-3 rounded-xl border bg-sky-500/5 border-sky-500/15 flex gap-2.5 items-start">
            <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 grid place-items-center text-sky-400 flex-shrink-0 mt-0.5">
              <BeakerIcon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-sky-300">Copy-Trading Mode — Zero configuration required</div>
              <p className="text-[11px] leading-relaxed text-muted-foreground m-0 mt-1">
                Your wallet automatically mirrors every high-conviction Protocol Swarm signal (Volt / Oracle / Titan) under your session risk caps (<span className="font-mono text-foreground">single-trade & daily caps</span>). Use <strong>Fork to Backtester</strong> in the Protocol Swarm above to backtest, then click <strong>Personalize My Swarm</strong> to deploy your isolated parameters.
              </p>
            </div>
          </div>
        ) : null}
        {needsDelegation && (
          <div className="mx-3.5 my-3 p-3 rounded-xl border bg-amber-500/5 border-amber-500/15 flex gap-2.5 items-start">
            <ExclamationTriangleIcon className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-amber-300">Session delegation required for isolated execution</div>
              <p className="text-[11px] text-muted-foreground mt-1">Personal mode tuning is saved, but live execution requires an active on-chain delegation. Delegate now to let your personal swarm trade directly from your wallet.</p>
              {onOpenSessionModal && (
                <button type="button" onClick={onOpenSessionModal} className="mt-2 px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-900 text-xs font-bold hover:bg-amber-400 transition-colors">Delegate Session</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Flagship Custom Strategy & Independent Agent Deployment Bridge */}
      <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/5 flex items-center justify-between gap-3 flex-wrap transition-all hover:border-primary/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 grid place-items-center text-primary flex-shrink-0">
            <SparklesIcon className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-foreground flex items-center gap-2">
              <span>Looking for full algorithmic freedom?</span>
              <Badge variant="outline" className="text-[9px] font-mono border-primary/40 text-primary bg-primary/10">
                Strategy Studio
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Build your own custom AI agents with Gemini prompts & visual capsules, and deploy them independently with dedicated tUSDC allowances.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            window.location.hash = '#studio';
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all cursor-pointer shadow-sm"
        >
          <span>Launch Strategy Studio</span>
          <ArrowRightIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Agent Cards Grid — personal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {/* Volt */}
        <div className="terminal-panel p-0 overflow-hidden flex flex-col relative">
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: config?.voltEnabled ? AGENT_THEME.volt.color : '#3f3f46', opacity: config?.voltEnabled ? 0.9 : 0.45 }} />
          <div className="p-3.5 flex flex-col gap-3 pt-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg grid place-items-center border flex-shrink-0 bg-secondary/30 border-border/50 text-muted-foreground"><BoltIcon className="w-3.5 h-3.5" /></div>
                <div>
                  <div className="flex items-center gap-1.5"><span className="text-[13px] font-bold text-foreground tracking-tight">{AGENT_THEME.volt.label}</span>
                    <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 font-bold border" style={{ background: config?.voltEnabled ? 'rgba(52,211,153,0.08)' : 'rgba(244,63,94,0.08)', color: config?.voltEnabled ? '#6ee7b7' : '#fda4af', borderColor: config?.voltEnabled ? 'rgba(52,211,153,0.18)' : 'rgba(244,63,94,0.18)' }}>{config?.voltEnabled ? 'ENABLED' : 'PAUSED'}</Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">My Volt — {AGENT_THEME.volt.sub}</div>
                </div>
              </div>
              <button type="button" disabled={!isPersonalMode} onClick={() => toggleAgent('Volt', !config?.voltEnabled)} className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-colors flex-shrink-0', isPersonalMode ? 'cursor-pointer' : 'cursor-not-allowed opacity-60')} style={{ background: config?.voltEnabled ? AGENT_THEME.volt.color : '#27272a', color: config?.voltEnabled ? '#09090b' : '#a1a1aa', borderColor: config?.voltEnabled ? AGENT_THEME.volt.color : '#3f3f46' }}><PowerIcon className="w-3 h-3" /><span>{config?.voltEnabled ? 'ON' : 'OFF'}</span></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5"><span className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-1"><SignalIcon className="w-3 h-3" /> My PnL</span><span className="text-xs font-mono font-bold" style={{ color: voltPnl >= 0 ? '#6ee7b7' : '#fda4af' }}>{voltPnl >= 0 ? `+${voltPnl.toFixed(2)}` : voltPnl.toFixed(2)} <span className="text-[10px]">tUSDC</span></span></div>
              <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5"><span className="text-[10px] font-mono text-muted-foreground uppercase">Fills</span><span className="text-xs font-mono font-bold text-foreground">{status?.volt.tradesToday ?? 0} trades</span></div>
            </div>
            <div className="flex flex-col gap-3 p-3 rounded-xl border" style={{ background: 'hsl(var(--secondary)/0.20)', borderColor: 'hsl(var(--border)/0.6)', opacity: isEditable ? 1 : 0.55 }}>
              <SliderRow label="Spot Drift Trigger" value={`${voltSliders.driftThreshold.toFixed(2)}%`} color={AGENT_THEME.volt.color}><input type="range" min="0.05" max="1.0" step="0.05" disabled={!isEditable} value={voltSliders.driftThreshold} onChange={(e) => setVoltSliders({ ...voltSliders, driftThreshold: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: AGENT_THEME.volt.color, cursor: isEditable ? 'pointer' : 'default' }} /></SliderRow>
              <SliderRow label="Minimum Mispricing Edge" value={`${voltSliders.minEdge.toFixed(1)}%`} color={AGENT_THEME.volt.color}><input type="range" min="1.0" max="10.0" step="0.5" disabled={!isEditable} value={voltSliders.minEdge} onChange={(e) => setVoltSliders({ ...voltSliders, minEdge: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: AGENT_THEME.volt.color, cursor: isEditable ? 'pointer' : 'default' }} /></SliderRow>
              <SliderRow label="Order Lot Size" value={`${voltSliders.lotSize.toFixed(0)} lots`} color={AGENT_THEME.volt.color}><input type="range" min="1" max="20" step="1" disabled={!isEditable} value={voltSliders.lotSize} onChange={(e) => setVoltSliders({ ...voltSliders, lotSize: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: AGENT_THEME.volt.color, cursor: isEditable ? 'pointer' : 'default' }} /></SliderRow>
              <button type="button" onClick={handleSaveVolt} disabled={!isEditable || isSaving} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer disabled:opacity-60" style={{ background: saveSuccess.Volt ? 'rgba(52,211,153,0.12)' : AGENT_THEME.volt.color, color: saveSuccess.Volt ? '#6ee7b7' : '#09090b', borderColor: saveSuccess.Volt ? 'rgba(52,211,153,0.22)' : AGENT_THEME.volt.color }}>{saveSuccess.Volt ? <><CheckCircleIcon className="w-3.5 h-3.5" /> Saved to My Swarm</> : <><AdjustmentsHorizontalIcon className="w-3.5 h-3.5" /> {isCopyMode ? 'Save & Activate Personal Mode' : 'Save Personal Volt Config'}</>}</button>
              <button type="button" onClick={() => onForkToStudio?.('Volt', { driftThreshold: voltSliders.driftThreshold / 100.0, minEdge: voltSliders.minEdge / 100.0, lotSize: voltSliders.lotSize })} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold bg-secondary/30 hover:bg-secondary/50" style={{ color: AGENT_THEME.volt.color, borderColor: `${AGENT_THEME.volt.color}2a` }}><BeakerIcon className="w-3.5 h-3.5" /> Test in Backtester</button>
            </div>
          </div>
        </div>

        {/* Oracle */}
        <div className="terminal-panel p-0 overflow-hidden flex flex-col relative">
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: config?.oracleEnabled ? AGENT_THEME.oracle.color : '#3f3f46', opacity: config?.oracleEnabled ? 0.9 : 0.45 }} />
          <div className="p-3.5 flex flex-col gap-3 pt-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg grid place-items-center border flex-shrink-0 bg-secondary/30 border-border/50 text-muted-foreground"><ArrowTrendingUpIcon className="w-3.5 h-3.5" /></div>
                <div><div className="flex items-center gap-1.5"><span className="text-[13px] font-bold text-foreground tracking-tight">{AGENT_THEME.oracle.label}</span><Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 font-bold border" style={{ background: config?.oracleEnabled ? 'rgba(52,211,153,0.08)' : 'rgba(244,63,94,0.08)', color: config?.oracleEnabled ? '#6ee7b7' : '#fda4af', borderColor: config?.oracleEnabled ? 'rgba(52,211,153,0.18)' : 'rgba(244,63,94,0.18)' }}>{config?.oracleEnabled ? 'ENABLED' : 'PAUSED'}</Badge></div><div className="text-[11px] text-muted-foreground">My Oracle — {AGENT_THEME.oracle.sub}</div></div>
              </div>
              <button type="button" disabled={!isPersonalMode} onClick={() => toggleAgent('Oracle', !config?.oracleEnabled)} className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-colors flex-shrink-0', isPersonalMode ? 'cursor-pointer' : 'cursor-not-allowed opacity-60')} style={{ background: config?.oracleEnabled ? AGENT_THEME.oracle.color : '#27272a', color: config?.oracleEnabled ? '#09090b' : '#a1a1aa', borderColor: config?.oracleEnabled ? AGENT_THEME.oracle.color : '#3f3f46' }}><PowerIcon className="w-3 h-3" /><span>{config?.oracleEnabled ? 'ON' : 'OFF'}</span></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5"><span className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-1"><SignalIcon className="w-3 h-3" /> My PnL</span><span className="text-xs font-mono font-bold" style={{ color: oraclePnl >= 0 ? '#6ee7b7' : '#fda4af' }}>{oraclePnl >= 0 ? `+${oraclePnl.toFixed(2)}` : oraclePnl.toFixed(2)} <span className="text-[10px]">tUSDC</span></span></div>
              <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5"><span className="text-[10px] font-mono text-muted-foreground uppercase">Fills</span><span className="text-xs font-mono font-bold text-foreground">{status?.oracle.tradesToday ?? 0} trades</span></div>
            </div>
            <div className="flex flex-col gap-3 p-3 rounded-xl border" style={{ background: 'hsl(var(--secondary)/0.20)', borderColor: 'hsl(var(--border)/0.6)', opacity: isEditable ? 1 : 0.55 }}>
              <SliderRow label="Min Mathematical Edge Φ(z)" value={`${oracleSliders.minEdge.toFixed(1)}%`} color={AGENT_THEME.oracle.color}><input type="range" min="1.5" max="12.0" step="0.5" disabled={!isEditable} value={oracleSliders.minEdge} onChange={(e) => setOracleSliders({ ...oracleSliders, minEdge: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: AGENT_THEME.oracle.color, cursor: isEditable ? 'pointer' : 'default' }} /></SliderRow>
              <SliderRow label="Order Lot Size" value={`${oracleSliders.lotSize.toFixed(0)} lots`} color={AGENT_THEME.oracle.color}><input type="range" min="1" max="25" step="1" disabled={!isEditable} value={oracleSliders.lotSize} onChange={(e) => setOracleSliders({ ...oracleSliders, lotSize: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: AGENT_THEME.oracle.color, cursor: isEditable ? 'pointer' : 'default' }} /></SliderRow>
              <SliderRow label="Max Trade Size (tUSDC)" value={`${oracleSliders.maxTradeSize.toFixed(0)}`} color={AGENT_THEME.oracle.color}><input type="range" min="5" max="50" step="1" disabled={!isEditable} value={oracleSliders.maxTradeSize} onChange={(e) => setOracleSliders({ ...oracleSliders, maxTradeSize: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: AGENT_THEME.oracle.color, cursor: isEditable ? 'pointer' : 'default' }} /></SliderRow>
              <button type="button" onClick={handleSaveOracle} disabled={!isEditable || isSaving} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer disabled:opacity-60" style={{ background: saveSuccess.Oracle ? 'rgba(52,211,153,0.12)' : AGENT_THEME.oracle.color, color: saveSuccess.Oracle ? '#6ee7b7' : '#09090b', borderColor: saveSuccess.Oracle ? 'rgba(52,211,153,0.22)' : AGENT_THEME.oracle.color }}>{saveSuccess.Oracle ? <><CheckCircleIcon className="w-3.5 h-3.5" /> Saved to My Swarm</> : <><AdjustmentsHorizontalIcon className="w-3.5 h-3.5" /> {isCopyMode ? 'Save & Activate Personal Mode' : 'Save Personal Oracle Config'}</>}</button>
              <button type="button" onClick={() => onForkToStudio?.('Oracle', { minEdge: oracleSliders.minEdge / 100.0, lotSize: oracleSliders.lotSize, maxTradeSize: oracleSliders.maxTradeSize })} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold bg-secondary/30 hover:bg-secondary/50" style={{ color: AGENT_THEME.oracle.color, borderColor: `${AGENT_THEME.oracle.color}2a` }}><BeakerIcon className="w-3.5 h-3.5" /> Test in Backtester</button>
            </div>
          </div>
        </div>

        {/* Titan */}
        <div className="terminal-panel p-0 overflow-hidden flex flex-col relative">
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: config?.titanEnabled ? AGENT_THEME.titan.color : '#3f3f46', opacity: config?.titanEnabled ? 0.9 : 0.45 }} />
          <div className="p-3.5 flex flex-col gap-3 pt-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg grid place-items-center border flex-shrink-0 bg-secondary/30 border-border/50 text-muted-foreground"><Square3Stack3DIcon className="w-3.5 h-3.5" /></div>
                <div><div className="flex items-center gap-1.5"><span className="text-[13px] font-bold text-foreground tracking-tight">{AGENT_THEME.titan.label}</span><Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 font-bold border" style={{ background: config?.titanEnabled ? 'rgba(52,211,153,0.08)' : 'rgba(244,63,94,0.08)', color: config?.titanEnabled ? '#6ee7b7' : '#fda4af', borderColor: config?.titanEnabled ? 'rgba(52,211,153,0.18)' : 'rgba(244,63,94,0.18)' }}>{config?.titanEnabled ? 'ENABLED' : 'PAUSED'}</Badge></div><div className="text-[11px] text-muted-foreground">My Titan — {AGENT_THEME.titan.sub}</div></div>
              </div>
              <button type="button" disabled={!isPersonalMode} onClick={() => toggleAgent('Titan', !config?.titanEnabled)} className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-colors flex-shrink-0', isPersonalMode ? 'cursor-pointer' : 'cursor-not-allowed opacity-60')} style={{ background: config?.titanEnabled ? AGENT_THEME.titan.color : '#27272a', color: config?.titanEnabled ? '#09090b' : '#a1a1aa', borderColor: config?.titanEnabled ? AGENT_THEME.titan.color : '#3f3f46' }}><PowerIcon className="w-3 h-3" /><span>{config?.titanEnabled ? 'ON' : 'OFF'}</span></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5"><span className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-1"><SignalIcon className="w-3 h-3" /> My PnL</span><span className="text-xs font-mono font-bold" style={{ color: titanPnl >= 0 ? '#6ee7b7' : '#fda4af' }}>{titanPnl >= 0 ? `+${titanPnl.toFixed(2)}` : titanPnl.toFixed(2)} <span className="text-[10px]">tUSDC</span></span></div>
              <div className="p-2.5 rounded-lg border bg-secondary/30 border-border/50 flex flex-col gap-0.5"><span className="text-[10px] font-mono text-muted-foreground uppercase">Fills</span><span className="text-xs font-mono font-bold text-foreground">{status?.titan.tradesToday ?? 0} trades</span></div>
            </div>
            <div className="flex flex-col gap-3 p-3 rounded-xl border" style={{ background: 'hsl(var(--secondary)/0.20)', borderColor: 'hsl(var(--border)/0.6)', opacity: isEditable ? 1 : 0.55 }}>
              <SliderRow label="Target Bid-Ask Spread" value={`${titanSliders.targetSpread.toFixed(1)}%`} color={AGENT_THEME.titan.color}><input type="range" min="2.0" max="8.0" step="0.5" disabled={!isEditable} value={titanSliders.targetSpread} onChange={(e) => setTitanSliders({ ...titanSliders, targetSpread: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: AGENT_THEME.titan.color, cursor: isEditable ? 'pointer' : 'default' }} /></SliderRow>
              <SliderRow label="Inventory Skew Damping (γ)" value={titanSliders.inventoryAversion.toFixed(3)} color={AGENT_THEME.titan.color}><input type="range" min="0.005" max="0.040" step="0.005" disabled={!isEditable} value={titanSliders.inventoryAversion} onChange={(e) => setTitanSliders({ ...titanSliders, inventoryAversion: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: AGENT_THEME.titan.color, cursor: isEditable ? 'pointer' : 'default' }} /></SliderRow>
              <button type="button" onClick={handleSaveTitan} disabled={!isEditable || isSaving} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer disabled:opacity-60" style={{ background: saveSuccess.Titan ? 'rgba(52,211,153,0.12)' : AGENT_THEME.titan.color, color: saveSuccess.Titan ? '#6ee7b7' : '#09090b', borderColor: saveSuccess.Titan ? 'rgba(52,211,153,0.22)' : AGENT_THEME.titan.color }}>{saveSuccess.Titan ? <><CheckCircleIcon className="w-3.5 h-3.5" /> Saved to My Swarm</> : <><AdjustmentsHorizontalIcon className="w-3.5 h-3.5" /> {isCopyMode ? 'Save & Activate Personal Mode' : 'Save Personal Titan Config'}</>}</button>
              <button type="button" onClick={() => onForkToStudio?.('Titan', { targetSpread: titanSliders.targetSpread / 100.0, inventoryAversion: titanSliders.inventoryAversion, lotSize: titanSliders.lotSize })} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold bg-secondary/30 hover:bg-secondary/50" style={{ color: AGENT_THEME.titan.color, borderColor: `${AGENT_THEME.titan.color}2a` }}><BeakerIcon className="w-3.5 h-3.5" /> Test in Backtester</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SliderRow: React.FC<{ label: string; value: string; color: string; children: React.ReactNode }> = ({ label, value, color, children }) => (
  <div>
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded border" style={{ background: `${color}14`, color, borderColor: `${color}28` }}>{value}</span>
    </div>
    {children}
  </div>
);
