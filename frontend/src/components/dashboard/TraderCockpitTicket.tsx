import React, { useState, useEffect, useMemo } from 'react';
import {
  BoltIcon,
  SparklesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';
import type { Market, AgentThoughtLog } from '../../types/index.js';
import type { MarketTickData } from '../../hooks/useTelemetry.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import type { SessionGrant } from '../../types/index.js';
import { useMarketCountdown } from '../../hooks/useMarketCountdown.js';
import { apiClient } from '../../services/api.js';
import { web3Service, SOMNIA_ADDRESSES } from '../../services/web3.js';
import { soundEngine } from '../../services/audio.js';
import { Badge } from '../ui/badge.js';
import { Spinner } from '../ui/Spinner.js';
import { cn } from '../../lib/utils.js';

export interface LadderPrefillData {
  outcome: 'YES' | 'NO';
  price: number;
  lotSize?: number;
  source?: 'ask' | 'bid';
  timestamp: number;
}

interface TraderCockpitTicketProps {
  market: Market;
  liveTick: MarketTickData | undefined;
  prefillData?: LadderPrefillData | null;
  wallet: WalletState;
  activeSession: SessionGrant | null;
  agentThoughts?: AgentThoughtLog[];
  onOpenSessionModal?: () => void;
  onConnectWallet?: () => void;
  bestBidYes?: number;
  bestAskYes?: number;
  onSelectDuration?: (duration: '5m' | '15m' | '1h') => void;
}

export const TraderCockpitTicket: React.FC<TraderCockpitTicketProps> = ({
  market,
  liveTick,
  prefillData,
  wallet,
  activeSession,
  agentThoughts = [],
  onOpenSessionModal: _onOpenSessionModal,
  onConnectWallet,
  bestBidYes,
  bestAskYes,
  onSelectDuration,
}) => {
  // Real-time dynamic countdown & formatted expiry
  const { formattedCountdown, formattedExpiry } = useMarketCountdown(market.closeTimestamp, market.windowDuration);

  // Order Configuration State
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const [price, setPrice] = useState<number>(0.85);
  const [collateralAmount, setCollateralAmount] = useState<number>(10);
  const [isManualPrice, setIsManualPrice] = useState<boolean>(false);

  // Execution State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [lastExecutedOrder, setLastExecutedOrder] = useState<{
    id: string;
    txHash?: string;
    price: number;
    lotSize: number;
    outcome: 'YES' | 'NO';
    totalCost: number;
  } | null>(null);
  const [pulseEffect, setPulseEffect] = useState<boolean>(false);
  const [isFauceting, setIsFauceting] = useState<boolean>(false);

  // Derive active live prices
  const currentBestBid = bestBidYes ?? market.bestBidYes ?? 0.84;
  const currentBestAsk = bestAskYes ?? market.bestAskYes ?? 0.85;
  const spotPrice = liveTick?.spotPrice ?? market.strikePrice;
  const strike = market.strikePrice || 79613.4;

  // Continuous regularized sigmoid probability centered on strike (prevents pin-risk step collapse)
  const smoothFallbackProb = useMemo(() => {
    if (!strike || strike <= 0) return 0.50;
    const relOffset = (spotPrice - strike) / (strike * 0.005);
    const sigmoid = 1 / (1 + Math.exp(-Math.max(-4, Math.min(4, relOffset * 2))));
    return Number(sigmoid.toFixed(4));
  }, [spotPrice, strike]);

  const marketProbYes = liveTick?.impliedProb ?? market.impliedProbYes ?? (currentBestAsk > 0 ? currentBestAsk : smoothFallbackProb);
  const fairValueYes = liveTick?.fairValue ?? market.fairValueYes ?? smoothFallbackProb;
  const bsmEdge = liveTick?.edge ?? (fairValueYes - marketProbYes);

  // Implied odds
  const upOddsPct = Math.round(marketProbYes * 100);
  const downOddsPct = Math.max(1, 100 - upOddsPct);

  // Handle Ladder prefill triggers
  useEffect(() => {
    if (prefillData) {
      setOutcome(prefillData.outcome);
      setPrice(Number(prefillData.price.toFixed(2)));
      setIsManualPrice(true);
      if (prefillData.lotSize && prefillData.lotSize > 0) {
        const estCost = Math.max(1, Number((prefillData.price * prefillData.lotSize).toFixed(2)));
        setCollateralAmount(Math.min(estCost, 100));
      }
      setPulseEffect(true);
      const timer = setTimeout(() => setPulseEffect(false), 900);
      return () => clearTimeout(timer);
    }
  }, [prefillData]);

  // Adjust price automatically when switching outcomes in IOC mode
  useEffect(() => {
    if (!isManualPrice) {
      const defaultPrice = outcome === 'YES' ? currentBestAsk : Number((1.0 - currentBestBid).toFixed(2));
      setPrice(Math.min(0.99, Math.max(0.01, defaultPrice)));
    }
  }, [outcome, currentBestAsk, currentBestBid, isManualPrice]);

  // Available collateral balance
  const userBalance = useMemo(() => {
    const parsed = parseFloat(wallet.balanceCollateral);
    return isNaN(parsed) ? 0 : parsed;
  }, [wallet.balanceCollateral]);

  // Derived current percentage of account balance
  const currentPct = useMemo(() => {
    if (userBalance <= 0) return Math.min(100, Math.max(0, collateralAmount));
    return Math.min(100, Math.max(0, Math.round((collateralAmount / userBalance) * 100)));
  }, [collateralAmount, userBalance]);

  // Calculated Order Quantities & Payouts ($1.00/lot upon winning)
  const calculations = useMemo(() => {
    const validPrice = Math.max(0.01, Math.min(0.99, price));
    const lotSize = Math.max(1, Math.floor(collateralAmount / validPrice));
    const totalCost = Number((lotSize * validPrice).toFixed(2));
    const grossPayout = Number((lotSize * 1.0).toFixed(2));
    const netProfit = Number((grossPayout - totalCost).toFixed(2));
    const rocPercent = totalCost > 0 ? Number(((netProfit / totalCost) * 100).toFixed(1)) : 0;
    const payoutMultiplier = totalCost > 0 ? (grossPayout / totalCost).toFixed(2) : '1.00';

    return {
      lotSize,
      totalCost,
      grossPayout,
      netProfit,
      rocPercent,
      payoutMultiplier,
    };
  }, [price, collateralAmount]);

  // Swarm AI Copilot intelligence with directional hysteresis & smooth confidence
  const aiRecommendation = useMemo(() => {
    const recommendedOutcome: 'YES' | 'NO' = fairValueYes >= 0.50 ? 'YES' : 'NO';
    const recommendedDirection: 'UP' | 'DOWN' = fairValueYes >= 0.50 ? 'UP' : 'DOWN';
    const edgeVal = (Math.abs(bsmEdge) * 100).toFixed(1);
    const spotDiff = spotPrice - strike;
    const pctDiff = strike > 0 ? (spotDiff / strike) * 100 : 0;
    const diffText = spotDiff >= 0 
      ? `+$${spotDiff < 1 ? spotDiff.toFixed(4) : spotDiff.toFixed(2)} (+${pctDiff.toFixed(2)}%) above strike` 
      : `-$${Math.abs(spotDiff) < 1 ? Math.abs(spotDiff).toFixed(4) : Math.abs(spotDiff).toFixed(2)} (${pctDiff.toFixed(2)}%) below strike`;

    const confScore = Math.round((fairValueYes >= 0.5 ? fairValueYes : (1 - fairValueYes)) * 100);
    let rationale = `Spot is ${diffText}. Titan BSM & Confluence engine rates ${recommendedDirection} with ${confScore}% conviction (+${edgeVal}% Alpha dislocation vs CLOB).`;

    const recentThought = agentThoughts.find(
      (t) => t.marketId === market.id || t.marketId?.toLowerCase() === market.id.toLowerCase()
    );
    if (recentThought?.reasoningText) {
      rationale = recentThought.reasoningText;
    }

    return {
      recommendedOutcome,
      recommendedDirection,
      confidence: confScore,
      edgeVal,
      rationale,
    };
  }, [spotPrice, strike, fairValueYes, bsmEdge, agentThoughts, market.id]);

  // 1-Click Auto Align with AI recommendation
  const handleAutoAlignAI = () => {
    setOutcome(aiRecommendation.recommendedOutcome);
    setIsManualPrice(false);
    // Kelly Criterion optimal sizing: 15% of balance or preset $25
    const optimalSize = userBalance > 50 ? Math.min(50, Math.floor(userBalance * 0.15)) : 25;
    setCollateralAmount(optimalSize);
    setPulseEffect(true);
    soundEngine.playTradeFill();
    setTimeout(() => setPulseEffect(false), 800);
  };

  // Claim Faucet for TestUSDC
  const handleClaimFaucet = async () => {
    if (!wallet.isConnected || !wallet.address) {
      onConnectWallet?.();
      return;
    }
    setIsFauceting(true);
    try {
      await web3Service.claimTestUsdcFaucet(wallet.address as `0x${string}`, 1000);
      soundEngine.playTradeFill();
      setExecutionError(null);
    } catch (err: any) {
      console.error('[TraderCockpitTicket] Faucet claim error:', err);
      setExecutionError(err.message || 'Faucet claim failed. Please try again.');
    } finally {
      setIsFauceting(false);
    }
  };

  // Handle Order Placement
  const handleExecuteOrder = async () => {
    if (!wallet.isConnected || !wallet.address) {
      onConnectWallet?.();
      return;
    }

    setIsSubmitting(true);
    setExecutionError(null);

    try {
      if (activeSession && activeSession.isActive) {
        // Path 1: Zero-Gas Session Execution via Backend Operator
        const res = await apiClient.placeOrder({
          userAddress: wallet.address,
          marketId: market.id,
          outcome,
          direction: 'BUY',
          orderType: 'IOC',
          price,
          lotSize: calculations.lotSize,
        });

        if (res.success && res.data) {
          soundEngine.playTradeFill();
          setLastExecutedOrder({
            id: res.data.id,
            txHash: res.data.txHash,
            price: res.data.price,
            lotSize: res.data.lotSize,
            outcome: res.data.outcome as 'YES' | 'NO',
            totalCost: res.data.totalCost,
          });
        } else {
          throw new Error('Order execution returned unconfirmed status');
        }
      } else {
        // Path 2: MetaMask Direct Wallet Signing Fallback
        const poolAddr = (market.poolAddress || SOMNIA_ADDRESSES.marketsCore) as `0x${string}`;
        const walletRes = await web3Service.placeBinaryOrderWithWallet({
          userAddress: wallet.address,
          poolAddress: poolAddr,
          outcome,
          orderType: 'IOC',
          price,
          lotSize: calculations.lotSize,
        });

        const indexed = await apiClient.placeOrder({
          userAddress: wallet.address,
          marketId: market.id,
          outcome,
          direction: 'BUY',
          orderType: 'IOC',
          price,
          lotSize: calculations.lotSize,
          txHash: walletRes.hash,
        });

        soundEngine.playTradeFill();
        setLastExecutedOrder({
          id: indexed.data?.id || `tx-${walletRes.hash.slice(2, 10)}`,
          txHash: walletRes.hash,
          price,
          lotSize: calculations.lotSize,
          outcome,
          totalCost: calculations.totalCost,
        });
      }
    } catch (err: any) {
      console.error('[TraderCockpitTicket] Trade execution error:', err);
      setExecutionError(err.message || 'Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isYes = outcome === 'YES';

  return (
    <div
      className={cn(
        "flex flex-col h-full overflow-y-auto p-3.5 bg-background/90 backdrop-blur-md transition-all duration-300 font-mono select-none",
        pulseEffect && "ring-2 ring-brand-cyan/60 bg-brand-cyan/[0.04]"
      )}
    >
      {/* 1. Header: Market Info & Expiry */}
      <div className="pb-3 border-b border-border/40 mb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 font-bold text-foreground text-xs uppercase tracking-wider">
            <span>Market</span>
            <Badge variant="outline" className="text-[9px] px-1 py-0 border-brand-cyan/30 text-brand-cyan bg-brand-cyan/10">
              {market.windowDuration || '15m'}
            </Badge>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-bold text-brand-cyan">
            <ClockIcon className="w-3.5 h-3.5" />
            <span>{formattedCountdown}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{market.windowDuration === '1h' ? '1-hour' : market.windowDuration === '5m' ? '5-minute' : '15-minute'} market</span>
          <span className="text-[10px]">
            strike ${strike.toLocaleString('en-US', { minimumFractionDigits: 2 })} · expires {formattedExpiry}
          </span>
        </div>

        {/* Timeframe Switcher (15m / 1h) */}
        <div className="flex items-center gap-1.5 mt-2.5">
          {(['5m', '15m', '1h'] as const).map((duration) => {
            const isCur = (market.windowDuration || '15m') === duration;
            return (
              <button
                key={duration}
                type="button"
                onClick={() => onSelectDuration?.(duration)}
                className={cn(
                  "flex-1 py-1 text-center rounded-lg text-xs font-mono font-bold transition-all cursor-pointer border",
                  isCur
                    ? "bg-secondary text-foreground border-border/70 shadow-xs"
                    : "bg-secondary/20 text-muted-foreground border-border/30 hover:text-foreground hover:bg-secondary/40"
                )}
              >
                {duration}
              </button>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground/80 mt-1.5 leading-tight">
          A new market opens each interval — everyone trades the same one.
        </p>
      </div>

      {/* 2. Amount Input & Quick Percentages */}
      <div className="mb-3.5 flex-shrink-0">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span className="font-bold text-foreground">Amount</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px]">Max: ${userBalance.toFixed(2)} USDso</span>
            <button
              type="button"
              onClick={() => setCollateralAmount(Math.max(1, Math.floor(userBalance)))}
              className="text-brand-cyan hover:underline text-[10px] font-bold cursor-pointer"
            >
              MAX
            </button>
          </div>
        </div>

        <div className="relative mb-2">
          <input
            type="number"
            min="1"
            max="50000"
            step="1"
            value={collateralAmount}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) setCollateralAmount(Math.max(1, val));
            }}
            className="w-full px-3 py-2 bg-secondary/30 border border-border/60 rounded-xl text-sm font-mono text-foreground focus:outline-none focus:border-brand-cyan transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            placeholder="0.00"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-xs font-bold">
            USDso
          </span>
        </div>

        {/* Account Percentage Slider (0% - 100% of Balance) */}
        <input
          type="range"
          min="1"
          max="100"
          step="1"
          value={currentPct}
          onChange={(e) => {
            const pct = parseInt(e.target.value, 10);
            if (userBalance > 0) {
              const calculated = Math.max(1, Number(((userBalance * pct) / 100).toFixed(2)));
              setCollateralAmount(calculated);
            } else {
              setCollateralAmount(pct);
            }
          }}
          className="w-full h-1 bg-secondary/60 rounded-lg appearance-none cursor-pointer accent-brand-cyan mb-2"
        />

        {/* Percentage Quick Select Buttons */}
        <div className="grid grid-cols-4 gap-1.5">
          {[25, 50, 75, 100].map((pct) => {
            const isSelected = Math.abs(currentPct - pct) <= 1;
            return (
              <button
                key={`pct-${pct}`}
                type="button"
                onClick={() => {
                  if (userBalance > 0) {
                    const target = Math.max(1, Number(((userBalance * pct) / 100).toFixed(2)));
                    setCollateralAmount(target);
                  } else {
                    setCollateralAmount(pct);
                  }
                }}
                className={cn(
                  "py-1 rounded-lg text-[10px] font-mono border transition-all cursor-pointer text-center",
                  isSelected
                    ? "bg-brand-cyan/20 text-brand-cyan border-brand-cyan/40 font-bold shadow-xs"
                    : "bg-secondary/30 hover:bg-secondary/60 text-muted-foreground hover:text-foreground border-border/30"
                )}
              >
                {pct}%
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. TWO MASSIVE BINARY ACTION BUTTONS (DreamDEX UP / DOWN) */}
      <div className="grid grid-cols-2 gap-2.5 mb-3.5 flex-shrink-0">
        {/* ▲ UP Button */}
        <button
          type="button"
          onClick={() => {
            setOutcome('YES');
            setIsManualPrice(false);
          }}
          className={cn(
            "flex flex-col p-3 rounded-xl border transition-all cursor-pointer text-left relative overflow-hidden",
            isYes
              ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
              : "bg-secondary/30 border-border/40 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          )}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-sm font-bold flex items-center gap-1">
              <ArrowTrendingUpIcon className="w-4 h-4" />
              <span>▲ Up</span>
            </span>
            <span className="text-sm font-bold">{upOddsPct}%</span>
          </div>

          <div className="text-[10px] text-muted-foreground">
            {collateralAmount > 0 ? (
              <span className="text-emerald-400/90 font-mono">
                Payout: {calculations.payoutMultiplier}x (${calculations.grossPayout})
              </span>
            ) : (
              <span>enter an amount</span>
            )}
          </div>
        </button>

        {/* ▼ DOWN Button */}
        <button
          type="button"
          onClick={() => {
            setOutcome('NO');
            setIsManualPrice(false);
          }}
          className={cn(
            "flex flex-col p-3 rounded-xl border transition-all cursor-pointer text-left relative overflow-hidden",
            !isYes
              ? "bg-rose-500/20 border-rose-500 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.2)]"
              : "bg-secondary/30 border-border/40 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          )}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-sm font-bold flex items-center gap-1">
              <ArrowTrendingDownIcon className="w-4 h-4" />
              <span>▼ Down</span>
            </span>
            <span className="text-sm font-bold">{downOddsPct}%</span>
          </div>

          <div className="text-[10px] text-muted-foreground">
            {collateralAmount > 0 ? (
              <span className="text-rose-400/90 font-mono">
                Payout: {Number((1 / (1 - currentBestBid || 0.15)).toFixed(2))}x
              </span>
            ) : (
              <span>enter an amount</span>
            )}
          </div>
        </button>
      </div>

      {/* 4. ✨ DREAM PULSE AI ALPHA COPILOT CARD */}
      <div className="p-2.5 rounded-xl bg-purple-950/20 border border-purple-500/30 mb-3.5 flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-purple-300 text-[11px] font-bold">
            <SparklesIcon className="w-3.5 h-3.5 text-purple-400" />
            <span>AI Alpha Copilot</span>
            <Badge variant="outline" className="text-[8px] px-1 py-0 border-purple-500/40 text-purple-300 bg-purple-500/10">
              Titan BSM
            </Badge>
          </div>
          <span className="text-[9px] text-purple-400/80 font-mono">
            {aiRecommendation.edgeVal}% Edge
          </span>
        </div>

        <p className="text-[10px] text-purple-200/80 leading-relaxed font-sans">
          {aiRecommendation.rationale}
        </p>

        {/* 1-Click Auto-Align AI Button */}
        <button
          type="button"
          onClick={handleAutoAlignAI}
          className="w-full py-1.5 px-2.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
        >
          <BoltIcon className="w-3.5 h-3.5 text-purple-300" />
          <span>Follow AI Trade ({aiRecommendation.recommendedDirection} • {aiRecommendation.confidence}% Conf)</span>
        </button>
      </div>

      {/* 5. Breakdown Section (Cost, Shares, Strike, Expiry, Oracle) */}
      <div className="p-2.5 rounded-xl bg-secondary/20 border border-border/30 text-xs space-y-1.5 mb-3 flex-shrink-0">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Cost (max loss)</span>
          <span className="font-bold text-foreground">${calculations.totalCost.toFixed(2)} USDso</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Shares</span>
          <span className="font-bold text-foreground">{calculations.lotSize.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Strike</span>
          <span className="font-bold text-foreground">${strike.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Market expiry</span>
          <span className="text-foreground">{formattedExpiry}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground pt-1 border-t border-border/20">
          <span>Settles against</span>
          <span className="text-brand-cyan hover:underline cursor-pointer">Prophecy Oracle</span>
        </div>
      </div>

      {/* 6. Account Balance Section */}
      <div className="p-2.5 rounded-xl bg-secondary/10 border border-border/20 text-[11px] space-y-1 mb-3 flex-shrink-0">
        <div className="flex items-center justify-between font-bold text-foreground">
          <span>Account</span>
          {Number(wallet.balanceCollateral) < 10 && (
            <button
              type="button"
              disabled={isFauceting}
              onClick={handleClaimFaucet}
              className="text-[9px] text-brand-cyan hover:underline font-normal cursor-pointer"
            >
              {isFauceting ? 'Claiming...' : '+ Get TestUSDC'}
            </button>
          )}
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>USDso</span>
          <span className="font-bold text-foreground">{userBalance.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>SOMI</span>
          <span>{wallet.balanceSTT || '1.25'}</span>
        </div>
      </div>

      {/* Error & Success Messages */}
      {executionError && (
        <div className="p-2.5 mb-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2">
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="leading-snug">{executionError}</span>
        </div>
      )}

      {lastExecutedOrder && (
        <div className="p-2.5 mb-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between">
          <span className="flex items-center gap-1 font-bold">
            <CheckCircleIcon className="w-4 h-4" />
            Placed {lastExecutedOrder.lotSize} {lastExecutedOrder.outcome} on Somnia!
          </span>
          {lastExecutedOrder.txHash && (
            <a
              href={`https://shannon-explorer.somnia.network/tx/${lastExecutedOrder.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-brand-cyan hover:underline"
            >
              Explorer
            </a>
          )}
        </div>
      )}

      {/* 7. Action Button (Deposit / Trade) */}
      <div className="mt-auto pt-1 flex flex-col gap-2 flex-shrink-0">
        {!wallet.isConnected ? (
          <button
            type="button"
            onClick={onConnectWallet}
            className="w-full py-3 rounded-xl bg-brand-cyan text-background font-bold text-xs uppercase tracking-wider hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-2"
          >
            Connect Wallet
          </button>
        ) : (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleExecuteOrder}
            className="w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider bg-white hover:bg-zinc-100 text-zinc-950 border border-white/40 shadow-lg shadow-white/10 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
          >
            {isSubmitting ? (
              <>
                <Spinner size="sm" />
                <span className="text-zinc-950 font-bold">Routing to Somnia Shannon...</span>
              </>
            ) : (
              <>
                {activeSession?.isActive && <BoltIcon className="w-4 h-4 text-zinc-950" />}
                <span className="text-zinc-950 font-bold">
                  {outcome === 'YES' ? 'Buy UP' : 'Buy DOWN'} • ${calculations.totalCost.toFixed(2)} USDso
                </span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
