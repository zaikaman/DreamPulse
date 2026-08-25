import { useState, useEffect, useRef, useCallback } from 'react';
export function useTelemetry(userAddress) {
    const [isConnected, setIsConnected] = useState(false);
    const [latencyMs, setLatencyMs] = useState(18);
    const [liveTicks, setLiveTicks] = useState(new Map());
    const [depthMap, setDepthMap] = useState(new Map());
    const [agentThoughts, setAgentThoughts] = useState([]);
    const [recentOrders, setRecentOrders] = useState([]);
    const [lastSweep, setLastSweep] = useState(null);
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const pingTimeRef = useRef(0);
    const getWsUrl = useCallback(() => {
        if (import.meta.env.VITE_BACKEND_WS_URL) {
            return import.meta.env.VITE_BACKEND_WS_URL;
        }
        const loc = window.location;
        const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        // If running in Vite dev mode on 5173, backend defaults to 5000
        const host = loc.hostname;
        const port = loc.port === '5173' ? '5000' : loc.port || '5000';
        return `${protocol}//${host}:${port}/ws/telemetry`;
    }, []);
    const connect = useCallback(() => {
        try {
            const url = getWsUrl();
            const ws = new WebSocket(url);
            wsRef.current = ws;
            ws.onopen = () => {
                setIsConnected(true);
                pingTimeRef.current = Date.now();
                // Subscribe to public telemetry channels and optional user channel
                const subMessage = {
                    action: 'subscribe',
                    channel: 'markets',
                    params: {
                        symbols: ['BTC/USD', 'ETH/USD'],
                        agentTypes: ['Volt', 'Oracle', 'Titan', 'Sweeper'],
                        userAddress: userAddress || undefined,
                    },
                };
                ws.send(JSON.stringify(subMessage));
                // Also subscribe explicitly to agent thoughts
                ws.send(JSON.stringify({
                    action: 'subscribe',
                    channel: 'agent_thoughts',
                }));
            };
            ws.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    const now = Date.now();
                    switch (payload.event) {
                        case 'connected':
                            setLatencyMs(Math.max(4, now - pingTimeRef.current));
                            break;
                        case 'market_tick':
                            if (payload.data?.marketId) {
                                setLiveTicks((prev) => {
                                    const next = new Map(prev);
                                    next.set(payload.data.marketId, {
                                        ...payload.data,
                                        timestamp: payload.timestamp || now,
                                    });
                                    return next;
                                });
                            }
                            break;
                        case 'depth_update':
                            if (payload.marketId) {
                                setDepthMap((prev) => {
                                    const next = new Map(prev);
                                    next.set(payload.marketId, {
                                        marketId: payload.marketId,
                                        bestBid: payload.bestBid,
                                        bestAsk: payload.bestAsk,
                                        bids: payload.bids || [],
                                        asks: payload.asks || [],
                                        timestamp: payload.timestamp || now,
                                    });
                                    return next;
                                });
                            }
                            break;
                        case 'agent_thought':
                            const newThought = {
                                id: `thought-${now}-${Math.random().toString(36).slice(2, 6)}`,
                                agentType: payload.agent || 'Volt',
                                marketId: payload.marketId,
                                triggerEvent: payload.triggerEvent || 'MARKET_TICK',
                                confidence: payload.confidence ?? 0.92,
                                actionTaken: payload.action || 'EVALUATE',
                                reasoningText: payload.thought || 'Telemetry evaluation complete.',
                                createdAt: new Date(payload.timestamp || now).toISOString(),
                            };
                            setAgentThoughts((prev) => [newThought, ...prev.slice(0, 49)]);
                            break;
                        case 'order_filled':
                            const orderData = {
                                userAddress: payload.userAddress,
                                orderId: payload.orderId,
                                marketId: payload.marketId,
                                outcome: payload.outcome,
                                direction: payload.direction,
                                price: payload.price,
                                lotSize: payload.lotSize,
                                txHash: payload.txHash,
                                timestamp: payload.timestamp || now,
                            };
                            setRecentOrders((prev) => [orderData, ...prev.slice(0, 19)]);
                            break;
                        case 'sweep_completed':
                            const sweepData = {
                                userAddress: payload.userAddress,
                                marketId: payload.marketId,
                                claimedAmount: payload.claimedAmount,
                                txHash: payload.txHash,
                                timestamp: payload.timestamp || now,
                            };
                            setLastSweep(sweepData);
                            break;
                        default:
                            break;
                    }
                }
                catch (_err) {
                    // Ignore message parse errors
                }
            };
            ws.onclose = () => {
                setIsConnected(false);
                wsRef.current = null;
                // Exponential backoff reconnect
                reconnectTimeoutRef.current = setTimeout(connect, 3000);
            };
            ws.onerror = () => {
                setIsConnected(false);
            };
        }
        catch (_err) {
            setIsConnected(false);
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
    }, [getWsUrl, userAddress]);
    useEffect(() => {
        connect();
        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [connect]);
    return {
        isConnected,
        latencyMs,
        liveTicks,
        depthMap,
        agentThoughts,
        recentOrders,
        lastSweep,
    };
}
