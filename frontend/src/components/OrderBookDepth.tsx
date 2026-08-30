import React, { useState, useEffect } from 'react';
import {
  QueueListIcon,
  BoltIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  AdjustmentsHorizontalIcon,
  ArrowsPointingInIcon,
} from '@heroicons/react/24/outline';
import type { Market, AgentThoughtLog } from '../types/index.js';
import type { DepthUpdateData, MarketTickData } from '../hooks/useTelemetry.js';
import type { WalletState } from '../hooks/useSessionKey.js';
import type { SessionGrant } from '../types/index.js';
import { apiClient } from '../services/api.js';
import { soundEngine } from '../services/audio.js';
import { OrderBookDepthSkeleton, Skeleton } from './ui/Skeleton.js';
import { Badge } from './ui/badge.js';
import { cn } from '../lib/utils.js';
import { TraderCockpitTicket, type LadderPrefillData } from './dashboard/TraderCockpitTicket.js';

interface OrderBookDepthProps {
  selectedMarket: Market | null;
  liveDepth: DepthUpdateData | undefined;
  liveTick: MarketTickData | undefined;
  currentSpotPrice?: number;
  isLoading?: boolean;
  wallet?: WalletState;
  activeSession?: SessionGrant | null;
  agentThoughts?: AgentThoughtLog[];
  onOpenSessionModal?: () => void;
  onConnectWallet?: () => void;
  onPrefillOrder?: (data: LadderPrefillData) => void;
  hideEmbeddedTicket?: boolean;
}

