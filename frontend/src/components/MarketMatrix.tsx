import React, { useState } from 'react';
import {
  Layers,
  Search,
  X,
  Clock,
  TrendingUp,
  TrendingDown,
  Radio,
} from 'lucide-react';
import type { Market } from '../types/index.js';
import type { MarketTickData } from '../hooks/useTelemetry.js';
import { MarketCardSkeleton } from './ui/Skeleton.js';

interface MarketMatrixProps {
  markets: Market[];
  selectedMarketId: string | null;
  onSelectMarket: (marketId: string) => void;
  liveTicks: Map<string, MarketTickData>;
  currentSpotPrices: Record<string, number>;
  isLoading?: boolean;
}

export const MarketMatrix: React.FC<MarketMatrixProps> = ({
  markets,
  selectedMarketId,
  onSelectMarket,
  liveTicks,
  currentSpotPrices,
  isLoading = false,
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('ALL');
  const [selectedWindow, setSelectedWindow] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Filter only active live markets with positive remaining time
  const filteredMarkets = markets.filter((m) => {
    const tick = liveTicks.get(m.id);
    const timeLeft = tick?.timeLeftSeconds ?? Math.max(0, Math.floor((new Date(m.closeTimestamp).getTime() - Date.now()) / 1000));
    
    // Only live open markets
    if (m.status !== 'Open' && timeLeft <= 0) return false;

    if (selectedSymbol !== 'ALL' && m.symbol !== selectedSymbol) return false;
    if (selectedWindow !== 'ALL' && m.windowDuration !== selectedWindow) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        m.symbol.toLowerCase().includes(q) ||
        m.strikePrice.toString().includes(q) ||
        m.windowDuration.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="terminal-panel market-matrix-panel">
      {/* Header & Controls */}
      <div className="terminal-panel-header">
        <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={16} />
          <span>Active Prediction Markets</span>
          <span className="badge badge-cyan" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Radio size={10} className="animate-pulse" />
            <span>{filteredMarkets.length} LIVE</span>
          </span>
        </div>

        {/* Filters */}
        <div className="matrix-filters">
          <div className="search-box-wrapper">
            <Search size={13} />
            <input
              type="text"
              placeholder="Search strike / symbol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="matrix-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="filter-pill-group">
            {['ALL', 'BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'DOGE/USD'].map((sym) => (
              <button
                key={sym}
                type="button"
                className={`filter-btn ${selectedSymbol === sym ? 'active' : ''}`}
                onClick={() => setSelectedSymbol(sym)}
              >
                {sym}
              </button>
            ))}
          </div>

          <div className="filter-pill-group">
            {['ALL', '5m', '15m', '1h', '4h', '24h'].map((win) => (
              <button
                key={win}
                type="button"
                className={`filter-btn ${selectedWindow === win ? 'active' : ''}`}
                onClick={() => setSelectedWindow(win)}
              >
                {win}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Markets Grid */}
      <div className="matrix-grid">
        {isLoading && markets.length === 0 ? (
          [1, 2, 3, 4, 5, 6].map((i) => <MarketCardSkeleton key={`market-skel-${i}`} />)
        ) : filteredMarkets.length === 0 ? (
          <div className="matrix-empty-state" style={{ padding: '36px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', margin: 0 }}>
              No active prediction contracts matching selected filters.
            </p>
            {(selectedSymbol !== 'ALL' || selectedWindow !== 'ALL' || searchQuery) && (
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '4px 12px' }}
                onClick={() => {
                  setSelectedSymbol('ALL');
                  setSelectedWindow('ALL');
                  setSearchQuery('');
                }}
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          filteredMarkets.map((market) => {
            const tick = liveTicks.get(market.id);
            const isSelected = market.id === selectedMarketId;

            const spot = currentSpotPrices[market.symbol] || tick?.spotPrice || market.strikePrice;
            const fairValue = tick?.fairValue ?? market.fairValueYes;
            const impliedProb = tick?.impliedProb ?? market.impliedProbYes;
            const edge = tick?.edge ?? market.edgePercentage;
            const timeLeft = tick?.timeLeftSeconds ?? Math.max(0, Math.floor((new Date(market.closeTimestamp).getTime() - Date.now()) / 1000));
            const hasAnomaly = tick?.hasAnomaly ?? Math.abs(edge) >= 0.03;

            const strikeDelta = spot - market.strikePrice;
            const strikeDeltaPct = market.strikePrice > 0 ? (strikeDelta / market.strikePrice) * 100 : 0;

            const isExpiringSoon = timeLeft < 60 && timeLeft > 0;
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            const formattedTime = timeLeft > 0
              ? `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
              : '00:00';

            return (
              <div
                key={market.id}
                className={`matrix-card ${isSelected ? 'selected' : ''} ${hasAnomaly ? 'anomaly-pulse' : ''}`}
                onClick={() => onSelectMarket(market.id)}
              >
                {/* Card Top Row */}
                <div className="card-top">
                  <div className="card-symbol-badge">
                    <span className="sym-name">{market.symbol}</span>
                    <span className="window-tag">{market.windowDuration}</span>
                  </div>

                  <div className={`countdown-badge ${isExpiringSoon ? 'expiring-urgent' : ''}`}>
                    <Clock size={11} />
                    <span className="tabular-num">{timeLeft > 0 ? formattedTime : 'RESOLVING...'}</span>
                  </div>
                </div>

                {/* Strike vs Spot */}
                <div className="strike-spot-row">
                  <div className="strike-col">
                    <span className="col-label">STRIKE</span>
                    <span className="strike-val tabular-num">${market.strikePrice.toLocaleString()}</span>
                  </div>

                  <div className="delta-col">
                    <span className="col-label">SPOT DELTA</span>
                    <span className={`delta-val tabular-num ${strikeDelta >= 0 ? 'text-yes' : 'text-no'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      {strikeDelta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      <span>${Math.abs(strikeDelta).toFixed(1)} ({strikeDeltaPct >= 0 ? '+' : ''}{strikeDeltaPct.toFixed(2)}%)</span>
                    </span>
                  </div>
                </div>

                {/* Probabilities Comparison Bar */}
                <div className="prob-container">
                  <div className="prob-meta-row">
                    <div className="prob-item">
                      <span className="prob-label">IMPLIED</span>
                      <span className="prob-val tabular-num">{(impliedProb * 100).toFixed(1)}%</span>
                    </div>

                    <div className="prob-edge-badge">
                      {edge !== 0 && (
                        <span className={`edge-badge-pill ${edge > 0 ? 'edge-positive' : 'edge-negative'}`}>
                          {edge > 0 ? `+${(edge * 100).toFixed(1)}% YES EDGE` : `${(Math.abs(edge) * 100).toFixed(1)}% NO EDGE`}
                        </span>
                      )}
                    </div>

                    <div className="prob-item text-right">
                      <span className="prob-label">FAIR Φ(z)</span>
                      <span className="prob-val tabular-num text-cyan">{(fairValue * 100).toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* Dual Probability Visual Gauge */}
                  <div className="gauge-track">
                    <div
                      className="gauge-bar-implied"
                      style={{ width: `${Math.min(100, Math.max(0, impliedProb * 100))}%` }}
                    ></div>
                    <div
                      className="gauge-pin-fair"
                      style={{ left: `${Math.min(98, Math.max(2, fairValue * 100))}%` }}
                      title={`Theoretical Fair Value: ${(fairValue * 100).toFixed(1)}%`}
                    ></div>
                  </div>
                </div>

                {/* Order Book Quick Quotes */}
                <div className="card-quotes-footer">
                  <div className="quote-cell bid-cell">
                    <span className="q-tag">YES BID</span>
                    <span className="q-price tabular-num">{market.bestBidYes.toFixed(2)}</span>
                  </div>
                  <div className="quote-cell ask-cell">
                    <span className="q-tag">YES ASK</span>
                    <span className="q-price tabular-num">{market.bestAskYes.toFixed(2)}</span>
                  </div>
                  <button
                    type="button"
                    className="inspect-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectMarket(market.id);
                    }}
                  >
                    {isSelected ? 'ACTIVE' : 'INSPECT'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
