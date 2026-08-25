import { describe, it, expect, beforeEach } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { parseUnits, type Hex } from 'viem';
import {
  SESSION_EIP712_DOMAIN,
  SESSION_EIP712_TYPES,
  verifySessionDelegationSignature,
  validateZeroCustodyInvariants,
  OPERATOR_SELECTORS,
} from '../src/config/permissions-abi.js';
import { SessionService } from '../src/services/session-service.js';
import { SOMNIA_ADDRESSES } from '../src/config/somnia.js';

describe('Task T037 & T040: Non-Custodial Session Permissions & EIP-712 Signatures', () => {
  const testAccount = privateKeyToAccount(generatePrivateKey());
  const operatorAccount = privateKeyToAccount(generatePrivateKey());

  it('validates Somnia EIP-712 domain and selectors correctly', () => {
    expect(SESSION_EIP712_DOMAIN.chainId).toBe(50312);
    expect(SESSION_EIP712_DOMAIN.verifyingContract).toBe(SOMNIA_ADDRESSES.operatorPermissionsRegistry);
    expect(OPERATOR_SELECTORS.placeOrderFor).toBe('0x80054449');
    expect(OPERATOR_SELECTORS.cancelOrderFor).toBe('0xe37b444b');
  });

  it('enforces strict Zero-Custody Invariants', () => {
    const validActions = ['placeOrderFor', 'cancelOrderFor', 'reduceOrderFor'];
    const validCheck = validateZeroCustodyInvariants(validActions);
    expect(validCheck.valid).toBe(true);
    expect(validCheck.rejectedActions.length).toBe(0);

    const maliciousActions = ['placeOrderFor', 'withdraw', 'transferFrom', 'setApprovalForAll'];
    const invalidCheck = validateZeroCustodyInvariants(maliciousActions);
    expect(invalidCheck.valid).toBe(false);
    expect(invalidCheck.rejectedActions).toContain('withdraw');
    expect(invalidCheck.rejectedActions).toContain('transferFrom');
    expect(invalidCheck.rejectedActions).toContain('setApprovalForAll');
  });

  it('verifies valid EIP-712 typed delegation signatures', async () => {
    const maxTradeSize = 10;
    const dailyVolumeCap = 100;
    const nonce = 0;
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    const signature = await testAccount.signTypedData({
      domain: SESSION_EIP712_DOMAIN,
      types: SESSION_EIP712_TYPES,
      primaryType: 'SessionDelegation',
      message: {
        delegator: testAccount.address,
        operator: operatorAccount.address,
        maxTradeSize: parseUnits(maxTradeSize.toString(), 18),
        dailyVolumeCap: parseUnits(dailyVolumeCap.toString(), 18),
        nonce: BigInt(nonce),
        deadline: BigInt(deadline),
      },
    });

    const isValid = await verifySessionDelegationSignature({
      delegator: testAccount.address,
      operator: operatorAccount.address,
      maxTradeSize,
      dailyVolumeCap,
      nonce,
      deadline,
      signature: signature as Hex,
    });

    expect(isValid).toBe(true);
  });

  it('rejects tampered EIP-712 typed delegation signatures', async () => {
    const maxTradeSize = 10;
    const dailyVolumeCap = 100;
    const nonce = 0;
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    const signature = await testAccount.signTypedData({
      domain: SESSION_EIP712_DOMAIN,
      types: SESSION_EIP712_TYPES,
      primaryType: 'SessionDelegation',
      message: {
        delegator: testAccount.address,
        operator: operatorAccount.address,
        maxTradeSize: parseUnits(maxTradeSize.toString(), 18),
        dailyVolumeCap: parseUnits(dailyVolumeCap.toString(), 18),
        nonce: BigInt(nonce),
        deadline: BigInt(deadline),
      },
    });

    // Tamper with maxTradeSize in verification
    const isValid = await verifySessionDelegationSignature({
      delegator: testAccount.address,
      operator: operatorAccount.address,
      maxTradeSize: 50, // tampered!
      dailyVolumeCap,
      nonce,
      deadline,
      signature: signature as Hex,
    });

    expect(isValid).toBe(false);
  });
});

