import { supabase } from '../config/supabase.js';

async function reconcileAllSweeps() {
  console.log('--- GLOBAL DATABASE SWEEP RECONCILIATION FOR ALL USERS ---');

  // 1. Fetch all orders paginated
  let allOrders: any[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !data || data.length === 0) break;
    allOrders.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  console.log('Total orders in DB across all users:', allOrders.length);

  // 2. Fetch all sweeps paginated
  let allSweeps: any[] = [];
  page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('sweeps')
      .select('*')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !data || data.length === 0) break;
    allSweeps.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  console.log('Total sweeps in DB across all users:', allSweeps.length);

  // Build map of winning orders by (user:market)
  const ordersByKey = new Map<string, any>();
  for (const o of allOrders) {
    if (!o.user_address || !o.market_id) continue;
    const key = `${o.user_address.toLowerCase()}:${o.market_id.toLowerCase()}`;
    if (!ordersByKey.has(key) || (o.pnl || 0) > 0) {
      ordersByKey.set(key, o);
    }
  }

  // 3. Deduplicate sweeps by (user:market), keeping the earliest
  const sweepsByKey = new Map<string, any>();
  const duplicateIdsToDelete: string[] = [];

  // Sort sweeps by claimed_at ascending
  allSweeps.sort((a, b) => new Date(a.claimed_at).getTime() - new Date(b.claimed_at).getTime());

  for (const s of allSweeps) {
    if (!s.user_address || !s.market_id) continue;
    const key = `${s.user_address.toLowerCase()}:${s.market_id.toLowerCase()}`;
    if (!sweepsByKey.has(key)) {
      sweepsByKey.set(key, s);
    } else {
      duplicateIdsToDelete.push(s.id);
    }
  }

  console.log('Distinct (user, market) genuine sweeps to KEEP:', sweepsByKey.size);
  console.log('Duplicate sweeps to DELETE across all users:', duplicateIdsToDelete.length);

  if (duplicateIdsToDelete.length > 0) {
    for (let i = 0; i < duplicateIdsToDelete.length; i += 200) {
      const batch = duplicateIdsToDelete.slice(i, i + 200);
      const { error } = await supabase.from('sweeps').delete().in('id', batch);
      if (error) console.error('Delete batch error:', error);
    }
    console.log('All duplicate ghost sweeps deleted successfully!');
  }

  // 4. Align timestamps and tx_hashes for all retained sweeps in parallel batches
  let alignedCount = 0;
  const updates: Array<{ id: string; targetTime: string; realTxHash: string }> = [];

  for (const [key, s] of sweepsByKey.entries()) {
    const order = ordersByKey.get(key);
    if (order && order.created_at) {
      const realTxHash = order.tx_hash && order.tx_hash.startsWith('0x') && order.tx_hash.length === 66 ? order.tx_hash : s.tx_hash;
      const targetTime = order.created_at;
      if (s.claimed_at !== targetTime || s.tx_hash !== realTxHash) {
        updates.push({ id: s.id, targetTime, realTxHash });
      }
    }
  }

  console.log(`Applying timestamp/tx_hash alignments for ${updates.length} sweeps...`);
  for (let i = 0; i < updates.length; i += 50) {
    const batch = updates.slice(i, i + 50);
    await Promise.all(
      batch.map((u) =>
        supabase.from('sweeps').update({
          claimed_at: u.targetTime,
          tx_hash: u.realTxHash,
        }).eq('id', u.id)
      )
    );
    alignedCount += batch.length;
    if (alignedCount % 200 === 0 || alignedCount === updates.length) {
      console.log(`Aligned ${alignedCount}/${updates.length} sweeps...`);
    }
  }

  console.log(`--- RECONCILIATION COMPLETE: Aligned ${alignedCount} sweeps across ALL users! ---`);
}

reconcileAllSweeps()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Reconciliation error:', err);
    process.exit(1);
  });
