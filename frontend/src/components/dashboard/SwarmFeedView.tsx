import React from 'react';
import { Zap, Brain, Shield, Sparkles } from 'lucide-react';
import type { AgentThoughtLog } from '../../types/index.js';
import { AgentThoughtFeed } from '../AgentThoughtFeed.js';

interface SwarmFeedViewProps {
  agentThoughts: AgentThoughtLog[];
  isConnected: boolean;
}

export const SwarmFeedView: React.FC<SwarmFeedViewProps> = ({
  agentThoughts,
  isConnected,
}) => {
  const agents = [
    {
      name: 'Volt',
      role: 'Expiry Sniper',
      Icon: Zap,
      color: '#f59e0b',
      status: 'Active (5m/15m scan)',
      trades: 18,
    },
    {
      name: 'Oracle',
      role: 'Vol Surface Arbitrage',
      Icon: Brain,
      color: '#00ffcc',
      status: 'Active (Φ(z) skew)',
      trades: 12,
    },
    {
      name: 'Titan',
      role: 'Two-Sided Market Maker',
      Icon: Shield,
      color: '#3b82f6',
      status: 'Active (CLOB quotes)',
      trades: 8,
    },
    {
      name: 'Sweeper',
      role: 'Settlement & Compounder',
      Icon: Sparkles,
      color: '#10b981',
      status: 'Monitoring expiries',
      trades: 0,
    },
  ];

  return (
    <div className="full-height-view" style={{ gap: '16px' }}>
      {/* Agent Swarm Overview Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', flexShrink: 0 }}>
        {agents.map((ag) => {
          const Icon = ag.Icon;
          return (
            <div
              key={ag.name}
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon size={16} style={{ color: ag.color }} />
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>{ag.name}</span>
                </div>
                <span className="stat-pill-tag tag-green" style={{ fontSize: '9px' }}>
                  LIVE
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{ag.role}</span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', fontSize: '11px' }}>
                <span style={{ color: 'var(--muted-foreground)' }}>{ag.status}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: ag.color }}>
                  {ag.trades} trades
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Full-Page Live Streaming AI Thought Stream (Fills 100% of remaining space) */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <AgentThoughtFeed thoughts={agentThoughts} isConnected={isConnected} />
      </div>
    </div>
  );
};
