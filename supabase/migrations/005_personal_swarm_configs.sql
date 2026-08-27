-- ==============================================================================
-- Migration: 005_personal_swarm_configs.sql
-- Description: Per-wallet isolated Personal Swarm (COPY vs PERSONAL mode).
-- Every wallet mirrors the Protocol Swarm via copy-trade by default;
-- when a user customizes params, a dedicated swarm runs with own evaluation
-- loop and inventory. This table is the single source of truth for that.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Personal Swarm Configs Table
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

-- Index for swarm runner personal evaluation loop (scan PERSONAL only, max 30/cycle)
CREATE INDEX IF NOT EXISTS idx_user_swarm_mode ON public.user_swarm_configs(mode);

-- ------------------------------------------------------------------------------
-- 2. Row Level Security
-- ------------------------------------------------------------------------------
ALTER TABLE public.user_swarm_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read Swarm Configs" ON public.user_swarm_configs;
CREATE POLICY "Public Read Swarm Configs" ON public.user_swarm_configs FOR SELECT USING (true);

DROP POLICY IF EXISTS "User Modify Own Swarm Config" ON public.user_swarm_configs;
CREATE POLICY "User Modify Own Swarm Config" ON public.user_swarm_configs FOR ALL USING (true);

-- ------------------------------------------------------------------------------
-- 3. Auto-update updated_at trigger (optional, keeps Supabase dashboard in sync)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_user_swarm_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_swarm_updated_at ON public.user_swarm_configs;
CREATE TRIGGER trg_user_swarm_updated_at
    BEFORE UPDATE ON public.user_swarm_configs
    FOR EACH ROW EXECUTE FUNCTION public.handle_user_swarm_updated_at();
