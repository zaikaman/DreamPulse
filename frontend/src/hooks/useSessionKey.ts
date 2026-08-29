import { useState, useEffect, useCallback, useRef } from 'react';
import type { Address } from 'viem';
import { useAccount, useDisconnect, useSwitchChain } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import type { SessionGrant } from '../types/index.js';
import { apiClient } from '../services/api.js';
import { web3Service, SOMNIA_ADDRESSES, somniaShannonTestnet } from '../services/web3.js';
import { telemetryClient, type OrderFillData, type SweepCompleteData } from '../services/telemetry-client.js';
import { parseWeb3Error } from '../lib/errorUtils.js';
import { subscribeToPrivateTable } from '../services/supabase.js';
import { ensureSupabaseAuthForWallet, restoreSupabaseAuthIfCached, clearSupabaseAuthForLogout } from '../services/supabase-auth.js';
import type { RealtimeChannel } from '@supabase/supabase-js';


export interface WalletState {
  isConnected: boolean;
  address: Address | null;
  balanceSTT: string;
  balanceCollateral: string;
  chainId: number | null;
  isCorrectNetwork: boolean;
}

export interface UseSessionKeyReturn {
  wallet: WalletState;
  activeSession: SessionGrant | null;
  isLoading: boolean;
  isSigning: boolean;
  isFauceting: boolean;
  stepState: 'idle' | 'authorizing_onchain' | 'depositing_vault' | 'signing_eip712' | 'registering_backend';
  error: string | null;
  allowanceStatus: { allReady: boolean; checks: Array<{ pool: string; allowanceHuman: number; balanceHuman: number; vaultHuman: number; ready: boolean }>; guidance: string } | null;
  isFixingAllowance: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchNetwork: () => Promise<void>;
  claimCollateralFaucet: (amount?: number) => Promise<void>;
  createSession: (params: {
    maxTradeSize: number;
    dailyVolumeCap: number;
    durationHours: number;
    depositAmount?: number;
    targetPool?: Address;
    copyTradeEnabled?: boolean;
  }) => Promise<SessionGrant>;
  revokeSession: (options?: { onChain?: boolean }) => Promise<void>;
  refreshSession: () => Promise<void>;
  setSessionCopyTrade: (enabled: boolean) => void;
  ensureAllowances: () => Promise<void>;
  refreshAllowanceStatus: () => Promise<void>;
  clearError: () => void;
}

// SECURITY: SessionGrant is intentionally NOT persisted in localStorage.
// Previous implementation stored SessionGrant plaintext in localStorage (XSS -> session hijack).
// localStorage is readable by any injected script (XSS, malicious dependency, browser extension).
// Attacker could: steal SessionGrant, inject a forged never-expiring session, or hijack
// across tabs via localStorage sync. Re-hydrating on backend failure without expiry/wallet
// binding amplified the issue.
// Production fix:
//   • Single source of truth is backend getUserActiveSession() (service_role / JWT-bound RLS).
//   • Session lives only in React memory (useState) — zero bytes in localStorage / sessionStorage.
//   • Every mount, wallet change, focus/visibility, and storage tamper event re-validates via backend.
//   • Legacy key is purged on load and on every storage event. Expired / wallet-mismatched sessions
//     are rejected before state update. httpOnly cookie (see api.ts + backend wallet-auth.ts)
//     is the long-term hardening path for JWT/EIP auth; SessionGrant itself never needs JS-readable persistence.
const LEGACY_SESSION_KEY = 'dreampulse_active_session';
const LOCAL_WALLET_CONNECTED_KEY = 'dreampulse_wallet_connected';

/**
 * Returns true iff session is active, not expired, and bound to the expected wallet (if provided).
 * Defense: prevents XSS-injected or stale sessions from being accepted even if backend were spoofed.
 */
function isSessionValid(session: SessionGrant | null | undefined, expectedWallet?: Address | string | null): boolean {
  if (!session || !session.isActive) return false;
  if (!session.expiresAt) return false;
  const exp = new Date(session.expiresAt).getTime();
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;
  if (expectedWallet && session.userAddress) {
    try {
      if (session.userAddress.toLowerCase() !== String(expectedWallet).toLowerCase()) return false;
    } catch {
      return false;
    }
  }
  if (!session.id || !session.userAddress) return false;
  return true;
}

