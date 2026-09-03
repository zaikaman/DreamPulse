import React from 'react';
import {
  XMarkIcon,
  SparklesIcon,
  BoltIcon,
  ArrowTopRightOnSquareIcon,
  ShareIcon,
  UserPlusIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import type { TraderProfileDetail, ProofOfAlphaCardConfig } from '../../types/index.js';
import { Spinner } from '../ui/Spinner.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { cn } from '../../lib/utils.js';

const SOMNIA_SHANNON_EXPLORER = 'https://shannon-explorer.somnia.network';

interface TraderProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  profile: TraderProfileDetail | null;
  isLoading: boolean;
  onOpenCardModal: (config: ProofOfAlphaCardConfig) => void;
  onToggleCopyTrade: (targetAddress: string, enabled: boolean) => void;
  isCopyTrading: boolean;
  isCopyTradeLoading: boolean;
}

export const TraderProfileDrawer: React.FC<TraderProfileDrawerProps> = ({
  isOpen,
  onClose,
  profile,
  isLoading,
  onOpenCardModal,
  onToggleCopyTrade,
  isCopyTrading,
  isCopyTradeLoading,
}) => {
  if (!isOpen) return null;

  const summary = profile?.summary;

  const handleShareCard = () => {
    if (!summary) return;
    onOpenCardModal({
      cardType: 'TRADER',
      title: `${summary.traderTitle}`,
      subtitle: `Trader Wallet ${summary.userAddress.slice(0, 6)}...${summary.userAddress.slice(-4)} • Rank #${summary.rank}`,
      badge: `${summary.tierBadge} FORECASTER`,
      primaryMetricLabel: 'Realized Net PnL',
      primaryMetricValue: summary.realizedPnl >= 0 ? `+${summary.realizedPnl.toFixed(2)} tUSDC` : `${summary.realizedPnl.toFixed(2)} tUSDC`,
      primaryMetricPositive: summary.realizedPnl >= 0,
      secondaryMetricLabel: 'Prediction Win Rate',
      secondaryMetricValue: `${summary.winRate}% (${summary.winsCount}W / ${summary.lossesCount}L)`,
      accentColor: summary.realizedPnl >= 0 ? '#00ffcc' : '#ff3366',
      walletOrAgentId: summary.userAddress,
      verifiedNetwork: 'Somnia Shannon Testnet',
      sparkline: summary.sparkline,
    });
  };

  // Close on Escape key
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-sm animate-fade-in select-none"
    >
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-lg bg-background border-l border-border/50 shadow-2xl flex flex-col h-full overflow-hidden">
          {/* Drawer Header */}
          <div className="p-4 border-b border-border/50 flex items-center justify-between flex-shrink-0 bg-card/40">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-card border border-border/60 flex items-center justify-center font-mono font-semibold text-xs text-foreground">
                #{summary?.rank || 1}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground tracking-tight">
                    {summary?.traderTitle || 'Forecaster Profile'}
                  </h2>
                  <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 text-muted-foreground bg-secondary/40 border-border/50">
                    {summary?.tierBadge || 'PRO'}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  {summary ? `${summary.userAddress.slice(0, 8)}...${summary.userAddress.slice(-6)}` : 'Loading...'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleShareCard}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Share Trader Card"
              >
                <ShareIcon className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
              >
                <XMarkIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {isLoading ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3">
                <Spinner size="lg" />
                <span className="text-xs text-muted-foreground font-mono">Loading forecaster analytics...</span>
              </div>
            ) : summary ? (
              <>
                {/* 1. Core Performance Matrix */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-lg bg-card/60 border border-border/50">
                    <div className="text-[10px] text-muted-foreground uppercase font-mono">Realized Net PnL</div>
                    <div className={cn(
                      "text-base font-semibold mt-1 font-mono",
                      summary.realizedPnl >= 0 ? "text-[#00e676]" : "text-[#ff3366]"
                    )}>
                      {summary.realizedPnl >= 0 ? `+${summary.realizedPnl.toFixed(2)}` : summary.realizedPnl.toFixed(2)} tUSDC
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">ROI ~{summary.pnlPct}%</div>
                  </div>

                  <div className="p-3 rounded-lg bg-card/60 border border-border/50">
                    <div className="text-[10px] text-muted-foreground uppercase font-mono">Win Rate & Record</div>
                    <div className="text-base font-semibold mt-1 text-foreground font-mono">
                      {summary.winRate}%
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                      {summary.winsCount}W / {summary.lossesCount}L
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-card/60 border border-border/50">
                    <div className="text-[10px] text-muted-foreground uppercase font-mono">Copilot Synergy</div>
                    <div className="text-base font-semibold mt-1 text-foreground font-mono flex items-center gap-1">
                      <BoltIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{summary.copilotSynergyScore}%</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Volt/Oracle signal alignment</div>
                  </div>

                  <div className="p-3 rounded-lg bg-card/60 border border-border/50">
                    <div className="text-[10px] text-muted-foreground uppercase font-mono">Win Streak</div>
                    <div className="text-base font-semibold mt-1 text-foreground font-mono flex items-center gap-1">
                      <SparklesIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{summary.currentStreak} Wins</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">Max Streak: {summary.bestStreak}</div>
                  </div>
                </div>

                {/* 2. Asset Allocation Breakdown */}
                <div className="p-3.5 rounded-lg bg-card/60 border border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-foreground">Asset Volume Allocation</span>
                    <span className="text-[10px] text-muted-foreground font-mono">${(summary?.volume ?? 0).toLocaleString()} Total</span>
                  </div>
                  <div className="space-y-2">
                    {profile.assetDistribution.map((asset) => (
                      <div key={asset.symbol} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-foreground">{asset.symbol}</span>
                          <span className="text-muted-foreground">{asset.percentage}% (${(asset?.volume ?? 0).toLocaleString()})</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-secondary/50 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-muted-foreground/60 transition-all duration-500"
                            style={{ width: `${asset.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Timeframe Horizon Distribution */}
                <div className="p-3.5 rounded-lg bg-card/60 border border-border/50">
                  <span className="text-xs font-semibold text-foreground block mb-2">Preferred Expiry Windows</span>
                  <div className="grid grid-cols-3 gap-2">
                    {profile.timeframeDistribution.map((tf) => (
                      <div key={tf.timeframe} className="p-2.5 rounded-md bg-secondary/30 border border-border/40 text-center">
                        <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 text-muted-foreground border-border/40">
                          {tf.timeframe}
                        </Badge>
                        <div className="text-xs font-semibold text-foreground font-mono mt-1">{tf.percentage}%</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{tf.trades} fills</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Cumulative PnL Equity Curve */}
                <div className="p-3.5 rounded-lg bg-card/60 border border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-foreground">Cumulative Alpha Curve</span>
                    <span className={cn(
                      "text-[10px] font-mono font-medium",
                      summary.realizedPnl >= 0 ? "text-[#00e676]" : "text-[#ff3366]"
                    )}>
                      {summary.realizedPnl >= 0 ? `+${summary.realizedPnl.toFixed(2)}` : summary.realizedPnl.toFixed(2)} tUSDC
                    </span>
                  </div>
                  <div className="h-16 flex items-end gap-1 pt-2">
                    {profile.equityCurve.map((point, idx) => {
                      const maxVal = Math.max(...profile.equityCurve.map((p) => p.cumulativePnl), 1);
                      const minVal = Math.min(...profile.equityCurve.map((p) => p.cumulativePnl), 0);
                      const range = maxVal - minVal || 1;
                      const heightPct = Math.max(10, Math.min(100, ((point.cumulativePnl - minVal) / range) * 100));
                      return (
                        <div
                          key={idx}
                          className="flex-1 flex flex-col items-center gap-1 group relative cursor-pointer"
                        >
                          <div
                            className={cn(
                              "w-full rounded-t transition-all",
                              point.cumulativePnl >= 0 ? "bg-[#00e676]/50 hover:bg-[#00e676]" : "bg-[#ff3366]/50 hover:bg-rose-400"
                            )}
                            style={{ height: `${heightPct}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 5. Recent Predictions History */}
                <div className="p-3.5 rounded-lg bg-card/60 border border-border/50">
                  <span className="text-xs font-semibold text-foreground block mb-2">Recent On-Chain Executions</span>
                  <div className="space-y-1.5">
                    {profile.recentTrades.slice(0, 4).map((trade) => {
                      const pnl = trade.pnl ?? 0;
                      const symbol = trade.marketSnapshot?.symbol || trade.marketId || 'BTC/USD';
                      const windowDuration = trade.marketSnapshot?.windowDuration || '5m';
                      return (
                        <div
                          key={trade.id}
                          className="p-2 rounded-md bg-secondary/30 border border-border/40 flex items-center justify-between text-xs font-mono"
                        >
                          <div className="flex items-center gap-2">
                            <span className={cn("font-bold text-[10px]", trade.direction === 'BUY' ? "text-[#00e676]" : "text-[#ff3366]")}>
                              {trade.direction}
                            </span>
                            <span className="text-foreground">{symbol}</span>
                            <Badge variant="secondary" className="font-mono text-[9px] px-1 py-0 text-muted-foreground">
                              {windowDuration}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn("font-medium", pnl >= 0 ? "text-[#00e676]" : "text-[#ff3366]")}>
                              {pnl >= 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2)} tUSDC
                            </span>
                            {trade.txHash && (
                              <a
                                href={`${SOMNIA_SHANNON_EXPLORER}/tx/${trade.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground"
                                title="View on Explorer"
                              >
                                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {/* Drawer Footer Actions */}
          {summary && (
            <div className="p-3.5 border-t border-border/50 bg-card/40 flex items-center gap-2.5">
              <Button
                variant={isCopyTrading ? "outline" : "default"}
                onClick={() => onToggleCopyTrade(summary.userAddress, !isCopyTrading)}
                disabled={isCopyTradeLoading}
                className={cn(
                  "flex-1 h-8 text-xs font-medium gap-1.5",
                  isCopyTrading && "border-[#ff3366]/40 text-[#ff3366] hover:bg-[#ff3366]/10"
                )}
              >
                {isCopyTradeLoading ? (
                  <Spinner size="sm" />
                ) : isCopyTrading ? (
                  <>
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                    <span>Stop Mirroring</span>
                  </>
                ) : (
                  <>
                    <UserPlusIcon className="w-3.5 h-3.5" />
                    <span>Mirror Forecaster</span>
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={handleShareCard}
                className="h-8 text-xs font-normal text-muted-foreground hover:text-foreground gap-1.5 px-3"
              >
                <ShareIcon className="w-3.5 h-3.5" />
                <span>Share Card</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
