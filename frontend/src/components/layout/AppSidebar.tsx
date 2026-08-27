import React from 'react';
import {
  Squares2X2Icon,
  ViewfinderCircleIcon,
  QueueListIcon,
  AdjustmentsHorizontalIcon,
  CpuChipIcon,
  ChartBarIcon,
  SparklesIcon,
  BookOpenIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  EyeIcon,
  WalletIcon,
  ShieldCheckIcon,
  ArrowLeftEndOnRectangleIcon,
  BoltIcon,
  ChartPieIcon,
} from '@heroicons/react/24/outline';
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

  interface SidebarNavItem {
    id: string;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }

  // Group 1: Trading & Markets
  const tradingNavItems: SidebarNavItem[] = [
    {
      id: 'Overview',
      label: 'Overview',
      Icon: Squares2X2Icon,
      badge: 'Live',
    },
    {
      id: 'Edge Radar',
      label: 'Edge Radar',
      Icon: ViewfinderCircleIcon,
      badge: 'Scanner',
    },
    {
      id: 'Markets',
      label: 'Markets & Depth',
      Icon: QueueListIcon,
      badge: `${activeMarketsCount} Live`,
    },
    {
      id: 'Trade Terminal',
      label: 'Trade Terminal',
      Icon: AdjustmentsHorizontalIcon,
      badge: 'Pro',
    },
  ];

  // Group 2: Autonomous Agents & AI
  const swarmNavItems: SidebarNavItem[] = [
    {
      id: 'Swarm Cockpit',
      label: isOperator ? 'Fleet Cockpit · Operator' : 'Fleet Cockpit',
      Icon: BoltIcon,
      badge: isOperator ? 'Admin' : 'Fleet',
    },
    {
      id: 'Strategy Studio',
      label: 'Strategy Studio',
      Icon: SparklesIcon,
      badge: 'No-Code',
    },
    {
      id: 'Backtester',
      label: 'Backtester',
      Icon: ChartBarIcon,
      badge: 'Lab',
    },
    {
      id: 'AI Swarm Feed',
      label: 'AI Swarm Feed',
      Icon: CpuChipIcon,
    },
  ];

  // Group 3: Portfolio & Settlement
  const portfolioNavItems: SidebarNavItem[] = [
    {
      id: 'Analytics',
      label: 'Analytics',
      Icon: ChartPieIcon,
    },
    {
      id: 'Settlement',
      label: 'Settlement Sweeper',
      Icon: SparklesIcon,
      badge: isTrader ? 'Payouts' : undefined,
    },
    {
      id: 'Docs',
      label: 'Documentation & SDK',
      Icon: BookOpenIcon,
    },
  ];

  const renderNavGroup = (title: string, items: SidebarNavItem[]) => (
    <div className="sidebar-group">
      {!collapsed && <span className="sidebar-group-label">{title}</span>}
      {items.map((item) => {
        const Icon = item.Icon;
        const isActive =
          activeTab === item.id ||
          (item.id === 'Markets' && activeTab === 'Markets & Depth');
        return (
          <button
            key={item.id}
            type="button"
            className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => onSelectTab(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <Icon className="w-4 h-4 sidebar-nav-icon" />
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
  );

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
            src="/assets/logo.svg"
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
            <ChevronDoubleLeftIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Navigation Groups */}
      <div className="sidebar-content">
        {renderNavGroup('Trading & Markets', tradingNavItems)}
        {renderNavGroup('Autonomous Agents & AI', swarmNavItems)}
        {renderNavGroup('Portfolio & Settlement', portfolioNavItems)}
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
              <CpuChipIcon className="w-4 h-4" />
            ) : isTrader ? (
              activeSession?.isActive ? (
                <ShieldCheckIcon className="w-4 h-4" />
              ) : (
                <WalletIcon className="w-4 h-4" />
              )
            ) : (
              <EyeIcon className="w-4 h-4" />
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
                      Connect
                    </button>
                  )}
                </div>
              ) : isTrader ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="user-name" style={{ fontFamily: 'var(--font-mono)' }}>
                      {wallet.address?.slice(0, 6)}…{wallet.address?.slice(-4)}
                    </span>
                    <span className="sidebar-nav-badge tag-cyan" style={{ fontSize: '9px', padding: '1px 5px' }}>Trader</span>
                  </div>
                  {activeSession?.isActive ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted-foreground)' }}>
                      <span style={{ color: 'var(--trade-yes)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--trade-yes)' }} />
                        Session Key
                      </span>
                      {onOpenSessionModal && (
                        <button
                          type="button"
                          onClick={onOpenSessionModal}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--brand-cyan)',
                            cursor: 'pointer',
                            fontSize: '10px',
                            padding: 0,
                          }}
                        >
                          Config
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted-foreground)' }}>
                      <span>Direct mode</span>
                      {onOpenSessionModal && (
                        <button
                          type="button"
                          onClick={onOpenSessionModal}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--brand-cyan)',
                            cursor: 'pointer',
                            fontSize: '10px',
                            padding: 0,
                            fontWeight: 600,
                          }}
                        >
                          Delegate →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="user-name" style={{ fontFamily: 'var(--font-mono)' }}>
                      {wallet.address?.slice(0, 6)}…{wallet.address?.slice(-4)}
                    </span>
                    <span className="sidebar-nav-badge tag-amber" style={{ fontSize: '9px', padding: '1px 5px' }}>Operator</span>
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--trade-anomaly)' }}>Full Protocol Control</span>
                </div>
              )}
            </div>
          ) : null}

          {!collapsed && isTrader && onDisconnectWallet && (
            <button
              type="button"
              onClick={onDisconnectWallet}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--muted-foreground)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
              }}
              title="Disconnect Wallet"
            >
              <ArrowLeftEndOnRectangleIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            type="button"
            className="sidebar-expand-btn"
            onClick={onToggleCollapse}
            title="Expand Sidebar"
          >
            <ChevronDoubleRightIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </aside>
  );
};

export const AppSidebar = React.memo(AppSidebarComponent);
