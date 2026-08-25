import React, { useState } from 'react';
import {
  Terminal,
  Play,
  Pause,
  Zap,
  Brain,
  Shield,
  Sparkles,
  Cpu,
  Loader2,
} from 'lucide-react';
import type { AgentThoughtLog } from '../types/index.js';

interface AgentThoughtFeedProps {
  thoughts: AgentThoughtLog[];
  isConnected: boolean;
}

export const AgentThoughtFeed: React.FC<AgentThoughtFeedProps> = ({ thoughts, isConnected }) => {
  const [selectedAgent, setSelectedAgent] = useState<string>('ALL');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const filteredThoughts = thoughts.filter((t) => {
    if (selectedAgent === 'ALL') return true;
    return t.agentType.toLowerCase() === selectedAgent.toLowerCase();
  });

  const getAgentTheme = (agent: string) => {
    switch (agent.toLowerCase()) {
      case 'volt':
        return {
          color: '#ffb700',
          bg: 'rgba(255, 183, 0, 0.12)',
          border: 'rgba(255, 183, 0, 0.35)',
          Icon: Zap,
        };
      case 'oracle':
        return {
          color: '#00ffcc',
          bg: 'rgba(0, 255, 204, 0.12)',
          border: 'rgba(0, 255, 204, 0.35)',
          Icon: Brain,
        };
      case 'titan':
        return {
          color: '#b388ff',
          bg: 'rgba(179, 136, 255, 0.12)',
          border: 'rgba(179, 136, 255, 0.35)',
          Icon: Shield,
        };
      case 'sweeper':
        return {
          color: '#00e676',
          bg: 'rgba(0, 230, 118, 0.12)',
          border: 'rgba(0, 230, 118, 0.35)',
          Icon: Sparkles,
        };
      default:
        return {
          color: '#ffffff',
          bg: 'rgba(255, 255, 255, 0.1)',
          border: 'rgba(255, 255, 255, 0.2)',
          Icon: Cpu,
        };
    }
  };

  return (
    <div className="terminal-panel thought-feed-panel">
      <div className="terminal-panel-header">
        <div className="panel-title">
          <Terminal size={16} />
          <span>Live AI Swarm Thought Stream</span>
          <span className={`badge ${isConnected ? 'badge-yes' : 'badge-no'}`}>
            <span className="live-dot"></span>
            {isConnected ? 'STREAMING' : 'DISCONNECTED'}
          </span>
        </div>

        {/* Agent Filter Tabs & Auto-Scroll Toggle */}
        <div className="thought-filters">
          <button
            type="button"
            className={`thought-filter-btn ${autoScroll ? 'active' : ''}`}
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll paused'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            {autoScroll ? <Play size={10} /> : <Pause size={10} />}
            <span>{autoScroll ? 'LIVE' : 'PAUSED'}</span>
          </button>

          {['ALL', 'Volt', 'Oracle', 'Titan', 'Sweeper'].map((agent) => (
            <button
              key={agent}
              type="button"
              className={`thought-filter-btn ${selectedAgent === agent ? 'active' : ''}`}
              onClick={() => setSelectedAgent(agent)}
            >
              {agent}
            </button>
          ))}
        </div>
      </div>

      {/* Feed List */}
      <div className="thought-stream-container">
        {filteredThoughts.length === 0 ? (
          <div className="thought-empty-state">
            <Loader2 size={22} className="animate-spin" />
            <p>Awaiting real-time agent reasoning broadcasts...</p>
          </div>
        ) : (
          filteredThoughts.map((thought) => {
            const theme = getAgentTheme(thought.agentType);
            const Icon = theme.Icon;
            const time = new Date(thought.createdAt).toLocaleTimeString();
            const confidencePct = Math.round(thought.confidence * 100);

            return (
              <div key={thought.id} className="thought-card">
                {/* Header Row */}
                <div className="thought-header-row">
                  <div
                    className="thought-agent-badge"
                    style={{
                      color: theme.color,
                      backgroundColor: theme.bg,
                      borderColor: theme.border,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Icon size={11} />
                    <span>{thought.agentType.toUpperCase()}</span>
                  </div>

                  <span className="thought-action-tag">{thought.actionTaken}</span>

                  <div className="thought-confidence-pill">
                    <span className="conf-label">CONFIDENCE</span>
                    <span className="conf-val tabular-num">{confidencePct}%</span>
                  </div>

                  <span className="thought-timestamp tabular-num">{time}</span>
                </div>

                {/* Thought Rationale Body */}
                <div className="thought-body">
                  <p>{thought.reasoningText}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
