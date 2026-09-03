import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  CommandLineIcon,
  PlayIcon,
  PauseIcon,
  BoltIcon,
  CpuChipIcon,
  ShieldCheckIcon,
  SparklesIcon,
  MagnifyingGlassIcon,
  ArrowTrendingUpIcon,
  ChartBarIcon,
  FunnelIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  SignalIcon,
  FireIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { AgentThoughtLog, CustomAgentDefinition } from '../types/index.js';
import { AgentThoughtFeedSkeleton } from './ui/Skeleton.js';
import { Pagination } from './ui/Pagination.js';

interface AgentThoughtFeedProps {
  thoughts: AgentThoughtLog[];
  debugThoughts?: AgentThoughtLog[];
  isDebugEnabled?: boolean;
  onToggleDebug?: (enable?: boolean) => void;
  isConnected: boolean;
  isLoading?: boolean;
  customAgents?: CustomAgentDefinition[];
}

export const AgentThoughtFeed: React.FC<AgentThoughtFeedProps> = ({
  thoughts,
  debugThoughts = [],
  isDebugEnabled = false,
  onToggleDebug,
  isConnected,
  isLoading = false,
  customAgents = [],
}) => {
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [isPausedManual, setIsPausedManual] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isHoverPauseSuppressed, setIsHoverPauseSuppressed] = useState<boolean>(false);
  const [frozenThoughts, setFrozenThoughts] = useState<AgentThoughtLog[] | null>(null);
  const [nowTime, setNowTime] = useState<number>(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);

  // Update clock every second for live relative timestamps
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isPaused = isPausedManual || (isHovered && !isHoverPauseSuppressed);

  // Live pool of thoughts from WebSocket stream
  const liveSourceList = useMemo(() => {
    if (selectedFilter === 'DEBUG_TRACE') {
      return debugThoughts;
    }
    if (isDebugEnabled && selectedFilter === 'ALL') {
      const combined = [...thoughts, ...debugThoughts];
      return combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return thoughts;
  }, [thoughts, debugThoughts, isDebugEnabled, selectedFilter]);

  // When paused, freeze the displayed pool snapshot so new stream events do not push rows downward
  useEffect(() => {
    if (isPaused) {
      setFrozenThoughts((prev) => prev ?? liveSourceList);
    } else {
      setFrozenThoughts(null);
    }
  }, [isPaused, liveSourceList]);

  // Active pool: frozen snapshot if paused to inspect, otherwise live stream
  const activeSourceList = useMemo(() => {
    if (isPaused && frozenThoughts) {
      return frozenThoughts;
    }
    return liveSourceList;
  }, [isPaused, frozenThoughts, liveSourceList]);

  // Number of buffered thoughts accumulated while stream is paused
  const bufferedCount = useMemo(() => {
    if (!isPaused || !frozenThoughts) return 0;
    const frozenIds = new Set(frozenThoughts.map((t) => t.id));
    return liveSourceList.reduce((acc, t) => acc + (frozenIds.has(t.id) ? 0 : 1), 0);
  }, [isPaused, frozenThoughts, liveSourceList]);

  const handleResume = () => {
    setIsPausedManual(false);
    setIsHoverPauseSuppressed(true);
    setFrozenThoughts(null);
  };

  // Autoscroll: when streaming live (not paused) and user is at top of page 1, keep freshest thoughts visible
  useEffect(() => {
    if (!isPaused && currentPage === 1 && containerRef.current) {
      if (containerRef.current.scrollTop < 60) {
        containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [liveSourceList, isPaused, currentPage]);

  // Snapshot of latest distinct thought per agent for Executive Digest
  const latestByAgent = useMemo(() => {
    const map = new Map<string, AgentThoughtLog>();
    const pool = [...thoughts, ...debugThoughts];
    for (const t of pool) {
      const type = t.agentType.toUpperCase();
      if (!map.has(type)) {
        map.set(type, t);
      }
    }
    return map;
  }, [thoughts, debugThoughts]);

  // Filtered and deduplicated thoughts according to selected tab and search query
  const filteredThoughts = useMemo(() => {
    const rawFiltered = activeSourceList.filter((t) => {
      // 1. Tab filter
      if (selectedFilter === 'EXECUTIONS') {
        if (!t.isExecution && !t.txHash) return false;
      } else if (selectedFilter === 'HIGH_CONVICTION') {
        if (t.confidence < 0.8) return false;
      } else if (selectedFilter === 'DEBUG_TRACE') {
        if (t.isExecution) return false;
      } else if (selectedFilter.startsWith('CUSTOM_')) {
        const customId = selectedFilter.replace('CUSTOM_', '');
        const targetAgent = customAgents.find((c) => c.id === customId);
        const nameMatch = targetAgent?.name.toLowerCase() || '';
        if (
          t.agentType.toLowerCase() !== nameMatch &&
          !t.reasoningText.toLowerCase().includes(nameMatch)
        ) {
          return false;
        }
      } else if (selectedFilter !== 'ALL') {
        if (t.agentType.toLowerCase() !== selectedFilter.toLowerCase()) return false;
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesText = t.reasoningText.toLowerCase().includes(q);
        const matchesAgent = t.agentType.toLowerCase().includes(q);
        const matchesAction = t.actionTaken.toLowerCase().includes(q);
        const matchesMarket = (t.marketId || '').toLowerCase().includes(q);
        const matchesTx = (t.txHash || '').toLowerCase().includes(q);
        if (!matchesText && !matchesAgent && !matchesAction && !matchesMarket && !matchesTx) {
          return false;
        }
      }

      return true;
    });

    // Cleanly aggregate consecutive duplicate thoughts from the same agent into a single card
    const deduped: (AgentThoughtLog & { repeatCount?: number })[] = [];
    for (const t of rawFiltered) {
      if (
        deduped.length > 0 &&
        deduped[deduped.length - 1].agentType === t.agentType &&
        deduped[deduped.length - 1].reasoningText === t.reasoningText &&
        !t.txHash
      ) {
        deduped[deduped.length - 1].repeatCount = (deduped[deduped.length - 1].repeatCount || 1) + 1;
      } else {
        deduped.push({ ...t, repeatCount: 1 });
      }
    }
    return deduped;
  }, [activeSourceList, selectedFilter, searchQuery]);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFilter, searchQuery]);

  // Clamp current page when filtered thoughts length shrinks
  const totalPages = Math.max(1, Math.ceil(filteredThoughts.length / pageSize));
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Paginated slice
  const paginatedThoughts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredThoughts.slice(start, start + pageSize);
  }, [filteredThoughts, currentPage, pageSize]);

  const getAgentTheme = (agent: string) => {
    const cleanAgent = (agent || '').toLowerCase().trim();
    switch (cleanAgent) {
      case 'volt':
        return {
          color: '#ffb700',
          bg: 'rgba(255,183,0,0.07)',
          border: 'rgba(255,183,0,0.16)',
          glow: 'none',
          role: 'Sub-Second Expiry Sniper',
          Icon: BoltIcon,
        };
      case 'oracle':
        return {
          color: '#00ffcc',
          bg: 'rgba(45,212,191,0.07)',
          border: 'rgba(45,212,191,0.16)',
          glow: 'none',
          role: 'Vol Surface Arbitrage',
          Icon: CpuChipIcon,
        };
      case 'titan':
        return {
          color: '#7928ca',
          bg: 'rgba(167,139,250,0.07)',
          border: 'rgba(167,139,250,0.16)',
          glow: 'none',
          role: 'Two-Sided CLOB Maker',
          Icon: ShieldCheckIcon,
        };
      case 'sweeper':
        return {
          color: '#00e676',
          bg: 'rgba(0,230,118,0.07)',
          border: 'rgba(0,230,118,0.16)',
          glow: 'none',
          role: 'Settlement Sweeper',
          Icon: SparklesIcon,
        };
      default: {
        const match = customAgents.find(
          (c) => c.name.toLowerCase() === cleanAgent || c.id.toLowerCase() === cleanAgent
        );
        if (match) {
          return {
            color: match.color || ' #00ffcc',
            bg: `${match.color || ' #00ffcc'}12`,
            border: `${match.color || ' #00ffcc'}30`,
            glow: 'none',
            role: `Custom ${match.strategyType || 'Strategy'}`,
            Icon: SparklesIcon,
          };
        }
        return {
          color: 'hsl(var(--muted-foreground))',
          bg: 'hsl(var(--secondary) / 0.4)',
          border: 'hsl(var(--border) / 0.5)',
          glow: 'none',
          role: 'Autonomous Agent',
          Icon: CpuChipIcon,
        };
      }
    }
  };

  const getActionBadgeStyle = (action: string) => {
    if (action.includes('BUY_YES') || action.includes('TAKER_BUY')) {
      return { background: 'rgba(0,230,118,0.08)', color: '#00e676', border: '1px solid rgba(0,230,118,0.18)' };
    }
    if (action.includes('BUY_NO') || action.includes('TAKER_SELL')) {
      return { background: 'rgba(251,113,133,0.08)', color: '#ff3366', border: '1px solid rgba(251,113,133,0.18)' };
    }
    if (action.includes('LIMIT_QUOTE') || action.includes('QUOTE')) {
      return { background: 'rgba(96,165,250,0.08)', color: '#93c5fd', border: '1px solid rgba(96,165,250,0.18)' };
    }
    if (action.includes('SWEEP') || action.includes('CLAIM')) {
      return { background: 'rgba(167,139,250,0.08)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.18)' };
    }
    return { background: 'hsl(var(--secondary) / 0.4)', color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border) / 0.5)' };
  };

  const getRelativeTime = (isoString: string) => {
    const t = new Date(isoString).getTime();
    const diffSec = Math.max(0, Math.floor((nowTime - t) / 1000));
    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return new Date(isoString).toLocaleTimeString();
  };

  return (
    <div
      className="terminal-panel thought-feed-panel"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsHoverPauseSuppressed(false);
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: 0,
        overflow: 'hidden',
      }}
    >
      {/* 1. Header Toolbar — Minimal (aligns with Overview / Edge Radar) */}
      <div
        className="terminal-panel-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid hsl(var(--border) / 0.5)',
          background: 'transparent',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CommandLineIcon className="w-4 h-4 text-muted-foreground" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 className="text-xs font-semibold text-foreground tracking-wide m-0">
              AI SWARM REASONING FEED
            </h3>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-border/50 bg-secondary/40 text-[10px] font-mono font-medium text-muted-foreground">
              <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-[#ffb700]' : isConnected ? 'bg-[#00e676]' : 'bg-muted-foreground'}`} />
              <span>{isPaused ? (isPausedManual ? 'PAUSED' : 'HOVER PAUSED') : isConnected ? 'LIVE' : 'OFFLINE'}</span>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {onToggleDebug && (
            <button
              id="btn-toggle-thought-debug"
              type="button"
              onClick={() => onToggleDebug()}
              title={isDebugEnabled ? "Showing sub-second evaluation loops + trade reasoning" : "Filter to confirmed on-chain trade reasons only"}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-medium rounded-md border transition-colors ${isDebugEnabled ? 'bg-secondary text-foreground border-border' : 'bg-secondary/40 text-muted-foreground border-border/50 hover:text-foreground hover:bg-secondary/60'}`}
            >
              <CpuChipIcon className="w-3 h-3" />
              <span>{isDebugEnabled ? 'All Loops' : 'Executions Only'}</span>
            </button>
          )}

          <div className="relative flex items-center">
            <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 text-muted-foreground" />
            <input
              id="input-search-thoughts"
              type="text"
              placeholder="Filter thoughts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-secondary/30 border border-border/50 rounded-md pl-8 pr-7 py-1 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 outline-none w-[170px] focus:border-border focus:bg-secondary/50 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Clear search"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            id="btn-pause-thought-stream"
            type="button"
            onClick={() => {
              if (isPaused) {
                handleResume();
              } else {
                setIsPausedManual(true);
                setIsHoverPauseSuppressed(false);
              }
            }}
            title={isPaused ? 'Resume streaming' : 'Pause autoscroll to inspect'}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-medium rounded-md border transition-colors cursor-pointer ${isPaused ? 'bg-secondary text-foreground border-border' : 'bg-secondary/40 text-muted-foreground border-border/50 hover:text-foreground hover:bg-secondary/60'}`}
          >
            {isPaused ? <PlayIcon className="w-3 h-3" /> : <PauseIcon className="w-3 h-3" />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>
        </div>
      </div>

      {/* 2. Filter Navigation Bar — Minimal */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 16px',
          borderBottom: '1px solid hsl(var(--border) / 0.5)',
          background: 'transparent',
          overflowX: 'auto',
        }}
      >
        <FunnelIcon className="w-3.5 h-3.5 text-muted-foreground mr-1 flex-shrink-0" />
        {[
          { id: 'ALL', label: `Executions (${thoughts.length})`, Icon: BoltIcon },
          { id: 'HIGH_CONVICTION', label: 'High Conviction (≥80%)', Icon: FireIcon },
          ...(isDebugEnabled ? [{ id: 'DEBUG_TRACE', label: `Eval Traces (${debugThoughts.length})`, Icon: CpuChipIcon }] : []),
          { id: 'Volt', label: 'Volt (Sniper)', Icon: BoltIcon },
          { id: 'Oracle', label: 'Oracle (Arb)', Icon: CpuChipIcon },
          { id: 'Titan', label: 'Titan (MM)', Icon: ShieldCheckIcon },
          { id: 'Sweeper', label: 'Sweeper', Icon: SparklesIcon },
          ...customAgents.map((ca) => ({
            id: `CUSTOM_${ca.id}`,
            label: `Custom: ${ca.name}`,
            Icon: SparklesIcon,
            color: ca.color,
          })),
        ].map((tab: any) => {
          const TabIcon = tab.Icon;
          const isActive = selectedFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedFilter(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-mono font-medium rounded-full border whitespace-nowrap transition-colors cursor-pointer ${isActive ? 'bg-secondary text-foreground border-border' : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/40'}`}
              style={tab.color && isActive ? { borderColor: `${tab.color}60`, color: tab.color } : {}}
            >
              <TabIcon className="w-3 h-3" style={tab.color ? { color: tab.color } : {}} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Executive Swarm Consensus Digest Strip — Minimal */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '8px',
          padding: '12px 16px',
          background: 'transparent',
          borderBottom: '1px solid hsl(var(--border) / 0.5)',
        }}
      >
        {['VOLT', 'ORACLE', 'TITAN', 'SWEEPER'].map((agentKey) => {
          const theme = getAgentTheme(agentKey);
          const Icon = theme.Icon;
          const latestThought = latestByAgent.get(agentKey);

          return (
            <div
              key={agentKey}
              className="rounded-lg flex flex-col gap-1.5 p-3 relative overflow-hidden bg-secondary/20 border border-border/40"
            >
              <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: theme.color, opacity: 0.7 }} />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {agentKey}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {theme.role}
                </span>
              </div>
              <p className="m-0 text-[11px] leading-[1.4] text-muted-foreground line-clamp-2">
                {latestThought ? latestThought.reasoningText : 'Actively monitoring CLOB depth & risk invariants...'}
              </p>
            </div>
          );
        })}
      </div>

      {/* 4. Stream Feed List with Pause on Hover */}
      <div
        ref={containerRef}
        className="thought-stream-container"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setIsHoverPauseSuppressed(false);
        }}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          position: 'relative',
        }}
      >
        {/* Sticky Pause / Buffered Pill */}
        {isPaused && (
          <div className="sticky top-0 z-20 flex justify-center py-1 -mt-1 pointer-events-auto">
            <button
              id="btn-resume-stream-pill"
              type="button"
              onClick={handleResume}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-mono font-medium rounded-full border shadow-lg bg-secondary/95 text-foreground border-border hover:bg-secondary hover:border-border/80 transition-all cursor-pointer backdrop-blur-sm"
            >
              <PauseIcon className="w-3 h-3 text-[#ffb700]" />
              <span>
                Stream paused — {bufferedCount} new {bufferedCount === 1 ? 'thought' : 'thoughts'} buffered (Click to resume)
              </span>
              <PlayIcon className="w-3 h-3 text-muted-foreground ml-0.5" />
            </button>
          </div>
        )}
        {(isLoading || (!isConnected && thoughts.length === 0)) && filteredThoughts.length === 0 ? (
          <AgentThoughtFeedSkeleton />
        ) : filteredThoughts.length === 0 ? (
          <div className="py-12 px-6 text-center flex flex-col items-center gap-3 text-muted-foreground">
            <ChartBarIcon className="w-7 h-7 text-muted-foreground/40" />
            <div>
              <p className="font-semibold text-[13px] mb-1 text-foreground">
                {searchQuery
                  ? `No events match "${searchQuery}"`
                  : selectedFilter === 'DEBUG_TRACE'
                  ? 'Awaiting new evaluation cycles...'
                  : 'Awaiting high-conviction on-chain trade executions...'}
              </p>
              <p className="text-xs text-muted-foreground m-0">
                {searchQuery
                  ? 'Try clearing your search query or selecting a different filter tab.'
                  : selectedFilter === 'DEBUG_TRACE'
                  ? 'Evaluations are throttled to 30s intervals with quantitative edge filtering.'
                  : 'The swarm is continuously evaluating 12 Shannon CLOB markets. Trades will stream here upon verified on-chain execution.'}
              </p>
            </div>
          </div>
        ) : (
          paginatedThoughts.map((thought) => {
            const theme = getAgentTheme(thought.agentType);
            const Icon = theme.Icon;
            const actionStyle = getActionBadgeStyle(thought.actionTaken);
            const timeString = new Date(thought.createdAt).toLocaleTimeString();
            const relTime = getRelativeTime(thought.createdAt);
            const confidencePct = Math.round(thought.confidence * 100);
            const isExec = thought.isExecution || Boolean(thought.txHash);

            return (
              <div
                key={thought.id}
                className="rounded-lg bg-card/40 hover:bg-card/60 transition-colors p-3 flex flex-col gap-2"
                style={{
                  border: '1px solid hsl(var(--border) / 0.5)',
                  borderLeft: `2px solid ${theme.border}`,
                }}
              >
                {/* Header Row — Minimal with subtle agent accent */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-mono font-semibold"
                      style={{ background: theme.bg, borderColor: theme.border, color: theme.color }}
                    >
                      <Icon className="w-3 h-3" style={{ color: theme.color }} />
                      <span>{thought.agentType.toUpperCase()}</span>
                    </span>

                    {isExec ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-mono font-medium" style={{ background: 'rgba(0,230,118,0.08)', borderColor: 'rgba(0,230,118,0.18)', color: '#00e676' }}>
                        <CheckCircleIcon className="w-2.5 h-2.5" style={{ color: '#00e676' }} />
                        <span>EXECUTED</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/30 bg-secondary/20 text-[10px] font-mono text-muted-foreground">
                        <SignalIcon className="w-2.5 h-2.5" />
                        <span>EVAL</span>
                      </span>
                    )}

                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-mono font-medium"
                      style={actionStyle}
                    >
                      {thought.actionTaken}
                    </span>

                    {thought.price !== undefined && (
                      <span className="text-[10px] font-mono bg-secondary/30 border border-border/30 px-1.5 py-0.5 rounded-md text-muted-foreground">
                        @ {thought.price.toFixed(2)} {thought.outcome || ''}
                      </span>
                    )}

                    {thought.triggerEvent && (
                      <span className="text-[10px] font-mono text-muted-foreground bg-secondary/20 border border-border/30 px-1.5 py-0.5 rounded-md">
                        {thought.triggerEvent}
                      </span>
                    )}

                    {(thought as any).repeatCount > 1 && (
                      <span className="text-[10px] font-mono font-medium text-muted-foreground bg-secondary/30 border border-border/30 px-1.5 py-0.5 rounded-full">
                        {(thought as any).repeatCount}x
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {thought.txHash && thought.txHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
                      <a
                        href={`https://shannon-explorer.somnia.network/tx/${thought.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-mono border px-1.5 py-0.5 rounded-md transition-colors no-underline"
                        style={{ background: 'rgba(45,212,191,0.07)', borderColor: 'rgba(45,212,191,0.16)', color: '#5eead4' }}
                      >
                        <span>Tx: {thought.txHash.slice(0, 6)}...{thought.txHash.slice(-4)}</span>
                        <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5" />
                      </a>
                    )}

                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-mono border px-1.5 py-0.5 rounded-md"
                      style={
                        confidencePct >= 80
                          ? { background: 'rgba(0,230,118,0.07)', borderColor: 'rgba(0,230,118,0.16)', color: '#00e676' }
                          : { background: 'rgba(255,183,0,0.07)', borderColor: 'rgba(255,183,0,0.16)', color: '#fcd34d' }
                      }
                    >
                      <ArrowTrendingUpIcon className="w-3 h-3" style={{ color: confidencePct >= 80 ? '#00e676' : '#fcd34d' }} />
                      <span>{confidencePct}%</span>
                    </span>

                    <span className="text-[10px] font-mono text-muted-foreground/70">
                      {relTime} ({timeString})
                    </span>
                  </div>
                </div>

                <p className="m-0 text-xs leading-relaxed text-muted-foreground line-clamp-3">
                  {thought.reasoningText}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Bar */}
      {filteredThoughts.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={filteredThoughts.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[15, 25, 50, 100]}
          itemLabel="thoughts"
          isLoading={isLoading}
        />
      )}
    </div>
  );
};
