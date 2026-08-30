import React, { useState } from 'react';
import {
  TrophyIcon,
  SparklesIcon,
  DocumentDuplicateIcon,
  ShareIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  UserGroupIcon,
  CpuChipIcon,
  BeakerIcon,
  ArrowRightIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import type {
  ArenaAgentEntry,
  ArenaTraderEntry,
  ProofOfAlphaCardConfig,
  CustomAgentDefinition,
} from '../../types/index.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import { useArenaLeaderboard } from '../../hooks/useArenaLeaderboard.js';
import { ProofOfAlphaModal } from './ProofOfAlphaModal.js';
import { Spinner } from '../ui/Spinner.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { cn } from '../../lib/utils.js';

export interface SwarmArenaViewProps {
  wallet?: WalletState;
  onOpenSessionModal?: () => void;
  onConnectWallet?: () => Promise<void>;
  onNavigateToStudio?: (customDraft?: Partial<CustomAgentDefinition>) => void;
  onNavigateToBacktester?: (agentId?: string, customDraft?: Partial<CustomAgentDefinition>) => void;
  onNavigateToTraderProfile?: (address: string) => void;
}

const ASSET_OPTIONS = ['ALL', 'BTC/USD', 'ETH/USD'];
const STRATEGY_OPTIONS = ['ALL', 'MOMENTUM', 'ARBITRAGE', 'MEAN_REVERSION', 'CUSTOM'];

function formatAssetLabel(symbol?: string): string {
  if (!symbol || symbol === 'ALL') return 'Cross-Asset';
  return symbol;
}

function formatWindowLabel(timeframe?: string): string {
  if (!timeframe || timeframe === 'ALL') return 'Universal Window';
  return timeframe;
}

function formatAssetWindow(symbol?: string, timeframe?: string): string {
  const asset = formatAssetLabel(symbol);
  const tf = formatWindowLabel(timeframe);
  return `${asset} • ${tf}`;
}

export const SwarmArenaView: React.FC<SwarmArenaViewProps> = ({
  wallet,
  onOpenSessionModal: _onOpenSessionModal,
  onConnectWallet,
  onNavigateToStudio,
  onNavigateToBacktester,
  onNavigateToTraderProfile,
}) => {
  const {
    activeTrack,
    setActiveTrack,
    timeframe,
    setTimeframe,
    symbolFilter,
    setSymbolFilter,
    strategyFilter,
    setStrategyFilter,
    sortBy,
    setSortBy,
    searchQuery,
    setSearchQuery,
    agents,
    traders,
    stats,
    isLoading,
    isRefreshing,
    error,
    refresh,
    selectedTraderAddress: _selectedTraderAddress,
    traderProfile: _traderProfile,
    isLoadingProfile: _isLoadingProfile,
    openTraderProfile,
    closeTraderProfile: _closeTraderProfile,
    cloningAgentId,
    cloneSuccessMsg,
    clonedAgentResult,
    cloneStrategy,
    copyTradingTarget: _copyTradingTarget,
    isCopyTradeLoading: _isCopyTradeLoading,
    copyTradeStatusMsg,
    toggleSocialCopyTrading: _toggleSocialCopyTrading,
    clearMessages,
  } = useArenaLeaderboard(wallet?.address || undefined);

  // Card Generator Modal State
  const [isCardModalOpen, setIsCardModalOpen] = useState<boolean>(false);
  const [cardModalConfig, setCardModalConfig] = useState<ProofOfAlphaCardConfig | null>(null);

  const handleOpenCardModal = (config: ProofOfAlphaCardConfig) => {
    setCardModalConfig(config);
    setIsCardModalOpen(true);
  };

  const handleOpenTraderProfile = (addr?: string) => {
    if (!addr) return;
    if (onNavigateToTraderProfile) {
      onNavigateToTraderProfile(addr);
    } else {
      openTraderProfile(addr);
    }
  };

  const handleShareAgent = (agent: ArenaAgentEntry) => {
    handleOpenCardModal({
      cardType: 'AGENT',
      title: agent.name,
      subtitle: `By ${agent.creatorName} • ${formatAssetWindow(agent.symbol, agent.timeframe)}`,
      badge: `${agent.tierBadge} ARCHETYPE`,
      primaryMetricLabel: `${timeframe.toUpperCase()} Net PnL`,
      primaryMetricValue: agent.pnl >= 0 ? `+${agent.pnl.toFixed(2)} USDC` : `${agent.pnl.toFixed(2)} USDC`,
      primaryMetricPositive: agent.pnl >= 0,
      secondaryMetricLabel: 'Sharpe / Win Rate',
      secondaryMetricValue: `${agent.sharpeRatio.toFixed(2)} (${agent.winRate}%)`,
      accentColor: agent.pnl >= 0 ? '#00ffcc' : '#ff3366',
      walletOrAgentId: agent.id,
      verifiedNetwork: 'Somnia Shannon Testnet',
      rulesSummary: agent.rulesSummary,
    });
  };

  const handleShareTrader = (trader: ArenaTraderEntry) => {
    handleOpenCardModal({
      cardType: 'TRADER',
      title: trader.traderTitle,
      subtitle: `Forecaster ${trader.userAddress.slice(0, 6)}...${trader.userAddress.slice(-4)} • Rank #${trader.rank}`,
      badge: `${trader.tierBadge} TRADER`,
      primaryMetricLabel: `${timeframe.toUpperCase()} Realized PnL`,
      primaryMetricValue: trader.realizedPnl >= 0 ? `+${trader.realizedPnl.toFixed(2)} USDC` : `${trader.realizedPnl.toFixed(2)} USDC`,
      primaryMetricPositive: trader.realizedPnl >= 0,
      secondaryMetricLabel: 'Win Rate & Streak',
      secondaryMetricValue: `${trader.winRate}% (${trader.currentStreak} Streak)`,
      accentColor: trader.realizedPnl >= 0 ? '#00ffcc' : '#ff3366',
      walletOrAgentId: trader.userAddress,
      verifiedNetwork: 'Somnia Shannon Testnet',
      sparkline: trader.sparkline,
    });
  };

  const handleCloneAgentClick = async (agent: ArenaAgentEntry) => {
    if (!wallet?.isConnected) {
      if (onConnectWallet) onConnectWallet();
      return;
    }
    await cloneStrategy(agent.id, wallet.address || undefined);
  };

  const handleBacktestAgentClick = (agent: ArenaAgentEntry) => {
    if (onNavigateToBacktester) {
      onNavigateToBacktester(agent.id, {
        name: agent.name,
        symbol: agent.symbol,
        timeframe: (agent.timeframe === 'ALL' ? '5m' : agent.timeframe) as any,
        strategyType: (agent.strategyType === 'SETTLEMENT' ? 'CUSTOM' : agent.strategyType) as any,
      });
    }
  };

  return (
    <div className="flex flex-col w-full min-h-0 flex-1 overflow-y-auto gap-3 select-none pb-6">
      {/* 1. Header Panel & Overview Stats Bar */}
      <div className="terminal-panel p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#00e676] animate-pulse" />
            <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider font-semibold">
              SWARM ARENA & LEADERBOARD
            </span>
            <span className="text-muted-foreground text-xs">•</span>
            <span className="text-[11px] font-mono text-muted-foreground">Somnia Shannon 50312</span>
          </div>
          <p className="text-xs text-muted-foreground max-w-xl">
            Ranked autonomous algorithmic agents and discretionary CLOB forecasters with 1-click strategy cloning and live mirror trading.
          </p>
        </div>

        {/* Minimal Clean Stat Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-shrink-0">
          <div className="px-3.5 py-2 rounded-lg bg-card/60 border border-border/50">
            <div className="text-[10px] text-muted-foreground uppercase font-mono">Arena Volume</div>
            <div className="text-xs font-semibold text-foreground font-mono mt-0.5">
              ${stats ? stats.totalArenaVolume.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '13,551.23'}
            </div>
          </div>

          <div className="px-3.5 py-2 rounded-lg bg-card/60 border border-border/50">
            <div className="text-[10px] text-muted-foreground uppercase font-mono">Community Alpha</div>
            <div className={cn(
              "text-xs font-semibold font-mono mt-0.5",
              (stats?.totalCommunityPnl ?? 9929.21) >= 0 ? "text-[#00e676]" : "text-[#ff3366]"
            )}>
              {stats
                ? (stats.totalCommunityPnl >= 0
                    ? `+$${stats.totalCommunityPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `-$${Math.abs(stats.totalCommunityPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
                : '+$9,929.21'}
            </div>
          </div>

          <div className="px-3.5 py-2 rounded-lg bg-card/60 border border-border/50">
            <div className="text-[10px] text-muted-foreground uppercase font-mono">Active Swarms</div>
            <div className="text-xs font-semibold text-foreground font-mono mt-0.5">
              {stats ? stats.totalActiveAgents : '7'}
            </div>
          </div>

          <div className="px-3.5 py-2 rounded-lg bg-card/60 border border-border/50">
            <div className="text-[10px] text-muted-foreground uppercase font-mono">Apex Streak</div>
            <div className="text-xs font-semibold text-foreground font-mono mt-0.5">
              {stats ? stats.apexWinStreak : '9'} Wins
            </div>
          </div>
        </div>
      </div>

      {/* 2. Notification / Action Flash Banners */}
      {cloneSuccessMsg && (
        <div className="p-2.5 px-3.5 rounded-lg bg-[#00e676]/10 border border-[#00e676]/30 flex items-center justify-between text-xs text-[#00e676] animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 text-[#00e676] flex-shrink-0" />
            <span>{cloneSuccessMsg}</span>
          </div>
          <div className="flex items-center gap-3">
            {onNavigateToStudio && (
              <button
                type="button"
                onClick={() => onNavigateToStudio(clonedAgentResult || undefined)}
                className="text-white hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Open in Studio</span>
                <ArrowRightIcon className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={clearMessages}
              className="text-[#00e676] hover:text-white cursor-pointer"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {copyTradeStatusMsg && (
        <div className="p-2.5 px-3.5 rounded-lg bg-secondary/50 border border-border/50 flex items-center justify-between text-xs text-foreground animate-fade-in">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-[#00ffcc] flex-shrink-0" />
            <span>{copyTradeStatusMsg}</span>
          </div>
          <button
            type="button"
            onClick={clearMessages}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-2.5 px-3.5 rounded-lg bg-[#ff3366]/10 border border-[#ff3366]/30 flex items-center justify-between text-xs text-[#ff3366] animate-fade-in">
          <span>{error}</span>
          <button
            type="button"
            onClick={clearMessages}
            className="text-[#ff3366] hover:text-white cursor-pointer"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. Toolbar & Track Segment Switcher */}
      <div className="terminal-panel p-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        {/* Track Switcher (Matching Overview Perspective Toggle) */}
        <div className="inline-flex p-0.5 rounded-lg border border-border/50 bg-secondary/30">
          <button
            type="button"
            onClick={() => setActiveTrack('AGENTS')}
            className={cn(
              "px-3 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 cursor-pointer",
              activeTrack === 'AGENTS'
                ? "bg-card text-foreground font-medium shadow-xs border border-border/40"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CpuChipIcon className="w-3.5 h-3.5" />
            <span>AI Agent Fleet ({agents.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTrack('TRADERS')}
            className={cn(
              "px-3 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 cursor-pointer",
              activeTrack === 'TRADERS'
                ? "bg-card text-foreground font-medium shadow-xs border border-border/40"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <UserGroupIcon className="w-3.5 h-3.5" />
            <span>Human Forecasters ({traders.length})</span>
          </button>
        </div>

        {/* Minimal Filters */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Timeframe selector */}
          <div className="inline-flex p-0.5 rounded-lg border border-border/50 bg-secondary/30">
            {(['24h', '7d', '30d', 'ALL'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "px-2 py-0.5 text-[11px] font-mono rounded transition-colors cursor-pointer",
                  timeframe === tf
                    ? "bg-card text-foreground font-medium border border-border/40"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Asset filter for Agents */}
          {activeTrack === 'AGENTS' && (
            <select
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              aria-label="Filter by asset symbol"
              className="bg-secondary/30 border border-border/50 text-xs text-muted-foreground hover:text-foreground rounded-lg px-2.5 py-1 focus:outline-none focus:border-border cursor-pointer h-7"
            >
              {ASSET_OPTIONS.map((sym) => (
                <option key={sym} value={sym} className="bg-slate-900 text-white">
                  Asset: {sym}
                </option>
              ))}
            </select>
          )}

          {/* Strategy filter for Agents */}
          {activeTrack === 'AGENTS' && (
            <select
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value)}
              aria-label="Filter by strategy type"
              className="bg-secondary/30 border border-border/50 text-xs text-muted-foreground hover:text-foreground rounded-lg px-2.5 py-1 focus:outline-none focus:border-border cursor-pointer h-7"
            >
              {STRATEGY_OPTIONS.map((st) => (
                <option key={st} value={st} className="bg-slate-900 text-white">
                  Type: {st}
                </option>
              ))}
            </select>
          )}

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            aria-label="Sort leaderboard by metric"
            className="bg-secondary/30 border border-border/50 text-xs text-muted-foreground hover:text-foreground rounded-lg px-2.5 py-1 focus:outline-none focus:border-border cursor-pointer h-7"
          >
            <option value="pnl" className="bg-slate-900 text-white">Sort: Net PnL</option>
            <option value="winRate" className="bg-slate-900 text-white">Sort: Win Rate %</option>
            <option value="trades" className="bg-slate-900 text-white">Sort: Total Fills</option>
            {activeTrack === 'AGENTS' && <option value="sharpe" className="bg-slate-900 text-white">Sort: Sharpe Ratio</option>}
            {activeTrack === 'TRADERS' && <option value="volume" className="bg-slate-900 text-white">Sort: Total Volume</option>}
            {activeTrack === 'TRADERS' && <option value="streak" className="bg-slate-900 text-white">Sort: Win Streak</option>}
          </select>

          {/* Search Input */}
          <div className="relative">
            <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search strategy or wallet..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1 bg-secondary/30 border border-border/50 text-xs text-foreground rounded-lg placeholder:text-muted-foreground focus:outline-none focus:border-border w-40 md:w-44 h-7"
            />
          </div>

          {/* Refresh button */}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={refresh}
            disabled={isRefreshing}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Refresh Leaderboard"
          >
            <ArrowPathIcon className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin text-foreground")} />
          </Button>
        </div>
      </div>

      {/* 4. Sleek Top 3 Spotlight Cards (Redesigned with Overview Restraint) */}
      {!isLoading && (activeTrack === 'AGENTS' ? agents.length >= 3 : traders.length >= 3) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {/* #2 Rank Card */}
          {activeTrack === 'AGENTS' ? (
            <div className="terminal-panel p-3.5 flex flex-col justify-between order-2 md:order-1">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/40 border-border/50">
                    #2 Rank
                  </Badge>
                  <span className="text-[11px] text-muted-foreground font-mono">{formatAssetWindow(agents[1]?.symbol, agents[1]?.timeframe)}</span>
                </div>
                <h4 className="text-xs font-semibold text-foreground line-clamp-1">{agents[1]?.name}</h4>
                <p className="text-[11px] text-muted-foreground">By {agents[1]?.creatorName}</p>
                <div className="flex items-baseline gap-2 mt-2 font-mono">
                  <span className={cn(
                    "text-sm font-semibold",
                    (agents[1]?.pnl ?? 0) >= 0 ? "text-[#00e676]" : "text-[#ff3366]"
                  )}>
                    {(agents[1]?.pnl ?? 0) >= 0 ? `+${agents[1]?.pnl.toFixed(2)}` : agents[1]?.pnl.toFixed(2)} USDC
                  </span>
                  <span className="text-xs text-muted-foreground">({agents[1]?.winRate}%)</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-border/40">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCloneAgentClick(agents[1])}
                  className="flex-1 h-7 text-xs font-normal text-muted-foreground hover:text-foreground gap-1"
                >
                  <DocumentDuplicateIcon className="w-3 h-3" />
                  <span>Clone</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleShareAgent(agents[1])}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Share Card"
                >
                  <ShareIcon className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="terminal-panel p-3.5 flex flex-col justify-between order-2 md:order-1">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/40 border-border/50">
                    #2 Rank
                  </Badge>
                  <span className="text-[11px] text-muted-foreground font-mono">{traders[1]?.favoriteSymbol}</span>
                </div>
                <h4 className="text-xs font-semibold text-foreground line-clamp-1">{traders[1]?.traderTitle}</h4>
                <p className="text-[11px] text-muted-foreground font-mono">{traders[1]?.userAddress.slice(0, 8)}...{traders[1]?.userAddress.slice(-6)}</p>
                <div className="flex items-baseline gap-2 mt-2 font-mono">
                  <span className={cn(
                    "text-sm font-semibold",
                    (traders[1]?.realizedPnl ?? 0) >= 0 ? "text-[#00e676]" : "text-[#ff3366]"
                  )}>
                    {(traders[1]?.realizedPnl ?? 0) >= 0 ? `+${traders[1]?.realizedPnl.toFixed(2)}` : traders[1]?.realizedPnl.toFixed(2)} USDC
                  </span>
                  <span className="text-xs text-muted-foreground">({traders[1]?.winRate}%)</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-border/40">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenTraderProfile(traders[1]?.userAddress)}
                  className="flex-1 h-7 text-xs font-normal text-muted-foreground hover:text-foreground gap-1"
                >
                  <span>Profile</span>
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleShareTrader(traders[1])}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                >
                  <ShareIcon className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* #1 Rank Card (Apex Leader) */}
          {activeTrack === 'AGENTS' ? (
            <div className="terminal-panel p-3.5 flex flex-col justify-between order-1 md:order-2 border-border/80 bg-card/60">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="font-mono text-[10px] text-foreground bg-secondary/60 border-border/70 font-semibold flex items-center gap-1">
                    <TrophyIcon className="w-3 h-3 text-[#ffb700]" />
                    <span>#1 Apex Leader</span>
                  </Badge>
                  <Badge variant="secondary" className="font-mono text-[10px] text-muted-foreground">
                    {agents[0]?.strategyType}
                  </Badge>
                </div>
                <h4 className="text-xs font-semibold text-foreground line-clamp-1">{agents[0]?.name}</h4>
                <p className="text-[11px] text-muted-foreground">By {agents[0]?.creatorName}</p>
                <div className="flex items-baseline gap-2 mt-2 font-mono">
                  <span className={cn(
                    "text-base font-bold",
                    (agents[0]?.pnl ?? 0) >= 0 ? "text-[#00e676]" : "text-[#ff3366]"
                  )}>
                    {(agents[0]?.pnl ?? 0) >= 0 ? `+${agents[0]?.pnl.toFixed(2)}` : agents[0]?.pnl.toFixed(2)} USDC
                  </span>
                  <span className="text-xs text-muted-foreground">({agents[0]?.winRate}%)</span>
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground font-mono">
                  <span>Win Rate: <strong className="text-foreground">{agents[0]?.winRate}%</strong></span>
                  <span>•</span>
                  <span>Sharpe: <strong className={cn((agents[0]?.sharpeRatio ?? 0) >= 0 ? "text-foreground" : "text-[#ff3366]")}>{agents[0]?.sharpeRatio}</strong></span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-border/40">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCloneAgentClick(agents[0])}
                  disabled={cloningAgentId === agents[0]?.id}
                  className="flex-1 h-7 text-xs font-medium text-foreground hover:bg-secondary/60 gap-1"
                >
                  {cloningAgentId === agents[0]?.id ? <Spinner size="sm" /> : <DocumentDuplicateIcon className="w-3 h-3" />}
                  <span>Clone Strategy</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleShareAgent(agents[0])}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                >
                  <ShareIcon className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="terminal-panel p-3.5 flex flex-col justify-between order-1 md:order-2 border-border/80 bg-card/60">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="font-mono text-[10px] text-foreground bg-secondary/60 border-border/70 font-semibold flex items-center gap-1">
                    <TrophyIcon className="w-3 h-3 text-[#ffb700]" />
                    <span>#1 Apex Leader</span>
                  </Badge>
                  <span className="text-[11px] text-muted-foreground font-mono">{traders[0]?.favoriteSymbol}</span>
                </div>
                <h4 className="text-xs font-semibold text-foreground line-clamp-1">{traders[0]?.traderTitle}</h4>
                <p className="text-[11px] text-muted-foreground font-mono">{traders[0]?.userAddress.slice(0, 8)}...{traders[0]?.userAddress.slice(-6)}</p>
                <div className="flex items-baseline gap-2 mt-2 font-mono">
                  <span className={cn(
                    "text-base font-bold",
                    (traders[0]?.realizedPnl ?? 0) >= 0 ? "text-[#00e676]" : "text-[#ff3366]"
                  )}>
                    {(traders[0]?.realizedPnl ?? 0) >= 0 ? `+${traders[0]?.realizedPnl.toFixed(2)}` : traders[0]?.realizedPnl.toFixed(2)} USDC
                  </span>
                  <span className="text-xs text-muted-foreground">({traders[0]?.winRate}%)</span>
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground font-mono">
                  <span>Win Rate: <strong className="text-foreground">{traders[0]?.winRate}%</strong></span>
                  <span>•</span>
                  <span>Copilot: <strong className="text-foreground">{traders[0]?.copilotSynergyScore}%</strong></span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-border/40">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenTraderProfile(traders[0]?.userAddress)}
                  className="flex-1 h-7 text-xs font-medium text-foreground hover:bg-secondary/60 gap-1"
                >
                  <span>Profile</span>
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleShareTrader(traders[0])}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                >
                  <ShareIcon className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* #3 Rank Card */}
          {activeTrack === 'AGENTS' ? (
            <div className="terminal-panel p-3.5 flex flex-col justify-between order-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/40 border-border/50">
                    #3 Rank
                  </Badge>
                  <span className="text-[11px] text-muted-foreground font-mono">{formatAssetWindow(agents[2]?.symbol, agents[2]?.timeframe)}</span>
                </div>
                <h4 className="text-xs font-semibold text-foreground line-clamp-1">{agents[2]?.name}</h4>
                <p className="text-[11px] text-muted-foreground">By {agents[2]?.creatorName}</p>
                <div className="flex items-baseline gap-2 mt-2 font-mono">
                  <span className={cn(
                    "text-sm font-semibold",
                    (agents[2]?.pnl ?? 0) >= 0 ? "text-[#00e676]" : "text-[#ff3366]"
                  )}>
                    {(agents[2]?.pnl ?? 0) >= 0 ? `+${agents[2]?.pnl.toFixed(2)}` : agents[2]?.pnl.toFixed(2)} USDC
                  </span>
                  <span className="text-xs text-muted-foreground">({agents[2]?.winRate}%)</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-border/40">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCloneAgentClick(agents[2])}
                  className="flex-1 h-7 text-xs font-normal text-muted-foreground hover:text-foreground gap-1"
                >
                  <DocumentDuplicateIcon className="w-3 h-3" />
                  <span>Clone</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleShareAgent(agents[2])}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                >
                  <ShareIcon className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="terminal-panel p-3.5 flex flex-col justify-between order-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/40 border-border/50">
                    #3 Rank
                  </Badge>
                  <span className="text-[11px] text-muted-foreground font-mono">{traders[2]?.favoriteSymbol}</span>
                </div>
                <h4 className="text-xs font-semibold text-foreground line-clamp-1">{traders[2]?.traderTitle}</h4>
                <p className="text-[11px] text-muted-foreground font-mono">{traders[2]?.userAddress.slice(0, 8)}...{traders[2]?.userAddress.slice(-6)}</p>
                <div className="flex items-baseline gap-2 mt-2 font-mono">
                  <span className={cn(
                    "text-sm font-semibold",
                    (traders[2]?.realizedPnl ?? 0) >= 0 ? "text-[#00e676]" : "text-[#ff3366]"
                  )}>
                    {(traders[2]?.realizedPnl ?? 0) >= 0 ? `+${traders[2]?.realizedPnl.toFixed(2)}` : traders[2]?.realizedPnl.toFixed(2)} USDC
                  </span>
                  <span className="text-xs text-muted-foreground">({traders[2]?.winRate}%)</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-border/40">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenTraderProfile(traders[2]?.userAddress)}
                  className="flex-1 h-7 text-xs font-normal text-muted-foreground hover:text-foreground gap-1"
                >
                  <span>Profile</span>
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleShareTrader(traders[2])}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                >
                  <ShareIcon className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Main Leaderboard Table (High-Signal Clean Table Matching Overview) */}
      <div className="terminal-panel p-0 overflow-hidden">
        {isLoading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3">
            <Spinner size="lg" />
            <span className="text-xs text-muted-foreground font-mono">Evaluating live on-chain performance metrics...</span>
          </div>
        ) : activeTrack === 'AGENTS' ? (
          /* AGENTS TABLE */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground text-[10px] font-mono uppercase tracking-wider" style={{ background: 'transparent', textAlign: 'left' }}>
                  <th style={{ padding: '9px 14px', width: '48px', textAlign: 'center', fontWeight: 500 }}>#</th>
                  <th style={{ padding: '9px 16px', fontWeight: 500 }}>STRATEGY & CREATOR</th>
                  <th style={{ padding: '9px 14px', fontWeight: 500 }}>ASSET & WINDOW</th>
                  <th style={{ padding: '9px 14px', fontWeight: 500 }}>QUANT RULES</th>
                  <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 500 }}>WIN RATE</th>
                  <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 500 }}>SHARPE</th>
                  <th style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 500 }}>NET PNL ({timeframe.toUpperCase()})</th>
                  <th style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 500 }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {agents.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '32px', textAlign: 'center' }} className="text-muted-foreground font-mono text-xs">
                      No agent strategies found matching your active filter criteria.
                    </td>
                  </tr>
                ) : (
                  agents.map((agent) => (
                    <tr
                      key={agent.id}
                      className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                    >
                      {/* Rank */}
                      <td style={{ padding: '10px 14px', textAlign: 'center' }} className="font-mono text-muted-foreground text-xs">
                        {agent.rank}
                      </td>

                      {/* Strategy & Creator */}
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600 }} className="text-foreground">{agent.name}</span>
                          {agent.isProtocolArchetype && (
                            <Badge variant="secondary" className="font-mono text-[9px] px-1 py-0 text-muted-foreground">
                              PROTOCOL
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          By {agent.creatorName}
                        </div>
                      </td>

                      {/* Asset & Window */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="font-mono text-xs text-foreground font-medium">
                            {formatAssetLabel(agent.symbol)}
                          </span>
                          <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 text-muted-foreground">
                            {formatWindowLabel(agent.timeframe)}
                          </Badge>
                        </div>
                      </td>

                      {/* Quantitative Rules */}
                      <td style={{ padding: '10px 14px' }}>
                        <div className="flex items-center flex-wrap gap-1 max-w-xs">
                          {agent.rulesSummary.slice(0, 2).map((rule, idx) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="font-mono text-[10px] text-muted-foreground bg-secondary/40 border-border/40 px-1.5 py-0"
                            >
                              {rule}
                            </Badge>
                          ))}
                        </div>
                      </td>

                      {/* Win Rate */}
                      <td style={{ padding: '10px 14px', textAlign: 'right' }} className="font-mono">
                        <div className="text-foreground font-medium">{agent.winRate}%</div>
                        <div className="text-[10px] text-muted-foreground">{agent.tradesCount} fills</div>
                      </td>

                      {/* Sharpe */}
                      <td style={{ padding: '10px 14px', textAlign: 'right' }} className="font-mono font-medium">
                        <span className={agent.sharpeRatio >= 0 ? "text-foreground" : "text-[#ff3366]"}>
                          {agent.sharpeRatio.toFixed(2)}
                        </span>
                      </td>

                      {/* Net PnL */}
                      <td style={{ padding: '10px 16px', textAlign: 'right' }} className="font-mono">
                        <div className={cn(
                          "font-semibold",
                          agent.pnl >= 0 ? "text-[#00e676]" : "text-[#ff3366]"
                        )}>
                          {agent.pnl >= 0 ? `+${agent.pnl.toFixed(2)}` : agent.pnl.toFixed(2)} USDC
                        </div>
                        <div className={cn(
                          "text-[10px]",
                          agent.pnlPct >= 0 ? "text-muted-foreground" : "text-[#ff3366]/80"
                        )}>
                          {agent.pnlPct >= 0 ? `+${agent.pnlPct}%` : `${agent.pnlPct}%`}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCloneAgentClick(agent)}
                            disabled={cloningAgentId === agent.id}
                            className="h-6 text-xs text-muted-foreground hover:text-foreground gap-1 font-normal"
                            title="Clone strategy into Studio"
                          >
                            {cloningAgentId === agent.id ? <Spinner size="sm" /> : <DocumentDuplicateIcon className="w-2.5 h-2.5" />}
                            <span>Clone</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleBacktestAgentClick(agent)}
                            className="h-6 text-xs text-muted-foreground hover:text-foreground gap-1 font-normal px-2"
                            title="Replay in Backtester"
                          >
                            <BeakerIcon className="w-2.5 h-2.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleShareAgent(agent)}
                            className="h-6 text-xs text-muted-foreground hover:text-foreground gap-1 font-normal px-2"
                            title="Generate Alpha Card"
                          >
                            <ShareIcon className="w-2.5 h-2.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* TRADERS TABLE */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground text-[10px] font-mono uppercase tracking-wider" style={{ background: 'transparent', textAlign: 'left' }}>
                  <th style={{ padding: '9px 14px', width: '48px', textAlign: 'center', fontWeight: 500 }}>#</th>
                  <th style={{ padding: '9px 16px', fontWeight: 500 }}>FORECASTER & WALLET</th>
                  <th style={{ padding: '9px 14px', fontWeight: 500 }}>FAVORITE MARKET</th>
                  <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 500 }}>COPILOT SYNERGY</th>
                  <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 500 }}>WIN RATE</th>
                  <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 500 }}>STREAK</th>
                  <th style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 500 }}>REALIZED PNL ({timeframe.toUpperCase()})</th>
                  <th style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 500 }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {traders.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '32px', textAlign: 'center' }} className="text-muted-foreground font-mono text-xs">
                      No forecasters found matching your active filter criteria.
                    </td>
                  </tr>
                ) : (
                  traders.map((trader) => (
                    <tr
                      key={trader.userAddress}
                      className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                    >
                      {/* Rank */}
                      <td style={{ padding: '10px 14px', textAlign: 'center' }} className="font-mono text-muted-foreground text-xs">
                        {trader.rank}
                      </td>

                      {/* Trader & Address */}
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600 }} className="text-foreground">{trader.traderTitle}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {trader.userAddress.slice(0, 8)}...{trader.userAddress.slice(-6)}
                        </div>
                      </td>

                      {/* Fav Market */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="font-mono text-xs text-foreground font-medium">{trader.favoriteSymbol}</span>
                          <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 text-muted-foreground">
                            {trader.favoriteWindow}
                          </Badge>
                        </div>
                      </td>

                      {/* Copilot Synergy */}
                      <td style={{ padding: '10px 14px', textAlign: 'center' }} className="font-mono">
                        <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/30 border-border/50">
                          {trader.copilotSynergyScore}%
                        </Badge>
                      </td>

                      {/* Win Rate */}
                      <td style={{ padding: '10px 14px', textAlign: 'right' }} className="font-mono">
                        <div className="text-foreground font-medium">{trader.winRate}%</div>
                        <div className="text-[10px] text-muted-foreground">{trader.winsCount}W / {trader.lossesCount}L</div>
                      </td>

                      {/* Streak */}
                      <td style={{ padding: '10px 14px', textAlign: 'center' }} className="font-mono text-xs text-muted-foreground">
                        {trader.currentStreak}
                      </td>

                      {/* Realized PnL */}
                      <td style={{ padding: '10px 16px', textAlign: 'right' }} className="font-mono">
                        <div className={cn(
                          "font-semibold",
                          trader.realizedPnl >= 0 ? "text-[#00e676]" : "text-[#ff3366]"
                        )}>
                          {trader.realizedPnl >= 0 ? `+${trader.realizedPnl.toFixed(2)}` : trader.realizedPnl.toFixed(2)} USDC
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          ${trader.volume.toLocaleString()} Vol
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenTraderProfile(trader.userAddress)}
                            className="h-6 text-xs text-muted-foreground hover:text-foreground gap-1 font-normal"
                          >
                            <span>Profile</span>
                            <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleShareTrader(trader)}
                            className="h-6 text-xs text-muted-foreground hover:text-foreground gap-1 font-normal px-2"
                            title="Generate Alpha Card"
                          >
                            <ShareIcon className="w-2.5 h-2.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Proof-of-Alpha Card Generator Modal */}
      <ProofOfAlphaModal
        isOpen={isCardModalOpen}
        onClose={() => {
          setIsCardModalOpen(false);
          setCardModalConfig(null);
        }}
        config={cardModalConfig}
      />
    </div>
  );
};
