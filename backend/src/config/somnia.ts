import {
  createPublicClient,
  createWalletClient,
  fallback,
  http,
  defineChain,
  type Address,
  type Hex,
  type Abi,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount, nonceManager } from 'viem/accounts';
import { SomniaMarkets } from '@somnia-chain/markets-sdk';
import { env } from './env.js';

/**
 * On-chain MarketStatus enum: 0 Listed · 1 Trading · 2 Locked · 3 Settling · 4 Resolved · 5 Voided.
 */
export const MARKET_STATUS = {
  Listed: 0,
  Trading: 1,
  Locked: 2,
  Settling: 3,
  Resolved: 4,
  Voided: 5,
} as const;

const configuredRpc = env.SOMNIA_RPC_URL;
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
      webSocket: ['wss://api.infra.testnet.somnia.network/ws'],
    },
    public: {
      http: somniaRpcUrls,
      webSocket: ['wss://api.infra.testnet.somnia.network/ws'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Somnia Shannon Explorer',
      url: 'https://shannon-explorer.somnia.network',
    },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 0,
    },
  },
  testnet: true,
});

/**
 * Somnia and DreamDEX Protocol Deployed Contract Addresses on Shannon Testnet.
 */
export const SOMNIA_ADDRESSES = {
  chainId: 50312,
  decimals: 6, // TestUSDC decimals
  // Core protocol contracts (CREATE3 deterministic)
  binaryModule: '0x3ecC694Cef705358864a646142ac17A90E29e388' as Address,
  marketsCore: '0x2802504314685D89bF6C992CA5a8e7cC78bc0294' as Address,
  clobFactory: '0xb2BE8EE02F96379DB75f01802384593EBa9bfF04' as Address,
  binaryPoolImpl: '0x82A1FcdaA2daC2fC7D5f9909D43E68021eE966FD' as Address,
  binarySettlement: '0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23' as Address,
  collateralRouter: '0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C' as Address,
  marketCreatorFactory: '0xE6bEE93cE87c9E6e62aCb621caa7832EE47b4F6B' as Address,
  oracleHub: '0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b' as Address,
  operatorPermissionsRegistry: '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A' as Address,
  operatorAccount: '0x93e300607c363E7D7a47e50f5c9fDf1723e859Cf' as Address,
  // Faucet & Live Market Creators
  collateral: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E' as Address,
  testUsdc: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E' as Address,
  marketCreator: '0x5Ce69567dB39C8fBAd7e048bEfdbcCdfE67B44e6' as Address,
  batchHelper: '0x12c9c45fa740ce7469dacff368b08ca7edcaac26' as Address,
};

/**
 * Viem Public Client for querying Somnia Shannon Testnet with fallback transport resiliency.
 */
export const publicClient: PublicClient = createPublicClient({
  chain: somniaShannonTestnet,
  transport: somniaTransport,
});

/**
 * Viem Wallet Client initialized with Operator Private Key and NonceManager for autonomous swarm executions.
 */
const operatorPrivateKey = (
  env.OPERATOR_PRIVATE_KEY.startsWith('0x')
    ? env.OPERATOR_PRIVATE_KEY
    : `0x${env.OPERATOR_PRIVATE_KEY}`
) as `0x${string}`;

export const operatorAccount = privateKeyToAccount(operatorPrivateKey, { nonceManager });

export const walletClient: WalletClient = createWalletClient({
  account: operatorAccount,
  chain: somniaShannonTestnet,
  transport: somniaTransport,
});

let txQueue = Promise.resolve();

/**
 * Serializes on-chain write operations and handles nonce desynchronization with automatic retry.
 */
export async function executeOperatorTx<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
  const execute = async () => {
    let attempts = 0;
    while (attempts < maxRetries) {
      attempts++;
      try {
        return await operation();
      } catch (err: any) {
        const msg: string = err?.message || String(err);
        const isNonceError =
          msg.includes('nonce too low') ||
          msg.includes('Nonce provided') ||
          msg.includes('nonce lower than') ||
          msg.includes('NONCE_EXPIRED') ||
          msg.includes('replacement transaction underpriced') ||
          msg.includes('already known');

        if (isNonceError && attempts < maxRetries) {
          console.warn(
            `[SomniaConfig] Nonce desync detected on attempt ${attempts}/${maxRetries}. Resetting nonce manager and retrying... (${msg.slice(0, 100)})`,
          );
          nonceManager.reset({
            address: operatorAccount.address,
            chainId: somniaShannonTestnet.id,
          });
          await new Promise((r) => setTimeout(r, 400 * attempts));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Transaction execution failed after retries');
  };

  const resultPromise = txQueue.then(execute, execute);
  txQueue = resultPromise.then(() => {}, () => {});
  return resultPromise;
}

/**
 * Safely executes an on-chain contract write for the operator wallet with serialized nonce management.
 */
export async function executeOperatorWriteContract<
  const TAbi extends Abi | readonly unknown[],
  TFunctionName extends string,
>(params: {
  address: Address;
  abi: TAbi;
  functionName: TFunctionName;
  args?: readonly unknown[];
  value?: bigint;
}): Promise<Hex> {
  if (process.env.NODE_ENV === 'test') {
    return '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex;
  }
  return executeOperatorTx(async () => {
    const hash = await walletClient.writeContract({
      chain: somniaShannonTestnet,
      account: operatorAccount,
      ...params,
    } as any);
    return hash;
  });
}

/**
 * SomniaMarkets Exchange Client for interacting with DreamDEX Event Contracts CLOB and indexer.
 */
export const somniaExchange = new SomniaMarkets({
  indexerUrl: env.INDEXER_URL,
  chain: somniaShannonTestnet,
  wsRpcUrl: env.SOMNIA_WS_URL,
  addresses: SOMNIA_ADDRESSES,
  privateKey: operatorPrivateKey,
  fees: {
    maxFeePerGas: 8_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  },
});

/**
 * Minimum STT required for gas (0.001 STT).
 */
export const MIN_OPERATOR_GAS_WEI = 1_000_000_000_000_000n;

let cachedOperatorGas: { balance: bigint; timestamp: number } | null = null;
const GAS_CACHE_TTL_MS = 5_000; // 5 seconds — short TTL so STT deposit is recognized quickly and low-gas pauses lift fast

/**
 * Invalidates cached gas balance so next check hits chain head.
 */
export function invalidateOperatorGasCache(): void {
  cachedOperatorGas = null;
}

/**
 * Returns the operator's native STT balance with TTL caching to avoid RPC spam.
 */
export async function getOperatorGasBalance(): Promise<bigint> {
  if (process.env.NODE_ENV === 'test') {
    return 10n * 10n ** 18n; // 10 STT in test runner
  }
  const now = Date.now();
  if (cachedOperatorGas && now - cachedOperatorGas.timestamp < GAS_CACHE_TTL_MS) {
    return cachedOperatorGas.balance;
  }
  try {
    const bal = await publicClient.getBalance({ address: operatorAccount.address });
    cachedOperatorGas = { balance: bal, timestamp: now };
    return bal;
  } catch {
    if (cachedOperatorGas) return cachedOperatorGas.balance;
    return 0n;
  }
}

/**
 * Returns true if the operator has sufficient STT gas balance.
 */
export async function hasOperatorGas(minGas: bigint = MIN_OPERATOR_GAS_WEI): Promise<boolean> {
  const bal = await getOperatorGasBalance();
  return bal >= minGas;
}
