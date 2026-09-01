import WebSocket from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.VITEST = 'true';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.OPERATOR_PRIVATE_KEY = process.env.OPERATOR_PRIVATE_KEY || '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Mock Binance API responses in test / CI environments where external Binance REST is blocked/offline
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  if (urlStr.includes('api.binance.com/api/v3/klines')) {
    try {
      const url = new URL(urlStr);
      const symbol = url.searchParams.get('symbol') || 'BTCUSDT';
      const interval = url.searchParams.get('interval') || '5m';
      const startTime = parseInt(url.searchParams.get('startTime') || `${Date.now() - 3600000}`, 10);
      const endTime = parseInt(url.searchParams.get('endTime') || `${Date.now()}`, 10);
      const limit = parseInt(url.searchParams.get('limit') || '1000', 10);

      const isEth = symbol.toUpperCase().includes('ETH');
      const basePrice = isEth ? 2750 : 96500;
      const decimals = 2;

      const intervalMsMap: Record<string, number> = {
        '1m': 60 * 1000,
        '5m': 5 * 60 * 1000,
        '15m': 15 * 60 * 1000,
        '1h': 60 * 60 * 1000,
      };
      const stepMs = intervalMsMap[interval] || 5 * 60 * 1000;
      const totalSteps = Math.min(limit, Math.max(1, Math.floor((endTime - startTime) / stepMs)));

      const klines: Array<[number, string, string, string, string, string, number, string, number, string, string, string]> = [];
      let prevClose = basePrice;

      for (let i = 0; i < totalSteps; i++) {
        const barTime = startTime + i * stepMs;
        if (barTime > endTime) break;

        const macroTrend = Math.sin(i * 0.08) * 0.008;
        const microNoise = Math.cos(i * 0.35) * 0.0035 + (Math.sin(i * 1.1) * 0.002);
        const impulse = i % 8 === 0 ? (i % 16 === 0 ? 0.004 : -0.0035) : 0;
        const barReturn = macroTrend + microNoise + impulse;

        const open = prevClose;
        const close = Number((open * (1 + barReturn)).toFixed(decimals));
        const high = Number((Math.max(open, close) * (1 + Math.abs(microNoise) * 1.2 + 0.001)).toFixed(decimals));
        const low = Number((Math.min(open, close) * (1 - Math.abs(microNoise) * 1.2 - 0.001)).toFixed(decimals));
        const volume = Number((80 + Math.abs(Math.sin(i * 0.25)) * 350).toFixed(2));

        klines.push([
          barTime,
          open.toFixed(decimals),
          high.toFixed(decimals),
          low.toFixed(decimals),
          close.toFixed(decimals),
          volume.toFixed(2),
          barTime + stepMs - 1,
          '1000000',
          100,
          '500000',
          '500000',
          '0',
        ]);

        prevClose = close;
      }

      return new Response(JSON.stringify(klines), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return originalFetch(input, init);
};


