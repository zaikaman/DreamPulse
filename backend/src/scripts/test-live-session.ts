import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { type Hex, parseUnits, formatUnits } from 'viem';
import {
  publicClient,
  walletClient,
  operatorAccount,
  SOMNIA_ADDRESSES,
  executeOperatorTx,
  somniaShannonTestnet,
} from '../config/somnia.js';
import {
  DREAM_PULSE_SESSION_ACCOUNT_ABI,
  OPERATOR_SELECTORS,
} from '../config/permissions-abi.js';

async function main() {
  console.log('====================================================');
  console.log('LIVE ON-CHAIN VERIFICATION OF DreamPulseSessionAccount');
  console.log('Contract Address:', SOMNIA_ADDRESSES.sessionAccount);
  console.log('Owner / User:    ', operatorAccount.address);
  console.log('====================================================\n');

  // 1. Generate an ephemeral session key
  const sessionPrivateKey = generatePrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);
  console.log('1. Generated Ephemeral Session Key:');
  console.log('   Address:    ', sessionAccount.address);
  console.log('   Private Key:', sessionPrivateKey.slice(0, 10) + '...\n');

  // 2. Check initial validity before authorization (should be isActive = false)
  const initialPolicy = await publicClient.readContract({
    address: SOMNIA_ADDRESSES.sessionAccount,
    abi: DREAM_PULSE_SESSION_ACCOUNT_ABI,
    functionName: 'getSession',
    args: [operatorAccount.address, sessionAccount.address],
  });
  console.log('2. Initial getSession check:');
  console.log('   isActive:', initialPolicy[5]);
  if (initialPolicy[5]) {
    throw new Error('Expected initial isActive to be false!');
  }

  // 3. Authorize session key on-chain via owner (operatorAccount)
  // Limits: maxTradeSize = $20 (20_000_000n), dailyCap = $200 (200_000_000n), duration = 24 hours (86400 seconds)
  const maxTradeSize = parseUnits('20', 6);
  const dailyVolumeCap = parseUnits('200', 6);
  const durationSec = 86400n; // 24h

  console.log('\n3. Authorizing session key on-chain via authorizeSession...');
  console.log('   maxTradeSize:  ', formatUnits(maxTradeSize, 6), 'tUSDC');
  console.log('   dailyVolumeCap:', formatUnits(dailyVolumeCap, 6), 'tUSDC');
  console.log('   durationSec:   ', durationSec.toString(), 'seconds (24h)');

  const authTxHash = await executeOperatorTx(async () => {
    return await walletClient.writeContract({
      address: SOMNIA_ADDRESSES.sessionAccount,
      abi: DREAM_PULSE_SESSION_ACCOUNT_ABI,
      functionName: 'authorizeSession',
      args: [sessionAccount.address, maxTradeSize, dailyVolumeCap, durationSec],
      account: operatorAccount,
      chain: somniaShannonTestnet,
    });
  });

  console.log('   Auth Tx Submitted:', authTxHash);
  const authReceipt = await publicClient.waitForTransactionReceipt({
    hash: authTxHash,
    timeout: 60_000,
  });
  console.log('   Auth Tx Confirmed in Block:', authReceipt.blockNumber);
  if (authReceipt.status !== 'success') {
    throw new Error('Session authorization transaction failed on-chain!');
  }

  // 4. Verify policy state on-chain
  const postPolicy = await publicClient.readContract({
    address: SOMNIA_ADDRESSES.sessionAccount,
    abi: DREAM_PULSE_SESSION_ACCOUNT_ABI,
    functionName: 'getSession',
    args: [operatorAccount.address, sessionAccount.address],
  });

  console.log('\n4. Verifying On-Chain Policy:');
  console.log('   maxTradeSize:           ', formatUnits(postPolicy[0], 6), 'tUSDC');
  console.log('   dailyVolumeCap:         ', formatUnits(postPolicy[1], 6), 'tUSDC');
  console.log('   spentToday:             ', formatUnits(postPolicy[2], 6), 'tUSDC');
  console.log('   remainingDailyAllowance:', formatUnits(postPolicy[3], 6), 'tUSDC');
  console.log('   expiresAt:              ', new Date(Number(postPolicy[4]) * 1000).toISOString());
  console.log('   isActive:               ', postPolicy[5]);

  if (!postPolicy[5]) {
    throw new Error('Expected isActive to be true after authorization!');
  }
  if (postPolicy[0] !== maxTradeSize || postPolicy[1] !== dailyVolumeCap) {
    throw new Error('On-chain policy values do not match submitted parameters!');
  }

  // 5. Test on-chain guardrails rejection via simulation
  console.log('\n5. Testing On-Chain Enforcement Guardrails (Simulation):');
  const dummyPool = '0x1111111111111111111111111111111111111111' as `0x${string}`;
  const dummyCalldata = `${OPERATOR_SELECTORS.placeOrderFor}000000000000000000000000` as Hex;

  // Case A: Call with tradeAmount > maxTradeSize ($25 > $20)
  const overCapTrade = parseUnits('25', 6);
  try {
    await publicClient.simulateContract({
      address: SOMNIA_ADDRESSES.sessionAccount,
      abi: DREAM_PULSE_SESSION_ACCOUNT_ABI,
      functionName: 'executeOrder',
      args: [operatorAccount.address, dummyPool, dummyCalldata, overCapTrade],
      account: sessionAccount,
    });
    console.error('   FAIL: executeOrder with $25 should have reverted!');
    process.exit(1);
  } catch (err: any) {
    console.log('   PASS: Exceeding max trade ($25 > $20) reverted on-chain:', err.shortMessage || err.message?.slice(0, 80));
  }

  // Case B: Call with unauthorized random caller
  const randomStranger = privateKeyToAccount(generatePrivateKey());
  try {
    await publicClient.simulateContract({
      address: SOMNIA_ADDRESSES.sessionAccount,
      abi: DREAM_PULSE_SESSION_ACCOUNT_ABI,
      functionName: 'executeOrder',
      args: [operatorAccount.address, dummyPool, dummyCalldata, parseUnits('10', 6)],
      account: randomStranger,
    });
    console.error('   FAIL: executeOrder with random caller should have reverted!');
    process.exit(1);
  } catch (err: any) {
    console.log('   PASS: Unauthorized session key reverted on-chain:', err.shortMessage || err.message?.slice(0, 80));
  }

  // Case C: Call with disallowed function selector (e.g. 0x12345678)
  try {
    await publicClient.simulateContract({
      address: SOMNIA_ADDRESSES.sessionAccount,
      abi: DREAM_PULSE_SESSION_ACCOUNT_ABI,
      functionName: 'executeOrder',
      args: [operatorAccount.address, dummyPool, '0x12345678000000' as Hex, parseUnits('10', 6)],
      account: sessionAccount,
    });
    console.error('   FAIL: executeOrder with disallowed selector should have reverted!');
    process.exit(1);
  } catch (err: any) {
    console.log('   PASS: Disallowed selector reverted on-chain:', err.shortMessage || err.message?.slice(0, 80));
  }

  // 6. Test 1-tx Instant On-Chain Revocation
  console.log('\n6. Testing 1-Tx On-Chain Revocation via revokeSession...');
  const revokeTxHash = await executeOperatorTx(async () => {
    return await walletClient.writeContract({
      address: SOMNIA_ADDRESSES.sessionAccount,
      abi: DREAM_PULSE_SESSION_ACCOUNT_ABI,
      functionName: 'revokeSession',
      args: [sessionAccount.address],
      account: operatorAccount,
      chain: somniaShannonTestnet,
    });
  });
  console.log('   Revoke Tx Submitted:', revokeTxHash);
  const revokeReceipt = await publicClient.waitForTransactionReceipt({
    hash: revokeTxHash,
    timeout: 60_000,
  });
  console.log('   Revoke Tx Confirmed in Block:', revokeReceipt.blockNumber);

  // 7. Verify session is now invalid on-chain
  const finalPolicy = await publicClient.readContract({
    address: SOMNIA_ADDRESSES.sessionAccount,
    abi: DREAM_PULSE_SESSION_ACCOUNT_ABI,
    functionName: 'getSession',
    args: [operatorAccount.address, sessionAccount.address],
  });
  console.log('\n7. Final getSession check after revocation:');
  console.log('   isActive:', finalPolicy[5]);
  if (finalPolicy[5]) {
    throw new Error('Expected session isActive to be false after revocation!');
  }

  console.log('\n========================================================================');
  console.log('>>> 100% LIVE ON-CHAIN VERIFICATION PASSED ON SOMNIA SHANNON TESTNET <<<');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('Live on-chain verification failed:', err);
  process.exit(1);
});
