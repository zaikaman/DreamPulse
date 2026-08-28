import React from 'react';
import { ViewfinderCircleIcon, ArrowRightIcon, BoltIcon } from '@heroicons/react/24/outline';
import type { Market } from '../../types/index.js';
import type { MarketTickData } from '../../hooks/useTelemetry.js';
import { EdgeRadarHeatmap } from '../EdgeRadarHeatmap.js';
import { Skeleton } from '../ui/Skeleton.js';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';
import { cn } from '../../lib/utils.js';

interface EdgeRadarViewProps {
  markets: Market[];
  selectedMarketId: string | null;
  onSelectMarket: (marketId: string) => void;
  liveTicks: Map<string, MarketTickData>;
  onNavigateToDepth: () => void;
  isLoading?: boolean;
}

const EdgeRadarViewComponent: React.FC<EdgeRadarViewProps> = ({
  markets,
  selectedMarketId,
  onSelectMarket,
  liveTicks,
  onNavigateToDepth,
  isLoading = false,
}) => {
  const selectedMarket = markets.find((m) => m.id === selectedMarketId) || markets[0];
  const selectedTick = selectedMarket ? liveTicks.get(selectedMarket.id) : undefined;
  const isSyntheticOrSeed = Boolean(selectedMarket?.isSynthetic || selectedMarket?.isSeedDepth);
  const implied = selectedTick?.impliedProb ?? selectedMarket?.impliedProbYes ?? 0.5;
  const fair = selectedTick?.fairValue ?? selectedMarket?.fairValueYes ?? 0.5;
  const edge = isSyntheticOrSeed ? 0 : (selectedTick?.edge ?? selectedMarket?.edgePercentage ?? 0);
  const isYesEdge = edge > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Full-Width Discrepancy Heatmap Matrix */}
      <EdgeRadarHeatmap
        markets={markets}
        selectedMarketId={selectedMarketId}
        onSelectMarket={onSelectMarket}
        liveTicks={liveTicks}
        isLoading={isLoading}
      />

      {/* 2. Focused Anomaly & Mathematical Inspector Card */}
      {isLoading && !selectedMarket ? (
        <div className="terminal-panel p-4">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/40">
            <Skeleton variant="text" width={240} height={16} />
            <Skeleton variant="rectangular" width={140} height={28} borderRadius={6} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="p-3.5 rounded-lg border border-border/40 bg-secondary/20 flex flex-col gap-2"
              >
                <Skeleton variant="text" width={110} height={11} />
                <Skeleton variant="text" width={75} height={22} />
                <Skeleton variant="text" width={130} height={10} />
              </div>
            ))}
          </div>
        </div>
      ) : selectedMarket ? (
        <div className="terminal-panel p-4">
          {/* Inspector Header */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/40 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <ViewfinderCircleIcon className="w-4 h-4 text-muted-foreground" />
              <div>
                <h4 className="text-xs font-semibold text-foreground tracking-wide">
                  PRICING MODEL INSPECTOR: {selectedMarket.symbol}
                </h4>
                <p className="text-[11px] text-muted-foreground font-mono">
                  Strike: ${selectedMarket.strikePrice.toLocaleString()} • Window: {selectedMarket.windowDuration} • Live Spot: ${(selectedTick?.spotPrice ?? selectedMarket.strikePrice).toLocaleString()}
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={onNavigateToDepth}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground border-border/60"
            >
              <span>Execute Order on CLOB</span>
              <ArrowRightIcon className="w-3 h-3" />
            </Button>
          </div>

          {/* 4 Minimalist Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Stat 1: Implied CLOB Prob */}
            <div className="p-3.5 rounded-lg border border-border/50 bg-secondary/20 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-[11px] font-mono text-muted-foreground font-semibold uppercase tracking-wider">
                  CLOB Implied Prob
                </span>
                <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 text-muted-foreground">
                  MID
                </Badge>
              </div>
              <div className="font-mono text-lg font-bold text-foreground">
                {(implied * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-2">
                YES ${implied.toFixed(2)} • NO ${(1 - implied).toFixed(2)}
              </div>
            </div>

            {/* Stat 2: Fair Value Probability */}
            <div className="p-3.5 rounded-lg border border-border/50 bg-secondary/20 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-[11px] font-mono text-muted-foreground font-semibold uppercase tracking-wider">
                  Model Fair Value Φ(z)
                </span>
                <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 text-muted-foreground">
                  BSM
                </Badge>
              </div>
              <div className="font-mono text-lg font-bold text-brand-cyan">
                {(fair * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-2">
                Black-Scholes Binary Option Pricing
              </div>
            </div>

            {/* Stat 3: Edge Delta */}
            <div className="p-3.5 rounded-lg border border-border/50 bg-secondary/20 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-[11px] font-mono text-muted-foreground font-semibold uppercase tracking-wider">
                  Mispricing Alpha
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-mono px-1.5 py-0",
                    isSyntheticOrSeed
                      ? "text-muted-foreground bg-secondary/40 border-border/40"
                      : Math.abs(edge) >= 0.03
                      ? "bg-[#ffb700]/10 text-[#ffb700] border-[#ffb700]/30"
                      : "text-muted-foreground"
                  )}
                >
                  {isSyntheticOrSeed ? 'NEUTRAL' : Math.abs(edge) >= 0.03 ? 'ANOMALY' : 'EDGE'}
                </Badge>
              </div>
              <div
                className={cn(
                  "font-mono text-lg font-bold",
                  isSyntheticOrSeed || Math.abs(edge) < 0.01
                    ? "text-foreground"
                    : isYesEdge
                    ? "text-[#00e676]"
                    : "text-[#ff3366]"
                )}
              >
                {isSyntheticOrSeed ? '0.0%' : `${isYesEdge ? '+' : ''}${(edge * 100).toFixed(1)}%`}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-2">
                {Math.abs(edge) < 0.01
                  ? 'Fairly priced market'
                  : isYesEdge
                  ? 'YES Underpriced Opportunity'
                  : 'NO Underpriced Opportunity'}
              </div>
            </div>

            {/* Stat 4: Recommended Action */}
            <div className="p-3.5 rounded-lg border border-border/50 bg-secondary/20 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-[11px] font-mono text-muted-foreground font-semibold uppercase tracking-wider">
                  Swarm Execution
                </span>
                <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 text-muted-foreground">
                  AUTO
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-xs font-bold border",
                    !isSyntheticOrSeed && Math.abs(edge) >= 0.03
                      ? isYesEdge
                        ? "bg-[#00e676]/10 text-[#00e676] border-[#00e676]/30"
                        : "bg-[#ff3366]/10 text-[#ff3366] border-[#ff3366]/30"
                      : "bg-secondary/40 text-muted-foreground border-border/50"
                  )}
                >
                  {!isSyntheticOrSeed && Math.abs(edge) >= 0.03 && <BoltIcon className="w-3 h-3" />}
                  <span>
                    {!isSyntheticOrSeed && Math.abs(edge) >= 0.03
                      ? isYesEdge
                        ? 'BUY YES'
                        : 'BUY NO'
                      : 'MAINTAIN SPREAD'}
                  </span>
                </span>
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-2">
                {!isSyntheticOrSeed && Math.abs(edge) >= 0.03 ? 'Volt Urgency Fill' : 'Titan 2-Sided Quoting'}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const EdgeRadarView = React.memo(EdgeRadarViewComponent);
