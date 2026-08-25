import { publicClient, operatorAccount, somniaExchange } from './src/config/somnia';
import { SOMNIA_ADDRESSES } from './src/config/addresses';
import { parseAbi } from 'viem';

const ERC1155_ABI = parseAbi([
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
]);

async function main() {
  const user = '0x46cC04De981E603958e4612f877D72427c5b6544';
  const operator = operatorAccount.address;
  console.log('Operator:', operator);
  console.log('User:', user);

  const marketIds = ['0x8200', '0x8202', '0x8204', '0x78f2', '0x78a9', '0x78b4', '0x78c1'];
  for (const shortId of marketIds) {
    const hexId = ('0x' + shortId.slice(2).padStart(64, '0')) as `0x${string}`;
    try {
      const market = await somniaExchange.client.getMarketOnchain(hexId);
      const yesId = market.yesId;
      const noId = market.noId;
      const outcomeToken = market.outcomeToken;

      const opYes = await publicClient.readContract({
        address: outcomeToken,
        abi: ERC1155_ABI,
        functionName: 'balanceOf',
        args: [operator, yesId],
      });
      const opNo = await publicClient.readContract({
        address: outcomeToken,
        abi: ERC1155_ABI,
        functionName: 'balanceOf',
        args: [operator, noId],
      });
      const userYes = await publicClient.readContract({
        address: outcomeToken,
        abi: ERC1155_ABI,
        functionName: 'balanceOf',
        args: [user, yesId],
      });
      const userNo = await publicClient.readContract({
        address: outcomeToken,
        abi: ERC1155_ABI,
        functionName: 'balanceOf',
        args: [user, noId],
      });

      console.log('Market ' + shortId + ' (Finalized: ' + market.finalized + ', Winning: ' + market.winningOutcome + '):');
      console.log('  Operator: YES=' + opYes + ', NO=' + opNo);
      console.log('  User:     YES=' + userYes + ', NO=' + userNo);
    } catch (e: any) {
      console.log('Market ' + shortId + ' err: ' + e.message);
    }
  }
}

main().catch(console.error);
