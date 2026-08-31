-- ==============================================================================
-- Migration: 014_custom_agent_order_link.sql
-- Description: Links orders to the originating custom agent for accurate
--   per-agent PnL attribution in Swarm Arena leaderboards.
--   Previously, orders for CUSTOM agents were stored with only agent_type
--   and user_address, losing the specific custom_agent_id. This caused the
--   leaderboard fallback (symbol+window matching) to double-count or
--   misattribute PnL when a user owned multiple agents with the same symbol.
--   This migration adds the missing foreign-key columns and indexes.
-- ==============================================================================

-- 1. Add custom_agent columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS custom_agent_id UUID REFERENCES public.custom_agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS custom_agent_name VARCHAR(64);

-- Index for leaderboard per-agent aggregation and settlement attribution
CREATE INDEX IF NOT EXISTS idx_orders_custom_agent ON public.orders(custom_agent_id, is_settled, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_custom_agent ON public.orders(user_address, custom_agent_id, created_at DESC);

COMMENT ON COLUMN public.orders.custom_agent_id IS 'FK to custom_agents.id for CUSTOM swarm orders; NULL for Volt/Oracle/Titan/Manual.';
COMMENT ON COLUMN public.orders.custom_agent_name IS 'Denormalized agent name at execution time for display even if agent is later deleted.';
