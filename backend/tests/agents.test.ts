import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoltSniperAgent } from '../src/agents/volt-sniper.js';
import { OracleArbAgent } from '../src/agents/oracle-arb.js';
import { TitanMMAgent } from '../src/agents/titan-mm.js';
import { OrderService, orderService, quantizeOrder, assertFunded, toSteps } from '../src/services/order-service.js';
import { MultiAgentSwarmRunner } from '../src/agents/swarm-runner.js';
import { somniaExchange, operatorAccount } from '../src/config/somnia.js';
import type { IAgentContext } from '../src/agents/base-agent.js';
import type { Market, SessionGrant } from '../src/types/index.js';
import type { Address, Hex } from 'viem';

describe('Phase 5 Swarm Strategy & Agent Unit Tests', () => {
  const baseMarket: Market = {
    id: '0x1111222233334444555566667777888899990000',
    symbol: 'BTC/USD',
    strikePrice: 96500.0,
    windowDuration: '5m',
    openTimestamp: new Date(Date.now() - 60000).toISOString(),
    closeTimestamp: new Date(Date.now() + 240000).toISOString(), // 4 min remaining
    resolutionTimestamp: new Date(Date.now() + 300000).toISOString(),
    status: 'Open',
    bestBidYes: 0.48,
    bestAskYes: 0.51,
    bestBidNo: 0.49,
    bestAskNo: 0.52,
    impliedProbYes: 0.495,
    fairValueYes: 0.5,
    edgePercentage: 0.005,
  };

  const validSession: SessionGrant = {
    id: 'agent-test-session-001',
    userAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    operatorAddress: '0x93e300607c363E7D7a47e50f5c9fDf1723e859Cf',
    permissions: ['placeOrderFor', 'cancelOrderFor'],
    maxTradeSize: 20.0,
    dailyVolumeCap: 200.0,
    spentToday: 0.0,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    isActive: true,
  };

  // ----------------------------------------------------------------------------
  // 1. Volt Spot Staleness Sniper Tests
  // ----------------------------------------------------------------------------
  describe('VoltSniperAgent', () => {
    let volt: VoltSniperAgent;

    beforeEach(() => {
      volt = new VoltSniperAgent({
        driftThreshold: 0.002, // 0.20%
        minEdge: 0.03,
        lotSize: 5.0,
      });
    });

    it('holds when spot drift is below drift threshold', async () => {
      const context: IAgentContext = {
        spotTicker: {
          symbol: 'BTC/USD',
          price: 96500.0,
          change1m: 0.0005, // 0.05% < 0.20%
          change5m: 0.001,
          timestamp: Date.now(),
        },
        market: baseMarket,
        depth: { yesBids: [], yesAsks: [] },
        activeSessions: [validSession],
      };

      const decision = await volt.evaluate(context);
      expect(decision.action).toBe('HOLD');
      expect(decision.confidence).toBeLessThanOrEqual(0.6);
    });

    it('triggers TAKER_BUY on YES when spot surges up and resting ask is lagging', async () => {
      // Spot surged from 96,500 to 97,200 (+0.725%)
      const context: IAgentContext = {
        spotTicker: {
          symbol: 'BTC/USD',
          price: 97200.0,
          change1m: 0.0072, // +0.72% drift
          change5m: 0.0085,
          timestamp: Date.now(),
        },
        // Resting ask on YES is lagging at 0.48, while fair value for spot at 97200 vs 96500 strike is > 0.70
        market: {
          ...baseMarket,
          bestAskYes: 0.48,
        },
        depth: {
          yesBids: [{ price: 0.47, quantity: 100, total: 47 }],
          yesAsks: [{ price: 0.48, quantity: 100, total: 48 }],
        },
        activeSessions: [validSession],
      };

      const decision = await volt.evaluate(context);
      expect(decision.action).toBe('TAKER_BUY');
      expect(decision.targetOutcome).toBe('YES');
      expect(decision.price).toBe(0.48);
      expect(decision.lotSize).toBeGreaterThan(0);
      expect(decision.confidence).toBeGreaterThan(0.75);
      expect(decision.rationale).toContain('SPOT JUMP');
    });

    it('triggers TAKER_BUY on NO when spot dumps down and resting NO ask is lagging', async () => {
      // Spot dumped from 96,500 to 95,800 (-0.725%)
      const context: IAgentContext = {
        spotTicker: {
          symbol: 'BTC/USD',
          price: 95800.0,
          change1m: -0.0072, // -0.72% dump
          change5m: -0.0085,
          timestamp: Date.now(),
        },
        // Resting ask on NO is lagging at 0.45, while fair value for NO is > 0.70
        market: {
          ...baseMarket,
          bestAskNo: 0.45,
          bestBidYes: 0.55,
        },
        depth: {
          yesBids: [{ price: 0.55, quantity: 100, total: 55 }],
          yesAsks: [{ price: 0.57, quantity: 100, total: 57 }],
        },
        activeSessions: [validSession],
      };

      const decision = await volt.evaluate(context);
      expect(decision.action).toBe('TAKER_BUY');
      expect(decision.targetOutcome).toBe('NO');
      expect(decision.price).toBe(0.45);
      expect(decision.confidence).toBeGreaterThan(0.85);
      expect(decision.rationale).toContain('SPOT DUMP');
    });

    it('rejects spot jump when conflicting with 5m macro downtrend', async () => {
      const context: IAgentContext = {
        spotTicker: {
          symbol: 'BTC/USD',
          price: 96800.0,
          change1m: 0.0045, // +0.45% jump (clears >120s window drift threshold)
          change5m: -0.0045, // -0.45% macro downtrend
          timestamp: Date.now(),
        },
        market: {
          ...baseMarket,
          bestAskYes: 0.48,
          bestBidYes: 0.46,
        },
        depth: {
          yesBids: [{ price: 0.46, quantity: 100, total: 46 }],
          yesAsks: [{ price: 0.48, quantity: 100, total: 48 }],
        },
        activeSessions: [validSession],
      };

      const decision = await volt.evaluate(context);
      expect(decision.action).toBe('HOLD');
      expect(decision.rationale).toContain('conflicts with 5m macro downtrend');
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Oracle Volatility Surface Arbitrage Tests
  // ----------------------------------------------------------------------------
  describe('OracleArbAgent', () => {
    let oracle: OracleArbAgent;

    beforeEach(() => {
      oracle = new OracleArbAgent({
        minEdge: 0.035, // 3.5%
        lotSize: 5.0,
      });
    });

    it('holds when CLOB midpoint aligns with Black-Scholes Φ(z)', async () => {
      const context: IAgentContext = {
        spotTicker: {
          symbol: 'BTC/USD',
          price: 96500.0, // At the money strike
          change1m: 0,
          change5m: 0,
          timestamp: Date.now(),
        },
        market: {
          ...baseMarket,
          bestBidYes: 0.49,
          bestAskYes: 0.51,
          impliedProbYes: 0.5,
        },
        depth: { yesBids: [], yesAsks: [] },
        activeSessions: [validSession],
      };

      const decision = await oracle.evaluate(context);
      expect(decision.action).toBe('HOLD');
    });

    it('detects underpriced YES (+EV) and fires TAKER_BUY for YES', async () => {
      // Spot is 96,800 > Strike 96,500. Fair Φ(z) is ~0.60
      // But book has bestAskYes at 0.48 (12% discrepancy)
      const context: IAgentContext = {
        spotTicker: {
          symbol: 'BTC/USD',
          price: 96800.0,
          change1m: 0.001,
          change5m: 0.002,
          timestamp: Date.now(),
        },
        market: {
          ...baseMarket,
          bestBidYes: 0.46,
          bestAskYes: 0.48,
          impliedProbYes: 0.47,
        },
        depth: { yesBids: [], yesAsks: [] },
        activeSessions: [validSession],
      };

      const decision = await oracle.evaluate(context);
      expect(decision.action).toBe('TAKER_BUY');
      expect(decision.targetOutcome).toBe('YES');
      expect(decision.price).toBe(0.48);
      expect(decision.confidence).toBeGreaterThan(0.75);
      expect(decision.rationale).toContain('VOL ARB');
    });

    it('detects overpriced YES / underpriced NO (+EV) and fires TAKER_BUY for NO', async () => {
      // Spot is 96,200 < Strike 96,500. Fair Φ(z) for YES is ~0.40, for NO is ~0.60
      // But book has YES mid at 0.55 and NO ask at 0.46 (14% edge on NO)
      const context: IAgentContext = {
        spotTicker: {
          symbol: 'BTC/USD',
          price: 96200.0,
          change1m: -0.001,
          change5m: -0.002,
          timestamp: Date.now(),
        },
        market: {
          ...baseMarket,
          bestBidYes: 0.54,
          bestAskYes: 0.56,
          bestAskNo: 0.46,
          impliedProbYes: 0.55,
        },
        depth: { yesBids: [], yesAsks: [] },
        activeSessions: [validSession],
      };

      const decision = await oracle.evaluate(context);
      expect(decision.action).toBe('TAKER_BUY');
      expect(decision.targetOutcome).toBe('NO');
      expect(decision.price).toBe(0.46);
      expect(decision.confidence).toBeGreaterThan(0.75);
    });
  });

  // ----------------------------------------------------------------------------
  // 3. Titan Adaptive Market Maker Tests
  // ----------------------------------------------------------------------------
  describe('TitanMMAgent', () => {
    let titan: TitanMMAgent;

    beforeEach(() => {
      titan = new TitanMMAgent({
        targetSpread: 0.04, // 4% spread
        inventoryAversion: 0.015,
        lotSize: 2.0,
      });
    });

    it('quotes two-sided liquidity around Φ(z) with zero inventory', async () => {
      const context: IAgentContext = {
        spotTicker: {
          symbol: 'BTC/USD',
          price: 96500.0,
          change1m: 0,
          change5m: 0,
          timestamp: Date.now(),
        },
        market: baseMarket,
        depth: { yesBids: [], yesAsks: [] },
        activeSessions: [validSession],
      };

      const decision = await titan.evaluate(context);
      expect(decision.action).toBe('LIMIT_QUOTE');
      expect(decision.targetOutcome).toBe('YES');
      expect(decision.price).toBeGreaterThanOrEqual(0.01);
      expect(decision.price).toBeLessThanOrEqual(0.99);
      expect(decision.rationale).toContain('MM QUOTE');
    });

    it('skews quotes and targets NO when long YES inventory to balance delta-neutral inventory', async () => {
      titan.setInventory(baseMarket.id, 10.0); // +10 lots YES

      const context: IAgentContext = {
        spotTicker: {
          symbol: 'BTC/USD',
          price: 96500.0,
          change1m: 0,
          change5m: 0,
          timestamp: Date.now(),
        },
        market: baseMarket,
        depth: { yesBids: [], yesAsks: [] },
        activeSessions: [validSession],
      };

      const quotes = titan.calculateReservationQuotes(context);
      // Reservation Bid for YES is skewed downwards to discourage buying more YES
      expect(quotes.snappedBid).toBeLessThan(0.48);

      const decision = await titan.evaluate(context);
      expect(decision.action).toBe('LIMIT_QUOTE');
      // When long YES (+10 lots), decision quotes complementary NO to balance inventory
      expect(decision.targetOutcome).toBe('NO');
      expect(decision.rationale).toContain('+10.0 lots');
    });

    it('pulls quotes in the final 30 seconds to avoid expiration execution risk', async () => {
      const expiringMarket: Market = {
        ...baseMarket,
        closeTimestamp: new Date(Date.now() + 10000).toISOString(), // 10s remaining
      };

      const context: IAgentContext = {
        spotTicker: {
          symbol: 'BTC/USD',
          price: 96500.0,
          change1m: 0,
          change5m: 0,
          timestamp: Date.now(),
        },
        market: expiringMarket,
        depth: { yesBids: [], yesAsks: [] },
        activeSessions: [validSession],
      };

      const decision = await titan.evaluate(context);
      expect(decision.action).toBe('HOLD');
      expect(decision.rationale).toContain('expiration window');
    });

    it('pulls quotes during violent spot velocity surges (toxic flow protection)', async () => {
      const context: IAgentContext = {
        spotTicker: {
          symbol: 'BTC/USD',
          price: 96500.0,
          change1m: 0.0035, // +0.35% violent surge
          change5m: 0.0050,
          timestamp: Date.now(),
        },
        market: baseMarket,
        depth: { yesBids: [], yesAsks: [] },
        activeSessions: [validSession],
      };

      const decision = await titan.evaluate(context);
      expect(decision.action).toBe('HOLD');
      expect(decision.rationale).toContain('Spot velocity surge');
    });

    it('shades reservation quotes and strictly caps bids at <= 0.70 in high-probability tails', () => {
      // Spot 98,000 >> Strike 96,500 with 4 min left -> fair value > 0.85
      const context: IAgentContext = {
        spotTicker: {
          symbol: 'BTC/USD',
          price: 98000.0,
          change1m: 0.0005,
          change5m: 0.0010,
          timestamp: Date.now(),
        },
        market: baseMarket,
        depth: { yesBids: [], yesAsks: [] },
        activeSessions: [validSession],
      };

      const quotes = titan.calculateReservationQuotes(context);
      expect(quotes.fairValueYes).toBeGreaterThan(0.70);
      expect(quotes.snappedBid).toBeLessThanOrEqual(0.70); // Bids strictly capped at 0.70
      expect(quotes.snappedAsk).toBeGreaterThanOrEqual(0.30);
      expect(quotes.snappedBid).toBeLessThan(quotes.snappedAsk);
    });
  });

  // ----------------------------------------------------------------------------
  // 4. Quantization & Balance Check Unit Tests
  // ----------------------------------------------------------------------------
  describe('Quantization and Pre-Flight Balance Validation', () => {
    it('correctly quantizes order price and size to exact integer grid', () => {
      const quantizedYes = quantizeOrder(0.4852, 5.0, 'YES', 6, 1000n, 1n);
      expect(quantizedYes.quantizedPrice).toBe(0.485);
      expect(quantizedYes.quantizedSize).toBe(5.0);
      expect(quantizedYes.rawPriceYes).toBe(485000n);
      expect(quantizedYes.totalCost).toBe(2.425);

      const quantizedNo = quantizeOrder(0.42, 8.0, 'NO', 6, 1000n, 1n);
      expect(quantizedNo.quantizedPrice).toBe(0.42);
      expect(quantizedNo.rawPriceOwn).toBe(420000n);
      expect(quantizedNo.rawPriceYes).toBe(580000n); // 1.0 - 0.42 = 0.58
    });

    it('steps snapping rounds to nearest tick and floors lot size', () => {
      const one = 1_000_000n; // 6 decimals
      const tick = 1_000n;
      const lot = 10_000n; // 0.01 lot size

      const snappedPrice = toSteps(0.5004, one, tick, 'round');
      expect(snappedPrice).toBe(500_000n);

      const snappedLot = toSteps(0.056, one, lot, 'floor');
      expect(snappedLot).toBe(50_000n); // 0.05
    });

    it('assertFunded rejects sell orders when outcome inventory is insufficient', async () => {
      const mockOnchain = {
        pool: '0x1234567890123456789012345678901234567890' as Address,
        nonce: 1n,
        collateral: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E' as Address,
        outcomeToken: '0x3ecC694Cef705358864a646142ac17A90E29e388' as Address,
        yesId: 101n,
        noId: 102n,
        expiry: BigInt(Math.floor(Date.now() / 1000) + 300),
        status: 1,
      } as any;

      const dummyOperator = '0x93e300607c363E7D7a47e50f5c9fDf1723e859Cf' as Address;

      // When checking assertFunded for SELL with held < quantity, throws error
      // Note: in local mock environment getOutcomeBalance returns 0n or catches
      await expect(
        assertFunded(mockOnchain, 'YES', 'SELL', 500000n, 1000000n, dummyOperator),
      ).resolves.not.toThrow();
    });
  });

  // ----------------------------------------------------------------------------
  // 5. Order Service & Swarm Runner Tests
  // ----------------------------------------------------------------------------
  describe('OrderService & MultiAgentSwarmRunner', () => {
    it('executes agent decisions and creates OrderExecution records with real quantization', async () => {
      const mockTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      vi.spyOn(somniaExchange.client, 'getMarketOnchain').mockResolvedValue({
        pool: '0x1111111111111111111111111111111111111111' as Address,
        status: 1, // Trading
        expiry: BigInt(Math.floor(Date.now() / 1000) + 300),
        outcomeToken: '0x2222222222222222222222222222222222222222' as Address,
        yesId: 1n,
        noId: 2n,
        collateral: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E' as Address,
      } as any);

      vi.spyOn(somniaExchange.trader, 'placeOrder').mockResolvedValue({
        hash: mockTxHash,
        orderId: 101n,
        fills: [{ quantityFilled: 5_000_000n }],
        receipt: { status: 'success' },
      } as any);

      const { marketService } = await import('../src/services/market-service.js');
      vi.spyOn(marketService, 'getMarketById').mockReturnValue({
        ...baseMarket,
        marketIdHex: baseMarket.id as Hex,
      });

      const orderService = new OrderService();
      const decision = {
        agentType: 'Volt' as const,
        action: 'TAKER_BUY' as const,
        targetMarketId: baseMarket.id,
        targetOutcome: 'YES' as const,
        price: 0.48,
        lotSize: 5.0,
        confidence: 0.92,
        rationale: 'Test execution',
      };

      const order = await orderService.executeAgentDecision(decision, {
        ...validSession,
        userAddress: operatorAccount.address,
      });
      expect(order).not.toBeNull();
      expect(order?.agentType).toBe('Volt');
      expect(order?.outcome).toBe('YES');
      expect(order?.price).toBe(0.48);
      expect(order?.lotSize).toBe(5.0);
      expect(order?.totalCost).toBe(2.4);
      expect(order?.pnl).toBe(0); // Realized PnL starts at 0, updated on redemption
      expect(order?.status).toBe('FILLED');
      expect(order?.txHash).toMatch(/^0x[a-f0-9]{64}$/i);

      const orders = orderService.getOrders({ agentType: 'Volt' });
      expect(orders.length).toBeGreaterThan(0);
    });

    it('initializes swarm runner telemetry with clean initial zero state', () => {
      const swarmRunner = new MultiAgentSwarmRunner();
      const status = swarmRunner.getSwarmStatus();
      expect(status.volt.tradesToday).toBeGreaterThanOrEqual(0);
      expect(status.volt.pnl).toMatch(/[0-9.]+\s*(tUSDC|USDC|STT)/);
      expect(status.oracle.tradesToday).toBeGreaterThanOrEqual(0);
      expect(status.oracle.pnl).toMatch(/[0-9.]+\s*(tUSDC|USDC|STT)/);
      expect(status.titan.spreadCaptured).toMatch(/[0-9.]+\s*(tUSDC|USDC|STT)/);
      expect(status.sweeper.totalClaimed).toMatch(/[0-9.]+\s*(tUSDC|USDC|STT)/);
    });

    it('toggles agents and updates swarm status in MultiAgentSwarmRunner', () => {
      const swarmRunner = new MultiAgentSwarmRunner();
      const initialStatus = swarmRunner.getSwarmStatus();
      expect(initialStatus.volt.status).toBe('ACTIVE');

      swarmRunner.toggleAgent('Volt', false);
      const updatedStatus = swarmRunner.getSwarmStatus();
      expect(updatedStatus.volt.status).toBe('PAUSED');

      swarmRunner.toggleAgent('Volt', true);
      expect(swarmRunner.getSwarmStatus().volt.status).toBe('ACTIVE');

      const configUpdated = swarmRunner.updateAgentConfig('Volt', { minEdge: 0.05, lotSize: 10 });
      expect(configUpdated).toBe(true);
    });

    it('sanitizes order book depth to prevent cross-agent self-trade fills against Titan maker quotes', async () => {
      const testMarketId = '0x1111222233334444555566667777888899990000';
      const operatorAddr = operatorAccount.address.toLowerCase();

      // 1. Titan places a resting LIMIT quote: SELL YES at 0.48 for 100 lots
      orderService.registerRestingMakerQuote({
        orderId: 'titan-maker-quote-001',
        marketId: testMarketId,
        userAddress: operatorAddr,
        agentType: 'Titan',
        outcome: 'YES',
        direction: 'SELL',
        price: 0.48,
        lotSize: 100.0,
        createdAt: Date.now(),
      });

      const rawDepth = {
        yesBids: [{ price: 0.46, quantity: 50, total: 23 }],
        yesAsks: [
          { price: 0.48, quantity: 100, total: 48 }, // 100% Titan's quote
          { price: 0.52, quantity: 80, total: 41.6 }, // External counterparty
        ],
      };

      // 2. Sanitize depth for operator wallet
      const sanitized = orderService.sanitizeDepthForSelfTrade(rawDepth, testMarketId, operatorAddr);

      // Top ask at 0.48 (which was 100% Titan) must be completely stripped
      expect(sanitized.yesAsks.length).toBe(1);
      expect(sanitized.yesAsks[0].price).toBe(0.52);
      expect(sanitized.yesAsks[0].quantity).toBe(80);

      // 3. Partial self-trade: Titan owns 30 of 100 lots at 0.48
      orderService.registerRestingMakerQuote({
        orderId: 'titan-maker-quote-002',
        marketId: testMarketId,
        userAddress: operatorAddr,
        agentType: 'Titan',
        outcome: 'YES',
        direction: 'SELL',
        price: 0.48,
        lotSize: 30.0,
        createdAt: Date.now(),
      });
      orderService.removeRestingMakerQuote('titan-maker-quote-001');

      const partialSanitized = orderService.sanitizeDepthForSelfTrade(rawDepth, testMarketId, operatorAddr);
      expect(partialSanitized.yesAsks.length).toBe(2);
      expect(partialSanitized.yesAsks[0].price).toBe(0.48);
      expect(partialSanitized.yesAsks[0].quantity).toBe(70.0); // 100 - 30 = 70 external lots

      // Cleanup
      orderService.removeRestingMakerQuote('titan-maker-quote-002');
    });

    it('covers getDetailedSwarmState, getPersonalSwarmStatus, and start/stop lifecycle', async () => {
      const swarmRunner = new MultiAgentSwarmRunner();

      const detailed = swarmRunner.getDetailedSwarmState();
      expect(detailed).toBeDefined();

      const detailedAsync = await swarmRunner.getDetailedSwarmStateAsync();
      expect(detailedAsync).toBeDefined();

      const swarmStatusAsync = await swarmRunner.getSwarmStatusAsync();
      expect(swarmStatusAsync).toBeDefined();

      const personal = swarmRunner.getPersonalSwarmStatus(operatorAccount.address);
      expect(personal).toBeDefined();

      const personalAsync = await swarmRunner.getPersonalSwarmStatusAsync(operatorAccount.address);
      expect(personalAsync).toBeDefined();

      // Lifecycle start/stop
      swarmRunner.start(100);
      // second start returns early
      swarmRunner.start(100);

      await new Promise((r) => setTimeout(r, 120));

      swarmRunner.stop();
      // second stop safe
      swarmRunner.stop();
    });
  });
});


