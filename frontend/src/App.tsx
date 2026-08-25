import React, { useState, useEffect } from 'react';
import { Box, Zap, Brain, GitBranch, ArrowRight } from 'lucide-react';
import './styles/landing.css';
import './styles/terminal.css';
import './styles/dashboard.css';

import { useMarkets } from './hooks/useMarkets.js';
import { useTelemetry } from './hooks/useTelemetry.js';
import { useSessionKey } from './hooks/useSessionKey.js';
import { AppSidebar } from './components/layout/AppSidebar.js';
import { DashboardHeader } from './components/layout/DashboardHeader.js';
import { OverviewView } from './components/dashboard/OverviewView.js';
import { EdgeRadarView } from './components/dashboard/EdgeRadarView.js';
import { MarketsDepthView } from './components/dashboard/MarketsDepthView.js';
import { SwarmFeedView } from './components/dashboard/SwarmFeedView.js';
import { SwarmCockpitView } from './components/dashboard/SwarmCockpitView.js';
import { StrategyStudio } from './components/StrategyStudio.js';
import { SweeperControls } from './components/SweeperControls.js';
import { SessionDelegationModal } from './components/SessionDelegationModal.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { soundEngine } from './services/audio.js';

interface StatItemProps {
  glyph: string;
  target: number;
  suffix: string;
  decimals: number;
  label: string;
  delayMs: number;
  durationMs: number;
  styleDelay: string;
}

const StatCounter: React.FC<StatItemProps> = ({
  glyph,
  target,
  suffix,
  decimals,
  label,
  delayMs,
  durationMs,
  styleDelay,
}) => {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let animationFrameId: number;
    let startTime: number | null = null;

    const timer = setTimeout(() => {
      const step = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / durationMs, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = easeOut * target;
        setValue(current);

        if (progress < 1) {
          animationFrameId = requestAnimationFrame(step);
        } else {
          setValue(target);
        }
      };

      animationFrameId = requestAnimationFrame(step);
    }, delayMs);

    return () => {
      clearTimeout(timer);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [target, durationMs, delayMs]);

  const formattedValue =
    decimals > 0
      ? value.toFixed(decimals)
      : Math.floor(value).toLocaleString();

  return (
    <div className="stat-item anim" style={{ ['--d' as string]: styleDelay }}>
      <div className="stat-top">
        <span className="stat-glyph">{glyph}</span>
        <span className="stat-value">
          {formattedValue}
          {suffix}
        </span>
      </div>
      <span className="stat-label">{label}</span>
    </div>
  );
};

