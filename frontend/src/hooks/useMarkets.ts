import { useState, useEffect, useCallback, useRef } from 'react';
import type { Market, MarketStatus } from '../types/index.js';
import { apiClient } from '../services/api.js';
import { supabase, subscribeToTable } from '../services/supabase.js';
import { telemetryClient, type MarketTickData } from '../services/telemetry-client.js';
import { shouldPoll, STALE_TIMES } from '../lib/polling.js';

export interface UseMarketsOptions {
  symbol?: string;
  window?: string;
  status?: MarketStatus;
  pollIntervalMs?: number;
}

export function normalizeMarket(raw: any): Market {
  const strike = Number(raw?.strikePrice ?? raw?.strike_price ?? 0);
  const settlement = raw?.settlementPrice ?? (raw?.settlement_price != null ? Number(raw.settlement_price) : undefined);
  const closeTimestamp = raw?.closeTimestamp || raw?.close_timestamp || new Date().toISOString();
  const closeMs = new Date(closeTimestamp).getTime();
  const isTimeExpired = closeMs > 0 && !isNaN(closeMs) && Date.now() >= closeMs;

  let status: MarketStatus = raw?.status || 'Open';
  let cleanSettlement = settlement !== undefined && !isNaN(settlement) ? settlement : undefined;

  // Sanity guard: A market can NEVER be in Resolving state if its closeTimestamp is still in the future.
  // If the server or cache provided a premature Resolving status before close, sanitize to Open and clear premature settlement price.
  if (status === 'Resolving' && !isTimeExpired) {
    status = 'Open';
    cleanSettlement = undefined;
  }

  return {
    id: String(raw?.id || ''),
    symbol: raw?.symbol || 'BTC/USD',
    strikePrice: isNaN(strike) ? 0 : strike,
    windowDuration: raw?.windowDuration || raw?.window_duration || '5m',
    openTimestamp: raw?.openTimestamp || raw?.open_timestamp || new Date().toISOString(),
    closeTimestamp,
    resolutionTimestamp: raw?.resolutionTimestamp || raw?.resolution_timestamp || new Date().toISOString(),
    status,
    settlementPrice: cleanSettlement,
    winningOutcome: raw?.winningOutcome || raw?.winning_outcome,
    bestBidYes: Number(raw?.bestBidYes ?? raw?.best_bid_yes ?? 0),
    bestAskYes: Number(raw?.bestAskYes ?? raw?.best_ask_yes ?? 0),
    bestBidNo: Number(raw?.bestBidNo ?? raw?.best_bid_no ?? 0),
    bestAskNo: Number(raw?.bestAskNo ?? raw?.best_ask_no ?? 0),
    impliedProbYes: Number(raw?.impliedProbYes ?? raw?.implied_prob_yes ?? 0.5),
    fairValueYes: Number(raw?.fairValueYes ?? raw?.fair_value_yes ?? 0.5),
    edgePercentage: Number(raw?.edgePercentage ?? raw?.edge_percentage ?? 0),
    poolAddress: raw?.poolAddress || raw?.pool_address,
    marketIdHex: raw?.marketIdHex || raw?.market_id_hex,
    isSynthetic: Boolean(raw?.isSynthetic ?? raw?.is_synthetic),
    isSeedDepth: Boolean(raw?.isSeedDepth ?? raw?.is_seed_depth),
    convictionState: raw?.convictionState,
    recommendedAction: raw?.recommendedAction,
    recommendedOutcome: raw?.recommendedOutcome,
    winProbability: raw?.winProbability,
    confidenceScore: raw?.confidenceScore,
    priceActionTrend: raw?.priceActionTrend,
    priceActionScore: raw?.priceActionScore,
    confluenceRationale: raw?.confluenceRationale,
  };
}

const LOCAL_MARKETS_CACHE_KEY = 'dreampulse_markets_cache';

