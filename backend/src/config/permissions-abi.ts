import {
  type Address,
  type Hex,
  verifyTypedData,
  parseUnits,
  formatUnits,
} from 'viem';
import { SOMNIA_ADDRESSES } from './somnia.js';

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
    name: 'isOperatorAuthorized',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
      { name: 'selector', type: 'bytes4' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/**
 * Permitted operator function selectors on DreamDEX Event Contracts CLOB.
 */
export const OPERATOR_SELECTORS = {
  placeOrderFor: '0x80054449' as Hex,
  cancelOrderFor: '0xe37b444b' as Hex,
  reduceOrderFor: '0x364c2587' as Hex,
} as const;

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
