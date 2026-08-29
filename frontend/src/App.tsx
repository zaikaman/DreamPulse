import React, { useState, useEffect, useCallback } from 'react';
import { CommandLineIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import './styles/landing.css';
import './styles/terminal.css';
import './styles/dashboard.css';

import type { AgentType, CustomAgentDefinition, CustomAgentRules } from './types/index.js';
import { useMarkets } from './hooks/useMarkets.js';
import { useTelemetry } from './hooks/useTelemetry.js';
import { useSessionKey } from './hooks/useSessionKey.js';
import { Shell } from './components/layout/Shell.js';
import { CinematicHero, type DashboardViewType } from './components/landing/CinematicHero.js';
import { CommandDialog } from './components/common/CommandDialog.js';
import { OverviewView } from './components/dashboard/OverviewView.js';
import { EdgeRadarView } from './components/dashboard/EdgeRadarView.js';
import { MarketsExplorerView } from './components/dashboard/MarketsExplorerView.js';
import { SwarmFeedView } from './components/dashboard/SwarmFeedView.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { soundEngine } from './services/audio.js';
import { apiClient } from './services/api.js';
import { telemetryClient, type OrderFillData, type SweepCompleteData } from './services/telemetry-client.js';
import { Spinner } from './components/ui/Spinner.js';
import { useOnboarding } from './hooks/useOnboarding.js';
import { getViewForHash, navigateToView, getProfileAddressFromHash } from './lib/navigation.js';

// Lazy load heavy modules to minimize initial bundle size and accelerate TTI
// TradeTerminalView (~180kB with OrderBookDepth + chart) and AnalyticsView are the heaviest dashboard modules — lazy to avoid shipping 600kB gz on initial load.
const TradeTerminalView = React.lazy(() => import('./components/dashboard/TradeTerminalView.js').then((m) => ({ default: m.TradeTerminalView })));
const SwarmCockpitView = React.lazy(() => import('./components/dashboard/SwarmCockpitView.js').then((m) => ({ default: m.SwarmCockpitView })));
const StrategyStudioView = React.lazy(() => import('./components/StrategyStudioView.js').then((m) => ({ default: m.StrategyStudioView })));
const Backtester = React.lazy(() => import('./components/StrategyStudio.js').then((m) => ({ default: m.Backtester })));
const SwarmArenaView = React.lazy(() => import('./components/arena/SwarmArenaView.js').then((m) => ({ default: m.SwarmArenaView })));
const TraderProfileView = React.lazy(() => import('./components/arena/TraderProfileView.js').then((m) => ({ default: m.TraderProfileView })));
const SweeperControls = React.lazy(() => import('./components/SweeperControls.js').then((m) => ({ default: m.SweeperControls })));
const AnalyticsView = React.lazy(() => import('./components/dashboard/AnalyticsView.js').then((m) => ({ default: m.AnalyticsView })));
const SessionDelegationModal = React.lazy(() => import('./components/SessionDelegationModal.js').then((m) => ({ default: m.SessionDelegationModal })));
const OnboardingWizardModal = React.lazy(() => import('./components/onboarding/OnboardingWizardModal.js').then((m) => ({ default: m.OnboardingWizardModal })));

export const App: React.FC = () => {
  const [activeNav, setActiveNav] = useState<DashboardViewType>('Landing');
  const [selectedProfileAddress, setSelectedProfileAddress] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

  // Live data hooks
  const { markets, selectedMarket, selectedMarketId, setSelectedMarketId, loading: isMarketsLoading, refreshMarkets } = useMarkets();
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

  const {
    isOnboardingOpen,
    openOnboarding,
    closeOnboarding,
    completeOnboarding,
  } = useOnboarding({ wallet, activeSession });

  const [isSessionModalOpen, setIsSessionModalOpen] = useState<boolean>(false);
  const [sessionModalInitialRevoke, setSessionModalInitialRevoke] = useState<boolean>(false);
  const [forkedStrategyConfig, setForkedStrategyConfig] = useState<{
    agentType: AgentType;
    config?: Record<string, any>;
    customAgentId?: string;
    customDraft?: Partial<CustomAgentDefinition>;
    customRules?: CustomAgentRules;
    symbol?: string;
    timeframe?: '1m' | '5m' | '15m' | '1h';
  } | null>(null);

  const handleOpenSessionModal = useCallback((options?: { revoke?: boolean }) => {
    setSessionModalInitialRevoke(Boolean(options?.revoke));
    setIsSessionModalOpen(true);
  }, []);

  const handleNavigateView = useCallback((view: DashboardViewType) => {
    setActiveNav(view);
    navigateToView(view);
  }, []);

  const handleForkToStudio = (agentType: AgentType, config: Record<string, any>) => {
    setForkedStrategyConfig({ agentType, config });
    handleNavigateView('Backtester');
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

  // Navigation helper to switch to Trade Terminal with a chosen market
  const handleOpenTradeTerminal = useCallback((marketId: string) => {
    setSelectedMarketId(marketId);
    handleNavigateView('Trade Terminal');
  }, [setSelectedMarketId, handleNavigateView]);

  // Listen to URL hash changes
  useEffect(() => {
    const handleHash = () => {
      const targetView = getViewForHash(window.location.hash);
      const profileAddr = getProfileAddressFromHash(window.location.hash);
      if (profileAddr) {
        setSelectedProfileAddress(profileAddr);
      }
      setActiveNav(targetView);
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Keyboard Shortcuts (1-9 to navigate tabs, S to sweep)
  useKeyboardShortcuts({
    onNavigateTab: (tab) => {
      const target = tab as DashboardViewType;
      handleNavigateView(target);
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
          handleNavigateView(target);
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
        onSelectView={handleNavigateView}
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
        onOpenSessionModal={handleOpenSessionModal}
        onOpenTour={() => openOnboarding(0)}
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
              handleNavigateView(target);
            }}
            wallet={wallet}
            activeSession={activeSession}
            isFauceting={isSessionFauceting}
            onClaimFaucet={claimCollateralFaucet}
            onOpenSessionModal={handleOpenSessionModal}
            onOpenTour={() => openOnboarding(0)}
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
              handleOpenTradeTerminal(selectedMarketId || markets[0]?.id || '');
            }}
            isLoading={isMarketsLoading}
          />
        ) : activeNav === 'Markets' || activeNav === 'Markets & Depth' ? (
          <MarketsExplorerView
            markets={markets}
            selectedMarketId={selectedMarketId}
            onSelectMarket={setSelectedMarketId}
            onOpenTradeTerminal={handleOpenTradeTerminal}
            liveTicks={liveTicks}
            currentSpotPrices={currentSpotPrices}
            isLoading={isMarketsLoading}
          />
        ) : activeNav === 'Trade Terminal' ? (
          <React.Suspense fallback={<div className="glass-card" style={{ minHeight: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}><Spinner size="lg" /><span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Loading Trade Terminal...</span></div>}>
            <TradeTerminalView
              markets={markets}
              selectedMarket={selectedMarket}
              selectedMarketId={selectedMarketId}
              onSelectMarket={setSelectedMarketId}
              onRefreshMarkets={refreshMarkets}
              liveTicks={liveTicks}
              depthMap={depthMap}
              currentSpotPrices={currentSpotPrices}
              isLoading={isMarketsLoading}
              wallet={wallet}
              activeSession={activeSession}
              agentThoughts={agentThoughts}
              onOpenSessionModal={handleOpenSessionModal}
              onConnectWallet={connectWallet}
            />
          </React.Suspense>
        ) : activeNav === 'AI Swarm Feed' ? (
          <SwarmFeedView
            agentThoughts={agentThoughts}
            debugThoughts={debugThoughts}
            isDebugEnabled={isDebugEnabled}
            onToggleDebug={toggleDebugThoughts}
            isConnected={isConnected}
            userAddress={wallet.address || undefined}
          />
        ) : activeNav === 'Swarm Cockpit' ? (
          <React.Suspense fallback={<div className="glass-card" style={{ minHeight: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}><Spinner size="lg" /><span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Loading Swarm Cockpit...</span></div>}>
            <SwarmCockpitView
              wallet={wallet}
              activeSession={activeSession}
              onForkToStudio={handleForkToStudio}
              onConnectWallet={connectWallet}
              onOpenSessionModal={handleOpenSessionModal}
            />
          </React.Suspense>
        ) : activeNav === 'Strategy Studio' ? (
          <React.Suspense fallback={<div className="glass-card" style={{ minHeight: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}><Spinner size="lg" /><span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Loading Strategy Studio...</span></div>}>
            <StrategyStudioView
              wallet={wallet}
              activeSession={activeSession}
              onOpenSessionModal={handleOpenSessionModal}
              onConnectWallet={connectWallet}
              onNavigateToBacktester={(agentId?: string, customDraft?: Partial<CustomAgentDefinition>) => {
                setForkedStrategyConfig({
                  agentType: 'CUSTOM',
                  customAgentId: agentId,
                  customDraft: customDraft,
                  customRules: customDraft?.rules,
                  symbol: customDraft?.symbol,
                  timeframe: customDraft?.timeframe as any,
                });
                setActiveNav('Backtester');
                window.location.hash = '#backtest';
              }}
            />
          </React.Suspense>
        ) : activeNav === 'Backtester' ? (
          <React.Suspense fallback={<div className="glass-card" style={{ minHeight: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}><Spinner size="lg" /><span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Loading Backtester...</span></div>}>
            <Backtester
              initialConfig={forkedStrategyConfig}
              wallet={wallet}
              activeSession={activeSession}
              onOpenSessionModal={handleOpenSessionModal}
              onConnectWallet={connectWallet}
            />
          </React.Suspense>
        ) : activeNav === 'Swarm Arena' ? (
          <React.Suspense fallback={<div className="glass-card" style={{ minHeight: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}><Spinner size="lg" /><span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Loading Swarm Arena & Leaderboard...</span></div>}>
            <SwarmArenaView
              wallet={wallet}
              onOpenSessionModal={handleOpenSessionModal}
              onConnectWallet={connectWallet}
              onNavigateToStudio={(customDraft) => {
                setForkedStrategyConfig({
                  agentType: 'CUSTOM',
                  customAgentId: customDraft?.id,
                  customDraft: customDraft,
                  customRules: customDraft?.rules,
                  symbol: customDraft?.symbol,
                  timeframe: customDraft?.timeframe as any,
                });
                handleNavigateView('Strategy Studio');
              }}
              onNavigateToBacktester={(agentId, customDraft) => {
                setForkedStrategyConfig({
                  agentType: 'CUSTOM',
                  customAgentId: agentId,
                  customDraft: customDraft,
                  customRules: customDraft?.rules,
                  symbol: customDraft?.symbol,
                  timeframe: customDraft?.timeframe as any,
                });
                handleNavigateView('Backtester');
              }}
              onNavigateToTraderProfile={(traderAddr) => {
                setSelectedProfileAddress(traderAddr);
                setActiveNav('Trader Profile');
                window.location.hash = `#profile/${traderAddr}`;
              }}
            />
          </React.Suspense>
        ) : activeNav === 'Trader Profile' ? (
          <React.Suspense fallback={<div className="glass-card" style={{ minHeight: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}><Spinner size="lg" /><span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Loading Forecaster Profile...</span></div>}>
            <TraderProfileView
              wallet={wallet}
              targetAddress={selectedProfileAddress}
              onBack={() => {
                setActiveNav('Swarm Arena');
                window.location.hash = '#arena';
              }}
              onConnectWallet={connectWallet}
              onOpenSessionModal={handleOpenSessionModal}
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
            <CommandLineIcon className="w-9 h-9 text-[#00ffcc] mb-4" />
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
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </Shell>

      {/* Global Interactive Command Palette (⌘K / Ctrl+K) */}
      <CommandDialog
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        markets={markets}
        onSelectMarket={(marketId) => {
          setSelectedMarketId(marketId);
          handleNavigateView('Trade Terminal');
        }}
        onNavigateView={handleNavigateView}
        onOpenSessionModal={handleOpenSessionModal}
        onOpenTour={() => openOnboarding(0)}
        onClaimFaucet={claimCollateralFaucet}
        wallet={wallet}
        activeSession={activeSession}
        onConnectWallet={connectWallet}
        onDisconnectWallet={disconnectWallet}
        onToggleSidebar={handleToggleSidebar}
        onToggleDebug={toggleDebugThoughts}
      />

      {/* Non-Custodial Session Key Delegation Modal */}
      <React.Suspense fallback={null}>
        <SessionDelegationModal
          isOpen={isSessionModalOpen}
          initialRevokeMode={sessionModalInitialRevoke}
          onClose={() => {
            setIsSessionModalOpen(false);
            setSessionModalInitialRevoke(false);
          }}
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

      {/* Interactive First-Run Onboarding & Setup Wizard */}
      <React.Suspense fallback={null}>
        <OnboardingWizardModal
          isOpen={isOnboardingOpen}
          onClose={closeOnboarding}
          wallet={wallet}
          activeSession={activeSession}
          isFauceting={isSessionFauceting}
          onClaimFaucet={claimCollateralFaucet}
          onConnectWallet={connectWallet}
          onSwitchNetwork={switchNetwork}
          onOpenSessionModal={handleOpenSessionModal}
          onNavigateView={handleNavigateView}
          onComplete={completeOnboarding}
        />
      </React.Suspense>
    </>
  );
};

export default App;
