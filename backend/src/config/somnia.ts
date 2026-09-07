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
  contracts: {},
  testnet: true,
});

/**
 * Operator key material. Derived first so SOMNIA_ADDRESSES.operatorAccount
 * always matches the signing key (previously a separately hardcoded address
 * that could drift from OPERATOR_PRIVATE_KEY).
 */
const operatorPrivateKey = (
  env.OPERATOR_PRIVATE_KEY.startsWith('0x')
    ? env.OPERATOR_PRIVATE_KEY
    : `0x${env.OPERATOR_PRIVATE_KEY}`
) as `0x${string}`;

export const operatorAccount = privateKeyToAccount(operatorPrivateKey, { nonceManager });

/**
 * Somnia and DreamDEX Protocol Deployed Contract Addresses on Shannon Testnet.
 * Sourced from environment (SOMNIA_* vars in backend/.env / Heroku config) —
 * no hardcoded deployment addresses below besides type-level fallbacks.
 */
export const SOMNIA_ADDRESSES = {
  chainId: 50312,
  decimals: 6, // TestUSDC decimals
  // Core protocol contracts (CREATE3 deterministic)
  binaryModule: env.SOMNIA_BINARY_MODULE as Address,
  marketsCore: env.SOMNIA_MARKETS_CORE as Address,
  clobFactory: env.SOMNIA_CLOB_FACTORY as Address,
  binaryPoolImpl: env.SOMNIA_BINARY_POOL_IMPL as Address,
  binarySettlement: env.SOMNIA_BINARY_SETTLEMENT as Address,
  collateralRouter: env.SOMNIA_COLLATERAL_ROUTER as Address,
  marketCreatorFactory: env.SOMNIA_MARKET_CREATOR_FACTORY as Address,
  oracleHub: env.SOMNIA_ORACLE_HUB as Address,
  operatorPermissionsRegistry: env.OPERATOR_PERMISSIONS_REGISTRY_ADDRESS as Address,
  operatorAccount: operatorAccount.address,
  sessionAccount: env.SOMNIA_SESSION_ACCOUNT as Address,
  /** V2 implementation with 1 tUSDC withdrawal fee and 1 tUSDC min threshold */
  sessionAccountImpl: env.SOMNIA_SESSION_ACCOUNT_IMPL as Address,
  /** V2 factory deploying one trading account clone per user (current model). */
  sessionAccountFactory: env.SOMNIA_SESSION_ACCOUNT_FACTORY as Address,
  /** Pre-SEC-03 factory (migration grace-period checks only). */
  sessionAccountFactoryLegacy: env.SOMNIA_SESSION_ACCOUNT_FACTORY_LEGACY as Address,
  // Faucet & Live Market Creators
  collateral: env.SOMNIA_TEST_USDC as Address,
  testUsdc: env.SOMNIA_TEST_USDC as Address,
  marketCreator: env.SOMNIA_MARKET_CREATOR as Address,
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
export const walletClient: WalletClient = createWalletClient({
  account: operatorAccount,
  chain: somniaShannonTestnet,
  transport: somniaTransport,
});

/**
 * Creates an ephemeral viem WalletClient for relaying trades signed by a user's dedicated session key.
 */
export function createSessionWalletClient(sessionPrivateKey: Hex): WalletClient {
  const account = privateKeyToAccount(sessionPrivateKey);
  return createWalletClient({
    account,
    chain: somniaShannonTestnet,
    transport: somniaTransport,
  });
}

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
