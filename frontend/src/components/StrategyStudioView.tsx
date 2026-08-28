import React, { useState, useEffect } from 'react';
import {
  SparklesIcon,
  BoltIcon,
  AdjustmentsHorizontalIcon,
  PlayIcon,
  ArrowUpRightIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
  ShieldCheckIcon,
  CubeIcon,
  InformationCircleIcon,
  RocketLaunchIcon,
  PauseIcon,
  DocumentCheckIcon,
  PencilSquareIcon,
  CheckIcon,
  XMarkIcon,
  BanknotesIcon,
  SignalIcon,
  CpuChipIcon,
  KeyIcon,
} from '@heroicons/react/24/outline';
import type {
  CustomAgentDefinition,
  CustomAgentRules,
  ConditionRule,
  IndicatorType,
  ComparisonOperator,
  BinaryActionDirection,
  SessionGrant,
} from '../types/index.js';
import type { WalletState } from '../hooks/useSessionKey.js';
import { useCustomAgents } from '../hooks/useCustomAgents.js';
import { apiClient } from '../services/api.js';
import { Badge } from './ui/badge.js';
import { Spinner } from './ui/Spinner.js';
import { cn } from '../lib/utils.js';

export interface StrategyStudioViewProps {
  wallet?: WalletState;
  activeSession?: SessionGrant | null;
  onOpenSessionModal?: () => void;
  onConnectWallet?: () => Promise<void>;
  onNavigateToBacktester?: (agentId?: string, customDraft?: Partial<CustomAgentDefinition>) => void;
}

const INDICATOR_OPTIONS: Array<{ value: IndicatorType; label: string; desc: string }> = [
  { value: 'RSI', label: 'Relative Strength Index (RSI)', desc: 'Identifies overbought (>70) and oversold (<30) momentum zones' },
  { value: 'BOLLINGER_LOWER', label: 'Bollinger Band Lower Band', desc: 'Detects downward price puncture and mean-reversion discount bounces' },
  { value: 'BOLLINGER_UPPER', label: 'Bollinger Band Upper Band', desc: 'Detects upward volatility exhaustion and overhead resistance fades' },
  { value: 'EMA', label: 'Exponential Moving Average (EMA)', desc: 'Trend-following directional bias and dynamic momentum cross' },
  { value: 'SMA', label: 'Simple Moving Average (SMA)', desc: 'Smooth baseline price trend filter' },
  { value: 'PRICE_DRIFT', label: 'Rapid Price Velocity Drift', desc: 'High-frequency spot price displacement within the active contract window' },
];

const OPERATOR_OPTIONS: Array<{ value: ComparisonOperator; label: string }> = [
  { value: 'LESS_THAN', label: '< Less Than' },
  { value: 'GREATER_THAN', label: '> Greater Than' },
  { value: 'CROSS_ABOVE', label: '↑ Crosses Above' },
  { value: 'CROSS_BELOW', label: '↓ Crosses Below' },
];

const SUGGESTED_PROMPTS = [
  'Aggressive BTC 60s Call sniper when RSI drops below 25 after a sharp dip',
  'Contrarian ETH 5m Put fade when price punctures upper Bollinger band and RSI > 72',
  'Fast SOL 5m Call rider on 9/21 EMA golden cross with rising velocity',
  'Conservative BTC 15m Call mean-reversion when RSI is oversold and payout >= 80%',
];

