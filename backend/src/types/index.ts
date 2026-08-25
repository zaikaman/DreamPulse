import type { Hex } from 'viem';

/**
 * Shared TypeScript Domain Models for DreamPulse Backend Engine.
 */

export type MarketStatus = 'Open' | 'Closed' | 'Resolving' | 'Finalized';
export type OutcomeType = 'YES' | 'NO' | 'VOID';
export type OrderDirection = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'IOC' | 'POST_ONLY';
export type OrderStatus = 'PENDING' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED' | 'REJECTED';
export type AgentType = 'Volt' | 'Oracle' | 'Titan' | 'Sweeper';

export interface Market {
  id: string; // Contract Address or Market Key
  symbol: string; // "BTC/USD" | "ETH/USD"
  strikePrice: number;
  windowDuration: '5m' | '15m' | '1h' | '4h' | string;
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
  outcome: OutcomeType;
  direction: OrderDirection;
  orderType: OrderType;
  price: number;
  lotSize: number;
  totalCost: number;
  status: OrderStatus;
  txHash?: `0x${string}`;
  pnl?: number;
  createdAt: string;
  filledAt?: string;
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

export interface AgentThoughtLog {
  id: string;
  agentType: AgentType;
  marketId?: string;
  triggerEvent: string;
  confidence: number;
  actionTaken: string;
  reasoningText: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface BacktestResult {
  id: string;
  userAddress: `0x${string}`;
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

