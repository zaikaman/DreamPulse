import { type Address, isAddress, getAddress } from 'viem';
import { SOMNIA_ADDRESSES, somniaExchange, hasOperatorGas } from '../config/somnia.js';
import { sessionService } from './session-service.js';

export interface CompoundedAllocation {
  userAddress: Address;
  totalCompoundedAmount: number; // 100% reinvested in active trading capital
  lastCompoundedAt: string;
  reinvestedCycles: number;
  lastVaultDeposited?: Address;
}

export class CompounderService {
  private userAllocations = new Map<string, CompoundedAllocation>();

  /**
   * Re-invests claimed settlement proceeds using 100% Auto-Compounding Protocol:
   * - 100% is auto-compounded directly back into active user trading collateral and pool vaults.
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

    const tradingShare = Number(claimedAmount.toFixed(4));
    existing.totalCompoundedAmount = Number((existing.totalCompoundedAmount + tradingShare).toFixed(4));
    existing.reinvestedCycles += 1;
    existing.lastCompoundedAt = new Date().toISOString();
    if (poolAddress) {
      existing.lastVaultDeposited = poolAddress;
    }

    this.userAllocations.set(key, existing);

    // 1. Replenish active session trade allowance in sessionService with 100% trading share
    const activeSession = await sessionService.getUserActiveSession(userAddress).catch(() => null);
    if (activeSession) {
      activeSession.spentToday = Math.max(0, Number((activeSession.spentToday - tradingShare).toFixed(4)));
      activeSession.updatedAt = new Date().toISOString();
    }

    // 2. Deposit the 100% trading share into on-chain pool vault if pool address is provided
    if (poolAddress && poolAddress.startsWith('0x') && tradingShare > 0) {
      try {
        const hasGas = await hasOperatorGas();
        if (hasGas) {
          const decimals = SOMNIA_ADDRESSES.decimals;
          const rawAmount = BigInt(Math.floor(tradingShare * 10 ** decimals));
          if (rawAmount > 0n) {
            await somniaExchange.trader.depositVault({
              vault: poolAddress,
              token: SOMNIA_ADDRESSES.collateral,
              amount: rawAmount,
            }).catch((vaultErr) => {
              if (
                !vaultErr.message?.includes('Missing or invalid parameters') &&
                !vaultErr.message?.includes('account does not exist') &&
                !vaultErr.message?.includes('gas')
              ) {
                console.warn(`[CompounderService] On-chain depositVault notice:`, vaultErr.message);
              }
            });
          }
        }
      } catch (err: any) {
        console.warn(`[CompounderService] Vault deposit error:`, err.message);
      }
    }

    console.log(
      `[CompounderService] 100% Compound: +${tradingShare.toFixed(2)} tUSDC to Trading for ${userAddress} (Cycles: ${existing.reinvestedCycles})`,
    );

    return existing;
  }

  /**
   * Rehydrates compounding allocations from historical database sweeps.
   */
  public recordHistoricalSweep(userAddress: Address, amount: number, claimedAt: string): void {
    const key = userAddress.toLowerCase();
    const existing = this.userAllocations.get(key) || {
      userAddress,
      totalCompoundedAmount: 0,
      lastCompoundedAt: claimedAt,
      reinvestedCycles: 0,
    };

    existing.totalCompoundedAmount = Number((existing.totalCompoundedAmount + amount).toFixed(4));
    existing.reinvestedCycles += 1;
    existing.lastCompoundedAt = claimedAt;

    this.userAllocations.set(key, existing);
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
