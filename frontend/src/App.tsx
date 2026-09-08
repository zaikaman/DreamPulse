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
import { ViewErrorBoundary, ViewLoadingFallback } from './components/common/ErrorBoundary.js';
import { lazyWithRetry } from './lib/lazy-with-retry.js';
import { useOnboarding } from './hooks/useOnboarding.js';
import { getViewForHash, navigateToView, getProfileAddressFromHash } from './lib/navigation.js';

// Lazy load heavy modules to minimize initial bundle size and accelerate TTI
// TradeTerminalView (~180kB with OrderBookDepth + chart) and AnalyticsView are the heaviest dashboard modules — lazy to avoid shipping 600kB gz on initial load.
// Each chunk is wrapped with lazyWithRetry (absorbs transient network blips) and a
// per-view ViewErrorBoundary at the render site, so a failed chunk can never
// unmount the whole console into a white screen.
const TradeTerminalView = lazyWithRetry(() => import('./components/dashboard/TradeTerminalView.js').then((m) => ({ default: m.TradeTerminalView })));
const SwarmCockpitView = lazyWithRetry(() => import('./components/dashboard/SwarmCockpitView.js').then((m) => ({ default: m.SwarmCockpitView })));
const StrategyStudioView = lazyWithRetry(() => import('./components/StrategyStudioView.js').then((m) => ({ default: m.StrategyStudioView })));
const Backtester = lazyWithRetry(() => import('./components/StrategyStudio.js').then((m) => ({ default: m.Backtester })));
const SwarmArenaView = lazyWithRetry(() => import('./components/arena/SwarmArenaView.js').then((m) => ({ default: m.SwarmArenaView })));
const TraderProfileView = lazyWithRetry(() => import('./components/arena/TraderProfileView.js').then((m) => ({ default: m.TraderProfileView })));
const SweeperControls = lazyWithRetry(() => import('./components/SweeperControls.js').then((m) => ({ default: m.SweeperControls })));
const AnalyticsView = lazyWithRetry(() => import('./components/dashboard/AnalyticsView.js').then((m) => ({ default: m.AnalyticsView })));
const SessionDelegationModal = lazyWithRetry(() => import('./components/SessionDelegationModal.js').then((m) => ({ default: m.SessionDelegationModal })));
const OnboardingWizardModal = lazyWithRetry(() => import('./components/onboarding/OnboardingWizardModal.js').then((m) => ({ default: m.OnboardingWizardModal })));
const TradingWalletModal = lazyWithRetry(() => import('./components/TradingWalletModal.js').then((m) => ({ default: m.TradingWalletModal })));
const RiskManagementModal = lazyWithRetry(() => import('./components/RiskManagementModal.js').then((m) => ({ default: m.RiskManagementModal })));

