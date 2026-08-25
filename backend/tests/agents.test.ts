import { describe, it, expect, beforeEach } from 'vitest';
import { VoltSniperAgent } from '../src/agents/volt-sniper.js';
import { OracleArbAgent } from '../src/agents/oracle-arb.js';
import { TitanMMAgent } from '../src/agents/titan-mm.js';
import { OrderService } from '../src/services/order-service.js';
import { MultiAgentSwarmRunner } from '../src/agents/swarm-runner.js';
import type { IAgentContext } from '../src/agents/base-agent.js';
import type { Market, SessionGrant } from '../src/types/index.js';

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
    id: 'test-session-001',
    userAddress: '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A',
    operatorAddress: '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A',
    permissions: ['placeOrderFor', 'cancelOrderFor'],
    maxTradeSize: 20.0,
    dailyVolumeCap: 200.0,
    spentToday: 10.0,
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
      expect(decision.confidence).toBeGreaterThan(0.75);
      expect(decision.rationale).toContain('SPOT DUMP');
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

    it('skews quotes downwards when long YES inventory to discourage further YES buys', async () => {
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

      const decision = await titan.evaluate(context);
      expect(decision.action).toBe('LIMIT_QUOTE');
      // With +10 inventory * 0.015 = 0.15 skew downwards
      expect(decision.price).toBeLessThan(0.48);
      expect(decision.rationale).toContain('+10.0 lots');
    });

    it('pulls quotes in the final 15 seconds to avoid expiration execution risk', async () => {
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
  });

  // ----------------------------------------------------------------------------
  // 4. Order Service & Swarm Runner Tests
  // ----------------------------------------------------------------------------
  describe('OrderService & MultiAgentSwarmRunner', () => {
    it('executes agent decisions and creates OrderExecution records', async () => {
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

      const order = await orderService.executeAgentDecision(decision, validSession);
      expect(order).not.toBeNull();
      expect(order?.agentType).toBe('Volt');
      expect(order?.outcome).toBe('YES');
      expect(order?.price).toBe(0.48);
      expect(order?.lotSize).toBe(5.0);
      expect(order?.status).toBe('FILLED');
      expect(order?.txHash).toMatch(/^0x[a-f0-9]{64}$/i);

      const orders = orderService.getOrders({ agentType: 'Volt' });
      expect(orders.length).toBeGreaterThan(0);
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
  });
});
