import React, { useMemo, useState, useEffect } from 'react';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChartBarIcon,
  ChartBarSquareIcon,
  ChartPieIcon,
  CalendarIcon,
  ArrowDownTrayIcon,
  WalletIcon,
  CpuChipIcon,
  EyeIcon,
  ViewfinderCircleIcon,
  Square3Stack3DIcon,
  BoltIcon,
  ShieldCheckIcon,
  ClockIcon,
  TrophyIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  PresentationChartLineIcon,
  Squares2X2Icon,
  FireIcon,
  CommandLineIcon,
} from '@heroicons/react/24/outline';
import {
  useAnalytics,
  type AnalyticsRange,
  type AnalyticsSource,
  type EquityPoint,
  type DailyBar,
} from '../../hooks/useAnalytics.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import { useUserRole } from '../../hooks/useUserRole.js';
import { Spinner } from '../ui/Spinner.js';
import { Pagination } from '../ui/Pagination.js';
import { Badge } from '../ui/badge.js';
import { cn } from '../../lib/utils.js';

// ---------- Small SVG Chart Helpers (unchanged) ----------

const EquityCurveChart: React.FC<{ user: EquityPoint[]; swarm: EquityPoint[]; height?: number }> = ({ user, swarm, height = 200 }) => {
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
    return pts.map((p, i) => {
      const x = padding.left + i * (innerW / Math.max(1, pts.length - 1 || 1));
      const y = padding.top + innerH - ((p.cumulativePnl - min) / range) * innerH;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };
  const userPath = toPath(user);
  const swarmPath = toPath(swarm);
  const yTicks = 4;
  const yLabels: { y: number; v: number }[] = [];
  for (let i = 0; i <= yTicks; i++) {
    const v = min + (range * i) / yTicks;
    const y = padding.top + innerH - ((v - min) / range) * innerH;
    yLabels.push({ y, v });
  }
  const zeroY = padding.top + innerH - ((0 - min) / range) * innerH;
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height, display: 'block' }}>
        {yLabels.map((t, idx) => (
          <g key={idx}>
            <line x1={padding.left} x2={width - padding.right} y1={t.y} y2={t.y} stroke="hsl(var(--secondary) / 0.25)" strokeWidth={1} strokeDasharray={idx === 0 || idx === yTicks ? '0' : '3 3'} />
            <text x={padding.left - 8} y={t.y + 3} textAnchor="end" fontSize={10} fill="#a1a1aa" fontFamily="var(--font-mono)">
              {t.v >= 0 ? `+${t.v.toFixed(0)}` : t.v.toFixed(0)}
            </text>
          </g>
        ))}
        <line x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
        {swarm.length > 1 && <path d={`${swarmPath} L ${padding.left + innerW} ${zeroY} L ${padding.left} ${zeroY} Z`} fill="rgba(245,158,11,0.08)" stroke="none" />}
        {user.length > 1 && <path d={`${userPath} L ${padding.left + innerW} ${zeroY} L ${padding.left} ${zeroY} Z`} fill="rgba(0,255,204,0.08)" stroke="none" />}
        {swarm.length > 1 && <path d={swarmPath} fill="none" stroke="#fbbf24" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6 4" opacity={0.9} />}
        {user.length > 1 && <path d={userPath} fill="none" stroke="#2dd4bf" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />}
        {user.length > 0 && (() => { const last = user[user.length - 1]; const x = padding.left + (user.length - 1) * (innerW / Math.max(1, user.length - 1)); const y = padding.top + innerH - ((last.cumulativePnl - min) / range) * innerH; return <circle cx={x} cy={y} r={3.5} fill="#2dd4bf" stroke="#09090b" strokeWidth={2} />; })()}
        {swarm.length > 0 && user.length > 0 && (() => { const last = swarm[swarm.length - 1]; const x = padding.left + (swarm.length - 1) * (innerW / Math.max(1, swarm.length - 1)); const y = padding.top + innerH - ((last.cumulativePnl - min) / range) * innerH; return <circle cx={x} cy={y} r={3} fill="#fbbf24" stroke="#09090b" strokeWidth={1.5} />; })()}
        {user.map((p, i) => {
          if (user.length > 14 && i % Math.ceil(user.length / 6) !== 0) return null;
          const x = padding.left + i * (innerW / Math.max(1, user.length - 1));
          return <text key={p.date} x={x} y={height - 6} textAnchor="middle" fontSize={9} fill="#a1a1aa" fontFamily="var(--font-mono)">{p.date.slice(5)}</text>;
        })}
      </svg>
    </div>
  );
};

