import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SweeperAgent } from '../src/agents/sweeper.js';
import { SettlementService } from '../src/services/settlement-service.js';
import { somniaExchange } from '../src/config/somnia.js';
import { orderService } from '../src/services/order-service.js';
import type { IAgentContext } from '../src/agents/base-agent.js';
import type { Market, SessionGrant } from '../src/types/index.js';
import type { Address, Hex } from 'viem';

describe('Phase 6 Settlement Sweeper Tests', () => {
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
    userAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    operatorAddress: '0x93e300607c363E7D7a47e50f5c9fDf1723e859Cf',
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

  describe('SettlementService', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('executes batch settlement claim, updates user balance, and generates valid tx hash', async () => {
      const settlementService = new SettlementService();
      const userAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

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

      const result = await settlementService.triggerBatchSweep(userAddress);
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
      const userAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

      vi.spyOn(somniaExchange.client, 'getClaimable').mockResolvedValue([]);
      vi.spyOn(somniaExchange.client, 'listBinaryMarkets').mockResolvedValue([]);
      vi.spyOn(somniaExchange.client, 'listPastBinaryMarkets').mockResolvedValue([]);
      vi.spyOn(somniaExchange.client, 'getMarketOnchain').mockResolvedValue(null as any);
      vi.spyOn(orderService, 'getOrders').mockReturnValue([]);

      const summary = await settlementService.getSweeperSummary(userAddress);
      expect(summary).toBeDefined();
      expect(typeof summary.unclaimedAmount).toBe('number');
      expect(typeof summary.totalClaimedAllTime).toBe('number');
      expect(Array.isArray(summary.unclaimedPositions)).toBe(true);
    });

    it('includes indexer getClaimable positions even when the resolved-market list is full of unrelated rows', async () => {
      const settlementService = new SettlementService();
      const userAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
      const heldMarketId = (`0x${'ab'.repeat(32)}`) as Hex;

      vi.spyOn(somniaExchange.client, 'getClaimable').mockResolvedValue([
        {
          marketId: heldMarketId,
          pool: '0x1111111111111111111111111111111111111111',
          outcomeIdx: 0,
          amount: 10_000_000n,
          estPayout: 9_900_000n,
          status: 'Finalized',
        },
      ] as any);
      vi.spyOn(somniaExchange.client, 'listBinaryMarkets').mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => ({
          marketId: (`0x${i.toString(16).padStart(64, '0')}`),
          asset: 'ETH',
          status: 'Resolved',
        })) as any,
      );
      vi.spyOn(somniaExchange.client, 'listPastBinaryMarkets').mockResolvedValue([]);
      vi.spyOn(somniaExchange.client, 'getMarketOnchain').mockResolvedValue(null as any);
      vi.spyOn(orderService, 'getOrders').mockReturnValue([]);

      const found = await settlementService.scanUnclaimedSettlements(userAddress);
      expect(found.length).toBeGreaterThan(0);
      expect(found.some((p) => p.marketId.toLowerCase() === heldMarketId.toLowerCase())).toBe(true);
      const held = found.find((p) => p.marketId.toLowerCase() === heldMarketId.toLowerCase())!;
      expect(held.claimableAmount).toBeCloseTo(9.9, 3);
      expect(held.winningOutcome).toBe('YES');
      expect(held.status).toBe('Finalized');
    });

    it('discovers on-chain winning balances for this wallet\'s traded markets when getClaimable is empty', async () => {
      const settlementService = new SettlementService();
      const userAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
      const tradedMarketId = (`0x${'cd'.repeat(32)}`) as Hex;

      vi.spyOn(orderService, 'getOrders').mockReturnValue([
        {
          id: 'ord-1',
          userAddress,
          marketId: tradedMarketId,
          agentType: 'Volt',
          outcome: 'YES',
          direction: 'BUY',
          orderType: 'LIMIT',
          price: 0.4,
          lotSize: 10,
          totalCost: 4,
          status: 'FILLED',
          pnl: 6,
          createdAt: new Date().toISOString(),
        },
      ] as any);

      vi.spyOn(somniaExchange.client, 'getClaimable').mockResolvedValue([]);
      vi.spyOn(somniaExchange.client, 'listBinaryMarkets').mockResolvedValue([]);
      vi.spyOn(somniaExchange.client, 'listPastBinaryMarkets').mockResolvedValue([]);
      vi.spyOn(somniaExchange.client, 'getMarketOnchain').mockImplementation(async (id: Hex) => {
        if (id.toLowerCase() !== tradedMarketId.toLowerCase()) return null as any;
        return {
          pool: '0x1111111111111111111111111111111111111111' as Address,
          status: 4,
          finalized: true,
          isResolved: true,
          isVoided: false,
          outcomeToken: '0x2222222222222222222222222222222222222222' as Address,
          winningOutcome: 0,
          yesId: 1n,
          noId: 2n,
        } as any;
      });
      vi.spyOn(somniaExchange.client, 'getOutcomeBalance').mockImplementation(async (p: { id: bigint }) => {
        return p.id === 1n ? 10_000_000n : 0n;
      });

      const found = await settlementService.scanUnclaimedSettlements(userAddress);
      expect(found.some((p) => p.marketId.toLowerCase() === tradedMarketId.toLowerCase())).toBe(true);
      const held = found.find((p) => p.marketId.toLowerCase() === tradedMarketId.toLowerCase())!;
      expect(held.claimableAmount).toBeCloseTo(10, 3);
      expect(held.winningOutcome).toBe('YES');
    });

    it('claims individual market payout with valid confirmation', async () => {
      const settlementService = new SettlementService();
      const userAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

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
      );

      expect(sweep).toBeDefined();
      expect(sweep.marketId).toBe(finalizedMarket.id);
      expect(sweep.winningOutcome).toBe('YES');
      expect(sweep.status).toBe('CONFIRMED');
      expect(sweep.txHash).toMatch(/^0x[a-f0-9]{64}$/i);
    });

    it('sweeps copy-trader positions even if on-chain outcome tokens were already redeemed by operator', async () => {
      const settlementService = new SettlementService();
      const copyTraderAddress = '0x9999999999999999999999999999999999999999';

      vi.spyOn(settlementService, 'scanUnclaimedSettlements').mockResolvedValue([
        {
          marketId: finalizedMarket.id,
          symbol: 'BTC/USD',
          marketIdHex: finalizedMarket.id as Hex,
          winningOutcome: 'YES',
          outcomeIdx: 0,
          rawAmount: 11_000_000n,
          claimableAmount: 11.0,
          outcomeToken: '0x2222222222222222222222222222222222222222' as Address,
          poolAddress: '0x1111111111111111111111111111111111111111' as Address,
          isVoided: false,
          status: 'Finalized',
          txHash: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex,
        },
      ]);

      // Simulate on-chain redeem failing because operator already redeemed the tokens
      vi.spyOn(somniaExchange.trader, 'redeem').mockRejectedValue(new Error('InsufficientBalance'));

      const result = await settlementService.triggerBatchSweep(copyTraderAddress);
      expect(result.success).toBe(true);
      expect(result.claimedMarketsCount).toBe(1);
      expect(result.totalClaimedAmount).toBe('11.00 tUSDC');
      expect(result.sweeps.length).toBe(1);
      expect(result.sweeps[0].userAddress.toLowerCase()).toBe(copyTraderAddress.toLowerCase());
      expect(result.sweeps[0].claimableAmount).toBe(11.0);
      expect(result.sweeps[0].isCompounded).toBe(false);

      const history = settlementService.getSweepHistory(copyTraderAddress);
      expect(history.length).toBe(1);
      expect(history[0].claimableAmount).toBe(11.0);
    });

    it('scans and sweeps winning manual trades placed through Trade Terminal on on-chain CLOB markets', async () => {
      const settlementService = new SettlementService();
      const terminalUserAddress = '0x1111222233334444555566667777888899990000';
      const onchainMarketId = '0x6bfa111111111111111111111111111111111111111111111111111111111111';

      const { marketService } = await import('../src/services/market-service.js');
      vi.spyOn(marketService, 'getMarketById').mockReturnValue({
        id: onchainMarketId,
        marketIdHex: onchainMarketId as Hex,
        symbol: 'BTC/USD',
        strikePrice: 96500,
        windowDuration: '5m',
        openTimestamp: new Date(Date.now() - 600000).toISOString(),
        closeTimestamp: new Date(Date.now() - 300000).toISOString(),
        resolutionTimestamp: new Date(Date.now() - 240000).toISOString(),
        status: 'Finalized',
        settlementPrice: 96800,
        winningOutcome: 'YES',
        bestBidYes: 1.0,
        bestAskYes: 1.0,
        bestBidNo: 0.0,
        bestAskNo: 0.0,
        impliedProbYes: 1.0,
        fairValueYes: 1.0,
        edgePercentage: 0,
      });

      vi.spyOn(orderService, 'getOrders').mockReturnValue([
        {
          id: 'terminal-order-1',
          userAddress: terminalUserAddress,
          marketId: onchainMarketId,
          agentType: 'Manual',
          source: 'TERMINAL',
          outcome: 'YES',
          direction: 'BUY',
          orderType: 'IOC',
          price: 0.45,
          lotSize: 20,
          totalCost: 9.0,
          status: 'FILLED',
          pnl: 11.0, // Won trade ($20 gross payout - $9 entry cost)
          isSettled: true,
          createdAt: new Date().toISOString(),
        },
      ] as any);

      vi.spyOn(somniaExchange.client, 'getClaimable').mockResolvedValue([]);
      vi.spyOn(somniaExchange.client, 'listBinaryMarkets').mockResolvedValue([]);
      vi.spyOn(somniaExchange.client, 'listPastBinaryMarkets').mockResolvedValue([]);

      const unclaimed = await settlementService.scanUnclaimedSettlements(terminalUserAddress, true);
      expect(unclaimed.length).toBe(1);
      expect(unclaimed[0].marketId).toBe(onchainMarketId);
      expect(unclaimed[0].winningOutcome).toBe('YES');
      expect(unclaimed[0].claimableAmount).toBe(20.0); // Full $20 payout

      const sweepResult = await settlementService.triggerBatchSweep(terminalUserAddress);
      expect(sweepResult.success).toBe(true);
      expect(sweepResult.claimedMarketsCount).toBe(1);
      expect(sweepResult.totalClaimedAmount).toBe('20.00 tUSDC');
      expect(sweepResult.sweeps[0].userAddress.toLowerCase()).toBe(terminalUserAddress.toLowerCase());
      expect(sweepResult.sweeps[0].claimableAmount).toBe(20.0);
    });

    it('includes Trade Terminal manual users in getCandidateSweeperTargets', async () => {
      const settlementService = new SettlementService();
      const terminalUserAddress = '0x1111222233334444555566667777888899990000';

      vi.spyOn(orderService, 'getOrders').mockReturnValue([
        {
          id: 'manual-order-123',
          userAddress: terminalUserAddress,
          marketId: '0x6bfa-BTCUSD-5m-96500-1740000000000',
          agentType: 'Manual',
          source: 'TERMINAL',
          outcome: 'YES',
          direction: 'BUY',
          orderType: 'IOC',
          price: 0.5,
          lotSize: 10,
          totalCost: 5,
          status: 'FILLED',
          isSettled: true,
          createdAt: new Date().toISOString(),
        },
      ] as any);

      const targets = settlementService.getCandidateSweeperTargets();
      expect(targets.some((t) => t.toLowerCase() === terminalUserAddress.toLowerCase())).toBe(true);
    });

    it('properly evicts known zero-balance cache entries on invalidateCache', () => {
      const settlementService = new SettlementService();
      const userA = '0x1111222233334444555566667777888899990000';
      const userB = '0x2222333344445555666677778888999900001111';
      const marketId = '0x3333444455556666777788889999000011112222';

      // Set zero balance cache entries via private helper access
      (settlementService as any).setKnownFinalizedZeroBalance(userA.toLowerCase(), marketId.toLowerCase());
      (settlementService as any).setKnownFinalizedZeroBalance(userB.toLowerCase(), marketId.toLowerCase());

      expect((settlementService as any).isKnownFinalizedZeroBalance(userA.toLowerCase(), marketId.toLowerCase())).toBe(true);
      expect((settlementService as any).isKnownFinalizedZeroBalance(userB.toLowerCase(), marketId.toLowerCase())).toBe(true);

      // Invalidate specifically userA
      settlementService.invalidateCache(userA);
      expect((settlementService as any).isKnownFinalizedZeroBalance(userA.toLowerCase(), marketId.toLowerCase())).toBe(false);
      expect((settlementService as any).isKnownFinalizedZeroBalance(userB.toLowerCase(), marketId.toLowerCase())).toBe(true);

      // Global invalidation
      settlementService.invalidateCache();
      expect((settlementService as any).isKnownFinalizedZeroBalance(userB.toLowerCase(), marketId.toLowerCase())).toBe(false);
    });

    it('records sweeps, queries sweep history, and computes user total swept amount', async () => {
      const settlementService = new SettlementService();
      const testUser = '0x1111222233334444555566667777888899990000';
      const testMarketId = '0xmarket-test-sweep-1';

      settlementService.recordSweep({
        id: 'sweep-uuid-1',
        marketId: testMarketId,
        userAddress: testUser as `0x${string}`,
        winningOutcome: 'YES',
        claimableAmount: 15.5,
        payoutToken: 'tUSDC',
        isCompounded: false,
        txHash: '0xsweeptxhash123' as `0x${string}`,
        status: 'CONFIRMED',
        claimedAt: new Date().toISOString(),
      });


      const history = settlementService.getSweepHistory(testUser);
      expect(history.length).toBeGreaterThanOrEqual(1);

      const totalSwept = settlementService.getUserTotalSweptForMarket(testUser, testMarketId);
      expect(totalSwept).toBe(15.5);

      await settlementService.ensureUserSweepsLoaded(testUser);
    });

    it('records failed sweeps with FAILED status and does not inflate userSweptTotals', () => {
      const settlementService = new SettlementService();
      const testUser = '0x1111222233334444555566667777888899990000';
      const testMarketId = '0xmarket-failed-sweep-1';

      settlementService.recordSweep({
        id: 'sweep-failed-1',
        marketId: testMarketId,
        userAddress: testUser as `0x${string}`,
        winningOutcome: 'YES',
        claimableAmount: 25.0,
        payoutToken: 'tUSDC',
        isCompounded: false,
        txHash: undefined,
        status: 'FAILED',
        claimedAt: new Date().toISOString(),
      });

      const history = settlementService.getSweepHistory(testUser);
      const failedSweep = history.find((s) => s.id === 'sweep-failed-1');
      expect(failedSweep).toBeDefined();
      expect(failedSweep?.status).toBe('FAILED');

      const totalSwept = settlementService.getUserTotalSweptForMarket(testUser, testMarketId);
      expect(totalSwept).toBe(0); // Must not add to total swept payout
    });
  });
});

