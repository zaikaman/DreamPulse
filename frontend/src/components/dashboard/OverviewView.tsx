import React, { useMemo, useState, useEffect } from 'react';
import {
  Zap,
  ArrowRight,
  ExternalLink,
  ListOrdered,
  Brain,
  Shield,
  Sparkles,
  Pause,
  Activity,
} from 'lucide-react';
import type { Market, AgentThoughtLog, SessionGrant } from '../../types/index.js';
import type { MarketTickData } from '../../hooks/useTelemetry.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import { useAgentSwarm } from '../../hooks/useAgentSwarm.js';
import { useUserPortfolio } from '../../hooks/useUserPortfolio.js';
import { StatCardsGrid } from './StatCardsGrid.js';
import { SessionStatusBar } from '../SessionStatusBar.js';
import { OpportunityTableSkeleton, Skeleton } from '../ui/Skeleton.js';

interface OverviewViewProps {
  markets: Market[];
  liveTicks: Map<string, MarketTickData>;
  latencyMs: number;
  agentThoughts: AgentThoughtLog[];
  selectedMarketId: string | null;
  onSelectMarket: (marketId: string) => void;
  onNavigateToTab: (tab: string) => void;
  wallet?: WalletState;
  activeSession?: SessionGrant | null;
  isLoading?: boolean;
  isFauceting?: boolean;
  onClaimFaucet?: (amount?: number) => Promise<void>;
  onOpenSessionModal?: () => void;
  onRevokeSession?: () => Promise<void>;
  onConnectWallet?: () => Promise<void>;
  onSwitchNetwork?: () => Promise<void>;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  markets,
  liveTicks,
  latencyMs,
  agentThoughts,
  selectedMarketId,
  onSelectMarket,
  onNavigateToTab,
  wallet,
  activeSession,
  isLoading = false,
  isFauceting,
  onClaimFaucet,
  onOpenSessionModal,
  onRevokeSession,
  onConnectWallet,
  onSwitchNetwork,
}) => {
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [nowTime, setNowTime] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Top 5 alpha opportunities by absolute mathematical edge
  const opportunities = markets
    .map((m) => {
      const tick = liveTicks.get(m.id);
      const edge = tick?.edge ?? m.edgePercentage;
      const implied = tick?.impliedProb ?? m.impliedProbYes;
      const fair = tick?.fairValue ?? m.fairValueYes;
      return {
        market: m,
        absEdge: Math.abs(edge),
        edge,
        implied,
        fair,
        action: edge > 0.01 ? 'BUY_YES' : edge < -0.01 ? 'BUY_NO' : 'NEUTRAL',
      };
    })
    .sort((a, b) => b.absEdge - a.absEdge)
    .slice(0, 5);

  // Distinct thoughts across the 4 agents to prevent repetitive single-agent spam
  const distinctThoughts = useMemo(() => {
    const map = new Map<string, AgentThoughtLog>();
    for (const t of agentThoughts) {
      if (!map.has(t.agentType)) {
        map.set(t.agentType, t);
      }
      if (map.size >= 4) break;
    }
    // If fewer than 4 unique agents, backfill with most recent unique thoughts
    const list = Array.from(map.values());
    if (list.length < 4) {
      for (const t of agentThoughts) {
        if (!list.some((existing) => existing.id === t.id)) {
          list.push(t);
        }
        if (list.length >= 4) break;
      }
    }
    return list;
  }, [agentThoughts]);

  const { detailed: swarmDetailed, summary: swarmSummary, orders } = useAgentSwarm();
  const { portfolio } = useUserPortfolio(wallet);

  return (
    <div className="overview-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Non-Custodial Session Delegation Status Banner */}
      {wallet && onOpenSessionModal && onRevokeSession && onConnectWallet && onSwitchNetwork && (
        <SessionStatusBar
          wallet={wallet}
          activeSession={activeSession || null}
          isFauceting={isFauceting}
          onClaimFaucet={onClaimFaucet}
          onOpenModal={onOpenSessionModal}
          onRevokeSession={onRevokeSession}
          onConnectWallet={onConnectWallet}
          onSwitchNetwork={onSwitchNetwork}
        />
      )}

      {/* 1. Top KPI Stat Metrics */}
      <StatCardsGrid
        markets={markets}
        liveTicks={liveTicks}
        latencyMs={latencyMs}
        swarmDetailed={swarmDetailed}
        swarmSummary={swarmSummary}
        ordersCount={orders.length}
        wallet={wallet}
        activeSession={activeSession}
        portfolio={portfolio}
        isLoading={isLoading}
        isFauceting={isFauceting}
        onClaimFaucet={onClaimFaucet}
        onOpenSessionModal={onOpenSessionModal}
        onNavigateToTab={onNavigateToTab}
      />

      {/* 2. Primary Focal Point: Top Arbitrage Opportunities */}
      <div className="terminal-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <div
          className="terminal-panel-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Zap size={16} style={{ color: 'var(--trade-anomaly)' }} />
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Top Arbitrage & Mispricing Opportunities</span>
            <span className="stat-pill-tag tag-amber" style={{ marginLeft: '4px' }}>
              {opportunities.filter((o) => o.absEdge >= 0.03).length} ACTIVE ANOMALIES
            </span>
          </div>

          <button
            type="button"
            className="shadcn-tab-btn"
            style={{ fontSize: '12px', padding: '4px 10px' }}
            onClick={() => onNavigateToTab('Edge Radar')}
          >
            <span>Open Full Radar</span>
            <ArrowRight size={13} style={{ marginLeft: '4px' }} />
          </button>
        </div>

        {/* High-Signal Clean Opportunity Table */}
        {isLoading && opportunities.length === 0 ? (
          <OpportunityTableSkeleton rows={5} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#0e0e11', borderBottom: '1px solid var(--border)', color: 'var(--muted-foreground)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 20px', fontWeight: 500 }}>ASSET & STRIKE</th>
                  <th style={{ padding: '10px 16px', fontWeight: 500 }}>EXPIRY</th>
                  <th style={{ padding: '10px 16px', fontWeight: 500 }}>IMPLIED PROB</th>
                  <th style={{ padding: '10px 16px', fontWeight: 500 }}>FAIR VALUE Φ(z)</th>
                  <th style={{ padding: '10px 16px', fontWeight: 500 }}>EDGE DELTA</th>
                  <th style={{ padding: '10px 16px', fontWeight: 500 }}>ACTION</th>
                  <th style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 500 }}>INSPECT</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                      Scanning Somnia Event Contracts for pricing anomalies...
                    </td>
                  </tr>
                ) : (
                  opportunities.map(({ market, edge, implied, fair, action }) => {
                    const isSelected = selectedMarketId === market.id;
                    const isYesEdge = edge > 0;
                    return (
                      <tr
                        key={market.id}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          background: isSelected ? 'rgba(0, 255, 204, 0.04)' : 'transparent',
                          transition: 'background 0.15s ease',
                          cursor: 'pointer',
                        }}
                        onClick={() => onSelectMarket(market.id)}
                      >
                        <td style={{ padding: '12px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600 }}>{market.symbol}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)', fontSize: '12px' }}>
                              ${market.strikePrice.toLocaleString()}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className="badge" style={{ background: '#1e1e24', color: '#d4d4d8', padding: '2px 7px', borderRadius: '4px', fontSize: '11px' }}>
                            {market.windowDuration}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {(implied * 100).toFixed(1)}%
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', color: 'var(--brand-cyan)' }}>
                          {(fair * 100).toFixed(1)}%
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                          <span style={{ color: isYesEdge ? 'var(--trade-yes)' : 'var(--trade-no)' }}>
                            {isYesEdge ? '+' : ''}{(edge * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            className={`stat-pill-tag ${
                              action === 'BUY_YES' ? 'tag-green' : action === 'BUY_NO' ? 'tag-amber' : 'tag-cyan'
                            }`}
                          >
                            {action === 'BUY_YES' ? 'BUY YES (Underpriced)' : action === 'BUY_NO' ? 'BUY NO (Overpriced)' : 'NEUTRAL'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn-action"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectMarket(market.id);
                              onNavigateToTab('Markets & Depth');
                            }}
                          >
                            <span>Inspect</span>
                            <ExternalLink size={11} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Secondary Split: Quick Market Catalog + Latest Swarm Reasoning */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
        {/* Left: Quick Active Markets */}
        <div className="terminal-panel" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ListOrdered size={16} style={{ color: 'var(--brand-cyan)' }} />
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Active Prediction Catalog</span>
              <span className="stat-pill-tag tag-cyan">{markets.length} Markets</span>
            </div>
            <button
              type="button"
              className="shadcn-tab-btn"
              style={{ fontSize: '12px', padding: '3px 8px' }}
              onClick={() => onNavigateToTab('Markets & Depth')}
            >
              <span>View Full CLOB</span>
              <ArrowRight size={13} style={{ marginLeft: '4px' }} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {isLoading && markets.length === 0 ? (
              [1, 2, 3, 4].map((i) => (
                <div
                  key={`quick-skel-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: '#18181b',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Skeleton variant="text" width={60} height={14} />
                    <Skeleton variant="text" width={50} height={12} />
                    <Skeleton variant="badge" width={32} height={16} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <Skeleton variant="text" width={48} height={11} />
                      <Skeleton variant="text" width={48} height={10} />
                    </div>
                    <Skeleton variant="rectangular" width={55} height={24} borderRadius={4} />
                  </div>
                </div>
              ))
            ) : (
              markets.slice(0, 4).map((m) => {
                const tick = liveTicks.get(m.id);
                const implied = tick?.impliedProb ?? m.impliedProbYes;
                const isSelected = selectedMarketId === m.id;
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: isSelected ? 'rgba(0, 255, 204, 0.05)' : '#18181b',
                      border: `1px solid ${isSelected ? 'var(--brand-cyan)' : 'var(--border)'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onClick={() => onSelectMarket(m.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>{m.symbol}</span>
                      <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>${m.strikePrice.toLocaleString()}</span>
                      <span className="badge" style={{ background: '#27272a', color: '#d4d4d8', padding: '1px 5px', fontSize: '10px' }}>
                        {m.windowDuration}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '11px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          YES: {(implied * 100).toFixed(0)}%
                        </span>
                        <span style={{ color: 'var(--muted-foreground)', fontSize: '10px' }}>
                          NO: {((1 - implied) * 100).toFixed(0)}%
                        </span>
                      </div>

                      <button
                        type="button"
                        className="btn-action"
                        style={{ fontSize: '10.5px', padding: '4px 10px', height: 'auto' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMarket(m.id);
                          onNavigateToTab('Markets & Depth');
                        }}
                      >
                        <span>Trade</span>
                        <ArrowRight size={10} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Live AI Reasoning Snapshot */}
        <div
          className="terminal-panel"
          style={{ padding: '16px 20px' }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Brain size={16} style={{ color: '#a855f7' }} />
              <span style={{ fontWeight: 700, fontSize: '14px' }}>Live Swarm Intelligence</span>
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 7px',
                  borderRadius: '999px',
                  background: isHovered ? 'rgba(245, 158, 11, 0.18)' : 'rgba(16, 185, 129, 0.15)',
                  color: isHovered ? '#fbbf24' : '#34d399',
                  border: isHovered ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {isHovered ? <Pause size={9} /> : <Activity size={9} />}
                {isHovered ? 'HOVERING TO READ' : 'STREAMING'}
              </span>
            </div>
            <button
              type="button"
              className="shadcn-tab-btn"
              style={{ fontSize: '12px', padding: '3px 8px' }}
              onClick={() => onNavigateToTab('AI Swarm Feed')}
            >
              <span>Full Stream</span>
              <ArrowRight size={13} style={{ marginLeft: '4px' }} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {distinctThoughts.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>
                Swarm actively evaluating 12 Shannon CLOB markets. Executed trades will appear here.
              </div>
            ) : (
              distinctThoughts.map((t, idx) => {
                const isVolt = t.agentType === 'Volt';
                const isOracle = t.agentType === 'Oracle';
                const isTitan = t.agentType === 'Titan';
                const color = isVolt ? '#f59e0b' : isOracle ? '#00ffcc' : isTitan ? '#a855f7' : '#10b981';
                const AgentIcon = isVolt ? Zap : isOracle ? Brain : isTitan ? Shield : Sparkles;
                const timeDiff = Math.max(0, Math.floor((nowTime - new Date(t.createdAt).getTime()) / 1000));
                const relTime = timeDiff < 5 ? 'Just now' : `${timeDiff}s ago`;

                return (
                  <div
                    key={t.id || idx}
                    style={{
                      padding: '10px 12px',
                      background: '#141417',
                      border: '1px solid var(--border)',
                      borderLeft: `3px solid ${color}`,
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 700,
                            fontSize: '11px',
                            color,
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          <AgentIcon size={12} />
                          <span>{t.agentType.toUpperCase()}</span>
                        </div>
                        <span
                          className="badge"
                          style={{
                            fontSize: '9px',
                            background: '#27272a',
                            padding: '1px 5px',
                            color: '#a1a1aa',
                          }}
                        >
                          {t.actionTaken || t.triggerEvent}
                        </span>
                        {t.txHash && (
                          <a
                            href={`https://shannon-explorer.somnia.network/tx/${t.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontSize: '9px',
                              color: '#00ffcc',
                              textDecoration: 'none',
                              fontFamily: 'var(--font-mono)',
                              background: 'rgba(0, 255, 204, 0.1)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                            }}
                          >
                            Tx: {t.txHash.slice(0, 6)}...
                          </a>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: 'var(--trade-yes)', fontWeight: 600 }}>
                          {(t.confidence * 100).toFixed(0)}% Conf
                        </span>
                        <span style={{ fontSize: '9.5px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                          {relTime}
                        </span>
                      </div>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '11.5px',
                        color: '#d4d4d8',
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {t.reasoningText}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
