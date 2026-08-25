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
  const isSwarmProfitable = totalSwarmPnl >= 0;

  // Personal Portfolio calculations
  const userTotalPnl = portfolio?.totalPnl ?? 0;
  const isUserProfitable = userTotalPnl >= 0;
  const userOrdersToday = portfolio?.ordersTodayCount ?? 0;
  const userActivePositions = portfolio?.activePositionsCount ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Top Perspective Header & Quick Switcher */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '0 4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {perspective === 'PORTFOLIO' ? (
            <>
              <div
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: 'var(--brand-cyan)',
                  boxShadow: '0 0 8px var(--brand-cyan)',
                }}
              />
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '0.04em' }}>
                MY TRADER WORKSPACE & PERFORMANCE
              </span>
              <span
                className="stat-pill-tag"
                style={{
                  background: 'rgba(0, 240, 255, 0.12)',
                  color: 'var(--brand-cyan)',
                  border: '1px solid rgba(0, 240, 255, 0.25)',
                  fontSize: '10px',
                  padding: '1px 6px',
                }}
              >
                {wallet?.address ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}` : 'WALLET'}
              </span>
            </>
          ) : (
            <>
              <div
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: 'var(--trade-anomaly)',
                  boxShadow: '0 0 8px var(--trade-anomaly)',
                }}
              />
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '0.04em' }}>
                SOMNIA PROTOCOL SWARM TELEMETRY
              </span>
              <span
                className="stat-pill-tag tag-amber"
                style={{ fontSize: '10px', padding: '1px 6px' }}
              >
                OPERATOR 0x93e3...59Cf
              </span>
            </>
          )}
        </div>

        {/* Perspective Mode Switcher */}
        {isConnected ? (
          <div
            style={{
              display: 'flex',
              gap: '4px',
              background: 'rgba(0, 0, 0, 0.4)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              className={`shadcn-tab-btn ${perspective === 'PORTFOLIO' ? 'active' : ''}`}
              onClick={() => setPerspective('PORTFOLIO')}
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontWeight: perspective === 'PORTFOLIO' ? 700 : 500,
              }}
            >
              <User size={12} />
              <span>My Portfolio</span>
            </button>
            <button
              type="button"
              className={`shadcn-tab-btn ${perspective === 'SWARM' ? 'active' : ''}`}
              onClick={() => setPerspective('SWARM')}
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontWeight: perspective === 'SWARM' ? 700 : 500,
              }}
            >
              <Bot size={12} />
              <span>Protocol Swarm</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {parseFloat(wallet?.balanceCollateral || '0') === 0 && onClaimFaucet && (
                    <button
                      type="button"
                      className="btn-faucet-action-compact"
                      onClick={() => onClaimFaucet(1000)}
                      disabled={isFauceting}
                      style={{
                        background: 'var(--trade-anomaly)',
                        color: '#000',
                        border: 'none',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                    >
                      {isFauceting ? <Loader2 size={10} className="spin" /> : <Coins size={10} />}
                      <span>+1k tUSDC</span>
                    </button>
                  )}
                  <Wallet size={16} className="stat-card-icon" style={{ color: 'var(--brand-cyan)' }} />
                </div>
              </div>
              <div className="stat-card-value" style={{ color: 'var(--foreground)' }}>
                {wallet?.balanceCollateral || '0.00'} tUSDC
              </div>
              <div className="stat-card-footer">
                <span className="stat-pill-tag tag-green">
                  <CheckCircle size={11} />
                  <span>NON-CUSTODIAL</span>
                </span>
                <span>{wallet?.balanceSTT || '0.00'} STT Native Gas</span>
              </div>
            </div>

            {/* User Card 2: Personal PnL */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title">MY TOTAL PnL</span>
                <TrendingUp
                  size={16}
                  className="stat-card-icon"
                  style={{ color: isUserProfitable ? 'var(--trade-yes)' : 'var(--trade-no)' }}
                />
              </div>
              <div className={`stat-card-value ${isUserProfitable ? 'text-yes' : 'text-no'}`}>
                {isUserProfitable ? `+${userTotalPnl.toFixed(2)}` : userTotalPnl.toFixed(2)} USDC
              </div>
              <div className="stat-card-footer">
                <span className={`stat-pill-tag ${userOrdersToday > 0 ? 'tag-green' : 'tag-cyan'}`}>
                  <TrendingUp size={11} />
                  <span>{userOrdersToday > 0 ? `${userOrdersToday} FILLS` : 'READY TO TRADE'}</span>
                </span>
                <span>
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
                  size={16}
                  className="stat-card-icon"
                  style={{ color: activeSession?.isActive ? 'var(--trade-yes)' : 'var(--brand-cyan)' }}
                />
              </div>
              <div className="stat-card-value">
                {activeSession?.isActive
                  ? `${activeSession.spentToday || 0} / ${activeSession.dailyVolumeCap} tUSDC`
                  : 'DIRECT MODE'}
              </div>
              <div className="stat-card-footer">
                <span className={`stat-pill-tag ${activeSession?.isActive ? 'tag-green' : 'tag-amber'}`}>
                  <ShieldCheck size={11} />
                  <span>{activeSession?.isActive ? 'ACTIVE DELEGATION' : 'DIRECT WALLET'}</span>
                </span>
                <span>
                  {activeSession?.isActive
                    ? `Single Cap: ${activeSession.maxTradeSize} tUSDC`
                    : 'Click to configure non-custodial session'}
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
                <Activity size={16} className="stat-card-icon" style={{ color: 'var(--trade-anomaly)' }} />
              </div>
              <div className="stat-card-value" style={{ color: userActivePositions > 0 ? 'var(--brand-cyan)' : 'inherit' }}>
                {userActivePositions} ACTIVE
              </div>
              <div className="stat-card-footer">
                <span className="stat-pill-tag tag-amber">
                  <Zap size={11} />
                  <span>{(maxEdge * 100).toFixed(1)}% MAX ARB</span>
                </span>
                <span>{maxEdgeSymbol} {maxEdgeWindow} Φ(z) Mispricing</span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Swarm Card 1: Active Prediction Markets */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title">ACTIVE PREDICTION MARKETS</span>
                <Layers size={16} className="stat-card-icon" />
              </div>
              <div className="stat-card-value">{activeCount} LIVE</div>
              <div className="stat-card-footer">
                <span className="stat-pill-tag tag-green">
                  <CheckCircle size={11} />
                  <span>100% SYNCED</span>
                </span>
                <span>5m, 15m & 1h BTC/ETH expiries</span>
              </div>
            </div>

            {/* Swarm Card 2: Maximum Arbitrage Edge */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title">MAX ARBITRAGE EDGE</span>
                <Zap size={16} className="stat-card-icon" style={{ color: 'var(--trade-anomaly)' }} />
              </div>
              <div className="stat-card-value" style={{ color: maxEdge >= 0.03 ? 'var(--trade-anomaly)' : 'inherit' }}>
                {(maxEdge * 100).toFixed(1)}% ARB
              </div>
              <div className="stat-card-footer">
                <span className="stat-pill-tag tag-amber">
                  <AlertTriangle size={11} />
                  <span>{maxEdge >= 0.05 ? 'HIGH ANOMALY' : 'ACTIVE EDGE'}</span>
                </span>
                <span>{maxEdgeSymbol} {maxEdgeWindow} Φ(z) Mispricing</span>
              </div>
            </div>

            {/* Swarm Card 3: Autonomous Swarm PnL */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title">SWARM REAL-TIME PnL</span>
                <TrendingUp
                  size={16}
                  className="stat-card-icon"
                  style={{ color: isSwarmProfitable ? 'var(--trade-yes)' : 'var(--trade-no)' }}
                />
              </div>
              <div className={`stat-card-value ${isSwarmProfitable ? 'text-yes' : 'text-no'}`}>
                {isSwarmProfitable ? `+${totalSwarmPnl.toFixed(2)}` : totalSwarmPnl.toFixed(2)} USDC
              </div>
              <div className="stat-card-footer">
                <span className={`stat-pill-tag ${totalSwarmFills > 0 ? 'tag-green' : 'tag-cyan'}`}>
                  <TrendingUp size={11} />
                  <span>{totalSwarmFills > 0 ? `${totalSwarmFills} FILLS` : 'READY TO TRADE'}</span>
                </span>
                <span>Volt, Oracle & Titan net PnL (excl. sweeper gross)</span>
              </div>
            </div>

            {/* Swarm Card 4: Pricing Engine Latency */}
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title">PRICING & REASONING SPEED</span>
                <Gauge size={16} className="stat-card-icon" />
              </div>
              <div className="stat-card-value">{latencyMs}ms TICK</div>
              <div className="stat-card-footer">
                <span className="stat-pill-tag tag-cyan">
                  <Cpu size={11} />
                  <span>99.9% Φ(z)</span>
                </span>
                <span>Black-Scholes quantitative loop</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
