import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SweeperAgent } from '../src/agents/sweeper.js';
import { SettlementService } from '../src/services/settlement-service.js';
import { CompounderService } from '../src/services/compounder-service.js';
import { somniaExchange } from '../src/config/somnia.js';
import type { IAgentContext } from '../src/agents/base-agent.js';
import type { Market, SessionGrant } from '../src/types/index.js';
import type { Address, Hex } from 'viem';

describe('Phase 6 Settlement Sweeper & Collateral Compounder Tests', () => {
  const finalizedMarket: Market = {
    id: '0x3333444455556666777788889999000011112222',
    symbol: 'BTC/USD',
    strikePrice: 96500.0,
    windowDuration: '5m',
    openTimestamp: new Date(Date.now() - 600000).toISOString(),
    closeTimestamp: new Date(Date.now() - 300000).toISOString(),
    resolutionTimestamp: new Date(Date.now() - 240000).toISOString(),
    status: 'Finalized',
    settlementPrice: 96800.0,
    winningOutcome: 'YES',
    bestBidYes: 1.0,
    bestAskYes: 1.0,
    bestBidNo: 0.0,
    bestAskNo: 0.0,
    impliedProbYes: 1.0,
    fairValueYes: 1.0,
    edgePercentage: 0,
  };

  const openMarket: Market = {
    ...finalizedMarket,
    id: '0x4444555566667777888899990000111122223333',
    status: 'Open',
    closeTimestamp: new Date(Date.now() + 300000).toISOString(),
  };

  const validSession: SessionGrant = {
    id: 'sweeper-test-session',
    userAddress: '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A',
    operatorAddress: '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A',
    permissions: ['placeOrderFor', 'cancelOrderFor'],
    maxTradeSize: 100.0,
    dailyVolumeCap: 1000.0,
    spentToday: 0,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    isActive: true,
  };

  describe('SweeperAgent', () => {
    let sweeper: SweeperAgent;

    beforeEach(() => {
      sweeper = new SweeperAgent({
        autoCompound: true,
        sweepIntervalMs: 0,
      });
    });

    it('holds when market is still open and not resolving', async () => {
      const context: IAgentContext = {
        spotTicker: {
          symbol: 'BTC/USD',
          price: 96500.0,
          change1m: 0,
          change5m: 0,
          timestamp: Date.now(),
        },
        market: openMarket,
        depth: { yesBids: [], yesAsks: [] },
        activeSessions: [validSession],
      };

      const decision = await sweeper.evaluate(context);
      expect(decision.action).toBe('HOLD');
      expect(decision.rationale).toContain('currently Open');
    });

    it('identifies finalized winning position and generates BATCH_SWEEP decision', async () => {
      const context: IAgentContext = {
        spotTicker: {
          symbol: 'BTC/USD',
          price: 96800.0,
          change1m: 0,
          change5m: 0,
          timestamp: Date.now(),
        },
        market: finalizedMarket,
        depth: { yesBids: [], yesAsks: [] },
        activeSessions: [validSession],
      };

      const decision = await sweeper.evaluate(context);
      expect(decision.action).toBe('BATCH_SWEEP');
      expect(decision.targetOutcome).toBe('YES');
      expect(decision.confidence).toBeGreaterThanOrEqual(0.95);
      expect(decision.rationale).toContain('SETTLEMENT SWEEP');
    });
  });

  describe('SettlementService & CompounderService', () => {
    it('executes batch settlement claim, updates user balance, and generates valid tx hash', async () => {
      const settlementService = new SettlementService();
      const userAddress = '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A';

      vi.spyOn(settlementService, 'scanUnclaimedSettlements').mockResolvedValue([
        {
          marketId: finalizedMarket.id,
          symbol: 'BTC/USD',
          marketIdHex: finalizedMarket.id as Hex,
          winningOutcome: 'YES',
          outcomeIdx: 0,
          rawAmount: 10_000_000n,
          claimableAmount: 10.0,
          outcomeToken: '0x2222222222222222222222222222222222222222' as Address,
          poolAddress: '0x1111111111111111111111111111111111111111' as Address,
          isVoided: false,
          status: 'Resolved',
        },
      ]);
      vi.spyOn(somniaExchange.trader, 'redeem').mockResolvedValue({
        hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        receipt: { status: 'success' },
      } as any);

      const result = await settlementService.triggerBatchSweep(userAddress, true);
      expect(result.success).toBe(true);
      expect(result.claimedMarketsCount).toBeGreaterThan(0);
      expect(result.txHash).toMatch(/^0x[a-f0-9]{64}$/i);
      expect(result.sweeps.length).toBeGreaterThan(0);
      expect(result.sweeps[0].status).toBe('CONFIRMED');

      const history = settlementService.getSweepHistory(userAddress);
      expect(history.length).toBeGreaterThan(0);
    });

    it('scans unclaimed settlements and produces a comprehensive summary', async () => {
      const settlementService = new SettlementService();
      const userAddress = '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A';

      const summary = await settlementService.getSweeperSummary(userAddress);
      expect(summary).toBeDefined();
      expect(typeof summary.unclaimedAmount).toBe('number');
      expect(typeof summary.totalClaimedAllTime).toBe('number');
      expect(Array.isArray(summary.unclaimedPositions)).toBe(true);
      expect(summary.compoundedStats).toBeDefined();
    });

    it('compounds claimed proceeds into active user allocation using 100% compounding', async () => {
      const compounderService = new CompounderService();
      const userAddress = '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A';

      const initial = compounderService.getUserCompoundedStats(userAddress);
      expect(initial.totalCompoundedAmount).toBe(0);

      const allocation = await compounderService.compoundProceeds(userAddress, 100.0);
      expect(allocation.totalCompoundedAmount).toBe(100.0); // 100% to trading capital
      expect(allocation.reinvestedCycles).toBe(1);

      const secondAllocation = await compounderService.compoundProceeds(userAddress, 50.0);
      expect(secondAllocation.totalCompoundedAmount).toBe(150.0); // 100 + 50
      expect(secondAllocation.reinvestedCycles).toBe(2);
    });

    it('claims individual market payout with valid confirmation', async () => {
      const settlementService = new SettlementService();
      const userAddress = '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A';

      const { marketService } = await import('../src/services/market-service.js');
      vi.spyOn(marketService, 'getMarketById').mockReturnValue({
        ...finalizedMarket,
        marketIdHex: finalizedMarket.id as Hex,
      });

      vi.spyOn(somniaExchange.client, 'getMarketOnchain').mockResolvedValue({
        pool: '0x1111111111111111111111111111111111111111' as Address,
        status: 2, // Finalized
        finalized: true,
        isResolved: true,
        outcomeToken: '0x2222222222222222222222222222222222222222' as Address,
        winningOutcome: 0,
        yesId: 1n,
        noId: 2n,
      } as any);
      vi.spyOn(somniaExchange.client, 'getOutcomeBalance').mockResolvedValue(10_000_000n);
      vi.spyOn(somniaExchange.trader, 'redeem').mockResolvedValue({
        hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        receipt: { status: 'success' },
      } as any);

      const sweep = await settlementService.claimMarketPayout(
        finalizedMarket.id,
        userAddress,
        'YES',
        true,
      );

      expect(sweep).toBeDefined();
      expect(sweep.marketId).toBe(finalizedMarket.id);
      expect(sweep.winningOutcome).toBe('YES');
      expect(sweep.status).toBe('CONFIRMED');
      expect(sweep.txHash).toMatch(/^0x[a-f0-9]{64}$/i);
    });
  });
});
