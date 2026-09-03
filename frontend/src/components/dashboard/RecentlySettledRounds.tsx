import React, { useState, useEffect } from 'react';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ArrowPathIcon,
  MinusCircleIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../services/api.js';
import { cn } from '../../lib/utils.js';
import { shouldPoll, STALE_TIMES } from '../../lib/polling.js';

interface RecentlySettledRoundsProps {
  currentSymbol?: string;
  onSelectMarket?: (marketId: string) => void;
}

interface SettledRoundItem {
  id: string;
  symbol: string;
  windowDuration: string;
  strikePrice: number;
  settlementPrice: number;
  settledAt: string;
  winningOutcome: 'YES' | 'NO' | 'VOID';
  isUp: boolean;
}

export const RecentlySettledRounds: React.FC<RecentlySettledRoundsProps> = ({
  currentSymbol = 'BTC/USD',
  onSelectMarket,
}) => {
  const [rounds, setRounds] = useState<SettledRoundItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchSettledRounds = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.getHistoricalMarkets(15);
      if (res.success && res.data && res.data.length > 0) {
        const formatted: SettledRoundItem[] = res.data
          .filter((m) => m.status === 'Finalized' || m.settlementPrice !== undefined)
          .map((m) => {
            const isVoid = m.winningOutcome === 'VOID';
            const isUp = (m.winningOutcome === 'YES') || (!isVoid && m.settlementPrice !== undefined && m.settlementPrice >= m.strikePrice);
            const winningOutcome: 'YES' | 'NO' | 'VOID' = isVoid ? 'VOID' : (isUp ? 'YES' : 'NO');
            const closeDate = m.resolutionTimestamp || m.closeTimestamp ? new Date(m.resolutionTimestamp || m.closeTimestamp) : new Date();
            const timeStr = closeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

            return {
              id: m.id,
              symbol: m.symbol || currentSymbol,
              windowDuration: m.windowDuration || '15m',
              strikePrice: m.strikePrice || 0,
              settlementPrice: m.settlementPrice || m.strikePrice || 0,
              settledAt: timeStr,
              winningOutcome,
              isUp,
            };
          });

        if (formatted.length > 0) {
          setRounds(formatted);
          return;
        }
      }

      setRounds([]);
    } catch {
      // non-fatal
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettledRounds();
    const interval = window.setInterval(() => {
      if (!shouldPoll()) return;
      fetchSettledRounds();
    }, STALE_TIMES.settled);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchSettledRounds();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentSymbol]);

  return (
    <div className="flex flex-col gap-1.5 py-1 px-1 select-none">
      {/* Title & Info Bar */}
      <div className="flex items-center justify-between px-1 text-[11px] font-mono text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground">Recently settled</span>
          <span className="text-[10px] text-muted-foreground/80">Historical round resolutions & payouts</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={fetchSettledRounds}
            disabled={isLoading}
            className="hover:text-foreground p-0.5 rounded transition-colors cursor-pointer"
            title="Refresh settled rounds"
          >
            <ArrowPathIcon className={cn("w-3 h-3", isLoading && "animate-spin text-brand-cyan")} />
          </button>
        </div>
      </div>

      {/* Horizontal Scrolling Strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none font-mono min-h-[42px]">
        {rounds.length === 0 ? (
          <div className="text-[11px] text-muted-foreground/60 italic px-2 py-1 flex items-center gap-1.5">
            <span>No historical rounds resolved yet in this session.</span>
          </div>
        ) : (
          rounds.map((round) => (
          <div
            key={round.id}
            onClick={() => onSelectMarket?.(round.id)}
            className={cn(
              "flex-shrink-0 flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg border bg-background/70 hover:bg-secondary/40 transition-all cursor-pointer text-xs",
              round.winningOutcome === 'VOID'
                ? "border-amber-500/20 hover:border-amber-500/40"
                : round.isUp
                ? "border-[#00e676]/20 hover:border-[#00e676]/40"
                : "border-[#ff3366]/20 hover:border-[#ff3366]/40"
            )}
            title={
              round.winningOutcome === 'VOID'
                ? `Round voided / refunded at ${round.settledAt}. Strike was $${round.strikePrice.toLocaleString()}.`
                : `Settled at $${round.settlementPrice.toLocaleString()} at ${round.settledAt}. Strike was $${round.strikePrice.toLocaleString()}.`
            }
          >
            {/* Left: Asset Icon & Window */}
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <span className="font-bold text-foreground text-[11px]">{round.symbol.split('/')[0]} {round.windowDuration}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{round.settledAt}</span>
            </div>

            {/* Middle: Settlement Price */}
            <div className="flex flex-col text-right">
              <span className="font-bold text-foreground text-[11px]">
                ${round.settlementPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[9px] text-muted-foreground">settlement</span>
            </div>

            {/* Right: Outcome Badge */}
            <div
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-0.5",
                round.winningOutcome === 'VOID'
                  ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                  : round.isUp
                  ? "bg-[#00e676]/15 text-[#00e676] border border-[#00e676]/30"
                  : "bg-[#ff3366]/15 text-[#ff3366] border border-[#ff3366]/30"
              )}
            >
              {round.winningOutcome === 'VOID' ? (
                <>
                  <MinusCircleIcon className="w-2.5 h-2.5" />
                  <span>VOID</span>
                </>
              ) : round.isUp ? (
                <>
                  <ArrowTrendingUpIcon className="w-2.5 h-2.5" />
                  <span>UP</span>
                </>
              ) : (
                <>
                  <ArrowTrendingDownIcon className="w-2.5 h-2.5" />
                  <span>DOWN</span>
                </>
              )}
            </div>
          </div>
        )))}
      </div>
    </div>
  );
};
