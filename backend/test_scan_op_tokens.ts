import { publicClient, operatorAccount, somniaExchange } from './src/config/somnia';
import { parseAbi } from 'viem';

const ERC1155_ABI = parseAbi([
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
]);

async function main() {
  const operator = operatorAccount.address;
  const [active, finalized, resolved] = await Promise.all([
    somniaExchange.client.listBinaryMarkets({ status: 'Active', limit: 20 }),
    somniaExchange.client.listBinaryMarkets({ status: 'Finalized', limit: 20 }),
    somniaExchange.client.listBinaryMarkets({ status: 'Resolved', limit: 20 }),
  ]);
  const all = [...active, ...finalized, ...resolved];
  console.log(`Checking ${all.length} markets for operator ${operator}...`);

  for (const m of all) {
    try {
      const onchain = await somniaExchange.client.getMarketOnchain(m.marketId as any);
      const yesBal = await publicClient.readContract({
        address: onchain.outcomeToken,
        abi: ERC1155_ABI,
        functionName: 'balanceOf',
        args: [operator, onchain.yesId],
      });
      const noBal = await publicClient.readContract({
        address: onchain.outcomeToken,
        abi: ERC1155_ABI,
        functionName: 'balanceOf',
        args: [operator, onchain.noId],
      });

      if (yesBal > 0n || noBal > 0n) {
        console.log(`Market ${m.marketId.slice(0, 10)}... (Status: ${m.status}, Finalized: ${onchain.finalized}, Winning: ${onchain.winningOutcome}):`);
        console.log(`  Operator YES: ${yesBal}, NO: ${noBal}`);
      }
    } catch (e: any) {
      // skip
    }
  }
}

main().catch(console.error);
