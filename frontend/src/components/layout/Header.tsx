import React from "react";
import {
  Bars3Icon,
  MagnifyingGlassIcon,
  BoltIcon,
  ChartBarIcon,
  WalletIcon,
  CurrencyDollarIcon,
  ShieldCheckIcon,
  ChevronDownIcon,
  ArrowTopRightOnSquareIcon,
  ArrowLeftEndOnRectangleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { formatAddress, formatCurrency } from "../../lib/utils";
import type { DashboardViewType } from "../landing/CinematicHero";

interface HeaderProps {
  activeView: DashboardViewType;
  onSelectView: (view: DashboardViewType) => void;
  onToggleSidebar?: () => void;
  onOpenCommandPalette?: () => void;
  spotPrices?: Record<string, number>;
  isConnected?: boolean;
  latencyMs?: number;
  wallet: {
    address: string | null;
    chainId: number | null;
    isCorrectNetwork: boolean;
    balanceSTT?: string;
    balanceCollateral?: string;
  };
  activeSession: any | null;
  isFauceting?: boolean;
  onClaimFaucet?: () => void;
  onOpenSessionModal?: () => void;
  onConnectWallet?: () => void;
  onDisconnectWallet?: () => void;
  onSwitchNetwork?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeView: _activeView,
  onSelectView: _onSelectView,
  onToggleSidebar,
  onOpenCommandPalette,
  spotPrices = {},
  isConnected = false,
  latencyMs = 0,
  wallet,
  activeSession,
  isFauceting = false,
  onClaimFaucet,
  onOpenSessionModal,
  onConnectWallet,
  onDisconnectWallet,
  onSwitchNetwork,
}) => {
  const btcPrice = spotPrices["BTC/USD"] || spotPrices["BTC"] || 0;
  const ethPrice = spotPrices["ETH/USD"] || spotPrices["ETH"] || 0;
  const somniaPrice = spotPrices["SOMI/USD"] || spotPrices["STT/USD"] || spotPrices["SOMNIA"] || 1.25;

  return (
    <header className="sticky top-0 z-20 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="flex h-12 items-center justify-between px-3 sm:px-4 lg:px-6">
        {/* Left: Sidebar toggle, separator & command palette trigger */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleSidebar}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
            title="Toggle sidebar (⌘B / Ctrl+B)"
          >
            <Bars3Icon className="w-4 h-4" />
          </Button>
          <Separator orientation="vertical" className="h-4 mx-1 border-border/50" />
          <button
            onClick={onOpenCommandPalette}
            className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 backdrop-blur-sm px-2.5 sm:px-3 py-1 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors w-28 sm:w-48 md:w-60 cursor-pointer"
            title="Quick search markets, navigation, commands (⌘K / Ctrl+K)"
          >
            <MagnifyingGlassIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 text-left truncate">
              <span className="sm:hidden">Search...</span>
              <span className="hidden sm:inline">Search markets, actions...</span>
            </span>
            <kbd className="pointer-events-none hidden sm:inline-flex h-4 items-center gap-0.5 rounded border border-border/60 bg-muted/60 px-1.5 font-mono text-[9px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Center: Live Spot Tickers & Telemetry */}
        <div className="hidden md:flex items-center gap-4 text-xs font-mono text-muted-foreground">
          {/* BTC Spot */}
          {btcPrice > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">BTC:</span>
              <span className="text-foreground font-medium">{formatCurrency(btcPrice)}</span>
            </div>
          )}

          {/* ETH Spot */}
          {ethPrice > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">ETH:</span>
              <span className="text-foreground font-medium">{formatCurrency(ethPrice)}</span>
            </div>
          )}

          {/* SOMNIA Spot */}
          {somniaPrice > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">SOMI:</span>
              <span className="text-foreground font-medium">{formatCurrency(somniaPrice, 2)}</span>
            </div>
          )}

          {/* Telemetry latency indicator */}
          <div className="flex items-center gap-1.5 border-l border-border/40 pl-3">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? "bg-[#00e676] animate-pulse" : "bg-[#ff3366]"
              }`}
            />
            <span className="text-[11px]">
              {isConnected ? `${latencyMs}ms` : "Connecting"}
            </span>
          </div>
        </div>

        {/* Right: Network Status, Session Status & Wallet Account Dropdown */}
        <div className="flex items-center gap-2">
          {/* Somnia Shannon Testnet Badge */}
          <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground font-mono">
            <BoltIcon className="w-3 h-3 text-[#00ffcc]" />
            <span>Somnia 50312</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#00e676]"></span>
          </div>

          {/* Session Key Status Pill */}
          {wallet.address && (
            activeSession ? (
              <button
                onClick={onOpenSessionModal}
                className="hidden sm:flex items-center gap-1.5 rounded-lg border border-[#00e676]/30 bg-[#00e676]/10 px-2.5 py-1 text-[11px] text-[#00e676] font-mono hover:bg-[#00e676]/20 transition-colors cursor-pointer"
                title="Session Key active and delegated"
              >
                <ShieldCheckIcon className="w-3 h-3 text-[#00e676]" />
                <span>Session Active</span>
              </button>
            ) : (
              <button
                onClick={onOpenSessionModal}
                className="hidden sm:flex items-center gap-1.5 rounded-lg border border-[#ffb700]/30 bg-[#ffb700]/10 px-2.5 py-1 text-[11px] text-[#ffb700] font-mono hover:bg-[#ffb700]/20 transition-colors cursor-pointer"
                title="Delegate session key for zero-popup trading"
              >
                <SparklesIcon className="w-3 h-3 text-[#ffb700]" />
                <span>Delegate Session</span>
              </button>
            )
          )}

          {/* Web3 Wallet Account Dropdown */}
          {wallet.address ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/60 backdrop-blur-md px-2.5 py-1 text-xs text-foreground hover:bg-card transition-colors cursor-pointer shadow-xs">
                  <div className="w-2 h-2 rounded-full bg-[#00e676]" />
                  <span className="font-mono text-xs">{formatAddress(wallet.address)}</span>
                  <ChevronDownIcon className="w-3 h-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="font-semibold text-xs text-foreground">Web3 Account</span>
                  <span className="text-[10px] font-mono text-muted-foreground truncate">
                    {wallet.address}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {/* Balances */}
                <div className="px-2 py-1.5 space-y-1 font-mono text-xs">
                  <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                    <span>STT Balance:</span>
                    <span className="text-foreground font-medium">{wallet.balanceSTT || "0"} STT</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                    <span>tUSDC Collateral:</span>
                    <span className="text-foreground font-medium">{wallet.balanceCollateral || "0"} tUSDC</span>
                  </div>
                </div>
                <DropdownMenuSeparator />

                {/* Claim Faucet */}
                <DropdownMenuItem
                  onClick={onClaimFaucet}
                  disabled={isFauceting}
                  className="gap-2 cursor-pointer"
                >
                  <CurrencyDollarIcon className="w-3.5 h-3.5 text-[#00ffcc]" />
                  <span>{isFauceting ? "Claiming Faucet..." : "Claim 1,000 tUSDC Faucet"}</span>
                </DropdownMenuItem>

                {/* Session Delegation */}
                <DropdownMenuItem onClick={onOpenSessionModal} className="gap-2 cursor-pointer">
                  <ShieldCheckIcon className="w-3.5 h-3.5 text-[#00e676]" />
                  <span>{activeSession ? "Manage Session Key" : "Create Session Key"}</span>
                </DropdownMenuItem>

                {/* Switch Network if incorrect */}
                {!wallet.isCorrectNetwork && (
                  <DropdownMenuItem onClick={onSwitchNetwork} className="gap-2 text-[#ffb700] cursor-pointer">
                    <ChartBarIcon className="w-3.5 h-3.5" />
                    <span>Switch to Somnia Testnet</span>
                  </DropdownMenuItem>
                )}

                {/* Explorer Link */}
                <DropdownMenuItem
                  onClick={() => {
                    window.open(
                      `https://shannon-explorer.somnia.network/address/${wallet.address}`,
                      "_blank"
                    );
                  }}
                  className="gap-2 cursor-pointer text-xs"
                >
                  <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                  <span>View in Shannon Explorer</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                {/* Disconnect */}
                <DropdownMenuItem
                  onClick={onDisconnectWallet}
                  className="gap-2 text-destructive focus:text-destructive cursor-pointer"
                >
                  <ArrowLeftEndOnRectangleIcon className="w-3.5 h-3.5" />
                  <span>Disconnect Wallet</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              onClick={onConnectWallet}
              className="gap-1.5 shadow-sm"
            >
              <WalletIcon className="w-3.5 h-3.5" />
              <span>Connect Wallet</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
