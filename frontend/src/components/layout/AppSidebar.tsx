import React from 'react';
import {
  Gauge,
  Crosshair,
  ListOrdered,
  Brain,
  Cpu,
  LineChart,
  Sparkles,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  Bot,
  Eye,
  Wallet,
  ShieldCheck,
  LogOut,
  BarChart3,
} from 'lucide-react';
import type { SessionGrant } from '../../types/index.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import { useUserRole } from '../../hooks/useUserRole.js';

interface AppSidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeMarketsCount: number;
  wallet: WalletState;
  activeSession?: SessionGrant | null;
  onConnectWallet?: () => Promise<void>;
  onDisconnectWallet?: () => void;
  onOpenSessionModal?: () => void;
}

const AppSidebarComponent: React.FC<AppSidebarProps> = ({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  activeMarketsCount,
  wallet,
  activeSession,
  onConnectWallet,
  onDisconnectWallet,
  onOpenSessionModal,
}) => {
  const { isGuest, isTrader, isOperator } = useUserRole(wallet);

  const intelligenceNavItems = [
    {
      id: 'Overview',
      label: 'Mission Control',
      Icon: Gauge,
      badge: 'Live',
    },
    {
      id: 'Edge Radar',
      label: 'Edge Radar & Heatmap',
      Icon: Crosshair,
      badge: 'Scanner',
    },
    {
      id: 'Markets & Depth',
      label: 'Markets & Order Book',
      Icon: ListOrdered,
      badge: `${activeMarketsCount} Live`,
    },
    {
      id: 'AI Swarm Feed',
      label: 'AI Reasoning Stream',
      Icon: Brain,
      badge: '4 Agents',
    },
    {
      id: 'Swarm Cockpit',
      label: 'Swarm Transparency',
      Icon: Cpu,
      badge: isOperator ? 'Admin' : 'Public',
    },
  ];

  const personalNavItems = [
    {
      id: 'Analytics',
      label: 'Analytics & Ledger',
      Icon: BarChart3,
    },
    {
      id: 'Strategy Studio',
      label: 'Strategy & Bot Studio',
      Icon: LineChart,
    },
    {
      id: 'Settlement',
      label: 'Settlement Sweeper',
      Icon: Sparkles,
      badge: isTrader ? 'My Payouts' : undefined,
    },
    {
      id: 'Docs',
      label: 'Documentation & SDK',
      Icon: BookOpen,
    },
  ];

  return (
    <aside className={`shadcn-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-header">
        <a
          href="#landing"
          className="sidebar-brand"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('Landing');
          }}
        >
          <img
            src="/assets/logo.webp"
            alt="DreamPulse Logo"
            className="sidebar-brand-logo"
          />
          {!collapsed && (
            <div className="sidebar-brand-text">
              <span>DreamPulse</span>
              <span className="sidebar-brand-badge">L1</span>
            </div>
          )}
        </a>

        {!collapsed && (
          <button
            type="button"
            className="sidebar-toggle-btn"
            style={{ width: '26px', height: '26px', fontSize: '11px' }}
            onClick={onToggleCollapse}
            title="Collapse Sidebar"
          >
            <ChevronsLeft size={14} />
          </button>
        )}
      </div>

      {/* Navigation Groups */}
      <div className="sidebar-content">
        {/* Core Trading & Intelligence */}
        <div className="sidebar-group">
          {!collapsed && <span className="sidebar-group-label">Intelligence & Alpha</span>}
          {intelligenceNavItems.map((item) => {
            const Icon = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`sidebar-nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => onSelectTab(item.id)}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={16} className="sidebar-nav-icon" />
                {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
                {!collapsed && item.badge && (
                  <span
                    className={`sidebar-nav-badge ${item.badge === 'Admin' ? 'tag-amber' : ''}`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Personal Workspace & Studio */}
        <div className="sidebar-group">
          {!collapsed && <span className="sidebar-group-label">Personal Workspace</span>}
          {personalNavItems.map((item) => {
            const Icon = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`sidebar-nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => onSelectTab(item.id)}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={16} className="sidebar-nav-icon" />
                {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
                {!collapsed && item.badge && (
                  <span className="sidebar-nav-badge">{item.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer User / Identity / Session Card */}
      <div className="sidebar-footer">
        <div className="sidebar-user-card">
          <div
            className="user-avatar"
            style={{
              background: isOperator
                ? 'rgba(255, 170, 0, 0.15)'
                : isTrader
                ? 'rgba(0, 240, 255, 0.15)'
                : 'rgba(255, 255, 255, 0.06)',
              color: isOperator
                ? 'var(--trade-anomaly)'
                : isTrader
                ? 'var(--brand-cyan)'
                : 'var(--muted-foreground)',
            }}
          >
            {isOperator ? (
              <Bot size={15} />
            ) : isTrader ? (
              activeSession?.isActive ? (
                <ShieldCheck size={15} />
              ) : (
                <Wallet size={15} />
              )
            ) : (
              <Eye size={15} />
            )}
          </div>
          {!collapsed ? (
            <div className="user-info" style={{ flex: 1, minWidth: 0 }}>
              {isGuest ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="user-name" style={{ color: 'var(--muted-foreground)' }}>Watch-Only Mode</span>
                    <span className="sidebar-nav-badge" style={{ fontSize: '9px', padding: '1px 5px' }}>Guest</span>
                  </div>
                  {onConnectWallet && (
                    <button
                      type="button"
                      onClick={onConnectWallet}
                      className="btn-header-wallet"
                      style={{
                        padding: '3px 8px',
                        fontSize: '11px',
                        justifyContent: 'center',
                        width: '100%',
                        marginTop: '2px',
                      }}
                    >
                      <Wallet size={11} />
                      <span>Connect Wallet</span>
                    </button>
                  )}
                </div>
              ) : isTrader ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="user-name" style={{ color: 'var(--foreground)' }}>Connected Trader</span>
                    <button
                      type="button"
                      onClick={onOpenSessionModal}
                      className="sidebar-nav-badge"
                      style={{
                        fontSize: '9px',
                        padding: '1px 5px',
                        background: activeSession?.isActive ? 'rgba(0, 255, 136, 0.15)' : 'rgba(0, 240, 255, 0.15)',
                        color: activeSession?.isActive ? 'var(--trade-yes)' : 'var(--brand-cyan)',
                        border: 'none',
                        cursor: onOpenSessionModal ? 'pointer' : 'default',
                      }}
                      title={activeSession?.isActive ? 'Manage Session Delegation' : 'Authorize Session Delegation'}
                    >
                      {activeSession?.isActive ? 'DELEGATED' : 'DIRECT'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="user-role tabular-num" style={{ fontSize: '11px' }}>
                      {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
                    </span>
                    {onDisconnectWallet && (
                      <button
                        type="button"
                        onClick={onDisconnectWallet}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--muted-foreground)',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'color 0.15s ease',
                        }}
                        title="Disconnect Wallet"
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--trade-no)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
                      >
                        <LogOut size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="user-name" style={{ color: 'var(--trade-anomaly)' }}>Protocol Operator</span>
                    <span className="sidebar-nav-badge tag-amber" style={{ fontSize: '9px', padding: '1px 5px' }}>ADMIN</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="user-role tabular-num" style={{ fontSize: '11px' }}>
                      {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
                    </span>
                    {onDisconnectWallet && (
                      <button
                        type="button"
                        onClick={onDisconnectWallet}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--muted-foreground)',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'color 0.15s ease',
                        }}
                        title="Disconnect Wallet"
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--trade-no)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
                      >
                        <LogOut size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="sidebar-toggle-btn"
              style={{ width: '28px', height: '28px', margin: '0 auto' }}
              onClick={onToggleCollapse}
              title="Expand Sidebar"
            >
              <ChevronsRight size={14} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

export const AppSidebar = React.memo(AppSidebarComponent);