describe('Task T038 & T040: Session Management Service & Risk Guardrails', () => {
  let sessionService: SessionService;
  const operator = SOMNIA_ADDRESSES.operatorPermissionsRegistry;

  beforeEach(() => {
    sessionService = new SessionService();
  });

  it('registers a session with valid risk limits and retrieves it', async () => {
    const user = privateKeyToAccount(generatePrivateKey());
    const session = await sessionService.registerSession({
      userAddress: user.address,
      operatorAddress: operator,
      maxTradeSize: 10,
      dailyVolumeCap: 50,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    expect(session).toBeDefined();
    expect(session.userAddress.toLowerCase()).toBe(user.address.toLowerCase());
    expect(session.maxTradeSize).toBe(10);
    expect(session.dailyVolumeCap).toBe(50);
    expect(session.isActive).toBe(true);

    const activeSession = await sessionService.getUserActiveSession(user.address);
    expect(activeSession?.id).toBe(session.id);
  });

  it('rejects invalid session registration parameters', async () => {
    const user = privateKeyToAccount(generatePrivateKey());
    // Invalid address
    await expect(
      sessionService.registerSession({
        userAddress: 'not-an-address',
        maxTradeSize: 10,
        dailyVolumeCap: 50,
      })
    ).rejects.toThrow('Invalid userAddress');

    // dailyVolumeCap < maxTradeSize
    await expect(
      sessionService.registerSession({
        userAddress: user.address,
        maxTradeSize: 20,
        dailyVolumeCap: 10,
      })
    ).rejects.toThrow('Invalid dailyVolumeCap');

    // Prohibited selector
    await expect(
      sessionService.registerSession({
        userAddress: user.address,
        maxTradeSize: 10,
        dailyVolumeCap: 50,
        permissions: ['placeOrderFor', 'withdraw'],
      })
    ).rejects.toThrow('Prohibited non-custodial operations');
  });

  it('enforces single trade size cap guardrail', async () => {
    const user = privateKeyToAccount(generatePrivateKey());
    const session = await sessionService.registerSession({
      userAddress: user.address,
      operatorAddress: operator,
      maxTradeSize: 10,
      dailyVolumeCap: 100,
    });

    // Trade within limit
    const allowed = sessionService.validateTradeAllowance(session.id, 8.5);
    expect(allowed.allowed).toBe(true);

    // Trade exceeding single limit
    const rejected = sessionService.validateTradeAllowance(session.id, 10.5);
    expect(rejected.allowed).toBe(false);
    expect(rejected.reason).toContain('exceeds maximum trade size limit');
  });

  it('enforces cumulative daily volume cap guardrail', async () => {
    const user = privateKeyToAccount(generatePrivateKey());
    const session = await sessionService.registerSession({
      userAddress: user.address,
      operatorAddress: operator,
      maxTradeSize: 20,
      dailyVolumeCap: 50,
    });

    // Execute first trade: 20 STT
    expect(sessionService.validateTradeAllowance(session.id, 20).allowed).toBe(true);
    await sessionService.recordTradeSpend(session.id, 20);

    // Execute second trade: 20 STT (Total 40 STT)
    expect(sessionService.validateTradeAllowance(session.id, 20).allowed).toBe(true);
    await sessionService.recordTradeSpend(session.id, 20);

    // Third trade of 15 STT would push total to 55 STT > 50 STT cap
    const rejected = sessionService.validateTradeAllowance(session.id, 15);
    expect(rejected.allowed).toBe(false);
    expect(rejected.reason).toContain('exceeds remaining daily volume cap');

    // But smaller trade of 10 STT should be allowed (Total exactly 50 STT)
    const allowed = sessionService.validateTradeAllowance(session.id, 10);
    expect(allowed.allowed).toBe(true);
  });

  it('handles expired sessions and rejects execution', async () => {
    const user = privateKeyToAccount(generatePrivateKey());
    const pastDate = new Date(Date.now() - 10000).toISOString();
    const session = await sessionService.registerSession({
      userAddress: user.address,
      operatorAddress: operator,
      maxTradeSize: 10,
      dailyVolumeCap: 50,
      expiresAt: pastDate,
    });

    const activeSession = await sessionService.getUserActiveSession(user.address);
    expect(activeSession).toBeNull();

    const check = sessionService.validateTradeAllowance(session.id, 5);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('expired');
  });

  it('supports instant session revocation', async () => {
    const user = privateKeyToAccount(generatePrivateKey());
    const session = await sessionService.registerSession({
      userAddress: user.address,
      operatorAddress: operator,
      maxTradeSize: 10,
      dailyVolumeCap: 50,
    });

    expect(sessionService.validateTradeAllowance(session.id, 5).allowed).toBe(true);

    // Revoke
    const revoked = await sessionService.revokeSession(session.id);
    expect(revoked).toBe(true);

    const activeSession = await sessionService.getUserActiveSession(user.address);
    expect(activeSession).toBeNull();

    const check = sessionService.validateTradeAllowance(session.id, 5);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('inactive or revoked');
  });

  it('maintains strict isolation between different user addresses', async () => {
    const user1 = privateKeyToAccount(generatePrivateKey());
    const user2 = privateKeyToAccount(generatePrivateKey());

    const sessionUser1 = await sessionService.registerSession({
      userAddress: user1.address,
      maxTradeSize: 10,
      dailyVolumeCap: 20,
    });

    const sessionUser2 = await sessionService.registerSession({
      userAddress: user2.address,
      maxTradeSize: 100,
      dailyVolumeCap: 500,
    });

    // Spend out User 1's budget
    await sessionService.recordTradeSpend(sessionUser1.id, 20);
    expect(sessionService.validateTradeAllowance(sessionUser1.id, 5).allowed).toBe(false);

    // User 2's session remains unaffected
    expect(sessionService.validateTradeAllowance(sessionUser2.id, 50).allowed).toBe(true);
  });

  it('records on-chain transaction hash and vault deposit parameters', async () => {
    const user = privateKeyToAccount(generatePrivateKey());
    const mockTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const mockPool = SOMNIA_ADDRESSES.binaryModule;

    const session = await sessionService.registerSession({
      userAddress: user.address,
      operatorAddress: operator,
      maxTradeSize: 15,
      dailyVolumeCap: 150,
      onChainTxHash: mockTxHash,
      vaultDepositAmount: 25,
      targetPoolAddress: mockPool,
      onChainAuthorized: true,
    });

    expect(session).toBeDefined();
    expect(session.onChainTxHash).toBe(mockTxHash);
    expect(session.vaultDepositAmount).toBe(25);
    expect(session.targetPoolAddress?.toLowerCase()).toBe(mockPool.toLowerCase());
    expect(session.onChainAuthorized).toBe(true);

    const activeSession = await sessionService.getUserActiveSession(user.address);
    expect(activeSession?.onChainTxHash).toBe(mockTxHash);
    expect(activeSession?.vaultDepositAmount).toBe(25);
    expect(activeSession?.targetPoolAddress?.toLowerCase()).toBe(mockPool.toLowerCase());
  });
});

