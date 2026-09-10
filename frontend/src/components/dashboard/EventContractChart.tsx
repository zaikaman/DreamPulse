import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  SparklesIcon,
  ClockIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import type { Market, AgentThoughtLog } from '../../types/index.js';
import type { MarketTickData } from '../../hooks/useTelemetry.js';
import { useMarketCountdown } from '../../hooks/useMarketCountdown.js';
import { evaluateTradeConfluence } from '../../lib/confluence.js';
import { apiClient } from '../../services/api.js';
import { cn } from '../../lib/utils.js';

interface EventContractChartProps {
  market: Market;
  liveTick?: MarketTickData;
  currentSpotPrice?: number;
  agentThoughts?: AgentThoughtLog[];
  onExpire?: () => void;
}

interface PricePoint {
  time: number;
  price: number;
}

function getLookbackSeconds(range: 'RTC' | '15m' | '1h' | 'ALL', windowDuration?: string): number {
  if (range === '15m') return 900;
  if (range === '1h') return 3600;
  if (range === 'ALL') return 14400;
  if (windowDuration === '1m') return 60;
  if (windowDuration === '5m') return 300;
  if (windowDuration === '15m') return 900;
  if (windowDuration === '1h') return 3600;
  if (windowDuration === '24h') return 86400;
  return 300;
}

function getMaxPointsForRange(range: 'RTC' | '15m' | '1h' | 'ALL'): number {
  if (range === 'RTC') return 120;
  if (range === '15m') return 120;
  if (range === '1h') return 150;
  return 200;
}

