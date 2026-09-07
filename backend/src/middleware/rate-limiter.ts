import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import { isAddress } from 'viem';

export function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

export interface AiRateLimiterOptions {
  windowMs?: number;
  limit?: number;
  skipInTests?: boolean;
}

/**
 * Creates a rate limiter specifically tuned for AI generation endpoints.
 * Limits requests per wallet address (if authenticated) or falls back to IP address.
 */
export function createAiRateLimiter(options: AiRateLimiterOptions = {}) {
  const windowMs = options.windowMs ?? 60 * 1000; // 1 minute window
  const limit = options.limit ?? 5; // 5 requests per window
  const skipInTests = options.skipInTests ?? true;

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    statusCode: 429,
    message: {
      success: false,
      error: `Too many strategy generation requests. Rate limit is ${limit} requests per minute. Please try again shortly.`,
    },
    keyGenerator: (req: Request): string => {
      // 1. Authoritative wallet address verified by requireWalletAuth
      if (req.walletAddress) {
        return `wallet:${req.walletAddress.toLowerCase()}`;
      }

      // 2. Claimed wallet address in headers or request body
      const claimed = (req.headers['x-user-address'] || req.body?.userAddress) as string | undefined;
      if (claimed && typeof claimed === 'string' && isAddress(claimed)) {
        return `wallet:${claimed.toLowerCase()}`;
      }

      // 3. Client IP address fallback
      const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
      return `ip:${ipKeyGenerator(ip)}`;
    },
    skip: (req: Request): boolean => {
      if (skipInTests && isTestEnv() && req.headers['x-test-rate-limit'] !== 'true') {
        return true;
      }
      return false;
    },
    validate: {
      trustProxy: false,
      xForwardedForHeader: false,
    },
  });
}

/**
 * Global rate limiter for AI agent strategy generation:
 * Enforces a strict 5 requests per minute per wallet/IP ceiling to safeguard LLM quotas.
 */
export const aiGenerationRateLimiter = createAiRateLimiter({
  windowMs: 60 * 1000,
  limit: 5,
});
