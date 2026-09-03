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
  XMarkIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import type { OrderExecution, AgentType, OutcomeType, OrderSource } from '../types/index.js';
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

function normalizeMarketSymbol(raw: string): string {
  if (!raw) return 'BTC/USD';
  const s = raw.trim().toUpperCase().replace(/\/USD\/USD$/i, '/USD');
  if (s.includes('ETH')) return 'ETH/USD';
  if (s.includes('BTC')) return 'BTC/USD';
  if (s.includes('/')) return s;
  if (s.endsWith('USD')) return `${s.slice(0, -3)}/USD`;
  if (s.endsWith('USDT')) return `${s.slice(0, -4)}/USD`;
  return `${s}/USD`;
}

function getAssetDisplayName(symbol: string): string {
  if (symbol.includes('ETH')) return 'Ethereum';
  if (symbol.includes('BTC')) return 'Bitcoin';
  return symbol.split('/')[0];
}

function parseOrderMarketDetails(order: OrderExecution): ParsedMarketInfo {
  let symbol = order.marketSnapshot?.symbol ? normalizeMarketSymbol(order.marketSnapshot.symbol) : '';
  let strikePrice = order.marketSnapshot?.strikePrice;
  let settlementPrice = order.marketSnapshot?.settlementPrice;
  let winningOutcome = order.marketSnapshot?.winningOutcome;
  let windowDuration = order.marketSnapshot?.windowDuration || '5m';

  if (order.marketId && order.marketId.includes('-')) {
    const parts = order.marketId.split('-');
    if (parts.length >= 2) {
      if (!symbol) {
        symbol = normalizeMarketSymbol(parts[1]);
      }
      if (parts.length >= 5) {
        if (parts[2]?.endsWith('m') || parts[2]?.endsWith('h') || parts[2]?.endsWith('d')) {
          windowDuration = parts[2];
        }
        const parsedStrike = Number(parts[3]);
        if (!isNaN(parsedStrike) && parsedStrike > 0 && !strikePrice) {
          strikePrice = parsedStrike;
        }
      } else {
        for (let i = 2; i < parts.length; i++) {
          if (parts[i].endsWith('m') || parts[i].endsWith('h') || parts[i].endsWith('d')) {
            windowDuration = parts[i];
          } else {
            const num = Number(parts[i]);
            // Strike price must be a valid positive price and not a millisecond timestamp (> 1e11)
            if (!isNaN(num) && num > 0 && num < 1_000_000_000 && !strikePrice) {
              strikePrice = num;
            }
          }
        }
      }
    }
  }

  if (!symbol) symbol = 'BTC/USD';
  symbol = normalizeMarketSymbol(symbol);
  const assetName = getAssetDisplayName(symbol);

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

const marketDetailsCache = new WeakMap<OrderExecution, ParsedMarketInfo>();

function getParsedMarketDetails(order: OrderExecution): ParsedMarketInfo {
  const cached = marketDetailsCache.get(order);
  if (cached) return cached;
  const parsed = parseOrderMarketDetails(order);
  marketDetailsCache.set(order, parsed);
  return parsed;
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
  const [customAgentsMap, setCustomAgentsMap] = useState<Map<string, { name: string; strategyType?: string; color?: string }>>(new Map());

  // Cancellation state for resting limit orders
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleCancelOrder = async (order: OrderExecution) => {
    if (!userAddress || !order.userAddress) return;
    if (userAddress.toLowerCase() !== order.userAddress.toLowerCase()) {
      setCancelError('Cannot cancel an order that does not belong to your connected wallet.');
      return;
    }
    setCancellingOrderId(order.id);
    setCancelError(null);
    try {
      const res = await apiClient.cancelOrder(order.id, userAddress);
      if (res.success) {
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, status: 'CANCELLED' } : o)),
        );
        setRefreshKey((k) => k + 1);
      } else {
        setCancelError(res.message || 'Failed to cancel order');
      }
    } catch (err: any) {
      setCancelError(err?.message || 'Error cancelling order');
    } finally {
      setCancellingOrderId(null);
    }
  };

  // Truthful resolution: only show names for *actually deployed* custom agents — never hallucinate starters.
  const OPERATOR_ADDRESS = '0x93e300607c363E7D7a47e50f5c9fDf1723e859Cf';
  useEffect(() => {
    let active = true;
    const buildMap = (agents: any[]) => {
      const map = new Map<string, { name: string; strategyType?: string; color?: string }>();
      for (const ag of agents) {
        if (!ag?.name || !ag?.id) continue;
        const isGeneric = !ag.name.trim() || ag.name.trim().toLowerCase() === 'custom strategy' || ag.name.trim().toLowerCase() === 'custom' || ag.name.trim().toLowerCase() === 'custom agent';
        if (isGeneric) continue;
        // Only index deployed + active agents for ledger truthfulness — undeployed templates must not generate fake fills
        if (!ag.isDeployed || !ag.isActive) continue;
        // Skip zero-address pristine templates (they are never deployed under real user)
        if (!ag.userAddress || ag.userAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') continue;
        map.set(ag.id, { name: ag.name, strategyType: ag.strategyType, color: ag.color });
        // Also index by symbol:timeframe for legacy orders that lost their custom_agent_id but still have denormalized name via symbol
        // Only if this agent is the sole deployed for that pairing; otherwise keep first (deployed wins)
        const symKey = `${(ag.symbol || 'BTC/USD').toUpperCase()}:${(ag.timeframe || '5m').toLowerCase()}`;
        if (!map.has(symKey)) map.set(symKey, { name: ag.name, strategyType: ag.strategyType, color: ag.color });
      }
      return map;
    };

    const fetchAll = async () => {
      try {
        const fetchedMaps: Map<string, { name: string; strategyType?: string; color?: string }>[] = [];
        if (userAddress) {
          try {
            const r1 = await apiClient.getCustomAgents(userAddress);
            if (r1?.data) fetchedMaps.push(buildMap(r1.data));
          } catch {}
        }
        // Operator pools — canonical swarm custom agents visible in Public Swarm Ledger (cached via apiClient)
        try {
          const rOp = await apiClient.getCustomAgents(OPERATOR_ADDRESS);
          if (rOp?.data) fetchedMaps.push(buildMap(rOp.data));
        } catch {}
        // Do NOT fetch global starters — they are not deployed and would create hallucinated RSI fills

        if (!active) return;
        const merged = new Map<string, { name: string; strategyType?: string; color?: string }>();
        for (const m of fetchedMaps) {
          for (const [k, v] of m.entries()) {
            if (!merged.has(k)) merged.set(k, v);
          }
        }
        setCustomAgentsMap(merged);
      } catch {}
    };

    void fetchAll();
    return () => { active = false; };
  }, [userAddress]);

  const isFiltered = selectedAgent !== 'ALL' || selectedOutcome !== 'ALL' || debouncedSearch.trim().length > 0;

  // Debounce search (250ms for snappy responsiveness) and reset to page 1 when search actually changes
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (debouncedSearch !== searchInput) {
        setDebouncedSearch(searchInput);
        setCurrentPage(1);
      }
    }, 250);
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
          source: 'SWARM',
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
  }, [scope, userAddress, selectedAgent, selectedOutcome, debouncedSearch, pageSize, currentPage, refreshKey]);

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
          source: 'SWARM',
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
          source: 'SWARM',
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

  const headerFills = isFiltered ? totalFills : (totalFills || scopeTotals.totalFills);
  const headerVolume = isFiltered ? totalVolume : (totalVolume || scopeTotals.totalVolume);

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
          {(['ALL', 'VOLT', 'ORACLE', 'TITAN', 'CUSTOM'] as const).map((agent) => (
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
            <button type="button" onClick={() => { setSearchInput(''); setDebouncedSearch(''); setCurrentPage(1); }} style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', padding: '0 2px' }} title="Clear search">
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
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
          {cancelError && (
            <div style={{ margin: '8px 16px', padding: '6px 12px', borderRadius: '4px', background: 'rgba(255, 51, 102, 0.1)', border: '1px solid rgba(255, 51, 102, 0.3)', color: 'var(--trade-sell)', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{cancelError}</span>
              <button type="button" onClick={() => setCancelError(null)} style={{ background: 'none', border: 'none', color: 'var(--trade-sell)', cursor: 'pointer', padding: 0 }}>
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <table className="terminal-table" style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', opacity: isFetching && orders.length > 0 ? 0.55 : 1, transition: 'opacity 0.15s ease' }}>
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
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Action</th>
              </tr>
            </thead>
            {isInitialLoading ? (
              <OrderHistoryTableSkeleton rows={pageSize <= 10 ? pageSize : 10} />
            ) : (
              <tbody>
                {fetchError ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '36px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: 'var(--trade-sell)', fontSize: '12px' }}>{fetchError}</span>
                        <button type="button" onClick={() => { setFetchError(null); setIsInitialLoading(orders.length === 0); setIsFetching(false); fetchIdRef.current++; setCurrentPage((p) => p); }} className="btn-secondary" style={{ fontSize: '11px', padding: '4px 10px' }}>Retry</button>
                      </div>
                    </td>
                  </tr>
                ) : total === 0 || orders.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted-foreground)', fontSize: '12px' }}>
                      {scope === 'MY_ORDERS' ? 'No personal orders or bot executions found for this wallet.' : 'No orders match the selected filters.'}
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const customDetails = order.agentType === 'CUSTOM' ? resolveCustomAgentDetails(order, customAgentsMap) : null;
                    const isOwner = Boolean(
                      userAddress &&
                      order.userAddress &&
                      userAddress.toLowerCase() === order.userAddress.toLowerCase()
                    );
                    return (
                      <OrderRowItem
                        key={order.id}
                        order={order}
                        customDetails={customDetails}
                        isOwner={isOwner}
                        onCancelOrder={handleCancelOrder}
                        isCancelling={cancellingOrderId === order.id}
                      />
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

// Starter template metadata — kept for StrategyStudio/library UI, NOT for ledger fallback (prevents fake RSI hallucinations)
const STARTER_AGENT_MAP: Record<string, { name: string; subtext: string; color: string }> = {
  '00000000-0000-0000-0000-000000000001': { name: 'RSI Oversold Dip Sniper', subtext: 'Mean Reversion (RSI)', color: '#2dd4bf' },
  '00000000-0000-0000-0000-000000000002': { name: 'Bollinger Band Exhaustion Fade', subtext: 'Mean Reversion (BB)', color: '#f59e0b' },
  '00000000-0000-0000-0000-000000000003': { name: 'Fast EMA Momentum Rider', subtext: 'Momentum (EMA)', color: '#a78bfa' },
};

const isGenericAgentName = (n?: string | null): boolean => {
  if (!n || typeof n !== 'string') return true;
  const t = n.trim();
  if (t.length === 0) return true;
  const l = t.toLowerCase();
  return l === 'custom strategy' || l === 'custom' || l === 'custom agent' || l === 'custom swarm';
};

const formatStrategySubtext = (strategyType?: string, symbol?: string, windowDuration?: string): string => {
  if (strategyType && strategyType.trim() && strategyType.toLowerCase() !== 'custom') {
    return strategyType.replace(/_/g, ' ');
  }
  if (symbol && windowDuration) return `${symbol} • ${windowDuration}`;
  if (symbol) return symbol;
  return 'Custom Strategy';
};

function resolveCustomAgentDetails(
  order: OrderExecution,
  customAgentsMap: Map<string, { name: string; strategyType?: string; color?: string }>,
  marketInfo?: ParsedMarketInfo
): { name: string; subtext: string; color: string } | null {
  const symbol = marketInfo?.symbol || (order.marketSnapshot?.symbol ? normalizeMarketSymbol(order.marketSnapshot.symbol) : 'BTC/USD');
  const windowDuration = marketInfo?.windowDuration || order.marketSnapshot?.windowDuration || '5m';

  // 1) Trust denormalized backend name ONLY if it's not generic placeholder — this is the single source of truth for deployed agents
  if (order.customAgentName && !isGenericAgentName(order.customAgentName)) {
    const enriched = order.customAgentId ? customAgentsMap.get(order.customAgentId) : undefined;
    const strat = enriched?.strategyType;
    return {
      name: order.customAgentName.trim(),
      subtext: formatStrategySubtext(strat, symbol, windowDuration),
      color: enriched?.color || '#2dd4bf',
    };
  }

  // 2) Resolve via deployed agentId — only if that id belongs to an actually deployed agent for this viewer/operator
  if (order.customAgentId) {
    if (STARTER_AGENT_MAP[order.customAgentId]) {
      const deployed = customAgentsMap.get(order.customAgentId);
      if (deployed && !isGenericAgentName(deployed.name)) {
        return {
          name: deployed.name,
          subtext: formatStrategySubtext(deployed.strategyType, symbol, windowDuration),
          color: deployed.color || STARTER_AGENT_MAP[order.customAgentId].color,
        };
      }
    } else {
      const found = customAgentsMap.get(order.customAgentId);
      if (found && !isGenericAgentName(found.name)) {
        return {
          name: found.name,
          subtext: formatStrategySubtext(found.strategyType, symbol, windowDuration),
          color: found.color || '#2dd4bf',
        };
      }
    }
    const shortId = order.customAgentId.slice(0, 8);
    return {
      name: `Archived #${shortId}`,
      subtext: `${symbol} • ${windowDuration} • archived`,
      color: '#6b7280',
    };
  }

  // 3) Legacy symbol:timeframe heuristic
  const symKey = `${symbol.toUpperCase()}:${windowDuration.toLowerCase()}`;
  const foundBySym = customAgentsMap.get(symKey);
  if (foundBySym && !isGenericAgentName(foundBySym.name)) {
    return {
      name: foundBySym.name,
      subtext: formatStrategySubtext(foundBySym.strategyType, symbol, windowDuration),
      color: foundBySym.color || '#2dd4bf',
    };
  }

  return null;
}

function getAgentBadge(
  agentType: AgentType,
  customDetails?: { name: string; subtext: string; color?: string } | null,
  source?: OrderSource,
) {
  if (source === 'COPY_TRADE') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#38bdf8', fontSize: '11px', fontWeight: 700 }}>
        <UserIcon className="w-3 h-3" />
        <span>Autonomous Copy Trade</span>
      </span>
    );
  }
  if (source === 'TERMINAL' || agentType === 'Manual') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.2)', color: 'var(--muted-foreground)', fontSize: '11px', fontWeight: 700 }}>
        <UserIcon className="w-3 h-3" />
        <span>Manual User</span>
      </span>
    );
  }
  switch (agentType) {
    case 'Volt':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255, 170, 0, 0.12)', border: '1px solid rgba(255, 170, 0, 0.3)', color: '#ffb700', fontSize: '11px', fontWeight: 700 }}>
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
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', color: ' #7928ca', fontSize: '11px', fontWeight: 700 }}>
          <Square3Stack3DIcon className="w-3 h-3" />
          <span>Titan</span>
        </span>
      );
    case 'CUSTOM': {
      if (!customDetails) {
        return (
          <span
            title="Unknown custom agent — archived or not deployed"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 7px',
              borderRadius: '4px',
              background: 'rgba(107, 114, 128, 0.14)',
              border: '1px solid rgba(107, 114, 128, 0.3)',
              color: '#9ca3af',
              fontSize: '11px',
              fontWeight: 700,
              maxWidth: '152px',
              letterSpacing: '-0.01em',
            }}
          >
            <SparklesIcon className="w-3 h-3 flex-shrink-0" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Archived Agent</span>
          </span>
        );
      }
      const isArchived = customDetails.name.startsWith('Archived #');
      const displayName = customDetails.name.trim();
      const badgeColor = customDetails.color || (isArchived ? '#6b7280' : '#2dd4bf');
      const isLong = displayName.length > 22;
      const isVeryLong = displayName.length > 28;
      return (
        <span
          title={displayName}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: isLong ? '3.5px' : '4.5px',
            padding: isVeryLong ? '2px 6px' : '2px 7px',
            borderRadius: '4px',
            background: isArchived ? 'rgba(107,114,128,0.12)' : 'rgba(45,212,191,0.11)',
            border: `1px solid ${badgeColor}4D`,
            color: badgeColor,
            fontSize: isVeryLong ? '10px' : '11px',
            fontWeight: 700,
            maxWidth: isVeryLong ? '172px' : isLong ? '168px' : '152px',
            letterSpacing: isLong ? '-0.02em' : '-0.01em',
            lineHeight: 1.2,
          }}
        >
          <SparklesIcon className="w-3 h-3 flex-shrink-0" style={{ width: isVeryLong ? '11px' : '12px', height: isVeryLong ? '11px' : '12px' }} />
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              flex: 1,
            }}
          >
            {displayName}
          </span>
        </span>
      );
    }
    default:
      return <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{agentType}</span>;
  }
}

