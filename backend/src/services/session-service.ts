import { isAddress, getAddress, type Address, type Hex } from 'viem';
import { supabase } from '../config/supabase.js';
import { SOMNIA_ADDRESSES } from '../config/somnia.js';
import {
  verifySessionDelegationSignature,
  validateZeroCustodyInvariants,
  checkOnChainOperatorAuthorization,
  OPERATOR_SELECTORS,
} from '../config/permissions-abi.js';

export interface SessionRecord {
  id: string;
  userAddress: Address;
  operatorAddress: Address;
  permissions: string[];
  maxTradeSize: number;
  dailyVolumeCap: number;
  spentToday: number;
  lastSpendResetTimestamp: number;
  expiresAt: string;
  isActive: boolean;
  signature?: Hex;
  nonce: number;
  onChainTxHash?: Hex;
  vaultDepositAmount?: number;
  targetPoolAddress?: Address;
  onChainAuthorized?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterSessionParams {
  userAddress: string;
  operatorAddress?: string;
  maxTradeSize: number;
  dailyVolumeCap: number;
  expiresAt?: string;
  signature?: string;
  nonce?: number;
  permissions?: string[];
  onChainTxHash?: string;
  vaultDepositAmount?: number;
  targetPoolAddress?: string;
  onChainAuthorized?: boolean;
}

export class SessionService {
  private sessions = new Map<string, SessionRecord>();
  private userToActiveSessionId = new Map<string, string>();

  constructor() {
    this.loadActiveSessionsFromDb().catch((err) => {
      console.warn('[SessionService] Initial DB load warning (using in-memory cache):', err.message);
    });
  }

