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
} from 'lucide-react';

interface AppSidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeMarketsCount: number;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  activeMarketsCount,
}) => {
  const mainNavItems = [
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
  ];

  const protocolNavItems = [
    {
      id: 'Swarm Cockpit',
      label: 'Swarm Strategy Cockpit',
      Icon: Cpu,
    },
    {
      id: 'Strategy Studio',
      label: 'Backtest Studio',
      Icon: LineChart,
    },
    {
      id: 'Settlement',
      label: 'Settlement Sweeper',
      Icon: Sparkles,
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
          {!collapsed && <span className="sidebar-group-label">Intelligence & Trading</span>}
          {mainNavItems.map((item) => {
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

        {/* Protocols & Studio */}
        <div className="sidebar-group">
          {!collapsed && <span className="sidebar-group-label">Protocols & Studio</span>}
          {protocolNavItems.map((item) => {
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
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer User / Session Card */}
      <div className="sidebar-footer">
        <div className="sidebar-user-card">
          <div className="user-avatar">
            <Bot size={15} />
          </div>
          {!collapsed ? (
            <div className="user-info">
              <span className="user-name">Somnia Swarm Operator</span>
              <span className="user-role">0x15C7...F20A (Active)</span>
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
