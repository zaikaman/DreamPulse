import React, { useState } from 'react';
import {
  XMarkIcon,
  ShieldCheckIcon,
  AdjustmentsHorizontalIcon,
  InformationCircleIcon,
  CheckIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { Button } from './ui/button.js';
import { Spinner } from './ui/Spinner.js';
import type { SessionGrant } from '../types/index.js';
import {
  MAX_ALLOWED_TRADE_SIZE,
  MAX_ALLOWED_DAILY_CAP,
} from '../lib/sessionUtils.js';

interface RiskManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSession: SessionGrant | null;
  onUpdateRisk?: (params: {
    maxTradeSize: number;
    dailyVolumeCap: number;
  }) => Promise<void>;
}

export const RiskManagementModal: React.FC<RiskManagementModalProps> = ({
  isOpen,
  onClose,
  activeSession,
  onUpdateRisk,
}) => {
  const [maxTradeSize, setMaxTradeSize] = useState<number>(() =>
    Math.min(MAX_ALLOWED_TRADE_SIZE, Math.max(1, activeSession?.maxTradeSize || MAX_ALLOWED_TRADE_SIZE))
  );
  const [dailyVolumeCap, setDailyVolumeCap] = useState<number>(() =>
    Math.min(MAX_ALLOWED_DAILY_CAP, Math.max(maxTradeSize, activeSession?.dailyVolumeCap || MAX_ALLOWED_DAILY_CAP))
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trade = Number(maxTradeSize);
    const daily = Number(dailyVolumeCap);

    if (isNaN(trade) || trade <= 0 || trade > MAX_ALLOWED_TRADE_SIZE) {
      setValidationError(`Single trade limit must be between 1 and ${MAX_ALLOWED_TRADE_SIZE} tUSDC (contract ceiling).`);
      return;
    }
    if (isNaN(daily) || daily < trade) {
      setValidationError(`Daily volume cap must be at least equal to single trade limit ($${trade} tUSDC).`);
      return;
    }
    if (daily > MAX_ALLOWED_DAILY_CAP) {
      setValidationError(`Daily volume cap cannot exceed ${MAX_ALLOWED_DAILY_CAP} tUSDC (contract ceiling).`);
      return;
    }

    setIsSaving(true);
    setSuccess(false);
    try {
      if (onUpdateRisk) {
        await onUpdateRisk({
          maxTradeSize: trade,
          dailyVolumeCap: daily,
        });
      }
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1000);
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to update risk parameters');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-border/80 bg-card/95 p-6 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <AdjustmentsHorizontalIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground tracking-tight">
                Risk Controls & Guardrails
              </h2>
              <p className="text-xs text-muted-foreground font-mono">
                Decoupled on-chain session ceilings
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors cursor-pointer"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Validation Error Banner */}
        {validationError && (
          <div className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 flex items-start gap-2 text-xs text-destructive">
            <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{validationError}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4 pt-4">
          {/* Max Trade Size */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-foreground">
                Max Single Trade Limit
              </label>
              <button
                type="button"
                onClick={() => {
                  setMaxTradeSize(MAX_ALLOWED_TRADE_SIZE);
                  setValidationError(null);
                }}
                className={`text-[11px] font-mono transition-colors cursor-pointer ${
                  maxTradeSize === MAX_ALLOWED_TRADE_SIZE
                    ? 'text-[#00ffcc] font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                [Max Cap: ${MAX_ALLOWED_TRADE_SIZE}]
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="1"
                max={MAX_ALLOWED_TRADE_SIZE}
                value={maxTradeSize}
                onChange={(e) => {
                  setMaxTradeSize(parseFloat(e.target.value) || 0);
                  setValidationError(null);
                }}
                className="w-full h-10 px-3.5 pr-16 rounded-xl bg-background/80 border border-border/70 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground pointer-events-none">
                tUSDC
              </span>
            </div>
            <p className="text-[10.5px] text-muted-foreground font-mono mt-1">
              On-chain absolute ceiling: ${MAX_ALLOWED_TRADE_SIZE} tUSDC per trade
            </p>
          </div>

          {/* Daily Volume Cap */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-foreground">
                Daily Volume Ceiling (Rolling 24h)
              </label>
              <button
                type="button"
                onClick={() => {
                  setDailyVolumeCap(MAX_ALLOWED_DAILY_CAP);
                  setValidationError(null);
                }}
                className={`text-[11px] font-mono transition-colors cursor-pointer ${
                  dailyVolumeCap === MAX_ALLOWED_DAILY_CAP
                    ? 'text-[#00ffcc] font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                [Max Cap: ${MAX_ALLOWED_DAILY_CAP}]
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                min={maxTradeSize || 1}
                max={MAX_ALLOWED_DAILY_CAP}
                value={dailyVolumeCap}
                onChange={(e) => {
                  setDailyVolumeCap(parseFloat(e.target.value) || 0);
                  setValidationError(null);
                }}
                className="w-full h-10 px-3.5 pr-16 rounded-xl bg-background/80 border border-border/70 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground pointer-events-none">
                tUSDC
              </span>
            </div>
            <p className="text-[10.5px] text-muted-foreground font-mono mt-1">
              On-chain absolute ceiling: ${MAX_ALLOWED_DAILY_CAP.toLocaleString()} tUSDC per 24 hours
            </p>
          </div>

          {/* Safe Isolation Note */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/20 border border-border/30 text-xs text-muted-foreground">
            <InformationCircleIcon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <span>
              Risk ceilings restrict autonomous agent execution on-chain. Trades exceeding ${MAX_ALLOWED_TRADE_SIZE} tUSDC or a daily volume of ${MAX_ALLOWED_DAILY_CAP.toLocaleString()} tUSDC are blocked at the smart contract level.
            </span>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={isSaving}
            className="w-full h-10 text-xs font-semibold gap-2 cursor-pointer"
          >
            {isSaving ? (
              <>
                <Spinner size="sm" />
                <span>Applying Guardrails...</span>
              </>
            ) : success ? (
              <>
                <CheckIcon className="w-4 h-4 text-emerald-400" />
                <span>Guardrails Updated!</span>
              </>
            ) : (
              <>
                <ShieldCheckIcon className="w-4 h-4" />
                <span>Save Risk Settings</span>
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};
