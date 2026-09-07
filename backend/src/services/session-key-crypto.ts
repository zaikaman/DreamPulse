import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Hex } from 'viem';

/**
 * SEC-01 — Server-side envelope encryption for ephemeral session signing keys.
 *
 * Threat model: `sessions.session_key_private_key` previously held plaintext
 * signing keys readable via Supabase RLS (`select('*')`) and broadcast over
 * Supabase Realtime CDC to every subscribed browser. Any leaked DB read or
 * malicious browser dependency meant direct loss of funds.
 *
 * Fix: the column now stores ONLY AES-256-GCM ciphertext produced here.
 * Plaintext exists exclusively in:
 *   1. the originating browser's memory (generated via web3Service, never persisted), and
 *   2. the backend relay's in-memory SessionRecord (used to sign automated orders).
 *
 * Wire format: `v1.<iv_b64url>.<tag_b64url>.<ct_b64url>`
 *   - AES-256-GCM, 96-bit random IV per encryption, 128-bit auth tag.
 *   - Associated data binds ciphertext to purpose/version ("dreampulse-session-key:v1")
 *     so a ciphertext cannot be transplanted into another protocol field.
 *
 * Key provisioning (Heroku / production):
 *   SESSION_KEY_ENCRYPTION_KEY=<64 hex chars | 44-char base64 | 32-byte string>
 * Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
 * The SAME value must be set on every backend dyno/instance — ciphertext is
 * not portable across different keys. Rotate by re-authorizing sessions
 * (old rows fail closed to NULL, users re-run the Session Modal once).
 */

const ENC_PREFIX = 'v1.';
const AAD = Buffer.from('dreampulse-session-key:v1', 'utf8');

let cachedKey: Buffer | null | undefined;
let warnedMissingKey = false;

function resolveEncryptionKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = (process.env.SESSION_KEY_ENCRYPTION_KEY || '').trim();
  if (!raw) {
    cachedKey = null;
    return cachedKey;
  }
  // 1) 64 hex chars (optionally 0x-prefixed) = 32 bytes — preferred.
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    cachedKey = Buffer.from(hex, 'hex');
    return cachedKey;
  }
  // 2) Base64 / base64url encoding of 32 bytes.
  try {
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(normalized, 'base64');
    if (decoded.length === 32) {
      cachedKey = decoded;
      return cachedKey;
    }
  } catch {
    // fall through to length check below
  }
  // 3) Raw 32-byte UTF-8 string (e.g. generated password of exactly 32 chars).
  const asUtf8 = Buffer.from(raw, 'utf8');
  if (asUtf8.length === 32) {
    cachedKey = asUtf8;
    return cachedKey;
  }
  throw new Error(
    'SESSION_KEY_ENCRYPTION_KEY must be 32 bytes of entropy: 64 hex chars (preferred), base64 of 32 bytes, or a 32-byte string. ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  );
}

/** Test hook — clears the cached key resolution (env may change between tests). */
export function __resetSessionKeyCryptoCacheForTests(): void {
  cachedKey = undefined;
  warnedMissingKey = false;
}

export function isSessionKeyEncryptionConfigured(): boolean {
  try {
    return resolveEncryptionKey() !== null;
  } catch {
    return false;
  }
}

export function isEncryptedSessionKeyValue(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX) && value.split('.').length === 4;
}

function warnMissingKeyOnce(context: string): void {
  if (warnedMissingKey || process.env.NODE_ENV === 'test') return;
  warnedMissingKey = true;
  console.warn(
    `[SessionKeyCrypto] SESSION_KEY_ENCRYPTION_KEY is not set — ${context}. ` +
      'Session signing keys will be held in backend memory ONLY and NOT persisted to Supabase ' +
      '(fail-closed: no plaintext is ever written to the database). ' +
      'Set SESSION_KEY_ENCRYPTION_KEY on Heroku for durable relay keys across restarts.',
  );
}

/**
 * Encrypts a 0x-prefixed session private key for storage in
 * `sessions.session_key_private_key`. Throws when no key is configured —
 * callers must fail closed (persist NULL, keep memory-only).
 */
export function encryptSessionPrivateKey(privateKey: string): string {
  const key = resolveEncryptionKey();
  if (!key) {
    warnMissingKeyOnce('encrypt attempted with no key configured');
    throw new Error('SESSION_KEY_ENCRYPTION_KEY is not configured — refusing to persist plaintext session key');
  }
  if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
    throw new Error('encryptSessionPrivateKey expects a 0x-prefixed 32-byte private key');
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ct = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const b64url = (b: Buffer) => b.toString('base64url');
  return `${ENC_PREFIX}${b64url(iv)}.${b64url(tag)}.${b64url(ct)}`;
}

/**
 * Decrypts a value read from `sessions.session_key_private_key`.
 * Returns undefined for NULL/empty (no key registered) and for values that
 * fail authentication (wrong rotation key / tampered). Legacy pre-fix
 * plaintext (`0x...`) rows are NEVER trusted in production — they are treated
 * as absent so migration 023's burn-in (SET NULL) is the source of truth;
 * in non-production they are passed through read-only for local dev rollover.
 */
export function decryptSessionPrivateKey(stored: string | null | undefined): Hex | undefined {
  if (!stored || typeof stored !== 'string') return undefined;
  if (!isEncryptedSessionKeyValue(stored)) {
    // Legacy plaintext leak row (pre-SEC-01). Production: fail closed.
    if (process.env.NODE_ENV === 'production') return undefined;
    if (/^0x[0-9a-fA-F]{64}$/.test(stored)) return stored as Hex;
    return undefined;
  }
  const key = resolveEncryptionKey();
  if (!key) {
    warnMissingKeyOnce('decrypt attempted with no key configured');
    return undefined;
  }
  try {
    const [, ivB64, tagB64, ctB64] = stored.split('.');
    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    const ct = Buffer.from(ctB64, 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || ct.length === 0) return undefined;
    // Constant-time shape check before attempting auth decrypt (defense in depth).
    if (!timingSafeEqual(iv, Buffer.from(iv))) return undefined;
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    if (!/^0x[0-9a-fA-F]{64}$/.test(pt)) return undefined;
    return pt as Hex;
  } catch {
    // Wrong key, rotated secret, or tampered ciphertext — never throw on read path.
    return undefined;
  }
}
