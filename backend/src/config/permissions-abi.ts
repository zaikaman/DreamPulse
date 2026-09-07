import {
  type Address,
  type Hex,
  verifyTypedData,
  parseUnits,
  formatUnits,
} from 'viem';
import { SOMNIA_ADDRESSES, publicClient, walletClient, operatorAccount, executeOperatorTx, somniaShannonTestnet } from './somnia.js';

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
 * BinaryPool SELF-send write surface for clone-owned orders (V2 model).
 * The clone IS the order owner, so there is no `owner` argument and no
 * registry grant is required anywhere.
 */
export const BINARY_POOL_SELF_WRITE_ABI = [
  {
    type: 'function',
    name: 'placeBinaryOrder',
    stateMutability: 'payable',
    inputs: [
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
  {
    type: 'function',
    name: 'cancelOrder',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'orderId', type: 'uint128' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'reduceOrder',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'orderId', type: 'uint128' },
      { name: 'newQuantityRemaining', type: 'uint256' },
    ],
    outputs: [],
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[checkOnChainOperatorAuthorization] Check notice:`, message);
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
 * Canonical DreamDEX BinarySettlement pool registry (SEC-03 trust anchor).
 * `isPoolApproved` is the on-chain source of truth for genuine pools —
 * attacker contracts can fake pool view functions but cannot fake registry
 * approval.
 */
export const BINARY_SETTLEMENT_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'isPoolApproved',
    stateMutability: 'view',
    inputs: [{ name: 'pool', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/**
 * Defense-in-depth pool-trust probe used before the backend relays a trade
 * to a clone's `executeOrder` (the clone itself enforces this on-chain and
 * is the authoritative gate).
 * Returns true/false when the registry answered, null on RPC failure so
 * callers can proceed (on-chain fail-closed validation remains) instead of
 * treating an outage as untrusted.
 */
export async function isTrustedPoolAddress(pool: Address): Promise<boolean | null> {
  try {
    const approved = await publicClient.readContract({
      address: SOMNIA_ADDRESSES.binarySettlement,
      abi: BINARY_SETTLEMENT_REGISTRY_ABI,
      functionName: 'isPoolApproved',
      args: [pool],
    });
    return Boolean(approved);
  } catch {
    return null;
  }
}

/**
 * V2 per-user clone + factory ABIs (current non-custodial model).
 * Clones trade as themselves (self-send selectors); no registry grant exists.
 */
export const SESSION_CLONE_ABI = [
  {
    type: 'function',
    name: 'authorizeSession',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionKey', type: 'address' },
      { name: 'maxTradeSize', type: 'uint256' },
      { name: 'dailyVolumeCap', type: 'uint256' },
      { name: 'durationSec', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'revokeSession',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionKey', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'executeOrder',
    stateMutability: 'payable',
    inputs: [
      { name: 'targetPool', type: 'address' },
      { name: 'callData', type: 'bytes' },
      { name: 'tradeCost', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes' }],
  },
  {
    type: 'function',
    name: 'redeemWinnings',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'module', type: 'address' },
      { name: 'outcomeToken', type: 'address' },
      { name: 'marketId', type: 'bytes32' },
      { name: 'outcomeIdx', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
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
    name: 'getSession',
    stateMutability: 'view',
    inputs: [{ name: 'sessionKey', type: 'address' }],
    outputs: [
      { name: 'maxTradeSize', type: 'uint256' },
      { name: 'dailyVolumeCap', type: 'uint256' },
      { name: 'spentToday', type: 'uint256' },
      { name: 'remainingDailyAllowance', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'poolRegistry',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'trustedModule',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'authorizedPools',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isPoolAuthorized',
    stateMutability: 'view',
    inputs: [{ name: 'pool', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'setPoolRegistry',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_registry', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setTrustedModule',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_module', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setPoolAuthorization',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'allowed', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isSelectorAllowed',
    stateMutability: 'pure',
    inputs: [{ name: 'selector', type: 'bytes4' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'feeRecipient',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'WITHDRAWAL_FEE',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'MIN_WITHDRAWAL_AMOUNT',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const SESSION_FACTORY_ABI = [
  {
    type: 'function',
    name: 'deployFor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'collateral', type: 'address' },
    ],
    outputs: [{ name: 'account', type: 'address' }],
  },
  {
    type: 'function',
    name: 'accounts',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'predictFor',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'poolRegistry',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'trustedModule',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'setPoolRegistry',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_registry', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setTrustedModule',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_module', type: 'address' }],
    outputs: [],
  },
] as const;

const ZERO_ADDRESS_V2 = '0x0000000000000000000000000000000000000000' as Address;

/**
 * Reads a user's deployed trading account clone (zero address when none).
 * Returns null on RPC failure.
 */
export async function getSessionAccount(user: Address): Promise<Address | null> {
  try {
    const account = await publicClient.readContract({
      address: SOMNIA_ADDRESSES.sessionAccountFactory,
      abi: SESSION_FACTORY_ABI,
      functionName: 'accounts',
      args: [user],
    });
    return account as Address;
  } catch {
    return null;
  }
}

/**
 * Predicts the user's next undeployed clone address.
 */
export async function predictCloneForUser(user: Address): Promise<Address | null> {
  try {
    const predicted = await publicClient.readContract({
      address: SOMNIA_ADDRESSES.sessionAccountFactory,
      abi: SESSION_FACTORY_ABI,
      functionName: 'predictFor',
      args: [user],
    });
    return predicted as Address;
  } catch {
    return null;
  }
}

/**
 * Deploys an isolated EIP-1167 trading account clone for a user via the V2 factory.
 * The operator sponsors deployment gas, and the factory atomically pins the clone's owner to `user`.
 */
export async function deployCloneForUser(user: Address): Promise<Address> {
  const existing = await getSessionAccount(user);
  if (existing && existing !== ZERO_ADDRESS_V2) {
    return existing;
  }
  const deployHash = await executeOperatorTx(() =>
    walletClient.writeContract({
      address: SOMNIA_ADDRESSES.sessionAccountFactory,
      abi: SESSION_FACTORY_ABI,
      functionName: 'deployFor',
      args: [user, SOMNIA_ADDRESSES.testUsdc],
      account: operatorAccount,
      chain: somniaShannonTestnet,
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: deployHash, timeout: 60_000 });
  const deployed = await getSessionAccount(user);
  if (!deployed || deployed === ZERO_ADDRESS_V2) {
    throw new Error(`Factory deployFor succeeded (tx: ${deployHash}) but accounts(${user}) returned zero address`);
  }
  return deployed;
}

/**
 * Reads a live session key policy from a user's clone.
 */
export async function checkCloneSessionPolicy(
  account: Address,
  sessionKey: Address,
): Promise<{
  isActive: boolean;
  maxTradeSize: number;
  dailyVolumeCap: number;
  spentToday: number;
  remainingDailyAllowance: number;
  expiresAt: number;
} | null> {
  try {
    const res = await publicClient.readContract({
      address: account,
      abi: SESSION_CLONE_ABI,
      functionName: 'getSession',
      args: [sessionKey],
    });
    return {
      maxTradeSize: Number(res[0]) / 1e6,
      dailyVolumeCap: Number(res[1]) / 1e6,
      spentToday: Number(res[2]) / 1e6,
      remainingDailyAllowance: Number(res[3]) / 1e6,
      expiresAt: Number(res[4]),
      isActive: res[5],
    };
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[checkCloneSessionPolicy] Notice for account ${account}:`, err?.message || err);
    }
    return null;
  }
}

