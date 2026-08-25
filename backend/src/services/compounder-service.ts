import type { Address } from 'viem';

export interface CompoundedAllocation {
  userAddress: Address;
  totalCompoundedAmount: number;
  lastCompoundedAt: string;
  reinvestedCycles: number;
}

export class CompounderService {
  private userAllocations = new Map<string, CompoundedAllocation>();

  /**
   * Re-invests claimed settlement proceeds back into active user trading collateral.
   */
  public compoundProceeds(userAddress: Address, claimedAmount: number): CompoundedAllocation {
    const key = userAddress.toLowerCase();
    const existing = this.userAllocations.get(key) || {
      userAddress,
      totalCompoundedAmount: 0,
      lastCompoundedAt: new Date().toISOString(),
      reinvestedCycles: 0,
    };

    existing.totalCompoundedAmount = Number((existing.totalCompoundedAmount + claimedAmount).toFixed(4));
    existing.reinvestedCycles += 1;
    existing.lastCompoundedAt = new Date().toISOString();

    this.userAllocations.set(key, existing);
    console.log(
      `[CompounderService] Auto-compounded +${claimedAmount.toFixed(2)} STT for ${userAddress} (Total: ${existing.totalCompoundedAmount.toFixed(2)} STT across ${existing.reinvestedCycles} cycles)`,
    );

    return existing;
  }

  /**
   * Retrieves compounding stats for a specific user wallet.
   */
  public getUserCompoundedStats(userAddress: Address): CompoundedAllocation {
    const key = userAddress.toLowerCase();
    return (
      this.userAllocations.get(key) || {
        userAddress,
        totalCompoundedAmount: 0,
        lastCompoundedAt: new Date().toISOString(),
        reinvestedCycles: 0,
      }
    );
  }
}

export const compounderService = new CompounderService();
