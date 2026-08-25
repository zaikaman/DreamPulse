import { createPublicClient, createWalletClient, http, defineChain, type Address, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { env } from './env.js';

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
      http: [env.SOMNIA_RPC_URL],
    },
    public: {
      http: [env.SOMNIA_RPC_URL],
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
  // Faucet & Live Market Creators
  collateral: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E' as Address,
  testUsdc: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E' as Address,
  marketCreator: '0x5Ce69567dB39C8fBAd7e048bEfdbcCdfE67B44e6' as Address,
};

/**
 * Viem Public Client for querying Somnia Shannon Testnet.
 */
export const publicClient: PublicClient = createPublicClient({
  chain: somniaShannonTestnet,
  transport: http(env.SOMNIA_RPC_URL),
});

/**
 * Viem Wallet Client initialized with Operator Private Key for autonomous swarm executions.
 */
const operatorPrivateKey = (
  env.OPERATOR_PRIVATE_KEY.startsWith('0x')
    ? env.OPERATOR_PRIVATE_KEY
    : `0x${env.OPERATOR_PRIVATE_KEY}`
) as `0x${string}`;

export const operatorAccount = privateKeyToAccount(operatorPrivateKey);

export const walletClient: WalletClient = createWalletClient({
  account: operatorAccount,
  chain: somniaShannonTestnet,
  transport: http(env.SOMNIA_RPC_URL),
});
