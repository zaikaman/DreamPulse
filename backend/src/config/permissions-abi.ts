import {
  type Address,
  type Hex,
  verifyTypedData,
  parseUnits,
  formatUnits,
} from 'viem';
import { SOMNIA_ADDRESSES, publicClient } from './somnia.js';

/**
 * Somnia OperatorPermissionsRegistry ABI bindings.
 * Enables non-custodial session key authorization for trading bots.
 */
export const OPERATOR_PERMISSIONS_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'setOperatorApprovalForPool',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'operator', type: 'address' },
      { name: 'selectors', type: 'bytes4[]' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setOperatorApprovalGlobal',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'selectors', type: 'bytes4[]' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setOperatorDenialForPool',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'operator', type: 'address' },
      { name: 'selectors', type: 'bytes4[]' },
      { name: 'denied', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isGloballyApproved',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
      { name: 'selector', type: 'bytes4' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isApprovedForPool',
    stateMutability: 'view',
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
      { name: 'selector', type: 'bytes4' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/**
 * DreamDEX SpotPool ABI surface for orders, manual vault mode, and deposits.
 */
export const SPOT_POOL_ABI = [
  {
    type: 'function',
    name: 'setManualVaultMode',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'enabled', type: 'bool' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getManualVaultMode',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'depositNative',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getWithdrawableBalance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'isOperatorAuthorized',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
      { name: 'selector', type: 'bytes4' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'placeOrderFor',
    stateMutability: 'payable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'isBid', type: 'bool' },
      { name: 'userData', type: 'uint64' },
      { name: 'price', type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
      { name: 'expireTimestampNs', type: 'uint64' },
      { name: 'orderType', type: 'uint8' },
      { name: 'selfMatchingOption', type: 'uint8' },
      { name: 'builder', type: 'address' },
      { name: 'builderFeeBpsTimes1k', type: 'uint96' },
    ],
    outputs: [
      { name: 'success', type: 'bool' },
      { name: 'orderId', type: 'uint128' },
    ],
  },
  {
    type: 'function',
    name: 'cancelOrderFor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'orderId', type: 'uint128' },
    ],
    outputs: [],
  },
] as const;

/**
 * Standard ERC20 ABI for allowance and approvals.
 */
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/**
 * Permitted operator function selectors on DreamDEX Event Contracts CLOB.
 */
export const OPERATOR_SELECTORS = {
  placeOrderFor: '0x80054449' as Hex,
  placeBinaryOrderFor: '0x5d97c566' as Hex,
  cancelOrderFor: '0xe37b444b' as Hex,
  reduceOrderFor: '0x364c2587' as Hex,
} as const;

/**
 * BinaryPool write surface for delegated copy-trades.
 * Generic `placeOrderFor` reverts `UseBinaryPlacement` on event-contract pools.
 */
export const BINARY_POOL_WRITE_ABI = [
  {
    type: 'function',
    name: 'placeBinaryOrderFor',
    stateMutability: 'payable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'kind', type: 'uint8' },
      { name: 'price', type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
      { name: 'expireTimestampNs', type: 'uint64' },
      { name: 'orderType', type: 'uint8' },
      { name: 'selfMatchingOption', type: 'uint8' },
      { name: 'builder', type: 'address' },
      { name: 'builderFeeBpsTimes1k', type: 'uint96' },
      { name: 'userData', type: 'uint64' },
    ],
    outputs: [
      { name: 'success', type: 'bool' },
      { name: 'id', type: 'uint128' },
    ],
  },
] as const;

/**
 * Prohibited operations to preserve the strict Zero-Custody Invariant.
 */
export const PROHIBITED_OPERATIONS = [
  'transfer',
  'transferFrom',
  'withdraw',
  'setApprovalForAll',
  'approve',
] as const;

/**
 * EIP-712 Domain for DreamPulse Session Delegation.
 */
export const SESSION_EIP712_DOMAIN = {
  name: 'DreamPulse Operator Registry',
  version: '1',
  chainId: SOMNIA_ADDRESSES.chainId, // 50312
  verifyingContract: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
} as const;

/**
 * EIP-712 Typed Data Type Definitions for SessionDelegation.
 */
export const SESSION_EIP712_TYPES = {
  SessionDelegation: [
    { name: 'delegator', type: 'address' },
    { name: 'operator', type: 'address' },
    { name: 'maxTradeSize', type: 'uint256' },
    { name: 'dailyVolumeCap', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export interface SessionDelegationMessage {
  delegator: Address;
  operator: Address;
  maxTradeSize: bigint;
  dailyVolumeCap: bigint;
  nonce: bigint;
  deadline: bigint;
}

/**
 * Verify an EIP-712 typed signature for non-custodial session delegation.
 */
export async function verifySessionDelegationSignature(params: {
  delegator: Address;
  operator: Address;
  maxTradeSize: number | bigint;
  dailyVolumeCap: number | bigint;
  nonce: number | bigint;
  deadline: number | bigint;
  signature: Hex;
}): Promise<boolean> {
  const maxTradeSize = typeof params.maxTradeSize === 'bigint'
    ? params.maxTradeSize
    : parseUnits(params.maxTradeSize.toString(), 18);

  const dailyVolumeCap = typeof params.dailyVolumeCap === 'bigint'
    ? params.dailyVolumeCap
    : parseUnits(params.dailyVolumeCap.toString(), 18);

  const nonce = typeof params.nonce === 'bigint'
    ? params.nonce
    : BigInt(params.nonce);

  const deadline = typeof params.deadline === 'bigint'
    ? params.deadline
    : BigInt(params.deadline);

  try {
    const isValid = await verifyTypedData({
      address: params.delegator,
      domain: SESSION_EIP712_DOMAIN,
      types: SESSION_EIP712_TYPES,
      primaryType: 'SessionDelegation',
      message: {
        delegator: params.delegator,
        operator: params.operator,
        maxTradeSize,
        dailyVolumeCap,
        nonce,
        deadline,
      },
      signature: params.signature,
    });

    return isValid;
  } catch (err) {
    console.error('[SessionSignature] Verification error:', err);
    return false;
  }
}

/**
 * Validates that requested permissions contain only authorized non-custodial selectors.
 */
export function validateZeroCustodyInvariants(requestedActions: string[]): {
  valid: boolean;
  rejectedActions: string[];
} {
  const rejectedActions: string[] = [];

  for (const action of requestedActions) {
    const isProhibited = PROHIBITED_OPERATIONS.some((p) =>
      action.toLowerCase().includes(p.toLowerCase())
    );
    if (isProhibited) {
      rejectedActions.push(action);
    }
  }

  return {
    valid: rejectedActions.length === 0,
    rejectedActions,
  };
}

const PLACE_SELECTORS: Hex[] = [
  OPERATOR_SELECTORS.placeOrderFor,
  OPERATOR_SELECTORS.placeBinaryOrderFor,
];

/**
 * Probe on-chain operator authorization.
 * Returns true/false when the chain answered, or null when RPC/read failed
 * so callers can keep the previous in-memory flag instead of treating an
 * outage as "not authorized".
 */
export async function probeOnChainOperatorAuthorization(
  owner: Address,
  operator: Address,
  pool?: Address,
  selector: Hex = OPERATOR_SELECTORS.placeOrderFor,
): Promise<boolean | null> {
  const selectors = selector === OPERATOR_SELECTORS.placeOrderFor
    ? PLACE_SELECTORS
    : [selector, ...PLACE_SELECTORS.filter((s) => s !== selector)];

  let probed = false;

  const mark = (value: boolean): boolean => {
    probed = true;
    return value;
  };

  try {
    if (pool && pool.startsWith('0x') && pool !== SOMNIA_ADDRESSES.binaryModule) {
      for (const sel of selectors) {
        try {
          const authorizedOnPool = await publicClient.readContract({
            address: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
            abi: OPERATOR_PERMISSIONS_REGISTRY_ABI,
            functionName: 'isApprovedForPool',
            args: [pool, owner, operator, sel as `0x${string}`],
          });
          if (mark(Boolean(authorizedOnPool))) return true;
        } catch {
          // try next selector / fallback
        }

        try {
          const authorizedOnPoolContract = await publicClient.readContract({
            address: pool,
            abi: SPOT_POOL_ABI,
            functionName: 'isOperatorAuthorized',
            args: [owner, operator, sel as `0x${string}`],
          });
          if (mark(Boolean(authorizedOnPoolContract))) return true;
        } catch {
          // Binary pools may not expose this view; fall through to global grant
        }
      }
    }

    for (const sel of selectors) {
      try {
        const authorizedOnRegistry = await publicClient.readContract({
          address: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
          abi: OPERATOR_PERMISSIONS_REGISTRY_ABI,
          functionName: 'isGloballyApproved',
          args: [owner, operator, sel as `0x${string}`],
        });
        if (mark(Boolean(authorizedOnRegistry))) return true;
      } catch {
        // try next selector
      }
    }

    return probed ? false : null;
  } catch (err: any) {
    console.warn(`[checkOnChainOperatorAuthorization] Check notice:`, err.message);
    return probed ? false : null;
  }
}

/**
 * Query on-chain OperatorPermissionsRegistry or SpotPool to verify if operator is authorized for owner.
 */
export async function checkOnChainOperatorAuthorization(
  owner: Address,
  operator: Address,
  pool?: Address,
  selector: Hex = OPERATOR_SELECTORS.placeOrderFor,
): Promise<boolean> {
  return (await probeOnChainOperatorAuthorization(owner, operator, pool, selector)) === true;
}

/**
 * Query on-chain SpotPool withdrawable vault balance for an owner.
 */
export async function checkVaultWithdrawableBalance(
  owner: Address,
  pool: Address,
  token: Address = SOMNIA_ADDRESSES.testUsdc,
): Promise<bigint> {
  try {
    const balance = await publicClient.readContract({
      address: pool,
      abi: SPOT_POOL_ABI,
      functionName: 'getWithdrawableBalance',
      args: [owner, token],
    });
    return balance;
  } catch (err: any) {
    console.warn(`[checkVaultWithdrawableBalance] Check notice:`, err.message);
    return 0n;
  }
}

