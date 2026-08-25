import { supabase } from './src/config/supabase.js';
import { orderService } from './src/services/order-service.js';
import { somniaExchange, operatorAccount, publicClient, SOMNIA_ADDRESSES } from './src/config/somnia.js';

async function main() {
  console.log('=== AUDIT ROUND 2: PENDING & UNFILLED ORDERS ANALYSIS ===');
  await orderService.initPromise;

  const { data: allOrders } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  console.log(`Total orders in DB: ${allOrders?.length || 0}`);

  const pendingOrders = (allOrders || []).filter(o => o.status === 'PENDING');
  console.log(`Pending/Unfilled orders count: ${pendingOrders.length}`);

  for (const p of pendingOrders) {
    console.log(`\nPending Order ${p.id.slice(0,8)} | User: ${p.user_address.slice(0,8)}... | ${p.agent_type} | ${p.outcome} ${p.direction} | Price: ${p.price} | Size: ${p.lot_size} | Cost: ${p.total_cost} | Settled: ${p.is_settled} | PnL: ${p.pnl} | Tx: ${p.tx_hash} | Created: ${p.created_at}`);
    if (p.tx_hash && p.tx_hash.startsWith('0x')) {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: p.tx_hash as `0x${string}` });
        console.log(`  Receipt status: ${receipt.status}, block: ${receipt.blockNumber}`);
      } catch (err: any) {
        console.log(`  Receipt error: ${err.message}`);
      }
    }
  }

  process.exit(0);
}

main().catch(console.error);
