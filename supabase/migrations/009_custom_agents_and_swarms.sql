-- ==============================================================================
-- Migration: 009_custom_agents_and_swarms.sql
-- Description: Enables users to design, save, and backtest custom binary options
-- trading agents and multi-agent swarms without writing code.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Custom User-Defined Agents Table
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_custom_agent_address CHECK (user_address ~ '^0x[a-fA-F0-9]{40}$')
);

CREATE INDEX IF NOT EXISTS idx_custom_agents_user ON public.custom_agents(user_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_agents_symbol ON public.custom_agents(symbol);

-- ------------------------------------------------------------------------------
-- 2. Custom User-Defined Swarms Table
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 3. Row Level Security
-- ------------------------------------------------------------------------------
ALTER TABLE public.custom_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_swarms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read Custom Agents" ON public.custom_agents;
CREATE POLICY "Public Read Custom Agents" ON public.custom_agents FOR SELECT USING (true);

DROP POLICY IF EXISTS "User Modify Own Custom Agents" ON public.custom_agents;
CREATE POLICY "User Modify Own Custom Agents" ON public.custom_agents FOR ALL USING (true);

DROP POLICY IF EXISTS "Public Read Custom Swarms" ON public.custom_swarms;
CREATE POLICY "Public Read Custom Swarms" ON public.custom_swarms FOR SELECT USING (true);

DROP POLICY IF EXISTS "User Modify Own Custom Swarms" ON public.custom_swarms;
CREATE POLICY "User Modify Own Custom Swarms" ON public.custom_swarms FOR ALL USING (true);

-- ------------------------------------------------------------------------------
-- 4. Auto-update updated_at triggers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_custom_item_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_custom_agents_updated_at ON public.custom_agents;
CREATE TRIGGER trg_custom_agents_updated_at
    BEFORE UPDATE ON public.custom_agents
    FOR EACH ROW EXECUTE FUNCTION public.handle_custom_item_updated_at();

DROP TRIGGER IF EXISTS trg_custom_swarms_updated_at ON public.custom_swarms;
CREATE TRIGGER trg_custom_swarms_updated_at
    BEFORE UPDATE ON public.custom_swarms
    FOR EACH ROW EXECUTE FUNCTION public.handle_custom_item_updated_at();
