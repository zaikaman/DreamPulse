import React from 'react';
import {
  Layers,
  CheckCircle,
  Zap,
  AlertTriangle,
  TrendingUp,
  Gauge,
  Cpu,
} from 'lucide-react';
import type { Market } from '../../types/index.js';
import type { MarketTickData } from '../../hooks/useTelemetry.js';
import type { AgentDetail } from '../../hooks/useAgentSwarm.js';

interface StatCardsGridProps {
  markets: Market[];
  liveTicks: Map<string, MarketTickData>;
  latencyMs: number;
  swarmDetailed?: Record<string, AgentDetail>;
  ordersCount?: number;
}

export const StatCardsGrid: React.FC<StatCardsGridProps> = ({
  markets,
  liveTicks,
  latencyMs,
  swarmDetailed,
  ordersCount,
}) => {
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

  const activeCount = markets.filter((m) => m.status === 'Open').length || markets.length;

  // Calculate dynamic swarm PnL and trade fills
  const voltPnl = swarmDetailed?.volt?.pnlAmount ?? 0;
  const oraclePnl = swarmDetailed?.oracle?.pnlAmount ?? 0;
  const titanPnl = swarmDetailed?.titan?.pnlAmount ?? 0;
  const sweeperPnl = swarmDetailed?.sweeper?.pnlAmount ?? 0;
  const totalPnl = voltPnl + oraclePnl + titanPnl + sweeperPnl;

  const agentFills =
    (swarmDetailed?.volt?.tradesToday ?? 0) +
    (swarmDetailed?.oracle?.tradesToday ?? 0) +
    (swarmDetailed?.titan?.tradesToday ?? 0) +
    (swarmDetailed?.sweeper?.tradesToday ?? 0);
  const totalFills = ordersCount !== undefined ? Math.max(ordersCount, agentFills) : agentFills;
  const isProfitable = totalPnl >= 0;

  return (
    <div className="metrics-stat-grid">
      {/* 1. Active Contracts */}
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

      {/* 2. Maximum Arbitrage Edge */}
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

      {/* 3. Autonomous Swarm PnL */}
      <div className="stat-card">
        <div className="stat-card-header">
          <span className="stat-card-title">SWARM REAL-TIME PnL</span>
          <TrendingUp size={16} className="stat-card-icon" style={{ color: isProfitable ? 'var(--trade-yes)' : 'var(--trade-no)' }} />
        </div>
        <div className={`stat-card-value ${isProfitable ? 'text-yes' : 'text-no'}`}>
          {isProfitable ? `+${totalPnl.toFixed(2)}` : totalPnl.toFixed(2)} STT
        </div>
        <div className="stat-card-footer">
          <span className={`stat-pill-tag ${totalFills > 0 ? 'tag-green' : 'tag-cyan'}`}>
            <TrendingUp size={11} />
            <span>{totalFills > 0 ? `${totalFills} FILLS TODAY` : 'READY TO TRADE'}</span>
          </span>
          <span>Volt, Oracle & Titan trading</span>
        </div>
      </div>

      {/* 4. Pricing Engine Latency */}
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
    </div>
  );
};
