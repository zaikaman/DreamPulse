import React from 'react';
import {
  CheckCircleIcon,
  SparklesIcon,
  XMarkIcon,
  CurrencyDollarIcon,
  CpuChipIcon,
  KeyIcon,
} from '@heroicons/react/24/outline';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';
import { Spinner } from '../ui/Spinner.js';
import type { OnboardingQuestItem } from '../../hooks/useOnboarding.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import type { DashboardViewType } from '../landing/CinematicHero.js';

interface OnboardingQuestBarProps {
  quests: OnboardingQuestItem[];
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  allCompleted: boolean;
  isDismissed: boolean;
  isFauceting?: boolean;
  wallet?: WalletState;
  onClaimFaucet?: (amount?: number) => Promise<void>;
  onOpenSessionModal?: (options?: { revoke?: boolean }) => void;
  onNavigateTab: (tab: DashboardViewType) => void;
  onOpenTour: () => void;
  onDismiss: () => void;
}

export const OnboardingQuestBar: React.FC<OnboardingQuestBarProps> = ({
  quests,
  completedCount,
  totalCount,
  progressPercent,
  allCompleted,
  isDismissed,
  isFauceting = false,
  wallet,
  onClaimFaucet,
  onOpenSessionModal,
  onNavigateTab,
  onOpenTour,
  onDismiss,
}) => {
  if (isDismissed) return null;

  return (
    <div className="rounded-xl border border-border/70 bg-card/60 backdrop-blur-md p-3 shadow-2xs transition-all duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="p-1 rounded-md bg-secondary/80 text-foreground">
            <SparklesIcon className="w-3.5 h-3.5 text-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">
                Getting Started Quests
              </span>
              <Badge
                variant="outline"
                className={`font-mono text-[9px] px-1.5 py-0 h-4 ${
                  allCompleted
                    ? 'border-emerald-500/30 text-emerald-400 bg-emerald-950/20'
                    : 'border-border/50 text-muted-foreground'
                }`}
              >
                {completedCount} / {totalCount} Completed ({progressPercent}%)
              </Badge>
              {allCompleted && (
                <span className="text-[10px] font-mono text-emerald-400 font-medium">
                  • Shannon Pioneer Active
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenTour}
            className="h-6 text-[11px] px-2 gap-1 text-muted-foreground hover:text-foreground font-normal"
          >
            <SparklesIcon className="w-3 h-3" />
            <span>Setup Tour</span>
          </Button>

          <button
            onClick={onDismiss}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
            title="Dismiss Quest Checklist"
          >
            <XMarkIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Bar Line */}
      <div className="w-full bg-secondary/40 h-1 rounded-full overflow-hidden mt-2 mb-2.5">
        <div
          className={`h-full transition-all duration-500 ${
            allCompleted ? 'bg-emerald-400' : 'bg-foreground'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* 5 Interactive Quest Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {/* Quest 1: Connect Wallet */}
        <div
          className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-colors ${
            quests[0]?.isCompleted
              ? 'border-border/40 bg-secondary/20 text-muted-foreground'
              : 'border-border/80 bg-secondary/40 text-foreground'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {quests[0]?.isCompleted ? (
              <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-border/80 shrink-0" />
            )}
            <span className={`text-[11px] truncate ${quests[0]?.isCompleted ? 'line-through text-muted-foreground' : 'font-medium'}`}>
              1. Connect Wallet
            </span>
          </div>
        </div>

        {/* Quest 2: Claim Faucet */}
        <div
          className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-colors ${
            quests[1]?.isCompleted
              ? 'border-border/40 bg-secondary/20 text-muted-foreground'
              : 'border-border/80 bg-secondary/40 text-foreground'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {quests[1]?.isCompleted ? (
              <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-border/80 shrink-0" />
            )}
            <span className={`text-[11px] truncate ${quests[1]?.isCompleted ? 'line-through text-muted-foreground' : 'font-medium'}`}>
              2. Claim 1,000 tUSDC
            </span>
          </div>

          {!quests[1]?.isCompleted && onClaimFaucet && (
            <button
              onClick={() => onClaimFaucet(1000)}
              disabled={isFauceting || !wallet?.isConnected}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0 flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              {isFauceting ? <Spinner size="xs" /> : <CurrencyDollarIcon className="w-2.5 h-2.5" />}
              <span>Claim</span>
            </button>
          )}
        </div>

        {/* Quest 3: Authorize Session Key */}
        <div
          className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-colors ${
            quests[2]?.isCompleted
              ? 'border-border/40 bg-secondary/20 text-muted-foreground'
              : 'border-border/80 bg-secondary/40 text-foreground'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {quests[2]?.isCompleted ? (
              <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-border/80 shrink-0" />
            )}
            <span className={`text-[11px] truncate ${quests[2]?.isCompleted ? 'line-through text-muted-foreground' : 'font-medium'}`}>
              3. Authorize Session
            </span>
          </div>

          {!quests[2]?.isCompleted && onOpenSessionModal && (
            <button
              onClick={() => onOpenSessionModal()}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-foreground hover:bg-muted transition-colors shrink-0 flex items-center gap-1 cursor-pointer border border-border/60"
            >
              <KeyIcon className="w-2.5 h-2.5" />
              <span>Enable</span>
            </button>
          )}
        </div>

        {/* Quest 4: Copytrade or Place 1st Trade */}
        <div
          className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-colors ${
            quests[3]?.isCompleted
              ? 'border-border/40 bg-secondary/20 text-muted-foreground'
              : 'border-border/80 bg-secondary/40 text-foreground'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {quests[3]?.isCompleted ? (
              <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-border/80 shrink-0" />
            )}
            <span className={`text-[11px] truncate ${quests[3]?.isCompleted ? 'line-through text-muted-foreground' : 'font-medium'}`}>
              4. Copytrade Swarm
            </span>
          </div>

          {!quests[3]?.isCompleted && (
            <button
              onClick={() => onNavigateTab('Swarm Cockpit')}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-foreground hover:bg-muted transition-colors shrink-0 flex items-center gap-1 cursor-pointer border border-border/60"
            >
              <CpuChipIcon className="w-2.5 h-2.5" />
              <span>Start</span>
            </button>
          )}
        </div>

        {/* Quest 5: Build Custom Agent in Strategy Studio */}
        <div
          className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-colors ${
            quests[4]?.isCompleted
              ? 'border-border/40 bg-secondary/20 text-muted-foreground'
              : 'border-border/80 bg-secondary/40 text-foreground'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {quests[4]?.isCompleted ? (
              <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-border/80 shrink-0" />
            )}
            <span className={`text-[11px] truncate ${quests[4]?.isCompleted ? 'line-through text-muted-foreground' : 'font-medium'}`}>
              5. Strategy Studio
            </span>
          </div>

          {!quests[4]?.isCompleted && (
            <button
              onClick={() => onNavigateTab('Strategy Studio')}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
            >
              <SparklesIcon className="w-2.5 h-2.5" />
              <span>Build</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingQuestBar;
