import React, { useState, useEffect } from 'react';
import {
  Layers,
  CheckCircle,
  Zap,
  AlertTriangle,
  TrendingUp,
  Gauge,
  Cpu,
  Wallet,
  ShieldCheck,
  Activity,
  User,
  Bot,
  Lock,
  Coins,
  Loader2,
} from 'lucide-react';
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
  liveTicks,
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

  // Find highest anomaly edge
  let maxEdge = 0;
  let maxEdgeSymbol = 'BTC/USD';
  let maxEdgeWindow = '5m';

  for (const m of markets) {
    const tick = liveTicks.get(m.id);
    const edge = Math.abs(tick?.edge ?? m.edgePercentage);
    if (edge > maxEdge) {
      maxEdge = edge;
      maxEdgeSymbol = m.symbol;
      maxEdgeWindow = m.windowDuration;
    }
  }

  const activeCount = markets.filter((m) => {
    const tick = liveTicks.get(m.id);
    const timeLeft = tick?.timeLeftSeconds ?? Math.max(0, Math.floor((new Date(m.closeTimestamp).getTime() - Date.now()) / 1000));
    return m.status === 'Open' || timeLeft > 0;
  }).length;

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
  const userActivePositions = portfolio?.activePositionsCount ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Top Perspective Header & Quick Switcher */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-1">
        <div className="flex items-center gap-2">
          {perspective === 'PORTFOLIO' ? (
            <>
              <div className="size-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs font-semibold text-foreground tracking-wide">
                MY TRADER WORKSPACE & PERFORMANCE
              </span>
              <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/40 border-border/50">
                {wallet?.address ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}` : 'WALLET'}
              </Badge>
            </>
          ) : (
            <>
              <div className="size-1.5 rounded-full bg-amber-400" />
              <span className="text-xs font-semibold text-foreground tracking-wide">
                SOMNIA PROTOCOL SWARM TELEMETRY
              </span>
              <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/40 border-border/50">
                OPERATOR 0x93e3...59Cf
              </Badge>
            </>
          )}
        </div>

        {/* Perspective Mode Switcher */}
        {isConnected ? (
          <div className="flex items-center gap-1 bg-secondary/40 p-0.5 rounded-lg border border-border/50">
            <button
              type="button"
              onClick={() => setPerspective('PORTFOLIO')}
              className={cn(
                "px-2.5 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 font-medium cursor-pointer",
                perspective === 'PORTFOLIO'
                  ? "bg-card text-foreground font-semibold shadow-2xs border border-border/70"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <User size={12} />
              <span>My Portfolio</span>
            </button>
            <button
              type="button"
              onClick={() => setPerspective('SWARM')}
              className={cn(
                "px-2.5 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 font-medium cursor-pointer",
                perspective === 'SWARM'
                  ? "bg-card text-foreground font-semibold shadow-2xs border border-border/70"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Bot size={12} />
              <span>Protocol Swarm</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
            <Lock size={12} />
            <span>Connect wallet to inspect personal PnL & margins</span>
          </div>
        )}
      </div>

      {/* 4 Dynamic Metric KPI Cards */}
      <div className="metrics-stat-grid">
        {perspective === 'PORTFOLIO' ? (
          <>
            {/* User Card 1: Balance & Collateral */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title">MY TRADING BALANCE</span>
                <div className="flex items-center gap-1.5">
                  {parseFloat(wallet?.balanceCollateral || '0') === 0 && onClaimFaucet && (
                    <button
                      type="button"
                      onClick={() => onClaimFaucet(1000)}
                      disabled={isFauceting}
                      className="px-2 py-0.5 text-[10px] font-mono rounded bg-secondary/80 text-foreground border border-border/60 hover:bg-secondary cursor-pointer inline-flex items-center gap-1 transition-colors"
                    >
                      {isFauceting ? <Loader2 size={10} className="spin" /> : <Coins size={10} />}
                      <span>+1k tUSDC</span>
                    </button>
                  )}
                  <Wallet size={15} className="stat-card-icon text-muted-foreground" />
                </div>
              </div>
              <div className="stat-card-value font-mono">
                {wallet?.balanceCollateral || '0.00'} tUSDC
              </div>
              <div className="stat-card-footer">
                <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/30 border-border/50 gap-1">
                  <CheckCircle size={10} className="text-emerald-400" />
                  <span>NON-CUSTODIAL</span>
                </Badge>
                <span className="text-[11px] font-mono text-muted-foreground">{wallet?.balanceSTT || '0.00'} STT Native Gas</span>
              </div>
            </div>

            {/* User Card 2: Personal PnL */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title">MY TOTAL PnL</span>
                <TrendingUp
                  size={15}
                  className="stat-card-icon text-muted-foreground"
                />
              </div>
              <div className={cn(
                "stat-card-value font-mono",
                userTotalPnl > 0 ? "text-emerald-400" : userTotalPnl < 0 ? "text-rose-400" : "text-foreground"
              )}>
                {userTotalPnl > 0 ? `+${userTotalPnl.toFixed(2)}` : userTotalPnl.toFixed(2)} USDC
              </div>
              <div className="stat-card-footer">
                <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/30 border-border/50 gap-1">
                  <TrendingUp size={10} />
                  <span>{userOrdersToday > 0 ? `${userOrdersToday} FILLS` : 'READY TO TRADE'}</span>
                </Badge>
                <span className="text-[11px] font-mono text-muted-foreground">
                  Realized: {(portfolio?.realizedPnl ?? 0).toFixed(2)} • Claimable: {(portfolio?.unclaimedPnl ?? 0).toFixed(2)}
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
                <span className="stat-card-title">SESSION BUDGET</span>
                <ShieldCheck
                  size={15}
                  className="stat-card-icon text-muted-foreground"
                />
              </div>
              <div className="stat-card-value font-mono">
                {activeSession?.isActive
                  ? `${activeSession.spentToday || 0} / ${activeSession.dailyVolumeCap} tUSDC`
                  : 'DIRECT MODE'}
              </div>
              <div className="stat-card-footer">
                <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/30 border-border/50 gap-1">
                  <ShieldCheck size={10} className={activeSession?.isActive ? "text-emerald-400" : "text-muted-foreground"} />
                  <span>{activeSession?.isActive ? 'ACTIVE DELEGATION' : 'DIRECT WALLET'}</span>
                </Badge>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {activeSession?.isActive
                    ? `Single Cap: ${activeSession.maxTradeSize} tUSDC`
                    : 'Configure session'}
                </span>
              </div>
            </div>

            {/* User Card 4: Active Positions & Market Opportunities */}
            <div
              className="stat-card"
              style={{ cursor: onNavigateToTab ? 'pointer' : 'default' }}
              onClick={() => onNavigateToTab && onNavigateToTab('Edge Radar')}
            >
              <div className="stat-card-header">
                <span className="stat-card-title">ACTIVE POSITIONS & ALPHA</span>
                <Activity size={15} className="stat-card-icon text-muted-foreground" />
              </div>
              <div className="stat-card-value font-mono text-foreground">
                {userActivePositions} ACTIVE
              </div>
              <div className="stat-card-footer">
                <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/30 border-border/50 gap-1">
                  <Zap size={10} />
                  <span>{(maxEdge * 100).toFixed(1)}% MAX ARB</span>
                </Badge>
                <span className="text-[11px] font-mono text-muted-foreground">{maxEdgeSymbol} {maxEdgeWindow} Φ(z) Mispricing</span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Swarm Card 1: Active Prediction Markets */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title">ACTIVE PREDICTION MARKETS</span>
                <Layers size={15} className="stat-card-icon text-muted-foreground" />
              </div>
              <div className="stat-card-value font-mono text-foreground">{activeCount} LIVE</div>
              <div className="stat-card-footer">
                <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/30 border-border/50 gap-1">
                  <CheckCircle size={10} className="text-emerald-400" />
                  <span>100% SYNCED</span>
                </Badge>
                <span className="text-[11px] font-mono text-muted-foreground">5m, 15m & 1h BTC/ETH expiries</span>
              </div>
            </div>

            {/* Swarm Card 2: Maximum Arbitrage Edge */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title">MAX ARBITRAGE EDGE</span>
                <Zap size={15} className="stat-card-icon text-muted-foreground" />
              </div>
              <div className="stat-card-value font-mono text-foreground">
                {(maxEdge * 100).toFixed(1)}% ARB
              </div>
              <div className="stat-card-footer">
                <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/30 border-border/50 gap-1">
                  <AlertTriangle size={10} />
                  <span>{maxEdge >= 0.05 ? 'HIGH ANOMALY' : 'ACTIVE EDGE'}</span>
                </Badge>
                <span className="text-[11px] font-mono text-muted-foreground">{maxEdgeSymbol} {maxEdgeWindow} Φ(z) Mispricing</span>
              </div>
            </div>

            {/* Swarm Card 3: Autonomous Swarm PnL */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title">SWARM REAL-TIME PnL</span>
                <TrendingUp
                  size={15}
                  className="stat-card-icon text-muted-foreground"
                />
              </div>
              <div className={cn(
                "stat-card-value font-mono",
                totalSwarmPnl > 0 ? "text-emerald-400" : totalSwarmPnl < 0 ? "text-rose-400" : "text-foreground"
              )}>
                {totalSwarmPnl > 0 ? `+${totalSwarmPnl.toFixed(2)}` : totalSwarmPnl.toFixed(2)} USDC
              </div>
              <div className="stat-card-footer">
                <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/30 border-border/50 gap-1">
                  <TrendingUp size={10} />
                  <span>{totalSwarmFills > 0 ? `${totalSwarmFills} FILLS` : 'READY TO TRADE'}</span>
                </Badge>
                <span className="text-[11px] font-mono text-muted-foreground">Volt, Oracle & Titan net PnL</span>
              </div>
            </div>

            {/* Swarm Card 4: Pricing Engine Latency */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title">PRICING & REASONING SPEED</span>
                <Gauge size={15} className="stat-card-icon text-muted-foreground" />
              </div>
              <div className="stat-card-value font-mono text-foreground">{latencyMs}ms TICK</div>
              <div className="stat-card-footer">
                <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/30 border-border/50 gap-1">
                  <Cpu size={10} />
                  <span>99.9% Φ(z)</span>
                </Badge>
                <span className="text-[11px] font-mono text-muted-foreground">Black-Scholes quant loop</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
