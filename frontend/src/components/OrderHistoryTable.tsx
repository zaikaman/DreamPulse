import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ExternalLink,
  Filter,
  Search,
  CheckCircle2,
  Zap,
  TrendingUp,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ListOrdered,
  User,
  Bot,
  Wallet,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw,
  Receipt,
  Loader2,
} from 'lucide-react';
import type { OrderExecution, AgentType, OutcomeType } from '../types/index.js';
import { apiClient } from '../services/api.js';

interface OrderHistoryTableProps {
  orders?: OrderExecution[];
  isLoading?: boolean;
  userAddress?: string;
  onConnectWallet?: () => Promise<void>;
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

  // Throttled realtime refresh — at most once per 3s, never flashes
  const latestParamsRef = useRef({ scope, userAddress, selectedAgent, selectedOutcome, debouncedSearch, pageSize, currentPage });
  useEffect(() => {
    latestParamsRef.current = { scope, userAddress, selectedAgent, selectedOutcome, debouncedSearch, pageSize, currentPage };
  }, [scope, userAddress, selectedAgent, selectedOutcome, debouncedSearch, pageSize, currentPage]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let lastFetchAt = 0;
    let pendingFetchTimer: number | null = null;

    const scheduleFetch = () => {
      const now = Date.now();
      const elapsed = now - lastFetchAt;
      if (elapsed > 3000) {
        lastFetchAt = now;
        const { scope: s, userAddress: ua, selectedAgent: ag, selectedOutcome: oc, debouncedSearch: ds, pageSize: ps, currentPage: cp } = latestParamsRef.current;
        if (s === 'MY_ORDERS' && !ua) return;
        // Silent background refresh — never shows "Updating page" overlay, never touches isFetching
        apiClient.getOrders({
          userAddress: s === 'MY_ORDERS' ? ua : undefined,
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
        }, 3100 - elapsed);
      }
    };

    const connect = () => {
      try {
        const wsUrl = (import.meta as any).env?.VITE_BACKEND_WS_URL
          ? (import.meta as any).env.VITE_BACKEND_WS_URL
          : (() => {
              const loc = window.location;
              const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
              const host = loc.hostname;
              const port = loc.port === '5173' ? '5000' : loc.port || '5000';
              return `${protocol}//${host}:${port}/ws/telemetry`;
            })();
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          try { ws?.send(JSON.stringify({ action: 'subscribe', channel: 'markets' })); } catch {}
          try { ws?.send(JSON.stringify({ action: 'subscribe', channel: 'user_portfolio' })); } catch {}
        };
        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse((event as MessageEvent).data);
            if (payload.event === 'pnl_update' || payload.event === 'swarm_pnl_tick' || payload.event === 'order_filled' || payload.event === 'sweep_completed') {
              scheduleFetch();
            }
          } catch {}
        };
        ws.onclose = () => { reconnectTimer = window.setTimeout(connect, 3000); };
        ws.onerror = () => { try { ws?.close(); } catch {} };
      } catch {
        reconnectTimer = window.setTimeout(connect, 3000);
      }
    };
    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pendingFetchTimer) clearTimeout(pendingFetchTimer);
      try { ws?.close(); } catch {}
    };
  }, []);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const startItemIndex = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItemIndex = Math.min(currentPage * pageSize, total);

  const paginationItems = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 4) return [1, 2, 3, 4, 5, '...', totalPages];
    if (currentPage >= totalPages - 3) return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
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
            <Zap size={11} />
            <span>Volt</span>
          </span>
        );
      case 'Oracle':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0, 240, 255, 0.12)', border: '1px solid rgba(0, 240, 255, 0.3)', color: 'var(--brand-cyan)', fontSize: '11px', fontWeight: 700 }}>
            <TrendingUp size={11} />
            <span>Oracle</span>
          </span>
        );
      case 'Titan':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', color: '#a855f7', fontSize: '11px', fontWeight: 700 }}>
            <Layers size={11} />
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
          <ArrowUpRight size={11} />
          <span>YES</span>
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255, 51, 102, 0.12)', border: '1px solid rgba(255, 51, 102, 0.3)', color: 'var(--trade-sell)', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
        <ArrowDownRight size={11} />
        <span>NO</span>
      </span>
    );
  };

  return (
    <div className="terminal-panel" style={{ padding: '0', overflow: 'hidden' }}>
      <div className="terminal-panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ListOrdered size={16} style={{ color: 'var(--brand-cyan)' }} />
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>On-Chain Order Executions</h3>
          </div>
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(0, 0, 0, 0.3)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <button id="btn-public-swarm-ledger" type="button" className={`shadcn-tab-btn ${scope === 'ALL_SWARM' ? 'active' : ''}`} onClick={() => handleScope('ALL_SWARM')} style={{ fontSize: '11px', padding: '3px 8px' }}>
              <Bot size={12} />
              <span>Public Swarm Ledger</span>
            </button>
            <button id="btn-my-orders-fills" type="button" className={`shadcn-tab-btn ${scope === 'MY_ORDERS' ? 'active' : ''}`} onClick={() => handleScope('MY_ORDERS')} style={{ fontSize: '11px', padding: '3px 8px' }}>
              <User size={12} />
              <span>My Orders & Fills</span>
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', background: 'rgba(0, 240, 255, 0.06)', border: '1px solid rgba(0, 240, 255, 0.2)', fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
            <Receipt size={12} style={{ color: 'var(--brand-cyan)' }} />
            {isFetching && !isInitialLoading && <Loader2 size={11} style={{ color: 'var(--brand-cyan)', animation: 'spin 0.9s linear infinite' } as any} />}
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
          <Filter size={13} style={{ color: 'var(--muted-foreground)', marginRight: '4px' }} />
          {(['ALL', 'VOLT', 'ORACLE', 'TITAN'] as const).map((agent) => (
            <button key={agent} id={`filter-agent-${agent.toLowerCase()}`} type="button" className={`filter-btn ${selectedAgent === agent ? 'active' : ''}`} onClick={() => handleAgent(agent)} style={{ fontSize: '11px', padding: '4px 10px' }}>{agent}</button>
          ))}
          <div style={{ width: '1px', height: '18px', background: 'var(--border)', margin: '0 4px' }} />
          {(['ALL', 'YES', 'NO'] as const).map((out) => (
            <button key={out} id={`filter-outcome-${out.toLowerCase()}`} type="button" className={`filter-btn ${selectedOutcome === out ? 'active' : ''}`} onClick={() => handleOutcome(out)} style={{ fontSize: '11px', padding: '4px 8px' }}>{out}</button>
          ))}
          {isFiltered && (
            <button type="button" onClick={clearFilters} className="btn-secondary" style={{ fontSize: '10px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '6px', color: 'var(--muted-foreground)' }} title="Reset all filters">
              <RotateCcw size={10} />
              <span>Reset</span>
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 10px', minWidth: '240px' }}>
          <Search size={13} style={{ color: 'var(--muted-foreground)' }} />
          <input id="input-orders-search" type="text" placeholder="Search address or tx hash..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--foreground)', fontSize: '11px', fontFamily: 'var(--font-mono)', width: '100%' }} />
          {searchInput && (
            <button type="button" onClick={() => { setSearchInput(''); setDebouncedSearch(''); setCurrentPage(1); }} style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', fontSize: '12px', padding: '0 2px' }}>×</button>
          )}
        </div>
      </div>

      {scope === 'MY_ORDERS' && !userAddress ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(0, 240, 255, 0.08)', border: '1px solid rgba(0, 240, 255, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-cyan)' }}>
            <Wallet size={20} />
          </div>
          <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--foreground)' }}>Connect Wallet to View Personal Fills</h4>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted-foreground)', maxWidth: '380px' }}>When connected, your personal automated session bot executions, manual trades, and settlement payouts will be cataloged here.</p>
          {onConnectWallet && (
            <button id="btn-orders-connect-wallet" type="button" onClick={onConnectWallet} className="btn-glow" style={{ marginTop: '6px', padding: '8px 16px', fontSize: '12px' }}>
              <Wallet size={13} />
              <span>Connect Wallet</span>
            </button>
          )}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', position: 'relative', minHeight: isInitialLoading ? '200px' : undefined }}>
          {isFetching && orders.length > 0 && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(9, 9, 11, 0.35)', backdropFilter: 'blur(0.5px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '28px', zIndex: 1, pointerEvents: 'none' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '999px', background: 'rgba(0,0,0,0.7)', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                <Loader2 size={12} style={{ animation: 'spin 0.9s linear infinite' } as any} />
                Updating page…
              </span>
            </div>
          )}
          <table className="terminal-table" style={{ width: '100%', borderCollapse: 'collapse', opacity: isFetching && orders.length > 0 ? 0.55 : 1, transition: 'opacity 0.15s ease' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Time (UTC)</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Agent</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Market / Outcome</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Type & Side</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Price</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Lots</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Total Cost</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Realized PnL</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>On-Chain Tx</th>
              </tr>
            </thead>
            <tbody>
              {isInitialLoading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted-foreground)', fontSize: '12px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}><Loader2 size={14} style={{ animation: 'spin 0.9s linear infinite' } as any} /> Loading executed swarm trades...</span>
                  </td>
                </tr>
              ) : fetchError ? (
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
                  const timeStr = new Date(order.createdAt).toLocaleTimeString();
                  const shortTx = order.txHash ? `${order.txHash.slice(0, 6)}...${order.txHash.slice(-4)}` : 'N/A';
                  const explorerUrl = order.txHash ? `https://shannon-explorer.somnia.network/tx/${order.txHash}` : '#';
                  return (
                    <tr key={order.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', transition: 'background 0.15s ease' }}>
                      <td style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>{timeStr}</td>
                      <td style={{ padding: '12px 16px' }}>{getAgentBadge(order.agentType)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>{order.marketId.slice(0, 8)}...</span>
                          {getOutcomeBadge(order.outcome)}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ color: order.direction === 'BUY' ? 'var(--trade-buy)' : 'var(--trade-sell)', fontWeight: 600 }}>{order.direction}</span> <span style={{ color: 'var(--muted-foreground)' }}>({order.orderType})</span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>{order.price.toFixed(2)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>{order.lotSize.toFixed(1)} lots</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: 'var(--brand-cyan)', fontFamily: 'var(--font-mono)' }}>{order.totalCost.toFixed(2)} tUSDC</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: (order.pnl ?? 0) > 0 ? 'var(--trade-buy)' : (order.pnl ?? 0) < 0 ? 'var(--trade-sell)' : 'var(--muted-foreground)' }} title={order.pnl !== undefined && order.pnl !== 0 ? `Realized: payout - cost per lot (${order.direction} ${order.outcome}); settled against expiry / winningOutcome` : 'Realized PnL is 0 until market expires & settles; PnL = (payout - cost) for BUY, (cost - payout) for SELL; VOID = 0.5 payout'}>
                        {(() => {
                          const pnl = order.pnl ?? 0;
                          if (pnl !== 0) return pnl > 0 ? `+${pnl.toFixed(2)} tUSDC` : `${pnl.toFixed(2)} tUSDC`;
                          if (order.status !== 'FILLED') return <span style={{ color: 'var(--muted-foreground)', fontWeight: 500, fontSize: '11px' }} title="Pending fill">— <span style={{ fontSize: '9px', opacity: 0.7 }}>PENDING</span></span>;
                          const snapClose = (order as any).marketSnapshot?.closeTimestamp ? new Date((order as any).marketSnapshot.closeTimestamp).getTime() : NaN;
                          const isOpenBySnap = !isNaN(snapClose) && snapClose > Date.now();
                          const ageMs = Date.now() - new Date(order.createdAt).getTime();
                          let isOpenByMarketId = false;
                          if (isNaN(snapClose) && order.marketId.includes('-')) {
                            const parts = order.marketId.split('-');
                            const closeMs = parts.length >= 5 ? Number(parts[4]) : NaN;
                            if (!isNaN(closeMs)) isOpenByMarketId = closeMs > Date.now();
                          }
                          if (isOpenBySnap || isOpenByMarketId || (!isNaN(snapClose) ? false : ageMs < 360000)) return <span style={{ color: 'var(--muted-foreground)', fontWeight: 500, fontSize: '11px' }} title="Market still open — awaiting expiry/settlement.">— <span style={{ fontSize: '9px', opacity: 0.7 }}>OPEN</span></span>;
                          return '0.00';
                        })()}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', background: order.status === 'FILLED' ? 'rgba(0, 255, 102, 0.1)' : 'rgba(255, 170, 0, 0.1)', border: order.status === 'FILLED' ? '1px solid rgba(0, 255, 102, 0.25)' : '1px solid rgba(255, 170, 0, 0.25)', color: order.status === 'FILLED' ? 'var(--trade-buy)' : 'var(--trade-anomaly)', fontSize: '10px', fontWeight: 700 }}>
                          <CheckCircle2 size={10} />
                          <span>{order.status}</span>
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {order.txHash ? <a href={explorerUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--brand-cyan)', fontSize: '11px', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}><span>{shortTx}</span><ExternalLink size={11} /></a> : <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>-</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'rgba(0, 0, 0, 0.25)' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
            Showing <strong style={{ color: 'var(--foreground)' }}>{startItemIndex}–{endItemIndex}</strong> of <strong style={{ color: 'var(--brand-cyan)' }}>{total}</strong> fills
            {isFiltered && scopeTotals.totalFills !== total && <span style={{ opacity: 0.6 }}> ({scopeTotals.totalFills} total in ledger)</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
              <span>Rows per page:</span>
              <div style={{ display: 'flex', gap: '2px', background: 'rgba(255, 255, 255, 0.03)', padding: '2px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                {[15, 25, 50, 100].map((size) => (
                  <button key={size} id={`btn-page-size-${size}`} type="button" onClick={() => handlePageSize(size)} style={{ padding: '2px 7px', fontSize: '11px', fontFamily: 'var(--font-mono)', background: pageSize === size ? 'rgba(0, 240, 255, 0.15)' : 'transparent', border: pageSize === size ? '1px solid var(--brand-cyan)' : '1px solid transparent', color: pageSize === size ? 'var(--brand-cyan)' : 'var(--muted-foreground)', borderRadius: '3px', cursor: 'pointer', fontWeight: pageSize === size ? 700 : 400, transition: 'all 0.15s ease' }}>{size}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button id="btn-page-first" type="button" disabled={currentPage === 1 || isFetching} onClick={() => setCurrentPage(1)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '5px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border)', color: currentPage === 1 ? 'rgba(255, 255, 255, 0.2)' : 'var(--foreground)', cursor: currentPage === 1 || isFetching ? 'not-allowed' : 'pointer', opacity: isFetching ? 0.6 : 1 }} title="First Page"><ChevronsLeft size={14} /></button>
              <button id="btn-page-prev" type="button" disabled={currentPage === 1 || isFetching} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '5px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border)', color: currentPage === 1 ? 'rgba(255, 255, 255, 0.2)' : 'var(--foreground)', cursor: currentPage === 1 || isFetching ? 'not-allowed' : 'pointer', opacity: isFetching ? 0.6 : 1 }} title="Previous Page"><ChevronLeft size={14} /></button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                {paginationItems.map((item, idx) => {
                  if (item === '...') return <span key={`ellipsis-${idx}`} style={{ padding: '0 4px', fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>...</span>;
                  const pageNum = Number(item);
                  const isActive = currentPage === pageNum;
                  return <button key={pageNum} id={`btn-page-${pageNum}`} type="button" disabled={isFetching} onClick={() => setCurrentPage(pageNum)} style={{ minWidth: '28px', height: '28px', padding: '0 6px', borderRadius: '5px', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: isActive ? 700 : 500, background: isActive ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255, 255, 255, 0.02)', border: isActive ? '1px solid var(--brand-cyan)' : '1px solid var(--border)', color: isActive ? 'var(--brand-cyan)' : 'var(--foreground)', cursor: isFetching ? 'not-allowed' : 'pointer', opacity: isFetching ? 0.7 : 1 }}>{pageNum}</button>;
                })}
              </div>
              <button id="btn-page-next" type="button" disabled={currentPage === totalPages || isFetching} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '5px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border)', color: currentPage === totalPages ? 'rgba(255, 255, 255, 0.2)' : 'var(--foreground)', cursor: currentPage === totalPages || isFetching ? 'not-allowed' : 'pointer', opacity: isFetching ? 0.6 : 1 }} title="Next Page"><ChevronRight size={14} /></button>
              <button id="btn-page-last" type="button" disabled={currentPage === totalPages || isFetching} onClick={() => setCurrentPage(totalPages)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '5px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border)', color: currentPage === totalPages ? 'rgba(255, 255, 255, 0.2)' : 'var(--foreground)', cursor: currentPage === totalPages || isFetching ? 'not-allowed' : 'pointer', opacity: isFetching ? 0.6 : 1 }} title="Last Page"><ChevronsRight size={14} /></button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};
