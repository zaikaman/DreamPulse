import React from 'react';
import {
  Menu,
  Gauge,
  Crosshair,
  ListOrdered,
  Brain,
  Cpu,
  Search,
  Wallet,
  Zap,
  Volume2,
  VolumeX,
  Eye,
  Bot,
} from 'lucide-react';
import type { SessionGrant } from '../../types/index.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import { useUserRole } from '../../hooks/useUserRole.js';
import { soundEngine } from '../../services/audio.js';
import { WalletAccountDropdown } from './WalletAccountDropdown.js';
import { Spinner } from '../ui/Spinner.js';

interface DashboardHeaderProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  spotPrices: Record<string, number>;
  isConnected?: boolean;
  latencyMs?: number;
  onExitToLanding?: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  wallet: WalletState;
  activeSession: SessionGrant | null;
  isFauceting?: boolean;
  onClaimFaucet?: (amount?: number) => Promise<void>;
  onOpenSessionModal: () => void;
  onConnectWallet: () => Promise<void>;
  onDisconnectWallet: () => void;
  onSwitchNetwork: () => Promise<void>;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  activeTab,
  onSelectTab,
  onToggleCollapse,
  spotPrices,
  searchQuery,
  onSearchChange,
  wallet,
  activeSession,
  isFauceting,
  onClaimFaucet,
  onOpenSessionModal,
  onConnectWallet,
  onDisconnectWallet,
  onSwitchNetwork,
}) => {
  const { isTrader, isOperator } = useUserRole(wallet);

  const topTabs = [
    { id: 'Overview', label: 'Overview', Icon: Gauge },
    { id: 'Edge Radar', label: 'Edge Radar', Icon: Crosshair },
    { id: 'Markets & Depth', label: 'Markets & Depth', Icon: ListOrdered },
    { id: 'AI Swarm Feed', label: 'AI Stream', Icon: Brain },
    { id: 'Swarm Cockpit', label: isOperator ? 'Swarm Cockpit (Admin)' : 'Swarm Transparency', Icon: Cpu },
  ];

  return (
    <header className="dashboard-top-header">
      {/* Left: Sidebar Toggle & Top Navigation */}
      <div className="header-left-section">
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={onToggleCollapse}
          aria-label="Toggle Sidebar"
        >
          <Menu size={16} />
        </button>

        <div className="shadcn-tabs-bar" style={{ marginLeft: '4px' }}>
          {topTabs.map((t) => {
            const Icon = t.Icon;
            return (
              <button
                key={t.id}
                type="button"
                className={`shadcn-tab-btn ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => onSelectTab(t.id)}
              >
                <Icon size={14} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Center: Spot Price Ribbon */}
      <div className="header-center-section">
        <div className="header-spot-ribbon">
          <div className="header-spot-item">
            <span className="spot-sym">BTC</span>
            <span className="spot-val tabular-num">
              {spotPrices['BTC/USD'] ? (
                `$${spotPrices['BTC/USD'].toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--muted-foreground)' }}>
                  <Spinner size="xs" variant="muted" /> Syncing
                </span>
              )}
            </span>
          </div>

          <div className="header-spot-item">
            <span className="spot-sym">ETH</span>
            <span className="spot-val tabular-num">
              {spotPrices['ETH/USD'] ? (
                `$${spotPrices['ETH/USD'].toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--muted-foreground)' }}>
                  <Spinner size="xs" variant="muted" /> Syncing
                </span>
              )}
            </span>
          </div>

          <div className="header-spot-item">
            <span className="spot-sym">SOL</span>
            <span className="spot-val tabular-num">
              {spotPrices['SOL/USD'] ? (
                `$${spotPrices['SOL/USD'].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--muted-foreground)' }}>
                  <Spinner size="xs" variant="muted" /> Syncing
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Search, Mode, Network, Session & Wallet */}
      <div className="header-right-section">
        <div className="header-search-bar">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search contracts..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="header-search-input"
          />
          <span className="search-shortcut-kbd">⌘K</span>
        </div>

        {/* User Role Indicator Badge */}
        <div
          className="header-network-pill"
          style={{
            borderColor: isOperator ? 'rgba(255, 170, 0, 0.4)' : isTrader ? 'rgba(0, 240, 255, 0.4)' : 'rgba(255, 255, 255, 0.1)',
            background: isOperator ? 'rgba(255, 170, 0, 0.08)' : isTrader ? 'rgba(0, 240, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)',
            color: isOperator ? 'var(--trade-anomaly)' : isTrader ? 'var(--brand-cyan)' : 'var(--muted-foreground)',
          }}
          title={
            isOperator
              ? 'Logged in as Protocol Swarm Operator'
              : isTrader
              ? 'Logged in as Connected Trader'
              : 'Watch-Only Guest (Public Telemetry)'
          }
        >
          {isOperator ? (
            <>
              <Bot size={12} />
              <span style={{ fontWeight: 600, letterSpacing: '0.04em' }}>OPERATOR</span>
            </>
          ) : isTrader ? (
            <>
              <Wallet size={12} />
              <span style={{ fontWeight: 600, letterSpacing: '0.04em' }}>TRADER</span>
            </>
          ) : (
            <>
              <Eye size={12} />
              <span>WATCH-ONLY</span>
            </>
          )}
        </div>

        <div className="header-network-pill">
          <span className="live-dot"></span>
          <span>Somnia 50312</span>
        </div>

        {/* Audio FX Mute Toggle */}
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={() => {
            soundEngine.toggleMute();
            window.dispatchEvent(new Event('audio_mute_toggled'));
          }}
          title={soundEngine.getMuted() ? 'Unmute Sound Effects (M)' : 'Mute Sound Effects (M)'}
          style={{ width: '32px', height: '32px' }}
        >
          {soundEngine.getMuted() ? <VolumeX size={14} style={{ color: 'var(--muted-foreground)' }} /> : <Volume2 size={14} style={{ color: 'var(--brand-cyan)' }} />}
        </button>

        {/* Session Delegation & Wallet Status Action */}
        {!wallet.isConnected ? (
          <button
            type="button"
            className="btn-header-wallet"
            onClick={onConnectWallet}
            title="Connect Web3 Wallet"
          >
            <Wallet size={13} />
            <span>Connect Wallet</span>
          </button>
        ) : !wallet.isCorrectNetwork ? (
          <button
            type="button"
            className="btn-header-network-switch"
            onClick={onSwitchNetwork}
            title="Switch to Somnia Shannon Testnet (50312)"
          >
            <Zap size={13} />
            <span>Switch Network</span>
          </button>
        ) : (
          <WalletAccountDropdown
            wallet={wallet}
            activeSession={activeSession}
            isFauceting={isFauceting}
            onClaimFaucet={onClaimFaucet}
            onOpenSessionModal={onOpenSessionModal}
            onDisconnectWallet={onDisconnectWallet}
            onSwitchNetwork={onSwitchNetwork}
            isOperator={isOperator}
          />
        )}
      </div>
    </header>
  );
};
