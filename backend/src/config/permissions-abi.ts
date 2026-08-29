import {
  type Address,
  type Hex,
  verifyTypedData,
  parseUnits,
  formatUnits,
} from 'viem';
import { SOMNIA_ADDRESSES, publicClient } from './somnia.js';

/**
 * Canonical tUSDC collateral decimals (Somnia TestUSDC = 6 decimals).
 * Single source of truth — must match SOMNIA_ADDRESSES.decimals and on-chain ERC20 decimals.
 * Used for EIP-712 SessionDelegation cap encoding (maxTradeSize / dailyVolumeCap).
 */
export const COLLATERAL_DECIMALS = SOMNIA_ADDRESSES.decimals; // 6
/** Legacy decimals used before fix — kept for backward-compat verification only. */
const LEGACY_COLLATERAL_DECIMALS = 18;

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
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'transferFrom',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
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
 * Canonical helper: convert a human-readable cap amount to raw on-chain units.
 * - `bigint` values are already raw (e.g., 10_000_000n for 10 tUSDC) and returned as-is.
 * - `number | string` values are human amounts (e.g., 10, "10.5") and are parsed with the
 *   provided decimals (default: COLLATERAL_DECIMALS = 6 for tUSDC).
 * Handles exponential notation (e.g., 1e-7) by normalizing via toFixed before parseUnits.
 */
export function toCapUnits(
  value: number | bigint | string,
  decimals: number = COLLATERAL_DECIMALS,
): bigint {
  if (typeof value === 'bigint') return value;
  const str = typeof value === 'string' ? value.trim() : String(value);
  if (str === '' || str.toLowerCase() === 'nan') throw new Error(`Invalid cap value: ${String(value)}`);
  // Normalize exponential notation to fixed-point decimal string to satisfy parseUnits
  const normalized = str.includes('e') || str.includes('E')
    ? Number(str).toFixed(decimals)
    : str;
  return parseUnits(normalized, decimals);
}

/**
 * Verify an EIP-712 typed signature for non-custodial session delegation.
 * Caps are tUSDC amounts encoded with COLLATERAL_DECIMALS (6) — NOT 18.
 * Production-ready: accepts human-readable (number/string) or raw bigint, and
 * includes a legacy 18-decimal fallback for zero-downtime migration from the
 * previous buggy implementation (logs a warning when fallback succeeds).
 */
export async function verifySessionDelegationSignature(params: {
  delegator: Address;
  operator: Address;
  maxTradeSize: number | bigint | string;
  dailyVolumeCap: number | bigint | string;
  nonce: number | bigint | string;
  deadline: number | bigint | string;
  signature: Hex;
}): Promise<boolean> {
  const toBigInt = (v: number | bigint | string): bigint => {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'string') {
      const s = v.trim();
      // Hex strings not expected for nonce/deadline; treat as decimal if parseable
      if (/^0x/i.test(s)) return BigInt(s);
      return BigInt(s);
    }
    return BigInt(v);
  };

  let nonce: bigint;
  let deadline: bigint;
  try {
    nonce = toBigInt(params.nonce);
    deadline = toBigInt(params.deadline);
  } catch (err) {
    console.error('[SessionSignature] Invalid nonce/deadline:', err);
    return false;
  }

  const isRawBigInt = typeof params.maxTradeSize === 'bigint' && typeof params.dailyVolumeCap === 'bigint';

  // Fast path: both caps already raw bigint — verify directly without decimal ambiguity
  if (isRawBigInt) {
    try {
      return await verifyTypedData({
        address: params.delegator,
        domain: SESSION_EIP712_DOMAIN,
        types: SESSION_EIP712_TYPES,
        primaryType: 'SessionDelegation',
        message: {
          delegator: params.delegator,
          operator: params.operator,
          maxTradeSize: params.maxTradeSize as bigint,
          dailyVolumeCap: params.dailyVolumeCap as bigint,
          nonce,
          deadline,
        },
        signature: params.signature,
      });
    } catch (err) {
      console.error('[SessionSignature] Verification error (raw bigint):', err);
      return false;
    }
  }

  // Primary: canonical tUSDC 6-decimal encoding
  try {
    const maxTradeSize = toCapUnits(params.maxTradeSize as number | string | bigint, COLLATERAL_DECIMALS);
    const dailyVolumeCap = toCapUnits(params.dailyVolumeCap as number | string | bigint, COLLATERAL_DECIMALS);

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

    if (isValid) return true;
  } catch (err) {
    // parseUnits may throw for excessive fraction digits — log and fall through to legacy check
    console.warn('[SessionSignature] Canonical 6-decimal verification branch failed:', (err as Error)?.message || err);
  }

  // Fallback: legacy 18-decimal encoding (pre-fix clients). Keeps existing sessions alive during rollout.
  // This path is deprecated and will be removed after all clients migrate to 6-decimal signing.
  try {
    const maxTradeSizeLegacy = toCapUnits(params.maxTradeSize as number | string | bigint, LEGACY_COLLATERAL_DECIMALS);
    const dailyVolumeCapLegacy = toCapUnits(params.dailyVolumeCap as number | string | bigint, LEGACY_COLLATERAL_DECIMALS);

    const isValidLegacy = await verifyTypedData({
      address: params.delegator,
      domain: SESSION_EIP712_DOMAIN,
      types: SESSION_EIP712_TYPES,
      primaryType: 'SessionDelegation',
      message: {
        delegator: params.delegator,
        operator: params.operator,
        maxTradeSize: maxTradeSizeLegacy,
        dailyVolumeCap: dailyVolumeCapLegacy,
        nonce,
        deadline,
      },
      signature: params.signature,
    });

    if (isValidLegacy) {
      console.warn(
        '[SessionSignature] Verified via legacy 18-decimal fallback — client should upgrade to 6-decimal (tUSDC) signing. ' +
          `delegator=${params.delegator} maxTradeSize=${String(params.maxTradeSize)} dailyVolumeCap=${String(params.dailyVolumeCap)}`,
      );
      return true;
    }
  } catch (err) {
    console.warn('[SessionSignature] Legacy 18-decimal fallback also failed:', (err as Error)?.message || err);
  }

  return false;
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

    // Check ERC20 operator allowance for TestUSDC (used for copy-trading relay)
    try {
      const allowance = await publicClient.readContract({
        address: SOMNIA_ADDRESSES.testUsdc,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [owner, operator],
      });
      if (allowance >= 100_000n) {
        return mark(true);
      }
    } catch {}

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

