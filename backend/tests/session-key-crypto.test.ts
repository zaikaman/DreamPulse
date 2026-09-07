import { describe, it, expect, beforeEach } from 'vitest';
import { generatePrivateKey } from 'viem/accounts';
import {
  __resetSessionKeyCryptoCacheForTests,
  decryptSessionPrivateKey,
  encryptSessionPrivateKey,
  isEncryptedSessionKeyValue,
  isSessionKeyEncryptionConfigured,
} from '../src/services/session-key-crypto.js';

describe('SEC-01 session key envelope encryption', () => {
  beforeEach(() => {
    delete process.env.SESSION_KEY_ENCRYPTION_KEY;
    __resetSessionKeyCryptoCacheForTests();
  });

  it('round-trips a private key through AES-256-GCM ciphertext', () => {
    process.env.SESSION_KEY_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    __resetSessionKeyCryptoCacheForTests();
    const priv = generatePrivateKey();
    const enc = encryptSessionPrivateKey(priv);
    expect(isEncryptedSessionKeyValue(enc)).toBe(true);
    expect(enc).not.toContain(priv.slice(2, 10));
    expect(decryptSessionPrivateKey(enc)).toBe(priv);
  });

  it('produces non-deterministic ciphertext (random IV)', () => {
    process.env.SESSION_KEY_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    __resetSessionKeyCryptoCacheForTests();
    const priv = generatePrivateKey();
    expect(encryptSessionPrivateKey(priv)).not.toBe(encryptSessionPrivateKey(priv));
  });

  it('fails closed without a configured key (refuses plaintext persist)', () => {
    expect(isSessionKeyEncryptionConfigured()).toBe(false);
    expect(() => encryptSessionPrivateKey(generatePrivateKey())).toThrow(
      /SESSION_KEY_ENCRYPTION_KEY is not configured/,
    );
  });

  it('rejects tampered ciphertext and wrong rotation keys', () => {
    process.env.SESSION_KEY_ENCRYPTION_KEY =
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    __resetSessionKeyCryptoCacheForTests();
    const enc = encryptSessionPrivateKey(generatePrivateKey());
    // Tamper: flip last char of ciphertext segment.
    const tampered = enc.slice(0, -1) + (enc.endsWith('A') ? 'B' : 'A');
    expect(decryptSessionPrivateKey(tampered)).toBeUndefined();
    // Wrong rotation key cannot authenticate.
    process.env.SESSION_KEY_ENCRYPTION_KEY =
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    __resetSessionKeyCryptoCacheForTests();
    expect(decryptSessionPrivateKey(enc)).toBeUndefined();
  });

  it('never treats legacy plaintext rows as valid ciphertext', () => {
    process.env.SESSION_KEY_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    __resetSessionKeyCryptoCacheForTests();
    expect(isEncryptedSessionKeyValue(generatePrivateKey())).toBe(false);
    expect(decryptSessionPrivateKey(null)).toBeUndefined();
    expect(decryptSessionPrivateKey('not-a-key')).toBeUndefined();
  });
});
