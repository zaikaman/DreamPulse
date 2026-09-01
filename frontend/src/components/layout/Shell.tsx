import React, { useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { Silk } from "../ui/Silk";
import { cn } from "../../lib/utils";
import type { DashboardViewType } from "../landing/CinematicHero";
import type { Market } from "../../types/index";

interface ShellProps {
  currentView: DashboardViewType;
  onSelectView: (view: DashboardViewType) => void;
  markets?: Market[];
  selectedMarketId?: string | null;
  onSelectMarket?: (marketId: string) => void;
  isSidebarCollapsed?: boolean;
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
  onOpenTour?: () => void;
  onConnectWallet?: () => void;
  onDisconnectWallet?: () => void;
  onSwitchNetwork?: () => void;
  children: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({
  currentView,
  onSelectView,
  markets = [],
  selectedMarketId,
  onSelectMarket,
  isSidebarCollapsed = false,
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
  onOpenTour,
  onConnectWallet,
  onDisconnectWallet,
  onSwitchNetwork,
  children,
}) => {
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Lock body scroll and handle Escape key when mobile drawer is open
  React.useEffect(() => {
    if (isMobileDrawerOpen) {
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setIsMobileDrawerOpen(false);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [isMobileDrawerOpen]);

  const handleToggleSidebar = () => {
    if (window.innerWidth < 768) {
      setIsMobileDrawerOpen((prev) => !prev);
    } else {
      onToggleSidebar?.();
    }
  };

  const handleSelectView = (view: DashboardViewType) => {
    setIsMobileDrawerOpen(false);
    onSelectView(view);
  };

  return (
    <div className="relative flex h-screen w-full flex-col bg-background text-foreground antialiased overflow-hidden">
      {/* Ambient Silk Shader Dynamic Canvas Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
        <div className="absolute -top-[10%] -left-[10%] w-[120vw] h-[120vh] opacity-60 dark:opacity-50 transition-opacity duration-700">
          <Silk
            speed={10}
            scale={0.9}
            color="#59677b"
            noiseIntensity={1}
            rotation={0}
          />
        </div>
        {/* Subtle gradient vignette to preserve high contrast and readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/40 to-background/70" />
      </div>

      {/* Mobile Backdrop Overlay - Positioned globally above header (z-40) */}
      {isMobileDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden transition-opacity duration-200"
          onClick={() => setIsMobileDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Top Header */}
      <Header
        activeView={currentView}
        onSelectView={handleSelectView}
        onToggleSidebar={handleToggleSidebar}
        onOpenCommandPalette={onOpenCommandPalette}
        spotPrices={spotPrices}
        isConnected={isConnected}
        latencyMs={latencyMs}
        wallet={wallet}
        activeSession={activeSession}
        isFauceting={isFauceting}
        onClaimFaucet={onClaimFaucet}
        onOpenSessionModal={onOpenSessionModal}
        onConnectWallet={onConnectWallet}
        onDisconnectWallet={onDisconnectWallet}
        onSwitchNetwork={onSwitchNetwork}
      />

      {/* Main Workspace Layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar
          currentView={currentView}
          onSelectView={handleSelectView}
          markets={markets}
          selectedMarketId={selectedMarketId}
          onSelectMarket={onSelectMarket}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={onToggleSidebar}
          onOpenSessionModal={onOpenSessionModal}
          onOpenTour={onOpenTour}
          wallet={wallet}
          activeSession={activeSession}
          onConnectWallet={onConnectWallet}
          isMobileOpen={isMobileDrawerOpen}
          onCloseMobile={() => setIsMobileDrawerOpen(false)}
        />

        <main
          className={cn(
            "flex-1 min-w-0 transition-all duration-200",
            currentView === 'Trade Terminal'
              ? "overflow-y-auto lg:overflow-hidden p-1.5 sm:p-2 md:p-2.5"
              : "overflow-y-auto p-2.5 sm:p-4 md:p-6"
          )}
        >
          <div
            className={
              currentView === 'Trade Terminal'
                ? "w-full h-full flex flex-col min-h-0"
                : "mx-auto max-w-7xl min-h-0 flex flex-col"
            }
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Shell;
