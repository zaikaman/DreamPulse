import React, { useState, useEffect } from 'react';
import {
  SparklesIcon,
  ShieldCheckIcon,
  CurrencyDollarIcon,
  BoltIcon,
  CpuChipIcon,
  AdjustmentsHorizontalIcon,
  ViewfinderCircleIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  XMarkIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import { Dialog, DialogContent } from '../ui/dialog.js';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';
import { Spinner } from '../ui/Spinner.js';
import { BrandIcon } from '../common/BrandLogo.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import type { SessionGrant } from '../../types/index.js';
import type { DashboardViewType } from '../landing/CinematicHero.js';
import { soundEngine } from '../../services/audio.js';

interface OnboardingWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet?: WalletState;
  activeSession?: SessionGrant | null;
  isFauceting?: boolean;
  onClaimFaucet?: (amount?: number) => Promise<void>;
  onConnectWallet?: () => Promise<void>;
  onSwitchNetwork?: () => Promise<void>;
  onOpenSessionModal?: (options?: { revoke?: boolean }) => void;
  onNavigateView: (view: DashboardViewType) => void;
  onComplete: () => void;
}

export const OnboardingWizardModal: React.FC<OnboardingWizardModalProps> = ({
  isOpen,
  onClose,
  wallet,
  activeSession,
  isFauceting = false,
  onClaimFaucet,
  onConnectWallet,
  onSwitchNetwork,
  onOpenSessionModal,
  onNavigateView,
  onComplete,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState<boolean>(false);
  const [hasClaimedThisSession, setHasClaimedThisSession] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConnected = Boolean(wallet?.isConnected);
  const isCorrectNetwork = Boolean(wallet?.isCorrectNetwork);
  const collateralBalance = parseFloat(wallet?.balanceCollateral || '0');
  const hasCollateral = collateralBalance > 0;
  const isSessionActive = Boolean(activeSession?.isActive);

  const steps = [
    { title: 'Welcome & Network', label: 'Network' },
    { title: 'Testnet Collateral', label: 'Faucet' },
    { title: 'Session Key', label: 'Session' },
    { title: 'Choose Your Journey', label: 'Launch' },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleFinish('Overview');
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleFinish = (targetView: DashboardViewType) => {
    soundEngine.playWinChime();
    onComplete();
    onNavigateView(targetView);
    onClose();
  };

  const handleSwitchNetworkClick = async () => {
    if (!onSwitchNetwork) return;
    setIsSwitchingNetwork(true);
    try {
      await onSwitchNetwork();
    } catch {
      // handled
    } finally {
      setIsSwitchingNetwork(false);
    }
  };

  const handleClaimFaucetClick = async () => {
    if (!onClaimFaucet) return;
    try {
      await onClaimFaucet(1000);
      setHasClaimedThisSession(true);
      soundEngine.playWinChime();
    } catch {
      // error handled in hook
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-xl p-0 overflow-hidden bg-card/95 border-border/80 text-foreground shadow-2xl backdrop-blur-xl sm:rounded-2xl"
        showCloseButton={false}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-border/50 bg-secondary/20">
          <div className="flex items-center gap-3">
            <BrandIcon size="sm" glow interactive />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground tracking-tight">
                  DreamPulse Setup Guide
                </h3>
                <Badge
                  variant="outline"
                  className="font-mono text-[9px] px-1.5 py-0 h-4 border-emerald-500/30 text-emerald-400 bg-emerald-950/20"
                >
                  Somnia Shannon 50312
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground font-mono">
                Step {currentStep + 1} of {steps.length} — {steps[currentStep].title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
            title="Skip Setup"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="w-full bg-secondary/30 h-1 flex">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={`h-full flex-1 transition-all duration-300 ${
                idx <= currentStep ? 'bg-foreground' : 'bg-transparent'
              }`}
            />
          ))}
        </div>

        {/* Modal Body */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 min-h-[280px] max-h-[68vh] max-h-[68dvh] overflow-y-auto flex flex-col justify-between">
          {/* ------------------------------------------------------------- */}
          {/* STEP 1: WELCOME & NETWORK SETUP */}
          {/* ------------------------------------------------------------- */}
          {currentStep === 0 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="space-y-1.5">
                <h4 className="text-base font-semibold text-foreground">
                  Welcome to Autonomous Trading on Somnia L1
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  DreamPulse is an institutional-grade algorithmic agent protocol for DreamDEX Event Contracts. 
                  Swarms of autonomous AI models trade high-speed binary prediction markets around the clock.
                </p>
              </div>

              {/* Status Checklist Card */}
              <div className="rounded-xl border border-border/60 bg-secondary/30 p-3.5 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Network Environment</span>
                  <span className="font-mono font-medium text-foreground">Somnia Shannon Testnet</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Chain ID</span>
                  <span className="font-mono text-muted-foreground">50312</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Execution Latency</span>
                  <span className="font-mono text-emerald-400">&lt;100ms Sub-Second Finality</span>
                </div>

                <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    {isCorrectNetwork ? (
                      <CheckCircleIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <BoltIcon className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <span className="text-xs">
                      {isCorrectNetwork
                        ? 'Wallet connected to Shannon Testnet'
                        : isConnected
                        ? 'Network switch required'
                        : 'Wallet connection needed'}
                    </span>
                  </div>

                  {!isConnected ? (
                    <Button
                      size="sm"
                      onClick={onConnectWallet}
                      className="h-7 text-xs px-3 shadow-2xs"
                    >
                      Connect Wallet
                    </Button>
                  ) : !isCorrectNetwork ? (
                    <Button
                      size="sm"
                      onClick={handleSwitchNetworkClick}
                      disabled={isSwitchingNetwork}
                      className="h-7 text-xs px-3 shadow-2xs gap-1.5"
                    >
                      {isSwitchingNetwork && <Spinner size="xs" />}
                      <span>Switch Network</span>
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-400 bg-emerald-950/20">
                      Verified
                    </Badge>
                  )}
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5">
                <ShieldCheckIcon className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Zero custodial deposit required. All interactions execute via verifiable smart contracts.</span>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* STEP 2: TESTNET COLLATERAL & GAS */}
          {/* ------------------------------------------------------------- */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="space-y-1.5">
                <h4 className="text-base font-semibold text-foreground">
                  Claim Test Trading Fuel
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  DreamDEX Event Contracts settle in test USDC (tUSDC) with STT gas on Somnia. 
                  Claim testnet tokens to immediately test AI Swarm copytrading and manual order execution.
                </p>
              </div>

              {/* Balance Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
                  <div className="text-[10px] uppercase font-mono text-muted-foreground">Test Collateral</div>
                  <div className="text-lg font-mono font-bold text-foreground mt-0.5">
                    {wallet?.balanceCollateral || '0.00'}{' '}
                    <span className="text-xs font-normal text-muted-foreground">tUSDC</span>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
                  <div className="text-[10px] uppercase font-mono text-muted-foreground">Somnia Gas</div>
                  <div className="text-lg font-mono font-bold text-foreground mt-0.5">
                    {wallet?.balanceSTT || '0.00'}{' '}
                    <span className="text-xs font-normal text-muted-foreground">STT</span>
                  </div>
                </div>
              </div>

              {/* Faucet Action Card */}
              <div className="rounded-xl border border-border/60 bg-secondary/20 p-3.5 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-xs text-foreground">1-Click Collateral Faucet</div>
                  <div className="text-[11px] text-muted-foreground">Instantly airdrops 1,000 tUSDC for event trading</div>
                </div>

                <Button
                  size="sm"
                  onClick={handleClaimFaucetClick}
                  disabled={isFauceting || !isConnected || !isCorrectNetwork}
                  className="h-8 text-xs px-3 shadow-2xs gap-1.5"
                >
                  {isFauceting ? (
                    <>
                      <Spinner size="xs" />
                      <span>Claiming...</span>
                    </>
                  ) : hasClaimedThisSession || hasCollateral ? (
                    <>
                      <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Claim More</span>
                    </>
                  ) : (
                    <>
                      <CurrencyDollarIcon className="w-3.5 h-3.5" />
                      <span>Claim 1,000 tUSDC</span>
                    </>
                  )}
                </Button>
              </div>

              {hasCollateral && (
                <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 bg-emerald-950/20 border border-emerald-500/20 p-2 rounded-lg">
                  <CheckCircleIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>Account funded with test collateral. Ready for trading execution.</span>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* STEP 3: DEMYSTIFY SESSION KEYS */}
          {/* ------------------------------------------------------------- */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="space-y-1.5">
                <h4 className="text-base font-semibold text-foreground">
                  Enable Sub-Second Instant Execution & Copytrading
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Prediction contracts expire quickly (30s to 5m). Authorizing a session key automatically connects your 
                  wallet to the autonomous AI swarm copy-trading engine with <strong>zero pool deposits or fund lockups</strong>. 
                  Your collateral stays strictly in your own wallet.
                </p>
              </div>

              {/* Guarantees Box */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-2.5 rounded-xl border border-border/50 bg-secondary/30 space-y-1">
                  <LockClosedIcon className="w-4 h-4 text-muted-foreground" />
                  <div className="text-xs font-semibold text-foreground">100% Non-Custodial</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">Funds remain in your wallet; zero lockups</div>
                </div>

                <div className="p-2.5 rounded-xl border border-border/50 bg-secondary/30 space-y-1">
                  <ShieldCheckIcon className="w-4 h-4 text-emerald-400" />
                  <div className="text-xs font-semibold text-foreground">Strict Guardrails</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">Custom trade size and volume limits</div>
                </div>

                <div className="p-2.5 rounded-xl border border-border/50 bg-secondary/30 space-y-1">
                  <BoltIcon className="w-4 h-4 text-amber-400" />
                  <div className="text-xs font-semibold text-foreground">Instant Revoke</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">Cancel operator access anytime in 1-click</div>
                </div>
              </div>

              {/* Session Key Status & Action */}
              <div className="rounded-xl border border-border/60 bg-secondary/20 p-3.5 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-xs text-foreground">
                    {isSessionActive ? 'Session Active (Copytrading Enabled)' : 'Authorize Session Key'}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {isSessionActive
                      ? 'Swarm copytrading is active within your authorized limits'
                      : 'Set max trade size (e.g. 10 tUSDC) and start automated copytrading'}
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => onOpenSessionModal?.()}
                  className="h-8 text-xs px-3 shadow-2xs gap-1.5"
                >
                  <SparklesIcon className="w-3.5 h-3.5" />
                  <span>{isSessionActive ? 'Manage Session' : 'Authorize Session'}</span>
                </Button>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* STEP 4: CHOOSE YOUR TRADING JOURNEY */}
          {/* ------------------------------------------------------------- */}
          {currentStep === 3 && (
            <div className="space-y-3.5 animate-in fade-in-50 duration-200">
              <div className="space-y-1">
                <h4 className="text-base font-semibold text-foreground">
                  Choose Your Starting Mode
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Select your primary workflow to jump straight to action. You can seamlessly switch between all modules anytime.
                </p>
              </div>

              {/* 3 Interactive Pathway Cards */}
              <div className="grid grid-cols-1 gap-2.5">
                {/* Option A: Autonomous Swarm */}
                <button
                  onClick={() => handleFinish('Swarm Cockpit')}
                  className="w-full rounded-xl border border-border/70 hover:border-foreground/40 bg-secondary/30 hover:bg-secondary/60 p-3 text-left transition-all group flex items-start justify-between cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-foreground group-hover:scale-105 transition-transform mt-0.5">
                      <CpuChipIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          Autonomous Swarm Copytrading
                        </span>
                        <Badge variant="outline" className="text-[9px] font-mono border-emerald-500/30 text-emerald-400 bg-emerald-950/20">
                          Recommended
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Instantly copytrade multi-agent AI swarms trading 24/7 on DreamDEX. Zero pool deposits or lockups required.
                      </p>
                    </div>
                  </div>
                  <ArrowRightIcon className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
                </button>

                {/* Option B: Pro Terminal & Alpha Copilot */}
                <button
                  onClick={() => handleFinish('Trade Terminal')}
                  className="w-full rounded-xl border border-border/70 hover:border-foreground/40 bg-secondary/30 hover:bg-secondary/60 p-3 text-left transition-all group flex items-start justify-between cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-foreground group-hover:scale-105 transition-transform mt-0.5">
                      <AdjustmentsHorizontalIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          AI Alpha Copilot & Trade Terminal
                        </span>
                        <Badge variant="outline" className="text-[9px] font-mono border-border/50 text-muted-foreground">
                          Pro Trader
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Trade binary contracts manually with real-time CLOB depth, EV calculations, and live AI guidance.
                      </p>
                    </div>
                  </div>
                  <ArrowRightIcon className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
                </button>

                {/* Option C: Edge Radar & Quant Studio */}
                <button
                  onClick={() => handleFinish('Edge Radar')}
                  className="w-full rounded-xl border border-border/70 hover:border-foreground/40 bg-secondary/30 hover:bg-secondary/60 p-3 text-left transition-all group flex items-start justify-between cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-foreground group-hover:scale-105 transition-transform mt-0.5">
                      <ViewfinderCircleIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          Edge Radar & Quant Studio
                        </span>
                        <Badge variant="outline" className="text-[9px] font-mono border-border/50 text-muted-foreground">
                          Quant Anomaly
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Analyze Black-Scholes pricing anomalies, backtest formulas, and auto-settle expired contracts.
                      </p>
                    </div>
                  </div>
                  <ArrowRightIcon className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
                </button>
              </div>
            </div>
          )}

          {/* Navigation Controls Footer */}
          <div className="flex items-center justify-between pt-4 mt-2 border-t border-border/50">
            <div>
              {currentStep > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeftIcon className="w-3.5 h-3.5" />
                  <span>Back</span>
                </Button>
              ) : (
                <button
                  onClick={onClose}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-2 py-1"
                >
                  Skip for now
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {currentStep < steps.length - 1 ? (
                <Button
                  size="sm"
                  onClick={handleNext}
                  className="h-8 text-xs px-4 gap-1.5 shadow-2xs"
                >
                  <span>Continue</span>
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handleFinish('Overview')}
                  className="h-8 text-xs px-4 gap-1.5 shadow-2xs bg-primary text-primary-foreground"
                >
                  <SparklesIcon className="w-3.5 h-3.5" />
                  <span>Open Terminal Overview</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingWizardModal;
