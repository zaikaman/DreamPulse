import {
  createPublicClient,
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
  testUsdc: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E' as Address,
  binaryModule: '0x3ecC694Cef705358864a646142ac17A90E29e388' as Address,
  marketsCore: '0x2802504314685D89bF6C992CA5a8e7cC78bc0294' as Address,
};

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

export const ERC20_BALANCE_ABI = [
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
