import { useState, useEffect, useCallback, useRef } from 'react';
import type { Market, MarketStatus } from '../types/index.js';
import { apiClient } from '../services/api.js';
import { subscribeToTable } from '../services/supabase.js';
import { telemetryClient, type MarketTickData } from '../services/telemetry-client.js';
import { shouldPoll, STALE_TIMES } from '../lib/polling.js';

export interface UseMarketsOptions {
  symbol?: string;
  window?: string;
  status?: MarketStatus;
  pollIntervalMs?: number;
}

const LOCAL_MARKETS_CACHE_KEY = 'dreampulse_markets_cache';

export function useMarkets(options?: UseMarketsOptions) {
  const [markets, setMarkets] = useState<Market[]>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_MARKETS_CACHE_KEY);
      if (cached) return JSON.parse(cached);
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
        setMarkets(response.data);
        setError(null);
        try {
          if (!options?.symbol && !options?.window && !options?.status) {
            localStorage.setItem(LOCAL_MARKETS_CACHE_KEY, JSON.stringify(response.data));
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
            const sameSymAndWin = response.data.find((m) => m.symbol === targetSym && (!targetWin || m.windowDuration === targetWin));
            if (sameSymAndWin) return sameSymAndWin.id;
            const sameSym = response.data.find((m) => m.symbol === targetSym);
            if (sameSym) return sameSym.id;
          }
          return response.data.length > 0 ? response.data[0].id : null;
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
    fetchMarkets();

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
    const channel = subscribeToTable<Market>(
      'markets',
      // On Insert
      (newMarket) => {
        if (!isMountedRef.current) return;
        setMarkets((prev) => {
          const exists = prev.some((m) => m.id === newMarket.id);
          if (exists) return prev;
          return [newMarket, ...prev];
        });
      },
      // On Update
      (updatedMarket) => {
        if (!isMountedRef.current) return;
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
        if (isMountedRef.current) {
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