const DailyPnlBars: React.FC<{ data: DailyBar[]; height?: number }> = ({ data, height = 170 }) => {
  const width = 800;
  const padding = { top: 12, right: 12, bottom: 28, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  if (data.length === 0) return <div style={{ height, display: 'grid', placeItems: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>No daily PnL yet.</div>;
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.pnl)), 1);
  const yMax = maxAbs * 1.15 || 1;
  const barW = Math.max(2, innerW / data.length - 2);
  const zeroY = padding.top + innerH / 2;
  const yScale = (v: number) => padding.top + innerH / 2 - (v / yMax) * (innerH / 2 - 4);
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height, display: 'block' }}>
        {[yMax, yMax / 2, 0, -yMax / 2, -yMax].map((v, idx) => (
          <g key={idx}>
            <line x1={padding.left} x2={width - padding.right} y1={yScale(v)} y2={yScale(v)} stroke="hsl(var(--secondary) / 0.25)" strokeWidth={1} strokeDasharray={v === 0 ? '0' : '3 3'} />
            <text x={padding.left - 8} y={yScale(v) + 3} textAnchor="end" fontSize={10} fill="#a1a1aa" fontFamily="var(--font-mono)">{v >= 0 ? `+${v.toFixed(0)}` : v.toFixed(0)}</text>
          </g>
        ))}
        <line x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
        {data.map((d, i) => {
          const x = padding.left + i * (innerW / data.length) + 1;
          const y = d.pnl >= 0 ? yScale(d.pnl) : zeroY;
          const h = Math.abs(yScale(d.pnl) - zeroY);
          const isPos = d.pnl >= 0;
          const safeH = Math.max(1.5, h);
          return (
            <g key={d.date}>
              <rect x={x} y={y} width={barW} height={safeH} rx={2} fill={isPos ? '#6ee7b7' : '#fda4af'} opacity={0.9} />
              {Math.abs(d.pnl) > yMax * 0.12 && <text x={x + barW / 2} y={isPos ? y - 4 : y + safeH + 10} textAnchor="middle" fontSize={8} fill={isPos ? '#6ee7b7' : '#fda4af'} fontFamily="var(--font-mono)" fontWeight={700}>{d.pnl > 0 ? `+${d.pnl.toFixed(1)}` : d.pnl.toFixed(1)}</text>}
            </g>
          );
        })}
        {data.map((p, i) => {
          if (data.length > 14 && i % Math.ceil(data.length / 6) !== 0) return null;
          const x = padding.left + i * (innerW / data.length) + barW / 2;
          return <text key={p.date} x={x} y={height - 6} textAnchor="middle" fontSize={9} fill="#a1a1aa" fontFamily="var(--font-mono)">{p.date.slice(5)}</text>;
        })}
      </svg>
    </div>
  );
};

