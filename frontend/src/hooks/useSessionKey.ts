import { useState, useEffect, useCallback } from 'react';
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

const LOCAL_SESSION_KEY = 'dreampulse_active_session';
const LOCAL_WALLET_CONNECTED_KEY = 'dreampulse_wallet_connected';

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


  const [activeSession, setActiveSession] = useState<SessionGrant | null>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (new Date(parsed.expiresAt).getTime() > Date.now() && parsed.isActive) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return null;
  });

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
   */
  const fetchActiveSession = useCallback(async (address: Address) => {
    let sessionFound: SessionGrant | null = null;
    let backendSuccess = false;

    try {
      const data = await apiClient.getActiveSession(address);
      backendSuccess = true;
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

        if (new Date(grant.expiresAt).getTime() > Date.now() && grant.isActive) {
          sessionFound = grant;
        }
      }
    } catch (err) {
      console.warn('[useSessionKey] Failed fetching active session from backend API:', err);
    }

    if (sessionFound) {
      setActiveSession(sessionFound);
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(sessionFound));
      return;
    }

    if (backendSuccess) {
      setActiveSession(null);
      localStorage.removeItem(LOCAL_SESSION_KEY);
    } else {
      // Backend unreachable — keep localStorage session only if it is still valid for this wallet
      try {
        const saved = localStorage.getItem(LOCAL_SESSION_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (
            parsed?.userAddress &&
            parsed.userAddress.toLowerCase() === address.toLowerCase() &&
            parsed.isActive &&
            new Date(parsed.expiresAt).getTime() > Date.now()
          ) {
            setActiveSession(parsed);
            return;
          }
        }
      } catch {}
      setActiveSession(null);
      localStorage.removeItem(LOCAL_SESSION_KEY);
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
   */
  const disconnectWallet = useCallback(() => {
    try {
      wagmiDisconnect();
    } catch {}
    localStorage.removeItem(LOCAL_WALLET_CONNECTED_KEY);
    localStorage.removeItem(LOCAL_SESSION_KEY);
    void clearSupabaseAuthForLogout().catch(() => {});
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

        setActiveSession(createdSession);
        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(createdSession));
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
        localStorage.removeItem(LOCAL_SESSION_KEY);
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
      localStorage.setItem(LOCAL_WALLET_CONNECTED_KEY, 'true');

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

      refreshBalances(userAddr);
      fetchActiveSession(userAddr);
      refreshAllowanceStatus().catch(() => {});
    } else if (!wagmiIsConnected) {
      const wasConnected = localStorage.getItem(LOCAL_WALLET_CONNECTED_KEY) === 'true';
      if (wasConnected) {
        localStorage.removeItem(LOCAL_WALLET_CONNECTED_KEY);
        localStorage.removeItem(LOCAL_SESSION_KEY);
      }
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
      const updated = { ...prev, copyTradeEnabled: enabled };
      try {
        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(updated));
      } catch (err) {
        console.warn('[useSessionKey] Failed to update localStorage for session copyTrade:', err);
      }
      return updated;
    });
  }, []);

  // Listen to cross-component session update events
  useEffect(() => {
    const handleSessionUpdate = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (typeof detail?.copyTradeEnabled === 'boolean') {
        setActiveSession((prev) => {
          if (!prev) return null;
          const updated = { ...prev, copyTradeEnabled: detail.copyTradeEnabled };
          try {
            localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(updated));
          } catch {}
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
            setActiveSession(updated);
            try { localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(updated)); } catch {}
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
            setActiveSession(updated);
            try { localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(updated)); } catch {}
          } else if (!updatedRow.is_active) {
            setActiveSession(null);
            try { localStorage.removeItem(LOCAL_SESSION_KEY); } catch {}
          }
        },
        // onDelete
        () => {
          setActiveSession(null);
          try { localStorage.removeItem(LOCAL_SESSION_KEY); } catch {}
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
  useEffect(() => {
    if (!wallet.address) return;
    const targetAddr = wallet.address;
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
