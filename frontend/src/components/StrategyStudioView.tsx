import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowsUpDownIcon,
  Squares2X2Icon,
  TableCellsIcon,
  DocumentDuplicateIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ClipboardIcon,
  CodeBracketIcon,
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
  'Fast ETH 5m Call rider on 9/21 EMA golden cross with rising velocity',
  'Conservative BTC 15m Call mean-reversion when RSI is oversold and payout >= 80%',
];

const CONDITION_PRESETS: Array<{ label: string; desc: string; rule: Omit<ConditionRule, 'id'> }> = [
  {
    label: 'RSI Extreme Oversold (<25)',
    desc: 'Momentum exhaustion bounce',
    rule: { indicator: 'RSI', period: 14, operator: 'LESS_THAN', value: 25 },
  },
  {
    label: 'RSI Overbought Fade (>75)',
    desc: 'Momentum overextension reversal',
    rule: { indicator: 'RSI', period: 14, operator: 'GREATER_THAN', value: 75 },
  },
  {
    label: 'Bollinger Lower Band Dip',
    desc: '2.0 StdDev discount touch',
    rule: { indicator: 'BOLLINGER_LOWER', period: 20, stdDev: 2.0, operator: 'LESS_THAN', value: 0 },
  },
  {
    label: 'Bollinger Upper Ceiling Fade',
    desc: '2.0 StdDev volatility exhaustion',
    rule: { indicator: 'BOLLINGER_UPPER', period: 20, stdDev: 2.0, operator: 'GREATER_THAN', value: 0 },
  },
  {
    label: 'Fast 9/21 EMA Golden Cross',
    desc: 'Fast trend crossover',
    rule: { indicator: 'EMA', period: 9, secondaryPeriod: 21, operator: 'CROSS_ABOVE', value: 0 },
  },
  {
    label: 'Spot Velocity Drift Spike (>0.2%)',
    desc: 'High-frequency momentum shift',
    rule: { indicator: 'PRICE_DRIFT', period: 5, operator: 'GREATER_THAN', value: 0.002 },
  },
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
    updateAgent,
    deleteAgent,
    deployAgent,
    pauseAgent,
    setAgentAllowance,
    generateFromPrompt,
  } = useCustomAgents(wallet.address || undefined);

  const [activeTab, setActiveTab] = useState<'BUILDER' | 'LIBRARY'>('BUILDER');

  // Tracking Active Editing State (In-place strategy editing)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editingOriginalAgent, setEditingOriginalAgent] = useState<CustomAgentDefinition | null>(null);

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

  // Library Search, Filters & Sorting State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'DEPLOYED' | 'PAUSED' | 'TEMPLATES' | 'CUSTOM'>('ALL');
  const [filterSymbol, setFilterSymbol] = useState<'ALL' | 'BTC/USD' | 'ETH/USD'>('ALL');
  const [filterDirection, setFilterDirection] = useState<'ALL' | 'CALL' | 'PUT'>('ALL');
  const [sortBy, setSortBy] = useState<'PNL_DESC' | 'WINRATE_DESC' | 'TRADES_DESC' | 'ALLOWANCE_DESC' | 'NEWEST' | 'NAME_ASC'>('PNL_DESC');
  const [viewMode, setViewMode] = useState<'GRID' | 'TABLE'>('GRID');

  // Library inline allowance and deployment action state
  const [editingAllowanceId, setEditingAllowanceId] = useState<string | null>(null);
  const [tempAllowanceVal, setTempAllowanceVal] = useState<number>(100);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Strategy JSON Export / Import Modal
  const [isJsonModalOpen, setIsJsonModalOpen] = useState<boolean>(false);
  const [jsonModalMode, setJsonModalMode] = useState<'EXPORT' | 'IMPORT'>('EXPORT');
  const [jsonText, setJsonText] = useState<string>('');
  const [jsonCopySuccess, setJsonCopySuccess] = useState<boolean>(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Safe Deletion Confirmation Modal
  const [agentToDelete, setAgentToDelete] = useState<CustomAgentDefinition | null>(null);

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

  // Add preset condition
  const handleAddPresetCondition = (preset: typeof CONDITION_PRESETS[0]) => {
    const newCond: ConditionRule = {
      id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      ...preset.rule,
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

  // Reset Builder to pristine new draft
  const handleResetBuilder = () => {
    setEditingAgentId(null);
    setEditingOriginalAgent(null);
    setDraftName('My Custom Alpha Sniper');
    setDraftDesc('Autonomous binary options strategy built with zero code');
    setDraftSymbol('BTC/USD');
    setDraftTimeframe('5m');
    setDraftColor('#2dd4bf');
    setDraftOperator('AND');
    setDraftAllowance(100);
    setConditions([
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
    setActionDirection('CALL');
    setActionDurationSec(60);
    setActionStakeAmount(10);
    setRiskMaxLosses(2);
    setRiskCooldownMins(3);
    setRiskMinPayoutPct(78);
    setSaveSuccessMsg(null);
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

  // Save current draft: Supports In-Place Update OR New Strategy Clone
  const handleSaveStrategy = async (deployNow: boolean = false, saveAsCopy: boolean = false) => {
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

    const isStarterTemplate =
      editingAgentId &&
      (editingAgentId.startsWith('00000000-0000-0000-0000-') || editingAgentId.startsWith('template-'));

    // If we are editing an existing non-template agent AND not forcing a clone copy:
    if (editingAgentId && !saveAsCopy && !isStarterTemplate) {
      const res = await updateAgent(editingAgentId, {
        name: draftName,
        description: draftDesc,
        symbol: draftSymbol,
        timeframe: draftTimeframe,
        strategyType: actionDirection === 'CALL' ? 'MOMENTUM' : 'MEAN_REVERSION',
        rules,
        color: draftColor,
        isDeployed: deployNow ? true : editingOriginalAgent?.isDeployed ?? false,
        allocatedAllowance: draftAllowance,
      });

      if (res) {
        setEditingOriginalAgent(res);
        setSaveSuccessMsg(
          deployNow
            ? `Strategy updated and deployed with $${draftAllowance.toFixed(2)} tUSDC allowance!`
            : 'Strategy changes saved in-place!'
        );
        if (deployNow && (!activeSession || !activeSession.isActive)) {
          onOpenSessionModal?.();
        }
        setTimeout(() => setSaveSuccessMsg(null), 4000);
        if (deployNow) {
          setActiveTab('LIBRARY');
        }
      }
      return;
    }

    // Otherwise create a new strategy (or clone)
    const newName = saveAsCopy ? `${draftName} (Copy)` : draftName;
    const res = await createAgent({
      name: newName,
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
      setEditingAgentId(res.id);
      setEditingOriginalAgent(res);
      setSaveSuccessMsg(
        deployNow
          ? `Strategy deployed with $${draftAllowance.toFixed(2)} tUSDC allowance! Running autonomously.`
          : saveAsCopy
          ? `Strategy cloned as "${newName}" and saved to library!`
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

  // Load an existing agent into the builder (with editing state attached)
  const handleLoadAgent = (agent: CustomAgentDefinition) => {
    setEditingAgentId(agent.id);
    setEditingOriginalAgent(agent);
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Clone an agent directly from library card
  const handleDuplicateAgent = async (agent: CustomAgentDefinition) => {
    setActionLoadingId(agent.id);
    try {
      await createAgent({
        name: `${agent.name} (Copy)`,
        description: agent.description || 'Cloned custom strategy',
        symbol: agent.symbol,
        timeframe: agent.timeframe,
        strategyType: agent.strategyType,
        rules: JSON.parse(JSON.stringify(agent.rules)),
        color: agent.color,
        icon: agent.icon,
        isDeployed: false,
        allocatedAllowance: agent.allocatedAllowance || 100,
      });
      setSaveSuccessMsg(`Cloned "${agent.name}" to library!`);
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } finally {
      setActionLoadingId(null);
    }
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

  // Handle Export Strategy JSON
  const handleOpenExportJson = (agent?: CustomAgentDefinition) => {
    const exportData = agent ? agent : getCurrentDraft();
    setJsonText(JSON.stringify(exportData, null, 2));
    setJsonModalMode('EXPORT');
    setJsonError(null);
    setJsonCopySuccess(false);
    setIsJsonModalOpen(true);
  };

  // Handle Import Strategy JSON
  const handleOpenImportJson = () => {
    setJsonText('');
    setJsonModalMode('IMPORT');
    setJsonError(null);
    setIsJsonModalOpen(true);
  };

  const handleApplyImportedJson = () => {
    setJsonError(null);
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON structure. Must be an object.');
      }
      if (parsed.name) setDraftName(parsed.name);
      if (parsed.description) setDraftDesc(parsed.description);
      if (parsed.symbol) setDraftSymbol(parsed.symbol);
      if (parsed.timeframe) setDraftTimeframe(parsed.timeframe);
      if (parsed.color) setDraftColor(parsed.color);
      if (parsed.allocatedAllowance) setDraftAllowance(parsed.allocatedAllowance);

      if (parsed.rules) {
        if (parsed.rules.operator) setDraftOperator(parsed.rules.operator);
        if (Array.isArray(parsed.rules.conditions) && parsed.rules.conditions.length > 0) {
          setConditions(
            parsed.rules.conditions.map((c: any, i: number) => ({
              id: `imported-${i}-${Date.now()}`,
              indicator: c.indicator || 'RSI',
              period: c.period || 14,
              secondaryPeriod: c.secondaryPeriod,
              stdDev: c.stdDev,
              operator: c.operator || 'LESS_THAN',
              value: c.value ?? 30,
            }))
          );
        }
        if (parsed.rules.action) {
          if (parsed.rules.action.direction) setActionDirection(parsed.rules.action.direction);
          if (parsed.rules.action.durationSec) setActionDurationSec(parsed.rules.action.durationSec);
          if (parsed.rules.action.stakeAmount) setActionStakeAmount(parsed.rules.action.stakeAmount);
        }
        if (parsed.rules.risk) {
          if (parsed.rules.risk.maxConsecutiveLosses) setRiskMaxLosses(parsed.rules.risk.maxConsecutiveLosses);
          if (parsed.rules.risk.cooldownMinutes) setRiskCooldownMins(parsed.rules.risk.cooldownMinutes);
          if (parsed.rules.risk.minPoolPayoutPct) setRiskMinPayoutPct(parsed.rules.risk.minPoolPayoutPct);
        }
      }

      setEditingAgentId(null);
      setEditingOriginalAgent(null);
      setIsJsonModalOpen(false);
      setActiveTab('BUILDER');
      setSaveSuccessMsg('Imported strategy successfully loaded into Builder!');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      setJsonError(err.message || 'Failed to parse strategy JSON.');
    }
  };

  const handleCopyJsonToClipboard = () => {
    navigator.clipboard.writeText(jsonText);
    setJsonCopySuccess(true);
    setTimeout(() => setJsonCopySuccess(false), 2500);
  };

  const handleDownloadJsonFile = () => {
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${draftName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_strategy.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setJsonText(content);
    };
    reader.readAsText(file);
  };

  // Safe deletion handler
  const handleConfirmDelete = async () => {
    if (!agentToDelete) return;
    await deleteAgent(agentToDelete.id);
    setAgentToDelete(null);
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

  // Filtered and sorted agents list for Strategy Library
  const filteredAndSortedAgents = useMemo(() => {
    let result = [...agents];

    // 1. Text Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((a) => {
        const nameMatch = a.name.toLowerCase().includes(q);
        const descMatch = (a.description || '').toLowerCase().includes(q);
        const symbolMatch = a.symbol.toLowerCase().includes(q);
        const typeMatch = (a.strategyType || '').toLowerCase().includes(q);
        const condMatch = a.rules?.conditions?.some((c) =>
          c.indicator.toLowerCase().includes(q)
        );
        return nameMatch || descMatch || symbolMatch || typeMatch || condMatch;
      });
    }

    // 2. Status Filter
    if (filterStatus === 'DEPLOYED') {
      result = result.filter((a) => a.isDeployed);
    } else if (filterStatus === 'PAUSED') {
      result = result.filter((a) => !a.isDeployed && !a.id.startsWith('00000000-0000-0000-0000-'));
    } else if (filterStatus === 'TEMPLATES') {
      result = result.filter(
        (a) => a.id.startsWith('00000000-0000-0000-0000-') || a.id.startsWith('template-')
      );
    } else if (filterStatus === 'CUSTOM') {
      result = result.filter(
        (a) => !a.id.startsWith('00000000-0000-0000-0000-') && !a.id.startsWith('template-')
      );
    }

    // 3. Symbol Filter
    if (filterSymbol !== 'ALL') {
      result = result.filter((a) => a.symbol === filterSymbol);
    }

    // 4. Direction Filter
    if (filterDirection !== 'ALL') {
      result = result.filter((a) => (a.rules?.action?.direction || 'CALL') === filterDirection);
    }

    // 5. Sorting
    result.sort((a, b) => {
      if (sortBy === 'PNL_DESC') {
        return (b.pnl ?? 0) - (a.pnl ?? 0);
      }
      if (sortBy === 'WINRATE_DESC') {
        return (b.winRate ?? 0) - (a.winRate ?? 0);
      }
      if (sortBy === 'TRADES_DESC') {
        return (b.tradesCount ?? 0) - (a.tradesCount ?? 0);
      }
      if (sortBy === 'ALLOWANCE_DESC') {
        return (b.allocatedAllowance ?? 0) - (a.allocatedAllowance ?? 0);
      }
      if (sortBy === 'NAME_ASC') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'NEWEST') {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      return 0;
    });

    return result;
  }, [agents, searchQuery, filterStatus, filterSymbol, filterDirection, sortBy]);

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
              {editingAgentId && (
                <Badge variant="outline" className="text-[10px] font-mono border-cyan-500/40 text-cyan-300 bg-cyan-500/10 animate-pulse">
                  Editing: {draftName}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Design, backtest, deploy, and assign dedicated tUSDC bankroll allowances to autonomous binary options trading strategies.
            </p>
          </div>
        </div>

        {/* View Switcher Tabs & Global Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary/30 border border-border/50">
            <button
              type="button"
              onClick={() => setActiveTab('BUILDER')}
              className={cn(
                'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer',
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
                'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer',
                activeTab === 'LIBRARY' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <CubeIcon className="w-3.5 h-3.5" />
              <span>Strategy Library ({agents.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleOpenImportJson}
              className="px-3 py-1.5 rounded-lg bg-secondary/40 hover:bg-secondary/70 border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Import Strategy JSON"
            >
              <ArrowUpTrayIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Import JSON</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenExportJson()}
              className="px-3 py-1.5 rounded-lg bg-secondary/40 hover:bg-secondary/70 border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Export Current Strategy JSON"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* Symmetrical Autonomous Execution Architecture Banner */}
      <div className="terminal-panel p-0 overflow-hidden border-border/60 bg-card/60 backdrop-blur-md shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/40">
          {/* Pillar 1: Execution Model */}
          <div className="p-3.5 flex flex-col justify-between gap-2.5 bg-gradient-to-b from-purple-500/5 to-transparent">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg grid place-items-center bg-purple-500/15 text-purple-300 border border-purple-500/30 flex-shrink-0">
                  <CpuChipIcon className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-foreground">Isolated Execution</span>
              </div>
              <Badge variant="outline" className="text-[9px] font-mono border-purple-500/40 text-purple-300 bg-purple-500/10">
                Self-Governed
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Custom strategies execute trigger rules directly on Somnia CLOB without relying on swarm mirroring.
            </p>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-purple-300/80">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span>Independent of Swarm Copy-Trade</span>
            </div>
          </div>

          {/* Pillar 2: Risk & Bankroll Isolation */}
          <div className="p-3.5 flex flex-col justify-between gap-2.5 bg-gradient-to-b from-sky-500/5 to-transparent">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg grid place-items-center bg-sky-500/15 text-sky-300 border border-sky-500/30 flex-shrink-0">
                  <BanknotesIcon className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-foreground">Dedicated Bankroll</span>
              </div>
              <Badge variant="outline" className="text-[9px] font-mono border-sky-500/40 text-sky-300 bg-sky-500/10">
                Non-Custodial
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Allocated tUSDC allowance locks max risk per agent. Funds remain non-custodial in your wallet.
            </p>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-sky-300/80">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>Hard-Capped Capital Shield</span>
            </div>
          </div>

          {/* Pillar 3: Session Authority & Status */}
          <div className={cn(
            "p-3.5 flex flex-col justify-between gap-2.5",
            activeSession && activeSession.isActive
              ? "bg-gradient-to-b from-emerald-500/5 to-transparent"
              : "bg-gradient-to-b from-amber-500/5 to-transparent"
          )}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-7 h-7 rounded-lg grid place-items-center flex-shrink-0 border",
                  activeSession && activeSession.isActive
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                )}>
                  <ShieldCheckIcon className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-foreground">Session Authority</span>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] font-mono font-semibold",
                  activeSession && activeSession.isActive
                    ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                    : "border-amber-500/40 text-amber-300 bg-amber-500/10"
                )}
              >
                {activeSession && activeSession.isActive ? 'Active' : 'Auth Required'}
              </Badge>
            </div>

            <p className="text-[11px] text-muted-foreground leading-snug">
              {activeSession && activeSession.isActive
                ? 'Sub-second gasless signatures authorized for autonomous background order dispatch.'
                : 'Session delegation is required before deploying custom autonomous trading bots.'}
            </p>

            <div className="flex items-center justify-between gap-2 pt-0.5">
              {activeSession && activeSession.isActive ? (
                <>
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Session Key Active</span>
                  </div>
                  {onOpenSessionModal && (
                    <button
                      type="button"
                      onClick={onOpenSessionModal}
                      className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors underline cursor-pointer"
                    >
                      Manage
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={onOpenSessionModal}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  <KeyIcon className="w-3.5 h-3.5" />
                  <span>Authorize Session Key</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ----------------- TAB 1: AGENT STUDIO ----------------- */}
      {activeTab === 'BUILDER' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left 2 Cols: The Sentence & Capsule Builder */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Active Editing Indicator Banner (when editing an existing agent) */}
            {editingAgentId && (
              <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-between gap-3 flex-wrap shadow-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 grid place-items-center flex-shrink-0">
                    <PencilSquareIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-cyan-200 truncate">
                        Editing Strategy: {draftName}
                      </span>
                      {editingOriginalAgent?.isDeployed ? (
                        <Badge variant="outline" className="text-[9px] font-mono border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
                          Active In Fleet
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] font-mono border-border text-muted-foreground">
                          Saved Draft
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-cyan-300/70">
                      Changes will update this deployed strategy in-place without generating a duplicate instance.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSaveStrategy(false, true)}
                    disabled={isSaving}
                    className="px-2.5 py-1 rounded-lg bg-secondary/50 hover:bg-secondary border border-border text-xs font-medium text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                    title="Save current modifications as a new cloned copy"
                  >
                    <DocumentDuplicateIcon className="w-3.5 h-3.5" />
                    <span>Save as Copy</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetBuilder}
                    className="px-2.5 py-1 rounded-lg bg-secondary/30 hover:bg-red-500/20 border border-border/50 hover:border-red-500/30 text-xs font-medium text-muted-foreground hover:text-red-300 flex items-center gap-1 transition-colors cursor-pointer"
                    title="Discard editing session and start a fresh strategy"
                  >
                    <ArrowPathIcon className="w-3.5 h-3.5" />
                    <span>New Draft</span>
                  </button>
                </div>
              </div>
            )}

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
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1.5 transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
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
                    className="text-[10px] font-mono px-2 py-1 rounded-lg bg-secondary/40 hover:bg-secondary/70 border border-border/40 text-muted-foreground hover:text-foreground transition-colors text-left cursor-pointer"
                  >
                    {prompt.length > 42 ? `${prompt.slice(0, 42)}…` : prompt}
                  </button>
                ))}
              </div>
            </div>

            {/* Visual Logic Execution Flow Diagram */}
            <div className="p-3.5 rounded-xl border border-border/50 bg-secondary/15 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
                  <CodeBracketIcon className="w-3.5 h-3.5 text-primary" />
                  <span>Live Strategy Execution Pipeline</span>
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {conditions.length} Trigger {conditions.length === 1 ? 'Rule' : 'Rules'} ({draftOperator})
                </span>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-thin">
                {/* Step 1: Market Node */}
                <div className="px-2.5 py-1.5 rounded-lg bg-background/80 border border-border/60 flex items-center gap-1.5 flex-shrink-0 text-xs font-mono">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="font-bold text-foreground">{draftSymbol}</span>
                  <span className="text-muted-foreground text-[10px]">({draftTimeframe})</span>
                </div>

                <span className="text-muted-foreground font-mono text-xs">➔</span>

                {/* Step 2: Trigger Conditions Summary */}
                <div className="px-2.5 py-1.5 rounded-lg bg-secondary/30 border border-border/60 flex items-center gap-1.5 flex-shrink-0 text-xs font-mono">
                  <span className="text-cyan-400 font-bold">IF:</span>
                  <span className="text-foreground max-w-[200px] truncate">
                    {conditions.map((c) => `${c.indicator} ${c.operator === 'LESS_THAN' ? '<' : c.operator === 'GREATER_THAN' ? '>' : 'cross'} ${c.value}`).join(` ${draftOperator} `)}
                  </span>
                </div>

                <span className="text-muted-foreground font-mono text-xs">➔</span>

                {/* Step 3: Binary Action */}
                <div className={cn(
                  "px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 flex-shrink-0 text-xs font-mono font-bold",
                  actionDirection === 'CALL'
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                )}>
                  <span>EXEC: {actionDirection}</span>
                  <span className="text-[10px] font-normal">({actionDurationSec}s @ ${actionStakeAmount})</span>
                </div>

                <span className="text-muted-foreground font-mono text-xs">➔</span>

                {/* Step 4: Risk Guard */}
                <div className="px-2.5 py-1.5 rounded-lg bg-background/80 border border-border/60 flex items-center gap-1.5 flex-shrink-0 text-xs font-mono text-muted-foreground">
                  <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Max {riskMaxLosses} Losses · ${draftAllowance} Cap</span>
                </div>
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
                    placeholder="Strategy Name..."
                  />
                  <input
                    type="color"
                    value={draftColor}
                    onChange={(e) => setDraftColor(e.target.value)}
                    className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                    title="Agent accent color"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px] font-mono font-bold" style={{ borderColor: draftColor, color: draftColor }}>
                    {actionDirection === 'CALL' ? 'BULLISH CALL' : 'BEARISH PUT'}
                  </Badge>
                  <span className="text-[11px] font-mono text-muted-foreground">{draftSymbol} · {draftTimeframe}</span>
                </div>
              </div>

              {/* Strategy Description input */}
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase block mb-1">Strategy Thesis / Notes</label>
                <input
                  type="text"
                  value={draftDesc}
                  onChange={(e) => setDraftDesc(e.target.value)}
                  placeholder="Describe your strategy rationale, trigger context, or target market conditions..."
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/60 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary font-sans"
                />
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
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[11px] font-mono font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-md bg-primary/10 border border-primary/30 text-primary grid place-items-center text-[10px]">2</span>
                    Indicator Trigger Capsules
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-muted-foreground">Logic Gate:</span>
                    <button
                      type="button"
                      onClick={() => setDraftOperator(draftOperator === 'AND' ? 'OR' : 'AND')}
                      className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-primary/40 text-primary bg-primary/10 hover:bg-primary/20 transition-all cursor-pointer"
                    >
                      {draftOperator === 'AND' ? 'ALL Must Agree (AND)' : 'ANY May Trigger (OR)'}
                    </button>
                  </div>
                </div>

                {/* Quick Condition Presets Bar */}
                <div className="flex items-center gap-1.5 flex-wrap p-2 rounded-lg bg-secondary/20 border border-border/40">
                  <span className="text-[10px] font-mono font-semibold text-muted-foreground uppercase flex items-center gap-1 mr-1">
                    <PlusIcon className="w-3 h-3 text-primary" /> Preset Filters:
                  </span>
                  {CONDITION_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAddPresetCondition(preset)}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-background/80 hover:bg-primary/15 border border-border/50 hover:border-primary/40 text-foreground transition-all cursor-pointer"
                      title={preset.desc}
                    >
                      + {preset.label}
                    </button>
                  ))}
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
                          className="w-7 h-7 rounded-lg border border-border/50 grid place-items-center text-muted-foreground hover:text-red-400 hover:border-red-400/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
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
                  className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors cursor-pointer"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>Add Custom Filter Condition</span>
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
                        'px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer',
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
                        'px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer',
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
                          'px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border transition-all cursor-pointer',
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
                    {editingAgentId ? `Editing existing strategy instance (${editingAgentId.slice(0, 8)}…)` : 'Bankroll isolated. Execution parameters validated for Somnia CLOB.'}
                  </span>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleSaveStrategy(false, false)}
                    disabled={isSaving}
                    className="px-3.5 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground border border-border/60 text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? <Spinner size="xs" /> : <DocumentCheckIcon className="w-3.5 h-3.5" />}
                    <span>{editingAgentId ? 'Update Strategy' : 'Save Draft'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveStrategy(true, false)}
                    disabled={isSaving}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50 shadow-sm cursor-pointer"
                  >
                    <RocketLaunchIcon className="w-3.5 h-3.5" />
                    <span>{editingAgentId ? `Update & Deploy ($${draftAllowance})` : `Save & Deploy ($${draftAllowance} tUSDC)`}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const draft = getCurrentDraft();
                      if (onNavigateToBacktester) onNavigateToBacktester(editingAgentId || undefined, draft);
                      else window.location.hash = '#backtest';
                    }}
                    className="px-3.5 py-2 rounded-xl border border-primary/40 bg-primary/10 text-primary text-xs font-bold flex items-center gap-1.5 hover:bg-primary/20 transition-all cursor-pointer"
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
                    "text-lg font-bold font-mono mt-1 block transition-all",
                    liveMetrics.isSimulating && "opacity-50 animate-pulse",
                    liveMetrics.winRate >= 50 ? "text-emerald-400" : "text-amber-400"
                  )}>
                    {liveMetrics.trades > 0 ? `${liveMetrics.winRate.toFixed(1)}%` : '0.0%'}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/40">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase block">Trades / 24h</span>
                  <span className={cn(
                    "text-lg font-bold font-mono text-foreground mt-1 block transition-all",
                    liveMetrics.isSimulating && "opacity-50 animate-pulse"
                  )}>
                    {liveMetrics.trades}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/40">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase block">Simulated PnL</span>
                  <span className={cn(
                    'text-lg font-bold font-mono mt-1 block transition-all',
                    liveMetrics.isSimulating && "opacity-50 animate-pulse",
                    liveMetrics.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  )}>
                    {liveMetrics.pnl >= 0 ? '+' : ''}${liveMetrics.pnl.toFixed(1)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/40">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase block">Profit Factor</span>
                  <span className={cn(
                    "text-lg font-bold font-mono mt-1 block transition-all",
                    liveMetrics.isSimulating && "opacity-50 animate-pulse",
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
                  if (onNavigateToBacktester) onNavigateToBacktester(editingAgentId || undefined, draft);
                  else window.location.hash = '#backtest';
                }}
                className="w-full py-2.5 rounded-xl bg-secondary/40 hover:bg-secondary/70 border border-border/60 text-xs font-bold text-foreground flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <span>Launch Full Equity & Drawdown Replay</span>
                <ArrowUpRightIcon className="w-3.5 h-3.5 text-primary" />
              </button>
            </div>

            {/* 2. Starter Strategy Presets Deck */}
            <div className="terminal-panel p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-border/30 pb-2">
                <span className="text-xs font-bold tracking-tight text-foreground uppercase font-mono">
                  Quick Load Blueprints ({agents.length})
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">Click to edit</span>
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
          {/* Library Header */}
          <div className="flex items-center justify-between border-b border-border/30 pb-3 flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-tight text-foreground leading-none">
                  Custom Strategy Library & Deployment Fleet
                </h2>
                <Badge variant="outline" className="text-[10px] font-mono text-primary border-primary/40 bg-primary/10">
                  {filteredAndSortedAgents.length} of {agents.length} Strategies
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Filter, search, backtest, edit in-place, and monitor dedicated bankroll allowances for autonomous binary options bots.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleResetBuilder}
                className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 hover:opacity-90 transition-all cursor-pointer shadow-sm"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                <span>Create New Strategy</span>
              </button>
            </div>
          </div>

          {/* Search & Multi-Dimensional Filters Bar */}
          <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-secondary/20 border border-border/50">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {/* Search input */}
              <div className="relative flex-1 min-w-[240px]">
                <MagnifyingGlassIcon className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, indicator (RSI, EMA, Bollinger), BTC/ETH..."
                  className="w-full pl-9 pr-8 py-1.5 rounded-lg bg-background border border-border/60 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary font-sans"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <XMarkIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Sort By Dropdown */}
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <ArrowsUpDownIcon className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground hidden sm:inline">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-lg bg-background border border-border/60 text-xs font-semibold text-foreground font-mono focus:outline-none focus:border-primary"
                >
                  <option value="PNL_DESC">Highest Realized PnL</option>
                  <option value="WINRATE_DESC">Highest Win Rate</option>
                  <option value="TRADES_DESC">Most Trade Fills</option>
                  <option value="ALLOWANCE_DESC">Highest Bankroll Allowance</option>
                  <option value="NEWEST">Recently Created</option>
                  <option value="NAME_ASC">Name (A to Z)</option>
                </select>
              </div>

              {/* View Mode Toggle: Grid vs Table */}
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-background border border-border/60">
                <button
                  type="button"
                  onClick={() => setViewMode('GRID')}
                  className={cn(
                    'p-1.5 rounded text-xs transition-colors cursor-pointer',
                    viewMode === 'GRID' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                  title="Grid Cards View"
                >
                  <Squares2X2Icon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('TABLE')}
                  className={cn(
                    'p-1.5 rounded text-xs transition-colors cursor-pointer',
                    viewMode === 'TABLE' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                  title="Fleet Table View"
                >
                  <TableCellsIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/30 text-xs">
              <span className="text-[10px] font-mono font-semibold text-muted-foreground uppercase flex items-center gap-1">
                <FunnelIcon className="w-3 h-3" /> Filters:
              </span>

              {/* Status Filter */}
              <div className="flex items-center gap-1 bg-background/80 p-0.5 rounded-lg border border-border/50">
                {(['ALL', 'DEPLOYED', 'PAUSED', 'TEMPLATES', 'CUSTOM'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setFilterStatus(st)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-all cursor-pointer',
                      filterStatus === st ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {st === 'ALL' ? 'All Status' : st === 'DEPLOYED' ? 'Deployed' : st === 'PAUSED' ? 'Drafts' : st === 'TEMPLATES' ? 'Templates' : 'User'}
                  </button>
                ))}
              </div>

              {/* Symbol Filter */}
              <div className="flex items-center gap-1 bg-background/80 p-0.5 rounded-lg border border-border/50">
                {(['ALL', 'BTC/USD', 'ETH/USD'] as const).map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => setFilterSymbol(sym)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-all cursor-pointer',
                      filterSymbol === sym ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {sym}
                  </button>
                ))}
              </div>

              {/* Direction Filter */}
              <div className="flex items-center gap-1 bg-background/80 p-0.5 rounded-lg border border-border/50">
                {(['ALL', 'CALL', 'PUT'] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setFilterDirection(dir)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-all cursor-pointer',
                      filterDirection === dir ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {dir === 'ALL' ? 'All Biases' : dir === 'CALL' ? 'CALL (Up)' : 'PUT (Down)'}
                  </button>
                ))}
              </div>

              {(searchQuery || filterStatus !== 'ALL' || filterSymbol !== 'ALL' || filterDirection !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterStatus('ALL');
                    setFilterSymbol('ALL');
                    setFilterDirection('ALL');
                  }}
                  className="text-[10px] font-mono text-muted-foreground hover:text-primary underline ml-auto cursor-pointer"
                >
                  Reset filters
                </button>
              )}
            </div>
          </div>

          {/* Empty State when filters match 0 strategies */}
          {filteredAndSortedAgents.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-border/60 bg-secondary/10">
              <ExclamationTriangleIcon className="w-8 h-8 text-muted-foreground/60" />
              <span className="text-sm font-bold text-foreground">No Strategies Match Filters</span>
              <p className="text-xs text-muted-foreground max-w-md">
                Try adjusting your search keywords or resetting status and asset filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterStatus('ALL');
                  setFilterSymbol('ALL');
                  setFilterDirection('ALL');
                }}
                className="mt-1 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-semibold cursor-pointer"
              >
                Clear All Filters
              </button>
            </div>
          ) : viewMode === 'GRID' ? (
            /* ================= VIEW MODE: GRID CARDS ================= */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {filteredAndSortedAgents.map((agent) => {
                const agentColor = agent.color || '#2dd4bf';
                const allocated = agent.allocatedAllowance ?? 100;
                const spent = agent.spentAllowance ?? 0;
                const remaining = Math.max(0, allocated - spent);
                const pctUsed = Math.min(100, Math.round((spent / (allocated || 1)) * 100));
                const isEditingThis = editingAllowanceId === agent.id;
                const isTemplate = agent.id.startsWith('00000000-0000-0000-0000-') || agent.id.startsWith('template-');

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
                              <span>{isTemplate ? 'STARTER BLUEPRINT' : 'DRAFT BLUEPRINT'}</span>
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
                              className="p-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 transition-colors cursor-pointer"
                              title="Save Allowance"
                            >
                              <CheckIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingAllowanceId(null)}
                              className="p-1 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
                              className="text-[10px] font-mono text-primary hover:underline flex items-center gap-1 font-semibold cursor-pointer"
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
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleLoadAgent(agent)}
                          className="px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold font-mono flex items-center gap-1 transition-colors cursor-pointer"
                          title="Edit logic capsules in Studio"
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
                          className="px-2 py-1 rounded-lg bg-secondary/40 hover:bg-secondary/70 border border-border/50 text-xs font-bold text-foreground flex items-center gap-1 transition-all cursor-pointer"
                          title="Backtest this agent against historical candles"
                        >
                          <PlayIcon className="w-3 h-3 text-primary" />
                          <span>Backtest</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDuplicateAgent(agent)}
                          disabled={actionLoadingId === agent.id}
                          className="p-1 rounded bg-secondary/30 hover:bg-secondary border border-border/40 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          title="Duplicate / Clone Strategy"
                        >
                          <DocumentDuplicateIcon className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenExportJson(agent)}
                          className="p-1 rounded bg-secondary/30 hover:bg-secondary border border-border/40 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          title="Export Strategy JSON"
                        >
                          <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {agent.isDeployed ? (
                          <button
                            type="button"
                            onClick={() => handleToggleDeploy(agent)}
                            disabled={actionLoadingId === agent.id}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-400 text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer"
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
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-50 shadow-sm cursor-pointer"
                            title="Deploy agent with isolated allowance"
                          >
                            {actionLoadingId === agent.id ? <Spinner size="xs" /> : <RocketLaunchIcon className="w-3 h-3" />}
                            <span>Deploy</span>
                          </button>
                        )}

                        {!isTemplate && (
                          <button
                            type="button"
                            onClick={() => setAgentToDelete(agent)}
                            className="text-muted-foreground hover:text-red-400 transition-colors p-1 cursor-pointer"
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
          ) : (
            /* ================= VIEW MODE: COMPACT FLEET TABLE ================= */
            <div className="rounded-xl border border-border/50 overflow-hidden bg-secondary/10">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border/40 bg-secondary/30 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      <th className="p-3">Strategy Name</th>
                      <th className="p-3">Market & Bias</th>
                      <th className="p-3">Trigger Rules</th>
                      <th className="p-3">Realized PnL</th>
                      <th className="p-3">Win Rate & Fills</th>
                      <th className="p-3">Bankroll Allowance</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {filteredAndSortedAgents.map((agent) => {
                      const allocated = agent.allocatedAllowance ?? 100;
                      const spent = agent.spentAllowance ?? 0;
                      const remaining = Math.max(0, allocated - spent);
                      const isTemplate = agent.id.startsWith('00000000-0000-0000-0000-') || agent.id.startsWith('template-');

                      return (
                        <tr key={agent.id} className="hover:bg-secondary/20 transition-colors font-sans">
                          {/* Name & Type */}
                          <td className="p-3">
                            <div className="flex flex-col">
                              <span className="font-bold text-foreground">{agent.name}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">{agent.strategyType}</span>
                            </div>
                          </td>

                          {/* Market & Bias */}
                          <td className="p-3 font-mono text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[9px] font-mono border-border">
                                {agent.symbol} · {agent.timeframe}
                              </Badge>
                              <span
                                className={cn(
                                  'font-bold text-[10px] px-1.5 py-0.5 rounded border',
                                  agent.rules?.action?.direction === 'CALL'
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                                )}
                              >
                                {agent.rules?.action?.direction || 'CALL'} ({agent.rules?.action?.durationSec || 60}s)
                              </span>
                            </div>
                          </td>

                          {/* Trigger summary */}
                          <td className="p-3 font-mono text-[10px] text-muted-foreground max-w-[220px] truncate">
                            {agent.rules?.conditions?.map((c) => `${c.indicator} ${c.operator === 'LESS_THAN' ? '<' : '>'} ${c.value}`).join(` ${agent.rules?.operator || 'AND'} `) || '—'}
                          </td>

                          {/* Realized PnL */}
                          <td className="p-3 font-mono font-bold">
                            <span
                              style={{
                                color:
                                  (agent.pnl ?? 0) > 0
                                    ? '#6ee7b7'
                                    : (agent.pnl ?? 0) < 0
                                    ? '#fda4af'
                                    : 'hsl(var(--muted-foreground))',
                              }}
                            >
                              {(agent.pnl ?? 0) > 0 ? `+${(agent.pnl ?? 0).toFixed(2)}` : (agent.pnl ?? 0).toFixed(2)} tUSDC
                            </span>
                          </td>

                          {/* Win Rate */}
                          <td className="p-3 font-mono text-[11px] text-foreground">
                            {(agent.tradesCount ?? 0) > 0
                              ? `${(agent.winRate ?? 0).toFixed(0)}% (${agent.tradesCount} fills)`
                              : '0 fills'}
                          </td>

                          {/* Allowance */}
                          <td className="p-3 font-mono text-[11px]">
                            <div className="flex flex-col">
                              <span className="font-bold text-foreground">${allocated.toFixed(0)} tUSDC</span>
                              <span className="text-[9px] text-muted-foreground">${remaining.toFixed(0)} remaining</span>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="p-3">
                            {agent.isDeployed ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span>ACTIVE</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono text-muted-foreground bg-secondary/50 border border-border/50">
                                {isTemplate ? 'TEMPLATE' : 'PAUSED'}
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="p-3 text-right">
                            <div className="inline-flex items-center gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => handleLoadAgent(agent)}
                                className="px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold font-mono cursor-pointer"
                                title="Edit in Studio"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (onNavigateToBacktester) onNavigateToBacktester(agent.id, agent);
                                  else window.location.hash = '#backtest';
                                }}
                                className="px-2 py-1 rounded bg-secondary hover:bg-secondary/80 border border-border/60 text-xs font-semibold cursor-pointer"
                                title="Backtest Replay"
                              >
                                Backtest
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleDeploy(agent)}
                                disabled={actionLoadingId === agent.id}
                                className={cn(
                                  "px-2 py-1 rounded text-xs font-bold font-mono transition-colors cursor-pointer",
                                  agent.isDeployed
                                    ? "bg-amber-500/15 border border-amber-500/40 text-amber-400 hover:bg-amber-500/25"
                                    : "bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25"
                                )}
                              >
                                {agent.isDeployed ? 'Pause' : 'Deploy'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicateAgent(agent)}
                                className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                                title="Duplicate"
                              >
                                <DocumentDuplicateIcon className="w-3.5 h-3.5" />
                              </button>
                              {!isTemplate && (
                                <button
                                  type="button"
                                  onClick={() => setAgentToDelete(agent)}
                                  className="p-1 text-muted-foreground hover:text-red-400 cursor-pointer"
                                  title="Delete"
                                >
                                  <TrashIcon className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ----------------- MODAL 1: STRATEGY JSON EXPORT / IMPORT ----------------- */}
      {isJsonModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="terminal-panel max-w-xl w-full p-5 flex flex-col gap-4 border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <CodeBracketIcon className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  {jsonModalMode === 'EXPORT' ? 'Export Strategy Configuration (JSON)' : 'Import Strategy Configuration (JSON)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsJsonModalOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {jsonModalMode === 'EXPORT' ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  Copy this JSON configuration to share with other traders or archive your strategy blueprint.
                </p>
                <textarea
                  readOnly
                  value={jsonText}
                  rows={12}
                  className="w-full p-3 rounded-lg bg-background border border-border text-[11px] font-mono text-foreground focus:outline-none select-all"
                />
                <div className="flex items-center justify-between pt-2">
                  {jsonCopySuccess && (
                    <span className="text-xs text-emerald-400 font-mono flex items-center gap-1">
                      <CheckCircleIcon className="w-3.5 h-3.5" /> Copied to clipboard!
                    </span>
                  )}
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={handleCopyJsonToClipboard}
                      className="px-3.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <ClipboardIcon className="w-3.5 h-3.5" />
                      <span>Copy JSON</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadJsonFile}
                      className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                      <span>Download .JSON</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  Paste a valid strategy JSON definition or upload a <code className="text-primary font-mono">.json</code> file to import into the Studio Builder.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1 rounded bg-secondary hover:bg-secondary/80 border border-border text-xs font-medium text-foreground flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                    <span>Upload File</span>
                  </button>
                  <span className="text-[10px] font-mono text-muted-foreground">or paste below:</span>
                </div>
                <textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  rows={10}
                  placeholder='{ "name": "My Strategy", "rules": { ... } }'
                  className="w-full p-3 rounded-lg bg-background border border-border text-[11px] font-mono text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40"
                />
                {jsonError && (
                  <div className="text-xs text-rose-400 font-mono flex items-center gap-1">
                    <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                    <span>{jsonError}</span>
                  </div>
                )}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsJsonModalOpen(false)}
                    className="px-3.5 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyImportedJson}
                    disabled={!jsonText.trim()}
                    className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 cursor-pointer"
                  >
                    Load into Studio
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------------- MODAL 2: SAFE DELETION CONFIRMATION ----------------- */}
      {agentToDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="terminal-panel max-w-md w-full p-5 flex flex-col gap-4 border-red-500/30 bg-card shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 grid place-items-center flex-shrink-0">
                <TrashIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Delete Strategy</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Are you sure you want to permanently delete this strategy?</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 font-mono text-xs text-foreground">
              <span className="font-bold">{agentToDelete.name}</span>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {agentToDelete.symbol} · {agentToDelete.timeframe} · {agentToDelete.rules?.action?.direction || 'CALL'}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAgentToDelete(null)}
                className="px-3.5 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold cursor-pointer"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
