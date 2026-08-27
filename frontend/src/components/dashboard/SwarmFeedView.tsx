import React from 'react';
import { BoltIcon, CpuChipIcon, ShieldCheckIcon, SparklesIcon } from '@heroicons/react/24/outline';
import type { AgentThoughtLog } from '../../types/index.js';
import { AgentThoughtFeed } from '../AgentThoughtFeed.js';
import { useAgentSwarm } from '../../hooks/useAgentSwarm.js';
import { Badge } from '../ui/badge.js';

interface SwarmFeedViewProps {
  agentThoughts: AgentThoughtLog[];
  debugThoughts?: AgentThoughtLog[];
  isDebugEnabled?: boolean;
  onToggleDebug?: (enable?: boolean) => void;
  isConnected: boolean;
}

export const SwarmFeedView: React.FC<SwarmFeedViewProps> = ({
  agentThoughts,
  debugThoughts = [],
  isDebugEnabled = false,
  onToggleDebug,
  isConnected,
}) => {
  const { summary } = useAgentSwarm();

  const agents = [
    {
      name: 'Volt',
      role: 'Expiry Sniper',
      Icon: BoltIcon,
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.06)',
      border: 'rgba(245,158,11,0.14)',
      status: `Active (${summary.volt.evalLatencyMs || 2}ms latency)`,
      trades: summary.volt.tradesToday,
      pnl: summary.volt.pnl,
    },
    {
      name: 'Oracle',
      role: 'Vol Surface Arbitrage',
      Icon: CpuChipIcon,
      color: '#2dd4bf',
      bg: 'rgba(45,212,191,0.06)',
      border: 'rgba(45,212,191,0.14)',
      status: `Active (Φ(z) skew)`,
      trades: summary.oracle.tradesToday,
      pnl: summary.oracle.pnl,
    },
    {
      name: 'Titan',
      role: 'Two-Sided Market Maker',
      Icon: ShieldCheckIcon,
      color: '#a78bfa',
      bg: 'rgba(167,139,250,0.06)',
      border: 'rgba(167,139,250,0.14)',
      status: `Active (${summary.titan.activeQuotes || 4} quotes)`,
      trades: summary.titan.activeQuotes,
      pnl: summary.titan.spreadCaptured,
    },
    {
      name: 'Sweeper',
      role: 'Settlement & Wallet Sweeper',
      Icon: SparklesIcon,
      color: '#34d399',
      bg: 'rgba(52,211,153,0.06)',
      border: 'rgba(52,211,153,0.14)',
      status: 'Monitoring expiries',
      trades: summary.sweeper.totalClaimed && !summary.sweeper.totalClaimed.startsWith('0.00') && !summary.sweeper.totalClaimed.startsWith('+0.00') ? 1 : 0,
      pnl: summary.sweeper.totalClaimed,
    },
  ];

  return (
    <div className="flex flex-col gap-4 min-h-0 flex-1 overflow-y-auto lg:overflow-hidden pb-4">
      {/* Agent Swarm Overview Header — Minimalist (aligns with Overview / Edge Radar) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
        {agents.map((ag) => {
          const Icon = ag.Icon;
          return (
            <div
              key={ag.name}
              className="terminal-panel p-3.5 flex flex-col justify-between relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-[2.5px]" style={{ background: ag.color, opacity: 0.85 }} />
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg grid place-items-center border bg-secondary/30 border-border/50 text-muted-foreground">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-sm font-semibold text-foreground tracking-tight">{ag.name}</span>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 bg-secondary/30 border-border/40 text-muted-foreground">
                  LIVE
                </Badge>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">{ag.role}</span>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/30">
                <span className="text-[11px] font-mono text-muted-foreground">{ag.status}</span>
                <span className="text-[11px] font-mono font-medium text-muted-foreground">
                  {ag.trades} trades
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Full-Page Live Streaming AI Thought Stream (Fills 100% of remaining space) */}
      <div className="flex-1 min-h-[480px] lg:min-h-0 flex flex-col overflow-hidden">
        <AgentThoughtFeed
          thoughts={agentThoughts}
          debugThoughts={debugThoughts}
          isDebugEnabled={isDebugEnabled}
          onToggleDebug={onToggleDebug}
          isConnected={isConnected}
        />
      </div>
    </div>
  );
};
