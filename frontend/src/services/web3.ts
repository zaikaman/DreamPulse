import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  defineChain,
  parseUnits,
  formatUnits,
  encodeFunctionData,
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
  batchHelper: '0x12c9c45fa740ce7469dacff368b08ca7edcaac26' as Address,
};

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
      OPERATOR_SELECTORS.placeBinaryOrderFor,
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
      OPERATOR_SELECTORS.placeBinaryOrderFor,
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
    const wallet = this.getWalletClient(params.userAddress);
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

        // BinaryPool copy-trades need allowance to cover trade size; approve max if below 1000 USDC threshold
        const needThreshold = params.pool ? parseUnits('1000', 6) : amountRaw;
        if (allowance < needThreshold) {
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
    const selectors = [OPERATOR_SELECTORS.placeOrderFor, OPERATOR_SELECTORS.placeBinaryOrderFor, OPERATOR_SELECTORS.cancelOrderFor];

    const needsOperator = !(await this.isOperatorAuthorized({ owner: params.userAddress, operator, selector: OPERATOR_SELECTORS.placeOrderFor }));
    let hasOperatorAllowance = false;
    try {
      const opAllow = await publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [params.userAddress, operator] });
      hasOperatorAllowance = (opAllow as bigint) >= parseUnits('1000', 6);
    } catch {}

    if (!needsOperator && hasOperatorAllowance) return { allowanceHashes: [] };

    const calls: Array<{ to: Address; data: Hex }> = [];
    if (needsOperator) {
      calls.push({
        to: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
        data: encodeFunctionData({ abi: OPERATOR_REGISTRY_ABI, functionName: 'setOperatorApprovalGlobal', args: [operator, selectors, true] }),
      });
    }
    if (!hasOperatorAllowance) {
      calls.push({
        to: token,
        data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [operator, parseUnits('1000000', 6)] }),
      });
    }

    // Try EIP-5792 batch
    const canBatch = typeof window !== 'undefined' && window.ethereum && typeof window.ethereum.request === 'function';
    if (canBatch && calls.length > 1) {
      try {
        const wallet = this.getWalletClient(params.userAddress) as any;
        if (typeof wallet.sendCalls === 'function') {
          const id: string = await wallet.sendCalls({ account: params.userAddress, calls, chain: somniaShannonTestnet });
          const start = Date.now();
          while (Date.now() - start < 90_000) {
            try {
              const status: any = await window.ethereum.request({ method: 'wallet_getCallsStatus', params: [id] });
              if (status?.status === 'CONFIRMED' || status?.status === 200 || status?.receipts) {
                const receipts: Hex[] = (status.receipts || []).map((r: any) => r.transactionHash || r.hash).filter(Boolean);
                return { operatorHash: receipts[0], allowanceHashes: receipts.slice(needsOperator ? 1 : 0) };
              }
              if (status?.status === 'FAILED') throw new Error('Batch failed');
            } catch {}
            await new Promise((r) => setTimeout(r, 1500));
          }
          return { allowanceHashes: [id as Hex] };
        }
        const batchId: string = await window.ethereum.request({
          method: 'wallet_sendCalls',
          params: [{ version: '1.0', chainId: `0x${somniaShannonTestnet.id.toString(16)}`, from: params.userAddress, calls }],
        });
        const start = Date.now();
        while (Date.now() - start < 90_000) {
          try {
            const status: any = await window.ethereum.request({ method: 'wallet_getCallsStatus', params: [batchId] });
            if (status?.status === 'CONFIRMED' || status?.status === 200 || status?.receipts) {
              const receipts: Hex[] = (status.receipts || []).map((r: any) => r.transactionHash || r.hash).filter(Boolean);
              return { operatorHash: receipts[0], allowanceHashes: receipts.slice(needsOperator ? 1 : 0) };
            }
            if (status?.status === 'FAILED') throw new Error('Batch failed');
          } catch {}
          await new Promise((r) => setTimeout(r, 1500));
        }
        return { allowanceHashes: [batchId as Hex] };
      } catch (batchErr: any) {
        const msg = String(batchErr?.message || '');
        if (msg.includes('User rejected') || msg.includes('rejected')) throw batchErr;
        console.warn('[Web3Service] batchAuthorizeAndApprovePools fallback:', msg);
      }
    }

    let operatorHash: Hex | undefined;
    if (needsOperator) {
      const res = await this.grantOperatorGlobal({ userAddress: params.userAddress, operator });
      operatorHash = res.hash;
    }
    const appHash = await this.approveOperatorForTestUsdc({ userAddress: params.userAddress, operator });
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
    const wallet = this.getWalletClient(params.userAddress);
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
   * 2-click forever: single batch for approve(operator,MAX) + setOperatorApprovalGlobal + per-pool setOperatorApprovalForPool for 7d horizon.
   * Uses EIP-5792 wallet_sendCalls or EIP-7702 delegation to Batch helper — one popup for N pools.
   */
  public async batchSingleApproveAndGlobal(params: { userAddress: Address; operator?: Address; pools?: Address[] }): Promise<Hex | undefined> {
    const operator = params.operator || SOMNIA_ADDRESSES.operatorAccount;
    const token = SOMNIA_ADDRESSES.testUsdc;
    const selectors = [OPERATOR_SELECTORS.placeOrderFor, OPERATOR_SELECTORS.placeBinaryOrderFor, OPERATOR_SELECTORS.cancelOrderFor];
    const needsOp = !(await this.isOperatorAuthorized({ owner: params.userAddress, operator }));
    let needsApprove = true;
    try {
      const allowance = await publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [params.userAddress, operator] });
      needsApprove = allowance < parseUnits('1000000', 6);
    } catch {}
    // Also need per-pool isApprovedForPool for future pools — fetch via batch check
    const pools = params.pools || [];
    const poolsToAuthorize: Address[] = [];
    if (pools.length > 0) {
      for (const pool of [...new Set(pools.map((p) => p.toLowerCase()))] as Address[]) {
        if (!pool || pool === SOMNIA_ADDRESSES.binaryModule) continue;
        try {
          const perPool = await publicClient.readContract({
            address: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
            abi: OPERATOR_REGISTRY_ABI,
            functionName: 'isApprovedForPool',
            args: [pool as Address, params.userAddress, operator, OPERATOR_SELECTORS.placeBinaryOrderFor as `0x${string}`],
          });
          if (!perPool) poolsToAuthorize.push(pool as Address);
        } catch {
          poolsToAuthorize.push(pool as Address);
        }
      }
    }
    if (!needsOp && !needsApprove && poolsToAuthorize.length === 0) return undefined;
    const calls: Array<{ to: Address; data: Hex }> = [];
    if (needsApprove) calls.push({ to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [operator, parseUnits('1000000', 6)] }) });
    if (needsOp) calls.push({ to: SOMNIA_ADDRESSES.operatorPermissionsRegistry, data: encodeFunctionData({ abi: OPERATOR_REGISTRY_ABI, functionName: 'setOperatorApprovalGlobal', args: [operator, selectors, true] }) });
    for (const pool of poolsToAuthorize) {
      calls.push({
        to: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
        data: encodeFunctionData({ abi: OPERATOR_REGISTRY_ABI, functionName: 'setOperatorApprovalForPool', args: [pool as Address, operator, selectors, true] }),
      });
    }
    // Try EIP-5792 first
    const canBatch = typeof window !== 'undefined' && (window.ethereum as any)?.request;
    if (canBatch && calls.length > 1) {
      try {
        const walletAny = this.getWalletClient(params.userAddress) as any;
        if (typeof walletAny.sendCalls === 'function') {
          const id = await walletAny.sendCalls({ account: params.userAddress, calls, chain: somniaShannonTestnet });
          const start = Date.now();
          while (Date.now() - start < 60000) {
            try {
              const st: any = await (window.ethereum as any).request({ method: 'wallet_getCallsStatus', params: [id] });
              if (st?.status === 'CONFIRMED' || st?.receipts) return st.receipts?.[0]?.transactionHash || id as Hex;
            } catch {}
            await new Promise((r) => setTimeout(r, 1000));
          }
          return id as Hex;
        }
        const batchId: string = await (window.ethereum as any).request({ method: 'wallet_sendCalls', params: [{ version: '1.0', chainId: `0x${somniaShannonTestnet.id.toString(16)}`, from: params.userAddress, calls }] });
        const start = Date.now();
        while (Date.now() - start < 60000) {
          try {
            const st: any = await (window.ethereum as any).request({ method: 'wallet_getCallsStatus', params: [batchId] });
            if (st?.status === 'CONFIRMED' || st?.receipts) return st.receipts?.[0]?.transactionHash || batchId as Hex;
          } catch {}
          await new Promise((r) => setTimeout(r, 1000));
        }
        return batchId as Hex;
      } catch (e: any) {
        if (String(e?.message || '').includes('User rejected')) throw e;
      }
    }
    // Try EIP-7702 with per-pool batch (also delegates EOA)
    try {
      const hash = await this.batchVia7702({ userAddress: params.userAddress, pools: poolsToAuthorize, operator, token });
      if (hash) return hash;
    } catch {}
    // Fallback sequential — include per-pool approvals (BinaryPool requires per-pool even if global true)
    let lastHash: Hex | undefined;
    if (needsApprove) lastHash = await this.approveOperatorForTestUsdc({ userAddress: params.userAddress, operator });
    if (needsOp) {
      const res = await this.grantOperatorGlobal({ userAddress: params.userAddress, operator });
      lastHash = res.hash;
    }
    if (poolsToAuthorize.length > 0) {
      try {
        const hashes = await this.ensureAllowancesForPools({ userAddress: params.userAddress, pools: poolsToAuthorize });
        if (hashes.length > 0) lastHash = hashes[hashes.length - 1];
      } catch {}
    }
    // Also ensure EOA delegation for future pools even if no per-pool needed now
    try { await this.delegateToBatch(params.userAddress); } catch {}
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
    const wallet = this.getWalletClient(userAddress) as any;
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
   * EIP-7702 single-tx batch: delegate user's EOA to BatchApprove helper and execute batchBoth in one transaction.
   * When pools.length===0 this still ensures delegation (no batchBoth needed) so future pools can be auto-set.
   */
  private async batchVia7702(params: { userAddress: Address; pools: Address[]; operator: Address; token: Address }): Promise<Hex | undefined> {
    const { userAddress, pools, operator, token } = params;
    const selectors = [OPERATOR_SELECTORS.placeOrderFor, OPERATOR_SELECTORS.placeBinaryOrderFor, OPERATOR_SELECTORS.cancelOrderFor];
    const batchAddress = SOMNIA_ADDRESSES.batchHelper;
    const wallet = this.getWalletClient(userAddress) as any;
    if (typeof wallet.signAuthorization !== 'function' || typeof wallet.sendTransaction !== 'function') return undefined;
    try {
      // If no pools, just delegate EOA to Batch so backend can auto-set future per-pool without clicks
      if (pools.length === 0) {
        return await this.delegateToBatch(userAddress);
      }
      const authorization = await wallet.signAuthorization({
        account: userAddress,
        contractAddress: batchAddress,
        chainId: somniaShannonTestnet.id,
        executor: 'self',
      } as any);
      const data = encodeFunctionData({
        abi: [
          { type: 'function', name: 'batchBoth', inputs: [{ name: 'token', type: 'address' }, { name: 'registry', type: 'address' }, { name: 'pools', type: 'address[]' }, { name: 'operator', type: 'address' }, { name: 'selectors', type: 'bytes4[]' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
        ] as any,
        functionName: 'batchBoth',
        args: [token, SOMNIA_ADDRESSES.operatorPermissionsRegistry, pools, operator, selectors, parseUnits('1000000', 6)],
      });
      const hash = await wallet.sendTransaction({
        account: userAddress,
        to: userAddress,
        data,
        authorizationList: [authorization],
        chain: somniaShannonTestnet,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (e: any) {
      if (String(e?.message || '').includes('not support') || String(e?.message || '').includes('authorization')) return undefined;
      throw e;
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
    const selectors = [OPERATOR_SELECTORS.placeOrderFor, OPERATOR_SELECTORS.placeBinaryOrderFor, OPERATOR_SELECTORS.cancelOrderFor];

    const needsOperator = !(await this.isOperatorAuthorized({ owner: params.userAddress, operator, selector: OPERATOR_SELECTORS.placeOrderFor }));
    let hasOperatorAllowance = false;
    try {
      const opAllow = await publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [params.userAddress, operator] });
      hasOperatorAllowance = (opAllow as bigint) >= parseUnits('1000', 6);
    } catch {}

    if (!needsOperator && hasOperatorAllowance) return [];

    const calls: Array<{ to: Address; data: Hex }> = [];
    if (needsOperator) {
      calls.push({
        to: SOMNIA_ADDRESSES.operatorPermissionsRegistry,
        data: encodeFunctionData({ abi: OPERATOR_REGISTRY_ABI, functionName: 'setOperatorApprovalGlobal', args: [operator, selectors, true] }),
      });
    }
    if (!hasOperatorAllowance) {
      calls.push({
        to: token,
        data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [operator, parseUnits('1000000', 6)] }),
      });
    }

    // Feature-detect wallet_sendCalls support
    const canBatch = typeof window !== 'undefined' && window.ethereum && typeof window.ethereum.request === 'function';

    if (canBatch) {
      try {
        // viem's walletClient may expose sendCalls directly
        const wallet = this.getWalletClient(params.userAddress) as any;
        if (typeof wallet.sendCalls === 'function') {
          const sendCallsId: string = await wallet.sendCalls({
            account: params.userAddress,
            calls: calls.map((c) => ({ to: c.to, data: c.data })),
            chain: somniaShannonTestnet,
          });
          // Poll wallet_getCallsStatus until confirmed (EIP-5792)
          const start = Date.now();
          while (Date.now() - start < 90_000) {
            try {
              const status: any = await window.ethereum.request({
                method: 'wallet_getCallsStatus',
                params: [sendCallsId],
              });
              if (status?.status === 'CONFIRMED' || status?.status === 200 || status?.receipts) {
                const receipts: Hex[] = (status.receipts || []).map((r: any) => r.transactionHash || r.hash).filter(Boolean);
                if (receipts.length > 0) return receipts as Hex[];
                return [sendCallsId as Hex];
              }
              if (status?.status === 'FAILED') throw new Error('Batch approve failed');
            } catch {}
            await new Promise((r) => setTimeout(r, 1500));
          }
          return [sendCallsId as Hex];
        }

        // Raw wallet_sendCalls
        const batchId: string = await window.ethereum.request({
          method: 'wallet_sendCalls',
          params: [
            {
              version: '1.0',
              chainId: `0x${somniaShannonTestnet.id.toString(16)}`,
              from: params.userAddress,
              calls,
            },
          ],
        });
        // Poll for batch status
        const start = Date.now();
        while (Date.now() - start < 90_000) {
          try {
            const status: any = await window.ethereum.request({
              method: 'wallet_getCallsStatus',
              params: [batchId],
            });
            if (status?.status === 'CONFIRMED' || status?.status === 200 || status?.receipts) {
              const receipts: Hex[] = (status.receipts || []).map((r: any) => r.transactionHash || r.hash).filter(Boolean);
              if (receipts.length > 0) return receipts as Hex[];
              return [batchId as Hex];
            }
            if (status?.status === 'FAILED') throw new Error('Batch approve failed');
          } catch {}
          await new Promise((r) => setTimeout(r, 1500));
        }
        return [batchId as Hex];
      } catch (batchErr: any) {
        // EIP-5792 not supported or user rejected — fall through to sequential
        const msg = String(batchErr?.message || '');
        if (msg.includes('not support') || msg.includes('not found') || msg.includes('Method')) {
          console.info('[Web3Service] wallet_sendCalls not supported, falling back to sequential approves');
        } else if (msg.includes('User rejected') || msg.includes('rejected')) {
          throw batchErr;
        } else {
          console.warn('[Web3Service] Batch approve notice, falling back:', msg);
        }
      }
    }

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
   * Places a binary order directly using the user's connected wallet (MetaMask).
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
    const wallet = this.getWalletClient(params.userAddress);
    const one = 10n ** 6n;
    const rawQuantity = BigInt(Math.floor(params.lotSize * 1_000_000));
    const rawPrice = BigInt(Math.floor(params.price * 1_000_000));
    const priceYes = params.outcome === 'YES' ? rawPrice : one - rawPrice;
    const kind = params.outcome === 'YES' ? 0 : 1;
    const orderTypeEnum = params.orderType === 'IOC' ? 1 : 0;
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

