import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  SparklesIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  Square3Stack3DIcon,
  ArrowUpRightIcon,
  ArrowDownRightIcon,
  ShieldCheckIcon,
  WalletIcon,
  EyeIcon,
  CpuChipIcon,
  UserIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../services/api.js';
import { SOMNIA_ADDRESSES } from '../services/web3.js';
import type { SettlementSweep } from '../types/index.js';
import { telemetryClient, type SweepCompleteData, type PnlUpdateData } from '../services/telemetry-client.js';
import { shouldPoll, STALE_TIMES } from '../lib/polling.js';
import { ClaimCelebration } from './ClaimCelebration.js';
import { Spinner } from './ui/Spinner.js';
import { Pagination } from './ui/Pagination.js';
import { Badge } from './ui/badge.js';
import { cn } from '../lib/utils.js';

interface SweeperControlsProps {
  userAddress?: string;
  onRefreshPortfolio?: () => void;
  onConnectWallet?: () => Promise<void>;
}

const SWEEPER_SUMMARY_CACHE_KEY = 'dreampulse_sweeper_summary_';
const SWEEPER_HISTORY_CACHE_KEY = 'dreampulse_sweeper_history_';

interface CachedSweeperData {
  unclaimedAmount: number;
  totalClaimedAllTime: number;
  claimableMarketsCount: number;
}

