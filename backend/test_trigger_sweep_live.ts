import { settlementService } from './src/services/settlement-service';

async function main() {
  const user = '0x46cC04De981E603958e4612f877D72427c5b6544';
  console.log('Testing triggerBatchSweep for user:', user);
  const res = await settlementService.triggerBatchSweep(user, false);
  console.log('Result:', JSON.stringify(res, null, 2));
}

main().catch(console.error);
