import React from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { Silk } from "../ui/Silk";
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
  onConnectWallet,
  onDisconnectWallet,
  onSwitchNetwork,
  children,
}) => {
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

      {/* Top Header */}
      <Header
        activeView={currentView}
        onSelectView={onSelectView}
        onToggleSidebar={onToggleSidebar}
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
      <div className="relative z-10 flex flex-1 overflow-hidden">
        <Sidebar
          currentView={currentView}
          onSelectView={onSelectView}
          markets={markets}
          selectedMarketId={selectedMarketId}
          onSelectMarket={onSelectMarket}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={onToggleSidebar}
          onOpenSessionModal={onOpenSessionModal}
          wallet={wallet}
          activeSession={activeSession}
          onConnectWallet={onConnectWallet}
        />

        <main className={currentView === 'Trade Terminal' ? "flex-1 overflow-hidden p-1.5 sm:p-2 md:p-2.5" : "flex-1 overflow-y-auto p-3 sm:p-4 md:p-6"}>
          <div className={currentView === 'Trade Terminal' ? "w-full h-full flex flex-col min-h-0" : "mx-auto max-w-7xl h-full flex flex-col"}>{children}</div>
        </main>
      </div>
    </div>
  );
};

export default Shell;
