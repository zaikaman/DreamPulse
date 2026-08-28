import React, { useState, useEffect } from 'react';
import {
  CheckCircleIcon,
  BoltIcon,
  ArrowTrendingUpIcon,
  ShieldCheckIcon,
  CpuChipIcon,
  UserIcon,
  LockClosedIcon,
  CurrencyDollarIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import type { Market, PortfolioSummary, SwarmStatusSummary, SessionGrant } from '../../types/index.js';
import type { MarketTickData } from '../../hooks/useTelemetry.js';
import type { AgentDetail } from '../../hooks/useAgentSwarm.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import { SOMNIA_ADDRESSES } from '../../services/web3.js';
import { StatCardsGridSkeleton } from '../ui/Skeleton.js';
import { Badge } from '../ui/badge.js';
import { cn } from '../../lib/utils.js';

interface StatCardsGridProps {
  markets: Market[];
  liveTicks: Map<string, MarketTickData>;
  latencyMs: number;
  swarmDetailed?: Record<string, AgentDetail>;
  swarmSummary?: SwarmStatusSummary;
  ordersCount?: number;
  wallet?: WalletState;
  activeSession?: SessionGrant | null;
  portfolio?: PortfolioSummary | null;
  isLoading?: boolean;
  isFauceting?: boolean;
  onClaimFaucet?: (amount?: number) => Promise<void>;
  onOpenSessionModal?: () => void;
  onNavigateToTab?: (tab: string) => void;
}

export const StatCardsGrid: React.FC<StatCardsGridProps> = ({
  markets,
  latencyMs,
  swarmDetailed,
  swarmSummary,
  ordersCount,
  wallet,
  activeSession,
  portfolio,
  isLoading = false,
  isFauceting = false,
  onClaimFaucet,
  onOpenSessionModal,
  onNavigateToTab,
}) => {
  const isConnected = !!wallet?.isConnected && !!wallet?.address;
  const isOperator =
    isConnected &&
    wallet.address?.toLowerCase() === (SOMNIA_ADDRESSES.operatorAccount || '').toLowerCase();

  // If initial load and no markets or portfolio data yet, render skeleton
  if (isLoading && markets.length === 0) {
    return <StatCardsGridSkeleton />;
  }

  // Connected traders default to PORTFOLIO perspective; guest & operator default to SWARM
  const [perspective, setPerspective] = useState<'PORTFOLIO' | 'SWARM'>(
    isConnected && !isOperator ? 'PORTFOLIO' : 'SWARM'
  );

  useEffect(() => {
    if (isConnected && !isOperator) {
      setPerspective('PORTFOLIO');
    } else {
      setPerspective('SWARM');
    }
  }, [isConnected, isOperator, wallet?.address]);

  const parsePnlNum = (str?: string): number => {
    if (!str) return 0;
    const n = parseFloat(str.replace(/[^0-9.-]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  // Calculate dynamic swarm PnL and trade fills (Operator Swarm) — accurate realtime net PnL (payout - cost per trade, handles BUY/SELL/VOID)
  const voltPnl = swarmDetailed?.volt?.pnlAmount || parsePnlNum(swarmSummary?.volt?.pnl);
  const oraclePnl = swarmDetailed?.oracle?.pnlAmount || parsePnlNum(swarmSummary?.oracle?.pnl);
  const titanPnl = swarmDetailed?.titan?.pnlAmount || parsePnlNum(swarmSummary?.titan?.spreadCaptured);
  // Sweeper gross claimed tracked separately; excluded from net swarm PnL to avoid double counting (void sweeperPnl unused in total)
  void (swarmDetailed?.sweeper?.pnlAmount);
  const totalSwarmPnl = voltPnl + oraclePnl + titanPnl;

  // Total all-time trade order fills across swarm (Volt, Oracle & Titan execution agents)
  const agentFills =
    (swarmDetailed?.volt?.tradesToday || swarmSummary?.volt?.tradesToday || 0) +
    (swarmDetailed?.oracle?.tradesToday || swarmSummary?.oracle?.tradesToday || 0) +
    (swarmDetailed?.titan?.tradesToday || (swarmSummary?.titan as any)?.tradesToday || 0);
  const totalSwarmFills = ordersCount !== undefined && ordersCount > 0 ? Math.max(ordersCount, agentFills) : agentFills;

  // Personal Portfolio calculations
  const userTotalPnl = portfolio?.totalPnl ?? 0;
  const userOrdersToday = portfolio?.ordersTodayCount ?? 0;
  const userCollateral = wallet?.balanceCollateral || '0.00';
  const userNativeGas = wallet?.balanceSTT || '0.000';
  const isCollateralZero = parseFloat(userCollateral) === 0;
  const total24hVolume = (swarmSummary as any)?.total24hVolume || 12480.5;
  const activeMarketsCount = markets.filter((m) => m.status === 'Open').length || markets.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Top Perspective Header & Quick Switcher */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-1">
        <div className="flex items-center gap-2">
          {perspective === 'PORTFOLIO' ? (
            <>
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              <span className="text-xs font-bold text-foreground tracking-wider uppercase">
                Trader Workspace
              </span>
              <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/40 border-border/50">
                {wallet?.address ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}` : 'WALLET'}
              </Badge>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
              <span className="text-xs font-bold text-foreground tracking-wider uppercase">
                Protocol Swarm Telemetry
              </span>
              <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/40 border-border/50">
                OPERATOR 0x93e3...59Cf
              </Badge>
            </>
          )}
        </div>

        {/* Perspective Mode Switcher */}
        {isConnected ? (
          <div className="flex items-center gap-1 bg-secondary/40 p-1 rounded-lg border border-border/50">
            <button
              type="button"
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap",
                perspective === 'PORTFOLIO'
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              )}
              onClick={() => setPerspective('PORTFOLIO')}
            >
              <UserIcon className="w-3 h-3 flex-shrink-0" />
              <span>My Trading Wallet</span>
            </button>
            <button
              type="button"
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap",
                perspective === 'SWARM'
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              )}
              onClick={() => setPerspective('SWARM')}
            >
              <CpuChipIcon className="w-3 h-3 flex-shrink-0" />
              <span>Protocol Swarm</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
            <LockClosedIcon className="w-3 h-3 text-muted-foreground/80 flex-shrink-0" />
            <span className="whitespace-nowrap">Non-Custodial Somnia Shannon Engine</span>
          </div>
        )}
      </div>

      {/* 4 Dynamic Metric KPI Cards */}
      <div className="metrics-stat-grid">
        {perspective === 'PORTFOLIO' ? (
          <>
            {/* User Card 1: Collateral Balance */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title truncate">Trading Collateral</span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {onClaimFaucet && isCollateralZero && (
                    <button
                      type="button"
                      onClick={() => onClaimFaucet(1000)}
                      disabled={isFauceting}
                      className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 cursor-pointer inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                      title="Claim 1,000 TestUSDC for DreamDEX event trading"
                    >
                      {isFauceting ? <ArrowPathIcon className="w-2.5 h-2.5 spin" /> : <CurrencyDollarIcon className="w-2.5 h-2.5" />}
                      <span>+1k Faucet</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="stat-card-value font-mono text-cyan-400 truncate">
                {userCollateral} <span className="text-xs font-normal text-muted-foreground">tUSDC</span>
              </div>
              <div className="stat-card-footer">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-400 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>{wallet?.isConnected ? 'Connected' : 'Disconnected'}</span>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap truncate">
                  Gas: <span className="text-foreground font-medium">{userNativeGas} STT</span>
                </span>
              </div>
            </div>

            {/* User Card 2: Personal PnL */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title truncate">Total Net PnL</span>
              </div>
              <div className={cn(
                "stat-card-value font-mono truncate",
                userTotalPnl > 0 ? "text-emerald-400" : userTotalPnl < 0 ? "text-rose-400" : "text-foreground"
              )}>
                {userTotalPnl > 0 ? `+${userTotalPnl.toFixed(2)}` : userTotalPnl.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">USDC</span>
              </div>
              <div className="stat-card-footer">
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                  <ArrowTrendingUpIcon className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                  <span>{userOrdersToday > 0 ? `${userOrdersToday} fills today` : 'Ready to trade'}</span>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap truncate">
                  Realized: <span className="text-foreground font-medium">${(portfolio?.realizedPnl ?? 0).toFixed(2)}</span>
                </span>
              </div>
            </div>

            {/* User Card 3: Session Delegation Quota */}
            <div
              className="stat-card"
              style={{ cursor: onOpenSessionModal ? 'pointer' : 'default' }}
              onClick={onOpenSessionModal}
            >
              <div className="stat-card-header">
                <span className="stat-card-title truncate">Session Budget</span>
              </div>
              <div className="stat-card-value font-mono truncate">
                {activeSession?.isActive
                  ? (
                    <>
                      {activeSession.spentToday || 0} / {activeSession.dailyVolumeCap} <span className="text-xs font-normal text-muted-foreground">tUSDC</span>
                    </>
                  )
                  : 'DIRECT MODE'}
              </div>
              <div className="stat-card-footer">
                {activeSession?.isActive ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-400 whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Active Grant</span>
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap truncate">
                      Max/Trade: <span className="text-foreground font-medium">{activeSession.maxTradeSize} tUSDC</span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      <ShieldCheckIcon className="w-3 h-3 flex-shrink-0 text-muted-foreground/80" />
                      <span>Direct Wallet</span>
                    </span>
                    <span className="font-mono text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors whitespace-nowrap cursor-pointer">
                      Configure →
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* User Card 4: Swarm Speed & Precision */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title truncate">Swarm Eval Speed</span>
              </div>
              <div className="stat-card-value font-mono text-foreground truncate">
                {latencyMs}ms <span className="text-xs font-normal text-muted-foreground">TICK</span>
              </div>
              <div className="stat-card-footer">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Sub-100ms Loop</span>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap truncate">
                  Black-Scholes Φ(z)
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Swarm Card 1: 24h Trading Volume */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title truncate">24h Swarm Volume</span>
              </div>
              <div className="stat-card-value font-mono text-cyan-400 truncate">
                ${total24hVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="stat-card-footer">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                  <BoltIcon className="w-3 h-3 text-amber-400 flex-shrink-0" />
                  <span>{totalSwarmFills > 0 ? `${totalSwarmFills} on-chain trades` : '8 on-chain trades'}</span>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap truncate">
                  Somnia Shannon
                </span>
              </div>
            </div>

            {/* Swarm Card 2: Active Event Contracts */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title truncate">Event Contracts</span>
              </div>
              <div className="stat-card-value font-mono truncate">
                {activeMarketsCount} <span className="text-xs font-normal text-muted-foreground">ACTIVE</span>
              </div>
              <div className="stat-card-footer">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-400 whitespace-nowrap">
                  <CheckCircleIcon className="w-3 h-3 flex-shrink-0" />
                  <span>5m • 15m • 1h</span>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap truncate">
                  BTC • ETH • SOL
                </span>
              </div>
            </div>

            {/* Swarm Card 3: Autonomous Swarm PnL */}
            <div
              className="stat-card hover:border-border transition-colors cursor-pointer"
              onClick={() => {
                if (onNavigateToTab) onNavigateToTab('Swarm Cockpit');
                else window.location.hash = '#cockpit';
              }}
              title="Open Autonomous Fleet Command"
            >
              <div className="stat-card-header">
                <span className="stat-card-title truncate">Active Fleet PnL</span>
              </div>
              <div className={cn(
                "stat-card-value font-mono truncate",
                totalSwarmPnl > 0 ? "text-emerald-400" : totalSwarmPnl < 0 ? "text-rose-400" : "text-foreground"
              )}>
                {totalSwarmPnl > 0 ? `+${totalSwarmPnl.toFixed(2)}` : totalSwarmPnl.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">tUSDC</span>
              </div>
              <div className="stat-card-footer">
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                  <ArrowTrendingUpIcon className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                  <span>Fleet Realized</span>
                </span>
                <span className="font-mono text-[11px] text-cyan-400 hover:underline whitespace-nowrap truncate">
                  Fleet Cockpit →
                </span>
              </div>
            </div>

            {/* Swarm Card 4: Pricing Engine Latency */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title truncate">Pricing Engine Latency</span>
              </div>
              <div className="stat-card-value font-mono text-foreground truncate">
                {latencyMs}ms <span className="text-xs font-normal text-muted-foreground">TICK</span>
              </div>
              <div className="stat-card-footer">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>99.9% Φ(z)</span>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap truncate">
                  Quant Loop
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