function purgeLegacySessionStorage(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    // One-time migration: remove any plaintext SessionGrant left by pre-fix builds
    if (localStorage.getItem(LEGACY_SESSION_KEY) !== null) {
      localStorage.removeItem(LEGACY_SESSION_KEY);
    }
  } catch {}
}

export function useSessionKey(): UseSessionKeyReturn {
  const { address: wagmiAddress, isConnected: wagmiIsConnected, chainId: wagmiChainId } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

  const [wallet, setWallet] = useState<WalletState>({
    isConnected: false,
    address: null,
    balanceSTT: '0.00',
    balanceCollateral: '0.00',
    chainId: null,
    isCorrectNetwork: false,
  });

  // SECURITY: memory-only. No localStorage hydration — prevents XSS from forging a session
  // by writing to localStorage before React mounts. Purge legacy key eagerly.
  const [activeSession, setActiveSession] = useState<SessionGrant | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [isFauceting, setIsFauceting] = useState<boolean>(false);
  const [isFixingAllowance, setIsFixingAllowance] = useState<boolean>(false);
  const [stepState, setStepState] = useState<
    'idle' | 'authorizing_onchain' | 'depositing_vault' | 'signing_eip712' | 'registering_backend'
  >('idle');
  const [error, setError] = useState<string | null>(null);
  const [allowanceStatus, setAllowanceStatus] = useState<{
    allReady: boolean;
    checks: Array<{ pool: string; allowanceHuman: number; balanceHuman: number; vaultHuman: number; ready: boolean }>;
    guidance: string;
  } | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Track the wallet we last validated for — used to detect mismatch/tamper
  const lastValidatedWalletRef = useRef<Address | null>(null);

  // Purge legacy plaintext storage once on mount (defense for users upgrading from vulnerable builds)
  useEffect(() => {
    purgeLegacySessionStorage();
  }, []);

  // Auto-expire in-memory session when wall clock passes expiresAt (prevents stale UI if backend poll lags)
  useEffect(() => {
    if (!activeSession?.expiresAt) return;
    const exp = new Date(activeSession.expiresAt).getTime();
    if (!Number.isFinite(exp)) return;
    const msUntilExpiry = exp - Date.now();
    if (msUntilExpiry <= 0) {
      setActiveSession(null);
      return;
    }
    // Re-check at expiry + every 60s as safety net against clock skew
    const timeout = window.setTimeout(() => setActiveSession(null), msUntilExpiry + 500);
    const interval = window.setInterval(() => {
      if (activeSession && new Date(activeSession.expiresAt).getTime() <= Date.now()) {
        setActiveSession(null);
      }
    }, 60_000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [activeSession?.expiresAt, activeSession?.id]);

  // Cross-tab tamper detection: if any tab (or XSS) writes to legacy session key, JWT keys,
  // or api-auth, force re-validation and purge. `storage` event fires in *other* tabs,
  // so we also proactively purge on visibility/focus (below) for same-tab XSS writes.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sensitiveKeys = new Set([
      LEGACY_SESSION_KEY,
      'dreampulse_supabase_jwt',
      'dreampulse_supabase_jwt_exp',
      'dreampulse_api_auth',
      LOCAL_WALLET_CONNECTED_KEY,
    ]);
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !sensitiveKeys.has(e.key)) return;
      // Any write to legacy session key is by definition tampering post-fix — purge and re-validate
      if (e.key === LEGACY_SESSION_KEY) {
        purgeLegacySessionStorage();
        // If attacker injected a forged session, ensure memory session is cleared unless backend confirms it
        // We trigger a re-fetch if we have a wallet; otherwise just clear
        if (wallet.address) {
          void fetchActiveSession(wallet.address).catch(() => {});
        } else {
          setActiveSession(null);
        }
        return;
      }
      // JWT / api-auth tampered or removed in another tab -> force re-validation
      // Clearing in another tab should log out this tab's session view
      if ((e.key === 'dreampulse_supabase_jwt' || e.key === 'dreampulse_api_auth') && e.newValue === null) {
        setActiveSession(null);
      }
      // If wallet-connected flag cleared cross-tab, treat as logout
      if (e.key === LOCAL_WALLET_CONNECTED_KEY && e.newValue === null) {
        setActiveSession(null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [wallet.address]);

  /**
   * Claims 1,000 TestUSDC collateral tokens from testnet faucet.
   */
  const claimCollateralFaucet = useCallback(async (amount: number = 1000) => {
    if (!wallet.address) {
      setError('Please connect your wallet first');
      return;
    }
    setError(null);
    setIsFauceting(true);
    try {
      await web3Service.claimTestUsdcFaucet(wallet.address, amount);
      await refreshBalances(wallet.address);
    } catch (err: any) {
      console.error('[useSessionKey] Faucet claim error:', err);
      const parsed = parseWeb3Error(err);
      setError(parsed.message);
      throw err;
    } finally {
      setIsFauceting(false);
    }
  }, [wallet.address]);

  /**
   * Refreshes balances for connected wallet.
   */
  const refreshBalances = useCallback(async (address: Address) => {
    try {
      const [stt, collateral] = await Promise.all([
        web3Service.getSTTBalance(address),
        web3Service.getCollateralBalance(address),
      ]);

      setWallet((prev) => ({
        ...prev,
        balanceSTT: parseFloat(stt).toFixed(4),
        balanceCollateral: parseFloat(collateral).toFixed(2),
      }));
    } catch (err) {
      console.warn('[useSessionKey] Balance fetch error:', err);
    }
  }, []);

  /**
   * Fetches allowance status for active copy-trade pools (to surface 0x3fb0ba2e fix).
   */
  const refreshAllowanceStatus = useCallback(async () => {
    if (!wallet.address) return;
    try {
      const res = await apiClient.getAllowanceStatus(wallet.address);
      if (res.success) {
        setAllowanceStatus({ allReady: res.allReady, checks: res.checks as any, guidance: res.guidance });
      }
    } catch (err) {
      console.warn('[useSessionKey] Allowance status fetch error:', err);
    }
  }, [wallet.address]);

  const ensureAllowances = useCallback(async () => {
    if (!wallet.address) throw new Error('Wallet not connected');
    setIsFixingAllowance(true);
    setError(null);
    try {
      await web3Service.ensureAllowancesForPools({ userAddress: wallet.address });
      await refreshAllowanceStatus();
      await refreshBalances(wallet.address);
    } catch (err: any) {
      const parsed = parseWeb3Error(err);
      setError(parsed.message);
      throw err;
    } finally {
      setIsFixingAllowance(false);
    }
  }, [wallet.address, refreshAllowanceStatus, refreshBalances]);

  /**
   * Fetches active session from backend API (service_role / RLS-hardened).
   * Direct Supabase reads for private tables are denied for anon (no RLS policy);
   * all reads must go through backend REST which uses service_role. See
   * supabase/migrations/012_harden_rls_policies.sql and
   * backend/src/config/schema.sql for security model.
   *
   * SECURITY: This is the sole source of truth. Never falls back to localStorage.
   * On backend failure we preserve the in-memory session only if it is still
   * valid (expiry + wallet binding); otherwise we clear. Legacy localStorage
   * is purged on every path.
   */
  const fetchActiveSession = useCallback(async (address: Address) => {
    purgeLegacySessionStorage();
    try {
      const data = await apiClient.getActiveSession(address);
      if (data?.success && data?.session) {
        const s = data.session;
        const grant: SessionGrant = {
          id: s.id,
          userAddress: (s.userAddress || address) as `0x${string}`,
          operatorAddress: (s.operatorAddress || SOMNIA_ADDRESSES.operatorAccount) as `0x${string}`,
          permissions: s.permissions || ['placeOrderFor', 'cancelOrderFor'],
          maxTradeSize: Number(s.maxTradeSize),
          dailyVolumeCap: Number(s.dailyVolumeCap),
          spentToday: Number(s.spentToday || 0),
          expiresAt: s.expiresAt,
          isActive: Boolean(s.isActive),
          onChainTxHash: s.onChainTxHash,
          vaultDepositAmount: s.vaultDepositAmount,
          targetPoolAddress: s.targetPoolAddress,
          onChainAuthorized: s.onChainAuthorized === true,
          copyTradeEnabled: Boolean(s.copyTradeEnabled),
        };

        if (isSessionValid(grant, address)) {
          lastValidatedWalletRef.current = address;
          setActiveSession(grant);
          return;
        }
      }
      // Backend confirmed: no valid session for this wallet
      lastValidatedWalletRef.current = address;
      setActiveSession(null);
    } catch (err) {
      console.warn('[useSessionKey] Failed fetching active session from backend API:', err);
      // Backend unreachable — do NOT re-hydrate from localStorage (XSS vector).
      // Keep in-memory session only if it is still valid for this wallet and not expired.
      // This prevents an attacker from offline-forging a localStorage entry and forcing a
      // re-hydration during a transient backend outage.
      setActiveSession((prev) => {
        if (prev && isSessionValid(prev, address)) {
          return prev;
        }
        return null;
      });
    }
  }, []);

  /**
   * Connects to Web3 wallet via RainbowKit modal (or direct injected fallback).
   */
  const connectWallet = useCallback(async () => {
    setError(null);
    if (openConnectModal) {
      openConnectModal();
      return;
    }

    setIsLoading(true);
    try {
      const { address, chainId } = await web3Service.connectWallet();
      const isCorrect = chainId === somniaShannonTestnet.id;

      localStorage.setItem(LOCAL_WALLET_CONNECTED_KEY, 'true');

      setWallet({
        isConnected: true,
        address,
        balanceSTT: '0.00',
        balanceCollateral: '0.00',
        chainId,
        isCorrectNetwork: isCorrect,
      });

      await refreshBalances(address);
      await fetchActiveSession(address);
      try { await refreshAllowanceStatus(); } catch {}
    } catch (err: any) {
      const parsed = parseWeb3Error(err);
      setError(parsed.message);
    } finally {
      setIsLoading(false);
    }
  }, [openConnectModal, refreshBalances, fetchActiveSession, refreshAllowanceStatus]);

  /**
   * Disconnects current wallet via Wagmi.
   * Also clears httpOnly cookies via backend POST /auth/logout (defense: ensures
   * even if localStorage is cleared, the HttpOnly dreampulse_jwt cannot be reused).
   */
  const disconnectWallet = useCallback(() => {
    try {
      wagmiDisconnect();
    } catch {}
    try { localStorage.removeItem(LOCAL_WALLET_CONNECTED_KEY); } catch {}
    purgeLegacySessionStorage();
    // Clear httpOnly JWT/session cookies (fire-and-forget; best-effort)
    void apiClient.logout().catch(() => {});
    void clearSupabaseAuthForLogout().catch(() => {});
    lastValidatedWalletRef.current = null;
    setWallet({
      isConnected: false,
      address: null,
      balanceSTT: '0.00',
      balanceCollateral: '0.00',
      chainId: null,
      isCorrectNetwork: false,
    });
    setActiveSession(null);
    setAllowanceStatus(null);
  }, [wagmiDisconnect]);

  /**
   * Switches network to Somnia Shannon testnet via Wagmi.
   */
  const switchNetwork = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (switchChainAsync) {
        await switchChainAsync({ chainId: somniaShannonTestnet.id });
      } else {
        await web3Service.switchOrAddSomniaTestnet();
      }
      setWallet((prev) => ({
        ...prev,
        chainId: somniaShannonTestnet.id,
        isCorrectNetwork: true,
      }));
    } catch (err: any) {
      const parsed = parseWeb3Error(err);
      setError(parsed.message);
    } finally {
      setIsLoading(false);
    }
  }, [switchChainAsync]);


  /**
   * Full non-custodial session onboarding with on-chain operator permissions & vault setup.
   */
  const createSession = useCallback(
    async (params: {
      maxTradeSize: number;
      dailyVolumeCap: number;
      durationHours: number;
      depositAmount?: number;
      targetPool?: Address;
      copyTradeEnabled?: boolean;
    }): Promise<SessionGrant> => {
      if (!wallet.isConnected || !wallet.address) {
        throw new Error('Please connect your Web3 wallet first.');
      }

      setIsSigning(true);
      setError(null);

      let onChainTxHash: `0x${string}` | undefined;

      try {
        // Step 1: On-Chain Operator & TestUSDC Authorization
        setStepState('authorizing_onchain');
        try {
          const batchHash = await web3Service.batchSingleApproveAndGlobal({ userAddress: wallet.address });
          if (batchHash) onChainTxHash = batchHash;
        } catch (e: any) {
          if (String(e?.message || '').includes('User rejected') || String(e?.message || '').includes('rejected')) {
            throw e;
          }
          console.warn('[useSessionKey] batchSingleApproveAndGlobal notice:', e.message);
        }

        // Optional: Collateral vault deposit — only for SpotPools, BinaryPools use allowance only
        if (params.depositAmount && params.depositAmount > 0 && params.targetPool) {
          setStepState('depositing_vault');
          await web3Service.setupPoolVault({
            userAddress: wallet.address,
            pool: params.targetPool,
            token: SOMNIA_ADDRESSES.testUsdc,
            amount: params.depositAmount,
          });
        }

        // Step 2: Sign EIP-712 structured data in user's wallet for risk ceilings
        setStepState('signing_eip712');
        const now = Date.now();
        const expiresAt = new Date(now + params.durationHours * 3600 * 1000).toISOString();
        const deadline = Math.floor(new Date(expiresAt).getTime() / 1000);
        const nonce = 0;

        const signature = await web3Service.signSessionDelegation({
          delegator: wallet.address,
          operator: SOMNIA_ADDRESSES.operatorAccount,
          maxTradeSize: params.maxTradeSize,
          dailyVolumeCap: params.dailyVolumeCap,
          nonce,
          deadline,
        });

        // Register session on backend
        setStepState('registering_backend');
        const res = await apiClient.registerSession({
          userAddress: wallet.address,
          operatorAddress: SOMNIA_ADDRESSES.operatorAccount,
          maxTradeSize: params.maxTradeSize,
          dailyVolumeCap: params.dailyVolumeCap,
          expiresAt,
          signature,
          onChainTxHash,
          vaultDepositAmount: params.depositAmount,
          targetPoolAddress: params.targetPool,
          onChainAuthorized: true,
          copyTradeEnabled: params.copyTradeEnabled,
        });

        const createdSession: SessionGrant = {
          id: res.session.id,
          userAddress: wallet.address,
          operatorAddress: SOMNIA_ADDRESSES.operatorAccount,
          permissions: ['placeOrderFor', 'cancelOrderFor'],
          maxTradeSize: params.maxTradeSize,
          dailyVolumeCap: params.dailyVolumeCap,
          spentToday: 0,
          expiresAt,
          isActive: true,
          onChainTxHash,
          vaultDepositAmount: params.depositAmount,
          targetPoolAddress: params.targetPool,
          onChainAuthorized: true,
          copyTradeEnabled: params.copyTradeEnabled ?? false,
        };

        if (!isSessionValid(createdSession, wallet.address)) {
          throw new Error('Created session failed validation (expired or wallet mismatch)');
        }
        setActiveSession(createdSession);
        await refreshBalances(wallet.address);

        return createdSession;
      } catch (err: any) {
        const parsed = parseWeb3Error(err);
        setError(parsed.message);
        throw err;
      } finally {
        setIsSigning(false);
        setStepState('idle');
      }
    },
    [wallet.isConnected, wallet.address, refreshBalances]
  );

  /**
   * Revokes the active session grant both on-chain and in backend.
   */
  const revokeSession = useCallback(
    async (options?: { onChain?: boolean }) => {
      if (!activeSession) return;
      setIsLoading(true);
      setError(null);

      try {
        const shouldRevokeOnChain = options && typeof options.onChain === 'boolean' ? options.onChain : true;
        if (shouldRevokeOnChain && wallet.address) {
          await web3Service.revokeOperatorOnChain({
            userAddress: wallet.address,
            operator: SOMNIA_ADDRESSES.operatorAccount,
            pool: activeSession.targetPoolAddress,
          });
        }
        await apiClient.revokeSession(activeSession.id);
        setActiveSession(null);
        purgeLegacySessionStorage();
      } catch (err: any) {
        const parsed = parseWeb3Error(err);
        setError(parsed.message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [activeSession, wallet.address]
  );

  const refreshSession = useCallback(async () => {
    if (wallet.address) {
      await refreshBalances(wallet.address);
      await fetchActiveSession(wallet.address);
      await refreshAllowanceStatus().catch(() => {});
    }
  }, [wallet.address, refreshBalances, fetchActiveSession, refreshAllowanceStatus]);

  // Synchronize state when Wagmi account or chain changes (mobile WalletConnect, extension, etc.)
  useEffect(() => {
    if (wagmiIsConnected && wagmiAddress) {
      const userAddr = wagmiAddress as Address;
      const isCorrect = wagmiChainId === somniaShannonTestnet.id;
      try { localStorage.setItem(LOCAL_WALLET_CONNECTED_KEY, 'true'); } catch {}

      setWallet((prev) => {
        if (
          prev.isConnected &&
          prev.address?.toLowerCase() === userAddr.toLowerCase() &&
          prev.chainId === (wagmiChainId ?? prev.chainId) &&
          prev.isCorrectNetwork === isCorrect
        ) {
          return prev;
        }
        return {
          ...prev,
          isConnected: true,
          address: userAddr,
          chainId: wagmiChainId ?? somniaShannonTestnet.id,
          isCorrectNetwork: isCorrect,
        };
      });

      // Wallet switch must re-validate session binding — never reuse previous wallet's session
      if (lastValidatedWalletRef.current && lastValidatedWalletRef.current.toLowerCase() !== userAddr.toLowerCase()) {
        setActiveSession(null);
      }
      refreshBalances(userAddr);
      fetchActiveSession(userAddr);
      refreshAllowanceStatus().catch(() => {});
    } else if (!wagmiIsConnected) {
      const wasConnected = (() => {
        try { return localStorage.getItem(LOCAL_WALLET_CONNECTED_KEY) === 'true'; } catch { return false; }
      })();
      if (wasConnected) {
        try { localStorage.removeItem(LOCAL_WALLET_CONNECTED_KEY); } catch {}
        purgeLegacySessionStorage();
      }
      lastValidatedWalletRef.current = null;
      setWallet({
        isConnected: false,
        address: null,
        balanceSTT: '0.00',
        balanceCollateral: '0.00',
        chainId: null,
        isCorrectNetwork: false,
      });
      setActiveSession(null);
      setAllowanceStatus(null);
    }
  }, [wagmiIsConnected, wagmiAddress, wagmiChainId, refreshBalances, fetchActiveSession, refreshAllowanceStatus]);

  // Extra safety: Wallet event subscriptions for injected providers
  useEffect(() => {
    const unsubscribe = web3Service.subscribeToWalletEvents({
      onAccountsChanged: (accounts) => {
        if (!accounts || accounts.length === 0) {
          disconnectWallet();
        } else {
          const newAddress = accounts[0] as Address;
          // Address change invalidates previous session
          setActiveSession(null);
          lastValidatedWalletRef.current = null;
          setWallet((prev) => ({
            ...prev,
            isConnected: true,
            address: newAddress,
          }));
          refreshBalances(newAddress);
          fetchActiveSession(newAddress);
          refreshAllowanceStatus().catch(() => {});
        }
      },
      onChainChanged: (chainIdHex) => {
        const chainId = parseInt(chainIdHex, 16);
        setWallet((prev) => ({
          ...prev,
          chainId,
          isCorrectNetwork: chainId === somniaShannonTestnet.id,
        }));
      },
      onDisconnect: () => {
        disconnectWallet();
      },
    });

    return () => unsubscribe();
  }, [disconnectWallet, refreshBalances, fetchActiveSession, refreshAllowanceStatus]);

  const setSessionCopyTrade = useCallback((enabled: boolean) => {
    setActiveSession((prev) => {
      if (!prev) return null;
      // Validate before updating — prevent stale/expired session from being mutated
      if (!isSessionValid(prev)) return null;
      const updated = { ...prev, copyTradeEnabled: enabled };
      return updated;
    });
  }, []);

  // Listen to cross-component session update events (memory-only, no localStorage)
  useEffect(() => {
    const handleSessionUpdate = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (typeof detail?.copyTradeEnabled === 'boolean') {
        setActiveSession((prev) => {
          if (!prev) return null;
          if (!isSessionValid(prev)) return null;
          const updated = { ...prev, copyTradeEnabled: detail.copyTradeEnabled };
          return updated;
        });
      }
    };
    window.addEventListener('dreampulse:session-update', handleSessionUpdate);
    return () => window.removeEventListener('dreampulse:session-update', handleSessionUpdate);
  }, []);

  // Restore cached Supabase JWT on mount (avoids extra prompt if still valid)
  useEffect(() => {
    restoreSupabaseAuthIfCached().catch(() => {});
  }, []);

  // Authenticated Supabase Realtime for private `sessions` — uses JWT with
  // `user_address` claim (POST /api/v1/auth/wallet-verify → setSupabaseAuth).
  // Filter `user_address=eq.<lower>` ensures RLS owner check passes.
  // Falls back to polling below if JWT not configured or user rejects signature.
  useEffect(() => {
    if (!wallet.address) return;
    const lower = wallet.address.toLowerCase();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    (async () => {
      // Mint or reuse JWT — prompts one EIP-712 Auth signature per 24h
      await ensureSupabaseAuthForWallet(wallet.address as Address).catch(() => null);
      if (cancelled) return;
      // Subscribe filtered — even without JWT it degrades to polling, but with JWT it pushes instantly
      channel = subscribeToPrivateTable<any>(
        'sessions',
        lower,
        // onInsert
        (newRow: any) => {
          if (!newRow || !newRow.user_address || newRow.user_address.toLowerCase() !== lower) return;
          if (newRow.is_active && new Date(newRow.expires_at).getTime() > Date.now()) {
            const updated: SessionGrant = {
              id: newRow.id,
              userAddress: newRow.user_address,
              operatorAddress: newRow.operator_address,
              permissions: newRow.permissions || ['placeOrderFor', 'cancelOrderFor'],
              maxTradeSize: Number(newRow.max_trade_size),
              dailyVolumeCap: Number(newRow.daily_volume_cap),
              spentToday: Number(newRow.spent_today || 0),
              expiresAt: newRow.expires_at,
              isActive: newRow.is_active,
              onChainTxHash: newRow.on_chain_tx_hash,
              vaultDepositAmount: newRow.vault_deposit_amount,
              targetPoolAddress: newRow.target_pool_address,
              onChainAuthorized: newRow.on_chain_authorized === true,
              copyTradeEnabled: newRow.copy_trade_enabled === true,
            };
            if (isSessionValid(updated, lower)) {
              setActiveSession(updated);
            }
          }
        },
        // onUpdate
        (updatedRow: any) => {
          if (!updatedRow || !updatedRow.user_address || updatedRow.user_address.toLowerCase() !== lower) return;
          if (updatedRow.is_active && new Date(updatedRow.expires_at).getTime() > Date.now()) {
            const updated: SessionGrant = {
              id: updatedRow.id,
              userAddress: updatedRow.user_address,
              operatorAddress: updatedRow.operator_address,
              permissions: updatedRow.permissions || ['placeOrderFor', 'cancelOrderFor'],
              maxTradeSize: Number(updatedRow.max_trade_size),
              dailyVolumeCap: Number(updatedRow.daily_volume_cap),
              spentToday: Number(updatedRow.spent_today || 0),
              expiresAt: updatedRow.expires_at,
              isActive: updatedRow.is_active,
              onChainTxHash: updatedRow.on_chain_tx_hash,
              vaultDepositAmount: updatedRow.vault_deposit_amount,
              targetPoolAddress: updatedRow.target_pool_address,
              onChainAuthorized: updatedRow.on_chain_authorized === true,
              copyTradeEnabled: updatedRow.copy_trade_enabled === true,
            };
            if (isSessionValid(updated, lower)) {
              setActiveSession(updated);
            } else {
              setActiveSession(null);
            }
          } else if (!updatedRow.is_active) {
            setActiveSession(null);
          }
        },
        // onDelete
        () => {
          setActiveSession(null);
        },
      );
    })();

    return () => {
      cancelled = true;
      if (channel) channel.unsubscribe();
    };
  }, [wallet.address]);

  // Polling fallback while JWT not yet minted or backend not configured — keeps
  // cross-tab sync without Supabase. With JWT + filtered channel this is just a safety net.
  // Also re-validates on every mount, focus, and visibility change (production requirement).
  useEffect(() => {
    if (!wallet.address) return;
    const targetAddr = wallet.address;
    // Immediate re-validation on mount (covers remount, tab restore, and XSS-forged localStorage)
    void fetchActiveSession(targetAddr).catch(() => {});
    const poll = () => fetchActiveSession(targetAddr).catch(() => {});
    const interval = setInterval(poll, 20000);
    const onFocus = () => poll();
    const onVis = () => { if (document.visibilityState === 'visible') poll(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [wallet.address, fetchActiveSession]);

  // Real-time balance/session updates via telemetry WebSocket events + heartbeat
  useEffect(() => {
    if (!wallet.isConnected || !wallet.address) return;
    const targetAddr = wallet.address;

    let debounceTimer: number | null = null;
    const scheduleRefresh = (delay = 400) => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        refreshBalances(targetAddr).catch(() => {});
      }, delay);
    };
    let sessionDebounce: number | null = null;
    const scheduleSessionRefresh = (delay = 400) => {
      if (sessionDebounce) window.clearTimeout(sessionDebounce);
      sessionDebounce = window.setTimeout(() => {
        fetchActiveSession(targetAddr).catch(() => {});
      }, delay);
    };

    // 1. WebSocket event triggers for instant balance + session updates
    const unsubOrder = telemetryClient.on('order_filled', (order: OrderFillData) => {
      if (!order.userAddress || order.userAddress.toLowerCase() === targetAddr.toLowerCase()) {
        scheduleRefresh(300);
        scheduleSessionRefresh(350);
      }
    });

    const unsubSweep = telemetryClient.on('sweep_completed', (sweep: SweepCompleteData) => {
      if (!sweep.userAddress || sweep.userAddress.toLowerCase() === targetAddr.toLowerCase()) {
        scheduleRefresh(300);
      }
    });

    const unsubPnl = telemetryClient.on('pnl_update', () => {
      scheduleRefresh(500);
    });

    // 2. Periodic 15-second background sync
    const interval = setInterval(() => {
      refreshBalances(targetAddr).catch(() => {});
    }, 15000);

    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      if (sessionDebounce) window.clearTimeout(sessionDebounce);
      clearInterval(interval);
      unsubOrder();
      unsubSweep();
      unsubPnl();
    };
  }, [wallet.isConnected, wallet.address, refreshBalances, fetchActiveSession]);

  // Keep allowance status fresh while wallet is connected
  useEffect(() => {
    if (!wallet.isConnected || !wallet.address || !wallet.isCorrectNetwork) return;
    refreshAllowanceStatus().catch(() => {});
    const id = setInterval(() => refreshAllowanceStatus().catch(() => {}), 30000);
    return () => clearInterval(id);
  }, [wallet.isConnected, wallet.address, wallet.isCorrectNetwork, refreshAllowanceStatus]);

  return {
    wallet,
    activeSession,
    isLoading,
    isSigning,
    isFauceting,
    isFixingAllowance,
    stepState,
    error,
    allowanceStatus,
    connectWallet,
    disconnectWallet,
    switchNetwork,
    claimCollateralFaucet,
    createSession,
    revokeSession,
    refreshSession,
    setSessionCopyTrade,
    ensureAllowances,
    refreshAllowanceStatus,
    clearError,
  };
}