export const EventContractChart: React.FC<EventContractChartProps> = ({
  market,
  liveTick,
  currentSpotPrice,
  agentThoughts: _agentThoughts = [],
  onExpire,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 800, height: 420 });
  const [timeRange, setTimeRange] = useState<'RTC' | '15m' | '1h' | 'ALL'>('RTC');
  const [showAIForecast, setShowAIForecast] = useState<boolean>(true);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; price: number; time: string; delta: number } | null>(null);

  // Derive active prices and parameters
  const strike = market.strikePrice || 0;
  const spot = currentSpotPrice || liveTick?.spotPrice || market.strikePrice || 0;
  const isITM = strike > 0 && spot > 0 ? spot >= strike : false;

  // Real price history trail: live ticks + exchange klines fetched from the
  // backend. Never synthesized — when the exchange backfill is unavailable the
  // chart renders only locally observed ticks ("Recent Trades Only").
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);
  const [historyMeta, setHistoryMeta] = useState<{ isPartial: boolean; sources: string[]; count: number }>({
    isPartial: true,
    sources: [],
    count: 0,
  });

  // Active display points for the chart: merges historical trail with the active live spot
  // so the rendered price curve ALWAYS terminates precisely at the active spot dot at (splitX, currentY).
  const displayPoints = useMemo<PricePoint[]>(() => {
    if (!spot || isNaN(spot) || spot <= 0) {
      return priceHistory;
    }

    if (priceHistory.length === 0) {
      return [{ time: Date.now(), price: spot }];
    }

    const last = priceHistory[priceHistory.length - 1];
    const now = Math.max(Date.now(), last.time);

    // If the last point is already at current spot and within 500ms, use priceHistory directly
    if (Math.abs(last.price - spot) < 0.0001 && Math.abs(now - last.time) < 500) {
      return priceHistory;
    }

    // If the last point is very recent (within 1.5s), update it in place so micro-ticks don't bunch up
    if (Math.abs(now - last.time) < 1500) {
      const copy = [...priceHistory];
      copy[copy.length - 1] = { time: now, price: spot };
      return copy;
    }

    // Otherwise, append the active spot at 'now' to seamlessly connect the historical curve
    // directly into the active spot head at splitX
    return [...priceHistory, { time: now, price: spot }];
  }, [priceHistory, spot]);

  // Evaluate Multi-Factor Confluence
  const confluence = useMemo(() => {
    return evaluateTradeConfluence(market, liveTick, spot, displayPoints);
  }, [market, liveTick, spot, displayPoints]);

  const impliedProbYes = confluence.impliedProbYes;
  const fairValueYes = confluence.fairValueYes;
  const edge = confluence.edgePercentage;
  const isYesEdge = confluence.isYesEdge;
  const hasEdge = Math.abs(edge) >= 0.005;

  const aiBadge = useMemo(() => {
    if (confluence.convictionState === 'CAUTION_COUNTER_TREND') {
      const text = `Caution: Divergence (Waiting)`;
      return { text, bg: 'rgba(255,183,0,0.15)', stroke: '#ffb700', color: '#ffb700', w: 185 };
    }
    if (confluence.convictionState === 'HIGH_CONVICTION') {
      const dir = confluence.recommendedAction === 'BUY_UP' ? 'UP' : 'DOWN';
      const text = `High Conviction ${dir} (${confluence.winProbability}% Win • ${confluence.signedEdgeLabel})`;
      const w = Math.min(260, Math.max(180, text.length * 6.5 + 16));
      const isUp = dir === 'UP';
      const bg = isUp ? 'rgba(0,230,118,0.15)' : 'rgba(255,51,102,0.15)';
      const stroke = isUp ? '#00e676' : '#ff3366';
      const color = isUp ? '#00e676' : '#ff3366';
      return { text, bg, stroke, color, w };
    }
    if (hasEdge) {
      const edgePct = (Math.abs(edge) * 100).toFixed(1);
      const dir = isYesEdge ? 'YES' : 'NO';
      const fairStr = (fairValueYes * 100).toFixed(1);
      const text = `AI Fair ${fairStr}% → ${dir} +${edgePct}% Alpha`;
      const w = Math.min(230, Math.max(170, text.length * 6.6 + 16));
      const bg = isYesEdge ? 'rgba(0,230,118,0.14)' : 'rgba(255,51,102,0.14)';
      const stroke = isYesEdge ? '#00e676' : '#ff3366';
      const color = isYesEdge ? '#00e676' : '#ff3366';
      return { text, bg, stroke, color, w };
    }
    const pct = fairValueYes >= 0.5 ? (fairValueYes * 100).toFixed(1) : ((1 - fairValueYes) * 100).toFixed(1);
    const d = fairValueYes >= 0.5 ? 'UP' : 'DOWN';
    return { text: `AI Fair ${pct}% ${d}`, bg: '#1e1035', stroke: '#7928ca', color: '#d8b4fe', w: 145 };
  }, [fairValueYes, edge, hasEdge, isYesEdge, confluence]);

  // Fetch REAL price history when switching market, symbol, or timeframe range.
  // No synthetic fallback: on failure the chart shows only subsequently observed
  // live ticks (or an explicit empty state), never fabricated waves.
  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    const lookbackSec = getLookbackSeconds(timeRange, market.windowDuration);
    const maxPoints = getMaxPointsForRange(timeRange);
    apiClient
      .getPriceHistory(market.symbol, lookbackSec, maxPoints)
      .then((res) => {
        if (cancelled || !res?.success) return;
        const pts = (res.points || [])
          .filter((p) => Number.isFinite(p?.price) && p.price > 0 && Number.isFinite(p?.time))
          .sort((a, b) => a.time - b.time)
          .map((p) => ({ time: p.time, price: p.price }));
        setPriceHistory(pts);
        setHistoryMeta({ isPartial: res.isPartial, sources: res.sources || [], count: pts.length });
      })
      .catch(() => {
        if (!cancelled) {
          setPriceHistory([]);
          setHistoryMeta({ isPartial: true, sources: [], count: 0 });
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [market.id, market.symbol, timeRange, market.windowDuration]);

  // Real-time dynamic countdown & formatted expiry (30s lock removed)
  const { formattedCountdown, formattedExpiry, isExpired } = useMarketCountdown(
    market.closeTimestamp,
    market.windowDuration,
    onExpire
  );
  const isResolving = (market.status === 'Resolving' || isExpired) && market.status !== 'Finalized' && isExpired;

  // Append REAL live spot ticks only (frozen if round ended / resolving).
  // Never fabricates history: seeds from the first observed tick when the
  // backend returned no depth yet.
  useEffect(() => {
    if (!spot || isNaN(spot) || spot <= 0) return;
    if (isResolving) {
      setPriceHistory((prev) => {
        if (prev.length === 0) return [{ time: Date.now(), price: spot }];
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], price: spot };
        return updated;
      });
      return;
    }
    setPriceHistory((prev) => {
      const now = Date.now();
      if (prev.length === 0) {
        setHistoryMeta((m) => ({ ...m, isPartial: true, count: 1 }));
        return [{ time: now, price: spot }];
      }
      const last = prev[prev.length - 1];
      const throttleMs = timeRange === 'RTC' ? 1000 : timeRange === '15m' ? 3000 : 8000;
      if (last && now - last.time < throttleMs) {
        // Update last point in place with the real observed spot
        const updated = [...prev];
        updated[updated.length - 1] = { time: now, price: spot };
        return updated;
      }
      const next = [...prev, { time: now, price: spot }];
      const maxPts = getMaxPointsForRange(timeRange);
      if (next.length > maxPts) next.splice(0, next.length - maxPts);
      return next;
    });
  }, [spot, timeRange, isResolving]);

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

  // Scaler functions for SVG chart
  const { width, height } = dimensions;
  const isMobileWidth = width < 600;
  const padding = { top: 42, right: isMobileWidth ? 60 : 90, bottom: 35, left: 15 };
  const chartWidth = Math.max(10, width - padding.left - padding.right);
  const chartHeight = Math.max(10, height - padding.top - padding.bottom);

  // Dynamic Min/Max range calculation centered on strike and spot
  const { minPrice, priceRange } = useMemo(() => {
    const validPrices = displayPoints.map((p) => p.price).filter((p) => p > 0);
    if (strike > 0) validPrices.push(strike);
    if (spot > 0) validPrices.push(spot);
    const fallbackBase = strike > 0 ? strike : spot > 0 ? spot : 100;
    const min = validPrices.length > 0 ? Math.min(...validPrices) : fallbackBase * 0.99;
    const max = validPrices.length > 0 ? Math.max(...validPrices) : fallbackBase * 1.01;
    const diff = Math.max(max - min, fallbackBase * 0.002);
    const buffer = diff * 0.35;
    const finalMin = Math.max(0, min - buffer);
    const finalMax = max + buffer;
    return {
      minPrice: finalMin,
      priceRange: finalMax - finalMin || 1,
    };
  }, [displayPoints, strike, spot]);

  // Map price to Y coordinate
  const getY = (price: number) => {
    const ratio = (price - minPrice) / priceRange;
    return padding.top + chartHeight - ratio * chartHeight;
  };

  const currentY = getY(spot);
  const strikeY = getY(strike);

  // Split chart into past (72% width) and future settlement zone (28% width)
  const pastWidth = chartWidth * 0.72;
  const futureWidth = chartWidth * 0.28;
  const splitX = padding.left + pastWidth;

  // Map historical points to SVG coordinates by actual timestamp so real
  // exchange candles and live ticks keep true time spacing (no resampling).
  const timeDomain = useMemo(() => {
    if (displayPoints.length === 0) return null;
    const from = displayPoints[0].time;
    const to = displayPoints[displayPoints.length - 1].time;
    return { from, to, span: Math.max(1, to - from) };
  }, [displayPoints]);

  const getX = (time: number) => {
    if (!timeDomain) return padding.left;
    const ratio = (time - timeDomain.from) / timeDomain.span;
    return padding.left + Math.min(1, Math.max(0, ratio)) * pastWidth;
  };

  const svgPoints = useMemo(() => {
    if (displayPoints.length === 0 || !timeDomain) return '';
    const lastIdx = displayPoints.length - 1;
    return displayPoints
      .map((p, i) => {
        const x = i === lastIdx ? splitX : getX(p.time);
        const y = i === lastIdx ? currentY : getY(p.price);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [displayPoints, timeDomain, pastWidth, minPrice, priceRange, chartHeight, padding.top, padding.left, splitX, currentY]);

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

  // Handle crosshair hover — snap to the nearest real point by screen x
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    if (mouseX < padding.left || mouseX > splitX || displayPoints.length === 0) {
      setHoverPoint(null);
      return;
    }
    let nearest = displayPoints[0];
    let nearestDist = Infinity;
    for (const p of displayPoints) {
      const dist = Math.abs(getX(p.time) - mouseX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = p;
      }
    }
    if (nearest) {
      const y = getY(nearest.price);
      setHoverPoint({
        x: getX(nearest.time),
        y,
        price: nearest.price,
        time: new Date(nearest.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        delta: nearest.price - strike,
      });
    }
  };

  return (
    <div className="relative flex flex-col h-full w-full select-none overflow-hidden rounded-xl border border-border/40 bg-background/80 backdrop-blur-md">
      {/* Top Chart Header & Navigation Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-background/60 text-xs font-mono flex-wrap gap-2">
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
                isITM ? "bg-[#00e676]/20 text-[#00e676] border border-[#00e676]/30" : "bg-[#ff3366]/20 text-[#ff3366] border border-[#ff3366]/30"
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
                ? "bg-[#7928ca]/20 text-[#d8b4fe] border-[#7928ca]/40 shadow-xs shadow-[0_0_10px_rgba(121,40,202,0.12)]"
                : "bg-secondary/40 text-muted-foreground border-border/40 hover:text-foreground"
            )}
            title="Toggle AI Forecast Projection Cone"
          >
            <SparklesIcon className="w-3.5 h-3.5 text-[#d8b4fe]" />
            <span className="hidden sm:inline">AI Forecast</span>
          </button>

          {/* Data provenance: real feed only, explicit when depth is limited */}
          <span
            className={cn(
              "hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono border",
              historyLoading
                ? "text-muted-foreground border-border/40 bg-secondary/30"
                : priceHistory.length === 0
                  ? "text-[#ffb700] border-[#ffb700]/40 bg-[#ffb700]/10"
                  : historyMeta.isPartial
                    ? "text-[#ffb700] border-[#ffb700]/40 bg-[#ffb700]/10"
                    : "text-[#00e676] border-[#00e676]/40 bg-[#00e676]/10"
            )}
            title={
              historyLoading
                ? "Fetching real spot ticks and exchange candles"
                : priceHistory.length === 0
                  ? "No real ticks observed yet for this window — showing empty state, no simulated data"
                  : historyMeta.isPartial
                    ? `Showing ${priceHistory.length} locally observed real ticks only — exchange backfill unavailable`
                    : `Showing ${priceHistory.length} real points from live ticks + exchange candles`
            }
          >
            {historyLoading
              ? "Loading real feed…"
              : priceHistory.length === 0
                ? "No real ticks yet"
                : historyMeta.isPartial
                  ? `Recent Trades Only • ${priceHistory.length} real ticks`
                  : `Live • Real feed • ${priceHistory.length} pts`}
          </span>

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
              <stop offset="0%" stopColor="#00ffcc" stopOpacity="0.4" />
              <stop offset="60%" stopColor="#00ffcc" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#00ffcc" stopOpacity="1" />
            </linearGradient>

            <linearGradient id="priceAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#00ffcc" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#00ffcc" stopOpacity="0.0" />
            </linearGradient>

            <linearGradient id="upZoneGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#00e676" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#00e676" stopOpacity="0.06" />
            </linearGradient>

            <linearGradient id="downZoneGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ff3366" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#ff3366" stopOpacity="0.22" />
            </linearGradient>

            <linearGradient id="aiConeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7928ca" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#7928ca" stopOpacity="0.08" />
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
                stroke="#7928ca"
                strokeWidth="1.5"
                strokeDasharray="3 2"
              />
              <circle cx={zoneRight} cy={aiTargetY} r="3.5" fill="#7928ca" filter="url(#glow)" />
              
              {/* Edge-aware AI Badge — shows Fair vs Market so YES edge does not contradict DOWN fair */}
              <g transform={`translate(${zoneRight - aiBadge.w - 6}, ${aiLabelY - 14})`}>
                <rect
                  x="0"
                  y="0"
                  width={aiBadge.w}
                  height="20"
                  rx="4"
                  fill={aiBadge.bg}
                  fillOpacity="0.9"
                  stroke={aiBadge.stroke}
                  strokeWidth="1"
                />
                <text
                  x="8"
                  y="14"
                  fill={aiBadge.color}
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="bold"
                >
                  {aiBadge.text}
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
          {displayPoints.length > 1 && (
            <polygon
              points={`${padding.left},${padding.top + chartHeight} ${svgPoints} ${splitX},${padding.top + chartHeight}`}
              fill="url(#priceAreaGrad)"
            />
          )}

          {/* Historical Price Curve Line */}
          {displayPoints.length > 1 && (
            <polyline
              points={svgPoints}
              fill="none"
              stroke="url(#priceLineGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Active Spot Price Glowing Head — only when a real spot was observed */}
          {spot > 0 && (
            <g>
              <circle cx={splitX} cy={currentY} r="5" fill="#00ffcc" filter="url(#glow)" />
              <circle cx={splitX} cy={currentY} r="2.5" fill="#ffffff" />

              {/* Pulse Ripple Effect at Spot */}
              <circle cx={splitX} cy={currentY} r="9" fill="none" stroke="#00ffcc" strokeWidth="1" opacity="0.6">
                <animate attributeName="r" values="5;14" dur="1.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.8;0" dur="1.8s" repeatCount="indefinite" />
              </circle>
            </g>
          )}

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
            {historyMeta.isPartial && !historyLoading
              ? `Recent Trades Only • ${timeRange === 'RTC' ? `${market.windowDuration || '5m'} round` : timeRange}`
              : timeRange === 'RTC' ? `${market.windowDuration || '5m'} round` : `${timeRange} ago`}
          </text>
          <text x={splitX - 35} y={height - 12} fill="#00ffcc" fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="bold">
            now {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
          </text>
          <text x={zoneRight - 45} y={height - 12} fill="#a1a1aa" fontSize="10" fontFamily="JetBrains Mono, monospace">
            {formattedExpiry}
          </text>
        </svg>

        {/* Empty state: no real ticks yet — never render fabricated data */}
        {!historyLoading && displayPoints.length === 0 && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 bg-background/60 backdrop-blur-[1px] text-center px-6">
            <div className="text-xs font-mono font-bold text-[#ffb700] border border-[#ffb700]/40 bg-[#ffb700]/10 rounded px-2 py-0.5">
              Recent Trades Only
            </div>
            <div className="text-xs font-mono text-muted-foreground">
              No real ticks observed yet for {market.symbol} in this window.
            </div>
            <div className="text-[10px] font-mono text-muted-foreground/70">
              Chart populates from live spot ticks + exchange candles — no simulated history.
            </div>
          </div>
        )}

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
              <span className={hoverPoint.delta >= 0 ? 'text-[#00e676]' : 'text-[#ff3366]'}>
                {hoverPoint.delta >= 0 ? '+' : ''}${hoverPoint.delta.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Expiry Floating Countdown Badge in Settlement Zone */}
        <div
          className={cn(
            "absolute z-20 flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-lg border shadow-lg backdrop-blur-md transition-all",
            isResolving
              ? "bg-[#ffb700]/10 border-[#ffb700]/40 text-[#ffb700]"
              : "bg-background/90 border-border/70 text-brand-cyan"
          )}
          style={{
            left: `${splitX + 14}px`,
            top: '8px',
          }}
        >
          <div className={cn("flex items-center gap-1.5 text-xs font-mono font-bold", isResolving ? "text-[#ffb700]" : "text-brand-cyan")}>
            {isResolving ? (
              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin text-[#ffb700]" />
            ) : (
              <ClockIcon className="w-3.5 h-3.5 animate-pulse text-brand-cyan" />
            )}
            <span>{isResolving ? 'Resolving Outcome...' : formattedCountdown}</span>
          </div>
          <div className="text-[8px] font-mono text-muted-foreground tracking-wider uppercase">
            {isResolving ? 'Oracle Settlement' : 'Time to Settlement'}
          </div>
        </div>

        {/* Dynamic Zone Labels */}
        <div
          className="absolute pointer-events-none text-[#00e676]/80 font-mono font-bold text-xs tracking-wider flex items-center gap-1"
          style={{ right: `${padding.right + 12}px`, top: '10px' }}
        >
          <ArrowTrendingUpIcon className="w-3.5 h-3.5" />
          <span>UP ZONE ({(impliedProbYes * 100).toFixed(0)}%)</span>
        </div>

        <div
          className="absolute pointer-events-none text-[#ff3366]/80 font-mono font-bold text-xs tracking-wider flex items-center gap-1"
          style={{ right: `${padding.right + 12}px`, bottom: `${padding.bottom + 12}px` }}
        >
          <ArrowTrendingDownIcon className="w-3.5 h-3.5" />
          <span>DOWN ZONE ({((1 - impliedProbYes) * 100).toFixed(0)}%)</span>
        </div>
      </div>
    </div>
  );
};
