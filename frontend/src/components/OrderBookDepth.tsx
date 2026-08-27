import React, { useState, useEffect } from 'react';
import {
  QueueListIcon,
  BoltIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';
import type { Market } from '../types/index.js';
import type { DepthUpdateData, MarketTickData } from '../hooks/useTelemetry.js';
import { apiClient } from '../services/api.js';
import { OrderBookDepthSkeleton, Skeleton } from './ui/Skeleton.js';
import { Badge } from './ui/badge.js';
import { cn } from '../lib/utils.js';

interface OrderBookDepthProps {
  selectedMarket: Market | null;
  liveDepth: DepthUpdateData | undefined;
  liveTick: MarketTickData | undefined;
  isLoading?: boolean;
}

export const OrderBookDepth: React.FC<OrderBookDepthProps> = ({
  selectedMarket,
  liveDepth,
  liveTick,
  isLoading = false,
}) => {
  const [activeLeg, setActiveLeg] = useState<'YES' | 'NO'>('YES');
  const [isFetchingDepth, setIsFetchingDepth] = useState<boolean>(true);
  const [depthData, setDepthData] = useState<{
    yesBids: Array<{ price: number; quantity: number; total: number }>;
    yesAsks: Array<{ price: number; quantity: number; total: number }>;
  }>({
    yesBids: [],
    yesAsks: [],
  });

  // Fetch initial depth via REST API when market selection changes
  useEffect(() => {
    if (!selectedMarket) {
      setIsFetchingDepth(false);
      return;
    }

    let isMounted = true;
    setIsFetchingDepth(true);
    apiClient
      .getMarketDepth(selectedMarket.id)
      .then((res) => {
        if (isMounted && res.success && res.depth) {
          setDepthData({
            yesBids: res.depth.yesBids || [],
            yesAsks: res.depth.yesAsks || [],
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsFetchingDepth(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedMarket?.id]);

  if (!selectedMarket || isLoading) {
    return <OrderBookDepthSkeleton />;
  }

  // Spot price & market computations
  const spot = liveTick?.spotPrice ?? selectedMarket.strikePrice;
  const isITM = spot >= selectedMarket.strikePrice;
  const strikeDelta = spot - selectedMarket.strikePrice;
  const fairValue = liveTick?.fairValue ?? selectedMarket.fairValueYes;
  const edge = liveTick?.edge ?? selectedMarket.edgePercentage;

  // Use live WebSocket depth if available, otherwise fall back to REST depth
  const bids = liveDepth?.bids.length
    ? liveDepth.bids.map(([price, quantity], idx, arr) => {
        const total = arr.slice(0, idx + 1).reduce((sum, [p, q]) => sum + p * q, 0);
        return { price, quantity, total: Number(total.toFixed(2)) };
      })
    : depthData.yesBids;

  const asks = liveDepth?.asks.length
    ? liveDepth.asks.map(([price, quantity], idx, arr) => {
        const total = arr.slice(0, idx + 1).reduce((sum, [p, q]) => sum + p * q, 0);
        return { price, quantity, total: Number(total.toFixed(2)) };
      })
    : depthData.yesAsks;

  const bestBid = liveDepth?.bestBid ?? selectedMarket.bestBidYes;
  const bestAsk = liveDepth?.bestAsk ?? selectedMarket.bestAskYes;
  const spread = Number(Math.max(0, bestAsk - bestBid).toFixed(2));
  const midPrice = Number(((bestBid + bestAsk) / 2).toFixed(4));

  // Calculate maximum cumulative total for depth visualization bar percentages
  const maxTotal = Math.max(
    ...bids.map((b) => b.total),
    ...asks.map((a) => a.total),
    100,
  );

  return (
    <div className="terminal-panel flex flex-col h-full overflow-hidden">
      {/* Header & Leg Toggle */}
      <div className="p-4 pb-3 border-b border-border/40 flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <QueueListIcon className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground tracking-wide">
            CLOB DEPTH: {selectedMarket.symbol}
          </span>
          <Badge variant="secondary" className="font-mono text-[10px] text-muted-foreground px-1.5 py-0">
            {selectedMarket.windowDuration}
          </Badge>
        </div>

        {/* Leg Toggle Switcher */}
        <div className="flex items-center gap-1 bg-secondary/40 p-0.5 rounded-lg border border-border/40 text-xs">
          <button
            type="button"
            onClick={() => setActiveLeg('YES')}
            className={cn(
              "px-2.5 py-1 text-[11px] font-mono rounded-md transition-colors cursor-pointer",
              activeLeg === 'YES'
                ? "bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            YES TOKEN
          </button>
          <button
            type="button"
            onClick={() => setActiveLeg('NO')}
            className={cn(
              "px-2.5 py-1 text-[11px] font-mono rounded-md transition-colors cursor-pointer",
              activeLeg === 'NO'
                ? "bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            NO TOKEN
          </button>
        </div>
      </div>

      {/* Selected Contract Telemetry Subheader */}
      <div className="grid grid-cols-3 gap-2 px-4 py-2.5 bg-secondary/20 border-b border-border/30 text-xs font-mono flex-shrink-0">
        <div>
          <span className="text-[9px] text-muted-foreground uppercase font-semibold block">STRIKE</span>
          <span className="font-bold text-foreground block mt-0.5">${selectedMarket.strikePrice.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-[9px] text-muted-foreground uppercase font-semibold block">LIVE SPOT</span>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={cn("font-bold", isITM ? "text-emerald-400" : "text-rose-400")}>
              ${spot.toLocaleString()}
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center">
              {strikeDelta >= 0 ? <ArrowTrendingUpIcon className="w-2.5 h-2.5 text-emerald-400" /> : <ArrowTrendingDownIcon className="w-2.5 h-2.5 text-rose-400" />}
              {Math.abs(strikeDelta).toFixed(1)}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[9px] text-muted-foreground uppercase font-semibold block">STATUS</span>
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] font-bold px-1.5 py-0 mt-0.5 inline-block",
              isITM
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-rose-500/10 text-rose-400 border-rose-500/30"
            )}
          >
            {isITM ? 'IN THE MONEY' : 'OUT OF MONEY'}
          </Badge>
        </div>
      </div>

      {/* Book Table Column Headers */}
      <div className="grid grid-cols-3 px-4 py-2 border-b border-border/40 text-[10px] font-mono text-muted-foreground uppercase tracking-wider font-semibold flex-shrink-0 bg-secondary/10">
        <div className="text-left">Price (USDC)</div>
        <div className="text-right">Size (Shares)</div>
        <div className="text-right">Total (USDC)</div>
      </div>

      {/* Main Book Ladder Content */}
      <div className="p-3 flex flex-col justify-between flex-1 min-h-0 overflow-y-auto">
        {/* ASKS (Sells) - Rendered Top-to-Bottom */}
        <div className="flex flex-col gap-1">
          {asks.length === 0 && isFetchingDepth ? (
            [1, 2, 3, 4, 5].map((i) => (
              <div key={`ask-row-skel-${i}`} className="flex justify-between items-center px-2 py-1">
                <Skeleton variant="text" width={45} height={12} />
                <Skeleton variant="text" width={55} height={12} />
                <Skeleton variant="text" width={45} height={12} />
              </div>
            ))
          ) : (
            asks
              .slice(0, 5)
              .reverse()
              .map((ask, idx) => {
                const displayPrice = activeLeg === 'YES' ? ask.price : Number((1.0 - ask.price).toFixed(2));
                const barWidth = Math.min(100, Math.max(4, (ask.total / maxTotal) * 100));

                return (
                  <div
                    key={`ask-${idx}`}
                    className="relative grid grid-cols-3 items-center px-2.5 py-1 rounded text-xs font-mono overflow-hidden hover:bg-rose-500/5 transition-colors"
                  >
                    {/* Depth Bar */}
                    <div
                      className="absolute top-0 right-0 bottom-0 bg-rose-500/10 transition-all duration-300 pointer-events-none"
                      style={{ width: `${barWidth}%` }}
                    />
                    <span className="relative text-rose-400 font-bold text-left">{displayPrice.toFixed(2)}</span>
                    <span className="relative text-foreground text-right">{ask.quantity.toLocaleString()}</span>
                    <span className="relative text-muted-foreground text-right">${ask.total.toFixed(1)}</span>
                  </div>
                );
              })
          )}
        </div>

        {/* SPREAD & MIDPOINT BANNER */}
        <div className="grid grid-cols-3 p-2.5 my-2.5 rounded-lg bg-secondary/30 border border-border/40 text-xs font-mono flex-shrink-0">
          <div className="flex flex-col">
            <span className="text-[9px] text-muted-foreground uppercase font-semibold">SPREAD</span>
            <span className="font-bold text-foreground mt-0.5">{spread.toFixed(2)} USDC</span>
          </div>

          <div className="flex flex-col text-center">
            <span className="text-[9px] text-muted-foreground uppercase font-semibold">MID PROB</span>
            <span className="font-bold text-foreground mt-0.5">{(midPrice * 100).toFixed(1)}%</span>
          </div>

          <div className="flex flex-col text-right">
            <span className="text-[9px] text-muted-foreground uppercase font-semibold">Φ(z) FAIR</span>
            <span className="font-bold text-foreground mt-0.5">{(fairValue * 100).toFixed(1)}%</span>
          </div>
        </div>

        {/* BIDS (Buys) - Rendered Top-to-Bottom */}
        <div className="flex flex-col gap-1">
          {bids.length === 0 && isFetchingDepth ? (
            [1, 2, 3, 4, 5].map((i) => (
              <div key={`bid-row-skel-${i}`} className="flex justify-between items-center px-2 py-1">
                <Skeleton variant="text" width={45} height={12} />
                <Skeleton variant="text" width={55} height={12} />
                <Skeleton variant="text" width={45} height={12} />
              </div>
            ))
          ) : (
            bids.slice(0, 5).map((bid, idx) => {
              const displayPrice = activeLeg === 'YES' ? bid.price : Number((1.0 - bid.price).toFixed(2));
              const barWidth = Math.min(100, Math.max(4, (bid.total / maxTotal) * 100));

              return (
                <div
                  key={`bid-${idx}`}
                  className="relative grid grid-cols-3 items-center px-2.5 py-1 rounded text-xs font-mono overflow-hidden hover:bg-emerald-500/5 transition-colors"
                >
                  {/* Depth Bar */}
                  <div
                    className="absolute top-0 right-0 bottom-0 bg-emerald-500/10 transition-all duration-300 pointer-events-none"
                    style={{ width: `${barWidth}%` }}
                  />
                  <span className="relative text-emerald-400 font-bold text-left">{displayPrice.toFixed(2)}</span>
                  <span className="relative text-foreground text-right">{bid.quantity.toLocaleString()}</span>
                  <span className="relative text-muted-foreground text-right">${bid.total.toFixed(1)}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Alpha & Valuation Signal Footer */}
      <div className="p-3 border-t border-border/40 bg-secondary/20 flex items-center justify-between text-xs font-mono flex-shrink-0">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <BoltIcon className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px]">BSM Dislocation:</span>
        </div>
        <div className="flex items-center gap-2">
          {edge !== 0 ? (
            <span
              className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded border leading-none",
                edge > 0
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/30"
              )}
            >
              {edge > 0 ? `+${(edge * 100).toFixed(1)}% YES ALPHA` : `${(Math.abs(edge) * 100).toFixed(1)}% NO ALPHA`}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">EFFICIENT MARKET</span>
          )}
        </div>
      </div>
    </div>
  );
};
