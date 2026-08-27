import React, { useMemo } from 'react';
import {
  ChartBarIcon,
  BoltIcon,
  CurrencyDollarIcon,
  ScaleIcon,
} from '@heroicons/react/24/outline';
import type { Market, SessionGrant, AgentThoughtLog } from '../../types/index.js';
import type { MarketTickData, DepthUpdateData } from '../../hooks/useTelemetry.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import { MarketMatrix } from '../MarketMatrix.js';
import { OrderBookDepth } from '../OrderBookDepth.js';

interface MarketsDepthViewProps {
  markets: Market[];
  selectedMarket: Market | null;
  selectedMarketId: string | null;
  onSelectMarket: (marketId: string) => void;
  liveTicks: Map<string, MarketTickData>;
  depthMap: Map<string, DepthUpdateData>;
  currentSpotPrices: Record<string, number>;
  isLoading?: boolean;
  wallet?: WalletState;
  activeSession?: SessionGrant | null;
  agentThoughts?: AgentThoughtLog[];
  onOpenSessionModal?: () => void;
  onConnectWallet?: () => void;
}

const MarketsDepthViewComponent: React.FC<MarketsDepthViewProps> = ({
  markets,
  selectedMarket,
  selectedMarketId,
  onSelectMarket,
  liveTicks,
  depthMap,
  currentSpotPrices,
  isLoading = false,
  wallet,
  activeSession,
  agentThoughts,
  onOpenSessionModal,
  onConnectWallet,
}) => {
  // Compute top edge anomaly contract across open markets
  const topEdgeMarket = useMemo<{ market: Market | null; edge: number }>(() => {
    let topM: Market | null = null;
    let maxEdge = 0;
    markets.forEach((m) => {
      const tick = liveTicks.get(m.id);
      const edge = Math.abs(tick?.edge ?? m.edgePercentage);
      if (edge > maxEdge) {
        maxEdge = edge;
        topM = m;
      }
    });
    return { market: topM, edge: maxEdge };
  }, [markets, liveTicks]);

  // Compute average spread
  const avgSpread = useMemo(() => {
    if (markets.length === 0) return 0.02;
    const total = markets.reduce((sum, m) => {
      const spread = Math.max(0, m.bestAskYes - m.bestBidYes);
      return sum + spread;
    }, 0);
    return Number((total / markets.length).toFixed(2));
  }, [markets]);

  return (
    <div className="flex flex-col gap-3.5 min-h-0 flex-1 overflow-y-auto xl:overflow-hidden pb-4">
      {/* Top Telemetry KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
        {/* KPI 1: Active Contracts */}
        <div className="terminal-panel p-3 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">
            ACTIVE CONTRACTS
          </span>
          <span className="text-base font-mono font-bold text-foreground mt-0.5">
            {markets.length}
          </span>
          <ChartBarIcon className="w-4 h-4 text-muted-foreground/60 mt-1.5" />
        </div>

        {/* KPI 2: Top Alpha Mispricing */}
        <div className="terminal-panel p-3 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">
              TOP ALPHA MISPRICING
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-base font-mono font-bold text-emerald-400">
                +{((topEdgeMarket.edge || 0) * 100).toFixed(1)}%
              </span>
              {topEdgeMarket.market && (
                <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[90px]">
                  {topEdgeMarket.market.symbol}
                </span>
              )}
            </div>
          </div>
          <BoltIcon className="w-5 h-5 text-emerald-400/60" />
        </div>

        {/* KPI 3: CLOB Avg Spread */}
        <div className="terminal-panel p-3 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">
              AVG CLOB SPREAD
            </span>
            <span className="text-base font-mono font-bold text-foreground mt-0.5">
              ${avgSpread.toFixed(2)} USDC
            </span>
          </div>
          <ScaleIcon className="w-5 h-5 text-muted-foreground/60" />
        </div>

        {/* KPI 4: Underlyings Tracked */}
        <div className="terminal-panel p-3 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">
            UNDERLYING ASSETS
          </span>
          <span className="text-xs font-mono font-bold text-foreground mt-1">
            BTC • ETH • SOL • BNB • DOGE
          </span>
          <CurrencyDollarIcon className="w-4 h-4 text-muted-foreground/60 mt-1.5" />
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_1.35fr] gap-3.5 xl:h-full min-h-0 flex-1">
        {/* Left: Active Markets Catalog & Matrix */}
        <div className="flex-1 min-h-[480px] xl:min-h-0 xl:h-full flex flex-col overflow-hidden">
          <MarketMatrix
            markets={markets}
            selectedMarketId={selectedMarketId}
            onSelectMarket={onSelectMarket}
            liveTicks={liveTicks}
            currentSpotPrices={currentSpotPrices}
            isLoading={isLoading}
          />
        </div>

        {/* Right: Selected Market CLOB Depth Visualizer & Trader Cockpit */}
        <div className="flex-1 min-h-[480px] xl:min-h-0 xl:h-full flex flex-col overflow-hidden">
          <OrderBookDepth
            selectedMarket={selectedMarket}
            liveDepth={selectedMarketId ? depthMap.get(selectedMarketId) : undefined}
            liveTick={selectedMarketId ? liveTicks.get(selectedMarketId) : undefined}
            wallet={wallet}
            activeSession={activeSession}
            agentThoughts={agentThoughts}
            onOpenSessionModal={onOpenSessionModal}
            onConnectWallet={onConnectWallet}
          />
        </div>
      </div>
    </div>
  );
};

export const MarketsDepthView = React.memo(MarketsDepthViewComponent);
