import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

import { wagmiConfig, queryClient } from './config/wagmi';
import { GlobalErrorBoundary } from './components/common/GlobalErrorBoundary.js';
import App from './App';
import './index.css';

// GlobalErrorBoundary is the root & application boundary: any uncaught render error that
// escapes the per-view boundaries (or a provider init failure) lands on a
// cyberpunk diagnostic recovery screen instead of unmounting into an empty white screen.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GlobalErrorBoundary label="RootProviderBoundary">
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            theme={darkTheme({
              accentColor: '#00ffcc',
              accentColorForeground: '#090c13',
              borderRadius: 'medium',
              fontStack: 'system',
              overlayBlur: 'small',
            })}
            modalSize="compact"
          >
            <GlobalErrorBoundary label="AppBoundary">
              <App />
            </GlobalErrorBoundary>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </GlobalErrorBoundary>
  </React.StrictMode>,
);
