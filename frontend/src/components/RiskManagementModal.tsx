import React, { useState } from 'react';
import {
  XMarkIcon,
  ShieldCheckIcon,
  AdjustmentsHorizontalIcon,
  InformationCircleIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { Button } from './ui/button.js';
import { Spinner } from './ui/Spinner.js';
import type { SessionGrant } from '../types/index.js';
import { UNLIMITED_AMOUNT } from '../lib/sessionUtils.js';

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
  const [maxTradeSize, setMaxTradeSize] = useState<number>(() => activeSession?.maxTradeSize || 500);
  const [dailyVolumeCap, setDailyVolumeCap] = useState<number>(() => activeSession?.dailyVolumeCap || 5000);
  const [isUnlimitedTrade, setIsUnlimitedTrade] = useState<boolean>(() => (activeSession?.maxTradeSize || 0) >= UNLIMITED_AMOUNT);
  const [isUnlimitedDaily, setIsUnlimitedDaily] = useState<boolean>(() => (activeSession?.dailyVolumeCap || 0) >= UNLIMITED_AMOUNT);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccess(false);
    try {
      if (onUpdateRisk) {
        await onUpdateRisk({
          maxTradeSize: isUnlimitedTrade ? UNLIMITED_AMOUNT : maxTradeSize,
          dailyVolumeCap: isUnlimitedDaily ? UNLIMITED_AMOUNT : dailyVolumeCap,
        });
      }
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1000);
    } catch {
      // handled in hook/caller
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

        <form onSubmit={handleSave} className="space-y-4 pt-4">
          {/* Max Trade Size */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-foreground">
                Max Single Trade Limit
              </label>
              <button
                type="button"
                onClick={() => setIsUnlimitedTrade((prev) => !prev)}
                className={`text-[11px] font-mono transition-colors cursor-pointer ${
                  isUnlimitedTrade ? 'text-[#00ffcc] font-semibold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {isUnlimitedTrade ? '[✓ No Limit]' : 'Set Unlimited'}
              </button>
            </div>
            {!isUnlimitedTrade ? (
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="1"
                  value={maxTradeSize}
                  onChange={(e) => setMaxTradeSize(parseFloat(e.target.value) || 0)}
                  className="w-full h-10 px-3.5 pr-16 rounded-xl bg-background/80 border border-border/70 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground pointer-events-none">
                  tUSDC
                </span>
              </div>
            ) : (
              <div className="h-10 px-3.5 flex items-center rounded-xl bg-muted/20 border border-border/40 font-mono text-xs text-[#00ffcc]">
                Unlimited (Full Trading Balance Available)
              </div>
            )}
          </div>

          {/* Daily Volume Cap */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-foreground">
                Daily Volume Ceiling
              </label>
              <button
                type="button"
                onClick={() => setIsUnlimitedDaily((prev) => !prev)}
                className={`text-[11px] font-mono transition-colors cursor-pointer ${
                  isUnlimitedDaily ? 'text-[#00ffcc] font-semibold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {isUnlimitedDaily ? '[✓ No Limit]' : 'Set Unlimited'}
              </button>
            </div>
            {!isUnlimitedDaily ? (
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="1"
                  value={dailyVolumeCap}
                  onChange={(e) => setDailyVolumeCap(parseFloat(e.target.value) || 0)}
                  className="w-full h-10 px-3.5 pr-16 rounded-xl bg-background/80 border border-border/70 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground pointer-events-none">
                  tUSDC
                </span>
              </div>
            ) : (
              <div className="h-10 px-3.5 flex items-center rounded-xl bg-muted/20 border border-border/40 font-mono text-xs text-[#00ffcc]">
                Unlimited (No Daily Rollover Cap)
              </div>
            )}
          </div>

          {/* Safe Isolation Note */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/20 border border-border/30 text-xs text-muted-foreground">
            <InformationCircleIcon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <span>
              Risk limits restrict how fast your deposited trading balance can be traded in a single session. Your main wallet is always isolated and can never be pulled.
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
