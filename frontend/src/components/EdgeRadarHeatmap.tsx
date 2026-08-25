import React, { useState } from 'react';
import { Crosshair, Zap, Coins } from 'lucide-react';
import type { Market } from '../types/index.js';
import type { MarketTickData } from '../hooks/useTelemetry.js';

interface EdgeRadarHeatmapProps {
  markets: Market[];
  selectedMarketId: string | null;
  onSelectMarket: (marketId: string) => void;
  liveTicks: Map<string, MarketTickData>;
}

export const EdgeRadarHeatmap: React.FC<EdgeRadarHeatmapProps> = ({
  markets,
  selectedMarketId,
  onSelectMarket,
  liveTicks,
}) => {
  const [hoveredMarketId, setHoveredMarketId] = useState<string | null>(null);

  const symbols = ['BTC/USD', 'ETH/USD'];
  const windows: Array<'5m' | '15m' | '1h'> = ['5m', '15m', '1h'];

  const getHeatmapColor = (edgePct: number) => {
    if (Math.abs(edgePct) < 0.01) {
      return {
        bg: 'rgba(255, 255, 255, 0.03)',
        border: 'rgba(255, 255, 255, 0.08)',
        glow: 'none',
        textColor: 'var(--text-muted)',
      };
    }

    if (edgePct > 0) {
      // YES Underpriced (positive edge) -> Emerald
      const intensity = Math.min(1, edgePct / 0.15);
      return {
        bg: `rgba(0, 230, 118, ${0.12 + intensity * 0.28})`,
        border: `rgba(0, 230, 118, ${0.35 + intensity * 0.45})`,
        glow: `0 0 16px rgba(0, 230, 118, ${0.25 + intensity * 0.35})`,
        textColor: '#00e676',
      };
    } else {
      // NO Underpriced (negative edge) -> Ruby / Magenta
      const intensity = Math.min(1, Math.abs(edgePct) / 0.15);
      return {
        bg: `rgba(255, 51, 102, ${0.12 + intensity * 0.28})`,
        border: `rgba(255, 51, 102, ${0.35 + intensity * 0.45})`,
        glow: `0 0 16px rgba(255, 51, 102, ${0.25 + intensity * 0.35})`,
        textColor: '#ff3366',
      };
    }
  };

  // Find most severe anomaly
  const highestAnomaly = markets.reduce((max, m) => {
    const tick = liveTicks.get(m.id);
    const edge = Math.abs(tick?.edge ?? m.edgePercentage);
    return edge > max ? edge : max;
  }, 0);

  return (
    <div className="terminal-panel edge-radar-panel">
      <div className="terminal-panel-header">
        <div className="panel-title">
          <Crosshair size={16} />
          <span>Edge Radar & Discrepancy Heatmap</span>
          {highestAnomaly >= 0.03 && (
            <span className="badge badge-anomaly">
              <Zap size={11} />
              {(highestAnomaly * 100).toFixed(1)}% MAX ARB
            </span>
          )}
        </div>

        <div className="radar-legend">
          <div className="legend-item">
            <span className="legend-box legend-yes"></span>
            <span>YES Edge (&gt;0)</span>
          </div>
          <div className="legend-item">
            <span className="legend-box legend-no"></span>
            <span>NO Edge (&lt;0)</span>
          </div>
        </div>
      </div>

      {/* Heatmap Matrix Table */}
      <div className="heatmap-grid-container">
        <div className="heatmap-matrix">
          {/* Header row: timeframes */}
          <div className="matrix-row header-row">
            <div className="matrix-cell symbol-header">ASSET</div>
            {windows.map((win) => (
              <div key={win} className="matrix-cell win-header">
                {win} EXPIRY
              </div>
            ))}
          </div>

          {/* Asset Rows */}
          {symbols.map((sym) => (
            <div key={sym} className="matrix-row asset-row">
              <div className="matrix-cell sym-label">
                <Coins size={14} style={{ marginRight: '6px', color: 'var(--brand-cyan)' }} />
                <span>{sym}</span>
              </div>

              {windows.map((win) => {
                // Find all markets matching symbol and window
                const matchingMarkets = markets.filter(
                  (m) => m.symbol === sym && m.windowDuration === win,
                );

                if (matchingMarkets.length === 0) {
                  return (
                    <div key={win} className="matrix-cell empty-cell">
                      <span className="text-dim">--</span>
                    </div>
                  );
                }

                // Focus on At-The-Money / highest edge contract in this cell
                const bestMarket = matchingMarkets.reduce((best, cur) => {
                  const edgeBest = Math.abs(liveTicks.get(best.id)?.edge ?? best.edgePercentage);
                  const edgeCur = Math.abs(liveTicks.get(cur.id)?.edge ?? cur.edgePercentage);
                  return edgeCur > edgeBest ? cur : best;
                }, matchingMarkets[0]);

                const tick = liveTicks.get(bestMarket.id);
                const edge = tick?.edge ?? bestMarket.edgePercentage;
                const fairValue = tick?.fairValue ?? bestMarket.fairValueYes;
                const impliedProb = tick?.impliedProb ?? bestMarket.impliedProbYes;
                const isSelected = bestMarket.id === selectedMarketId;
                const isAnomaly = Math.abs(edge) >= 0.03;

                const styleProps = getHeatmapColor(edge);

                return (
                  <div
                    key={win}
                    className={`matrix-cell data-cell ${isSelected ? 'selected-cell' : ''} ${isAnomaly ? 'radar-pulse' : ''}`}
                    style={{
                      backgroundColor: styleProps.bg,
                      borderColor: styleProps.border,
                      boxShadow: styleProps.glow,
                    }}
                    onClick={() => onSelectMarket(bestMarket.id)}
                    onMouseEnter={() => setHoveredMarketId(bestMarket.id)}
                    onMouseLeave={() => setHoveredMarketId(null)}
                  >
                    <div className="cell-content">
                      <div className="cell-strike tabular-num">${bestMarket.strikePrice.toLocaleString()}</div>
                      <div className="cell-edge tabular-num" style={{ color: styleProps.textColor }}>
                        {edge >= 0 ? '+' : ''}{(edge * 100).toFixed(1)}%
                      </div>
                      <div className="cell-probs tabular-num text-dim">
                        {(impliedProb * 100).toFixed(0)}% vs {(fairValue * 100).toFixed(0)}%
                      </div>
                    </div>

                    {isAnomaly && (
                      <div className="anomaly-beacon-dot">
                        <span className="beacon-ring"></span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Hover Inspection Quick Card */}
        {hoveredMarketId && (() => {
          const hoveredMarket = markets.find((m) => m.id === hoveredMarketId);
          if (!hoveredMarket) return null;
          const tick = liveTicks.get(hoveredMarket.id);
          const edge = tick?.edge ?? hoveredMarket.edgePercentage;
          const fair = tick?.fairValue ?? hoveredMarket.fairValueYes;
          const implied = tick?.impliedProb ?? hoveredMarket.impliedProbYes;

          return (
            <div className="heatmap-hover-tooltip">
              <div className="hover-stat">
                <span className="h-label">MARKET:</span>
                <span className="h-val">{hoveredMarket.symbol} {hoveredMarket.windowDuration} (${hoveredMarket.strikePrice.toLocaleString()})</span>
              </div>
              <div className="hover-stat">
                <span className="h-label">CLOB MID:</span>
                <span className="h-val tabular-num">{(implied * 100).toFixed(1)}%</span>
              </div>
              <div className="hover-stat">
                <span className="h-label">BLACK-SCHOLES Φ(z):</span>
                <span className="h-val tabular-num text-cyan">{(fair * 100).toFixed(1)}%</span>
              </div>
              <div className="hover-stat">
                <span className="h-label">DISCREPANCY:</span>
                <span className={`h-val tabular-num ${edge >= 0 ? 'text-yes' : 'text-no'}`}>
                  {edge >= 0 ? '+' : ''}{(edge * 100).toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
