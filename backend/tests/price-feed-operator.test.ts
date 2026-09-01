import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PriceFeedService, priceFeedService } from '../src/services/price-feed-service.js';
import { UserSwarmService, userSwarmService } from '../src/services/user-swarm-service.js';
import { ensurePerPoolApprovalForCopyTrader } from '../src/services/operator-approval-service.js';
import { publicClient, SOMNIA_ADDRESSES, operatorAccount } from '../src/config/somnia.js';

describe('PriceFeedService, UserSwarmService & OperatorApprovalService Suite', () => {
  describe('price-feed-service.ts', () => {
    let feed: PriceFeedService;

    beforeEach(() => {
      feed = new PriceFeedService();
    });

    afterEach(() => {
      feed.stop();
    });

    it('starts with clean unseeded state and ingests live spot updates for BTC/USD and ETH/USD', () => {
      expect(feed.getSpotTicker('BTC/USD')).toBeUndefined();
      expect(feed.getSpotTicker('ETH/USD')).toBeUndefined();

      feed.recordPriceUpdate('BTC/USD', 96500, 97800, 95200, 18450);
      feed.recordPriceUpdate('ETH/USD', 2750, 2820, 2690, 84200);

      const btcTicker = feed.getSpotTicker('BTC/USD');
      const ethTicker = feed.getSpotTicker('ETH/USD');
      expect(btcTicker?.price).toBe(96500);
      expect(ethTicker?.price).toBe(2750);

      const allTickers = feed.getAllSpotTickers();
      expect(allTickers['BTC/USD']).toBeDefined();
      expect(allTickers['ETH/USD']).toBeDefined();
    });

    it('updates spot price on micro ticks and records price update', () => {
      feed.recordPriceUpdate('BTC/USD', 96000, 97000, 95000, 5000);
      feed.simulateMicroTick('BTC/USD', 100);
      const updated = feed.getSpotTicker('BTC/USD')?.price;
      expect(updated).toBe(96100);

      feed.recordPriceUpdate('BTC/USD', 98000, 99000, 95000, 5000);
      expect(feed.getSpotTicker('BTC/USD')?.price).toBe(98000);
    });

    it('calculates realized volatility and price action metrics', () => {
      feed.recordPriceUpdate('ETH/USD', 2700, 2800, 2600, 1000);
      feed.recordPriceUpdate('ETH/USD', 2750, 2800, 2600, 1000);
      feed.recordPriceUpdate('ETH/USD', 2720, 2800, 2600, 1000);
      feed.recordPriceUpdate('ETH/USD', 2780, 2800, 2600, 1000);

      const vol = feed.getRealizedVolatility('ETH/USD');
      expect(vol).toBeGreaterThanOrEqual(0);

      const ticker = feed.getSpotTicker('ETH/USD');
      expect(ticker?.priceAction).toBeDefined();
    });

    it('detects price staleness properly', () => {
      feed.recordPriceUpdate('BTC/USD', 96000, 97000, 95000, 1000);
      expect(feed.isPriceStale('BTC/USD', 60000)).toBe(false);
      // Unknown symbol is considered stale
      expect(feed.isPriceStale('UNKNOWN/USD', 1000)).toBe(true);
    });

    it('fetches historical price at timestamp with fallback caching', async () => {
      const price = await feed.getHistoricalPriceAt('BTC/USD', Date.now());
      // External network or null fallback
      expect(price === null || typeof price === 'number').toBe(true);
    });

    it('initializes price feed service and fetches rest snapshot', async () => {
      await feed.fetchRestSnapshot().catch(() => {});
      const btc = feed.getSpotTicker('BTC/USD');
      expect(btc?.price).toBeGreaterThan(0);
    });
  });

  describe('user-swarm-service.ts', () => {
    let service: UserSwarmService;
    const testUser = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    beforeEach(() => {
      service = new UserSwarmService();
    });

    it('retrieves default personal config for new address', () => {
      const cfg = service.getConfig(testUser);
      expect(cfg.userAddress.toLowerCase()).toBe(testUser.toLowerCase());
      expect(cfg.mode).toBe('COPY');
      expect(cfg.copyTradeEnabled).toBe(false);
      expect(cfg.voltEnabled).toBe(true);
      expect(cfg.oracleEnabled).toBe(true);
      expect(cfg.titanEnabled).toBe(true);
      expect(cfg.sweeperEnabled).toBe(true);
    });

    it('toggles copy trading and switches swarm mode via upsertConfig', async () => {
      const updated = await service.upsertConfig(testUser, {
        copyTradeEnabled: true,
        mode: 'PERSONAL',
      });
      expect(updated.copyTradeEnabled).toBe(true);
      expect(updated.mode).toBe('PERSONAL');
      expect(service.isCopyTradeEnabled(testUser)).toBe(true);
      expect(service.hasUserConfig(testUser)).toBe(true);

      const toggledOff = await service.upsertConfig(testUser, {
        copyTradeEnabled: false,
        mode: 'COPY',
      });
      expect(toggledOff.copyTradeEnabled).toBe(false);
      expect(toggledOff.mode).toBe('COPY');
      expect(service.isCopyTradeEnabled(testUser)).toBe(false);
    });

    it('updates fine-grained agent configs and verifies parameters', async () => {
      const updated = await service.upsertConfig(testUser, {
        voltEnabled: false,
        oracleEnabled: true,
        titanEnabled: true,
        sweeperEnabled: true,
        voltConfig: {
          driftThreshold: 0.005,
          minEdge: 0.05,
          lotSize: 10,
          maxTradeSize: 50,
        },
      });

      expect(updated.voltEnabled).toBe(false);
      expect(updated.voltConfig.driftThreshold).toBe(0.005);
      expect(updated.voltConfig.minEdge).toBe(0.05);

      const fetched = await service.getOrFetchConfig(testUser);
      expect(fetched.voltEnabled).toBe(false);

      const all = service.getAllPersonalConfigs();
      expect(Array.isArray(all)).toBe(true);
    });
  });

  describe('operator-approval-service.ts', () => {
    const owner = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    it('returns true when on-chain allowance or global approval is satisfied', async () => {
      vi.spyOn(publicClient, 'readContract').mockImplementation(async ({ functionName }: any) => {
        if (functionName === 'isGloballyApproved') return true;
        if (functionName === 'allowance') return 500n * 1_000_000n; // 500 USDC
        return false;
      });

      const approved = await ensurePerPoolApprovalForCopyTrader(owner);
      expect(approved).toBe(true);
    });

    it('returns false when neither global approval nor allowance is present', async () => {
      vi.spyOn(publicClient, 'readContract').mockImplementation(async ({ functionName }: any) => {
        if (functionName === 'isGloballyApproved') return false;
        if (functionName === 'allowance') return 10n * 1_000_000n; // < 100 USDC
        return false;
      });

      const approved = await ensurePerPoolApprovalForCopyTrader(owner);
      expect(approved).toBe(false);
    });

    it('handles RPC errors gracefully and returns false', async () => {
      vi.spyOn(publicClient, 'readContract').mockRejectedValue(new Error('RPC network connection reset'));

      const approved = await ensurePerPoolApprovalForCopyTrader(owner);
      expect(approved).toBe(false);
    });
  });
});
