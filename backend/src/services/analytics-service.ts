import { orderService } from './order-service.js';
import { settlementService } from './settlement-service.js';
import { SOMNIA_ADDRESSES, operatorAccount } from '../config/somnia.js';
import { supabase } from '../config/supabase.js';
import type { AgentType, OrderExecution } from '../types/index.js';

export type AnalyticsRange = '24h' | '7d' | '30d' | '90d' | 'ALL';

export interface EquityPoint {
  date: string; // YYYY-MM-DD
  timestamp: number;
  cumulativePnl: number;
  dailyPnl: number;
  trades: number;
  volume: number;
  wins: number;
  losses: number;
}

export interface DailyBar {
  date: string;
  timestamp: number;
  pnl: number;
  volume: number;
  trades: number;
  wins: number;
  losses: number;
}

export interface AgentBreakdown {
  agentType: AgentType;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  volume: number;
  avgPnl: number;
}

export interface LedgerRow {
  date: string;
  timestamp: number;
  startBalance: number;
  endBalance: number;
  dailyPnl: number;
  trades: number;
  wins: number;
  losses: number;
  volume: number;
}

export interface AnalyticsSummary {
  totalPnl: number;
  realizedPnl: number;
  unclaimedPnl: number;
  totalTrades: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  totalVolume: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  payoffRatio: number;
  expectancy: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  bestDay: number;
  worstDay: number;
  avgDailyPnl: number;
  currentStreak: number; // positive = win streak, negative = loss streak
  sharpeApprox: number;
  totalClaimed: number;
}

export interface SourceBreakdown {
  source: 'ALL' | 'SWARM' | 'TERMINAL';
  label: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  volume: number;
}

export interface AnalyticsResponse {
  range: AnalyticsRange;
  source: 'ALL' | 'SWARM' | 'TERMINAL';
  userAddress: string;
  isOperator: boolean;
  generatedAt: string;
  summary: AnalyticsSummary;
  terminalSummary?: AnalyticsSummary;
  swarmSummary?: AnalyticsSummary;
  sourceBreakdown: SourceBreakdown[];
  equityCurve: EquityPoint[]; // filtered equity curve
  terminalEquityCurve?: EquityPoint[]; // separate terminal equity curve
  swarmEquityCurve: EquityPoint[]; // operator swarm curve for comparison
  dailyBars: DailyBar[];
  agentBreakdown: AgentBreakdown[];
  swarmAgentBreakdown: AgentBreakdown[];
  outcomeBreakdown: { outcome: string; pnl: number; trades: number; winRate: number }[];
  symbolBreakdown: { symbol: string; pnl: number; trades: number; winRate: number }[];
  windowBreakdown: { window: string; pnl: number; trades: number }[];
  ledger: LedgerRow[];
  recentTrades: OrderExecution[];
}

function getRangeCutoff(range: AnalyticsRange): number {
  const now = Date.now();
  switch (range) {
    case '24h':
      return now - 24 * 3600 * 1000;
    case '7d':
      return now - 7 * 24 * 3600 * 1000;
    case '30d':
      return now - 30 * 24 * 3600 * 1000;
    case '90d':
      return now - 90 * 24 * 3600 * 1000;
    case 'ALL':
    default:
      return 0;
  }
}

function toDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeEquityAndDaily(orders: OrderExecution[], cutoffMs: number): { equity: EquityPoint[]; daily: DailyBar[]; ledger: LedgerRow[]; summary: AnalyticsSummary } {
  // Filter to cutoff and sort chronologically by settledAt or createdAt
  const filtered = orders
    .filter((o) => {
      const ts = o.settledAt ? new Date(o.settledAt).getTime() : new Date(o.createdAt).getTime();
      return ts >= cutoffMs;
    })
    .sort((a, b) => {
      const ta = a.settledAt ? new Date(a.settledAt).getTime() : new Date(a.createdAt).getTime();
      const tb = b.settledAt ? new Date(b.settledAt).getTime() : new Date(b.createdAt).getTime();
      return ta - tb;
    });

  // Group by day — single pass
  const byDay = new Map<string, { pnlSum: number; trades: number; wins: number; losses: number; volume: number; ts: number }>();
  for (const o of filtered) {
    const ts = o.settledAt ? new Date(o.settledAt).getTime() : new Date(o.createdAt).getTime();
    const key = toDateKey(ts);
    const existing = byDay.get(key) || { pnlSum: 0, trades: 0, wins: 0, losses: 0, volume: 0, ts };
    const pnl = o.pnl ?? 0;
    const isSettled = o.isSettled === true;
    const isWin = isSettled && pnl > 0.01;
    const isLoss = isSettled && pnl < -0.01;
    const dayStartTs = new Date(key + 'T00:00:00.000Z').getTime();
    existing.pnlSum += isSettled ? pnl : 0;
    existing.trades += 1;
    if (isWin) existing.wins += 1;
    if (isLoss) existing.losses += 1;
    existing.volume += o.totalCost || 0;
    existing.ts = dayStartTs;
    byDay.set(key, existing);
  }

  // Generate continuous daily series from cutoff to today (fill gaps with 0)
  const daily: DailyBar[] = [];
  const equity: EquityPoint[] = [];
  const ledger: LedgerRow[] = [];
  const sortedKeys = Array.from(byDay.keys()).sort();
  let startKey: string;
  if (cutoffMs === 0) {
    startKey = sortedKeys[0] || toDateKey(Date.now());
  } else {
    startKey = toDateKey(cutoffMs);
  }
  const endKey = toDateKey(Date.now());
  const startTs = new Date(startKey + 'T00:00:00.000Z').getTime();
  const endTs = new Date(endKey + 'T00:00:00.000Z').getTime();
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  const dailyPnls: number[] = [];

  for (let ts = startTs; ts <= endTs; ts += 24 * 3600 * 1000) {
    const key = toDateKey(ts);
    const day = byDay.get(key);
    const pnl = day ? Number(day.pnlSum.toFixed(2)) : 0;
    const trades = day ? day.trades : 0;
    const wins = day ? day.wins : 0;
    const losses = day ? day.losses : 0;
    const volume = day ? Number(day.volume.toFixed(2)) : 0;
    cumulative = Number((cumulative + pnl).toFixed(2));
    dailyPnls.push(pnl);
    if (cumulative > peak) peak = cumulative;
    const dd = peak - cumulative;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPct = peak > 0 ? (dd / peak) * 100 : 0;
    }
    daily.push({ date: key, timestamp: ts, pnl, volume, trades, wins, losses });
    equity.push({ date: key, timestamp: ts, cumulativePnl: cumulative, dailyPnl: pnl, trades, volume, wins, losses });
    const startBal = Number((cumulative - pnl).toFixed(2));
    ledger.push({ date: key, timestamp: ts, startBalance: startBal, endBalance: cumulative, dailyPnl: pnl, trades, wins, losses, volume });
  }

  // Summary metrics — single pass over filtered (no repeated scans)
  const totalPnl = cumulative;
  const totalTrades = filtered.length;
  let totalWins = 0;
  let totalLosses = 0;
  let settledCount = 0;
  let winsPnl = 0;
  let lossesPnl = 0;
  let totalVolume = 0;
  for (const o of filtered) {
    totalVolume += o.totalCost || 0;
    if (o.isSettled) {
      settledCount++;
      const pnl = o.pnl ?? 0;
      if (pnl > 0.01) { totalWins++; winsPnl += pnl; }
      else if (pnl < -0.01) { totalLosses++; lossesPnl += Math.abs(pnl); }
    }
  }
  totalVolume = Number(totalVolume.toFixed(2));
  const winRate = settledCount > 0 ? Number(((totalWins / settledCount) * 100).toFixed(1)) : 0;
  const avgWin = totalWins > 0 ? Number((winsPnl / totalWins).toFixed(2)) : 0;
  const avgLoss = totalLosses > 0 ? Number((lossesPnl / totalLosses).toFixed(2)) : 0;
  const profitFactor = lossesPnl > 0 ? Number((winsPnl / lossesPnl).toFixed(2)) : winsPnl > 0 ? 99.99 : 0;
  const payoffRatio = avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : 0;
  const expectancy = settledCount > 0 ? Number(((winsPnl - lossesPnl) / settledCount).toFixed(2)) : 0;
  const bestDay = daily.length > 0 ? Math.max(...daily.map((d) => d.pnl)) : 0;
  const worstDay = daily.length > 0 ? Math.min(...daily.map((d) => d.pnl)) : 0;
  const avgDailyPnl = daily.length > 0 ? Number((daily.reduce((a, d) => a + d.pnl, 0) / daily.length).toFixed(2)) : 0;
  let currentStreak = 0;
  let streakSign = 0;
  // Walk settled trades in chronological order already sorted; we need reverse for streak
  const settledTrades = filtered.filter((o) => o.isSettled);
  for (let i = settledTrades.length - 1; i >= 0; i--) {
    const pnl = settledTrades[i].pnl ?? 0;
    if (Math.abs(pnl) < 0.01) continue;
    const sign = pnl > 0 ? 1 : -1;
    if (streakSign === 0) {
      streakSign = sign;
      currentStreak = sign;
    } else if (sign === streakSign) {
      currentStreak += sign;
    } else break;
  }
  let sharpeApprox = 0;
  if (dailyPnls.length > 2) {
    const mean = dailyPnls.reduce((a, b) => a + b, 0) / dailyPnls.length;
    const variance = dailyPnls.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dailyPnls.length;
    const stdev = Math.sqrt(variance);
    sharpeApprox = stdev > 0 ? Number(((mean / stdev) * Math.sqrt(365)).toFixed(2)) : 0;
  }

  const summary: AnalyticsSummary = {
    totalPnl,
    realizedPnl: totalPnl,
    unclaimedPnl: 0,
    totalTrades,
    totalWins,
    totalLosses,
    winRate,
    totalVolume,
    avgWin,
    avgLoss,
    profitFactor,
    payoffRatio,
    expectancy,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    bestDay: Number(bestDay.toFixed(2)),
    worstDay: Number(worstDay.toFixed(2)),
    avgDailyPnl,
    currentStreak,
    sharpeApprox,
    totalClaimed: 0,
  };

  return { equity, daily, ledger, summary };
}

