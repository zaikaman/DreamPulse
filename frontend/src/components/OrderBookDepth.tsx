import React, { useState, useEffect } from 'react';
import { ListOrdered } from 'lucide-react';
import type { Market } from '../types/index.js';
import type { DepthUpdateData, MarketTickData } from '../hooks/useTelemetry.js';
import { apiClient } from '../services/api.js';
import { OrderBookDepthSkeleton, Skeleton } from './ui/Skeleton.js';

interface OrderBookDepthProps {
  selectedMarket: Market | null;
  liveDepth: DepthUpdateData | undefined;
  liveTick: MarketTickData | undefined;
  isLoading?: boolean;
}

export const OrderBookDepth: React.FC<OrderBookDepthProps> = ({
  selectedMarket,
  liveDepth,
  liveTick,
  isLoading = false,
}) => {
  const [activeLeg, setActiveLeg] = useState<'YES' | 'NO'>('YES');
  const [isFetchingDepth, setIsFetchingDepth] = useState<boolean>(true);
  const [depthData, setDepthData] = useState<{
    yesBids: Array<{ price: number; quantity: number; total: number }>;
    yesAsks: Array<{ price: number; quantity: number; total: number }>;
  }>({
    yesBids: [],
    yesAsks: [],
  });

  // Fetch initial depth via REST API when market selection changes
  useEffect(() => {
    if (!selectedMarket) {
      setIsFetchingDepth(false);
      return;
    }

    let isMounted = true;
    setIsFetchingDepth(true);
    apiClient
      .getMarketDepth(selectedMarket.id)
      .then((res) => {
        if (isMounted && res.success && res.depth) {
          setDepthData({
            yesBids: res.depth.yesBids || [],
            yesAsks: res.depth.yesAsks || [],
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsFetchingDepth(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedMarket?.id]);

  if (!selectedMarket || isLoading) {
    return <OrderBookDepthSkeleton />;
  }

  // Use live WebSocket depth if available, otherwise fall back to REST depth
  const bids = liveDepth?.bids.length
    ? liveDepth.bids.map(([price, quantity], idx, arr) => {
        const total = arr.slice(0, idx + 1).reduce((sum, [p, q]) => sum + p * q, 0);
        return { price, quantity, total: Number(total.toFixed(2)) };
      })
    : depthData.yesBids;

  const asks = liveDepth?.asks.length
    ? liveDepth.asks.map(([price, quantity], idx, arr) => {
        const total = arr.slice(0, idx + 1).reduce((sum, [p, q]) => sum + p * q, 0);
        return { price, quantity, total: Number(total.toFixed(2)) };
      })
    : depthData.yesAsks;

  const bestBid = liveDepth?.bestBid ?? selectedMarket.bestBidYes;
  const bestAsk = liveDepth?.bestAsk ?? selectedMarket.bestAskYes;
  const spread = Number(Math.max(0, bestAsk - bestBid).toFixed(2));
  const midPrice = Number(((bestBid + bestAsk) / 2).toFixed(4));
  const fairValue = liveTick?.fairValue ?? selectedMarket.fairValueYes;

  // Calculate maximum cumulative total for depth visualization bar percentages
  const maxTotal = Math.max(
    ...bids.map((b) => b.total),
    ...asks.map((a) => a.total),
    100,
  );

  return (
    <div className="terminal-panel orderbook-panel">
      <div className="terminal-panel-header">
        <div className="panel-title">
          <ListOrdered size={16} />
          <span>CLOB Depth: {selectedMarket.symbol}</span>
          <span className="badge badge-cyan">{selectedMarket.windowDuration}</span>
        </div>

        {/* Leg Toggle */}
        <div className="orderbook-leg-toggle">
          <button
            type="button"
            className={`leg-btn ${activeLeg === 'YES' ? 'active-yes' : ''}`}
            onClick={() => setActiveLeg('YES')}
          >
            YES TOKEN
          </button>
          <button
            type="button"
            className={`leg-btn ${activeLeg === 'NO' ? 'active-no' : ''}`}
            onClick={() => setActiveLeg('NO')}
          >
            NO TOKEN
          </button>
        </div>
      </div>

      {/* Book Table Headers */}
      <div className="book-table-header">
        <span className="col-header text-left">PRICE (USDC)</span>
        <span className="col-header text-right">SIZE (SHARES)</span>
        <span className="col-header text-right">TOTAL (USDC)</span>
      </div>

      {/* ASKS (Sells) - Rendered Top-to-Bottom */}
      <div className="book-ladder asks-ladder">
        {asks.length === 0 && isFetchingDepth ? (
          [1, 2, 3, 4, 5].map((i) => (
            <div key={`ask-row-skel-${i}`} className="book-row ask-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px' }}>
              <Skeleton variant="text" width={45} height={12} />
              <Skeleton variant="text" width={55} height={12} />
              <Skeleton variant="text" width={45} height={12} />
            </div>
          ))
        ) : (
          asks
            .slice(0, 5)
            .reverse()
            .map((ask, idx) => {
              const displayPrice = activeLeg === 'YES' ? ask.price : Number((1.0 - ask.price).toFixed(2));
              const barWidth = Math.min(100, Math.max(8, (ask.total / maxTotal) * 100));

              return (
                <div key={`ask-${idx}`} className="book-row ask-row">
                  <div
                    className="depth-bar ask-depth-bar"
                    style={{ width: `${barWidth}%` }}
                  ></div>
                  <span className="row-cell price-cell text-no tabular-num">
                    {displayPrice.toFixed(2)}
                  </span>
                  <span className="row-cell size-cell tabular-num">
                    {ask.quantity.toLocaleString()}
                  </span>
                  <span className="row-cell total-cell tabular-num text-muted">
                    ${ask.total.toFixed(1)}
                  </span>
                </div>
              );
            })
        )}
      </div>

      {/* SPREAD & MIDPOINT / FAIR VALUE BANNER */}
      <div className="book-spread-banner">
        <div className="spread-col">
          <span className="spread-label">SPREAD</span>
          <span className="spread-val tabular-num">{spread.toFixed(2)} USDC</span>
        </div>

        <div className="midpoint-col">
          <span className="spread-label">MID PROB</span>
          <span className="mid-val tabular-num">{(midPrice * 100).toFixed(1)}%</span>
        </div>

        <div className="fair-col">
          <span className="spread-label">Φ(z) FAIR</span>
          <span className="fair-val tabular-num text-cyan">{(fairValue * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* BIDS (Buys) - Rendered Top-to-Bottom */}
      <div className="book-ladder bids-ladder">
        {bids.length === 0 && isFetchingDepth ? (
          [1, 2, 3, 4, 5].map((i) => (
            <div key={`bid-row-skel-${i}`} className="book-row bid-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px' }}>
              <Skeleton variant="text" width={45} height={12} />
              <Skeleton variant="text" width={55} height={12} />
              <Skeleton variant="text" width={45} height={12} />
            </div>
          ))
        ) : (
          bids.slice(0, 5).map((bid, idx) => {
            const displayPrice = activeLeg === 'YES' ? bid.price : Number((1.0 - bid.price).toFixed(2));
            const barWidth = Math.min(100, Math.max(8, (bid.total / maxTotal) * 100));

            return (
              <div key={`bid-${idx}`} className="book-row bid-row">
                <div
                  className="depth-bar bid-depth-bar"
                  style={{ width: `${barWidth}%` }}
                ></div>
                <span className="row-cell price-cell text-yes tabular-num">
                  {displayPrice.toFixed(2)}
                </span>
                <span className="row-cell size-cell tabular-num">
                  {bid.quantity.toLocaleString()}
                </span>
                <span className="row-cell total-cell tabular-num text-muted">
                  ${bid.total.toFixed(1)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