export function useMarkets(options?: UseMarketsOptions) {
  const [markets, setMarkets] = useState<Market[]>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_MARKETS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed.map(normalizeMarket);
      }
    } catch {}
    return [];
  });
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_MARKETS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as Market[];
        return parsed.length > 0 ? parsed[0].id : null;
      }
    } catch {}
    return null;
  });
  const [loading, setLoading] = useState<boolean>(markets.length === 0);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const selectedSymbolRef = useRef<string | null>(null);
  const selectedWindowRef = useRef<string | null>(null);

  // Sync refs when selected market changes
  useEffect(() => {
    const found = markets.find((m) => m.id === selectedMarketId);
    if (found) {
      selectedSymbolRef.current = found.symbol;
      selectedWindowRef.current = found.windowDuration;
    }
  }, [selectedMarketId, markets]);

  const fetchMarkets = useCallback(async () => {
    try {
      const response = await apiClient.getMarkets({
        symbol: options?.symbol,
        window: options?.window,
        status: options?.status,
      });

      if (isMountedRef.current && response.success) {
        const normalized = (response.data || []).map(normalizeMarket);
        setMarkets(normalized);
        setError(null);
        try {
          if (!options?.symbol && !options?.window && !options?.status) {
            localStorage.setItem(LOCAL_MARKETS_CACHE_KEY, JSON.stringify(normalized));
          }
        } catch {}

        // Keep current selected market or find matching asset symbol instead of jumping to index 0
        setSelectedMarketId((prev) => {
          if (prev && response.data.some((m) => m.id === prev)) {
            return prev;
          }
          // If the previous ID expired/rolled over, find active market with the SAME symbol & window
          const targetSym = selectedSymbolRef.current;
          const targetWin = selectedWindowRef.current;
          if (targetSym) {
            const sameSymAndWin = response.data.find(
              (m) => m.symbol === targetSym && (!targetWin || m.windowDuration === targetWin) && m.status === 'Open'
            ) || response.data.find(
              (m) => m.symbol === targetSym && (!targetWin || m.windowDuration === targetWin)
            );
            if (sameSymAndWin) return sameSymAndWin.id;
            const sameSym = response.data.find((m) => m.symbol === targetSym && m.status === 'Open')
              || response.data.find((m) => m.symbol === targetSym);
            if (sameSym) return sameSym.id;
          }
          // Prioritize active Open intraday markets (15m/5m) over Resolving/Closed rounds on initial load
          const preferredOpen = response.data.find((m) => m.status === 'Open' && (m.windowDuration === '15m' || m.windowDuration === '5m'))
            || response.data.find((m) => m.status === 'Open')
            || (response.data.length > 0 ? response.data[0] : null);
          return preferredOpen ? preferredOpen.id : null;
        });
      }
    } catch (err) {
      if (isMountedRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [options?.symbol, options?.window, options?.status]);

  // Initial fetch and periodic polling fallback (heartbeat) — visibility-aware
  // Polling is paused when document.hidden; WebSocket + Realtime subscriptions keep data live while visible.
  // Heartbeat respects staleTime-like throttling: if data is fresh via WS, interval is the fallback only.
  useEffect(() => {
    isMountedRef.current = true;
    if (shouldPoll()) {
      fetchMarkets();
    }

    const pollMs = options?.pollIntervalMs || STALE_TIMES.markets;
    const interval = window.setInterval(() => {
      if (!shouldPoll()) return;
      fetchMarkets();
    }, pollMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchMarkets();
      }
    };
    const onFocus = () => {
      if (shouldPoll()) fetchMarkets();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      isMountedRef.current = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchMarkets, options?.pollIntervalMs]);

  // Supabase Realtime Subscription for Postgres table 'markets'
  useEffect(() => {
    const channel = subscribeToTable<any>(
      'markets',
      // On Insert
      (rawMarket) => {
        if (!isMountedRef.current) return;
        const newMarket = normalizeMarket(rawMarket);
        setMarkets((prev) => {
          const exists = prev.some((m) => m.id === newMarket.id);
          if (exists) return prev;
          return [newMarket, ...prev];
        });
      },
      // On Update
      (rawMarket) => {
        if (!isMountedRef.current) return;
        const updatedMarket = normalizeMarket(rawMarket);
        setMarkets((prev) =>
          prev.map((m) => (m.id === updatedMarket.id ? { ...m, ...updatedMarket } : m)),
        );
      },
      // On Delete
      (deletedMarket) => {
        if (!isMountedRef.current) return;
        setMarkets((prev) => prev.filter((m) => m.id !== deletedMarket.id));
      },
    );

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const selectedMarket = markets.find((m) => m.id === selectedMarketId) ?? null;

  // Auto-fetch fresh markets immediately when the active selected market passes its closeTimestamp
  useEffect(() => {
    if (!selectedMarket?.closeTimestamp) return;
    const closeMs = new Date(selectedMarket.closeTimestamp).getTime();
    if (isNaN(closeMs) || closeMs <= 0) return;

    const remainingMs = closeMs - Date.now();
    if (remainingMs > 0) {
      const timeout = setTimeout(() => {
        if (isMountedRef.current && shouldPoll()) {
          fetchMarkets();
        }
      }, remainingMs + 500);
      return () => clearTimeout(timeout);
    }
  }, [selectedMarket?.id, selectedMarket?.closeTimestamp, fetchMarkets]);

  // Real-time market tick listener via multiplexed telemetry bus
  useEffect(() => {
    let tickRaf: number | null = null;
    const pendingTicks = new Map<string, MarketTickData>();

    const unsubTicks = telemetryClient.on('market_ticks', (ticks: MarketTickData[]) => {
      for (const t of ticks) {
        if (t.marketId) pendingTicks.set(t.marketId, t);
      }
      if (tickRaf == null) {
        tickRaf = requestAnimationFrame(() => {
          tickRaf = null;
          if (!isMountedRef.current || pendingTicks.size === 0) return;
          setMarkets((prev) => {
            let changed = false;
            const next = prev.map((m) => {
              const tick = pendingTicks.get(m.id);
              if (tick) {
                changed = true;
                return {
                  ...m,
                  impliedProbYes: tick.impliedProb,
                  fairValueYes: tick.fairValue,
                  edgePercentage: tick.edge,
                };
              }
              return m;
            });
            pendingTicks.clear();
            return changed ? next : prev;
          });
        });
      }
    });

    return () => {
      unsubTicks();
      if (tickRaf != null) cancelAnimationFrame(tickRaf);
    };
  }, []);

  const updateMarketFromTick = useCallback(
    (tick: {
      marketId: string;
      impliedProb: number;
      fairValue: number;
      edge: number;
      timeLeftSeconds: number;
    }) => {
      setMarkets((prev) =>
        prev.map((m) => {
          if (m.id === tick.marketId) {
            return {
              ...m,
              impliedProbYes: tick.impliedProb,
              fairValueYes: tick.fairValue,
              edgePercentage: tick.edge,
            };
          }
          return m;
        }),
      );
    },
    [],
  );

  return {
    markets,
    selectedMarket,
    selectedMarketId,
    setSelectedMarketId,
    loading,
    error,
    refreshMarkets: fetchMarkets,
    updateMarketFromTick,
  };
}
