import { supabase } from './src/config/supabase';
import { publicClient } from './src/config/somnia';

async function main() {
  const { data: sweeps, error } = await supabase.from('sweeps').select('*');
  if (error) {
    console.error('Error:', error);
    return;
  }
  console.log(`Total sweeps in DB: ${sweeps?.length}`);

  let deletedCount = 0;
  for (const s of sweeps || []) {
    // If tx_hash is missing, or not a real onchain tx
    let isFake = false;
    if (!s.tx_hash || !s.tx_hash.startsWith('0x') || s.tx_hash.length !== 66) {
      isFake = true;
    } else {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: s.tx_hash as any });
        if (!receipt) {
          isFake = true;
        }
      } catch (e) {
        // Not found on chain
        isFake = true;
      }
    }

    if (isFake) {
      await supabase.from('sweeps').delete().eq('id', s.id);
      deletedCount++;
      console.log(`Deleted fake/invalid sweep ${s.id} (tx: ${s.tx_hash})`);
    }
  }

  console.log(`Finished. Deleted ${deletedCount} fake sweeps.`);
}

main().catch(console.error);
