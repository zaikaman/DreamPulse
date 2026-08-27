-- ==============================================================================
-- DreamPulse - Supabase PostgreSQL Schema & Realtime Configuration
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. Markets Table (Cached DreamDEX Event Contracts)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.markets (
    id VARCHAR(66) PRIMARY KEY, -- Contract Address or Market Key (e.g. 0x...)
    symbol VARCHAR(20) NOT NULL, -- "BTC/USD", "ETH/USD"
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

-- ------------------------------------------------------------------------------
-- 2. Non-Custodial Session Delegation Grants
-- ------------------------------------------------------------------------------
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
    on_chain_tx_hash VARCHAR(66),
    on_chain_authorized BOOLEAN NOT NULL DEFAULT FALSE,
    vault_deposit_amount NUMERIC(18, 4),
    target_pool_address VARCHAR(42),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_user_address CHECK (user_address ~ '^0x[a-fA-F0-9]{40}$'),
    CONSTRAINT valid_operator_address CHECK (operator_address ~ '^0x[a-fA-F0-9]{40}$')
);

-- ------------------------------------------------------------------------------
-- 3. Agent Configurations & Strategies
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_address VARCHAR(42) NOT NULL,
    session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
    agent_type VARCHAR(20) NOT NULL, -- 'Volt', 'Oracle', 'Titan', 'Sweeper'
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    target_symbols JSONB NOT NULL DEFAULT '["BTC/USD", "ETH/USD"]'::jsonb,
    risk_params JSONB NOT NULL DEFAULT '{"min_edge": 0.03, "max_allocation": 10, "drift_threshold": 0.002}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 4. Orders & Trade Executions
-- ------------------------------------------------------------------------------
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
    is_settled BOOLEAN NOT NULL DEFAULT FALSE,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    filled_at TIMESTAMPTZ
);

-- ------------------------------------------------------------------------------
-- 5. Autonomous Settlement Sweeps
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sweeps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_address VARCHAR(42) NOT NULL,
    market_id VARCHAR(66) REFERENCES public.markets(id) ON DELETE CASCADE,
    winning_outcome VARCHAR(10) NOT NULL,
    claimable_amount NUMERIC(18, 4) NOT NULL,
    payout_token VARCHAR(20) NOT NULL DEFAULT 'tUSDC',
    is_compounded BOOLEAN NOT NULL DEFAULT TRUE,
    tx_hash VARCHAR(66),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'CONFIRMED', 'FAILED'
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 6. Real-Time AI Agent Thought Stream & Telemetry
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_type VARCHAR(20) NOT NULL,
    market_id VARCHAR(66) REFERENCES public.markets(id) ON DELETE SET NULL,
    trigger_event VARCHAR(50) NOT NULL, -- 'SPOT_DRIFT', 'PROBABILITY_ARBITRAGE', 'SPREAD_WIDENING', 'MARKET_SETTLED'
    confidence NUMERIC(4, 2) NOT NULL, -- 0.00 to 1.00
    action_taken VARCHAR(50) NOT NULL, -- 'TAKER_SNIPE', 'LIMIT_QUOTE', 'BATCH_CLAIM', 'HOLD'
    reasoning_text TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 7. Historical Backtest Simulation Runs
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- Indices for High-Frequency Quantitative Queries
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_markets_status ON public.markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_symbol_window ON public.markets(symbol, window_duration);
CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON public.sessions(user_address, is_active);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON public.orders(user_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_market ON public.orders(market_id, status);
CREATE INDEX IF NOT EXISTS idx_sweeps_user ON public.sweeps(user_address, status);
CREATE INDEX IF NOT EXISTS idx_agent_logs_created ON public.agent_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_type ON public.agent_logs(agent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backtests_user ON public.backtests(user_address, created_at DESC);

-- ------------------------------------------------------------------------------
-- Row Level Security (RLS) Policies
-- ------------------------------------------------------------------------------
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sweeps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtests ENABLE ROW LEVEL SECURITY;

-- Markets & Agent Logs are public read
CREATE POLICY "Public Read Markets" ON public.markets FOR SELECT USING (true);
CREATE POLICY "Public Read Agent Logs" ON public.agent_logs FOR SELECT USING (true);

-- User-scoped read/write for Sessions, Orders, Sweeps, Strategies, Backtests
CREATE POLICY "User Read Own Sessions" ON public.sessions FOR SELECT USING (true);
CREATE POLICY "User Modify Own Sessions" ON public.sessions FOR ALL USING (true);

CREATE POLICY "User Read Own Strategies" ON public.agent_strategies FOR SELECT USING (true);
CREATE POLICY "User Modify Own Strategies" ON public.agent_strategies FOR ALL USING (true);

CREATE POLICY "User Read Own Orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "User Insert Own Orders" ON public.orders FOR INSERT WITH CHECK (true);

CREATE POLICY "User Read Own Sweeps" ON public.sweeps FOR SELECT USING (true);
CREATE POLICY "User Read Own Backtests" ON public.backtests FOR SELECT USING (true);
CREATE POLICY "User Insert Own Backtests" ON public.backtests FOR INSERT WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 8. Persistent System State & Key Rotation Index
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_state (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.system_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Read System State" ON public.system_state FOR SELECT USING (true);
CREATE POLICY "Service Role Modify System State" ON public.system_state FOR ALL USING (true);

INSERT INTO public.system_state (key, value, description)
VALUES ('groq_key_rotation', '{"current_index": 0, "total_keys": 20}'::jsonb, 'Tracks round-robin Groq key index across server restarts')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 9. Personal Swarm Configs (Per-Wallet Isolated Strategy)
--    Mode: COPY (mirror operator) vs PERSONAL (user-owned independent swarm)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_swarm_configs (
    user_address VARCHAR(42) PRIMARY KEY,
    mode VARCHAR(16) NOT NULL DEFAULT 'COPY' CHECK (mode IN ('COPY', 'PERSONAL')),
    volt_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    oracle_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    titan_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sweeper_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    volt_config JSONB NOT NULL DEFAULT '{"driftThreshold": 0.002, "minEdge": 0.03, "lotSize": 5, "maxTradeSize": 20}'::jsonb,
    oracle_config JSONB NOT NULL DEFAULT '{"minEdge": 0.035, "lotSize": 5, "maxTradeSize": 20}'::jsonb,
    titan_config JSONB NOT NULL DEFAULT '{"targetSpread": 0.04, "inventoryAversion": 0.015, "lotSize": 2}'::jsonb,
    customized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_user_swarm_address CHECK (user_address ~ '^0x[a-fA-F0-9]{40}$')
);

CREATE INDEX IF NOT EXISTS idx_user_swarm_mode ON public.user_swarm_configs(mode);

ALTER TABLE public.user_swarm_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Read Swarm Configs" ON public.user_swarm_configs FOR SELECT USING (true);
CREATE POLICY "User Modify Own Swarm Config" ON public.user_swarm_configs FOR ALL USING (true);

