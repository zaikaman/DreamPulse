import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { type Hex, type Address, parseUnits, encodeFunctionData } from 'viem';
import {
  publicClient,
  walletClient,
  operatorAccount,
  SOMNIA_ADDRESSES,
  executeOperatorTx,
  somniaShannonTestnet,
} from '../config/somnia.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifact = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../config/session-account-v2-artifact.json'), 'utf8'),
);
const FACTORY = artifact.address as Address;
const FACTORY_ABI = artifact.factoryAbi;
const CLONE_ABI = artifact.implementationAbi;

async function main() {
  console.log('====================================================');
  console.log('LIVE V2 CLONE LIFECYCLE VERIFICATION');
  console.log('Factory:', FACTORY);
  console.log('Owner/user:', operatorAccount.address);
  console.log('====================================================\n');

  // 1. Predict + deploy clone for operator (as user)
  const predicted = await publicClient.readContract({
    address: FACTORY, abi: FACTORY_ABI, functionName: 'predictFor', args: [operatorAccount.address],
  });
  console.log('1. predictFor ->', predicted);

  const deployHash = await executeOperatorTx(() =>
    walletClient.writeContract({
      address: FACTORY, abi: FACTORY_ABI, functionName: 'deployFor',
      args: [operatorAccount.address, SOMNIA_ADDRESSES.testUsdc],
      account: operatorAccount, chain: somniaShannonTestnet,
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: deployHash, timeout: 60_000 });
  const clone = (await publicClient.readContract({
    address: FACTORY, abi: FACTORY_ABI, functionName: 'accounts', args: [operatorAccount.address],
  })) as Address;
  console.log('   deployed clone:', clone, clone.toLowerCase() === (predicted as string).toLowerCase() ? '(matches prediction)' : '(NONCE SKIPPED — squat?)');
  if (clone.toLowerCase() !== (predicted as string).toLowerCase()) throw new Error('prediction mismatch');

  const ownerOnClone = await publicClient.readContract({
    address: clone, abi: CLONE_ABI, functionName: 'owner',
  });
  if ((ownerOnClone as string).toLowerCase() !== operatorAccount.address.toLowerCase()) throw new Error('owner mismatch');
  console.log('   owner pinned correctly');

  // 2. Non-owner authorize must revert
  const stranger = privateKeyToAccount(generatePrivateKey());
  const sessionPriv = generatePrivateKey();
  const sessionKey = privateKeyToAccount(sessionPriv);
  console.log('\n2. Non-owner authorizeSession must revert...');
  let reverted = false;
  try {
    await publicClient.simulateContract({
      address: clone, abi: CLONE_ABI, functionName: 'authorizeSession',
      args: [sessionKey.address, parseUnits('20', 6), parseUnits('200', 6), 86400n],
      account: stranger,
    });
  } catch { reverted = true; }
  if (!reverted) throw new Error('non-owner authorize did NOT revert!');
  console.log('   PASS: reverted');

  // 3. Owner authorizes session key
  console.log('\n3. Owner authorizeSession(key, $20, $200, 24h)...');
  const authHash = await executeOperatorTx(() =>
    walletClient.writeContract({
      address: clone, abi: CLONE_ABI, functionName: 'authorizeSession',
      args: [sessionKey.address, parseUnits('20', 6), parseUnits('200', 6), 86400n],
      account: operatorAccount, chain: somniaShannonTestnet,
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: authHash, timeout: 60_000 });
  const policy: any = await publicClient.readContract({
    address: clone, abi: CLONE_ABI, functionName: 'getSession', args: [sessionKey.address],
  });
  console.log('   isActive:', policy[5], 'maxTrade:', policy[0].toString(), 'dailyCap:', policy[1].toString());
  if (!policy[5] || policy[0] !== parseUnits('20', 6)) throw new Error('policy mismatch');

  // 4. Over-cap executeOrder simulation must revert (cap enforced before pool call)
  console.log('\n4. executeOrder over maxTrade ($25 > $20) must revert...');
  const dummyCalldata = '0x41e8c07e000000000000000000000000' as Hex; // placeBinaryOrder selector
  reverted = false;
  try {
    await publicClient.simulateContract({
      address: clone, abi: CLONE_ABI, functionName: 'executeOrder',
      args: ['0x1111111111111111111111111111111111111111', dummyCalldata, parseUnits('25', 6)],
      account: sessionKey,
    });
  } catch (err: any) { reverted = true; console.log('   PASS:', (err.shortMessage || err.message || '').slice(0, 90)); }
  if (!reverted) throw new Error('over-cap execute did NOT revert!');

  // 5. Disallowed selector must revert
  console.log('\n5. executeOrder disallowed selector must revert...');
  reverted = false;
  try {
    await publicClient.simulateContract({
      address: clone, abi: CLONE_ABI, functionName: 'executeOrder',
      args: ['0x1111111111111111111111111111111111111111', '0x12345678000000' as Hex, parseUnits('10', 6)],
      account: sessionKey,
    });
  } catch { reverted = true; console.log('   PASS: reverted'); }
  if (!reverted) throw new Error('bad selector did NOT revert!');

  // 6. Unauthorized caller must revert
  console.log('\n6. executeOrder from stranger must revert...');
  reverted = false;
  try {
    await publicClient.simulateContract({
      address: clone, abi: CLONE_ABI, functionName: 'executeOrder',
      args: ['0x1111111111111111111111111111111111111111', dummyCalldata, parseUnits('10', 6)],
      account: stranger,
    });
  } catch { reverted = true; console.log('   PASS: reverted'); }
  if (!reverted) throw new Error('stranger execute did NOT revert!');

  // 7. Non-owner withdraw must revert
  console.log('\n7. withdraw by stranger must revert...');
  reverted = false;
  try {
    await publicClient.simulateContract({
      address: clone, abi: CLONE_ABI, functionName: 'withdraw',
      args: [SOMNIA_ADDRESSES.testUsdc, parseUnits('5', 6)],
      account: stranger,
    });
  } catch { reverted = true; console.log('   PASS: reverted'); }
  if (!reverted) throw new Error('stranger withdraw did NOT revert!');

  // 7b. Under-minimum withdrawal (< 1 tUSDC) must revert
  console.log('\n7b. Owner withdraw < 1 tUSDC must revert...');
  let underMinReverted = false;
  try {
    await publicClient.simulateContract({
      address: clone, abi: CLONE_ABI, functionName: 'withdraw',
      args: [SOMNIA_ADDRESSES.testUsdc, parseUnits('0.5', 6)],
      account: operatorAccount,
    });
  } catch (err: any) {
    underMinReverted = true;
    console.log('   PASS:', (err.shortMessage || err.message || '').slice(0, 90));
  }
  if (!underMinReverted) throw new Error('under-min withdraw did NOT revert!');

  // 7c. Check fee parameters on-chain
  const [feeRecipient, minWithdrawal, withdrawalFee] = await Promise.all([
    publicClient.readContract({ address: clone, abi: CLONE_ABI, functionName: 'feeRecipient' }),
    publicClient.readContract({ address: clone, abi: CLONE_ABI, functionName: 'MIN_WITHDRAWAL_AMOUNT' }),
    publicClient.readContract({ address: clone, abi: CLONE_ABI, functionName: 'WITHDRAWAL_FEE' }),
  ]);
  console.log('   feeRecipient:       ', feeRecipient);
  console.log('   MIN_WITHDRAWAL_AMOUNT:', String(minWithdrawal));
  console.log('   WITHDRAWAL_FEE:       ', String(withdrawalFee));
  if ((feeRecipient as string).toLowerCase() !== operatorAccount.address.toLowerCase()) {
    throw new Error('feeRecipient mismatch');
  }
  if ((minWithdrawal as bigint) !== parseUnits('1', 6) || (withdrawalFee as bigint) !== parseUnits('1', 6)) {
    throw new Error('fee / min withdrawal constant mismatch');
  }

  // 8. Revoke + verify inactive
  console.log('\n8. revokeSession...');
  const revHash = await executeOperatorTx(() =>
    walletClient.writeContract({
      address: clone, abi: CLONE_ABI, functionName: 'revokeSession',
      args: [sessionKey.address], account: operatorAccount, chain: somniaShannonTestnet,
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: revHash, timeout: 60_000 });
  const after: any = await publicClient.readContract({
    address: clone, abi: CLONE_ABI, functionName: 'getSession', args: [sessionKey.address],
  });
  if (after[5]) throw new Error('still active after revoke!');
  console.log('   PASS: inactive after revoke');

  console.log('\n========================================================================');
  console.log('>>> V2 CLONE LIFECYCLE: ALL LIVE CHECKS PASSED ON SHANNON <<<');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('Live V2 verification failed:', err);
  process.exit(1);
});
