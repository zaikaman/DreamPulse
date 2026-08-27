import React, { useState, useEffect, useMemo } from 'react';
import {
  BoltIcon,
  SparklesIcon,
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  CurrencyDollarIcon,
  AdjustmentsHorizontalIcon,
  PlusIcon,
  MinusIcon,
} from '@heroicons/react/24/outline';
import type { Market, AgentThoughtLog } from '../../types/index.js';
import type { MarketTickData } from '../../hooks/useTelemetry.js';
import type { WalletState } from '../../hooks/useSessionKey.js';
import type { SessionGrant } from '../../types/index.js';
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
}

const COLLATERAL_PRESETS = [5, 10, 25, 50];

export const TraderCockpitTicket: React.FC<TraderCockpitTicketProps> = ({
  market,
  liveTick,
  prefillData,
  wallet,
  activeSession,
  agentThoughts = [],
  onOpenSessionModal,
  onConnectWallet,
  bestBidYes,
  bestAskYes,
}) => {
  // Order Configuration State
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const [orderType, setOrderType] = useState<'LIMIT' | 'IOC'>('LIMIT');
  const [price, setPrice] = useState<number>(0.5);
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

  // Derive active live prices
  const currentBestBid = bestBidYes ?? market.bestBidYes ?? 0.49;
  const currentBestAsk = bestAskYes ?? market.bestAskYes ?? 0.51;
  const spotPrice = liveTick?.spotPrice ?? market.strikePrice;
  const bsmEdge = liveTick?.edge ?? market.edgePercentage ?? 0.0;

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

  // Adjust price when Market (IOC) is selected or when market changes without manual price override
  useEffect(() => {
    if (orderType === 'IOC') {
      const iocPrice = outcome === 'YES' ? currentBestAsk : Number((1.0 - currentBestBid).toFixed(2));
      setPrice(Math.min(0.99, Math.max(0.01, iocPrice)));
    } else if (!isManualPrice) {
      const defaultPrice = outcome === 'YES' ? currentBestAsk : Number((1.0 - currentBestBid).toFixed(2));
      setPrice(Math.min(0.99, Math.max(0.01, defaultPrice)));
    }
  }, [orderType, outcome, currentBestAsk, currentBestBid, isManualPrice]);

  // Collateral available
  const userBalance = useMemo(() => {
    const parsed = parseFloat(wallet.balanceCollateral);
    return isNaN(parsed) ? 0 : parsed;
  }, [wallet.balanceCollateral]);

  // Calculated Order Quantities & Payouts ($1.00/lot upon winning)
  const calculations = useMemo(() => {
    const validPrice = Math.max(0.01, Math.min(0.99, price));
    const lotSize = Math.max(1, Math.floor(collateralAmount / validPrice));
    const totalCost = Number((lotSize * validPrice).toFixed(2));
    const grossPayout = Number((lotSize * 1.0).toFixed(2));
    const netProfit = Number((grossPayout - totalCost).toFixed(2));
    const rocPercent = totalCost > 0 ? Number(((netProfit / totalCost) * 100).toFixed(1)) : 0;

    return {
      lotSize,
      totalCost,
      grossPayout,
      netProfit,
      rocPercent,
    };
  }, [price, collateralAmount]);

  // Extract Swarm Copilot Live Signals for current market
  const copilotSignals = useMemo(() => {
    // Volt signal: evaluate spot drift relative to strike or 1m drift
    const strikeDelta = spotPrice - market.strikePrice;
    const strikeDeltaPct = market.strikePrice > 0 ? (strikeDelta / market.strikePrice) * 100 : 0;
    const isVoltBullish = strikeDeltaPct >= 0;
    const voltText = isVoltBullish
      ? `Momentum favors YES (+${strikeDeltaPct.toFixed(2)}% spot delta)`
      : `Downside drift favors NO (${strikeDeltaPct.toFixed(2)}% spot delta)`;

    // Check if there is a recent Volt thought log for this market
    const latestVoltLog = agentThoughts.find(
      (t) => t.agentType.toLowerCase() === 'volt' && (t.marketId === market.id || t.marketId?.toLowerCase() === market.id.toLowerCase())
    );

    // Oracle signal: evaluate Black-Scholes-Merton dislocation
    const absEdgePct = (Math.abs(bsmEdge) * 100).toFixed(1);
    let oracleText = 'CLOB midpoint aligned with fair value';
    let oracleFavors: 'YES' | 'NO' = 'YES';

    if (bsmEdge > 0.02) {
      oracleText = `Underpriced by ${absEdgePct}% Φ(z), favorable edge on YES`;
      oracleFavors = 'YES';
    } else if (bsmEdge < -0.02) {
      oracleText = `Overpriced by ${absEdgePct}% Φ(z), favorable edge on NO`;
      oracleFavors = 'NO';
    }

    const latestOracleLog = agentThoughts.find(
      (t) => t.agentType.toLowerCase() === 'oracle' && (t.marketId === market.id || t.marketId?.toLowerCase() === market.id.toLowerCase())
    );

    return {
      volt: {
        recommended: isVoltBullish ? 'YES' : 'NO',
        summary: latestVoltLog?.reasoningText || voltText,
      },
      oracle: {
        recommended: oracleFavors,
        summary: latestOracleLog?.reasoningText || oracleText,
      },
    };
  }, [spotPrice, market, bsmEdge, agentThoughts]);

  // Adjust price by tick
  const handlePriceStep = (delta: number) => {
    if (orderType === 'IOC') return;
    setIsManualPrice(true);
    setPrice((prev) => {
      const next = Number((prev + delta).toFixed(2));
      return Math.min(0.99, Math.max(0.01, next));
    });
  };

  // Adopt Swarm Copilot Recommendation
  const handleAdoptSignal = (target: 'YES' | 'NO') => {
    setOutcome(target);
    const targetPrice = target === 'YES' ? currentBestAsk : Number((1.0 - currentBestBid).toFixed(2));
    setPrice(Math.min(0.99, Math.max(0.01, targetPrice)));
    setIsManualPrice(true);
    setPulseEffect(true);
    setTimeout(() => setPulseEffect(false), 600);
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
          orderType,
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
          orderType,
          price,
          lotSize: calculations.lotSize,
        });

        // Index the confirmed on-chain order via backend API
        const indexed = await apiClient.placeOrder({
          userAddress: wallet.address,
          marketId: market.id,
          outcome,
          direction: 'BUY',
          orderType,
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
        "flex flex-col h-full overflow-y-auto p-4 transition-all duration-300",
        pulseEffect && "ring-2 ring-brand-cyan/60 bg-brand-cyan/[0.03]"
      )}
    >
      {/* Cockpit Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/40 mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <AdjustmentsHorizontalIcon className="w-4 h-4 text-brand-cyan" />
          <span className="text-xs font-bold text-foreground tracking-wider uppercase">
            Trader Cockpit
          </span>
          <Badge
            variant="outline"
            className="text-[9px] font-mono px-1.5 py-0 border-brand-cyan/30 text-brand-cyan bg-brand-cyan/10"
          >
            CLOB Order Ticket
          </Badge>
        </div>

        {/* Execution Mode Badge */}
        {activeSession?.isActive ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono text-emerald-400">
            <BoltIcon className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>0-Gas Session Key</span>
          </div>
        ) : wallet.isConnected ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-mono text-amber-400">
            <ShieldCheckIcon className="w-3 h-3 text-amber-400" />
            <span>MetaMask Wallet</span>
          </div>
        ) : (
          <span className="text-[10px] font-mono text-muted-foreground">Wallet Required</span>
        )}
      </div>

      {/* Outcome Switcher: BUY YES vs BUY NO */}
      <div className="grid grid-cols-2 gap-2 mb-3 flex-shrink-0">
        <button
          type="button"
          onClick={() => {
            setOutcome('YES');
            setIsManualPrice(false);
          }}
          className={cn(
            "flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all cursor-pointer font-mono",
            isYes
              ? "bg-emerald-500/15 border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.15)] text-emerald-400"
              : "bg-secondary/30 border-border/40 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          )}
        >
          <span className="text-xs font-bold tracking-wider">BUY YES</span>
          <span className="text-[11px] mt-0.5 opacity-80">
            Ask: ${currentBestAsk.toFixed(2)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setOutcome('NO');
            setIsManualPrice(false);
          }}
          className={cn(
            "flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all cursor-pointer font-mono",
            !isYes
              ? "bg-rose-500/15 border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.15)] text-rose-400"
              : "bg-secondary/30 border-border/40 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          )}
        >
          <span className="text-xs font-bold tracking-wider">BUY NO</span>
          <span className="text-[11px] mt-0.5 opacity-80">
            Ask: ${(1.0 - currentBestBid).toFixed(2)}
          </span>
        </button>
      </div>

      {/* Order Type Segment: LIMIT vs MARKET IOC */}
      <div className="flex items-center justify-between p-1 bg-secondary/30 rounded-lg border border-border/40 mb-3 text-xs font-mono flex-shrink-0">
        <button
          type="button"
          onClick={() => setOrderType('LIMIT')}
          className={cn(
            "flex-1 py-1 text-center rounded-md font-semibold transition-colors cursor-pointer text-[11px]",
            orderType === 'LIMIT'
              ? "bg-secondary text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          LIMIT (Rest on Book)
        </button>
        <button
          type="button"
          onClick={() => setOrderType('IOC')}
          className={cn(
            "flex-1 py-1 text-center rounded-md font-semibold transition-colors cursor-pointer text-[11px]",
            orderType === 'IOC'
              ? "bg-secondary text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          MARKET (Immediate IOC)
        </button>
      </div>

      {/* Price Input Controls */}
      <div className="mb-3.5 flex-shrink-0">
        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground mb-1.5">
          <span>{orderType === 'LIMIT' ? 'LIMIT PRICE (USDC)' : 'CROSSING FILL PRICE (USDC)'}</span>
          <span className="text-[10px]">
            Prob: {(price * 100).toFixed(0)}%
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {orderType === 'LIMIT' && (
            <button
              type="button"
              onClick={() => handlePriceStep(-0.01)}
              className="p-2 rounded-lg bg-secondary/50 border border-border/40 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Decrease tick by $0.01"
            >
              <MinusIcon className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-xs">
              $
            </span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="0.99"
              disabled={orderType === 'IOC'}
              value={price}
              onChange={(e) => {
                setIsManualPrice(true);
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) setPrice(val);
              }}
              className={cn(
                "w-full pl-7 pr-3 py-2 bg-secondary/40 border border-border/60 rounded-lg text-sm font-mono text-foreground focus:outline-none focus:border-brand-cyan transition-all",
                orderType === 'IOC' && "opacity-80 cursor-not-allowed bg-secondary/20"
              )}
            />
          </div>

          {orderType === 'LIMIT' && (
            <button
              type="button"
              onClick={() => handlePriceStep(0.01)}
              className="p-2 rounded-lg bg-secondary/50 border border-border/40 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Increase tick by $0.01"
            >
              <PlusIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick Price Buttons */}
        {orderType === 'LIMIT' && (
          <div className="flex items-center gap-1.5 mt-2">
            <button
              type="button"
              onClick={() => {
                setIsManualPrice(true);
                setPrice(currentBestBid);
              }}
              className="flex-1 py-1 rounded bg-secondary/30 border border-border/30 hover:bg-secondary/60 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Bid: ${currentBestBid.toFixed(2)}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsManualPrice(true);
                setPrice(Number(((currentBestBid + currentBestAsk) / 2).toFixed(2)));
              }}
              className="flex-1 py-1 rounded bg-secondary/30 border border-border/30 hover:bg-secondary/60 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Mid: ${(((currentBestBid + currentBestAsk) / 2)).toFixed(2)}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsManualPrice(true);
                setPrice(currentBestAsk);
              }}
              className="flex-1 py-1 rounded bg-secondary/30 border border-border/30 hover:bg-secondary/60 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Ask: ${currentBestAsk.toFixed(2)}
            </button>
          </div>
        )}
      </div>

      {/* Collateral Amount & Quick Presets */}
      <div className="mb-3.5 flex-shrink-0">
        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground mb-1.5">
          <span>COLLATERAL (TestUSDC)</span>
          <span className="text-[10px]">
            Avail: ${userBalance.toFixed(2)}
          </span>
        </div>

        <div className="relative mb-2">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-xs">
            $
          </span>
          <input
            type="number"
            min="1"
            max="1000"
            step="1"
            value={collateralAmount}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) setCollateralAmount(Math.max(1, val));
            }}
            className="w-full pl-7 pr-3 py-2 bg-secondary/40 border border-border/60 rounded-lg text-sm font-mono text-foreground focus:outline-none focus:border-brand-cyan transition-all"
          />
        </div>

        {/* Presets Slider & Buttons */}
        <div className="flex items-center gap-1.5 mb-2">
          {COLLATERAL_PRESETS.map((preset) => (
            <button
              key={`preset-${preset}`}
              type="button"
              onClick={() => setCollateralAmount(preset)}
              className={cn(
                "flex-1 py-1 rounded-md text-[11px] font-mono transition-colors border cursor-pointer",
                collateralAmount === preset
                  ? "bg-brand-cyan/15 text-brand-cyan border-brand-cyan/40 font-bold"
                  : "bg-secondary/30 text-muted-foreground border-border/30 hover:text-foreground hover:bg-secondary/60"
              )}
            >
              ${preset}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCollateralAmount(userBalance > 0 ? Math.min(100, Math.floor(userBalance)) : 25)}
            className="py-1 px-2.5 rounded-md text-[11px] font-mono bg-secondary/30 text-muted-foreground border border-border/30 hover:text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
          >
            MAX
          </button>
        </div>

        {/* Collateral Range Slider */}
        <input
          type="range"
          min="1"
          max="100"
          step="1"
          value={Math.min(100, collateralAmount)}
          onChange={(e) => setCollateralAmount(parseInt(e.target.value, 10))}
          className="w-full h-1 bg-secondary/60 rounded-lg appearance-none cursor-pointer accent-brand-cyan"
        />
      </div>

      {/* Calculated Payout & Profit Metrics Box */}
      <div className="p-3 rounded-xl bg-secondary/20 border border-border/40 font-mono text-xs mb-3 flex-shrink-0 space-y-1.5">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Shares (Lots):</span>
          <span className="font-bold text-foreground">{calculations.lotSize.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Total Capital:</span>
          <span className="font-bold text-foreground">${calculations.totalCost.toFixed(2)} USDC</span>
        </div>
        <div className="flex items-center justify-between border-t border-border/30 pt-1.5">
          <span className="text-muted-foreground">Win Payout ($1/lot):</span>
          <span className="font-bold text-emerald-400">${calculations.grossPayout.toFixed(2)} USDC</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Est. Net Profit:</span>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-emerald-400">+${calculations.netProfit.toFixed(2)}</span>
            <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-500/40 text-emerald-400 bg-emerald-500/10 font-bold">
              +{calculations.rocPercent}% ROC
            </Badge>
          </div>
        </div>
      </div>

      {/* Swarm Copilot Live Signal Badges */}
      <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/40 mb-3.5 flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-muted-foreground uppercase font-bold flex items-center gap-1">
            <SparklesIcon className="w-3.5 h-3.5 text-brand-cyan" />
            Swarm Copilot Live Guidance
          </span>
          <span className="text-[9px] font-mono text-muted-foreground">Real-time</span>
        </div>

        {/* Volt Badge */}
        <div className="flex items-center justify-between text-xs font-mono p-1.5 rounded-lg bg-background/50 border border-border/30">
          <div className="flex items-center gap-1.5 truncate max-w-[210px]">
            <BoltIcon className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span className="text-[10px] text-muted-foreground truncate" title={copilotSignals.volt.summary}>
              Volt: {copilotSignals.volt.summary}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleAdoptSignal(copilotSignals.volt.recommended as 'YES' | 'NO')}
            className="text-[9px] px-1.5 py-0.5 rounded border border-brand-cyan/30 text-brand-cyan hover:bg-brand-cyan/10 transition-colors cursor-pointer flex-shrink-0"
          >
            Follow {copilotSignals.volt.recommended}
          </button>
        </div>

        {/* Oracle Badge */}
        <div className="flex items-center justify-between text-xs font-mono p-1.5 rounded-lg bg-background/50 border border-border/30">
          <div className="flex items-center gap-1.5 truncate max-w-[210px]">
            <CurrencyDollarIcon className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
            <span className="text-[10px] text-muted-foreground truncate" title={copilotSignals.oracle.summary}>
              Oracle: {copilotSignals.oracle.summary}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleAdoptSignal(copilotSignals.oracle.recommended as 'YES' | 'NO')}
            className="text-[9px] px-1.5 py-0.5 rounded border border-brand-cyan/30 text-brand-cyan hover:bg-brand-cyan/10 transition-colors cursor-pointer flex-shrink-0"
          >
            Follow {copilotSignals.oracle.recommended}
          </button>
        </div>
      </div>

      {/* Execution Error Banner */}
      {executionError && (
        <div className="p-2.5 mb-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono flex items-start gap-2 flex-shrink-0">
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="leading-snug">{executionError}</span>
        </div>
      )}

      {/* Successful Execution Confirmation Banner */}
      {lastExecutedOrder && (
        <div className="p-2.5 mb-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex flex-col gap-1 flex-shrink-0 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 font-bold">
              <CheckCircleIcon className="w-4 h-4" />
              Order Executed on Somnia CLOB!
            </span>
            <span className="text-[10px] text-muted-foreground">Instant Fill</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Bought {lastExecutedOrder.lotSize} {lastExecutedOrder.outcome} @ ${lastExecutedOrder.price.toFixed(2)} (${lastExecutedOrder.totalCost.toFixed(2)} USDC)
          </div>
          {lastExecutedOrder.txHash && (
            <a
              href={`https://shannon-explorer.somnia.network/tx/${lastExecutedOrder.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-brand-cyan hover:underline flex items-center gap-1 mt-0.5"
            >
              <span>View on Somnia Explorer</span>
              <ArrowTopRightOnSquareIcon className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {/* Main Order Action Button */}
      <div className="mt-auto pt-2 flex flex-col gap-2 flex-shrink-0">
        {!wallet.isConnected ? (
          <button
            type="button"
            onClick={onConnectWallet}
            className="w-full py-3 rounded-xl bg-brand-cyan text-background font-bold text-xs uppercase tracking-wider hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-2"
          >
            Connect Wallet to Trade
          </button>
        ) : (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleExecuteOrder}
            className={cn(
              "w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed",
              isYes
                ? "bg-emerald-500 hover:bg-emerald-400 text-background shadow-emerald-500/20"
                : "bg-rose-500 hover:bg-rose-400 text-background shadow-rose-500/20"
            )}
          >
            {isSubmitting ? (
              <>
                <Spinner size="sm" />
                <span>Routing to Somnia CLOB...</span>
              </>
            ) : (
              <>
                {activeSession?.isActive && <BoltIcon className="w-4 h-4" />}
                <span>
                  {activeSession?.isActive ? 'Place Zero-Gas Order' : 'Sign & Place with Wallet'} • ${calculations.totalCost.toFixed(2)}
                </span>
              </>
            )}
          </button>
        )}

        {/* 1-Click Zero-Gas Session Promo for non-session users */}
        {wallet.isConnected && !activeSession?.isActive && onOpenSessionModal && (
          <button
            type="button"
            onClick={onOpenSessionModal}
            className="w-full py-1.5 px-2 rounded-lg bg-brand-cyan/10 hover:bg-brand-cyan/20 border border-brand-cyan/30 text-brand-cyan text-[10px] font-mono transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <BoltIcon className="w-3 h-3 text-brand-cyan" />
            <span>Enable 1-Click Zero-Gas Trading (Sub-Second Execution)</span>
          </button>
        )}
      </div>
    </div>
  );
};
