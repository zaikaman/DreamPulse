import { publicClient, operatorAccount, somniaExchange } from './src/config/somnia';
import { supabase } from './src/config/supabase';
import { parseAbi } from 'viem';

const ERC1155_ABI = parseAbi([
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
]);

async function main() {
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  const seenMarkets = new Set<string>();
  for (const o of orders || []) {
    if (!o.market_id || seenMarkets.has(o.market_id)) continue;
    seenMarkets.add(o.market_id);

    try {
      const hexId = (o.market_id.startsWith('0x') ? o.market_id : '0x' + o.market_id) as `0x${string}`;
      const onchain = await somniaExchange.client.getMarketOnchain(hexId);
      const opYes = await publicClient.readContract({
        address: onchain.outcomeToken,
        abi: ERC1155_ABI,
        functionName: 'balanceOf',
        args: [operatorAccount.address, onchain.yesId],
      });
      const opNo = await publicClient.readContract({
        address: onchain.outcomeToken,
        abi: ERC1155_ABI,
        functionName: 'balanceOf',
        args: [operatorAccount.address, onchain.noId],
      });

      console.log(`Market ${hexId.slice(0, 10)}... (Finalized: ${onchain.finalized}, Winning: ${onchain.winningOutcome}, Voided: ${onchain.isVoided}):`);
      console.log(`  Operator YES: ${opYes}, NO: ${opNo}`);
      console.log(`  Traded By: ${o.user_address}, Outcome: ${o.outcome}, Amount: ${o.lot_size}`);
    } catch (e: any) {
      console.log(`Market ${o.market_id} error:`, e.message);
    }
  }
}

main().catch(console.error);
