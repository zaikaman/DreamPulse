import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api.js';
import type { PortfolioSummary } from '../types/index.js';
import type { WalletState } from './useSessionKey.js';

export interface UseUserPortfolioReturn {
  portfolio: PortfolioSummary | null;
  isLoading: boolean;
  refreshPortfolio: () => Promise<void>;
}

export function useUserPortfolio(wallet?: WalletState): UseUserPortfolioReturn {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchPortfolio = useCallback(async () => {
    if (!wallet?.isConnected || !wallet?.address) {
      setPortfolio(null);
      return;
    }
    try {
      setIsLoading(true);
      const res = await apiClient.getPortfolioSummary(wallet.address);
      if (res.success && res.data) {
        setPortfolio(res.data);
      }
    } catch (err) {
      console.warn('[useUserPortfolio] Error fetching portfolio summary:', err);
    } finally {
      setIsLoading(false);
    }
  }, [wallet?.isConnected, wallet?.address]);

  useEffect(() => {
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 10000);
    return () => clearInterval(interval);
  }, [fetchPortfolio]);

  return { portfolio, isLoading, refreshPortfolio: fetchPortfolio };
}
