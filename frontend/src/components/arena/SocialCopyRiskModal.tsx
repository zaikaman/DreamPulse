import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import type { ArenaTraderEntry, SocialCopyConfig } from '../../types/index.js';
import { Spinner } from '../ui/Spinner.js';
import { Button } from '../ui/button.js';
import { cn } from '../../lib/utils.js';

export interface SocialCopyRiskModalProps {
  isOpen: boolean;
  onClose: () => void;
  trader: ArenaTraderEntry | {
    userAddress: string;
    traderTitle?: string;
    tierBadge?: string;
    winRate?: number;
    realizedPnl?: number;
    volume?: number;
    favoriteSymbol?: string;
    favoriteWindow?: string;
  } | null;
  existingConfig?: SocialCopyConfig | null;
  isCurrentlyMirroring?: boolean;
  isLoading?: boolean;
  onConfirm: (params: {
    targetAddress: string;
    enabled: boolean;
    maxTradeSize: number;
    dailyVolumeCap: number;
  }) => Promise<void>;
  onStopMirroring?: (targetAddress: string) => Promise<void>;
  hasActiveSession?: boolean;
  onOpenSessionModal?: () => void;
}

const MAX_TRADE_PRESETS = [10, 25, 50, 100, 250, 500];
const DAILY_CAP_PRESETS = [100, 250, 500, 1000, 2500, 5000];

