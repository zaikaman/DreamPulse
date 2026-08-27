import React, { useState, useEffect } from "react";
import {
  CpuChipIcon,
  ClockIcon,
  BoltIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ShieldCheckIcon,
  KeyIcon,
  LockClosedIcon,
  CurrencyDollarIcon,
  PlayIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RocketLaunchIcon,
  WalletIcon,
  Bars3Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { BrandLogo } from "../common/BrandLogo";

export type DashboardViewType =
  | "Landing"
  | "Overview"
  | "Edge Radar"
  | "Markets & Depth"
  | "AI Swarm Feed"
  | "Swarm Cockpit"
  | "Strategy Studio"
  | "Analytics"
  | "Settlement";

interface CinematicHeroProps {
  onEnterConsole: (view?: DashboardViewType) => void;
  walletAddress?: string | null;
  onConnectWallet?: () => void;
}

interface HeroSlide {
  badge1: { icon: React.ElementType; label: string };
  badge2: { icon: React.ElementType; label: string };
  badge3: { icon: React.ElementType; label: string };
  title: string;
  description: string;
  primaryCtaText: string;
  secondaryCtaText: string;
  targetView: DashboardViewType;
  secondaryTargetView: DashboardViewType;
}

const HERO_SLIDES: HeroSlide[] = [
  {
    badge1: { icon: CpuChipIcon, label: "99.9% Black-Scholes Precision" },
    badge2: { icon: ClockIcon, label: "Sub-100ms Swarm Loop" },
    badge3: { icon: BoltIcon, label: "Somnia Shannon Testnet L1" },
    title: "Autonomous Swarm. Engineered For Somnia.",
    description:
      "Multi-agent quantitative intelligence, real-time Φ(z) normal distribution edge radar, and non-custodial session key trading engineered for DreamDEX Event Contracts.",
    primaryCtaText: "Launch Cyber-Terminal",
    secondaryCtaText: "Explore Edge Radar",
    targetView: "Overview",
    secondaryTargetView: "Edge Radar",
  },
  {
    badge1: { icon: ChartBarIcon, label: "Microsecond CLOB Streaming" },
    badge2: { icon: ArrowTrendingUpIcon, label: "Live Order Book Depth" },
    badge3: { icon: ShieldCheckIcon, label: "0.05% Spread Arbitrage" },
    title: "Real-Time Φ(z) Edge Radar. Unassailable Alpha.",
    description:
      "Continuous Black-Scholes pricing models scan binary event outcome distributions in real-time to detect mispricings, spread anomalies, and order book volatility.",
    primaryCtaText: "Inspect Live Markets",
    secondaryCtaText: "View Swarm Feed",
    targetView: "Markets & Depth",
    secondaryTargetView: "AI Swarm Feed",
  },
  {
    badge1: { icon: KeyIcon, label: "EIP-712 Scoped Delegation" },
    badge2: { icon: LockClosedIcon, label: "Non-Custodial Vault Safety" },
    badge3: { icon: CurrencyDollarIcon, label: "Automated Settlement Sweeper" },
    title: "Non-Custodial Session Keys. Zero Gas Drag.",
    description:
      "Grant cryptographically scoped trading permissions to local AI agents without sharing private keys, featuring automated batch settlement sweeps and collateral compounding.",
    primaryCtaText: "Open Swarm Cockpit",
    secondaryCtaText: "Launch Strategy Studio",
    targetView: "Swarm Cockpit",
    secondaryTargetView: "Strategy Studio",
  },
];

export const CinematicHero: React.FC<CinematicHeroProps> = ({
  onEnterConsole,
  walletAddress,
  onConnectWallet,
}) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const slide = HERO_SLIDES[currentSlideIndex];

  const handlePrevSlide = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentSlideIndex((prev) =>
        prev === 0 ? HERO_SLIDES.length - 1 : prev - 1
      );
      setIsTransitioning(false);
    }, 150);
  };

  const handleNextSlide = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentSlideIndex((prev) =>
        prev === HERO_SLIDES.length - 1 ? 0 : prev + 1
      );
      setIsTransitioning(false);
    }, 150);
  };

  // Keyboard navigation for carousel slides
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        handlePrevSlide();
      } else if (e.key === "ArrowRight") {
        handleNextSlide();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navLinks: { label: string; view: DashboardViewType; delay: string }[] = [
    { label: "Terminal", view: "Overview", delay: "100ms" },
    { label: "Edge Radar", view: "Edge Radar", delay: "150ms" },
    { label: "Markets & Depth", view: "Markets & Depth", delay: "200ms" },
    { label: "AI Swarm Feed", view: "AI Swarm Feed", delay: "250ms" },
    { label: "Swarm Cockpit", view: "Swarm Cockpit", delay: "300ms" },
    { label: "Strategy Studio", view: "Strategy Studio", delay: "350ms" },
  ];

  const Badge1Icon = slide.badge1.icon;
  const Badge2Icon = slide.badge2.icon;
  const Badge3Icon = slide.badge3.icon;

  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;

  return (
    <div className="h-screen h-[100dvh] w-screen overflow-hidden relative bg-black text-white font-sans select-none flex flex-col justify-between">
      {/* 1. Full-Screen Ambient Trading Background Video (z-index 0) */}
      <div className="fixed inset-0 w-full h-full z-0 overflow-hidden pointer-events-none">
        <video
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        />
      </div>

      {/* 2. Bottom Optical Blur Overlay (pure backdrop-blur-xl bottom-blur-mask) */}
      <div className="fixed inset-0 w-full h-full z-[1] pointer-events-none backdrop-blur-xl bottom-blur-mask" />

      {/* 3. Top Navbar (z-index 50) */}
      <header className="relative z-50 px-4 sm:px-6 md:px-12 py-4 md:py-6 flex items-center justify-between">
        {/* Left: Brand Showcase Logo */}
        <div
          className="animate-blur-fade-up cursor-pointer"
          style={{ animationDelay: "0ms" }}
          onClick={() => onEnterConsole("Overview")}
        >
          <BrandLogo size="lg" glow interactive />
        </div>

        {/* Center: Showcase Navigation Links */}
        <nav className="hidden lg:flex items-center gap-7">
          {navLinks.map((link) => (
            <button
              key={link.view}
              onClick={() => onEnterConsole(link.view)}
              className="animate-blur-fade-up text-sm text-gray-300 hover:text-white transition-colors cursor-pointer"
              style={{ animationDelay: link.delay }}
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Right: Console Launch & Web3 Actions */}
        <div className="flex items-center gap-3">
          {walletAddress ? (
            <>
              {/* Connected Wallet Pill Button */}
              <button
                onClick={() => onEnterConsole("Overview")}
                className="hidden sm:flex animate-blur-fade-up liquid-glass items-center gap-2 rounded-full px-4 py-2 text-xs font-mono text-white/90 hover:text-white transition-all cursor-pointer hover:bg-white/5 active:scale-95"
                style={{ animationDelay: "320ms" }}
                title="Connected to Somnia Testnet"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{shortAddress}</span>
              </button>

              {/* Enter Terminal Pill Button */}
              <button
                onClick={() => onEnterConsole("Overview")}
                className="hidden sm:flex animate-blur-fade-up bg-white text-black hover:bg-gray-200 transition-all rounded-full font-medium px-4 md:px-5 py-2 text-sm items-center gap-2 shadow-lg active:scale-95 cursor-pointer"
                style={{ animationDelay: "350ms" }}
              >
                <span>Launch Terminal</span>
                <RocketLaunchIcon className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              {/* Connect Wallet Pill Button */}
              <button
                onClick={onConnectWallet}
                className="hidden sm:flex animate-blur-fade-up liquid-glass items-center gap-1.5 rounded-full px-4 py-2 text-sm text-white/90 hover:text-white transition-all cursor-pointer hover:bg-white/5 active:scale-95"
                style={{ animationDelay: "320ms" }}
              >
                <WalletIcon className="w-4 h-4 text-white/80" />
                <span>Connect Wallet</span>
              </button>

              {/* Enter Terminal Pill Button */}
              <button
                onClick={() => onEnterConsole("Overview")}
                className="hidden sm:flex animate-blur-fade-up bg-white text-black hover:bg-gray-200 transition-all rounded-full font-medium px-4 md:px-5 py-2 text-sm items-center gap-2 shadow-lg active:scale-95 cursor-pointer"
                style={{ animationDelay: "350ms" }}
              >
                <span>Launch Terminal</span>
                <RocketLaunchIcon className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Hamburger Menu Toggle (mobile) */}
          <button
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="lg:hidden animate-blur-fade-up liquid-glass w-10 h-10 rounded-full flex items-center justify-center text-white transition-all cursor-pointer hover:bg-white/5 active:scale-95 relative"
            style={{ animationDelay: "350ms" }}
            aria-label="Toggle Navigation Menu"
          >
            <div className="relative size-[18px] flex items-center justify-center">
              <Bars3Icon
                className={`size-[18px] absolute transition-all duration-300 ease-out ${
                  isMobileMenuOpen ? "rotate-90 opacity-0 scale-50" : "rotate-0 opacity-100 scale-100"
                }`}
              />
              <XMarkIcon
                className={`size-[18px] absolute transition-all duration-300 ease-out ${
                  isMobileMenuOpen ? "rotate-0 opacity-100 scale-100" : "-rotate-90 opacity-0 scale-50"
                }`}
              />
            </div>
          </button>
        </div>
      </header>

      {/* 4. Mobile Menu Dropdown (below lg) */}
      <div
        className={`lg:hidden absolute top-[72px] inset-x-4 sm:inset-x-6 z-40 bg-gray-950/95 backdrop-blur-xl border border-gray-800/80 shadow-2xl rounded-2xl p-4 transition-all duration-300 ease-out ${
          isMobileMenuOpen
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "-translate-y-4 opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex flex-col space-y-1">
          {navLinks.map((link, idx) => (
            <button
              key={link.view}
              onClick={() => {
                setIsMobileMenuOpen(false);
                onEnterConsole(link.view);
              }}
              className="w-full text-left py-2.5 px-3 rounded-lg text-sm text-gray-200 hover:text-white hover:bg-white/5 transition-colors flex items-center justify-between"
              style={{ transitionDelay: `${idx * 40}ms` }}
            >
              <span>{link.label}</span>
              <ArrowRightIcon className="w-4 h-4 text-gray-500" />
            </button>
          ))}

          <div className="pt-3 mt-2 border-t border-gray-800 flex flex-col gap-2">
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onEnterConsole("Overview");
              }}
              className="w-full bg-white text-black rounded-full py-2.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-gray-200 cursor-pointer"
            >
              <RocketLaunchIcon className="w-4 h-4" />
              <span>Launch Cyber-Terminal</span>
            </button>

            {!walletAddress && onConnectWallet && (
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onConnectWallet();
                }}
                className="w-full liquid-glass rounded-full py-2.5 px-4 text-xs font-medium flex items-center justify-center gap-2 text-white hover:bg-white/5 cursor-pointer"
              >
                <WalletIcon className="w-4 h-4" />
                <span>Connect Web3 Wallet</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 5. Showcase Hero Content (Bottom of viewport, z-index 10) */}
      <main className="flex-1 flex flex-col justify-end px-4 sm:px-6 md:px-12 pb-8 md:pb-16 z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          {/* Left Side: Metadata Badges, Title, Description, Showcase CTAs */}
          <div
            className={`flex-1 transition-opacity duration-200 ${
              isTransitioning ? "opacity-40" : "opacity-100"
            }`}
          >
            {/* Badges Row */}
            <div
              className="animate-blur-fade-up flex flex-wrap items-center gap-3 sm:gap-6 mb-6 md:mb-8 text-xs sm:text-sm text-gray-300"
              style={{ animationDelay: "300ms" }}
            >
              <div className="flex items-center gap-1.5 font-medium text-white">
                <Badge1Icon className="w-4 h-4 sm:w-5 h-5 text-white" />
                <span>{slide.badge1.label}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-300">
                <Badge2Icon className="w-4 h-4 text-gray-400" />
                <span>{slide.badge2.label}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-300">
                <Badge3Icon className="w-4 h-4 text-gray-400" />
                <span>{slide.badge3.label}</span>
              </div>
            </div>

            {/* Main Headline */}
            <h1
              className="animate-blur-fade-up text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-normal tracking-[-0.04em] mb-4 md:mb-6 text-white leading-[1.08] max-w-4xl"
              style={{ animationDelay: "400ms" }}
            >
              {slide.title}
            </h1>

            {/* Subtitle Description */}
            <p
              className="animate-blur-fade-up text-base sm:text-lg md:text-xl text-gray-400 mb-6 md:mb-12 max-w-2xl leading-relaxed font-light"
              style={{ animationDelay: "500ms" }}
            >
              {slide.description}
            </p>

            {/* Showcase CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <button
                onClick={() => onEnterConsole(slide.targetView)}
                className="animate-blur-fade-up bg-white text-black hover:bg-gray-200 transition-all rounded-full font-medium px-6 sm:px-8 py-2.5 sm:py-3 text-sm sm:text-base flex items-center gap-2.5 shadow-xl hover:shadow-white/20 active:scale-95 cursor-pointer"
                style={{ animationDelay: "600ms" }}
              >
                <PlayIcon className="size-[18px] fill-black text-black" />
                <span>{slide.primaryCtaText}</span>
              </button>

              <button
                onClick={() => onEnterConsole(slide.secondaryTargetView)}
                className="animate-blur-fade-up liquid-glass text-white rounded-full font-medium px-6 sm:px-8 py-2.5 sm:py-3 text-sm sm:text-base flex items-center gap-2 hover:bg-white/5 transition-all active:scale-95 cursor-pointer"
                style={{ animationDelay: "700ms" }}
              >
                <span>{slide.secondaryCtaText}</span>
                <ArrowRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Side: Showcase Navigation Arrows & Slide Indicators */}
          <div className="flex flex-col items-start md:items-end gap-3 shrink-0">
            {/* Slide Index Counter */}
            <div
              className="animate-blur-fade-up text-xs font-mono text-gray-400 tracking-wider flex items-center gap-2"
              style={{ animationDelay: "750ms" }}
            >
              <span className="text-white font-medium">0{currentSlideIndex + 1}</span>
              <span>/</span>
              <span>0{HERO_SLIDES.length}</span>
              <div className="flex items-center gap-1.5 ml-2">
                {HERO_SLIDES.map((_, i) => (
                  <div
                    key={i}
                    onClick={() => setCurrentSlideIndex(i)}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      currentSlideIndex === i ? "w-5 bg-white" : "w-1.5 bg-white/30"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Prev / Next Showcase Navigation Pill Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevSlide}
                className="animate-blur-fade-up liquid-glass rounded-full px-4 sm:px-6 py-2.5 sm:py-3 flex items-center gap-1.5 text-sm text-white hover:bg-white/5 transition-all active:scale-95 cursor-pointer"
                style={{ animationDelay: "800ms" }}
                aria-label="Previous Slide"
              >
                <ChevronLeftIcon className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <button
                onClick={handleNextSlide}
                className="animate-blur-fade-up liquid-glass rounded-full px-4 sm:px-6 py-2.5 sm:py-3 flex items-center gap-1.5 text-sm text-white hover:bg-white/5 transition-all active:scale-95 cursor-pointer"
                style={{ animationDelay: "900ms" }}
                aria-label="Next Slide"
              >
                <span>Next</span>
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CinematicHero;
