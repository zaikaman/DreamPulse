import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowTopRightOnSquareIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  BoltIcon,
  ArrowTrendingUpIcon,
  Square3Stack3DIcon,
  ArrowUpRightIcon,
  ArrowDownRightIcon,
  QueueListIcon,
  UserIcon,
  CpuChipIcon,
  WalletIcon,
  ArrowPathIcon,
  DocumentCheckIcon,
} from '@heroicons/react/24/outline';
import type { OrderExecution, AgentType, OutcomeType } from '../types/index.js';
import { apiClient } from '../services/api.js';
import { telemetryClient } from '../services/telemetry-client.js';
import { OrderHistoryTableSkeleton } from './ui/Skeleton.js';
import { Spinner } from './ui/Spinner.js';
import { Pagination } from './ui/Pagination.js';

interface OrderHistoryTableProps {
  orders?: OrderExecution[];
  isLoading?: boolean;
  userAddress?: string;
  onConnectWallet?: () => Promise<void>;
}

interface ParsedMarketInfo {
  symbol: string;
  assetName: string;
  windowDuration: string;
  strikePrice?: number;
  settlementPrice?: number;
  winningOutcome?: OutcomeType;
}

function parseOrderMarketDetails(order: OrderExecution): ParsedMarketInfo {
  let symbol = order.marketSnapshot?.symbol || '';
  let strikePrice = order.marketSnapshot?.strikePrice;
  let settlementPrice = order.marketSnapshot?.settlementPrice;
  let winningOutcome = order.marketSnapshot?.winningOutcome;
  let windowDuration = order.marketSnapshot?.windowDuration || '5m';

  if (!symbol && order.marketId) {
    if (order.marketId.includes('-')) {
      const parts = order.marketId.split('-');
      if (parts.length >= 2) {
        const rawSym = parts[1].toUpperCase();
        symbol = rawSym.includes('BTC') ? 'BTC/USD' : rawSym.includes('ETH') ? 'ETH/USD' : rawSym.includes('SOL') ? 'SOL/USD' : rawSym.includes('STT') ? 'STT/USD' : `${rawSym}/USD`;
        for (let i = 2; i < parts.length; i++) {
          const num = Number(parts[i]);
          if (!isNaN(num) && num >= 1 && !strikePrice) {
            strikePrice = num;
          }
          if (parts[i].endsWith('m') || parts[i].endsWith('h')) {
            windowDuration = parts[i];
          }
        }
      }
    }
  }

  if (!symbol) symbol = 'BTC/USD';

  const assetName = symbol.includes('BTC') ? 'Bitcoin' : symbol.includes('ETH') ? 'Ethereum' : symbol.includes('SOL') ? 'Solana' : symbol.includes('STT') ? 'Somnia' : symbol.split('/')[0];

  return {
    symbol,
    assetName,
    windowDuration,
    strikePrice,
    settlementPrice,
    winningOutcome,
  };
}

