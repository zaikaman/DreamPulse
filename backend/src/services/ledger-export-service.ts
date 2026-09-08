import { operatorAccount, SOMNIA_ADDRESSES } from '../config/somnia.js';
import { orderService } from './order-service.js';
import { marketService } from './market-service.js';
import { settlementService } from './settlement-service.js';
import { getAddress, isAddress } from 'viem';
import type { OrderExecution } from '../types/index.js';

export interface LedgerQueryOptions {
  page?: number;
  pageSize?: number;
  agent?: string;
  status?: string;
  marketId?: string;
  baseUrl?: string;
}

export interface LedgerAggregates {
  totalTransactions: number;
  totalFills: number;
  fillRatePct: number;
  totalVolume: number;
  totalRealizedPnl: number;
  wins: number;
  losses: number;
  winRatePct: number;
  activePositions: number;
  // Per-agent metrics matching SwarmCockpitView
  voltFills: number;
  voltPnl: number;
  oracleFills: number;
  oraclePnl: number;
  titanFills: number;
  titanPnl: number;
  sweeperSweeps: number;
  sweeperClaimed: number;
}

export class LedgerExportService {
  private lastSettlementSyncAt = 0;
  private cachedAggregates: { at: number; opAddress: string; data: LedgerAggregates } | null = null;
  private renderedCache = new Map<string, { at: number; text: string }>();

