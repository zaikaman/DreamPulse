import { describe, it, expect } from 'vitest';
import { safeStringify, parseWeb3Error } from './errorUtils.js';

describe('safeStringify', () => {
  it('handles primitives and bigint', () => {
    expect(safeStringify(null)).toBe('');
    expect(safeStringify(undefined)).toBe('');
    expect(safeStringify('oops')).toBe('oops');
    expect(safeStringify(42)).toBe('42');
    expect(safeStringify(10n)).toBe('10');
  });

  it('serializes nested bigint values', () => {
    expect(safeStringify({ value: 100n })).toBe('{"value":"100"}');
  });

  it('replaces circular references instead of throwing', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(safeStringify(obj)).toBe('{"self":"[Circular]"}');
  });
});

describe('parseWeb3Error', () => {
  it('returns unknown-error fallback for empty input', () => {
    const parsed = parseWeb3Error(null);
    expect(parsed.title).toBe('Unknown Error');
    expect(parsed.isUserRejection).toBe(false);
  });

  it('detects user rejection by EIP-1193 code 4001', () => {
    const parsed = parseWeb3Error({ code: 4001, message: 'User rejected the request' });
    expect(parsed.isUserRejection).toBe(true);
    expect(parsed.title).toBe('Request Cancelled');
  });

  it('detects user rejection via cause and customizes withdraw context', () => {
    const parsed = parseWeb3Error(
      { cause: { code: 4001, message: 'denied' } },
      'withdraw',
    );
    expect(parsed.isUserRejection).toBe(true);
    expect(parsed.title).toBe('Withdrawal Cancelled');
  });

  it('customizes delegation and deposit rejection titles', () => {
    expect(parseWeb3Error({ code: 4001 }, 'deposit').title).toBe('Deposit Cancelled');
    expect(parseWeb3Error({ code: 4001 }, 'delegation').title).toBe('Signature Request Cancelled');
  });

  it('parses insufficient token balance errors', () => {
    const parsed = parseWeb3Error(new Error('ERC20InsufficientBalance: transfer amount exceeds balance'));
    expect(parsed.title).toBe('Insufficient Balance');
    expect(parsed.isUserRejection).toBe(false);
  });

  it('parses insufficient gas errors', () => {
    const parsed = parseWeb3Error(new Error('insufficient funds for gas * price + value'));
    expect(parsed.title).toBe('Insufficient Gas (STT)');
  });

  it('parses wrong-network errors', () => {
    const parsed = parseWeb3Error(new Error('ChainIdMismatch: unsupported chain'));
    expect(parsed.title).toBe('Incorrect Network');
    expect(parsed.message).toContain('50312');
  });

  it('parses wallet-not-connected errors', () => {
    const parsed = parseWeb3Error(new Error('Wallet not connected'));
    expect(parsed.title).toBe('Wallet Connection Required');
  });

  it('strips viem boilerplate but keeps technical details', () => {
    const raw = 'Transaction reverted Details: out of funds https://viem.sh/docs Version: viem@2.0.0 Request Arguments: 0x123 Contract Call: 0xabc';
    const parsed = parseWeb3Error(new Error(raw));
    expect(parsed.title).toBe('Transaction Error');
    expect(parsed.message).not.toContain('viem.sh');
    expect(parsed.message).not.toContain('Request Arguments');
    expect(parsed.technicalDetails).toBeDefined();
  });

  it('sanitizes bigint serialization leaks', () => {
    const parsed = parseWeb3Error(new Error('Do not know how to serialize a BigInt'));
    expect(parsed.message).toContain('cancelled or rejected');
  });
});