  /**
   * Loads existing active sessions from Supabase on startup.
   */
  private async loadActiveSessionsFromDb(): Promise<void> {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('is_active', true);

    if (error || !data) {
      return;
    }

    const now = Date.now();
    for (const row of data) {
      if (this.sessions.has(row.id)) {
        continue;
      }

      const expiresTimestamp = new Date(row.expires_at).getTime();
      const isActive = row.is_active && expiresTimestamp > now;

      const record: SessionRecord = {
        id: row.id,
        userAddress: getAddress(row.user_address) as Address,
        operatorAddress: getAddress(row.operator_address) as Address,
        permissions: Array.isArray(row.permissions) ? row.permissions : ['placeOrderFor', 'cancelOrderFor'],
        maxTradeSize: Number(row.max_trade_size),
        dailyVolumeCap: Number(row.daily_volume_cap),
        spentToday: Number(row.spent_today || 0),
        lastSpendResetTimestamp: new Date(row.updated_at).getTime(),
        expiresAt: row.expires_at,
        isActive,
        nonce: 0,
        onChainTxHash: (row.on_chain_tx_hash as Hex) || undefined,
        vaultDepositAmount: row.vault_deposit_amount ? Number(row.vault_deposit_amount) : undefined,
        targetPoolAddress: row.target_pool_address ? (getAddress(row.target_pool_address) as Address) : undefined,
        onChainAuthorized: row.on_chain_authorized ?? true,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      this.sessions.set(record.id, record);
      const userKey = record.userAddress.toLowerCase();
      if (isActive && !this.userToActiveSessionId.has(userKey)) {
        this.userToActiveSessionId.set(userKey, record.id);
      }
    }
  }

  /**
   * Registers a new non-custodial session grant.
   */
  public async registerSession(params: RegisterSessionParams): Promise<SessionRecord> {
    if (!params.userAddress || !isAddress(params.userAddress)) {
      throw new Error(`Invalid userAddress: ${params.userAddress}`);
    }

    const normalizedUser = getAddress(params.userAddress) as Address;
    const rawOperator = params.operatorAddress || SOMNIA_ADDRESSES.operatorPermissionsRegistry;
    if (!isAddress(rawOperator)) {
      throw new Error(`Invalid operatorAddress: ${rawOperator}`);
    }
    const normalizedOperator = getAddress(rawOperator) as Address;

    const maxTradeSize = Number(params.maxTradeSize);
    const dailyVolumeCap = Number(params.dailyVolumeCap);
    if (isNaN(maxTradeSize) || maxTradeSize <= 0) {
      throw new Error(`Invalid maxTradeSize: must be positive number`);
    }
    if (isNaN(dailyVolumeCap) || dailyVolumeCap < maxTradeSize) {
      throw new Error(`Invalid dailyVolumeCap: must be >= maxTradeSize (${maxTradeSize})`);
    }

    const permissions = params.permissions || ['placeOrderFor', 'cancelOrderFor'];
    const invariantCheck = validateZeroCustodyInvariants(permissions);
    if (!invariantCheck.valid) {
      throw new Error(
        `Prohibited non-custodial operations requested: ${invariantCheck.rejectedActions.join(', ')}`
      );
    }

    const now = Date.now();
    const expiresAt = params.expiresAt || new Date(now + 24 * 3600 * 1000).toISOString();
    const deadlineTimestamp = Math.floor(new Date(expiresAt).getTime() / 1000);
    const nonce = params.nonce ?? 0;

    // Verify EIP-712 signature if provided
    if (params.signature && params.signature.startsWith('0x')) {
      const isValid = await verifySessionDelegationSignature({
        delegator: normalizedUser,
        operator: normalizedOperator,
        maxTradeSize,
        dailyVolumeCap,
        nonce,
        deadline: deadlineTimestamp,
        signature: params.signature as Hex,
      });

      if (!isValid) {
        throw new Error('EIP-712 session delegation signature verification failed');
      }
    }

    // Verify on-chain operator authorization on Somnia Shannon Testnet if on-chain check available
    let onChainAuthorized = params.onChainAuthorized ?? false;
    let targetPoolAddress: Address | undefined;
    if (params.targetPoolAddress && isAddress(params.targetPoolAddress)) {
      targetPoolAddress = getAddress(params.targetPoolAddress) as Address;
    }

    try {
      const isAuthed = await checkOnChainOperatorAuthorization(
        normalizedUser,
        normalizedOperator,
        targetPoolAddress,
        OPERATOR_SELECTORS.placeOrderFor,
      );
      if (isAuthed) {
        onChainAuthorized = true;
      } else if (params.onChainTxHash) {
        // Optimistically set to true if an on-chain transaction hash was provided
        onChainAuthorized = true;
      }
    } catch {
      if (params.onChainTxHash) {
        onChainAuthorized = true;
      }
    }

    // Deactivate previous active sessions for this user
    const userKey = normalizedUser.toLowerCase();
    const existingActiveId = this.userToActiveSessionId.get(userKey);
    if (existingActiveId) {
      const existing = this.sessions.get(existingActiveId);
      if (existing) {
        existing.isActive = false;
        existing.updatedAt = new Date().toISOString();
      }
      try {
        await supabase
          .from('sessions')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('user_address', normalizedUser)
          .eq('is_active', true);
      } catch (err) {
        console.warn('[SessionService] Could not deactivate old sessions in DB:', err);
      }
    }

    const expiresTimestamp = new Date(expiresAt).getTime();
    const isExpired = now >= expiresTimestamp;
    const isActive = !isExpired;

    const onChainTxHash = params.onChainTxHash?.startsWith('0x')
      ? (params.onChainTxHash as Hex)
      : undefined;

    const sessionId = crypto.randomUUID();
    const sessionRecord: SessionRecord = {
      id: sessionId,
      userAddress: normalizedUser,
      operatorAddress: normalizedOperator,
      permissions,
      maxTradeSize,
      dailyVolumeCap,
      spentToday: 0,
      lastSpendResetTimestamp: now,
      expiresAt,
      isActive,
      signature: params.signature as Hex | undefined,
      nonce,
      onChainTxHash,
      vaultDepositAmount: params.vaultDepositAmount,
      targetPoolAddress,
      onChainAuthorized,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };

    this.sessions.set(sessionId, sessionRecord);
    if (isActive) {
      this.userToActiveSessionId.set(userKey, sessionId);
    } else {
      this.userToActiveSessionId.delete(userKey);
    }

    // Persist to Supabase
    try {
      await supabase.from('sessions').insert({
        id: sessionId,
        user_address: normalizedUser,
        operator_address: normalizedOperator,
        permissions,
        max_trade_size: maxTradeSize,
        daily_volume_cap: dailyVolumeCap,
        spent_today: 0,
        expires_at: expiresAt,
        is_active: isActive,
      });
    } catch (err) {
      console.warn('[SessionService] Supabase insert fallback (session held in memory):', err);
    }

    return sessionRecord;
  }

  /**
   * Retrieves the currently active session for a user address.
   */
  public async getUserActiveSession(userAddress: string): Promise<SessionRecord | null> {
    if (!userAddress || !isAddress(userAddress)) {
      return null;
    }

    const userKey = getAddress(userAddress).toLowerCase();
    const sessionId = this.userToActiveSessionId.get(userKey);
    if (!sessionId) {
      return null;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const now = Date.now();
    const expiresTimestamp = new Date(session.expiresAt).getTime();

    // Check expiration
    if (now >= expiresTimestamp) {
      session.isActive = false;
      session.updatedAt = new Date(now).toISOString();
      this.userToActiveSessionId.delete(userKey);
      try {
        await supabase
          .from('sessions')
          .update({ is_active: false })
          .eq('id', session.id);
      } catch {
        // ignore
      }
      return null;
    }

    // Reset daily spend if 24 hours have elapsed since last reset
    if (now - session.lastSpendResetTimestamp > 24 * 3600 * 1000) {
      session.spentToday = 0;
      session.lastSpendResetTimestamp = now;
    }

    return session;
  }

  /**
   * Retrieves session by its ID.
   */
  public getSessionById(sessionId: string): SessionRecord | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (Date.now() >= new Date(session.expiresAt).getTime()) {
      session.isActive = false;
    }

    return session;
  }

  /**
   * Lists all sessions (active and past) for a specific user.
   */
  public listUserSessions(userAddress: string): SessionRecord[] {
    if (!userAddress || !isAddress(userAddress)) return [];
    const normalized = getAddress(userAddress);

    return Array.from(this.sessions.values()).filter(
      (s) => s.userAddress.toLowerCase() === normalized.toLowerCase()
    );
  }

  /**
   * Validates if a proposed trade complies with the session risk guardrails.
   */
  public validateTradeAllowance(
    sessionId: string,
    tradeCost: number
  ): { allowed: boolean; reason?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { allowed: false, reason: 'Session not found' };
    }

    const now = Date.now();
    if (now >= new Date(session.expiresAt).getTime()) {
      session.isActive = false;
      return { allowed: false, reason: 'Session has expired' };
    }

    if (!session.isActive) {
      return { allowed: false, reason: 'Session is inactive or revoked' };
    }

    // Single trade risk guardrail
    if (tradeCost > session.maxTradeSize) {
      return {
        allowed: false,
        reason: `Trade cost (${tradeCost.toFixed(2)} STT) exceeds maximum trade size limit of ${session.maxTradeSize.toFixed(2)} STT`,
      };
    }

    // Reset 24-hour window if day passed
    if (now - session.lastSpendResetTimestamp > 24 * 3600 * 1000) {
      session.spentToday = 0;
      session.lastSpendResetTimestamp = now;
    }

    // Daily volume cap guardrail
    if (session.spentToday + tradeCost > session.dailyVolumeCap) {
      const remaining = Math.max(0, session.dailyVolumeCap - session.spentToday);
      return {
        allowed: false,
        reason: `Trade cost (${tradeCost.toFixed(2)} STT) exceeds remaining daily volume cap of ${remaining.toFixed(2)} STT (Spent: ${session.spentToday.toFixed(2)} / Cap: ${session.dailyVolumeCap.toFixed(2)} STT)`,
      };
    }

    return { allowed: true };
  }

  /**
   * Records executed trade spend against the session's daily volume cap.
   */
  public async recordTradeSpend(sessionId: string, tradeCost: number): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.spentToday += tradeCost;
    session.updatedAt = new Date().toISOString();

    try {
      await supabase
        .from('sessions')
        .update({ spent_today: session.spentToday, updated_at: session.updatedAt })
        .eq('id', session.id);
    } catch {
      // ignore
    }

    return true;
  }

  /**
   * Revokes an active session immediately.
   */
  public async revokeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      // If not in memory, try updating database directly
      try {
        await supabase
          .from('sessions')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', sessionId);
        return true;
      } catch {
        return false;
      }
    }

    session.isActive = false;
    session.updatedAt = new Date().toISOString();

    const userKey = session.userAddress.toLowerCase();
    if (this.userToActiveSessionId.get(userKey) === sessionId) {
      this.userToActiveSessionId.delete(userKey);
    }

    try {
      await supabase
        .from('sessions')
        .update({ is_active: false, updated_at: session.updatedAt })
        .eq('id', session.id);
    } catch (err) {
      console.warn('[SessionService] Could not persist revocation to DB:', err);
    }

    return true;
  }
}

export const sessionService = new SessionService();
