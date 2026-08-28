import React, { useState, useMemo, useEffect } from 'react';
import {
  Square3Stack3DIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  Squares2X2Icon,
  Bars3Icon,
  ArrowsUpDownIcon,
  FunnelIcon,
  SparklesIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import type { Market } from '../types/index.js';
import type { MarketTickData } from '../hooks/useTelemetry.js';
import { MarketCardSkeleton } from './ui/Skeleton.js';
import { Pagination } from './ui/Pagination.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { cn } from '../lib/utils.js';

export type SortOption =
  | 'EDGE_DESC'
  | 'EDGE_ASC'
  | 'TIME_ASC'
  | 'TIME_DESC'
  | 'SPREAD_ASC'
  | 'STRIKE_DESC'
  | 'STRIKE_ASC';

export type EdgeFilterOption = 'ALL' | 'HIGH_ALPHA' | 'YES_ONLY' | 'NO_ONLY';

interface MarketMatrixProps {
  markets: Market[];
  selectedMarketId: string | null;
  onSelectMarket: (marketId: string) => void;
  onOpenTradeTerminal?: (marketId: string) => void;
  liveTicks: Map<string, MarketTickData>;
  currentSpotPrices: Record<string, number>;
  isLoading?: boolean;
}

export const MarketMatrix: React.FC<MarketMatrixProps> = ({
  markets,
  selectedMarketId,
  onSelectMarket,
  onOpenTradeTerminal,
  liveTicks,
  currentSpotPrices,
  isLoading = false,
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('ALL');
  const [selectedWindow, setSelectedWindow] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('EDGE_DESC');
  const [edgeFilter, setEdgeFilter] = useState<EdgeFilterOption>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(6);

  // Filter and sort active prediction contracts
  const filteredAndSortedMarkets = useMemo(() => {
    const list = markets.filter((m) => {
      const tick = liveTicks.get(m.id);
      const timeLeft =
        tick?.timeLeftSeconds ??
        Math.max(
          0,
          Math.floor((new Date(m.closeTimestamp).getTime() - Date.now()) / 1000)
        );

      // Only live open markets
      if (m.status !== 'Open' && timeLeft <= 0) return false;

      if (selectedSymbol !== 'ALL' && m.symbol !== selectedSymbol) return false;
      if (selectedWindow !== 'ALL' && m.windowDuration !== selectedWindow)
        return false;

      const edge = tick?.edge ?? m.edgePercentage;
      if (edgeFilter === 'YES_ONLY' && edge <= 0) return false;
      if (edgeFilter === 'NO_ONLY' && edge >= 0) return false;
      if (edgeFilter === 'HIGH_ALPHA' && Math.abs(edge) < 0.2) return false;

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

    // Apply sorting
    return list.sort((a, b) => {
      const tickA = liveTicks.get(a.id);
      const tickB = liveTicks.get(b.id);
      const edgeA = Math.abs(tickA?.edge ?? a.edgePercentage);
      const edgeB = Math.abs(tickB?.edge ?? b.edgePercentage);
      const timeA =
        tickA?.timeLeftSeconds ??
        Math.max(
          0,
          Math.floor((new Date(a.closeTimestamp).getTime() - Date.now()) / 1000)
        );
      const timeB =
        tickB?.timeLeftSeconds ??
        Math.max(
          0,
          Math.floor((new Date(b.closeTimestamp).getTime() - Date.now()) / 1000)
        );
      const spreadA = Math.max(0, a.bestAskYes - a.bestBidYes);
      const spreadB = Math.max(0, b.bestAskYes - b.bestBidYes);

      switch (sortBy) {
        case 'EDGE_DESC':
          return edgeB - edgeA;
        case 'EDGE_ASC':
          return edgeA - edgeB;
        case 'TIME_ASC':
          return timeA - timeB;
        case 'TIME_DESC':
          return timeB - timeA;
        case 'SPREAD_ASC':
          return spreadA - spreadB;
        case 'STRIKE_DESC':
          return b.strikePrice - a.strikePrice;
        case 'STRIKE_ASC':
          return a.strikePrice - b.strikePrice;
        default:
          return 0;
      }
    });
  }, [
    markets,
    liveTicks,
    selectedSymbol,
    selectedWindow,
    searchQuery,
    sortBy,
    edgeFilter,
  ]);

  // Reset to page 1 on filter/search/sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSymbol, selectedWindow, searchQuery, sortBy, edgeFilter]);

  // Clamp current page when filtered markets change
  const totalPages = Math.max(
    1,
    Math.ceil(filteredAndSortedMarkets.length / pageSize)
  );
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Paginated slice of markets
  const paginatedMarkets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedMarkets.slice(start, start + pageSize);
  }, [filteredAndSortedMarkets, currentPage, pageSize]);

  const isFiltered =
    selectedSymbol !== 'ALL' ||
    selectedWindow !== 'ALL' ||
    edgeFilter !== 'ALL' ||
    sortBy !== 'EDGE_DESC' ||
    Boolean(searchQuery.trim());

  return (
    <div className="terminal-panel flex flex-col h-full overflow-hidden">
      {/* Header & Controls */}
      <div className="p-3.5 pb-3 border-b border-border/40 flex flex-col gap-2.5 flex-shrink-0">
        {/* Row 1: Title, Count, Sort Selector, Search, View Mode */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Square3Stack3DIcon className="w-4 h-4 text-brand-cyan" />
            <span className="text-xs font-semibold text-foreground tracking-wide font-mono">
              ACTIVE PREDICTION MARKETS
            </span>
            <Badge
              variant="outline"
              className="font-mono text-[10px] text-muted-foreground bg-secondary/40 border-border/50 gap-1 px-1.5 py-0"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{filteredAndSortedMarkets.length} LIVE</span>
            </Badge>
          </div>

          {/* Right Controls: Sort & Search & View Mode */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 bg-secondary/40 px-2 py-1 rounded-lg border border-border/50 text-xs font-mono">
              <ArrowsUpDownIcon className="w-3.5 h-3.5 text-brand-cyan shrink-0" />
              <span className="text-[10px] text-muted-foreground uppercase font-semibold hidden md:inline">
                Sort:
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                aria-label="Sort prediction contracts"
                className="bg-transparent text-foreground text-xs font-mono focus:outline-none cursor-pointer pr-1"
              >
                <option value="EDGE_DESC" className="bg-background text-foreground">
                  Highest Alpha Edge (Desc)
                </option>
                <option value="EDGE_ASC" className="bg-background text-foreground">
                  Lowest Alpha Edge (Asc)
                </option>
                <option value="TIME_ASC" className="bg-background text-foreground">
                  Expiring Soonest
                </option>
                <option value="TIME_DESC" className="bg-background text-foreground">
                  Expiring Latest
                </option>
                <option value="SPREAD_ASC" className="bg-background text-foreground">
                  Tightest Spread
                </option>
                <option value="STRIKE_DESC" className="bg-background text-foreground">
                  Strike: High to Low
                </option>
                <option value="STRIKE_ASC" className="bg-background text-foreground">
                  Strike: Low to High
                </option>
              </select>
            </div>

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
            <div className="relative flex items-center min-w-[170px]">
              <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search contract..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-7 pl-8 pr-7 text-xs font-mono rounded-lg border border-border/60 bg-secondary/30 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-brand-cyan transition-colors"
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

        {/* Row 2: Asset Filter, Duration Horizon Filter, Edge Filter, and Reset Button */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1.5 border-t border-border/30 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
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
              {['ALL', '1m', '5m', '15m', '1h', '4h', '24h'].map((win) => {
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

            {/* Alpha Edge Preset Filter */}
            <div className="flex items-center gap-1 bg-secondary/30 p-0.5 rounded-lg border border-border/40 overflow-x-auto">
              <span className="pl-1.5 pr-0.5 text-muted-foreground flex items-center gap-1 text-[10px] uppercase font-semibold font-mono hidden lg:flex">
                <FunnelIcon className="w-3 h-3 text-brand-cyan" />
                <span>Alpha:</span>
              </span>
              {[
                { id: 'ALL', label: 'ALL ALPHA' },
                { id: 'HIGH_ALPHA', label: 'HIGH ALPHA (≥20%)', hasSparkle: true },
                { id: 'YES_ONLY', label: 'YES ALPHA' },
                { id: 'NO_ONLY', label: 'NO ALPHA' },
              ].map((opt) => {
                const isActive = edgeFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setEdgeFilter(opt.id as EdgeFilterOption)}
                    className={cn(
                      "px-2 py-1 text-[11px] font-mono rounded-md transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1",
                      isActive
                        ? "bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/40 font-bold shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                    )}
                  >
                    {opt.hasSparkle && <SparklesIcon className="w-3 h-3 text-amber-400" />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reset Filters Shortcut */}
          {isFiltered && (
            <button
              type="button"
              onClick={() => {
                setSelectedSymbol('ALL');
                setSelectedWindow('ALL');
                setEdgeFilter('ALL');
                setSortBy('EDGE_DESC');
                setSearchQuery('');
              }}
              className="text-[11px] font-mono text-muted-foreground hover:text-brand-cyan underline cursor-pointer flex items-center gap-1"
            >
              <XMarkIcon className="w-3 h-3" />
              <span>Reset Filters</span>
            </button>
          )}
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
        ) : filteredAndSortedMarkets.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center gap-3">
            <p className="text-xs text-muted-foreground">
              No active prediction contracts matching selected filters.
            </p>
            {isFiltered && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedSymbol('ALL');
                  setSelectedWindow('ALL');
                  setEdgeFilter('ALL');
                  setSortBy('EDGE_DESC');
                  setSearchQuery('');
                }}
                className="text-xs font-mono"
              >
                Reset Filters
              </Button>
            )}
          </div>
        ) : viewMode === 'table' ? (
          /* Table View */
          <div className="overflow-x-auto rounded-lg border border-border/40 bg-secondary/10">
            <table className="w-full min-w-[640px] text-left text-xs font-mono">
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
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenTradeTerminal) {
                              onOpenTradeTerminal(market.id);
                            } else {
                              onSelectMarket(market.id);
                            }
                          }}
                          className="px-2.5 py-1 rounded bg-brand-cyan/15 hover:bg-brand-cyan/25 border border-brand-cyan/40 text-brand-cyan text-[11px] font-mono font-bold transition-colors cursor-pointer"
                        >
                          <span className="inline-flex items-center gap-1">
                            <span>Trade</span>
                            <ArrowRightIcon className="w-3 h-3 inline" />
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Grid View - 3 Columns on Large Screens with Generous Spacing */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
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
                    "terminal-card p-3.5 transition-all duration-200 cursor-pointer flex flex-col justify-between group",
                    isSelected
                      ? "border-primary ring-1 ring-primary/40 bg-secondary/40 shadow-sm"
                      : "border-border/50 bg-secondary/20 hover:bg-secondary/40 hover:border-border/80"
                  )}
                >
                  {/* Row 1: Symbol, Horizon & Action Button */}
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenTradeTerminal) {
                            onOpenTradeTerminal(market.id);
                          } else {
                            onSelectMarket(market.id);
                          }
                        }}
                        className="px-2.5 py-0.5 rounded bg-brand-cyan/15 hover:bg-brand-cyan/25 border border-brand-cyan/40 text-brand-cyan text-[10px] font-mono font-bold transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <span>Trade</span>
                        <span>→</span>
                      </button>
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
      {filteredAndSortedMarkets.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={filteredAndSortedMarkets.length}
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
