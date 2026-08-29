import jwt from 'jsonwebtoken';
import { isAddress, getAddress, type Address, type Hex, verifyTypedData } from 'viem';
import { env } from '../config/env.js';
import { SOMNIA_ADDRESSES } from '../config/somnia.js';

/**
 * Supabase Realtime now requires a JWT with `user_address` claim.
 * Frontend anon key is public and RLS-denied for private tables (012).
 * This service mints a short-lived HS256 JWT after wallet EIP-712 verification.
 * Supabase verifies it with the same SUPABASE_JWT_SECRET (Dashboard > Settings > API > JWT Secret).
 * Must be set on Heroku: `heroku config:set SUPABASE_JWT_SECRET=<jwt_secret>`
 */

export const AUTH_EIP712_DOMAIN = {
  name: 'DreamPulse',
  version: '1',
  chainId: SOMNIA_ADDRESSES.chainId,
  verifyingContract: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
} as const;

export const AUTH_EIP712_TYPES = {
  Auth: [
    { name: 'wallet', type: 'address' },
    { name: 'nonce', type: 'string' },
    { name: 'issuedAt', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
} as const;

export interface AuthVerifyParams {
  userAddress: string;
  signature: string;
  nonce: string;
  issuedAt: number; // unix seconds
  expiresAt: number; // unix seconds
}

function getJwtSecret(): string | null {
  const raw = (env as any).SUPABASE_JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '';
  const s = String(raw).trim();
  if (!s || s.includes('mock') || s.length < 16) return null;
  return s;
}

export function isSupabaseJwtConfigured(): boolean {
  return getJwtSecret() !== null;
}

export async function verifyAuthSignature(params: AuthVerifyParams): Promise<{ valid: boolean; reason?: string }> {
  const { userAddress, signature, nonce, issuedAt, expiresAt } = params;

  if (!userAddress || !isAddress(userAddress)) return { valid: false, reason: 'Invalid userAddress' };
  if (!signature || !signature.startsWith('0x') || signature.length < 132) return { valid: false, reason: 'Invalid signature' };
  if (!nonce || typeof nonce !== 'string' || nonce.length < 8 || nonce.length > 128) return { valid: false, reason: 'Invalid nonce' };

  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return { valid: false, reason: 'Invalid timestamps' };
  if (Math.abs(nowSec - issuedAt) > 300) return { valid: false, reason: 'issuedAt skew too large (must be within 5 min)' };
  if (expiresAt <= nowSec) return { valid: false, reason: 'Auth already expired' };
  if (expiresAt - issuedAt > 7 * 24 * 3600) return { valid: false, reason: 'Auth window too long (max 7d)' };
  if (expiresAt - issuedAt < 60) return { valid: false, reason: 'Auth window too short (min 60s)' };

  const normalized = getAddress(userAddress) as Address;

  try {
    const valid = await verifyTypedData({
      address: normalized,
      domain: AUTH_EIP712_DOMAIN,
      types: AUTH_EIP712_TYPES,
      primaryType: 'Auth',
      message: {
        wallet: normalized,
        nonce,
        issuedAt: BigInt(issuedAt),
        expiresAt: BigInt(expiresAt),
      },
      signature: signature as Hex,
    });
    if (!valid) return { valid: false, reason: 'EIP-712 Auth signature verification failed' };
    return { valid: true };
  } catch (e: any) {
    return { valid: false, reason: e.message || 'Signature verification error' };
  }
}

export interface MintJwtResult {
  token: string;
  expiresAt: number;
  userAddress: Address;
}

export function mintSupabaseJwt(userAddress: string): MintJwtResult {
  const secret = getJwtSecret();
  if (!secret) throw new Error('SUPABASE_JWT_SECRET not configured — set it on Heroku (Supabase Dashboard > API > JWT Secret)');

  if (!isAddress(userAddress)) throw new Error('Invalid userAddress');
  const normalized = getAddress(userAddress) as Address;
  const lower = normalized.toLowerCase();

  const nowSec = Math.floor(Date.now() / 1000);
  const expirySec = Number((env as any).SUPABASE_JWT_EXPIRY_SECONDS || 86400);
  const exp = nowSec + Math.max(300, Math.min(7 * 24 * 3600, expirySec));

  const payload = {
    aud: 'authenticated',
    role: 'authenticated',
    sub: lower,
    user_address: lower,
    wallet: lower,
    iss: 'dreampulse',
    iat: nowSec,
    exp,
  };

  const token = jwt.sign(payload, secret, { algorithm: 'HS256' });

  return { token, expiresAt: exp, userAddress: normalized };
}

export async function verifyAndMint(params: AuthVerifyParams): Promise<MintJwtResult> {
  const v = await verifyAuthSignature(params);
  if (!v.valid) throw new Error(v.reason || 'Auth verification failed');
  return mintSupabaseJwt(params.userAddress);
}
