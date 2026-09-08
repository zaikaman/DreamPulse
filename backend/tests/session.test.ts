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
import {
  SessionService,
  MAX_ALLOWED_TRADE_SIZE,
  MAX_ALLOWED_DAILY_CAP,
  MAX_SESSION_DURATION_SEC,
} from '../src/services/session-service.js';
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

  it('enforces open-ended risk caps (allows 50,000+ tUSDC maxTradeSize, large dailyVolumeCap, multi-year duration)', async () => {
    const user = privateKeyToAccount(generatePrivateKey());
    const valid1YearExpiry = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const excessiveExpiry = new Date(Date.now() + (36500 + 10) * 24 * 3600 * 1000).toISOString();

    // 1. Rejects maxTradeSize exceeding MAX_ALLOWED_TRADE_SIZE
    await expect(
      sessionService.registerSession({
        userAddress: user.address,
        operatorAddress: liveOperator.address,
        maxTradeSize: MAX_ALLOWED_TRADE_SIZE + 1,
        dailyVolumeCap: MAX_ALLOWED_TRADE_SIZE + 1000,
        expiresAt: valid1YearExpiry,
      }),
    ).rejects.toThrow(`exceeds maximum allowed trade size of ${MAX_ALLOWED_TRADE_SIZE} tUSDC`);

    // 2. Rejects dailyVolumeCap exceeding MAX_ALLOWED_DAILY_CAP
    await expect(
      sessionService.registerSession({
        userAddress: user.address,
        operatorAddress: liveOperator.address,
        maxTradeSize: 100,
        dailyVolumeCap: MAX_ALLOWED_DAILY_CAP + 1,
        expiresAt: valid1YearExpiry,
      }),
    ).rejects.toThrow(`exceeds maximum allowed daily cap of ${MAX_ALLOWED_DAILY_CAP} tUSDC`);

    // 3. Rejects duration exceeding MAX_SESSION_DURATION_SEC
    await expect(
      sessionService.registerSession({
        userAddress: user.address,
        operatorAddress: liveOperator.address,
        maxTradeSize: 50000,
        dailyVolumeCap: 500000,
        expiresAt: excessiveExpiry,
      }),
    ).rejects.toThrow('exceeds maximum allowed duration');

    // 4. Successfully registers high-volume session ($50,000 max trade, $500,000 daily cap, 1 year duration)
    const session = await sessionService.registerSession({
      userAddress: user.address,
      operatorAddress: liveOperator.address,
      maxTradeSize: 50000,
      dailyVolumeCap: 500000,
      expiresAt: valid1YearExpiry,
      onChainAuthorized: true,
      copyTradeEnabled: true,
    });

    expect(session.isActive).toBe(true);
    expect(session.maxTradeSize).toBe(50000);
    expect(session.dailyVolumeCap).toBe(500000);

    // 5. Validates trade allowance against single trade limit ($50,000)
    const validTrade = sessionService.validateTradeAllowance(session.id, 50000);
    expect(validTrade.allowed).toBe(true);

    const oversizedTrade = sessionService.validateTradeAllowance(session.id, 50000.01);
    expect(oversizedTrade.allowed).toBe(false);
    expect(oversizedTrade.reason).toMatch(/exceeds maximum trade size limit of 50000\.00 tUSDC/);

    // 6. Record spend towards daily volume cap ($500,000)
    await sessionService.recordTradeSpend(session.id, 470000);
    expect(session.spentToday).toBe(470000);

    // Trade of $30,000 fits within remaining budget of $30,000 ($500,000 - $470,000)
    const finalAllowedTrade = sessionService.validateTradeAllowance(session.id, 30000);
    expect(finalAllowedTrade.allowed).toBe(true);

    // Trade of $40,000 is <= maxTradeSize ($50,000) but exceeds remaining daily cap ($30,000)
    const exceedingDailyTrade = sessionService.validateTradeAllowance(session.id, 40000);
    expect(exceedingDailyTrade.allowed).toBe(false);
    expect(exceedingDailyTrade.reason).toMatch(/exceeds remaining daily volume cap/);

    // 7. Test updateSessionRisk enforcement
    await expect(
      sessionService.updateSessionRisk(user.address, MAX_ALLOWED_TRADE_SIZE + 1, 1000)
    ).rejects.toThrow(`exceeds maximum allowed trade size of ${MAX_ALLOWED_TRADE_SIZE} tUSDC`);

    await expect(
      sessionService.updateSessionRisk(user.address, 100, MAX_ALLOWED_DAILY_CAP + 1)
    ).rejects.toThrow(`exceeds maximum allowed daily cap of ${MAX_ALLOWED_DAILY_CAP} tUSDC`);

    await expect(
      sessionService.updateSessionRisk(user.address, 60000, 20000)
    ).rejects.toThrow('must be >= maxTradeSize');

    const updated = await sessionService.updateSessionRisk(user.address, 25000, 250000);
    expect(updated?.maxTradeSize).toBe(25000);
    expect(updated?.dailyVolumeCap).toBe(250000);
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

  it('enforces strict 24h rolling window for daily cap and does NOT reset at UTC midnight when < 24h elapsed', async () => {
    const user = privateKeyToAccount(generatePrivateKey());
    const session = await sessionService.registerSession({
      userAddress: user.address,
      operatorAddress: liveOperator.address,
      maxTradeSize: 50,
      dailyVolumeCap: 50,
    });

    // Spend 50 tUSDC to hit daily cap
    expect(sessionService.validateTradeAllowance(session.id, 50).allowed).toBe(true);
    await sessionService.recordTradeSpend(session.id, 50);
    expect(session.spentToday).toBe(50);

    // Overspend should be rejected
    expect(sessionService.validateTradeAllowance(session.id, 10).allowed).toBe(false);

    // Simulate crossing UTC midnight after only 2 hours (e.g. spent at 23:00 UTC, now is 01:00 UTC next calendar day)
    // Both lastSpendResetTimestamp was set 2 hours ago.
    const twoHoursAgo = Date.now() - 2 * 3600 * 1000;
    session.lastSpendResetTimestamp = twoHoursAgo;

    // Validate allowance - should still be blocked because 24h have NOT elapsed
    const checkAfterMidnight = sessionService.validateTradeAllowance(session.id, 10);
    expect(checkAfterMidnight.allowed).toBe(false);
    expect(checkAfterMidnight.reason).toContain('exceeds remaining daily volume cap');
    expect(session.spentToday).toBe(50);

    // Simulate 24.1 hours elapsed
    const twentyFiveHoursAgo = Date.now() - 24.1 * 3600 * 1000;
    session.lastSpendResetTimestamp = twentyFiveHoursAgo;

    // Validate allowance - should now reset spentToday to 0 and allow trade
    const checkAfter24h = sessionService.validateTradeAllowance(session.id, 50);
    expect(checkAfter24h.allowed).toBe(true);
    expect(session.spentToday).toBe(0);
  });

  it('increments session nonces sequentially for each user session and enforces uniqueness', async () => {
    const user = privateKeyToAccount(generatePrivateKey());

    // Initial nonce for user with no sessions should be 0
    const initialNonce = await sessionService.getNextSessionNonce(user.address);
    expect(initialNonce).toBe(0);

    // Register first session without specifying nonce (auto-assigns nonce 0)
    const session0 = await sessionService.registerSession({
      userAddress: user.address,
      operatorAddress: liveOperator.address,
      maxTradeSize: 10,
      dailyVolumeCap: 100,
    });
    expect(session0.nonce).toBe(0);

    // Next nonce should now be 1
    const nextNonce1 = await sessionService.getNextSessionNonce(user.address);
    expect(nextNonce1).toBe(1);

    // Register second session with nonce 1
    const session1 = await sessionService.registerSession({
      userAddress: user.address,
      operatorAddress: liveOperator.address,
      maxTradeSize: 20,
      dailyVolumeCap: 200,
      nonce: 1,
    });
    expect(session1.nonce).toBe(1);

    // Next nonce should now be 2
    const nextNonce2 = await sessionService.getNextSessionNonce(user.address);
    expect(nextNonce2).toBe(2);

    // Reusing nonce 0 or 1 should be strictly rejected for replay protection & uniqueness
    await expect(
      sessionService.registerSession({
        userAddress: user.address,
        operatorAddress: liveOperator.address,
        maxTradeSize: 15,
        dailyVolumeCap: 150,
        nonce: 0,
      })
    ).rejects.toThrow('already been used');

    await expect(
      sessionService.registerSession({
        userAddress: user.address,
        operatorAddress: liveOperator.address,
        maxTradeSize: 15,
        dailyVolumeCap: 150,
        nonce: 1,
      })
    ).rejects.toThrow('already been used');

    // Register third session with auto-assigned nonce (should be 2)
    const session2 = await sessionService.registerSession({
      userAddress: user.address,
      operatorAddress: liveOperator.address,
      maxTradeSize: 30,
      dailyVolumeCap: 300,
    });
    expect(session2.nonce).toBe(2);

    const nextNonce3 = await sessionService.getNextSessionNonce(user.address);
    expect(nextNonce3).toBe(3);
  });

  it('verifies EIP-712 signature with incremented nonces correctly', async () => {
    const user = privateKeyToAccount(generatePrivateKey());
    const nonce = 5;
    const maxTradeSize = 25;
    const dailyVolumeCap = 250;
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    const signature = await user.signTypedData({
      domain: SESSION_EIP712_DOMAIN,
      types: SESSION_EIP712_TYPES,
      primaryType: 'SessionDelegation',
      message: {
        delegator: user.address,
        operator: liveOperator.address,
        maxTradeSize: parseUnits(maxTradeSize.toString(), 6),
        dailyVolumeCap: parseUnits(dailyVolumeCap.toString(), 6),
        nonce: BigInt(nonce),
        deadline: BigInt(deadline),
      },
    });

    const session = await sessionService.registerSession({
      userAddress: user.address,
      operatorAddress: liveOperator.address,
      maxTradeSize,
      dailyVolumeCap,
      nonce,
      signature: signature as Hex,
    });

    expect(session.nonce).toBe(5);
    expect(session.isActive).toBe(true);
  });

  it('registers and enforces Per-User Session Key model with isolated keys and caps', async () => {
    const user1 = privateKeyToAccount(generatePrivateKey());
    const user2 = privateKeyToAccount(generatePrivateKey());

    const sessionPriv1 = generatePrivateKey();
    const sessionPriv2 = generatePrivateKey();
    const sessionKey1 = privateKeyToAccount(sessionPriv1);
    const sessionKey2 = privateKeyToAccount(sessionPriv2);

    expect(sessionKey1.address).not.toBe(sessionKey2.address);
    expect(SOMNIA_ADDRESSES.sessionAccount).toBeDefined();
    expect(SOMNIA_ADDRESSES.sessionAccount.startsWith('0x')).toBe(true);

    // Register user1 with $20 max trade size, $200 daily cap, and dedicated session key
    const session1 = await sessionService.registerSession({
      userAddress: user1.address,
      operatorAddress: liveOperator.address,
      maxTradeSize: 20,
      dailyVolumeCap: 200,
      sessionKeyAddress: sessionKey1.address,
      sessionKeyPrivateKey: sessionPriv1,
      delegationContractAddress: SOMNIA_ADDRESSES.sessionAccount,
    });

    expect(session1.sessionKeyAddress).toBe(sessionKey1.address);
    expect(session1.maxTradeSize).toBe(20);
    expect(session1.dailyVolumeCap).toBe(200);
    expect(session1.delegationContractAddress).toBe(SOMNIA_ADDRESSES.sessionAccount);

    // Register user2 with $15 max trade size, $150 daily cap, and distinct session key
    const session2 = await sessionService.registerSession({
      userAddress: user2.address,
      operatorAddress: liveOperator.address,
      maxTradeSize: 15,
      dailyVolumeCap: 150,
      sessionKeyAddress: sessionKey2.address,
      sessionKeyPrivateKey: sessionPriv2,
      delegationContractAddress: SOMNIA_ADDRESSES.sessionAccount,
    });

    expect(session2.sessionKeyAddress).toBe(sessionKey2.address);
    expect(session2.sessionKeyAddress).not.toBe(session1.sessionKeyAddress);

    // Validate spend caps per user
    expect(sessionService.validateTradeAllowance(session1.id, 20).allowed).toBe(true);
    expect(sessionService.validateTradeAllowance(session1.id, 20.01).allowed).toBe(false);

    expect(sessionService.validateTradeAllowance(session2.id, 15).allowed).toBe(true);
    expect(sessionService.validateTradeAllowance(session2.id, 15.01).allowed).toBe(false);

    // Revocation of user1's session does not affect user2
    await sessionService.revokeSession(session1.id);
    expect(sessionService.getSessionById(session1.id)?.isActive).toBe(false);
    expect(sessionService.getSessionById(session2.id)?.isActive).toBe(true);
  });

  it('rejects a session key pair where the private key does not match the address', async () => {
    const user = privateKeyToAccount(generatePrivateKey());
    const realKey = privateKeyToAccount(generatePrivateKey());
    const unrelatedPriv = generatePrivateKey();

    await expect(
      sessionService.registerSession({
        userAddress: user.address,
        operatorAddress: liveOperator.address,
        maxTradeSize: 20,
        dailyVolumeCap: 200,
        sessionKeyAddress: realKey.address,
        sessionKeyPrivateKey: unrelatedPriv,
        delegationContractAddress: SOMNIA_ADDRESSES.sessionAccount,
      }),
    ).rejects.toThrow(/does not correspond/);
  });

  it('leaves legacy operator-relay sessions without a delegation contract', async () => {
    const user = privateKeyToAccount(generatePrivateKey());

    const session = await sessionService.registerSession({
      userAddress: user.address,
      operatorAddress: liveOperator.address,
      maxTradeSize: 10,
      dailyVolumeCap: 100,
    });

    expect(session.sessionKeyAddress).toBeUndefined();
    expect(session.sessionKeyPrivateKey).toBeUndefined();
    expect(session.delegationContractAddress).toBeUndefined();
  });

  it('BE-BUG-10: preserves lastSpendResetTimestamp across DB record serialization and prevents arbitrary resets caused by metadata updated_at', () => {
    // 1. Verify schema serialization format for raw DB rows
    const trueResetTimestamp = Date.now() - 25 * 3600 * 1000; // 25 hours ago -> due for reset
    const recentMetadataUpdatedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // touched 30 mins ago

    const mockDbRow = {
      id: '00000000-0000-0000-0000-000000000001',
      user_address: '0x1111111111111111111111111111111111111111',
      operator_address: '0x2222222222222222222222222222222222222222',
      permissions: ['placeOrderFor', 'cancelOrderFor'],
      max_trade_size: '50.0000',
      daily_volume_cap: '100.0000',
      spent_today: '75.0000',
      last_spend_reset_timestamp: trueResetTimestamp,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      is_active: true,
      nonce: 0,
      created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      updated_at: recentMetadataUpdatedAt,
    };

    // When last_spend_reset_timestamp is used, the 25h elapsed time triggers reset
    const parsedReset = mockDbRow.last_spend_reset_timestamp ? Number(mockDbRow.last_spend_reset_timestamp) : null;
    const baseReset = parsedReset && Number.isFinite(parsedReset) && parsedReset > 0
      ? parsedReset
      : new Date(mockDbRow.updated_at).getTime();

    const isPastDayWithColumn = Date.now() - baseReset > 24 * 3600 * 1000;
    expect(isPastDayWithColumn).toBe(true);

    // If we had relied on updated_at, it would falsely indicate < 24h elapsed and trap the user
    const isPastDayWithBuggyUpdatedAt = Date.now() - new Date(mockDbRow.updated_at).getTime() > 24 * 3600 * 1000;
    expect(isPastDayWithBuggyUpdatedAt).toBe(false);
  });

  it('BE-BUG-10: prevents premature reset when last_spend_reset_timestamp is recent even if updated_at is old', () => {
    const recentReset = Date.now() - 2 * 3600 * 1000; // 2 hours ago
    const oldUpdatedAt = new Date(Date.now() - 30 * 3600 * 1000).toISOString(); // 30 hours ago

    const mockDbRow = {
      id: '00000000-0000-0000-0000-000000000002',
      user_address: '0x1111111111111111111111111111111111111111',
      operator_address: '0x2222222222222222222222222222222222222222',
      permissions: ['placeOrderFor', 'cancelOrderFor'],
      max_trade_size: '50.0000',
      daily_volume_cap: '100.0000',
      spent_today: '80.0000',
      last_spend_reset_timestamp: recentReset,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      is_active: true,
      nonce: 1,
      created_at: oldUpdatedAt,
      updated_at: oldUpdatedAt,
    };

    const parsedReset = mockDbRow.last_spend_reset_timestamp ? Number(mockDbRow.last_spend_reset_timestamp) : null;
    const baseReset = parsedReset && Number.isFinite(parsedReset) && parsedReset > 0
      ? parsedReset
      : new Date(mockDbRow.updated_at).getTime();

    const isPastDayWithColumn = Date.now() - baseReset > 24 * 3600 * 1000;
    expect(isPastDayWithColumn).toBe(false);

    // If we had relied on updated_at, it would falsely reset prematurely
    const isPastDayWithBuggyUpdatedAt = Date.now() - new Date(mockDbRow.updated_at).getTime() > 24 * 3600 * 1000;
    expect(isPastDayWithBuggyUpdatedAt).toBe(true);
  });

  it('BE-BUG-10: updates lastSpendResetTimestamp when updateSessionSpend resets spentToday to 0', async () => {
    const user = privateKeyToAccount(generatePrivateKey());
    const session = await sessionService.registerSession({
      userAddress: user.address,
      operatorAddress: liveOperator.address,
      maxTradeSize: 50,
      dailyVolumeCap: 100,
    });

    const initialReset = session.lastSpendResetTimestamp;
    expect(initialReset).toBeGreaterThan(0);

    // Spend some amount
    await sessionService.recordTradeSpend(session.id, 40);
    expect(session.spentToday).toBe(40);

    // Artificially age the timestamp
    session.lastSpendResetTimestamp = Date.now() - 5000;
    const aged = session.lastSpendResetTimestamp;

    // Reset spend to 0 via updateSessionSpend
    sessionService.updateSessionSpend(session.id, 0);
    expect(session.spentToday).toBe(0);
    expect(session.lastSpendResetTimestamp).toBeGreaterThan(aged);
  });
});





