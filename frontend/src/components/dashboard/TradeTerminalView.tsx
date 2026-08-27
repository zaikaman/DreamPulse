import React, { useState } from 'react';
import {
  ChevronDownIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  BoltIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';
import type { Market, SessionGrant, AgentThoughtLog } from '../../types/index.js';
import type { MarketTickData, DepthUpdateData } from '../../hooks/useTelemetry.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import { OrderBookDepth } from '../OrderBookDepth.js';
import { TraderCockpitTicket, type LadderPrefillData } from './TraderCockpitTicket.js';
import { ActivePositionsDrawer } from './ActivePositionsDrawer.js';
import { Badge } from '../ui/badge.js';
import { cn } from '../../lib/utils.js';

interface TradeTerminalViewProps {
  markets: Market[];
  selectedMarket: Market | null;
  selectedMarketId: string | null;
  onSelectMarket: (marketId: string) => void;
  liveTicks: Map<string, MarketTickData>;
  depthMap: Map<string, DepthUpdateData>;
  currentSpotPrices: Record<string, number>;
  isLoading?: boolean;
  wallet: WalletState;
  activeSession?: SessionGrant | null;
  agentThoughts?: AgentThoughtLog[];
  onOpenSessionModal?: () => void;
  onConnectWallet?: () => void;
}

export const TradeTerminalView: React.FC<TradeTerminalViewProps> = ({
  markets,
  selectedMarket,
  selectedMarketId: _selectedMarketId,
  onSelectMarket,
  liveTicks,
  depthMap,
  currentSpotPrices,
  isLoading = false,
  wallet,
  activeSession,
  agentThoughts,
  onOpenSessionModal,
  onConnectWallet,
}) => {
  const [prefillData, setPrefillData] = useState<LadderPrefillData | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  // Active contract telemetry
  const market = selectedMarket || markets[0] || null;
  const tick = market ? liveTicks.get(market.id) : undefined;
  const spot = currentSpotPrices[market?.symbol || 'BTC/USD'] || tick?.spotPrice || market?.strikePrice || 0;
  const strike = market?.strikePrice || 0;
  const strikeDelta = spot - strike;
  const isITM = spot >= strike;
  const fairValue = tick?.fairValue ?? market?.fairValueYes ?? 0.5;
  const edge = tick?.edge ?? market?.edgePercentage ?? 0.0;
  const depth = market ? depthMap.get(market.id) : undefined;

  return (
    <div className="flex flex-col h-full min-h-0 flex-1 overflow-hidden gap-2.5">
      {/* Top Contract Command Header */}
      {market && (
        <div className="terminal-panel p-2.5 px-3 flex items-center justify-between flex-wrap gap-2 flex-shrink-0 bg-background/50">
          <div className="flex items-center gap-3">
            {/* Quick Market Switcher Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-secondary/40 hover:bg-secondary/70 border border-border/40 text-xs font-mono font-bold cursor-pointer transition-colors"
              >
                <AdjustmentsHorizontalIcon className="w-3.5 h-3.5 text-brand-cyan" />
                <span>{market.symbol}</span>
                <Badge variant="secondary" className="text-[10px] px-1 py-0 text-muted-foreground">
                  {market.windowDuration}
                </Badge>
                <ChevronDownIcon className="w-3 h-3 text-muted-foreground" />
              </button>

              {isDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 w-64 max-h-72 overflow-y-auto rounded-xl bg-background/95 border border-border shadow-xl z-50 p-1 font-mono text-xs divide-y divide-border/20 backdrop-blur-md">
                  {markets.map((m) => {
                    const isCur = m.id === market.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onSelectMarket(m.id);
                          setIsDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full px-2.5 py-2 text-left flex items-center justify-between hover:bg-secondary/40 transition-colors cursor-pointer rounded-md",
                          isCur && "bg-secondary/60 font-bold"
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{m.symbol}</span>
                          <span className="text-[10px] text-muted-foreground">({m.windowDuration})</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">${m.strikePrice.toLocaleString()}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Strike & Delta */}
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-muted-foreground uppercase text-[10px]">Strike:</span>
              <span className="font-bold text-foreground">${strike.toLocaleString()}</span>
            </div>

            {/* Live Spot */}
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-muted-foreground uppercase text-[10px]">Spot:</span>
              <span className={cn("font-bold flex items-center gap-1", isITM ? "text-emerald-400" : "text-rose-400")}>
                ${spot.toLocaleString()}
                {strikeDelta >= 0 ? (
                  <ArrowTrendingUpIcon className="w-3 h-3 text-emerald-400" />
                ) : (
                  <ArrowTrendingDownIcon className="w-3 h-3 text-rose-400" />
                )}
              </span>
            </div>

            {/* In The Money Status Badge */}
            <Badge
              variant="outline"
              title={
                isITM
                  ? `In-The-Money: Live spot ($${spot.toLocaleString()}) >= strike ($${strike.toLocaleString()}). YES outcome currently leads.`
                  : `Out-of-The-Money: Live spot ($${spot.toLocaleString()}) < strike ($${strike.toLocaleString()}). NO outcome currently leads.`
              }
              className={cn(
                "text-[9px] font-mono px-1.5 py-0 cursor-help",
                isITM
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/30"
              )}
            >
              {isITM ? 'ITM · YES LEADING' : 'OTM · NO LEADING'}
            </Badge>
          </div>

          {/* Right Metrics: BSM Fair Value & Edge Alpha */}
          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground uppercase text-[10px]">Φ(z) Fair:</span>
              <span className="font-bold text-foreground">{(fairValue * 100).toFixed(1)}%</span>
            </div>

            <div className="flex items-center gap-1">
              <BoltIcon className="w-3 h-3 text-emerald-400" />
              <span className="text-muted-foreground uppercase text-[10px]">Edge:</span>
              <span
                className={cn(
                  "font-bold text-[10px] px-1.5 py-0.2 rounded border",
                  edge > 0
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                )}
              >
                {edge > 0 ? `+${(edge * 100).toFixed(1)}% YES` : `${(Math.abs(edge) * 100).toFixed(1)}% NO`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Dual-Column Pro Trading Arena */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 flex-1 min-h-0 overflow-hidden">
        {/* Left Column (7 cols = ~58%): Uncompressed CLOB Depth Ladder */}
        <div className="lg:col-span-7 h-full min-h-0 flex flex-col overflow-hidden">
          <OrderBookDepth
            selectedMarket={market}
            liveDepth={depth}
            liveTick={tick}
            isLoading={isLoading}
            wallet={wallet}
            activeSession={activeSession}
            agentThoughts={agentThoughts}
            onOpenSessionModal={onOpenSessionModal}
            onConnectWallet={onConnectWallet}
            hideEmbeddedTicket={true}
            onPrefillOrder={(data) => setPrefillData(data)}
          />
        </div>

        {/* Right Column (5 cols = ~42%): Spacious Trader Cockpit Ticket */}
        <div className="lg:col-span-5 h-full min-h-0 flex flex-col overflow-hidden terminal-panel p-0 bg-secondary/5">
          {market && (
            <TraderCockpitTicket
              market={market}
              liveTick={tick}
              prefillData={prefillData}
              wallet={wallet}
              activeSession={activeSession ?? null}
              agentThoughts={agentThoughts}
              onOpenSessionModal={onOpenSessionModal}
              onConnectWallet={onConnectWallet}
              bestBidYes={market.bestBidYes}
              bestAskYes={market.bestAskYes}
            />
          )}
        </div>
      </div>

      {/* Persistent Bottom Drawer: Active Positions & Open Orders (Feature 2) */}
      <ActivePositionsDrawer
        wallet={wallet}
        currentMarket={market}
        onSelectMarket={onSelectMarket}
      />
    </div>
  );
};
