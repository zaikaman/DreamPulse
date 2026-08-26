import React, { useMemo, useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  PieChart,
  Calendar,
  Download,
  Wallet,
  Bot,
  Eye,
  Target,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Shield,
  Brain,
  Timer,
  Award,
  AlertTriangle,
  RefreshCw,
  LineChart,
  Gauge,
  Flame,
} from 'lucide-react';
import { useAnalytics, type AnalyticsRange, type EquityPoint, type DailyBar } from '../../hooks/useAnalytics.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import { useUserRole } from '../../hooks/useUserRole.js';
import { Spinner } from '../ui/Spinner.js';
import { Pagination } from '../ui/Pagination.js';

// ---------- Small SVG Chart Helpers ----------

const EquityCurveChart: React.FC<{ user: EquityPoint[]; swarm: EquityPoint[]; height?: number }> = ({ user, swarm, height = 220 }) => {
  const width = 800;
  const padding = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const all = [...user, ...swarm];
  if (all.length === 0) {
    return (
      <div style={{ height, display: 'grid', placeItems: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
        No balance history yet — trades will populate this curve after settlement.
      </div>
    );
  }
  const min = Math.min(0, ...all.map((p) => p.cumulativePnl));
  const max = Math.max(1, ...all.map((p) => p.cumulativePnl));
  const range = max - min || 1;

  const toPath = (pts: EquityPoint[]) => {
    if (pts.length === 0) return '';
    return pts
      .map((p, i) => {
        const x = padding.left + i * (innerW / Math.max(1, pts.length - 1 || 1));
        const y = padding.top + innerH - ((p.cumulativePnl - min) / range) * innerH;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  // For swarm, map its own index spacing to same x scale as user (aligned by date)
  // We assume both arrays share same daily dates (service generates same date range)
  const userPath = toPath(user);
  const swarmPath = toPath(swarm);

  const yTicks = 4;
  const yLabels: { y: number; v: number }[] = [];
  for (let i = 0; i <= yTicks; i++) {
    const v = min + (range * i) / yTicks;
    const y = padding.top + innerH - ((v - min) / range) * innerH;
    yLabels.push({ y, v });
  }

  // Zero line
  const zeroY = padding.top + innerH - ((0 - min) / range) * innerH;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height, display: 'block' }}>
        {/* grid */}
        {yLabels.map((t, idx) => (
          <g key={idx}>
            <line x1={padding.left} x2={width - padding.right} y1={t.y} y2={t.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray={idx === 0 || idx === yTicks ? '0' : '3 3'} />
            <text x={padding.left - 8} y={t.y + 3} textAnchor="end" fontSize={10} fill="#a1a1aa" fontFamily="var(--font-mono)">
              {t.v >= 0 ? `+${t.v.toFixed(0)}` : t.v.toFixed(0)}
            </text>
          </g>
        ))}
        {/* zero line highlight */}
        <line x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
        {/* swarm area fill */}
        {swarm.length > 1 && (
          <path
            d={`${swarmPath} L ${padding.left + innerW} ${zeroY} L ${padding.left} ${zeroY} Z`}
            fill="rgba(245,158,11,0.08)"
            stroke="none"
          />
        )}
        {/* user area fill */}
        {user.length > 1 && (
          <path
            d={`${userPath} L ${padding.left + innerW} ${zeroY} L ${padding.left} ${zeroY} Z`}
            fill="rgba(0,255,204,0.08)"
            stroke="none"
          />
        )}
        {/* lines */}
        {swarm.length > 1 && <path d={swarmPath} fill="none" stroke="#f59e0b" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6 4" opacity={0.9} />}
        {user.length > 1 && <path d={userPath} fill="none" stroke="#00ffcc" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />}
        {/* dots for last point */}
        {user.length > 0 && (() => {
          const last = user[user.length - 1];
          const x = padding.left + (user.length - 1) * (innerW / Math.max(1, user.length - 1));
          const y = padding.top + innerH - ((last.cumulativePnl - min) / range) * innerH;
          return <circle cx={x} cy={y} r={3.5} fill="#00ffcc" stroke="#09090b" strokeWidth={2} />;
        })()}
        {swarm.length > 0 && user.length > 0 && (() => {
          const last = swarm[swarm.length - 1];
          const x = padding.left + (swarm.length - 1) * (innerW / Math.max(1, swarm.length - 1));
          const y = padding.top + innerH - ((last.cumulativePnl - min) / range) * innerH;
          return <circle cx={x} cy={y} r={3} fill="#f59e0b" stroke="#09090b" strokeWidth={1.5} />;
        })()}
        {/* x labels (sparse) */}
        {user.map((p, i) => {
          if (user.length > 14 && i % Math.ceil(user.length / 6) !== 0) return null;
          const x = padding.left + i * (innerW / Math.max(1, user.length - 1));
          return (
            <text key={p.date} x={x} y={height - 6} textAnchor="middle" fontSize={9} fill="#71717a" fontFamily="var(--font-mono)">
              {p.date.slice(5)}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

const DailyPnlBars: React.FC<{ data: DailyBar[]; height?: number }> = ({ data, height = 180 }) => {
  const width = 800;
  const padding = { top: 12, right: 12, bottom: 28, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  if (data.length === 0) {
    return <div style={{ height, display: 'grid', placeItems: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>No daily PnL yet.</div>;
  }
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.pnl)), 1);
  const yMax = maxAbs * 1.15 || 1;
  const barW = Math.max(2, innerW / data.length - 2);
  const zeroY = padding.top + innerH / 2;

  // scale: top = +yMax, bottom = -yMax
  const yScale = (v: number) => {
    // v in [-yMax, yMax] -> y in [top, bottom]
    return padding.top + innerH / 2 - (v / yMax) * (innerH / 2 - 4);
  };

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height, display: 'block' }}>
        {/* grid */}
        {[yMax, yMax / 2, 0, -yMax / 2, -yMax].map((v, idx) => (
          <g key={idx}>
            <line x1={padding.left} x2={width - padding.right} y1={yScale(v)} y2={yScale(v)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray={v === 0 ? '0' : '3 3'} />
            <text x={padding.left - 8} y={yScale(v) + 3} textAnchor="end" fontSize={10} fill="#a1a1aa" fontFamily="var(--font-mono)">
              {v >= 0 ? `+${v.toFixed(0)}` : v.toFixed(0)}
            </text>
          </g>
        ))}
        {/* zero line */}
        <line x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
        {data.map((d, i) => {
          const x = padding.left + i * (innerW / data.length) + 1;
          const y = d.pnl >= 0 ? yScale(d.pnl) : zeroY;
          const h = Math.abs(yScale(d.pnl) - zeroY);
          const isPos = d.pnl >= 0;
          const safeH = Math.max(1.5, h);
          return (
            <g key={d.date}>
              <rect x={x} y={y} width={barW} height={safeH} rx={2} fill={isPos ? '#10b981' : '#f43f5e'} opacity={0.9} />
              {Math.abs(d.pnl) > yMax * 0.12 && (
                <text x={x + barW / 2} y={isPos ? y - 4 : y + safeH + 10} textAnchor="middle" fontSize={8} fill={isPos ? '#10b981' : '#f43f5e'} fontFamily="var(--font-mono)" fontWeight={700}>
                  {d.pnl > 0 ? `+${d.pnl.toFixed(1)}` : d.pnl.toFixed(1)}
                </text>
              )}
            </g>
          );
        })}
        {/* x labels sparse */}
        {data.map((p, i) => {
          if (data.length > 14 && i % Math.ceil(data.length / 6) !== 0) return null;
          const x = padding.left + i * (innerW / data.length) + barW / 2;
          return (
            <text key={p.date} x={x} y={height - 6} textAnchor="middle" fontSize={9} fill="#71717a" fontFamily="var(--font-mono)">
              {p.date.slice(5)}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

const Donut: React.FC<{ data: { label: string; value: number; color: string }[]; size?: number }> = ({ data, size = 140 }) => {
  const total = data.reduce((a, b) => a + Math.abs(b.value), 0) || 1;
  let acc = 0;
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const strokeW = 14;

  const segments = data.map((d) => {
    const val = Math.abs(d.value);
    const pct = val / total;
    const angle = pct * 360;
    const start = acc;
    const end = acc + angle;
    acc = end;
    // SVG arc
    const large = angle > 180 ? 1 : 0;
    const rad = (deg: number) => (deg - 90) * (Math.PI / 180);
    const x1 = cx + r * Math.cos(rad(start));
    const y1 = cy + r * Math.sin(rad(start));
    const x2 = cx + r * Math.cos(rad(end));
    const y2 = cy + r * Math.sin(rad(end));
    const dPath = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
    return { ...d, pct, dPath };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeW} />
        {segments.map((s, i) => (
          <path key={i} d={s.dPath} fill="none" stroke={s.color} strokeWidth={strokeW} strokeLinecap="round" />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={14} fontWeight={800} fill="#fafafa" fontFamily="var(--font-mono)">
          {total.toFixed(0)}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill="#a1a1aa" fontFamily="var(--font-mono)">
          TRADES
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />
              <span style={{ fontSize: 11, color: '#d4d4d8', fontWeight: 600 }}>{s.label}</span>
            </div>
            <span style={{ fontSize: 11, color: '#a1a1aa', fontFamily: 'var(--font-mono)' }}>{(s.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------- Main View ----------

interface AnalyticsViewProps {
  wallet: WalletState;
  onConnectWallet?: () => Promise<void>;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ wallet, onConnectWallet }) => {
  const { isGuest, isOperator } = useUserRole(wallet);
  const { data, isLoading, error, range, setRange, refresh } = useAnalytics(wallet, '30d');
  const [showSwarm, setShowSwarm] = useState(true);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(10);

  const rangeOptions: { id: AnalyticsRange; label: string }[] = [
    { id: '24h', label: '24H' },
    { id: '7d', label: '7D' },
    { id: '30d', label: '30D' },
    { id: '90d', label: '90D' },
    { id: 'ALL', label: 'ALL' },
  ];

  const summary = data?.summary;

  // Ledger pagination (newest first)
  const ledgerRows = useMemo(() => {
    if (!data?.ledger) return [];
    return [...data.ledger].reverse();
  }, [data?.ledger]);

  const totalLedgerPages = Math.max(1, Math.ceil(ledgerRows.length / ledgerPageSize));

  // Reset/clamp ledgerPage on range or pageSize change
  useEffect(() => {
    setLedgerPage(1);
  }, [range]);

  useEffect(() => {
    if (ledgerPage > totalLedgerPages) {
      setLedgerPage(totalLedgerPages);
    }
  }, [totalLedgerPages, ledgerPage]);

  const pagedLedger = useMemo(() => {
    const start = (ledgerPage - 1) * ledgerPageSize;
    return ledgerRows.slice(start, start + ledgerPageSize);
  }, [ledgerRows, ledgerPage, ledgerPageSize]);

  const exportCsv = () => {
    if (!data) return;
    const header = 'date,startBalance,endBalance,dailyPnl,trades,wins,losses,volume\n';
    const rows = data.ledger.map((r) => `${r.date},${r.startBalance},${r.endBalance},${r.dailyPnl},${r.trades},${r.wins},${r.losses},${r.volume}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dreampulse-analytics-${data.range}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading && !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="terminal-panel" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
          <Spinner size="sm" variant="cyan" />
          <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Aggregating transparent on-chain ledger & swarm telemetry…</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="terminal-panel" style={{ height: 92, background: '#111114', border: '1px solid var(--border)', borderRadius: 12 }} />
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="terminal-panel" style={{ padding: 24, textAlign: 'center' }}>
        <AlertTriangle size={28} style={{ color: '#f59e0b', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 13, color: '#fafafa', fontWeight: 600, marginBottom: 6 }}>Analytics temporarily unavailable</div>
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 14 }}>{error}</div>
        <button type="button" className="btn-glow" onClick={() => refresh()}>
          <RefreshCw size={14} /> <span>Retry</span>
        </button>
      </div>
    );
  }

  const userCurve = data?.equityCurve || [];
  const swarmCurve = data?.swarmEquityCurve || [];
  const dailyBars = data?.dailyBars || [];

  const isUserPositive = (summary?.totalPnl ?? 0) >= 0;
  const swarmTotal = swarmCurve.length ? swarmCurve[swarmCurve.length - 1].cumulativePnl : 0;
  const isSwarmPositive = swarmTotal >= 0;
  const delta = (summary?.totalPnl ?? 0) - swarmTotal;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 32 }}>
      {/* Header Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,255,204,0.10)', border: '1px solid rgba(0,255,204,0.25)', display: 'grid', placeItems: 'center', color: 'var(--brand-cyan)' }}>
            <LineChart size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fafafa', letterSpacing: '-0.02em' }}>Analytics & Balance Transparency</h2>
              <span className="stat-pill-tag tag-cyan" style={{ fontSize: 10, padding: '2px 6px' }}>LIVE LEDGER</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>
              Verifiable per-settlement PnL • User vs Operator swarm equity • <span style={{ color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : ''}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', padding: 3, background: '#141417', border: '1px solid var(--border)', borderRadius: 8, gap: 2 }}>
            {rangeOptions.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setRange(r.id);
                  setLedgerPage(1);
                }}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: range === r.id ? 700 : 500,
                  fontFamily: 'var(--font-mono)',
                  background: range === r.id ? '#27272a' : 'transparent',
                  color: range === r.id ? '#fff' : '#a1a1aa',
                  border: range === r.id ? '1px solid var(--border)' : '1px solid transparent',
                  cursor: 'pointer',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn-secondary" onClick={() => refresh()} style={{ padding: '6px 10px', fontSize: 11 }}>
            <RefreshCw size={12} /> <span>Refresh</span>
          </button>
          <button type="button" className="btn-secondary" onClick={exportCsv} style={{ padding: '6px 10px', fontSize: 11 }}>
            <Download size={12} /> <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Guest Banner */}
      {isGuest && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 14px',
            background: 'rgba(0,255,204,0.06)',
            border: '1px solid rgba(0,255,204,0.18)',
            borderRadius: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#d4d4d8', fontSize: 12 }}>
            <Eye size={16} style={{ color: 'var(--brand-cyan)' }} />
            <span>
              <strong style={{ color: '#fafafa' }}>Watch-Only Mode:</strong> Showing <strong>Protocol Swarm (Operator 0x93e3…59Cf)</strong> verified performance. Connect wallet to overlay your personal equity curve vs the swarm.
            </span>
          </div>
          {onConnectWallet && (
            <button type="button" className="btn-glow" onClick={onConnectWallet} style={{ padding: '6px 12px', fontSize: 11, whiteSpace: 'nowrap' }}>
              <Wallet size={12} /> Connect Wallet
            </button>
          )}
        </div>
      )}

      {/* KPI Grid — 8 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {/* Total PnL */}
        <div className="terminal-panel" style={{ padding: '14px 16px', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}>{isGuest ? 'SWARM TOTAL PnL' : 'YOUR TOTAL PnL'}</span>
            {isUserPositive ? <TrendingUp size={14} style={{ color: 'var(--trade-yes)' }} /> : <TrendingDown size={14} style={{ color: 'var(--trade-no)' }} />}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: isUserPositive ? 'var(--trade-yes)' : 'var(--trade-no)' }}>
            {isUserPositive ? '+' : ''}
            {(summary?.totalPnl ?? 0).toFixed(2)} <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 600 }}>tUSDC</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted-foreground)' }}>
            <span className={`stat-pill-tag ${isUserPositive ? 'tag-green' : ''}`} style={isUserPositive ? {} : { background: 'rgba(244,63,94,0.10)', color: 'var(--trade-no)', border: '1px solid rgba(244,63,94,0.25)' }}>
              {summary?.totalTrades ?? 0} fills
            </span>
            <span>Realized {(summary?.realizedPnl ?? 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Unclaimed */}
        <div className="terminal-panel" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}>UNCLAIMED (ON-CHAIN)</span>
            <Layers size={14} style={{ color: '#f59e0b' }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#f59e0b' }}>{(summary?.unclaimedPnl ?? 0).toFixed(2)} <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>tUSDC</span></div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Claimable: {data?.symbolBreakdown?.length ?? 0} markets • Sweeper auto-claims</div>
        </div>

        {/* Win Rate */}
        <div className="terminal-panel" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}>WIN RATE</span>
            <Target size={14} style={{ color: 'var(--brand-cyan)' }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#fafafa' }}>{(summary?.winRate ?? 0).toFixed(1)}%</div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
            {summary?.totalWins ?? 0}W / {summary?.totalLosses ?? 0}L • PF {summary?.profitFactor ?? 0}
          </div>
        </div>

        {/* Volume */}
        <div className="terminal-panel" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}>TOTAL VOLUME</span>
            <BarChart3 size={14} style={{ color: '#a855f7' }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#fafafa' }}>{(summary?.totalVolume ?? 0).toFixed(2)} <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>tUSDC</span></div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Avg {(summary && summary.totalTrades ? (summary.totalVolume / summary.totalTrades).toFixed(2) : '0.00')} per fill</div>
        </div>

        {/* Profit Factor & Expectancy */}
        <div className="terminal-panel" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}>PROFIT FACTOR</span>
            <Award size={14} style={{ color: '#f59e0b' }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: (summary?.profitFactor ?? 0) >= 1 ? 'var(--trade-yes)' : 'var(--trade-no)' }}>{summary?.profitFactor === 99.99 ? '∞' : (summary?.profitFactor ?? 0).toFixed(2)}</div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Expectancy {(summary?.expectancy ?? 0).toFixed(2)} • Payoff {(summary?.payoffRatio ?? 0).toFixed(2)}</div>
        </div>

        {/* Max Drawdown */}
        <div className="terminal-panel" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}>MAX DRAWDOWN</span>
            <AlertTriangle size={14} style={{ color: 'var(--trade-no)' }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--trade-no)' }}>{(summary?.maxDrawdown ?? 0).toFixed(2)}</div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{(summary?.maxDrawdownPct ?? 0).toFixed(1)}% of peak • Sharpe {summary?.sharpeApprox ?? 0}</div>
        </div>

        {/* Swarm Comparison */}
        <div className="terminal-panel" style={{ padding: '14px 16px', background: 'rgba(245,158,11,0.04)', borderColor: 'rgba(245,158,11,0.18)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.06em' }}>SWARM EQUITY</span>
            <Bot size={14} style={{ color: '#f59e0b' }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: isSwarmPositive ? 'var(--trade-yes)' : 'var(--trade-no)' }}>
            {isSwarmPositive ? '+' : ''}
            {swarmTotal.toFixed(2)} <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>tUSDC</span>
          </div>
          <div style={{ fontSize: 11, color: delta >= 0 ? 'var(--trade-yes)' : 'var(--trade-no)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {isGuest ? 'Protocol verified PnL' : delta >= 0 ? `You +${delta.toFixed(2)} vs swarm` : `Swarm +${Math.abs(delta).toFixed(2)} vs you`}
          </div>
        </div>

        {/* Streak & Best/Worst */}
        <div className="terminal-panel" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}>STREAK & EXTREMES</span>
            <Activity size={14} style={{ color: 'var(--brand-cyan)' }} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: (summary?.currentStreak ?? 0) >= 0 ? 'var(--trade-yes)' : 'var(--trade-no)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {(summary?.currentStreak ?? 0) > 0 ? (
              <>
                <Flame size={14} style={{ color: 'var(--trade-yes)' }} />
                <span>+{summary?.currentStreak} win streak</span>
              </>
            ) : (summary?.currentStreak ?? 0) < 0 ? (
              <>
                <TrendingDown size={14} style={{ color: 'var(--trade-no)' }} />
                <span>{summary?.currentStreak} loss streak</span>
              </>
            ) : (
              <span>— Even</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
            Best +{(summary?.bestDay ?? 0).toFixed(2)} • Worst {(summary?.worstDay ?? 0).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Primary Equity Curve — spans full width */}
      <div className="terminal-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TrendingUp size={16} style={{ color: 'var(--brand-cyan)' }} />
            <span style={{ fontWeight: 700, fontSize: 13 }}>Equity Curve — Cumulative Realized PnL</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 6px', borderRadius: 999, background: 'rgba(0,255,204,0.10)', color: 'var(--brand-cyan)', border: '1px solid rgba(0,255,204,0.25)' }}>
              VERIFIED SETTLEMENTS
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted-foreground)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showSwarm} onChange={(e) => setShowSwarm(e.target.checked)} style={{ accentColor: '#f59e0b' }} />
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>Swarm (Operator)</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--muted-foreground)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 2, background: '#00ffcc', display: 'inline-block', borderRadius: 2 }} /> {isGuest ? 'Swarm' : 'You'}</span>
              {showSwarm && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 2, background: '#f59e0b', display: 'inline-block', borderRadius: 2, borderTop: '1px dashed #f59e0b' }} /> Operator</span>}
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <EquityCurveChart user={userCurve} swarm={showSwarm ? swarmCurve : []} height={240} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
              Settled PnL = (payout − cost) per lot • VOID = 0.5 payout • Pending/open trades excluded until settlement
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <span style={{ color: 'var(--muted-foreground)' }}>Avg daily</span>
              <strong style={{ fontFamily: 'var(--font-mono)', color: (summary?.avgDailyPnl ?? 0) >= 0 ? 'var(--trade-yes)' : 'var(--trade-no)' }}>
                {(summary?.avgDailyPnl ?? 0) >= 0 ? '+' : ''}
                {(summary?.avgDailyPnl ?? 0).toFixed(2)} tUSDC
              </strong>
              <span style={{ width: 1, height: 12, background: 'var(--border)', display: 'inline-block' }} />
              <span style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{userCurve.length} days • {(summary?.totalTrades ?? 0)} fills</span>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Row: Daily PnL + Agent Performance */}
      <div className="analytics-grid-2">
        <div className="terminal-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={16} style={{ color: '#a855f7' }} />
              <span style={{ fontWeight: 700, fontSize: 13 }}>Daily Realized PnL</span>
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(168,85,247,0.12)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.25)', fontFamily: 'var(--font-mono)' }}>{dailyBars.filter((d) => d.pnl !== 0).length} active days</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: '#10b981', borderRadius: 2 }} /> Win day</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: '#f43f5e', borderRadius: 2 }} /> Loss day</span>
            </div>
          </div>
          <div style={{ padding: '12px 16px' }}>
            <DailyPnlBars data={dailyBars} height={200} />
          </div>
        </div>

        <div className="terminal-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <Gauge size={16} style={{ color: 'var(--brand-cyan)' }} />
            <span style={{ fontWeight: 700, fontSize: 13 }}>Agent Contribution</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>PnL per agent ({range})</span>
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Swarm vs User toggle inside */}
            {(isGuest ? data?.swarmAgentBreakdown : data?.agentBreakdown)?.map((a) => {
              const maxAbs = Math.max(...(isGuest ? data?.swarmAgentBreakdown ?? [] : data?.agentBreakdown ?? []).map((x) => Math.abs(x.pnl)), 1);
              const isPos = a.pnl >= 0;
              const barPct = Math.min(100, (Math.abs(a.pnl) / maxAbs) * 100);
              const color = a.agentType === 'Volt' ? '#f59e0b' : a.agentType === 'Oracle' ? '#00ffcc' : a.agentType === 'Titan' ? '#a855f7' : '#10b981';
              const Icon = a.agentType === 'Volt' ? Zap : a.agentType === 'Oracle' ? Brain : a.agentType === 'Titan' ? Shield : Activity;
              return (
                <div key={a.agentType} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color }}>
                      <Icon size={12} /> <span>{a.agentType.toUpperCase()}</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>{a.trades} fills • {a.winRate.toFixed(0)}% WR</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: isPos ? 'var(--trade-yes)' : 'var(--trade-no)' }}>
                      {isPos ? '+' : ''}
                      {a.pnl.toFixed(2)} tUSDC
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: isPos ? '50%' : `calc(50% - ${barPct / 2}%)`,
                        width: `${barPct / 2}%`,
                        height: '100%',
                        background: isPos ? 'var(--trade-yes)' : 'var(--trade-no)',
                        borderRadius: 999,
                        transition: 'width 0.3s ease',
                      }}
                    />
                    <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.12)' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                    <span>{a.wins}W / {a.losses}L</span>
                    <span>Vol {a.volume.toFixed(1)} • Avg {a.avgPnl.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
            {/* Comparison note */}
            {!isGuest && (
              <div style={{ marginTop: 4, padding: '8px 10px', background: 'rgba(0,255,204,0.06)', border: '1px solid rgba(0,255,204,0.14)', borderRadius: 8, fontSize: 11, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Eye size={12} style={{ color: 'var(--brand-cyan)' }} />
                <span>
                  <strong style={{ color: '#fafafa' }}>Transparent:</strong> Swarm breakdown isOperator={isOperator ? ' (you)' : ''} on-chain verified. Your curve overlays operator for delta tracking.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Third Row: Distributions + Market Breakdown */}
      <div className="analytics-grid-3">
        <div className="terminal-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <PieChart size={14} style={{ color: '#10b981' }} />
            <span style={{ fontWeight: 700, fontSize: 12 }}>Outcome Split</span>
          </div>
          <div style={{ padding: 16 }}>
            {(() => {
              const outcomes = data?.outcomeBreakdown || [];
              const pieData = outcomes.map((o) => ({
                label: o.outcome,
                value: o.trades,
                color: o.outcome === 'YES' ? '#10b981' : o.outcome === 'NO' ? '#f43f5e' : '#71717a',
              }));
              if (pieData.every((d) => d.value === 0)) {
                return <div style={{ fontSize: 12, color: 'var(--muted-foreground)', textAlign: 'center', padding: 24 }}>No outcome data yet.</div>;
              }
              return <Donut data={pieData} size={150} />;
            })()}
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(data?.outcomeBreakdown || []).map((o) => (
                <div key={o.outcome} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: 700, color: o.outcome === 'YES' ? 'var(--trade-yes)' : 'var(--trade-no)' }}>{o.outcome}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#d4d4d8' }}>{o.pnl >= 0 ? '+' : ''}{o.pnl.toFixed(2)} • {o.winRate.toFixed(0)}% WR</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="terminal-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <Layers size={14} style={{ color: '#f59e0b' }} />
            <span style={{ fontWeight: 700, fontSize: 12 }}>Symbol & Window</span>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.06em', marginBottom: 8 }}>BY SYMBOL</div>
              {(data?.symbolBreakdown && data.symbolBreakdown.length > 0 ? data.symbolBreakdown : [{ symbol: '—', pnl: 0, trades: 0, winRate: 0 }]).map((s) => (
                <div key={s.symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#18181b', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fafafa' }}>{s.symbol}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>{s.trades} fills • {s.winRate.toFixed(0)}% WR</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: s.pnl >= 0 ? 'var(--trade-yes)' : 'var(--trade-no)' }}>{s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(2)}</div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.06em', marginBottom: 8 }}>BY WINDOW</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(data?.windowBreakdown || []).map((w) => (
                  <span key={w.window} style={{ padding: '4px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', fontSize: 11, fontFamily: 'var(--font-mono)', color: w.pnl >= 0 ? 'var(--trade-yes)' : 'var(--trade-no)', fontWeight: 600 }}>
                    {w.window}: {w.pnl >= 0 ? '+' : ''}{w.pnl.toFixed(1)} ({w.trades})
                  </span>
                ))}
                {(!data?.windowBreakdown || data.windowBreakdown.length === 0) && <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>No window data.</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="terminal-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Timer size={14} style={{ color: 'var(--brand-cyan)' }} />
              <span style={{ fontWeight: 700, fontSize: 12 }}>Volume Timeline</span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>tUSDC per day</span>
          </div>
          <div style={{ padding: '12px 16px' }}>
            {/* Simple mini volume bars */}
            {(() => {
              const vols = dailyBars.map((d) => d.volume);
              const maxV = Math.max(...vols, 1);
              return (
                <div style={{ display: 'flex', alignItems: 'end', gap: 2, height: 120, paddingTop: 8 }}>
                  {dailyBars.map((d) => {
                    const h = maxV > 0 ? (d.volume / maxV) * 100 : 0;
                    return (
                      <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <div style={{ width: '100%', height: 96, display: 'flex', alignItems: 'end', justifyContent: 'center' }}>
                          <div style={{ width: '85%', height: `${Math.max(2, h)}%`, background: d.trades > 0 ? 'rgba(0,255,204,0.7)' : 'rgba(255,255,255,0.06)', borderRadius: '3px 3px 0 0', border: d.trades > 0 ? '1px solid rgba(0,255,204,0.4)' : '1px solid transparent', borderBottom: 'none' }} title={`${d.date}: ${d.volume.toFixed(1)} tUSDC`} />
                        </div>
                        {dailyBars.length <= 14 || dailyBars.indexOf(d) % Math.ceil(dailyBars.length / 7) === 0 ? (
                          <span style={{ fontSize: 8, color: '#71717a', fontFamily: 'var(--font-mono)', transform: 'rotate(-30deg)', transformOrigin: 'center', whiteSpace: 'nowrap', marginTop: 4 }}>{d.date.slice(5)}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted-foreground)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <span>Total {(summary?.totalVolume ?? 0).toFixed(2)} tUSDC • {dailyBars.reduce((a, d) => a + d.trades, 0)} fills in range</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>Avg vol {(dailyBars.length ? (dailyBars.reduce((a, d) => a + d.volume, 0) / dailyBars.length).toFixed(1) : '0.0')}/day</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ledger + Recent Trades */}
      <div className="analytics-grid-ledger">
        <div className="terminal-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={16} style={{ color: 'var(--brand-cyan)' }} />
              <span style={{ fontWeight: 700, fontSize: 13 }}>Daily Balance Ledger</span>
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)' }}>{ledgerRows.length} days • verifiable</span>
            </div>
            <button type="button" className="btn-secondary" onClick={exportCsv} style={{ fontSize: 11, padding: '4px 10px' }}>
              <Download size={12} /> <span>Export CSV</span>
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#0e0e11', borderBottom: '1px solid var(--border)', color: 'var(--muted-foreground)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', fontWeight: 500, fontSize: 10 }}>DATE (UTC)</th>
                  <th style={{ padding: '8px 10px', fontWeight: 500, fontSize: 10, textAlign: 'right' }}>START</th>
                  <th style={{ padding: '8px 10px', fontWeight: 500, fontSize: 10, textAlign: 'right' }}>DAILY PnL</th>
                  <th style={{ padding: '8px 10px', fontWeight: 500, fontSize: 10, textAlign: 'right' }}>END BALANCE</th>
                  <th style={{ padding: '8px 10px', fontWeight: 500, fontSize: 10, textAlign: 'center' }}>TRADES</th>
                  <th style={{ padding: '8px 10px', fontWeight: 500, fontSize: 10, textAlign: 'center' }}>W/L</th>
                  <th style={{ padding: '8px 10px', fontWeight: 500, fontSize: 10, textAlign: 'right' }}>VOLUME</th>
                </tr>
              </thead>
              <tbody>
                {pagedLedger.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--muted-foreground)' }}>
                      {isGuest ? 'Swarm ledger is building — operator trades will populate daily rows after settlements.' : 'No trades in selected range. Extend range or wait for settlements.'}
                    </td>
                  </tr>
                ) : (
                  pagedLedger.map((r) => {
                    const isPos = r.dailyPnl > 0.01;
                    const isNeg = r.dailyPnl < -0.01;
                    return (
                      <tr key={r.date} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isPos ? 'rgba(16,185,129,0.04)' : isNeg ? 'rgba(244,63,94,0.04)' : 'transparent' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#d4d4d8' }}>{r.date}</td>
                        <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)' }}>{r.startBalance.toFixed(2)}</td>
                        <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: isPos ? 'var(--trade-yes)' : isNeg ? 'var(--trade-no)' : 'var(--muted-foreground)' }}>
                          {isPos ? '+' : ''}{r.dailyPnl.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: r.endBalance >= 0 ? 'var(--trade-yes)' : 'var(--trade-no)' }}>{r.endBalance >= 0 ? '+' : ''}{r.endBalance.toFixed(2)}</td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <span style={{ padding: '2px 6px', borderRadius: 4, background: r.trades > 0 ? 'rgba(0,255,204,0.10)' : 'rgba(255,255,255,0.04)', border: `1px solid ${r.trades > 0 ? 'rgba(0,255,204,0.25)' : 'var(--border)'}`, fontSize: 11, fontFamily: 'var(--font-mono)', color: r.trades > 0 ? 'var(--brand-cyan)' : 'var(--muted-foreground)' }}>{r.trades}</span>
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#a1a1aa' }}>
                          <span style={{ color: 'var(--trade-yes)' }}>{r.wins}W</span> / <span style={{ color: 'var(--trade-no)' }}>{r.losses}L</span>
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)' }}>{r.volume.toFixed(1)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Ledger Pagination Bar */}
          {ledgerRows.length > 0 && (
            <Pagination
              currentPage={ledgerPage}
              totalItems={ledgerRows.length}
              pageSize={ledgerPageSize}
              onPageChange={setLedgerPage}
              onPageSizeChange={setLedgerPageSize}
              pageSizeOptions={[10, 25, 50]}
              itemLabel="days"
              isLoading={isLoading}
            />
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="terminal-panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <Activity size={14} style={{ color: '#f59e0b' }} />
              <span style={{ fontWeight: 700, fontSize: 12 }}>Recent Fills (Ledger Source)</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>Last 10</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {(data?.recentTrades && data.recentTrades.length > 0 ? data.recentTrades : []).map((t: any) => {
                const isWin = (t.pnl ?? 0) > 0.01;
                const isLoss = (t.pnl ?? 0) < -0.01;
                const timeStr = new Date(t.createdAt).toLocaleTimeString();
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: t.isSettled ? 'transparent' : 'rgba(245,158,11,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 5px', borderRadius: 4, background: t.agentType === 'Volt' ? 'rgba(245,158,11,0.12)' : t.agentType === 'Oracle' ? 'rgba(0,255,204,0.12)' : 'rgba(168,85,247,0.12)', color: t.agentType === 'Volt' ? '#f59e0b' : t.agentType === 'Oracle' ? '#00ffcc' : '#a855f7', border: `1px solid ${t.agentType === 'Volt' ? 'rgba(245,158,11,0.3)' : t.agentType === 'Oracle' ? 'rgba(0,255,204,0.3)' : 'rgba(168,85,247,0.3)'}`, fontWeight: 700 }}>{t.agentType}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#fafafa', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {t.outcome} {t.direction === 'BUY' ? <ArrowUpRight size={11} style={{ color: 'var(--trade-yes)' }} /> : <ArrowDownRight size={11} style={{ color: 'var(--trade-no)' }} />}
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted-foreground)' }}>@{t.price?.toFixed(2)} × {t.lotSize}</span>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>{timeStr} • {t.marketId?.slice(0, 10)}…</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: isWin ? 'var(--trade-yes)' : isLoss ? 'var(--trade-no)' : 'var(--muted-foreground)' }}>
                        {t.isSettled ? (isWin ? `+${(t.pnl ?? 0).toFixed(2)}` : (t.pnl ?? 0).toFixed(2)) : 'OPEN'}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>{t.isSettled ? 'SETTLED' : 'AWAITING'}</div>
                    </div>
                  </div>
                );
              })}
              {(!data?.recentTrades || data.recentTrades.length === 0) && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>No recent fills in range.</div>
              )}
            </div>
          </div>

          <div className="terminal-panel" style={{ padding: '14px 16px', background: 'rgba(0,255,204,0.04)', borderColor: 'rgba(0,255,204,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Shield size={14} style={{ color: 'var(--brand-cyan)' }} />
              <span style={{ fontWeight: 700, fontSize: 12, color: '#fafafa' }}>Transparency Guarantee</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(0,255,204,0.12)', color: 'var(--brand-cyan)', border: '1px solid rgba(0,255,204,0.25)', fontFamily: 'var(--font-mono)' }}>ON-CHAIN VERIFIED</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: '#d4d4d8', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>Every point = real settlement: <code style={{ fontFamily: 'var(--font-mono)', background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3 }}>payout − cost</code> per lot, SELL inverted, VOID = 0.5 payout.</li>
              <li>Operator (0x93e3…59Cf) curve is public — compare your copy-trading delta live.</li>
              <li>Unclaimed payouts are gross pending redemption, not double-counted in realized equity.</li>
              <li>Ledger export is audit-ready CSV for external verification.</li>
            </ul>
            {!isGuest && !isOperator && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Your delta vs swarm:</span>
                <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-mono)', padding: '3px 8px', borderRadius: 6, background: delta >= 0 ? 'rgba(16,185,129,0.14)' : 'rgba(244,63,94,0.14)', border: `1px solid ${delta >= 0 ? 'rgba(16,185,129,0.30)' : 'rgba(244,63,94,0.30)'}`, color: delta >= 0 ? 'var(--trade-yes)' : 'var(--trade-no)' }}>
                  {delta >= 0 ? '+' : ''}{delta.toFixed(2)} tUSDC
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;
