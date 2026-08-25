import React from 'react';
import {
  Layers,
  ListOrdered,
  Crosshair,
} from 'lucide-react';

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
    <div
      className="matrix-card"
      style={{
        background: '#121216',
        borderColor: 'var(--border)',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '14px',
        borderRadius: '8px',
      }}
    >
      {/* Card Top */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Skeleton variant="rectangular" width={60} height={20} borderRadius={4} />
          <Skeleton variant="badge" width={36} height={18} />
        </div>
        <Skeleton variant="rectangular" width={68} height={20} borderRadius={4} />
      </div>

      {/* Strike & Spot */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Skeleton variant="text" width={40} height={9} />
          <Skeleton variant="text" width={75} height={18} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
          <Skeleton variant="text" width={55} height={9} />
          <Skeleton variant="text" width={80} height={16} />
        </div>
      </div>

      {/* Probability bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Skeleton variant="text" width={45} height={10} />
          <Skeleton variant="badge" width={70} height={16} />
          <Skeleton variant="text" width={45} height={10} />
        </div>
        <Skeleton variant="rectangular" width="100%" height={6} borderRadius={3} />
      </div>

      {/* Quotes Footer */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginTop: '4px' }}>
        <Skeleton variant="rectangular" height={26} borderRadius={4} />
        <Skeleton variant="rectangular" height={26} borderRadius={4} />
        <Skeleton variant="rectangular" height={26} borderRadius={4} />
      </div>
    </div>
  );
};

/**
 * Full Market Matrix Grid Skeleton
 */
export const MarketMatrixSkeleton: React.FC = () => {
  return (
    <div className="terminal-panel market-matrix-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="terminal-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={16} style={{ color: 'var(--brand-cyan)' }} />
          <Skeleton variant="text" width={160} height={14} />
          <Skeleton variant="badge" width={54} height={18} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Skeleton variant="rectangular" width={140} height={24} borderRadius={6} />
          <Skeleton variant="rectangular" width={80} height={24} borderRadius={6} />
        </div>
      </div>

      {/* Grid of 6 cards */}
      <div className="matrix-grid" style={{ flex: 1, padding: '14px', overflowY: 'auto' }}>
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
    <div className="terminal-panel orderbook-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="terminal-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ListOrdered size={16} style={{ color: 'var(--brand-cyan)' }} />
          <Skeleton variant="text" width={140} height={14} />
          <Skeleton variant="badge" width={40} height={18} />
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Skeleton variant="rectangular" width={65} height={22} borderRadius={4} />
          <Skeleton variant="rectangular" width={65} height={22} borderRadius={4} />
        </div>
      </div>

      {/* Column Headers */}
      <div className="book-table-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 14px' }}>
        <Skeleton variant="text" width={70} height={10} />
        <Skeleton variant="text" width={70} height={10} />
        <Skeleton variant="text" width={70} height={10} />
      </div>

      {/* Asks Ladder Skeleton */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 14px' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={`ask-skel-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '22px' }}>
            <Skeleton variant="text" width={50} height={12} />
            <Skeleton variant="text" width={60} height={12} />
            <Skeleton variant="text" width={50} height={12} />
          </div>
        ))}
      </div>

      {/* Spread Banner Skeleton */}
      <div className="book-spread-banner" style={{ margin: '8px 14px', padding: '10px 14px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.02)', display: 'flex', justifyContent: 'space-between' }}>
        <Skeleton variant="rectangular" width={80} height={28} borderRadius={4} />
        <Skeleton variant="rectangular" width={80} height={28} borderRadius={4} />
        <Skeleton variant="rectangular" width={80} height={28} borderRadius={4} />
      </div>

      {/* Bids Ladder Skeleton */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 14px' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={`bid-skel-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '22px' }}>
            <Skeleton variant="text" width={50} height={12} />
            <Skeleton variant="text" width={60} height={12} />
            <Skeleton variant="text" width={50} height={12} />
          </div>
        ))}
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
    <div className="terminal-panel edge-radar-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '18px' }}>
      <div className="terminal-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Crosshair size={16} style={{ color: 'var(--brand-cyan)' }} />
          <Skeleton variant="text" width={220} height={14} />
          <Skeleton variant="badge" width={90} height={18} />
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Skeleton variant="text" width={80} height={12} />
          <Skeleton variant="text" width={80} height={12} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 1fr', gap: '10px' }}>
        {/* Header row */}
        <Skeleton variant="rectangular" height={32} borderRadius={4} />
        <Skeleton variant="rectangular" height={32} borderRadius={4} />
        <Skeleton variant="rectangular" height={32} borderRadius={4} />
        <Skeleton variant="rectangular" height={32} borderRadius={4} />

        {/* BTC Row */}
        <Skeleton variant="rectangular" height={80} borderRadius={6} />
        <Skeleton variant="rectangular" height={80} borderRadius={6} />
        <Skeleton variant="rectangular" height={80} borderRadius={6} />
        <Skeleton variant="rectangular" height={80} borderRadius={6} />

        {/* ETH Row */}
        <Skeleton variant="rectangular" height={80} borderRadius={6} />
        <Skeleton variant="rectangular" height={80} borderRadius={6} />
        <Skeleton variant="rectangular" height={80} borderRadius={6} />
        <Skeleton variant="rectangular" height={80} borderRadius={6} />
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

/**
 * Strategy Studio Simulation Scorecards & Chart Skeleton
 */
export const StrategyStudioSkeleton: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Scorecards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px' }}>
            <div className="stat-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton variant="text" width={85} height={11} />
              <Skeleton variant="circular" width={14} height={14} />
            </div>
            <Skeleton variant="text" width={90} height={22} />
            <Skeleton variant="text" width={110} height={10} />
          </div>
        ))}
      </div>

      {/* Chart Canvas Skeleton */}
      <div className="terminal-panel" style={{ padding: '20px', height: '300px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <Skeleton variant="rectangular" width={120} height={26} borderRadius={4} />
            <Skeleton variant="rectangular" width={140} height={26} borderRadius={4} />
          </div>
          <div style={{ display: 'flex', gap: '14px' }}>
            <Skeleton variant="text" width={80} height={12} />
            <Skeleton variant="text" width={80} height={12} />
          </div>
        </div>
        <Skeleton variant="rectangular" width="100%" height="100%" borderRadius={8} />
      </div>
    </div>
  );
};
