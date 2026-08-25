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
  const [stepState, setStepState] = useState<
    'idle' | 'authorizing_onchain' | 'depositing_vault' | 'signing_eip712' | 'registering_backend'
  >('idle');
  const [error, setError] = useState<string | null>(null);

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
            onChainAuthorized: s.onChainAuthorized ?? true,
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
            onChainAuthorized: row.on_chain_authorized ?? true,
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
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsLoading(false);
    }
  }, [refreshBalances, fetchActiveSession]);

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
        // Step 1: On-Chain Operator Authorization
        setStepState('authorizing_onchain');
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

        // Step 2: (Optional) Collateral Deposit & Vault Mode Setup
        if (params.depositAmount && params.depositAmount > 0) {
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
    }
  }, [wallet.address, refreshBalances, fetchActiveSession]);

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
      } catch (err) {
        console.warn('[useSessionKey] Auto-reconnect notice:', err);
      }
    }

    autoReconnect();

    return () => {
      isMounted = false;
    };
  }, [refreshBalances, fetchActiveSession]);

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

  return {
    wallet,
    activeSession,
    isLoading,
    isSigning,
    isFauceting,
    stepState,
    error,
    connectWallet,
    disconnectWallet,
    switchNetwork,
    claimCollateralFaucet,
    createSession,
    revokeSession,
    refreshSession,
    clearError,
  };
}
