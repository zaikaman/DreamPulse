import { publicClient, operatorAccount } from './src/config/somnia';

async function main() {
  const op = operatorAccount.address;
  console.log('Operator address:', op);
  // Get latest block
  const blockNumber = await publicClient.getBlockNumber();
  console.log('Latest block number:', blockNumber);
}

main().catch(console.error);
