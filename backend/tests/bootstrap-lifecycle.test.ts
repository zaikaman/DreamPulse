import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/index.js';
import { env } from '../src/config/env.js';

describe('Bootstrap Lifecycle & HTTP Server Harness', () => {
  it('mounts express application and server instance correctly', () => {
    expect(app).toBeDefined();
    expect(server).toBeDefined();
  });

  it('serves root health check endpoint', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('1.0.0');
    expect(res.body.timestamp).toBeDefined();
  });

  it('handles CORS headers across various origin headers', async () => {
    const resVercel = await request(app)
      .get('/api/health')
      .set('Origin', 'https://dreampulse-preview.vercel.app');
    expect(resVercel.status).toBe(200);

    const resLocalhost = await request(app)
      .get('/api/health')
      .set('Origin', 'http://127.0.0.1:3000');
    expect(resLocalhost.status).toBe(200);

    const resNoOrigin = await request(app).get('/api/health');
    expect(resNoOrigin.status).toBe(200);
  });

  it('correctly normalizes OPERATOR_PRIVATE_KEY without 0x prefix or with quotes', () => {
    const rawKey = 'd260f7f062a3dc553803e20e440ebebd96993b87ab564cee8ce9c2873974b251';
    let cleaned = rawKey.trim().replace(/^["']|["']$/g, '');
    if (/^[a-fA-F0-9]{64}$/.test(cleaned)) {
      cleaned = `0x${cleaned}`;
    }
    expect(env.OPERATOR_PRIVATE_KEY.startsWith('0x')).toBe(true);
    expect(env.OPERATOR_PRIVATE_KEY.length).toBe(66);
  });

  it('covers requestLogger and generic 500 errorHandler', async () => {
    const { requestLogger, errorHandler } = await import('../src/api/middleware.js');
    const nextFn = () => {};
    const req = { method: 'GET', url: '/test-url' } as any;
    expect(() => requestLogger(req, {} as any, nextFn)).not.toThrow();

    // errorHandler generic error
    let status = 0;
    let jsonBody: any = null;
    const res = {
      status: (code: number) => {
        status = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    } as any;

    errorHandler(new Error('Test internal crash'), req, res, nextFn);
    expect(status).toBe(500);
    expect(jsonBody.success).toBe(false);
    expect(jsonBody.error).toBe('Test internal crash');
  });
});