export const StrategyStudioView: React.FC<StrategyStudioViewProps> = ({
  wallet = {
    isConnected: false,
    address: null,
    chainId: null,
    isCorrectNetwork: false,
    balanceSTT: '0',
    balanceCollateral: '0',
  },
  activeSession = null,
  onOpenSessionModal,
  onConnectWallet: _onConnectWallet,
  onNavigateToBacktester,
}) => {
  const {
    agents,
    isSaving,
    isGenerating,
    createAgent,
    deleteAgent,
    deployAgent,
    pauseAgent,
    setAgentAllowance,
    generateFromPrompt,
  } = useCustomAgents(wallet.address || undefined);

  const [activeTab, setActiveTab] = useState<'BUILDER' | 'LIBRARY'>('BUILDER');

  // AI Prompt Omnibar State
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [aiStatusMsg, setAiStatusMsg] = useState<string | null>(null);

  // Strategy Builder Working Draft
  const [draftName, setDraftName] = useState<string>('My Custom Alpha Sniper');
  const [draftDesc, setDraftDesc] = useState<string>('Autonomous binary options strategy built with zero code');
  const [draftSymbol, setDraftSymbol] = useState<string>('BTC/USD');
  const [draftTimeframe, setDraftTimeframe] = useState<'1m' | '5m' | '15m' | '1h'>('5m');
  const [draftColor, setDraftColor] = useState<string>('#2dd4bf');
  const [draftOperator, setDraftOperator] = useState<'AND' | 'OR'>('AND');
  const [draftAllowance, setDraftAllowance] = useState<number>(100);

  const [conditions, setConditions] = useState<ConditionRule[]>([
    {
      id: 'c-init-1',
      indicator: 'RSI',
      period: 14,
      operator: 'LESS_THAN',
      value: 28,
    },
    {
      id: 'c-init-2',
      indicator: 'BOLLINGER_LOWER',
      period: 20,
      stdDev: 2.0,
      operator: 'LESS_THAN',
      value: 0,
    },
  ]);

  const [actionDirection, setActionDirection] = useState<BinaryActionDirection>('CALL');
  const [actionDurationSec, setActionDurationSec] = useState<number>(60);
  const [actionStakeAmount, setActionStakeAmount] = useState<number>(10);

  const [riskMaxLosses, setRiskMaxLosses] = useState<number>(2);
  const [riskCooldownMins, setRiskCooldownMins] = useState<number>(3);
  const [riskMinPayoutPct, setRiskMinPayoutPct] = useState<number>(78);

  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Library inline allowance and deployment action state
  const [editingAllowanceId, setEditingAllowanceId] = useState<string | null>(null);
  const [tempAllowanceVal, setTempAllowanceVal] = useState<number>(100);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Mark studio visited for quest progress
  useEffect(() => {
    try {
      localStorage.setItem('dreampulse_studio_visited_v1', 'true');
    } catch {
      // ignore
    }
  }, []);

  // Add condition
  const handleAddCondition = () => {
    const newCond: ConditionRule = {
      id: `c-${Date.now()}`,
      indicator: 'RSI',
      period: 14,
      operator: 'LESS_THAN',
      value: 30,
    };
    setConditions((prev) => [...prev, newCond]);
  };

  // Remove condition
  const handleRemoveCondition = (id: string) => {
    setConditions((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev));
  };

  // Update condition
  const handleUpdateCondition = (id: string, updates: Partial<ConditionRule>) => {
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  // AI Prompt submission
  const handleGeneratePrompt = async () => {
    if (!aiPrompt.trim()) return;
    setAiStatusMsg('Synthesizing strategy with AI architect...');
    const result = await generateFromPrompt(aiPrompt.trim());
    if (result) {
      if (result.name) setDraftName(result.name);
      if (result.description) setDraftDesc(result.description);
      if (result.symbol) setDraftSymbol(result.symbol);
      if (result.timeframe) setDraftTimeframe(result.timeframe as any);
      if (result.color) setDraftColor(result.color);
      if (result.rules) {
        if (result.rules.operator) setDraftOperator(result.rules.operator);
        if (Array.isArray(result.rules.conditions) && result.rules.conditions.length > 0) {
          setConditions(
            result.rules.conditions.map((c, i) => ({
              id: `gen-${i}-${Date.now()}`,
              indicator: c.indicator || 'RSI',
              period: c.period || 14,
              secondaryPeriod: c.secondaryPeriod,
              stdDev: c.stdDev,
              operator: c.operator || 'LESS_THAN',
              value: c.value ?? 30,
            }))
          );
        }
        if (result.rules.action) {
          if (result.rules.action.direction) setActionDirection(result.rules.action.direction);
          if (result.rules.action.durationSec) setActionDurationSec(result.rules.action.durationSec);
          if (result.rules.action.stakeAmount) setActionStakeAmount(result.rules.action.stakeAmount);
        }
        if (result.rules.risk) {
          if (result.rules.risk.maxConsecutiveLosses) setRiskMaxLosses(result.rules.risk.maxConsecutiveLosses);
          if (result.rules.risk.cooldownMinutes) setRiskCooldownMins(result.rules.risk.cooldownMinutes);
          if (result.rules.risk.minPoolPayoutPct) setRiskMinPayoutPct(result.rules.risk.minPoolPayoutPct);
        }
      }
      setAiStatusMsg('Strategy generated! Capsules updated below.');
      setTimeout(() => setAiStatusMsg(null), 4000);
    } else {
      setAiStatusMsg('Could not synthesize strategy. Please try rephrasing.');
      setTimeout(() => setAiStatusMsg(null), 4000);
    }
  };

  // Construct current working draft object
  const getCurrentDraft = (): Partial<CustomAgentDefinition> => ({
    name: draftName,
    description: draftDesc,
    symbol: draftSymbol,
    timeframe: draftTimeframe,
    strategyType: actionDirection === 'CALL' ? 'MOMENTUM' : 'MEAN_REVERSION',
    rules: {
      operator: draftOperator,
      conditions,
      action: {
        direction: actionDirection,
        durationSec: actionDurationSec,
        stakeType: 'FIXED',
        stakeAmount: actionStakeAmount,
      },
      risk: {
        maxConsecutiveLosses: riskMaxLosses,
        cooldownMinutes: riskCooldownMins,
        minPoolPayoutPct: riskMinPayoutPct,
      },
    },
    color: draftColor,
  });

  // Save current draft with optional immediate deployment
  const handleSaveStrategy = async (deployNow: boolean = false) => {
    setSaveSuccessMsg(null);
    const rules: CustomAgentRules = {
      operator: draftOperator,
      conditions,
      action: {
        direction: actionDirection,
        durationSec: actionDurationSec,
        stakeType: 'FIXED',
        stakeAmount: actionStakeAmount,
      },
      risk: {
        maxConsecutiveLosses: riskMaxLosses,
        cooldownMinutes: riskCooldownMins,
        minPoolPayoutPct: riskMinPayoutPct,
      },
    };

    const res = await createAgent({
      name: draftName,
      description: draftDesc,
      symbol: draftSymbol,
      timeframe: draftTimeframe,
      strategyType: actionDirection === 'CALL' ? 'MOMENTUM' : 'MEAN_REVERSION',
      rules,
      color: draftColor,
      icon: actionDirection === 'CALL' ? 'BoltIcon' : 'AdjustmentsHorizontalIcon',
      isDeployed: deployNow,
      allocatedAllowance: draftAllowance,
    });

    if (res) {
      try {
        localStorage.setItem('dreampulse_studio_created_v1', 'true');
        localStorage.setItem('dreampulse_studio_visited_v1', 'true');
      } catch {
        // ignore
      }
      setSaveSuccessMsg(
        deployNow
          ? `Strategy deployed with $${draftAllowance.toFixed(2)} tUSDC allowance! Running autonomously in isolated mode.`
          : 'Strategy saved to your library!'
      );
      if (deployNow && (!activeSession || !activeSession.isActive)) {
        onOpenSessionModal?.();
      }
      setTimeout(() => setSaveSuccessMsg(null), 4000);
      if (deployNow) {
        setActiveTab('LIBRARY');
      }
    }
  };

  // Load an existing agent into the builder
  const handleLoadAgent = (agent: CustomAgentDefinition) => {
    setDraftName(agent.name);
    setDraftDesc(agent.description || '');
    setDraftSymbol(agent.symbol);
    setDraftTimeframe(agent.timeframe as any);
    setDraftColor(agent.color || '#2dd4bf');
    setDraftAllowance(agent.allocatedAllowance || 100);
    if (agent.rules) {
      setDraftOperator(agent.rules.operator || 'AND');
      if (agent.rules.conditions) setConditions(agent.rules.conditions);
      if (agent.rules.action) {
        setActionDirection(agent.rules.action.direction || 'CALL');
        setActionDurationSec(agent.rules.action.durationSec || 60);
        setActionStakeAmount(agent.rules.action.stakeAmount || 10);
      }
      if (agent.rules.risk) {
        setRiskMaxLosses(agent.rules.risk.maxConsecutiveLosses || 2);
        setRiskCooldownMins(agent.rules.risk.cooldownMinutes || 3);
        setRiskMinPayoutPct(agent.rules.risk.minPoolPayoutPct || 78);
      }
    }
    setActiveTab('BUILDER');
  };

  // 1-Click Deploy / Pause handler for library cards
  const handleToggleDeploy = async (agent: CustomAgentDefinition) => {
    if (!agent.isDeployed && (!activeSession || !activeSession.isActive)) {
      onOpenSessionModal?.();
      return;
    }
    setActionLoadingId(agent.id);
    try {
      if (agent.isDeployed) {
        await pauseAgent(agent.id);
      } else {
        await deployAgent(agent.id, agent.allocatedAllowance || 100);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  // Save modified allowance for a specific agent in library
  const handleSaveAllowance = async (agentId: string) => {
    if (tempAllowanceVal <= 0) return;
    setActionLoadingId(agentId);
    try {
      await setAgentAllowance(agentId, tempAllowanceVal);
      setEditingAllowanceId(null);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Live quantitative backtest metrics from real historical market candles
  const [liveMetrics, setLiveMetrics] = useState<{
    winRate: number;
    trades: number;
    pnl: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
    isSimulating: boolean;
    error: string | null;
  }>({
    winRate: 0,
    trades: 0,
    pnl: 0,
    profitFactor: 0,
    sharpeRatio: 0,
    maxDrawdown: 0,
    isSimulating: false,
    error: null,
  });

  // Debounced real-time simulation against real market candles
  useEffect(() => {
    let isMounted = true;
    setLiveMetrics((prev) => ({ ...prev, isSimulating: true }));

    const timer = setTimeout(async () => {
      try {
        const payload = {
          agentType: 'custom',
          symbol: draftSymbol,
          timeframe: draftTimeframe,
          period: '24h' as const,
          initialCapital: 1000,
          customRules: {
            operator: draftOperator,
            conditions,
            action: {
              direction: actionDirection,
              durationSec: actionDurationSec,
              stakeType: 'FIXED' as const,
              stakeAmount: actionStakeAmount,
            },
            risk: {
              maxConsecutiveLosses: riskMaxLosses,
              cooldownMinutes: riskCooldownMins,
              minPoolPayoutPct: riskMinPayoutPct,
            },
          },
        };

        const res = await apiClient.runBacktest(payload);
        if (!isMounted) return;

        if (res?.success && res.result) {
          setLiveMetrics({
            winRate: Number(res.result.winRate || 0),
            trades: Number(res.result.totalTrades || 0),
            pnl: Number(res.result.netPnl || 0),
            profitFactor: Number(res.result.profitFactor || 0),
            sharpeRatio: Number(res.result.sharpeRatio || 0),
            maxDrawdown: Number(res.result.maxDrawdown || 0),
            isSimulating: false,
            error: null,
          });
        } else {
          setLiveMetrics((prev) => ({ ...prev, isSimulating: false }));
        }
      } catch (err: any) {
        if (!isMounted) return;
        setLiveMetrics((prev) => ({
          ...prev,
          isSimulating: false,
          error: err.message || 'Simulation error',
        }));
      }
    }, 450);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [
    draftSymbol,
    draftTimeframe,
    draftOperator,
    conditions,
    actionDirection,
    actionDurationSec,
    actionStakeAmount,
    riskMaxLosses,
    riskCooldownMins,
    riskMinPayoutPct,
  ]);

  return (
    <div className="flex flex-col gap-4 pb-12">
      {/* ----------------- Top Header ----------------- */}
      <div className="terminal-panel p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl grid place-items-center bg-primary/10 border border-primary/30 text-primary flex-shrink-0 shadow-sm">
            <SparklesIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-bold tracking-tight text-foreground">Strategy Studio</h1>
              <Badge variant="outline" className="text-[10px] font-mono border-primary/40 text-primary bg-primary/10">
                Visual No-Code Builder
              </Badge>
              <Badge variant="outline" className="text-[10px] font-mono border-border text-muted-foreground">
                Somnia Shannon Testnet
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Design, deploy, and assign dedicated tUSDC bankroll allowances to autonomous binary options trading agents.
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary/30 border border-border/50">
          <button
            type="button"
            onClick={() => setActiveTab('BUILDER')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
              activeTab === 'BUILDER' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <BoltIcon className="w-3.5 h-3.5" />
            <span>Agent Studio</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('LIBRARY')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
              activeTab === 'LIBRARY' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <CubeIcon className="w-3.5 h-3.5" />
            <span>Strategy Library ({agents.length})</span>
          </button>
        </div>
      </div>

      {/* Autonomous Execution Context Banner */}
      <div className="terminal-panel p-3.5 bg-gradient-to-r from-purple-500/10 via-secondary/20 to-background border-purple-500/30 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg grid place-items-center bg-purple-500/20 text-purple-300 border border-purple-500/30 flex-shrink-0">
            <CpuChipIcon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-foreground">Isolated Autonomous Execution</span>
              <Badge variant="outline" className="text-[9px] font-mono border-purple-500/40 text-purple-300 bg-purple-500/10 font-semibold">
                Independent of Swarm Copy-Trade
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Custom agents trade autonomously within their dedicated bankroll allowance using your session key. Protocol Swarm Mirroring is NOT required.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeSession && activeSession.isActive ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-mono font-bold">
              <ShieldCheckIcon className="w-3.5 h-3.5" />
              <span>Session Key Active</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenSessionModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all cursor-pointer shadow-sm"
            >
              <KeyIcon className="w-3.5 h-3.5" />
              <span>Authorize Session Key to Deploy</span>
            </button>
          )}
        </div>
      </div>

      {/* ----------------- TAB 1: AGENT STUDIO ----------------- */}
      {activeTab === 'BUILDER' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left 2 Cols: The Sentence & Capsule Builder */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* 1. AI Prompt-to-Strategy Omnibar */}
            <div className="terminal-panel p-4 bg-gradient-to-r from-primary/5 via-secondary/20 to-background border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <SparklesIcon className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold tracking-tight text-foreground uppercase font-mono">
                  Gemini Prompt-to-Strategy Co-Pilot
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGeneratePrompt()}
                  placeholder="Describe your strategy in plain English (e.g. 'Aggressive BTC 60s Call sniper when RSI < 25 on dip')..."
                  className="flex-1 px-3.5 py-2 rounded-xl bg-background/80 border border-border/60 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-all font-sans"
                />
                <button
                  type="button"
                  onClick={handleGeneratePrompt}
                  disabled={isGenerating || !aiPrompt.trim()}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1.5 transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {isGenerating ? <Spinner size="xs" /> : <SparklesIcon className="w-3.5 h-3.5" />}
                  <span>{isGenerating ? 'Synthesizing…' : 'Generate'}</span>
                </button>
              </div>

              {aiStatusMsg && (
                <div className="text-[11px] font-mono text-primary mt-2 flex items-center gap-1">
                  <InformationCircleIcon className="w-3.5 h-3.5" />
                  <span>{aiStatusMsg}</span>
                </div>
              )}

              {/* Prompt Suggestion Chips */}
              <div className="flex items-center gap-1.5 flex-wrap mt-3">
                <span className="text-[10px] font-mono text-muted-foreground uppercase mr-1">Try:</span>
                {SUGGESTED_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setAiPrompt(prompt);
                    }}
                    className="text-[10px] font-mono px-2 py-1 rounded-lg bg-secondary/40 hover:bg-secondary/70 border border-border/40 text-muted-foreground hover:text-foreground transition-colors text-left"
                  >
                    {prompt.length > 42 ? `${prompt.slice(0, 42)}…` : prompt}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. The Interactive Strategy Sentence Canvas */}
            <div className="terminal-panel p-5 flex flex-col gap-5 border-border/60">
              {/* Draft Identity Bar */}
              <div className="flex items-center justify-between gap-3 border-b border-border/30 pb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="text-sm font-bold bg-transparent border-b border-transparent hover:border-border/60 focus:border-primary focus:outline-none text-foreground tracking-tight px-1 py-0.5"
                  />
                  <input
                    type="color"
                    value={draftColor}
                    onChange={(e) => setDraftColor(e.target.value)}
                    className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                    title="Agent accent color"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono font-bold" style={{ borderColor: draftColor, color: draftColor }}>
                    {actionDirection === 'CALL' ? 'BULLISH CALL' : 'BEARISH PUT'}
                  </Badge>
                  <span className="text-[11px] font-mono text-muted-foreground">{draftSymbol} · {draftTimeframe}</span>
                </div>
              </div>

              {/* SENTENCE SECTION 1: WHEN / MARKET DISCOVERY */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-primary/10 border border-primary/30 text-primary grid place-items-center text-[10px]">1</span>
                  Market & Timeframe Peg
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-bold text-muted-foreground">[ WHEN ] Market is</span>
                  <select
                    value={draftSymbol}
                    onChange={(e) => setDraftSymbol(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-secondary/30 border border-border/60 text-xs font-bold text-foreground font-mono focus:outline-none focus:border-primary"
                  >
                    <option value="BTC/USD">BTC/USD (Bitcoin)</option>
                    <option value="ETH/USD">ETH/USD (Ethereum)</option>
                    <option value="SOL/USD">SOL/USD (Solana)</option>
                    <option value="BNB/USD">BNB/USD (BNB Chain)</option>
                    <option value="DOGE/USD">DOGE/USD (Dogecoin)</option>
                  </select>
                  <span className="text-xs font-mono font-bold text-muted-foreground">on</span>
                  <select
                    value={draftTimeframe}
                    onChange={(e) => setDraftTimeframe(e.target.value as any)}
                    className="px-3 py-1.5 rounded-lg bg-secondary/30 border border-border/60 text-xs font-bold text-foreground font-mono focus:outline-none focus:border-primary"
                  >
                    <option value="1m">1-Minute Candles</option>
                    <option value="5m">5-Minute Candles</option>
                    <option value="15m">15-Minute Candles</option>
                    <option value="1h">1-Hour Candles</option>
                  </select>
                </div>
              </div>

              {/* SENTENCE SECTION 2: TRIGGER CONDITIONS DECK */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-md bg-primary/10 border border-primary/30 text-primary grid place-items-center text-[10px]">2</span>
                    Indicator Trigger Capsules
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-muted-foreground">Logic Gate:</span>
                    <button
                      type="button"
                      onClick={() => setDraftOperator(draftOperator === 'AND' ? 'OR' : 'AND')}
                      className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-primary/40 text-primary bg-primary/10 hover:bg-primary/20 transition-all"
                    >
                      {draftOperator === 'AND' ? 'ALL Must Agree (AND)' : 'ANY May Trigger (OR)'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5">
                  {conditions.map((cond, idx) => {
                    return (
                      <div
                        key={cond.id}
                        className="p-3 rounded-xl border border-border/50 bg-secondary/15 flex items-center justify-between gap-3 flex-wrap transition-all hover:border-border"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-mono font-bold text-muted-foreground">
                            {idx === 0 ? '[ IF ]' : `[ ${draftOperator} ]`}
                          </span>

                          {/* Indicator Selector */}
                          <select
                            value={cond.indicator}
                            onChange={(e) => handleUpdateCondition(cond.id, { indicator: e.target.value as IndicatorType })}
                            className="px-2.5 py-1 rounded-lg bg-background border border-border/60 text-xs font-bold text-foreground font-mono focus:outline-none focus:border-primary"
                          >
                            {INDICATOR_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>

                          {/* Period / Secondary Period / StdDev modifiers */}
                          {cond.indicator === 'EMA' && (cond.operator === 'CROSS_ABOVE' || cond.operator === 'CROSS_BELOW') ? (
                            <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
                              <span>Fast:</span>
                              <input
                                type="number"
                                min={2}
                                max={100}
                                value={cond.period || 9}
                                onChange={(e) => handleUpdateCondition(cond.id, { period: Number(e.target.value) })}
                                className="w-11 px-1.5 py-0.5 rounded bg-background border border-border/60 text-xs text-foreground font-mono"
                              />
                              <span className="ml-1">Slow:</span>
                              <input
                                type="number"
                                min={3}
                                max={200}
                                value={cond.secondaryPeriod || 21}
                                onChange={(e) => handleUpdateCondition(cond.id, { secondaryPeriod: Number(e.target.value) })}
                                className="w-11 px-1.5 py-0.5 rounded bg-background border border-border/60 text-xs text-foreground font-mono"
                              />
                            </div>
                          ) : (cond.indicator === 'BOLLINGER_LOWER' || cond.indicator === 'BOLLINGER_UPPER') ? (
                            <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
                              <span>period</span>
                              <input
                                type="number"
                                min={2}
                                max={100}
                                value={cond.period || 20}
                                onChange={(e) => handleUpdateCondition(cond.id, { period: Number(e.target.value) })}
                                className="w-11 px-1.5 py-0.5 rounded bg-background border border-border/60 text-xs text-foreground font-mono"
                              />
                              <span className="ml-1">stdDev</span>
                              <input
                                type="number"
                                min={0.5}
                                max={5.0}
                                step={0.5}
                                value={cond.stdDev ?? 2.0}
                                onChange={(e) => handleUpdateCondition(cond.id, { stdDev: Number(e.target.value) })}
                                className="w-11 px-1.5 py-0.5 rounded bg-background border border-border/60 text-xs text-foreground font-mono"
                              />
                            </div>
                          ) : cond.indicator !== 'PRICE_DRIFT' ? (
                            <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
                              <span>period</span>
                              <input
                                type="number"
                                min={2}
                                max={100}
                                value={cond.period || 14}
                                onChange={(e) => handleUpdateCondition(cond.id, { period: Number(e.target.value) })}
                                className="w-12 px-1.5 py-0.5 rounded bg-background border border-border/60 text-xs text-foreground font-mono"
                              />
                            </div>
                          ) : null}

                          {/* Operator */}
                          <select
                            value={cond.operator}
                            onChange={(e) => handleUpdateCondition(cond.id, { operator: e.target.value as ComparisonOperator })}
                            className="px-2.5 py-1 rounded-lg bg-background border border-border/60 text-xs font-bold text-foreground font-mono focus:outline-none focus:border-primary"
                          >
                            {OPERATOR_OPTIONS.map((op) => (
                              <option key={op.value} value={op.value}>
                                {op.label}
                              </option>
                            ))}
                          </select>

                          {/* Threshold Value or Cross Target */}
                          {cond.indicator === 'EMA' && (cond.operator === 'CROSS_ABOVE' || cond.operator === 'CROSS_BELOW') ? (
                            <span className="text-[11px] font-mono text-muted-foreground px-2 py-0.5 rounded bg-background border border-border/50">
                              EMA({cond.secondaryPeriod || 21})
                            </span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step={cond.indicator === 'PRICE_DRIFT' ? 0.0005 : 1}
                                value={cond.value}
                                onChange={(e) => handleUpdateCondition(cond.id, { value: Number(e.target.value) })}
                                className="w-20 px-2 py-1 rounded-lg bg-background border border-border/60 text-xs font-mono font-bold text-foreground focus:outline-none focus:border-primary"
                              />
                              {cond.indicator === 'PRICE_DRIFT' && <span className="text-[10px] font-mono text-muted-foreground">drift</span>}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveCondition(cond.id)}
                          disabled={conditions.length <= 1}
                          className="w-7 h-7 rounded-lg border border-border/50 grid place-items-center text-muted-foreground hover:text-red-400 hover:border-red-400/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Remove condition"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleAddCondition}
                  className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>Add Filter Condition</span>
                </button>
              </div>

              {/* SENTENCE SECTION 3: THEN EXECUTE (BINARY CONTRACT SPEC) */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-primary/10 border border-primary/30 text-primary grid place-items-center text-[10px]">3</span>
                  Binary Action & Expiry
                </span>
                <div className="flex items-center gap-2.5 flex-wrap p-3 rounded-xl bg-secondary/15 border border-border/50">
                  <span className="text-xs font-mono font-bold text-muted-foreground">[ THEN EXECUTE ]</span>

                  {/* Direction button toggle */}
                  <div className="flex items-center rounded-lg border border-border/60 p-0.5 bg-background">
                    <button
                      type="button"
                      onClick={() => setActionDirection('CALL')}
                      className={cn(
                        'px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1',
                        actionDirection === 'CALL' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <ArrowTrendingUpIcon className="w-3.5 h-3.5" />
                      <span>CALL (UP)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActionDirection('PUT')}
                      className={cn(
                        'px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1',
                        actionDirection === 'PUT' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <ArrowTrendingDownIcon className="w-3.5 h-3.5" />
                      <span>PUT (DOWN)</span>
                    </button>
                  </div>

                  {/* Duration / Expiry */}
                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-muted-foreground">Expiry:</span>
                    <select
                      value={actionDurationSec}
                      onChange={(e) => setActionDurationSec(Number(e.target.value))}
                      className="px-2.5 py-1 rounded bg-background border border-border/60 text-xs font-bold text-foreground font-mono focus:outline-none focus:border-primary"
                    >
                      <option value={60}>60 Seconds (Turbo)</option>
                      <option value={300}>5 Minutes</option>
                      <option value={900}>15 Minutes</option>
                      <option value={3600}>1 Hour</option>
                    </select>
                  </div>

                  {/* Stake size */}
                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-muted-foreground">Stake:</span>
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={actionStakeAmount}
                        onChange={(e) => setActionStakeAmount(Number(e.target.value))}
                        className="w-16 px-2 py-1 rounded bg-background border border-border/60 text-xs font-bold text-foreground font-mono"
                      />
                    </div>
                    <span className="text-muted-foreground">tUSDC</span>
                  </div>
                </div>
              </div>

              {/* SENTENCE SECTION 4: RISK LEASH */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-primary/10 border border-primary/30 text-primary grid place-items-center text-[10px]">4</span>
                  Autonomous Risk Leash & Guardrails
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-secondary/15 border border-border/50">
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground block mb-1">Max Consecutive Losses</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={riskMaxLosses}
                      onChange={(e) => setRiskMaxLosses(Number(e.target.value))}
                      className="w-full px-2.5 py-1 rounded-lg bg-background border border-border/60 text-xs font-bold text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground block mb-1">Loss Cooldown (Mins)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={riskCooldownMins}
                      onChange={(e) => setRiskCooldownMins(Number(e.target.value))}
                      className="w-full px-2.5 py-1 rounded-lg bg-background border border-border/60 text-xs font-bold text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground block mb-1">Min Pool Payout (%)</label>
                    <input
                      type="number"
                      min={50}
                      max={95}
                      value={riskMinPayoutPct}
                      onChange={(e) => setRiskMinPayoutPct(Number(e.target.value))}
                      className="w-full px-2.5 py-1 rounded-lg bg-background border border-border/60 text-xs font-bold text-foreground font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* SENTENCE SECTION 5: DEDICATED BANKROLL ALLOWANCE */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 grid place-items-center text-[10px]">5</span>
                    Dedicated tUSDC Bankroll Allowance
                  </span>
                  <span className="text-[11px] font-mono text-emerald-400 font-bold flex items-center gap-1">
                    <BanknotesIcon className="w-3.5 h-3.5" />
                    <span>${draftAllowance.toFixed(2)} tUSDC</span>
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-secondary/15 border border-border/50 flex flex-col gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-muted-foreground font-mono">Quick Preset:</span>
                    {[25, 50, 100, 250, 500].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setDraftAllowance(amt)}
                        className={cn(
                          'px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border transition-all',
                          draftAllowance === amt
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                            : 'bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        ${amt}
                      </button>
                    ))}
                    <div className="flex items-center gap-1 ml-auto">
                      <span className="text-[10px] font-mono text-muted-foreground">Custom:</span>
                      <input
                        type="number"
                        min={5}
                        max={10000}
                        step={5}
                        value={draftAllowance}
                        onChange={(e) => setDraftAllowance(Math.max(1, Number(e.target.value)))}
                        className="w-20 px-2 py-1 rounded bg-background border border-border/60 text-xs font-bold text-foreground font-mono text-right"
                      />
                      <span className="text-[10px] font-mono text-muted-foreground">tUSDC</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono border-t border-border/30 pt-2">
                    <span>Consecutive Trades Funded:</span>
                    <span className="font-bold text-foreground">
                      ~{Math.floor(draftAllowance / Math.max(1, actionStakeAmount))} trades ({actionStakeAmount} tUSDC / trade)
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-border/30 flex-wrap gap-3">
                {saveSuccessMsg ? (
                  <div className="text-xs text-emerald-400 font-mono flex items-center gap-1.5">
                    <CheckCircleIcon className="w-4 h-4" />
                    <span>{saveSuccessMsg}</span>
                  </div>
                ) : (
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Bankroll isolated. Execution parameters validated for Somnia CLOB.
                  </span>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleSaveStrategy(false)}
                    disabled={isSaving}
                    className="px-3.5 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground border border-border/60 text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {isSaving ? <Spinner size="xs" /> : <DocumentCheckIcon className="w-3.5 h-3.5" />}
                    <span>Save Draft</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveStrategy(true)}
                    disabled={isSaving}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50 shadow-sm"
                  >
                    <RocketLaunchIcon className="w-3.5 h-3.5" />
                    <span>Save & Deploy (${draftAllowance} tUSDC)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const draft = getCurrentDraft();
                      if (onNavigateToBacktester) onNavigateToBacktester(undefined, draft);
                      else window.location.hash = '#backtest';
                    }}
                    className="px-3.5 py-2 rounded-xl border border-primary/40 bg-primary/10 text-primary text-xs font-bold flex items-center gap-1.5 hover:bg-primary/20 transition-all"
                  >
                    <PlayIcon className="w-3.5 h-3.5" />
                    <span>Backtest Replay</span>
                    <ArrowUpRightIcon className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Col: Instant Live Ghost Preview & Quick Presets */}
          <div className="flex flex-col gap-4">
            {/* 1. Real-Time Historical Ghost Radar HUD */}
            <div className="terminal-panel p-4 flex flex-col gap-4 border-primary/30 bg-secondary/15">
              <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold tracking-tight text-foreground uppercase font-mono">
                    Instant Ghost Radar
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {liveMetrics.isSimulating ? (
                    <Badge variant="outline" className="text-[9px] font-mono text-amber-400 border-amber-500/40 bg-amber-500/10 flex items-center gap-1">
                      <Spinner size="xs" />
                      <span>Replaying Candles...</span>
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] font-mono text-emerald-400 border-emerald-500/40 bg-emerald-500/10">
                      Real 24h Replay
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/40">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase block">Est. Win Rate</span>
                  <span className={cn(
                    "text-lg font-bold font-mono mt-1 block",
                    liveMetrics.winRate >= 50 ? "text-emerald-400" : "text-amber-400"
                  )}>
                    {liveMetrics.trades > 0 ? `${liveMetrics.winRate.toFixed(1)}%` : '0.0%'}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/40">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase block">Trades / 24h</span>
                  <span className="text-lg font-bold font-mono text-foreground mt-1 block">
                    {liveMetrics.trades}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/40">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase block">Simulated PnL</span>
                  <span className={cn(
                    'text-lg font-bold font-mono mt-1 block',
                    liveMetrics.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  )}>
                    {liveMetrics.pnl >= 0 ? '+' : ''}${liveMetrics.pnl.toFixed(1)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/40">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase block">Profit Factor</span>
                  <span className={cn(
                    "text-lg font-bold font-mono mt-1 block",
                    liveMetrics.profitFactor >= 1.0 ? "text-cyan-400" : "text-zinc-400"
                  )}>
                    {liveMetrics.profitFactor.toFixed(2)}x
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Live bar-by-bar execution replay across real {draftSymbol} ({draftTimeframe}) market candles with taker fees, network latency, and slippage.
              </p>

              <button
                type="button"
                onClick={() => {
                  const draft = getCurrentDraft();
                  if (onNavigateToBacktester) onNavigateToBacktester(undefined, draft);
                  else window.location.hash = '#backtest';
                }}
                className="w-full py-2.5 rounded-xl bg-secondary/40 hover:bg-secondary/70 border border-border/60 text-xs font-bold text-foreground flex items-center justify-center gap-1.5 transition-all"
              >
                <span>Launch Full Equity & Drawdown Replay</span>
                <ArrowUpRightIcon className="w-3.5 h-3.5 text-primary" />
              </button>
            </div>

            {/* 2. Starter Strategy Presets Deck */}
            <div className="terminal-panel p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-border/30 pb-2">
                <span className="text-xs font-bold tracking-tight text-foreground uppercase font-mono">
                  Starter Templates ({agents.length})
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">Click to load</span>
              </div>

              <div className="flex flex-col gap-2">
                {agents.slice(0, 4).map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => handleLoadAgent(agent)}
                    className="p-2.5 rounded-xl border border-border/50 bg-secondary/20 hover:bg-secondary/40 text-left transition-all flex flex-col gap-1.5 group cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                        {agent.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[10px] font-mono font-bold"
                          style={{
                            color:
                              (agent.pnl ?? 0) > 0
                                ? '#6ee7b7'
                                : (agent.pnl ?? 0) < 0
                                ? '#fda4af'
                                : 'hsl(var(--muted-foreground))',
                          }}
                        >
                          {(agent.pnl ?? 0) > 0
                            ? `+${(agent.pnl ?? 0).toFixed(2)}`
                            : (agent.pnl ?? 0).toFixed(2)}{' '}
                          tUSDC
                        </span>
                        <Badge variant="outline" className="text-[9px] font-mono border-border/50 text-muted-foreground">
                          {agent.symbol} · {agent.timeframe}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-1">{agent.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 2: STRATEGY LIBRARY ----------------- */}
      {activeTab === 'LIBRARY' && (
        <div className="terminal-panel p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border/30 pb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground leading-none">
                Custom Strategy Library & Deployment Fleet
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Deploy, monitor bankroll allowances, backtest, and pause your autonomous binary options agents independently.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('BUILDER')}
              className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 hover:opacity-90 transition-all"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Create New Strategy</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {agents.map((agent) => {
              const agentColor = agent.color || '#2dd4bf';
              const allocated = agent.allocatedAllowance ?? 100;
              const spent = agent.spentAllowance ?? 0;
              const remaining = Math.max(0, allocated - spent);
              const pctUsed = Math.min(100, Math.round((spent / (allocated || 1)) * 100));
              const isEditingThis = editingAllowanceId === agent.id;

              return (
                <div
                  key={agent.id}
                  className="p-4 rounded-xl border border-border/50 bg-secondary/15 flex flex-col justify-between gap-3.5 transition-all hover:border-border"
                >
                  <div className="flex flex-col gap-3">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-8 h-8 rounded-lg grid place-items-center border flex-shrink-0 bg-secondary/30 border-border/50"
                          style={{ color: agentColor }}
                        >
                          <SparklesIcon className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-foreground truncate">{agent.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {agent.isDeployed ? (
                          <button
                            type="button"
                            onClick={() => {
                              window.location.hash = '#cockpit';
                            }}
                            className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 flex items-center gap-1 cursor-pointer transition-colors"
                            title="View in Fleet Command Cockpit"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>DEPLOYED IN FLEET</span>
                          </button>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-semibold bg-secondary/60 border border-border/60 text-muted-foreground flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                            <span>DRAFT BLUEPRINT</span>
                          </span>
                        )}
                        <Badge variant="outline" className="text-[9px] font-mono border-border text-foreground">
                          {agent.strategyType}
                        </Badge>
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 m-0">
                      {agent.description || 'Autonomous trading strategy'}
                    </p>

                    {/* Pill badges */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary/40 border border-border/50 text-foreground font-semibold">
                        {agent.symbol} · {agent.timeframe}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary/40 border border-border/50 text-foreground font-semibold">
                        {agent.rules?.action?.direction || 'CALL'} · {agent.rules?.action?.durationSec || 60}s
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary/40 border border-border/50 text-foreground font-semibold">
                        {agent.rules?.action?.stakeAmount || 10} tUSDC / trade
                      </span>
                    </div>

                    {/* Performance & Realized PnL KPI Deck */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded-lg bg-secondary/30 border border-border/40 flex flex-col gap-0.5">
                        <span className="text-[9px] font-mono text-muted-foreground uppercase flex items-center gap-1">
                          <SignalIcon className="w-3 h-3" /> Realized PnL
                        </span>
                        <span
                          className="text-xs font-mono font-bold"
                          style={{
                            color:
                              (agent.pnl ?? 0) > 0
                                ? '#6ee7b7'
                                : (agent.pnl ?? 0) < 0
                                ? '#fda4af'
                                : 'hsl(var(--muted-foreground))',
                          }}
                        >
                          {(agent.pnl ?? 0) > 0
                            ? `+${(agent.pnl ?? 0).toFixed(2)}`
                            : (agent.pnl ?? 0).toFixed(2)}{' '}
                          <span className="text-[9px]">tUSDC</span>
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/30 border border-border/40 flex flex-col gap-0.5">
                        <span className="text-[9px] font-mono text-muted-foreground uppercase">Win Rate & Fills</span>
                        <span className="text-xs font-mono font-bold text-foreground">
                          {(agent.tradesCount ?? 0) > 0
                            ? `${agent.tradesCount} fills · ${(agent.winRate ?? 0).toFixed(0)}% WR`
                            : '0 fills · —'}
                        </span>
                      </div>
                    </div>

                    {/* Dedicated Bankroll Allowance Card */}
                    <div className="p-2.5 rounded-lg bg-background/60 border border-border/60 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-muted-foreground flex items-center gap-1 font-semibold">
                          <BanknotesIcon className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Bankroll Allowance:</span>
                        </span>
                        <span className="font-bold text-foreground">${allocated.toFixed(2)} tUSDC</span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-1.5 rounded-full bg-secondary/80 overflow-hidden">
                        <div
                          className={cn(
                            'h-full transition-all duration-300',
                            pctUsed > 85 ? 'bg-red-400' : pctUsed > 60 ? 'bg-amber-400' : 'bg-emerald-400'
                          )}
                          style={{ width: `${Math.max(4, pctUsed)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                        <span>Spent: ${spent.toFixed(2)}</span>
                        <span className={cn(remaining <= 10 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-semibold')}>
                          Remaining: ${remaining.toFixed(2)}
                        </span>
                      </div>

                      {/* Inline Allowance Modifier */}
                      {isEditingThis ? (
                        <div className="flex items-center gap-1.5 pt-1 border-t border-border/30">
                          <span className="text-[10px] font-mono text-muted-foreground">New Limit:</span>
                          <input
                            type="number"
                            min={1}
                            max={10000}
                            value={tempAllowanceVal}
                            onChange={(e) => setTempAllowanceVal(Number(e.target.value))}
                            className="w-20 px-1.5 py-0.5 rounded bg-background border border-border text-xs font-mono font-bold text-foreground text-right"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveAllowance(agent.id)}
                            disabled={actionLoadingId === agent.id}
                            className="p-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 transition-colors"
                            title="Save Allowance"
                          >
                            <CheckIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingAllowanceId(null)}
                            className="p-1 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                            title="Cancel"
                          >
                            <XMarkIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end pt-1 border-t border-border/30">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAllowanceId(agent.id);
                              setTempAllowanceVal(allocated);
                            }}
                            className="text-[10px] font-mono text-primary hover:underline flex items-center gap-1 font-semibold"
                          >
                            <PencilSquareIcon className="w-3 h-3" />
                            <span>Modify Allowance</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/30 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleLoadAgent(agent)}
                        className="text-xs font-semibold text-primary hover:underline font-mono flex items-center gap-1"
                        title="Edit logic capsules"
                      >
                        <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (onNavigateToBacktester) onNavigateToBacktester(agent.id, agent);
                          else window.location.hash = '#backtest';
                        }}
                        className="px-2.5 py-1 rounded-lg bg-secondary/40 hover:bg-secondary/70 border border-border/50 text-xs font-bold text-foreground flex items-center gap-1 transition-all"
                        title="Backtest this agent"
                      >
                        <PlayIcon className="w-3 h-3 text-primary" />
                        <span>Backtest</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {agent.isDeployed ? (
                        <button
                          type="button"
                          onClick={() => handleToggleDeploy(agent)}
                          disabled={actionLoadingId === agent.id}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-400 text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-50"
                          title="Pause autonomous execution"
                        >
                          {actionLoadingId === agent.id ? <Spinner size="xs" /> : <PauseIcon className="w-3 h-3" />}
                          <span>Pause</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleDeploy(agent)}
                          disabled={actionLoadingId === agent.id}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-50 shadow-sm"
                          title="Deploy agent with isolated allowance"
                        >
                          {actionLoadingId === agent.id ? <Spinner size="xs" /> : <RocketLaunchIcon className="w-3 h-3" />}
                          <span>Deploy</span>
                        </button>
                      )}

                      {!agent.id.startsWith('00000000-0000-0000-0000-') && !agent.id.startsWith('template-') && (
                        <button
                          type="button"
                          onClick={() => deleteAgent(agent.id)}
                          className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                          title="Delete agent"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
