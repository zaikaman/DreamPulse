import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Address } from 'viem';

const { mockReadContract } = vi.hoisted(() => ({
  mockReadContract: vi.fn(),
}));

vi.mock('../src/config/somnia.js', () => ({
  publicClient: { readContract: mockReadContract },
  SOMNIA_ADDRESSES: {
    operatorPermissionsRegistry: '0x1111111111111111111111111111111111111111',
    testUsdc: '0x2222222222222222222222222222222222222222',
  },
  operatorAccount: {
    address: '0x3333333333333333333333333333333333333333',
  },
}));

import { ensurePerPoolApprovalForCopyTrader } from '../src/services/operator-approval-service.js';

const OWNER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const MIN_ALLOWANCE = 100n * 1_000_000n;

function mockContracts({ isGlobal, allowance }: { isGlobal: boolean; allowance: bigint }) {
  mockReadContract.mockImplementation(({ functionName }: { functionName: string }) => {
    if (functionName === 'isGloballyApproved') return Promise.resolve(isGlobal);
    if (functionName === 'allowance') return Promise.resolve(allowance);
    return Promise.reject(new Error(`unexpected fn ${functionName}`));
  });
}

describe('ensurePerPoolApprovalForCopyTrader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when the registry reports a global approval, even with zero allowance', async () => {
    mockContracts({ isGlobal: true, allowance: 0n });
    await expect(ensurePerPoolApprovalForCopyTrader(OWNER)).resolves.toBe(true);
    expect(mockReadContract).toHaveBeenCalledTimes(2);
  });

  it('returns true when allowance meets the 100 tUSDC minimum without global approval', async () => {
    mockContracts({ isGlobal: false, allowance: MIN_ALLOWANCE });
    await expect(ensurePerPoolApprovalForCopyTrader(OWNER)).resolves.toBe(true);
  });

  it('returns false when neither global approval nor funding threshold is met', async () => {
    mockContracts({ isGlobal: false, allowance: MIN_ALLOWANCE - 1n });
    await expect(ensurePerPoolApprovalForCopyTrader(OWNER)).resolves.toBe(false);
  });

  it('returns false when both contract reads fail', async () => {
    mockReadContract.mockRejectedValue(new Error('rpc down'));
    await expect(ensurePerPoolApprovalForCopyTrader(OWNER)).resolves.toBe(false);
  });

  it('falls back to allowance when the registry read fails but funding is sufficient', async () => {
    mockReadContract.mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === 'isGloballyApproved') return Promise.reject(new Error('registry down'));
      return Promise.resolve(MIN_ALLOWANCE * 2n);
    });
    // Per-call .catch turns the registry failure into false; funded allowance still approves.
    await expect(ensurePerPoolApprovalForCopyTrader(OWNER)).resolves.toBe(true);
  });

  it('returns false when the outer validation throws synchronously', async () => {
    mockReadContract.mockImplementation(() => {
      throw new Error('sync boom');
    });
    await expect(ensurePerPoolApprovalForCopyTrader(OWNER)).resolves.toBe(false);
  });
});
