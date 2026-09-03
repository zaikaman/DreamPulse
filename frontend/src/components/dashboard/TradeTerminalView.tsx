import React, { useState, useMemo } from 'react';
import {
  ChevronDownIcon,
  EyeIcon,
  EyeSlashIcon,
  SparklesIcon,
  BoltIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import type { Market, SessionGrant, AgentThoughtLog } from '../../types/index.js';
import type { MarketTickData, DepthUpdateData } from '../../hooks/useTelemetry.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import { useMarketCountdown } from '../../hooks/useMarketCountdown.js';
import { useCustomAgents } from '../../hooks/useCustomAgents.js';
import { evaluateTradeConfluence } from '../../lib/confluence.js';
import { EventContractChart } from './EventContractChart.js';
import { TraderCockpitTicket, type LadderPrefillData } from './TraderCockpitTicket.js';
import { RecentlySettledRounds } from './RecentlySettledRounds.js';
const OrderBookDepth = React.lazy(() => import('../OrderBookDepth.js').then((m) => ({ default: m.OrderBookDepth })) );
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
  spotTickers?: Record<string, { price: number; change1m?: number; change5m?: number; high24h?: number; low24h?: number; volume24h?: number; timestamp?: number }>;
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
  spotTickers,
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

  // Active contract telemetry — strict selection (no silent fallback to wrong contract)
  const market = selectedMarket ?? null;
  const isResolving = market?.status === 'Resolving';
  const tick = market ? liveTicks.get(market.id) : undefined;

  const [localFrozenSpot, setLocalFrozenSpot] = useState<number | null>(null);
  const liveSpot = (market?.symbol && currentSpotPrices[market.symbol]) || tick?.spotPrice || market?.strikePrice || 0;

  React.useEffect(() => {
    if (isResolving) {
      if (market?.settlementPrice) {
        setLocalFrozenSpot(market.settlementPrice);
      } else if (localFrozenSpot === null && liveSpot > 0) {
        setLocalFrozenSpot(liveSpot);
      }
    } else {
      setLocalFrozenSpot(null);
    }
  }, [isResolving, market?.settlementPrice, market?.id, liveSpot, localFrozenSpot]);

  const spot = isResolving ? (market?.settlementPrice ?? localFrozenSpot ?? liveSpot) : liveSpot;
  const strike = market?.strikePrice || 0;

  const activeCustomForSymbol = useMemo(() => {
    if (!market) return [];
    const baseSymbol = market.symbol.split('/')[0];
    return customAgents.filter((a) => a.isDeployed && a.symbol.includes(baseSymbol));
  }, [customAgents, market?.symbol]);

  const fleetMonitoringCount = 2 + activeCustomForSymbol.length; // Volt + Oracle (+ Custom)

  // Multi-Factor Confluence evaluation
  const confluence = useMemo(() => {
    if (!market) return null;
    const recentThought = agentThoughts?.find(
      (t) => t.marketId === market.id || t.marketId?.toLowerCase() === market.id.toLowerCase()
    );
    return evaluateTradeConfluence(market, tick, spot, undefined, recentThought?.reasoningText);
  }, [market, tick, spot, agentThoughts]);

  // Continuous smooth fallback probability centered on strike
  const smoothFallbackProb = strike > 0 && spot > 0
    ? 1 / (1 + Math.exp(-Math.max(-4, Math.min(4, ((spot - strike) / (strike * 0.005)) * 2))))
    : 0.50;

  const isSyntheticOrSeed = Boolean(market?.isSynthetic || market?.isSeedDepth);
  const marketProbYes = isSyntheticOrSeed ? 0.5 : (tick?.impliedProb ?? market?.impliedProbYes ?? smoothFallbackProb);
  const isMarketUp = marketProbYes >= 0.5;
  const marketDirection = isMarketUp ? 'Up' : 'Down';
  const marketConfidence = (isMarketUp ? marketProbYes * 100 : (1 - marketProbYes) * 100).toFixed(0);
  const depth = market ? depthMap.get(market.id) : undefined;

  const tickerData = market?.symbol
    ? spotTickers?.[market.symbol] || spotTickers?.[`${market.symbol}/USD`] || spotTickers?.[market.symbol.split('/')[0]]
    : undefined;
  const change1m = tickerData?.change1m ?? (confluence?.priceActionScore !== undefined && confluence.priceActionScore !== 0 ? confluence.priceActionScore * 0.001 : 0);
  const isPositiveDelta = change1m >= 0;
  const formattedDelta = `${isPositiveDelta ? '+' : ''}${(change1m * 100).toFixed(2)}%`;

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
                <span className="w-2 h-2 rounded-full bg-[#ffb700]" />
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
                          {m.status === 'Resolving' && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-[#ffb700]/20 text-[#ffb700] border border-[#ffb700]/30 font-bold">
                              Resolving
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground">${(m.strikePrice ?? 0).toLocaleString()}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Live or Frozen Spot Price */}
            <div className="flex items-baseline gap-1.5 font-mono">
              <span className="text-sm font-bold text-foreground">
                ${(spot ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {isResolving ? (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#ffb700]/20 text-[#ffb700] border border-[#ffb700]/30 animate-pulse">
                  FROZEN SPOT
                </span>
              ) : change1m !== 0 ? (
                <span className={cn("text-xs font-bold", isPositiveDelta ? "text-[#00e676]" : "text-[#ff3366]")}>
                  {formattedDelta}
                </span>
              ) : (
                <span className="text-xs font-medium text-muted-foreground">
                  0.00%
                </span>
              )}
            </div>

            {/* Event Question Title */}
            <div className="hidden lg:flex items-center text-xs font-mono text-muted-foreground border-l border-border/40 pl-3">
              {isResolving ? (
                <span className="text-[#ffb700] flex items-center gap-1.5 font-semibold">
                  <ArrowPathIcon className="w-3.5 h-3.5 animate-spin text-[#ffb700]" />
                  <span>Settlement window: frozen at <strong>${(spot ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong> vs strike <strong>${(strike ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></span>
                </span>
              ) : (
                <span>Will {market.symbol.split('/')[0]} settle above{' '}
                  <strong className="text-foreground">${(strike ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>{' '}
                  at {formattedExpiry}?
                </span>
              )}
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
                  ? "bg-[#00e676]/10 text-[#00e676] border-[#00e676]/30"
                  : "bg-[#ff3366]/10 text-[#ff3366] border-[#ff3366]/30"
              )}>
                {marketConfidence}% {marketDirection}
              </span>
            </div>

            {/* AI Alpha Confluence Badge */}
            {confluence && (
              <div
                className={cn(
                  "hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-[11px] font-mono transition-all",
                  confluence.badgeStyle.bg,
                  confluence.badgeStyle.border,
                  confluence.badgeStyle.text,
                  confluence.badgeStyle.glow
                )}
                title={confluence.rationale}
              >
                <SparklesIcon className={cn("w-3.5 h-3.5", confluence.badgeStyle.iconColor)} />
                <span>
                  {confluence.convictionState === 'HIGH_CONVICTION'
                    ? `AI: ${confluence.recommendedAction === 'BUY_UP' ? '▲ BUY UP' : '▼ BUY DOWN'} (${confluence.signedEdgeLabel})`
                    : confluence.convictionState === 'CAUTION_COUNTER_TREND'
                    ? `AI: Caution Divergence`
                    : `AI Edge: ${confluence.signedEdgeLabel}`
                  }
                </span>
              </div>
            )}

            {/* Fleet Monitoring Status Pill */}
            <button
              type="button"
              onClick={() => {
                window.location.hash = '#cockpit';
              }}
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[#ffb700]/30 bg-[#ffb700]/10 hover:bg-[#ffb700]/20 text-[#ffb700] text-[11px] font-mono transition-colors cursor-pointer"
              title="View autonomous fleet agents executing on this market in Swarm Cockpit"
            >
              <BoltIcon className="w-3 h-3 text-[#ffb700]" />
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

      {/* Designated "Round Ended — Resolving On-Chain Outcome..." state banner */}
      {market && isResolving && (
        <div className="terminal-panel px-4 py-2.5 flex items-center justify-between flex-wrap gap-3 bg-[#ffb700]/10 border border-[#ffb700]/40 backdrop-blur-md rounded-xl text-xs font-mono shadow-[0_0_16px_rgba(255,183,0,0.12)] flex-shrink-0 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center">
              <span className="w-3 h-3 rounded-full bg-[#ffb700] animate-ping absolute opacity-75" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#ffb700]" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#ffb700] text-xs tracking-wide">
                Round Ended — Resolving On-Chain Outcome...
              </span>
              <span className="hidden sm:inline text-muted-foreground text-[11px]">
                • Final spot frozen against strike • Awaiting oracle settlement on Somnia Shannon
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-muted-foreground">Frozen Spot:</span>
              <span className="font-bold text-foreground">
                ${(spot ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-muted-foreground">Strike:</span>
              <span className="font-bold text-foreground">
                ${(strike ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <span
              className={cn(
                "px-2 py-0.5 rounded font-bold text-[10px] tracking-wider border",
                spot >= strike
                  ? "bg-[#00e676]/20 text-[#00e676] border-[#00e676]/40"
                  : "bg-[#ff3366]/20 text-[#ff3366] border-[#ff3366]/40"
              )}
            >
              {spot >= strike ? 'PROJECTED YES (UP)' : 'PROJECTED NO (DOWN)'}
            </span>
          </div>
        </div>
      )}

      {!market ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center rounded-xl border border-border/40 bg-background/60 backdrop-blur-md gap-4 min-h-[400px]">
          <div className="w-12 h-12 rounded-2xl bg-brand-cyan/10 border border-brand-cyan/30 flex items-center justify-center text-brand-cyan shadow-sm">
            <SparklesIcon className="w-6 h-6" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <h3 className="text-base font-bold text-foreground font-mono">Select a Market</h3>
            <p className="text-xs text-muted-foreground max-w-md font-mono">
              Choose an active prediction market contract below to view the live CLOB orderbook, volatility surface, and execute trades safely.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-w-2xl w-full mt-2">
            {markets.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectMarket(m.id)}
                className="p-3 rounded-xl border border-border/60 hover:border-brand-cyan/60 bg-secondary/30 hover:bg-secondary/60 transition-all text-left flex flex-col gap-1 cursor-pointer group"
              >
                <div className="flex items-center justify-between text-xs font-mono font-bold">
                  <span className="text-foreground group-hover:text-brand-cyan">{m.symbol}</span>
                  <div className="flex items-center gap-1">
                    {m.status === 'Resolving' && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-[#ffb700]/20 text-[#ffb700] border border-[#ffb700]/30 font-bold">
                        Resolving
                      </span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/80 text-muted-foreground border border-border/40">{m.windowDuration}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                  <span>Strike: ${(m.strikePrice ?? 0).toLocaleString()}</span>
                  <span className="text-brand-cyan font-bold">{((m.impliedProbYes ?? 0.5) * 100).toFixed(0)}% YES</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Main Dual-Column Pro Trading Layout (70% Left / 30% Right) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 flex-1 min-h-0 lg:overflow-hidden">
          {/* Left Column (8 cols = ~67%): Visual Settlement Chart or CLOB Orderbook */}
          <div className="lg:col-span-8 flex flex-col gap-2 min-h-[380px] lg:min-h-0 lg:h-full lg:overflow-hidden">
            {/* Main Visual Arena */}
            <div className="flex-1 min-h-[320px] lg:min-h-0 overflow-hidden">
              {isBookVisible ? (
                <React.Suspense fallback={<div className="h-full grid place-items-center text-xs text-muted-foreground">Loading order book…</div>}>
                  <OrderBookDepth
                    selectedMarket={market}
                    liveDepth={depth}
                    liveTick={tick}
                    currentSpotPrice={spot}
                    isLoading={isLoading}
                    wallet={wallet}
                    activeSession={activeSession}
                    agentThoughts={agentThoughts}
                    onOpenSessionModal={onOpenSessionModal}
                    onConnectWallet={onConnectWallet}
                    hideEmbeddedTicket={true}
                    onPrefillOrder={(data) => setPrefillData(data)}
                  />
                </React.Suspense>
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
                currentSpotPrice={spot}
                prefillData={prefillData}
                wallet={wallet}
                activeSession={activeSession ?? null}
                agentThoughts={agentThoughts}
                onOpenSessionModal={onOpenSessionModal}
                onConnectWallet={onConnectWallet}
                bestBidYes={market.bestBidYes}
                bestAskYes={market.bestAskYes}
                availableDurations={markets
                  .filter((m) => m.symbol === market.symbol && m.status === 'Open')
                  .map((m) => m.windowDuration)}
                onSelectDuration={(duration) => {
                  // Find matching duration market if available
                  const match = markets.find((m) => m.symbol === market.symbol && m.windowDuration === duration && m.status === 'Open');
                  if (match) onSelectMarket(match.id);
                }}
              />
            )}
          </div>
        </div>
      )}

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
