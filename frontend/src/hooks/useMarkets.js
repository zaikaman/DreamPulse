import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/api.js';
import { subscribeToTable } from '../services/supabase.js';
export function useMarkets(options) {
    const [markets, setMarkets] = useState([]);
    const [selectedMarketId, setSelectedMarketId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const isMountedRef = useRef(true);
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
                // Auto-select first market if none selected
                setSelectedMarketId((prev) => {
                    if (prev && response.data.some((m) => m.id === prev)) {
                        return prev;
                    }
                    return response.data.length > 0 ? response.data[0].id : null;
                });
            }
        }
        catch (err) {
            if (isMountedRef.current) {
                const msg = err instanceof Error ? err.message : String(err);
                setError(msg);
            }
        }
        finally {
            if (isMountedRef.current) {
                setLoading(false);
            }
        }
    }, [options?.symbol, options?.window, options?.status]);
    // Initial fetch and periodic polling
    useEffect(() => {
        isMountedRef.current = true;
        fetchMarkets();
        const interval = setInterval(fetchMarkets, options?.pollIntervalMs || 4000);
        return () => {
            isMountedRef.current = false;
            clearInterval(interval);
        };
    }, [fetchMarkets, options?.pollIntervalMs]);
    // Supabase Realtime Subscription for Postgres table 'markets'
    useEffect(() => {
        const channel = subscribeToTable('markets', 
        // On Insert
        (newMarket) => {
            if (!isMountedRef.current)
                return;
            setMarkets((prev) => {
                const exists = prev.some((m) => m.id === newMarket.id);
                if (exists)
                    return prev;
                return [newMarket, ...prev];
            });
        }, 
        // On Update
        (updatedMarket) => {
            if (!isMountedRef.current)
                return;
            setMarkets((prev) => prev.map((m) => (m.id === updatedMarket.id ? { ...m, ...updatedMarket } : m)));
        }, 
        // On Delete
        (deletedMarket) => {
            if (!isMountedRef.current)
                return;
            setMarkets((prev) => prev.filter((m) => m.id !== deletedMarket.id));
        });
        return () => {
            channel.unsubscribe();
        };
    }, []);
    const selectedMarket = markets.find((m) => m.id === selectedMarketId) || (markets.length > 0 ? markets[0] : null);
    /**
     * Helper to merge a high-frequency WebSocket market tick directly into React state.
     */
    const updateMarketFromTick = useCallback((tick) => {
        setMarkets((prev) => prev.map((m) => {
            if (m.id === tick.marketId) {
                return {
                    ...m,
                    impliedProbYes: tick.impliedProb,
                    fairValueYes: tick.fairValue,
                    edgePercentage: tick.edge,
                };
            }
            return m;
        }));
    }, []);
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