export const OrderBookDepth: React.FC<OrderBookDepthProps> = ({
  selectedMarket,
  liveDepth,
  liveTick,
  currentSpotPrice,
  isLoading = false,
  wallet,
  activeSession = null,
  agentThoughts = [],
  onOpenSessionModal,
  onConnectWallet,
  onPrefillOrder,
  hideEmbeddedTicket = false,
}) => {
  const [activeLeg, setActiveLeg] = useState<'YES' | 'NO'>('YES');
  const [viewMode, setViewMode] = useState<'SPLIT' | 'LADDER' | 'COCKPIT'>('SPLIT');
  const [prefillData, setPrefillData] = useState<LadderPrefillData | null>(null);
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

  // Spot price & market computations — synthetic/seed markets are forced to 0 edge (no alpha)
  const isSyntheticOrSeedDepth = Boolean(selectedMarket.isSynthetic || selectedMarket.isSeedDepth);
  const spot = currentSpotPrice || liveTick?.spotPrice || selectedMarket.strikePrice || 79664.46;
  const isITM = spot >= selectedMarket.strikePrice;
  const strikeDelta = spot - selectedMarket.strikePrice;
  const fairValue = liveTick?.fairValue ?? selectedMarket.fairValueYes;
  const rawEdge = liveTick?.edge ?? selectedMarket.edgePercentage;
  const edge = isSyntheticOrSeedDepth ? 0 : rawEdge;

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

  // 1-Click Ladder Interactions
  const handleLadderAskClick = (askPrice: number, askQty: number) => {
    soundEngine.playTradeFill();
    const data: LadderPrefillData = {
      outcome: 'YES',
      price: askPrice,
      lotSize: askQty,
      source: 'ask',
      timestamp: Date.now(),
    };
    setPrefillData(data);
    onPrefillOrder?.(data);
    if (!hideEmbeddedTicket && viewMode === 'LADDER') {
      setViewMode('COCKPIT');
    }
  };

  const handleLadderBidClick = (bidPrice: number, bidQty: number) => {
    soundEngine.playTradeFill();
    // Buying the counterpart NO outcome
    const noPrice = Number((1.0 - bidPrice).toFixed(2));
    const data: LadderPrefillData = {
      outcome: 'NO',
      price: noPrice,
      lotSize: bidQty,
      source: 'bid',
      timestamp: Date.now(),
    };
    setPrefillData(data);
    onPrefillOrder?.(data);
    if (!hideEmbeddedTicket && viewMode === 'LADDER') {
      setViewMode('COCKPIT');
    }
  };

  // Mock wallet state fallback if none passed
  const activeWallet: WalletState = wallet || {
    isConnected: false,
    address: null,
    balanceSTT: '0.00',
    balanceCollateral: '0.00',
    chainId: null,
    isCorrectNetwork: false,
  };

  return (
    <div className="terminal-panel flex flex-col h-full overflow-hidden">
      {/* Top Header & View Modes */}
      <div className="p-3 border-b border-border/40 flex items-center justify-between flex-wrap gap-2 flex-shrink-0 bg-background/40">
        <div className="flex items-center gap-2">
          <QueueListIcon className="w-4 h-4 text-brand-cyan" />
          <span className="text-xs font-bold text-foreground tracking-wide">
            CLOB TERMINAL: {selectedMarket.symbol}
          </span>
          <Badge variant="secondary" className="font-mono text-[10px] text-muted-foreground px-1.5 py-0">
            {selectedMarket.windowDuration}
          </Badge>
        </div>

        {/* View Mode & Leg Switcher */}
        <div className="flex items-center gap-2">
          {/* Leg Toggle Switcher */}
          <div className="flex items-center gap-0.5 bg-secondary/40 p-0.5 rounded-lg border border-border/40 text-xs">
            <button
              type="button"
              onClick={() => setActiveLeg('YES')}
              className={cn(
                "px-2 py-0.5 text-[10px] font-mono rounded transition-colors cursor-pointer",
                activeLeg === 'YES'
                  ? "bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              YES
            </button>
            <button
              type="button"
              onClick={() => setActiveLeg('NO')}
              className={cn(
                "px-2 py-0.5 text-[10px] font-mono rounded transition-colors cursor-pointer",
                activeLeg === 'NO'
                  ? "bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              NO
            </button>
          </div>

          {/* View Mode Segment Switcher */}
          {!hideEmbeddedTicket && (
            <div className="flex items-center gap-0.5 bg-secondary/40 p-0.5 rounded-lg border border-border/40 text-xs font-mono">
              <button
                type="button"
                onClick={() => setViewMode('SPLIT')}
                className={cn(
                  "px-2 py-0.5 text-[10px] rounded transition-colors cursor-pointer flex items-center gap-1",
                  viewMode === 'SPLIT'
                    ? "bg-secondary text-foreground font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Dual Split View"
              >
                <ArrowsPointingInIcon className="w-3 h-3" />
                <span className="hidden sm:inline">Split</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('LADDER')}
                className={cn(
                  "px-2 py-0.5 text-[10px] rounded transition-colors cursor-pointer",
                  viewMode === 'LADDER'
                    ? "bg-secondary text-foreground font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Order Book Depth Ladder Only"
              >
                Depth
              </button>
              <button
                type="button"
                onClick={() => setViewMode('COCKPIT')}
                className={cn(
                  "px-2 py-0.5 text-[10px] rounded transition-colors cursor-pointer flex items-center gap-1",
                  viewMode === 'COCKPIT'
                    ? "bg-secondary text-brand-cyan font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Trader Cockpit Ticket Only"
              >
                <AdjustmentsHorizontalIcon className="w-3 h-3" />
                <span>Ticket</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Selected Contract Telemetry Subheader */}
      <div className="grid grid-cols-3 gap-2 px-3 py-2 bg-secondary/15 border-b border-border/30 text-xs font-mono flex-shrink-0">
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
            title={
              isITM
                ? `In-The-Money: Live spot ($${spot.toLocaleString()}) >= strike ($${selectedMarket.strikePrice.toLocaleString()}). YES outcome currently leads.`
                : `Out-of-The-Money: Live spot ($${spot.toLocaleString()}) < strike ($${selectedMarket.strikePrice.toLocaleString()}). NO outcome currently leads.`
            }
            className={cn(
              "text-[9px] font-bold px-1.5 py-0 mt-0.5 inline-block cursor-help",
              isITM
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-rose-500/10 text-rose-400 border-rose-500/30"
            )}
          >
            {isITM ? 'ITM · YES LEADING' : 'OTM · NO LEADING'}
          </Badge>
        </div>
      </div>

      {/* Main Responsive Split Grid */}
      <div
        className={cn(
          "flex-1 min-h-0 overflow-hidden",
          hideEmbeddedTicket
            ? "flex flex-col"
            : "grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/40"
        )}
      >
        {/* Left Column: CLOB Depth Ladder */}
        {(hideEmbeddedTicket || viewMode === 'SPLIT' || viewMode === 'LADDER') && (
          <div
            className={cn(
              "flex flex-col h-full overflow-hidden",
              (!hideEmbeddedTicket && viewMode === 'LADDER') && "col-span-2 md:col-span-2"
            )}
          >
            {/* Book Table Column Headers */}
            <div className="grid grid-cols-3 px-3 py-1.5 border-b border-border/40 text-[9px] font-mono text-muted-foreground uppercase tracking-wider font-semibold flex-shrink-0 bg-secondary/10">
              <div className="text-left">Price (USDC)</div>
              <div className="text-right">Size (Shares)</div>
              <div className="text-right">Total (USDC)</div>
            </div>

            {/* Ladder Content */}
            <div className="p-2.5 flex flex-col justify-between flex-1 min-h-0 overflow-y-auto">
              {/* ASKS (Sells) - 1-Click to BUY YES */}
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
                          onClick={() => handleLadderAskClick(displayPrice, ask.quantity)}
                          title={`Click to 1-Click Pre-fill BUY YES @ $${displayPrice.toFixed(2)}`}
                          className="relative grid grid-cols-3 items-center px-2 py-1 rounded text-xs font-mono overflow-hidden hover:bg-rose-500/10 cursor-pointer transition-colors group"
                        >
                          {/* Depth Bar */}
                          <div
                            className="absolute top-0 right-0 bottom-0 bg-rose-500/10 group-hover:bg-rose-500/20 transition-all duration-300 pointer-events-none"
                            style={{ width: `${barWidth}%` }}
                          />
                          <span className="relative text-rose-400 font-bold text-left flex items-center gap-1">
                            {displayPrice.toFixed(2)}
                            <span className="opacity-0 group-hover:opacity-100 text-[9px] text-rose-300 font-normal transition-opacity hidden sm:inline">
                              BUY YES
                            </span>
                          </span>
                          <span className="relative text-foreground text-right">{ask.quantity.toLocaleString()}</span>
                          <span className="relative text-muted-foreground text-right">${ask.total.toFixed(1)}</span>
                        </div>
                      );
                    })
                )}
              </div>

              {/* SPREAD & MIDPOINT BANNER */}
              <div className="grid grid-cols-3 p-2 my-2 rounded-lg bg-secondary/30 border border-border/40 text-xs font-mono flex-shrink-0">
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

              {/* BIDS (Buys) - 1-Click to BUY NO */}
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
                        onClick={() => handleLadderBidClick(displayPrice, bid.quantity)}
                        title={`Click to 1-Click Pre-fill BUY NO @ $${(1.0 - displayPrice).toFixed(2)}`}
                        className="relative grid grid-cols-3 items-center px-2 py-1 rounded text-xs font-mono overflow-hidden hover:bg-emerald-500/10 cursor-pointer transition-colors group"
                      >
                        {/* Depth Bar */}
                        <div
                          className="absolute top-0 right-0 bottom-0 bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-all duration-300 pointer-events-none"
                          style={{ width: `${barWidth}%` }}
                        />
                        <span className="relative text-emerald-400 font-bold text-left flex items-center gap-1">
                          {displayPrice.toFixed(2)}
                          <span className="opacity-0 group-hover:opacity-100 text-[9px] text-emerald-300 font-normal transition-opacity hidden sm:inline">
                            BUY NO
                          </span>
                        </span>
                        <span className="relative text-foreground text-right">{bid.quantity.toLocaleString()}</span>
                        <span className="relative text-muted-foreground text-right">${bid.total.toFixed(1)}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Alpha & Valuation Signal Footer */}
            <div className="p-2 px-3 border-t border-border/40 bg-secondary/15 flex items-center justify-between text-xs font-mono flex-shrink-0">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <BoltIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px]">BSM Dislocation:</span>
              </div>
              <div>
                {edge !== 0 ? (
                  <span
                    className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none",
                      edge > 0
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                    )}
                  >
                    {edge > 0 ? `+${(edge * 100).toFixed(1)}% YES ALPHA` : `${(Math.abs(edge) * 100).toFixed(1)}% NO ALPHA`}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">EFFICIENT MARKET</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Right Column: Trader Cockpit Ticket */}
        {!hideEmbeddedTicket && (viewMode === 'SPLIT' || viewMode === 'COCKPIT') && (
          <div
            className={cn(
              "flex flex-col h-full overflow-hidden bg-secondary/5",
              viewMode === 'COCKPIT' && "col-span-2 md:col-span-2"
            )}
          >
            <TraderCockpitTicket
              market={selectedMarket}
              liveTick={liveTick}
              currentSpotPrice={currentSpotPrice}
              prefillData={prefillData}
              wallet={activeWallet}
              activeSession={activeSession}
              agentThoughts={agentThoughts}
              onOpenSessionModal={onOpenSessionModal}
              onConnectWallet={onConnectWallet}
              bestBidYes={bestBid}
              bestAskYes={bestAsk}
            />
          </div>
        )}
      </div>
    </div>
  );
};
