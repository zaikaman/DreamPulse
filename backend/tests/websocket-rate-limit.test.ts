import { describe, it, expect } from 'vitest';
import { WebSocket } from 'ws';
import { TelemetryWebSocketServer } from '../src/websocket/server.js';

const OPEN = WebSocket.OPEN;

function fakeSocket() {
  const sent: unknown[] = [];
  const socket = {
    readyState: OPEN,
    sent,
    closed: false,
    closeCode: undefined as number | undefined,
    send(payload: string) {
      sent.push(JSON.parse(payload as string));
    },
    close(code?: number) {
      this.closed = true;
      this.closeCode = code;
    },
  };
  return socket;
}

describe('BE-BUG-03: WebSocket rate-limiter violation latch', () => {
  it('does not disconnect on a single bursty window (rapid market switching)', () => {
    const gateway = new TelemetryWebSocketServer() as unknown as {
      checkRateLimit(ws: unknown, ip: string): boolean;
      close(): void;
    };
    const ws = fakeSocket();
    const ip = '10.0.0.1';

    // 35 messages inside ONE 1s window: 30 allowed, 5 throttled — but never closed.
    // Old code incremented violations per excess message (33rd msg => 3rd violation => close 1008).
    let closed = false;
    for (let i = 0; i < 35; i++) {
      gateway.checkRateLimit(ws as unknown, ip);
      if (ws.closed) closed = true;
    }
    expect(closed).toBe(false);

    gateway.close();
  });

  it('disconnects only after sustained abuse across consecutive windows', () => {
    const gateway = new TelemetryWebSocketServer() as unknown as {
      checkRateLimit(ws: unknown, ip: string): boolean;
      ipBuckets: Map<string, { windowStart: number }>;
      close(): void;
    };
    const ip = '10.0.0.2';

    const burstOneWindow = () => {
      // Fresh socket per window isolates the per-IP limiter (the BE-BUG-03 latch
      // lives in ipBuckets) from the per-socket limiter, which has its own window.
      const sock = fakeSocket();
      for (let i = 0; i < 35; i++) gateway.checkRateLimit(sock as unknown, ip);
      // Roll into a fresh window for the next burst
      const bucket = gateway.ipBuckets.get(ip)!;
      bucket.windowStart -= 1_100;
      return sock;
    };

    const first = burstOneWindow(); // violation 1
    expect(first.closed).toBe(false);
    const second = burstOneWindow(); // violation 2
    expect(second.closed).toBe(false);
    const third = burstOneWindow(); // violation 3 => sustained abuse => close
    expect(third.closed).toBe(true);
    expect(third.closeCode).toBe(1008);

    gateway.close();
  });

  it('forgives stale violations so well-behaved clients recover (no permanent latch)', () => {
    const gateway = new TelemetryWebSocketServer() as unknown as {
      checkRateLimit(ws: unknown, ip: string): boolean;
      ipBuckets: Map<string, { windowStart: number; violations: number; lastViolationAt: number }>;
      close(): void;
    };
    const ws = fakeSocket();
    const ip = '10.0.0.3';

    for (let i = 0; i < 35; i++) gateway.checkRateLimit(ws as unknown, ip);
    expect(ws.closed).toBe(false);

    // Simulate 31s of good behavior, then a single legit message must NOT close.
    const bucket = gateway.ipBuckets.get(ip)!;
    expect(bucket.violations).toBe(1);
    bucket.windowStart -= 1_100;
    bucket.lastViolationAt -= 31_000;

    const fresh = fakeSocket();
    expect(gateway.checkRateLimit(fresh as unknown, ip)).toBe(true);
    expect(fresh.closed).toBe(false);
    expect(bucket.violations).toBe(0);

    gateway.close();
  });
});
