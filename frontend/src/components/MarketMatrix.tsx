import React, { useState, useMemo, useEffect } from 'react';
import {
  Square3Stack3DIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  Squares2X2Icon,
  Bars3Icon,
} from '@heroicons/react/24/outline';
import type { Market } from '../types/index.js';
import type { MarketTickData } from '../hooks/useTelemetry.js';
import { MarketCardSkeleton } from './ui/Skeleton.js';
import { Pagination } from './ui/Pagination.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { cn } from '../lib/utils.js';

interface MarketMatrixProps {
  markets: Market[];
  selectedMarketId: string | null;
  onSelectMarket: (marketId: string) => void;
  liveTicks: Map<string, MarketTickData>;
  currentSpotPrices: Record<string, number>;
  isLoading?: boolean;
}

export const MarketMatrix: React.FC<MarketMatrixProps> = ({
  markets,
  selectedMarketId,
  onSelectMarket,
  liveTicks,
  currentSpotPrices,
  isLoading = false,
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('ALL');
  const [selectedWindow, setSelectedWindow] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(6);

  // Filter only active live markets with positive remaining time
  const filteredMarkets = useMemo(() => {
    return markets.filter((m) => {
      const tick = liveTicks.get(m.id);
      const timeLeft = tick?.timeLeftSeconds ?? Math.max(0, Math.floor((new Date(m.closeTimestamp).getTime() - Date.now()) / 1000));
      
      // Only live open markets
      if (m.status !== 'Open' && timeLeft <= 0) return false;

      if (selectedSymbol !== 'ALL' && m.symbol !== selectedSymbol) return false;
      if (selectedWindow !== 'ALL' && m.windowDuration !== selectedWindow) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          m.symbol.toLowerCase().includes(q) ||
          m.strikePrice.toString().includes(q) ||
          m.windowDuration.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [markets, liveTicks, selectedSymbol, selectedWindow, searchQuery]);

  // Reset to page 1 on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSymbol, selectedWindow, searchQuery]);

  // Clamp current page when filtered markets change
  const totalPages = Math.max(1, Math.ceil(filteredMarkets.length / pageSize));
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Paginated slice of markets
  const paginatedMarkets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMarkets.slice(start, start + pageSize);
  }, [filteredMarkets, currentPage, pageSize]);

  return (
    <div className="terminal-panel flex flex-col h-full overflow-hidden">
      {/* Header & Controls */}
      <div className="p-4 pb-3 border-b border-border/40 flex flex-col gap-3 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Square3Stack3DIcon className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground tracking-wide">
              ACTIVE PREDICTION MARKETS
            </span>
            <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/40 border-border/50 gap-1 px-1.5 py-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{filteredMarkets.length} LIVE</span>
            </Badge>
          </div>

          {/* Right Toolbar: View Mode & Search Box */}
          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex items-center gap-0.5 bg-secondary/40 p-0.5 rounded-lg border border-border/50">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={cn(
                  "p-1 rounded-md transition-colors cursor-pointer",
                  viewMode === 'grid'
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
                title="Grid View"
              >
                <Squares2X2Icon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn(
                  "p-1 rounded-md transition-colors cursor-pointer",
                  viewMode === 'table'
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
                title="Table View"
              >
                <Bars3Icon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Search Box */}
            <div className="relative flex items-center min-w-[180px]">
              <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search contract..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-7 pl-8 pr-7 text-xs font-mono rounded-lg border border-border/60 bg-secondary/30 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="absolute right-2 text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => setSearchQuery('')}
                >
                  <XMarkIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filter Pills Bar */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-border/30 text-xs">
          {/* Symbol Filter */}
          <div className="flex items-center gap-1 bg-secondary/30 p-0.5 rounded-lg border border-border/40 overflow-x-auto">
            {['ALL', 'BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'DOGE/USD'].map((sym) => {
              const isActive = selectedSymbol === sym;
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => setSelectedSymbol(sym)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-mono rounded-md transition-colors cursor-pointer whitespace-nowrap",
                    isActive
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  )}
                >
                  {sym === 'ALL' ? 'ALL ASSETS' : sym.replace('/USD', '')}
                </button>
              );
            })}
          </div>

          {/* Horizon Filter */}
          <div className="flex items-center gap-1 bg-secondary/30 p-0.5 rounded-lg border border-border/40 overflow-x-auto">
            {['ALL', '5m', '15m', '1h', '4h', '24h'].map((win) => {
              const isActive = selectedWindow === win;
              return (
                <button
                  key={win}
                  type="button"
                  onClick={() => setSelectedWindow(win)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-mono rounded-md transition-colors cursor-pointer whitespace-nowrap",
                    isActive
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  )}
                >
                  {win}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Markets Content Area */}
      <div className="p-4 overflow-y-auto flex-1 min-h-0">
        {isLoading && markets.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <MarketCardSkeleton key={`market-skel-${i}`} />
            ))}
          </div>
        ) : filteredMarkets.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center gap-3">
            <p className="text-xs text-muted-foreground">
              No active prediction contracts matching selected filters.
            </p>
            {(selectedSymbol !== 'ALL' || selectedWindow !== 'ALL' || searchQuery) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedSymbol('ALL');
                  setSelectedWindow('ALL');
                  setSearchQuery('');
                }}
                className="text-xs"
              >
                Reset Filters
              </Button>
            )}
          </div>
        ) : viewMode === 'table' ? (
          /* Table View */
          <div className="overflow-x-auto rounded-lg border border-border/40 bg-secondary/10">
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b border-border/40 bg-secondary/30 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                <tr>
                  <th className="px-3.5 py-2.5">Contract</th>
                  <th className="px-3.5 py-2.5">Strike</th>
                  <th className="px-3.5 py-2.5">Live Spot</th>
                  <th className="px-3.5 py-2.5">Mid Prob</th>
                  <th className="px-3.5 py-2.5">Φ(z) Fair</th>
                  <th className="px-3.5 py-2.5">Edge Alpha</th>
                  <th className="px-3.5 py-2.5">YES Bid / Ask</th>
                  <th className="px-3.5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {paginatedMarkets.map((market) => {
                  const tick = liveTicks.get(market.id);
                  const isSelected = market.id === selectedMarketId;
                  const spot = currentSpotPrices[market.symbol] || tick?.spotPrice || market.strikePrice;
                  const fairValue = tick?.fairValue ?? market.fairValueYes;
                  const impliedProb = tick?.impliedProb ?? market.impliedProbYes;
                  const edge = tick?.edge ?? market.edgePercentage;
                  const strikeDelta = spot - market.strikePrice;
                  const isITM = spot >= market.strikePrice;

                  return (
                    <tr
                      key={market.id}
                      onClick={() => onSelectMarket(market.id)}
                      className={cn(
                        "transition-colors cursor-pointer",
                        isSelected
                          ? "bg-secondary/70 font-semibold"
                          : "hover:bg-secondary/40"
                      )}
                    >
                      <td className="px-3.5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">{market.symbol}</span>
                          <Badge variant="secondary" className="text-[10px] px-1 py-0 text-muted-foreground">
                            {market.windowDuration}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-3.5 py-3 font-bold text-foreground">
                        ${market.strikePrice.toLocaleString()}
                      </td>
                      <td className="px-3.5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("font-bold", isITM ? "text-emerald-400" : "text-rose-400")}>
                            ${spot.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            ({strikeDelta >= 0 ? '+' : ''}{strikeDelta.toFixed(1)})
                          </span>
                        </div>
                      </td>
                      <td className="px-3.5 py-3 text-foreground">
                        {(impliedProb * 100).toFixed(1)}%
                      </td>
                      <td className="px-3.5 py-3 text-foreground font-semibold">
                        {(fairValue * 100).toFixed(1)}%
                      </td>
                      <td className="px-3.5 py-3">
                        {edge !== 0 ? (
                          <span
                            className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5 rounded border inline-block leading-none",
                              edge > 0
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            )}
                          >
                            {edge > 0 ? `+${(edge * 100).toFixed(1)}% YES` : `${(Math.abs(edge) * 100).toFixed(1)}% NO`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3.5 py-3">
                        <span className="text-emerald-400 font-bold">${market.bestBidYes.toFixed(2)}</span>
                        <span className="text-muted-foreground mx-1.5">/</span>
                        <span className="text-rose-400 font-bold">${market.bestAskYes.toFixed(2)}</span>
                      </td>
                      <td className="px-3.5 py-3 text-right">
                        <Badge
                          variant={isSelected ? "default" : "outline"}
                          className={cn(
                            "text-[10px] px-2 py-0.5",
                            isSelected ? "bg-primary text-primary-foreground" : "text-muted-foreground border-border/50"
                          )}
                        >
                          {isSelected ? 'ACTIVE' : 'INSPECT'}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Grid View - 2 Columns with Generous Spacing & Zero Overflow */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {paginatedMarkets.map((market) => {
              const tick = liveTicks.get(market.id);
              const isSelected = market.id === selectedMarketId;

              const spot = currentSpotPrices[market.symbol] || tick?.spotPrice || market.strikePrice;
              const fairValue = tick?.fairValue ?? market.fairValueYes;
              const impliedProb = tick?.impliedProb ?? market.impliedProbYes;
              const edge = tick?.edge ?? market.edgePercentage;
              const strikeDelta = spot - market.strikePrice;
              const isITM = spot >= market.strikePrice;

              return (
                <div
                  key={market.id}
                  onClick={() => onSelectMarket(market.id)}
                  className={cn(
                    "group flex flex-col justify-between p-4 rounded-xl border transition-all cursor-pointer select-none",
                    isSelected
                      ? "border-foreground/50 bg-secondary/60 ring-1 ring-foreground/20 shadow-sm"
                      : "border-border/50 bg-secondary/20 hover:bg-secondary/40 hover:border-border/80"
                  )}
                >
                  {/* Row 1: Symbol, Horizon & Action Pill */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-border/30">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-foreground">
                        {market.symbol}
                      </span>
                      <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0.5 text-muted-foreground bg-secondary/60 border border-border/40">
                        {market.windowDuration}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground bg-secondary/30 px-2 py-0.5 rounded-md border border-border/30">
                        <ClockIcon className="w-3 h-3 text-muted-foreground" />
                        <span>{market.windowDuration}</span>
                      </div>
                      <Badge
                        variant={isSelected ? "default" : "outline"}
                        className={cn(
                          "font-mono text-[10px] px-2 py-0.5 transition-colors",
                          isSelected
                            ? "bg-primary text-primary-foreground font-bold shadow-xs"
                            : "text-muted-foreground border-border/50 group-hover:border-border group-hover:text-foreground"
                        )}
                      >
                        {isSelected ? 'ACTIVE' : 'INSPECT'}
                      </Badge>
                    </div>
                  </div>

                  {/* Row 2: Strike vs Spot Matrix */}
                  <div className="grid grid-cols-2 gap-3 p-2.5 rounded-lg bg-secondary/30 border border-border/40 my-3">
                    <div>
                      <span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase block">
                        STRIKE PRICE
                      </span>
                      <span className="text-sm font-mono font-bold text-foreground block mt-0.5">
                        ${market.strikePrice.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase block">
                        LIVE SPOT
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={cn(
                            "text-sm font-mono font-bold",
                            isITM ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          ${spot.toLocaleString()}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-0.5">
                          {strikeDelta >= 0 ? (
                            <ArrowTrendingUpIcon className="w-2.5 h-2.5 text-emerald-400" />
                          ) : (
                            <ArrowTrendingDownIcon className="w-2.5 h-2.5 text-rose-400" />
                          )}
                          {Math.abs(strikeDelta).toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Probabilities & Fair Value Section */}
                  <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-secondary/20 border border-border/30 mb-3">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">MID:</span>
                        <span className="font-bold text-foreground">{(impliedProb * 100).toFixed(1)}%</span>
                      </div>

                      {edge !== 0 ? (
                        <span
                          className={cn(
                            "font-mono text-[10px] font-bold px-2 py-0.5 rounded border leading-none",
                            edge > 0
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          )}
                        >
                          {edge > 0 ? `+${(edge * 100).toFixed(1)}% YES EDGE` : `${(Math.abs(edge) * 100).toFixed(1)}% NO EDGE`}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground uppercase">FAIR VALUE</span>
                      )}

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">Φ(z):</span>
                        <span className="font-bold text-foreground">{(fairValue * 100).toFixed(1)}%</span>
                      </div>
                    </div>

                    {/* Dual Probability Visual Gauge */}
                    <div className="h-1.5 rounded-full bg-secondary/60 border border-border/40 relative overflow-visible mt-0.5">
                      <div
                        className="h-full rounded-full bg-muted-foreground/40 transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, impliedProb * 100))}%` }}
                      />
                      <div
                        className="absolute -top-[3px] w-1.5 h-3 rounded-xs bg-foreground shadow-xs transition-all duration-300 transform -translate-x-1/2"
                        style={{ left: `${Math.min(98, Math.max(2, fairValue * 100))}%` }}
                        title={`Φ(z) Fair Value: ${(fairValue * 100).toFixed(1)}%`}
                      />
                    </div>
                  </div>

                  {/* Row 4: Order Book Quick Quotes */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/30 text-xs font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">YES BID:</span>
                      <span className="font-bold text-emerald-400">${market.bestBidYes.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">YES ASK:</span>
                      <span className="font-bold text-rose-400">${market.bestAskYes.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">SPREAD:</span>
                      <span className="font-bold text-muted-foreground">${Math.max(0, market.bestAskYes - market.bestBidYes).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      {filteredMarkets.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={filteredMarkets.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[6, 12, 24, 48]}
          itemLabel="markets"
          isLoading={isLoading}
        />
      )}
    </div>
  );
};
