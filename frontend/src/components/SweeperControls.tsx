import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  RefreshCw,
  ExternalLink,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Wallet,
  Eye,
  Bot,
  User,
  Lock,
} from 'lucide-react';
import { apiClient } from '../services/api.js';
import { SOMNIA_ADDRESSES } from '../services/web3.js';
import type { SettlementSweep } from '../types/index.js';
import { telemetryClient, type SweepCompleteData, type PnlUpdateData } from '../services/telemetry-client.js';
import { ClaimCelebration } from './ClaimCelebration.js';
import { Spinner } from './ui/Spinner.js';

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
  compoundedStats: {
    totalCompoundedAmount: number;
    reinvestedCycles: number;
    lastCompoundedAt?: string;
  };
}

export const SweeperControls: React.FC<SweeperControlsProps> = ({
  userAddress,
  onRefreshPortfolio,
  onConnectWallet,
}) => {
  // Derive strictly from prop — no internal mutable scope that can race.
  // When user is connected we show personal settlements; otherwise protocol (swarm).
  const activeAddress = (userAddress ?? SOMNIA_ADDRESSES.operatorAccount).toLowerCase();
  const isViewingSelf = !!userAddress;

  // Hydrate initial state from localStorage cache for instant 0ms mount
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

  const [autoCompound, setAutoCompound] = useState<boolean>(true);
  const [isSweeping, setIsSweeping] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(!initialCache);
  const [history, setHistory] = useState<SettlementSweep[]>(initialHistory);
  const [unclaimedAmount, setUnclaimedAmount] = useState<number>(initialCache?.unclaimedAmount || 0);
  const [totalClaimedAllTime, setTotalClaimedAllTime] = useState<number>(initialCache?.totalClaimedAllTime || 0);
  const [claimableMarketsCount, setClaimableMarketsCount] = useState<number>(initialCache?.claimableMarketsCount || 0);

  const [compoundedStats, setCompoundedStats] = useState<{
    totalCompoundedAmount: number;
    reinvestedCycles: number;
    lastCompoundedAt?: string;
  }>({
    totalCompoundedAmount: initialCache?.compoundedStats?.totalCompoundedAmount || 0,
    reinvestedCycles: initialCache?.compoundedStats?.reinvestedCycles || 0,
    lastCompoundedAt: initialCache?.compoundedStats?.lastCompoundedAt,
  });

  // Celebration modal state
  const [celebrationState, setCelebrationState] = useState<{
    isOpen: boolean;
    amount: string;
    txHash?: string;
  }>({
    isOpen: false,
    amount: '',
  });

  // Monotonically increasing request id — stale fetches that resolve out-of-order are ignored.
  const requestIdRef = useRef(0);

  const fetchSweeperData = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    const addr = activeAddress;
    try {
      const [summaryRes, historyRes] = await Promise.all([
        apiClient.getSweeperSummary(addr).catch(() => null),
        apiClient.getSweepHistory(addr).catch(() => null),
      ]);

      // If a newer request started while we were in-flight, this response is stale — drop it.
      if (reqId !== requestIdRef.current) return;

      if (summaryRes?.success && summaryRes.data) {
        const uAmount = summaryRes.data.unclaimedAmount || 0;
        const tClaimed = summaryRes.data.totalClaimedAllTime || 0;
        const cCount = summaryRes.data.claimableMarketsCount || 0;
        const cStats = {
          totalCompoundedAmount: summaryRes.data.compoundedStats?.totalCompoundedAmount || 0,
          reinvestedCycles: summaryRes.data.compoundedStats?.reinvestedCycles || 0,
          lastCompoundedAt: summaryRes.data.compoundedStats?.lastCompoundedAt,
        };

        setUnclaimedAmount(uAmount);
        setTotalClaimedAllTime(tClaimed);
        setClaimableMarketsCount(cCount);
        setCompoundedStats(cStats);

        try {
          localStorage.setItem(
            `${SWEEPER_SUMMARY_CACHE_KEY}${addr}`,
            JSON.stringify({
              unclaimedAmount: uAmount,
              totalClaimedAllTime: tClaimed,
              claimableMarketsCount: cCount,
              compoundedStats: cStats,
            }),
          );
        } catch {}
      }

      if (historyRes?.success && Array.isArray(historyRes.data)) {
        setHistory(historyRes.data);
        try {
          localStorage.setItem(
            `${SWEEPER_HISTORY_CACHE_KEY}${addr}`,
            JSON.stringify(historyRes.data),
          );
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
    // Invalidate any in-flight fetch for the previous address before starting new one.
    requestIdRef.current++;
    
    // Hydrate from localStorage for the active address immediately
    try {
      const rawSummary = localStorage.getItem(`${SWEEPER_SUMMARY_CACHE_KEY}${activeAddress}`);
      const rawHistory = localStorage.getItem(`${SWEEPER_HISTORY_CACHE_KEY}${activeAddress}`);
      if (rawSummary) {
        const parsed = JSON.parse(rawSummary) as CachedSweeperData;
        setUnclaimedAmount(parsed.unclaimedAmount || 0);
        setTotalClaimedAllTime(parsed.totalClaimedAllTime || 0);
        setClaimableMarketsCount(parsed.claimableMarketsCount || 0);
        setCompoundedStats({
          totalCompoundedAmount: parsed.compoundedStats?.totalCompoundedAmount || 0,
          reinvestedCycles: parsed.compoundedStats?.reinvestedCycles || 0,
          lastCompoundedAt: parsed.compoundedStats?.lastCompoundedAt,
        });
        setIsLoading(false);
      } else {
        setHistory([]);
        setUnclaimedAmount(0);
        setTotalClaimedAllTime(0);
        setClaimableMarketsCount(0);
        setCompoundedStats({ totalCompoundedAmount: 0, reinvestedCycles: 0 });
        setIsLoading(true);
      }
      if (rawHistory) {
        setHistory(JSON.parse(rawHistory));
      }
    } catch {}

    fetchSweeperData();

    // 1. WebSocket event triggers for instant unclaimed & sweep history updates
    let debounceTimer: number | null = null;
    const scheduleRefresh = (delay = 200) => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        fetchSweeperData();
        if (onRefreshPortfolio) onRefreshPortfolio();
      }, delay);
    };

    const unsubSweep = telemetryClient.on('sweep_completed', (sweep: SweepCompleteData) => {
      if (!sweep.userAddress || sweep.userAddress.toLowerCase() === activeAddress.toLowerCase()) {
        scheduleRefresh(150);
      }
    });

    const unsubPnl = telemetryClient.on('pnl_update', (_pnl: PnlUpdateData) => {
      scheduleRefresh(300);
    });

    // 2. Periodic 25-second background fallback
    const interval = setInterval(() => {
      fetchSweeperData();
    }, 25000);

    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      clearInterval(interval);
      unsubSweep();
      unsubPnl();
    };
  }, [activeAddress, fetchSweeperData, onRefreshPortfolio]);

  const handleManualSweep = async () => {
    if (!activeAddress) return;
    setIsSweeping(true);
    try {
      const res = await apiClient.triggerSweep(activeAddress, autoCompound);
      if (res.success) {
        setCelebrationState({
          isOpen: true,
          amount: res.totalClaimedAmount,
          txHash: res.txHash,
        });

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
    <div className="sweeper-controls-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Watch-Only / Identity Banner */}
      {!userAddress && (
        <div
          style={{
            background: 'rgba(0, 240, 255, 0.04)',
            border: '1px solid rgba(0, 240, 255, 0.2)',
            borderRadius: '8px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Eye size={16} style={{ color: 'var(--brand-cyan)' }} />
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
              Viewing <strong>Protocol Autonomous Sweeper</strong> in public telemetry mode. Connect your wallet to inspect your personal settlement redemptions.
            </div>
          </div>
          {onConnectWallet && (
            <button
              type="button"
              className="btn-glow"
              onClick={onConnectWallet}
              style={{ fontSize: '11.5px', padding: '6px 12px' }}
            >
              <Wallet size={12} />
              <span>Connect Wallet</span>
            </button>
          )}
        </div>
      )}

      {/* 1. Sweeper Controls Banner */}
      <div className="terminal-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(0, 255, 102, 0.12)',
                border: '1px solid rgba(0, 255, 102, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--trade-buy)',
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
                  {isViewingSelf ? 'My Settlement Sweeper & Auto-Compounder' : 'Autonomous Protocol Sweeper'}
                </h2>
                <span className="stat-pill-tag tag-green">
                  {autoCompound ? '100% COMPOUNDING' : 'READY'}
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--muted-foreground)' }}>
                {isViewingSelf
                  ? 'Automatically claims binary contract payouts & reinvests winnings into high-conviction order flow.'
                  : 'Automated on-chain engine sweeping resolved Somnia event contracts & compound-allocating payouts into CLOB liquidity.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Scope Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
              {isViewingSelf ? <User size={13} style={{ color: 'var(--brand-cyan)' }} /> : <Bot size={13} style={{ color: 'var(--trade-buy)' }} />}
              <span>{isViewingSelf ? 'Personal Account:' : 'Protocol Account:'}</span>
              <code style={{ color: isViewingSelf ? 'var(--brand-cyan)' : 'var(--trade-buy)', fontFamily: 'var(--font-mono)' }}>
                ({activeAddress ? `${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}` : '0x...'})
              </code>
            </div>

            {/* Auto-Compound State Toggle Button */}
            {userAddress ? (
              <button
                type="button"
                onClick={() => setAutoCompound((prev) => !prev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: autoCompound ? 'rgba(0, 255, 102, 0.08)' : 'rgba(255, 77, 77, 0.08)',
                  border: `1px solid ${autoCompound ? 'rgba(0, 255, 102, 0.25)' : 'rgba(255, 77, 77, 0.25)'}`,
                  fontSize: '11px',
                  color: autoCompound ? 'var(--trade-buy)' : 'var(--trade-sell)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <ShieldCheck size={13} />
                <span>{autoCompound ? '100% Auto-Compound ON' : 'Compounding OFF'}</span>
              </button>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: 'rgba(0, 255, 102, 0.06)',
                  border: '1px solid rgba(0, 255, 102, 0.2)',
                  fontSize: '11px',
                  color: 'var(--trade-buy)',
                  fontWeight: 600,
                }}
              >
                <Lock size={12} style={{ opacity: 0.7 }} />
                <span>100% Auto-Compound ON (Protocol)</span>
              </div>
            )}

            {/* Sweep Action Button */}
            {userAddress ? (
              <button
                type="button"
                onClick={handleManualSweep}
                disabled={isSweeping || unclaimedAmount <= 0}
                className="btn-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  opacity: unclaimedAmount <= 0 ? 0.6 : 1,
                }}
              >
                {isSweeping ? <Spinner size="xs" variant="amber" /> : <RefreshCw size={13} />}
                <span>{isSweeping ? 'Sweeping Payouts...' : unclaimedAmount > 0 ? `Sweep ${unclaimedAmount.toFixed(2)} tUSDC` : 'Sweep Now'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onConnectWallet}
                className="btn-header-wallet"
                style={{ fontSize: '11px', padding: '6px 12px' }}
              >
                <Wallet size={12} />
                <span>Connect to Sweep</span>
              </button>
            )}
          </div>
        </div>

        {/* 3 Compounding Stats Cards */}
        {isLoading && history.length === 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '16px' }}>
            {[1, 2, 3].map((i) => (
              <div key={`sw-skel-${i}`} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ width: '100px', height: '11px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px' }} className="dreampulse-skeleton skeleton-shimmer" />
                  <span style={{ width: '50px', height: '14px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px' }} className="dreampulse-skeleton skeleton-shimmer" />
                </div>
                <span style={{ width: '120px', height: '22px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px' }} className="dreampulse-skeleton skeleton-shimmer" />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '16px' }}>
            {/* Card 1: Pending Unclaimed */}
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                  {isViewingSelf ? 'Pending Personal Unclaimed' : 'Pending Protocol Unclaimed'}
                </span>
                {unclaimedAmount > 0 && (
                  <span style={{ fontSize: '9px', background: 'rgba(0, 240, 255, 0.15)', color: 'var(--brand-cyan)', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                    {claimableMarketsCount} MARKETS READY
                  </span>
                )}
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: unclaimedAmount > 0 ? 'var(--brand-cyan)' : 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>
                {unclaimedAmount.toFixed(2)} tUSDC
              </div>
            </div>

            {/* Card 2: Total Claimed All-Time (100%) */}
            <div style={{ background: 'rgba(0, 255, 102, 0.04)', padding: '14px 18px', borderRadius: '8px', border: '1px solid rgba(0, 255, 102, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--trade-buy)' }}>Total Compounded (100%)</span>
                <span style={{ fontSize: '9px', background: 'rgba(0, 255, 102, 0.15)', color: 'var(--trade-buy)', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                  TRADING
                </span>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--trade-buy)', fontFamily: 'var(--font-mono)' }}>
                +{totalClaimedAllTime.toFixed(2)} tUSDC
              </div>
            </div>

            {/* Card 3: Reinvested Trading Capital */}
            <div style={{ background: 'rgba(0, 240, 255, 0.04)', padding: '14px 18px', borderRadius: '8px', border: '1px solid rgba(0, 240, 255, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--brand-cyan)' }}>Reinvested Capital</span>
                <span style={{ fontSize: '9px', background: 'rgba(0, 240, 255, 0.15)', color: 'var(--brand-cyan)', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                  {compoundedStats.reinvestedCycles} CYCLES
                </span>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)' }}>
                +{(compoundedStats.totalCompoundedAmount || totalClaimedAllTime).toFixed(2)} tUSDC
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Redemption History Table */}
      <div className="terminal-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <div
          className="terminal-panel-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={16} style={{ color: 'var(--trade-buy)' }} />
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
              {isViewingSelf ? 'My Settlement Redemption History' : 'Protocol Settlement Redemption History'}
            </h3>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
            {history.length} confirmed redemptions
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="terminal-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  Timestamp
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  Market Contract
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  Winning Leg
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  Claimed Payout
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  Compounded
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  Somnia Shannon Tx
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && history.length === 0 ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={`sweep-skel-${i}`} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '12px 16px' }}><span style={{ width: '110px', height: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', display: 'inline-block' }} className="dreampulse-skeleton skeleton-shimmer" /></td>
                    <td style={{ padding: '12px 16px' }}><span style={{ width: '80px', height: '13px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', display: 'inline-block' }} className="dreampulse-skeleton skeleton-shimmer" /></td>
                    <td style={{ padding: '12px 16px' }}><span style={{ width: '55px', height: '18px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', display: 'inline-block' }} className="dreampulse-skeleton skeleton-shimmer" /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}><span style={{ width: '75px', height: '13px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', display: 'inline-block', marginLeft: 'auto' }} className="dreampulse-skeleton skeleton-shimmer" /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><span style={{ width: '70px', height: '16px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', display: 'inline-block', margin: '0 auto' }} className="dreampulse-skeleton skeleton-shimmer" /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}><span style={{ width: '60px', height: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', display: 'inline-block', marginLeft: 'auto' }} className="dreampulse-skeleton skeleton-shimmer" /></td>
                  </tr>
                ))
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted-foreground)', fontSize: '12px' }}>
                    {isViewingSelf
                      ? 'No personal settlement claims recorded yet for this wallet.'
                      : 'No protocol settlement claims recorded yet.'}
                  </td>
                </tr>
              ) : (
                history.map((sweep) => {
                  const timeStr = new Date(sweep.claimedAt).toLocaleString();
                  const shortTx = sweep.txHash ? `${sweep.txHash.slice(0, 6)}...${sweep.txHash.slice(-4)}` : 'N/A';
                  const explorerUrl = sweep.txHash ? `https://shannon-explorer.somnia.network/tx/${sweep.txHash}` : '#';

                  return (
                    <tr key={sweep.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                        {timeStr}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>
                        {sweep.marketId.slice(0, 10)}...
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: sweep.winningOutcome === 'YES' ? 'rgba(0, 255, 102, 0.12)' : 'rgba(255, 51, 102, 0.12)',
                            border: `1px solid ${sweep.winningOutcome === 'YES' ? 'rgba(0, 255, 102, 0.3)' : 'rgba(255, 51, 102, 0.3)'}`,
                            color: sweep.winningOutcome === 'YES' ? 'var(--trade-buy)' : 'var(--trade-sell)',
                            fontSize: '11px',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {sweep.winningOutcome === 'YES' ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                          <span>{sweep.winningOutcome}</span>
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: 'var(--trade-buy)', fontFamily: 'var(--font-mono)' }}>
                        +{sweep.claimableAmount.toFixed(2)} tUSDC
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: sweep.isCompounded ? 'rgba(0, 240, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                            color: sweep.isCompounded ? 'var(--brand-cyan)' : 'var(--muted-foreground)',
                            fontSize: '10px',
                            fontWeight: 600,
                          }}
                        >
                          {sweep.isCompounded ? <ShieldCheck size={11} /> : null}
                          <span>{sweep.isCompounded ? 'YES' : 'NO'}</span>
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {sweep.txHash && sweep.txHash.startsWith('0x') && sweep.txHash.length === 66 ? (
                          <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              color: 'var(--brand-cyan)',
                              fontSize: '11px',
                              fontFamily: 'var(--font-mono)',
                              textDecoration: 'none',
                            }}
                          >
                            <span>{shortTx}</span>
                            <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                            {sweep.isCompounded ? 'Compounded' : 'Settled'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confetti Celebration Modal */}
      <ClaimCelebration
        isOpen={celebrationState.isOpen}
        onClose={() => setCelebrationState((prev) => ({ ...prev, isOpen: false }))}
        claimedAmount={celebrationState.amount}
        txHash={celebrationState.txHash}
        isCompounded={autoCompound}
      />
    </div>
  );
};
