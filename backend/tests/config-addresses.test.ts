import { describe, it, expect } from 'vitest';
import { getAddress } from 'viem';
import { SOMNIA_ADDRESSES } from '../src/config/somnia.js';

/**
 * Wired-address integrity gate. A single dropped nibble in a deployment
 * constant silently redirects approvals, allowances, and target-contract
 * checks at a dead address — this test pins every address to 20-byte
 * EIP-55 validity so typos fail loudly in CI instead of on testnet.
 */
describe('SOMNIA_ADDRESSES integrity', () => {
  it('checksums every wired address (no truncated or malformed constants)', () => {
    const entries = Object.entries(SOMNIA_ADDRESSES).filter(
      ([, v]): v is string => typeof v === 'string' && v.startsWith('0x'),
    );
    expect(entries.length).toBeGreaterThan(10);
    for (const [key, value] of entries) {
      expect(
        () => getAddress(value),
        `${key} = ${value} is not a valid 20-byte address`,
      ).not.toThrow();
    }
  });

  it('pins the collateral router to the deployed DreamDEX address', () => {
    expect(SOMNIA_ADDRESSES.collateralRouter).toBe(
      '0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C',
    );
  });

  it('keeps chain id and collateral decimals consistent with money math', () => {
    expect(SOMNIA_ADDRESSES.chainId).toBe(50312);
    expect(SOMNIA_ADDRESSES.decimals).toBe(6);
  });
});
