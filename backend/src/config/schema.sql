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
    copy_trade_enabled BOOLEAN NOT NULL DEFAULT FALSE,
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
    source VARCHAR(20) NOT NULL DEFAULT 'SWARM', -- 'SWARM', 'TERMINAL'
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
CREATE INDEX IF NOT EXISTS idx_sessions_copy_trade_active ON public.sessions(is_active, copy_trade_enabled, on_chain_authorized) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON public.orders(user_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_market ON public.orders(market_id, status);
CREATE INDEX IF NOT EXISTS idx_sweeps_user ON public.sweeps(user_address, status);
CREATE INDEX IF NOT EXISTS idx_agent_logs_created ON public.agent_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_type ON public.agent_logs(agent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backtests_user ON public.backtests(user_address, created_at DESC);

-- ------------------------------------------------------------------------------
-- Row Level Security (RLS) Policies — HARDENED
-- ------------------------------------------------------------------------------
-- Security model:
--   • Frontend ships VITE_SUPABASE_ANON_KEY (extractable). Anon MUST NOT
--     INSERT/UPDATE/DELETE user rows. Anyone with anon can otherwise DELETE FROM
--     sessions/orders/sweeps — previous USING (true) was wide-open.
--   • All mutations go through backend which uses SUPABASE_SERVICE_ROLE_KEY
--     (bypasses RLS). Frontend writes via /api/v1/* only.
--   • Direct Supabase reads for private tables require an authenticated JWT
--     with claim `user_address` (lowercase hex, 0x...). Mint after SIWE/EIP-712
--     verification: { "role": "authenticated", "user_address": "0xabc..." }.
--     Until that flow is wired, anon has NO access to private tables and
--     must use the backend REST API. See migration 012 for production deploy.
--   • Public tables (markets, agent_logs, system_state) keep anon SELECT;
--     DML is service_role only.
--   • Arena discovery tables (custom_agents/custom_swarms) keep public SELECT;
--     DML is owner-JWT + service_role only.
-- ------------------------------------------------------------------------------
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sweeps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtests ENABLE ROW LEVEL SECURITY;

-- Drop legacy permissive policies (idempotent)
DROP POLICY IF EXISTS "Public Read Markets" ON public.markets;
DROP POLICY IF EXISTS "Public Read Agent Logs" ON public.agent_logs;
DROP POLICY IF EXISTS "User Read Own Sessions" ON public.sessions;
DROP POLICY IF EXISTS "User Modify Own Sessions" ON public.sessions;
DROP POLICY IF EXISTS "User Read Own Strategies" ON public.agent_strategies;
DROP POLICY IF EXISTS "User Modify Own Strategies" ON public.agent_strategies;
DROP POLICY IF EXISTS "User Read Own Orders" ON public.orders;
DROP POLICY IF EXISTS "User Insert Own Orders" ON public.orders;
DROP POLICY IF EXISTS "User Read Own Sweeps" ON public.sweeps;
DROP POLICY IF EXISTS "User Read Own Backtests" ON public.backtests;
DROP POLICY IF EXISTS "User Insert Own Backtests" ON public.backtests;
-- Drop hardened names if re-applying
DROP POLICY IF EXISTS "Markets public read" ON public.markets;
DROP POLICY IF EXISTS "Markets service_role all" ON public.markets;
DROP POLICY IF EXISTS "Agent Logs public read" ON public.agent_logs;
DROP POLICY IF EXISTS "Agent Logs service_role all" ON public.agent_logs;
DROP POLICY IF EXISTS "sessions_owner_select" ON public.sessions;
DROP POLICY IF EXISTS "sessions_owner_insert" ON public.sessions;
DROP POLICY IF EXISTS "sessions_owner_update" ON public.sessions;
DROP POLICY IF EXISTS "sessions_owner_delete" ON public.sessions;
DROP POLICY IF EXISTS "sessions_service_role" ON public.sessions;
DROP POLICY IF EXISTS "strategies_owner_select" ON public.agent_strategies;
DROP POLICY IF EXISTS "strategies_owner_insert" ON public.agent_strategies;
DROP POLICY IF EXISTS "strategies_owner_update" ON public.agent_strategies;
DROP POLICY IF EXISTS "strategies_owner_delete" ON public.agent_strategies;
DROP POLICY IF EXISTS "strategies_service_role" ON public.agent_strategies;
DROP POLICY IF EXISTS "orders_owner_select" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_update" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_delete" ON public.orders;
DROP POLICY IF EXISTS "orders_service_role" ON public.orders;
DROP POLICY IF EXISTS "sweeps_owner_select" ON public.sweeps;
DROP POLICY IF EXISTS "sweeps_owner_insert" ON public.sweeps;
DROP POLICY IF EXISTS "sweeps_owner_update" ON public.sweeps;
DROP POLICY IF EXISTS "sweeps_owner_delete" ON public.sweeps;
DROP POLICY IF EXISTS "sweeps_service_role" ON public.sweeps;
DROP POLICY IF EXISTS "backtests_owner_select" ON public.backtests;
DROP POLICY IF EXISTS "backtests_owner_insert" ON public.backtests;
DROP POLICY IF EXISTS "backtests_owner_update" ON public.backtests;
DROP POLICY IF EXISTS "backtests_owner_delete" ON public.backtests;
DROP POLICY IF EXISTS "backtests_service_role" ON public.backtests;

-- Markets & Agent Logs: public read, service_role writes only
CREATE POLICY "Markets public read" ON public.markets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Markets service_role all" ON public.markets FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Agent Logs public read" ON public.agent_logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Agent Logs service_role all" ON public.agent_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Sessions: owner JWT + service_role only (anon blocked)
CREATE POLICY "sessions_owner_select" ON public.sessions FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "sessions_owner_insert" ON public.sessions FOR INSERT TO authenticated WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "sessions_owner_update" ON public.sessions FOR UPDATE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address)) WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "sessions_owner_delete" ON public.sessions FOR DELETE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "sessions_service_role" ON public.sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Agent Strategies: owner JWT + service_role only
CREATE POLICY "strategies_owner_select" ON public.agent_strategies FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "strategies_owner_insert" ON public.agent_strategies FOR INSERT TO authenticated WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "strategies_owner_update" ON public.agent_strategies FOR UPDATE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address)) WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "strategies_owner_delete" ON public.agent_strategies FOR DELETE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "strategies_service_role" ON public.agent_strategies FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Orders: owner JWT + service_role only
CREATE POLICY "orders_owner_select" ON public.orders FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "orders_owner_insert" ON public.orders FOR INSERT TO authenticated WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "orders_owner_update" ON public.orders FOR UPDATE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address)) WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "orders_owner_delete" ON public.orders FOR DELETE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "orders_service_role" ON public.orders FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Sweeps: owner JWT (read) + service_role (backend inserts claims)
CREATE POLICY "sweeps_owner_select" ON public.sweeps FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "sweeps_owner_insert" ON public.sweeps FOR INSERT TO authenticated WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "sweeps_owner_update" ON public.sweeps FOR UPDATE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address)) WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "sweeps_owner_delete" ON public.sweeps FOR DELETE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "sweeps_service_role" ON public.sweeps FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Backtests: owner JWT + service_role only
CREATE POLICY "backtests_owner_select" ON public.backtests FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "backtests_owner_insert" ON public.backtests FOR INSERT TO authenticated WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "backtests_owner_update" ON public.backtests FOR UPDATE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address)) WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "backtests_owner_delete" ON public.backtests FOR DELETE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "backtests_service_role" ON public.backtests FOR ALL TO service_role USING (true) WITH CHECK (true);

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
-- Drop legacy open policies
DROP POLICY IF EXISTS "Public Read System State" ON public.system_state;
DROP POLICY IF EXISTS "Service Role Modify System State" ON public.system_state;
DROP POLICY IF EXISTS "System State public read" ON public.system_state;
DROP POLICY IF EXISTS "System State service_role all" ON public.system_state;
-- Public read is safe; writes are service_role only (backend key rotation)
CREATE POLICY "System State public read" ON public.system_state FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "System State service_role all" ON public.system_state FOR ALL TO service_role USING (true) WITH CHECK (true);

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
    copy_trade_enabled BOOLEAN NOT NULL DEFAULT FALSE,
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
CREATE INDEX IF NOT EXISTS idx_user_swarm_copy_trade ON public.user_swarm_configs(copy_trade_enabled, mode);

ALTER TABLE public.user_swarm_configs ENABLE ROW LEVEL SECURITY;
-- Drop legacy open policies
DROP POLICY IF EXISTS "Public Read Swarm Configs" ON public.user_swarm_configs;
DROP POLICY IF EXISTS "User Modify Own Swarm Config" ON public.user_swarm_configs;
DROP POLICY IF EXISTS "swarm_configs_owner_select" ON public.user_swarm_configs;
DROP POLICY IF EXISTS "swarm_configs_owner_insert" ON public.user_swarm_configs;
DROP POLICY IF EXISTS "swarm_configs_owner_update" ON public.user_swarm_configs;
DROP POLICY IF EXISTS "swarm_configs_owner_delete" ON public.user_swarm_configs;
DROP POLICY IF EXISTS "swarm_configs_service_role" ON public.user_swarm_configs;
DROP POLICY IF EXISTS "UserSwarm public read fallback" ON public.user_swarm_configs;
-- Private per-wallet: owner JWT + service_role only (anon blocked)
CREATE POLICY "swarm_configs_owner_select" ON public.user_swarm_configs FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "swarm_configs_owner_insert" ON public.user_swarm_configs FOR INSERT TO authenticated WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "swarm_configs_owner_update" ON public.user_swarm_configs FOR UPDATE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address)) WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "swarm_configs_owner_delete" ON public.user_swarm_configs FOR DELETE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "swarm_configs_service_role" ON public.user_swarm_configs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 10. Custom User-Defined Agents & Multi-Agent Swarms
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address VARCHAR(42) NOT NULL,
    name VARCHAR(64) NOT NULL,
    description TEXT,
    symbol VARCHAR(32) NOT NULL DEFAULT 'BTC/USD',
    timeframe VARCHAR(8) NOT NULL DEFAULT '5m',
    strategy_type VARCHAR(32) NOT NULL DEFAULT 'MOMENTUM',
    rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    color VARCHAR(16) NOT NULL DEFAULT '#2dd4bf',
    icon VARCHAR(32) NOT NULL DEFAULT 'BoltIcon',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_deployed BOOLEAN NOT NULL DEFAULT FALSE,
    allocated_allowance NUMERIC(16, 2) NOT NULL DEFAULT 100.00,
    spent_allowance NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    pnl NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    win_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    trades_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_custom_agent_address CHECK (user_address ~ '^0x[a-fA-F0-9]{40}$')
);

CREATE INDEX IF NOT EXISTS idx_custom_agents_deployment ON public.custom_agents(user_address, is_deployed);

CREATE INDEX IF NOT EXISTS idx_custom_agents_user ON public.custom_agents(user_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_agents_symbol ON public.custom_agents(symbol);

CREATE TABLE IF NOT EXISTS public.custom_swarms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address VARCHAR(42) NOT NULL,
    name VARCHAR(64) NOT NULL,
    description TEXT,
    agent_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    consensus_rule VARCHAR(32) NOT NULL DEFAULT 'MAJORITY' CHECK (consensus_rule IN ('UNANIMOUS', 'MAJORITY', 'WEIGHTED', 'VETO')),
    confidence_threshold NUMERIC(4, 2) NOT NULL DEFAULT 0.60,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_custom_swarm_address CHECK (user_address ~ '^0x[a-fA-F0-9]{40}$')
);

CREATE INDEX IF NOT EXISTS idx_custom_swarms_user ON public.custom_swarms(user_address, created_at DESC);

ALTER TABLE public.custom_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_swarms ENABLE ROW LEVEL SECURITY;

-- Drop legacy open policies
DROP POLICY IF EXISTS "Public Read Custom Agents" ON public.custom_agents;
DROP POLICY IF EXISTS "User Modify Own Custom Agents" ON public.custom_agents;
DROP POLICY IF EXISTS "Public Read Custom Swarms" ON public.custom_swarms;
DROP POLICY IF EXISTS "User Modify Own Custom Swarms" ON public.custom_swarms;
DROP POLICY IF EXISTS "Custom Agents public read" ON public.custom_agents;
DROP POLICY IF EXISTS "custom_agents_owner_insert" ON public.custom_agents;
DROP POLICY IF EXISTS "custom_agents_owner_update" ON public.custom_agents;
DROP POLICY IF EXISTS "custom_agents_owner_delete" ON public.custom_agents;
DROP POLICY IF EXISTS "custom_agents_service_role" ON public.custom_agents;
DROP POLICY IF EXISTS "Custom Swarms public read" ON public.custom_swarms;
DROP POLICY IF EXISTS "custom_swarms_owner_insert" ON public.custom_swarms;
DROP POLICY IF EXISTS "custom_swarms_owner_update" ON public.custom_swarms;
DROP POLICY IF EXISTS "custom_swarms_owner_delete" ON public.custom_swarms;
DROP POLICY IF EXISTS "custom_swarms_service_role" ON public.custom_swarms;

-- Arena discovery: public SELECT for leaderboard/social clone; DML is owner JWT + service_role only
CREATE POLICY "Custom Agents public read" ON public.custom_agents FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "custom_agents_owner_insert" ON public.custom_agents FOR INSERT TO authenticated WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "custom_agents_owner_update" ON public.custom_agents FOR UPDATE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address)) WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "custom_agents_owner_delete" ON public.custom_agents FOR DELETE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "custom_agents_service_role" ON public.custom_agents FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Custom Swarms public read" ON public.custom_swarms FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "custom_swarms_owner_insert" ON public.custom_swarms FOR INSERT TO authenticated WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "custom_swarms_owner_update" ON public.custom_swarms FOR UPDATE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address)) WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "custom_swarms_owner_delete" ON public.custom_swarms FOR DELETE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "custom_swarms_service_role" ON public.custom_swarms FOR ALL TO service_role USING (true) WITH CHECK (true);

