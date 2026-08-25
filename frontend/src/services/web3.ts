import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  defineChain,
  parseUnits,
  formatUnits,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';

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
      http: ['https://dream-rpc.somnia.network'],
    },
    public: {
      http: ['https://dream-rpc.somnia.network'],
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
  operatorPermissionsRegistry: '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A' as Address,
  operatorAccount: '0x93e300607c363E7D7a47e50f5c9fDf1723e859Cf' as Address,
  testUsdc: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E' as Address,
  binaryModule: '0x3ecC694Cef705358864a646142ac17A90E29e388' as Address,
  marketsCore: '0x2802504314685D89bF6C992CA5a8e7cC78bc0294' as Address,
  collateralRouter: '0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C' as Address,
};

export const OPERATOR_SELECTORS = {
  placeOrderFor: '0x80054449' as Hex,
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
 * Public Viem client for querying Somnia testnet state.
 */
export const publicClient: PublicClient = createPublicClient({
  chain: somniaShannonTestnet,
  transport: http('https://dream-rpc.somnia.network'),
});

declare global {
  interface Window {
    ethereum?: any;
  }
}

export class Web3Service {
  /**
   * Checks if an injected Ethereum wallet (MetaMask, Rabby, etc.) is available.
   */
  public isWalletAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean(window.ethereum);
  }

  /**
   * Gets a viem WalletClient wrapping window.ethereum for contract transactions.
   */
  public getWalletClient(userAddress: Address) {
    if (!this.isWalletAvailable()) {
      throw new Error('No Ethereum wallet detected.');
    }
    return createWalletClient({
      account: userAddress,
      chain: somniaShannonTestnet,
      transport: custom(window.ethereum),
    });
  }

  /**
   * Checks if an account is already authorized in window.ethereum without opening a prompt (eth_accounts).
   */
  public async getAuthorizedAccount(): Promise<{ address: Address; chainId: number } | null> {
    if (!this.isWalletAvailable()) {
      return null;
    }

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

  /**
   * Connects to the injected Web3 wallet and requests account access.
   */
  public async connectWallet(): Promise<{ address: Address; chainId: number }> {
    if (!this.isWalletAvailable()) {
      throw new Error('No Ethereum wallet detected. Please install MetaMask, Rabby, or Coinbase Wallet.');
    }

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

  /**
   * Switches network to Somnia Shannon Testnet, prompting wallet to add it if missing.
   */
  public async switchOrAddSomniaTestnet(): Promise<boolean> {
    if (!this.isWalletAvailable()) return false;

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
                rpcUrls: ['https://dream-rpc.somnia.network'],
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
      OPERATOR_SELECTORS.cancelOrderFor,
    ];
    const approved = params.approved ?? true;

    const wallet = this.getWalletClient(params.userAddress);
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
      OPERATOR_SELECTORS.cancelOrderFor,
    ];
    const approved = params.approved ?? true;

    const wallet = this.getWalletClient(params.userAddress);
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
    const wallet = this.getWalletClient(params.userAddress);
    const result: { approvalHash?: Hex; vaultModeHash?: Hex; depositHash?: Hex } = {};

    // 1. Ensure token allowance is approved for DreamDEX trading
    if (amountRaw > 0n) {
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

        if (allowance < amountRaw) {
          const appHash = await wallet.writeContract({
            address: token,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [spender, parseUnits('1000000', 6)], // 1,000,000 USDC allowance for seamless trading
          });
          await publicClient.waitForTransactionReceipt({ hash: appHash });
          result.approvalHash = appHash;
        }
      } catch (err: any) {
        console.warn('[Web3Service] Token approval notice:', err.message);
      }
    }

    // 2. If a specific spot pool is provided, attempt manual vault mode and vault deposit
    if (params.pool && params.pool.startsWith('0x') && params.pool !== SOMNIA_ADDRESSES.binaryModule) {
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
      OPERATOR_SELECTORS.cancelOrderFor,
    ];
    const wallet = this.getWalletClient(params.userAddress);

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
    if (!this.isWalletAvailable()) {
      throw new Error('Wallet not available for signing');
    }

    const maxTradeSizeWei = parseUnits(params.maxTradeSize.toString(), 18).toString();
    const dailyVolumeCapWei = parseUnits(params.dailyVolumeCap.toString(), 18).toString();

    const typedData = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        SessionDelegation: [
          { name: 'delegator', type: 'address' },
          { name: 'operator', type: 'address' },
          { name: 'maxTradeSize', type: 'uint256' },
          { name: 'dailyVolumeCap', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'SessionDelegation',
      domain: {
        name: SESSION_EIP712_DOMAIN.name,
        version: SESSION_EIP712_DOMAIN.version,
        chainId: SESSION_EIP712_DOMAIN.chainId,
        verifyingContract: SESSION_EIP712_DOMAIN.verifyingContract,
      },
      message: {
        delegator: params.delegator,
        operator: params.operator,
        maxTradeSize: maxTradeSizeWei,
        dailyVolumeCap: dailyVolumeCapWei,
        nonce: params.nonce,
        deadline: params.deadline,
      },
    };

    try {
      const signature = await window.ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [params.delegator, JSON.stringify(typedData)],
      });

      return signature as Hex;
    } catch (err: any) {
      if (err.code === 4001) {
        throw new Error('Signature request rejected by user');
      }
      throw new Error(`Failed to sign session delegation: ${err.message}`);
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
    const wallet = this.getWalletClient(userAddress);
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
   * Subscribes to wallet account and chain change events.
   */
  public subscribeToWalletEvents(handlers: {
    onAccountsChanged?: (accounts: string[]) => void;
    onChainChanged?: (chainId: string) => void;
    onDisconnect?: () => void;
  }): () => void {
    if (!this.isWalletAvailable()) return () => {};

    const handleAccounts = (accounts: string[]) => {
      handlers.onAccountsChanged?.(accounts);
    };

    const handleChain = (chainId: string) => {
      handlers.onChainChanged?.(chainId);
    };

    const handleDisconnect = () => {
      handlers.onDisconnect?.();
    };

    window.ethereum.on?.('accountsChanged', handleAccounts);
    window.ethereum.on?.('chainChanged', handleChain);
    window.ethereum.on?.('disconnect', handleDisconnect);

    return () => {
      window.ethereum.removeListener?.('accountsChanged', handleAccounts);
      window.ethereum.removeListener?.('chainChanged', handleChain);
      window.ethereum.removeListener?.('disconnect', handleDisconnect);
    };
  }
}

export const web3Service = new Web3Service();

