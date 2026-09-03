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
    name: 'Somnia Test Token',
    symbol: 'STT',
    decimals: 18,
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
  testUsdc: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E' as Address,
  binaryModule: '0x3ecC694Cef705358864a646142ac17A90E29e388' as Address,
  marketsCore: '0x2802504314685D89bF6C992CA5a8e7cC78bc0294' as Address,
  collateralRouter: '0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C' as Address,
  batchHelper: '0x12c9c45fa740ce7469dacff368b08ca7edcaac26' as Address,
};

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

        // BinaryPool copy-trades need allowance to cover trade size; approve max if below 1000 tUSDC threshold
        const needThreshold = params.pool ? parseUnits('1000', 6) : amountRaw;
        if (allowance < needThreshold) {
          const appHash = await wallet.writeContract({
            address: token,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [spender, parseUnits('1000000', 6)], // 1,000,000 tUSDC allowance for seamless trading
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

    const minAllowance = parseUnits('1000', 6);
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
   * Single approve(operator) for TestUSDC — one MAX that covers all future pools via transferFrom through operator.
   * Used for the 2-click-forever model: 1 approve(operator) + 1 EIP-712 SessionDelegation.
   * Backend will handle per-pool setOperatorApprovalForPool via meta-tx/EIP-7702 without further user clicks.
   */
  public async approveOperatorForTestUsdc(params: { userAddress: Address; operator?: Address; amount?: bigint }): Promise<Hex | undefined> {
    const operator = params.operator || SOMNIA_ADDRESSES.operatorAccount;
    const amount = params.amount || parseUnits('1000000', 6);
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

    const minAllowance = parseUnits('1000', 6);
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
   * Check if an EOA is already delegated to Batch via EIP-7702 (code = 0xef0100 + batchAddress)
   */
  public async isDelegatedToBatch(owner: Address): Promise<boolean> {
    try {
      const code = await publicClient.getBytecode({ address: owner }) as string | undefined;
      if (!code || code === '0x' || !code.startsWith('0xef0100')) return false;
      return code.toLowerCase().includes(SOMNIA_ADDRESSES.batchHelper.toLowerCase().slice(2));
    } catch { return false; }
  }

  /**
   * Delegate user's EOA to BatchApprove helper via EIP-7702 (one-time, enables backend auto per-pool without further clicks).
   * Must use executor:'self' so authorization is at nonce+1 when account sends its own tx (see batch-7702 subtlety).
   */
  public async delegateToBatch(userAddress: Address): Promise<Hex | undefined> {
    if (await this.isDelegatedToBatch(userAddress)) return undefined;
    const wallet = (await this.getWalletClient(userAddress)) as any;
    if (typeof wallet.signAuthorization !== 'function') return undefined;
    try {
      const batchAddress = SOMNIA_ADDRESSES.batchHelper;
      const authorization = await wallet.signAuthorization({
        account: userAddress,
        contractAddress: batchAddress,
        chainId: somniaShannonTestnet.id,
        executor: 'self',
      } as any);
      // Authorize delegation via self-call (to self with authorizationList). No calldata needed — just set code.
      const hash = await wallet.sendTransaction({
        account: userAddress,
        to: userAddress,
        data: '0x' as Hex,
        authorizationList: [authorization],
        chain: somniaShannonTestnet,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('not support') || msg.includes('authorization') || msg.includes('7702')) return undefined;
      console.warn('[Web3Service] delegateToBatch notice:', msg);
      return undefined;
    }
  }

  /**
   * Ensures TestUSDC allowance and operator authorization.
   * Single approve(operator, MAX) covers all current and future binary prediction pools.
   */
  public async ensureAllowancesForPools(params: {
    userAddress: Address;
    pools?: Address[];
    token?: Address;
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

    const minAllowance = parseUnits('1000', 6);
    const needsOperator = !isGloballyAuthed;
    const hasOperatorAllowance = (currentAllowance as bigint) >= minAllowance;

    if (!needsOperator && hasOperatorAllowance) return [];

    const hashes: Hex[] = [];
    if (needsOperator) {
      const res = await this.grantOperatorGlobal({ userAddress: params.userAddress, operator });
      if (res.hash) hashes.push(res.hash);
    }
    if (!hasOperatorAllowance) {
      const appHash = await this.approveOperatorForTestUsdc({ userAddress: params.userAddress, operator });
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

    // Check TestUSDC allowance for the pool
    const token = SOMNIA_ADDRESSES.testUsdc;
    const currentAllowance = await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [params.userAddress, params.poolAddress],
    });

    const neededAllowance = (rawPrice * rawQuantity) / one;
    if (currentAllowance < neededAllowance) {
      const approveTx = await wallet.writeContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [params.poolAddress, parseUnits('1000000', 6)],
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