export const App: React.FC = () => {
  const [activeNav, setActiveNav] = useState<string>('Landing');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [globalSearch, setGlobalSearch] = useState<string>('');

  // Live data hooks
  const { markets, selectedMarket, selectedMarketId, setSelectedMarketId } = useMarkets();
  const { isConnected, latencyMs, liveTicks, depthMap, agentThoughts } = useTelemetry();

  // Session delegation and Web3 wallet hooks
  const {
    wallet,
    activeSession,
    isLoading: isSessionLoading,
    isSigning: isSessionSigning,
    error: sessionError,
    connectWallet,
    switchNetwork,
    createSession,
    revokeSession,
    clearError: clearSessionError,
  } = useSessionKey();

  const [isSessionModalOpen, setIsSessionModalOpen] = useState<boolean>(false);

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

  // Keyboard Shortcuts (1-6 to navigate tabs, S to sweep, M to mute, Space to pause)
  useKeyboardShortcuts({
    onNavigateTab: (tab) => {
      setActiveNav(tab);
      if (tab === 'Overview') window.location.hash = '#overview';
      else if (tab === 'Edge Radar') window.location.hash = '#radar';
      else if (tab === 'Markets & Depth') window.location.hash = '#markets';
      else if (tab === 'AI Swarm Feed') window.location.hash = '#swarm';
      else if (tab === 'Swarm Cockpit') window.location.hash = '#cockpit';
      else if (tab === 'Strategy Studio') window.location.hash = '#studio';
      else if (tab === 'Settlement') window.location.hash = '#settlement';
    },
    onTriggerSweep: () => {
      soundEngine.playWinChime();
    },
  });

  // Compute live spot prices from recent ticks
  const currentSpotPrices: Record<string, number> = {
    'BTC/USD': 96450.0,
    'ETH/USD': 2745.5,
    'SOL/USD': 188.25,
  };

  for (const [, tick] of liveTicks.entries()) {
    if (tick.symbol && tick.spotPrice) {
      currentSpotPrices[tick.symbol] = tick.spotPrice;
    }
  }

  const landingNavItems = [
    { id: 'Overview', label: 'Terminal' },
    { id: 'Edge Radar', label: 'Edge Radar' },
    { id: 'Swarm Cockpit', label: 'Swarm Cockpit' },
    { id: 'Docs', label: 'Docs' },
  ];

  // ----------------------------------------------------------------------------
  // 1. LANDING PAGE VIEW (Pristine Original Design)
  // ----------------------------------------------------------------------------
  if (activeNav === 'Landing') {
    return (
      <div className="page-wrapper">
        {/* Full-bleed cover video behind all UI */}
        <div className="bg">
          <video className="bg-video" autoPlay muted loop playsInline>
            <source
              src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4"
              type="video/mp4"
            />
          </video>
          <div className="bg-overlay"></div>
        </div>

        {/* 3-Region Single Viewport Layout */}
        <div className="page">
          {/* Header */}
          <header className="header">
            <a
              href="#"
              className="logo-btn"
              aria-label="DreamPulse Home"
              onClick={(e) => {
                e.preventDefault();
                setActiveNav('Landing');
                window.location.hash = '';
              }}
            >
              <img
                src="/assets/logo.webp"
                alt="DreamPulse Logo"
                width="52"
                height="52"
                className="logo-img"
              />
            </a>

            <nav className="nav-pill" aria-label="Main Navigation">
              {landingNavItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="nav-link"
                  onClick={() => {
                    setActiveNav(item.id);
                    window.location.hash = item.id === 'Overview' ? '#overview' : item.id === 'Edge Radar' ? '#radar' : '#swarm';
                  }}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <button
              type="button"
              className="sign-in-btn"
              onClick={() => {
                setActiveNav('Overview');
                window.location.hash = '#overview';
              }}
            >
              Launch Terminal
            </button>

            <button
              type="button"
              className={`burger-btn ${mobileMenuOpen ? 'open' : ''}`}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
            >
              <span className="burger-bar"></span>
              <span className="burger-bar"></span>
              <span className="burger-bar"></span>
            </button>
          </header>

          {/* Mobile Overlay & Drawer */}
          <div
            className={`mobile-overlay ${mobileMenuOpen ? 'active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          ></div>

          <div
            className={`mobile-sheet ${mobileMenuOpen ? 'active' : ''}`}
            aria-hidden={!mobileMenuOpen}
          >
            {landingNavItems.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                className="mobile-link"
                style={{ animationDelay: `${0.05 + idx * 0.05}s` }}
                onClick={() => {
                  setActiveNav(item.id);
                  setMobileMenuOpen(false);
                  window.location.hash = item.id === 'Overview' ? '#overview' : '';
                }}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className="sign-in-btn"
              onClick={() => {
                setActiveNav('Overview');
                setMobileMenuOpen(false);
                window.location.hash = '#overview';
              }}
            >
              Launch Terminal
            </button>
          </div>

          {/* Hero Center */}
          <main className="hero">
            <div className="trust-row anim" style={{ ['--d' as string]: '0.05s' }}>
              <div className="avatar-stack">
                <div className="avatar-ring" title="Somnia Layer 1 Network">
                  <div className="avatar-inner">
                    <Box size={14} aria-hidden="true" />
                  </div>
                </div>
                <div className="avatar-ring" title="DreamDEX Event Contracts CLOB">
                  <div className="avatar-inner">
                    <Zap size={14} aria-hidden="true" />
                  </div>
                </div>
                <div className="avatar-ring" title="Quantitative AI Engine">
                  <div className="avatar-inner">
                    <Brain size={14} aria-hidden="true" />
                  </div>
                </div>
              </div>
              <div className="trust-pill">
                <span className="trust-text">Built for DreamDEX on Somnia L1</span>
              </div>
            </div>

            <h1 className="headline">
              <span className="headline-line">Autonomous Swarm</span>
              <span className="headline-line">Engineered For Somnia</span>
            </h1>

            <p className="subhead anim" style={{ ['--d' as string]: '0.28s' }}>
              Autonomous quantitative multi-agent swarm, real-time Φ(z) edge radar,
              and non-custodial session key trading engineered for DreamDEX Event Contracts.
            </p>

            <button
              type="button"
              className="cta-btn anim-pulse"
              style={{ ['--d' as string]: '0.4s' }}
              onClick={() => {
                setActiveNav('Overview');
                window.location.hash = '#overview';
              }}
            >
              Launch Cyber-Terminal
            </button>
          </main>

          {/* Stats Footer */}
          <footer className="stats-footer">
            <StatCounter
              glyph="<"
              target={100}
              suffix="ms"
              decimals={0}
              label="Pricing & Execution Latency"
              delayMs={480}
              durationMs={1500}
              styleDelay="0.5s"
            />
            <StatCounter
              glyph="%"
              target={99.9}
              suffix="%"
              decimals={1}
              label="Black-Scholes Precision"
              delayMs={570}
              durationMs={1580}
              styleDelay="0.58s"
            />
            <StatCounter
              glyph="*"
              target={24}
              suffix="/7"
              decimals={0}
              label="Autonomous Swarm Loop"
              delayMs={660}
              durationMs={1660}
              styleDelay="0.66s"
            />
            <StatCounter
              glyph="#"
              target={50}
              suffix="K+"
              decimals={0}
              label="Historical Replay Fills"
              delayMs={750}
              durationMs={1740}
              styleDelay="0.74s"
            />
          </footer>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------------------
  // 2. SHADCN DASHBOARD WORKSPACE (Task-Oriented & Low Cognitive Load)
  // ----------------------------------------------------------------------------
  return (
    <div className="shadcn-dashboard-root">
      {/* App Sidebar */}
      <AppSidebar
        activeTab={activeNav}
        onSelectTab={(tab) => {
          setActiveNav(tab);
          if (tab === 'Landing') window.location.hash = '';
          else if (tab === 'Overview') window.location.hash = '#overview';
          else if (tab === 'Edge Radar') window.location.hash = '#radar';
          else if (tab === 'Markets & Depth') window.location.hash = '#markets';
          else if (tab === 'AI Swarm Feed') window.location.hash = '#swarm';
          else if (tab === 'Swarm Cockpit') window.location.hash = '#cockpit';
          else if (tab === 'Strategy Studio') window.location.hash = '#studio';
          else if (tab === 'Settlement') window.location.hash = '#settlement';
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        activeMarketsCount={markets.length}
      />

      {/* Main Content Area */}
      <div className="shadcn-main-wrapper">
        {/* Top Header */}
        <DashboardHeader
          activeTab={activeNav}
          onSelectTab={(tab) => {
            setActiveNav(tab);
            if (tab === 'Overview') window.location.hash = '#overview';
            else if (tab === 'Edge Radar') window.location.hash = '#radar';
            else if (tab === 'Markets & Depth') window.location.hash = '#markets';
            else if (tab === 'AI Swarm Feed') window.location.hash = '#swarm';
            else if (tab === 'Swarm Cockpit') window.location.hash = '#cockpit';
            else if (tab === 'Strategy Studio') window.location.hash = '#studio';
            else if (tab === 'Settlement') window.location.hash = '#settlement';
          }}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          spotPrices={currentSpotPrices}
          isConnected={isConnected}
          latencyMs={latencyMs}
          searchQuery={globalSearch}
          onSearchChange={setGlobalSearch}
          wallet={wallet}
          activeSession={activeSession}
          onOpenSessionModal={() => setIsSessionModalOpen(true)}
          onConnectWallet={connectWallet}
          onSwitchNetwork={switchNetwork}
        />

        {/* Dynamic Task-Oriented Main View */}
        <main
          className="dashboard-content-area"
          style={{
            height: 'calc(100vh - 56px)',
            overflow: (activeNav === 'Overview' || activeNav === 'Swarm Cockpit' || activeNav === 'Strategy Studio' || activeNav === 'Settlement') ? 'auto' : 'hidden',
          }}
        >
          {activeNav === 'Overview' ? (
            <OverviewView
              markets={markets}
              liveTicks={liveTicks}
              latencyMs={latencyMs}
              agentThoughts={agentThoughts}
              selectedMarketId={selectedMarketId}
              onSelectMarket={setSelectedMarketId}
              onNavigateToTab={(tab) => {
                setActiveNav(tab);
                if (tab === 'Edge Radar') window.location.hash = '#radar';
                else if (tab === 'Markets & Depth') window.location.hash = '#markets';
                else if (tab === 'AI Swarm Feed') window.location.hash = '#swarm';
                else if (tab === 'Swarm Cockpit') window.location.hash = '#cockpit';
                else if (tab === 'Strategy Studio') window.location.hash = '#studio';
                else if (tab === 'Settlement') window.location.hash = '#settlement';
              }}
              wallet={wallet}
              activeSession={activeSession}
              onOpenSessionModal={() => setIsSessionModalOpen(true)}
              onRevokeSession={revokeSession}
              onConnectWallet={connectWallet}
              onSwitchNetwork={switchNetwork}
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
            />
          ) : activeNav === 'AI Swarm Feed' ? (
            <SwarmFeedView
              agentThoughts={agentThoughts}
              isConnected={isConnected}
            />
          ) : activeNav === 'Swarm Cockpit' ? (
            <SwarmCockpitView />
          ) : activeNav === 'Strategy Studio' ? (
            <StrategyStudio />
          ) : activeNav === 'Settlement' ? (
            <SweeperControls userAddress={wallet.address || undefined} />
          ) : (
            /* Upcoming Protocol View Placeholder */
            <div className="stat-card" style={{ minHeight: '340px', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <GitBranch size={36} style={{ color: 'var(--brand-cyan)', marginBottom: '16px' }} />
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0' }}>{activeNav} Module</h2>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', maxWidth: '420px' }}>
                Configured for upcoming User Story phases. You can explore the live <strong>Mission Control</strong> anytime.
              </p>
              <button
                type="button"
                className="btn-glow"
                style={{ marginTop: '16px' }}
                onClick={() => {
                  setActiveNav('Overview');
                  window.location.hash = '#overview';
                }}
              >
                <span>Back to Mission Control</span>
                <ArrowRight size={11} />
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Non-Custodial Session Key Delegation Modal */}
      <SessionDelegationModal
        isOpen={isSessionModalOpen}
        onClose={() => setIsSessionModalOpen(false)}
        wallet={wallet}
        activeSession={activeSession}
        isSigning={isSessionSigning}
        isLoading={isSessionLoading}
        error={sessionError}
        onConnectWallet={connectWallet}
        onSwitchNetwork={switchNetwork}
        onCreateSession={createSession}
        onRevokeSession={revokeSession}
        onClearError={clearSessionError}
      />
    </div>
  );
};

export default App;
