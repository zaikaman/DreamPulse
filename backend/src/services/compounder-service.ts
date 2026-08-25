import type { Address } from 'viem';
import { SOMNIA_ADDRESSES, somniaExchange } from '../config/somnia.js';
import { sessionService } from './session-service.js';

export interface CompoundedAllocation {
  userAddress: Address;
  totalCompoundedAmount: number;
  lastCompoundedAt: string;
  reinvestedCycles: number;
  lastVaultDeposited?: Address;
}

export class CompounderService {
  private userAllocations = new Map<string, CompoundedAllocation>();

  /**
   * Re-invests claimed settlement proceeds back into active user trading collateral and pool vaults.
   */
  public async compoundProceeds(
    userAddress: Address,
    claimedAmount: number,
    poolAddress?: Address,
  ): Promise<CompoundedAllocation> {
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
    if (poolAddress) {
      existing.lastVaultDeposited = poolAddress;
    }

    this.userAllocations.set(key, existing);

    // 1. Replenish active session trade allowance in sessionService for immediate re-investment
    const activeSession = await sessionService.getUserActiveSession(userAddress).catch(() => null);
    if (activeSession) {
      activeSession.spentToday = Math.max(0, Number((activeSession.spentToday - claimedAmount).toFixed(4)));
      activeSession.updatedAt = new Date().toISOString();
    }

    // 2. Deposit into on-chain pool vault if pool address is provided
    if (poolAddress && poolAddress.startsWith('0x') && claimedAmount > 0) {
      try {
        const decimals = SOMNIA_ADDRESSES.decimals;
        const rawAmount = BigInt(Math.floor(claimedAmount * 10 ** decimals));
        if (rawAmount > 0n) {
          await somniaExchange.trader.depositVault({
            vault: poolAddress,
            token: SOMNIA_ADDRESSES.collateral,
            amount: rawAmount,
          }).catch((vaultErr) => {
            console.warn(`[CompounderService] On-chain depositVault notice:`, vaultErr.message);
          });
        }
      } catch (err: any) {
        console.warn(`[CompounderService] Vault deposit error:`, err.message);
      }
    }

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

