import React from 'react';
import {
  Square3Stack3DIcon,
  QueueListIcon,
  ViewfinderCircleIcon,
} from '@heroicons/react/24/outline';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  variant?: 'rectangular' | 'text' | 'circular' | 'badge';
  shimmer?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  borderRadius,
  variant = 'rectangular',
  shimmer = true,
  className = '',
  style,
  ...props
}) => {
  const getBorderRadius = () => {
    if (borderRadius !== undefined) {
      return typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius;
    }
    switch (variant) {
      case 'circular':
        return '50%';
      case 'text':
        return '4px';
      case 'badge':
        return '9999px';
      case 'rectangular':
      default:
        return '6px';
    }
  };

  const getHeight = () => {
    if (height !== undefined) {
      return typeof height === 'number' ? `${height}px` : height;
    }
    switch (variant) {
      case 'text':
        return '14px';
      case 'badge':
        return '20px';
      case 'circular':
        return width !== undefined ? (typeof width === 'number' ? `${width}px` : width) : '32px';
      case 'rectangular':
      default:
        return '100%';
    }
  };

  const getWidth = () => {
    if (width !== undefined) {
      return typeof width === 'number' ? `${width}px` : width;
    }
    switch (variant) {
      case 'text':
        return '100%';
      case 'badge':
        return '64px';
      case 'circular':
        return height !== undefined ? (typeof height === 'number' ? `${height}px` : height) : '32px';
      case 'rectangular':
      default:
        return '100%';
    }
  };

  return (
    <div
      className={`dreampulse-skeleton ${shimmer ? 'skeleton-shimmer' : ''} ${className}`}
      style={{
        width: getWidth(),
        height: getHeight(),
        borderRadius: getBorderRadius(),
        background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.03) 100%)',
        backgroundSize: '200% 100%',
        animation: shimmer ? 'skeleton-shimmer 1.8s ease-in-out infinite' : 'none',
        flexShrink: 0,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    />
  );
};

/**
 * 4 Top KPI Stat Metric Cards Skeleton
 */
