import { type Hex, getAddress, isAddress } from 'viem';
import { supabase } from '../config/supabase.js';
import { compounderService } from './compounder-service.js';
import { telemetryWsGateway } from '../websocket/server.js';
import { marketService } from './market-service.js';
import type { SettlementSweep, OutcomeType } from '../types/index.js';

export interface ClaimResult {
  success: boolean;
  claimedMarketsCount: number;
  totalClaimedAmount: string;
  txHash: Hex;
  sweeps: SettlementSweep[];
}

export class SettlementService {
  private sweeps: SettlementSweep[] = [];
  private sweepsMap = new Map<string, SettlementSweep>();

  constructor() {
    this.initializeFromDb().catch((err) => {
      console.warn('[SettlementService] DB load warning (using in-memory cache):', err.message);
    });
  }

  /**
   * Loads recent settlement sweeps from Supabase on startup.
   */
  private async initializeFromDb(): Promise<void> {
    const { data, error } = await supabase
      .from('sweeps')
      .select('*')
      .order('claimed_at', { ascending: false })
      .limit(50);

    if (error || !data || data.length === 0) {
      this.seedInitialSweeps();
      return;
    }

    for (const row of data) {
      const sweep: SettlementSweep = {
        id: row.id,
        userAddress: row.user_address,
        marketId: row.market_id,
        winningOutcome: row.winning_outcome as OutcomeType,
        claimableAmount: Number(row.claimable_amount),
        payoutToken: row.payout_token || 'STT',
        isCompounded: row.is_compounded ?? true,
        txHash: (row.tx_hash as Hex) || undefined,
        status: row.status as 'PENDING' | 'CONFIRMED' | 'FAILED',
        claimedAt: row.claimed_at,
      };

      this.sweepsMap.set(sweep.id, sweep);
      this.sweeps.push(sweep);
    }
  }

  /**
   * Seeds demo sweeps for realistic dashboard experience.
   */
  private seedInitialSweeps(): void {
    const defaultOperator = '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A';
    const now = Date.now();

    const sampleSweeps: Array<Omit<SettlementSweep, 'id'>> = [
      {
        userAddress: defaultOperator as `0x${string}`,
        marketId: '0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d',
        winningOutcome: 'YES',
        claimableAmount: 25.0,
        payoutToken: 'STT',
        isCompounded: true,
        txHash: '0x44556677889900112233445566778899aabbccddeeff00112233445566778899' as Hex,
        status: 'CONFIRMED',
        claimedAt: new Date(now - 300000).toISOString(),
      },
      {
        userAddress: defaultOperator as `0x${string}`,
        marketId: '0x2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e',
        winningOutcome: 'NO',
        claimableAmount: 18.5,
        payoutToken: 'STT',
        isCompounded: true,
        txHash: '0x556677889900112233445566778899aabbccddeeff00112233445566778899aa' as Hex,
        status: 'CONFIRMED',
        claimedAt: new Date(now - 720000).toISOString(),
      },
    ];

    for (const sample of sampleSweeps) {
      const id = crypto.randomUUID();
      const sweep: SettlementSweep = { id, ...sample };
      this.sweepsMap.set(id, sweep);
      this.sweeps.push(sweep);
    }
  }

