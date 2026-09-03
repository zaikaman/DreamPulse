import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import jwt from 'jsonwebtoken';
import {
  AUTH_EIP712_DOMAIN,
  AUTH_EIP712_TYPES,
  verifyAuthSignature,
  mintSupabaseJwt,
  verifyAndMint,
  isSupabaseJwtConfigured,
  clearNonceCache,
  isNonceReplay,
} from '../src/services/auth-service.js';
import {
  authenticateRequest,
  requireWalletAuth,
  optionalWalletAuth,
  isSweeperTriggerRequest,
  checkSessionDelegationAuth,
} from '../src/middleware/wallet-auth.js';
import { sessionService } from '../src/services/session-service.js';
import { JWT_COOKIE_NAME } from '../src/config/cookie.js';
import { env } from '../src/config/env.js';

describe('AuthService & WalletAuth Middleware Comprehensive Suite', () => {
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

  describe('auth-service.ts', () => {
    it('checks isSupabaseJwtConfigured correctly', () => {
      expect(isSupabaseJwtConfigured()).toBe(true);

      (env as any).SUPABASE_JWT_SECRET = '';
      process.env.SUPABASE_JWT_SECRET = '';
      expect(isSupabaseJwtConfigured()).toBe(false);

      (env as any).SUPABASE_JWT_SECRET = 'short';
      process.env.SUPABASE_JWT_SECRET = 'short';
      expect(isSupabaseJwtConfigured()).toBe(false);

      (env as any).SUPABASE_JWT_SECRET = 'mock-supabase-secret-12345';
      process.env.SUPABASE_JWT_SECRET = 'mock-supabase-secret-12345';
      expect(isSupabaseJwtConfigured()).toBe(false);

      (env as any).SUPABASE_JWT_SECRET = mockJwtSecret;
      process.env.SUPABASE_JWT_SECRET = mockJwtSecret;
      expect(isSupabaseJwtConfigured()).toBe(true);
    });

    it('rejects invalid parameters in verifyAuthSignature', async () => {
      const nowSec = Math.floor(Date.now() / 1000);

      // Invalid userAddress
      let res = await verifyAuthSignature({
        userAddress: 'not-an-address',
        signature: '0x123',
        nonce: 'valid-nonce-1234',
        issuedAt: nowSec,
        expiresAt: nowSec + 3600,
      });
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Invalid userAddress');

      // Invalid signature format
      res = await verifyAuthSignature({
        userAddress,
        signature: 'invalid-sig',
        nonce: 'valid-nonce-1234',
        issuedAt: nowSec,
        expiresAt: nowSec + 3600,
      });
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Invalid signature');

      // Invalid nonce
      res = await verifyAuthSignature({
        userAddress,
        signature: '0x' + 'a'.repeat(130),
        nonce: 'short',
        issuedAt: nowSec,
        expiresAt: nowSec + 3600,
      });
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Invalid nonce');

      // Invalid timestamps
      res = await verifyAuthSignature({
        userAddress,
        signature: '0x' + 'a'.repeat(130),
        nonce: 'valid-nonce-1234',
        issuedAt: NaN,
        expiresAt: nowSec + 3600,
      });
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Invalid timestamps');

      // Skew too large
      res = await verifyAuthSignature({
        userAddress,
        signature: '0x' + 'a'.repeat(130),
        nonce: 'valid-nonce-1234',
        issuedAt: nowSec - 600,
        expiresAt: nowSec + 3600,
      });
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('skew too large');

      // Already expired
      res = await verifyAuthSignature({
        userAddress,
        signature: '0x' + 'a'.repeat(130),
        nonce: 'valid-nonce-1234',
        issuedAt: nowSec,
        expiresAt: nowSec - 10,
      });
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('expired');

      // Window too long
      res = await verifyAuthSignature({
        userAddress,
        signature: '0x' + 'a'.repeat(130),
        nonce: 'valid-nonce-1234',
        issuedAt: nowSec,
        expiresAt: nowSec + 8 * 24 * 3600,
      });
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Auth window too long');

      // Window too short
      res = await verifyAuthSignature({
        userAddress,
        signature: '0x' + 'a'.repeat(130),
        nonce: 'valid-nonce-1234',
        issuedAt: nowSec,
        expiresAt: nowSec + 30,
      });
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Auth window too short');
    });

    it('successfully verifies valid EIP-712 signature and mints JWT', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const expiresAt = nowSec + 3600;
      const nonce = 'session-nonce-random-123456';

      const signature = await testAccount.signTypedData({
        domain: AUTH_EIP712_DOMAIN,
        types: AUTH_EIP712_TYPES,
        primaryType: 'Auth',
        message: {
          wallet: userAddress,
          nonce,
          issuedAt: BigInt(nowSec),
          expiresAt: BigInt(expiresAt),
        },
      });

      const verifyRes = await verifyAuthSignature({
        userAddress,
        signature,
        nonce,
        issuedAt: nowSec,
        expiresAt,
      });
      expect(verifyRes.valid).toBe(true);

      const mintRes = mintSupabaseJwt(userAddress);
      expect(mintRes.token).toBeDefined();
      expect(mintRes.userAddress.toLowerCase()).toBe(userAddress.toLowerCase());

      const decoded: any = jwt.verify(mintRes.token, mockJwtSecret);
      expect(decoded.user_address).toBe(userAddress.toLowerCase());
      expect(decoded.aud).toBe('authenticated');
      expect(decoded.role).toBe('authenticated');

      const nonce2 = 'session-nonce-random-789012';
      const signature2 = await testAccount.signTypedData({
        domain: AUTH_EIP712_DOMAIN,
        types: AUTH_EIP712_TYPES,
        primaryType: 'Auth',
        message: {
          wallet: userAddress,
          nonce: nonce2,
          issuedAt: BigInt(nowSec),
          expiresAt: BigInt(expiresAt),
        },
      });

      const combinedRes = await verifyAndMint({
        userAddress,
        signature: signature2,
        nonce: nonce2,
        issuedAt: nowSec,
        expiresAt,
      });
      expect(combinedRes.token).toBeDefined();
    });

    it('rejects replayed nonce on verifyAuthSignature', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const expiresAt = nowSec + 3600;
      const nonce = 'replay-nonce-test-12345678';

      const signature = await testAccount.signTypedData({
        domain: AUTH_EIP712_DOMAIN,
        types: AUTH_EIP712_TYPES,
        primaryType: 'Auth',
        message: {
          wallet: userAddress,
          nonce,
          issuedAt: BigInt(nowSec),
          expiresAt: BigInt(expiresAt),
        },
      });

      const firstVerify = await verifyAuthSignature({
        userAddress,
        signature,
        nonce,
        issuedAt: nowSec,
        expiresAt,
      });
      expect(firstVerify.valid).toBe(true);
      expect(isNonceReplay(nonce)).toBe(true);

      // Second attempt with exact same nonce and signature must fail immediately
      const secondVerify = await verifyAuthSignature({
        userAddress,
        signature,
        nonce,
        issuedAt: nowSec,
        expiresAt,
      });
      expect(secondVerify.valid).toBe(false);
      expect(secondVerify.reason).toContain('Nonce already used (replay detected)');
    });

    it('rejects mintSupabaseJwt when secret is missing or address is invalid', () => {
      (env as any).SUPABASE_JWT_SECRET = '';
      process.env.SUPABASE_JWT_SECRET = '';
      expect(() => mintSupabaseJwt(userAddress)).toThrow('SUPABASE_JWT_SECRET not configured');

      (env as any).SUPABASE_JWT_SECRET = mockJwtSecret;
      process.env.SUPABASE_JWT_SECRET = mockJwtSecret;
      expect(() => mintSupabaseJwt('invalid-address')).toThrow('Invalid userAddress');
    });

    it('rejects verifyAndMint on signature mismatch', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const expiresAt = nowSec + 3600;
      const nonce = 'session-nonce-random-123456';

      const otherAccount = privateKeyToAccount(generatePrivateKey());
      const signature = await otherAccount.signTypedData({
        domain: AUTH_EIP712_DOMAIN,
        types: AUTH_EIP712_TYPES,
        primaryType: 'Auth',
        message: {
          wallet: userAddress,
          nonce,
          issuedAt: BigInt(nowSec),
          expiresAt: BigInt(expiresAt),
        },
      });

      await expect(
        verifyAndMint({
          userAddress,
          signature,
          nonce,
          issuedAt: nowSec,
          expiresAt,
        }),
      ).rejects.toThrow();
    });
  });

  describe('wallet-auth.ts middleware', () => {
    function createMockRes(): { res: Response; statusSpy: any; jsonSpy: any } {
      const statusSpy = vi.fn().mockReturnThis();
      const jsonSpy = vi.fn().mockReturnThis();
      const res = {
        status: statusSpy,
        json: jsonSpy,
        getHeader: vi.fn(),
        setHeader: vi.fn(),
      } as unknown as Response;
      return { res, statusSpy, jsonSpy };
    }

    it('authenticates request via Authorization Bearer header', async () => {
      const mint = mintSupabaseJwt(userAddress);
      const req = {
        headers: {
          authorization: `Bearer ${mint.token}`,
        },
      } as unknown as Request;

      const auth = await authenticateRequest(req);
      expect(auth.address?.toLowerCase()).toBe(userAddress.toLowerCase());
      expect(auth.method).toBe('bearer');
      expect(auth.error).toBeNull();
    });

    it('authenticates request via x-auth-token header and cookies', async () => {
      const mint = mintSupabaseJwt(userAddress);
      const reqHeader = {
        headers: {
          'x-auth-token': mint.token,
        },
      } as unknown as Request;

      let auth = await authenticateRequest(reqHeader);
      expect(auth.address?.toLowerCase()).toBe(userAddress.toLowerCase());
      expect(auth.method).toBe('bearer');

      // Via cookie
      const reqCookie = {
        headers: {
          cookie: `${JWT_COOKIE_NAME}=${mint.token}`,
        },
      } as unknown as Request;

      auth = await authenticateRequest(reqCookie);
      expect(auth.address?.toLowerCase()).toBe(userAddress.toLowerCase());
      expect(auth.method).toBe('bearer');
    });

    it('handles expired and invalid Bearer tokens', async () => {
      const expiredPayload = {
        aud: 'authenticated',
        role: 'authenticated',
        sub: userAddress.toLowerCase(),
        user_address: userAddress.toLowerCase(),
        exp: Math.floor(Date.now() / 1000) - 100,
      };
      const expiredToken = jwt.sign(expiredPayload, mockJwtSecret, { algorithm: 'HS256' });

      const reqExpired = {
        headers: { authorization: `Bearer ${expiredToken}` },
      } as unknown as Request;

      const authExpired = await authenticateRequest(reqExpired);
      expect(authExpired.address).toBeNull();
      expect(authExpired.error).toMatch(/expired/i);

      // Invalid token string
      const reqInvalid = {
        headers: { authorization: 'Bearer invalid.jwt.token.string' },
      } as unknown as Request;

      const authInvalid = await authenticateRequest(reqInvalid);
      expect(authInvalid.address).toBeNull();
      expect(authInvalid.error).toContain('Invalid Bearer token');

      // Token missing user_address
      const noAddressToken = jwt.sign({ aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 1000 }, mockJwtSecret);
      const reqNoAddr = {
        headers: { authorization: `Bearer ${noAddressToken}` },
      } as unknown as Request;
      const authNoAddr = await authenticateRequest(reqNoAddr);
      expect(authNoAddr.error).toContain('missing user_address claim');
    });

    it('authenticates request via EIP-712 auth headers', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const expiresAt = nowSec + 3600;
      const nonce = 'eip-auth-test-nonce-12345678';

      const signature = await testAccount.signTypedData({
        domain: AUTH_EIP712_DOMAIN,
        types: AUTH_EIP712_TYPES,
        primaryType: 'Auth',
        message: {
          wallet: userAddress,
          nonce,
          issuedAt: BigInt(nowSec),
          expiresAt: BigInt(expiresAt),
        },
      });

      const req = {
        headers: {
          'x-user-address': userAddress,
          'x-auth-signature': signature,
          'x-auth-nonce': nonce,
          'x-auth-issued-at': String(nowSec),
          'x-auth-expires-at': String(expiresAt),
        },
      } as unknown as Request;

      const auth = await authenticateRequest(req);
      expect(auth.address?.toLowerCase()).toBe(userAddress.toLowerCase());
      expect(auth.method).toBe('eip712');
    });

    it('rejects incomplete or invalid EIP-712 auth headers', async () => {
      const reqIncomplete = {
        headers: {
          'x-auth-signature': '0x' + 'a'.repeat(130),
          'x-auth-nonce': 'some-nonce',
        },
      } as unknown as Request;
      const auth = await authenticateRequest(reqIncomplete);
      expect(auth.error).toContain('Incomplete EIP-712 auth headers');

      const reqInvalidAddr = {
        headers: {
          'x-user-address': 'invalid-addr',
          'x-auth-signature': '0x' + 'a'.repeat(130),
          'x-auth-nonce': 'valid-nonce-1234',
          'x-auth-issued-at': '12345',
          'x-auth-expires-at': '12346',
        },
      } as unknown as Request;
      const authInvalidAddr = await authenticateRequest(reqInvalidAddr);
      expect(authInvalidAddr.error).toContain('Invalid x-user-address');
    });

    it('authenticates request via SIWE message headers (raw and base64)', async () => {
      const message = `dreampulse.io wants you to sign in with your Ethereum account:\n${userAddress}\n\nSign in to DreamPulse\n\nURI: https://dreampulse.io\nVersion: 1\nChain ID: 50312\nNonce: 12345678\nIssued At: 2026-08-31T00:00:00.000Z`;
      const signature = await testAccount.signMessage({ message });

      // Raw message
      const reqRaw = {
        headers: {
          'x-siwe-address': userAddress,
          'x-siwe-message': message,
          'x-siwe-signature': signature,
        },
      } as unknown as Request;

      let auth = await authenticateRequest(reqRaw);
      expect(auth.address?.toLowerCase()).toBe(userAddress.toLowerCase());
      expect(auth.method).toBe('siwe');

      // Base64 encoded message
      const b64 = Buffer.from(message).toString('base64');
      const reqB64 = {
        headers: {
          'x-siwe-address': userAddress,
          'x-siwe-message-b64': b64,
          'x-siwe-signature': signature,
        },
      } as unknown as Request;

      auth = await authenticateRequest(reqB64);
      expect(auth.address?.toLowerCase()).toBe(userAddress.toLowerCase());
      expect(auth.method).toBe('siwe');
    });

    it('rejects spoofed address mismatches in requireWalletAuth', async () => {
      const mint = mintSupabaseJwt(userAddress);
      const otherAccount = privateKeyToAccount(generatePrivateKey());

      const reqSpoof = {
        headers: {
          authorization: `Bearer ${mint.token}`,
        },
        body: {
          userAddress: otherAccount.address,
        },
        query: {},
        params: {},
      } as unknown as Request;

      const { res, statusSpy, jsonSpy } = createMockRes();
      const next = vi.fn();

      await requireWalletAuth(reqSpoof, res, next);
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('address spoofing detected'),
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('normalizes verified address onto request and calls next in requireWalletAuth', async () => {
      const mint = mintSupabaseJwt(userAddress);
      const req = {
        headers: {
          authorization: `Bearer ${mint.token}`,
        },
        body: {
          userAddress: userAddress.toLowerCase(),
        },
        query: {
          userAddress: userAddress.toLowerCase(),
        },
        params: {
          userAddress: userAddress.toLowerCase(),
        },
      } as unknown as Request;

      const { res } = createMockRes();
      const next = vi.fn();

      await requireWalletAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.walletAddress?.toLowerCase()).toBe(userAddress.toLowerCase());
      expect(req.authMethod).toBe('bearer');
    });

    it('passes unauthenticated requests in optionalWalletAuth when no headers present', async () => {
      const req = {
        headers: {},
        query: {},
        params: {},
      } as unknown as Request;

      const { res } = createMockRes();
      const next = vi.fn();

      await optionalWalletAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.walletAddress).toBeUndefined();
    });

    it('verifies and attaches address in optionalWalletAuth when valid headers present', async () => {
      const mint = mintSupabaseJwt(userAddress);
      const req = {
        headers: {
          authorization: `Bearer ${mint.token}`,
        },
        query: {
          userAddress: userAddress.toLowerCase(),
        },
        params: {},
      } as unknown as Request;

      const { res } = createMockRes();
      const next = vi.fn();

      await optionalWalletAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.walletAddress?.toLowerCase()).toBe(userAddress.toLowerCase());
    });

    it('enforces non-test environment rejection on missing auth in requireWalletAuth', async () => {
      process.env.NODE_ENV = 'production';
      process.env.VITEST = '';

      const req = {
        headers: {},
        body: {},
        query: {},
        params: {},
      } as unknown as Request;

      const { res, statusSpy, jsonSpy } = createMockRes();
      const next = vi.fn();

      await requireWalletAuth(req, res, next);
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Missing wallet authentication'),
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('allows direct on-chain order placement with txHash and userAddress in production mode without prior JWT', async () => {
      process.env.NODE_ENV = 'production';
      process.env.VITEST = '';

      const req = {
        originalUrl: '/api/v1/orders/place',
        headers: {},
        body: {
          userAddress,
          txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          marketId: 'test-market-id',
        },
        query: {},
        params: {},
      } as unknown as Request;

      const { res, statusSpy } = createMockRes();
      const next = vi.fn();

      await requireWalletAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalledWith(401);
      expect(req.walletAddress?.toLowerCase()).toBe(userAddress.toLowerCase());
      expect(req.authMethod).toBe('txHash');
    });

    it('rejects spoofed address mismatch even when txHash is provided in order placement', async () => {
      process.env.NODE_ENV = 'production';
      process.env.VITEST = '';

      const otherAccount = privateKeyToAccount(generatePrivateKey());
      const req = {
        originalUrl: '/api/v1/orders/place',
        headers: {},
        body: {
          userAddress,
          txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          marketId: 'test-market-id',
        },
        query: {
          userAddress: otherAccount.address, // mismatch spoof
        },
        params: {},
      } as unknown as Request;

      const { res, statusSpy, jsonSpy } = createMockRes();
      const next = vi.fn();

      await requireWalletAuth(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('address spoofing detected'),
        }),
      );
    });

    it('allows txHash order submission even if an expired bearer token is present', async () => {
      process.env.NODE_ENV = 'production';
      process.env.VITEST = '';

      const expiredPayload = {
        aud: 'authenticated',
        role: 'authenticated',
        sub: userAddress.toLowerCase(),
        user_address: userAddress.toLowerCase(),
        exp: Math.floor(Date.now() / 1000) - 3600,
      };
      const expiredToken = jwt.sign(expiredPayload, mockJwtSecret, { algorithm: 'HS256' });

      const req = {
        originalUrl: '/api/v1/orders/place',
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
        body: {
          userAddress,
          txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          marketId: 'test-market-id',
        },
        query: {},
        params: {},
      } as unknown as Request;

      const { res, statusSpy } = createMockRes();
      const next = vi.fn();

      await requireWalletAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalledWith(401);
      expect(req.walletAddress?.toLowerCase()).toBe(userAddress.toLowerCase());
      expect(req.authMethod).toBe('txHash');
    });

    it('handles optionalWalletAuth address mismatch and invalid token downgrades gracefully', async () => {
      const otherAccount = privateKeyToAccount(generatePrivateKey());
      const mint = mintSupabaseJwt(userAddress);

      // Mismatch between authenticated JWT and query param in optional auth
      const reqMismatch = {
        headers: {
          authorization: `Bearer ${mint.token}`,
        },
        query: {
          userAddress: otherAccount.address, // mismatch
        },
        params: {},
      } as unknown as Request;

      const { res: resMismatch } = createMockRes();
      const nextMismatch = vi.fn();
      await optionalWalletAuth(reqMismatch, resMismatch, nextMismatch);
      expect(nextMismatch).toHaveBeenCalled();

      // Invalid token in optional auth
      const reqInvalid = {
        headers: {
          authorization: 'Bearer invalid.token.payload',
        },
        query: {},
        params: {},
      } as unknown as Request;

      const { res: resInvalid } = createMockRes();
      const nextInvalid = vi.fn();
      await optionalWalletAuth(reqInvalid, resInvalid, nextInvalid);
      expect(nextInvalid).toHaveBeenCalled();
    });

    it('covers auth-service nonce expiration, minting validation throws, and verification errors', async () => {
      const { rememberNonce, isNonceReplay } = await import('../src/services/auth-service.js');
      // Expired nonce
      const pastSec = Math.floor(Date.now() / 1000) - 10;
      rememberNonce('expired-nonce-12345', pastSec);
      expect(isNonceReplay('expired-nonce-12345')).toBe(false);

      // mintSupabaseJwt error throws
      (env as any).SUPABASE_JWT_SECRET = '';
      process.env.SUPABASE_JWT_SECRET = '';
      expect(() => mintSupabaseJwt(userAddress)).toThrow('SUPABASE_JWT_SECRET not configured');

      (env as any).SUPABASE_JWT_SECRET = mockJwtSecret;
      process.env.SUPABASE_JWT_SECRET = mockJwtSecret;
      expect(() => mintSupabaseJwt('invalid-address')).toThrow('Invalid userAddress');

      // verifyAuthSignature throw catch branch
      const res = await verifyAuthSignature({
        userAddress,
        signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
        nonce: 'valid-nonce-length-123',
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });
      expect(res.valid).toBe(false);
    });

    it('detects isSweeperTriggerRequest for sweeper endpoints', () => {
      expect(isSweeperTriggerRequest({ path: '/api/v1/sweeper/trigger' } as Request)).toBe(true);
      expect(isSweeperTriggerRequest({ originalUrl: '/sweeper/trigger' } as Request)).toBe(true);
      expect(isSweeperTriggerRequest({ url: '/api/v1/orders/place' } as Request)).toBe(false);
    });

    it('allows users with active session delegation to trigger batch sweeps', async () => {
      vi.spyOn(sessionService, 'getUserActiveSession').mockResolvedValue({
        id: 'session-123',
        userAddress: userAddress as any,
        operatorAddress: userAddress as any,
        permissions: ['placeOrderFor'],
        maxTradeSize: 100,
        dailyVolumeCap: 1000,
        spentToday: 0,
        lastSpendResetTimestamp: Date.now(),
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        isActive: true,
        nonce: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const req = {
        originalUrl: '/api/v1/sweeper/trigger',
        body: {
          userAddress,
        },
        headers: {},
      } as unknown as Request;

      const auth = await authenticateRequest(req);
      expect(auth.address?.toLowerCase()).toBe(userAddress.toLowerCase());
      expect(auth.method).toBe('session');
      expect(auth.error).toBeNull();

      const { res } = createMockRes();
      const next = vi.fn();
      await requireWalletAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect((req as any).walletAddress?.toLowerCase()).toBe(userAddress.toLowerCase());
      expect((req as any).authMethod).toBe('session');
    });

    it('allows sweeper trigger when JWT is expired but active session delegation exists', async () => {
      const expiredPayload = {
        aud: 'authenticated',
        role: 'authenticated',
        sub: userAddress.toLowerCase(),
        user_address: userAddress.toLowerCase(),
        exp: Math.floor(Date.now() / 1000) - 60,
      };
      const expiredToken = jwt.sign(expiredPayload, mockJwtSecret, { algorithm: 'HS256' });

      vi.spyOn(sessionService, 'getUserActiveSession').mockResolvedValueOnce({
        id: 'session-456',
        userAddress: userAddress as any,
        operatorAddress: userAddress as any,
        permissions: ['placeOrderFor'],
        maxTradeSize: 100,
        dailyVolumeCap: 1000,
        spentToday: 0,
        lastSpendResetTimestamp: Date.now(),
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        isActive: true,
        nonce: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const req = {
        originalUrl: '/api/v1/sweeper/trigger',
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
        body: {
          userAddress,
        },
      } as unknown as Request;

      const auth = await authenticateRequest(req);
      expect(auth.address?.toLowerCase()).toBe(userAddress.toLowerCase());
      expect(auth.method).toBe('session');
      expect(auth.error).toBeNull();
    });

    it('rejects sweeper trigger when JWT is expired and no active session delegation exists', async () => {
      const expiredPayload = {
        aud: 'authenticated',
        role: 'authenticated',
        sub: userAddress.toLowerCase(),
        user_address: userAddress.toLowerCase(),
        exp: Math.floor(Date.now() / 1000) - 60,
      };
      const expiredToken = jwt.sign(expiredPayload, mockJwtSecret, { algorithm: 'HS256' });

      vi.spyOn(sessionService, 'getUserActiveSession').mockResolvedValueOnce(null);

      const req = {
        originalUrl: '/api/v1/sweeper/trigger',
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
        body: {
          userAddress,
        },
      } as unknown as Request;

      const auth = await authenticateRequest(req);
      expect(auth.address).toBeNull();
      expect(auth.error).toMatch(/expired/i);

      const { res, statusSpy, jsonSpy } = createMockRes();
      const next = vi.fn();
      await requireWalletAuth(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.stringMatching(/expired/i),
      }));
    });
  });
});

