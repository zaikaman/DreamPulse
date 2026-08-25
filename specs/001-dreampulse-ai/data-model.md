# Data Model & Schema Specification: DreamPulse AI

**Feature Directory**: `specs/001-dreampulse-ai`  
**Date**: 2026-08-25  
**Status**: Completed  

---

## 1. Relational Database Schema (Supabase PostgreSQL)

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Markets Table (Cached DreamDEX Event Contracts)
CREATE TABLE IF NOT EXISTS public.markets (
    id VARCHAR(66) PRIMARY KEY, -- Contract Address or Market Key
    symbol VARCHAR(20) NOT NULL, -- e.g. "BTC/USD", "ETH/USD"
    strike_price NUMERIC(18, 4) NOT NULL,
    window_duration VARCHAR(10) NOT NULL, -- "5m", "15m", "1h"
    open_timestamp TIMESTAMPTZ NOT NULL,
    close_timestamp TIMESTAMPTZ NOT NULL,
    resolution_timestamp TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Open', -- 'Open', 'Closed', 'Resolving', 'Finalized'
    settlement_price NUMERIC(18, 4),
    winning_outcome VARCHAR(10), -- 'YES', 'NO', 'VOID'
    best_bid_yes NUMERIC(6, 4),
    best_ask_yes NUMERIC(6, 4),
    best_bid_no NUMERIC(6, 4),
    best_ask_no NUMERIC(6, 4),
    implied_prob_yes NUMERIC(6, 4),
    fair_value_yes NUMERIC(6, 4),
    edge_percentage NUMERIC(6, 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Non-Custodial Session Delegation Grants
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_address VARCHAR(42) NOT NULL,
    operator_address VARCHAR(42) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '["placeOrderFor", "cancelOrderFor"]'::jsonb,
    max_trade_size NUMERIC(18, 4) NOT NULL,
    daily_volume_cap NUMERIC(18, 4) NOT NULL,
    spent_today NUMERIC(18, 4) NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_user_address CHECK (user_address ~ '^0x[a-fA-F0-9]{40}$'),
    CONSTRAINT valid_operator_address CHECK (operator_address ~ '^0x[a-fA-F0-9]{40}$')
);

-- 3. Agent Configurations & Strategies
CREATE TABLE IF NOT EXISTS public.agent_strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_address VARCHAR(42) NOT NULL,
    session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
    agent_type VARCHAR(20) NOT NULL, -- 'Volt', 'Oracle', 'Titan', 'Sweeper'
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    target_symbols JSONB NOT NULL DEFAULT '["BTC/USD", "ETH/USD"]'::jsonb,
    risk_params JSONB NOT NULL DEFAULT '{}'::jsonb, -- { min_edge: 0.03, max_allocation: 10, drift_threshold: 0.002 }
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Orders & Trade Executions
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_address VARCHAR(42) NOT NULL,
    session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
    market_id VARCHAR(66) REFERENCES public.markets(id) ON DELETE CASCADE,
    agent_type VARCHAR(20) NOT NULL,
    outcome VARCHAR(10) NOT NULL, -- 'YES', 'NO'
    direction VARCHAR(10) NOT NULL, -- 'BUY', 'SELL'
    order_type VARCHAR(20) NOT NULL, -- 'LIMIT', 'IOC', 'POST_ONLY'
    price NUMERIC(6, 4) NOT NULL,
    lot_size NUMERIC(18, 4) NOT NULL,
    total_cost NUMERIC(18, 4) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED', 'REJECTED'
    tx_hash VARCHAR(66),
    pnl NUMERIC(18, 4) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    filled_at TIMESTAMPTZ
);

-- 5. Autonomous Settlement Sweeps
CREATE TABLE IF NOT EXISTS public.sweeps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_address VARCHAR(42) NOT NULL,
    market_id VARCHAR(66) REFERENCES public.markets(id) ON DELETE CASCADE,
    winning_outcome VARCHAR(10) NOT NULL,
    claimable_amount NUMERIC(18, 4) NOT NULL,
    payout_token VARCHAR(20) NOT NULL DEFAULT 'STT',
    is_compounded BOOLEAN NOT NULL DEFAULT TRUE,
    tx_hash VARCHAR(66),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'CONFIRMED', 'FAILED'
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Real-Time AI Agent Thought Stream & Telemetry
CREATE TABLE IF NOT EXISTS public.agent_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_type VARCHAR(20) NOT NULL,
    market_id VARCHAR(66) REFERENCES public.markets(id) ON DELETE SET NULL,
    trigger_event VARCHAR(50) NOT NULL, -- 'SPOT_DRIFT', 'PROBABILITY_ARBITRAGE', 'SPREAD_WIDENING', 'MARKET_SETTLED'
    confidence NUMERIC(4, 2) NOT NULL, -- 0.00 to 1.00
    action_taken VARCHAR(50) NOT NULL, -- 'TAKER_SNIPE', 'LIMIT_QUOTE', 'BATCH_CLAIM', 'PASS'
    reasoning_text TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Historical Backtest Simulation Runs
CREATE TABLE IF NOT EXISTS public.backtests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_address VARCHAR(42) NOT NULL,
    agent_type VARCHAR(20) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    initial_capital NUMERIC(18, 4) NOT NULL,
    strategy_config JSONB NOT NULL,
    total_trades INTEGER NOT NULL,
    win_rate NUMERIC(5, 2) NOT NULL,
    net_pnl NUMERIC(18, 4) NOT NULL,
    max_drawdown NUMERIC(5, 2) NOT NULL,
    sharpe_ratio NUMERIC(6, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for high-frequency queries
CREATE INDEX IF NOT EXISTS idx_markets_status ON public.markets(status);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.sessions(user_address, is_active);
CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders(user_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_timestamp ON public.agent_logs(created_at DESC);
```

---

## 2. TypeScript Domain Models

```typescript
export type MarketStatus = 'Open' | 'Closed' | 'Resolving' | 'Finalized';
export type OutcomeType = 'YES' | 'NO' | 'VOID';
export type OrderDirection = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'IOC' | 'POST_ONLY';
export type OrderStatus = 'PENDING' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED' | 'REJECTED';
export type AgentType = 'Volt' | 'Oracle' | 'Titan' | 'Sweeper';

export interface Market {
  id: string; // Contract Address
  symbol: string; // "BTC/USD" | "ETH/USD"
  strikePrice: number;
  windowDuration: '5m' | '15m' | '1h';
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
  createdAt: string;
}
```

---

## 3. State Machine Lifecycles

### 3.1 Market State Transitions
`Open` (Trading & quotes active)  
→ `Closed` (Expiry window reached, order placement halted)  
→ `Resolving` (Prophecy Oracle reading spot benchmark price)  
→ `Finalized` (Winning outcome published, claims enabled)

### 3.2 Session Delegation Lifecycle
`Created / Signed` (On-chain grant recorded)  
→ `Active` (Agents authorized for bounded order execution)  
→ `Volume Capped` (Daily cap reached, pauses orders until next 24h reset)  
→ `Revoked / Expired` (Session closed, immediate halt of agent actions)
