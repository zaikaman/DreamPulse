import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { usePersonalSwarm } from '../../hooks/usePersonalSwarm.js';
import { Spinner } from '../ui/Spinner.js';
import { Button } from '../ui/button.js';
import { cn } from '../../lib/utils.js';

export interface SwarmRiskModalProps {
  isOpen: boolean;
  onClose: () => void;
  userAddress?: string;
  initialAgentFocus?: 'volt' | 'oracle' | 'titan' | 'sweeper' | null;
}

type AgentTab = 'volt' | 'oracle' | 'titan' | 'sweeper';

export const SwarmRiskModal: React.FC<SwarmRiskModalProps> = ({
  isOpen,
  onClose,
  userAddress,
  initialAgentFocus = 'volt',
}) => {
  const {
    config,
    isSaving,
    isCopyTradeEnabled,
    toggleCopyTrade,
    toggleAgent,
    updateAgentConfig,
    updateFleetConfig,
    resetToCopy,
  } = usePersonalSwarm(userAddress);

  const [activeTab, setActiveTab] = useState<AgentTab>('volt');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Sliders state
  const [voltSliders, setVoltSliders] = useState({
    driftThreshold: 0.2,
    minEdge: 3.0,
    lotSize: 5.0,
    maxTradeSize: 20.0,
  });
  const [oracleSliders, setOracleSliders] = useState({
    minEdge: 3.5,
    lotSize: 5.0,
    maxTradeSize: 20.0,
  });
  const [titanSliders, setTitanSliders] = useState({
    targetSpread: 4.0,
    inventoryAversion: 0.015,
    lotSize: 2.0,
  });

  // Sync sliders on config change or modal open
  useEffect(() => {
    if (initialAgentFocus) {
      setActiveTab(initialAgentFocus);
    }
  }, [initialAgentFocus, isOpen]);

  useEffect(() => {
    if (!config) return;
    setVoltSliders({
      driftThreshold: Number(((config.voltConfig?.driftThreshold ?? 0.002) * 100).toFixed(2)),
      minEdge: Number(((config.voltConfig?.minEdge ?? 0.03) * 100).toFixed(1)),
      lotSize: config.voltConfig?.lotSize ?? 5.0,
      maxTradeSize: config.voltConfig?.maxTradeSize ?? 20.0,
    });
    setOracleSliders({
      minEdge: Number(((config.oracleConfig?.minEdge ?? 0.035) * 100).toFixed(1)),
      lotSize: config.oracleConfig?.lotSize ?? 5.0,
      maxTradeSize: config.oracleConfig?.maxTradeSize ?? 20.0,
    });
    setTitanSliders({
      targetSpread: Number(((config.titanConfig?.targetSpread ?? 0.04) * 100).toFixed(1)),
      inventoryAversion: config.titanConfig?.inventoryAversion ?? 0.015,
      lotSize: config.titanConfig?.lotSize ?? 2.0,
    });
  }, [config]);

  if (!isOpen) return null;

  // Preset Risk Profiles
  const applyRiskPreset = (preset: 'conservative' | 'balanced' | 'aggressive') => {
    if (preset === 'conservative') {
      setVoltSliders({ driftThreshold: 0.35, minEdge: 5.0, lotSize: 2.0, maxTradeSize: 10.0 });
      setOracleSliders({ minEdge: 5.0, lotSize: 2.0, maxTradeSize: 10.0 });
      setTitanSliders({ targetSpread: 6.0, inventoryAversion: 0.025, lotSize: 1.0 });
    } else if (preset === 'balanced') {
      setVoltSliders({ driftThreshold: 0.20, minEdge: 3.0, lotSize: 5.0, maxTradeSize: 25.0 });
      setOracleSliders({ minEdge: 3.5, lotSize: 5.0, maxTradeSize: 25.0 });
      setTitanSliders({ targetSpread: 4.0, inventoryAversion: 0.015, lotSize: 2.0 });
    } else {
      setVoltSliders({ driftThreshold: 0.10, minEdge: 1.5, lotSize: 15.0, maxTradeSize: 75.0 });
      setOracleSliders({ minEdge: 2.0, lotSize: 15.0, maxTradeSize: 75.0 });
      setTitanSliders({ targetSpread: 2.5, inventoryAversion: 0.008, lotSize: 5.0 });
    }
  };

  const handleSaveAllSettings = async () => {
    setSaveSuccessMsg(null);
    try {
      const fleetUpdates = {
        volt: {
          driftThreshold: voltSliders.driftThreshold / 100,
          minEdge: voltSliders.minEdge / 100,
          lotSize: voltSliders.lotSize,
          maxTradeSize: voltSliders.maxTradeSize,
        },
        oracle: {
          minEdge: oracleSliders.minEdge / 100,
          lotSize: oracleSliders.lotSize,
          maxTradeSize: oracleSliders.maxTradeSize,
        },
        titan: {
          targetSpread: titanSliders.targetSpread / 100,
          inventoryAversion: titanSliders.inventoryAversion,
          lotSize: titanSliders.lotSize,
        },
      };

      let ok = false;
      try {
        ok = await updateFleetConfig(fleetUpdates);
      } catch {
        // Fallback: sequential execution to prevent concurrent read-modify-write race condition
        for (const [agent, cfg] of [
          ['Volt', fleetUpdates.volt] as const,
          ['Oracle', fleetUpdates.oracle] as const,
          ['Titan', fleetUpdates.titan] as const,
        ]) {
          await updateAgentConfig(agent, cfg);
        }
        ok = true;
      }

      if (ok) {
        setSaveSuccessMsg('Swarm fleet risk and position settings saved.');
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      }
    } catch {}
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-[#0c0e14] border border-border/60 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between bg-secondary/10">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground tracking-tight">
                Swarm Fleet Risk & Position Sizing
              </h3>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded text-muted-foreground bg-secondary/40 border border-border/50">
                {isCopyTradeEnabled ? 'SWARM COPY ACTIVE' : 'SWARM COPY PAUSED'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
              Tune position sizes, drift tolerances, and execution limits across autonomous agents.
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground rounded-md"
          >
            <XMarkIcon className="w-4 h-4" />
          </Button>
        </div>

        {/* Global Swarm Master Toggle & Risk Presets */}
        <div className="px-5 py-3 bg-secondary/15 border-b border-border/30 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-foreground">Global Swarm Copy-Trading</div>
              <div className="text-[11px] text-muted-foreground">
                {isCopyTradeEnabled
                  ? 'Mirroring active algorithmic agent signals via your session key'
                  : 'Swarm copy-trading is currently paused'}
              </div>
            </div>

            <Button
              variant={isCopyTradeEnabled ? "outline" : "default"}
              size="sm"
              onClick={() => toggleCopyTrade(!isCopyTradeEnabled)}
              disabled={isSaving}
              className={cn(
                "h-7 text-xs font-mono px-3",
                isCopyTradeEnabled
                  ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                  : "bg-primary text-primary-foreground font-semibold"
              )}
            >
              {isSaving ? <Spinner size="sm" /> : isCopyTradeEnabled ? 'Active (Click to Pause)' : 'Activate Swarm Copy'}
            </Button>
          </div>

          {/* Quick Risk Presets */}
          <div className="flex items-center gap-2 pt-1 border-t border-border/20">
            <span className="text-[10px] text-muted-foreground uppercase font-mono">Risk Presets:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => applyRiskPreset('conservative')}
                className="px-2 py-0.5 rounded text-[10px] font-mono bg-secondary/20 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors cursor-pointer"
              >
                Conservative
              </button>
              <button
                type="button"
                onClick={() => applyRiskPreset('balanced')}
                className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/10 border border-primary/30 text-primary font-medium hover:bg-primary/20 transition-colors cursor-pointer"
              >
                Balanced
              </button>
              <button
                type="button"
                onClick={() => applyRiskPreset('aggressive')}
                className="px-2 py-0.5 rounded text-[10px] font-mono bg-secondary/20 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors cursor-pointer"
              >
                Aggressive
              </button>
            </div>
          </div>
        </div>

        {/* Agent Navigation Tabs */}
        <div className="flex border-b border-border/40 bg-secondary/10 px-5 pt-1.5 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('volt')}
            className={cn(
              "py-1.5 px-3 text-xs font-mono border-b-2 transition-colors cursor-pointer",
              activeTab === 'volt'
                ? "border-foreground text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Volt Sniper
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('oracle')}
            className={cn(
              "py-1.5 px-3 text-xs font-mono border-b-2 transition-colors cursor-pointer",
              activeTab === 'oracle'
                ? "border-foreground text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Oracle Vol Arb
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('titan')}
            className={cn(
              "py-1.5 px-3 text-xs font-mono border-b-2 transition-colors cursor-pointer",
              activeTab === 'titan'
                ? "border-foreground text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Titan MM
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sweeper')}
            className={cn(
              "py-1.5 px-3 text-xs font-mono border-b-2 transition-colors cursor-pointer",
              activeTab === 'sweeper'
                ? "border-foreground text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Sweeper
          </button>
        </div>

        {/* Active Agent Parameter Controls */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 min-h-0 text-xs">
          {/* VOLT SNIPER CONTROLS */}
          {activeTab === 'volt' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/20 border border-border/40">
                <div>
                  <div className="text-xs font-semibold text-foreground">Volt Sniper Latency Drift Execution</div>
                  <div className="text-[10px] text-muted-foreground font-mono">Snipes off-market quotes when spot price updates before CLOB</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAgent('Volt', !(config?.voltEnabled ?? true))}
                  className={cn(
                    "h-6 text-[10px] font-mono px-2",
                    config?.voltEnabled ?? true ? "border-emerald-500/30 text-emerald-400" : "border-border text-muted-foreground"
                  )}
                >
                  {config?.voltEnabled ?? true ? 'Enabled' : 'Disabled'}
                </Button>
              </div>

              {/* Position Size / Lot Size */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-foreground">Position Size (Lot Size per Signal)</label>
                  <span className="text-xs font-mono font-semibold text-foreground">{voltSliders.lotSize} contracts</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={voltSliders.lotSize}
                  onChange={(e) => setVoltSliders({ ...voltSliders, lotSize: Number(e.target.value) })}
                  className="w-full h-1 bg-secondary/80 rounded appearance-none cursor-pointer accent-primary"
                />
              </div>

              {/* Max Trade Size */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-foreground">Max Capital Allocated per Trade</label>
                  <span className="text-xs font-mono font-semibold text-foreground">${voltSliders.maxTradeSize} tUSDC</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={150}
                  step={5}
                  value={voltSliders.maxTradeSize}
                  onChange={(e) => setVoltSliders({ ...voltSliders, maxTradeSize: Number(e.target.value) })}
                  className="w-full h-1 bg-secondary/80 rounded appearance-none cursor-pointer accent-primary"
                />
              </div>

              {/* Min Edge */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-foreground">Minimum Edge Threshold</label>
                  <span className="text-xs font-mono font-semibold text-foreground">{voltSliders.minEdge}%</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={10.0}
                  step={0.5}
                  value={voltSliders.minEdge}
                  onChange={(e) => setVoltSliders({ ...voltSliders, minEdge: Number(e.target.value) })}
                  className="w-full h-1 bg-secondary/80 rounded appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>
          )}

          {/* ORACLE VOL ARB CONTROLS */}
          {activeTab === 'oracle' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/20 border border-border/40">
                <div>
                  <div className="text-xs font-semibold text-foreground">Oracle Vol Arb Black-Scholes Engine</div>
                  <div className="text-[10px] text-muted-foreground font-mono">Arbitrages implied probability mispricings vs theoretical fair value</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAgent('Oracle', !(config?.oracleEnabled ?? true))}
                  className={cn(
                    "h-6 text-[10px] font-mono px-2",
                    config?.oracleEnabled ?? true ? "border-emerald-500/30 text-emerald-400" : "border-border text-muted-foreground"
                  )}
                >
                  {config?.oracleEnabled ?? true ? 'Enabled' : 'Disabled'}
                </Button>
              </div>

              {/* Lot Size */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-foreground">Position Size (Lot Size per Signal)</label>
                  <span className="text-xs font-mono font-semibold text-foreground">{oracleSliders.lotSize} contracts</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={oracleSliders.lotSize}
                  onChange={(e) => setOracleSliders({ ...oracleSliders, lotSize: Number(e.target.value) })}
                  className="w-full h-1 bg-secondary/80 rounded appearance-none cursor-pointer accent-primary"
                />
              </div>

              {/* Max Trade Size */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-foreground">Max Capital Allocated per Trade</label>
                  <span className="text-xs font-mono font-semibold text-foreground">${oracleSliders.maxTradeSize} tUSDC</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={150}
                  step={5}
                  value={oracleSliders.maxTradeSize}
                  onChange={(e) => setOracleSliders({ ...oracleSliders, maxTradeSize: Number(e.target.value) })}
                  className="w-full h-1 bg-secondary/80 rounded appearance-none cursor-pointer accent-primary"
                />
              </div>

              {/* Min Edge */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-foreground">Theoretical Fair Value Edge</label>
                  <span className="text-xs font-mono font-semibold text-foreground">{oracleSliders.minEdge}%</span>
                </div>
                <input
                  type="range"
                  min={1.0}
                  max={10.0}
                  step={0.5}
                  value={oracleSliders.minEdge}
                  onChange={(e) => setOracleSliders({ ...oracleSliders, minEdge: Number(e.target.value) })}
                  className="w-full h-1 bg-secondary/80 rounded appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>
          )}

          {/* TITAN MM CONTROLS */}
          {activeTab === 'titan' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/20 border border-border/40">
                <div>
                  <div className="text-xs font-semibold text-foreground">Titan Market Making & Inventory Skew</div>
                  <div className="text-[10px] text-muted-foreground font-mono">Provides two-sided liquidity and captures CLOB bid-ask spread</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAgent('Titan', !(config?.titanEnabled ?? true))}
                  className={cn(
                    "h-6 text-[10px] font-mono px-2",
                    config?.titanEnabled ?? true ? "border-emerald-500/30 text-emerald-400" : "border-border text-muted-foreground"
                  )}
                >
                  {config?.titanEnabled ?? true ? 'Enabled' : 'Disabled'}
                </Button>
              </div>

              {/* Lot Size */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-foreground">Quote Size (Lot Size per Level)</label>
                  <span className="text-xs font-mono font-semibold text-foreground">{titanSliders.lotSize} contracts</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={20}
                  step={0.5}
                  value={titanSliders.lotSize}
                  onChange={(e) => setTitanSliders({ ...titanSliders, lotSize: Number(e.target.value) })}
                  className="w-full h-1 bg-secondary/80 rounded appearance-none cursor-pointer accent-primary"
                />
              </div>

              {/* Target Spread */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-foreground">Target Bid-Ask Spread</label>
                  <span className="text-xs font-mono font-semibold text-foreground">{titanSliders.targetSpread}%</span>
                </div>
                <input
                  type="range"
                  min={1.0}
                  max={10.0}
                  step={0.5}
                  value={titanSliders.targetSpread}
                  onChange={(e) => setTitanSliders({ ...titanSliders, targetSpread: Number(e.target.value) })}
                  className="w-full h-1 bg-secondary/80 rounded appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>
          )}

          {/* SWEEPER CONTROLS */}
          {activeTab === 'sweeper' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 border border-border/40">
                <div>
                  <div className="text-xs font-semibold text-foreground">Sweeper Daemon Auto-Settlement</div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    Automatically sweeps expired in-the-money binary market contracts and redeems payouts directly to your wallet.
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAgent('Sweeper', !(config?.sweeperEnabled ?? true))}
                  className={cn(
                    "h-6 text-[10px] font-mono px-2",
                    config?.sweeperEnabled ?? true ? "border-emerald-500/30 text-emerald-400" : "border-border text-muted-foreground"
                  )}
                >
                  {config?.sweeperEnabled ?? true ? 'Active' : 'Paused'}
                </Button>
              </div>
            </div>
          )}

          {/* Success Message */}
          {saveSuccessMsg && (
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center gap-2">
              <CheckCircleIcon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-border/40 bg-secondary/10 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            Close
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={resetToCopy}
              disabled={isSaving}
              className="h-8 text-xs text-muted-foreground hover:text-foreground font-mono"
            >
              Reset to Defaults
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={handleSaveAllSettings}
              disabled={isSaving}
              className="h-8 text-xs gap-1.5 font-mono font-semibold px-4 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Spinner size="sm" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Settings</span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
