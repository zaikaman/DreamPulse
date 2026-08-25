import { supabase } from './src/config/supabase';

async function main() {
  const { data: allSweeps } = await supabase.from('sweeps').select('*').limit(20);
  console.log('All Sweeps in DB count:', allSweeps?.length);
  console.log(JSON.stringify(allSweeps, null, 2));

  const { data: allOrders } = await supabase.from('orders').select('*').limit(20);
  console.log('All Orders in DB count:', allOrders?.length);
  for (const o of allOrders || []) {
    console.log(`Order ${o.id}: user=${o.user_address} market=${o.market_id} outcome=${o.outcome} lotSize=${o.lot_size} status=${o.status} txHash=${o.tx_hash}`);
  }
}

main().catch(console.error);
