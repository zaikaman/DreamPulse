import { useState, useEffect, useCallback } from 'react';
import type { Address } from 'viem';
import type { SessionGrant } from '../types/index.js';
import { apiClient } from '../services/api.js';
import { supabase } from '../services/supabase.js';
import { web3Service, SOMNIA_ADDRESSES, somniaShannonTestnet } from '../services/web3.js';

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
      setError(err?.message || 'Failed to claim TestUSDC faucet');
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
      // Prefer 24h future pool set (Listed + FreePools) so next windows are already approved
      let pools: Address[] = [];
      try {
        const futureRes = await apiClient.getFuturePools();
        if (futureRes?.pools?.length) pools = futureRes.pools.slice(0, 80) as Address[];
      } catch {}
      if (pools.length === 0) {
        const marketsRes = await apiClient.getMarkets({ status: 'Open' });
        pools = [...new Set((marketsRes.data || []).map((m: any) => m.poolAddress).filter(Boolean))] as Address[];
        pools = pools.slice(0, 15) as Address[];
      }
      if (pools.length === 0) throw new Error('No pools discovered for 24h horizon');
      // Batch via EIP-5792 (1 popup for N pools)
      await web3Service.ensureAllowancesForPools({ userAddress: wallet.address, pools });
      await refreshAllowanceStatus();
      await refreshBalances(wallet.address);
    } catch (err: any) {
      setError(err.message || 'Failed to fix allowances');
      throw err;
    } finally {
      setIsFixingAllowance(false);
    }
  }, [wallet.address, refreshAllowanceStatus]);

  /**
   * Fetches active session from backend API and Supabase.
   */
  const fetchActiveSession = useCallback(async (address: Address) => {
    try {
      const res = await fetch(`/api/v1/sessions/${encodeURIComponent(address)}?active=true`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.session) {
          const s = data.session;
          const sessionGrant: SessionGrant = {
            id: s.id,
            userAddress: s.userAddress as `0x${string}`,
            operatorAddress: s.operatorAddress as `0x${string}`,
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

          if (new Date(sessionGrant.expiresAt).getTime() > Date.now() && sessionGrant.isActive) {
            setActiveSession(sessionGrant);
            localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(sessionGrant));
            return;
          }
        }
      }
    } catch (err) {
      console.warn('[useSessionKey] Failed fetching active session from backend:', err);
    }

    // Fallback: check Supabase directly
    try {
      const { data } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_address', address)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const row = data[0];
        if (new Date(row.expires_at).getTime() > Date.now()) {
          const sessionGrant: SessionGrant = {
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
          setActiveSession(sessionGrant);
          localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(sessionGrant));
          return;
        }
      }
    } catch {
      // ignore
    }

    setActiveSession(null);
    localStorage.removeItem(LOCAL_SESSION_KEY);
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
      setError(err.message || 'Failed to connect wallet');
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
      setError(err.message || 'Failed to switch network');
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
        // Step 1+2b (batched): On-chain operator approval + TestUSDC allowances to ALL future pools (24h horizon) in ONE wallet popup (EIP-5792)
        // Covers Listed + FreePools so next 5m windows don't need another click
        setStepState('authorizing_onchain');
        let poolsForBatch: Address[] = [];
        if (!params.targetPool) {
          try {
            const futureRes = await apiClient.getFuturePools().catch(() => null);
            if (futureRes?.pools?.length) {
              poolsForBatch = futureRes.pools.slice(0, 80) as Address[];
            } else {
              const marketsRes = await apiClient.getMarkets({ status: 'Open' });
              poolsForBatch = [...new Set(
                (marketsRes.data || [])
                  .map((m: any) => m.poolAddress)
                  .filter((p: string | undefined) => p && p.startsWith('0x') && p !== SOMNIA_ADDRESSES.binaryModule)
              )] as Address[];
              poolsForBatch = poolsForBatch.slice(0, 15);
            }
          } catch {}
        } else {
          poolsForBatch = [params.targetPool as Address];
        }

        // Try single batch for operator + all pool approvals (1 click)
        if (poolsForBatch.length > 0 || !params.targetPool) {
          try {
            const batchRes = await web3Service.batchAuthorizeAndApprovePools({
              userAddress: wallet.address,
              pools: poolsForBatch,
            });
            onChainTxHash = batchRes.operatorHash || batchRes.allowanceHashes[0];
            // If operator was already approved and no pool needed approval, batch returns empty — fallback to check
            if (!onChainTxHash) {
              // No on-chain write needed (already approved) — keep undefined, backend will verify via isGloballyApproved
              onChainTxHash = undefined;
            }
          } catch (batchErr: any) {
            // Batch already handles fallback; only rethrow user rejection
            if (String(batchErr?.message || '').includes('User rejected') || String(batchErr?.message || '').includes('rejected')) throw batchErr;
            console.warn('[useSessionKey] Batch authorize notice, trying fallback:', batchErr.message);
            // Fallback: sequential (should already have been tried inside batch method, but ensure)
            if (params.targetPool) {
              const res = await web3Service.grantOperatorForPool({
                userAddress: wallet.address,
                pool: params.targetPool,
                operator: SOMNIA_ADDRESSES.operatorAccount,
                approved: true,
              });
              onChainTxHash = res.hash;
              await web3Service.ensureAllowancesForPools({ userAddress: wallet.address, pools: poolsForBatch });
            } else {
              const res = await web3Service.grantOperatorGlobal({
                userAddress: wallet.address,
                operator: SOMNIA_ADDRESSES.operatorAccount,
                approved: true,
              });
              onChainTxHash = res.hash;
              if (poolsForBatch.length > 0) await web3Service.ensureAllowancesForPools({ userAddress: wallet.address, pools: poolsForBatch });
            }
          }
        } else {
          // No pools to approve — just operator
          if (params.targetPool) {
            const res = await web3Service.grantOperatorForPool({
              userAddress: wallet.address,
              pool: params.targetPool,
              operator: SOMNIA_ADDRESSES.operatorAccount,
              approved: true,
            });
            onChainTxHash = res.hash;
          } else {
            const res = await web3Service.grantOperatorGlobal({
              userAddress: wallet.address,
              operator: SOMNIA_ADDRESSES.operatorAccount,
              approved: true,
            });
            onChainTxHash = res.hash;
          }
        }

        // Step 2: (Optional) Collateral vault deposit — only for SpotPools, BinaryPools use allowance only
        if (params.depositAmount && params.depositAmount > 0 && params.targetPool) {
          setStepState('depositing_vault');
          await web3Service.setupPoolVault({
            userAddress: wallet.address,
            pool: params.targetPool,
            token: SOMNIA_ADDRESSES.testUsdc,
            amount: params.depositAmount,
          });
        }

        // Step 3: Sign EIP-712 structured data in user's wallet for risk ceilings
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

        // Step 4: Register session on backend
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
        const msg = err.message || 'Failed to create session delegation';
        setError(msg);
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
        setError(err.message || 'Failed to revoke session');
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