// --- Single-pass breakdown helpers ---

function computeSourceBreakdownSinglePass(
  allTargetOrders: OrderExecution[],
  swarmOrdersAll: OrderExecution[],
  terminalOrdersAll: OrderExecution[]
): SourceBreakdown[] {
  // Already partitioned; compute each bucket in one pass per bucket (3 buckets, but each is single-pass not 3× scans)
  // Actually compute all 3 buckets from allTargetOrders in one iteration to avoid extra partitions
  const buckets: Record<'ALL' | 'SWARM' | 'TERMINAL', { pnl: number; trades: number; wins: number; losses: number; volume: number; settled: number }> = {
    ALL: { pnl: 0, trades: 0, wins: 0, losses: 0, volume: 0, settled: 0 },
    SWARM: { pnl: 0, trades: 0, wins: 0, losses: 0, volume: 0, settled: 0 },
    TERMINAL: { pnl: 0, trades: 0, wins: 0, losses: 0, volume: 0, settled: 0 },
  };
  for (const o of allTargetOrders) {
    const pnl = o.pnl ?? 0;
    const isSettled = o.isSettled === true;
    const isWin = isSettled && pnl > 0.01;
    const isLoss = isSettled && pnl < -0.01;
    const vol = o.totalCost || 0;
    const isTerminal = o.source === 'TERMINAL' || o.agentType === 'Manual';
    buckets.ALL.pnl += pnl;
    buckets.ALL.trades += 1;
    buckets.ALL.volume += vol;
    if (isSettled) buckets.ALL.settled += 1;
    if (isWin) buckets.ALL.wins += 1;
    if (isLoss) buckets.ALL.losses += 1;

    const key: 'SWARM' | 'TERMINAL' = isTerminal ? 'TERMINAL' : 'SWARM';
    buckets[key].pnl += pnl;
    buckets[key].trades += 1;
    buckets[key].volume += vol;
    if (isSettled) buckets[key].settled += 1;
    if (isWin) buckets[key].wins += 1;
    if (isLoss) buckets[key].losses += 1;
  }
  const toEntry = (src: 'ALL' | 'SWARM' | 'TERMINAL', label: string): SourceBreakdown => {
    const b = buckets[src];
    const winRate = b.settled > 0 ? Number(((b.wins / b.settled) * 100).toFixed(1)) : 0;
    return {
      source: src,
      label,
      pnl: Number(b.pnl.toFixed(2)),
      trades: b.trades,
      wins: b.wins,
      losses: b.losses,
      winRate,
      volume: Number(b.volume.toFixed(2)),
    };
  };
  return [toEntry('ALL', 'All Activity'), toEntry('SWARM', 'Swarm AI Mirror'), toEntry('TERMINAL', 'Trader Cockpit')];
}

