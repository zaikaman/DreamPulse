import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ledgerExportService } from '../src/services/ledger-export-service.js';
import { orderService } from '../src/services/order-service.js';
import { operatorAccount } from '../src/config/somnia.js';

describe('LedgerExportService (.txt Raw Ledger)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a formatted ASCII raw text ledger with performance summary and column headers', async () => {
    const text = await ledgerExportService.generateSwarmTxtLedger({
      page: 1,
      pageSize: 50,
      baseUrl: 'http://localhost:5000/api/v1/swarm/transactions.txt',
    });

    expect(typeof text).toBe('string');
    expect(text).toContain('DREAMDEX AUTONOMOUS SWARM LEDGER');
    expect(text).toContain('SOMNIA SHANNON TESTNET (CHAIN ID: 50312)');
    expect(text).toContain(`OPERATOR ACCOUNT: ${operatorAccount.address}`);
    expect(text).toContain('GLOBAL SWARM PERFORMANCE SUMMARY');
    expect(text).toContain('Total Transactions:');
    expect(text).toContain('Total Volume Traded:');
    expect(text).toContain('Net Realized PnL:');
    expect(text).toContain('PAGINATION METRICS:');
    expect(text).toContain('Page 1 of');
    expect(text).toContain('50 transactions per page');
    expect(text).toContain('TIMESTAMP (UTC)');
    expect(text).toContain('AGENT');
    expect(text).toContain('MARKET');
    expect(text).toContain('TOTAL (tUSDC)');
    expect(text).toContain('TX HASH (SOMNIA SHANNON TESTNET)');
    expect(text).toContain('NAVIGATION & API CONTROLS:');
  });

  it('correctly handles pagination parameters and limits', async () => {
    const text = await ledgerExportService.generateSwarmTxtLedger({
      page: 2,
      pageSize: 20,
      baseUrl: 'http://localhost:5000/api/v1/swarm/transactions.txt',
    });

    expect(text).toContain('Page 2 of');
    expect(text).toContain('20 transactions per page');
    expect(text).toContain('page=1&limit=20');
  });

  it('renders trade details when orders exist in the in-memory fallback', async () => {
    // Inject mock swarm order
    const mockOrder = {
      id: 'test-order-uuid-1',
      userAddress: operatorAccount.address,
      marketId: '0x1111111111111111111111111111111111111111111111111111111111111111',
      agentType: 'Volt' as const,
      source: 'SWARM' as const,
      outcome: 'YES' as const,
      direction: 'BUY' as const,
      orderType: 'LIMIT' as const,
      price: 0.55,
      lotSize: 10,
      totalCost: 5.5,
      status: 'FILLED' as const,
      txHash: '0x3abf790c0a969f697116ddaeec3f40f09e6d0801fa049b1ff5fa4d4a86f1e8e4',
      pnl: 4.5,
      isSettled: true,
      createdAt: '2026-09-08T06:00:00.000Z',
    };

    (orderService as any).orders = [mockOrder];

    const text = await ledgerExportService.generateSwarmTxtLedger({
      page: 1,
      pageSize: 10,
    });

    expect(text).toContain('Volt');
    expect(text).toContain('0.5500');
    expect(text).toContain('10.00');
    expect(text).toContain('5.5000');
    expect(text).toContain('FILLED');
    expect(text).toContain('+4.5000');
    expect(text).toContain('0x3abf790c0a969f697116ddaeec3f40f09e6d0801fa049b1ff5fa4d4a86f1e8e4');
  });
});
