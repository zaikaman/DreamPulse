import { type Hex, type Address, getAddress, isAddress } from 'viem';
import { supabase } from '../config/supabase.js';
import { compounderService } from './compounder-service.js';
import { telemetryWsGateway } from '../websocket/server.js';
import { marketService } from './market-service.js';
import { orderService } from './order-service.js';
import {
  SOMNIA_ADDRESSES,
  somniaExchange,
  operatorAccount,
  hasOperatorGas,
} from '../config/somnia.js';
import type { SettlementSweep, OutcomeType } from '../types/index.js';

export interface UnclaimedPosition {
  marketId: string;
  symbol: string;
  marketIdHex?: Hex;
  poolAddress?: Address;
  outcomeToken?: Address;
  winningOutcome: OutcomeType;
  outcomeIdx: 0 | 1;
  rawAmount: bigint;
  claimableAmount: number;
  isVoided: boolean;
  status: string;
}

export interface SerializableUnclaimedPosition {
  marketId: string;
  symbol: string;
  marketIdHex?: Hex;
  poolAddress?: Address;
  outcomeToken?: Address;
  winningOutcome: OutcomeType;
  outcomeIdx: 0 | 1;
  rawAmount: string;
  claimableAmount: number;
  isVoided: boolean;
  status: string;
}

