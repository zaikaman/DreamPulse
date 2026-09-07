import {
  createPublicClient,
  createWalletClient,
  custom,
  fallback,
  http,
  defineChain,
  parseUnits,
  formatUnits,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';


import {
  getWalletClient as getWagmiWalletClient,
  getAccount,
  switchChain,
  signTypedData,
  watchAccount,
} from 'wagmi/actions';
import { wagmiConfig } from '../config/wagmi.js';

const configuredRpc = import.meta.env.VITE_SOMNIA_RPC_URL;
const isStandardRpc =
  !configuredRpc ||
  configuredRpc === 'https://dream-rpc.somnia.network' ||
  configuredRpc === 'https://api.infra.testnet.somnia.network';

export const somniaRpcUrls: string[] = isStandardRpc
  ? ['https://dream-rpc.somnia.network', 'https://api.infra.testnet.somnia.network']
  : Array.from(new Set([configuredRpc, 'https://dream-rpc.somnia.network', 'https://api.infra.testnet.somnia.network'].filter(Boolean)));

export const somniaTransport = fallback(
  somniaRpcUrls.map((url) => http(url)),
  { rank: false, retryCount: 3 }
);

/**
 * Somnia Shannon Testnet chain definition (Chain ID 50312).
 */
export const somniaShannonTestnet = defineChain({
  id: 50312,
  name: 'Somnia Shannon Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Somnia Shannon Testnet Token',
    symbol: 'STT',
  },
  rpcUrls: {
    default: {
      http: somniaRpcUrls,
    },
    public: {
      http: somniaRpcUrls,
    },
  },
  blockExplorers: {
    default: {
      name: 'Somnia Shannon Explorer',
      url: 'https://shannon-explorer.somnia.network',
    },
  },
  testnet: true,
});

export const SOMNIA_ADDRESSES = {
  chainId: 50312,
  decimals: 6, // TestUSDC decimals — canonical for caps (maxTradeSize / dailyVolumeCap)
  operatorPermissionsRegistry: '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A' as Address,
  operatorAccount: '0x93e300607c363E7D7a47e50f5c9fDf1723e859Cf' as Address,
  sessionAccount: '0xa85ec9a6A0845eeb642E1DCE12780E9b4cFD37F8' as Address,
  sessionAccountImpl: '0x6177d1E24C838789c1367fC9B66Bcf689C6ff60F' as Address,
  sessionAccountFactory: '0xA0C2eaAe0438bCB6DD0FA2Cc2317BEDB8Ff25e94' as Address,
  testUsdc: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E' as Address,
  binaryModule: '0x3ecC694Cef705358864a646142ac17A90E29e388' as Address,
  marketsCore: '0x2802504314685D89bF6C992CA5a8e7cC78bc0294' as Address,
  collateralRouter: '0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C' as Address,
  clobFactory: '0xb2BE8EE02F96379DB75f01802384593EBa9bfF04' as Address,
  binarySettlement: '0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23' as Address,
};

/**
 * SEC-11 bounded-allowance policy: approvals always default to the exact
 * amount needed for the user's stated intent — never a hardcoded infinite
 * (1M / maxUint256) grant. Standing allowances for future trades default to
 * `DEFAULT_STANDING_ALLOWANCE`; any caller may pass an explicit `amount` of
 * any size (e.g. approving exactly a 10,000 tUSDC deposit), with no
 * protocol-imposed ceiling — it is the user's wallet. Pair with
 * `revokeErc20Approval` so users can zero any grant at any time.
 */
export const DEFAULT_STANDING_ALLOWANCE = parseUnits('1000', 6);
/** Minimum standing allowance that suppresses repeat approval prompts. */
export const MIN_TRADING_ALLOWANCE = parseUnits('1000', 6);