function computeBreakdownsSinglePass(orders: OrderExecution[]): {
  agentBreakdown: AgentBreakdown[];
  outcomeBreakdown: { outcome: string; pnl: number; trades: number; winRate: number }[];
  symbolBreakdown: { symbol: string; pnl: number; trades: number; winRate: number }[];
  windowBreakdown: { window: string; pnl: number; trades: number }[];
} {
  // Single iteration to collect agent/outcome/symbol/window maps
  const agentMap = new Map<string, { pnl: number; trades: number; wins: number; losses: number; volume: number; settled: number }>();
  const outcomeMap = new Map<string, { pnl: number; trades: number; wins: number; settled: number }>();
  const symbolMap = new Map<string, { pnl: number; trades: number; wins: number; settled: number }>();
  const windowMap = new Map<string, { pnl: number; trades: number }>();

  for (const o of orders) {
    const pnl = o.pnl ?? 0;
    const vol = o.totalCost || 0;
    const isSettled = o.isSettled === true;
    const isWin = isSettled && pnl > 0.01;
    const isLoss = isSettled && pnl < -0.01;

    const agentKey = o.agentType === 'Manual' && o.source === 'TERMINAL' ? 'Manual' : o.agentType;
    // Normalize agent key: keep as is, but ensure buckets exist
    if (!agentMap.has(agentKey)) agentMap.set(agentKey, { pnl: 0, trades: 0, wins: 0, losses: 0, volume: 0, settled: 0 });
    const ag = agentMap.get(agentKey)!;
    ag.pnl += pnl;
    ag.trades += 1;
    ag.volume += vol;
    if (isSettled) ag.settled += 1;
    if (isWin) ag.wins += 1;
    if (isLoss) ag.losses += 1;

    const outKey = o.outcome || 'Unknown';
    if (!outcomeMap.has(outKey)) outcomeMap.set(outKey, { pnl: 0, trades: 0, wins: 0, settled: 0 });
    const out = outcomeMap.get(outKey)!;
    out.pnl += pnl;
    out.trades += 1;
    if (isSettled) out.settled += 1;
    if (isWin) out.wins += 1;

    const symKey = o.marketSnapshot?.symbol || 'Unknown';
    if (!symbolMap.has(symKey)) symbolMap.set(symKey, { pnl: 0, trades: 0, wins: 0, settled: 0 });
    const sym = symbolMap.get(symKey)!;
    sym.pnl += pnl;
    sym.trades += 1;
    if (isSettled) sym.settled += 1;
    if (isWin) sym.wins += 1;

    const winKey = o.marketSnapshot?.windowDuration || 'Unknown';
    if (!windowMap.has(winKey)) windowMap.set(winKey, { pnl: 0, trades: 0 });
    const win = windowMap.get(winKey)!;
    win.pnl += pnl;
    win.trades += 1;
  }

  // Build agent breakdown in stable order (include zeros for known agents to keep UI consistent)
  const preferredAgents: string[] = ['Volt', 'Oracle', 'Titan', 'Sweeper', 'Manual', 'CUSTOM'];
  const agentBreakdown: AgentBreakdown[] = [];
  const seenAgents = new Set<string>();
  for (const key of preferredAgents) {
    if (agentMap.has(key)) {
      seenAgents.add(key);
      const v = agentMap.get(key)!;
      const winRate = v.settled > 0 ? Number(((v.wins / v.settled) * 100).toFixed(1)) : 0;
      agentBreakdown.push({
        agentType: key as AgentType,
        pnl: Number(v.pnl.toFixed(2)),
        trades: v.trades,
        wins: v.wins,
        losses: v.losses,
        winRate,
        volume: Number(v.volume.toFixed(2)),
        avgPnl: v.trades > 0 ? Number((v.pnl / v.trades).toFixed(2)) : 0,
      });
    }
  }
  // Any extra agents not in preferred list
  for (const [key, v] of agentMap.entries()) {
    if (seenAgents.has(key)) continue;
    const winRate = v.settled > 0 ? Number(((v.wins / v.settled) * 100).toFixed(1)) : 0;
    agentBreakdown.push({
      agentType: key as AgentType,
      pnl: Number(v.pnl.toFixed(2)),
      trades: v.trades,
      wins: v.wins,
      losses: v.losses,
      winRate,
      volume: Number(v.volume.toFixed(2)),
      avgPnl: v.trades > 0 ? Number((v.pnl / v.trades).toFixed(2)) : 0,
    });
  }
  // Ensure at least the 4 core agents appear even if zero trades (UI expects them)
  for (const core of ['Volt', 'Oracle', 'Titan', 'Sweeper'] as const) {
    if (!agentBreakdown.some((a) => a.agentType === core)) {
      agentBreakdown.push({ agentType: core as AgentType, pnl: 0, trades: 0, wins: 0, losses: 0, winRate: 0, volume: 0, avgPnl: 0 });
    }
  }

  const outcomeBreakdown = Array.from(outcomeMap.entries()).map(([outcome, v]) => ({
    outcome,
    pnl: Number(v.pnl.toFixed(2)),
    trades: v.trades,
    winRate: v.settled > 0 ? Number(((v.wins / v.settled) * 100).toFixed(1)) : 0,
  }));
  // Ensure YES/NO always present
  for (const o of ['YES', 'NO']) {
    if (!outcomeBreakdown.some((x) => x.outcome === o)) outcomeBreakdown.push({ outcome: o, pnl: 0, trades: 0, winRate: 0 });
  }

  const symbolBreakdown = Array.from(symbolMap.entries()).map(([symbol, v]) => ({
    symbol,
    pnl: Number(v.pnl.toFixed(2)),
    trades: v.trades,
    winRate: v.settled > 0 ? Number(((v.wins / v.settled) * 100).toFixed(1)) : 0,
  }));

  const windowBreakdown = Array.from(windowMap.entries()).map(([window, v]) => ({
    window,
    pnl: Number(v.pnl.toFixed(2)),
    trades: v.trades,
  }));

  return { agentBreakdown, outcomeBreakdown, symbolBreakdown, windowBreakdown };
}

