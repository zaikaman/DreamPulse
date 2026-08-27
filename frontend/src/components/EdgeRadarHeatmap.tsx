import React, { useState } from 'react';
import { ViewfinderCircleIcon, BoltIcon } from '@heroicons/react/24/outline';
import type { Market } from '../types/index.js';
import type { MarketTickData } from '../hooks/useTelemetry.js';
import { EdgeRadarHeatmapSkeleton } from './ui/Skeleton.js';
import { Badge } from './ui/badge.js';
import { cn } from '../lib/utils.js';

interface EdgeRadarHeatmapProps {
  markets: Market[];
  selectedMarketId: string | null;
  onSelectMarket: (marketId: string) => void;
  liveTicks: Map<string, MarketTickData>;
  isLoading?: boolean;
}

const EdgeRadarHeatmapComponent: React.FC<EdgeRadarHeatmapProps> = ({
  markets,
  selectedMarketId,
  onSelectMarket,
  liveTicks,
  isLoading = false,
}) => {
  const [hoveredMarketId, setHoveredMarketId] = useState<string | null>(null);

  if (isLoading && markets.length === 0) {
    return <EdgeRadarHeatmapSkeleton />;
  }

  const discoveredSymbols = Array.from(new Set(markets.map((m) => m.symbol)));
  const symbols = discoveredSymbols.length > 0 ? discoveredSymbols : ['BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'DOGE/USD'];
  const windows: Array<'5m' | '15m' | '1h'> = ['5m', '15m', '1h'];

  // Find most severe anomaly
  const highestAnomaly = markets.reduce((max, m) => {
    const tick = liveTicks.get(m.id);
    const edge = Math.abs(tick?.edge ?? m.edgePercentage);
    return edge > max ? edge : max;
  }, 0);

  // Active contract for the persistent bottom telemetry bar (no layout shift)
  const activeInspectionMarket =
    (hoveredMarketId ? markets.find((m) => m.id === hoveredMarketId) : undefined) ||
    (selectedMarketId ? markets.find((m) => m.id === selectedMarketId) : markets[0]);

  const inspectionTick = activeInspectionMarket ? liveTicks.get(activeInspectionMarket.id) : undefined;
  const inspectionImplied = inspectionTick?.impliedProb ?? activeInspectionMarket?.impliedProbYes ?? 0.5;
  const inspectionFair = inspectionTick?.fairValue ?? activeInspectionMarket?.fairValueYes ?? 0.5;
  const inspectionEdge = inspectionTick?.edge ?? activeInspectionMarket?.edgePercentage ?? 0;

  return (
    <div className="terminal-panel p-4">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/40 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ViewfinderCircleIcon className="size-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground tracking-wide">
            REAL-TIME Φ(z) MISPRICING MATRIX
          </span>
          {highestAnomaly >= 0.03 && (
            <Badge variant="outline" className="font-mono text-[10px] bg-amber-500/10 text-amber-300 border-amber-500/30 gap-1">
              <BoltIcon className="size-2.5" />
              <span>{(highestAnomaly * 100).toFixed(1)}% MAX ARB</span>
            </Badge>
          )}
        </div>

        {/* Minimalist Legend */}
        <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span>YES Alpha (&gt;0)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-rose-400" />
            <span>NO Alpha (&lt;0)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-muted-foreground/50" />
            <span>Neutral</span>
          </div>
        </div>
      </div>

      {/* Heatmap Matrix Table */}
      <div className="overflow-x-auto">
        <div className="min-w-[620px] flex flex-col gap-2">
          {/* Header Row */}
          <div className="grid grid-cols-[100px_repeat(3,1fr)] gap-2.5 px-1 text-[11px] font-mono text-muted-foreground font-medium uppercase tracking-wider">
            <div>Asset</div>
            {windows.map((win) => (
              <div key={win} className="text-center">
                {win} Horizon
              </div>
            ))}
          </div>

          {/* Asset Rows */}
          {symbols.map((sym) => (
            <div key={sym} className="grid grid-cols-[100px_repeat(3,1fr)] gap-2.5 items-stretch">
              {/* Asset Symbol Tag */}
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/30 border border-border/40">
                <span className="font-mono text-xs font-bold text-foreground">
                  {sym.replace('/USD', '')}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">USD</span>
              </div>

              {/* Window Horizon Cells */}
              {windows.map((win) => {
                const matchingMarkets = markets.filter(
                  (m) => m.symbol === sym && m.windowDuration === win
                );

                if (matchingMarkets.length === 0) {
                  return (
                    <div
                      key={win}
                      className="flex items-center justify-center p-2.5 rounded-lg border border-border/20 bg-secondary/10 min-h-[72px]"
                    >
                      <span className="font-mono text-xs text-muted-foreground/30">—</span>
                    </div>
                  );
                }

                // Focus on highest edge contract in this cell
                const bestMarket = matchingMarkets.reduce((best, cur) => {
                  const edgeBest = Math.abs(liveTicks.get(best.id)?.edge ?? best.edgePercentage);
                  const edgeCur = Math.abs(liveTicks.get(cur.id)?.edge ?? cur.edgePercentage);
                  return edgeCur > edgeBest ? cur : best;
                }, matchingMarkets[0]);

                const tick = liveTicks.get(bestMarket.id);
                const edge = tick?.edge ?? bestMarket.edgePercentage;
                const fairValue = tick?.fairValue ?? bestMarket.fairValueYes;
                const impliedProb = tick?.impliedProb ?? bestMarket.impliedProbYes;
                const isSelected = bestMarket.id === selectedMarketId;
                const isAnomaly = Math.abs(edge) >= 0.03;

                return (
                  <div
                    key={win}
                    onClick={() => onSelectMarket(bestMarket.id)}
                    onMouseEnter={() => setHoveredMarketId(bestMarket.id)}
                    onMouseLeave={() => setHoveredMarketId(null)}
                    className={cn(
                      "group relative flex flex-col justify-between p-2.5 rounded-lg border transition-all cursor-pointer min-h-[72px]",
                      isSelected
                        ? "border-border bg-secondary/60 shadow-xs ring-1 ring-border"
                        : "border-border/40 bg-secondary/20 hover:bg-secondary/40 hover:border-border/70"
                    )}
                  >
                    {/* Top Row: Strike price & Edge Delta */}
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        ${bestMarket.strikePrice.toLocaleString()}
                      </span>
                      <span
                        className={cn(
                          "font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border leading-none",
                          Math.abs(edge) < 0.01
                            ? "bg-secondary/40 text-muted-foreground border-border/40"
                            : edge > 0
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        )}
                      >
                        {edge >= 0 ? '+' : ''}{(edge * 100).toFixed(1)}%
                      </span>
                    </div>

                    {/* Bottom Row: Implied vs Fair Distribution */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mt-1">
                      <span>Mid: {(impliedProb * 100).toFixed(0)}%</span>
                      <span>Φ(z): {(fairValue * 100).toFixed(0)}%</span>
                    </div>

                    {/* Subtle Anomaly Indicator */}
                    {isAnomaly && (
                      <div
                        className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-amber-400/80"
                        title="Statistical Anomaly (>=3% edge)"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Inspection Telemetry Bar (Persistent, No Layout Shift) */}
      <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between flex-wrap gap-2 text-xs font-mono min-h-[32px]">
        {activeInspectionMarket ? (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-muted-foreground text-[11px]">INSPECTOR:</span>
              <span className="font-semibold text-foreground">{activeInspectionMarket.symbol}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground border-border/50">
                {activeInspectionMarket.windowDuration}
              </Badge>
              <span className="text-muted-foreground">Strike: ${activeInspectionMarket.strikePrice.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-4 text-muted-foreground text-[11px] flex-wrap">
              <span>CLOB Mid: <strong className="text-foreground">{(inspectionImplied * 100).toFixed(1)}%</strong></span>
              <span>Φ(z) Fair: <strong className="text-foreground">{(inspectionFair * 100).toFixed(1)}%</strong></span>
              <span>
                Edge Delta:{' '}
                <strong className={inspectionEdge >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {inspectionEdge >= 0 ? '+' : ''}{(inspectionEdge * 100).toFixed(2)}%
                </strong>
              </span>
            </div>
          </>
        ) : (
          <div className="text-muted-foreground text-[11px]">
            Select or hover any contract cell to inspect real-time mathematical distribution & depth.
          </div>
        )}
      </div>
    </div>
  );
};

export const EdgeRadarHeatmap = React.memo(EdgeRadarHeatmapComponent);
