import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  SparklesIcon,
  ClockIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import type { Market, AgentThoughtLog } from '../../types/index.js';
import type { MarketTickData } from '../../hooks/useTelemetry.js';
import { useMarketCountdown } from '../../hooks/useMarketCountdown.js';
import { cn } from '../../lib/utils.js';

interface EventContractChartProps {
  market: Market;
  liveTick?: MarketTickData;
  currentSpotPrice?: number;
  agentThoughts?: AgentThoughtLog[];
}

interface PricePoint {
  time: number;
  price: number;
}

export const EventContractChart: React.FC<EventContractChartProps> = ({
  market,
  liveTick,
  currentSpotPrice,
  agentThoughts: _agentThoughts = [],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 800, height: 420 });
  const [timeRange, setTimeRange] = useState<'RTC' | '15m' | '1h' | 'ALL'>('RTC');
  const [showAIForecast, setShowAIForecast] = useState<boolean>(true);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; price: number; time: string; delta: number } | null>(null);

  // Derive active prices and parameters
  const strike = market.strikePrice || 79613.4;
  const spot = currentSpotPrice || liveTick?.spotPrice || market.strikePrice || 79664.46;
  const isITM = spot >= strike;

  // Continuous regularized sigmoid probability centered on strike (prevents pin-risk step collapse)
  const smoothFallbackProb = useMemo(() => {
    if (!strike || strike <= 0) return 0.50;
    const relOffset = (spot - strike) / (strike * 0.005);
    const sigmoid = 1 / (1 + Math.exp(-Math.max(-4, Math.min(4, relOffset * 2))));
    return Number(sigmoid.toFixed(4));
  }, [spot, strike]);

  const impliedProbYes = liveTick?.impliedProb ?? market.impliedProbYes ?? smoothFallbackProb;
  const fairValueYes = liveTick?.fairValue ?? market.fairValueYes ?? smoothFallbackProb;

  // Local price history trail
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>(() => {
    const now = Date.now();
    const history: PricePoint[] = [];
    const basePrice = strike;
    // Generate realistic initial 30 points leading up to current spot
    for (let i = 30; i >= 0; i--) {
      const t = now - i * 5000;
      const progress = (30 - i) / 30;
      const variance = (Math.sin(i * 0.8) * 0.0006 + (progress * (spot - basePrice) / basePrice)) * basePrice;
      history.push({
        time: t,
        price: Number((basePrice + variance).toFixed(2)),
      });
    }
    // Ensure last point is exactly the current spot
    history[history.length - 1].price = spot;
    return history;
  });

  // Re-seed price history when switching market or symbol
  useEffect(() => {
    const now = Date.now();
    const history: PricePoint[] = [];
    const basePrice = strike > 0 ? strike : spot;
    for (let i = 30; i >= 0; i--) {
      const t = now - i * 5000;
      const progress = (30 - i) / 30;
      const variance = (Math.sin(i * 0.8) * 0.0006 + (progress * (spot - basePrice) / (basePrice || 1))) * basePrice;
      history.push({
        time: t,
        price: Number((basePrice + variance).toFixed(2)),
      });
    }
    if (history.length > 0) {
      history[history.length - 1].price = spot;
    }
    setPriceHistory(history);
  }, [market.id, market.symbol]);

  // Track live spot price changes
  useEffect(() => {
    if (!spot || isNaN(spot)) return;
    setPriceHistory((prev) => {
      const now = Date.now();
      const last = prev[prev.length - 1];
      if (last && now - last.time < 1000) {
        // Update last point if less than 1s
        const updated = [...prev];
        updated[updated.length - 1] = { time: now, price: spot };
        return updated;
      }
      const next = [...prev, { time: now, price: spot }];
      // Keep max 120 points for buttery smooth 60fps rendering
      if (next.length > 120) next.shift();
      return next;
    });
  }, [spot]);

  // Handle responsive canvas sizing
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({
          width: Math.max(300, clientWidth),
          height: Math.max(280, clientHeight || 420),
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Real-time dynamic countdown & formatted expiry
  const { formattedCountdown, formattedExpiry, isLocked } = useMarketCountdown(market.closeTimestamp, market.windowDuration);

  // Scaler functions for SVG chart
  const { width, height } = dimensions;
  const padding = { top: 42, right: 90, bottom: 35, left: 15 };
  const chartWidth = Math.max(10, width - padding.left - padding.right);
  const chartHeight = Math.max(10, height - padding.top - padding.bottom);

  // Dynamic Min/Max range calculation centered on strike and spot
  const { minPrice, priceRange } = useMemo(() => {
    const prices = priceHistory.map((p) => p.price);
    prices.push(strike);
    prices.push(spot);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const diff = Math.max(max - min, strike * 0.002);
    const buffer = diff * 0.35;
    const finalMin = min - buffer;
    const finalMax = max + buffer;
    return {
      minPrice: finalMin,
      priceRange: finalMax - finalMin || 1,
    };
  }, [priceHistory, strike, spot]);

  // Map price to Y coordinate
  const getY = (price: number) => {
    const ratio = (price - minPrice) / priceRange;
    return padding.top + chartHeight - ratio * chartHeight;
  };

  // Split chart into past (70% width) and future settlement zone (30% width)
  const pastWidth = chartWidth * 0.72;
  const futureWidth = chartWidth * 0.28;
  const splitX = padding.left + pastWidth;

  // Map historical points to SVG coordinates
  const svgPoints = useMemo(() => {
    if (priceHistory.length === 0) return '';
    return priceHistory
      .map((p, index) => {
        const x = padding.left + (index / Math.max(1, priceHistory.length - 1)) * pastWidth;
        const y = getY(p.price);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [priceHistory, pastWidth, minPrice, priceRange, chartHeight, padding.top, padding.left]);

  const currentY = getY(spot);
  const strikeY = getY(strike);

  // Settlement Zone coordinates
  const zoneTop = padding.top;
  const zoneBottom = padding.top + chartHeight;
  const zoneLeft = splitX;
  const zoneRight = padding.left + chartWidth;

  // AI Forecast Cone trajectory coordinates - scaled continuously by probability confidence
  const probDistance = (fairValueYes - 0.5) * 2; // normalized in [-1, 1]
  const aiPredictedTarget = strike + probDistance * (strike * 0.0018);
  const aiTargetY = getY(aiPredictedTarget);
  const aiConeTopY = getY(aiPredictedTarget + strike * 0.0008);
  const aiConeBottomY = getY(aiPredictedTarget - strike * 0.0008);
  const aiLabelY = Math.max(padding.top + 16, Math.min(padding.top + chartHeight - 12, aiTargetY > padding.top + 28 ? aiTargetY - 10 : aiTargetY + 20));

  // Handle crosshair hover
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    if (mouseX < padding.left || mouseX > splitX) {
      setHoverPoint(null);
      return;
    }
    const relativeX = (mouseX - padding.left) / pastWidth;
    const pointIndex = Math.min(
      priceHistory.length - 1,
      Math.max(0, Math.round(relativeX * (priceHistory.length - 1)))
    );
    const p = priceHistory[pointIndex];
    if (p) {
      const y = getY(p.price);
      setHoverPoint({
        x: mouseX,
        y,
        price: p.price,
        time: new Date(p.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        delta: p.price - strike,
      });
    }
  };

  return (
    <div className="relative flex flex-col h-full w-full select-none overflow-hidden rounded-xl border border-border/40 bg-background/80 backdrop-blur-md">
      {/* Top Chart Header & Navigation Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-background/60 text-xs font-mono">
        {/* Left: Event Question & Status */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 font-bold text-foreground">
            <span className="text-brand-cyan">{market.symbol}</span>
            <span className="text-muted-foreground font-normal">
              Will {market.symbol.split('/')[0]} settle above{' '}
              <strong className="text-foreground">${strike.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>{' '}
              at {formattedExpiry}?
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1",
                isITM ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
              )}
              title={isITM ? `Spot is $${Math.abs(spot - strike).toFixed(2)} above strike ($${strike.toLocaleString()})` : `Spot is $${Math.abs(spot - strike).toFixed(2)} below strike ($${strike.toLocaleString()})`}
            >
              {isITM ? <ArrowTrendingUpIcon className="w-3 h-3" /> : <ArrowTrendingDownIcon className="w-3 h-3" />}
              <span>{isITM ? `+$${Math.abs(spot - strike) < 1 ? Math.abs(spot - strike).toFixed(4) : Math.abs(spot - strike).toFixed(2)} ITM` : `-$${Math.abs(spot - strike) < 1 ? Math.abs(spot - strike).toFixed(4) : Math.abs(spot - strike).toFixed(2)} OTM`}</span>
            </span>
          </div>
        </div>

        {/* Right: Quick Controls & Book Toggle */}
        <div className="flex items-center gap-2">
          {/* AI Forecast Toggle */}
          <button
            type="button"
            onClick={() => setShowAIForecast(!showAIForecast)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-all cursor-pointer border",
              showAIForecast
                ? "bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-xs shadow-purple-500/10"
                : "bg-secondary/40 text-muted-foreground border-border/40 hover:text-foreground"
            )}
            title="Toggle AI Forecast Projection Cone"
          >
            <SparklesIcon className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">AI Forecast</span>
          </button>

          {/* Timeframe Buttons */}
          <div className="hidden md:flex items-center bg-secondary/30 rounded-lg p-0.5 border border-border/30 text-[10px]">
            {(['RTC', '15m', '1h', 'ALL'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setTimeRange(range)}
                className={cn(
                  "px-2 py-0.5 rounded transition-colors cursor-pointer",
                  timeRange === range ? "bg-secondary text-foreground font-bold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main SVG Interactive Chart Area */}
      <div ref={containerRef} className="relative flex-1 w-full min-h-[280px] overflow-hidden">
        <svg
          width={width}
          height={height}
          className="w-full h-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverPoint(null)}
        >
          <defs>
            {/* Gradients */}
            <linearGradient id="priceLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.4" />
              <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#00ffcc" stopOpacity="1" />
            </linearGradient>

            <linearGradient id="priceAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#00ffcc" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#00ffcc" stopOpacity="0.0" />
            </linearGradient>

            <linearGradient id="upZoneGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.06" />
            </linearGradient>

            <linearGradient id="downZoneGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.22" />
            </linearGradient>

            <linearGradient id="aiConeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#c084fc" stopOpacity="0.08" />
            </linearGradient>

            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((pct) => {
            const y = padding.top + chartHeight * pct;
            return (
              <line
                key={pct}
                x1={padding.left}
                y1={y}
                x2={padding.left + chartWidth}
                y2={y}
                stroke="#27272a"
                strokeWidth="1"
                strokeDasharray="2 4"
                opacity="0.5"
              />
            );
          })}

          {/* Future Settlement Zone (UP Zone above Strike) */}
          <rect
            x={zoneLeft}
            y={zoneTop}
            width={futureWidth}
            height={Math.max(0, strikeY - zoneTop)}
            fill="url(#upZoneGrad)"
          />

          {/* Future Settlement Zone (DOWN Zone below Strike) */}
          <rect
            x={zoneLeft}
            y={strikeY}
            width={futureWidth}
            height={Math.max(0, zoneBottom - strikeY)}
            fill="url(#downZoneGrad)"
          />

          {/* Zone Separator Hatch Line */}
          <line
            x1={splitX}
            y1={padding.top}
            x2={splitX}
            y2={padding.top + chartHeight}
            stroke="#52525b"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />

          {/* AI Forecast Projection Cone (Overlay) */}
          {showAIForecast && (
            <g opacity="0.95">
              <polygon
                points={`${splitX},${currentY} ${zoneRight},${aiConeTopY} ${zoneRight},${aiConeBottomY}`}
                fill="url(#aiConeGrad)"
              />
              <line
                x1={splitX}
                y1={currentY}
                x2={zoneRight}
                y2={aiTargetY}
                stroke="#c084fc"
                strokeWidth="1.5"
                strokeDasharray="3 2"
              />
              <circle cx={zoneRight} cy={aiTargetY} r="3.5" fill="#c084fc" filter="url(#glow)" />
              
              {/* Distinctive AI Badge Pill */}
              <g transform={`translate(${zoneRight - 150}, ${aiLabelY - 14})`}>
                <rect
                  x="0"
                  y="0"
                  width="145"
                  height="20"
                  rx="4"
                  fill="#1e1035"
                  fillOpacity="0.9"
                  stroke="#a855f7"
                  strokeWidth="1"
                />
                <text
                  x="8"
                  y="14"
                  fill="#e9d5ff"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="bold"
                >
                  AI Model: {(fairValueYes >= 0.5 ? fairValueYes * 100 : (1 - fairValueYes) * 100).toFixed(1)}% {fairValueYes >= 0.5 ? 'UP' : 'DOWN'}
                </text>
              </g>
            </g>
          )}

          {/* Dashed Strike Price Line */}
          <line
            x1={padding.left}
            y1={strikeY}
            x2={padding.left + chartWidth}
            y2={strikeY}
            stroke="#a1a1aa"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />

          {/* Strike Label & Value Pill */}
          <g transform={`translate(${padding.left + chartWidth + 6}, ${strikeY})`}>
            <rect x="0" y="-10" width="76" height="20" rx="4" fill="#18181b" stroke="#71717a" strokeWidth="1" />
            <text x="5" y="4" fill="#e4e4e7" fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="bold">
              ${strike.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </text>
          </g>

          {/* Strike Offset Indicator */}
          <text
            x={splitX + 8}
            y={strikeY - 6}
            fill="#a1a1aa"
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
          >
            Strike ${strike.toLocaleString()} — 0.00%
          </text>

          {/* Historical Price Trail (Underlay Gradient Fill) */}
          {priceHistory.length > 1 && (
            <polygon
              points={`${padding.left},${padding.top + chartHeight} ${svgPoints} ${splitX},${padding.top + chartHeight}`}
              fill="url(#priceAreaGrad)"
            />
          )}

          {/* Historical Price Curve Line */}
          {priceHistory.length > 1 && (
            <polyline
              points={svgPoints}
              fill="none"
              stroke="url(#priceLineGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Active Spot Price Glowing Head */}
          <circle cx={splitX} cy={currentY} r="5" fill="#00ffcc" filter="url(#glow)" />
          <circle cx={splitX} cy={currentY} r="2.5" fill="#ffffff" />

          {/* Pulse Ripple Effect at Spot */}
          <circle cx={splitX} cy={currentY} r="9" fill="none" stroke="#00ffcc" strokeWidth="1" opacity="0.6">
            <animate attributeName="r" values="5;14" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;0" dur="1.8s" repeatCount="indefinite" />
          </circle>

          {/* Interactive Hover Crosshair */}
          {hoverPoint && (
            <g>
              <line
                x1={hoverPoint.x}
                y1={padding.top}
                x2={hoverPoint.x}
                y2={padding.top + chartHeight}
                stroke="#00ffcc"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.7"
              />
              <line
                x1={padding.left}
                y1={hoverPoint.y}
                x2={splitX}
                y2={hoverPoint.y}
                stroke="#00ffcc"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.7"
              />
              <circle cx={hoverPoint.x} cy={hoverPoint.y} r="4" fill="#00ffcc" />
            </g>
          )}

          {/* Time Labels on Bottom Axis */}
          <text x={padding.left + 5} y={height - 12} fill="#71717a" fontSize="10" fontFamily="JetBrains Mono, monospace">
            15m ago
          </text>
          <text x={splitX - 35} y={height - 12} fill="#00ffcc" fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="bold">
            now {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
          </text>
          <text x={zoneRight - 45} y={height - 12} fill="#a1a1aa" fontSize="10" fontFamily="JetBrains Mono, monospace">
            {formattedExpiry}
          </text>
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoverPoint && (
          <div
            className="absolute pointer-events-none z-30 p-2 rounded-lg bg-background/95 border border-border text-xs font-mono shadow-xl backdrop-blur-md"
            style={{
              left: Math.min(hoverPoint.x + 12, width - 180),
              top: Math.max(10, hoverPoint.y - 45),
            }}
          >
            <div className="font-bold text-foreground">${hoverPoint.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            <div className="text-[10px] text-muted-foreground flex items-center justify-between gap-3">
              <span>{hoverPoint.time}</span>
              <span className={hoverPoint.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {hoverPoint.delta >= 0 ? '+' : ''}${hoverPoint.delta.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Expiry Floating Countdown Badge in Settlement Zone */}
        <div
          className={cn(
            "absolute z-20 flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-lg border shadow-lg backdrop-blur-md transition-all",
            isLocked ? "bg-amber-950/40 border-amber-500/50 text-amber-400" : "bg-background/90 border-border/70 text-brand-cyan"
          )}
          style={{
            left: `${splitX + 14}px`,
            top: '8px',
          }}
        >
          <div className={cn("flex items-center gap-1.5 text-xs font-mono font-bold", isLocked ? "text-amber-400" : "text-brand-cyan")}>
            {isLocked ? <LockClosedIcon className="w-3.5 h-3.5 animate-pulse text-amber-400" /> : <ClockIcon className="w-3.5 h-3.5 animate-pulse text-brand-cyan" />}
            <span>{isLocked ? `${formattedCountdown} (LOCKED)` : formattedCountdown}</span>
          </div>
          <div className="text-[8px] font-mono text-muted-foreground tracking-wider uppercase">
            {isLocked ? 'Resolving Phase' : 'Time to Settlement'}
          </div>
        </div>

        {/* Dynamic Zone Labels */}
        <div
          className="absolute pointer-events-none text-emerald-400/80 font-mono font-bold text-xs tracking-wider flex items-center gap-1"
          style={{ right: `${padding.right + 12}px`, top: '10px' }}
        >
          <ArrowTrendingUpIcon className="w-3.5 h-3.5" />
          <span>UP ZONE ({(impliedProbYes * 100).toFixed(0)}%)</span>
        </div>

        <div
          className="absolute pointer-events-none text-rose-400/80 font-mono font-bold text-xs tracking-wider flex items-center gap-1"
          style={{ right: `${padding.right + 12}px`, bottom: `${padding.bottom + 12}px` }}
        >
          <ArrowTrendingDownIcon className="w-3.5 h-3.5" />
          <span>DOWN ZONE ({((1 - impliedProbYes) * 100).toFixed(0)}%)</span>
        </div>
      </div>
    </div>
  );
};
