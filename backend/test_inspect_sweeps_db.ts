import { supabase } from './src/config/supabase';

async function main() {
  const { data, error } = await supabase
    .from('sweeps')
    .select('*')
    .order('claimed_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Error fetching sweeps:', error);
    return;
  }

  console.log('Total sweeps fetched:', data?.length);
  for (const row of data || []) {
    console.log(`[${row.claimed_at}] User: ${row.user_address} | Mkt: ${row.market_id} | Amount: ${row.claimable_amount} | Tx: ${row.tx_hash}`);
  }
}

main().catch(console.error);
