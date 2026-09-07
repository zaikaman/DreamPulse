import { isAddress, getAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { supabase, isPersistenceEnabled } from '../config/supabase.js';
import { SOMNIA_ADDRESSES, operatorAccount, publicClient } from '../config/somnia.js';
import { userSwarmService } from './user-swarm-service.js';
import {
  decryptSessionPrivateKey,
  encryptSessionPrivateKey,
  isEncryptedSessionKeyValue,
  isSessionKeyEncryptionConfigured,
} from './session-key-crypto.js';
import {
  verifySessionDelegationSignature,
  validateZeroCustodyInvariants,
  getSessionAccount,
  deployCloneForUser,
  predictCloneForUser,
  checkCloneSessionPolicy,
  checkOnChainSessionPolicy,
  CLONE_ZERO_ADDRESS,
} from '../config/permissions-abi.js';

function isSessionPersistenceEnabled(): boolean {
  return isPersistenceEnabled();
}

/**
 * Verify on-chain transaction status and provenance for session authorization proofs.
 */
export async function verifyTxHashOnChain(
  txHash: string | undefined,
  expectedUser: Address,
): Promise<boolean> {
  if (!txHash || typeof txHash !== 'string' || !txHash.startsWith('0x') || txHash.length !== 66) {
    return false;
  }
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hex });
    if (!receipt || receipt.status !== 'success') {
      return false;
    }
    if (receipt.from && receipt.from.toLowerCase() !== expectedUser.toLowerCase()) {
      console.warn(`[SessionService] onChainTxHash sender ${receipt.from} does not match delegating user ${expectedUser}`);
      return false;
    }
    return true;
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[SessionService] Could not verify on-chain tx receipt for ${txHash}:`, err?.message);
    }
    return false;
  }
}

export const UNLIMITED_AMOUNT = 1_000_000_000;

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
  copyTradeEnabled?: boolean;
  sessionKeyAddress?: Address;
  sessionKeyPrivateKey?: Hex;
  delegationContractAddress?: Address;
  /** V2 per-user trading account clone (owns positions, pulls escrow). */
  accountAddress?: Address;
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
  copyTradeEnabled?: boolean;
  sessionKeyAddress?: string;
  sessionKeyPrivateKey?: string;
  delegationContractAddress?: string;
  accountAddress?: string;
}

export class SessionService {
  private sessions = new Map<string, SessionRecord>();
  private userToActiveSessionId = new Map<string, string>();

  private lastAuthRefreshAt = 0;
  private authRefreshInFlight: Promise<void> | null = null;
  private static readonly AUTH_REFRESH_MS = 60_000;

  constructor() {
    this.loadActiveSessionsFromDb()
      .then(() => this.refreshOnChainAuthorizations())
      .catch((err) => {
        console.warn('[SessionService] Initial DB load warning (using in-memory cache):', err.message);
      });
    this.initRealtime();
  }

  private initRealtime(): void {
    if (!isSessionPersistenceEnabled()) return;
    try {
      supabase
        .channel('public:sessions_backend')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sessions' },
          (payload: { eventType: string; new: any }) => {
            if (payload.new && payload.new.id && payload.new.user_address) {
              const row = payload.new;
              const now = Date.now();
              const expiresTimestamp = new Date(row.expires_at).getTime();
              const isActive = row.is_active && expiresTimestamp > now;
              const userKey = row.user_address.toLowerCase();

              const existing = this.sessions.get(row.id);
              // SEC-02 defense-in-depth: CDC rows are untrusted input for
              // security-critical fields. RLS now denies all authenticated DML
              // (service_role/backend-only writes), but this handler stays
              // fail-closed so a future policy regression cannot escalate:
              //  - risk caps (max_trade_size/daily_volume_cap) are NEVER synced
              //    from CDC (only updateSessionRisk/recordTradeSpend mutate them);
              //  - spent_today may only ratchet UP via CDC (backend's own spend
              //    writes); decreases are ignored (tamper/reset attempt);
              //  - on_chain_authorized may only flip true->false via CDC
              //    (revocation); false->true requires on-chain re-verification;
              //  - is_active may only flip true->false via CDC (revocation).
              if (existing) {
                if (typeof row.user_address === 'string' && row.user_address.toLowerCase() !== existing.userAddress.toLowerCase()) {
                  console.warn(`[SessionService] Ignoring CDC for session ${row.id}: user_address mismatch`);
                  return;
                }
                if (existing.isActive && !isActive) {
                  existing.isActive = false;
                }
                const incomingSpent = Number(row.spent_today || 0);
                if (Number.isFinite(incomingSpent) && incomingSpent > existing.spentToday) {
                  existing.spentToday = incomingSpent;
                } else if (Number.isFinite(incomingSpent) && incomingSpent < existing.spentToday) {
                  console.warn(`[SessionService] Ignoring CDC spent_today decrease for session ${row.id} (${existing.spentToday} -> ${incomingSpent})`);
                }
                if (existing.onChainAuthorized && row.on_chain_authorized !== true) {
                  existing.onChainAuthorized = false;
                } else if (!existing.onChainAuthorized && row.on_chain_authorized === true) {
                  // Fail-closed: schedule async on-chain re-verification instead
                  // of trusting the DB flag. refreshOnChainAuthorizations probes
                  // the clone/registry policy and only then flips the flag.
                  console.warn(`[SessionService] Ignoring CDC on_chain_authorized escalation for session ${row.id} — awaiting on-chain re-verification`);
                  void this.refreshOnChainAuthorizations().catch(() => {});
                }
                existing.sessionKeyAddress = row.session_key_address
                  ? (getAddress(row.session_key_address) as Address)
                  : undefined;
                // SEC-01: column holds AES-256-GCM ciphertext only — decrypt to
                // memory (service_role read). Plaintext/ciphertext is never
                // re-broadcast: sessions are dropped from supabase_realtime.
                existing.sessionKeyPrivateKey = decryptSessionPrivateKey(row.session_key_private_key) ?? existing.sessionKeyPrivateKey;
                existing.delegationContractAddress = row.delegation_contract_address
                  ? (getAddress(row.delegation_contract_address) as Address)
                  : undefined;
                existing.accountAddress = row.account_address
                  ? (getAddress(row.account_address) as Address)
                  : undefined;
                existing.copyTradeEnabled = userSwarmService.hasUserConfig(row.user_address)
                  ? userSwarmService.isCopyTradeEnabled(row.user_address)
                  : (row.copy_trade_enabled === true);
                existing.updatedAt = row.updated_at || new Date().toISOString();
                // SEC-02: drive the active-session index from the in-memory
                // fail-closed flag (existing.isActive), never from the raw CDC
                // row — a tampered is_active=true row must not resurrect a
                // revoked/expired session.
                if (!existing.isActive && this.userToActiveSessionId.get(userKey) === row.id) {
                  this.userToActiveSessionId.delete(userKey);
                } else if (existing.isActive) {
                  this.userToActiveSessionId.set(userKey, row.id);
                }
              }
            }
          }
        )
        .subscribe();
    } catch (err: any) {
      console.warn('[SessionService] Realtime subscription warning:', err?.message || err);
    }
  }

  /**
   * Loads existing active sessions from Supabase on startup.
   * Missing on_chain_authorized is treated as false — never default leftover rows to authorized.
   */
  private async loadActiveSessionsFromDb(): Promise<void> {
    if (!isSessionPersistenceEnabled()) {
      return;
    }

    await userSwarmService.waitForInit();

    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

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

      const updatedAtTimestamp = new Date(row.updated_at || row.created_at).getTime();
      const isPastDay = now - updatedAtTimestamp > 24 * 3600 * 1000;
      const spentToday = isPastDay ? 0 : Number(row.spent_today || 0);
      const lastSpendResetTimestamp = isPastDay ? now : updatedAtTimestamp;

      const record: SessionRecord = {
        id: row.id,
        userAddress: getAddress(row.user_address) as Address,
        operatorAddress: getAddress(row.operator_address) as Address,
        permissions: Array.isArray(row.permissions) ? row.permissions : ['placeOrderFor', 'cancelOrderFor'],
        maxTradeSize: Number(row.max_trade_size),
        dailyVolumeCap: Number(row.daily_volume_cap),
        spentToday,
        lastSpendResetTimestamp,
        expiresAt: row.expires_at,
        isActive,
        nonce: typeof row.nonce === 'number' ? Number(row.nonce) : Number(row.nonce || 0),
        onChainTxHash: (row.on_chain_tx_hash as Hex) || undefined,
        vaultDepositAmount: row.vault_deposit_amount ? Number(row.vault_deposit_amount) : undefined,
        targetPoolAddress: row.target_pool_address ? (getAddress(row.target_pool_address) as Address) : undefined,
        onChainAuthorized: row.on_chain_authorized === true,
        sessionKeyAddress: row.session_key_address ? (getAddress(row.session_key_address) as Address) : undefined,
        sessionKeyPrivateKey: decryptSessionPrivateKey(row.session_key_private_key),
        delegationContractAddress: row.delegation_contract_address ? (getAddress(row.delegation_contract_address) as Address) : undefined,
        accountAddress: (row as any).account_address ? (getAddress((row as any).account_address) as Address) : undefined,
        copyTradeEnabled: userSwarmService.hasUserConfig(row.user_address)
          ? userSwarmService.isCopyTradeEnabled(row.user_address)
          : (row.copy_trade_enabled === true),
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
   * Returns the next available session nonce for a user address.
   * Scans both in-memory sessions and Supabase DB to find highest used nonce.
   */
  public async getNextSessionNonce(userAddress: string): Promise<number> {
    if (!userAddress || !isAddress(userAddress)) {
      return 0;
    }
    const normalizedUser = getAddress(userAddress);
    const userKey = normalizedUser.toLowerCase();

    let maxNonce = -1;

    // 1. Check in-memory sessions
    for (const session of this.sessions.values()) {
      if (session.userAddress.toLowerCase() === userKey) {
        if (typeof session.nonce === 'number' && session.nonce > maxNonce) {
          maxNonce = session.nonce;
        }
      }
    }

    // 2. Query Supabase if persistence is enabled
    if (isSessionPersistenceEnabled()) {
      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('nonce')
          .ilike('user_address', normalizedUser)
          .order('nonce', { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0 && typeof data[0]?.nonce === 'number') {
          if (data[0].nonce > maxNonce) {
            maxNonce = Number(data[0].nonce);
          }
        }
      } catch (err: any) {
        console.warn('[SessionService] getNextSessionNonce DB lookup warning:', err?.message || err);
      }
    }

    return maxNonce >= 0 ? maxNonce + 1 : 0;
  }

  /**
   * Registers a new non-custodial session grant.
   */
  public async registerSession(params: RegisterSessionParams): Promise<SessionRecord> {
    if (!params.userAddress || !isAddress(params.userAddress)) {
      throw new Error(`Invalid userAddress: ${params.userAddress}`);
    }

    const normalizedUser = getAddress(params.userAddress) as Address;
    const userKey = normalizedUser.toLowerCase();
    const rawOperator = params.operatorAddress || SOMNIA_ADDRESSES.operatorAccount || SOMNIA_ADDRESSES.operatorPermissionsRegistry;
    if (!isAddress(rawOperator)) {
      throw new Error(`Invalid operatorAddress: ${rawOperator}`);
    }
    const normalizedOperator = getAddress(rawOperator) as Address;

    const maxTradeSize = Number(params.maxTradeSize);
    const dailyVolumeCap = Number(params.dailyVolumeCap);
    if (isNaN(maxTradeSize) || maxTradeSize <= 0) {
      throw new Error(`Invalid maxTradeSize: must be positive number`);
    }
    if (isNaN(dailyVolumeCap) || (dailyVolumeCap < maxTradeSize && dailyVolumeCap < UNLIMITED_AMOUNT)) {
      throw new Error(`Invalid dailyVolumeCap: must be >= maxTradeSize (${maxTradeSize})`);
    }

    const permissions = params.permissions || ['placeOrderFor', 'cancelOrderFor'];
    const invariantCheck = validateZeroCustodyInvariants(permissions);
    if (!invariantCheck.valid) {
      throw new Error(
        `Prohibited non-custodial operations requested: ${invariantCheck.rejectedActions.join(', ')}`
      );
    }

    // Determine and validate session nonce
    let nonce: number;
    if (params.nonce !== undefined) {
      const parsedNonce = Number(params.nonce);
      if (isNaN(parsedNonce) || parsedNonce < 0 || !Number.isInteger(parsedNonce)) {
        throw new Error(`Invalid nonce: must be a non-negative integer`);
      }

      // Check if nonce has already been used in memory
      const isNonceUsedInMemory = Array.from(this.sessions.values()).some(
        (s) => s.userAddress.toLowerCase() === userKey && s.nonce === parsedNonce
      );

      let isNonceUsedInDb = false;
      if (isSessionPersistenceEnabled()) {
        try {
          const { data } = await supabase
            .from('sessions')
            .select('id')
            .ilike('user_address', normalizedUser)
            .eq('nonce', parsedNonce)
            .limit(1);
          if (data && data.length > 0) {
            isNonceUsedInDb = true;
          }
        } catch {}
      }

      if (isNonceUsedInMemory || isNonceUsedInDb) {
        throw new Error(`Session nonce ${parsedNonce} has already been used for address ${normalizedUser}`);
      }
      nonce = parsedNonce;
    } else {
      nonce = await this.getNextSessionNonce(normalizedUser);
    }

    const now = Date.now();
    const expiresAt = params.expiresAt || new Date(now + 24 * 3600 * 1000).toISOString();
    const deadlineTimestamp = Math.floor(new Date(expiresAt).getTime() / 1000);

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

    // V2 clone model: the user's trading account clone owns positions and
    // pulls escrow. Authorization = clone deployed for the user + live
    // per-key policy on the clone. No registry grant, no pool approvals.
    let onChainAuthorized = params.onChainAuthorized ?? false;
    let targetPoolAddress: Address | undefined;
    if (params.targetPoolAddress && isAddress(params.targetPoolAddress)) {
      targetPoolAddress = getAddress(params.targetPoolAddress) as Address;
    }

    let accountAddress: Address | undefined = params.accountAddress && isAddress(params.accountAddress)
      ? (getAddress(params.accountAddress) as Address)
      : undefined;
    const isSessionKeyGrant = Boolean(params.sessionKeyAddress && isAddress(params.sessionKeyAddress));
    if (isSessionKeyGrant || params.accountAddress) {
      try {
        const factoryAccount = await this.getOrCreateClone(normalizedUser);
        if (factoryAccount && factoryAccount.toLowerCase() !== CLONE_ZERO_ADDRESS.toLowerCase()) {
          if (accountAddress && accountAddress.toLowerCase() !== factoryAccount.toLowerCase()) {
            // Stale client (e.g. holding a pre-redeploy clone address):
            // the factory registry is source of truth — adopt it instead of
            // rejecting the session.
            console.warn(
              `[SessionService] Adopting factory clone ${factoryAccount} over stale client account ${accountAddress} for ${normalizedUser}`,
            );
          }
          accountAddress = factoryAccount;
        }
      } catch (err: any) {
        if (process.env.NODE_ENV !== 'test') {
          console.warn('[SessionService] Clone lookup/deployment warning:', err?.message || err);
        }
      }
    }

    // A verified user-sent tx (clone authorize/approve/deploy) from the owner
    // counts toward authorization when the clone is not yet readable.
    if (!onChainAuthorized && params.onChainTxHash) {
      const isTxVerified = await verifyTxHashOnChain(params.onChainTxHash, normalizedUser);
      if (isTxVerified) onChainAuthorized = params.onChainAuthorized ?? true;
    }

    // Deactivate previous active sessions for this user
    const existingActiveId = this.userToActiveSessionId.get(userKey);
    if (existingActiveId) {
      const existing = this.sessions.get(existingActiveId);
      if (existing) {
        existing.isActive = false;
        existing.updatedAt = new Date().toISOString();
      }
      if (isSessionPersistenceEnabled()) {
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
    }

    const expiresTimestamp = new Date(expiresAt).getTime();
    const isExpired = now >= expiresTimestamp;
    const isActive = !isExpired;

    const onChainTxHash = params.onChainTxHash?.startsWith('0x')
      ? (params.onChainTxHash as Hex)
      : undefined;

    if (params.copyTradeEnabled !== undefined) {
      await userSwarmService.upsertConfig(normalizedUser, { copyTradeEnabled: params.copyTradeEnabled }).catch(() => {});
    }

    const sessionKeyAddress = params.sessionKeyAddress && isAddress(params.sessionKeyAddress)
      ? (getAddress(params.sessionKeyAddress) as Address)
      : undefined;
    let sessionKeyPrivateKey = params.sessionKeyPrivateKey?.startsWith('0x')
      ? (params.sessionKeyPrivateKey as Hex)
      : undefined;
    // SECURITY: the relay signs with this key — reject a mismatched pair instead
    // of storing a key that can never authorize on-chain (fail-closed).
    if (sessionKeyAddress && sessionKeyPrivateKey) {
      try {
        const derived = privateKeyToAccount(sessionKeyPrivateKey).address;
        if (derived.toLowerCase() !== sessionKeyAddress.toLowerCase()) {
          throw new Error(
            `sessionKeyPrivateKey does not correspond to sessionKeyAddress ${sessionKeyAddress}`,
          );
        }
      } catch (err: any) {
        if (err?.message?.startsWith('sessionKeyPrivateKey does not correspond')) throw err;
        throw new Error(`Invalid sessionKeyPrivateKey: ${err?.message || err}`);
      }
    } else if (!sessionKeyAddress) {
      // No session key for this grant — drop any stray key material.
      sessionKeyPrivateKey = undefined;
    }
    // In V2, the delegation contract for session keys is the user's clone (when deployed),
    // or an explicitly supplied contract address (e.g. tests or legacy singleton).
    const delegationContractAddress = (params.delegationContractAddress && isAddress(params.delegationContractAddress))
      ? (getAddress(params.delegationContractAddress) as Address)
      : (sessionKeyAddress ? accountAddress : undefined);

    if (sessionKeyAddress && accountAddress) {
      try {
        const onChainPolicy = await checkCloneSessionPolicy(accountAddress, sessionKeyAddress);
        if (onChainPolicy && onChainPolicy.isActive) {
          onChainAuthorized = true;
        }
      } catch (policyErr: any) {
        if (process.env.NODE_ENV !== 'test') {
          console.warn('[SessionService] Clone session policy check warning:', policyErr?.message || policyErr);
        }
      }
    } else if (sessionKeyAddress && !accountAddress) {
      try {
        const onChainPolicy = await checkOnChainSessionPolicy(normalizedUser, sessionKeyAddress);
        if (onChainPolicy && onChainPolicy.isActive) {
          onChainAuthorized = true;
        }
      } catch (policyErr: any) {
        if (process.env.NODE_ENV !== 'test') {
          console.warn('[SessionService] On-chain session policy check warning:', policyErr?.message || policyErr);
        }
      }
    }

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
      copyTradeEnabled: params.copyTradeEnabled ?? userSwarmService.isCopyTradeEnabled(normalizedUser),
      sessionKeyAddress,
      sessionKeyPrivateKey,
      delegationContractAddress,
      accountAddress,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };

    this.sessions.set(sessionId, sessionRecord);
    if (isActive) {
      this.userToActiveSessionId.set(userKey, sessionId);
    } else {
      this.userToActiveSessionId.delete(userKey);
    }

    if (isSessionPersistenceEnabled()) {
      try {
        // SEC-01: NEVER persist plaintext signing keys. The column holds
        // AES-256-GCM ciphertext only. Without SESSION_KEY_ENCRYPTION_KEY we
        // persist NULL (fail-closed, memory-only relay) rather than leak.
        let encryptedPrivateKey: string | null = null;
        if (sessionKeyPrivateKey) {
          if (isSessionKeyEncryptionConfigured()) {
            encryptedPrivateKey = encryptSessionPrivateKey(sessionKeyPrivateKey);
          } else if (process.env.NODE_ENV !== 'test') {
            console.warn(
              '[SessionService] SESSION_KEY_ENCRYPTION_KEY unset — persisting session WITHOUT private key (memory-only relay). Set the key on Heroku for durable keys.',
            );
          }
          if (encryptedPrivateKey && !isEncryptedSessionKeyValue(encryptedPrivateKey)) {
            throw new Error('Session key encryption invariant violated — refusing plaintext DB write');
          }
        }
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
          nonce: nonce,
          on_chain_tx_hash: onChainTxHash || null,
          on_chain_authorized: onChainAuthorized,
          vault_deposit_amount: params.vaultDepositAmount ?? null,
          target_pool_address: targetPoolAddress || null,
          copy_trade_enabled: sessionRecord.copyTradeEnabled ?? false,
          session_key_address: sessionKeyAddress || null,
          session_key_private_key: encryptedPrivateKey,
          delegation_contract_address: delegationContractAddress || null,
          account_address: accountAddress || null,
        });
      } catch (err) {
        console.warn('[SessionService] Supabase insert fallback (session held in memory):', err);
      }
    }

    return sessionRecord;
  }

  /**
   * Directly updates the copyTradeEnabled flag for an active session in memory.
   */
  public setSessionCopyTradeEnabled(userAddress: string, enabled: boolean): void {
    const key = userAddress.toLowerCase();
    const sessionId = this.userToActiveSessionId.get(key);
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.copyTradeEnabled = enabled;
      }
    }
  }

  /**
   * Updates risk limits (maxTradeSize and dailyVolumeCap) for a user's active session.
   */
  public async updateSessionRisk(userAddress: string, maxTradeSize: number, dailyVolumeCap: number): Promise<SessionRecord | null> {
    const key = userAddress.toLowerCase();
    const sessionId = this.userToActiveSessionId.get(key);
    if (!sessionId) return null;
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.maxTradeSize = maxTradeSize;
    session.dailyVolumeCap = dailyVolumeCap;
    session.updatedAt = new Date().toISOString();

    if (isSessionPersistenceEnabled()) {
      try {
        await supabase
          .from('sessions')
          .update({
            max_trade_size: maxTradeSize,
            daily_volume_cap: dailyVolumeCap,
            updated_at: session.updatedAt,
          })
          .eq('id', sessionId);
      } catch (err) {
        console.warn('[SessionService] Supabase updateSessionRisk fallback:', err);
      }
    }

    return session;
  }

  /**
   * Retrieves the currently active session for a user address.
   */
  public async getUserActiveSession(userAddress: string): Promise<SessionRecord | null> {
    if (!userAddress || !isAddress(userAddress)) {
      return null;
    }

    await userSwarmService.waitForInit();

    const userKey = getAddress(userAddress).toLowerCase();
    let sessionId = this.userToActiveSessionId.get(userKey);
    let session = sessionId ? this.sessions.get(sessionId) : null;

    // If not found in in-memory cache, attempt to restore from Supabase
    // Index-friendly exact match: normalize to checksummed address and use eq() which hits
    // idx_sessions_user_active; RLS uses lower() with idx_sessions_user_active_lower.
    if (!session && isSessionPersistenceEnabled()) {
      try {
        const normalizedForQuery = getAddress(userAddress);
        const { data } = await supabase
          .from('sessions')
          .select('*')
          .eq('user_address', normalizedForQuery)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1);

        if (data && data.length > 0) {
          const row = data[0];
          const expiresTimestamp = new Date(row.expires_at).getTime();
          if (expiresTimestamp > Date.now()) {
            const updatedAtTimestamp = new Date(row.updated_at || row.created_at).getTime();
            const isPastDay = Date.now() - updatedAtTimestamp > 24 * 3600 * 1000;
            const spentToday = isPastDay ? 0 : Number(row.spent_today || 0);
            const lastSpendResetTimestamp = isPastDay ? Date.now() : updatedAtTimestamp;

            const record: SessionRecord = {
              id: row.id,
              userAddress: getAddress(row.user_address) as Address,
              operatorAddress: getAddress(row.operator_address) as Address,
              permissions: Array.isArray(row.permissions) ? row.permissions : ['placeOrderFor', 'cancelOrderFor'],
              maxTradeSize: Number(row.max_trade_size),
              dailyVolumeCap: Number(row.daily_volume_cap),
              spentToday,
              lastSpendResetTimestamp,
              expiresAt: row.expires_at,
              isActive: true,
              nonce: typeof row.nonce === 'number' ? Number(row.nonce) : Number(row.nonce || 0),
              onChainTxHash: (row.on_chain_tx_hash as Hex) || undefined,
              vaultDepositAmount: row.vault_deposit_amount ? Number(row.vault_deposit_amount) : undefined,
              targetPoolAddress: row.target_pool_address ? (getAddress(row.target_pool_address) as Address) : undefined,
              onChainAuthorized: row.on_chain_authorized === true,
              sessionKeyAddress: row.session_key_address ? (getAddress(row.session_key_address) as Address) : undefined,
              sessionKeyPrivateKey: decryptSessionPrivateKey(row.session_key_private_key),
              delegationContractAddress: row.delegation_contract_address ? (getAddress(row.delegation_contract_address) as Address) : undefined,
              accountAddress: (row as any).account_address ? (getAddress((row as any).account_address) as Address) : undefined,
              copyTradeEnabled: userSwarmService.hasUserConfig(row.user_address)
                ? userSwarmService.isCopyTradeEnabled(row.user_address)
                : (row.copy_trade_enabled === true),
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            };

            this.sessions.set(record.id, record);
            this.userToActiveSessionId.set(userKey, record.id);
            session = record;
            sessionId = record.id;
          }
        }
      } catch (err: any) {
        console.warn('[SessionService] getUserActiveSession DB lookup warning:', err.message);
      }
    }

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
      if (isSessionPersistenceEnabled()) {
        try {
          await supabase
            .from('sessions')
            .update({ is_active: false })
            .eq('id', session.id);
        } catch {
          // ignore
        }
      }
      return null;
    }

    // Reset daily spend if 24 hours have elapsed since last reset
    if (now - session.lastSpendResetTimestamp > 24 * 3600 * 1000) {
      session.spentToday = 0;
      session.lastSpendResetTimestamp = now;
    }

    if (userSwarmService.hasUserConfig(session.userAddress)) {
      session.copyTradeEnabled = userSwarmService.isCopyTradeEnabled(session.userAddress);
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

    if (userSwarmService.hasUserConfig(session.userAddress)) {
      session.copyTradeEnabled = userSwarmService.isCopyTradeEnabled(session.userAddress);
    }

    return session;
  }

  /**
   * Returns all currently active, non-expired delegated user sessions.
   */
  public getActiveSessions(): SessionRecord[] {
    const now = Date.now();
    const result: SessionRecord[] = [];
    for (const [_, sessionId] of this.userToActiveSessionId.entries()) {
      const session = this.sessions.get(sessionId);
      if (session && session.isActive && new Date(session.expiresAt).getTime() > now) {
        if (userSwarmService.hasUserConfig(session.userAddress)) {
          session.copyTradeEnabled = userSwarmService.isCopyTradeEnabled(session.userAddress);
        }
        result.push(session);
      }
    }
    return result;
  }

  /**
   * Retrieves a user's deployed trading account clone from the V2 factory.
   * If not yet deployed, the operator sponsors the deployment gas via deployFor.
   */
  public async getOrCreateClone(userAddress: Address): Promise<Address> {
    const normalizedUser = getAddress(userAddress) as Address;
    const existing = await getSessionAccount(normalizedUser).catch(() => null);
    if (existing && existing.toLowerCase() !== CLONE_ZERO_ADDRESS.toLowerCase()) {
      return existing;
    }
    if (process.env.NODE_ENV === 'test') {
      return (`0x222222222222222222222222${normalizedUser.slice(26)}`) as Address;
    }
    return await deployCloneForUser(normalizedUser);
  }

  /**
   * Predicts a user's clone address before deployment.
   */
  public async predictClone(userAddress: Address): Promise<Address | null> {
    const normalizedUser = getAddress(userAddress) as Address;
    if (process.env.NODE_ENV === 'test') {
      return (`0x222222222222222222222222${normalizedUser.slice(26)}`) as Address;
    }
    return await predictCloneForUser(normalizedUser);
  }

  /**
   * Sessions the swarm may copy-trade: live operator match, on-chain grant, not a dummy/test wallet, and copyTradeEnabled === true.
   */
  public getDelegatedCopyTradeSessions(operatorAddress?: string): SessionRecord[] {
    const operator = (operatorAddress || operatorAccount.address).toLowerCase();
    const now = Date.now();
    return this.getActiveSessions().filter((session) => {
      const user = session.userAddress.toLowerCase();
      if (user === operator) return false;
      if (!isAddress(session.userAddress)) return false;
      if (session.operatorAddress.toLowerCase() !== operator) return false;
      if (session.onChainAuthorized !== true) return false;
      if (!session.isActive) return false;
      if (new Date(session.expiresAt).getTime() <= now) return false;
      if (!userSwarmService.isCopyTradeEnabled(session.userAddress)) return false;
      return true;
    });
  }

  /**
   * Re-checks per-key clone policies for active sessions. Throttled so the
   * 100ms swarm loop does not hammer RPC. RPC failures leave the previous
   * flag in place.
   */
  public async refreshOnChainAuthorizations(operatorAddress?: string): Promise<void> {
    const now = Date.now();
    if (this.authRefreshInFlight) {
      return this.authRefreshInFlight;
    }
    if (now - this.lastAuthRefreshAt < SessionService.AUTH_REFRESH_MS && this.lastAuthRefreshAt > 0) {
      return;
    }

    const task = (async () => {
      const operator = (operatorAddress || operatorAccount.address) as Address;
      const candidates = this.getActiveSessions().filter((session) => {
        const user = session.userAddress.toLowerCase();
        return (
          user !== operator.toLowerCase() &&
          isAddress(session.userAddress) &&
          session.operatorAddress.toLowerCase() === operator.toLowerCase()
        );
      });

      await Promise.all(
        candidates.map(async (session) => {
          try {
            // V2 clone model: authorized = live per-key policy on the user's
            // own clone. No registry grant exists in this model.
            let probed: boolean | null = null;
            if (session.accountAddress && session.sessionKeyAddress) {
              try {
                const policy = await checkCloneSessionPolicy(session.accountAddress, session.sessionKeyAddress);
                probed = policy ? policy.isActive : null;
              } catch {
                probed = null;
              }
            } else if (session.sessionKeyAddress && !session.accountAddress) {
              try {
                const policy = await checkOnChainSessionPolicy(session.userAddress, session.sessionKeyAddress);
                probed = policy ? policy.isActive : null;
              } catch {
                probed = null;
              }
            }
            if (probed === null) return;
            if (session.onChainAuthorized === probed) return;
            session.onChainAuthorized = probed;
            session.updatedAt = new Date().toISOString();
            if (isSessionPersistenceEnabled()) {
              try {
                await supabase
                  .from('sessions')
                  .update({ on_chain_authorized: probed, updated_at: session.updatedAt })
                  .eq('id', session.id);
              } catch {}
            }
          } catch {}
        })
      );

      this.lastAuthRefreshAt = Date.now();
    })();

    this.authRefreshInFlight = task;
    try {
      await task;
    } finally {
      this.authRefreshInFlight = null;
    }
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

    // Single trade risk guardrail (bypassed if maxTradeSize is unlimited)
    if (session.maxTradeSize < UNLIMITED_AMOUNT && tradeCost > session.maxTradeSize) {
      return {
        allowed: false,
        reason: `Trade cost (${tradeCost.toFixed(2)} tUSDC) exceeds maximum trade size limit of ${session.maxTradeSize.toFixed(2)} tUSDC`,
      };
    }

    // Reset 24-hour window if 24 hours have elapsed since last reset
    if (now - session.lastSpendResetTimestamp > 24 * 3600 * 1000) {
      session.spentToday = 0;
      session.lastSpendResetTimestamp = now;
      session.updatedAt = new Date().toISOString();
      if (isSessionPersistenceEnabled()) {
        void supabase
          .from('sessions')
          .update({ spent_today: 0, updated_at: session.updatedAt })
          .eq('id', session.id);
      }
    }

    // Daily volume cap guardrail (bypassed if dailyVolumeCap is unlimited)
    if (session.dailyVolumeCap < UNLIMITED_AMOUNT && session.spentToday + tradeCost > session.dailyVolumeCap) {
      const remaining = Math.max(0, session.dailyVolumeCap - session.spentToday);
      return {
        allowed: false,
        reason: `Trade cost (${tradeCost.toFixed(2)} tUSDC) exceeds remaining daily volume cap of ${remaining.toFixed(2)} tUSDC (Spent: ${session.spentToday.toFixed(2)} / Cap: ${session.dailyVolumeCap.toFixed(2)} tUSDC)`,
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

    session.spentToday = Number((session.spentToday + tradeCost).toFixed(4));
    session.updatedAt = new Date().toISOString();

    if (isSessionPersistenceEnabled()) {
      try {
        await supabase
          .from('sessions')
          .update({ spent_today: session.spentToday, updated_at: session.updatedAt })
          .eq('id', session.id);
      } catch {
        // ignore
      }
    }

    return true;
  }

  /**
   * Updates or resets the exact spend amount for a session.
   */
  public updateSessionSpend(sessionId: string, amount: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.spentToday = Number(Math.max(0, amount).toFixed(4));
    session.updatedAt = new Date().toISOString();

    if (isSessionPersistenceEnabled()) {
      void supabase
        .from('sessions')
        .update({ spent_today: session.spentToday, updated_at: session.updatedAt })
        .eq('id', session.id);
    }

    return true;
  }

  /**
   * Revokes an active session immediately.
   */
  public async revokeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      if (!isSessionPersistenceEnabled()) return false;
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

    if (isSessionPersistenceEnabled()) {
      try {
        await supabase
          .from('sessions')
          .update({ is_active: false, updated_at: session.updatedAt })
          .eq('id', session.id);
      } catch (err) {
        console.warn('[SessionService] Could not persist revocation to DB:', err);
      }
    }

    return true;
  }
}

export const sessionService = new SessionService();