export const StatCardsGridSkeleton: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Top Header Placeholder */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Skeleton variant="circular" width={8} height={8} />
          <Skeleton variant="text" width={180} height={12} />
          <Skeleton variant="badge" width={80} height={18} />
        </div>
        <Skeleton variant="rectangular" width={160} height={26} borderRadius={6} />
      </div>

      {/* 4 KPI Cards Grid */}
      <div className="metrics-stat-grid">
        {[1, 2, 3, 4].map((idx) => (
          <div key={idx} className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="stat-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton variant="text" width={110} height={12} />
              <Skeleton variant="circular" width={18} height={18} />
            </div>
            <div style={{ margin: '4px 0' }}>
              <Skeleton variant="text" width={140} height={26} borderRadius={4} />
            </div>
            <div className="stat-card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
              <Skeleton variant="badge" width={76} height={18} />
              <Skeleton variant="text" width={100} height={11} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Single Market Matrix Card Skeleton
 */
export const MarketCardSkeleton: React.FC = () => {
  return (
    <div className="p-3.5 rounded-xl border border-border/40 bg-secondary/20 flex flex-col justify-between select-none">
      {/* Card Top */}
      <div className="flex items-center justify-between pb-2 border-b border-border/30">
        <div className="flex items-center gap-1.5">
          <Skeleton variant="text" width={60} height={16} />
          <Skeleton variant="badge" width={32} height={16} />
        </div>
        <Skeleton variant="text" width={40} height={12} />
      </div>

      {/* Strike & Spot */}
      <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-secondary/30 border border-border/40 my-2.5">
        <div>
          <Skeleton variant="text" width={40} height={10} />
          <Skeleton variant="text" width={65} height={16} />
        </div>
        <div>
          <Skeleton variant="text" width={50} height={10} />
          <Skeleton variant="text" width={75} height={16} />
        </div>
      </div>

      {/* Probability bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <Skeleton variant="text" width={45} height={10} />
          <Skeleton variant="badge" width={60} height={14} />
          <Skeleton variant="text" width={45} height={10} />
        </div>
        <Skeleton variant="rectangular" width="100%" height={6} borderRadius={3} />
      </div>

      {/* Quotes Footer */}
      <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-border/30">
        <div className="flex gap-2">
          <Skeleton variant="text" width={45} height={14} />
          <Skeleton variant="text" width={45} height={14} />
        </div>
        <Skeleton variant="badge" width={55} height={18} />
      </div>
    </div>
  );
};

/**
 * Full Market Matrix Grid Skeleton
 */
export const MarketMatrixSkeleton: React.FC = () => {
  return (
    <div className="terminal-panel flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 pb-3 border-b border-border/40 flex flex-col gap-3 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Square3Stack3DIcon className="w-4 h-4 text-muted-foreground" />
            <Skeleton variant="text" width={160} height={14} />
            <Skeleton variant="badge" width={54} height={18} />
          </div>
          <Skeleton variant="rectangular" width={200} height={28} borderRadius={8} />
        </div>
        <div className="flex justify-between items-center pt-1 border-t border-border/30">
          <Skeleton variant="rectangular" width={240} height={24} borderRadius={6} />
          <Skeleton variant="rectangular" width={180} height={24} borderRadius={6} />
        </div>
      </div>

      {/* Grid of 6 cards */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 flex-1 overflow-y-auto">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <MarketCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
};

/**
 * CLOB Order Book Depth Panel Skeleton
 */
export const OrderBookDepthSkeleton: React.FC = () => {
  return (
    <div className="terminal-panel flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 pb-3 border-b border-border/40 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <QueueListIcon className="w-4 h-4 text-muted-foreground" />
          <Skeleton variant="text" width={140} height={14} />
          <Skeleton variant="badge" width={40} height={18} />
        </div>
        <div className="flex gap-1">
          <Skeleton variant="rectangular" width={75} height={24} borderRadius={6} />
          <Skeleton variant="rectangular" width={75} height={24} borderRadius={6} />
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 px-4 py-2 border-b border-border/40 bg-secondary/10 flex-shrink-0">
        <Skeleton variant="text" width={70} height={10} />
        <div className="flex justify-end"><Skeleton variant="text" width={70} height={10} /></div>
        <div className="flex justify-end"><Skeleton variant="text" width={70} height={10} /></div>
      </div>

      {/* Asks Ladder Skeleton */}
      <div className="p-2 flex flex-col gap-1 flex-1 justify-between">
        <div className="flex flex-col gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={`ask-skel-${i}`} className="grid grid-cols-3 items-center px-2.5 py-1">
              <Skeleton variant="text" width={50} height={12} />
              <div className="flex justify-end"><Skeleton variant="text" width={60} height={12} /></div>
              <div className="flex justify-end"><Skeleton variant="text" width={50} height={12} /></div>
            </div>
          ))}
        </div>

        {/* Spread Banner Skeleton */}
        <div className="grid grid-cols-3 p-2.5 my-2 rounded-lg bg-secondary/30 border border-border/40">
          <Skeleton variant="rectangular" height={28} borderRadius={4} />
          <Skeleton variant="rectangular" height={28} borderRadius={4} />
          <Skeleton variant="rectangular" height={28} borderRadius={4} />
        </div>

        {/* Bids Ladder Skeleton */}
        <div className="flex flex-col gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={`bid-skel-${i}`} className="grid grid-cols-3 items-center px-2.5 py-1">
              <Skeleton variant="text" width={50} height={12} />
              <div className="flex justify-end"><Skeleton variant="text" width={60} height={12} /></div>
              <div className="flex justify-end"><Skeleton variant="text" width={50} height={12} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Top Arbitrage Opportunities Table Skeleton
 */
export const OpportunityTableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#0e0e11', borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: '10px 20px', textAlign: 'left' }}><Skeleton variant="text" width={90} height={11} /></th>
            <th style={{ padding: '10px 16px', textAlign: 'left' }}><Skeleton variant="text" width={50} height={11} /></th>
            <th style={{ padding: '10px 16px', textAlign: 'left' }}><Skeleton variant="text" width={75} height={11} /></th>
            <th style={{ padding: '10px 16px', textAlign: 'left' }}><Skeleton variant="text" width={80} height={11} /></th>
            <th style={{ padding: '10px 16px', textAlign: 'left' }}><Skeleton variant="text" width={65} height={11} /></th>
            <th style={{ padding: '10px 16px', textAlign: 'left' }}><Skeleton variant="text" width={90} height={11} /></th>
            <th style={{ padding: '10px 20px', textAlign: 'right' }}><Skeleton variant="text" width={50} height={11} style={{ marginLeft: 'auto' }} /></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, idx) => (
            <tr key={`opp-skel-${idx}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '14px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Skeleton variant="text" width={55} height={14} />
                  <Skeleton variant="text" width={60} height={12} />
                </div>
              </td>
              <td style={{ padding: '14px 16px' }}><Skeleton variant="badge" width={34} height={18} /></td>
              <td style={{ padding: '14px 16px' }}><Skeleton variant="text" width={45} height={14} /></td>
              <td style={{ padding: '14px 16px' }}><Skeleton variant="text" width={45} height={14} /></td>
              <td style={{ padding: '14px 16px' }}><Skeleton variant="text" width={50} height={14} /></td>
              <td style={{ padding: '14px 16px' }}><Skeleton variant="badge" width={110} height={20} /></td>
              <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                <Skeleton variant="rectangular" width={65} height={24} borderRadius={4} style={{ marginLeft: 'auto' }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * On-Chain Order Execution History Ledger Skeleton (10 Rows)
 */
export const OrderHistoryTableSkeleton: React.FC<{ rows?: number }> = ({ rows = 10 }) => {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, idx) => (
        <tr key={`order-skel-${idx}`} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
          <td style={{ padding: '12px 16px' }}><Skeleton variant="text" width={65} height={12} /></td>
          <td style={{ padding: '12px 16px' }}><Skeleton variant="badge" width={75} height={20} /></td>
          <td style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Skeleton variant="text" width={60} height={13} />
              <Skeleton variant="badge" width={32} height={16} />
            </div>
          </td>
          <td style={{ padding: '12px 16px' }}><Skeleton variant="badge" width={65} height={18} /></td>
          <td style={{ padding: '12px 16px', textAlign: 'right' }}><Skeleton variant="text" width={45} height={13} style={{ marginLeft: 'auto' }} /></td>
          <td style={{ padding: '12px 16px', textAlign: 'right' }}><Skeleton variant="text" width={40} height={13} style={{ marginLeft: 'auto' }} /></td>
          <td style={{ padding: '12px 16px', textAlign: 'right' }}><Skeleton variant="text" width={55} height={13} style={{ marginLeft: 'auto' }} /></td>
          <td style={{ padding: '12px 16px', textAlign: 'right' }}><Skeleton variant="text" width={50} height={13} style={{ marginLeft: 'auto' }} /></td>
          <td style={{ padding: '12px 16px', textAlign: 'center' }}><Skeleton variant="badge" width={45} height={18} style={{ margin: '0 auto' }} /></td>
          <td style={{ padding: '12px 16px', textAlign: 'right' }}><Skeleton variant="text" width={65} height={12} style={{ marginLeft: 'auto' }} /></td>
          <td style={{ padding: '12px 16px', textAlign: 'center' }}><Skeleton variant="badge" width={50} height={18} style={{ margin: '0 auto' }} /></td>
        </tr>
      ))}
    </tbody>
  );
};

/**
 * Edge Radar & Heatmap Matrix Skeleton
 */
export const EdgeRadarHeatmapSkeleton: React.FC = () => {
  return (
    <div className="terminal-panel p-4 flex flex-col gap-3">
      <div className="flex justify-between items-center pb-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <ViewfinderCircleIcon className="w-4 h-4 text-muted-foreground" />
          <Skeleton variant="text" width={220} height={14} />
          <Skeleton variant="badge" width={90} height={18} />
        </div>
        <div className="flex gap-3">
          <Skeleton variant="text" width={80} height={12} />
          <Skeleton variant="text" width={80} height={12} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {/* Header row */}
        <div className="grid grid-cols-[100px_repeat(3,1fr)] gap-2.5">
          <Skeleton variant="rectangular" height={24} borderRadius={4} />
          <Skeleton variant="rectangular" height={24} borderRadius={4} />
          <Skeleton variant="rectangular" height={24} borderRadius={4} />
          <Skeleton variant="rectangular" height={24} borderRadius={4} />
        </div>

        {/* BTC Row */}
        <div className="grid grid-cols-[100px_repeat(3,1fr)] gap-2.5">
          <Skeleton variant="rectangular" height={72} borderRadius={8} />
          <Skeleton variant="rectangular" height={72} borderRadius={8} />
          <Skeleton variant="rectangular" height={72} borderRadius={8} />
          <Skeleton variant="rectangular" height={72} borderRadius={8} />
        </div>

        {/* ETH Row */}
        <div className="grid grid-cols-[100px_repeat(3,1fr)] gap-2.5">
          <Skeleton variant="rectangular" height={72} borderRadius={8} />
          <Skeleton variant="rectangular" height={72} borderRadius={8} />
          <Skeleton variant="rectangular" height={72} borderRadius={8} />
          <Skeleton variant="rectangular" height={72} borderRadius={8} />
        </div>
      </div>
    </div>
  );
};

/**
 * Sweeper Settlement Dashboard Skeleton
 */
export const SweeperHistorySkeleton: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 3 Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton variant="text" width={120} height={11} />
              <Skeleton variant="badge" width={60} height={16} />
            </div>
            <Skeleton variant="text" width={110} height={22} />
          </div>
        ))}
      </div>

      {/* Redemption Table */}
      <div className="terminal-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Skeleton variant="text" width={180} height={14} />
          <Skeleton variant="text" width={100} height={11} />
        </div>
        <table className="terminal-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {[1, 2, 3, 4, 5].map((i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <td style={{ padding: '12px 16px' }}><Skeleton variant="text" width={110} height={12} /></td>
                <td style={{ padding: '12px 16px' }}><Skeleton variant="text" width={80} height={13} /></td>
                <td style={{ padding: '12px 16px' }}><Skeleton variant="badge" width={55} height={18} /></td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}><Skeleton variant="text" width={75} height={13} style={{ marginLeft: 'auto' }} /></td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}><Skeleton variant="badge" width={70} height={16} style={{ margin: '0 auto' }} /></td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}><Skeleton variant="text" width={60} height={12} style={{ marginLeft: 'auto' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * AI Swarm Thought Feed Skeleton
 */
export const AgentThoughtFeedSkeleton: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
      {/* 4 Consensus Digest Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ background: '#16161a', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Skeleton variant="circular" width={14} height={14} />
                <Skeleton variant="text" width={60} height={12} />
              </div>
              <Skeleton variant="text" width={50} height={10} />
            </div>
            <Skeleton variant="text" width="100%" height={11} />
            <Skeleton variant="text" width="75%" height={11} />
          </div>
        ))}
      </div>

      {/* Stream Thoughts List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '4px 0' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Skeleton variant="badge" width={80} height={20} />
                <Skeleton variant="badge" width={60} height={18} />
              </div>
              <Skeleton variant="text" width={55} height={11} />
            </div>
            <Skeleton variant="text" width="95%" height={13} />
            <Skeleton variant="text" width="60%" height={13} />
          </div>
        ))}
      </div>
    </div>
  );
};

import { Spinner } from './Spinner.js';

export interface StrategyStudioSkeletonProps {
  agentName?: string;
  symbol?: string;
  timeframe?: string;
  period?: string;
  color?: string;
}

/**
 * Strategy Studio Simulation Scorecards & Chart Skeleton
 */
export const StrategyStudioSkeleton: React.FC<StrategyStudioSkeletonProps> = ({
  agentName = 'Quantitative Strategy',
  symbol = 'BTC/USD',
  timeframe = '5m',
  period = '7d',
  color = '#00ffcc',
}) => {
  return (
    <div className="flex flex-col gap-3.5">
      {/* Simulation Calculating Status Banner HUD */}
      <div
        className="terminal-panel p-3.5 border rounded-xl flex items-center justify-between gap-3 overflow-hidden relative"
        style={{
          borderColor: `${color}40`,
          background: `linear-gradient(90deg, ${color}10 0%, rgba(255,255,255,0.02) 50%, ${color}08 100%)`,
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 border"
            style={{
              background: `${color}18`,
              borderColor: `${color}40`,
              color,
            }}
          >
            <Spinner size="sm" style={{ color }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-foreground truncate">
                Simulating {agentName}
              </span>
              <span
                className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border"
                style={{
                  background: `${color}15`,
                  borderColor: `${color}35`,
                  color,
                }}
              >
                {symbol} · {timeframe} · {period.toUpperCase()}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Replaying bar-by-bar historical market candles on Somnia CLOB with microstructure friction & slippage...
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-muted-foreground flex-shrink-0">
          <span className="inline-block w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: color }} />
          <span>Computing Alpha Metrics</span>
        </div>
      </div>

      {/* 8 Stat Cards Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          'Net Strategy PnL',
          'Win Rate',
          'Sharpe Ratio',
          'Sortino Ratio',
          'Max Drawdown',
          'Profit Factor',
          'Trade Expectancy',
          'Fleet Automation',
        ].map((label, idx) => (
          <div key={idx} className="terminal-panel p-3.5 flex flex-col justify-between min-h-[96px]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">
                {label}
              </span>
              <Skeleton variant="circular" width={14} height={14} />
            </div>
            <div className="my-1.5">
              <Skeleton variant="text" width={idx % 2 === 0 ? '70%' : '55%'} height={24} borderRadius={4} />
            </div>
            <Skeleton variant="text" width="45%" height={10} />
          </div>
        ))}
      </div>

      {/* Chart Canvas Skeleton */}
      <div className="terminal-panel p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40 flex-wrap">
          <div className="flex items-center gap-2">
            <Skeleton variant="rectangular" width={130} height={28} borderRadius={6} />
            <Skeleton variant="rectangular" width={145} height={28} borderRadius={6} />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton variant="text" width={90} height={14} />
            <Skeleton variant="text" width={90} height={14} />
            <Skeleton variant="text" width={90} height={14} />
          </div>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="w-full h-[240px] rounded-lg border border-border/30 bg-secondary/10 relative overflow-hidden flex items-center justify-center">
            {/* Ambient scanline placeholder */}
            <svg className="w-full h-full opacity-20 absolute inset-0" preserveAspectRatio="none">
              <line x1="24" y1="24" x2="96%" y2="24" stroke="currentColor" strokeDasharray="3 3" />
              <line x1="24" y1="120" x2="96%" y2="120" stroke="currentColor" strokeDasharray="3 3" />
              <line x1="24" y1="216" x2="96%" y2="216" stroke="currentColor" />
            </svg>
            <div className="flex flex-col items-center gap-2 z-10">
              <Spinner size="md" style={{ color }} />
              <span className="text-xs font-mono text-muted-foreground">Synthesizing Equity Curve & Drawdown Vectors...</span>
            </div>
          </div>
        </div>
      </div>

      {/* Executions Table Skeleton */}
      <div className="terminal-panel p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <QueueListIcon className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-bold tracking-tight text-foreground">Replay Executions Breakdown</span>
          </div>
          <Skeleton variant="badge" width={80} height={20} />
        </div>
        <div className="p-3 flex flex-col gap-2">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between py-2 px-2 border-b border-border/20 gap-3">
              <Skeleton variant="text" width={60} height={12} />
              <Skeleton variant="text" width={90} height={12} />
              <Skeleton variant="badge" width={40} height={16} />
              <Skeleton variant="text" width={65} height={12} />
              <Skeleton variant="text" width={40} height={12} />
              <Skeleton variant="text" width={70} height={12} />
              <Skeleton variant="text" width={50} height={12} />
              <Skeleton variant="text" width={70} height={12} />
              <Skeleton variant="text" width={85} height={12} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
