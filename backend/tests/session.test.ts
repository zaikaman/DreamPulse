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
import { SOMNIA_ADDRESSES, operatorAccount as liveOperator } from '../src/config/somnia.js';

describe('Task T037 & T040: Non-Custodial Session Permissions & EIP-712 Signatures', () => {
  const testAccount = privateKeyToAccount(generatePrivateKey());
  const operatorAccount = privateKeyToAccount(generatePrivateKey());

  it('validates Somnia EIP-712 domain and selectors correctly', () => {
    expect(SESSION_EIP712_DOMAIN.chainId).toBe(50312);
    expect(SESSION_EIP712_DOMAIN.verifyingContract).toBe(SOMNIA_ADDRESSES.operatorPermissionsRegistry);
    expect(OPERATOR_SELECTORS.placeOrderFor).toBe('0x80054449');
    expect(OPERATOR_SELECTORS.placeBinaryOrderFor).toBe('0x5d97c566');
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

    // Execute first trade: 20 tUSDC
    expect(sessionService.validateTradeAllowance(session.id, 20).allowed).toBe(true);
    await sessionService.recordTradeSpend(session.id, 20);

    // Execute second trade: 20 tUSDC (Total 40 tUSDC)
    expect(sessionService.validateTradeAllowance(session.id, 20).allowed).toBe(true);
    await sessionService.recordTradeSpend(session.id, 20);

    // Third trade of 15 tUSDC would push total to 55 tUSDC > 50 tUSDC cap
    const rejected = sessionService.validateTradeAllowance(session.id, 15);
    expect(rejected.allowed).toBe(false);
    expect(rejected.reason).toContain('exceeds remaining daily volume cap');

    // But smaller trade of 10 tUSDC should be allowed (Total exactly 50 tUSDC)
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

  it('excludes unauthorized, disabled copy-trade, and mismatched-operator sessions from copy-trade targets', async () => {
    const unauthorized = privateKeyToAccount(generatePrivateKey());
    const authorized = privateKeyToAccount(generatePrivateKey());
    const disabledCopy = privateKeyToAccount(generatePrivateKey());
    const wrongOperator = privateKeyToAccount(generatePrivateKey());

    await sessionService.registerSession({
      userAddress: unauthorized.address,
      operatorAddress: liveOperator.address,
      maxTradeSize: 10,
      dailyVolumeCap: 50,
    });

    await sessionService.registerSession({
      userAddress: authorized.address,
      operatorAddress: liveOperator.address,
      maxTradeSize: 10,
      dailyVolumeCap: 50,
      onChainTxHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      onChainAuthorized: true,
      copyTradeEnabled: true,
    });

    await sessionService.registerSession({
      userAddress: disabledCopy.address,
      operatorAddress: liveOperator.address,
      maxTradeSize: 10,
      dailyVolumeCap: 50,
      onChainAuthorized: true,
      onChainTxHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      copyTradeEnabled: false,
    });

    await sessionService.registerSession({
      userAddress: wrongOperator.address,
      operatorAddress: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
      maxTradeSize: 10,
      dailyVolumeCap: 50,
      onChainAuthorized: true,
      onChainTxHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      copyTradeEnabled: true,
    });

    const targets = sessionService.getDelegatedCopyTradeSessions(liveOperator.address);
    expect(targets.some((s) => s.userAddress.toLowerCase() === authorized.address.toLowerCase())).toBe(true);
    expect(targets.some((s) => s.userAddress.toLowerCase() === unauthorized.address.toLowerCase())).toBe(false);
    expect(targets.some((s) => s.userAddress.toLowerCase() === disabledCopy.address.toLowerCase())).toBe(false);
    expect(targets.some((s) => s.userAddress.toLowerCase() === wrongOperator.address.toLowerCase())).toBe(false);
  });

  it('decouples session delegation from copy-trading: allows active session while excluding from swarm copy-trades when copyTradeEnabled is false', async () => {
    const copilotOnlyUser = privateKeyToAccount(generatePrivateKey());

    // User delegates session without opting into copy-trading (copyTradeEnabled: false)
    const session = await sessionService.registerSession({
      userAddress: copilotOnlyUser.address,
      operatorAddress: liveOperator.address,
      maxTradeSize: 20,
      dailyVolumeCap: 100,
      onChainTxHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      onChainAuthorized: true,
      copyTradeEnabled: false,
    });

    expect(session.isActive).toBe(true);
    expect(session.copyTradeEnabled).toBe(false);

    // Active session is queryable for AI Copilot terminal trades
    const retrieved = await sessionService.getUserActiveSession(copilotOnlyUser.address);
    expect(retrieved?.isActive).toBe(true);
    expect(retrieved?.copyTradeEnabled).toBe(false);

    // Trade allowance passes for 1-click execution under limits
    const allowance = sessionService.validateTradeAllowance(session.id, 15);
    expect(allowance.allowed).toBe(true);

    // BUT background swarm copy-trade target list excludes this user
    const copyTargets = sessionService.getDelegatedCopyTradeSessions(liveOperator.address);
    expect(copyTargets.some((s) => s.userAddress.toLowerCase() === copilotOnlyUser.address.toLowerCase())).toBe(false);
  });

  it('supports unlimited and high-cap session delegation (unlimited time, maxTradeSize, dailyVolumeCap)', async () => {
    const user = privateKeyToAccount(generatePrivateKey());
    const UNLIMITED_VAL = 1_000_000_000;
    const perpetualExpiry = new Date(Date.now() + 100 * 365 * 24 * 3600 * 1000).toISOString();

    const session = await sessionService.registerSession({
      userAddress: user.address,
      operatorAddress: liveOperator.address,
      maxTradeSize: UNLIMITED_VAL,
      dailyVolumeCap: UNLIMITED_VAL,
      expiresAt: perpetualExpiry,
      onChainAuthorized: true,
      copyTradeEnabled: true,
    });

    expect(session.isActive).toBe(true);
    expect(session.maxTradeSize).toBe(UNLIMITED_VAL);
    expect(session.dailyVolumeCap).toBe(UNLIMITED_VAL);
    expect(session.expiresAt).toBe(perpetualExpiry);

    // Any large trade is permitted under unlimited bounds
    const check1 = sessionService.validateTradeAllowance(session.id, 50_000);
    expect(check1.allowed).toBe(true);

    const check2 = sessionService.validateTradeAllowance(session.id, 500_000);
    expect(check2.allowed).toBe(true);

    // Record huge spend
    await sessionService.recordTradeSpend(session.id, 500_000);
    expect(session.spentToday).toBe(500_000);

    // Subsequent huge trade is still allowed under unlimited daily volume
    const check3 = sessionService.validateTradeAllowance(session.id, 250_000);
    expect(check3.allowed).toBe(true);
  });

  it('rejects fake/unverified onChainTxHash without valid on-chain authorization', async () => {
    const user = privateKeyToAccount(generatePrivateKey());
    const fakeTxHash = '0xdeadbeef'; // Invalid length/format

    const session = await sessionService.registerSession({
      userAddress: user.address,
      operatorAddress: liveOperator.address,
      maxTradeSize: 10,
      dailyVolumeCap: 100,
      onChainTxHash: fakeTxHash,
      // onChainAuthorized omitted / false
    });

    expect(session.isActive).toBe(true);
    expect(session.onChainAuthorized).toBe(false);
  });
});


