import type { Address } from 'viem';
import { apiClient } from './api.js';
import { web3Service } from './web3.js';
import {
  setSupabaseAuth,
  setStoredSupabaseJwt,
  getStoredSupabaseJwt,
  clearStoredSupabaseJwt,
} from './supabase.js';
import { setStoredApiAuth, clearStoredApiAuth } from './api-auth.js';

const AUTH_NONCE_KEY = 'dreampulse_auth_nonce';
const AUTH_EXPIRY_SECONDS = 86400; // 24h, must match backend SUPABASE_JWT_EXPIRY_SECONDS default

function generateNonce(): string {
  try {
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) return (crypto as any).randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateNonce(): string {
  try {
    const existing = localStorage.getItem(AUTH_NONCE_KEY);
    if (existing && existing.length >= 8) return existing;
    const n = generateNonce();
    localStorage.setItem(AUTH_NONCE_KEY, n);
    return n;
  } catch {
    return generateNonce();
  }
}

/**
 * Ensures Supabase auth JWT is set for this wallet. If a valid cached JWT
 * exists (>5 min remaining) it is reused without prompting. Otherwise it
 * prompts one EIP-712 Auth signature and mints via POST /api/v1/auth/wallet-verify.
 * Gracefully degrades to null if SUPABASE_JWT_SECRET not configured (backend 503)
 * — callers should then rely on polling fallback.
 */
export async function ensureSupabaseAuthForWallet(userAddress: Address): Promise<string | null> {
  const normalized = userAddress.toLowerCase();

  // 1. Reuse cached JWT if still valid
  const cached = getStoredSupabaseJwt();
  if (cached && cached.expiresAt > Math.floor(Date.now() / 1000) + 300) {
    await setSupabaseAuth(cached.token);
    return cached.token;
  }

  // 2. Check backend is configured before prompting signature (avoid needless popup)
  // We still want to cache EIP-712 headers for API auth even when JWT is not configured,
  // so don't early-return before signing — just warn and continue to mint attempt.
  try {
    const status = await apiClient.getAuthStatus().catch(() => null);
    if (status && status.supabaseJwtConfigured === false) {
      console.warn('[SupabaseAuth] SUPABASE_JWT_SECRET not configured on server — API will use EIP-712 headers, realtime will use polling fallback.');
    }
  } catch {
    // ignore, try mint anyway
  }

  // 3. Mint fresh JWT via EIP-712 Auth (single wallet prompt for both Supabase and API)
  const nonce = getOrCreateNonce();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + AUTH_EXPIRY_SECONDS;

  let signature: string;
  try {
    signature = await web3Service.signSupabaseAuth({
      wallet: userAddress,
      nonce,
      issuedAt,
      expiresAt,
    });
  } catch (e: any) {
    // User rejected — not fatal, just stay on polling
    if (String(e?.message || '').toLowerCase().includes('rejected')) {
      console.warn('[SupabaseAuth] User rejected auth signature — using polling fallback.');
      return null;
    }
    throw e;
  }

  // Cache EIP-712 headers for API auth fallback (used when JWT not configured or as Bearer alternative)
  try {
    setStoredApiAuth({
      address: userAddress,
      signature: signature as `0x${string}`,
      nonce,
      issuedAt,
      expiresAt,
    });
  } catch {}

  try {
    const res = await apiClient.verifyWalletAuth({
      userAddress: normalized,
      signature,
      nonce,
      issuedAt,
      expiresAt,
    });
    if (res?.token && res?.expiresAt) {
      setStoredSupabaseJwt(res.token, res.expiresAt);
      await setSupabaseAuth(res.token);
      // Rotate nonce for next mint
      try { localStorage.removeItem(AUTH_NONCE_KEY); } catch {}
      return res.token;
    }
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (msg.includes('503') || msg.toLowerCase().includes('not configured')) {
      console.warn('[SupabaseAuth] Backend JWT not configured — API will continue with EIP-712 headers, polling fallback active for realtime.');
      // Keep the cached EIP-712 headers for API auth
      return null;
    }
    console.warn('[SupabaseAuth] Mint failed:', e);
    return null;
  }
  return null;
}

export async function restoreSupabaseAuthIfCached(): Promise<void> {
  const cached = getStoredSupabaseJwt();
  if (cached) {
    await setSupabaseAuth(cached.token);
  }
}

export async function clearSupabaseAuthForLogout(): Promise<void> {
  clearStoredSupabaseJwt();
  clearStoredApiAuth();
  try {
    localStorage.removeItem(AUTH_NONCE_KEY);
  } catch {}
  try {
    const { clearSupabaseAuth } = await import('./supabase.js');
    await clearSupabaseAuth();
  } catch {}
}
