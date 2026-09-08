import { describe, it, expect } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { settlementService } from '../src/services/settlement-service.js';

function makeSweep(overrides: Record<string, unknown> = {}) {
  const user = privateKeyToAccount(generatePrivateKey()).address;
  return {
    id: `sweep-guard-${Math.random().toString(36).slice(2)}`,
    userAddress: user,
    marketId: 'm-guard-1',
    winningOutcome: 'YES',
    claimableAmount: 25,
    payoutToken: 'tUSDC',
    isCompounded: false,
    txHash: undefined,
    status: 'CONFIRMED',
    claimedAt: new Date().toISOString(),
    ...overrides,
  } as any;
}

describe('Settlement money-guard adversarial suite', () => {
  it('does not double-count a re-recorded CONFIRMED sweep id', () => {
    const sweep = makeSweep({ claimableAmount: 25 });
    settlementService.recordSweep(sweep, false);
    const totalAfterFirst = settlementService.getUserTotalSweptForMarket(
      sweep.userAddress,
      sweep.marketId,
    );

    // Retry / replay of the same sweep record must be a no-op
    settlementService.recordSweep({ ...sweep }, false);
    settlementService.recordSweep({ ...sweep }, false);

    expect(settlementService.getUserTotalSweptForMarket(sweep.userAddress, sweep.marketId)).toBe(
      totalAfterFirst,
    );
    expect(totalAfterFirst).toBe(25);
  });

  it('excludes PENDING and FAILED sweeps from swept totals', () => {
    const pending = makeSweep({ status: 'PENDING', claimableAmount: 100 });
    const failed = makeSweep({
      userAddress: pending.userAddress,
      marketId: pending.marketId,
      status: 'FAILED',
      claimableAmount: 100,
    });

    settlementService.recordSweep(pending, false);
    settlementService.recordSweep(failed, false);

    // Only CONFIRMED sweeps accrue; unconfirmed claims stay claimable, not counted
    expect(
      settlementService.getUserTotalSweptForMarket(pending.userAddress, pending.marketId),
    ).toBe(0);
  });

  it('accumulates distinct CONFIRMED sweeps per market without cross-market leakage', () => {
    const user = privateKeyToAccount(generatePrivateKey()).address;
    settlementService.recordSweep(
      makeSweep({ userAddress: user, marketId: 'm-guard-A', claimableAmount: 10 }),
      false,
    );
    settlementService.recordSweep(
      makeSweep({ userAddress: user, marketId: 'm-guard-A', claimableAmount: 15 }),
      false,
    );
    settlementService.recordSweep(
      makeSweep({ userAddress: user, marketId: 'm-guard-B', claimableAmount: 100 }),
      false,
    );

    expect(settlementService.getUserTotalSweptForMarket(user, 'm-guard-A')).toBe(25);
    expect(settlementService.getUserTotalSweptForMarket(user, 'm-guard-B')).toBe(100);
    expect(settlementService.getUserTotalSweptForMarket(user, 'm-guard-C')).toBe(0);
  });

  it('merges hex-alias totals but never counts the same key twice', () => {
    const user = privateKeyToAccount(generatePrivateKey()).address;
    const hex = `0x${'aa'.repeat(32)}`;
    settlementService.recordSweep(
      makeSweep({ userAddress: user, marketId: 'm-guard-hex', claimableAmount: 7 }),
      false,
    );

    const merged = settlementService.getUserTotalSweptForMarket(user, 'm-guard-hex', hex);
    expect(merged).toBeGreaterThanOrEqual(7);

    // Same value passed as both id and hex must not double itself
    const sameKey = settlementService.getUserTotalSweptForMarket(user, hex, hex);
    const direct = settlementService.getUserTotalSweptForMarket(user, hex);
    expect(sameKey).toBe(direct);
  });

  it('isolates swept totals per user (no cross-user leakage)', () => {
    const userA = privateKeyToAccount(generatePrivateKey()).address;
    const userB = privateKeyToAccount(generatePrivateKey()).address;
    settlementService.recordSweep(
      makeSweep({ userAddress: userA, marketId: 'm-guard-iso', claimableAmount: 42 }),
      false,
    );

    expect(settlementService.getUserTotalSweptForMarket(userA, 'm-guard-iso')).toBe(42);
    expect(settlementService.getUserTotalSweptForMarket(userB, 'm-guard-iso')).toBe(0);
  });

  it('returns sweep history newest-first honoring user filter and limit', () => {
    const user = privateKeyToAccount(generatePrivateKey()).address;
    for (let i = 0; i < 5; i++) {
      settlementService.recordSweep(
        makeSweep({ userAddress: user, marketId: `m-guard-h${i}` }),
        false,
      );
    }

    const limited = settlementService.getSweepHistory(user, 3);
    expect(limited).toHaveLength(3);
    expect(limited.every((s: any) => s.userAddress === user)).toBe(true);
    // Newest first: later inserts sort before earlier ones
    const full = settlementService.getSweepHistory(user, 50).map((s: any) => s.marketId);
    expect(full.indexOf('m-guard-h4')).toBeLessThan(full.indexOf('m-guard-h0'));

    const other = privateKeyToAccount(generatePrivateKey()).address;
    expect(settlementService.getSweepHistory(other, 50)).toHaveLength(0);
  });
});
