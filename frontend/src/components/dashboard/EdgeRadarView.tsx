import React from 'react';
import { ScanEye, ArrowRight, Zap } from 'lucide-react';
import type { Market } from '../../types/index.js';
import type { MarketTickData } from '../../hooks/useTelemetry.js';
import { EdgeRadarHeatmap } from '../EdgeRadarHeatmap.js';

interface EdgeRadarViewProps {
  markets: Market[];
  selectedMarketId: string | null;
  onSelectMarket: (marketId: string) => void;
  liveTicks: Map<string, MarketTickData>;
  onNavigateToDepth: () => void;
}

export const EdgeRadarView: React.FC<EdgeRadarViewProps> = ({
  markets,
  selectedMarketId,
  onSelectMarket,
  liveTicks,
  onNavigateToDepth,
}) => {
  const selectedMarket = markets.find((m) => m.id === selectedMarketId) || markets[0];
  const selectedTick = selectedMarket ? liveTicks.get(selectedMarket.id) : undefined;
  const implied = selectedTick?.impliedProb ?? selectedMarket?.impliedProbYes ?? 0.5;
  const fair = selectedTick?.fairValue ?? selectedMarket?.fairValueYes ?? 0.5;
  const edge = selectedTick?.edge ?? selectedMarket?.edgePercentage ?? 0;
  const isYesEdge = edge > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Full-Width Discrepancy Heatmap Matrix */}
      <EdgeRadarHeatmap
        markets={markets}
        selectedMarketId={selectedMarketId}
        onSelectMarket={onSelectMarket}
        liveTicks={liveTicks}
      />

      {/* 2. Focused Anomaly & Mathematical Inspector Card */}
      {selectedMarket && (
        <div className="terminal-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ScanEye size={18} style={{ color: 'var(--brand-cyan)' }} />
              <span style={{ fontWeight: 600, fontSize: '15px' }}>
                Mathematical Mispricing Inspector: {selectedMarket.symbol} (${selectedMarket.strikePrice.toLocaleString()} {selectedMarket.windowDuration})
              </span>
              <span className="stat-pill-tag tag-cyan">
                ID: {selectedMarket.id.slice(0, 16)}...
              </span>
            </div>

            <button
              type="button"
              className="btn-glow"
              onClick={onNavigateToDepth}
            >
              <span>Open CLOB Order Book</span>
              <ArrowRight size={11} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <div style={{ background: '#18181b', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px' }}>
                CLOB IMPLIED PROBABILITY
              </span>
              <span style={{ fontSize: '20px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {(implied * 100).toFixed(2)}%
              </span>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', display: 'block', marginTop: '4px' }}>
                YES Bid: ${selectedMarket.bestBidYes.toFixed(2)} | Ask: ${selectedMarket.bestAskYes.toFixed(2)}
              </span>
            </div>

            <div style={{ background: '#18181b', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px' }}>
                BLACK-SCHOLES FAIR VALUE Φ(z)
              </span>
              <span style={{ fontSize: '20px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--brand-cyan)' }}>
                {(fair * 100).toFixed(2)}%
              </span>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', display: 'block', marginTop: '4px' }}>
                Continuous Normal Cumulative Dist
              </span>
            </div>

            <div style={{ background: '#18181b', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px' }}>
                CALCULATED EDGE ARB DELTA
              </span>
              <span
                style={{
                  fontSize: '20px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: isYesEdge ? 'var(--trade-yes)' : 'var(--trade-no)',
                }}
              >
                {isYesEdge ? '+' : ''}{(edge * 100).toFixed(2)}%
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                {Math.abs(edge) >= 0.03 ? (
                  <>
                    <Zap size={11} style={{ color: 'var(--trade-anomaly)' }} />
                    <span>Statistically Significant</span>
                  </>
                ) : (
                  <span>Within Normal Spread</span>
                )}
              </span>
            </div>

            <div style={{ background: '#18181b', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px' }}>
                RECOMMENDED STRATEGY
              </span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: isYesEdge ? 'var(--trade-yes)' : 'var(--trade-no)', display: 'block', marginTop: '2px' }}>
                {edge > 0.01 ? 'BUY YES (Underpriced)' : edge < -0.01 ? 'BUY NO (Overpriced)' : 'WAIT FOR CONVERGENCE'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', display: 'block', marginTop: '6px' }}>
                Autonomous Volt Sniper armed
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