export interface SweeperSummary {
  unclaimedAmount: number;
  totalClaimedAllTime: number;
  claimableMarketsCount: number;
  confirmedSweepsCount: number;
  unclaimedPositions: SerializableUnclaimedPosition[];
  autoCompound: boolean;
  compoundedStats: {
    totalCompoundedAmount: number;
    reinvestedCycles: number;
    lastCompoundedAt: string;
  };
}

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
    this.sweeps = [];
    this.sweepsMap.clear();

    const { data, error } = await supabase
      .from('sweeps')
      .select('*')
      .order('claimed_at', { ascending: false })
      .limit(50);

    if (error || !data || data.length === 0) {
      return;
    }

    for (const row of data) {
      const sweep: SettlementSweep = {
        id: row.id,
        userAddress: row.user_address,
        marketId: row.market_id,
        winningOutcome: row.winning_outcome as OutcomeType,
        claimableAmount: Number(row.claimable_amount),
        payoutToken: row.payout_token || 'tUSDC',
        isCompounded: row.is_compounded ?? true,
        txHash: (row.tx_hash as Hex) || undefined,
        status: row.status as 'PENDING' | 'CONFIRMED' | 'FAILED',
        claimedAt: row.claimed_at,
      };

      this.sweepsMap.set(sweep.id, sweep);
      this.sweeps.push(sweep);

      if (sweep.isCompounded && sweep.claimableAmount > 0) {
        compounderService.recordHistoricalSweep(sweep.userAddress, sweep.claimableAmount, sweep.claimedAt);
      }
    }
  }

  /**
   * Scans all finalized/resolved binary prediction markets for unclaimed winning outcome tokens.
   */
  public async scanUnclaimedSettlements(userAddress?: string): Promise<UnclaimedPosition[]> {
    const normalizedUser = userAddress && isAddress(userAddress)
      ? (getAddress(userAddress) as Address)
      : operatorAccount.address;

    const positions: UnclaimedPosition[] = [];
    const decimals = SOMNIA_ADDRESSES.decimals;
    const one = 10n ** BigInt(decimals);

    // 1. Gather candidate finalized/resolving markets from active markets and order history
    const candidateMarkets = marketService.getActiveMarkets().filter(
      (m) => m.status === 'Finalized' || m.status === 'Closed' || m.status === 'Resolving',
    );

    // Include all historical markets that have traded orders
    const tradedMarketIds = new Set(orderService.getOrders({ limit: 100 }).map((o) => o.marketId));
    for (const mId of tradedMarketIds) {
      if (mId.startsWith('0x') && !candidateMarkets.some((cm) => cm.id === mId || cm.marketIdHex === mId)) {
        const m = marketService.getMarketById(mId);
        if (m) {
          candidateMarkets.push(m);
        } else {
          candidateMarkets.push({
            id: mId,
            symbol: 'BTC/USD',
            strikePrice: 0,
            windowDuration: '5m',
            openTimestamp: new Date().toISOString(),
            closeTimestamp: new Date().toISOString(),
            resolutionTimestamp: new Date().toISOString(),
            status: 'Finalized',
            marketIdHex: mId as Hex,
            bestBidYes: 1,
            bestAskYes: 1,
            bestBidNo: 0,
            bestAskNo: 0,
            impliedProbYes: 1,
            fairValueYes: 1,
            edgePercentage: 0,
          });
        }
      }
    }

    const fetchWithTimeout = async <T>(p: Promise<T>, fallback: T, timeoutMs: number = 4000): Promise<T> => {
      let timer: NodeJS.Timeout;
      return Promise.race([
        p.catch(() => fallback),
        new Promise<T>((resolve) => {
          timer = setTimeout(() => resolve(fallback), timeoutMs);
        }),
      ]).finally(() => clearTimeout(timer));
    };

    // 2. Query indexer for any additional resolved/voided markets
    try {
      const [indexerResolved, indexerVoided] = await Promise.all([
        fetchWithTimeout(somniaExchange.client.listBinaryMarkets({ status: 'Resolved' as any, limit: 10 }), [], 3500),
        fetchWithTimeout(somniaExchange.client.listBinaryMarkets({ status: 'Voided' as any, limit: 10 }), [], 3500),
      ]);

      for (const im of [...indexerResolved, ...indexerVoided]) {
        if (!candidateMarkets.some((cm) => cm.id === im.marketId || cm.marketIdHex === im.marketId)) {
          candidateMarkets.push({
            id: im.marketId,
            symbol: `${im.asset || 'BTC'}/USD`,
            strikePrice: Number(im.strike || 0),
            windowDuration: '5m',
            openTimestamp: new Date().toISOString(),
            closeTimestamp: new Date().toISOString(),
            resolutionTimestamp: new Date().toISOString(),
            status: 'Finalized',
            marketIdHex: im.marketId as Hex,
            poolAddress: im.poolAddress as Address,
            bestBidYes: 1,
            bestAskYes: 1,
            bestBidNo: 0,
            bestAskNo: 0,
            impliedProbYes: 1,
            fairValueYes: 1,
            edgePercentage: 0,
          });
        }
      }
    } catch {
      // Indexer fallback
    }

    // 3. Check outcome balances for all candidate markets in parallel
    const marketChecks = candidateMarkets.slice(0, 20).map(async (m) => {
      const targetHex = m.marketIdHex || (m.id.startsWith('0x') && m.id.length === 66 ? (m.id as Hex) : undefined);
      if (!targetHex) {
        return;
      }

      try {
        const onchain = await fetchWithTimeout(
          somniaExchange.client.getMarketOnchain(targetHex).catch(() => null),
          null,
          3500,
        );
        if (!onchain || (!onchain.isResolved && !onchain.isVoided && !onchain.finalized)) {
          return;
        }

        const [yesBal, noBal] = await Promise.all([
          fetchWithTimeout(
            somniaExchange.client.getOutcomeBalance({
              outcomeToken: onchain.outcomeToken,
              account: normalizedUser,
              id: onchain.yesId,
            }),
            0n,
            3000,
          ),
          fetchWithTimeout(
            somniaExchange.client.getOutcomeBalance({
              outcomeToken: onchain.outcomeToken,
              account: normalizedUser,
              id: onchain.noId,
            }),
            0n,
            3000,
          ),
        ]);

        if (onchain.isVoided) {
          if (yesBal > 0n) {
            const humanAmount = (Number(yesBal) / Number(one)) * 0.5;
            positions.push({
              marketId: m.id,
              symbol: m.symbol,
              marketIdHex: m.marketIdHex as Hex,
              poolAddress: onchain.pool as Address,
              outcomeToken: onchain.outcomeToken as Address,
              winningOutcome: 'YES',
              outcomeIdx: 0,
              rawAmount: yesBal,
              claimableAmount: Number(humanAmount.toFixed(4)),
              isVoided: true,
              status: 'Voided',
            });
          }
          if (noBal > 0n) {
            const humanAmount = (Number(noBal) / Number(one)) * 0.5;
            positions.push({
              marketId: m.id,
              symbol: m.symbol,
              marketIdHex: m.marketIdHex as Hex,
              poolAddress: onchain.pool as Address,
              outcomeToken: onchain.outcomeToken as Address,
              winningOutcome: 'NO',
              outcomeIdx: 1,
              rawAmount: noBal,
              claimableAmount: Number(humanAmount.toFixed(4)),
              isVoided: true,
              status: 'Voided',
            });
          }
        } else {
          const winningIdx: 0 | 1 = onchain.winningOutcome === 0 ? 0 : 1;
          const winBal = winningIdx === 0 ? yesBal : noBal;
          if (winBal > 0n) {
            const humanAmount = Number(winBal) / Number(one);
            positions.push({
              marketId: m.id,
              symbol: m.symbol,
              marketIdHex: m.marketIdHex as Hex,
              poolAddress: onchain.pool as Address,
              outcomeToken: onchain.outcomeToken as Address,
              winningOutcome: winningIdx === 0 ? 'YES' : 'NO',
              outcomeIdx: winningIdx,
              rawAmount: winBal,
              claimableAmount: Number(humanAmount.toFixed(4)),
              isVoided: false,
              status: 'Resolved',
            });
          }
        }
      } catch (err: any) {
        console.warn(`[SettlementService] Scan error for market ${m.id}:`, err.message);
      }
    });

    await Promise.all(marketChecks);

    return positions;
  }

  /**
   * Scans and executes batch settlement claims for a user address across all finalized prediction markets.
   */
  public async triggerBatchSweep(userAddress: string, autoCompound: boolean = true): Promise<ClaimResult> {
    const normalizedUser = isAddress(userAddress)
      ? (getAddress(userAddress) as `0x${string}`)
      : operatorAccount.address;

    const unclaimed = await this.scanUnclaimedSettlements(normalizedUser);
    const claimedSweeps: SettlementSweep[] = [];
    let totalClaimed = 0;
    let lastTxHash: Hex | undefined;
    const now = new Date().toISOString();

    if (unclaimed.length > 0) {
      for (const pos of unclaimed) {
        let txHash: Hex | undefined;
        try {
          const hasGas = await hasOperatorGas();
          if (hasGas && pos.marketIdHex && pos.outcomeToken) {
            const res = await somniaExchange.trader.redeem({
              marketId: pos.marketIdHex,
              outcomeIdx: pos.outcomeIdx,
              amount: pos.rawAmount,
              outcomeToken: pos.outcomeToken,
            });
            if (res?.hash) {
              txHash = res.hash.startsWith('0x') ? (res.hash as Hex) : (`0x${res.hash}` as Hex);
            }
          }
        } catch (err: any) {
          if (
            !err.message?.includes('Missing or invalid parameters') &&
            !err.message?.includes('account does not exist') &&
            !err.message?.includes('gas')
          ) {
            console.warn(`[SettlementService] On-chain redeem note for market ${pos.marketId}:`, err.message);
          }
        }

        if (!txHash) {
          continue;
        }
        lastTxHash = txHash;

        const sweepId = crypto.randomUUID();
        const sweep: SettlementSweep = {
          id: sweepId,
          userAddress: normalizedUser,
          marketId: pos.marketId,
          winningOutcome: pos.winningOutcome,
          claimableAmount: pos.claimableAmount,
          payoutToken: 'tUSDC',
          isCompounded: autoCompound,
          txHash,
          status: 'CONFIRMED',
          claimedAt: now,
        };

        this.sweepsMap.set(sweepId, sweep);
        this.sweeps.unshift(sweep);
        claimedSweeps.push(sweep);
        totalClaimed += pos.claimableAmount;

        if (autoCompound) {
          await compounderService.compoundProceeds(normalizedUser, pos.claimableAmount, pos.poolAddress);
        }

        try {
          await marketService.ensureMarketPersisted(pos.marketId, pos.symbol);
          await supabase.from('sweeps').insert({
            id: sweepId,
            user_address: normalizedUser,
            market_id: pos.marketId,
            winning_outcome: pos.winningOutcome,
            claimable_amount: pos.claimableAmount,
            payout_token: 'tUSDC',
            is_compounded: autoCompound,
            tx_hash: txHash,
            status: 'CONFIRMED',
            claimed_at: now,
          });
        } catch (err) {
          console.warn('[SettlementService] DB persist note:', err);
        }
      }
    }

    const resolvedTxHash: Hex = lastTxHash || ('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex);

    // Broadcast WebSocket event
    if (claimedSweeps.length > 0) {
      telemetryWsGateway.broadcastSweepCompleted({
        userAddress: normalizedUser,
        marketId: claimedSweeps[0].marketId,
        claimedAmount: `${totalClaimed.toFixed(2)} tUSDC`,
        txHash: resolvedTxHash,
      });
    }

    return {
      success: true,
      claimedMarketsCount: claimedSweeps.length,
      totalClaimedAmount: `${totalClaimed.toFixed(2)} tUSDC`,
      txHash: resolvedTxHash,
      sweeps: claimedSweeps,
    };
  }

  /**
   * Executes settlement claim for an individual market contract.
   */
  public async claimMarketPayout(
    marketId: string,
    userAddress?: string,
    winningOutcomePreference: string = 'YES',
    autoCompound: boolean = true,
  ): Promise<SettlementSweep> {
    const normalizedUser = userAddress && isAddress(userAddress)
      ? (getAddress(userAddress) as Address)
      : operatorAccount.address;

    const market = marketService.getMarketById(marketId);
    let winningOutcome: 'YES' | 'NO' = winningOutcomePreference === 'NO' ? 'NO' : 'YES';
    let amount = 0;
    let txHash: Hex | undefined;

    const targetHex = market?.marketIdHex || (marketId.startsWith('0x') && marketId.length === 66 ? (marketId as Hex) : undefined);
    if (targetHex) {
      try {
        const onchain = await somniaExchange.client.getMarketOnchain(targetHex).catch(() => null);
        if (onchain && (onchain.isResolved || onchain.finalized)) {
          const winIdx: 0 | 1 = typeof onchain.winningOutcome === 'number'
            ? (onchain.winningOutcome === 0 ? 0 : 1)
            : (winningOutcomePreference === 'NO' ? 1 : 0);
          winningOutcome = winIdx === 0 ? 'YES' : 'NO';
          const winId = winIdx === 0 ? onchain.yesId : onchain.noId;

          const bal = await somniaExchange.client.getOutcomeBalance({
            outcomeToken: onchain.outcomeToken,
            account: normalizedUser,
            id: winId,
          });

          if (bal > 0n) {
            const decimals = SOMNIA_ADDRESSES.decimals;
            const one = 10n ** BigInt(decimals);
            amount = Number(bal) / Number(one);

            const hasGas = await hasOperatorGas();
            if (hasGas) {
              const res = await somniaExchange.trader.redeem({
                marketId: targetHex,
                outcomeIdx: winIdx,
                amount: bal,
                outcomeToken: onchain.outcomeToken,
              });
              if (res?.hash) {
                txHash = res.hash.startsWith('0x') ? (res.hash as Hex) : (`0x${res.hash}` as Hex);
              }
            }
          }
        }
      } catch (err: any) {
        if (
          !err.message?.includes('Missing or invalid parameters') &&
          !err.message?.includes('account does not exist') &&
          !err.message?.includes('gas')
        ) {
          console.warn(`[SettlementService] Individual redeem note:`, err.message);
        }
      }
    }

    if (!txHash) {
      return {
        id: crypto.randomUUID(),
        userAddress: normalizedUser,
        marketId,
        winningOutcome: winningOutcome as OutcomeType,
        claimableAmount: 0,
        payoutToken: 'tUSDC',
        isCompounded: false,
        txHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        status: 'PENDING',
        claimedAt: new Date().toISOString(),
      };
    }

    const sweepId = crypto.randomUUID();
    const now = new Date().toISOString();

    const sweep: SettlementSweep = {
      id: sweepId,
      userAddress: normalizedUser,
      marketId,
      winningOutcome: winningOutcome as OutcomeType,
      claimableAmount: amount,
      payoutToken: 'tUSDC',
      isCompounded: autoCompound,
      txHash,
      status: 'CONFIRMED',
      claimedAt: now,
    };

    if (amount > 0) {
      this.sweepsMap.set(sweepId, sweep);
      this.sweeps.unshift(sweep);

      if (autoCompound) {
        await compounderService.compoundProceeds(normalizedUser, amount, market?.poolAddress as Address);
      }

      try {
        await marketService.ensureMarketPersisted(marketId, market?.symbol || 'BTC/USD');
        await supabase.from('sweeps').insert({
          id: sweepId,
          user_address: normalizedUser,
          market_id: marketId,
          winning_outcome: sweep.winningOutcome,
          claimable_amount: sweep.claimableAmount,
          payout_token: 'tUSDC',
          is_compounded: autoCompound,
          tx_hash: txHash,
          status: 'CONFIRMED',
          claimed_at: now,
        });
      } catch (err) {
        console.warn('[SettlementService] Single claim DB persist note:', err);
      }
    }

    telemetryWsGateway.broadcastSweepCompleted({
      userAddress: normalizedUser,
      marketId,
      claimedAmount: `${amount.toFixed(2)} tUSDC`,
      txHash,
    });

    return sweep;
  }

  /**
   * Retrieves summary statistics and pending unclaimed payouts for a user.
   */
  public async getSweeperSummary(userAddress?: string): Promise<SweeperSummary> {
    const normalized = userAddress && isAddress(userAddress)
      ? (getAddress(userAddress) as Address)
      : operatorAccount.address;

    if (this.sweeps.length === 0) {
      await this.initializeFromDb();
    }

    const unclaimedPositions = await this.scanUnclaimedSettlements(normalized);
    const unclaimedAmount = Number(
      unclaimedPositions.reduce((acc, p) => acc + p.claimableAmount, 0).toFixed(4),
    );

    const userSweeps = this.getSweepHistory(normalized);
    const totalClaimedAllTime = Number(
      userSweeps.reduce((acc, s) => acc + s.claimableAmount, 0).toFixed(4),
    );

    const compoundedStats = compounderService.getUserCompoundedStats(normalized);

    return {
      unclaimedAmount,
      totalClaimedAllTime,
      claimableMarketsCount: unclaimedPositions.length,
      confirmedSweepsCount: userSweeps.length,
      unclaimedPositions: unclaimedPositions.map((p) => ({
        marketId: p.marketId,
        symbol: p.symbol,
        marketIdHex: p.marketIdHex,
        poolAddress: p.poolAddress,
        outcomeToken: p.outcomeToken,
        winningOutcome: p.winningOutcome,
        outcomeIdx: p.outcomeIdx,
        rawAmount: p.rawAmount.toString(),
        claimableAmount: p.claimableAmount,
        isVoided: p.isVoided,
        status: p.status,
      })),
      autoCompound: true,
      compoundedStats: {
        totalCompoundedAmount: compoundedStats.totalCompoundedAmount,
        reinvestedCycles: compoundedStats.reinvestedCycles,
        lastCompoundedAt: compoundedStats.lastCompoundedAt,
      },
    };
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

