import { publicClient, operatorAccount, SOMNIA_ADDRESSES, executeOperatorWriteContract } from './src/config/somnia';
import { ERC20_ABI } from './src/config/permissions-abi';

async function main() {
  const userAddress = '0x46cC04De981E603958e4612f877D72427c5b6544';
  const amount = 1_000_000n; // 1.0 tUSDC

  console.log(`Transferring 1.0 tUSDC from operator ${operatorAccount.address} to user ${userAddress}...`);

  const hash = await executeOperatorWriteContract({
    address: SOMNIA_ADDRESSES.testUsdc,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [userAddress, amount],
  });

  console.log('Submitted tx:', hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('Transaction confirmed! Status:', receipt.status, 'Block:', receipt.blockNumber);
  console.log(`Explorer link: https://shannon-explorer.somnia.network/tx/${hash}`);
}

main().catch(console.error);
