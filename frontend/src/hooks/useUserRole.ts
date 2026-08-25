import { useMemo } from 'react';
import type { WalletState } from './useSessionKey.js';
import { SOMNIA_ADDRESSES } from '../services/web3.js';

export type UserRole = 'GUEST_WATCH_ONLY' | 'CONNECTED_TRADER' | 'PROTOCOL_OPERATOR';

export interface UserRoleState {
  role: UserRole;
  isGuest: boolean;
  isTrader: boolean;
  isOperator: boolean;
  operatorAddress: string;
  userAddress: string | null;
}

export function useUserRole(wallet: WalletState): UserRoleState {
  return useMemo(() => {
    const opAddr = (SOMNIA_ADDRESSES.operatorAccount || '').toLowerCase();
    
    if (!wallet.isConnected || !wallet.address) {
      return {
        role: 'GUEST_WATCH_ONLY',
        isGuest: true,
        isTrader: false,
        isOperator: false,
        operatorAddress: SOMNIA_ADDRESSES.operatorAccount,
        userAddress: null,
      };
    }

    const currentAddr = wallet.address.toLowerCase();
    if (currentAddr === opAddr) {
      return {
        role: 'PROTOCOL_OPERATOR',
        isGuest: false,
        isTrader: false,
        isOperator: true,
        operatorAddress: SOMNIA_ADDRESSES.operatorAccount,
        userAddress: wallet.address,
      };
    }

    return {
      role: 'CONNECTED_TRADER',
      isGuest: false,
      isTrader: true,
      isOperator: false,
      operatorAddress: SOMNIA_ADDRESSES.operatorAccount,
      userAddress: wallet.address,
    };
  }, [wallet.isConnected, wallet.address]);
}
