import React, { useState, useEffect, useMemo, useRef } from "react";
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
  WalletIcon,
  ArrowLeftEndOnRectangleIcon,
  Bars3Icon,
  SparklesIcon,
  ArrowRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Dialog, DialogContent } from "../ui/dialog";
import type { DashboardViewType } from "../landing/CinematicHero";
import type { Market } from "../../types/index";

export interface CommandDialogProps {
  isOpen: boolean;
  onClose: () => void;
  markets?: Market[];
  onSelectMarket?: (marketId: string) => void;
  onNavigateView: (view: DashboardViewType) => void;
  onOpenSessionModal?: (options?: { revoke?: boolean }) => void;
  onClaimFaucet?: () => void;
  wallet?: {
    address: string | null;
    balanceSTT?: string;
    balanceCollateral?: string;
  };
  activeSession?: any | null;
  onConnectWallet?: () => void;
  onDisconnectWallet?: () => void;
  onToggleSidebar?: () => void;
  onToggleDebug?: () => void;
}

interface CommandItem {
  id: string;
  type: "action" | "view" | "market";
  title: string;
  subtitle: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords: string;
  extra?: string;
  onSelect: () => void;
}

export const CommandDialog: React.FC<CommandDialogProps> = ({
  isOpen,
  onClose,
  markets = [],
  onSelectMarket,
  onNavigateView,
  onOpenSessionModal,
  onClaimFaucet,
  wallet,
  activeSession,
  onConnectWallet,
  onDisconnectWallet,
  onToggleSidebar,
  onToggleDebug,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelectMarket = (marketId: string) => {
    onSelectMarket?.(marketId);
    onNavigateView("Trade Terminal");
    onClose();
  };

  const handleNavigate = (view: DashboardViewType) => {
    onNavigateView(view);
    onClose();
  };

  // 1. Definition of all platform views
  const viewItems = useMemo<CommandItem[]>(() => {
    const viewsList: {
      id: DashboardViewType;
      label: string;
      desc: string;
      icon: React.ComponentType<{ className?: string }>;
      keywords: string;
    }[] = [
      {
        id: "Overview",
        label: "Terminal Overview",
        desc: "Live CLOB & Macro Swarm Telemetry",
        icon: Squares2X2Icon,
        keywords: "overview terminal live clob macro swarm telemetry dashboard home",
      },
      {
        id: "Trade Terminal",
        label: "Trade Terminal",
        desc: "CLOB Depth Ladder & Trader Cockpit",
        icon: AdjustmentsHorizontalIcon,
        keywords: "trade terminal cockpit orderbook ladder depth buy sell limit market positions order ticket",
      },
      {
        id: "Edge Radar",
        label: "Edge Radar",
        desc: "Black-Scholes Φ(z) Mispricings Heatmap",
        icon: ViewfinderCircleIcon,
        keywords: "edge radar black scholes mispricing normal distribution heatmap alpha quant model",
      },
      {
        id: "Markets",
        label: "Markets Explorer",
        desc: "Browse 32+ Event Prediction Contracts",
        icon: Square3Stack3DIcon,
        keywords: "markets explorer browse contracts events prediction list depth",
      },
      {
        id: "AI Swarm Feed",
        label: "Live Swarm Feed",
        desc: "Real-time Multi-Agent Reasoning & CoT",
        icon: CpuChipIcon,
        keywords: "swarm feed live ai agents multi-agent cot chain of thought reasoning stream log",
      },
      {
        id: "Swarm Cockpit",
        label: "Swarm Cockpit",
        desc: "Risk Guardrails & Autonomous Swarm Controls",
        icon: AdjustmentsHorizontalIcon,
        keywords: "swarm cockpit risk guardrails autonomous execution controls parameters kill switch stop loss",
      },
      {
        id: "Strategy Studio",
        label: "Strategy Studio",
        desc: "Quant Backtester & Custom Alpha Formulas",
        icon: CommandLineIcon,
        keywords: "strategy studio quant backtester formulas custom alpha code python backtest model",
      },
      {
        id: "Settlement",
        label: "Settlement Sweeper",
        desc: "Batch Outcome Claims & Compounder",
        icon: CheckCircleIcon,
        keywords: "settlement sweeper batch outcome claims compounder sweep payout redeem winner",
      },
      {
        id: "Analytics",
        label: "Portfolio Analytics",
        desc: "Sharpe, Sortino & PnL Performance Replay",
        icon: ChartPieIcon,
        keywords: "analytics portfolio performance sharpe sortino pnl profit risk metrics equity drawdown",
      },
      {
        id: "Landing",
        label: "Cinematic Hero Landing",
        desc: "Protocol Overview & Visual Showcase",
        icon: SparklesIcon,
        keywords: "landing hero home intro cinematic showcase start",
      },
    ];

    return viewsList.map((v) => ({
      id: `view-${v.id}`,
      type: "view" as const,
      title: v.label,
      subtitle: v.desc,
      icon: v.icon,
      keywords: v.keywords,
      onSelect: () => handleNavigate(v.id),
    }));
  }, [onNavigateView, onClose]);

  // 2. Definition of all quick actions
  const actionItems = useMemo<CommandItem[]>(() => {
    const actions: CommandItem[] = [];

    // Faucet Action
    if (onClaimFaucet) {
      actions.push({
        id: "action-claim-faucet",
        type: "action",
        title: "Claim Testnet Faucet",
        subtitle: "Mint +1,000 tUSDC testnet collateral",
        badge: "+1,000 tUSDC",
        icon: CurrencyDollarIcon,
        keywords: "faucet claim usdc tusdc tokens funds collateral testnet free mint money deposit balance",
        onSelect: () => {
          onClaimFaucet();
          onClose();
        },
      });
    }

    // Session Key Delegation Action
    if (onOpenSessionModal) {
      actions.push({
        id: "action-session-delegate",
        type: "action",
        title: activeSession ? "Manage Session Delegation" : "Delegate Session Key",
        subtitle: activeSession
          ? "Inspect active key or renew trading delegation"
          : "Authorize 1-click autonomous execution without wallet popups",
        badge: activeSession ? "Active" : "Recommended",
        icon: ShieldCheckIcon,
        keywords: "session delegate key delegation create session agent permission sign authorize zero popup non-custodial",
        onSelect: () => {
          onOpenSessionModal({ revoke: false });
          onClose();
        },
      });

      if (activeSession) {
        actions.push({
          id: "action-session-revoke",
          type: "action",
          title: "Revoke Session Key",
          subtitle: "Immediately terminate session delegation and revoke signing rights",
          badge: "Security",
          icon: ShieldCheckIcon,
          keywords: "revoke cancel terminate kill session disconnect delegation revoke key stop auth",
          onSelect: () => {
            onOpenSessionModal({ revoke: true });
            onClose();
          },
        });
      }
    }

    // Web3 Wallet Actions
    if (wallet?.address) {
      if (onDisconnectWallet) {
        actions.push({
          id: "action-disconnect-wallet",
          type: "action",
          title: "Disconnect Web3 Wallet",
          subtitle: `Connected: ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`,
          badge: "Connected",
          icon: ArrowLeftEndOnRectangleIcon,
          keywords: "disconnect wallet logout sign out account web3 metamask somnia",
          onSelect: () => {
            onDisconnectWallet();
            onClose();
          },
        });
      }
    } else if (onConnectWallet) {
      actions.push({
        id: "action-connect-wallet",
        type: "action",
        title: "Connect Web3 Wallet",
        subtitle: "Connect MetaMask or Somnia Shannon Testnet Provider",
        badge: "Web3",
        icon: WalletIcon,
        keywords: "connect wallet metamask somnia web3 login authenticate account",
        onSelect: () => {
          onConnectWallet();
          onClose();
        },
      });
    }

    // Toggle Sidebar Action
    if (onToggleSidebar) {
      actions.push({
        id: "action-toggle-sidebar",
        type: "action",
        title: "Toggle Navigation Sidebar",
        subtitle: "Expand or collapse the primary dashboard sidebar (⌘B / Ctrl+B)",
        badge: "⌘B",
        icon: Bars3Icon,
        keywords: "sidebar toggle collapse expand menu drawer navigation shortcut",
        onSelect: () => {
          onToggleSidebar();
          onClose();
        },
      });
    }

    // Debug Swarm Telemetry Action
    if (onToggleDebug) {
      actions.push({
        id: "action-toggle-debug",
        type: "action",
        title: "Toggle Swarm Chain-of-Thought Telemetry",
        subtitle: "Inspect raw multi-agent internal reasoning streams & signals",
        badge: "Telemetry",
        icon: CommandLineIcon,
        keywords: "debug telemetry thoughts swarm cot developer logs raw signals inspector",
        onSelect: () => {
          onToggleDebug();
          onClose();
        },
      });
    }

    return actions;
  }, [
    onClaimFaucet,
    onOpenSessionModal,
    activeSession,
    wallet?.address,
    onDisconnectWallet,
    onConnectWallet,
    onToggleSidebar,
    onToggleDebug,
    onClose,
  ]);

  // 3. Definition of market items
  const marketItems = useMemo<CommandItem[]>(() => {
    return markets.map((m) => {
      const priceFormatted = m.fairValueYes
        ? `$${m.fairValueYes.toFixed(2)}`
        : m.bestBidYes
        ? `$${m.bestBidYes.toFixed(2)}`
        : "Live";
      const edgeFormatted = m.edgePercentage
        ? `${(m.edgePercentage * 100).toFixed(1)}%`
        : null;

      return {
        id: `market-${m.id}`,
        type: "market" as const,
        title: `${m.symbol} > $${m.strikePrice?.toLocaleString()}`,
        subtitle: `${m.windowDuration || "5m"}${edgeFormatted ? ` • Edge: ${edgeFormatted}` : ""}${m.status ? ` • ${m.status}` : ""}`,
        icon: BoltIcon,
        keywords: `market prediction ${m.symbol} ${m.strikePrice} ${m.id} ${m.windowDuration || ""} ${m.status || ""}`,
        extra: priceFormatted,
        onSelect: () => handleSelectMarket(m.id),
      };
    });
  }, [markets, onSelectMarket, onNavigateView, onClose]);

  // Filter items matching query
  const searchFilter = (item: CommandItem, q: string) => {
    if (!q) return true;
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const target = `${item.title} ${item.subtitle} ${item.keywords} ${item.badge || ""}`.toLowerCase();
    return tokens.every((token) => target.includes(token));
  };

  const filteredActions = useMemo(() => {
    const q = query.trim();
    if (!q) return actionItems;
    return actionItems.filter((item) => searchFilter(item, q));
  }, [actionItems, query]);

  const filteredViews = useMemo(() => {
    const q = query.trim();
    if (!q) return viewItems;
    return viewItems.filter((item) => searchFilter(item, q));
  }, [viewItems, query]);

  const filteredMarkets = useMemo(() => {
    const q = query.trim();
    if (!q) return marketItems.slice(0, 5); // When empty, show top 5 active markets
    return marketItems.filter((item) => searchFilter(item, q));
  }, [marketItems, query]);

  // Ordered list of all currently visible items for keyboard navigation
  const allVisibleItems = useMemo<CommandItem[]>(() => {
    return [...filteredActions, ...filteredViews, ...filteredMarkets];
  }, [filteredActions, filteredViews, filteredMarkets]);

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (allVisibleItems.length === 0) return;
      setSelectedIndex((prev) => (prev + 1) % allVisibleItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (allVisibleItems.length === 0) return;
      setSelectedIndex((prev) => (prev - 1 + allVisibleItems.length) % allVisibleItems.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (allVisibleItems[selectedIndex]) {
        allVisibleItems[selectedIndex].onSelect();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Scroll active item into view when navigating via keyboard
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [selectedIndex]);

  // Track global item index across rendered sections
  let globalIndexCounter = 0;

  const totalResultsCount = filteredActions.length + filteredViews.length + filteredMarkets.length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="p-0 max-w-xl overflow-hidden gap-0 border-border/80 bg-background/95 backdrop-blur-2xl shadow-2xl rounded-2xl border"
      >
        {/* Search Input Bar */}
        <div className="flex items-center border-b border-border/60 px-3.5 py-3 bg-muted/20">
          <MagnifyingGlassIcon className="w-4 h-4 text-cyan-400 mr-2.5 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search prediction markets, views, or actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none font-sans"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="mr-2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded cursor-pointer"
              title="Clear search"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border/60 bg-muted/80 px-1.5 font-mono text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            title="Press ESC to close"
          >
            ESC
          </button>
        </div>

        {/* Results Container */}
        <div className="max-h-[420px] overflow-y-auto p-2.5 space-y-3.5 focus:outline-none select-none">
          {totalResultsCount === 0 ? (
            <div className="py-10 px-4 text-center space-y-2.5">
              <div className="w-10 h-10 rounded-full bg-muted/50 border border-border/60 flex items-center justify-center mx-auto text-muted-foreground">
                <MagnifyingGlassIcon className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="text-xs font-semibold text-foreground">
                No results found for &ldquo;{query}&rdquo;
              </div>
              <p className="text-[11px] text-muted-foreground max-w-xs mx-auto leading-relaxed">
                Try searching for a prediction market (e.g., BTC, ETH), a view (e.g., Trade Terminal, Swarm Feed), or an action (e.g., Faucet, Session Key).
              </p>
              <div className="pt-2 flex flex-wrap justify-center gap-1.5">
                {["Trade Terminal", "Claim Faucet", "Live Swarm Feed", "Edge Radar"].map((shortcut) => (
                  <button
                    key={shortcut}
                    onClick={() => setQuery(shortcut)}
                    className="text-[10px] font-mono px-2 py-1 rounded-md border border-border/60 bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    {shortcut}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* 1. Quick Actions Section */}
              {filteredActions.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                    <span>Actions</span>
                    <span>{filteredActions.length}</span>
                  </div>
                  <div className="space-y-1">
                    {filteredActions.map((action) => {
                      const itemIndex = globalIndexCounter++;
                      const isSelected = selectedIndex === itemIndex;
                      const Icon = action.icon;
                      return (
                        <button
                          key={action.id}
                          ref={(el) => {
                            itemRefs.current[itemIndex] = el;
                          }}
                          onClick={action.onSelect}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                          className={`w-full flex items-center justify-between p-2 rounded-xl transition-all text-left cursor-pointer border ${
                            isSelected
                              ? "bg-secondary/90 border-border text-foreground shadow-xs"
                              : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <div
                              className={`p-1.5 rounded-lg shrink-0 ${
                                isSelected
                                  ? "bg-primary/20 text-primary"
                                  : "bg-muted/60 text-muted-foreground"
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-foreground truncate">
                                {action.title}
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {action.subtitle}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {action.badge && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/80 border border-border/50 text-muted-foreground font-medium">
                                {action.badge}
                              </span>
                            )}
                            <ArrowRightIcon
                              className={`w-3.5 h-3.5 transition-transform ${
                                isSelected ? "text-foreground translate-x-0.5" : "text-muted-foreground/40"
                              }`}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. Platform Views Section */}
              {filteredViews.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                    <span>Platform Views</span>
                    <span>{filteredViews.length}</span>
                  </div>
                  <div className="space-y-0.5">
                    {filteredViews.map((view) => {
                      const itemIndex = globalIndexCounter++;
                      const isSelected = selectedIndex === itemIndex;
                      const Icon = view.icon;
                      return (
                        <button
                          key={view.id}
                          ref={(el) => {
                            itemRefs.current[itemIndex] = el;
                          }}
                          onClick={view.onSelect}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                          className={`w-full flex items-center justify-between p-2 rounded-xl transition-all text-left cursor-pointer border ${
                            isSelected
                              ? "bg-secondary/90 border-border text-foreground shadow-xs"
                              : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <div
                              className={`p-1.5 rounded-lg shrink-0 ${
                                isSelected
                                  ? "bg-cyan-500/15 text-cyan-400"
                                  : "bg-muted/60 text-muted-foreground"
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-foreground truncate">
                                {view.title}
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {view.subtitle}
                              </div>
                            </div>
                          </div>
                          <ArrowRightIcon
                            className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                              isSelected ? "text-foreground translate-x-0.5" : "text-muted-foreground/40"
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Prediction Markets Section */}
              {filteredMarkets.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                    <span>Prediction Markets</span>
                    <span>{filteredMarkets.length}</span>
                  </div>
                  <div className="space-y-1">
                    {filteredMarkets.map((market) => {
                      const itemIndex = globalIndexCounter++;
                      const isSelected = selectedIndex === itemIndex;
                      const Icon = market.icon;
                      return (
                        <button
                          key={market.id}
                          ref={(el) => {
                            itemRefs.current[itemIndex] = el;
                          }}
                          onClick={market.onSelect}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                          className={`w-full flex items-center justify-between p-2 rounded-xl transition-all text-left cursor-pointer border ${
                            isSelected
                              ? "bg-secondary/90 border-border text-foreground shadow-xs"
                              : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <div
                              className={`p-1.5 rounded-lg shrink-0 ${
                                isSelected
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : "bg-muted/60 text-muted-foreground"
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-foreground truncate font-mono">
                                {market.title}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono truncate">
                                {market.subtitle}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {market.extra && (
                              <span className="text-[11px] font-mono font-medium text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
                                {market.extra}
                              </span>
                            )}
                            <ArrowRightIcon
                              className={`w-3.5 h-3.5 transition-transform ${
                                isSelected ? "text-foreground translate-x-0.5" : "text-muted-foreground/40"
                              }`}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Palette Footer Shortcuts Bar */}
        <div className="flex items-center justify-between border-t border-border/50 px-3.5 py-2 bg-muted/30 text-[10px] font-mono text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border/60 bg-muted px-1 py-0.2">↑</kbd>
              <kbd className="rounded border border-border/60 bg-muted px-1 py-0.2">↓</kbd>
              <span>navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border/60 bg-muted px-1.5 py-0.2">↵</kbd>
              <span>select</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border/60 bg-muted px-1 py-0.2">esc</kbd>
              <span>close</span>
            </span>
          </div>
          <span className="text-[9px] text-muted-foreground/70 hidden sm:inline">
            DreamPulse CLOB Terminal
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CommandDialog;

