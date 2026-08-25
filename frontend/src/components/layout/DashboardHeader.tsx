import React from 'react';
import {
  Menu,
  Gauge,
  Crosshair,
  ListOrdered,
  Brain,
  Cpu,
  Search,
  Wifi,
  KeyRound,
  ShieldCheck,
  Wallet,
  Zap,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { SessionGrant } from '../../types/index.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import { soundEngine } from '../../services/audio.js';

interface DashboardHeaderProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  spotPrices: Record<string, number>;
  isConnected: boolean;
  latencyMs: number;
  onExitToLanding?: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  wallet: WalletState;
  activeSession: SessionGrant | null;
  onOpenSessionModal: () => void;
  onConnectWallet: () => Promise<void>;
  onSwitchNetwork: () => Promise<void>;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  activeTab,
  onSelectTab,
  onToggleCollapse,
  spotPrices,
  isConnected,
  latencyMs,
  searchQuery,
  onSearchChange,
  wallet,
  activeSession,
  onOpenSessionModal,
  onConnectWallet,
  onSwitchNetwork,
}) => {
  const topTabs = [
    { id: 'Overview', label: 'Overview', Icon: Gauge },
    { id: 'Edge Radar', label: 'Edge Radar', Icon: Crosshair },
    { id: 'Markets & Depth', label: 'Markets & Depth', Icon: ListOrdered },
    { id: 'AI Swarm Feed', label: 'AI Stream', Icon: Brain },
    { id: 'Swarm Cockpit', label: 'Swarm Cockpit', Icon: Cpu },
  ];

  return (
    <header className="dashboard-top-header">
      {/* Left: Sidebar Toggle & Breadcrumbs */}
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
              {spotPrices['BTC/USD'] ? `$${spotPrices['BTC/USD'].toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : 'Syncing...'}
            </span>
          </div>

          <div className="header-spot-item">
            <span className="spot-sym">ETH</span>
            <span className="spot-val tabular-num">
              {spotPrices['ETH/USD'] ? `$${spotPrices['ETH/USD'].toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : 'Syncing...'}
            </span>
          </div>

          <div className="header-spot-item">
            <span className="spot-sym">SOL</span>
            <span className="spot-val tabular-num">
              {spotPrices['SOL/USD'] ? `$${spotPrices['SOL/USD'].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Syncing...'}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Search, Network, Session & Wallet */}
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

        <div className="header-network-pill">
          <span className="live-dot"></span>
          <span>Somnia 50312</span>
        </div>

        <div className="header-network-pill tabular-num" title="WebSocket Latency">
          <Wifi
            size={13}
            style={{ color: isConnected ? 'var(--trade-yes)' : 'var(--trade-no)' }}
          />
          <span>{isConnected ? `${latencyMs}ms` : 'OFFLINE'}</span>
        </div>

        {/* Audio FX Mute Toggle */}
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={() => {
            soundEngine.toggleMute();
            // force re-render if needed
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
          <button
            type="button"
            className={`btn-header-session ${activeSession?.isActive ? 'active' : 'inactive'}`}
            onClick={onOpenSessionModal}
            title={activeSession?.isActive ? 'Manage Active Session Delegation' : 'Authorize Non-Custodial Session'}
          >
            {activeSession?.isActive ? (
              <>
                <ShieldCheck size={13} className="session-icon-active" />
                <span className="tabular-num">{wallet.address?.slice(0, 5)}...{wallet.address?.slice(-3)}</span>
                <span className="header-session-badge active">ACTIVE</span>
              </>
            ) : (
              <>
                <KeyRound size={13} />
                <span className="tabular-num">{wallet.address?.slice(0, 5)}...{wallet.address?.slice(-3)}</span>
                <span className="header-session-badge delegate">DELEGATE</span>
              </>
            )}
          </button>
        )}
      </div>
    </header>
  );
};
