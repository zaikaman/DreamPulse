import React, { useState, useEffect } from 'react';
import { ListOrdered } from 'lucide-react';
import type { Market } from '../types/index.js';
import type { DepthUpdateData, MarketTickData } from '../hooks/useTelemetry.js';
import { apiClient } from '../services/api.js';

interface OrderBookDepthProps {
  selectedMarket: Market | null;
  liveDepth: DepthUpdateData | undefined;
  liveTick: MarketTickData | undefined;
}

export const OrderBookDepth: React.FC<OrderBookDepthProps> = ({
  selectedMarket,
  liveDepth,
  liveTick,
}) => {
  const [activeLeg, setActiveLeg] = useState<'YES' | 'NO'>('YES');
  const [depthData, setDepthData] = useState<{
    yesBids: Array<{ price: number; quantity: number; total: number }>;
    yesAsks: Array<{ price: number; quantity: number; total: number }>;
  }>({
    yesBids: [],
    yesAsks: [],
  });

  // Fetch initial depth via REST API when market selection changes
  useEffect(() => {
    if (!selectedMarket) return;

    let isMounted = true;
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
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [selectedMarket?.id]);

  if (!selectedMarket) {
    return (
      <div className="terminal-panel orderbook-panel">
        <div className="terminal-panel-header">
          <div className="panel-title">
            <ListOrdered size={16} />
            <span>CLOB Order Book Depth</span>
          </div>
        </div>
        <div className="orderbook-empty">Select a market to view live order book depth.</div>
      </div>
    );
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
        <span className="col-header text-left">PRICE (STT)</span>
        <span className="col-header text-right">SIZE (SHARES)</span>
        <span className="col-header text-right">TOTAL (STT)</span>
      </div>

      {/* ASKS (Sells) - Rendered Top-to-Bottom */}
      <div className="book-ladder asks-ladder">
        {asks
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
          })}
      </div>

      {/* SPREAD & MIDPOINT / FAIR VALUE BANNER */}
      <div className="book-spread-banner">
        <div className="spread-col">
          <span className="spread-label">SPREAD</span>
          <span className="spread-val tabular-num">{spread.toFixed(2)} STT</span>
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
        {bids.slice(0, 5).map((bid, idx) => {
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
        })}
      </div>
    </div>
  );
};
