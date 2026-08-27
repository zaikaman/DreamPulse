import { useState, useEffect, useCallback } from 'react';
import type { Address } from 'viem';
import type { SessionGrant } from '../types/index.js';
import { apiClient } from '../services/api.js';
import { supabase } from '../services/supabase.js';
import { web3Service, SOMNIA_ADDRESSES, somniaShannonTestnet } from '../services/web3.js';
import { telemetryClient, type OrderFillData, type SweepCompleteData } from '../services/telemetry-client.js';
import { parseWeb3Error } from '../lib/errorUtils.js';

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
  }) => Promise<SessionGrant>;
  revokeSession: (options?: { onChain?: boolean }) => Promise<void>;
  refreshSession: () => Promise<void>;
  ensureAllowances: () => Promise<void>;
  refreshAllowanceStatus: () => Promise<void>;
  clearError: () => void;
}

const LOCAL_SESSION_KEY = 'dreampulse_active_session';
const LOCAL_WALLET_CONNECTED_KEY = 'dreampulse_wallet_connected';

export function useSessionKey(): UseSessionKeyReturn {
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
   * Fetches active session from backend API and Supabase.
   */
  const fetchActiveSession = useCallback(async (address: Address) => {
    let sessionFound: SessionGrant | null = null;
    let backendSuccess = false;

    // 1. Fetch from Backend API via apiClient (handles configured backend URL)
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
        };

        if (new Date(grant.expiresAt).getTime() > Date.now() && grant.isActive) {
          sessionFound = grant;
        }
      }
    } catch (err) {
      console.warn('[useSessionKey] Failed fetching active session from backend API:', err);
    }

    // 2. Fallback: check Supabase directly if not found from backend
    if (!sessionFound) {
      try {
        const { data } = await supabase
          .from('sessions')
          .select('*')
          .ilike('user_address', address)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1);

        if (data && data.length > 0) {
          const row = data[0];
          if (new Date(row.expires_at).getTime() > Date.now()) {
            sessionFound = {
              id: row.id,
              userAddress: row.user_address,
              operatorAddress: row.operator_address,
              permissions: row.permissions || ['placeOrderFor', 'cancelOrderFor'],
              maxTradeSize: Number(row.max_trade_size),
              dailyVolumeCap: Number(row.daily_volume_cap),
              spentToday: Number(row.spent_today || 0),
              expiresAt: row.expires_at,
              isActive: row.is_active,
              onChainTxHash: row.on_chain_tx_hash,
              vaultDepositAmount: row.vault_deposit_amount,
              targetPoolAddress: row.target_pool_address,
              onChainAuthorized: row.on_chain_authorized === true,
            };
          }
        }
      } catch (err) {
        console.warn('[useSessionKey] Supabase fallback error:', err);
      }
    }

    if (sessionFound) {
      setActiveSession(sessionFound);
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(sessionFound));
      return;
    }

    // 3. If neither backend nor Supabase returned a session:
    // If backend was reached and explicitly reported no active session (and DB had none):
    if (backendSuccess) {
      setActiveSession(null);
      localStorage.removeItem(LOCAL_SESSION_KEY);
    } else {
      // If network failed, check if localStorage has a valid unexpired session for this wallet
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
   * Connects to Web3 wallet.
   */
  const connectWallet = useCallback(async () => {
    setIsLoading(true);
    setError(null);
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
      // Probe per-pool allowance so UI can surface 0x3fb0ba2e fix banner
      try { await refreshAllowanceStatus(); } catch {}
    } catch (err: any) {
      const parsed = parseWeb3Error(err);
      setError(parsed.message);
    } finally {
      setIsLoading(false);
    }
  }, [refreshBalances, fetchActiveSession, refreshAllowanceStatus]);

  /**
   * Disconnects current wallet.
   */
  const disconnectWallet = useCallback(() => {
    localStorage.removeItem(LOCAL_WALLET_CONNECTED_KEY);
    localStorage.removeItem(LOCAL_SESSION_KEY);
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
  }, []);

  /**
   * Switches network to Somnia Shannon testnet.
   */
  const switchNetwork = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await web3Service.switchOrAddSomniaTestnet();
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
  }, []);

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
    }): Promise<SessionGrant> => {
      if (!wallet.isConnected || !wallet.address) {
        throw new Error('Please connect your Web3 wallet first.');
      }

      setIsSigning(true);
      setError(null);

      let onChainTxHash: `0x${string}` | undefined;

      try {
        // Step 1: 1 batch for approve(operator,MAX)+global+per-pool(7d) via EIP-5792/7702
        setStepState('authorizing_onchain');
        let futurePools: Address[] = [];
        try {
          const futureRes = await apiClient.getFuturePools({ horizonHours: 168 }).catch(() => null);
          if (futureRes?.pools?.length) futurePools = futureRes.pools.slice(0, 80) as Address[];
        } catch {}
        try {
          const batchHash = await web3Service.batchSingleApproveAndGlobal({ userAddress: wallet.address, pools: futurePools });
          if (batchHash) onChainTxHash = batchHash;
        } catch (e: any) {
          if (String(e?.message || '').includes('User rejected')) throw e;
          console.warn('[useSessionKey] batchSingleApproveAndGlobal notice:', e.message);
          try {
            const opHash = await web3Service.approveOperatorForTestUsdc({ userAddress: wallet.address });
            if (opHash) onChainTxHash = opHash;
          } catch (ee: any) {
            if (String(ee?.message || '').includes('User rejected')) throw ee;
          }
          try {
            const isAuth = await web3Service.isOperatorAuthorized({ owner: wallet.address, operator: SOMNIA_ADDRESSES.operatorAccount });
            if (!isAuth) {
              const res = await web3Service.grantOperatorGlobal({ userAddress: wallet.address, operator: SOMNIA_ADDRESSES.operatorAccount, approved: true });
              onChainTxHash = res.hash;
            }
          } catch (ee: any) {
            if (String(ee?.message || '').includes('User rejected')) throw ee;
          }
          if (futurePools.length > 0) {
            try {
              await web3Service.batchAuthorizeAndApprovePools({ userAddress: wallet.address, pools: futurePools });
            } catch {}
          }
        }
        // Delegate EOA to Batch helper for future per-pool isApprovedForPool without further clicks (EIP-7702, executor:self)
        try {
          const code = await (web3Service as any).isDelegatedToBatch?.(wallet.address);
          if (!code) {
            await (web3Service as any).delegateToBatch?.(wallet.address).catch(() => {});
          }
        } catch {}

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
        if (options?.onChain && wallet.address) {
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

  // Auto-reconnect on mount if previously connected in localStorage
  useEffect(() => {
    let isMounted = true;

    async function autoReconnect() {
      const wasConnected = localStorage.getItem(LOCAL_WALLET_CONNECTED_KEY) === 'true';
      if (!wasConnected) return;

      try {
        const auth = await web3Service.getAuthorizedAccount();
        if (!auth || !isMounted) return;

        const isCorrect = auth.chainId === somniaShannonTestnet.id;
        setWallet({
          isConnected: true,
          address: auth.address,
          balanceSTT: '0.00',
          balanceCollateral: '0.00',
          chainId: auth.chainId,
          isCorrectNetwork: isCorrect,
        });

        await refreshBalances(auth.address);
        await fetchActiveSession(auth.address);
        await refreshAllowanceStatus().catch(() => {});
      } catch (err) {
        console.warn('[useSessionKey] Auto-reconnect notice:', err);
      }
    }

    autoReconnect();

    return () => {
      isMounted = false;
    };
  }, [refreshBalances, fetchActiveSession, refreshAllowanceStatus]);

  // Wallet event subscriptions
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
  }, [disconnectWallet, refreshBalances, fetchActiveSession]);

  // Supabase Realtime subscription for sessions table
  useEffect(() => {
    if (!wallet.address) return;

    const channel = supabase
      .channel(`public:sessions:${wallet.address.toLowerCase()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sessions',
          filter: `user_address=eq.${wallet.address}`,
        },
        (payload: { eventType: string; new: any; old: any }) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const row = payload.new;
            if (row && row.is_active && new Date(row.expires_at).getTime() > Date.now()) {
              const updated: SessionGrant = {
                id: row.id,
                userAddress: row.user_address,
                operatorAddress: row.operator_address,
                permissions: row.permissions || ['placeOrderFor', 'cancelOrderFor'],
                maxTradeSize: Number(row.max_trade_size),
                dailyVolumeCap: Number(row.daily_volume_cap),
                spentToday: Number(row.spent_today || 0),
                expiresAt: row.expires_at,
                isActive: row.is_active,
              };
              setActiveSession(updated);
              localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(updated));
            } else if (row && !row.is_active) {
              setActiveSession(null);
              localStorage.removeItem(LOCAL_SESSION_KEY);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [wallet.address]);

  // Real-time balance updates via telemetry WebSocket events + heartbeat
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

    // 1. WebSocket event triggers for instant balance updates
    const unsubOrder = telemetryClient.on('order_filled', (order: OrderFillData) => {
      if (!order.userAddress || order.userAddress.toLowerCase() === targetAddr.toLowerCase()) {
        scheduleRefresh(300);
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
      clearInterval(interval);
      unsubOrder();
      unsubSweep();
      unsubPnl();
    };
  }, [wallet.isConnected, wallet.address, refreshBalances]);

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
    ensureAllowances,
    refreshAllowanceStatus,
    clearError,
  };
}
