import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

import { wagmiConfig, queryClient } from './config/wagmi';
import { RootErrorBoundary } from './components/common/ErrorBoundary.js';
import App from './App';
import './index.css';

// RootErrorBoundary is the outermost layer: any uncaught render error that
// escapes the per-view boundaries (or a provider init failure) lands on a
// branded recovery screen instead of unmounting the root into a white screen.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
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
            <App />
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </RootErrorBoundary>
  </React.StrictMode>,
);
