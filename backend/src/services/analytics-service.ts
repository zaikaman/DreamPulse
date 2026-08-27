import { orderService } from './order-service.js';
import { settlementService } from './settlement-service.js';
import { SOMNIA_ADDRESSES, operatorAccount } from '../config/somnia.js';
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

  // Group by day
  const byDay = new Map<string, { pnlSum: number; trades: number; wins: number; losses: number; volume: number; ts: number }>();
  for (const o of filtered) {
    const ts = o.settledAt ? new Date(o.settledAt).getTime() : new Date(o.createdAt).getTime();
    const key = toDateKey(ts);
    const existing = byDay.get(key) || { pnlSum: 0, trades: 0, wins: 0, losses: 0, volume: 0, ts };
    // Only count settled PnL for daily bars; pending/open trades contribute 0 to pnl but still count as trade if we want
    // For analytics we count all FILLED trades; PENDING with 0 pnl counts as active but not win/loss
    const pnl = o.pnl ?? 0;
    const isSettled = o.isSettled === true;
    const isWin = isSettled && pnl > 0.01;
    const isLoss = isSettled && pnl < -0.01;
    // Use earliest timestamp of day for ordering
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
  // If no data, still generate empty but summary will be zero
  // Determine start date
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
  // For sharpe approx, collect daily pnls
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
    // Drawdown
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

  // If there are gaps before first trade but cutoff was 0, trim leading zero days to first trade day - 2 days for context
  // Keep full range for fixed ranges, but for ALL we trim to avoid 100+ empty days when bot just started
  // Let's keep trimmed for readability: if range ALL and we have data, start from first key minus 1 day
  // Actually keep as is for accurate charts - filled gaps are informative. We'll keep full.

  // Summary metrics
  const totalPnl = cumulative;
  const totalTrades = filtered.length;
  const settledTrades = filtered.filter((o) => o.isSettled);
  const totalWins = settledTrades.filter((o) => (o.pnl ?? 0) > 0.01).length;
  const totalLosses = settledTrades.filter((o) => (o.pnl ?? 0) < -0.01).length;
  const winRate = settledTrades.length > 0 ? Number(((totalWins / settledTrades.length) * 100).toFixed(1)) : 0;
  const totalVolume = Number(filtered.reduce((a, o) => a + (o.totalCost || 0), 0).toFixed(2));
  const winsPnl = settledTrades.filter((o) => (o.pnl ?? 0) > 0).reduce((a, o) => a + (o.pnl ?? 0), 0);
  const lossesPnl = Math.abs(settledTrades.filter((o) => (o.pnl ?? 0) < 0).reduce((a, o) => a + (o.pnl ?? 0), 0));
  const avgWin = totalWins > 0 ? Number((winsPnl / totalWins).toFixed(2)) : 0;
  const avgLoss = totalLosses > 0 ? Number((lossesPnl / totalLosses).toFixed(2)) : 0;
  const profitFactor = lossesPnl > 0 ? Number((winsPnl / lossesPnl).toFixed(2)) : winsPnl > 0 ? 99.99 : 0;
  const payoffRatio = avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : 0;
  const expectancy = settledTrades.length > 0 ? Number(((winsPnl - lossesPnl) / settledTrades.length).toFixed(2)) : 0;
  const bestDay = daily.length > 0 ? Math.max(...daily.map((d) => d.pnl)) : 0;
  const worstDay = daily.length > 0 ? Math.min(...daily.map((d) => d.pnl)) : 0;
  const avgDailyPnl = daily.length > 0 ? Number((daily.reduce((a, d) => a + d.pnl, 0) / daily.length).toFixed(2)) : 0;
  // Streak
  let currentStreak = 0;
  let streakSign = 0; // 1 win, -1 loss
  for (let i = settledTrades.length - 1; i >= 0; i--) {
    const pnl = settledTrades[i].pnl ?? 0;
    if (Math.abs(pnl) < 0.01) continue; // skip breakeven/void slight?
    const sign = pnl > 0 ? 1 : -1;
    if (streakSign === 0) {
      streakSign = sign;
      currentStreak = sign;
    } else if (sign === streakSign) {
      currentStreak += sign;
    } else break;
  }
  // Sharpe approx: mean / stddev * sqrt(252)
  let sharpeApprox = 0;
  if (dailyPnls.length > 2) {
    const mean = dailyPnls.reduce((a, b) => a + b, 0) / dailyPnls.length;
    const variance = dailyPnls.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dailyPnls.length;
    const stdev = Math.sqrt(variance);
    sharpeApprox = stdev > 0 ? Number(((mean / stdev) * Math.sqrt(252)).toFixed(2)) : 0;
  }

  const summary: AnalyticsSummary = {
    totalPnl,
    realizedPnl: totalPnl,
    unclaimedPnl: 0, // filled by caller
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

function breakdownByAgent(orders: OrderExecution[]): AgentBreakdown[] {
  const agentList: AgentType[] = ['Volt', 'Oracle', 'Titan', 'Sweeper'];
  if (orders.some((o) => o.agentType === 'Manual' || o.source === 'TERMINAL')) {
    agentList.push('Manual');
  }
  return agentList.map((agent) => {
    const filtered = orders.filter((o) => o.agentType === agent || (agent === 'Manual' && o.source === 'TERMINAL'));
    const settled = filtered.filter((o) => o.isSettled);
    const wins = settled.filter((o) => (o.pnl ?? 0) > 0.01).length;
    const losses = settled.filter((o) => (o.pnl ?? 0) < -0.01).length;
    const pnl = Number(filtered.reduce((a, o) => a + (o.pnl ?? 0), 0).toFixed(2));
    const volume = Number(filtered.reduce((a, o) => a + (o.totalCost || 0), 0).toFixed(2));
    const winRate = settled.length > 0 ? Number(((wins / settled.length) * 100).toFixed(1)) : 0;
    const avgPnl = filtered.length > 0 ? Number((pnl / filtered.length).toFixed(2)) : 0;
    return { agentType: agent, pnl, trades: filtered.length, wins, losses, winRate, volume, avgPnl };
  });
}

function breakdownOutcome(orders: OrderExecution[]) {
  const outcomes = ['YES', 'NO'];
  return outcomes.map((outcome) => {
    const filtered = orders.filter((o) => o.outcome === outcome);
    const settled = filtered.filter((o) => o.isSettled);
    const wins = settled.filter((o) => (o.pnl ?? 0) > 0.01).length;
    const pnl = Number(filtered.reduce((a, o) => a + (o.pnl ?? 0), 0).toFixed(2));
    const winRate = settled.length > 0 ? Number(((wins / settled.length) * 100).toFixed(1)) : 0;
    return { outcome, pnl, trades: filtered.length, winRate };
  });
}

function breakdownSymbol(orders: OrderExecution[]) {
  const symbols = Array.from(new Set(orders.map((o) => o.marketSnapshot?.symbol || 'Unknown')));
  return symbols.map((symbol) => {
    const filtered = orders.filter((o) => (o.marketSnapshot?.symbol || 'Unknown') === symbol);
    const settled = filtered.filter((o) => o.isSettled);
    const wins = settled.filter((o) => (o.pnl ?? 0) > 0.01).length;
    const pnl = Number(filtered.reduce((a, o) => a + (o.pnl ?? 0), 0).toFixed(2));
    const winRate = settled.length > 0 ? Number(((wins / settled.length) * 100).toFixed(1)) : 0;
    return { symbol, pnl, trades: filtered.length, winRate };
  });
}

function breakdownWindow(orders: OrderExecution[]) {
  const windows = Array.from(new Set(orders.map((o) => o.marketSnapshot?.windowDuration || 'Unknown')));
  return windows.map((window) => {
    const filtered = orders.filter((o) => (o.marketSnapshot?.windowDuration || 'Unknown') === window);
    const pnl = Number(filtered.reduce((a, o) => a + (o.pnl ?? 0), 0).toFixed(2));
    return { window, pnl, trades: filtered.length };
  });
}

export class AnalyticsService {
  private analyticsCache = new Map<string, { data: AnalyticsResponse; expiresAt: number }>();
  private inFlightPromise = new Map<string, Promise<AnalyticsResponse>>();

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

      // Fetch orders for user and swarm
      const allOrders = orderService.getOrders({ limit: undefined } as any); // get all in memory (no limit)
      const userOrders = normalizedUser ? allOrders.filter((o) => o.userAddress && o.userAddress.toLowerCase() === normalizedUser) : [];
      const operatorOrders = allOrders.filter((o) => o.userAddress && o.userAddress.toLowerCase() === operatorAccount.address.toLowerCase());

      const allTargetOrders = normalizedUser ? userOrders : operatorOrders;
      
      let primaryOrders = allTargetOrders;
      if (source === 'TERMINAL') {
        primaryOrders = allTargetOrders.filter((o) => o.source === 'TERMINAL' || o.agentType === 'Manual');
      } else if (source === 'SWARM') {
        primaryOrders = allTargetOrders.filter((o) => o.source !== 'TERMINAL' && o.agentType !== 'Manual');
      }

      const primaryComputed = computeEquityAndDaily(primaryOrders, cutoffMs);
      const swarmComputed = computeEquityAndDaily(operatorOrders, cutoffMs);

      const terminalOrdersAll = allTargetOrders.filter((o) => o.source === 'TERMINAL' || o.agentType === 'Manual');
      const swarmOrdersAll = allTargetOrders.filter((o) => o.source !== 'TERMINAL' && o.agentType !== 'Manual');

      const terminalComputed = computeEquityAndDaily(terminalOrdersAll, cutoffMs);
      const swarmUserComputed = computeEquityAndDaily(swarmOrdersAll, cutoffMs);

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

      // Source Breakdown comparative analytics
      const sourceBreakdown: SourceBreakdown[] = [
        {
          source: 'ALL',
          label: 'All Activity',
          pnl: Number(allTargetOrders.reduce((a, o) => a + (o.pnl ?? 0), 0).toFixed(2)),
          trades: allTargetOrders.length,
          wins: allTargetOrders.filter((o) => o.isSettled && (o.pnl ?? 0) > 0.01).length,
          losses: allTargetOrders.filter((o) => o.isSettled && (o.pnl ?? 0) < -0.01).length,
          winRate: allTargetOrders.filter((o) => o.isSettled).length > 0
            ? Number(((allTargetOrders.filter((o) => o.isSettled && (o.pnl ?? 0) > 0.01).length / allTargetOrders.filter((o) => o.isSettled).length) * 100).toFixed(1))
            : 0,
          volume: Number(allTargetOrders.reduce((a, o) => a + (o.totalCost || 0), 0).toFixed(2)),
        },
        {
          source: 'SWARM',
          label: 'Swarm AI Mirror',
          pnl: Number(swarmOrdersAll.reduce((a, o) => a + (o.pnl ?? 0), 0).toFixed(2)),
          trades: swarmOrdersAll.length,
          wins: swarmOrdersAll.filter((o) => o.isSettled && (o.pnl ?? 0) > 0.01).length,
          losses: swarmOrdersAll.filter((o) => o.isSettled && (o.pnl ?? 0) < -0.01).length,
          winRate: swarmOrdersAll.filter((o) => o.isSettled).length > 0
            ? Number(((swarmOrdersAll.filter((o) => o.isSettled && (o.pnl ?? 0) > 0.01).length / swarmOrdersAll.filter((o) => o.isSettled).length) * 100).toFixed(1))
            : 0,
          volume: Number(swarmOrdersAll.reduce((a, o) => a + (o.totalCost || 0), 0).toFixed(2)),
        },
        {
          source: 'TERMINAL',
          label: 'Trader Cockpit',
          pnl: Number(terminalOrdersAll.reduce((a, o) => a + (o.pnl ?? 0), 0).toFixed(2)),
          trades: terminalOrdersAll.length,
          wins: terminalOrdersAll.filter((o) => o.isSettled && (o.pnl ?? 0) > 0.01).length,
          losses: terminalOrdersAll.filter((o) => o.isSettled && (o.pnl ?? 0) < -0.01).length,
          winRate: terminalOrdersAll.filter((o) => o.isSettled).length > 0
            ? Number(((terminalOrdersAll.filter((o) => o.isSettled && (o.pnl ?? 0) > 0.01).length / terminalOrdersAll.filter((o) => o.isSettled).length) * 100).toFixed(1))
            : 0,
          volume: Number(terminalOrdersAll.reduce((a, o) => a + (o.totalCost || 0), 0).toFixed(2)),
        },
      ];

      // Breakdowns
      const agentBreakdown = breakdownByAgent(primaryOrders.filter((o) => {
        const ts = o.settledAt ? new Date(o.settledAt).getTime() : new Date(o.createdAt).getTime();
        return ts >= cutoffMs;
      }));
      const swarmAgentBreakdown = breakdownByAgent(operatorOrders.filter((o) => {
        const ts = o.settledAt ? new Date(o.settledAt).getTime() : new Date(o.createdAt).getTime();
        return ts >= cutoffMs;
      }));
      const outcomeBreakdown = breakdownOutcome(primaryOrders.filter((o) => {
        const ts = o.settledAt ? new Date(o.settledAt).getTime() : new Date(o.createdAt).getTime();
        return ts >= cutoffMs;
      }));
      const symbolBreakdown = breakdownSymbol(primaryOrders.filter((o) => {
        const ts = o.settledAt ? new Date(o.settledAt).getTime() : new Date(o.createdAt).getTime();
        return ts >= cutoffMs;
      }));
      const windowBreakdown = breakdownWindow(primaryOrders.filter((o) => {
        const ts = o.settledAt ? new Date(o.settledAt).getTime() : new Date(o.createdAt).getTime();
        return ts >= cutoffMs;
      }));

      // Recent trades (last 10)
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
        equityCurve: primaryComputed.equity,
        terminalEquityCurve: terminalComputed.equity,
        swarmEquityCurve: swarmComputed.equity,
        dailyBars: primaryComputed.daily,
        agentBreakdown,
        swarmAgentBreakdown,
        outcomeBreakdown,
        symbolBreakdown,
        windowBreakdown,
        ledger: primaryComputed.ledger,
        recentTrades,
      };

      // 4-second TTL
      this.analyticsCache.set(cacheKey, { data: result, expiresAt: Date.now() + 4000 });
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
