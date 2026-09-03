import type { Hex } from 'viem';

/**
 * Shared TypeScript Domain Models for DreamPulse Backend Engine.
 */

export type MarketStatus = 'Open' | 'Closed' | 'Resolving' | 'Finalized';
export type OutcomeType = 'YES' | 'NO' | 'VOID';
export type OrderDirection = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'IOC' | 'POST_ONLY';
export type OrderStatus = 'PENDING' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED' | 'REJECTED' | 'EXPIRED';
export type OrderSource = 'SWARM' | 'TERMINAL';
export type SwarmAgentType = 'Volt' | 'Oracle' | 'Titan' | 'Sweeper';
export type AgentType = SwarmAgentType | 'Manual' | 'CUSTOM';

export interface Market {
  id: string; // Contract Address or Market Key
  symbol: string; // "BTC/USD" | "ETH/USD"
  strikePrice: number;
  windowDuration: '1m' | '5m' | '15m' | '1h' | '4h' | string;
  openTimestamp: string;
  closeTimestamp: string;
  resolutionTimestamp: string;
  status: MarketStatus;
  settlementPrice?: number;
  winningOutcome?: OutcomeType;
  bestBidYes: number;
  bestAskYes: number;
  bestBidNo: number;
  bestAskNo: number;
  impliedProbYes: number;
  fairValueYes: number;
  edgePercentage: number;
  // On-chain protocol fields
  poolAddress?: string;
  marketIdHex?: Hex;
  venueId?: string;
  operatorId?: number;
  yesTokenId?: string;
  noTokenId?: string;
  intervalSec?: number;
  onchainStatus?: number;
  isSynthetic?: boolean;
  isSeedDepth?: boolean;
  // Confluence & Price Action Fields
  convictionState?: 'HIGH_CONVICTION' | 'MODERATE' | 'CAUTION_COUNTER_TREND' | 'NEUTRAL';
  recommendedAction?: 'BUY_UP' | 'BUY_DOWN' | 'WAIT';
  recommendedOutcome?: 'YES' | 'NO' | 'NONE';
  winProbability?: number;
  confidenceScore?: number;
  priceActionTrend?: string;
  priceActionScore?: number;
  confluenceRationale?: string;
}

export interface SessionGrant {
  id: string;
  userAddress: `0x${string}`;
  operatorAddress: `0x${string}`;
  permissions: Array<'placeOrderFor' | 'cancelOrderFor'>;
  maxTradeSize: number;
  dailyVolumeCap: number;
  spentToday: number;
  expiresAt: string;
  isActive: boolean;
  onChainTxHash?: `0x${string}`;
  vaultDepositAmount?: number;
  targetPoolAddress?: `0x${string}`;
  onChainAuthorized?: boolean;
  copyTradeEnabled?: boolean;
}

export interface AgentStrategy {
  id: string;
  userAddress: `0x${string}`;
  sessionId?: string;
  agentType: AgentType;
  isEnabled: boolean;
  targetSymbols: string[];
  riskParams: {
    minEdge: number;
    maxAllocation: number;
    driftThreshold?: number;
    spreadTolerance?: number;
  };
}

export interface OrderExecution {
  id: string;
  userAddress: `0x${string}`;
  sessionId?: string;
  customAgentId?: string;
  customAgentName?: string;
  marketId: string;
  agentType: AgentType;
  source?: OrderSource;
  outcome: OutcomeType;
  direction: OrderDirection;
  orderType: OrderType;
  price: number;
  lotSize: number;
  totalCost: number;
  status: OrderStatus;
  txHash?: `0x${string}`;
  cancelTxHash?: `0x${string}`;
  onchainOrderId?: string;
  pnl?: number;
  isSettled?: boolean;
  settledAt?: string;
  createdAt: string;
  filledAt?: string;
  // Snapshot of market at trade time for reliable post-expiry settlement even if market later evicted from memory
  marketSnapshot?: {
    symbol: string;
    strikePrice: number;
    closeTimestamp: string;
    settlementPrice?: number;
    winningOutcome?: OutcomeType;
    windowDuration?: string;
    recommendedOutcome?: 'YES' | 'NO' | 'NONE';
  };
}

export interface SettlementSweep {
  id: string;
  userAddress: `0x${string}`;
  marketId: string;
  winningOutcome: OutcomeType;
  claimableAmount: number;
  payoutToken: string;
  isCompounded?: boolean;
  txHash?: `0x${string}`;
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'FAILED';
  claimedAt: string;
}

