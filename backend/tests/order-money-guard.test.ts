import { describe, it, expect, vi, afterEach } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  computeRealizedPnl,
  resolveOnchainWinningOutcome,
  quantizeOrder,
  toSteps,
  verifyUserOrderTxHashOnChain,
} from '../src/services/order-service.js';
import { publicClient } from '../src/config/somnia.js';
import type { Market } from '../src/types/index.js';

const ONE = 1_000_000n; // TestUSDC 6 decimals

describe('Order money-guard adversarial suite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('quantizeOrder / toSteps (never overspend the grid)', () => {
    it('snaps size DOWN to the lot grid, never up', () => {
      const exact = quantizeOrder(0.5, 10, 'YES');
      expect(exact.rawQuantity).toBe(10_000_000n);
      expect(exact.quantizedSize).toBe(10);

      // 10.0009 lots must floor to 10.0 lots — rounding up would overspend
      const floored = quantizeOrder(0.5, 10.0009, 'YES');
      expect(floored.rawQuantity).toBe(10_000_000n);
      expect(floored.quantizedSize).toBeLessThanOrEqual(10.0009);
    });

    it('reduces dust sizes to zero quantity instead of a dust order', () => {
      const dust = quantizeOrder(0.5, 0.0001, 'YES');
      expect(dust.rawQuantity).toBe(0n);
      expect(dust.quantizedSize).toBe(0);
      expect(dust.totalCost).toBe(0);
    });

    it('prices NO orders as the binary complement of YES', () => {
      const yes = quantizeOrder(0.6, 10, 'YES');
      const no = quantizeOrder(0.6, 10, 'NO');
      expect(yes.rawPriceYes).toBe(600_000n);
      expect(no.rawPriceOwn).toBe(600_000n);
      expect(no.rawPriceYes).toBe(ONE - 600_000n);
      expect(no.rawPriceYes).toBe(400_000n);
    });

    it('keeps totalCost consistent with quantized price x size', () => {
      const q = quantizeOrder(0.4567, 12.3456, 'YES');
      expect(q.totalCost).toBe(Number((q.quantizedPrice * q.quantizedSize).toFixed(4)));
      expect(q.quantizedSize).toBeLessThanOrEqual(12.3456);
    });

    it('toSteps floors in floor mode, rounds in round mode, clamps negatives', () => {
      expect(toSteps(0.5, ONE, 1000n, 'round')).toBe(500_000n);
      expect(toSteps(1.0009, ONE, 1000n, 'floor')).toBe(1_000_000n);
      expect(toSteps(1.0009, ONE, 1000n, 'round')).toBe(1_001_000n);
      expect(toSteps(-5, ONE, 1000n, 'floor')).toBe(0n);
      expect(toSteps(-5, ONE, 1000n, 'round')).toBe(0n);
    });
  });

  describe('computeRealizedPnl (sign discipline)', () => {
    it('pays SELL orders inversely to BUY', () => {
      // SELL winner YES @0.60 x10: keeps premium 6, pays out 10 → -4
      expect(
        computeRealizedPnl({ direction: 'SELL', price: 0.6, lotSize: 10, outcome: 'YES' }, 'YES'),
      ).toBe(-4);
      // SELL loser: keeps premium → +6
      expect(
        computeRealizedPnl({ direction: 'SELL', price: 0.6, lotSize: 10, outcome: 'YES' }, 'NO'),
      ).toBe(6);
    });

    it('refunds VOID at 0.50 per lot for both sides', () => {
      // BUY @0.60: 5 - 6 = -1
      expect(
        computeRealizedPnl({ direction: 'BUY', price: 0.6, lotSize: 10, outcome: 'YES' }, 'VOID'),
      ).toBe(-1);
      // SELL @0.60: 6 - 5 = +1
      expect(
        computeRealizedPnl({ direction: 'SELL', price: 0.6, lotSize: 10, outcome: 'YES' }, 'VOID'),
      ).toBe(1);
      // isVoided flag behaves identically to VOID outcome
      expect(
        computeRealizedPnl({ direction: 'BUY', price: 0.6, lotSize: 10, outcome: 'YES' }, 'YES', true),
      ).toBe(-1);
    });
  });

  describe('resolveOnchainWinningOutcome (never guess a missing winner)', () => {
    it('returns undefined for status 4 (Resolved) with unknown winner', () => {
      expect(resolveOnchainWinningOutcome({ status: 4 })).toBeUndefined();
      expect(resolveOnchainWinningOutcome({ isResolved: true, status: 4 })).toBeUndefined();
    });

    it('returns undefined for settling markets and unknown outcome codes', () => {
      expect(resolveOnchainWinningOutcome({ status: 3 })).toBeUndefined();
      expect(resolveOnchainWinningOutcome({ isResolved: true, winningOutcome: 2 })).toBeUndefined();
      expect(resolveOnchainWinningOutcome({ finalized: true })).toBeUndefined();
    });

    it('still resolves finalized markets with a known winner', () => {
      expect(resolveOnchainWinningOutcome({ finalized: true, winningOutcome: 1 })).toBe('NO');
      expect(resolveOnchainWinningOutcome({ finalized: true, winningOutcome: 0 })).toBe('YES');
    });
  });

  describe('verifyUserOrderTxHashOnChain (forgery rejection)', () => {
    const user = privateKeyToAccount(generatePrivateKey()).address;
    const market = {
      id: 'm-guard-1',
      poolAddress: '0x2222222222222222222222222222222222222222',
    } as Market;

    it('rejects malformed hashes without touching the chain', async () => {
      const spy = vi
        .spyOn(publicClient, 'getTransactionReceipt')
        .mockRejectedValue(new Error('must not be called'));

      for (const bad of [
        undefined,
        '',
        '0x123',
        'not-a-hash',
        `0x${'ab'.repeat(31)}`,
        `0x${'ab'.repeat(33)}`,
        `0x${'zz'.repeat(32)}`,
      ]) {
        const res = await verifyUserOrderTxHashOnChain(bad as any, user, market);
        expect(res.isValid).toBe(false);
        expect(res.errorReason).toContain('Invalid transaction hash format');
      }
      expect(spy).not.toHaveBeenCalled();
    });

    it('rejects receipts targeting contracts outside the market and exchange', async () => {
      const attacker = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      vi.spyOn(publicClient, 'getTransactionReceipt').mockResolvedValueOnce({
        status: 'success',
        from: user,
        to: attacker,
        logs: [],
      } as any);

      const res = await verifyUserOrderTxHashOnChain(
        `0x${'11'.repeat(32)}`,
        user,
        market,
      );
      expect(res.isValid).toBe(false);
      expect(res.errorReason).toContain('does not match market pool');
    });

    it('accepts marketplace logs emitted by the pool contract address', async () => {
      // A receipt whose logs touch the pool contract passes the target gate
      // (semantic event decoding is covered by the SEC-04 suite).
      vi.spyOn(publicClient, 'getTransactionReceipt').mockResolvedValueOnce({
        status: 'success',
        from: user,
        to: market.poolAddress,
        logs: [
          {
            address: market.poolAddress,
            topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'],
            data: '0x',
          },
        ],
      } as any);

      const res = await verifyUserOrderTxHashOnChain(`0x${'22'.repeat(32)}`, user, market);
      // Fails only on the semantic step (no OrderPlaced/Filled), proving the
      // sender + target gates passed — an arbitrary transfer is not an order.
      expect(res.isValid).toBe(false);
      expect(res.errorReason).toContain('Arbitrary transfers or approvals cannot be accepted');
    });
  });
});
