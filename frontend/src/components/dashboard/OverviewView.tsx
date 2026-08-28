import React, { useMemo, useState, useEffect } from 'react';
import {
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import type { Market, AgentThoughtLog, SessionGrant } from '../../types/index.js';
import type { MarketTickData } from '../../hooks/useTelemetry.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import { useAgentSwarm } from '../../hooks/useAgentSwarm.js';
import { useUserPortfolio } from '../../hooks/useUserPortfolio.js';
import { usePersonalSwarm } from '../../hooks/usePersonalSwarm.js';
import { useCustomAgents } from '../../hooks/useCustomAgents.js';
import { useOnboarding } from '../../hooks/useOnboarding.js';
import { StatCardsGrid } from './StatCardsGrid.js';
import { SessionStatusBar } from '../SessionStatusBar.js';
import { OnboardingQuestBar } from './OnboardingQuestBar.js';
import { OpportunityTableSkeleton, Skeleton } from '../ui/Skeleton.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { cn } from '../../lib/utils.js';

interface OverviewViewProps {
  markets: Market[];
  liveTicks: Map<string, MarketTickData>;
  latencyMs: number;
  agentThoughts: AgentThoughtLog[];
  selectedMarketId: string | null;
  onSelectMarket: (marketId: string) => void;
  onNavigateToTab: (tab: string) => void;
  wallet?: WalletState;
  activeSession?: SessionGrant | null;
  isLoading?: boolean;
  isFauceting?: boolean;
  onClaimFaucet?: (amount?: number) => Promise<void>;
  onOpenSessionModal?: (options?: { revoke?: boolean }) => void;
  onConnectWallet?: () => Promise<void>;
  onSwitchNetwork?: () => Promise<void>;
  onOpenTour?: () => void;
}

const OverviewViewComponent: React.FC<OverviewViewProps> = ({
  markets,
  liveTicks,
  latencyMs,
  agentThoughts,
  selectedMarketId,
  onSelectMarket,
  onNavigateToTab,
  wallet,
  activeSession,
  isLoading = false,
  isFauceting,
  onClaimFaucet,
  onOpenSessionModal,
  onConnectWallet,
  onSwitchNetwork,
  onOpenTour,
}) => {
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [nowTime, setNowTime] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Top 4 alpha opportunities (compact) 
  const opportunities = markets
    .map((m) => {
      const isSyntheticOrSeed = Boolean(m.isSynthetic || m.isSeedDepth);
      const tick = liveTicks.get(m.id);
      const edge = isSyntheticOrSeed ? 0 : (tick?.edge ?? m.edgePercentage);
      const implied = tick?.impliedProb ?? m.impliedProbYes;
      const fair = tick?.fairValue ?? m.fairValueYes;
      return {
        market: m,
        absEdge: Math.abs(edge),
        edge,
        implied,
        fair,
        action: !isSyntheticOrSeed && edge > 0.01 ? 'BUY_YES' : !isSyntheticOrSeed && edge < -0.01 ? 'BUY_NO' : 'NEUTRAL',
        isSyntheticOrSeed,
      };
    })
    .sort((a, b) => b.absEdge - a.absEdge)
    .slice(0, 4);

  // Distinct thoughts across the 4 agents to prevent repetitive single-agent spam
  const distinctThoughts = useMemo(() => {
    const map = new Map<string, AgentThoughtLog>();
    for (const t of agentThoughts) {
      if (!map.has(t.agentType)) {
        map.set(t.agentType, t);
      }
      if (map.size >= 4) break;
    }
    // If fewer than 4 unique agents, backfill with most recent unique thoughts
    const list = Array.from(map.values());
    if (list.length < 4) {
      for (const t of agentThoughts) {
        if (!list.some((existing) => existing.id === t.id)) {
          list.push(t);
        }
        if (list.length >= 4) break;
      }
    }
    return list;
  }, [agentThoughts]);

  const { detailed: swarmDetailed, summary: swarmSummary, orders } = useAgentSwarm();
  const { portfolio } = useUserPortfolio(wallet);
  const { isCopyTradeEnabled, toggleCopyTrade } = usePersonalSwarm(wallet?.address || undefined);
  const { agents: customAgents } = useCustomAgents(wallet?.address || undefined);
  const deployedCustomCount = useMemo(() => customAgents.filter((a) => a.isDeployed).length, [customAgents]);

  const {
    quests,
    completedQuestsCount,
    totalQuestsCount,
    progressPercent,
    allQuestsCompleted,
    isQuestBarDismissed,
    openOnboarding,
    dismissQuestBar,
  } = useOnboarding({ wallet, activeSession, ordersCount: orders.length });

  return (
    <div className="overview-container flex flex-col gap-2.5 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden pb-4">
      {/* Onboarding & Quick-Start Quest Checklist */}
      <OnboardingQuestBar
        quests={quests}
        completedCount={completedQuestsCount}
        totalCount={totalQuestsCount}
        progressPercent={progressPercent}
        allCompleted={allQuestsCompleted}
        isDismissed={isQuestBarDismissed}
        isFauceting={isFauceting}
        wallet={wallet}
        onClaimFaucet={onClaimFaucet}
        onOpenSessionModal={onOpenSessionModal}
        onNavigateTab={(tab) => onNavigateToTab(tab)}
        onOpenTour={onOpenTour || openOnboarding}
        onDismiss={dismissQuestBar}
      />

      {/* Non-Custodial Session Delegation Status Banner */}
      {wallet && onOpenSessionModal && onConnectWallet && onSwitchNetwork && (
        <SessionStatusBar
          wallet={wallet}
          activeSession={activeSession || null}
          isFauceting={isFauceting}
          onClaimFaucet={onClaimFaucet}
          onOpenModal={onOpenSessionModal}
          onConnectWallet={onConnectWallet}
          onSwitchNetwork={onSwitchNetwork}
          isCopyTradeEnabled={isCopyTradeEnabled}
          onToggleCopyTrade={toggleCopyTrade}
          deployedCustomCount={deployedCustomCount}
        />
      )}

      {/* 1. Top KPI Stat Metrics */}
      <StatCardsGrid
        markets={markets}
        liveTicks={liveTicks}
        latencyMs={latencyMs}
        swarmDetailed={swarmDetailed}
        swarmSummary={swarmSummary}
        ordersCount={orders.length}
        wallet={wallet}
        activeSession={activeSession}
        portfolio={portfolio}
        isLoading={isLoading}
        isFauceting={isFauceting}
        onClaimFaucet={onClaimFaucet}
        onOpenSessionModal={onOpenSessionModal}
        onNavigateToTab={onNavigateToTab}
      />

      {/* 2. Primary Focal Point: Top Arbitrage Opportunities - compact 4 rows */}
      <div className="terminal-panel flex-shrink-0" style={{ padding: '0', overflow: 'hidden' }}>
        <div
          className="terminal-panel-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}> <span style={{ fontWeight: 600, fontSize: '13px' }} className="text-foreground">Top Arbitrage & Mispricing Opportunities</span>
            <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/40 border-border/50">
              {opportunities.filter((o) => o.absEdge >= 0.03).length} ANOMALIES
            </Badge>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 font-normal text-muted-foreground hover:text-foreground"
            onClick={() => onNavigateToTab('Edge Radar')}
          >
            <span>Open Full Radar</span>
            <ArrowRightIcon className="w-3 h-3" />
          </Button>
        </div>

        {/* High-Signal Clean Opportunity Table */}
        {isLoading && opportunities.length === 0 ? (
          <OpportunityTableSkeleton rows={5} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground text-[10px] font-mono uppercase tracking-wider" style={{ background: 'transparent', textAlign: 'left' }}>
                  <th style={{ padding: '9px 18px', fontWeight: 500 }}>ASSET & STRIKE</th>
                  <th style={{ padding: '9px 14px', fontWeight: 500 }}>EXPIRY</th>
                  <th style={{ padding: '9px 14px', fontWeight: 500 }}>IMPLIED PROB</th>
                  <th style={{ padding: '9px 14px', fontWeight: 500 }}>FAIR VALUE Φ(z)</th>
                  <th style={{ padding: '9px 14px', fontWeight: 500 }}>EDGE DELTA</th>
                  <th style={{ padding: '9px 14px', fontWeight: 500 }}>ACTION</th>
                  <th style={{ padding: '9px 18px', textAlign: 'right', fontWeight: 500 }}>INSPECT</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '32px', textAlign: 'center' }} className="text-muted-foreground font-mono text-xs">
                      Scanning Somnia Event Contracts for pricing anomalies...
                    </td>
                  </tr>
                ) : (
                  opportunities.map(({ market, edge, implied, fair, action }) => {
                    const isSelected = selectedMarketId === market.id;
                    const isYesEdge = edge > 0;
                    return (
                      <tr
                        key={market.id}
                        className="border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer"
                        style={{
                          background: isSelected ? 'hsl(var(--secondary) / 0.5)' : 'transparent',
                        }}
                        onClick={() => onSelectMarket(market.id)}
                      >
                        <td style={{ padding: '10px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600 }} className="text-foreground">{market.symbol}</span>
                            <span className="font-mono text-muted-foreground text-xs">
                              ${market.strikePrice.toLocaleString()}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 text-muted-foreground">
                            {market.windowDuration}
                          </Badge>
                        </td>
                        <td style={{ padding: '10px 14px' }} className="font-mono text-muted-foreground">
                          {(implied * 100).toFixed(1)}%
                        </td>
                        <td style={{ padding: '10px 14px' }} className="font-mono font-medium text-foreground">
                          {(fair * 100).toFixed(1)}%
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span className={cn("font-mono font-semibold", isYesEdge ? "text-[#00e676]" : "text-[#ff3366]")}>
                            {isYesEdge ? '+' : ''}{(edge * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-mono text-[10px]",
                              action === 'BUY_YES'
                                ? "border-[#00e676]/30 text-[#00e676] bg-[#00e676]/10"
                                : action === 'BUY_NO'
                                ? "border-[#ff3366]/30 text-[#ff3366] bg-[#ff3366]/10"
                                : "border-border/50 text-muted-foreground bg-secondary/40"
                            )}
                          >
                            {action === 'BUY_YES' ? 'BUY YES' : action === 'BUY_NO' ? 'BUY NO' : 'NEUTRAL'}
                          </Badge>
                        </td>
                        <td style={{ padding: '10px 18px', textAlign: 'right' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-muted-foreground hover:text-foreground gap-1 font-normal"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectMarket(market.id);
                              onNavigateToTab('Markets & Depth');
                            }}
                          >
                            <span>Inspect</span>
                            <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Secondary Split: compact, fills remainder, inline scroll */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-2.5 overflow-hidden">
        {/* Left: Quick Active Markets - 3 items, internal scroll */}
        <div className="terminal-panel flex flex-col min-h-0 overflow-hidden" style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}> <span style={{ fontWeight: 600, fontSize: '13px' }} className="text-foreground">Active Prediction Catalog</span>
              <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/40 border-border/50">
                {markets.length} Markets
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 font-normal text-muted-foreground hover:text-foreground"
              onClick={() => onNavigateToTab('Markets & Depth')}
            >
              <span>View Full CLOB</span>
              <ArrowRightIcon className="w-3 h-3" />
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {isLoading && markets.length === 0 ? (
              [1, 2, 3].map((i) => (
                <div
                  key={`quick-skel-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'hsl(var(--card) / 0.4)',
                    border: '1px solid hsl(var(--border) / 0.5)',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Skeleton variant="text" width={60} height={14} />
                    <Skeleton variant="text" width={50} height={12} />
                    <Skeleton variant="badge" width={32} height={16} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <Skeleton variant="text" width={48} height={11} />
                      <Skeleton variant="text" width={48} height={10} />
                    </div>
                    <Skeleton variant="rectangular" width={55} height={24} borderRadius={4} />
                  </div>
                </div>
              ))
            ) : (
              markets.slice(0, 3).map((m) => {
                const tick = liveTicks.get(m.id);
                const implied = tick?.impliedProb ?? m.impliedProbYes;
                const isSelected = selectedMarketId === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => onSelectMarket(m.id)}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer",
                      isSelected
                        ? "border-border bg-secondary/60"
                        : "border-border/50 bg-card/40 hover:bg-card/80 hover:border-border/70"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-foreground">{m.symbol}</span>
                      <span className="font-mono text-xs text-muted-foreground">${m.strikePrice.toLocaleString()}</span>
                      <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 text-muted-foreground">
                        {m.windowDuration}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-end text-xs font-mono">
                        <span className="text-foreground font-medium">YES: {(implied * 100).toFixed(0)}%</span>
                        <span className="text-muted-foreground text-[10px]">NO: {((1 - implied) * 100).toFixed(0)}%</span>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs px-2 gap-1 font-normal text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMarket(m.id);
                          onNavigateToTab('Markets & Depth');
                        }}
                      >
                        <span>Trade</span>
                        <ArrowRightIcon className="w-2.5 h-2.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Live AI Reasoning Snapshot - 3 items, internal scroll */}
        <div
          className="terminal-panel flex flex-col min-h-0 overflow-hidden"
          style={{ padding: '12px 14px' }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}> <span style={{ fontWeight: 600, fontSize: '13px' }} className="text-foreground">Live Swarm Intelligence</span>
              <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground bg-secondary/40 border-border/50 gap-1.5">
                <div className={cn("w-1.5 h-1.5 rounded-full", isHovered ? "bg-[#ffb700]" : "bg-[#00e676]")} />
                <span>{isHovered ? 'PAUSED' : 'STREAMING'}</span>
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 font-normal text-muted-foreground hover:text-foreground"
              onClick={() => onNavigateToTab('AI Swarm Feed')}
            >
              <span>Full Stream</span>
              <ArrowRightIcon className="w-3 h-3" />
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {distinctThoughts.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center' }} className="text-muted-foreground font-mono text-xs">
                Swarm actively evaluating Shannon CLOB markets. Executed trades will appear here.
              </div>
            ) : (
              distinctThoughts.slice(0, 3).map((t, idx) => {
                const timeDiff = Math.max(0, Math.floor((nowTime - new Date(t.createdAt).getTime()) / 1000));
                const relTime = timeDiff < 5 ? 'Just now' : `${timeDiff}s ago`;

                return (
                  <div
                    key={t.id || idx}
                    className="p-2.5 rounded-lg border border-border/50 bg-card/40 hover:border-border/70 transition-colors flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="font-mono text-[10px] gap-1 text-foreground border-border/60 bg-secondary/50 font-semibold">
                          <span>{t.agentType.toUpperCase()}</span>
                        </Badge>
                        <Badge variant="secondary" className="text-[9px] font-mono text-muted-foreground px-1.5 py-0">
                          {t.actionTaken || t.triggerEvent}
                        </Badge>
                        {t.txHash && (
                          <a
                            href={`https://shannon-explorer.somnia.network/tx/${t.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[9px] font-mono text-muted-foreground hover:text-foreground underline decoration-border/60"
                          >
                            Tx: {t.txHash.slice(0, 6)}...
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {(t.confidence * 100).toFixed(0)}% Conf
                        </span>
                        <span className="text-[9px] font-mono text-muted-foreground/70">
                          {relTime}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed m-0">
                      {t.reasoningText}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const OverviewView = React.memo(OverviewViewComponent);
