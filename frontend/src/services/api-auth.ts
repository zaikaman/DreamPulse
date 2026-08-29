import type { Address, Hex } from 'viem';
import { web3Service } from './web3.js';

const API_AUTH_STORAGE_KEY = 'dreampulse_api_auth';
const SUPABASE_JWT_KEY = 'dreampulse_supabase_jwt';
const SUPABASE_JWT_EXP_KEY = 'dreampulse_supabase_jwt_exp';

export interface CachedApiAuth {
  address: string; // checksummed
  signature: Hex;
  nonce: string;
  issuedAt: number; // unix seconds
  expiresAt: number; // unix seconds
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function getStoredSupabaseJwtSafe(): { token: string; expiresAt: number } | null {
  if (!isBrowser()) return null;
  try {
    const t = localStorage.getItem(SUPABASE_JWT_KEY);
    const e = localStorage.getItem(SUPABASE_JWT_EXP_KEY);
    if (!t || !e) return null;
    const exp = Number(e);
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000) + 60) return null;
    if (t.length < 20) return null;
    return { token: t, expiresAt: exp };
  } catch {
    return null;
  }
}

export function getStoredApiAuth(): CachedApiAuth | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(API_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedApiAuth;
    if (!parsed.address || !parsed.signature || !parsed.nonce || !parsed.issuedAt || !parsed.expiresAt) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    // Expired or issuedAt skew too large? Keep valid window 7d but issuedAt must be within 5 min skew? For cached, allow reuse until expiresAt -60s
    if (parsed.expiresAt <= nowSec + 60) {
      clearStoredApiAuth();
      return null;
    }
    if (Math.abs(nowSec - parsed.issuedAt) > 7 * 24 * 3600) {
      // issued too long ago, stale
      clearStoredApiAuth();
      return null;
    }
    if (parsed.signature.length < 132 || !parsed.signature.startsWith('0x')) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredApiAuth(auth: CachedApiAuth): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(API_AUTH_STORAGE_KEY, JSON.stringify(auth));
  } catch {}
}

export function clearStoredApiAuth(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(API_AUTH_STORAGE_KEY);
  } catch {}
}

export function getCachedAuthHeaders(): Record<string, string> {
  // 1) Prefer Bearer JWT (minted via POST /auth/wallet-verify) — covers both Supabase RLS and API auth
  const jwt = getStoredSupabaseJwtSafe();
  if (jwt?.token) {
    return { Authorization: `Bearer ${jwt.token}` };
  }
  // 2) Fallback EIP-712 headers cached from last signSupabaseAuth
  const eip = getStoredApiAuth();
  if (eip) {
    // Verify still valid (issuedAt within 5 min skew is checked server-side; for cached we allow reuse until expiry)
    // Server checks |now - issuedAt| <= 300, so cached with old issuedAt would fail after 5 min.
    // To avoid 401 after 5 min, check issuedAt freshness: if issuedAt older than 4 min, discard and return empty (caller should re-sign)
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - eip.issuedAt) > 240) {
      // stale — don't send, let caller trigger re-auth
      return {};
    }
    return {
      'x-user-address': eip.address,
      'x-auth-signature': eip.signature,
      'x-auth-nonce': eip.nonce,
      'x-auth-issued-at': String(eip.issuedAt),
      'x-auth-expires-at': String(eip.expiresAt),
    };
  }
  return {};
}

/**
 * Ensures we have a valid API auth for the given wallet.
 * Tries JWT first (no prompt), then cached EIP, then prompts once via signSupabaseAuth and caches.
 * Returns headers to attach to the next request.
 * Falls back to empty if user rejects.
 */
export async function ensureApiAuthForWallet(walletAddress: Address): Promise<Record<string, string>> {
  // Already have valid JWT?
  const jwt = getStoredSupabaseJwtSafe();
  if (jwt?.token) {
    return { Authorization: `Bearer ${jwt.token}` };
  }
  const cached = getStoredApiAuth();
  if (cached && cached.address.toLowerCase() === walletAddress.toLowerCase()) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (cached.expiresAt > nowSec + 60 && Math.abs(nowSec - cached.issuedAt) <= 240) {
      return {
        'x-user-address': cached.address,
        'x-auth-signature': cached.signature,
        'x-auth-nonce': cached.nonce,
        'x-auth-issued-at': String(cached.issuedAt),
        'x-auth-expires-at': String(cached.expiresAt),
      };
    }
  }
  // Need fresh signature — prompt wallet once
  const nonce = generateNonce();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 86400; // 24h
  let signature: Hex;
  try {
    signature = await web3Service.signSupabaseAuth({
      wallet: walletAddress,
      nonce,
      issuedAt,
      expiresAt,
    });
  } catch (e: any) {
    if (String(e?.message || '').toLowerCase().includes('rejected')) {
      return {};
    }
    throw e;
  }
  const auth: CachedApiAuth = {
    address: walletAddress,
    signature,
    nonce,
    issuedAt,
    expiresAt,
  };
  setStoredApiAuth(auth);
  return {
    'x-user-address': walletAddress,
    'x-auth-signature': signature,
    'x-auth-nonce': nonce,
    'x-auth-issued-at': String(issuedAt),
    'x-auth-expires-at': String(expiresAt),
  };
}

function generateNonce(): string {
  try {
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) return (crypto as any).randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Clears all API auth (JWT + EIP) — call on wallet disconnect.
 */
export function clearAllApiAuth(): void {
  clearStoredApiAuth();
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(SUPABASE_JWT_KEY);
    localStorage.removeItem(SUPABASE_JWT_EXP_KEY);
  } catch {}
}
