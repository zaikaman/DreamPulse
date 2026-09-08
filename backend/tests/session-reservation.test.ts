import { describe, it, expect } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SessionService } from '../src/services/session-service.js';

async function makeSession(svc: SessionService, maxTradeSize = 100, dailyVolumeCap = 100) {
  const user = privateKeyToAccount(generatePrivateKey());
  return svc.registerSession({
    userAddress: user.address,
    maxTradeSize,
    dailyVolumeCap,
  });
}

describe('Session spend-reservation atomicity suite', () => {
  it('documents the TOCTOU hole in validate-then-record across awaits', async () => {
    const svc = new SessionService();
    const session = await makeSession(svc);

    // Two interleaved executions: both validate against the same books...
    const first = svc.validateTradeAllowance(session.id, 60);
    const second = svc.validateTradeAllowance(session.id, 60);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);

    // ...both execute, both record: cap jointly overspent 120 > 100.
    await svc.recordTradeSpend(session.id, 60);
    await svc.recordTradeSpend(session.id, 60);
    expect((svc as any).sessions.get(session.id).spentToday).toBe(120);
  });

  it('holds cap headroom atomically: concurrent reserves cannot jointly overspend', async () => {
    const svc = new SessionService();
    const session = await makeSession(svc);

    const [first, second] = await Promise.all([
      Promise.resolve().then(() => svc.reserveTradeSpend(session.id, 60)),
      Promise.resolve().then(() => svc.reserveTradeSpend(session.id, 60)),
    ]);

    expect(first.allowed).toBe(true);
    expect(first.reservationId).toBeDefined();
    expect(second.allowed).toBe(false);
    expect(second.reason).toContain('remaining daily volume cap');

    // Only the winner holds headroom; nothing landed in spentToday yet
    const rec = (svc as any).sessions.get(session.id);
    expect(rec.spentToday).toBe(0);
    expect(rec.pendingReservations).toHaveLength(1);
  });

  it('makes reservations visible to advisory allowance checks', async () => {
    const svc = new SessionService();
    const session = await makeSession(svc);
    await svc.recordTradeSpend(session.id, 40);

    const hold = svc.reserveTradeSpend(session.id, 50);
    expect(hold.allowed).toBe(true);

    // 40 spent + 50 held: a 20 trade no longer fits, a 10 trade does
    expect(svc.validateTradeAllowance(session.id, 20).allowed).toBe(false);
    expect(svc.validateTradeAllowance(session.id, 10).allowed).toBe(true);
  });

  it('consumes a reservation with the actual fill cost (partial fills free headroom)', async () => {
    const svc = new SessionService();
    const session = await makeSession(svc);

    const hold = svc.reserveTradeSpend(session.id, 60);
    expect(
      svc.consumeReservation(session.id, hold.reservationId, 55),
    ).toBe(true);

    const rec = (svc as any).sessions.get(session.id);
    expect(rec.spentToday).toBe(55);
    expect(rec.pendingReservations ?? []).toHaveLength(0);

    // Freed 5 headroom is spendable again: 55 + 45 == cap exactly
    expect(svc.validateTradeAllowance(session.id, 45).allowed).toBe(true);
  });

  it('explicitly releases an aborted reservation', async () => {
    const svc = new SessionService();
    const session = await makeSession(svc);

    const hold = svc.reserveTradeSpend(session.id, 60);
    expect(svc.validateTradeAllowance(session.id, 50).allowed).toBe(false);
    expect(svc.releaseReservation(session.id, hold.reservationId!)).toBe(true);

    expect(svc.validateTradeAllowance(session.id, 50).allowed).toBe(true);
    expect(svc.releaseReservation(session.id, hold.reservationId!)).toBe(false);
    expect(svc.releaseReservation('no-such-session', 'nope')).toBe(false);
  });

  it('ignores stale reservations past TTL (fail-closed self-heal)', async () => {
    const svc = new SessionService();
    const session = await makeSession(svc);

    const hold = svc.reserveTradeSpend(session.id, 60);
    const rec = (svc as any).sessions.get(session.id);
    // Simulate a reservation whose execution died 16 minutes ago
    rec.pendingReservations[0].createdAt = Date.now() - 16 * 60 * 1000;

    expect(svc.validateTradeAllowance(session.id, 60).allowed).toBe(true);
    expect(rec.pendingReservations).toHaveLength(0);
    expect(hold.reservationId).toBeDefined();
  });

  it('falls back to a plain record when no reservation exists', async () => {
    const svc = new SessionService();
    const session = await makeSession(svc);

    expect(svc.consumeReservation(session.id, undefined, 30)).toBe(true);
    expect((svc as any).sessions.get(session.id).spentToday).toBe(30);
    expect(svc.consumeReservation('no-such-session', 'nope', 10)).toBe(false);
  });
});