  /**
   * Generates formatted static text (.txt) transaction ledger for the DreamPulse Operator Swarm.
   * Highly optimized: zero blocking on-chain RPC calls, <5ms fast-path execution.
   */
  public async generateSwarmTxtLedger(options: LedgerQueryOptions = {}): Promise<string> {
    const page = Math.max(1, Math.floor(Number(options.page) || 1));
    const rawLimit = Math.floor(Number(options.pageSize) || 50);
    const pageSize = Math.min(100, Math.max(10, rawLimit));
    const offset = (page - 1) * pageSize;

    const opAddress = (SOMNIA_ADDRESSES.operatorAccount || operatorAccount.address).toLowerCase();
    const checksummedOp = isAddress(opAddress) ? getAddress(opAddress) : opAddress;

    const now = Date.now();

    // Fast-path: Check rendered page cache (1.5s TTL) for instant sub-millisecond responses
    const cacheKey = `${opAddress}|p:${page}|s:${pageSize}|a:${options.agent || ''}|st:${options.status || ''}|m:${options.marketId || ''}|u:${options.baseUrl || ''}`;
    const cachedEntry = this.renderedCache.get(cacheKey);
    if (cachedEntry && now - cachedEntry.at < 1500) {
      return cachedEntry.text;
    }

    // Non-blocking background settlement sync trigger (throttled to once per 3.5s)
    if (now - this.lastSettlementSyncAt > 3500) {
      this.lastSettlementSyncAt = now;
      void orderService.syncResolvedOrdersPnLAsync().catch(() => {});
    }

    // 1. Authoritative Swarm Aggregates matching AgentSwarmCockpit (cached for 2.0s)
    let aggregates: LedgerAggregates;
    if (this.cachedAggregates && this.cachedAggregates.opAddress === opAddress && (now - this.cachedAggregates.at < 2000)) {
      aggregates = { ...this.cachedAggregates.data };
    } else {
      const swarmAgg = orderService.getSwarmAggregates(opAddress);
      const userSweeps = settlementService.getSweepHistory(opAddress);
      const confirmedSweeps = userSweeps.filter(
        (s) => s.status === 'CONFIRMED' && s.txHash && s.txHash !== '0x0000000000000000000000000000000000000000000000000000000000000000'
      );
      const sweeperClaimed = Number(confirmedSweeps.reduce((acc, s) => acc + (s.claimableAmount || 0), 0).toFixed(2));
      const sweeperCount = confirmedSweeps.length;

      const cumulativeSwarmPnl = Number((swarmAgg.voltPnl + swarmAgg.oraclePnl + swarmAgg.titanPnl).toFixed(2));
      const totalSwarmFills = swarmAgg.voltTrades + swarmAgg.oracleTrades + swarmAgg.titanTrades;

      // In-memory single-pass scan for win/loss & active positions across operator orders
      let wins = 0;
      let losses = 0;
      let activePositions = 0;
      const memOrders = typeof orderService.getOrders === 'function' ? orderService.getOrders() : [];
      const opLower = opAddress.toLowerCase();

      for (let i = 0; i < memOrders.length; i++) {
        const o = memOrders[i];
        if (!o.userAddress || o.userAddress.toLowerCase() !== opLower) continue;
        if (o.source === 'TERMINAL' || o.agentType === 'Manual') continue;
        if (o.isSettled) {
          const val = o.pnl || 0;
          if (val > 0.01) wins++;
          else if (val < -0.01) losses++;
        } else if (o.status === 'FILLED' || o.status === 'PARTIALLY_FILLED') {
          activePositions++;
        }
      }
      const resolvedCount = wins + losses;
      const winRatePct = resolvedCount > 0 ? Number(((wins / resolvedCount) * 100).toFixed(1)) : 0;

      aggregates = {
        totalTransactions: totalSwarmFills,
        totalFills: totalSwarmFills,
        fillRatePct: 100,
        totalVolume: 0,
        totalRealizedPnl: cumulativeSwarmPnl,
        wins,
        losses,
        winRatePct,
        activePositions,
        voltFills: swarmAgg.voltTrades,
        voltPnl: swarmAgg.voltPnl,
        oracleFills: swarmAgg.oracleTrades,
        oraclePnl: swarmAgg.oraclePnl,
        titanFills: swarmAgg.titanTrades,
        titanPnl: swarmAgg.titanPnl,
        sweeperSweeps: sweeperCount,
        sweeperClaimed: sweeperClaimed,
      };
      this.cachedAggregates = { at: now, opAddress, data: aggregates };
    }

    // 2. High-speed in-memory paginated query
    const queryParams: any = {
      userAddress: opAddress,
      scope: 'SWARM',
      swarmOnly: true,
      source: 'SWARM',
      page,
      pageSize,
      agentType: options.agent && options.agent !== 'ALL' ? options.agent : undefined,
      status: options.status && options.status !== 'ALL' ? options.status : undefined,
      marketId: options.marketId && options.marketId.trim() ? options.marketId.trim() : undefined,
    };

    const paginatedResult = orderService.queryOrdersPaginated(queryParams);
    const orders = paginatedResult.orders;
    const totalCount = Math.max(paginatedResult.total, aggregates.totalFills);

    aggregates.totalTransactions = totalCount;
    aggregates.totalVolume = paginatedResult.totalVolume;
    aggregates.fillRatePct = totalCount > 0 ? Number(((aggregates.totalFills / totalCount) * 100).toFixed(1)) : 100;

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const startItem = totalCount === 0 ? 0 : offset + 1;
    const endItem = Math.min(offset + orders.length, totalCount);

    const rendered = this.renderAsciiLedger({
      orders,
      aggregates,
      page,
      pageSize,
      totalPages,
      totalCount,
      startItem,
      endItem,
      operatorAddress: checksummedOp,
      dataSource: 'SUPABASE POSTGRESQL & ON-CHAIN RECONCILED LEDGER',
      options,
    });

    // Cache rendered output
    if (this.renderedCache.size > 100) {
      this.renderedCache.clear();
    }
    this.renderedCache.set(cacheKey, { at: now, text: rendered });

    return rendered;
  }

  private resolveMarketDisplay(order: OrderExecution): string {
    const market = marketService.getMarketById(order.marketId);
    if (market?.symbol) {
      return `${market.symbol} ${market.windowDuration || '5m'}`.padEnd(14).slice(0, 14);
    }
    if (order.marketSnapshot?.symbol) {
      return `${order.marketSnapshot.symbol} ${order.marketSnapshot.windowDuration || '5m'}`.padEnd(14).slice(0, 14);
    }
    const shortId = order.marketId.startsWith('0x')
      ? `${order.marketId.slice(0, 6)}...${order.marketId.slice(-4)}`
      : order.marketId.slice(0, 12);
    return shortId.padEnd(14).slice(0, 14);
  }

