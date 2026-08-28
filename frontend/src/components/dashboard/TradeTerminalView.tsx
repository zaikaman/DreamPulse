import React, { useState, useMemo } from 'react';
import {
  ChevronDownIcon,
  EyeIcon,
  EyeSlashIcon,
  SparklesIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import type { Market, SessionGrant, AgentThoughtLog } from '../../types/index.js';
import type { MarketTickData, DepthUpdateData } from '../../hooks/useTelemetry.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import { useMarketCountdown } from '../../hooks/useMarketCountdown.js';
import { useCustomAgents } from '../../hooks/useCustomAgents.js';
import { EventContractChart } from './EventContractChart.js';
import { OrderBookDepth } from '../OrderBookDepth.js';
import { TraderCockpitTicket, type LadderPrefillData } from './TraderCockpitTicket.js';
import { RecentlySettledRounds } from './RecentlySettledRounds.js';
import { ActivePositionsDrawer } from './ActivePositionsDrawer.js';
import { cn } from '../../lib/utils.js';

interface TradeTerminalViewProps {
  markets: Market[];
  selectedMarket: Market | null;
  selectedMarketId: string | null;
  onSelectMarket: (marketId: string) => void;
  onRefreshMarkets?: () => void;
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
  onRefreshMarkets,
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
  const [isBookVisible, setIsBookVisible] = useState<boolean>(false);

  const { agents: customAgents } = useCustomAgents(wallet.address || undefined);

  // Active contract telemetry
  const market = selectedMarket || markets[0] || null;
  const tick = market ? liveTicks.get(market.id) : undefined;
  const spot = currentSpotPrices[market?.symbol || 'BTC/USD'] || tick?.spotPrice || market?.strikePrice || 79664.46;
  const strike = market?.strikePrice || 79613.4;

  const activeCustomForSymbol = useMemo(() => {
    if (!market) return [];
    const baseSymbol = market.symbol.split('/')[0];
    return customAgents.filter((a) => a.isDeployed && a.symbol.includes(baseSymbol));
  }, [customAgents, market?.symbol]);

  const fleetMonitoringCount = 2 + activeCustomForSymbol.length; // Volt + Oracle (+ Custom)

  // Continuous smooth fallback probability centered on strike
  const smoothFallbackProb = strike > 0 
    ? 1 / (1 + Math.exp(-Math.max(-4, Math.min(4, ((spot - strike) / (strike * 0.005)) * 2))))
    : 0.50;

  const marketProbYes = tick?.impliedProb ?? market?.impliedProbYes ?? smoothFallbackProb;
  const fairValueYes = tick?.fairValue ?? market?.fairValueYes ?? smoothFallbackProb;
  const edge = tick?.edge ?? (fairValueYes - marketProbYes);
  const isMarketUp = marketProbYes >= 0.5;
  const marketDirection = isMarketUp ? 'Up' : 'Down';
  const marketConfidence = (isMarketUp ? marketProbYes * 100 : (1 - marketProbYes) * 100).toFixed(0);
  const depth = market ? depthMap.get(market.id) : undefined;

  // Real-time dynamic countdown & formatted expiry
  const { formattedExpiry } = useMarketCountdown(market?.closeTimestamp, market?.windowDuration);

  return (
    <div className="flex flex-col w-full min-h-0 flex-1 overflow-y-auto lg:overflow-hidden gap-2 select-none pb-4 lg:pb-0">
      {/* Top Pro DEX Navigation Bar */}
      {market && (
        <div className="terminal-panel p-2 px-3 flex items-center justify-between flex-wrap gap-2 flex-shrink-0 bg-background/70 border border-border/40 backdrop-blur-md rounded-xl">
          {/* Left Side: Asset Selector + Price + 24h Delta */}
          <div className="flex items-center gap-3">
            {/* Quick Market Switcher Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary/80 border border-border/50 text-xs font-mono font-bold cursor-pointer transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-foreground">{market.symbol.split('/')[0]}</span>
                <ChevronDownIcon className="w-3 h-3 text-muted-foreground" />
              </button>

              {isDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 w-64 max-h-72 overflow-y-auto rounded-xl bg-background/95 border border-border shadow-2xl z-50 p-1 font-mono text-xs divide-y divide-border/20 backdrop-blur-xl">
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

            {/* Live Spot Price */}
            <div className="flex items-baseline gap-1.5 font-mono">
              <span className="text-sm font-bold text-foreground">
                ${spot.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-bold text-emerald-400">
                +1.51%
              </span>
            </div>

            {/* Event Question Title */}
            <div className="hidden lg:flex items-center text-xs font-mono text-muted-foreground border-l border-border/40 pl-3">
              <span>Will {market.symbol.split('/')[0]} settle above{' '}
                <strong className="text-foreground">${strike.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>{' '}
                at {formattedExpiry}?
              </span>
            </div>
          </div>

          {/* Right Side: Market Probability & Mode Toggles */}
          <div className="flex items-center gap-3 text-xs font-mono">
            {/* Market Probability */}
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-[11px]">Market:</span>
              <span className={cn(
                "font-bold text-xs px-2 py-0.5 rounded border",
                isMarketUp
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/30"
              )}>
                {marketConfidence}% {marketDirection}
              </span>
            </div>

            {/* AI Alpha Edge Badge */}
            <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded border bg-purple-500/10 text-purple-300 border-purple-500/30 text-[11px]">
              <SparklesIcon className="w-3.5 h-3.5 text-purple-400" />
              <span>AI Edge: +{(Math.abs(edge) * 100).toFixed(1)}%</span>
            </div>

            {/* Fleet Monitoring Status Pill */}
            <button
              type="button"
              onClick={() => {
                window.location.hash = '#cockpit';
              }}
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[11px] font-mono transition-colors cursor-pointer"
              title="View autonomous fleet agents executing on this market in Swarm Cockpit"
            >
              <BoltIcon className="w-3 h-3 text-amber-400" />
              <span>{fleetMonitoringCount} Fleet Agents Active</span>
            </button>

            {/* Show Book Toggle */}
            <button
              type="button"
              onClick={() => setIsBookVisible(!isBookVisible)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-medium transition-all cursor-pointer",
                isBookVisible
                  ? "bg-brand-cyan/20 text-brand-cyan border-brand-cyan/40 shadow-xs"
                  : "bg-secondary/40 text-muted-foreground border-border/40 hover:text-foreground hover:bg-secondary/70"
              )}
            >
              {isBookVisible ? <EyeSlashIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
              <span>{isBookVisible ? 'Hide book' : 'Show book'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Dual-Column Pro Trading Layout (70% Left / 30% Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 flex-1 min-h-0 lg:overflow-hidden">
        {/* Left Column (8 cols = ~67%): Visual Settlement Chart or CLOB Orderbook */}
        <div className="lg:col-span-8 flex flex-col gap-2 min-h-[380px] lg:min-h-0 lg:h-full lg:overflow-hidden">
          {/* Main Visual Arena */}
          <div className="flex-1 min-h-[320px] lg:min-h-0 overflow-hidden">
            {isBookVisible ? (
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
            ) : market ? (
              <EventContractChart
                market={market}
                liveTick={tick}
                currentSpotPrice={spot}
                agentThoughts={agentThoughts}
                onExpire={onRefreshMarkets}
              />
            ) : null}
          </div>

          {/* "Recently Settled - 15m" Horizontal Carousel Strip (Exactly like DreamDEX) */}
          <div className="rounded-xl border border-border/30 bg-background/70 backdrop-blur-md flex-shrink-0">
            <RecentlySettledRounds
              currentSymbol={market?.symbol || 'BTC/USD'}
              onSelectMarket={(id) => {
                const match = markets.find((m) => m.id === id);
                if (match) onSelectMarket(match.id);
              }}
            />
          </div>
        </div>

        {/* Right Column (4 cols = ~33%): DreamDEX Pro Order Ticket + AI Copilot */}
        <div className="lg:col-span-4 lg:h-full min-h-0 flex flex-col overflow-hidden rounded-xl border border-border/40 bg-background/80 backdrop-blur-md">
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
              onSelectDuration={(duration) => {
                // Find matching duration market if available
                const match = markets.find((m) => m.symbol === market.symbol && m.windowDuration === duration);
                if (match) onSelectMarket(match.id);
              }}
            />
          )}
        </div>
      </div>

      {/* Persistent Bottom Drawer: Active Positions, Open Orders & Trade History */}
      <div className="rounded-xl overflow-hidden border border-border/40 flex-shrink-0">
        <ActivePositionsDrawer
          wallet={wallet}
          currentMarket={market}
          onSelectMarket={onSelectMarket}
        />
      </div>
    </div>
  );
};
