-- ==============================================================================
-- Migration: 006_copy_trade_decoupling.sql
-- Description: Decouple non-custodial session delegation from autonomous swarm
-- copy-trading. Adds copy_trade_enabled flags to persist whether a user with
-- an active session has opted into background swarm mirror trading.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Add copy_trade_enabled to user_swarm_configs
-- ------------------------------------------------------------------------------
ALTER TABLE public.user_swarm_configs
    ADD COLUMN IF NOT EXISTS copy_trade_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for querying active personal swarm configs with copy-trading enabled
CREATE INDEX IF NOT EXISTS idx_user_swarm_copy_trade
    ON public.user_swarm_configs (copy_trade_enabled, mode);

-- ------------------------------------------------------------------------------
-- 2. Add copy_trade_enabled to sessions table
-- ------------------------------------------------------------------------------
ALTER TABLE public.sessions
    ADD COLUMN IF NOT EXISTS copy_trade_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for fast operator lookups of active copy-trading sessions
CREATE INDEX IF NOT EXISTS idx_sessions_copy_trade_active
    ON public.sessions (is_active, copy_trade_enabled, on_chain_authorized)
    WHERE is_active = TRUE;