const Donut: React.FC<{ data: { label: string; value: number; color: string }[]; size?: number }> = ({ data, size = 130 }) => {
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--secondary) / 0.25)" strokeWidth={strokeW} />
        {segments.map((s, i) => <path key={i} d={s.dPath} fill="none" stroke={s.color} strokeWidth={strokeW} strokeLinecap="round" />)}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={14} fontWeight={800} fill="#fafafa" fontFamily="var(--font-mono)">{total.toFixed(0)}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill="#a1a1aa" fontFamily="var(--font-mono)">TRADES</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: s.color, display: 'inline-block' }} /><span style={{ fontSize: 11, color: '#d4d4d8', fontWeight: 600 }}>{s.label}</span></div>
            <span style={{ fontSize: 11, color: '#a1a1aa', fontFamily: 'var(--font-mono)' }}>{(s.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------- Main View (concise, tabbed, inline-scroll) ----------

interface AnalyticsViewProps {
  wallet: WalletState;
  onConnectWallet?: () => Promise<void>;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ wallet, onConnectWallet }) => {
  const { isGuest, isOperator } = useUserRole(wallet);
  const { data, isLoading, error, range, setRange, source, setSource, refresh } = useAnalytics(wallet, '30d');
  const [showSwarm, setShowSwarm] = useState(true);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(10);
  const [activeTab, setActiveTab] = useState<'equity' | 'daily' | 'dist' | 'ledger'>('equity');

  const rangeOptions: { id: AnalyticsRange; label: string }[] = [
    { id: '24h', label: '24H' }, { id: '7d', label: '7D' }, { id: '30d', label: '30D' }, { id: '90d', label: '90D' }, { id: 'ALL', label: 'ALL' },
  ];

  const sourceOptions: { id: AnalyticsSource; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'ALL', label: 'All Activity', Icon: Squares2X2Icon },
    { id: 'TERMINAL', label: 'Trading Terminal', Icon: CommandLineIcon },
    { id: 'SWARM', label: 'Swarm AI Copy-Trades', Icon: CpuChipIcon },
  ];

  const summary = data?.summary;
  const ledgerRows = useMemo(() => (!data?.ledger ? [] : [...data.ledger].reverse()), [data?.ledger]);
  const totalLedgerPages = Math.max(1, Math.ceil(ledgerRows.length / ledgerPageSize));
  useEffect(() => { setLedgerPage(1); }, [range, source]);
  useEffect(() => { if (ledgerPage > totalLedgerPages) setLedgerPage(totalLedgerPages); }, [totalLedgerPages, ledgerPage]);
  const pagedLedger = useMemo(() => { const start = (ledgerPage - 1) * ledgerPageSize; return ledgerRows.slice(start, start + ledgerPageSize); }, [ledgerRows, ledgerPage, ledgerPageSize]);

  const exportCsv = () => {
    if (!data) return;
    const header = 'date,startBalance,endBalance,dailyPnl,trades,wins,losses,volume\n';
    const rows = data.ledger.map((r) => `${r.date},${r.startBalance},${r.endBalance},${r.dailyPnl},${r.trades},${r.wins},${r.losses},${r.volume}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `dreampulse-analytics-${(data.source || 'all').toLowerCase()}-${data.range}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (isLoading && !data) {
    return (
      <div className="flex flex-col gap-3 h-full">
        <div className="terminal-panel p-4 flex items-center gap-3 justify-center">
          <Spinner size="sm" variant="cyan" />
          <span className="text-xs text-muted-foreground">Aggregating transparent on-chain ledger & swarm telemetry…</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="terminal-panel h-[84px]" />)}
        </div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="terminal-panel p-6 text-center">
        <ExclamationTriangleIcon className="w-7 h-7 text-amber-400 mx-auto mb-3" />
        <div className="text-sm font-bold text-foreground mb-1">Analytics temporarily unavailable</div>
        <div className="text-xs text-muted-foreground mb-3">{error}</div>
        <button type="button" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-secondary/30 text-xs" onClick={() => refresh()}><ArrowPathIcon className="w-3.5 h-3.5" /> Retry</button>
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
    <div className="flex flex-col gap-3 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg grid place-items-center border bg-secondary/30 border-border/50 text-muted-foreground">
            <PresentationChartLineIcon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold tracking-tight text-foreground">Analytics & Performance</h2>
              <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 bg-secondary/30 border-border/40 text-muted-foreground">LIVE LEDGER</Badge>
              {source === 'TERMINAL' && (
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan">
                  TRADING TERMINAL
                </Badge>
              )}
              {source === 'SWARM' && (
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 bg-amber-500/10 border-amber-500/30 text-amber-400">
                  SWARM COPY-TRADES
                </Badge>
              )}
              <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">Verifiable per-settlement PnL • {data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString() : ''}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-secondary/30 p-0.5 rounded-lg border border-border/40">
            {rangeOptions.map((r) => (
              <button key={r.id} type="button" onClick={() => { setRange(r.id); setLedgerPage(1); }} className={cn('px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer', range === r.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {r.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => refresh()} className="w-7 h-7 grid place-items-center rounded-lg border bg-secondary/30 border-border/50 text-muted-foreground hover:text-foreground cursor-pointer" title="Refresh Analytics"><ArrowPathIcon className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-secondary/30 border-border/50 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"><ArrowDownTrayIcon className="w-3.5 h-3.5" /> Export</button>
        </div>
      </div>

      {/* Source Segment Selector */}
      <div className="flex items-center justify-between gap-3 p-1.5 rounded-xl border bg-secondary/15 border-border/40 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-mono font-semibold text-muted-foreground uppercase px-2">Order Source:</span>
          {sourceOptions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSource(s.id);
                setLedgerPage(1);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                source === s.id
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'
              )}
            >
              <s.Icon className="w-3.5 h-3.5" />
              <span>{s.label}</span>
              {s.id === 'TERMINAL' && data?.sourceBreakdown?.find(b => b.source === 'TERMINAL')?.trades !== undefined && (
                <span className={cn("px-1.5 py-0.2 rounded-full text-[9px] font-mono", source === 'TERMINAL' ? "bg-black/20 text-white" : "bg-brand-cyan/15 text-brand-cyan")}>
                  {data.sourceBreakdown.find(b => b.source === 'TERMINAL')?.trades}
                </span>
              )}
              {s.id === 'SWARM' && data?.sourceBreakdown?.find(b => b.source === 'SWARM')?.trades !== undefined && (
                <span className={cn("px-1.5 py-0.2 rounded-full text-[9px] font-mono", source === 'SWARM' ? "bg-black/20 text-white" : "bg-amber-500/15 text-amber-400")}>
                  {data.sourceBreakdown.find(b => b.source === 'SWARM')?.trades}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Source description pill */}
        <div className="text-[11px] font-mono text-muted-foreground px-2 hidden md:flex items-center gap-2">
          {source === 'ALL' && <span>Showing all portfolio activity (Terminal orders + Swarm copy-trades)</span>}
          {source === 'TERMINAL' && <span className="text-brand-cyan font-semibold">Exclusively showing manual discretionary orders from Trader Cockpit</span>}
          {source === 'SWARM' && <span className="text-amber-400 font-semibold">Exclusively showing autonomous Swarm AI copy-trades & mirror fills</span>}
        </div>
      </div>

      {/* Guest banner */}
      {isGuest && (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border bg-secondary/20 border-border/50 flex-shrink-0">
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <EyeIcon className="w-4 h-4 text-muted-foreground" />
            <span><strong className="text-foreground">Watch-Only:</strong> Showing <strong className="text-foreground">Protocol Swarm (Operator)</strong> verified. Connect to overlay your curve.</span>
          </div>
          {onConnectWallet && <button type="button" onClick={onConnectWallet} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-bold cursor-pointer"><WalletIcon className="w-3.5 h-3.5" /> Connect</button>}
        </div>
      )}

      {/* Comparative Source Performance Matrix */}
      {data?.sourceBreakdown && data.sourceBreakdown.length >= 2 && source === 'ALL' && !isGuest && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-shrink-0">
          <div className="terminal-panel p-3 border-border/50 bg-secondary/10 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-brand-cyan">
                <CommandLineIcon className="w-4 h-4" />
                <span>Trader Cockpit (Manual Trades)</span>
              </div>
              <Badge variant="outline" className="text-[9px] font-mono border-brand-cyan/30 text-brand-cyan bg-brand-cyan/5">
                DISCRETIONARY
              </Badge>
            </div>
            {(() => {
              const term = data.sourceBreakdown.find(b => b.source === 'TERMINAL');
              const pnl = term?.pnl ?? 0;
              return (
                <div className="grid grid-cols-4 gap-2 pt-1">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-mono">Net PnL</div>
                    <div className="text-sm font-mono font-bold" style={{ color: pnl >= 0 ? 'var(--trade-yes)' : 'var(--trade-no)' }}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-mono">Win Rate</div>
                    <div className="text-sm font-mono font-bold text-foreground">
                      {term?.winRate.toFixed(1) ?? '0.0'}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-mono">Fills</div>
                    <div className="text-sm font-mono font-bold text-foreground">
                      {term?.trades ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-mono">Volume</div>
                    <div className="text-sm font-mono font-bold text-foreground">
                      ${term?.volume.toFixed(1) ?? '0.0'}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="terminal-panel p-3 border-border/50 bg-secondary/10 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                <CpuChipIcon className="w-4 h-4" />
                <span>Swarm AI Copy-Trades (Mirror)</span>
              </div>
              <Badge variant="outline" className="text-[9px] font-mono border-amber-500/30 text-amber-400 bg-amber-500/5">
                AUTONOMOUS
              </Badge>
            </div>
            {(() => {
              const swarm = data.sourceBreakdown.find(b => b.source === 'SWARM');
              const pnl = swarm?.pnl ?? 0;
              return (
                <div className="grid grid-cols-4 gap-2 pt-1">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-mono">Net PnL</div>
                    <div className="text-sm font-mono font-bold" style={{ color: pnl >= 0 ? 'var(--trade-yes)' : 'var(--trade-no)' }}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-mono">Win Rate</div>
                    <div className="text-sm font-mono font-bold text-foreground">
                      {swarm?.winRate.toFixed(1) ?? '0.0'}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-mono">Fills</div>
                    <div className="text-sm font-mono font-bold text-foreground">
                      {swarm?.trades ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-mono">Volume</div>
                    <div className="text-sm font-mono font-bold text-foreground">
                      ${swarm?.volume.toFixed(1) ?? '0.0'}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* KPI Grid — compact 4-col, 2 rows */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
        <div className="terminal-panel p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between"><span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">{isGuest ? 'SWARM TOTAL PnL' : 'YOUR TOTAL PnL'}</span><ArrowTrendingUpIcon className="w-3.5 h-3.5 text-muted-foreground/60" /></div>
          <div className="text-lg font-mono font-bold" style={{ color: isUserPositive ? 'var(--trade-yes)' : 'var(--trade-no)' }}>{isUserPositive ? '+' : ''}{(summary?.totalPnl ?? 0).toFixed(2)} <span className="text-[10px] text-muted-foreground">tUSDC</span></div>
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground"><span className="px-1.5 py-0.5 rounded border bg-secondary/30 border-border/40 text-[10px]">{summary?.totalTrades ?? 0} fills</span> Realized {(summary?.realizedPnl ?? 0).toFixed(1)}</div>
        </div>
        <div className="terminal-panel p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between"><span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">UNCLAIMED (ON-CHAIN)</span><Square3Stack3DIcon className="w-3.5 h-3.5 text-muted-foreground/60" /></div>
          <div className="text-lg font-mono font-bold text-amber-400">{(summary?.unclaimedPnl ?? 0).toFixed(2)} <span className="text-[10px] text-muted-foreground">tUSDC</span></div>
          <div className="text-[11px] text-muted-foreground">{data?.symbolBreakdown?.length ?? 0} markets • Sweeper auto-claims</div>
        </div>
        <div className="terminal-panel p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between"><span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">WIN RATE</span><ViewfinderCircleIcon className="w-3.5 h-3.5 text-muted-foreground/60" /></div>
          <div className="text-lg font-mono font-bold text-foreground">{(summary?.winRate ?? 0).toFixed(1)}%</div>
          <div className="text-[11px] text-muted-foreground">{summary?.totalWins ?? 0}W / {summary?.totalLosses ?? 0}L • PF {summary?.profitFactor ?? 0}</div>
        </div>
        <div className="terminal-panel p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between"><span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">TOTAL VOLUME</span><ChartBarSquareIcon className="w-3.5 h-3.5 text-muted-foreground/60" /></div>
          <div className="text-lg font-mono font-bold text-foreground">{(summary?.totalVolume ?? 0).toFixed(1)} <span className="text-[10px] text-muted-foreground">tUSDC</span></div>
          <div className="text-[11px] text-muted-foreground">Avg {summary?.totalTrades ? (summary.totalVolume / summary.totalTrades).toFixed(2) : '0.00'} / fill</div>
        </div>
        <div className="terminal-panel p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between"><span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">PROFIT FACTOR</span><TrophyIcon className="w-3.5 h-3.5 text-muted-foreground/60" /></div>
          <div className="text-lg font-mono font-bold" style={{ color: (summary?.profitFactor ?? 0) >= 1 ? 'var(--trade-yes)' : 'var(--trade-no)' }}>{summary?.profitFactor === 99.99 ? '∞' : (summary?.profitFactor ?? 0).toFixed(2)}</div>
          <div className="text-[11px] text-muted-foreground">Expectancy {(summary?.expectancy ?? 0).toFixed(2)}</div>
        </div>
        <div className="terminal-panel p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between"><span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">MAX DRAWDOWN</span><ExclamationTriangleIcon className="w-3.5 h-3.5 text-muted-foreground/60" /></div>
          <div className="text-lg font-mono font-bold text-rose-400">{(summary?.maxDrawdown ?? 0).toFixed(2)}</div>
          <div className="text-[11px] text-muted-foreground">{(summary?.maxDrawdownPct ?? 0).toFixed(1)}% • Sharpe {summary?.sharpeApprox ?? 0}</div>
        </div>
        <div className="terminal-panel p-3 flex flex-col gap-1.5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-amber-500/50" />
          <div className="flex items-center justify-between"><span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">SWARM EQUITY</span><CpuChipIcon className="w-3.5 h-3.5 text-muted-foreground/60" /></div>
          <div className="text-lg font-mono font-bold" style={{ color: isSwarmPositive ? 'var(--trade-yes)' : 'var(--trade-no)' }}>{isSwarmPositive ? '+' : ''}{swarmTotal.toFixed(2)} <span className="text-[10px] text-muted-foreground">tUSDC</span></div>
          <div className="text-[11px] font-mono font-semibold" style={{ color: delta >= 0 ? 'var(--trade-yes)' : 'var(--trade-no)' }}>{isGuest ? 'Protocol verified' : delta >= 0 ? `You +${delta.toFixed(1)}` : `Swarm +${Math.abs(delta).toFixed(1)}`}</div>
        </div>
        <div className="terminal-panel p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between"><span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">STREAK</span><ChartBarIcon className="w-3.5 h-3.5 text-muted-foreground/60" /></div>
          <div className="text-sm font-mono font-bold flex items-center gap-1.5" style={{ color: (summary?.currentStreak ?? 0) > 0 ? 'var(--trade-yes)' : (summary?.currentStreak ?? 0) < 0 ? 'var(--trade-no)' : 'var(--muted-foreground)' }}>
            {(summary?.currentStreak ?? 0) > 0 ? <><FireIcon className="w-3.5 h-3.5" /> +{summary?.currentStreak} streak</> : (summary?.currentStreak ?? 0) < 0 ? <><ArrowTrendingDownIcon className="w-3.5 h-3.5" /> {summary?.currentStreak}</> : '— Even'}
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">Best +{(summary?.bestDay ?? 0).toFixed(1)} • Worst {(summary?.worstDay ?? 0).toFixed(1)}</div>
        </div>
      </div>

      {/* Tabbed workspace — compact, no forced height, inline scrolls where needed */}
      <div className="terminal-panel p-0 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40 bg-secondary/10 flex-wrap">
          <div className="flex items-center gap-1 bg-secondary/30 p-0.5 rounded-lg border border-border/40">
            {([
              { id: 'equity', label: 'Equity Curve', Icon: ArrowTrendingUpIcon },
              { id: 'daily', label: 'Daily & Agents', Icon: ChartBarSquareIcon },
              { id: 'dist', label: 'Distribution', Icon: ChartPieIcon },
              { id: 'ledger', label: 'Ledger & Fills', Icon: CalendarIcon },
            ] as const).map((t) => (
              <button key={t.id} type="button" onClick={() => setActiveTab(t.id)} className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors', activeTab === t.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <t.Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            {activeTab === 'equity' && <><label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={showSwarm} onChange={(e) => setShowSwarm(e.target.checked)} className="w-3 h-3 accent-amber-500" /> <span className="text-amber-400 font-semibold">Swarm</span></label><span className="w-px h-3 bg-border hidden sm:inline-block" /><span>{userCurve.length} days • {(summary?.totalTrades ?? 0)} fills</span></>}
            {activeTab === 'daily' && <span>{dailyBars.filter((d) => d.pnl !== 0).length} active days</span>}
            {activeTab === 'ledger' && <span>{ledgerRows.length} days • verifiable</span>}
          </div>
        </div>

        {/* Tab content — compact, content-driven height */}
        <div className="p-3">
          {activeTab === 'equity' && (
            <div className="flex flex-col gap-2">
              <EquityCurveChart user={userCurve} swarm={showSwarm ? swarmCurve : []} height={260} />
              <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground border-t border-border/30 pt-2">
                <span>Settled PnL = (payout − cost) per lot • VOID = 0.5 • Pending excluded</span>
                <span>Avg daily <strong className="text-foreground" style={{ color: (summary?.avgDailyPnl ?? 0) >= 0 ? 'var(--trade-yes)' : 'var(--trade-no)' }}>{(summary?.avgDailyPnl ?? 0) >= 0 ? '+' : ''}{(summary?.avgDailyPnl ?? 0).toFixed(2)}</strong> tUSDC</span>
              </div>
            </div>
          )}

          {activeTab === 'daily' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="terminal-panel p-0 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
                  <span className="text-xs font-bold flex items-center gap-1.5"><ChartBarSquareIcon className="w-3.5 h-3.5 text-muted-foreground" /> Daily Realized PnL</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{dailyBars.length} days</span>
                </div>
                <div className="p-2">
                  <DailyPnlBars data={dailyBars} height={200} />
                </div>
              </div>
              <div className="terminal-panel p-0 flex flex-col overflow-hidden">
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/40">
                  <Squares2X2Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-bold">Agent Contribution</span>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">PnL per agent ({range})</span>
                </div>
                <div className="p-3 flex flex-col gap-3">
                  {(isGuest ? data?.swarmAgentBreakdown : data?.agentBreakdown)?.map((a) => {
                    const maxAbs = Math.max(...(isGuest ? data?.swarmAgentBreakdown ?? [] : data?.agentBreakdown ?? []).map((x) => Math.abs(x.pnl)), 1);
                    const isPos = a.pnl >= 0;
                    const barPct = Math.min(100, (Math.abs(a.pnl) / maxAbs) * 100);
                    const isManual = a.agentType === 'Manual';
                    const color = isManual ? '#38bdf8' : a.agentType === 'Volt' ? '#fbbf24' : a.agentType === 'Oracle' ? '#2dd4bf' : a.agentType === 'Titan' ? '#a78bfa' : '#6ee7b7';
                    const Icon = isManual ? CommandLineIcon : a.agentType === 'Volt' ? BoltIcon : a.agentType === 'Oracle' ? CpuChipIcon : a.agentType === 'Titan' ? ShieldCheckIcon : ChartBarIcon;
                    const displayName = isManual ? 'MANUAL (TERMINAL)' : a.agentType.toUpperCase();
                    return (
                      <div key={a.agentType} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold" style={{ color }}>
                            <Icon className="w-3.5 h-3.5" />
                            <span>{displayName}</span>
                            <span className="text-[10px] font-medium text-muted-foreground font-mono">{a.trades} fills • {a.winRate.toFixed(0)}% WR</span>
                          </div>
                          <span className="text-xs font-mono font-bold" style={{ color: isPos ? 'var(--trade-yes)' : 'var(--trade-no)' }}>{isPos ? '+' : ''}{a.pnl.toFixed(2)} tUSDC</span>
                        </div>
                        <div className="h-1.5 bg-secondary/30 rounded-full overflow-hidden relative">
                          <div className="absolute top-0 bottom-0 w-px bg-border/50 left-1/2" />
                          <div style={{ position: 'absolute', left: isPos ? '50%' : `calc(50% - ${barPct / 2}%)`, width: `${barPct / 2}%`, height: '100%', background: isPos ? 'var(--trade-yes)' : 'var(--trade-no)', borderRadius: 999 }} />
                        </div>
                        <div className="flex justify-between text-[10px] font-mono text-muted-foreground"><span>{a.wins}W / {a.losses}L</span><span>Vol ${a.volume.toFixed(1)}</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'dist' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="terminal-panel p-3 flex flex-col gap-3">
                <div className="flex items-center gap-1.5 text-xs font-bold"><ChartPieIcon className="w-3.5 h-3.5 text-muted-foreground" /> Outcome Split</div>
                {(() => {
                  const outcomes = data?.outcomeBreakdown || [];
                  const pieData = outcomes.map((o) => ({ label: o.outcome, value: o.trades, color: o.outcome === 'YES' ? '#6ee7b7' : o.outcome === 'NO' ? '#fda4af' : '#a1a1aa' }));
                  if (pieData.every((d) => d.value === 0)) return <div className="text-xs text-muted-foreground text-center py-6">No outcome data yet.</div>;
                  return <Donut data={pieData} size={130} />;
                })()}
                <div className="flex flex-col gap-1.5">
                  {(data?.outcomeBreakdown || []).map((o) => (
                    <div key={o.outcome} className="flex items-center justify-between text-[11px] px-2 py-1.5 rounded-lg bg-secondary/20 border border-border/30">
                      <span className="font-bold" style={{ color: o.outcome === 'YES' ? 'var(--trade-yes)' : 'var(--trade-no)' }}>{o.outcome}</span>
                      <span className="font-mono text-muted-foreground">{o.pnl >= 0 ? '+' : ''}{o.pnl.toFixed(1)} • {o.winRate.toFixed(0)}% WR</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="terminal-panel p-3 flex flex-col gap-3">
                <div className="flex items-center gap-1.5 text-xs font-bold"><Square3Stack3DIcon className="w-3.5 h-3.5 text-muted-foreground" /> Symbol & Window</div>
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase mb-1.5">By Symbol</div>
                    {(data?.symbolBreakdown?.length ? data.symbolBreakdown : [{ symbol: '—', pnl: 0, trades: 0, winRate: 0 }]).map((s) => (
                      <div key={s.symbol} className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-secondary/20 border border-border/30 mb-1.5">
                        <div><div className="text-xs font-bold text-foreground">{s.symbol}</div><div className="text-[10px] font-mono text-muted-foreground">{s.trades} fills • {s.winRate.toFixed(0)}% WR</div></div>
                        <div className="text-xs font-mono font-bold" style={{ color: s.pnl >= 0 ? 'var(--trade-yes)' : 'var(--trade-no)' }}>{s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(1)}</div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase mb-1.5">By Window</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {(data?.windowBreakdown || []).map((w) => (
                        <span key={w.window} className="px-2 py-1 rounded-full bg-secondary/30 border border-border/40 text-[11px] font-mono font-semibold" style={{ color: w.pnl >= 0 ? 'var(--trade-yes)' : 'var(--trade-no)' }}>{w.window}: {w.pnl >= 0 ? '+' : ''}{w.pnl.toFixed(1)} ({w.trades})</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="terminal-panel p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between"><span className="text-xs font-bold flex items-center gap-1.5"><ClockIcon className="w-3.5 h-3.5 text-muted-foreground" /> Volume Timeline</span><span className="text-[10px] font-mono text-muted-foreground">tUSDC / day</span></div>
                <div className="flex flex-col">
                  {(() => {
                    const vols = dailyBars.map((d) => d.volume);
                    const maxV = Math.max(...vols, 1);
                    return (
                      <div className="flex items-end gap-1 h-[140px] pt-2">
                        {dailyBars.map((d) => {
                          const h = maxV > 0 ? (d.volume / maxV) * 100 : 0;
                          return (
                            <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                              <div className="w-full h-[110px] flex items-end justify-center"><div className="w-[70%] rounded-t" style={{ height: `${Math.max(2, h)}%`, background: d.trades > 0 ? 'rgba(45,212,191,0.6)' : 'hsl(var(--secondary)/0.25)', border: d.trades > 0 ? '1px solid rgba(45,212,191,0.3)' : '1px solid transparent', borderBottom: 'none' }} /></div>
                              {(dailyBars.length <= 14 || dailyBars.indexOf(d) % Math.ceil(dailyBars.length / 6) === 0) && <span className="text-[8px] font-mono text-muted-foreground -rotate-12 origin-center whitespace-nowrap">{d.date.slice(5)}</span>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground border-t border-border/30 pt-2 mt-2"><span>Total {(summary?.totalVolume ?? 0).toFixed(1)} tUSDC</span><span>Avg {(dailyBars.length ? (dailyBars.reduce((a, d) => a + d.volume, 0) / dailyBars.length).toFixed(1) : '0.0')}/day</span></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ledger' && (
            <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_0.9fr] gap-3">
              <div className="terminal-panel p-0 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-secondary/10">
                  <div className="flex items-center gap-1.5"><CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-xs font-bold">Daily Balance Ledger</span><Badge variant="outline" className="font-mono text-[10px] bg-secondary/30 border-border/40 text-muted-foreground">{ledgerRows.length} days</Badge></div>
                  <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border bg-secondary/30 border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground"><ArrowDownTrayIcon className="w-3 h-3" /> CSV</button>
                </div>
                <div className="max-h-[320px] overflow-y-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-[#111114] border-b border-border/60">
                      <tr className="text-[10px] font-mono text-muted-foreground uppercase">
                        <th className="px-2.5 py-2 text-left font-semibold">Date (UTC)</th><th className="px-2 py-2 text-right">Start</th><th className="px-2 py-2 text-right">Daily PnL</th><th className="px-2 py-2 text-right">End Bal</th><th className="px-2 py-2 text-center">Trades</th><th className="px-2 py-2 text-center">W/L</th><th className="px-2 py-2 text-right">Volume</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {pagedLedger.map((r) => {
                        const isPos = r.dailyPnl > 0.01; const isNeg = r.dailyPnl < -0.01;
                        return (
                          <tr key={r.date} className="hover:bg-secondary/10" style={{ background: isPos ? 'rgba(16,185,129,0.04)' : isNeg ? 'rgba(244,63,94,0.04)' : 'transparent' }}>
                            <td className="px-2.5 py-2 font-mono text-muted-foreground">{r.date}</td>
                            <td className="px-2 py-2 text-right font-mono text-muted-foreground">{r.startBalance.toFixed(1)}</td>
                            <td className="px-2 py-2 text-right font-mono font-bold" style={{ color: isPos ? 'var(--trade-yes)' : isNeg ? 'var(--trade-no)' : 'var(--muted-foreground)' }}>{isPos ? '+' : ''}{r.dailyPnl.toFixed(2)}</td>
                            <td className="px-2 py-2 text-right font-mono font-bold" style={{ color: r.endBalance >= 0 ? 'var(--trade-yes)' : 'var(--trade-no)' }}>{r.endBalance >= 0 ? '+' : ''}{r.endBalance.toFixed(1)}</td>
                            <td className="px-2 py-2 text-center"><span className="px-1.5 py-0.5 rounded border text-[10px] font-mono" style={{ background: r.trades ? 'rgba(45,212,191,0.08)' : 'transparent', borderColor: r.trades ? 'rgba(45,212,191,0.18)' : 'var(--border)', color: r.trades ? '#2dd4bf' : 'var(--muted-foreground)' }}>{r.trades}</span></td>
                            <td className="px-2 py-2 text-center font-mono text-[11px]"><span style={{ color: 'var(--trade-yes)' }}>{r.wins}W</span> / <span style={{ color: 'var(--trade-no)' }}>{r.losses}L</span></td>
                            <td className="px-2 py-2 text-right font-mono text-muted-foreground">{r.volume.toFixed(1)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {ledgerRows.length > 0 && <Pagination currentPage={ledgerPage} totalItems={ledgerRows.length} pageSize={ledgerPageSize} onPageChange={setLedgerPage} onPageSizeChange={setLedgerPageSize} pageSizeOptions={[10, 25, 50]} itemLabel="days" isLoading={isLoading} />}
              </div>
              <div className="flex flex-col gap-3">
                <div className="terminal-panel p-0 flex flex-col overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/40"><ChartBarIcon className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-xs font-bold">Recent Fills</span><span className="ml-auto text-[10px] font-mono text-muted-foreground">Last 10</span></div>
                  <div className="divide-y divide-border/20 max-h-[280px] overflow-y-auto">
                    {(data?.recentTrades?.slice(0, 10) || []).map((t: any) => {
                      const isWin = (t.pnl ?? 0) > 0.01; const isLoss = (t.pnl ?? 0) < -0.01;
                      return (
                        <div key={t.id} className="flex items-center justify-between px-3 py-2 hover:bg-secondary/10">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border font-bold flex-shrink-0" style={{ background: t.agentType === 'Volt' ? 'rgba(245,158,11,0.08)' : t.agentType === 'Oracle' ? 'rgba(45,212,191,0.08)' : 'rgba(167,139,250,0.08)', color: t.agentType === 'Volt' ? '#fbbf24' : t.agentType === 'Oracle' ? '#2dd4bf' : '#a78bfa', borderColor: t.agentType === 'Volt' ? 'rgba(245,158,11,0.18)' : t.agentType === 'Oracle' ? 'rgba(45,212,191,0.18)' : 'rgba(167,139,250,0.18)' }}>{t.agentType}</span>
                            <div className="min-w-0"><div className="text-xs font-semibold text-foreground flex items-center gap-1 truncate">{t.outcome} @ {t.price?.toFixed(2)} × {t.lotSize}<span className="text-[10px] font-mono text-muted-foreground">• {new Date(t.createdAt).toLocaleTimeString()}</span></div><div className="text-[10px] font-mono text-muted-foreground truncate">{t.marketId?.slice(0, 14)}…</div></div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2"><div className="text-xs font-mono font-bold" style={{ color: isWin ? 'var(--trade-yes)' : isLoss ? 'var(--trade-no)' : 'var(--muted-foreground)' }}>{t.isSettled ? (isWin ? `+${(t.pnl ?? 0).toFixed(2)}` : (t.pnl ?? 0).toFixed(2)) : 'OPEN'}</div><div className="text-[9px] font-mono text-muted-foreground">{t.isSettled ? 'SETTLED' : 'AWAITING'}</div></div>
                        </div>
                      );
                    })}
                    {(!data?.recentTrades || data.recentTrades.length === 0) && <div className="p-4 text-center text-xs text-muted-foreground">No recent fills.</div>}
                  </div>
                </div>
                <div className="terminal-panel p-3 bg-secondary/10 border-border/40">
                  <div className="flex items-center gap-1.5 mb-1.5"><ShieldCheckIcon className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-xs font-bold text-foreground">Transparency Guarantee</span><Badge variant="outline" className="ml-auto font-mono text-[10px] bg-secondary/30 border-border/40 text-muted-foreground">ON-CHAIN VERIFIED</Badge></div>
                  <ul className="text-[11px] text-muted-foreground leading-relaxed list-disc pl-4 space-y-1">
                    <li>Every point = real settlement: <code className="font-mono bg-secondary/40 px-1 py-0.5 rounded">payout − cost</code> per lot.</li>
                    <li>Operator (0x93e3…59Cf) curve public — compare delta live.</li>
                    <li>Unclaimed = gross pending, not double-counted.</li>
                  </ul>
                  {!isGuest && !isOperator && <div className="mt-2 flex items-center gap-2 text-xs">Your delta vs swarm: <span className="px-2 py-0.5 rounded border font-mono font-bold text-xs" style={{ background: delta >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)', borderColor: delta >= 0 ? 'rgba(16,185,129,0.22)' : 'rgba(244,63,94,0.22)', color: delta >= 0 ? 'var(--trade-yes)' : 'var(--trade-no)' }}>{delta >= 0 ? '+' : ''}{delta.toFixed(2)} tUSDC</span></div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
