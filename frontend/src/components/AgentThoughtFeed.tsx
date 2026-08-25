import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Terminal,
  Play,
  Pause,
  Zap,
  Brain,
  Shield,
  Sparkles,
  Cpu,
  Search,
  TrendingUp,
  Activity,
  Filter,
} from 'lucide-react';
import type { AgentThoughtLog } from '../types/index.js';

interface AgentThoughtFeedProps {
  thoughts: AgentThoughtLog[];
  isConnected: boolean;
}

export const AgentThoughtFeed: React.FC<AgentThoughtFeedProps> = ({ thoughts, isConnected }) => {
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isPausedManual, setIsPausedManual] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [nowTime, setNowTime] = useState<number>(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);

  // Update clock every second for live relative timestamps
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isPaused = isPausedManual || isHovered;

  // Snapshot of latest distinct thought per agent for Executive Digest
  const latestByAgent = useMemo(() => {
    const map = new Map<string, AgentThoughtLog>();
    for (const t of thoughts) {
      const type = t.agentType.toUpperCase();
      if (!map.has(type)) {
        map.set(type, t);
      }
    }
    return map;
  }, [thoughts]);

  // Filtered and deduplicated thoughts according to selected tab and search query
  const filteredThoughts = useMemo(() => {
    const rawFiltered = thoughts.filter((t) => {
      // 1. Tab filter
      if (selectedFilter === 'TRADES') {
        const isTrade =
          t.actionTaken.includes('BUY') ||
          t.actionTaken.includes('SELL') ||
          t.actionTaken.includes('SWEEP');
        if (!isTrade) return false;
      } else if (selectedFilter === 'HIGH_CONVICTION') {
        if (t.confidence < 0.8) return false;
      } else if (selectedFilter !== 'ALL') {
        if (t.agentType.toLowerCase() !== selectedFilter.toLowerCase()) return false;
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesText = t.reasoningText.toLowerCase().includes(q);
        const matchesAgent = t.agentType.toLowerCase().includes(q);
        const matchesAction = t.actionTaken.toLowerCase().includes(q);
        const matchesMarket = (t.marketId || '').toLowerCase().includes(q);
        if (!matchesText && !matchesAgent && !matchesAction && !matchesMarket) {
          return false;
        }
      }

      return true;
    });

    // Cleanly aggregate consecutive duplicate thoughts from the same agent into a single card
    const deduped: (AgentThoughtLog & { repeatCount?: number })[] = [];
    for (const t of rawFiltered) {
      if (
        deduped.length > 0 &&
        deduped[deduped.length - 1].agentType === t.agentType &&
        deduped[deduped.length - 1].reasoningText === t.reasoningText
      ) {
        deduped[deduped.length - 1].repeatCount = (deduped[deduped.length - 1].repeatCount || 1) + 1;
      } else {
        deduped.push({ ...t, repeatCount: 1 });
      }
    }
    return deduped;
  }, [thoughts, selectedFilter, searchQuery]);

  const getAgentTheme = (agent: string) => {
    switch (agent.toLowerCase()) {
      case 'volt':
        return {
          color: '#f59e0b',
          bg: 'rgba(245, 158, 11, 0.12)',
          border: 'rgba(245, 158, 11, 0.35)',
          glow: '0 0 10px rgba(245, 158, 11, 0.25)',
          role: 'Sub-Second Expiry Sniper',
          Icon: Zap,
        };
      case 'oracle':
        return {
          color: '#00ffcc',
          bg: 'rgba(0, 255, 204, 0.12)',
          border: 'rgba(0, 255, 204, 0.35)',
          glow: '0 0 10px rgba(0, 255, 204, 0.25)',
          role: 'Vol Surface Arbitrage',
          Icon: Brain,
        };
      case 'titan':
        return {
          color: '#a855f7',
          bg: 'rgba(168, 85, 247, 0.12)',
          border: 'rgba(168, 85, 247, 0.35)',
          glow: '0 0 10px rgba(168, 85, 247, 0.25)',
          role: 'Two-Sided CLOB Maker',
          Icon: Shield,
        };
      case 'sweeper':
        return {
          color: '#10b981',
          bg: 'rgba(16, 185, 129, 0.12)',
          border: 'rgba(16, 185, 129, 0.35)',
          glow: '0 0 10px rgba(16, 185, 129, 0.25)',
          role: 'Settlement Compounder',
          Icon: Sparkles,
        };
      default:
        return {
          color: '#38bdf8',
          bg: 'rgba(56, 189, 248, 0.12)',
          border: 'rgba(56, 189, 248, 0.35)',
          glow: '0 0 10px rgba(56, 189, 248, 0.25)',
          role: 'Autonomous Agent',
          Icon: Cpu,
        };
    }
  };

  const getActionBadgeStyle = (action: string) => {
    if (action.includes('BUY_YES') || action.includes('TAKER_BUY')) {
      return { background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' };
    }
    if (action.includes('BUY_NO') || action.includes('TAKER_SELL')) {
      return { background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' };
    }
    if (action.includes('LIMIT_QUOTE') || action.includes('QUOTE')) {
      return { background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' };
    }
    if (action.includes('SWEEP')) {
      return { background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' };
    }
    return { background: '#27272a', color: '#a1a1aa', border: '1px solid #3f3f46' };
  };

  const getRelativeTime = (isoString: string) => {
    const t = new Date(isoString).getTime();
    const diffSec = Math.max(0, Math.floor((nowTime - t) / 1000));
    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return `${Math.floor(diffMin / 60)}h ago`;
  };

  return (
    <div className="terminal-panel thought-feed-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 1. Header Toolbar */}
      <div className="terminal-panel-header" style={{ flexWrap: 'wrap', gap: '10px', padding: '12px 16px' }}>
        <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Terminal size={17} style={{ color: '#00ffcc' }} />
          <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '-0.01em' }}>
            Live Swarm Intelligence
          </span>
          <span className={`badge ${isConnected ? 'badge-yes' : 'badge-no'}`} style={{ fontSize: '10px', padding: '2px 8px' }}>
            <span className="live-dot"></span>
            {isConnected ? 'LIVE TELEMETRY' : 'DISCONNECTED'}
          </span>
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              padding: '2px 8px',
              borderRadius: '999px',
              background: isPaused ? 'rgba(245, 158, 11, 0.18)' : 'rgba(16, 185, 129, 0.15)',
              color: isPaused ? '#fbbf24' : '#34d399',
              border: isPaused ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(16, 185, 129, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            {isPaused ? <Pause size={10} /> : <Activity size={10} />}
            {isPaused ? (isHovered ? 'PAUSED (HOVERING)' : 'STREAM PAUSED') : 'STREAMING'}
          </span>
        </div>

        {/* Action Controls & Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          {/* Keyword Search */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={13} style={{ position: 'absolute', left: '8px', color: 'var(--muted-foreground)' }} />
            <input
              type="text"
              placeholder="Search thoughts, tickers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: '#121214',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '4px 8px 4px 26px',
                fontSize: '11.5px',
                color: '#f4f4f5',
                width: '180px',
                outline: 'none',
              }}
            />
          </div>

          {/* Pause / Resume Button */}
          <button
            type="button"
            className={`thought-filter-btn ${isPausedManual ? 'active' : ''}`}
            onClick={() => setIsPausedManual(!isPausedManual)}
            title={isPausedManual ? 'Resume Live Stream' : 'Pause Stream'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              background: isPausedManual ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
            }}
          >
            {isPausedManual ? <Play size={11} style={{ color: '#fbbf24' }} /> : <Pause size={11} />}
            <span style={{ fontSize: '11px', fontWeight: 600 }}>{isPausedManual ? 'RESUME' : 'PAUSE'}</span>
          </button>
        </div>
      </div>

      {/* 2. Filter Navigation Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(0, 0, 0, 0.25)',
          overflowX: 'auto',
        }}
      >
        <Filter size={13} style={{ color: 'var(--muted-foreground)', marginRight: '4px', flexShrink: 0 }} />
        {[
          { id: 'ALL', label: `All (${thoughts.length})` },
          { id: 'TRADES', label: '⚡ Real Trades' },
          { id: 'HIGH_CONVICTION', label: '🔥 High Conviction (≥80%)' },
          { id: 'Volt', label: 'Volt (Sniper)' },
          { id: 'Oracle', label: 'Oracle (Arb)' },
          { id: 'Titan', label: 'Titan (MM)' },
          { id: 'Sweeper', label: 'Sweeper' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`thought-filter-btn ${selectedFilter === tab.id ? 'active' : ''}`}
            onClick={() => setSelectedFilter(tab.id)}
            style={{
              fontSize: '11px',
              padding: '4px 10px',
              whiteSpace: 'nowrap',
              borderRadius: '6px',
              fontWeight: selectedFilter === tab.id ? 700 : 500,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 3. Executive Swarm Consensus Digest Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '10px',
          padding: '12px 16px',
          background: '#0d0d10',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {['VOLT', 'ORACLE', 'TITAN', 'SWEEPER'].map((agentKey) => {
          const theme = getAgentTheme(agentKey);
          const Icon = theme.Icon;
          const latestThought = latestByAgent.get(agentKey);

          return (
            <div
              key={agentKey}
              style={{
                background: '#16161a',
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                boxShadow: theme.glow,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon size={14} style={{ color: theme.color }} />
                  <span style={{ fontWeight: 700, fontSize: '12px', color: theme.color }}>{agentKey}</span>
                </div>
                <span style={{ fontSize: '9.5px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                  {theme.role}
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: '11px',
                  color: '#d4d4d8',
                  lineHeight: 1.3,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {latestThought ? latestThought.reasoningText : 'Scanning continuous multi-asset depth...'}
              </p>
            </div>
          );
        })}
      </div>

      {/* 4. Stream Feed List with Pause on Hover */}
      <div
        ref={containerRef}
        className="thought-stream-container"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {filteredThoughts.length === 0 ? (
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              color: 'var(--muted-foreground)',
            }}
          >
            <Activity size={28} style={{ color: '#00ffcc', opacity: 0.6 }} />
            <div>
              <p style={{ fontWeight: 600, fontSize: '13px', margin: '0 0 4px 0', color: '#f4f4f5' }}>
                {searchQuery ? `No thoughts match "${searchQuery}"` : 'Awaiting real-time swarm intelligence...'}
              </p>
              <p style={{ fontSize: '12px', margin: 0 }}>
                {searchQuery ? 'Try clearing your search query or selecting a different filter tab.' : 'Autonomous agents are actively evaluating live order books and spot drift.'}
              </p>
            </div>
          </div>
        ) : (
          filteredThoughts.map((thought) => {
            const theme = getAgentTheme(thought.agentType);
            const Icon = theme.Icon;
            const actionStyle = getActionBadgeStyle(thought.actionTaken);
            const timeString = new Date(thought.createdAt).toLocaleTimeString();
            const relTime = getRelativeTime(thought.createdAt);
            const confidencePct = Math.round(thought.confidence * 100);

            return (
              <div
                key={thought.id}
                className="thought-card"
                style={{
                  background: '#131316',
                  border: '1px solid var(--border)',
                  borderLeft: `3px solid ${theme.color}`,
                  borderRadius: '8px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Agent Pill */}
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: theme.bg,
                        border: `1px solid ${theme.border}`,
                        color: theme.color,
                        fontWeight: 700,
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      <Icon size={12} />
                      <span>{thought.agentType.toUpperCase()}</span>
                    </div>

                    {/* Action Pill */}
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        ...actionStyle,
                      }}
                    >
                      {thought.actionTaken}
                    </span>

                    {/* Trigger Event Badge */}
                    {thought.triggerEvent && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'var(--muted-foreground)',
                          background: '#1f1f23',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid #2e2e33',
                        }}
                      >
                        {thought.triggerEvent}
                      </span>
                    )}

                    {/* Repeat Count Indicator */}
                    {(thought as any).repeatCount > 1 && (
                      <span
                        style={{
                          fontSize: '9.5px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: '#a1a1aa',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          padding: '1px 5px',
                          borderRadius: '10px',
                        }}
                      >
                        {(thought as any).repeatCount}x
                      </span>
                    )}
                  </div>

                  {/* Right: Confidence & Timestamps */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        color: confidencePct >= 80 ? '#00ffcc' : '#f59e0b',
                        background: 'rgba(0, 255, 204, 0.08)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      <TrendingUp size={11} />
                      <span>{confidencePct}% Conviction</span>
                    </div>

                    <span
                      style={{
                        fontSize: '10.5px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--muted-foreground)',
                      }}
                    >
                      {relTime} ({timeString})
                    </span>
                  </div>
                </div>

                {/* Reasoning Body */}
                <div style={{ fontSize: '12.5px', color: '#e4e4e7', lineHeight: 1.45, letterSpacing: '0.01em' }}>
                  <p style={{ margin: 0 }}>{thought.reasoningText}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
