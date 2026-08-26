import { somniaExchange } from './src/config/somnia.js';
import { supabase } from './src/config/supabase.js';

async function main() {
  const discrepancyMarketIds = [
    '0x0000000000000000000000000000000000000000000000000000000000008204',
    '0x00000000000000000000000000000000000000000000000000000000000082a0',
    '0x00000000000000000000000000000000000000000000000000000000000082c2',
    '0x0000000000000000000000000000000000000000000000000000000000008618',
    '0x000000000000000000000000000000000000000000000000000000000000863d',
    '0x000000000000000000000000000000000000000000000000000000000000879c',
    '0x000000000000000000000000000000000000000000000000000000000000880e',
    '0x0000000000000000000000000000000000000000000000000000000000008835',
    '0x0000000000000000000000000000000000000000000000000000000000008eb3',
    '0x0000000000000000000000000000000000000000000000000000000000008ed6',
    '0x0000000000000000000000000000000000000000000000000000000000008f74',
    '0x0000000000000000000000000000000000000000000000000000000000008fc0',
    '0x0000000000000000000000000000000000000000000000000000000000009aa1',
  ];

  console.log(`Checking ${discrepancyMarketIds.length} discrepancy markets...`);

  for (const mktId of discrepancyMarketIds) {
    const onchain = await somniaExchange.client.getMarketOnchain(mktId as `0x${string}`).catch(e => ({ error: e.message }));
    
    // Also fetch orders for this market
    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .ilike('market_id', mktId);

    // Also fetch sweeps for this market
    const { data: sweeps } = await supabase
      .from('sweeps')
      .select('*')
      .ilike('market_id', mktId);

    console.log(`\n========================================`);
    console.log(`Market: ${mktId}`);
    console.log(`Onchain Status:`, {
      status: (onchain as any).status,
      finalized: (onchain as any).finalized,
      isResolved: (onchain as any).isResolved,
      winningOutcome: (onchain as any).winningOutcome, // 0 = YES, 1 = NO
      isVoided: (onchain as any).isVoided,
    });
    console.log(`Orders (${orders?.length}):`, orders?.map(o => ({
      id: o.id.slice(0, 8),
      user: o.user_address?.slice(0, 6),
      outcome: o.outcome,
      dir: o.direction,
      size: o.lot_size,
      cost: o.total_cost,
      pnl: o.pnl,
      settled: o.is_settled,
      settledAt: o.settled_at,
    })));
    console.log(`Sweeps (${sweeps?.length}):`, sweeps?.map(s => ({
      id: s.id.slice(0, 8),
      user: s.user_address?.slice(0, 6),
      winOutcome: s.winning_outcome,
      claimed: s.claimable_amount,
      tx: s.tx_hash?.slice(0, 10),
      claimedAt: s.claimed_at,
    })));
  }

  process.exit(0);
}

main().catch(console.error);
