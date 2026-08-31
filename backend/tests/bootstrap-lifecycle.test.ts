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
});
