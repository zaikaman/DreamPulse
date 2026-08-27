import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SweeperAgent } from '../src/agents/sweeper.js';
import { SettlementService } from '../src/services/settlement-service.js';
import { CompounderService } from '../src/services/compounder-service.js';
import { somniaExchange } from '../src/config/somnia.js';
import { orderService } from '../src/services/order-service.js';
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
    afterEach(() => {
      vi.restoreAllMocks();
    });

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
      expect(summary.compoundedStats).toBeDefined();
    });

    it('includes indexer getClaimable positions even when the resolved-market list is full of unrelated rows', async () => {
      const settlementService = new SettlementService();
      const userAddress = '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A';
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
      const userAddress = '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A';
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

      const result = await settlementService.triggerBatchSweep(copyTraderAddress, true);
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

    it('scans and sweeps winning manual trades placed through Trade Terminal on rolling CLOB markets', async () => {
      const settlementService = new SettlementService();
      const terminalUserAddress = '0x1111222233334444555566667777888899990000';
      const rollingMarketId = '0x6bfa-BTCUSD-5m-96500-1740000000000';

      const { marketService } = await import('../src/services/market-service.js');
      vi.spyOn(marketService, 'getMarketById').mockReturnValue({
        id: rollingMarketId,
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
          marketId: rollingMarketId,
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
      expect(unclaimed[0].marketId).toBe(rollingMarketId);
      expect(unclaimed[0].winningOutcome).toBe('YES');
      expect(unclaimed[0].claimableAmount).toBe(20.0); // Full $20 payout

      const sweepResult = await settlementService.triggerBatchSweep(terminalUserAddress, true);
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
  });
});
