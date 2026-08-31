import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  parseCookies,
  getCookie,
  setAuthCookie,
  clearAuthCookie,
  setSessionCookie,
  clearSessionCookie,
  JWT_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from '../src/config/cookie.js';
import {
  somniaShannonTestnet,
  SOMNIA_ADDRESSES,
  MARKET_STATUS,
  getOperatorGasBalance,
  hasOperatorGas,
  invalidateOperatorGasCache,
  executeOperatorTx,
  executeOperatorWriteContract,
} from '../src/config/somnia.js';
import {
  getServiceSupabase,
  getAnonSupabase,
  isPersistenceEnabled,
} from '../src/config/supabase.js';
import {
  OPERATOR_SELECTORS,
  PLACE_SELECTORS,
  probeOnChainOperatorAuthorization,
  checkOnChainOperatorAuthorization,
  checkVaultWithdrawableBalance,
} from '../src/config/permissions-abi.js';

describe('Config, Cookies, Blockchain & System Bootstrap Suite', () => {
  describe('cookie.ts', () => {
    it('parses cookies from request headers', () => {
      const req = {
        headers: {
          cookie: `${JWT_COOKIE_NAME}=token123; other=hello%20world; empty=;`,
        },
      } as unknown as Request;

      const cookies = parseCookies(req);
      expect(cookies[JWT_COOKIE_NAME]).toBe('token123');
      expect(cookies.other).toBe('hello world');
      expect(getCookie(req, JWT_COOKIE_NAME)).toBe('token123');
      expect(getCookie(req, 'missing')).toBeUndefined();
    });

    it('returns empty object when cookie header is missing', () => {
      const req = { headers: {} } as unknown as Request;
      expect(parseCookies(req)).toEqual({});
      expect(getCookie(req, JWT_COOKIE_NAME)).toBeUndefined();
    });

    it('sets and clears auth cookie with Set-Cookie header', () => {
      const headers: Record<string, any> = {};
      const res = {
        getHeader: (name: string) => headers[name],
        setHeader: (name: string, val: any) => {
          headers[name] = val;
        },
      } as unknown as Response;

      const expSec = Math.floor(Date.now() / 1000) + 3600;
      setAuthCookie(res, 'mock-jwt-token', expSec);
      expect(headers['Set-Cookie']).toBeDefined();
      expect(String(headers['Set-Cookie'])).toContain(JWT_COOKIE_NAME);
      expect(String(headers['Set-Cookie'])).toContain('HttpOnly');

      clearAuthCookie(res);
      expect(String(headers['Set-Cookie'])).toContain('Max-Age=0');
    });

    it('sets and clears session cookie', () => {
      const headers: Record<string, any> = {};
      const res = {
        getHeader: (name: string) => headers[name],
        setHeader: (name: string, val: any) => {
          headers[name] = val;
        },
      } as unknown as Response;

      const futureIso = new Date(Date.now() + 3600 * 1000).toISOString();
      setSessionCookie(res, 'session-abc-123', futureIso);
      expect(String(headers['Set-Cookie'])).toContain(SESSION_COOKIE_NAME);

      clearSessionCookie(res);
      expect(String(headers['Set-Cookie'])).toContain('Max-Age=0');
    });
  });

  describe('somnia.ts', () => {
    it('defines Somnia Shannon Testnet correctly with chain ID 50312', () => {
      expect(somniaShannonTestnet.id).toBe(50312);
      expect(somniaShannonTestnet.name).toBe('Somnia Shannon Testnet');
      expect(SOMNIA_ADDRESSES.chainId).toBe(50312);
      expect(SOMNIA_ADDRESSES.decimals).toBe(6);
    });

    it('exports all standard MARKET_STATUS enum values', () => {
      expect(MARKET_STATUS.Listed).toBe(0);
      expect(MARKET_STATUS.Trading).toBe(1);
      expect(MARKET_STATUS.Locked).toBe(2);
      expect(MARKET_STATUS.Settling).toBe(3);
      expect(MARKET_STATUS.Resolved).toBe(4);
      expect(MARKET_STATUS.Voided).toBe(5);
    });

    it('calculates operator gas balance and validity in test runner', async () => {
      invalidateOperatorGasCache();
      const bal = await getOperatorGasBalance();
      expect(bal).toBeGreaterThan(0n);

      const hasGas = await hasOperatorGas();
      expect(hasGas).toBe(true);
    });

    it('executes simulated operator write contract in test mode', async () => {
      const hash = await executeOperatorWriteContract({
        address: SOMNIA_ADDRESSES.testUsdc,
        abi: [],
        functionName: 'approve',
        args: [SOMNIA_ADDRESSES.binaryModule, 1000000n],
      });
      expect(hash.startsWith('0x')).toBe(true);
    });

    it('executes operation with automatic retry via executeOperatorTx', async () => {
      let attempts = 0;
      const result = await executeOperatorTx(async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('nonce too low');
        }
        return 'success-tx';
      });
      expect(result).toBe('success-tx');
      expect(attempts).toBe(2);
    });
  });

  describe('supabase.ts', () => {
    it('initializes service and anon supabase client singletons', () => {
      const serviceClient = getServiceSupabase();
      const anonClient = getAnonSupabase();
      expect(serviceClient).toBeDefined();
      expect(anonClient).toBeDefined();
    });

    it('identifies test runner persistence behavior', () => {
      expect(isPersistenceEnabled()).toBe(false);
    });
  });

  describe('permissions-abi.ts', () => {
    const owner = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    const operator = SOMNIA_ADDRESSES.operatorAccount;

    it('has standard selectors for operator authorization', () => {
      expect(OPERATOR_SELECTORS.placeOrderFor).toBe('0x80054449');
      expect(OPERATOR_SELECTORS.placeBinaryOrderFor).toBe('0x5d97c566');
      expect(OPERATOR_SELECTORS.cancelOrderFor).toBe('0xe37b444b');
    });

    it('probes on-chain authorization with graceful fallback', async () => {
      const authorized = await checkOnChainOperatorAuthorization(owner, operator);
      expect(typeof authorized).toBe('boolean');

      const balance = await checkVaultWithdrawableBalance(owner, SOMNIA_ADDRESSES.binaryModule);
      expect(typeof balance).toBe('bigint');
    });
  });
});