export const SweeperControls: React.FC<SweeperControlsProps> = ({
  userAddress,
  onRefreshPortfolio,
  onConnectWallet,
}) => {
  const activeAddress = (userAddress ?? SOMNIA_ADDRESSES.operatorAccount).toLowerCase();
  const isViewingSelf = !!userAddress;

  const initialCache = (() => {
    try {
      const raw = localStorage.getItem(`${SWEEPER_SUMMARY_CACHE_KEY}${activeAddress}`);
      return raw ? (JSON.parse(raw) as CachedSweeperData) : null;
    } catch {
      return null;
    }
  })();

  const initialHistory = (() => {
    try {
      const raw = localStorage.getItem(`${SWEEPER_HISTORY_CACHE_KEY}${activeAddress}`);
      return raw ? (JSON.parse(raw) as SettlementSweep[]) : [];
    } catch {
      return [];
    }
  })();

  const [isSweeping, setIsSweeping] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(!initialCache);
  const [history, setHistory] = useState<SettlementSweep[]>(initialHistory);
  const [unclaimedAmount, setUnclaimedAmount] = useState<number>(initialCache?.unclaimedAmount || 0);
  const [totalClaimedAllTime, setTotalClaimedAllTime] = useState<number>(initialCache?.totalClaimedAllTime || 0);
  const [claimableMarketsCount, setClaimableMarketsCount] = useState<number>(initialCache?.claimableMarketsCount || 0);

  const [selectedOutcome, setSelectedOutcome] = useState<'ALL' | 'YES' | 'NO'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const filteredHistory = useMemo(() => {
    const list = history.filter((sweep) => {
      if (selectedOutcome !== 'ALL' && sweep.winningOutcome !== selectedOutcome) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesMarket = (sweep.marketId || '').toLowerCase().includes(q);
        const matchesTx = (sweep.txHash || '').toLowerCase().includes(q);
        const matchesToken = (sweep.payoutToken || '').toLowerCase().includes(q);
        if (!matchesMarket && !matchesTx && !matchesToken) return false;
      }
      return true;
    });

    return list.sort((a, b) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime());
  }, [history, selectedOutcome, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedOutcome, searchQuery, activeAddress]);

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / pageSize));
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredHistory.slice(start, start + pageSize);
  }, [filteredHistory, currentPage, pageSize]);

  const isFiltered = selectedOutcome !== 'ALL' || searchQuery.trim().length > 0;

  const [celebrationState, setCelebrationState] = useState<{ isOpen: boolean; amount: string; txHash?: string }>({ isOpen: false, amount: '' });

  const requestIdRef = useRef(0);

  const fetchSweeperData = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    const addr = activeAddress;
    try {
      const [summaryRes, historyRes] = await Promise.all([
        apiClient.getSweeperSummary(addr).catch(() => null),
        apiClient.getSweepHistory(addr).catch(() => null),
      ]);
      if (reqId !== requestIdRef.current) return;
      if (summaryRes?.success && summaryRes.data) {
        const uAmount = summaryRes.data.unclaimedAmount || 0;
        const tClaimed = summaryRes.data.totalClaimedAllTime || 0;
        const cCount = summaryRes.data.claimableMarketsCount || 0;
        setUnclaimedAmount(uAmount);
        setTotalClaimedAllTime(tClaimed);
        setClaimableMarketsCount(cCount);
        try {
          localStorage.setItem(`${SWEEPER_SUMMARY_CACHE_KEY}${addr}`, JSON.stringify({ unclaimedAmount: uAmount, totalClaimedAllTime: tClaimed, claimableMarketsCount: cCount }));
        } catch {}
      }
      if (historyRes?.success && Array.isArray(historyRes.data)) {
        setHistory(historyRes.data);
        try {
          localStorage.setItem(`${SWEEPER_HISTORY_CACHE_KEY}${addr}`, JSON.stringify(historyRes.data));
        } catch {}
      }
    } catch (err: any) {
      if (reqId !== requestIdRef.current) return;
      console.warn('[SweeperControls] Fetch data error:', err);
    } finally {
      if (reqId === requestIdRef.current) setIsLoading(false);
    }
  }, [activeAddress]);

  useEffect(() => {
    requestIdRef.current++;
    try {
      const rawSummary = localStorage.getItem(`${SWEEPER_SUMMARY_CACHE_KEY}${activeAddress}`);
      const rawHistory = localStorage.getItem(`${SWEEPER_HISTORY_CACHE_KEY}${activeAddress}`);
      if (rawSummary) {
        const parsed = JSON.parse(rawSummary) as CachedSweeperData;
        setUnclaimedAmount(parsed.unclaimedAmount || 0);
        setTotalClaimedAllTime(parsed.totalClaimedAllTime || 0);
        setClaimableMarketsCount(parsed.claimableMarketsCount || 0);
        setIsLoading(false);
      } else {
        setHistory([]);
        setUnclaimedAmount(0);
        setTotalClaimedAllTime(0);
        setClaimableMarketsCount(0);
        setIsLoading(true);
      }
      if (rawHistory) setHistory(JSON.parse(rawHistory));
    } catch {}
    fetchSweeperData();
    let debounceTimer: number | null = null;
    const scheduleRefresh = (delay = 200) => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        fetchSweeperData();
        if (onRefreshPortfolio) onRefreshPortfolio();
      }, delay);
    };
    const unsubSweep = telemetryClient.on('sweep_completed', (sweep: SweepCompleteData) => {
      if (!sweep.userAddress || sweep.userAddress.toLowerCase() === activeAddress.toLowerCase()) scheduleRefresh(150);
    });
    const unsubPnl = telemetryClient.on('pnl_update', (_pnl: PnlUpdateData) => scheduleRefresh(300));
    const interval = window.setInterval(() => {
      if (!shouldPoll()) return;
      fetchSweeperData();
    }, STALE_TIMES.sweeper);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchSweeperData();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      unsubSweep();
      unsubPnl();
    };
  }, [activeAddress, fetchSweeperData, onRefreshPortfolio]);

  const handleManualSweep = async () => {
    if (!activeAddress) return;
    setIsSweeping(true);
    try {
      const res = await apiClient.triggerSweep(activeAddress, false);
      if (res.success) {
        setCelebrationState({ isOpen: true, amount: res.totalClaimedAmount, txHash: res.txHash });
        const claimedNum = parseFloat(res.totalClaimedAmount.replace(/[^0-9.]/g, '')) || 0;
        setTotalClaimedAllTime((prev) => Number((prev + claimedNum).toFixed(2)));
        setUnclaimedAmount(0);
        await fetchSweeperData();
        if (onRefreshPortfolio) onRefreshPortfolio();
      }
    } catch (err: any) {
      console.warn('[SweeperControls] Sweep trigger error:', err);
    } finally {
      setIsSweeping(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5 pb-8">
      {/* ---------- Watch-Only Identity Banner ---------- */}
      {!userAddress && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border bg-secondary/20 backdrop-blur-sm" style={{ borderColor: 'hsl(var(--border)/0.6)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-secondary/30 border border-border/50 grid place-items-center text-muted-foreground flex-shrink-0">
              <EyeIcon className="w-4 h-4" />
            </div>
            <div className="text-xs text-muted-foreground min-w-0">
              Viewing <strong className="text-foreground">Protocol Autonomous Sweeper</strong> in public telemetry mode. Connect your wallet to inspect your personal settlement redemptions.
            </div>
          </div>
          {onConnectWallet && (
            <button type="button" onClick={onConnectWallet} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors flex-shrink-0">
              <WalletIcon className="w-3.5 h-3.5" />
              <span>Connect Wallet</span>
            </button>
          )}
        </div>
      )}

      {/* ---------- 1. Sweeper Controls Header + Stats ---------- */}
      <div className="terminal-panel p-0 overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border/40 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg grid place-items-center border bg-secondary/30 border-border/50 text-muted-foreground flex-shrink-0">
              <SparklesIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold tracking-tight text-foreground leading-none">
                  {isViewingSelf ? 'My Settlement Sweeper & Direct Wallet Payouts' : 'Autonomous Protocol Sweeper'}
                </h2>
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 bg-secondary/30 border-border/40 text-muted-foreground hidden sm:inline-flex">
                  100% DIRECT PAYOUT
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 hidden sm:block">
                {isViewingSelf ? 'Automatically claims binary contract payouts & transfers 100% of winnings directly to your wallet.' : 'Automated on-chain engine sweeping resolved Somnia event contracts & executing direct payout settlements.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            <div className="hidden md:flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
              {isViewingSelf ? <UserIcon className="w-3.5 h-3.5 text-muted-foreground" /> : <CpuChipIcon className="w-3.5 h-3.5 text-muted-foreground" />}
              <span>{isViewingSelf ? 'Personal Account:' : 'Protocol Account:'}</span>
              <code className="text-[11px] text-foreground">({activeAddress ? `${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}` : '0x...'})</code>
            </div>
            <Badge variant="outline" className="gap-1 font-mono text-[10px] bg-secondary/30 border-border/50 text-muted-foreground hidden lg:inline-flex">
              <ShieldCheckIcon className="w-3 h-3" />
              <span>100% Direct Wallet Payout</span>
            </Badge>
            {userAddress ? (
              <button type="button" onClick={handleManualSweep} disabled={isSweeping || unclaimedAmount <= 0} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-primary text-primary-foreground border-border hover:bg-primary/90">
                {isSweeping ? <Spinner size="xs" variant="cyan" /> : <ArrowPathIcon className="w-3.5 h-3.5" />}
                <span>{isSweeping ? 'Sweeping…' : unclaimedAmount > 0 ? `Sweep ${unclaimedAmount.toFixed(2)} tUSDC` : 'Sweep Now'}</span>
              </button>
            ) : (
              <button type="button" onClick={onConnectWallet} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-secondary/30 border-border/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
                <WalletIcon className="w-3.5 h-3.5" />
                <span>Connect to Sweep</span>
              </button>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        {isLoading && history.length === 0 ? (
          <div className="p-3.5 grid grid-cols-1 md:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={`sw-skel-${i}`} className="terminal-panel p-3.5 flex flex-col gap-2 bg-secondary/10">
                <div className="flex justify-between items-center">
                  <span className="w-[110px] h-3 bg-secondary/40 rounded skeleton-shimmer" />
                  <span className="w-14 h-4 bg-secondary/40 rounded skeleton-shimmer" />
                </div>
                <span className="w-28 h-6 bg-secondary/40 rounded skeleton-shimmer mt-1" />
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3.5 grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Pending */}
            <div className="terminal-panel p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">{isViewingSelf ? 'Pending Personal Unclaimed' : 'Pending Protocol Unclaimed'}</span>
                {unclaimedAmount > 0 ? (
                  <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 bg-[#ffb700]/10 text-[#ffb700] border-[#ffb700]/20">{claimableMarketsCount} MARKETS READY</Badge>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                )}
              </div>
              <div className="text-xl font-mono font-bold mt-2" style={{ color: unclaimedAmount > 0 ? '#ffb700' : 'var(--foreground)' }}>
                {unclaimedAmount.toFixed(2)} <span className="text-xs font-semibold">tUSDC</span>
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-1">{unclaimedAmount > 0 ? `${claimableMarketsCount} claimable markets` : 'No pending claims — sweeper idle'}</div>
            </div>
            {/* Total Paid Out */}
            <div className="terminal-panel p-3.5 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-[#00e676]/60" />
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">Total Paid Out to Wallet</span>
                <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 bg-secondary/30 border-border/40 text-muted-foreground">WALLET</Badge>
              </div>
              <div className="text-xl font-mono font-bold mt-2" style={{ color: totalClaimedAllTime > 0 ? '#00e676' : 'var(--muted-foreground)' }}>
                +{totalClaimedAllTime.toFixed(2)} <span className="text-xs font-semibold">tUSDC</span>
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-1">{history.length} settlements • verified on-chain</div>
            </div>
            {/* Sweeps */}
            <div className="terminal-panel p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">Settlement Claims</span>
                <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 bg-secondary/30 border-border/40 text-muted-foreground">{history.length} COMPLETED</Badge>
              </div>
              <div className="text-xl font-mono font-bold mt-2 text-foreground">
                {history.length} <span className="text-sm font-semibold">Sweeps</span>
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-1">Automated batch claims • 100% direct payout</div>
            </div>
          </div>
        )}
      </div>

      {/* ---------- 2. Redemption History Table ---------- */}
      <div className="terminal-panel p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg grid place-items-center border bg-secondary/30 border-border/50 text-muted-foreground flex-shrink-0">
              <Square3Stack3DIcon className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-xs font-bold tracking-tight text-foreground whitespace-nowrap">
              {isViewingSelf ? 'My Settlement Redemption History' : 'Protocol Settlement Redemption History'}
            </h3>
            <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 bg-secondary/30 border-border/40 text-muted-foreground">
              ({filteredHistory.length}{isFiltered ? ` of ${history.length}` : ''} confirmed)
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative flex items-center">
              <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 text-muted-foreground pointer-events-none" />
              <input type="text" placeholder="Search market / tx..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-7 pl-7 pr-7 text-xs font-mono rounded-lg border border-border/50 bg-secondary/30 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border focus:bg-secondary/40 w-[190px] transition-colors" />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2 text-muted-foreground hover:text-foreground">
                  <XMarkIcon className="w-3 h-3" />
                </button>
              )}
            </div>
            {/* Outcome filter */}
            <div className="flex items-center gap-1 bg-secondary/30 p-0.5 rounded-lg border border-border/40">
              {(['ALL', 'YES', 'NO'] as const).map((outcome) => (
                <button
                  key={outcome}
                  type="button"
                  onClick={() => setSelectedOutcome(outcome)}
                  className={cn('px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors', selectedOutcome === outcome ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50')}
                >
                  {outcome}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px] border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-[#111114] border-b border-border/60">
              <tr className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                <th className="px-3 py-2.5 text-left font-semibold">Timestamp</th>
                <th className="px-3 py-2.5 text-left font-semibold">Market Contract</th>
                <th className="px-3 py-2.5 text-left font-semibold">Winning Leg</th>
                <th className="px-3 py-2.5 text-right font-semibold">Claimed Payout</th>
                <th className="px-3 py-2.5 text-center font-semibold">Payout Type</th>
                <th className="px-3 py-2.5 text-right font-semibold">Somnia Shannon Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {isLoading && history.length === 0 ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={`sweep-skel-${i}`} className="hover:bg-secondary/10">
                    <td className="px-3 py-3"><span className="w-[110px] h-3 bg-secondary/40 rounded skeleton-shimmer inline-block" /></td>
                    <td className="px-3 py-3"><span className="w-20 h-3 bg-secondary/40 rounded skeleton-shimmer inline-block" /></td>
                    <td className="px-3 py-3"><span className="w-12 h-5 bg-secondary/40 rounded skeleton-shimmer inline-block" /></td>
                    <td className="px-3 py-3 text-right"><span className="w-16 h-3 bg-secondary/40 rounded skeleton-shimmer inline-block ml-auto" /></td>
                    <td className="px-3 py-3 text-center"><span className="w-20 h-5 bg-secondary/40 rounded skeleton-shimmer inline-block" /></td>
                    <td className="px-3 py-3 text-right"><span className="w-20 h-3 bg-secondary/40 rounded skeleton-shimmer inline-block ml-auto" /></td>
                  </tr>
                ))
              ) : filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-muted-foreground text-xs">
                    {isFiltered ? (
                      <div className="flex flex-col items-center gap-2">
                        <span>No settlement claims match the current filter criteria.</span>
                        <button type="button" onClick={() => { setSelectedOutcome('ALL'); setSearchQuery(''); }} className="px-2.5 py-1 rounded-md border bg-secondary/30 border-border/50 text-[11px] font-medium hover:bg-secondary/50">Reset Filters</button>
                      </div>
                    ) : isViewingSelf ? (
                      'No personal settlement claims recorded yet for this wallet.'
                    ) : (
                      'No protocol settlement claims recorded yet.'
                    )}
                  </td>
                </tr>
              ) : (
                paginatedHistory.map((sweep) => {
                  const timeStr = new Date(sweep.claimedAt).toLocaleString();
                  const formatMarketLabel = (mId: string) => {
                    if (!mId) return '-';
                    if (mId.startsWith('0x') && mId.length === 66) {
                      const num = parseInt(mId, 16);
                      if (!isNaN(num) && num > 0) {
                        return `Market #${num} (${mId.slice(-4)})`;
                      }
                      return `${mId.slice(0, 6)}...${mId.slice(-4)}`;
                    }
                    return mId.length > 14 ? `${mId.slice(0, 8)}...${mId.slice(-4)}` : mId;
                  };

                  return (
                    <tr key={sweep.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{timeStr}</td>
                      <td className="px-3 py-2.5 font-semibold text-foreground font-mono text-xs" title={sweep.marketId}>{formatMarketLabel(sweep.marketId)}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono border" style={{ background: sweep.winningOutcome === 'YES' ? 'rgba(0,230,118,0.08)' : 'rgba(255,51,102,0.08)', borderColor: sweep.winningOutcome === 'YES' ? 'rgba(0,230,118,0.18)' : 'rgba(255,51,102,0.18)', color: sweep.winningOutcome === 'YES' ? '#00e676' : '#ff3366' }}>
                          {sweep.winningOutcome === 'YES' ? <ArrowUpRightIcon className="w-3 h-3" /> : <ArrowDownRightIcon className="w-3 h-3" />}
                          {sweep.winningOutcome}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-xs" style={{ color: '#00e676' }}>
                        +{sweep.claimableAmount.toFixed(2)} tUSDC
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border bg-secondary/30 border-border/50 text-muted-foreground">
                          <WalletIcon className="w-3 h-3" />
                          <span>Direct Payout</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {sweep.txHash && sweep.txHash.startsWith('0x') && sweep.txHash.length === 66 ? (
                          <a href={`https://shannon-explorer.somnia.network/tx/${sweep.txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-mono text-[#00ffcc] hover:underline">
                            <span>{`${sweep.txHash.slice(0, 6)}...${sweep.txHash.slice(-4)}`}</span>
                            <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                          </a>
                        ) : sweep.marketId.startsWith('0x') && sweep.marketId.length === 66 ? (
                          <a href={`https://shannon-explorer.somnia.network/address/0x2802504314685D89bF6C992CA5a8e7cC78bc0294`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400/90 hover:underline">
                            <span>On-Chain Verified</span>
                            <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-[11px] font-mono text-muted-foreground">Direct Transfer</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination currentPage={currentPage} totalItems={filteredHistory.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} pageSizeOptions={[10, 25, 50, 100]} itemLabel="sweeps" isLoading={isLoading} />
      </div>

      <ClaimCelebration isOpen={celebrationState.isOpen} onClose={() => setCelebrationState((prev) => ({ ...prev, isOpen: false }))} claimedAmount={celebrationState.amount} txHash={celebrationState.txHash} />
    </div>
  );
};
