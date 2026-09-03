import React, { useState, useEffect } from 'react';
import {
  ArrowLeftIcon,
  ShareIcon,
  UserPlusIcon,
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
  SparklesIcon,
  BoltIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  ClockIcon,
  CurrencyDollarIcon,
  DocumentDuplicateIcon,
  CheckIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';
import type { TraderProfileDetail, ProofOfAlphaCardConfig, SocialCopyConfig, SessionGrant } from '../../types/index.js';
import { apiClient } from '../../services/api.js';
import { ProofOfAlphaModal } from './ProofOfAlphaModal.js';
import { SocialCopyRiskModal } from './SocialCopyRiskModal.js';
import { Spinner } from '../ui/Spinner.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { cn } from '../../lib/utils.js';

const SOMNIA_SHANNON_EXPLORER = 'https://shannon-explorer.somnia.network';

export interface TraderProfileViewProps {
  wallet?: any;
  activeSession?: SessionGrant | null;
  targetAddress: string | null;
  onBack: () => void;
  onConnectWallet?: () => Promise<void>;
  onOpenSessionModal?: (options?: { revoke?: boolean }) => void;
}

export const TraderProfileView: React.FC<TraderProfileViewProps> = ({
  wallet,
  activeSession,
  targetAddress,
  onBack,
  onConnectWallet,
  onOpenSessionModal,
}) => {
  const address = targetAddress || wallet?.address || '';
  const [profile, setProfile] = useState<TraderProfileDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<boolean>(false);

  // Copy-Trading State
  const [isCopyTrading, setIsCopyTrading] = useState<boolean>(false);
  const [copyConfig, setCopyConfig] = useState<SocialCopyConfig | null>(null);
  const [isCopyTradeLoading, setIsCopyTradeLoading] = useState<boolean>(false);
  const [copyTradeStatusMsg, setCopyTradeStatusMsg] = useState<string | null>(null);

  // Social Copy Risk Modal State
  const [isRiskModalOpen, setIsRiskModalOpen] = useState<boolean>(false);

  // Proof-of-Alpha Card Modal State
  const [isCardModalOpen, setIsCardModalOpen] = useState<boolean>(false);
  const [cardModalConfig, setCardModalConfig] = useState<ProofOfAlphaCardConfig | null>(null);

  // Fetch trader profile details
  useEffect(() => {
    if (!address) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    apiClient
      .getTraderProfile(address)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          setProfile(res.data);
        } else {
          setError('Failed to load trader profile data.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Network error loading profile.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    // Check current social copy-trading status for this specific forecaster
    if (wallet?.address && address) {
      apiClient
        .getSocialCopyTradeStatus(wallet.address, address)
        .then((res) => {
          if (isMounted && res.success) {
            setIsCopyTrading(Boolean(res.isCopying));
            setCopyConfig(res.config || null);
          }
        })
        .catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [address, wallet?.address]);

  // Copy wallet address to clipboard
  const handleCopyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  // Open Risk Configuration Modal
  const handleOpenRiskModal = () => {
    if (!wallet?.isConnected) {
      if (onConnectWallet) onConnectWallet();
      return;
    }

    if (wallet?.address && address && wallet.address.toLowerCase() === address.toLowerCase()) {
      setCopyTradeStatusMsg('Cannot mirror your own forecaster wallet.');
      return;
    }

    setIsRiskModalOpen(true);
  };

  // Confirm Copy-Trading Risk & Position Sizing
  const handleConfirmRisk = async (params: {
    targetAddress: string;
    enabled: boolean;
    maxTradeSize: number;
    dailyVolumeCap: number;
  }) => {
    setIsCopyTradeLoading(true);
    setCopyTradeStatusMsg(null);
    try {
      const res = await apiClient.toggleSocialCopyTrade({
        userAddress: wallet.address,
        targetAddress: params.targetAddress,
        enabled: true,
        maxTradeSize: params.maxTradeSize,
        dailyVolumeCap: params.dailyVolumeCap,
      });

      if (res.success) {
        setIsCopyTrading(true);
        setCopyConfig(res.config || null);
        setCopyTradeStatusMsg(
          `Autonomous mirror active (Max $${params.maxTradeSize} tUSDC / $${params.dailyVolumeCap} Daily Cap)`
        );
      } else {
        setCopyTradeStatusMsg(res.message || 'Failed to update copy-trading preferences.');
      }
    } catch (err) {
      setCopyTradeStatusMsg(err instanceof Error ? err.message : 'Error updating copy-trade settings.');
    } finally {
      setIsCopyTradeLoading(false);
    }
  };

  // Stop Mirroring
  const handleStopMirror = async (targetAddr: string) => {
    setIsCopyTradeLoading(true);
    setCopyTradeStatusMsg(null);
    try {
      const res = await apiClient.toggleSocialCopyTrade({
        userAddress: wallet.address,
        targetAddress: targetAddr,
        enabled: false,
      });

      if (res.success) {
        setIsCopyTrading(false);
        setCopyConfig(null);
        setCopyTradeStatusMsg(
          `Mirror trading stopped for Forecaster ${targetAddr.slice(0, 6)}...${targetAddr.slice(-4)}`
        );
      } else {
        setCopyTradeStatusMsg(res.message || 'Failed to stop copy-trading.');
      }
    } catch (err) {
      setCopyTradeStatusMsg(err instanceof Error ? err.message : 'Error stopping mirror trading.');
    } finally {
      setIsCopyTradeLoading(false);
    }
  };

  // Open Proof-of-Alpha Card Modal
  const handleShareCard = () => {
    if (!summary) return;
    setCardModalConfig({
      cardType: 'TRADER',
      title: summary.traderTitle,
      subtitle: `Forecaster ${summary.userAddress.slice(0, 6)}...${summary.userAddress.slice(-4)} • Rank #${summary.rank}`,
      badge: `${summary.tierBadge} FORECASTER`,
      primaryMetricLabel: 'Realized Net PnL',
      primaryMetricValue: summary.realizedPnl >= 0 ? `+${summary.realizedPnl.toFixed(2)} tUSDC` : `${summary.realizedPnl.toFixed(2)} tUSDC`,
      primaryMetricPositive: summary.realizedPnl >= 0,
      secondaryMetricLabel: 'Prediction Win Rate',
      secondaryMetricValue: `${summary.winRate}% (${summary.winsCount}W / ${summary.lossesCount}L)`,
      accentColor: '#00ffcc',
      walletOrAgentId: summary.userAddress,
      verifiedNetwork: 'Somnia Shannon Testnet',
      sparkline: summary.sparkline,
    });
    setIsCardModalOpen(true);
  };

  const summary = profile?.summary;

  return (
    <div className="flex flex-col w-full min-h-0 flex-1 overflow-y-auto gap-3.5 select-none pb-8 animate-fade-in">
      {/* 1. Navigation & Identity Header */}
      <div className="terminal-panel p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5 font-mono px-3"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            <span>Back to Arena</span>
          </Button>

          <div className="h-5 w-px bg-border/60" />

          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00e676] animate-pulse" />
              <h2 className="text-sm font-bold text-foreground tracking-tight font-mono">
                {summary?.traderTitle || `Forecaster ${address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Profile'}`}
              </h2>
              {summary && (
                <Badge variant="outline" className="font-mono text-[10px] px-2 py-0 text-foreground bg-secondary/50 border-border/70 font-semibold">
                  RANK #{summary.rank} • {summary.tierBadge}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground font-mono">
              <span>Wallet: {address}</span>
              <button
                type="button"
                onClick={handleCopyAddress}
                className="hover:text-foreground transition-colors inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-secondary/40 px-1.5 py-0.5 rounded border border-border/40"
                title="Copy full address"
              >
                {copiedAddress ? <CheckIcon className="w-2.5 h-2.5 text-[#00e676]" /> : <DocumentDuplicateIcon className="w-2.5 h-2.5" />}
                <span>{copiedAddress ? 'Copied' : 'Copy'}</span>
              </button>
              <span>•</span>
              <a
                href={`${SOMNIA_SHANNON_EXPLORER}/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors inline-flex items-center gap-1 text-[10px] text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2"
              >
                <span>Somnia Explorer</span>
                <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {copyTradeStatusMsg && (
            <span className="text-xs font-mono text-[#00e676] bg-[#00e676]/10 border border-[#00e676]/20 px-2.5 py-1 rounded-md">
              {copyTradeStatusMsg}
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleShareCard}
            disabled={!summary}
            className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5 font-mono px-3"
          >
            <ShareIcon className="w-3.5 h-3.5" />
            <span>Share Alpha Card</span>
          </Button>

          <div className="flex items-center gap-1.5">
            <Button
              variant={isCopyTrading ? "outline" : "default"}
              size="sm"
              onClick={handleOpenRiskModal}
              disabled={isCopyTradeLoading || !address}
              className={cn(
                "h-8 text-xs font-medium gap-1.5 font-mono px-3 cursor-pointer",
                isCopyTrading
                  ? "border-[#00e676]/40 text-[#00e676] hover:bg-[#00e676]/10"
                  : "bg-[#00e676] text-black hover:bg-[#00c853] font-semibold"
              )}
            >
              {isCopyTradeLoading ? (
                <Spinner size="sm" />
              ) : isCopyTrading ? (
                <>
                  <CheckCircleIcon className="w-3.5 h-3.5 text-[#00e676]" />
                  <span>Mirroring (${copyConfig?.maxTradeSize ?? 50} Max)</span>
                </>
              ) : (
                <>
                  <UserPlusIcon className="w-3.5 h-3.5" />
                  <span>Mirror Forecaster</span>
                </>
              )}
            </Button>

            {isCopyTrading && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenRiskModal}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-[#00ffcc] hover:bg-[#00ffcc]/10 border-border/60 rounded-lg cursor-pointer"
                title="Adjust Risk Limits & Position Sizing"
              >
                <AdjustmentsHorizontalIcon className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="terminal-panel h-96 flex flex-col items-center justify-center gap-3">
          <Spinner size="lg" />
          <span className="text-xs text-muted-foreground font-mono">Loading verified on-chain forecaster metrics...</span>
        </div>
      ) : error ? (
        <div className="terminal-panel p-8 text-center text-[#ff3366] font-mono text-xs">
          {error}
        </div>
      ) : summary ? (
        <>
          {/* 2. Top KPI Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* Realized Net PnL */}
            <div className="terminal-panel p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[10px] font-mono uppercase tracking-wider">Realized Net PnL</span>
                <CurrencyDollarIcon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="mt-2 font-mono">
                <div className={cn(
                  "text-xl font-bold tracking-tight",
                  summary.realizedPnl >= 0 ? "text-[#00e676]" : "text-[#ff3366]"
                )}>
                  {summary.realizedPnl >= 0 ? `+${summary.realizedPnl.toFixed(2)}` : summary.realizedPnl.toFixed(2)} tUSDC
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  ROI ~{summary.pnlPct}% of total volume
                </div>
              </div>
            </div>

            {/* Win Rate & Record */}
            <div className="terminal-panel p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[10px] font-mono uppercase tracking-wider">Win Rate & Track Record</span>
                <ChartBarIcon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="mt-2 font-mono">
                <div className="text-xl font-bold text-foreground">
                  {summary.winRate}%
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {summary.winsCount} Wins • {summary.lossesCount} Losses
                </div>
              </div>
            </div>

            {/* Total Trading Volume */}
            <div className="terminal-panel p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[10px] font-mono uppercase tracking-wider">Cumulative Volume</span>
                <ShieldCheckIcon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="mt-2 font-mono">
                <div className="text-xl font-bold text-foreground">
                  ${summary.volume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {summary.tradesCount} total filled orders
                </div>
              </div>
            </div>

            {/* Copilot Synergy & Streak */}
            <div className="terminal-panel p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[10px] font-mono uppercase tracking-wider">Copilot Synergy & Streak</span>
                <BoltIcon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="mt-2 font-mono">
                <div className="text-xl font-bold text-foreground flex items-center gap-1.5">
                  <span>{summary.copilotSynergyScore}%</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    ({summary.currentStreak} streak)
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Max Streak: {summary.bestStreak} consecutive wins
                </div>
              </div>
            </div>
          </div>

          {/* 3. Main Grid: Left Column (Alpha Curve & Executions) + Right Column (Asset Breakdown & Quant DNA) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
            {/* LEFT COLUMN: Alpha Curve + Recent Executions (7 cols) */}
            <div className="lg:col-span-7 flex flex-col gap-3.5">
              {/* Cumulative Alpha Curve */}
              <div className="terminal-panel p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono">
                      Cumulative Alpha Curve
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      (Settled On-Chain PnL)
                    </span>
                  </div>
                  <span className={cn(
                    "text-xs font-mono font-semibold",
                    summary.realizedPnl >= 0 ? "text-[#00e676]" : "text-[#ff3366]"
                  )}>
                    {summary.realizedPnl >= 0 ? `+${summary.realizedPnl.toFixed(2)}` : summary.realizedPnl.toFixed(2)} tUSDC Total
                  </span>
                </div>

                {/* SVG Line / Bar Chart Representation */}
                <div className="h-44 w-full pt-4 pb-2 flex flex-col justify-between">
                  <div className="h-32 flex items-end gap-1.5 w-full">
                    {profile.equityCurve.map((point, idx) => {
                      const allPnls = profile.equityCurve.map((p) => p.cumulativePnl);
                      const maxVal = Math.max(...allPnls, 1);
                      const minVal = Math.min(...allPnls, 0);
                      const range = maxVal - minVal || 1;
                      const heightPct = Math.max(12, Math.min(100, ((point.cumulativePnl - minVal) / range) * 100));

                      return (
                        <div
                          key={idx}
                          className="flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer"
                        >
                          {/* Tooltip */}
                          <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                            <div className="bg-slate-900 border border-border/80 text-foreground text-[10px] font-mono px-2 py-1 rounded shadow-xl whitespace-nowrap">
                              <span className="text-muted-foreground">{point.date}: </span>
                              <span className={point.cumulativePnl >= 0 ? "text-[#00e676] font-semibold" : "text-[#ff3366] font-semibold"}>
                                {point.cumulativePnl >= 0 ? `+${point.cumulativePnl.toFixed(2)}` : point.cumulativePnl.toFixed(2)} tUSDC
                              </span>
                            </div>
                          </div>

                          <div
                            className={cn(
                              "w-full rounded-t transition-all duration-300",
                              point.cumulativePnl >= 0
                                ? "bg-[#00e676]/40 group-hover:bg-[#00e676]"
                                : "bg-[#ff3366]/40 group-hover:bg-rose-400"
                            )}
                            style={{ height: `${heightPct}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* X-Axis labels */}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono border-t border-border/40 pt-1.5">
                    <span>{profile.equityCurve[0]?.date || 'Start'}</span>
                    <span>{profile.equityCurve[Math.floor(profile.equityCurve.length / 2)]?.date || 'Mid'}</span>
                    <span>{profile.equityCurve[profile.equityCurve.length - 1]?.date || 'Current'}</span>
                  </div>
                </div>
              </div>

              {/* Recent On-Chain Executions Table */}
              <div className="terminal-panel p-0 overflow-hidden">
                <div className="p-3.5 border-b border-border/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono">
                      Recent On-Chain Executions
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      ({profile.recentTrades.length} recorded)
                    </span>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr className="border-b border-border/60 text-muted-foreground text-[10px] font-mono uppercase tracking-wider" style={{ background: 'transparent', textAlign: 'left' }}>
                        <th style={{ padding: '8px 14px', fontWeight: 500 }}>TIME</th>
                        <th style={{ padding: '8px 14px', fontWeight: 500 }}>MARKET & WINDOW</th>
                        <th style={{ padding: '8px 14px', fontWeight: 500 }}>SIDE & OUTCOME</th>
                        <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500 }}>STAKE</th>
                        <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500 }}>REALIZED PNL</th>
                        <th style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 500 }}>TX</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.recentTrades.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: '24px', textAlign: 'center' }} className="text-muted-foreground font-mono text-xs">
                            No recent on-chain executions recorded for this forecaster yet.
                          </td>
                        </tr>
                      ) : (
                        profile.recentTrades.map((trade) => {
                          const pnl = trade.pnl ?? 0;
                          const symbol = trade.marketSnapshot?.symbol || trade.marketId || 'BTC/USD';
                          const windowDuration = trade.marketSnapshot?.windowDuration || '5m';
                          const timeStr = trade.createdAt ? new Date(trade.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent';

                          return (
                            <tr key={trade.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors font-mono">
                              <td style={{ padding: '8px 14px' }} className="text-muted-foreground">
                                {timeStr}
                              </td>
                              <td style={{ padding: '8px 14px' }}>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-foreground font-medium">{symbol}</span>
                                  <Badge variant="secondary" className="font-mono text-[9px] px-1 py-0 text-muted-foreground">
                                    {windowDuration}
                                  </Badge>
                                </div>
                              </td>
                              <td style={{ padding: '8px 14px' }}>
                                <div className="flex items-center gap-1.5">
                                  <span className={cn("text-[10px] font-bold", trade.direction === 'BUY' ? "text-[#00e676]" : "text-[#ff3366]")}>
                                    {trade.direction}
                                  </span>
                                  <Badge variant="outline" className="font-mono text-[9px] px-1 py-0 text-muted-foreground border-border/50">
                                    {trade.outcome}
                                  </Badge>
                                </div>
                              </td>
                              <td style={{ padding: '8px 14px', textAlign: 'right' }} className="text-foreground">
                                ${trade.totalCost ? trade.totalCost.toFixed(2) : '10.00'}
                              </td>
                              <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                                {trade.isSettled ? (
                                  <span className={cn("font-medium", pnl >= 0 ? "text-[#00e676]" : "text-[#ff3366]")}>
                                    {pnl >= 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2)} tUSDC
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-[10px]">OPEN / PENDING</span>
                                )}
                              </td>
                              <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                                {trade.txHash ? (
                                  <a
                                    href={`${SOMNIA_SHANNON_EXPLORER}/tx/${trade.txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center"
                                    title="View Somnia Shannon Explorer"
                                  >
                                    <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground text-[10px]">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Allocations, Horizon Preferences, Strategy DNA (5 cols) */}
            <div className="lg:col-span-5 flex flex-col gap-3.5">
              {/* Asset Volume Breakdown */}
              <div className="terminal-panel p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono">
                    Asset Volume Breakdown
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    ${summary.volume.toLocaleString()} Total
                  </span>
                </div>

                <div className="space-y-2.5 pt-1">
                  {profile.assetDistribution.map((asset) => (
                    <div key={asset.symbol} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-foreground font-medium">{asset.symbol}</span>
                        <span className="text-muted-foreground">
                          {asset.percentage}% (${asset.volume.toLocaleString()})
                        </span>
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

              {/* Preferred Expiry Horizons */}
              <div className="terminal-panel p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono">
                    Horizon & Expiry Distribution
                  </span>
                  <ClockIcon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  {profile.timeframeDistribution.map((tf) => (
                    <div key={tf.timeframe} className="p-2.5 rounded-lg bg-secondary/30 border border-border/40 text-center">
                      <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 text-muted-foreground border-border/40">
                        {tf.timeframe}
                      </Badge>
                      <div className="text-sm font-bold text-foreground font-mono mt-1">{tf.percentage}%</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{tf.trades} fills</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quant DNA & Behavioral Edge */}
              <div className="terminal-panel p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono">
                    Forecaster Strategy DNA
                  </span>
                  <SparklesIcon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>

                <div className="space-y-2 text-xs font-mono pt-1">
                  <div className="flex items-center justify-between p-2 rounded bg-secondary/20 border border-border/30">
                    <span className="text-muted-foreground">Favorite Market</span>
                    <span className="text-foreground font-semibold">{summary.favoriteSymbol} • {summary.favoriteWindow}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-secondary/20 border border-border/30">
                    <span className="text-muted-foreground">Profit Factor</span>
                    <span className="text-[#00e676] font-semibold">
                      {summary.lossesCount > 0 ? (summary.winsCount / summary.lossesCount).toFixed(2) : `${summary.winsCount}.00`}x
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-secondary/20 border border-border/30">
                    <span className="text-muted-foreground">Network Settlement</span>
                    <span className="text-foreground">Somnia Shannon Testnet</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* Proof-of-Alpha Card Generator Modal */}
      <ProofOfAlphaModal
        isOpen={isCardModalOpen}
        onClose={() => {
          setIsCardModalOpen(false);
          setCardModalConfig(null);
        }}
        config={cardModalConfig}
      />

      {/* Social Copy Risk & Position Size Modal */}
      <SocialCopyRiskModal
        isOpen={isRiskModalOpen}
        onClose={() => setIsRiskModalOpen(false)}
        trader={summary || { userAddress: address }}
        existingConfig={copyConfig}
        isCurrentlyMirroring={isCopyTrading}
        isLoading={isCopyTradeLoading}
        onConfirm={handleConfirmRisk}
        onStopMirroring={handleStopMirror}
        hasActiveSession={Boolean(activeSession && activeSession.isActive && new Date(activeSession.expiresAt).getTime() > Date.now())}
        onOpenSessionModal={onOpenSessionModal ? () => onOpenSessionModal() : undefined}
      />
    </div>
  );
};
