import React, { useMemo } from 'react';
import {
  ChartBarIcon,
  BoltIcon,
  CurrencyDollarIcon,
  ScaleIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import type { Market } from '../../types/index.js';
import type { MarketTickData } from '../../hooks/useTelemetry.js';
import { MarketMatrix } from '../MarketMatrix.js';
import { Badge } from '../ui/badge.js';
import { cn } from '../../lib/utils.js';

interface MarketsExplorerViewProps {
  markets: Market[];
  selectedMarketId: string | null;
  onSelectMarket: (marketId: string) => void;
  onOpenTradeTerminal: (marketId: string) => void;
  liveTicks: Map<string, MarketTickData>;
  currentSpotPrices: Record<string, number>;
  isLoading?: boolean;
}

export const MarketsExplorerView: React.FC<MarketsExplorerViewProps> = ({
  markets,
  selectedMarketId,
  onSelectMarket,
  onOpenTradeTerminal,
  liveTicks,
  currentSpotPrices,
  isLoading = false,
}) => {
  // Compute top edge anomaly contract across open markets
  const topEdgeMarket = useMemo<{ market: Market | null; edge: number }>(() => {
    let topM: Market | null = null;
    let maxEdge = 0;
    markets.forEach((m) => {
      const tick = liveTicks.get(m.id);
      const edge = Math.abs(tick?.edge ?? m.edgePercentage);
      if (edge > maxEdge) {
        maxEdge = edge;
        topM = m;
      }
    });
    return { market: topM, edge: maxEdge };
  }, [markets, liveTicks]);

  // Compute average spread
  const avgSpread = useMemo(() => {
    if (markets.length === 0) return 0;
    const total = markets.reduce((sum, m) => {
      const spread = Math.max(0, m.bestAskYes - m.bestBidYes);
      return sum + spread;
    }, 0);
    return Number((total / markets.length).toFixed(2));
  }, [markets]);

  return (
    <div className="flex flex-col gap-3.5 min-h-0 flex-1 overflow-y-auto lg:overflow-hidden pb-4">
      {/* Top Global Intelligence Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
        <div className="terminal-panel p-3 flex flex-col justify-between">
          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider font-semibold">
            ACTIVE CONTRACTS
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-bold font-mono text-foreground">
              {markets.length}
            </span>
            <Badge variant="outline" className="text-[9px] font-mono border-[#00e676]/40 text-[#00e676] bg-[#00e676]/10">
              LIVE CLOB
            </Badge>
          </div>
          <ChartBarIcon className="w-4 h-4 text-muted-foreground/60 mt-1.5" />
        </div>

        {/* Top Edge Opportunity Banner */}
        <div className="terminal-panel p-3 flex flex-col justify-between relative overflow-hidden group">
          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider font-semibold">
            TOP ALPHA MISPRICING
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className={cn("text-xl font-bold font-mono", topEdgeMarket.edge > 0 ? "text-[#00e676]" : "text-muted-foreground")}>
              {topEdgeMarket.edge > 0 ? `+${(topEdgeMarket.edge * 100).toFixed(1)}%` : '—'}
            </span>
            {topEdgeMarket.market && topEdgeMarket.edge > 0 && (
              <button
                type="button"
                onClick={() => onOpenTradeTerminal(topEdgeMarket.market!.id)}
                className="text-[10px] font-mono text-brand-cyan hover:underline flex items-center gap-1 cursor-pointer font-bold"
              >
                <span>Trade {topEdgeMarket.market.symbol}</span>
                <ArrowRightIcon className="w-3 h-3" />
              </button>
            )}
          </div>
          <BoltIcon className="w-4 h-4 text-[#00e676] mt-1.5" />
        </div>

        <div className="terminal-panel p-3 flex flex-col justify-between">
          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider font-semibold">
            AVG CLOB SPREAD
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-bold font-mono text-foreground">
              ${avgSpread.toFixed(2)} USDC
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">TIGHT MM</span>
          </div>
          <ScaleIcon className="w-4 h-4 text-muted-foreground/60 mt-1.5" />
        </div>

        <div className="terminal-panel p-3 flex flex-col justify-between">
          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider font-semibold">
            UNDERLYING SPOT TICKERS
          </span>
          <div className="flex items-center gap-4 mt-1 overflow-x-auto text-xs font-mono">
            {['BTC', 'ETH'].map((sym) => {
              const spot = currentSpotPrices[`${sym}/USD`];
              return (
                <div key={sym} className="flex flex-col">
                  <span className="text-[9px] text-muted-foreground">{sym}</span>
                  <span className="font-bold text-foreground">
                    {spot ? `$${spot.toLocaleString()}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
          <CurrencyDollarIcon className="w-4 h-4 text-muted-foreground/60 mt-1.5" />
        </div>
      </div>

      {/* Full-Width Spacious Market Matrix */}
      <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden">
        <MarketMatrix
          markets={markets}
          selectedMarketId={selectedMarketId}
          onSelectMarket={onSelectMarket}
          onOpenTradeTerminal={onOpenTradeTerminal}
          liveTicks={liveTicks}
          currentSpotPrices={currentSpotPrices}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};
