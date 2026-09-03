import { isAddress, getAddress, type Address, type Hex } from 'viem';
import { supabase, isPersistenceEnabled } from '../config/supabase.js';
import { sessionService } from './session-service.js';
import { orderService, quantizeOrder } from './order-service.js';
import { marketService } from './market-service.js';
import { telemetryWsGateway } from '../websocket/server.js';
import type { OrderExecution, OutcomeType, OrderDirection, OrderType, SessionGrant } from '../types/index.js';
import type { IAgentDecision } from '../agents/base-agent.js';

export interface SocialCopyRelation {
  id: string;
  copierAddress: Address;
  targetAddress: Address;
  isActive: boolean;
  maxTradeSize?: number;
  dailyVolumeCap?: number;
  spentToday?: number;
  lastSpendResetTimestamp?: number;
  totalCopiedTrades: number;
  totalCopiedVolume: number;
  createdAt: string;
  updatedAt: string;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function toRelationRecord(row: any): SocialCopyRelation {
  return {
    id: row.id,
    copierAddress: getAddress(row.copier_address) as Address,
    targetAddress: getAddress(row.target_address) as Address,
    isActive: row.is_active === true,
    maxTradeSize: row.max_trade_size ? Number(row.max_trade_size) : undefined,
    dailyVolumeCap: row.daily_volume_cap ? Number(row.daily_volume_cap) : undefined,
    totalCopiedTrades: Number(row.total_copied_trades || 0),
    totalCopiedVolume: Number(row.total_copied_volume || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SocialCopyService {
  private relations = new Map<string, SocialCopyRelation>();
  private readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.loadFromDb().catch((err) => {
      console.warn('[SocialCopyService] Initial DB load warning (using in-memory cache):', err?.message || err);
    });
    this.initRealtime();
  }

  public async waitForInit(): Promise<void> {
    return this.readyPromise;
  }

  private initRealtime(): void {
    if (!isPersistenceEnabled()) return;
    try {
      supabase
        .channel('public:social_copy_trades')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'social_copy_trades' },
          (payload: { eventType: string; new: any; old: any }) => {
            if (payload.new && payload.new.copier_address && payload.new.target_address) {
              const rec = toRelationRecord(payload.new);
              const key = this.getCacheKey(rec.copierAddress, rec.targetAddress);
              this.relations.set(key, rec);
            }
          }
        )
        .subscribe();
    } catch (err: any) {
      console.warn('[SocialCopyService] Realtime subscription warning:', err?.message || err);
    }
  }

  private async loadFromDb(): Promise<void> {
    if (!isPersistenceEnabled()) return;
    try {
      const { data, error } = await supabase.from('social_copy_trades').select('*').limit(2000);
      if (error || !data) return;
      for (const row of data) {
        const rec = toRelationRecord(row);
        const key = this.getCacheKey(rec.copierAddress, rec.targetAddress);
        this.relations.set(key, rec);
      }
    } catch {}
  }

  private getCacheKey(copier: string, target: string): string {
    return `${copier.toLowerCase()}:${target.toLowerCase()}`;
  }

  public async toggleSocialCopy(
    copierAddress: string,
    targetAddress: string,
    enabled: boolean,
    maxTradeSize?: number,
    dailyVolumeCap?: number,
  ): Promise<SocialCopyRelation> {
    await this.waitForInit();
    if (!isAddress(copierAddress)) throw new Error(`Invalid copier address: ${copierAddress}`);
    if (!isAddress(targetAddress)) throw new Error(`Invalid target forecaster address: ${targetAddress}`);

    const normalizedCopier = getAddress(copierAddress) as Address;
    const normalizedTarget = getAddress(targetAddress) as Address;

    if (normalizedCopier.toLowerCase() === normalizedTarget.toLowerCase()) {
      throw new Error('Cannot mirror own forecaster address');
    }

    const key = this.getCacheKey(normalizedCopier, normalizedTarget);
    const existing = this.relations.get(key);
    const now = new Date().toISOString();

    const relation: SocialCopyRelation = {
      id: existing?.id || crypto.randomUUID(),
      copierAddress: normalizedCopier,
      targetAddress: normalizedTarget,
      isActive: enabled,
      maxTradeSize: maxTradeSize !== undefined ? maxTradeSize : existing?.maxTradeSize,
      dailyVolumeCap: dailyVolumeCap !== undefined ? dailyVolumeCap : existing?.dailyVolumeCap,
      totalCopiedTrades: existing?.totalCopiedTrades || 0,
      totalCopiedVolume: existing?.totalCopiedVolume || 0,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.relations.set(key, relation);

    if (isPersistenceEnabled()) {
      try {
        await supabase.from('social_copy_trades').upsert(
          {
            id: relation.id,
            copier_address: relation.copierAddress,
            target_address: relation.targetAddress,
            is_active: relation.isActive,
            max_trade_size: relation.maxTradeSize ?? null,
            daily_volume_cap: relation.dailyVolumeCap ?? null,
            total_copied_trades: relation.totalCopiedTrades,
            total_copied_volume: relation.totalCopiedVolume,
            updated_at: relation.updatedAt,
          } as any,
          { onConflict: 'copier_address,target_address' },
        );
      } catch (err: any) {
        console.warn('[SocialCopyService] Error persisting social copy trade:', err?.message || err);
      }
    }

    return relation;
  }

  public isUserCopyingTarget(copierAddress: string, targetAddress: string): boolean {
    if (!isAddress(copierAddress) || !isAddress(targetAddress)) return false;
    const key = this.getCacheKey(copierAddress, targetAddress);
    const rel = this.relations.get(key);
    return rel ? rel.isActive : false;
  }

  public getCopierConfig(copierAddress: string, targetAddress: string): SocialCopyRelation | null {
    if (!isAddress(copierAddress) || !isAddress(targetAddress)) return null;
    const key = this.getCacheKey(copierAddress, targetAddress);
    return this.relations.get(key) || null;
  }

  public getTargetsForCopier(copierAddress: string): SocialCopyRelation[] {
    if (!isAddress(copierAddress)) return [];
    const norm = copierAddress.toLowerCase();
    return Array.from(this.relations.values()).filter(
      (r) => r.copierAddress.toLowerCase() === norm && r.isActive,
    );
  }

  public getActiveCopiersForTarget(targetAddress: string): SocialCopyRelation[] {
    if (!isAddress(targetAddress)) return [];
    const norm = targetAddress.toLowerCase();
    return Array.from(this.relations.values()).filter(
      (r) => r.targetAddress.toLowerCase() === norm && r.isActive,
    );
  }

  /**
   * Dispatches automated social mirror copy-trades when a forecaster places an order.
   * Executes orders concurrently on behalf of all active followers with valid session keys.
   */
  public async executeSocialCopiesForOrder(leaderOrder: OrderExecution): Promise<OrderExecution[]> {
    if (!leaderOrder || !leaderOrder.userAddress) return [];
    // Only mirror human / terminal forecaster orders (not automated protocol swarm bots to avoid duplication)
    if (leaderOrder.source !== 'TERMINAL' && leaderOrder.agentType !== 'Manual') {
      return [];
    }

    if (leaderOrder.outcome !== 'YES' && leaderOrder.outcome !== 'NO') {
      return [];
    }

    const copiers = this.getActiveCopiersForTarget(leaderOrder.userAddress);
    if (copiers.length === 0) return [];

    const executedOrders: OrderExecution[] = [];

    for (const copierRel of copiers) {
      if (copierRel.copierAddress.toLowerCase() === leaderOrder.userAddress.toLowerCase()) {
        continue;
      }

      try {
        const session = await sessionService.getUserActiveSession(copierRel.copierAddress);
        if (!session || !session.isActive) {
          console.warn(`[SocialCopyService] Skipping mirror for ${copierRel.copierAddress}: No active session key`);
          continue;
        }

        if (new Date(session.expiresAt).getTime() <= Date.now()) {
          console.warn(`[SocialCopyService] Skipping mirror for ${copierRel.copierAddress}: Session key expired`);
          continue;
        }

        const price = leaderOrder.price;
        if (price <= 0 || price >= 1.0) continue;

        // Calculate size respecting copier and session limits
        let targetLotSize = leaderOrder.lotSize;
        if (copierRel.maxTradeSize && copierRel.maxTradeSize > 0) {
          const maxLotsFromCopierLimit = copierRel.maxTradeSize / price;
          targetLotSize = Math.min(targetLotSize, maxLotsFromCopierLimit);
        }
        if (session.maxTradeSize && session.maxTradeSize > 0) {
          const maxLotsFromSessionLimit = session.maxTradeSize / price;
          targetLotSize = Math.min(targetLotSize, maxLotsFromSessionLimit);
        }

        const {
          rawQuantity,
          quantizedSize,
          quantizedPrice,
          totalCost,
        } = quantizeOrder(price, targetLotSize, leaderOrder.outcome);

        if (rawQuantity <= 0n || quantizedSize <= 0) {
          console.warn(`[SocialCopyService] Skipping mirror for ${copierRel.copierAddress}: Lot size quantized to 0`);
          continue;
        }

        // Validate copier relation daily volume cap if set
        if (copierRel.dailyVolumeCap && copierRel.dailyVolumeCap > 0) {
          const nowMs = Date.now();
          if (!copierRel.lastSpendResetTimestamp || nowMs - copierRel.lastSpendResetTimestamp > 24 * 3600 * 1000) {
            copierRel.spentToday = 0;
            copierRel.lastSpendResetTimestamp = nowMs;
          }
          if ((copierRel.spentToday || 0) + totalCost > copierRel.dailyVolumeCap) {
            console.warn(`[SocialCopyService] Mirror skipped for ${copierRel.copierAddress}: Daily volume cap of ${copierRel.dailyVolumeCap} tUSDC reached for Forecaster ${copierRel.targetAddress}`);
            continue;
          }
        }

        // Validate session risk allowance
        const riskCheck = sessionService.validateTradeAllowance(session.id, totalCost);
        if (!riskCheck.allowed) {
          console.warn(`[SocialCopyService] Mirror skipped for ${copierRel.copierAddress}: ${riskCheck.reason}`);
          continue;
        }

        const market = marketService.getMarketById(leaderOrder.marketId);
        const isZeroMarketId = !market?.marketIdHex || market.marketIdHex.toLowerCase() === ZERO_ADDRESS.toLowerCase() || /^0x0+$/i.test(market.marketIdHex);

        if (isZeroMarketId) {
          console.warn(`[SocialCopyService] Mirror skipped for ${copierRel.copierAddress}: Market ${leaderOrder.marketId} is not a valid on-chain market`);
          continue;
        }

        // On-Chain CLOB Execution
        const targetOutcome: 'YES' | 'NO' = leaderOrder.outcome === 'NO' ? 'NO' : 'YES';
        const decision: IAgentDecision = {
          agentType: 'Manual',
          action: leaderOrder.direction === 'SELL' ? 'TAKER_SELL' : (leaderOrder.orderType === 'LIMIT' ? 'LIMIT_QUOTE' : 'TAKER_BUY'),
          targetMarketId: leaderOrder.marketId,
          targetOutcome,
          price: quantizedPrice,
          lotSize: quantizedSize,
          confidence: 1.0,
          rationale: `Social Mirror trade copying Forecaster ${leaderOrder.userAddress}`,
        };

        const copiedExecution = await orderService.executeAgentDecision(
          decision,
          session as unknown as SessionGrant,
          'TERMINAL',
        );

        if (copiedExecution) {
          executedOrders.push(copiedExecution);

          // Update copier statistics & daily spend
          copierRel.spentToday = (copierRel.spentToday || 0) + totalCost;
          copierRel.totalCopiedTrades += 1;
          copierRel.totalCopiedVolume += totalCost;
          copierRel.updatedAt = new Date().toISOString();

          if (isPersistenceEnabled()) {
            void (async () => {
              try {
                await supabase
                  .from('social_copy_trades')
                  .update({
                    total_copied_trades: copierRel.totalCopiedTrades,
                    total_copied_volume: copierRel.totalCopiedVolume,
                    updated_at: copierRel.updatedAt,
                  })
                  .eq('id', copierRel.id);
              } catch {}
            })();
          }
        }
      } catch (err: any) {
        console.warn(`[SocialCopyService] Error mirroring trade for ${copierRel.copierAddress}:`, err?.message || err);
      }
    }

    return executedOrders;
  }
}

export const socialCopyService = new SocialCopyService();
