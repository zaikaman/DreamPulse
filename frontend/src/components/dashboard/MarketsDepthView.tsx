import React from 'react';
import type { Market } from '../../types/index.js';
import type { MarketTickData, DepthUpdateData } from '../../hooks/useTelemetry.js';
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
}

export const MarketsDepthView: React.FC<MarketsDepthViewProps> = ({
  markets,
  selectedMarket,
  selectedMarketId,
  onSelectMarket,
  liveTicks,
  depthMap,
  currentSpotPrices,
  isLoading = false,
}) => {
  return (
    <div className="full-height-grid-view" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
      {/* Left: Active Markets Catalog & Search (Fills 100% height) */}
      <div style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <MarketMatrix
          markets={markets}
          selectedMarketId={selectedMarketId}
          onSelectMarket={onSelectMarket}
          liveTicks={liveTicks}
          currentSpotPrices={currentSpotPrices}
          isLoading={isLoading}
        />
      </div>

      {/* Right: Selected Market CLOB Depth Visualizer (Fills 100% height) */}
      <div style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <OrderBookDepth
          selectedMarket={selectedMarket}
          liveDepth={selectedMarketId ? depthMap.get(selectedMarketId) : undefined}
          liveTick={selectedMarketId ? liveTicks.get(selectedMarketId) : undefined}
        />
      </div>
    </div>
  );
};