export const SocialCopyRiskModal: React.FC<SocialCopyRiskModalProps> = ({
  isOpen,
  onClose,
  trader,
  existingConfig,
  isCurrentlyMirroring = false,
  isLoading = false,
  onConfirm,
  onStopMirroring,
  hasActiveSession = true,
  onOpenSessionModal,
}) => {
  const [maxTradeSize, setMaxTradeSize] = useState<number>(50);
  const [dailyVolumeCap, setDailyVolumeCap] = useState<number>(500);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync state when modal opens or existingConfig updates
  useEffect(() => {
    if (isOpen && trader) {
      setErrorMsg(null);
      if (existingConfig) {
        setMaxTradeSize(existingConfig.maxTradeSize ?? 50);
        setDailyVolumeCap(existingConfig.dailyVolumeCap ?? 500);
      } else {
        setMaxTradeSize(50);
        setDailyVolumeCap(500);
      }
    }
  }, [isOpen, trader, existingConfig]);

  if (!isOpen || !trader) return null;

  const traderAddr = trader.userAddress;
  const title = trader.traderTitle || `Forecaster ${traderAddr.slice(0, 6)}...${traderAddr.slice(-4)}`;
  const winRate = trader.winRate ?? 65;
  const pnl = trader.realizedPnl ?? 0;
  const tier = trader.tierBadge || 'PRO';

  // Handle Submit
  const handleSubmit = async () => {
    if (maxTradeSize <= 0) {
      setErrorMsg('Max trade size must be greater than 0 USDC');
      return;
    }
    if (dailyVolumeCap <= 0) {
      setErrorMsg('Daily volume cap must be greater than 0 USDC');
      return;
    }
    if (maxTradeSize > dailyVolumeCap) {
      setErrorMsg('Max trade size cannot exceed daily volume cap');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onConfirm({
        targetAddress: traderAddr,
        enabled: true,
        maxTradeSize,
        dailyVolumeCap,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save copy-trade risk parameters');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStop = async () => {
    if (!onStopMirroring) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onStopMirroring(traderAddr);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to stop mirroring');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Estimated lot size calculation at typical $0.50 binary price
  const estimatedTypicalLots = (maxTradeSize / 0.5).toFixed(1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="relative w-full max-w-md bg-[#0c0e14] border border-border/60 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between bg-secondary/10">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground tracking-tight">
                {isCurrentlyMirroring ? 'Mirror Risk Limits' : 'Configure Forecaster Mirror'}
              </h3>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded text-muted-foreground bg-secondary/40 border border-border/50">
                {tier}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
              {title} • {traderAddr.slice(0, 6)}...{traderAddr.slice(-4)}
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground rounded-md"
          >
            <XMarkIcon className="w-4 h-4" />
          </Button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 min-h-0 text-xs">
          {/* Target Forecaster Summary Card */}
          <div className="p-3 rounded-lg bg-secondary/20 border border-border/40 flex items-center justify-between gap-3 font-mono">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Win Rate</div>
                <div className="text-xs font-semibold text-foreground mt-0.5">{winRate}%</div>
              </div>
              <div className="h-6 w-px bg-border/40" />
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Realized PnL</div>
                <div className={cn("text-xs font-semibold mt-0.5", pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {pnl >= 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2)} USDC
                </div>
              </div>
              {trader.favoriteSymbol && (
                <>
                  <div className="h-6 w-px bg-border/40 hidden sm:block" />
                  <div className="hidden sm:block">
                    <div className="text-[10px] text-muted-foreground uppercase">Market</div>
                    <div className="text-xs font-semibold text-foreground mt-0.5">
                      {trader.favoriteSymbol} {trader.favoriteWindow ? `(${trader.favoriteWindow})` : ''}
                    </div>
                  </div>
                </>
              )}
            </div>

            {isCurrentlyMirroring && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 flex-shrink-0">
                <CheckCircleIcon className="w-3 h-3" />
                Active
              </span>
            )}
          </div>

          {/* Risk Control 1: Max Trade Size (Position Sizing) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-medium text-foreground">
                  Max Position Size per Order
                </label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Maximum USDC collateral allocated to each copied trade signal.
                </p>
              </div>
              <div className="flex items-center gap-1 bg-secondary/30 border border-border/50 px-2 py-0.5 rounded font-mono text-xs">
                <span className="font-semibold text-foreground">{maxTradeSize}</span>
                <span className="text-[10px] text-muted-foreground">USDC</span>
              </div>
            </div>

            {/* Slider */}
            <input
              type="range"
              min={5}
              max={500}
              step={5}
              value={maxTradeSize}
              onChange={(e) => setMaxTradeSize(Number(e.target.value))}
              className="w-full h-1 bg-secondary/80 rounded appearance-none cursor-pointer accent-primary"
            />

            {/* Presets Chips */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {MAX_TRADE_PRESETS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setMaxTradeSize(val)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[11px] font-mono transition-colors border cursor-pointer",
                    maxTradeSize === val
                      ? "bg-primary/15 text-primary border-primary/40 font-semibold"
                      : "bg-secondary/20 text-muted-foreground border-border/40 hover:text-foreground hover:bg-secondary/40"
                  )}
                >
                  ${val}
                </button>
              ))}
            </div>

            <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
              <InformationCircleIcon className="w-3 h-3 text-muted-foreground/70 flex-shrink-0" />
              <span>
                At ~0.50 USDC/contract, ${maxTradeSize} USDC buys up to ~{estimatedTypicalLots} lots.
              </span>
            </div>
          </div>

          {/* Risk Control 2: Daily Volume Cap */}
          <div className="space-y-2 pt-3 border-t border-border/30">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-medium text-foreground">
                  24h Cumulative Volume Cap
                </label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Pauses mirror execution if 24-hour copied volume reaches this limit.
                </p>
              </div>
              <div className="flex items-center gap-1 bg-secondary/30 border border-border/50 px-2 py-0.5 rounded font-mono text-xs">
                <span className="font-semibold text-foreground">{dailyVolumeCap}</span>
                <span className="text-[10px] text-muted-foreground">USDC</span>
              </div>
            </div>

            {/* Slider */}
            <input
              type="range"
              min={50}
              max={5000}
              step={50}
              value={dailyVolumeCap}
              onChange={(e) => setDailyVolumeCap(Number(e.target.value))}
              className="w-full h-1 bg-secondary/80 rounded appearance-none cursor-pointer accent-primary"
            />

            {/* Presets Chips */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {DAILY_CAP_PRESETS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setDailyVolumeCap(val)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[11px] font-mono transition-colors border cursor-pointer",
                    dailyVolumeCap === val
                      ? "bg-primary/15 text-primary border-primary/40 font-semibold"
                      : "bg-secondary/20 text-muted-foreground border-border/40 hover:text-foreground hover:bg-secondary/40"
                  )}
                >
                  ${val}
                </button>
              ))}
            </div>
          </div>

          {/* Active Stats if already copying */}
          {existingConfig && existingConfig.totalCopiedTrades !== undefined && existingConfig.totalCopiedTrades > 0 && (
            <div className="p-2.5 rounded-lg bg-secondary/20 border border-border/30 grid grid-cols-2 gap-2 text-center font-mono">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Copied Orders</div>
                <div className="text-xs font-semibold text-foreground mt-0.5">{existingConfig.totalCopiedTrades}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Volume Mirrored</div>
                <div className="text-xs font-semibold text-foreground mt-0.5">${Number(existingConfig.totalCopiedVolume || 0).toFixed(2)}</div>
              </div>
            </div>
          )}

          {/* Session Key Delegation Status Check */}
          <div className="p-2.5 rounded-lg bg-secondary/20 border border-border/40 flex items-start gap-2.5">
            {hasActiveSession ? (
              <ShieldCheckIcon className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : (
              <ExclamationTriangleIcon className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-xs text-foreground">
                {hasActiveSession ? 'Session Key Protected' : 'Session Key Required'}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {hasActiveSession
                  ? `Automated execution is bounded by your active session allowance.`
                  : 'An active session key is required for seamless non-custodial mirror execution.'}
              </p>
              {!hasActiveSession && onOpenSessionModal && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenSessionModal}
                  className="h-6 text-[10px] font-mono mt-1.5 border-border/60"
                >
                  <span>Authorize Session</span>
                </Button>
              )}
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-border/40 bg-secondary/10 flex items-center justify-between gap-2">
          {isCurrentlyMirroring && onStopMirroring ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStop}
              disabled={isSubmitting || isLoading}
              className="h-8 text-xs border-rose-500/30 text-rose-400 hover:bg-rose-500/10 font-mono"
            >
              {isSubmitting ? <Spinner size="sm" /> : 'Stop Mirroring'}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
          )}

          <div className="flex items-center gap-2">
            {isCurrentlyMirroring && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={isSubmitting}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting || isLoading}
              className="h-8 text-xs gap-1.5 font-mono font-semibold px-4"
            >
              {isSubmitting ? (
                <>
                  <Spinner size="sm" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{isCurrentlyMirroring ? 'Save Risk Limits' : 'Start Mirroring'}</span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
