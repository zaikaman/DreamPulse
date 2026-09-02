import { getDefaultConfig, type Chain } from '@rainbow-me/rainbowkit';
import { fallback, http } from 'viem';
import { QueryClient } from '@tanstack/react-query';

const configuredRpc = import.meta.env.VITE_SOMNIA_RPC_URL;
const isStandardRpc =
  !configuredRpc ||
  configuredRpc === 'https://dream-rpc.somnia.network' ||
  configuredRpc === 'https://api.infra.testnet.somnia.network';

export const somniaRpcUrls: string[] = isStandardRpc
  ? ['https://dream-rpc.somnia.network', 'https://api.infra.testnet.somnia.network']
  : Array.from(new Set([configuredRpc, 'https://dream-rpc.somnia.network', 'https://api.infra.testnet.somnia.network'].filter(Boolean)));

/**
 * Somnia Shannon Testnet chain definition (Chain ID 50312).
 */
export const somniaShannonTestnet = {
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
      url: import.meta.env.VITE_SOMNIA_EXPLORER_URL || 'https://shannon-explorer.somnia.network',
    },
  },
  iconUrl: 'https://shannon-explorer.somnia.network/favicon.ico',
  iconBackground: '#00ffcc',
  testnet: true,
} as const satisfies Chain;

/**
 * WalletConnect Project ID from environment variable or standard fallback.
 */
const walletConnectProjectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '044601f65212332475a09bc14ceb3c34';

/**
 * RainbowKit & Wagmi v2 client configuration.
 */
export const wagmiConfig = getDefaultConfig({
  appName: 'DreamPulse AI',
  projectId: walletConnectProjectId,
  chains: [somniaShannonTestnet],
  transports: {
    [somniaShannonTestnet.id]: fallback(
      somniaRpcUrls.map((url) => http(url)),
      { rank: false, retryCount: 3 }
    ),
  },
  ssr: false,
});

/**
 * Shared React Query client for Wagmi and application state.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});
