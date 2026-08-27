import React, { useState, useEffect } from "react";
import {
  MagnifyingGlassIcon,
  Squares2X2Icon,
  ViewfinderCircleIcon,
  Square3Stack3DIcon,
  CpuChipIcon,
  AdjustmentsHorizontalIcon,
  CommandLineIcon,
  CheckCircleIcon,
  ChartPieIcon,
  CurrencyDollarIcon,
  ShieldCheckIcon,
  BoltIcon,
} from "@heroicons/react/24/outline";
import { Dialog, DialogContent } from "../ui/dialog";
import type { DashboardViewType } from "../landing/CinematicHero";
import type { Market } from "../../types/index";

interface CommandDialogProps {
  isOpen: boolean;
  onClose: () => void;
  markets?: Market[];
  onSelectMarket?: (marketId: string) => void;
  onNavigateView: (view: DashboardViewType) => void;
  onOpenSessionModal?: () => void;
  onClaimFaucet?: () => void;
}

export const CommandDialog: React.FC<CommandDialogProps> = ({
  isOpen,
  onClose,
  markets = [],
  onSelectMarket,
  onNavigateView,
  onOpenSessionModal,
  onClaimFaucet,
}) => {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
    }
  }, [isOpen]);

  const filteredMarkets = markets.filter((m) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (m.symbol && m.symbol.toLowerCase().includes(q)) ||
      m.strikePrice.toString().includes(q) ||
      m.id.toLowerCase().includes(q)
    );
  });

  const handleSelectMarket = (marketId: string) => {
    onSelectMarket?.(marketId);
    onNavigateView("Markets & Depth");
    onClose();
  };

  const handleNavigate = (view: DashboardViewType) => {
    onNavigateView(view);
    onClose();
  };

  const platformViews = [
    { id: "Overview" as DashboardViewType, label: "Terminal Overview", icon: Squares2X2Icon, desc: "Live CLOB & Macro Swarm" },
    { id: "Edge Radar" as DashboardViewType, label: "Edge Radar", icon: ViewfinderCircleIcon, desc: "Φ(z) Normal Distribution Heatmap" },
    { id: "Markets & Depth" as DashboardViewType, label: "Markets & Depth", icon: Square3Stack3DIcon, desc: "Order Book Depth Chart" },
    { id: "AI Swarm Feed" as DashboardViewType, label: "AI Swarm Feed", icon: CpuChipIcon, desc: "Multi-Agent Chain-of-Thought" },
    { id: "Swarm Cockpit" as DashboardViewType, label: "Swarm Cockpit", icon: AdjustmentsHorizontalIcon, desc: "Autonomous Execution Controls" },
  ];

  const executionViews = [
    { id: "Strategy Studio" as DashboardViewType, label: "Strategy Studio", icon: CommandLineIcon, desc: "Quant Backtester & Custom Alpha" },
    { id: "Settlement" as DashboardViewType, label: "Settlement Sweeper", icon: CheckCircleIcon, desc: "Batch Claim & Auto-Compound" },
    { id: "Analytics" as DashboardViewType, label: "Portfolio Analytics", icon: ChartPieIcon, desc: "Performance & Risk Ratios" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="p-0 max-w-xl overflow-hidden gap-0 border-border shadow-2xl"
      >
        {/* Search Input Bar */}
        <div className="flex items-center border-b border-border px-3 py-2.5">
          <MagnifyingGlassIcon className="w-4 h-4 text-muted-foreground mr-2 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search prediction markets, views, or actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none font-sans"
          />
          <button
            onClick={onClose}
            className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors cursor-pointer"
            title="Press ESC to close"
          >
            ESC
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto p-2 space-y-3">
          {/* Quick Actions */}
          {!query && (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                Quick Actions
              </div>
              <div className="grid grid-cols-2 gap-1 px-1">
                {onOpenSessionModal && (
                  <button
                    onClick={() => {
                      onOpenSessionModal();
                      onClose();
                    }}
                    className="flex items-center gap-2 p-2 rounded-lg border border-border/60 bg-card/40 hover:bg-card/90 transition-colors text-left text-xs cursor-pointer"
                  >
                    <ShieldCheckIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="truncate">
                      <div className="font-medium text-foreground">Session Key</div>
                      <div className="text-[10px] text-muted-foreground">Manage delegation</div>
                    </div>
                  </button>
                )}
                {onClaimFaucet && (
                  <button
                    onClick={() => {
                      onClaimFaucet();
                      onClose();
                    }}
                    className="flex items-center gap-2 p-2 rounded-lg border border-border/60 bg-card/40 hover:bg-card/90 transition-colors text-left text-xs cursor-pointer"
                  >
                    <CurrencyDollarIcon className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div className="truncate">
                      <div className="font-medium text-foreground">Claim Faucet</div>
                      <div className="text-[10px] text-muted-foreground">+1,000 tUSDC</div>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Markets Matching Section */}
          <div className="space-y-1">
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
              Prediction Markets ({filteredMarkets.length})
            </div>

            {filteredMarkets.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No matching markets found.
              </div>
            ) : (
              filteredMarkets.slice(0, 4).map((market) => (
                <div
                  key={market.id}
                  onClick={() => handleSelectMarket(market.id)}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/70 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <BoltIcon className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div className="truncate">
                      <div className="text-xs font-medium text-foreground truncate">
                        {market.symbol} &gt; ${market.strikePrice?.toLocaleString()}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {market.windowDuration} • Edge: {(market.edgePercentage * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono font-medium text-cyan-400 shrink-0 ml-2">
                    {market.fairValueYes ? `$${market.fairValueYes.toFixed(2)}` : (market.bestBidYes ? `$${market.bestBidYes.toFixed(2)}` : "Live")}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Navigation Views Section */}
          <div className="space-y-1">
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
              Platform Views
            </div>

            <div className="space-y-0.5">
              {[...platformViews, ...executionViews].map((view) => {
                const Icon = view.icon;
                return (
                  <button
                    key={view.id}
                    onClick={() => handleNavigate(view.id)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/70 transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                      <div>
                        <div className="text-xs font-medium text-foreground">{view.label}</div>
                        <div className="text-[10px] text-muted-foreground">{view.desc}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground group-hover:text-foreground">
                      &rarr;
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CommandDialog;
