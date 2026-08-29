/**
 * Shared TypeScript Domain Types for DreamPulse Frontend.
 */

export type MarketStatus = 'Open' | 'Closed' | 'Resolving' | 'Finalized';
export type OutcomeType = 'YES' | 'NO' | 'VOID';
export type OrderDirection = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'IOC' | 'POST_ONLY';
export type OrderStatus = 'PENDING' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED' | 'REJECTED';
export type OrderSource = 'SWARM' | 'TERMINAL';
export type SwarmAgentType = 'Volt' | 'Oracle' | 'Titan' | 'Sweeper';
export type AgentType = SwarmAgentType | 'Manual' | 'CUSTOM';

export interface Market {
  id: string;
  symbol: string; // "BTC/USD" | "ETH/USD"
  strikePrice: number;
  windowDuration: '1m' | '5m' | '15m' | '1h' | '4h' | '24h' | '7d' | string;
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
  poolAddress?: string;
  marketIdHex?: string;
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

export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBookDepth {
  yesBids: OrderBookLevel[];
  yesAsks: OrderBookLevel[];
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
  pnl?: number;
  isSettled?: boolean;
  settledAt?: string;
  createdAt: string;
  filledAt?: string;
  marketSnapshot?: {
    symbol: string;
    strikePrice: number;
    closeTimestamp: string;
    settlementPrice?: number;
    winningOutcome?: OutcomeType;
    windowDuration?: string;
  };
}

export interface SettlementSweep {
  id: string;
  userAddress: `0x${string}`;
  marketId: string;
  winningOutcome: OutcomeType;
  claimableAmount: number;
  payoutToken: string;
  isCompounded: boolean;
  txHash?: `0x${string}`;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  claimedAt: string;
}

export interface SweeperSummary {
  unclaimedAmount: number;
  totalClaimedAllTime: number;
  claimableMarketsCount: number;
  confirmedSweepsCount: number;
  unclaimedPositions: Array<{
    marketId: string;
    symbol: string;
    winningOutcome: OutcomeType;
    claimableAmount: number;
    isVoided: boolean;
    status: string;
  }>;
  autoCompound: boolean;
  compoundedStats: {
    totalCompoundedAmount: number;
    reinvestedCycles: number;
    lastCompoundedAt: string;
  };
}

export interface AgentThoughtLog {
  id: string;
  agentType: AgentType;
  marketId?: string;
  triggerEvent: string;
  confidence: number;
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
  createdAt: string;
}

export interface SwarmStatusSummary {
  volt: { status: string; evalLatencyMs: number; tradesToday: number; pnl: string };
  oracle: { status: string; evalLatencyMs: number; tradesToday: number; pnl: string };
  titan: { status: string; activeQuotes: number; spreadCaptured: string };
  sweeper: { status: string; lastSweep: string; totalClaimed: string };
}

export interface PortfolioSummary {
  userAddress: `0x${string}`;
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

export type SwarmMode = 'COPY' | 'PERSONAL';

export interface PersonalSwarmConfig {
  userAddress: `0x${string}`;
  mode: SwarmMode;
  copyTradeEnabled: boolean;
  voltEnabled: boolean;
  oracleEnabled: boolean;
  titanEnabled: boolean;
  sweeperEnabled: boolean;
  voltConfig: { driftThreshold: number; minEdge: number; lotSize: number; maxTradeSize?: number };
  oracleConfig: { minEdge: number; lotSize: number; maxTradeSize: number };
  titanConfig: { targetSpread: number; inventoryAversion: number; lotSize: number };
  customizedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalSwarmStatus {
  mode: SwarmMode;
  copyTradeEnabled: boolean;
  volt: { enabled: boolean; config: PersonalSwarmConfig['voltConfig']; pnl: number; tradesToday: number };
  oracle: { enabled: boolean; config: PersonalSwarmConfig['oracleConfig']; pnl: number; tradesToday: number };
  titan: { enabled: boolean; config: PersonalSwarmConfig['titanConfig']; pnl: number; tradesToday: number };
  sweeper: { enabled: boolean; pnl: number; sweeps: number };
  customizedAt?: string;
  isCopyMode: boolean;
}

// ------------------------------------------------------------------------------
// Custom Agent & Swarm Definitions (Strategy Studio)
// ------------------------------------------------------------------------------
export type IndicatorType = 'RSI' | 'SMA' | 'EMA' | 'BOLLINGER_UPPER' | 'BOLLINGER_LOWER' | 'MACD' | 'PRICE_DRIFT';
export type ComparisonOperator = 'CROSS_ABOVE' | 'CROSS_BELOW' | 'GREATER_THAN' | 'LESS_THAN' | 'EQUALS';
export type BinaryActionDirection = 'CALL' | 'PUT';

export interface ConditionRule {
  id: string;
  indicator: IndicatorType;
  period?: number;
  secondaryPeriod?: number;
  stdDev?: number;
  operator: ComparisonOperator;
  value: number;
}

export interface ActionRule {
  direction: BinaryActionDirection;
  durationSec: number;
  stakeType: 'FIXED' | 'PERCENTAGE';
  stakeAmount: number;
}

export interface RiskRule {
  maxConsecutiveLosses: number;
  cooldownMinutes: number;
  minPoolPayoutPct: number;
  dailyDrawdownLimitPct?: number;
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

// ------------------------------------------------------------------------------
// Swarm Arena & Social Prediction Types
// ------------------------------------------------------------------------------
export type ArenaTimeframe = '24h' | '7d' | '30d' | 'ALL';
export type ArenaSortBy = 'pnl' | 'winRate' | 'trades' | 'sharpe' | 'volume' | 'streak';
export type ArenaTierBadge = 'APEX' | 'GRANDMASTER' | 'MASTER' | 'PRO' | 'EMERGING';

export interface ArenaAgentEntry {
  id: string;
  name: string;
  description: string;
  creatorAddress: string;
  creatorName: string;
  isProtocolArchetype: boolean;
  symbol: string;
  timeframe: string;
  strategyType: string;
  color: string;
  icon: string;
  pnl: number;
  pnlPct: number;
  winRate: number;
  tradesCount: number;
  winsCount: number;
  lossesCount: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdownPct: number;
  allocatedAllowance: number;
  spentAllowance: number;
  clonesCount: number;
  copiersCount: number;
  rank: number;
  tierBadge: ArenaTierBadge;
  tags: string[];
  rulesSummary: string[];
  sparkline: number[];
  isActive: boolean;
  isDeployed: boolean;
  createdAt: string;
}

export interface ArenaTraderEntry {
  rank: number;
  userAddress: string;
  traderTitle: string;
  realizedPnl: number;
  pnlPct: number;
  winRate: number;
  tradesCount: number;
  winsCount: number;
  lossesCount: number;
  volume: number;
  currentStreak: number;
  bestStreak: number;
  copilotSynergyScore: number;
  favoriteSymbol: string;
  favoriteWindow: string;
  tierBadge: ArenaTierBadge;
  sparkline: number[];
  lastActiveAt: string;
}

export interface TraderProfileDetail {
  summary: ArenaTraderEntry;
  assetDistribution: Array<{ symbol: string; percentage: number; volume: number; trades: number }>;
  timeframeDistribution: Array<{ timeframe: string; percentage: number; trades: number }>;
  equityCurve: Array<{ timestamp: number; date: string; pnl: number; cumulativePnl: number }>;
  recentTrades: OrderExecution[];
}

export interface ArenaGlobalStats {
  totalArenaVolume: number;
  totalCommunityPnl: number;
  totalActiveAgents: number;
  totalRegisteredTraders: number;
  apexWinStreak: number;
  totalClonesCount: number;
  generatedAt: string;
}

export type ProofOfAlphaCardType = 'AGENT' | 'TRADER' | 'SETTLEMENT';

export interface ProofOfAlphaCardConfig {
  cardType: ProofOfAlphaCardType;
  title: string;
  subtitle: string;
  badge: string;
  primaryMetricLabel: string;
  primaryMetricValue: string;
  primaryMetricPositive?: boolean;
  secondaryMetricLabel: string;
  secondaryMetricValue: string;
  tertiaryMetricLabel?: string;
  tertiaryMetricValue?: string;
  accentColor: string;
  walletOrAgentId: string;
  verifiedNetwork: string;
  txHash?: string;
  sparkline?: number[];
  rulesSummary?: string[];
}