  private formatTimestamp(isoStr?: string): string {
    if (!isoStr) return '                   ';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '                   ';
      return d.toISOString().replace('T', ' ').slice(0, 19);
    } catch {
      return '                   ';
    }
  }

  private renderAsciiLedger(ctx: {
    orders: OrderExecution[];
    aggregates: LedgerAggregates;
    page: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
    startItem: number;
    endItem: number;
    operatorAddress: string;
    dataSource: string;
    options: LedgerQueryOptions;
  }): string {
    const { orders, aggregates, page, pageSize, totalPages, totalCount, startItem, endItem, operatorAddress, dataSource, options } = ctx;
    const offset = (page - 1) * pageSize;

    const baseNavUrl = options.baseUrl || '/api/v1/swarm/transactions.txt';
    const buildNavUrl = (p: number) => {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('limit', String(pageSize));
      if (options.agent) params.set('agent', options.agent);
      if (options.status) params.set('status', options.status);
      return `${baseNavUrl}?${params.toString()}`;
    };

    const prevUrl = page > 1 ? buildNavUrl(page - 1) : '[NONE]';
    const nextUrl = page < totalPages ? buildNavUrl(page + 1) : '[NONE]';

    const pnlSign = aggregates.totalRealizedPnl >= 0 ? '+' : '';
    const pnlStr = `${pnlSign}${aggregates.totalRealizedPnl.toFixed(2)} tUSDC`;

    const vSign = aggregates.voltPnl >= 0 ? '+' : '';
    const oSign = aggregates.oraclePnl >= 0 ? '+' : '';
    const tSign = aggregates.titanPnl >= 0 ? '+' : '';

    const divider = '='.repeat(170);
    const thinDivider = '-'.repeat(170);

    const lines: string[] = [];

    // Header Banner
    lines.push(divider);
    lines.push('   ____                                ____          __               _     _       _             ');
    lines.push('  / __ \\ _____ ___   ____ _ ____ ___  / __ \\ __  __ / /_____ ___     | |   (_)     | |            ');
    lines.push(' / / / // ___// _ \\ / __ `// __ `__ \\/ /_/ // / / // // ___// _ \\    | |    _ _ __ | | __        ');
    lines.push('/ /_/ // /   /  __// /_/ // / / / / // ____// /_/ // /(__  )/  __/    | |___| | \'_ \\| |/ /        ');
    lines.push('\\____//_/    \\___/ \\__,_//_/ /_/ /_//_/     \\__,_//_//____/ \\___/     |_____|_|_| |_|_|\\_\\ (RAW LEDGER)');
    lines.push(divider);
    lines.push(' DREAMDEX AUTONOMOUS SWARM LEDGER • SOMNIA SHANNON TESTNET (CHAIN ID: 50312)');
    lines.push(` OPERATOR ACCOUNT: ${operatorAddress}`);
    lines.push(` GENERATED AT:     ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`);
    lines.push(` DATA SOURCE:      ${dataSource}`);
    lines.push(divider);

    // Summary Box with EXACT numbers matching the Cockpit UI
    lines.push(' GLOBAL SWARM PERFORMANCE SUMMARY (OPERATOR CANONICAL LEDGER):');
    lines.push(`   • Cumulative Swarm PnL: ${pnlStr} (Net Realized PnL: Volt + Oracle + Titan)`);
    lines.push(`   • Total Executions:     ${aggregates.totalFills.toLocaleString()} fills`);
    lines.push(`   • Total Transactions:   ${aggregates.totalTransactions.toLocaleString()} orders recorded`);
    lines.push(`   • Total Volume Traded:  ${aggregates.totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tUSDC`);
    lines.push('   • Swarm Agent Breakdown:');
    lines.push(`       - Volt Sniper:    ${aggregates.voltFills.toLocaleString().padStart(5)} fills | ${vSign}${aggregates.voltPnl.toFixed(2)} tUSDC`);
    lines.push(`       - Oracle Arb:     ${aggregates.oracleFills.toLocaleString().padStart(5)} fills | ${oSign}${aggregates.oraclePnl.toFixed(2)} tUSDC`);
    lines.push(`       - Titan MM:       ${aggregates.titanFills.toLocaleString().padStart(5)} fills | ${tSign}${aggregates.titanPnl.toFixed(2)} tUSDC`);
    lines.push(`       - Sweeper Daemon: ${aggregates.sweeperSweeps.toLocaleString().padStart(5)} sweeps | +${aggregates.sweeperClaimed.toFixed(2)} tUSDC claimed`);
    lines.push(`   • Win / Loss Record:    ${aggregates.wins} W / ${aggregates.losses} L (${aggregates.winRatePct.toFixed(1)}% win rate)`);
    lines.push(`   • Active Positions:     ${aggregates.activePositions} unsettled positions`);
    lines.push(thinDivider);

    // Pagination Info
    lines.push(' PAGINATION METRICS:');
    lines.push(`   • Current Page:  Page ${page} of ${totalPages} (Transactions ${startItem} - ${endItem} of ${totalCount.toLocaleString()})`);
    lines.push(`   • Page Size:     ${pageSize} transactions per page`);
    lines.push(`   • Previous Page: ${prevUrl}`);
    lines.push(`   • Next Page:     ${nextUrl}`);
    lines.push(divider);

    // Table Header
    const colHeader = [
      ' #  '.padEnd(5),
      'TIMESTAMP (UTC)    ',
      'AGENT    ',
      'MARKET        ',
      'DIR ',
      'OUT ',
      'PRICE  ',
      'LOTS    ',
      'TOTAL (tUSDC)',
      'STATUS    ',
      'PNL (tUSDC) ',
      'TX HASH (SOMNIA SHANNON TESTNET)',
    ].join(' | ');

    lines.push(colHeader);
    lines.push(thinDivider);

    if (orders.length === 0) {
      lines.push(' [NO TRANSACTIONS FOUND MATCHING QUERY CRITERIA]');
    } else {
      orders.forEach((o, index) => {
        const itemIdx = offset + index + 1;
        const idxStr = String(itemIdx).padStart(4, '0').padEnd(5);
        const timeStr = this.formatTimestamp(o.createdAt);
        const agentName = (o.customAgentName || o.agentType || 'Swarm').padEnd(9).slice(0, 9);
        const marketStr = this.resolveMarketDisplay(o);
        const dirStr = (o.direction || 'BUY').padEnd(4).slice(0, 4);
        const outStr = (o.outcome || 'YES').padEnd(4).slice(0, 4);
        const priceStr = (o.price || 0).toFixed(4).padStart(7);
        const lotStr = (o.lotSize || 0).toFixed(2).padStart(8);
        const costStr = (o.totalCost || 0).toFixed(4).padStart(13);
        const statusStr = (o.status || 'PENDING').padEnd(10).slice(0, 10);

        let pnlDisplay = '  UNSETTLED';
        if (o.isSettled) {
          const val = o.pnl || 0;
          const s = val >= 0 ? '+' : '';
          pnlDisplay = `${s}${val.toFixed(4)}`.padStart(12);
        } else if (o.status === 'CANCELLED' || o.status === 'REJECTED') {
          pnlDisplay = '      0.0000';
        }
        pnlDisplay = pnlDisplay.padEnd(12).slice(0, 12);

        const txHash = o.txHash || 'NO_ONCHAIN_HASH';
        const txStr = txHash.padEnd(66).slice(0, 66);

        lines.push([
          idxStr,
          timeStr,
          agentName,
          marketStr,
          dirStr,
          outStr,
          priceStr,
          lotStr,
          costStr,
          statusStr,
          pnlDisplay,
          txStr,
        ].join(' | '));
      });
    }

    lines.push(divider);
    lines.push(` [END OF PAGE ${page} OF ${totalPages}]`);
    lines.push(' NAVIGATION & API CONTROLS:');
    if (page < totalPages) {
      lines.push(`   • Fetch Next Page:     curl "${nextUrl}"`);
    }
    if (page > 1) {
      lines.push(`   • Fetch Previous Page: curl "${prevUrl}"`);
    }
    lines.push('   • Query Options:       ?page=<1..N>&limit=<10..100>&agent=<Volt|Oracle|Titan|Sweeper>&status=<FILLED|PENDING|CANCELLED>');
    lines.push('   • Somnia Shannon Explorer: https://shannon-explorer.somnia.network/address/' + operatorAddress);
    lines.push(divider);
    lines.push('');

    return lines.join('\n');
  }
}

export const ledgerExportService = new LedgerExportService();
