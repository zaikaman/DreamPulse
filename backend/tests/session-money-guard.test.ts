import { describe, it, expect, vi, afterEach } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  SessionService,
  verifyTxHashOnChain,
} from '../src/services/session-service.js';
import { publicClient } from '../src/config/somnia.js';

async function makeSession(
  svc: SessionService,
  overrides: Record<string, unknown> = {},
) {
  const user = privateKeyToAccount(generatePrivateKey());
  return svc.registerSession({
    userAddress: user.address,
    maxTradeSize: 10,
    dailyVolumeCap: 100,
    ...overrides,
  });
}

describe('Session money-guard adversarial suite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('denies trades on expired sessions and auto-deactivates them', async () => {
    const svc = new SessionService();
    const session = await makeSession(svc);
    (svc as any).sessions.get(session.id).expiresAt = new Date(Date.now() - 1000).toISOString();

    const res = svc.validateTradeAllowance(session.id, 1);
    expect(res).toEqual({ allowed: false, reason: 'Session has expired' });
    // Expired sessions must be latched inactive so later calls cannot pass
    expect((svc as any).sessions.get(session.id).isActive).toBe(false);
    expect(svc.validateTradeAllowance(session.id, 1).allowed).toBe(false);
  });

  it('resets the 24h spend window so a capped-out session becomes spendable again', async () => {
    const svc = new SessionService();
    const session = await makeSession(svc);
    await svc.recordTradeSpend(session.id, 100);
    expect(svc.validateTradeAllowance(session.id, 1).allowed).toBe(false);

    const rec = (svc as any).sessions.get(session.id);
    rec.lastSpendResetTimestamp = Date.now() - 25 * 3600 * 1000;

    expect(svc.validateTradeAllowance(session.id, 5).allowed).toBe(true);
    expect(rec.spentToday).toBe(0);
  });

  it('allows trades landing exactly on the daily cap boundary (strict > comparison)', async () => {
    const svc = new SessionService();
    const session = await makeSession(svc, { maxTradeSize: 50, dailyVolumeCap: 100 });
    await svc.recordTradeSpend(session.id, 90);

    expect(svc.validateTradeAllowance(session.id, 10).allowed).toBe(true);
    const over = svc.validateTradeAllowance(session.id, 10.01);
    expect(over.allowed).toBe(false);
    expect(over.reason).toContain('remaining daily volume cap');
  });

  it('rejects unknown session ids without throwing', async () => {
    const svc = new SessionService();
    expect(svc.validateTradeAllowance('no-such-session', 1)).toEqual({
      allowed: false,
      reason: 'Session not found',
    });
    expect(await svc.recordTradeSpend('no-such-session', 1)).toBe(false);
    expect(svc.updateSessionSpend('no-such-session', 1)).toBe(false);
    expect(await svc.revokeSession('no-such-session')).toBe(false);
  });

  it('clamps negative spend updates to zero and refreshes the reset timestamp', async () => {
    const svc = new SessionService();
    const session = await makeSession(svc);
    await svc.recordTradeSpend(session.id, 40);

    const rec = (svc as any).sessions.get(session.id);
    rec.lastSpendResetTimestamp = Date.now() - 3600 * 1000;
    expect(svc.updateSessionSpend(session.id, -25)).toBe(true);
    expect(rec.spentToday).toBe(0);
    expect(rec.lastSpendResetTimestamp).toBeGreaterThan(Date.now() - 5000);
  });

  it('accumulates spend with 4-decimal rounding (0.1 + 0.2 === 0.3)', async () => {
    const svc = new SessionService();
    const session = await makeSession(svc);
    await svc.recordTradeSpend(session.id, 0.1);
    await svc.recordTradeSpend(session.id, 0.2);
    expect((svc as any).sessions.get(session.id).spentToday).toBe(0.3);
  });

  it('rejects hostile session registrations', async () => {
    const svc = new SessionService();
    const user = privateKeyToAccount(generatePrivateKey()).address;

    await expect(
      svc.registerSession({ userAddress: 'not-an-address', maxTradeSize: 10, dailyVolumeCap: 100 }),
    ).rejects.toThrow('Invalid userAddress');

    await expect(
      svc.registerSession({ userAddress: user, maxTradeSize: 10, dailyVolumeCap: 5 }),
    ).rejects.toThrow('Invalid dailyVolumeCap');

    await expect(
      svc.registerSession({ userAddress: user, maxTradeSize: 0, dailyVolumeCap: 100 }),
    ).rejects.toThrow('Invalid maxTradeSize');

    await expect(
      svc.registerSession({ userAddress: user, maxTradeSize: NaN, dailyVolumeCap: 100 }),
    ).rejects.toThrow('Invalid maxTradeSize');

    await expect(
      svc.registerSession({ userAddress: user, maxTradeSize: 10, dailyVolumeCap: 100, nonce: -1 }),
    ).rejects.toThrow('Invalid nonce');

    await expect(
      svc.registerSession({ userAddress: user, maxTradeSize: 501, dailyVolumeCap: 1000 }),
    ).rejects.toThrow('exceeds maximum allowed trade size');

    await expect(
      svc.registerSession({ userAddress: user, maxTradeSize: 100, dailyVolumeCap: 5001 }),
    ).rejects.toThrow('exceeds maximum allowed daily cap');

    await expect(
      svc.registerSession({
        userAddress: user,
        maxTradeSize: 100,
        dailyVolumeCap: 1000,
        expiresAt: new Date(Date.now() + 35 * 24 * 3600 * 1000).toISOString(),
      }),
    ).rejects.toThrow('exceeds maximum allowed duration of 30 days');

    await expect(
      svc.registerSession({
        userAddress: user,
        maxTradeSize: 10,
        dailyVolumeCap: 100,
        permissions: ['placeOrderFor', 'withdraw'],
      }),
    ).rejects.toThrow('Prohibited');
  });

  it('rejects session nonce reuse for the same user', async () => {
    const svc = new SessionService();
    const user = privateKeyToAccount(generatePrivateKey()).address;

    await svc.registerSession({ userAddress: user, maxTradeSize: 10, dailyVolumeCap: 100, nonce: 7 });
    await expect(
      svc.registerSession({ userAddress: user, maxTradeSize: 10, dailyVolumeCap: 100, nonce: 7 }),
    ).rejects.toThrow('already been used');
  });

  it('rejects malformed on-chain tx hashes without touching the chain', async () => {
    const spy = vi
      .spyOn(publicClient, 'getTransactionReceipt')
      .mockRejectedValue(new Error('must not be called'));
    const user = privateKeyToAccount(generatePrivateKey()).address;

    for (const bad of [
      undefined,
      '',
      '0x123',
      'deadbeef',
      `0x${'ab'.repeat(31)}`, // 62 hex chars
      `0x${'ab'.repeat(33)}`, // 66 hex chars
      `0x${'zz'.repeat(32)}`, // non-hex
    ]) {
      expect(await verifyTxHashOnChain(bad as any, user)).toBe(false);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('verifies tx sender provenance against receipts', async () => {
    const user = privateKeyToAccount(generatePrivateKey()).address;
    const goodHash = `0x${'ab'.repeat(32)}`;

    vi.spyOn(publicClient, 'getTransactionReceipt').mockResolvedValueOnce({
      status: 'success',
      from: user,
    } as any);
    expect(await verifyTxHashOnChain(goodHash, user)).toBe(true);

    vi.spyOn(publicClient, 'getTransactionReceipt').mockResolvedValueOnce({
      status: 'reverted',
      from: user,
    } as any);
    expect(await verifyTxHashOnChain(goodHash, user)).toBe(false);

    vi.spyOn(publicClient, 'getTransactionReceipt').mockResolvedValueOnce({
      status: 'success',
      from: '0x9999999999999999999999999999999999999999',
    } as any);
    expect(await verifyTxHashOnChain(goodHash, user)).toBe(false);

    vi.spyOn(publicClient, 'getTransactionReceipt').mockRejectedValueOnce(new Error('rpc down'));
    expect(await verifyTxHashOnChain(goodHash, user)).toBe(false);
  });
});
