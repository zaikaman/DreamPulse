import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Request, type Response } from 'express';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { app } from '../src/index.js';
import {
  createAiRateLimiter,
  aiGenerationRateLimiter,
} from '../src/middleware/rate-limiter.js';
import { mintSupabaseJwt, clearNonceCache } from '../src/services/auth-service.js';
import { customAgentService } from '../src/services/custom-agent-service.js';
import { env } from '../src/config/env.js';

describe('SEC-07: AI Agent Generation Rate Limiting & Auth Protection', () => {
  const testPrivateKey = generatePrivateKey();
  const testAccount = privateKeyToAccount(testPrivateKey);
  const userAddress = testAccount.address;
  const mockJwtSecret = 'super-secret-jwt-key-with-at-least-32-chars!';

  const originalEnvSecret = (env as any).SUPABASE_JWT_SECRET;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearNonceCache();
    (env as any).SUPABASE_JWT_SECRET = mockJwtSecret;
    process.env.SUPABASE_JWT_SECRET = mockJwtSecret;
    process.env.SUPABASE_JWT_EXPIRY_SECONDS = '3600';
  });

  afterEach(() => {
    clearNonceCache();
    (env as any).SUPABASE_JWT_SECRET = originalEnvSecret;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('createAiRateLimiter middleware unit tests', () => {
    it('enforces limit per wallet and returns 429 when ceiling reached', async () => {
      const testApp = express();
      testApp.use(express.json());

      const limiter = createAiRateLimiter({
        windowMs: 60 * 1000,
        limit: 3,
        skipInTests: false,
      });

      testApp.post(
        '/test/ai-gen',
        (req: Request, _res: Response, next) => {
          // Simulate authenticated wallet from requireWalletAuth
          if (req.headers['x-mock-wallet']) {
            req.walletAddress = req.headers['x-mock-wallet'] as any;
          }
          next();
        },
        limiter,
        (_req: Request, res: Response) => {
          res.json({ success: true });
        }
      );

      const walletA = '0x1111111111111111111111111111111111111111';
      const walletB = '0x2222222222222222222222222222222222222222';

      // Wallet A: 3 allowed requests
      for (let i = 0; i < 3; i++) {
        const res = await request(testApp)
          .post('/test/ai-gen')
          .set('x-mock-wallet', walletA);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }

      // Wallet A: 4th request must be 429 Too Many Requests
      const resA4 = await request(testApp)
        .post('/test/ai-gen')
        .set('x-mock-wallet', walletA);
      expect(resA4.status).toBe(429);
      expect(resA4.body.success).toBe(false);
      expect(resA4.body.error).toContain('Too many strategy generation requests');

      // Wallet B: Has its own quota and succeeds
      const resB1 = await request(testApp)
        .post('/test/ai-gen')
        .set('x-mock-wallet', walletB);
      expect(resB1.status).toBe(200);
      expect(resB1.body.success).toBe(true);
    });

    it('falls back to IP address rate limiting when unauthenticated', async () => {
      const testApp = express();
      testApp.use(express.json());

      const limiter = createAiRateLimiter({
        windowMs: 60 * 1000,
        limit: 2,
        skipInTests: false,
      });

      testApp.post('/test/ai-gen-ip', limiter, (_req: Request, res: Response) => {
        res.json({ success: true });
      });

      // 2 requests allowed
      const res1 = await request(testApp).post('/test/ai-gen-ip');
      expect(res1.status).toBe(200);

      const res2 = await request(testApp).post('/test/ai-gen-ip');
      expect(res2.status).toBe(200);

      // 3rd request blocked by IP rate limit
      const res3 = await request(testApp).post('/test/ai-gen-ip');
      expect(res3.status).toBe(429);
      expect(res3.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/agents/generate endpoint integration', () => {
    it('validates prompt input (rejects empty or excessively long prompt)', async () => {
      const mint = mintSupabaseJwt(userAddress);

      // Empty prompt
      const emptyRes = await request(app)
        .post('/api/v1/agents/generate')
        .set('Authorization', `Bearer ${mint.token}`)
        .send({ prompt: '' });
      expect(emptyRes.status).toBe(400);
      expect(emptyRes.body.success).toBe(false);
      expect(emptyRes.body.error).toContain('Prompt is required');

      // Missing prompt
      const missingRes = await request(app)
        .post('/api/v1/agents/generate')
        .set('Authorization', `Bearer ${mint.token}`)
        .send({});
      expect(missingRes.status).toBe(400);
      expect(missingRes.body.success).toBe(false);

      // Excessively long prompt (>2000 chars)
      const longRes = await request(app)
        .post('/api/v1/agents/generate')
        .set('Authorization', `Bearer ${mint.token}`)
        .send({ prompt: 'A'.repeat(2001) });
      expect(longRes.status).toBe(400);
      expect(longRes.body.success).toBe(false);
      expect(longRes.body.error).toContain('maximum length');
    });

    it('successfully processes valid prompt with authenticated wallet', async () => {
      const mint = mintSupabaseJwt(userAddress);

      const res = await request(app)
        .post('/api/v1/agents/generate')
        .set('Authorization', `Bearer ${mint.token}`)
        .send({ prompt: 'High-frequency momentum sniper on ETH breakouts' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.symbol).toBe('ETH/USD');
    });

    it('enforces production wallet authentication requirement (rejects unauthenticated with 401)', async () => {
      process.env.NODE_ENV = 'production';
      process.env.VITEST = '';

      const unauthRes = await request(app)
        .post('/api/v1/agents/generate')
        .send({ prompt: 'Test prompt without authentication' });

      expect(unauthRes.status).toBe(401);
      expect(unauthRes.body.success).toBe(false);
      expect(unauthRes.body.error).toContain('Missing wallet authentication');
    });

    it('enforces rate limiter when x-test-rate-limit header is provided', async () => {
      const mint = mintSupabaseJwt(userAddress);
      vi.spyOn(customAgentService, 'generateAgentFromPrompt').mockResolvedValue({
        name: 'Mock Rate Limit Test Strategy',
        symbol: 'BTC/USD',
      } as any);

      // Send requests under rate limit
      let hit429 = false;
      for (let i = 0; i < 6; i++) {
        const res = await request(app)
          .post('/api/v1/agents/generate')
          .set('Authorization', `Bearer ${mint.token}`)
          .set('x-test-rate-limit', 'true')
          .send({ prompt: 'High-frequency momentum sniper on BTC breakouts' });

        if (res.status === 429) {
          hit429 = true;
          expect(res.body.success).toBe(false);
          expect(res.body.error).toContain('Too many strategy generation requests');
          break;
        }
      }

      // Exactly at the 6th call (after 5 calls allowed), rate limiter must trigger 429
      expect(hit429).toBe(true);
    });
  });
});
