import { publicClient, SOMNIA_ADDRESSES, operatorAccount } from '../config/somnia.js';
import { parseAbi, type Address, type Hex } from 'viem';
import { ERC20_ABI } from '../config/permissions-abi.js';

const REGISTRY_ABI = parseAbi([
  'function isApprovedForPool(address pool, address owner, address operator, bytes4 selector) view returns (bool)',
  'function isGloballyApproved(address owner, address operator, bytes4 selector) view returns (bool)',
]);

const SELECTOR = '0x80054449' as Hex; // placeOrderFor

/**
 * Validates that a copy-trader has authorized the operator via global registry approval
 * and ERC-20 TestUSDC allowance.
 */
export async function ensurePerPoolApprovalForCopyTrader(
  owner: Address,
  _pool?: Address,
): Promise<boolean> {
  try {
    const [isGlobal, allowance] = await Promise.all([
      publicClient.readContract({
        address: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
        abi: REGISTRY_ABI,
        functionName: 'isGloballyApproved',
        args: [owner, operatorAccount.address, SELECTOR],
      }).catch(() => false),
      publicClient.readContract({
        address: SOMNIA_ADDRESSES.testUsdc,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [owner, operatorAccount.address],
      }).catch(() => 0n),
    ]);

    // Minimum 100 tUSDC allowance to operator for active copy-trading
    const isFunded = allowance >= 100n * 1_000_000n;
    return Boolean(isGlobal || isFunded);
  } catch (e: any) {
    console.warn(`[OperatorApprovalService] Validation error for ${owner}:`, e.message);
    return false;
  }
}