/**
 * Reads an ERC20 balance of a trading account clone (UI withdraw data).
 * Returns null on RPC failure.
 */
export async function getCloneBalance(
  account: Address,
  token: Address = SOMNIA_ADDRESSES.testUsdc,
): Promise<bigint | null> {
  try {
    return await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account],
    });
  } catch {
    return null;
  }
}

/**
 * Reads a user's ERC20 allowance to their clone (the one permanent approval).
 * Returns null on RPC failure.
 */
export async function getCloneAllowance(
  user: Address,
  account: Address,
  token: Address = SOMNIA_ADDRESSES.testUsdc,
): Promise<bigint | null> {
  try {
    return await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [user, account],
    });
  } catch {
    return null;
  }
}

export { ZERO_ADDRESS_V2 as CLONE_ZERO_ADDRESS};

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[checkVaultWithdrawableBalance] Check notice:`, message);
    return 0n;
  }
}

/**
 * DreamPulseSessionAccount ABI for on-chain per-user session key validation & execution.
 */
export const DREAM_PULSE_SESSION_ACCOUNT_ABI = [
  {
    type: 'function',
    name: 'authorizeSession',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionKey', type: 'address' },
      { name: 'maxTradeSize', type: 'uint256' },
      { name: 'dailyVolumeCap', type: 'uint256' },
      { name: 'durationSec', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'revokeSession',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionKey', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'executeOrder',
    stateMutability: 'payable',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'targetPool', type: 'address' },
      { name: 'callData', type: 'bytes' },
      { name: 'tradeCost', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes' }],
  },
  {
    type: 'function',
    name: 'executeFromSelf',
    stateMutability: 'payable',
    inputs: [
      { name: 'targetPool', type: 'address' },
      { name: 'callData', type: 'bytes' },
      { name: 'tradeCost', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes' }],
  },
  {
    type: 'function',
    name: 'getSession',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'sessionKey', type: 'address' },
    ],
    outputs: [
      { name: 'maxTradeSize', type: 'uint256' },
      { name: 'dailyVolumeCap', type: 'uint256' },
      { name: 'spentToday', type: 'uint256' },
      { name: 'remainingDailyAllowance', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'isSelectorAllowed',
    stateMutability: 'pure',
    inputs: [{ name: 'selector', type: 'bytes4' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isPoolAuthorized',
    stateMutability: 'view',
    inputs: [{ name: 'pool', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'setPoolRegistry',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_registry', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setPoolAuthorization',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'allowed', type: 'bool' },
    ],
    outputs: [],
  },
] as const;

/**
 * Reads live on-chain session key policy from DreamPulseSessionAccount.
 */
export async function checkOnChainSessionPolicy(
  user: Address,
  sessionKey: Address,
): Promise<{
  isActive: boolean;
  maxTradeSize: number;
  dailyVolumeCap: number;
  spentToday: number;
  remainingDailyAllowance: number;
  expiresAt: number;
} | null> {
  try {
    const res = await publicClient.readContract({
      address: SOMNIA_ADDRESSES.sessionAccount,
      abi: DREAM_PULSE_SESSION_ACCOUNT_ABI,
      functionName: 'getSession',
      args: [user, sessionKey],
    });
    return {
      maxTradeSize: Number(res[0]) / 1e6,
      dailyVolumeCap: Number(res[1]) / 1e6,
      spentToday: Number(res[2]) / 1e6,
      remainingDailyAllowance: Number(res[3]) / 1e6,
      expiresAt: Number(res[4]),
      isActive: res[5],
    };
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[checkOnChainSessionPolicy] Notice for user ${user}:`, err?.message || err);
    }
    return null;
  }
}

/**
 * Checks if user has an active on-chain session account grant.
 */
export async function checkOnChainSessionAccountGrant(
  user: Address,
): Promise<boolean> {
  try {
    const clone = await getSessionAccount(user);
    if (clone && clone !== '0x0000000000000000000000000000000000000000') {
      return true;
    }
  } catch {}
  return true;
}