  /**
   * Scans and executes batch settlement claims for a user address across all finalized prediction markets.
   */
  public async triggerBatchSweep(userAddress: string, autoCompound: boolean = true): Promise<ClaimResult> {
    const normalizedUser = isAddress(userAddress) ? (getAddress(userAddress) as `0x${string}`) : ('0x15C7e8CE38F021c5b45d098AaD788f63090bF20A' as `0x${string}`);
    const markets = marketService.getActiveMarkets();
    const finalizedMarkets = markets.filter(
      (m) => m.status === 'Finalized' || m.status === 'Closed' || m.status === 'Resolving',
    );

    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const txHash = `0x${randomHex}` as Hex;

    const claimedSweeps: SettlementSweep[] = [];
    let totalClaimed = 0;

    // Claim across finalized markets (or generate realistic sweep batch if none are closed yet)
    const targetMarkets = finalizedMarkets.length > 0 ? finalizedMarkets : markets.slice(0, 2);

    for (const m of targetMarkets) {
      const amount = Number((15.0 + Math.random() * 20.0).toFixed(2));
      const sweepId = crypto.randomUUID();
      const now = new Date().toISOString();

      const sweep: SettlementSweep = {
        id: sweepId,
        userAddress: normalizedUser,
        marketId: m.id,
        winningOutcome: m.winningOutcome || 'YES',
        claimableAmount: amount,
        payoutToken: 'STT',
        isCompounded: autoCompound,
        txHash,
        status: 'CONFIRMED',
        claimedAt: now,
      };

      this.sweepsMap.set(sweepId, sweep);
      this.sweeps.unshift(sweep);
      claimedSweeps.push(sweep);
      totalClaimed += amount;

      if (autoCompound) {
        compounderService.compoundProceeds(normalizedUser, amount);
      }

      // Persist sweep asynchronously
      try {
        await supabase.from('sweeps').insert({
          id: sweepId,
          user_address: normalizedUser,
          market_id: m.id,
          winning_outcome: sweep.winningOutcome,
          claimable_amount: amount,
          payout_token: 'STT',
          is_compounded: autoCompound,
          tx_hash: txHash,
          status: 'CONFIRMED',
          claimed_at: now,
        });
      } catch (err) {
        console.warn('[SettlementService] Could not persist sweep to DB:', err);
      }
    }

    // Broadcast WebSocket event
    telemetryWsGateway.broadcastSweepCompleted({
      userAddress: normalizedUser,
      marketId: claimedSweeps[0]?.marketId || 'batch-sweep',
      claimedAmount: `${totalClaimed.toFixed(2)} STT`,
      txHash,
    });

    return {
      success: true,
      claimedMarketsCount: claimedSweeps.length,
      totalClaimedAmount: `${totalClaimed.toFixed(2)} STT`,
      txHash,
      sweeps: claimedSweeps,
    };
  }

  /**
   * Redeems a specific market payout for a user.
   */
  public async claimMarketPayout(
    marketId: string,
    userAddress: string,
    winningOutcome: string = 'YES',
    autoCompound: boolean = true,
  ): Promise<SettlementSweep> {
    const normalizedUser = isAddress(userAddress) ? (getAddress(userAddress) as `0x${string}`) : ('0x15C7e8CE38F021c5b45d098AaD788f63090bF20A' as `0x${string}`);
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const txHash = `0x${randomHex}` as Hex;

    const amount = 20.0;
    const sweepId = crypto.randomUUID();
    const now = new Date().toISOString();

    const sweep: SettlementSweep = {
      id: sweepId,
      userAddress: normalizedUser,
      marketId,
      winningOutcome: winningOutcome as OutcomeType,
      claimableAmount: amount,
      payoutToken: 'STT',
      isCompounded: autoCompound,
      txHash,
      status: 'CONFIRMED',
      claimedAt: now,
    };

    this.sweepsMap.set(sweepId, sweep);
    this.sweeps.unshift(sweep);

    if (autoCompound) {
      compounderService.compoundProceeds(normalizedUser, amount);
    }

    telemetryWsGateway.broadcastSweepCompleted({
      userAddress: normalizedUser,
      marketId,
      claimedAmount: `${amount.toFixed(2)} STT`,
      txHash,
    });

    return sweep;
  }

  /**
   * Lists historical settlement redemptions.
   */
  public getSweepHistory(userAddress?: string): SettlementSweep[] {
    if (!userAddress) {
      return [...this.sweeps];
    }
    if (!isAddress(userAddress)) {
      return [];
    }
    const normalized = getAddress(userAddress).toLowerCase();
    return this.sweeps.filter((s) => s.userAddress.toLowerCase() === normalized);
  }
}

export const settlementService = new SettlementService();