function formatCurrencyAmount(price?: number): string {
  if (price === undefined || isNaN(price)) return '—';
  if (price >= 1000) {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

export const OrderHistoryTable: React.FC<OrderHistoryTableProps> = ({
  userAddress,
  onConnectWallet,
}) => {
  const [scope, setScope] = useState<'ALL_SWARM' | 'MY_ORDERS'>('ALL_SWARM');
  const [selectedAgent, setSelectedAgent] = useState<string>('ALL');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('ALL');
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [orders, setOrders] = useState<OrderExecution[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [totalFills, setTotalFills] = useState<number>(0);
  const [totalVolume, setTotalVolume] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [scopeTotals, setScopeTotals] = useState<{ totalFills: number; totalVolume: number }>({ totalFills: 0, totalVolume: 0 });

  const isFiltered = selectedAgent !== 'ALL' || selectedOutcome !== 'ALL' || debouncedSearch.trim().length > 0;

  // Debounce search and reset to page 1 when search actually changes
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (debouncedSearch !== searchInput) {
        setDebouncedSearch(searchInput);
        setCurrentPage(1);
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [searchInput, debouncedSearch]);

  const fetchIdRef = useRef(0);
  const pendingRef = useRef(0);

  // Single fetch effect — only current page is loaded, stale data stays visible
  useEffect(() => {
    if (scope === 'MY_ORDERS' && !userAddress) {
      setOrders([]);
      setTotal(0);
      setTotalFills(0);
      setTotalVolume(0);
      setTotalPages(1);
      setIsInitialLoading(false);
      setIsFetching(false);
      setFetchError(null);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    pendingRef.current++;
    const hasData = orders.length > 0;
    if (hasData) setIsFetching(true);
    else setIsInitialLoading(true);
    setFetchError(null);

    const ac = new AbortController();
    // Hard timeout so UI never stays stuck on "Loading..." forever if backend hangs
    const timeoutId = window.setTimeout(() => {
      if (fetchIdRef.current === fetchId) {
        ac.abort();
        setFetchError('Request timed out — backend may be starting up. Retrying...');
      }
    }, 10000);

    (async () => {
      try {
        const res = await apiClient.getOrders({
          userAddress: scope === 'MY_ORDERS' ? userAddress : undefined,
          swarmOnly: scope === 'ALL_SWARM',
          agentType: selectedAgent,
          outcome: selectedOutcome,
          search: debouncedSearch || undefined,
          page: currentPage,
          pageSize,
        });
        if (ac.signal.aborted || fetchIdRef.current !== fetchId) return;
        window.clearTimeout(timeoutId);
        setOrders(res.data ?? []);
        setTotal((res.total ?? res.count) ?? 0);
        setTotalFills(res.totalFills ?? 0);
        setTotalVolume(res.totalVolume ?? 0);
        setTotalPages(Math.max(1, (res.totalPages ?? Math.ceil(((res.total ?? res.count) ?? 0) / pageSize)) || 1));
        const filteredNow = selectedAgent !== 'ALL' || selectedOutcome !== 'ALL' || debouncedSearch.trim().length > 0;
        if (!filteredNow) {
          setScopeTotals({ totalFills: res.totalFills ?? 0, totalVolume: res.totalVolume ?? 0 });
        }
      } catch (err: any) {
        if (fetchIdRef.current !== fetchId) return;
        if (ac.signal.aborted) return;
        window.clearTimeout(timeoutId);
        // Don't wipe existing rows on transient error — keep stale data visible
        setFetchError(err.message || 'Failed to load orders');
      } finally {
        window.clearTimeout(timeoutId);
        pendingRef.current = Math.max(0, pendingRef.current - 1);
        if (pendingRef.current === 0) {
          setIsInitialLoading(false);
          setIsFetching(false);
        }
      }
    })();

    return () => {
      window.clearTimeout(timeoutId);
      ac.abort();
      // Don't decrement here — finally will handle it. Just ensure abort triggers cleanup.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, userAddress, selectedAgent, selectedOutcome, debouncedSearch, pageSize, currentPage]);

  // Lightweight scope totals when filtered
  useEffect(() => {
    if (!isFiltered) return;
    if (scope === 'MY_ORDERS' && !userAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.getOrders({
          userAddress: scope === 'MY_ORDERS' ? userAddress : undefined,
          swarmOnly: scope === 'ALL_SWARM',
          page: 1,
          pageSize: 1,
        });
        if (!cancelled) setScopeTotals({ totalFills: res.totalFills ?? 0, totalVolume: res.totalVolume ?? 0 });
      } catch {
        if (!cancelled) setScopeTotals({ totalFills: 0, totalVolume: 0 });
      }
    })();
    return () => { cancelled = true; };
  }, [isFiltered, scope, userAddress]);

  // Throttled realtime refresh — at most once per 900ms, never flashes (900ms vs 3000ms: ~3x faster PnL visible)
  const latestParamsRef = useRef({ scope, userAddress, selectedAgent, selectedOutcome, debouncedSearch, pageSize, currentPage });
  useEffect(() => {
    latestParamsRef.current = { scope, userAddress, selectedAgent, selectedOutcome, debouncedSearch, pageSize, currentPage };
  }, [scope, userAddress, selectedAgent, selectedOutcome, debouncedSearch, pageSize, currentPage]);

  useEffect(() => {
    let lastFetchAt = 0;
    let pendingFetchTimer: number | null = null;

    const scheduleFetch = () => {
      const now = Date.now();
      const elapsed = now - lastFetchAt;
      if (elapsed > 900) {
        lastFetchAt = now;
        const { scope: s, userAddress: ua, selectedAgent: ag, selectedOutcome: oc, debouncedSearch: ds, pageSize: ps, currentPage: cp } = latestParamsRef.current;
        if (s === 'MY_ORDERS' && !ua) return;
        // Silent background refresh — never shows "Updating page" overlay, never touches isFetching
        apiClient.getOrders({
          userAddress: s === 'MY_ORDERS' ? ua : undefined,
          swarmOnly: s === 'ALL_SWARM',
          agentType: ag,
          outcome: oc,
          search: ds || undefined,
          page: cp,
          pageSize: ps,
        }).then((res) => {
          // Only apply if user hasn't navigated away from this page/filter since WS fired
          if (latestParamsRef.current.currentPage !== cp || latestParamsRef.current.pageSize !== ps) return;
          if (latestParamsRef.current.scope !== s || latestParamsRef.current.selectedAgent !== ag || latestParamsRef.current.selectedOutcome !== oc || latestParamsRef.current.debouncedSearch !== ds) return;
          setOrders(res.data ?? []);
          setTotal((res.total ?? res.count) ?? 0);
          setTotalFills(res.totalFills ?? 0);
          setTotalVolume(res.totalVolume ?? 0);
          setTotalPages(Math.max(1, (res.totalPages ?? Math.ceil(((res.total ?? res.count) ?? 0) / ps)) || 1));
        }).catch(() => {});
      } else if (!pendingFetchTimer) {
        pendingFetchTimer = window.setTimeout(() => {
          pendingFetchTimer = null;
          scheduleFetch();
        }, 950 - elapsed);
      }
    };

    const unsubPnl = telemetryClient.on('pnl_update', scheduleFetch);
    const unsubSwarm = telemetryClient.on('swarm_pnl_tick', scheduleFetch);
    const unsubOrder = telemetryClient.on('order_filled', scheduleFetch);
    const unsubSweep = telemetryClient.on('sweep_completed', scheduleFetch);

    return () => {
      if (pendingFetchTimer) clearTimeout(pendingFetchTimer);
      unsubPnl();
      unsubSwarm();
      unsubOrder();
      unsubSweep();
    };
  }, []);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const clearFilters = () => {
    setSelectedAgent('ALL');
    setSelectedOutcome('ALL');
    setSearchInput('');
    setDebouncedSearch('');
    setCurrentPage(1);
  };

  const headerFills = isFiltered ? totalFills : scopeTotals.totalFills;
  const headerVolume = isFiltered ? totalVolume : scopeTotals.totalVolume;

  const handleScope = (next: 'ALL_SWARM' | 'MY_ORDERS') => {
    if (next !== scope) {
      setScope(next);
      setCurrentPage(1);
    }
  };
  const handleAgent = (next: string) => {
    if (next !== selectedAgent) {
      setSelectedAgent(next);
      setCurrentPage(1);
    }
  };
  const handleOutcome = (next: string) => {
    if (next !== selectedOutcome) {
      setSelectedOutcome(next);
      setCurrentPage(1);
    }
  };
  const handlePageSize = (next: number) => {
    if (next !== pageSize) {
      setPageSize(next);
      setCurrentPage(1);
    }
  };

  const getAgentBadge = (agentType: AgentType) => {
    switch (agentType) {
      case 'Volt':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255, 170, 0, 0.12)', border: '1px solid rgba(255, 170, 0, 0.3)', color: '#ffaa00', fontSize: '11px', fontWeight: 700 }}>
            <BoltIcon className="w-3 h-3" />
            <span>Volt</span>
          </span>
        );
      case 'Oracle':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0, 240, 255, 0.12)', border: '1px solid rgba(0, 240, 255, 0.3)', color: 'var(--brand-cyan)', fontSize: '11px', fontWeight: 700 }}>
            <ArrowTrendingUpIcon className="w-3 h-3" />
            <span>Oracle</span>
          </span>
        );
      case 'Titan':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', color: '#a855f7', fontSize: '11px', fontWeight: 700 }}>
            <Square3Stack3DIcon className="w-3 h-3" />
            <span>Titan</span>
          </span>
        );
      default:
        return <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{agentType}</span>;
    }
  };

  const getOutcomeBadge = (outcome: OutcomeType) => {
    if (outcome === 'YES') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0, 255, 102, 0.12)', border: '1px solid rgba(0, 255, 102, 0.3)', color: 'var(--trade-buy)', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
          <ArrowUpRightIcon className="w-3 h-3" />
          <span>YES</span>
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255, 51, 102, 0.12)', border: '1px solid rgba(255, 51, 102, 0.3)', color: 'var(--trade-sell)', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
        <ArrowDownRightIcon className="w-3 h-3" />
        <span>NO</span>
      </span>
    );
  };

  return (
    <div className="terminal-panel" style={{ padding: '0', overflow: 'hidden' }}>
      <div className="terminal-panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <QueueListIcon className="w-4 h-4" style={{ color: 'var(--brand-cyan)' }} />
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>On-Chain Order Executions</h3>
          </div>
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(0, 0, 0, 0.3)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <button id="btn-public-swarm-ledger" type="button" className={`shadcn-tab-btn ${scope === 'ALL_SWARM' ? 'active' : ''}`} onClick={() => handleScope('ALL_SWARM')} style={{ fontSize: '11px', padding: '3px 8px' }} title="Canonical autonomous swarm trades executed by Somnia Operator (0x93e3...59Cf)">
              <CpuChipIcon className="w-3 h-3" />
              <span>Public Swarm Ledger</span>
            </button>
            <button id="btn-my-orders-fills" type="button" className={`shadcn-tab-btn ${scope === 'MY_ORDERS' ? 'active' : ''}`} onClick={() => handleScope('MY_ORDERS')} style={{ fontSize: '11px', padding: '3px 8px' }} title="Personal autonomous copy-trade fills for your connected wallet">
              <UserIcon className="w-3 h-3" />
              <span>My Orders & Fills</span>
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', background: 'rgba(0, 240, 255, 0.06)', border: '1px solid rgba(0, 240, 255, 0.2)', fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
            <DocumentCheckIcon className="w-3 h-3" style={{ color: 'var(--brand-cyan)' }} />
            {isFetching && !isInitialLoading && <Spinner size="xs" variant="cyan" />}
            {isFiltered ? (
              <span>
                Filtered: <strong style={{ color: 'var(--brand-cyan)' }}>{totalVolume.toFixed(2)} tUSDC</strong> ({totalFills} fills)
                <span style={{ margin: '0 6px', opacity: 0.4 }}>|</span>
                Total: <span style={{ color: 'var(--foreground)' }}>{scopeTotals.totalVolume.toFixed(2)} tUSDC</span> ({scopeTotals.totalFills} fills)
              </span>
            ) : (
              <span>
                Total Executed: <strong style={{ color: 'var(--brand-cyan)' }}>{headerVolume.toFixed(2)} tUSDC</strong> ({headerFills} fills)
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '12px 20px', background: 'rgba(255, 255, 255, 0.01)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <FunnelIcon className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)', marginRight: '4px' }} />
          {(['ALL', 'VOLT', 'ORACLE', 'TITAN'] as const).map((agent) => (
            <button key={agent} id={`filter-agent-${agent.toLowerCase()}`} type="button" className={`filter-btn ${selectedAgent === agent ? 'active' : ''}`} onClick={() => handleAgent(agent)} style={{ fontSize: '11px', padding: '4px 10px' }}>{agent}</button>
          ))}
          <div style={{ width: '1px', height: '18px', background: 'var(--border)', margin: '0 4px' }} />
          {(['ALL', 'YES', 'NO'] as const).map((out) => (
            <button key={out} id={`filter-outcome-${out.toLowerCase()}`} type="button" className={`filter-btn ${selectedOutcome === out ? 'active' : ''}`} onClick={() => handleOutcome(out)} style={{ fontSize: '11px', padding: '4px 8px' }}>{out}</button>
          ))}
          {isFiltered && (
            <button type="button" onClick={clearFilters} className="btn-secondary" style={{ fontSize: '10px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '6px', color: 'var(--muted-foreground)' }} title="Reset all filters">
              <ArrowPathIcon className="w-2.5 h-2.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 10px', minWidth: '240px' }}>
          <MagnifyingGlassIcon className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
          <input id="input-orders-search" type="text" placeholder="Search address or tx hash..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--foreground)', fontSize: '11px', fontFamily: 'var(--font-mono)', width: '100%' }} />
          {searchInput && (
            <button type="button" onClick={() => { setSearchInput(''); setDebouncedSearch(''); setCurrentPage(1); }} style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', fontSize: '12px', padding: '0 2px' }}>×</button>
          )}
        </div>
      </div>

      {scope === 'MY_ORDERS' && !userAddress ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(0, 240, 255, 0.08)', border: '1px solid rgba(0, 240, 255, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-cyan)' }}>
            <WalletIcon className="w-5 h-5" />
          </div>
          <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--foreground)' }}>Connect Wallet to View Personal Fills</h4>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted-foreground)', maxWidth: '380px' }}>When connected, your personal automated session bot executions, manual trades, and settlement payouts will be cataloged here.</p>
          {onConnectWallet && (
            <button id="btn-orders-connect-wallet" type="button" onClick={onConnectWallet} className="btn-glow" style={{ marginTop: '6px', padding: '8px 16px', fontSize: '12px' }}>
              <WalletIcon className="w-3 h-3" />
              <span>Connect Wallet</span>
            </button>
          )}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', position: 'relative', minHeight: isInitialLoading ? '200px' : undefined }}>
          {isFetching && orders.length > 0 && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(9, 9, 11, 0.35)', backdropFilter: 'blur(0.5px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '28px', zIndex: 1, pointerEvents: 'none' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '999px', background: 'rgba(0,0,0,0.7)', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                <Spinner size="xs" variant="cyan" />
                Updating page…
              </span>
            </div>
          )}
          <table className="terminal-table" style={{ width: '100%', borderCollapse: 'collapse', opacity: isFetching && orders.length > 0 ? 0.55 : 1, transition: 'opacity 0.15s ease' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Time (UTC)</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Agent</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Target Asset & Event</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Type & Side</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Contract Price</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Position Lots</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Cost</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Realized PnL & Settlement</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>On-Chain Tx</th>
              </tr>
            </thead>
            {isInitialLoading ? (
              <OrderHistoryTableSkeleton rows={pageSize <= 10 ? pageSize : 10} />
            ) : (
              <tbody>
                {fetchError ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '36px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: 'var(--trade-sell)', fontSize: '12px' }}>{fetchError}</span>
                        <button type="button" onClick={() => { setFetchError(null); setIsInitialLoading(orders.length === 0); setIsFetching(false); fetchIdRef.current++; setCurrentPage((p) => p); }} className="btn-secondary" style={{ fontSize: '11px', padding: '4px 10px' }}>Retry</button>
                      </div>
                    </td>
                  </tr>
                ) : total === 0 || orders.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted-foreground)', fontSize: '12px' }}>
                      {scope === 'MY_ORDERS' ? 'No personal orders or bot executions found for this wallet.' : 'No orders match the selected filters.'}
                    </td>
                  </tr>
                ) : (
                orders.map((order) => {
                  const dateObj = new Date(order.createdAt);
                  const timeStr = dateObj.toLocaleTimeString();
                  const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                  const shortTx = order.txHash ? `${order.txHash.slice(0, 6)}...${order.txHash.slice(-4)}` : 'N/A';
                  const explorerUrl = order.txHash ? `https://shannon-explorer.somnia.network/tx/${order.txHash}` : '#';

                  const marketInfo = parseOrderMarketDetails(order);

                  // Calculate PnL & settlement display
                  const pnl = order.pnl ?? 0;
                  const snapClose = (order as any).marketSnapshot?.closeTimestamp ? new Date((order as any).marketSnapshot.closeTimestamp).getTime() : NaN;
                  const isOpenBySnap = !isNaN(snapClose) && snapClose > Date.now();
                  const ageMs = Date.now() - dateObj.getTime();
                  let isOpenByMarketId = false;
                  if (isNaN(snapClose) && order.marketId.includes('-')) {
                    const parts = order.marketId.split('-');
                    const closeMs = parts.length >= 5 ? Number(parts[4]) : NaN;
                    if (!isNaN(closeMs)) isOpenByMarketId = closeMs > Date.now();
                  }
                  const isOpen = isOpenBySnap || isOpenByMarketId || (!isNaN(snapClose) ? false : ageMs < 360000);

                  let pnlMainText = '0.00 tUSDC';
                  let pnlColor = 'var(--muted-foreground)';
                  let settlementSubText = 'Settled';

                  if (pnl !== 0) {
                    pnlMainText = pnl > 0 ? `+${pnl.toFixed(2)} tUSDC` : `${pnl.toFixed(2)} tUSDC`;
                    pnlColor = pnl > 0 ? 'var(--trade-buy)' : 'var(--trade-sell)';
                    if (marketInfo.settlementPrice) {
                      settlementSubText = `Settled @ ${formatCurrencyAmount(marketInfo.settlementPrice)}`;
                    } else {
                      settlementSubText = pnl > 0 ? 'Settled (Win)' : 'Settled (Loss)';
                    }
                  } else if (order.status !== 'FILLED') {
                    pnlMainText = '— PENDING';
                    pnlColor = 'var(--muted-foreground)';
                    settlementSubText = 'Awaiting Fill';
                  } else if (isOpen) {
                    pnlMainText = '— OPEN';
                    pnlColor = 'var(--muted-foreground)';
                    settlementSubText = 'Active (In Play)';
                  } else {
                    pnlMainText = '0.00 tUSDC';
                    pnlColor = 'var(--muted-foreground)';
                    if (marketInfo.settlementPrice) {
                      settlementSubText = `Settled @ ${formatCurrencyAmount(marketInfo.settlementPrice)}`;
                    } else {
                      settlementSubText = 'Settled';
                    }
                  }

                  const agentRoleMap: Record<string, string> = {
                    Volt: 'Momentum Sniper',
                    Oracle: 'Black-Scholes Φ(z)',
                    Titan: 'MM Depth Ladder',
                    Sweeper: 'Outcome Sweeper',
                  };

                  const tooltipTitle = `[Order Execution Breakdown]
Asset: ${marketInfo.assetName} (${marketInfo.symbol}) ${marketInfo.windowDuration}
Condition: Price > ${formatCurrencyAmount(marketInfo.strikePrice)} at Expiry
Order: ${order.direction} ${order.lotSize.toFixed(1)} lots @ ${order.price.toFixed(2)} tUSDC
Cost: ${order.totalCost.toFixed(2)} tUSDC (Implied: ${(order.price * 100).toFixed(0)}%)
Settlement: ${marketInfo.settlementPrice ? `Settled @ ${formatCurrencyAmount(marketInfo.settlementPrice)}` : (isOpen ? 'Open (Pending Expiry)' : 'Finalized')}
Realized PnL: ${pnl !== 0 ? (pnl > 0 ? `+${pnl.toFixed(2)} tUSDC (Win)` : `${pnl.toFixed(2)} tUSDC (Loss)`) : (isOpen ? 'Open in progress' : '0.00 tUSDC')}
Agent: ${order.agentType} (${agentRoleMap[order.agentType] || 'Autonomous Swarm'})
Tx Hash: ${order.txHash || 'N/A'}`;

                  return (
                    <tr
                      key={order.id}
                      title={tooltipTitle}
                      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', transition: 'background 0.15s ease' }}
                      className="hover:bg-white/[0.02]"
                    >
                      {/* 1. TIME (UTC) */}
                      <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '11.5px', color: 'var(--foreground)', fontWeight: 600 }}>{timeStr}</span>
                          <span style={{ fontSize: '9.5px', color: 'var(--muted-foreground)' }}>{dateStr}</span>
                        </div>
                      </td>

                      {/* 2. AGENT */}
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div>{getAgentBadge(order.agentType)}</div>
                          <span style={{ fontSize: '9.5px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                            {agentRoleMap[order.agentType] || 'Swarm'}
                          </span>
                        </div>
                      </td>

                      {/* 3. TARGET ASSET & EVENT */}
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>
                              {marketInfo.symbol}
                            </span>
                            {marketInfo.windowDuration && (
                              <span style={{ fontSize: '9.5px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.06)', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                                {marketInfo.windowDuration}
                              </span>
                            )}
                            {getOutcomeBadge(order.outcome)}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', fontFamily: 'var(--font-mono)' }}>
                            {marketInfo.strikePrice ? (
                              <span style={{ color: 'var(--muted-foreground)' }}>
                                Target: <strong style={{ color: 'var(--brand-cyan)', fontWeight: 600 }}>&gt; {formatCurrencyAmount(marketInfo.strikePrice)}</strong>
                              </span>
                            ) : (
                              <span style={{ color: 'var(--muted-foreground)', opacity: 0.7 }}>ID: {order.marketId.slice(0, 8)}...</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 4. TYPE & SIDE */}
                      <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ color: order.direction === 'BUY' ? 'var(--trade-buy)' : 'var(--trade-sell)', fontWeight: 700, fontSize: '11.5px' }}>
                            {order.direction}
                          </span>
                          <span style={{ color: 'var(--muted-foreground)', fontSize: '10px' }}>
                            {order.orderType}
                          </span>
                        </div>
                      </td>

                      {/* 5. CONTRACT PRICE */}
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)' }}>
                            {order.price.toFixed(2)} <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 400 }}>tUSDC</span>
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--brand-cyan)', opacity: 0.85 }}>
                            {(order.price * 100).toFixed(0)}% Implied
                          </span>
                        </div>
                      </td>

                      {/* 6. POSITION LOTS */}
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--foreground)', fontWeight: 600 }}>
                            {order.lotSize.toFixed(1)} lots
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
                            {order.lotSize.toFixed(0)} contracts
                          </span>
                        </div>
                      </td>

                      {/* 7. TOTAL COST */}
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-cyan)' }}>
                            {order.totalCost.toFixed(2)} tUSDC
                          </span>
                          <span style={{ fontSize: '9.5px', color: 'var(--muted-foreground)' }}>
                            Max Risk
                          </span>
                        </div>
                      </td>

                      {/* 8. REALIZED PNL & SETTLEMENT */}
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: pnlColor }}>
                            {pnlMainText}
                          </span>
                          <span style={{ fontSize: '10.5px', color: pnl > 0 ? 'var(--trade-buy)' : pnl < 0 ? 'var(--trade-sell)' : 'var(--muted-foreground)', opacity: 0.9 }}>
                            {settlementSubText}
                          </span>
                        </div>
                      </td>

                      {/* 9. STATUS */}
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', background: order.status === 'FILLED' ? 'rgba(0, 255, 102, 0.1)' : 'rgba(255, 170, 0, 0.1)', border: order.status === 'FILLED' ? '1px solid rgba(0, 255, 102, 0.25)' : '1px solid rgba(255, 170, 0, 0.25)', color: order.status === 'FILLED' ? 'var(--trade-buy)' : 'var(--trade-anomaly)', fontSize: '10px', fontWeight: 700 }}>
                            <CheckCircleIcon className="w-2.5 h-2.5" />
                            <span>{order.status}</span>
                          </span>
                          <span style={{ fontSize: '9.5px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                            Matched
                          </span>
                        </div>
                      </td>

                      {/* 10. ON-CHAIN TX */}
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          {order.txHash ? (
                            <a
                              href={explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--brand-cyan)', fontSize: '11px', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}
                              className="hover:underline"
                            >
                              <span>{shortTx}</span>
                              <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                            </a>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>-</span>
                          )}
                          <span style={{ fontSize: '9.5px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                            Somnia 50312
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
              </tbody>
            )}
          </table>
        </div>
      )}

      {total > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={total}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={handlePageSize}
          pageSizeOptions={[15, 25, 50, 100]}
          itemLabel="fills"
          isLoading={isFetching}
        />
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};
