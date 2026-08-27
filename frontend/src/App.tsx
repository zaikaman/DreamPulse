import React, { useState, useEffect, useCallback } from 'react';
import { CommandLineIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import './styles/landing.css';
import './styles/terminal.css';
import './styles/dashboard.css';

import type { AgentType } from './types/index.js';
import { useMarkets } from './hooks/useMarkets.js';
import { useTelemetry } from './hooks/useTelemetry.js';
import { useSessionKey } from './hooks/useSessionKey.js';
import { Shell } from './components/layout/Shell.js';
import { CinematicHero, type DashboardViewType } from './components/landing/CinematicHero.js';
import { CommandDialog } from './components/common/CommandDialog.js';
import { OverviewView } from './components/dashboard/OverviewView.js';
import { EdgeRadarView } from './components/dashboard/EdgeRadarView.js';
import { MarketsDepthView } from './components/dashboard/MarketsDepthView.js';
import { SwarmFeedView } from './components/dashboard/SwarmFeedView.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { soundEngine } from './services/audio.js';
import { apiClient } from './services/api.js';
import { telemetryClient, type OrderFillData, type SweepCompleteData } from './services/telemetry-client.js';
import { Spinner } from './components/ui/Spinner.js';

// Lazy load heavy modules to minimize initial bundle size and accelerate TTI
const SwarmCockpitView = React.lazy(() => import('./components/dashboard/SwarmCockpitView.js').then((m) => ({ default: m.SwarmCockpitView })));
const StrategyStudio = React.lazy(() => import('./components/StrategyStudio.js').then((m) => ({ default: m.StrategyStudio })));
const SweeperControls = React.lazy(() => import('./components/SweeperControls.js').then((m) => ({ default: m.SweeperControls })));
const AnalyticsView = React.lazy(() => import('./components/dashboard/AnalyticsView.js').then((m) => ({ default: m.AnalyticsView })));
const SessionDelegationModal = React.lazy(() => import('./components/SessionDelegationModal.js').then((m) => ({ default: m.SessionDelegationModal })));

export const App: React.FC = () => {
  const [activeNav, setActiveNav] = useState<DashboardViewType>('Landing');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

  // Live data hooks
  const { markets, selectedMarket, selectedMarketId, setSelectedMarketId, loading: isMarketsLoading } = useMarkets();
  const {
    isConnected,
    latencyMs,
    liveTicks,
    depthMap,
    agentThoughts,
    debugThoughts,
    isDebugEnabled,
    toggleDebugThoughts,
  } = useTelemetry();

  // Session delegation and Web3 wallet hooks
  const {
    wallet,
    activeSession,
    isLoading: isSessionLoading,
    isSigning: isSessionSigning,
    isFauceting: isSessionFauceting,
    isFixingAllowance,
    stepState: sessionStepState,
    error: sessionError,
    allowanceStatus,
    connectWallet,
    disconnectWallet,
    switchNetwork,
    claimCollateralFaucet,
    createSession,
    revokeSession,
    ensureAllowances,
    refreshAllowanceStatus,
    clearError: clearSessionError,
  } = useSessionKey();

  const [isSessionModalOpen, setIsSessionModalOpen] = useState<boolean>(false);
  const [forkedStrategyConfig, setForkedStrategyConfig] = useState<{ agentType: AgentType; config: Record<string, any> } | null>(null);

  const handleForkToStudio = (agentType: AgentType, config: Record<string, any>) => {
    setForkedStrategyConfig({ agentType, config });
    setActiveNav('Strategy Studio');
    window.location.hash = '#studio';
  };

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  // Global Keyboard Shortcuts: Cmd+K / Ctrl+K, Cmd+B / Ctrl+B
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen to URL hash changes
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'terminal' || hash === 'overview') {
        setActiveNav('Overview');
      } else if (hash === 'radar') {
        setActiveNav('Edge Radar');
      } else if (hash === 'markets' || hash === 'depth') {
        setActiveNav('Markets & Depth');
      } else if (hash === 'swarm' || hash === 'ai') {
        setActiveNav('AI Swarm Feed');
      } else if (hash === 'cockpit' || hash === 'swarm-cockpit') {
        setActiveNav('Swarm Cockpit');
      } else if (hash === 'analytics') {
        setActiveNav('Analytics');
      } else if (hash === 'studio' || hash === 'backtest') {
        setActiveNav('Strategy Studio');
      } else if (hash === 'settlement' || hash === 'sweeper') {
        setActiveNav('Settlement');
      } else if (hash === 'landing' || !hash) {
        setActiveNav('Landing');
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Keyboard Shortcuts (1-6 to navigate tabs, S to sweep)
  useKeyboardShortcuts({
    onNavigateTab: (tab) => {
      const target = tab as DashboardViewType;
      setActiveNav(target);
      if (tab === 'Overview') window.location.hash = '#overview';
      else if (tab === 'Edge Radar') window.location.hash = '#radar';
      else if (tab === 'Markets & Depth') window.location.hash = '#markets';
      else if (tab === 'AI Swarm Feed') window.location.hash = '#swarm';
      else if (tab === 'Swarm Cockpit') window.location.hash = '#cockpit';
      else if (tab === 'Analytics') window.location.hash = '#analytics';
      else if (tab === 'Strategy Studio') window.location.hash = '#studio';
      else if (tab === 'Settlement') window.location.hash = '#settlement';
    },
    onTriggerSweep: () => {
      soundEngine.playWinChime();
    },
  });

  const [initialSpotPrices, setInitialSpotPrices] = useState<Record<string, number>>({});

  // Initial load of live spot prices from REST API
  useEffect(() => {
    apiClient
      .getSpotPrices()
      .then((res) => {
        if (res.success && res.data) {
          const prices: Record<string, number> = {};
          for (const [sym, ticker] of Object.entries(res.data)) {
            prices[sym] = ticker.price;
          }
          setInitialSpotPrices(prices);
        }
      })
      .catch((_err) => {
        // Fallback silently
      });
  }, []);

  // Procedural audio feedback on real-time user events
  useEffect(() => {
    const unsubOrder = telemetryClient.on('order_filled', (order: OrderFillData) => {
      if (wallet.address && order.userAddress && order.userAddress.toLowerCase() === wallet.address.toLowerCase()) {
        soundEngine.playTradeFill();
      }
    });

    const unsubSweep = telemetryClient.on('sweep_completed', (sweep: SweepCompleteData) => {
      if (wallet.address && sweep.userAddress && sweep.userAddress.toLowerCase() === wallet.address.toLowerCase()) {
        soundEngine.playWinChime();
      }
    });

    return () => {
      unsubOrder();
      unsubSweep();
    };
  }, [wallet.address]);

  // Compute live spot prices dynamically from initial snapshot + live WebSocket telemetry ticks
  const currentSpotPrices: Record<string, number> = { ...initialSpotPrices };

  for (const [, tick] of liveTicks.entries()) {
    if (tick.symbol && tick.spotPrice) {
      currentSpotPrices[tick.symbol] = tick.spotPrice;
    }
  }

  // ----------------------------------------------------------------------------
  // 1. CINEMATIC HERO LANDING VIEW
  // ----------------------------------------------------------------------------
  if (activeNav === 'Landing') {
    return (
      <CinematicHero
        onEnterConsole={(view) => {
          const target = view || 'Overview';
          setActiveNav(target);
          if (target === 'Overview') window.location.hash = '#overview';
          else if (target === 'Edge Radar') window.location.hash = '#radar';
          else if (target === 'Markets & Depth') window.location.hash = '#markets';
          else if (target === 'AI Swarm Feed') window.location.hash = '#swarm';
          else if (target === 'Swarm Cockpit') window.location.hash = '#cockpit';
          else if (target === 'Strategy Studio') window.location.hash = '#studio';
          else if (target === 'Analytics') window.location.hash = '#analytics';
          else if (target === 'Settlement') window.location.hash = '#settlement';
        }}
        walletAddress={wallet.address}
        onConnectWallet={connectWallet}
      />
    );
  }

  // ----------------------------------------------------------------------------
  // 2. DASHBOARD WORKSPACE SHELL
  // ----------------------------------------------------------------------------
  return (
    <>
      <Shell
        currentView={activeNav}
        onSelectView={(view) => {
          setActiveNav(view);
          if (view === 'Landing') window.location.hash = '';
          else if (view === 'Overview') window.location.hash = '#overview';
          else if (view === 'Edge Radar') window.location.hash = '#radar';
          else if (view === 'Markets & Depth') window.location.hash = '#markets';
          else if (view === 'AI Swarm Feed') window.location.hash = '#swarm';
          else if (view === 'Swarm Cockpit') window.location.hash = '#cockpit';
          else if (view === 'Analytics') window.location.hash = '#analytics';
          else if (view === 'Strategy Studio') window.location.hash = '#studio';
          else if (view === 'Settlement') window.location.hash = '#settlement';
        }}
        markets={markets}
        selectedMarketId={selectedMarketId}
        onSelectMarket={setSelectedMarketId}
        isSidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={handleToggleSidebar}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        spotPrices={currentSpotPrices}
        isConnected={isConnected}
        latencyMs={latencyMs}
        wallet={wallet}
        activeSession={activeSession}
        isFauceting={isSessionFauceting}
        onClaimFaucet={claimCollateralFaucet}
        onOpenSessionModal={() => setIsSessionModalOpen(true)}
        onConnectWallet={connectWallet}
        onDisconnectWallet={disconnectWallet}
        onSwitchNetwork={switchNetwork}
      >
        {/* Dynamic Task-Oriented Main View */}
        {activeNav === 'Overview' ? (
          <OverviewView
            markets={markets}
            liveTicks={liveTicks}
            latencyMs={latencyMs}
            agentThoughts={agentThoughts}
            selectedMarketId={selectedMarketId}
            onSelectMarket={setSelectedMarketId}
            onNavigateToTab={(tab) => {
              const target = tab as DashboardViewType;
              setActiveNav(target);
              if (tab === 'Edge Radar') window.location.hash = '#radar';
              else if (tab === 'Markets & Depth') window.location.hash = '#markets';
              else if (tab === 'AI Swarm Feed') window.location.hash = '#swarm';
              else if (tab === 'Swarm Cockpit') window.location.hash = '#cockpit';
              else if (tab === 'Analytics') window.location.hash = '#analytics';
              else if (tab === 'Strategy Studio') window.location.hash = '#studio';
              else if (tab === 'Settlement') window.location.hash = '#settlement';
            }}
            wallet={wallet}
            activeSession={activeSession}
            isFauceting={isSessionFauceting}
            onClaimFaucet={claimCollateralFaucet}
            onOpenSessionModal={() => setIsSessionModalOpen(true)}
            onRevokeSession={revokeSession}
            onConnectWallet={connectWallet}
            onSwitchNetwork={switchNetwork}
            isLoading={isMarketsLoading}
          />
        ) : activeNav === 'Edge Radar' ? (
          <EdgeRadarView
            markets={markets}
            selectedMarketId={selectedMarketId}
            onSelectMarket={setSelectedMarketId}
            liveTicks={liveTicks}
            onNavigateToDepth={() => {
              setActiveNav('Markets & Depth');
              window.location.hash = '#markets';
            }}
            isLoading={isMarketsLoading}
          />
        ) : activeNav === 'Markets & Depth' ? (
          <MarketsDepthView
            markets={markets}
            selectedMarket={selectedMarket}
            selectedMarketId={selectedMarketId}
            onSelectMarket={setSelectedMarketId}
            liveTicks={liveTicks}
            depthMap={depthMap}
            currentSpotPrices={currentSpotPrices}
            isLoading={isMarketsLoading}
          />
        ) : activeNav === 'AI Swarm Feed' ? (
          <SwarmFeedView
            agentThoughts={agentThoughts}
            debugThoughts={debugThoughts}
            isDebugEnabled={isDebugEnabled}
            onToggleDebug={toggleDebugThoughts}
            isConnected={isConnected}
          />
        ) : activeNav === 'Swarm Cockpit' ? (
          <React.Suspense fallback={<div className="glass-card" style={{ minHeight: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}><Spinner size="lg" /><span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Loading Swarm Cockpit...</span></div>}>
            <SwarmCockpitView
              wallet={wallet}
              onForkToStudio={handleForkToStudio}
              onConnectWallet={connectWallet}
            />
          </React.Suspense>
        ) : activeNav === 'Strategy Studio' ? (
          <React.Suspense fallback={<div className="glass-card" style={{ minHeight: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}><Spinner size="lg" /><span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Loading Strategy Studio...</span></div>}>
            <StrategyStudio
              initialConfig={forkedStrategyConfig}
              wallet={wallet}
              activeSession={activeSession}
              onOpenSessionModal={() => setIsSessionModalOpen(true)}
              onConnectWallet={connectWallet}
            />
          </React.Suspense>
        ) : activeNav === 'Analytics' ? (
          <React.Suspense fallback={<div className="glass-card" style={{ minHeight: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}><Spinner size="lg" /><span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Loading Analytics...</span></div>}>
            <AnalyticsView wallet={wallet} onConnectWallet={connectWallet} />
          </React.Suspense>
        ) : activeNav === 'Settlement' ? (
          <React.Suspense fallback={<div className="glass-card" style={{ minHeight: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}><Spinner size="lg" /><span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Loading Settlement Sweeper...</span></div>}>
            <SweeperControls
              userAddress={wallet.address || undefined}
              onConnectWallet={connectWallet}
            />
          </React.Suspense>
        ) : (
          <div className="glass-card p-8 rounded-xl text-center flex flex-col items-center justify-center">
            <CommandLineIcon className="size-9 text-cyan-400 mb-4" />
            <h2 className="text-lg font-bold mb-2">{activeNav} Module</h2>
            <p className="text-muted-foreground text-xs max-w-sm">
              Configured for upcoming protocol phases. You can explore the live <strong>Terminal</strong> anytime.
            </p>
            <button
              type="button"
              className="mt-4 liquid-glass px-4 py-2 rounded-full text-xs font-medium flex items-center gap-2 text-white hover:bg-white/5 cursor-pointer"
              onClick={() => {
                setActiveNav('Overview');
                window.location.hash = '#overview';
              }}
            >
              <span>Back to Terminal</span>
              <ArrowRightIcon className="size-3.5" />
            </button>
          </div>
        )}
      </Shell>

      {/* Global Interactive Command Palette (⌘K / Ctrl+K) */}
      <CommandDialog
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        markets={markets}
        onSelectMarket={setSelectedMarketId}
        onNavigateView={(view) => {
          setActiveNav(view);
          if (view === 'Overview') window.location.hash = '#overview';
          else if (view === 'Edge Radar') window.location.hash = '#radar';
          else if (view === 'Markets & Depth') window.location.hash = '#markets';
          else if (view === 'AI Swarm Feed') window.location.hash = '#swarm';
          else if (view === 'Swarm Cockpit') window.location.hash = '#cockpit';
          else if (view === 'Strategy Studio') window.location.hash = '#studio';
          else if (view === 'Settlement') window.location.hash = '#settlement';
          else if (view === 'Analytics') window.location.hash = '#analytics';
        }}
        onOpenSessionModal={() => setIsSessionModalOpen(true)}
        onClaimFaucet={claimCollateralFaucet}
      />

      {/* Non-Custodial Session Key Delegation Modal */}
      <React.Suspense fallback={null}>
        <SessionDelegationModal
          isOpen={isSessionModalOpen}
          onClose={() => setIsSessionModalOpen(false)}
          wallet={wallet}
          activeSession={activeSession}
          isSigning={isSessionSigning}
          isLoading={isSessionLoading}
          isFauceting={isSessionFauceting}
          isFixingAllowance={isFixingAllowance}
          stepState={sessionStepState}
          error={sessionError}
          allowanceStatus={allowanceStatus}
          onConnectWallet={connectWallet}
          onDisconnectWallet={disconnectWallet}
          onSwitchNetwork={switchNetwork}
          onClaimFaucet={claimCollateralFaucet}
          onCreateSession={createSession}
          onRevokeSession={revokeSession}
          onEnsureAllowances={ensureAllowances}
          onRefreshAllowance={refreshAllowanceStatus}
          onClearError={clearSessionError}
        />
      </React.Suspense>
    </>
  );
};

export default App;