export class AnalyticsService {
  private analyticsCache = new Map<string, { data: AnalyticsResponse; expiresAt: number }>();
  private inFlightPromise = new Map<string, Promise<AnalyticsResponse>>();
  // 15s TTL — was 4s, caused 429 under 3 concurrent judges polling /analytics/equity every 2-3s.
  // 15s reduces recomputes by 3.75× while keeping data <15s stale; inFlight dedup prevents stampede.
  private static readonly ANALYTICS_TTL_MS = 15_000;
  // Optional pre-aggregated daily_pnl table — if present, use it to avoid scanning orders for equity curves
  private static readonly USE_DAILY_PNL = true;

  public invalidateCache(userAddress?: string): void {
    if (userAddress) {
      const prefix = userAddress.toLowerCase();
      for (const k of this.analyticsCache.keys()) {
        if (k.startsWith(prefix)) this.analyticsCache.delete(k);
      }
    } else {
      this.analyticsCache.clear();
    }
  }

  private async tryLoadDailyPnl(
    normalizedUser: string,
    range: AnalyticsRange,
    cutoffMs: number,
    source: 'ALL' | 'SWARM' | 'TERMINAL' = 'ALL',
  ): Promise<{ equity: EquityPoint[]; daily: DailyBar[]; ledger: LedgerRow[] } | null> {
    if (!AnalyticsService.USE_DAILY_PNL) return null;
    if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') return null;
    const url = process.env.SUPABASE_URL || '';
    if (!url || url.includes('mock-project')) return null;
    try {
      const cutoffDate = cutoffMs > 0 ? new Date(cutoffMs).toISOString().slice(0, 10) : '1970-01-01'; // YYYY-MM-DD
      const { data, error } = await supabase
        .from('daily_pnl')
        .select('*')
        .eq('user_address', normalizedUser)
        .eq('source', source)
        .gte('day', cutoffDate)
        .order('day', { ascending: true });
      if (error || !data || data.length === 0) return null;
      // Reconstruct equity curve from daily_pnl rows
      const byDay = new Map<string, { pnl: number; volume: number; trades: number; wins: number; losses: number }>();
      for (const r of data as any[]) {
        byDay.set(r.day, { pnl: Number(r.pnl || 0), volume: Number(r.volume || 0), trades: Number(r.trades || 0), wins: Number(r.wins || 0), losses: Number(r.losses || 0) });
      }
      const startKey = toDateKey(cutoffMs === 0 ? new Date((data[0] as any).day).getTime() : cutoffMs);
      const endKey = toDateKey(Date.now());
      const startTs = new Date(startKey + 'T00:00:00.000Z').getTime();
      const endTs = new Date(endKey + 'T00:00:00.000Z').getTime();
      const equity: EquityPoint[] = [];
      const daily: DailyBar[] = [];
      const ledger: LedgerRow[] = [];
      let cumulative = 0;
      let peak = 0;
      for (let ts = startTs; ts <= endTs; ts += 24 * 3600 * 1000) {
        const key = toDateKey(ts);
        const d = byDay.get(key);
        const pnl = d ? Number(d.pnl.toFixed(2)) : 0;
        cumulative = Number((cumulative + pnl).toFixed(2));
        if (cumulative > peak) peak = cumulative;
        daily.push({ date: key, timestamp: ts, pnl, volume: d ? Number(d.volume.toFixed(2)) : 0, trades: d ? d.trades : 0, wins: d ? d.wins : 0, losses: d ? d.losses : 0 });
        equity.push({ date: key, timestamp: ts, cumulativePnl: cumulative, dailyPnl: pnl, trades: d ? d.trades : 0, volume: d ? Number(d.volume.toFixed(2)) : 0, wins: d ? d.wins : 0, losses: d ? d.losses : 0 });
        ledger.push({ date: key, timestamp: ts, startBalance: Number((cumulative - pnl).toFixed(2)), endBalance: cumulative, dailyPnl: pnl, trades: d ? d.trades : 0, wins: d ? d.wins : 0, losses: d ? d.losses : 0, volume: d ? Number(d.volume.toFixed(2)) : 0 });
      }
      return { equity, daily, ledger };
    } catch {
      return null;
    }
  }