function getOutcomeBadge(outcome: OutcomeType) {
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
}

const OrderRowItem = React.memo<{
  order: OrderExecution;
  customDetails: { name: string; subtext: string; color?: string } | null;
  isOwner?: boolean;
  onCancelOrder?: (order: OrderExecution) => void;
  isCancelling?: boolean;
}>(({ order, customDetails, isOwner, onCancelOrder, isCancelling }) => {
  const dateObj = new Date(order.createdAt);
  const timeStr = dateObj.toLocaleTimeString();
  const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const shortTx = order.txHash ? `${order.txHash.slice(0, 6)}...${order.txHash.slice(-4)}` : 'N/A';
  const explorerUrl = order.txHash ? `https://shannon-explorer.somnia.network/tx/${order.txHash}` : '#';

  const marketInfo = getParsedMarketDetails(order);

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

  if (order.status === 'EXPIRED') {
    pnlMainText = '0.00 tUSDC';
    pnlColor = 'var(--muted-foreground)';
    settlementSubText = 'Expired (Unfilled)';
  } else if (pnl !== 0) {
    pnlMainText = pnl > 0 ? `+${pnl.toFixed(2)} tUSDC` : `${pnl.toFixed(2)} tUSDC`;
    pnlColor = pnl > 0 ? 'var(--trade-buy)' : 'var(--trade-sell)';
    if (marketInfo.settlementPrice) {
      settlementSubText = `Settled @ ${formatCurrencyAmount(marketInfo.settlementPrice)}`;
    } else {
      settlementSubText = pnl > 0 ? 'Settled (Win)' : 'Settled (Loss)';
    }
  } else if (order.status !== 'FILLED' && order.status !== 'PARTIALLY_FILLED') {
    pnlMainText = '— PENDING';
    pnlColor = 'var(--muted-foreground)';
    settlementSubText = 'Awaiting Fill';
  } else if (isOpen) {
    pnlMainText = '— OPEN';
    pnlColor = 'var(--muted-foreground)';
    settlementSubText = order.status === 'PARTIALLY_FILLED' ? 'Partial (In Play)' : 'Active (In Play)';
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
    CUSTOM: 'Custom Strategy',
  };

  const rawSub = customDetails?.subtext;
  const healedSub = rawSub && !isGenericAgentName(rawSub) ? rawSub : formatStrategySubtext(undefined, marketInfo.symbol, marketInfo.windowDuration);
  const agentSubtitle = order.source === 'COPY_TRADE'
    ? 'Social Forecaster Mirror'
    : (order.agentType === 'CUSTOM'
      ? (customDetails ? healedSub : `${marketInfo.symbol} • ${marketInfo.windowDuration} • archived`)
      : (agentRoleMap[order.agentType] || (order.source === 'TERMINAL' || order.agentType === 'Manual' ? 'Terminal Discretionary' : 'Swarm')));
  const rawDisplay = customDetails?.name;
  const agentDisplayName = order.source === 'COPY_TRADE'
    ? 'Autonomous Copy Trade'
    : (order.agentType === 'CUSTOM'
      ? (rawDisplay && !isGenericAgentName(rawDisplay) ? rawDisplay.trim() : (customDetails ? 'Archived Agent' : 'Unknown Custom Agent'))
      : (order.source === 'TERMINAL' || order.agentType === 'Manual' ? 'Manual User' : order.agentType));

  const tooltipTitle = `[Order Execution Breakdown]
Asset: ${marketInfo.assetName} (${marketInfo.symbol}) ${marketInfo.windowDuration}
Condition: Price > ${formatCurrencyAmount(marketInfo.strikePrice)} at Expiry
Order: ${order.direction} ${order.lotSize.toFixed(1)} lots @ ${order.price.toFixed(2)} tUSDC
Cost: ${order.totalCost.toFixed(2)} tUSDC (Implied: ${(order.price * 100).toFixed(0)}%)
Settlement: ${marketInfo.settlementPrice ? `Settled @ ${formatCurrencyAmount(marketInfo.settlementPrice)}` : (isOpen ? 'Open (Pending Expiry)' : 'Finalized')}
Realized PnL: ${order.status === 'EXPIRED' ? '0.00 tUSDC (Expired Unfilled)' : (pnl !== 0 ? (pnl > 0 ? `+${pnl.toFixed(2)} tUSDC (Win)` : `${pnl.toFixed(2)} tUSDC (Loss)`) : (isOpen ? 'Open in progress' : '0.00 tUSDC'))}
Agent: ${agentDisplayName} (${agentSubtitle})
Tx Hash: ${order.txHash || 'N/A'}`;

  const statusBg = order.status === 'FILLED'
    ? 'rgba(0, 255, 102, 0.1)'
    : order.status === 'PARTIALLY_FILLED'
    ? 'rgba(0, 240, 255, 0.1)'
    : (order.status === 'CANCELLED' || order.status === 'REJECTED')
    ? 'rgba(255, 51, 102, 0.1)'
    : order.status === 'EXPIRED'
    ? 'rgba(148, 163, 184, 0.1)'
    : 'rgba(255, 170, 0, 0.1)';

  const statusBorder = order.status === 'FILLED'
    ? '1px solid rgba(0, 255, 102, 0.25)'
    : order.status === 'PARTIALLY_FILLED'
    ? '1px solid rgba(0, 240, 255, 0.25)'
    : (order.status === 'CANCELLED' || order.status === 'REJECTED')
    ? '1px solid rgba(255, 51, 102, 0.25)'
    : order.status === 'EXPIRED'
    ? '1px solid rgba(148, 163, 184, 0.25)'
    : '1px solid rgba(255, 170, 0, 0.25)';

  const statusColor = order.status === 'FILLED'
    ? 'var(--trade-buy)'
    : order.status === 'PARTIALLY_FILLED'
    ? 'var(--brand-cyan)'
    : (order.status === 'CANCELLED' || order.status === 'REJECTED')
    ? 'var(--trade-sell)'
    : order.status === 'EXPIRED'
    ? 'var(--muted-foreground)'
    : 'var(--trade-anomaly)';

  const statusSubLabel = order.status === 'FILLED'
    ? 'Matched'
    : order.status === 'PARTIALLY_FILLED'
    ? 'Partial Fill'
    : order.status === 'PENDING'
    ? 'Resting Book'
    : order.status === 'EXPIRED'
    ? 'Unfilled Expired'
    : order.status;

  return (
    <tr
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, maxWidth: '184px' }}>
          <div style={{ minWidth: 0 }}>{getAgentBadge(order.agentType, customDetails, order.source)}</div>
          <span
            style={{
              fontSize: '9.5px',
              color: 'var(--muted-foreground)',
              fontFamily: 'var(--font-mono)',
              maxWidth: '172px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
            }}
            title={agentSubtitle}
          >
            {agentSubtitle}
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', background: statusBg, border: statusBorder, color: statusColor, fontSize: '10px', fontWeight: 700 }}>
            <CheckCircleIcon className="w-2.5 h-2.5" />
            <span>{order.status}</span>
          </span>
          <span style={{ fontSize: '9.5px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
            {statusSubLabel}
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

      {/* 11. ACTION (Cancel resting limit orders) */}
      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
        {order.status === 'PENDING' && isOwner ? (
          <button
            type="button"
            onClick={() => onCancelOrder?.(order)}
            disabled={isCancelling}
            title="Cancel resting limit order and reclaim collateral"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 600,
              border: '1px solid rgba(255, 51, 102, 0.4)',
              color: '#ff3366',
              backgroundColor: 'rgba(255, 51, 102, 0.1)',
              cursor: isCancelling ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
            className="hover:bg-[#ff3366]/20 hover:border-[#ff3366]/60 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCancelling ? (
              <>
                <ArrowPathIcon className="w-2.5 h-2.5 animate-spin" />
                <span>Cancelling...</span>
              </>
            ) : (
              <>
                <XMarkIcon className="w-2.5 h-2.5 text-[#ff3366]" />
                <span>Cancel</span>
              </>
            )}
          </button>
        ) : (
          <span
            style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}
            title={order.status === 'PENDING' ? 'Resting order owned by another trader or swarm agent' : undefined}
          >
            —
          </span>
        )}
      </td>
    </tr>
  );
});