export const App: React.FC = () => {
  const [activeNav, setActiveNav] = useState<DashboardViewType>('Landing');
  const [selectedProfileAddress, setSelectedProfileAddress] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

  // Live data hooks
  const { markets, selectedMarket, selectedMarketId, setSelectedMarketId, loading: isMarketsLoading, refreshMarkets } = useMarkets();
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
    cloneAddress,
    cloneBalance,
    withdrawFromClone,
    depositToClone,
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
    isConnected,
    latencyMs,
    liveTicks,
    depthMap,
    agentThoughts,
    debugThoughts,
    isDebugEnabled,
    toggleDebugThoughts,
  } = useTelemetry(wallet.address || undefined);

  const {
    isOnboardingOpen,
    currentStep: onboardingStep,
    setStep: setOnboardingStep,
    openOnboarding,
    closeOnboarding,
    completeOnboarding,
  } = useOnboarding({ wallet, activeSession, autoOpenOnConnect: true });

  const [isSessionModalOpen, setIsSessionModalOpen] = useState<boolean>(false);
  const [sessionModalInitialRevoke, setSessionModalInitialRevoke] = useState<boolean>(false);
  const [isTradingWalletModalOpen, setIsTradingWalletModalOpen] = useState<boolean>(false);
  const [tradingWalletTab, setTradingWalletTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [isRiskModalOpen, setIsRiskModalOpen] = useState<boolean>(false);
  const isAnyChildModalOpen = isSessionModalOpen || isTradingWalletModalOpen || isRiskModalOpen;

  const handleOpenTradingWallet = useCallback((tab: 'deposit' | 'withdraw' = 'deposit') => {
    setTradingWalletTab(tab);
    setIsTradingWalletModalOpen(true);
  }, []);

  const handleOpenRiskModal = useCallback(() => {
    setIsRiskModalOpen(true);
  }, []);

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
    refreshAllowanceStatus(true).catch(() => {});
  }, [refreshAllowanceStatus]);

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
  const [spotTickers, setSpotTickers] = useState<Record<string, { symbol: string; price: number; change1m: number; change5m: number; high24h: number; low24h: number; volume24h: number; timestamp: number }>>({});

  // Periodic load of live spot prices and 1m metrics from REST API
  useEffect(() => {
    const fetchSpots = () => {
      apiClient
        .getSpotPrices()
        .then((res) => {
          if (res.success && res.data) {
            setSpotTickers(res.data);
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
    };
    fetchSpots();
    const interval = setInterval(fetchSpots, 10000);
    return () => clearInterval(interval);
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
      <ViewErrorBoundary viewName="Landing" resetKeys={[activeNav]}>
        <CinematicHero
          onEnterConsole={(view) => {
            const target = view || 'Overview';
            handleNavigateView(target);
          }}
          walletAddress={wallet.address}
          onConnectWallet={connectWallet}
        />
      </ViewErrorBoundary>
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
          <ViewErrorBoundary viewName="Overview" resetKeys={[activeNav]} onNavigateHome={() => handleNavigateView('Overview')}>
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
              onOpenTradeTerminal={handleOpenTradeTerminal}
              wallet={wallet}
              activeSession={activeSession}
              cloneAddress={cloneAddress}
              cloneBalance={cloneBalance}
              onWithdrawClone={withdrawFromClone}
              onOpenTradingWallet={handleOpenTradingWallet}
              onOpenRiskModal={handleOpenRiskModal}
              isFauceting={isSessionFauceting}
              onClaimFaucet={claimCollateralFaucet}
              onOpenSessionModal={handleOpenSessionModal}
              onOpenTour={() => openOnboarding(0)}
              onConnectWallet={connectWallet}
              onSwitchNetwork={switchNetwork}
              isLoading={isMarketsLoading}
            />
          </ViewErrorBoundary>
        ) : activeNav === 'Edge Radar' ? (
          <ViewErrorBoundary viewName="Edge Radar" resetKeys={[activeNav]} onNavigateHome={() => handleNavigateView('Overview')}>
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
          </ViewErrorBoundary>
        ) : activeNav === 'Markets' || activeNav === 'Markets & Depth' ? (
          <ViewErrorBoundary viewName="Markets Explorer" resetKeys={[activeNav]} onNavigateHome={() => handleNavigateView('Overview')}>
            <MarketsExplorerView
              markets={markets}
              selectedMarketId={selectedMarketId}
              onSelectMarket={setSelectedMarketId}
              onOpenTradeTerminal={handleOpenTradeTerminal}
              liveTicks={liveTicks}
              currentSpotPrices={currentSpotPrices}
              isLoading={isMarketsLoading}
            />
          </ViewErrorBoundary>
        ) : activeNav === 'Trade Terminal' ? (
          <ViewErrorBoundary viewName="Trade Terminal" resetKeys={[activeNav]} onNavigateHome={() => handleNavigateView('Overview')}>
          <React.Suspense fallback={<ViewLoadingFallback label="Trade Terminal" />}>
            <TradeTerminalView
              markets={markets}
              selectedMarket={selectedMarket}
              selectedMarketId={selectedMarketId}
              onSelectMarket={setSelectedMarketId}
              onRefreshMarkets={refreshMarkets}
              liveTicks={liveTicks}
              depthMap={depthMap}
              currentSpotPrices={currentSpotPrices}
              spotTickers={spotTickers}
              isLoading={isMarketsLoading}
              wallet={wallet}
              activeSession={activeSession}
              cloneBalance={cloneBalance}
              cloneAddress={cloneAddress}
              onOpenTradingWallet={handleOpenTradingWallet}
              agentThoughts={agentThoughts}
              onOpenSessionModal={handleOpenSessionModal}
              onConnectWallet={connectWallet}
            />
          </React.Suspense>
          </ViewErrorBoundary>
        ) : activeNav === 'AI Swarm Feed' ? (
          <ViewErrorBoundary viewName="AI Swarm Feed" resetKeys={[activeNav]} onNavigateHome={() => handleNavigateView('Overview')}>
            <SwarmFeedView
              agentThoughts={agentThoughts}
              debugThoughts={debugThoughts}
              isDebugEnabled={isDebugEnabled}
              onToggleDebug={toggleDebugThoughts}
              isConnected={isConnected}
              userAddress={wallet.address || undefined}
            />
          </ViewErrorBoundary>
        ) : activeNav === 'Swarm Cockpit' ? (
          <ViewErrorBoundary viewName="Swarm Cockpit" resetKeys={[activeNav]} onNavigateHome={() => handleNavigateView('Overview')}>
          <React.Suspense fallback={<ViewLoadingFallback label="Swarm Cockpit" />}>
            <SwarmCockpitView
              wallet={wallet}
              activeSession={activeSession}
              onForkToStudio={handleForkToStudio}
              onConnectWallet={connectWallet}
              onOpenSessionModal={handleOpenSessionModal}
            />
          </React.Suspense>
          </ViewErrorBoundary>
        ) : activeNav === 'Strategy Studio' ? (
          <ViewErrorBoundary viewName="Strategy Studio" resetKeys={[activeNav]} onNavigateHome={() => handleNavigateView('Overview')}>
          <React.Suspense fallback={<ViewLoadingFallback label="Strategy Studio" />}>
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
          </ViewErrorBoundary>
        ) : activeNav === 'Backtester' ? (
          <ViewErrorBoundary viewName="Backtester" resetKeys={[activeNav]} onNavigateHome={() => handleNavigateView('Overview')}>
          <React.Suspense fallback={<ViewLoadingFallback label="Backtester" />}>
            <Backtester
              initialConfig={forkedStrategyConfig}
              wallet={wallet}
              activeSession={activeSession}
              onOpenSessionModal={handleOpenSessionModal}
              onConnectWallet={connectWallet}
            />
          </React.Suspense>
          </ViewErrorBoundary>
        ) : activeNav === 'Swarm Arena' ? (
          <ViewErrorBoundary viewName="Swarm Arena" resetKeys={[activeNav]} onNavigateHome={() => handleNavigateView('Overview')}>
          <React.Suspense fallback={<ViewLoadingFallback label="Swarm Arena" />}>
            <SwarmArenaView
              wallet={wallet}
              activeSession={activeSession}
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
          </ViewErrorBoundary>
        ) : activeNav === 'Trader Profile' ? (
          <ViewErrorBoundary viewName="Forecaster Profile" resetKeys={[activeNav, selectedProfileAddress]} onNavigateHome={() => handleNavigateView('Overview')}>
          <React.Suspense fallback={<ViewLoadingFallback label="Forecaster Profile" />}>
            <TraderProfileView
              wallet={wallet}
              activeSession={activeSession}
              targetAddress={selectedProfileAddress}
              onBack={() => {
                setActiveNav('Swarm Arena');
                window.location.hash = '#arena';
              }}
              onConnectWallet={connectWallet}
              onOpenSessionModal={handleOpenSessionModal}
            />
          </React.Suspense>
          </ViewErrorBoundary>
        ) : activeNav === 'Analytics' ? (
          <ViewErrorBoundary viewName="Analytics" resetKeys={[activeNav]} onNavigateHome={() => handleNavigateView('Overview')}>
          <React.Suspense fallback={<ViewLoadingFallback label="Analytics" />}>
            <AnalyticsView wallet={wallet} onConnectWallet={connectWallet} />
          </React.Suspense>
          </ViewErrorBoundary>
        ) : activeNav === 'Settlement' ? (
          <ViewErrorBoundary viewName="Settlement Sweeper" resetKeys={[activeNav]} onNavigateHome={() => handleNavigateView('Overview')}>
          <React.Suspense fallback={<ViewLoadingFallback label="Settlement Sweeper" />}>
            <SweeperControls
              userAddress={wallet.address || undefined}
              onConnectWallet={connectWallet}
              cloneAddress={cloneAddress}
              cloneBalance={cloneBalance}
              onWithdrawClone={withdrawFromClone}
            />
          </React.Suspense>
          </ViewErrorBoundary>
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
      {/* Mounted only while open: a chunk failure is scoped to this boundary, and reopening retries the import. */}
      {isSessionModalOpen ? (
        <ViewErrorBoundary viewName="Session Delegation" variant="minimal">
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
              cloneAddress={cloneAddress}
              cloneBalance={cloneBalance}
              onOpenTradingWallet={handleOpenTradingWallet}
              onOpenRiskModal={handleOpenRiskModal}
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
        </ViewErrorBoundary>
      ) : null}

      {/* Isolated Trading Account (Smart Clone) Deposit & Withdraw Modal */}
      {isTradingWalletModalOpen ? (
        <ViewErrorBoundary viewName="Trading Wallet" variant="minimal">
          <React.Suspense fallback={null}>
            <TradingWalletModal
              isOpen={isTradingWalletModalOpen}
              initialTab={tradingWalletTab}
              onClose={() => setIsTradingWalletModalOpen(false)}
              wallet={wallet}
              cloneAddress={cloneAddress}
              cloneBalance={cloneBalance}
              onDeposit={depositToClone}
              onWithdraw={withdrawFromClone}
              onClaimFaucet={claimCollateralFaucet}
              isFauceting={isSessionFauceting}
            />
          </React.Suspense>
        </ViewErrorBoundary>
      ) : null}

      {/* Decoupled Risk Management & Ceilings Modal */}
      {isRiskModalOpen ? (
        <ViewErrorBoundary viewName="Risk Management" variant="minimal">
          <React.Suspense fallback={null}>
            <RiskManagementModal
              isOpen={isRiskModalOpen}
              onClose={() => setIsRiskModalOpen(false)}
              activeSession={activeSession}
              onUpdateRisk={async ({ maxTradeSize, dailyVolumeCap }) => {
                if (wallet.address) {
                  await apiClient.updateSessionRisk(wallet.address, { maxTradeSize, dailyVolumeCap });
                  await refreshAllowanceStatus(true);
                }
              }}
            />
          </React.Suspense>
        </ViewErrorBoundary>
      ) : null}

      {/* Interactive First-Run Onboarding & Setup Wizard */}
      {isOnboardingOpen && !isAnyChildModalOpen ? (
        <ViewErrorBoundary viewName="Onboarding" variant="minimal">
          <React.Suspense fallback={null}>
            <OnboardingWizardModal
              isOpen={isOnboardingOpen && !isAnyChildModalOpen}
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
              currentStep={onboardingStep}
              onStepChange={setOnboardingStep}
            />
          </React.Suspense>
        </ViewErrorBoundary>
      ) : null}
    </>
  );
};

export default App;