/** Minimal BinarySettlement registry surface for pool-trust checks. */
export const BINARY_SETTLEMENT_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'isPoolApproved',
    stateMutability: 'view',
    inputs: [{ name: 'pool', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const SESSION_FACTORY_ABI = [
  {
    type: 'function',
    name: 'deployFor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'collateral', type: 'address' },
    ],
    outputs: [{ name: 'account', type: 'address' }],
  },
  {
    type: 'function',
    name: 'accounts',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'predictFor',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

export const SESSION_CLONE_ABI = [
  {
    type: 'function',
    name: 'authorizeSession',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionKey', type: 'address' },
      { name: 'maxTradeSize', type: 'uint256' },
      { name: 'dailyVolumeCap', type: 'uint256' },
      { name: 'durationSec', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'revokeSession',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionKey', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'executeOrder',
    stateMutability: 'payable',
    inputs: [
      { name: 'targetPool', type: 'address' },
      { name: 'callData', type: 'bytes' },
      { name: 'tradeCost', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes' }],
  },
  {
    type: 'function',
    name: 'redeemWinnings',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'module', type: 'address' },
      { name: 'outcomeToken', type: 'address' },
      { name: 'marketId', type: 'bytes32' },
      { name: 'outcomeIdx', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdrawNative',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getSession',
    stateMutability: 'view',
    inputs: [{ name: 'sessionKey', type: 'address' }],
    outputs: [
      { name: 'maxTradeSize', type: 'uint256' },
      { name: 'dailyVolumeCap', type: 'uint256' },
      { name: 'spentToday', type: 'uint256' },
      { name: 'remainingDailyAllowance', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'poolRegistry',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'trustedModule',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'authorizedPools',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isPoolAuthorized',
    stateMutability: 'view',
    inputs: [{ name: 'pool', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'setPoolRegistry',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_registry', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setTrustedModule',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_module', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setPoolAuthorization',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'allowed', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'feeRecipient',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'WITHDRAWAL_FEE',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'MIN_WITHDRAWAL_AMOUNT',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const DREAM_PULSE_SESSION_ACCOUNT_ABI = [
  {
    type: 'function',
    name: 'authorizeSession',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionKey', type: 'address' },
      { name: 'maxTradeSize', type: 'uint256' },
      { name: 'dailyVolumeCap', type: 'uint256' },
      { name: 'durationSec', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'revokeSession',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionKey', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getSession',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'sessionKey', type: 'address' },
    ],
    outputs: [
      { name: 'maxTradeSize', type: 'uint256' },
      { name: 'dailyVolumeCap', type: 'uint256' },
      { name: 'spentToday', type: 'uint256' },
      { name: 'remainingDailyAllowance', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
    ],
  },
] as const;

/**
 * Canonical tUSDC collateral decimals (6). Single source of truth for cap encoding.
 * Must match backend COLLATERAL_DECIMALS and on-chain TestUSDC decimals.
 */
export const COLLATERAL_DECIMALS = SOMNIA_ADDRESSES.decimals; // 6

export const OPERATOR_SELECTORS = {
  placeOrderFor: '0x80054449' as Hex,
  placeBinaryOrderFor: '0x5d97c566' as Hex,
  cancelOrderFor: '0xe37b444b' as Hex,
  reduceOrderFor: '0x364c2587' as Hex,
} as const;

/**
 * Non-custodial session model: the user grants these binary-market selectors
 * to the DreamPulseSessionAccount CONTRACT (never an EOA). Pools auto-pull
 * escrow from the owner's wallet; the session contract never receives funds.
 */
export const SESSION_ACCOUNT_SELECTORS = [
  OPERATOR_SELECTORS.placeBinaryOrderFor,
  OPERATOR_SELECTORS.cancelOrderFor,
  OPERATOR_SELECTORS.reduceOrderFor,
] as Hex[];

export const ERC6909_OPERATOR_ABI = [
  {
    type: 'function',
    name: 'isOperator',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'setOperator',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/**
 * BinaryModule redeem surface for user-side claiming of user-owned winnings.
 * Mirrors @somnia-chain/markets-sdk binaryModuleWriteAbi redeem:
 * redeem(uint256 operatorId, bytes32 venueId, bytes32 marketId, uint8 outcomeIdx, uint256 amount).
 */
export const BINARY_MODULE_REDEEM_ABI = [
  {
    type: 'function',
    name: 'redeem',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operatorId', type: 'uint256' },
      { name: 'venueId', type: 'bytes32' },
      { name: 'marketId', type: 'bytes32' },
      { name: 'outcomeIdx', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

export const SESSION_EIP712_DOMAIN = {
  name: 'DreamPulse Operator Registry',
  version: '1',
  chainId: 50312,
  verifyingContract: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
} as const;

export const SESSION_EIP712_TYPES = {
  SessionDelegation: [
    { name: 'delegator', type: 'address' },
    { name: 'operator', type: 'address' },
    { name: 'maxTradeSize', type: 'uint256' },
    { name: 'dailyVolumeCap', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

// Supabase realtime JWT — same domain as backend verifies (auth-service.ts)
export const AUTH_EIP712_DOMAIN = {
  name: 'DreamPulse',
  version: '1',
  chainId: 50312,
  verifyingContract: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
} as const;

export const AUTH_EIP712_TYPES = {
  Auth: [
    { name: 'wallet', type: 'address' },
    { name: 'nonce', type: 'string' },
    { name: 'issuedAt', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
} as const;

export const OPERATOR_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'setOperatorApprovalForPool',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'operator', type: 'address' },
      { name: 'selectors', type: 'bytes4[]' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setOperatorApprovalGlobal',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'selectors', type: 'bytes4[]' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setOperatorDenialForPool',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'operator', type: 'address' },
      { name: 'selectors', type: 'bytes4[]' },
      { name: 'denied', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isGloballyApproved',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
      { name: 'selector', type: 'bytes4' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isApprovedForPool',
    stateMutability: 'view',
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
      { name: 'selector', type: 'bytes4' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const SPOT_POOL_ABI = [
  {
    type: 'function',
    name: 'setManualVaultMode',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'enabled', type: 'bool' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getManualVaultMode',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getWithdrawableBalance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'isOperatorAuthorized',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
      { name: 'selector', type: 'bytes4' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const BINARY_POOL_ABI = [
  {
    type: 'function',
    name: 'placeBinaryOrder',
    stateMutability: 'payable',
    inputs: [
      { name: 'kind', type: 'uint8' },
      { name: 'price', type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
      { name: 'expireTimestampNs', type: 'uint64' },
      { name: 'orderType', type: 'uint8' },
      { name: 'selfMatchingOption', type: 'uint8' },
      { name: 'builder', type: 'address' },
      { name: 'builderFeeBpsTimes1k', type: 'uint96' },
      { name: 'userData', type: 'uint64' },
    ],
    outputs: [
      { name: 'success', type: 'bool' },
      { name: 'id', type: 'uint128' },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'faucet',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'transferFrom',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

export const ERC20_BALANCE_ABI = ERC20_ABI;

/**
 * Public Viem client for querying Somnia testnet state with multi-RPC fallback resiliency.
 */
export const publicClient: PublicClient = createPublicClient({
  chain: somniaShannonTestnet,
  transport: somniaTransport,
});

declare global {
  interface Window {
    ethereum?: any;
  }
}

export class Web3Service {
  /**
   * Checks if a Web3 wallet is connected via Wagmi or injected window.ethereum is available.
   */
  public isWalletAvailable(): boolean {
    const account = getAccount(wagmiConfig);
    if (account.isConnected) return true;
    return typeof window !== 'undefined' && Boolean(window.ethereum);
  }

  /**
   * Gets the active viem WalletClient from Wagmi (supports mobile WalletConnect, Rabby, Coinbase, etc.)
   * or falls back to injected window.ethereum.
   */
  public async getWalletClient(userAddress?: Address): Promise<any> {
    try {
      const client = await getWagmiWalletClient(wagmiConfig);
      if (client) return client;
    } catch {}

    if (typeof window !== 'undefined' && Boolean(window.ethereum) && userAddress) {
      return createWalletClient({
        account: userAddress,
        chain: somniaShannonTestnet,
        transport: custom(window.ethereum),
      });
    }

    throw new Error('No active wallet connected. Please connect your wallet via RainbowKit.');
  }


  /**
   * Checks if an account is already authorized without opening a prompt (Wagmi account or eth_accounts).
   */
  public async getAuthorizedAccount(): Promise<{ address: Address; chainId: number } | null> {
    const account = getAccount(wagmiConfig);
    if (account.isConnected && account.address) {
      return {
        address: account.address,
        chainId: account.chainId ?? somniaShannonTestnet.id,
      };
    }

    if (typeof window !== 'undefined' && Boolean(window.ethereum)) {
      try {
        const accounts: string[] = await window.ethereum.request({
          method: 'eth_accounts',
        });

        if (!accounts || accounts.length === 0) {
          return null;
        }

        const rawChainId = await window.ethereum.request({ method: 'eth_chainId' });
        const chainId = parseInt(rawChainId, 16);

        return {
          address: accounts[0] as Address,
          chainId,
        };
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Connects to the Web3 wallet and requests account access.
   */
  public async connectWallet(): Promise<{ address: Address; chainId: number }> {
    const account = getAccount(wagmiConfig);
    if (account.isConnected && account.address) {
      return {
        address: account.address,
        chainId: account.chainId ?? somniaShannonTestnet.id,
      };
    }

    if (typeof window !== 'undefined' && Boolean(window.ethereum)) {
      const accounts: string[] = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts selected');
      }

      const rawChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const chainId = parseInt(rawChainId, 16);

      const address = accounts[0] as Address;

      // Auto switch to Somnia Shannon Testnet if on another network
      if (chainId !== somniaShannonTestnet.id) {
        await this.switchOrAddSomniaTestnet();
      }

      return { address, chainId: somniaShannonTestnet.id };
    }

    throw new Error('No Ethereum wallet detected. Please connect using RainbowKit.');
  }

  /**
   * Switches network to Somnia Shannon Testnet via Wagmi with fallback to injected provider.
   */
  public async switchOrAddSomniaTestnet(): Promise<boolean> {
    try {
      await switchChain(wagmiConfig, { chainId: somniaShannonTestnet.id });
      return true;
    } catch (err: any) {
      if (typeof window !== 'undefined' && Boolean(window.ethereum)) {
        const chainIdHex = `0x${somniaShannonTestnet.id.toString(16)}`;
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainIdHex }],
          });
          return true;
        } catch (switchError: any) {
          // Error 4902 indicates chain is not yet added to wallet
          if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
            try {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: chainIdHex,
                    chainName: somniaShannonTestnet.name,
                    nativeCurrency: somniaShannonTestnet.nativeCurrency,
                    rpcUrls: somniaRpcUrls,
                    blockExplorerUrls: ['https://shannon-explorer.somnia.network'],
                  },
                ],
              });
              return true;
            } catch (addError: any) {
              throw new Error(`Failed to add Somnia Shannon Testnet: ${addError.message}`);
            }
          }
          throw switchError;
        }
      }
      throw err;
    }
  }


  /**
   * Queries native STT balance for a wallet address.
   */
  public async getSTTBalance(address: Address): Promise<string> {
    try {
      const balance = await publicClient.getBalance({ address });
      return formatUnits(balance, 18);
    } catch (err) {
      console.warn('[Web3Service] Error fetching STT balance:', err);
      return '0.00';
    }
  }

  /**
   * Queries TestUSDC collateral balance for a wallet address.
   */
  public async getCollateralBalance(address: Address): Promise<string> {
    try {
      const balance = await publicClient.readContract({
        address: SOMNIA_ADDRESSES.testUsdc,
        abi: ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
      return formatUnits(balance, 6); // TestUSDC has 6 decimals
    } catch (err) {
      console.warn('[Web3Service] Error fetching collateral balance:', err);
      return '0.00';
    }
  }

  /**
   * Grants operator permissions globally on OperatorPermissionsRegistry.
   */
  public async grantOperatorGlobal(params: {
    userAddress: Address;
    operator?: Address;
    selectors?: Hex[];
    approved?: boolean;
  }): Promise<{ hash: Hex }> {
    const operator = params.operator || SOMNIA_ADDRESSES.operatorAccount;
    const selectors = params.selectors || [
      OPERATOR_SELECTORS.placeOrderFor,
      OPERATOR_SELECTORS.placeBinaryOrderFor,
      OPERATOR_SELECTORS.cancelOrderFor,
    ];
    const approved = params.approved ?? true;

    const wallet = await this.getWalletClient(params.userAddress);
    const hash = await wallet.writeContract({
      address: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
      abi: OPERATOR_REGISTRY_ABI,
      functionName: 'setOperatorApprovalGlobal',
      args: [operator, selectors, approved],
    });

    await publicClient.waitForTransactionReceipt({ hash });
    return { hash };
  }

  /**
   * Grants operator permissions for a specific pool on OperatorPermissionsRegistry.
   */
  public async grantOperatorForPool(params: {
    userAddress: Address;
    pool: Address;
    operator?: Address;
    selectors?: Hex[];
    approved?: boolean;
  }): Promise<{ hash: Hex }> {
    const operator = params.operator || SOMNIA_ADDRESSES.operatorAccount;
    const selectors = params.selectors || [
      OPERATOR_SELECTORS.placeOrderFor,
      OPERATOR_SELECTORS.placeBinaryOrderFor,
      OPERATOR_SELECTORS.cancelOrderFor,
    ];
    const approved = params.approved ?? true;

    const wallet = await this.getWalletClient(params.userAddress);
    const hash = await wallet.writeContract({
      address: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
      abi: OPERATOR_REGISTRY_ABI,
      functionName: 'setOperatorApprovalForPool',
      args: [params.pool, operator, selectors, approved],
    });

    await publicClient.waitForTransactionReceipt({ hash });
    return { hash };
  }

  /**
   * Configures manual vault mode, approves collateral, and deposits working capital into a pool's vault.
   * For BinaryPools (DreamDEX Event Contracts) the vault is not used — trading pulls via ERC20 allowance to the pool.
   * For SpotPools the vault path is required.
   */
  public async setupPoolVault(params: {
    userAddress: Address;
    pool?: Address;
    token?: Address;
    amount: number;
  }): Promise<{
    approvalHash?: Hex;
    vaultModeHash?: Hex;
    depositHash?: Hex;
  }> {
    const token = params.token || SOMNIA_ADDRESSES.testUsdc;
    const amountRaw = parseUnits(params.amount.toString(), 6);
    const wallet = await this.getWalletClient(params.userAddress);
    const result: { approvalHash?: Hex; vaultModeHash?: Hex; depositHash?: Hex } = {};

    // 1. Ensure token allowance is approved for DreamDEX trading
    // For BinaryPools we approve the pool itself; for global (no pool) we approve collateralRouter as fallback
    const shouldApprove = amountRaw > 0n || (params.pool && params.pool !== SOMNIA_ADDRESSES.binaryModule);
    if (shouldApprove) {
      try {
        const spender = params.pool && params.pool !== SOMNIA_ADDRESSES.binaryModule
          ? params.pool
          : SOMNIA_ADDRESSES.collateralRouter;

        const allowance = await publicClient.readContract({
          address: token,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [params.userAddress, spender],
        });

        // SEC-11: approve exactly the deposit intent (any size — depositing
        // 10,000 tUSDC approves exactly 10,000), or the default standing
        // allowance when no deposit was requested. Never an infinite grant.
        const approvalAmount = amountRaw > 0n ? amountRaw : DEFAULT_STANDING_ALLOWANCE;
        const needThreshold = params.pool ? MIN_TRADING_ALLOWANCE : amountRaw;
        if (allowance < needThreshold) {
          const appHash = await wallet.writeContract({
            address: token,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [spender, approvalAmount],
          });
          await publicClient.waitForTransactionReceipt({ hash: appHash });
          result.approvalHash = appHash;
        }
      } catch (err: any) {
        console.warn('[Web3Service] Token approval notice:', err.message);
      }
    }

    // 2. If a specific pool is provided, attempt manual vault mode and vault deposit
    // BinaryPools do NOT implement getManualVaultMode / deposit vault — skip gracefully
    if (params.pool && params.pool.startsWith('0x') && params.pool !== SOMNIA_ADDRESSES.binaryModule) {
      // Detect BinaryPool by probing getManualVaultMode; if it reverts with empty data, treat as BinaryPool and skip vault flow
      let isBinaryPool = false;
      try {
        await publicClient.readContract({
          address: params.pool,
          abi: SPOT_POOL_ABI,
          functionName: 'getManualVaultMode',
          args: [params.userAddress],
        });
      } catch (readErr: any) {
        const msg = String(readErr?.message || '');
        if (msg.includes('execution reverted') && !msg.includes('0x')) {
          // generic revert, keep as spot
        } else {
          // BinaryPool reverts with data 0x (no function) — skip vault logic
          isBinaryPool = true;
        }
        // If read itself reverted with 0x, it's a BinaryPool
        if (msg.includes('0x') && msg.length < 20) isBinaryPool = true;
      }

      if (isBinaryPool) {
        // BinaryPool: only allowance matters, vault deposit is via allowance path — nothing more to do
        return result;
      }

      try {
        const isManualMode = await publicClient.readContract({
          address: params.pool,
          abi: SPOT_POOL_ABI,
          functionName: 'getManualVaultMode',
          args: [params.userAddress],
        });

        if (!isManualMode) {
          const modeHash = await wallet.writeContract({
            address: params.pool,
            abi: SPOT_POOL_ABI,
            functionName: 'setManualVaultMode',
            args: [true],
          });
          await publicClient.waitForTransactionReceipt({ hash: modeHash });
          result.vaultModeHash = modeHash;
        }

        if (amountRaw > 0n) {
          const depHash = await wallet.writeContract({
            address: params.pool,
            abi: SPOT_POOL_ABI,
            functionName: 'deposit',
            args: [token, amountRaw],
          });
          await publicClient.waitForTransactionReceipt({ hash: depHash });
          result.depositHash = depHash;
        }
      } catch (err: any) {
        console.warn('[Web3Service] Pool vault deposit notice:', err.message);
      }
    }

    return result;
  }

  /**
   * One-shot batch: global operator approval + TestUSDC allowance to operator.
   * Single approve(operator) covers all current and future binary prediction pools.
   */
  public async batchAuthorizeAndApprovePools(params: {
    userAddress: Address;
    operator?: Address;
    pools?: Address[];
    token?: Address;
  }): Promise<{ operatorHash?: Hex; allowanceHashes: Hex[] }> {
    const operator = params.operator || SOMNIA_ADDRESSES.operatorAccount;
    const token = params.token || SOMNIA_ADDRESSES.testUsdc;

    const [isGloballyAuthed, currentAllowance] = await Promise.all([
      this.isOperatorAuthorized({ owner: params.userAddress, operator, selector: OPERATOR_SELECTORS.placeOrderFor }),
      publicClient.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [params.userAddress, operator],
      }).catch(() => 0n),
    ]);

    const minAllowance = MIN_TRADING_ALLOWANCE;
    const needsOperator = !isGloballyAuthed;
    const hasOperatorAllowance = (currentAllowance as bigint) >= minAllowance;

    if (!needsOperator && hasOperatorAllowance) return { allowanceHashes: [] };

    let operatorHash: Hex | undefined;
    if (needsOperator) {
      const res = await this.grantOperatorGlobal({ userAddress: params.userAddress, operator });
      operatorHash = res.hash;
    }
    let appHash: Hex | undefined;
    if (!hasOperatorAllowance) {
      appHash = await this.approveOperatorForTestUsdc({ userAddress: params.userAddress, operator });
    }
    return { operatorHash, allowanceHashes: appHash ? [appHash] : [] };
  }

  /**
   * Single bounded approve(operator) for TestUSDC — defaults to
   * `DEFAULT_STANDING_ALLOWANCE` (SEC-11), covering current and future pools
   * via transferFrom through operator without exposing the full balance.
   * Pass an explicit `amount` matching the user's real intent (any size) —
   * e.g. exactly the amount being deposited for trading.
   * Used for the 2-click-forever model: 1 approve(operator) + 1 EIP-712 SessionDelegation.
   * Backend will handle per-pool setOperatorApprovalForPool via meta-tx/EIP-7702 without further user clicks.
   */
  public async approveOperatorForTestUsdc(params: { userAddress: Address; operator?: Address; amount?: bigint }): Promise<Hex | undefined> {
    const operator = params.operator || SOMNIA_ADDRESSES.operatorAccount;
    const amount = params.amount ?? DEFAULT_STANDING_ALLOWANCE;
    const token = SOMNIA_ADDRESSES.testUsdc;
    try {
      const allowance = await publicClient.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [params.userAddress, operator],
      });
      if (allowance >= amount) return undefined;
    } catch {}
    const wallet = await this.getWalletClient(params.userAddress);
    const hash = await wallet.writeContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [operator, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * Fast, non-blocking single operator approval & TestUSDC allowance check.
   * Leverages Somnia OperatorPermissionsRegistry global approval + operator TestUSDC allowance.
   * Dispatches directly to user wallet without sequential multi-pool RPC blocking.
   */
  public async batchSingleApproveAndGlobal(params: { userAddress: Address; operator?: Address; pools?: Address[] }): Promise<Hex | undefined> {
    const operator = params.operator || SOMNIA_ADDRESSES.operatorAccount;
    const token = SOMNIA_ADDRESSES.testUsdc;

    const [isGloballyAuthed, currentAllowance] = await Promise.all([
      this.isOperatorAuthorized({ owner: params.userAddress, operator }),
      publicClient.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [params.userAddress, operator],
      }).catch(() => 0n),
    ]);

    const minAllowance = MIN_TRADING_ALLOWANCE;
    const needsApprove = (currentAllowance as bigint) < minAllowance;
    const needsOp = !isGloballyAuthed;

    if (!needsOp && !needsApprove) return undefined;

    let lastHash: Hex | undefined;
    if (needsOp) {
      const res = await this.grantOperatorGlobal({ userAddress: params.userAddress, operator });
      if (res.hash) lastHash = res.hash;
    }
    if (needsApprove) {
      const appHash = await this.approveOperatorForTestUsdc({ userAddress: params.userAddress, operator });
      if (appHash) lastHash = appHash;
    }
    return lastHash;
  }


  /**
   * Ensures TestUSDC allowance and operator authorization.
   * Single bounded approve(operator) covers all current and future binary
   * prediction pools. Pass the user's real trading intent as `amount`.
   */
  public async ensureAllowancesForPools(params: {
    userAddress: Address;
    pools?: Address[];
    token?: Address;
    amount?: bigint;
  }): Promise<Hex[]> {
    const token = params.token || SOMNIA_ADDRESSES.testUsdc;
    const operator = SOMNIA_ADDRESSES.operatorAccount;

    const [isGloballyAuthed, currentAllowance] = await Promise.all([
      this.isOperatorAuthorized({ owner: params.userAddress, operator, selector: OPERATOR_SELECTORS.placeOrderFor }),
      publicClient.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [params.userAddress, operator],
      }).catch(() => 0n),
    ]);

    const minAllowance = MIN_TRADING_ALLOWANCE;
    const needsOperator = !isGloballyAuthed;
    const hasOperatorAllowance = (currentAllowance as bigint) >= minAllowance;

    if (!needsOperator && hasOperatorAllowance) return [];

    const hashes: Hex[] = [];
    if (needsOperator) {
      const res = await this.grantOperatorGlobal({ userAddress: params.userAddress, operator });
      if (res.hash) hashes.push(res.hash);
    }
    if (!hasOperatorAllowance) {
      const appHash = await this.approveOperatorForTestUsdc({ userAddress: params.userAddress, operator, amount: params.amount });
      if (appHash) hashes.push(appHash);
    }
    return hashes;
  }

  /**
   * Queries whether an operator is authorized for an owner on-chain.
   */
  public async isOperatorAuthorized(params: {
    owner: Address;
    operator?: Address;
    pool?: Address;
    selector?: Hex;
  }): Promise<boolean> {
    const operator = params.operator || SOMNIA_ADDRESSES.operatorAccount;
    const selector = params.selector || OPERATOR_SELECTORS.placeOrderFor;

    try {
      if (params.pool && params.pool !== SOMNIA_ADDRESSES.binaryModule) {
        try {
          const poolAuthed = await publicClient.readContract({
            address: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
            abi: OPERATOR_REGISTRY_ABI,
            functionName: 'isApprovedForPool',
            args: [params.pool, params.owner, operator, selector as `0x${string}`],
          });
          if (poolAuthed) return true;
        } catch {
          // fallback to global check
        }
      }

      const regAuthed = await publicClient.readContract({
        address: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
        abi: OPERATOR_REGISTRY_ABI,
        functionName: 'isGloballyApproved',
        args: [params.owner, operator, selector as `0x${string}`],
      });

      return Boolean(regAuthed);
    } catch {
      return false;
    }
  }

  /**
   * Queries pool vault withdrawable balance for an owner.
   */
  public async getVaultWithdrawableBalance(params: {
    pool: Address;
    owner: Address;
    token?: Address;
  }): Promise<string> {
    const token = params.token || SOMNIA_ADDRESSES.testUsdc;
    try {
      const balance = await publicClient.readContract({
        address: params.pool,
        abi: SPOT_POOL_ABI,
        functionName: 'getWithdrawableBalance',
        args: [params.owner, token],
      });
      return formatUnits(balance, 6);
    } catch {
      return '0.00';
    }
  }

  /**
   * Revokes operator permissions on-chain.
   */
  public async revokeOperatorOnChain(params: {
    userAddress: Address;
    operator?: Address;
    pool?: Address;
  }): Promise<{ hash: Hex }> {
    const operator = params.operator || SOMNIA_ADDRESSES.operatorAccount;
    const selectors = [
      OPERATOR_SELECTORS.placeOrderFor,
      OPERATOR_SELECTORS.placeBinaryOrderFor,
      OPERATOR_SELECTORS.cancelOrderFor,
    ];
    const wallet = await this.getWalletClient(params.userAddress);

    let hash: Hex;
    if (params.pool && params.pool !== SOMNIA_ADDRESSES.binaryModule) {
      hash = await wallet.writeContract({
        address: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
        abi: OPERATOR_REGISTRY_ABI,
        functionName: 'setOperatorApprovalForPool',
        args: [params.pool, operator, selectors, false],
      });
    } else {
      hash = await wallet.writeContract({
        address: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
        abi: OPERATOR_REGISTRY_ABI,
        functionName: 'setOperatorApprovalGlobal',
        args: [operator, selectors, false],
      });
    }

    await publicClient.waitForTransactionReceipt({ hash });
    return { hash };
  }

  // ---------------------------------------------------------------------------
  // Non-custodial session model (production path): the user authorizes the
  // DreamPulseSessionAccount CONTRACT in the registry and approves each
  // market pool to auto-pull escrow from their own wallet. No EOA — operator
  // or otherwise — ever receives or holds user funds.
  // ---------------------------------------------------------------------------

  /**
   * Grants the session contract global trading rights (binary selectors).
   * One tx covers all current and future pools.
   */
  public async grantSessionAccountGlobal(params: {
    userAddress: Address;
  }): Promise<{ hash: Hex } | undefined> {
    if (await this.isSessionAccountAuthorized({ owner: params.userAddress })) {
      return undefined;
    }
    const wallet = await this.getWalletClient(params.userAddress);
    const hash = await wallet.writeContract({
      address: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
      abi: OPERATOR_REGISTRY_ABI,
      functionName: 'setOperatorApprovalGlobal',
      args: [SOMNIA_ADDRESSES.sessionAccount, SESSION_ACCOUNT_SELECTORS, true],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return { hash };
  }

  /**
   * Revokes the session contract's global trading rights (1 tx kill switch).
   */
  public async revokeSessionAccountGlobal(params: {
    userAddress: Address;
  }): Promise<{ hash: Hex } | undefined> {
    const isAuthorized = await this.isSessionAccountAuthorized({ owner: params.userAddress });
    if (!isAuthorized) {
      return undefined;
    }
    const wallet = await this.getWalletClient(params.userAddress);
    const hash = await wallet.writeContract({
      address: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
      abi: OPERATOR_REGISTRY_ABI,
      functionName: 'setOperatorApprovalGlobal',
      args: [SOMNIA_ADDRESSES.sessionAccount, SESSION_ACCOUNT_SELECTORS, false],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return { hash };
  }

  /**
   * Reads whether the session contract holds a global trading grant.
   */
  public async isSessionAccountAuthorized(params: {
    owner: Address;
  }): Promise<boolean> {
    try {
      const granted = await publicClient.readContract({
        address: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
        abi: OPERATOR_REGISTRY_ABI,
        functionName: 'isGloballyApproved',
        args: [params.owner, SOMNIA_ADDRESSES.sessionAccount, OPERATOR_SELECTORS.placeBinaryOrderFor],
      });
      return Boolean(granted);
    } catch {
      return false;
    }
  }

  /**
   * Reads whether a pool is recognized by the canonical DreamDEX registry.
   * Returns null when the registry cannot be reached (RPC failure) so
   * callers can distinguish "definitively untrusted" (false) from
   * "unknown" (null).
   */
  public async isTrustedPool(pool: Address): Promise<boolean | null> {
    try {
      const approved = await publicClient.readContract({
        address: SOMNIA_ADDRESSES.binarySettlement,
        abi: BINARY_SETTLEMENT_REGISTRY_ABI,
        functionName: 'isPoolApproved',
        args: [pool],
      });
      return Boolean(approved);
    } catch {
      return null;
    }
  }

  /**
   * Fail-closed pool gate for every path that approves a pool to pull user
   * funds (SEC-03/SEC-11): throws unless the pool is registry-approved or
   * explicitly allowlisted on the user's clone. Never approve an unknown
   * contract to spend TestUSDC.
   */
  public async requireTrustedPool(pool: Address, cloneAddress?: Address): Promise<void> {
    if (cloneAddress) {
      try {
        const allowlisted = await publicClient.readContract({
          address: cloneAddress,
          abi: SESSION_CLONE_ABI,
          functionName: 'isPoolAuthorized',
          args: [pool],
        });
        if (allowlisted) return;
      } catch {
        // Clone predates SEC-03 (no isPoolAuthorized): fall through to registry.
      }
    }
    const trusted = await this.isTrustedPool(pool);
    if (trusted !== true) {
      throw new Error(
        `Pool ${pool} is not recognized by the DreamDEX settlement registry. Approval refused to protect your funds.`,
      );
    }
  }

  /**
   * Reads the owner's TestUSDC allowance to a specific pool.
   */
  public async getPoolAllowance(params: {
    owner: Address;
    pool: Address;
    token?: Address;
  }): Promise<bigint> {
    try {
      return await publicClient.readContract({
        address: params.token || SOMNIA_ADDRESSES.testUsdc,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [params.owner, params.pool],
      });
    } catch {
      return 0n;
    }
  }

  /**
   * Approves a single pool to auto-pull TestUSDC escrow for exactly `amount
   * ?? DEFAULT_STANDING_ALLOWANCE` (SEC-11 — never an infinite grant).
   * Skips when allowance already covers the required threshold. Refuses
   * unknown pools (SEC-03). Pass the user's real trading intent as `amount`
   * (any size) whenever it is known.
   */
  public async approvePoolForTestUsdc(params: {
    userAddress: Address;
    pool: Address;
    token?: Address;
    amount?: bigint;
  }): Promise<Hex | undefined> {
    const token = params.token || SOMNIA_ADDRESSES.testUsdc;
    await this.requireTrustedPool(params.pool);
    const amount = params.amount ?? DEFAULT_STANDING_ALLOWANCE;
    const current = await this.getPoolAllowance({ owner: params.userAddress, pool: params.pool, token });
    if (current >= MIN_TRADING_ALLOWANCE) return undefined;
    const wallet = await this.getWalletClient(params.userAddress);
    const hash = await wallet.writeContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [params.pool, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * Ensures TestUSDC allowances for a list of pools. Returns tx hashes for
   * newly granted approvals (empty when everything was already approved).
   * Pass the user's real per-pool trading intent as `amount` (any size).
   */
  public async ensurePoolAllowances(params: {
    userAddress: Address;
    pools: Address[];
    token?: Address;
    amount?: bigint;
  }): Promise<Hex[]> {
    const hashes: Hex[] = [];
    const unique = Array.from(new Set(params.pools.map((p) => p.toLowerCase())));
    for (const pool of unique.slice(0, 12)) {
      try {
        const hash = await this.approvePoolForTestUsdc({
          userAddress: params.userAddress,
          pool: pool as Address,
          token: params.token,
          amount: params.amount,
        });
        if (hash) hashes.push(hash);
      } catch (err: any) {
        console.warn(`[Web3Service] Pool allowance notice for ${pool}:`, err?.message || err);
      }
    }
    return hashes;
  }

  /**
   * Ensures each pool is an operator on its outcome-token singleton (needed
   * for SELL-side escrow of outcome tokens). One-time grant per pool.
   */
  public async ensureOutcomeTokenOperators(params: {
    userAddress: Address;
    targets: Array<{ pool: Address; outcomeToken: Address }>;
  }): Promise<Hex[]> {
    const hashes: Hex[] = [];
    const wallet = await this.getWalletClient(params.userAddress).catch(() => null);
    if (!wallet) return hashes;
    const seen = new Set<string>();
    for (const t of params.targets.slice(0, 12)) {
      const key = `${t.outcomeToken.toLowerCase()}:${t.pool.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const already = await publicClient.readContract({
          address: t.outcomeToken,
          abi: ERC6909_OPERATOR_ABI,
          functionName: 'isOperator',
          args: [params.userAddress, t.pool],
        }).catch(() => false);
        if (already) continue;
        const hash = await wallet.writeContract({
          address: t.outcomeToken,
          abi: ERC6909_OPERATOR_ABI,
          functionName: 'setOperator',
          args: [t.pool, true],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        hashes.push(hash);
      } catch (err: any) {
        console.warn(`[Web3Service] Outcome-token operator notice for ${t.pool}:`, err?.message || err);
      }
    }
    return hashes;
  }

  /**
   * One-shot session authorization for the non-custodial model: registry
   * grant to the session contract + pool escrow allowances + outcome-token
   * operator grants. Returns the tx hashes that were submitted.
   */
  public async authorizeSessionForPools(params: {
    userAddress: Address;
    pools: Address[];
    outcomeTargets?: Array<{ pool: Address; outcomeToken: Address }>;
  }): Promise<Hex[]> {
    const hashes: Hex[] = [];
    const grant = await this.grantSessionAccountGlobal({ userAddress: params.userAddress });
    if (grant?.hash) hashes.push(grant.hash);
    const poolHashes = await this.ensurePoolAllowances({ userAddress: params.userAddress, pools: params.pools });
    hashes.push(...poolHashes);
    if (params.outcomeTargets && params.outcomeTargets.length > 0) {
      const outcomeHashes = await this.ensureOutcomeTokenOperators({
        userAddress: params.userAddress,
        targets: params.outcomeTargets,
      });
      hashes.push(...outcomeHashes);
      // One grant of the BinaryModule on each outcome-token singleton covers
      // every market for user-side winnings claims (redeem pulls via module).
      const seenTokens = new Set<string>();
      for (const t of params.outcomeTargets) {
        const key = t.outcomeToken.toLowerCase();
        if (seenTokens.has(key)) continue;
        seenTokens.add(key);
        try {
          const h = await this.ensureModuleOutcomeOperator({
            userAddress: params.userAddress,
            outcomeToken: t.outcomeToken,
          });
          if (h) hashes.push(h);
        } catch (err: any) {
          console.warn('[Web3Service] Module outcome-operator notice:', err?.message || err);
        }
      }
    }
    return hashes;
  }

  /**
   * Grants the BinaryModule as ERC-6909 operator on an outcome-token
   * singleton (one grant covers all markets for that token). Required once
   * for user-side winnings claims via module redeem.
   */
  public async ensureModuleOutcomeOperator(params: {
    userAddress: Address;
    outcomeToken: Address;
  }): Promise<Hex | undefined> {
    try {
      const already = await publicClient.readContract({
        address: params.outcomeToken,
        abi: ERC6909_OPERATOR_ABI,
        functionName: 'isOperator',
        args: [params.userAddress, SOMNIA_ADDRESSES.binaryModule],
      }).catch(() => false);
      if (already) return undefined;
    } catch {}
    const wallet = await this.getWalletClient(params.userAddress);
    const hash = await wallet.writeContract({
      address: params.outcomeToken,
      abi: ERC6909_OPERATOR_ABI,
      functionName: 'setOperator',
      args: [SOMNIA_ADDRESSES.binaryModule, true],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * Claims user-owned winnings from the user's own wallet via the
   * BinaryModule (self-send redeem — burns the caller's outcome tokens,
   * pays collateral to the caller). Only the position owner can call this.
   */
  public async claimMarketWinnings(params: {
    userAddress: Address;
    marketIdHex: Hex;
    outcomeIdx: 0 | 1;
    amountRaw: bigint;
    outcomeToken?: Address;
  }): Promise<{ hash: Hex }> {
    // Defense-in-depth (FE-BUG-06): never submit a claim when no wallet is
    // connected or when the connected provider account differs from the
    // position owner. Without this, a disconnected UI fallback to the
    // operator address surfaces as an unhandled MetaMask sender-mismatch RPC.
    const authorized = await this.getAuthorizedAccount().catch(() => null);
    if (!authorized?.address) {
      throw new Error('No active wallet connected. Please connect your wallet via RainbowKit.');
    }
    if (authorized.address.toLowerCase() !== params.userAddress.toLowerCase()) {
      throw new Error(
        `Connected wallet (${authorized.address}) does not match claim address (${params.userAddress}). Please switch wallets in MetaMask and try again.`,
      );
    }
    if (params.outcomeToken) {
      await this.ensureModuleOutcomeOperator({
        userAddress: params.userAddress,
        outcomeToken: params.outcomeToken,
      }).catch((err: any) => {
        console.warn('[Web3Service] Module grant notice before claim:', err?.message || err);
      });
    }
    const wallet = await this.getWalletClient(params.userAddress);
    const hash = await wallet.writeContract({
      address: SOMNIA_ADDRESSES.binaryModule,
      abi: BINARY_MODULE_REDEEM_ABI,
      functionName: 'redeem',
      args: [0n, ZERO_BYTES32, params.marketIdHex, params.outcomeIdx, params.amountRaw],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return { hash };
  }

  /**
   * Generates an isolated, ephemeral session key pair locally in the browser memory.
   */
  public generateEphemeralSessionKey(): { address: Address; privateKey: Hex } {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    return {
      address: account.address,
      privateKey,
    };
  }

  /**
   * Authorizes a per-user ephemeral session key on-chain via DreamPulseSessionAccount.
   * Enforces maxTradeSize, dailyVolumeCap, and duration on-chain in 1 transaction.
   */
  public async authorizeSessionOnChain(params: {
    userAddress: Address;
    sessionKey: Address;
    maxTradeSize: number;
    dailyVolumeCap: number;
    durationHours: number;
  }): Promise<{ hash: Hex }> {
    const wallet = await this.getWalletClient(params.userAddress);
    const maxTradeRaw = parseUnits(params.maxTradeSize.toString(), 6);
    const dailyCapRaw = parseUnits(params.dailyVolumeCap.toString(), 6);
    const durationSec = BigInt(Math.floor(params.durationHours * 3600));

    const hash = await wallet.writeContract({
      address: SOMNIA_ADDRESSES.sessionAccount,
      abi: DREAM_PULSE_SESSION_ACCOUNT_ABI,
      functionName: 'authorizeSession',
      args: [params.sessionKey, maxTradeRaw, dailyCapRaw, durationSec],
    });

    await publicClient.waitForTransactionReceipt({ hash });
    return { hash };
  }

  /**
   * Revokes an active per-user session key on-chain via DreamPulseSessionAccount in 1 transaction.
   */
  public async revokeSessionOnChain(params: {
    userAddress: Address;
    sessionKey: Address;
  }): Promise<{ hash: Hex }> {
    const wallet = await this.getWalletClient(params.userAddress);
    const hash = await wallet.writeContract({
      address: SOMNIA_ADDRESSES.sessionAccount,
      abi: DREAM_PULSE_SESSION_ACCOUNT_ABI,
      functionName: 'revokeSession',
      args: [params.sessionKey],
    });

    await publicClient.waitForTransactionReceipt({ hash });
    return { hash };
  }

  /**
   * Reads live on-chain session key policy from DreamPulseSessionAccount.
   */
  public async getOnChainSessionPolicy(params: {
    userAddress: Address;
    sessionKey: Address;
  }): Promise<{
    maxTradeSize: number;
    dailyVolumeCap: number;
    spentToday: number;
    remainingDailyAllowance: number;
    expiresAt: number;
    isActive: boolean;
  } | null> {
    try {
      const res = await publicClient.readContract({
        address: SOMNIA_ADDRESSES.sessionAccount,
        abi: DREAM_PULSE_SESSION_ACCOUNT_ABI,
        functionName: 'getSession',
        args: [params.userAddress, params.sessionKey],
      });
      return {
        maxTradeSize: Number(res[0]) / 1e6,
        dailyVolumeCap: Number(res[1]) / 1e6,
        spentToday: Number(res[2]) / 1e6,
        remainingDailyAllowance: Number(res[3]) / 1e6,
        expiresAt: Number(res[4]),
        isActive: res[5],
      };
    } catch {
      return null;
    }
  }

  /**
   * Reads a user's deployed trading account clone address from the factory.
   */
  public async getCloneAddress(userAddress: Address): Promise<Address | null> {
    try {
      const clone = await publicClient.readContract({
        address: SOMNIA_ADDRESSES.sessionAccountFactory,
        abi: SESSION_FACTORY_ABI,
        functionName: 'accounts',
        args: [userAddress],
      });
      if (!clone || clone === '0x0000000000000000000000000000000000000000') return null;
      return clone as Address;
    } catch {
      return null;
    }
  }

  /**
   * Predicts a user's next undeployed clone address.
   */
  public async predictCloneAddress(userAddress: Address): Promise<Address | null> {
    try {
      const predicted = await publicClient.readContract({
        address: SOMNIA_ADDRESSES.sessionAccountFactory,
        abi: SESSION_FACTORY_ABI,
        functionName: 'predictFor',
        args: [userAddress],
      });
      return predicted as Address;
    } catch {
      return null;
    }
  }

  /**
   * Ensures the user has granted TestUSDC allowance to their own clone.
   * Approves exactly `amount ?? DEFAULT_STANDING_ALLOWANCE` (SEC-11 — never
   * infinite): the clone only ever pulls per-trade shortfalls, bounded
   * on-chain by the session's maxTradeSize/dailyVolumeCap, and only the
   * owner can withdraw from the clone. Pass the user's real trading float
   * as `amount` (any size); re-approve when it is exhausted.
   */
  public async ensureCloneAllowance(params: {
    userAddress: Address;
    cloneAddress: Address;
    amount?: bigint;
  }): Promise<Hex | undefined> {
    const approvalAmount = params.amount ?? DEFAULT_STANDING_ALLOWANCE;
    try {
      const current = await publicClient.readContract({
        address: SOMNIA_ADDRESSES.testUsdc,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [params.userAddress, params.cloneAddress],
      });
      if (current >= approvalAmount) return undefined;
    } catch {}

    const wallet = await this.getWalletClient(params.userAddress);
    const hash = await wallet.writeContract({
      address: SOMNIA_ADDRESSES.testUsdc,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [params.cloneAddress, approvalAmount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * Zeroes an ERC-20 grant (SEC-11 hygiene): lets the user revoke any
   * pool/operator/clone allowance in one transaction. No-op when already zero.
   */
  public async revokeErc20Approval(params: {
    userAddress: Address;
    spender: Address;
    token?: Address;
  }): Promise<Hex | undefined> {
    const token = params.token || SOMNIA_ADDRESSES.testUsdc;
    try {
      const current = await publicClient.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [params.userAddress, params.spender],
      });
      if (current === 0n) return undefined;
    } catch {}
    const wallet = await this.getWalletClient(params.userAddress);
    const hash = await wallet.writeContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [params.spender, 0n],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * One-time SEC-03 migration for pre-registry clones: pins the canonical
   * pool registry (BinarySettlement) and redeem module (BinaryModule) when
   * unset. New factory clones are pre-configured, making this a read-only
   * no-op for them. Owner-only writes; safe to call on every authorize.
   */
  public async ensureCloneSecurityConfig(params: {
    userAddress: Address;
    cloneAddress: Address;
  }): Promise<{ registryHash?: Hex; moduleHash?: Hex }> {
    const result: { registryHash?: Hex; moduleHash?: Hex } = {};
    const wallet = await this.getWalletClient(params.userAddress);
    try {
      const registry = await publicClient.readContract({
        address: params.cloneAddress,
        abi: SESSION_CLONE_ABI,
        functionName: 'poolRegistry',
      }).catch(() => null);
      if (registry === '0x0000000000000000000000000000000000000000') {
        const hash = await wallet.writeContract({
          address: params.cloneAddress,
          abi: SESSION_CLONE_ABI,
          functionName: 'setPoolRegistry',
          args: [SOMNIA_ADDRESSES.binarySettlement],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        result.registryHash = hash;
      }
    } catch (err: any) {
      console.warn('[Web3Service] Clone registry migration notice:', err?.message || err);
    }
    try {
      const trusted = await publicClient.readContract({
        address: params.cloneAddress,
        abi: SESSION_CLONE_ABI,
        functionName: 'trustedModule',
      }).catch(() => null);
      if (trusted === '0x0000000000000000000000000000000000000000') {
        const hash = await wallet.writeContract({
          address: params.cloneAddress,
          abi: SESSION_CLONE_ABI,
          functionName: 'setTrustedModule',
          args: [SOMNIA_ADDRESSES.binaryModule],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        result.moduleHash = hash;
      }
    } catch (err: any) {
      console.warn('[Web3Service] Clone module migration notice:', err?.message || err);
    }
    return result;
  }

  /**
   * Authorizes an ephemeral session key on the user's clone with on-chain risk caps.
   */
  public async authorizeSessionOnClone(params: {
    userAddress: Address;
    cloneAddress: Address;
    sessionKey: Address;
    maxTradeSize: number;
    dailyVolumeCap: number;
    durationHours: number;
  }): Promise<{ hash: Hex }> {
    // SEC-03 migration: pin registry/module on pre-registry clones first.
    // Best-effort — on-chain fail-closed validation protects funds regardless.
    await this.ensureCloneSecurityConfig({
      userAddress: params.userAddress,
      cloneAddress: params.cloneAddress,
    }).catch((err: any) => {
      console.warn('[Web3Service] Clone security-config notice:', err?.message || err);
    });
    const wallet = await this.getWalletClient(params.userAddress);
    const maxTradeRaw = parseUnits(params.maxTradeSize.toString(), 6);
    const dailyCapRaw = parseUnits(params.dailyVolumeCap.toString(), 6);
    const durationSec = BigInt(Math.floor(params.durationHours * 3600));

    const hash = await wallet.writeContract({
      address: params.cloneAddress,
      abi: SESSION_CLONE_ABI,
      functionName: 'authorizeSession',
      args: [params.sessionKey, maxTradeRaw, dailyCapRaw, durationSec],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return { hash };
  }

  /**
   * Revokes an active session key on the user's clone.
   */
  public async revokeSessionOnClone(params: {
    userAddress: Address;
    cloneAddress: Address;
    sessionKey: Address;
  }): Promise<{ hash: Hex }> {
    const wallet = await this.getWalletClient(params.userAddress);
    const hash = await wallet.writeContract({
      address: params.cloneAddress,
      abi: SESSION_CLONE_ABI,
      functionName: 'revokeSession',
      args: [params.sessionKey],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return { hash };
  }

  /**
   * Reads the ERC20 balance of a user's clone.
   */
  public async getCloneBalance(params: {
    cloneAddress: Address;
    token?: Address;
  }): Promise<bigint> {
    try {
      return await publicClient.readContract({
        address: params.token || SOMNIA_ADDRESSES.testUsdc,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [params.cloneAddress],
      });
    } catch {
      return 0n;
    }
  }

  /**
   * Deposits funds from the owner's wallet into the isolated Smart Account Clone.
   * Single-transaction ERC-20 transfer directly to the clone address.
   */
  public async depositToClone(params: {
    userAddress: Address;
    cloneAddress: Address;
    amount: number | bigint;
    token?: Address;
  }): Promise<{ hash: Hex }> {
    const wallet = await this.getWalletClient(params.userAddress);
    const token = params.token || SOMNIA_ADDRESSES.testUsdc;
    const rawAmount = typeof params.amount === 'bigint'
      ? params.amount
      : parseUnits(params.amount.toString(), 6);

    if (rawAmount <= 0n) {
      throw new Error('Deposit amount must be greater than 0');
    }

    const hash = await wallet.writeContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [params.cloneAddress, rawAmount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return { hash };
  }

  /**
   * Withdraws funds from the clone to the owner's wallet (owner-only, non-custodial).
   */
  public async withdrawFromClone(params: {
    userAddress: Address;
    cloneAddress: Address;
    token?: Address;
    amount?: bigint;
  }): Promise<{ hash: Hex }> {
    const wallet = await this.getWalletClient(params.userAddress);
    const token = params.token || SOMNIA_ADDRESSES.testUsdc;
    const actualBalance = await this.getCloneBalance({ cloneAddress: params.cloneAddress, token });
    if (!actualBalance || actualBalance <= 0n) {
      throw new Error('Clone balance is 0 or no funds available to withdraw');
    }

    let withdrawAmount = params.amount;
    // If no amount specified (Max withdrawal), or requested amount meets or exceeds actual balance (e.g. from rounding up in UI),
    // clamp to exact actual balance so transaction never reverts with ERC20InsufficientBalance.
    if (!withdrawAmount || withdrawAmount >= actualBalance) {
      withdrawAmount = actualBalance;
    }

    const MIN_WITHDRAWAL_AMOUNT = 1_000_000n; // 1 tUSDC (6 decimals)
    if (token.toLowerCase() === SOMNIA_ADDRESSES.testUsdc.toLowerCase() && withdrawAmount < MIN_WITHDRAWAL_AMOUNT) {
      throw new Error('Minimum withdrawal amount is 1.00 tUSDC');
    }
    const hash = await wallet.writeContract({
      address: params.cloneAddress,
      abi: SESSION_CLONE_ABI,
      functionName: 'withdraw',
      args: [token, withdrawAmount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return { hash };
  }

  private inFlightSupabaseAuthSignatures = new Map<string, Promise<Hex>>();

  /**
   * Signs Supabase realtime auth EIP-712 payload (wallet, nonce, issuedAt, expiresAt).
   * Used to mint short-lived JWT with `user_address` claim for RLS private-table realtime.
   * Deduplicates in-flight signature requests per wallet so multiple simultaneous calls only prompt once.
   */
  public async signSupabaseAuth(params: {
    wallet: Address;
    nonce: string;
    issuedAt: number;
    expiresAt: number;
  }): Promise<Hex> {
    const key = params.wallet.toLowerCase();
    const existing = this.inFlightSupabaseAuthSignatures.get(key);
    if (existing) {
      return existing;
    }

    const signingPromise = (async () => {
      try {
        const sig = await signTypedData(wagmiConfig, {
          domain: {
            name: AUTH_EIP712_DOMAIN.name,
            version: AUTH_EIP712_DOMAIN.version,
            chainId: AUTH_EIP712_DOMAIN.chainId,
            verifyingContract: AUTH_EIP712_DOMAIN.verifyingContract,
          },
          types: AUTH_EIP712_TYPES,
          primaryType: 'Auth',
          message: {
            wallet: params.wallet,
            nonce: params.nonce,
            issuedAt: BigInt(params.issuedAt),
            expiresAt: BigInt(params.expiresAt),
          },
        });
        return sig as Hex;
      } catch (wagmiErr: any) {
        if (wagmiErr?.code === 4001 || wagmiErr?.message?.includes('User rejected') || wagmiErr?.message?.includes('rejected')) {
          throw new Error('Supabase auth signature rejected by user');
        }
        try {
          const wallet = await this.getWalletClient(params.wallet);
          const signature = await wallet.signTypedData({
            account: params.wallet,
            domain: {
              name: AUTH_EIP712_DOMAIN.name,
              version: AUTH_EIP712_DOMAIN.version,
              chainId: AUTH_EIP712_DOMAIN.chainId,
              verifyingContract: AUTH_EIP712_DOMAIN.verifyingContract,
            },
            types: AUTH_EIP712_TYPES,
            primaryType: 'Auth',
            message: {
              wallet: params.wallet,
              nonce: params.nonce,
              issuedAt: BigInt(params.issuedAt),
              expiresAt: BigInt(params.expiresAt),
            },
          });
          return signature as Hex;
        } catch (fallbackErr: any) {
          if (fallbackErr?.code === 4001 || fallbackErr?.message?.includes('User rejected') || fallbackErr?.message?.includes('rejected')) {
            throw new Error('Supabase auth signature rejected by user');
          }
          throw new Error(`Failed to sign Supabase auth: ${fallbackErr?.message || wagmiErr?.message}`);
        }
      } finally {
        this.inFlightSupabaseAuthSignatures.delete(key);
      }
    })();

    this.inFlightSupabaseAuthSignatures.set(key, signingPromise);
    return signingPromise;
  }

  /**
   * Requests user wallet to sign the non-custodial EIP-712 session delegation typed data.
   */
  public async signSessionDelegation(params: {
    delegator: Address;
    operator: Address;
    maxTradeSize: number;
    dailyVolumeCap: number;
    nonce: number;
    deadline: number;
  }): Promise<Hex> {
    // tUSDC caps are 6-decimal — must match backend COLLATERAL_DECIMALS
    const maxTradeSizeWei = parseUnits(params.maxTradeSize.toString(), COLLATERAL_DECIMALS);
    const dailyVolumeCapWei = parseUnits(params.dailyVolumeCap.toString(), COLLATERAL_DECIMALS);

    try {
      // 1. Try signing via Wagmi / active connector (supports WalletConnect, mobile, extension)
      const sig = await signTypedData(wagmiConfig, {
        domain: {
          name: SESSION_EIP712_DOMAIN.name,
          version: SESSION_EIP712_DOMAIN.version,
          chainId: SESSION_EIP712_DOMAIN.chainId,
          verifyingContract: SESSION_EIP712_DOMAIN.verifyingContract,
        },
        types: SESSION_EIP712_TYPES,
        primaryType: 'SessionDelegation',
        message: {
          delegator: params.delegator,
          operator: params.operator,
          maxTradeSize: maxTradeSizeWei,
          dailyVolumeCap: dailyVolumeCapWei,
          nonce: BigInt(params.nonce),
          deadline: BigInt(params.deadline),
        },
      });

      return sig as Hex;
    } catch (wagmiErr: any) {
      if (
        wagmiErr?.code === 4001 ||
        wagmiErr?.message?.includes('User rejected') ||
        wagmiErr?.message?.includes('rejected')
      ) {
        throw new Error('Signature request rejected by user');
      }

      // 2. Fallback to viem walletClient signTypedData if needed
      try {
        const wallet = await this.getWalletClient(params.delegator);
        const signature = await wallet.signTypedData({
          account: params.delegator,
          domain: {
            name: SESSION_EIP712_DOMAIN.name,
            version: SESSION_EIP712_DOMAIN.version,
            chainId: SESSION_EIP712_DOMAIN.chainId,
            verifyingContract: SESSION_EIP712_DOMAIN.verifyingContract,
          },
          types: SESSION_EIP712_TYPES,
          primaryType: 'SessionDelegation',
          message: {
            delegator: params.delegator,
            operator: params.operator,
            maxTradeSize: maxTradeSizeWei,
            dailyVolumeCap: dailyVolumeCapWei,
            nonce: BigInt(params.nonce),
            deadline: BigInt(params.deadline),
          },
        });
        return signature as Hex;
      } catch (fallbackErr: any) {
        if (
          fallbackErr?.code === 4001 ||
          fallbackErr?.message?.includes('User rejected') ||
          fallbackErr?.message?.includes('rejected')
        ) {
          throw new Error('Signature request rejected by user');
        }
        throw new Error(`Failed to sign session delegation: ${fallbackErr?.message || wagmiErr?.message}`);
      }
    }
  }

  /**
   * Mints TestUSDC collateral tokens for the user wallet using the on-chain faucet.
   */
  public async claimTestUsdcFaucet(
    userAddress: Address,
    amount: number = 1000,
  ): Promise<{ hash: Hex }> {
    const amountRaw = parseUnits(amount.toString(), 6);
    const wallet = await this.getWalletClient(userAddress);
    const hash = await wallet.writeContract({
      address: SOMNIA_ADDRESSES.testUsdc,
      abi: ERC20_ABI,
      functionName: 'faucet',
      args: [amountRaw],
    });

    await publicClient.waitForTransactionReceipt({ hash });
    return { hash };
  }

  /**
   * Places a binary order directly using the user's connected wallet (MetaMask, Rainbow, Mobile).
   * Ensures necessary ERC20 TestUSDC approval exists before calling the pool.
   */
  public async placeBinaryOrderWithWallet(params: {
    userAddress: Address;
    poolAddress: Address;
    outcome: 'YES' | 'NO';
    orderType: 'LIMIT' | 'IOC';
    price: number;
    lotSize: number;
  }): Promise<{ hash: Hex }> {
    const wallet = await this.getWalletClient(params.userAddress);
    const one = 10n ** 6n;
    const rawQuantity = BigInt(Math.floor(params.lotSize * 1_000_000));
    const rawPrice = BigInt(Math.floor(params.price * 1_000_000));
    const priceYes = params.outcome === 'YES' ? rawPrice : one - rawPrice;
    const kind = params.outcome === 'YES' ? 0 : 2; // 0 = BUY_YES, 2 = BUY_NO
    // 0 = LIMIT (NormalOrder: fill or rest), 2 = MARKET (ImmediateOrCancel: fill or cancel)
    const orderTypeEnum = params.orderType === 'IOC' ? 2 : 0;
    const expireTimestampNs = BigInt(Math.floor(Date.now() / 1000) + 3600) * 1_000_000_000n;

    // SEC-03: never approve (or call) an unrecognized pool contract.
    await this.requireTrustedPool(params.poolAddress);

    // Check TestUSDC allowance for the pool
    const token = SOMNIA_ADDRESSES.testUsdc;
    const currentAllowance = await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [params.userAddress, params.poolAddress],
    });

    // SEC-11: approve exactly this order's escrow cost — nothing more.
    const neededAllowance = (rawPrice * rawQuantity) / one;
    if (currentAllowance < neededAllowance) {
      const approveTx = await wallet.writeContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [params.poolAddress, neededAllowance],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
    }

    try {
      const hash = await wallet.writeContract({
        address: params.poolAddress,
        abi: BINARY_POOL_ABI,
        functionName: 'placeBinaryOrder',
        args: [
          kind,
          priceYes,
          rawQuantity,
          expireTimestampNs,
          orderTypeEnum,
          0, // selfMatchingOption
          '0x0000000000000000000000000000000000000000', // builder
          0n, // builderFee
          0n, // userData
        ],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      return { hash };
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('ImmediateOrCancelNoFill')) {
        throw new Error('No matching counterparty liquidity found on the order book at this price (Immediate-Or-Cancel unfilled). Please place a Limit order or adjust price.');
      }
      throw err;
    }
  }

  /**
   * Subscribes to wallet account and chain change events.
   */
  public subscribeToWalletEvents(handlers: {
    onAccountsChanged?: (accounts: string[]) => void;
    onChainChanged?: (chainId: string) => void;
    onDisconnect?: () => void;
  }): () => void {
    const unwatch = watchAccount(wagmiConfig, {
      onChange: (account, prevAccount) => {
        if (!account.isConnected) {
          handlers.onDisconnect?.();
        } else if (account.address && account.address !== prevAccount?.address) {
          handlers.onAccountsChanged?.([account.address]);
        }
        if (account.chainId && account.chainId !== prevAccount?.chainId) {
          handlers.onChainChanged?.(`0x${account.chainId.toString(16)}`);
        }
      },
    });

    const handleAccounts = (accounts: string[]) => {
      handlers.onAccountsChanged?.(accounts);
    };

    const handleChain = (chainId: string) => {
      handlers.onChainChanged?.(chainId);
    };

    const handleDisconnect = () => {
      handlers.onDisconnect?.();
    };

    if (typeof window !== 'undefined' && Boolean(window.ethereum)) {
      window.ethereum.on?.('accountsChanged', handleAccounts);
      window.ethereum.on?.('chainChanged', handleChain);
      window.ethereum.on?.('disconnect', handleDisconnect);
    }

    return () => {
      unwatch();
      if (typeof window !== 'undefined' && Boolean(window.ethereum)) {
        window.ethereum.removeListener?.('accountsChanged', handleAccounts);
        window.ethereum.removeListener?.('chainChanged', handleChain);
        window.ethereum.removeListener?.('disconnect', handleDisconnect);
      }
    };
  }
}

export const web3Service = new Web3Service();