export interface AgentThoughtLog {
  id: string;
  agentType: AgentType;
  marketId?: string;
  triggerEvent: string;
  confidence?: number;
  actionTaken: string;
  reasoningText: string;
  txHash?: string;
  isExecution?: boolean;
  price?: number;
  lotSize?: number;
  outcome?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface BacktestResult {
  id: string;
  userAddress?: `0x${string}`;
  agentType: AgentType;
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  strategyConfig: Record<string, unknown>;
  totalTrades: number;
  winRate: number;
  netPnl: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio?: number;
  profitFactor?: number;
  expectancy?: number;
  payoffRatio?: number;
  avgWin?: number;
  avgLoss?: number;
  totalWins?: number;
  totalLosses?: number;
  totalFeesPaid?: number;
  timeframe?: string;
  period?: string;
  createdAt: string;
}

export interface SwarmStatusSummary {
  volt: { status: string; evalLatencyMs: number; tradesToday: number; pnl: string };
  oracle: { status: string; evalLatencyMs: number; tradesToday: number; pnl: string };
  titan: { status: string; activeQuotes: number; spreadCaptured: string };
  sweeper: { status: string; lastSweep: string; totalClaimed: string };
}

export interface PortfolioSummary {
  userAddress: string;
  isOperator: boolean;
  realizedPnl: number;
  unclaimedPnl: number;
  totalClaimedAllTime: number;
  totalPnl: number;
  activePositionsCount: number;
  ordersTodayCount: number;
  volumeToday: number;
  dailyVolumeCap: number;
  maxTradeSize: number;
  hasActiveSession: boolean;
}

// ------------------------------------------------------------------------------
// Custom Agent & Swarm Definitions
// ------------------------------------------------------------------------------
export type IndicatorType =
  | 'RSI'
  | 'SMA'
  | 'EMA'
  | 'BOLLINGER_UPPER'
  | 'BOLLINGER_LOWER'
  | 'MACD'
  | 'STOCHASTIC'
  | 'ATR'
  | 'VWAP'
  | 'VOLUME_SURGE'
  | 'ADX'
  | 'CCI'
  | 'WILLIAMS_R'
  | 'PRICE_DRIFT';

export type ComparisonOperator = 'CROSS_ABOVE' | 'CROSS_BELOW' | 'GREATER_THAN' | 'LESS_THAN' | 'EQUALS';
export type BinaryActionDirection = 'CALL' | 'PUT';

export interface ConditionRule {
  id: string;
  indicator: IndicatorType;
  period?: number;
  secondaryPeriod?: number;
  signalPeriod?: number;
  stdDev?: number;
  multiplier?: number;
  operator: ComparisonOperator;
  value: number;
}

export interface ActionRule {
  direction: BinaryActionDirection;
  durationSec: number;
  stakeType: 'FIXED' | 'PERCENTAGE';
  stakeAmount: number;
  orderType?: 'MARKET' | 'LIMIT';
  limitPricing?: 'BEST_BID_ASK' | 'MIDPOINT' | 'DISCOUNT_OFFSET';
  limitOffsetBps?: number;
  maxSlippageBps?: number;
}

export interface RiskRule {
  maxConsecutiveLosses: number;
  cooldownMinutes: number;
  minPoolPayoutPct: number;
  dailyDrawdownLimitPct?: number;
  martingaleMultiplier?: number;
  takeProfitTargetPct?: number;
  trailingStopPct?: number;
  expiryBufferSec?: number;
}

export interface CustomAgentRules {
  operator: 'AND' | 'OR';
  conditions: ConditionRule[];
  action: ActionRule;
  risk: RiskRule;
}

export interface CustomAgentDefinition {
  id: string;
  userAddress: string;
  name: string;
  description: string;
  symbol: string;
  timeframe: '1m' | '5m' | '15m' | '1h';
  strategyType: 'MOMENTUM' | 'MEAN_REVERSION' | 'BREAKOUT' | 'VOLATILITY' | 'CUSTOM';
  rules: CustomAgentRules;
  color: string;
  icon: string;
  isActive: boolean;
  isDeployed?: boolean;
  allocatedAllowance?: number;
  spentAllowance?: number;
  pnl?: number;
  winRate?: number;
  tradesCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface SwarmMemberConfig {
  agentId: string;
  agentName: string;
  role: 'SCOUT' | 'OSCILLATOR' | 'VETO' | 'EXECUTOR';
  weight: number;
}

export interface CustomSwarmDefinition {
  id: string;
  userAddress: string;
  name: string;
  description: string;
  agents: SwarmMemberConfig[];
  consensusRule: 'UNANIMOUS' | 'MAJORITY' | 'WEIGHTED' | 'VETO';
  confidenceThreshold: number;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