  public async getAnalytics(
    userAddress: string | undefined,
    range: AnalyticsRange = '30d',
    source: 'ALL' | 'SWARM' | 'TERMINAL' = 'ALL',
    force: boolean = false,
  ): Promise<AnalyticsResponse> {
    const normalizedUser = userAddress && userAddress.trim().length > 0 ? userAddress.trim().toLowerCase() : undefined;
    const cacheKey = `${normalizedUser || 'swarm'}:${range}:${source}`;
    const nowMs = Date.now();

    if (!force) {
      const cached = this.analyticsCache.get(cacheKey);
      if (cached && nowMs < cached.expiresAt) {
        return cached.data;
      }
      const inFlight = this.inFlightPromise.get(cacheKey);
      if (inFlight) {
        return inFlight;
      }
    }

    const computeAnalytics = async (): Promise<AnalyticsResponse> => {
      const isOperator = normalizedUser ? normalizedUser === operatorAccount.address.toLowerCase() : false;
      const cutoffMs = getRangeCutoff(range);
      const operatorLower = operatorAccount.address.toLowerCase();
      const targetUser = normalizedUser || operatorLower;

      // Targeted order fetching: partition in-memory orders first
      let userOrders: OrderExecution[] = [];
      let operatorOrders: OrderExecution[] = [];

      const memOrders: OrderExecution[] = typeof orderService.getOrders === 'function' ? orderService.getOrders() : [];
      for (const o of memOrders) {
        const lower = o.userAddress ? o.userAddress.toLowerCase() : '';
        if (normalizedUser && lower === normalizedUser) userOrders.push(o);
        if (lower === operatorLower) operatorOrders.push(o);
      }

      // If persistence enabled, query DB scoped specifically to userAddress / operatorAddress (indexed) instead of scanning all 5000+ orders
      if (typeof (orderService as any).isPersistenceEnabled === 'function' && (orderService as any).isPersistenceEnabled()) {
        const dbTasks: Promise<void>[] = [];
        if (normalizedUser && userOrders.length === 0) {
          dbTasks.push(
            (async () => {
              try {
                const dbUser = await (orderService as any).getOrdersAsync({ userAddress: normalizedUser });
                if (Array.isArray(dbUser) && dbUser.length > 0) {
                  const seen = new Set(userOrders.map((o) => o.id));
                  for (const o of dbUser) {
                    if (!seen.has(o.id)) {
                      userOrders.push(o);
                      seen.add(o.id);
                    }
                  }
                }
              } catch {}
            })()
          );
        }
        if (operatorOrders.length === 0) {
          dbTasks.push(
            (async () => {
              try {
                const dbOp = await (orderService as any).getOrdersAsync({ userAddress: operatorLower });
                if (Array.isArray(dbOp) && dbOp.length > 0) {
                  const seen = new Set(operatorOrders.map((o) => o.id));
                  for (const o of dbOp) {
                    if (!seen.has(o.id)) {
                      operatorOrders.push(o);
                      seen.add(o.id);
                    }
                  }
                }
              } catch {}
            })()
          );
        }
        if (dbTasks.length > 0) {
          await Promise.all(dbTasks);
        }
      }

      const allTargetOrders = normalizedUser ? userOrders : operatorOrders;

      // Partition primary by source in one pass vs 2 filters
      let primaryOrders: OrderExecution[] = allTargetOrders;
      if (source === 'TERMINAL' || source === 'SWARM') {
        const isTerminal = source === 'TERMINAL';
        primaryOrders = [];
        for (const o of allTargetOrders) {
          const term = o.source === 'TERMINAL' || o.agentType === 'Manual';
          if (term === isTerminal) primaryOrders.push(o);
        }
      }

      // Partition swarm/terminal splits in one pass (reused for sourceBreakdown + summaries)
      const terminalOrdersAll: OrderExecution[] = [];
      const swarmOrdersAll: OrderExecution[] = [];
      for (const o of allTargetOrders) {
        const isTerm = o.source === 'TERMINAL' || o.agentType === 'Manual';
        if (isTerm) terminalOrdersAll.push(o);
        else swarmOrdersAll.push(o);
      }

      // Load pre-aggregated daily_pnl in parallel for instant O(1) indexed curves
      const [primaryDailyPnl, swarmDailyPnl, terminalDailyPnl] = await Promise.all([
        this.tryLoadDailyPnl(targetUser, range, cutoffMs, source),
        normalizedUser && normalizedUser !== operatorLower
          ? this.tryLoadDailyPnl(operatorLower, range, cutoffMs, 'ALL')
          : Promise.resolve(null),
        source === 'ALL'
          ? this.tryLoadDailyPnl(targetUser, range, cutoffMs, 'TERMINAL')
          : Promise.resolve(null),
      ]);

      const primaryComputed = computeEquityAndDaily(primaryOrders, cutoffMs);
      const swarmComputed = computeEquityAndDaily(operatorOrders, cutoffMs);
      const terminalComputed = computeEquityAndDaily(terminalOrdersAll, cutoffMs);
      const swarmUserComputed = computeEquityAndDaily(swarmOrdersAll, cutoffMs);

      // Use pre-aggregated curves if available, with computed curves as fallback
      const finalEquity = primaryDailyPnl?.equity ?? primaryComputed.equity;
      const finalDaily = primaryDailyPnl?.daily ?? primaryComputed.daily;
      const finalLedger = primaryDailyPnl?.ledger ?? primaryComputed.ledger;
      const finalTerminalEquity = terminalDailyPnl?.equity ?? terminalComputed.equity;
      const finalSwarmEquity = swarmDailyPnl?.equity ?? swarmComputed.equity;

      // Enrich summary with on-chain unclaimed + claimed
      let unclaimedPnl = 0;
      let totalClaimed = 0;
      try {
        const sweeperSummary = await settlementService.getSweeperSummary(normalizedUser || operatorAccount.address).catch(() => null);
        if (sweeperSummary) {
          unclaimedPnl = sweeperSummary.unclaimedAmount || 0;
          totalClaimed = sweeperSummary.totalClaimedAllTime || 0;
        }
      } catch {}

      primaryComputed.summary.unclaimedPnl = Number(unclaimedPnl.toFixed(2));
      primaryComputed.summary.totalClaimed = Number(totalClaimed.toFixed(2));
      primaryComputed.summary.totalPnl = Number((primaryComputed.summary.realizedPnl + 0).toFixed(2));

      swarmComputed.summary.unclaimedPnl = 0;
      swarmComputed.summary.totalClaimed = 0;

      // Source Breakdown — single-pass (was 5 full scans)
      const sourceBreakdown = computeSourceBreakdownSinglePass(allTargetOrders, swarmOrdersAll, terminalOrdersAll);

      // Breakdowns — filter once, then single-pass for all 4 breakdown types (was 5× filter + 4× multi-scan)
      const filteredPrimary = primaryOrders.filter((o) => {
        const ts = o.settledAt ? new Date(o.settledAt).getTime() : new Date(o.createdAt).getTime();
        return ts >= cutoffMs;
      });
      const filteredOperator = operatorOrders.filter((o) => {
        const ts = o.settledAt ? new Date(o.settledAt).getTime() : new Date(o.createdAt).getTime();
        return ts >= cutoffMs;
      });
      const { agentBreakdown, outcomeBreakdown, symbolBreakdown, windowBreakdown } = computeBreakdownsSinglePass(filteredPrimary);
      const { agentBreakdown: swarmAgentBreakdown } = computeBreakdownsSinglePass(filteredOperator);

      // Recent trades (last 10) — single sort
      const recentTrades = [...primaryOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

      const result: AnalyticsResponse = {
        range,
        source,
        userAddress: normalizedUser || operatorAccount.address,
        isOperator,
        generatedAt: new Date().toISOString(),
        summary: primaryComputed.summary,
        terminalSummary: terminalComputed.summary,
        swarmSummary: swarmUserComputed.summary,
        sourceBreakdown,
        equityCurve: finalEquity,
        terminalEquityCurve: finalTerminalEquity,
        swarmEquityCurve: finalSwarmEquity,
        dailyBars: finalDaily,
        agentBreakdown,
        swarmAgentBreakdown,
        outcomeBreakdown,
        symbolBreakdown,
        windowBreakdown,
        ledger: finalLedger,
        recentTrades,
      };

      this.analyticsCache.set(cacheKey, { data: result, expiresAt: Date.now() + AnalyticsService.ANALYTICS_TTL_MS });
      return result;
    };

    const promise = computeAnalytics().finally(() => {
      this.inFlightPromise.delete(cacheKey);
    });
    this.inFlightPromise.set(cacheKey, promise);
    return promise;
  }

  public async getBalanceHistory(
    userAddress: string | undefined,
    range: AnalyticsRange = '30d',
    source: 'ALL' | 'SWARM' | 'TERMINAL' = 'ALL',
  ): Promise<{ equityCurve: EquityPoint[]; swarmEquityCurve: EquityPoint[]; terminalEquityCurve?: EquityPoint[] }> {
    const analytics = await this.getAnalytics(userAddress, range, source);
    return {
      equityCurve: analytics.equityCurve,
      swarmEquityCurve: analytics.swarmEquityCurve,
      terminalEquityCurve: analytics.terminalEquityCurve,
    };
  }
}

export const analyticsService = new AnalyticsService();
