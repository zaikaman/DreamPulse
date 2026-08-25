import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/api.js';
import type { PortfolioSummary } from '../types/index.js';
import type { WalletState } from './useSessionKey.js';

export interface UseUserPortfolioReturn {
  portfolio: PortfolioSummary | null;
  isLoading: boolean;
  refreshPortfolio: () => Promise<void>;
}

const LOCAL_PORTFOLIO_PREFIX = 'dreampulse_user_portfolio_';

export function useUserPortfolio(wallet?: WalletState): UseUserPortfolioReturn {
  const address = wallet?.isConnected && wallet?.address ? wallet.address.toLowerCase() : null;

  // Initialize from cache so wallet stats never flash 0 or null on mount / re-renders
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(() => {
    if (!address) return null;
    try {
      const cached = localStorage.getItem(`${LOCAL_PORTFOLIO_PREFIX}${address}`);
      if (cached) return JSON.parse(cached);
    } catch {}
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);

  // In-flight and throttle guards
  const inFlightRef = useRef<boolean>(false);
  const lastFetchAtRef = useRef<number>(0);
  const debounceTimerRef = useRef<number | null>(null);
  const currentAddressRef = useRef<string | null>(address);
  currentAddressRef.current = address;

  // Sync cache if active wallet address changes
  useEffect(() => {
    if (!address) {
      setPortfolio(null);
      return;
    }
    try {
      const cached = localStorage.getItem(`${LOCAL_PORTFOLIO_PREFIX}${address}`);
      if (cached) {
        setPortfolio(JSON.parse(cached));
      }
    } catch {}
  }, [address]);

  const fetchPortfolio = useCallback(async (force = false) => {
    const targetAddr = currentAddressRef.current;
    if (!targetAddr) {
      setPortfolio(null);
      return;
    }

    const now = Date.now();
    if (inFlightRef.current) return;
    if (!force && now - lastFetchAtRef.current < 800) return;

    inFlightRef.current = true;
    lastFetchAtRef.current = now;

    try {
      setIsLoading(true);
      const res = await apiClient.getPortfolioSummary(targetAddr);
      // Ensure the response matches the currently active address
      if (res.success && res.data && currentAddressRef.current === targetAddr) {
        setPortfolio(res.data);
        try {
          localStorage.setItem(`${LOCAL_PORTFOLIO_PREFIX}${targetAddr}`, JSON.stringify(res.data));
        } catch {}
      }
    } catch (err) {
      console.warn('[useUserPortfolio] Error fetching portfolio summary:', err);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, []);

  const debouncedFetch = useCallback((delay = 100) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      fetchPortfolio(true);
    }, delay);
  }, [fetchPortfolio]);

  useEffect(() => {
    if (!address) return;

    // Initial fetch on mount / address change
    fetchPortfolio(true);

    // Periodic 5-second polling fallback (was 10s — 2x faster without storm)
    const interval = setInterval(() => fetchPortfolio(false), 5000);

    // Realtime WebSocket subscriber for user trade & settlement events
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let isCleanedUp = false;

    const connectRealtime = () => {
      if (isCleanedUp) return;
      try {
        const wsUrl = (import.meta as any).env?.VITE_BACKEND_WS_URL
          ? (import.meta as any).env.VITE_BACKEND_WS_URL
          : (() => {
              const loc = window.location;
              const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
              const host = loc.hostname;
              const port = loc.port === '5173' ? '5000' : loc.port || '5000';
              return `${protocol}//${host}:${port}/ws/telemetry`;
            })();
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          if (isCleanedUp) {
            try { ws?.close(); } catch {}
            return;
          }
          try {
            ws?.send(JSON.stringify({
              action: 'subscribe',
              channel: 'user_portfolio',
              params: { userAddress: address },
            }));
          } catch {}
        };
        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse((event as MessageEvent).data);
            // ONLY trigger on relevant user events: PnL settlement updates, order fills, or sweeps
            // Do NOT trigger on swarm_pnl_tick (autonomous bot background ticks) to prevent rapid flashing
            if (
              payload.event === 'pnl_update' ||
              payload.event === 'order_filled' ||
              payload.event === 'sweep_completed'
            ) {
              debouncedFetch(100);
            }
          } catch {}
        };
        ws.onclose = () => {
          if (!isCleanedUp) {
            reconnectTimer = window.setTimeout(connectRealtime, 3000);
          }
        };
        ws.onerror = () => {
          try { ws?.close(); } catch {}
        };
      } catch {
        if (!isCleanedUp) {
          reconnectTimer = window.setTimeout(connectRealtime, 3000);
        }
      }
    };

    connectRealtime();

    return () => {
      isCleanedUp = true;
      clearInterval(interval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      try { ws?.close(); } catch {}
    };
  }, [address, fetchPortfolio, debouncedFetch]);

  return { portfolio, isLoading, refreshPortfolio: () => fetchPortfolio(true) };
}
