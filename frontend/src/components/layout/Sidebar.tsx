import React from "react";
import {
  Squares2X2Icon,
  ViewfinderCircleIcon,
  Square3Stack3DIcon,
  CpuChipIcon,
  AdjustmentsHorizontalIcon,
  CommandLineIcon,
  SparklesIcon,
  ChartPieIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  ShieldCheckIcon,
  BoltIcon,
} from "@heroicons/react/24/outline";
import { BrandLogo, BrandIcon } from "../common/BrandLogo";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { cn, formatAddress } from "../../lib/utils";
import type { DashboardViewType } from "../landing/CinematicHero";
import type { Market } from "../../types/index";

interface SidebarProps {
  currentView: DashboardViewType;
  onSelectView: (view: DashboardViewType) => void;
  markets?: Market[];
  selectedMarketId?: string | null;
  onSelectMarket?: (marketId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenSessionModal?: () => void;
  wallet?: {
    address: string | null;
    balanceSTT?: string;
    balanceCollateral?: string;
  };
  activeSession?: any | null;
  onConnectWallet?: () => void;
}

interface NavItem {
  id: DashboardViewType;
  label: string;
  badge?: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  markets: _markets = [],
  isCollapsed = false,
  onOpenSessionModal,
  wallet,
  activeSession,
  onConnectWallet,
}) => {
  // Category 1: Market Intelligence & Price Discovery
  const marketNavItems: NavItem[] = [
    {
      id: "Overview" as DashboardViewType,
      label: "Terminal Overview",
      description: "Macro Swarm & Live CLOB Telemetry",
      icon: Squares2X2Icon,
    },
    {
      id: "Edge Radar" as DashboardViewType,
      label: "Edge Radar",
      description: "Black-Scholes Φ(z) Mispricings",
      icon: ViewfinderCircleIcon,
    },
    {
      id: "Markets" as DashboardViewType,
      label: "Markets Explorer",
      description: "Browse 32+ Active Event Contracts",
      icon: Square3Stack3DIcon,
    },
    {
      id: "Trade Terminal" as DashboardViewType,
      label: "Trade Terminal",
      description: "CLOB Depth Ladder & Trader Cockpit",
      icon: AdjustmentsHorizontalIcon,
    },
  ];

  // Category 2: Quantitative AI Swarm
  const swarmNavItems = [
    {
      id: "AI Swarm Feed" as DashboardViewType,
      label: "Live Swarm Feed",
      description: "Real-time Multi-Agent Reasoning",
      icon: CpuChipIcon,
    },
    {
      id: "Swarm Cockpit" as DashboardViewType,
      label: "Swarm Cockpit",
      description: "Risk Guardrails & Swarm Controls",
      icon: AdjustmentsHorizontalIcon,
    },
  ];

  // Category 3: Strategy, Settlement & Performance
  const executionNavItems = [
    {
      id: "Strategy Studio" as DashboardViewType,
      label: "Strategy Studio",
      description: "Quant Backtester & Formula Studio",
      icon: CommandLineIcon,
    },
    {
      id: "Settlement" as DashboardViewType,
      label: "Settlement Sweeper",
      description: "Batch Outcome Claims & Compounder",
      icon: CheckCircleIcon,
    },
    {
      id: "Analytics" as DashboardViewType,
      label: "Portfolio Analytics",
      description: "Sharpe, Sortino & PnL Replay",
      icon: ChartPieIcon,
    },
  ];

  const renderNavGroup = (title: string, items: typeof marketNavItems) => (
    <div className="space-y-1">
      {!isCollapsed && (
        <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
          {title}
        </div>
      )}
      <nav className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              title={isCollapsed ? `${item.label} — ${item.description}` : undefined}
              className={cn(
                "w-full flex items-center rounded-lg text-xs font-medium transition-colors text-left group cursor-pointer",
                isCollapsed ? "justify-center p-2" : "justify-between px-2.5 py-1.5",
                isActive
                  ? "bg-secondary text-foreground font-semibold shadow-2xs"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0",
                    isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </div>
              {!isCollapsed && item.badge && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground font-medium">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );

  return (
    <aside
      className={cn(
        "shrink-0 border-r border-border/50 bg-sidebar/65 backdrop-blur-xl text-sidebar-foreground flex flex-col justify-between p-3 font-sans select-none overflow-y-auto transition-all duration-200",
        isCollapsed ? "w-16 items-center px-2" : "w-64"
      )}
    >
      <div className="space-y-3 w-full">
        {/* Brand Header */}
        <button
          onClick={() => onSelectView("Landing")}
          className={cn(
            "w-full flex items-center gap-2.5 px-2 py-1 rounded-xl hover:bg-muted/60 transition-all text-left group cursor-pointer",
            isCollapsed && "justify-center px-0"
          )}
          title="Return to Cinematic Landing Hero"
        >
          {isCollapsed ? (
            <BrandIcon size="sm" glow interactive />
          ) : (
            <BrandLogo size="md" glow interactive />
          )}
        </button>

        {/* Quick Action Button */}
        {!isCollapsed ? (
          <div className="px-1 pt-1">
            <button
              onClick={() => onOpenSessionModal?.()}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground h-9 px-3 text-xs font-medium hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            >
              <SparklesIcon className="w-3.5 h-3.5" />
              <span>{activeSession ? "Session Active" : "Delegate Session"}</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center pt-1">
            <Button
              size="icon"
              onClick={() => onOpenSessionModal?.()}
              className="w-9 h-9 rounded-lg shadow-2xs"
              title={activeSession ? "Session Active" : "Delegate Session"}
            >
              <SparklesIcon className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Categorized Navigation */}
        <div className="space-y-2 pt-1">
          {renderNavGroup("Market Intelligence", marketNavItems)}
          {renderNavGroup("Quantitative Swarm", swarmNavItems)}
          {renderNavGroup("Execution & Studio", executionNavItems)}
        </div>
      </div>

      {/* Footer Support Card & Web3 Status */}
      <div className="space-y-2.5 pt-3 border-t border-border/50 w-full">
        {!isCollapsed && (
          <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-md p-2.5 space-y-1 text-xs shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                <BoltIcon className="w-3 h-3 text-foreground/70" />
                Somnia L1
              </span>
              <Badge
                variant="outline"
                className="h-4 px-1.5 text-[9px] border-emerald-500/30 text-emerald-400 font-mono"
              >
                Shannon 50312
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Sub-100ms finality CLOB event trading with non-custodial session keys.
            </p>
          </div>
        )}

        {/* Wallet info or Connect row */}
        {wallet?.address ? (
          <div
            className={cn(
              "w-full flex items-center justify-between p-1.5 rounded-lg bg-card/40 border border-border/50 text-xs",
              isCollapsed && "justify-center p-1"
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              {!isCollapsed && (
                <div className="text-left truncate">
                  <div className="font-mono text-xs text-foreground truncate">
                    {formatAddress(wallet.address)}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground truncate">
                    {wallet.balanceCollateral || "0"} tUSDC
                  </div>
                </div>
              )}
            </div>
            {!isCollapsed && activeSession && (
              <span title="Session Key Active">
                <ShieldCheckIcon className="w-3 h-3 text-emerald-400 shrink-0" />
              </span>
            )}
          </div>
        ) : (
          !isCollapsed && (
            <Button
              size="sm"
              variant="outline"
              onClick={onConnectWallet}
              className="w-full gap-1.5 text-xs font-normal text-muted-foreground hover:text-foreground"
            >
              <CurrencyDollarIcon className="w-3.5 h-3.5" />
              <span>Connect Wallet</span>
            </Button>
          )
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
