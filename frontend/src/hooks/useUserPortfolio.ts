import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/api.js';
import type { PortfolioSummary } from '../types/index.js';
import type { WalletState } from './useSessionKey.js';
import { telemetryClient, type OrderFillData, type SweepCompleteData, type PnlUpdateData } from '../services/telemetry-client.js';
import { shouldPoll } from '../lib/polling.js';

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
  const fetchGenRef = useRef(0);
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

    const gen = ++fetchGenRef.current;
    inFlightRef.current = true;
    lastFetchAtRef.current = now;

    try {
      setIsLoading(true);
      const res = await apiClient.getPortfolioSummary(targetAddr);
      if (gen !== fetchGenRef.current) return;
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
    if (shouldPoll()) {
      fetchPortfolio(true);
    }

    // Dynamic user address subscription on multiplexed client
    telemetryClient.setUserAddress(address);

    // Periodic 30-second polling fallback (heartbeat only, instant pushes handle real-time)
    const interval = setInterval(() => {
      if (!shouldPoll()) return;
      fetchPortfolio(false);
    }, 30000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchPortfolio(true);
      }
    };
    const onFocus = () => {
      if (shouldPoll()) {
        fetchPortfolio(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    // Subscribe to real-time user events via shared telemetry bus
    const unsubOrder = telemetryClient.on('order_filled', (order: OrderFillData) => {
      if (!order.userAddress || order.userAddress.toLowerCase() === address) {
        debouncedFetch(100);
      }
    });

    const unsubPnl = telemetryClient.on('pnl_update', (_pnl: PnlUpdateData) => {
      debouncedFetch(100);
    });

    const unsubSweep = telemetryClient.on('sweep_completed', (sweep: SweepCompleteData) => {
      if (!sweep.userAddress || sweep.userAddress.toLowerCase() === address) {
        debouncedFetch(100);
      }
    });

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      unsubOrder();
      unsubPnl();
      unsubSweep();
    };
  }, [address, fetchPortfolio, debouncedFetch]);

  return { portfolio, isLoading, refreshPortfolio: () => fetchPortfolio(true) };
}
