import React from 'react';
import {
  Zap,
  ArrowRight,
  ExternalLink,
  ListOrdered,
  Brain,
} from 'lucide-react';
import type { Market, AgentThoughtLog, SessionGrant } from '../../types/index.js';
import type { MarketTickData } from '../../hooks/useTelemetry.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import { useAgentSwarm } from '../../hooks/useAgentSwarm.js';
import { StatCardsGrid } from './StatCardsGrid.js';
import { SessionStatusBar } from '../SessionStatusBar.js';

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
  onOpenSessionModal,
  onRevokeSession,
  onConnectWallet,
  onSwitchNetwork,
}) => {
  // Extract top anomaly opportunities (edge >= 0.03 or highest edge)
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

  const recentThoughts = agentThoughts.slice(0, 4);

  const { detailed: swarmDetailed, orders } = useAgentSwarm();

  return (
    <div className="overview-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Non-Custodial Session Delegation Status Banner */}
      {wallet && onOpenSessionModal && onRevokeSession && onConnectWallet && onSwitchNetwork && (
        <SessionStatusBar
          wallet={wallet}
          activeSession={activeSession || null}
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
        ordersCount={orders.length}
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
            {markets.slice(0, 4).map((m) => {
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
            })}
          </div>
        </div>

        {/* Right: Live AI Reasoning Snapshot */}
        <div className="terminal-panel" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Brain size={16} style={{ color: '#a855f7' }} />
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Live Swarm Intelligence</span>
              <span className="stat-pill-tag tag-green">Streaming</span>
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
            {recentThoughts.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>
                AI Swarm initializing autonomous thought stream...
              </div>
            ) : (
              recentThoughts.map((t, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '10px 12px',
                    background: '#18181b',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 700, fontSize: '11px', color: t.agentType === 'Volt' ? '#f59e0b' : t.agentType === 'Oracle' ? '#00ffcc' : '#3b82f6' }}>
                        {t.agentType.toUpperCase()}
                      </span>
                      <span className="badge" style={{ fontSize: '9px', background: '#27272a', padding: '1px 4px' }}>
                        {t.triggerEvent}
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--trade-yes)' }}>
                      {(t.confidence * 100).toFixed(0)}% Conf
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '11.5px', color: '#d4d4d8', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {t.reasoningText}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
