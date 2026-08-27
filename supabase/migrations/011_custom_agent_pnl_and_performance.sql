-- ==============================================================================
-- Migration: 011_custom_agent_pnl_and_performance.sql
-- Description: Adds pnl, win_rate, and trades_count columns to custom_agents table
-- to persist live and simulated performance metrics for custom autonomous strategy agents.
-- ==============================================================================

-- 1. Add performance tracking columns to custom_agents
ALTER TABLE public.custom_agents 
ADD COLUMN IF NOT EXISTS pnl NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS win_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS trades_count INTEGER NOT NULL DEFAULT 0;

-- 2. Update default metrics for Starter Templates
UPDATE public.custom_agents
SET pnl = 31.20, win_rate = 71.40, trades_count = 14
WHERE id = '00000000-0000-0000-0000-000000000001' AND (pnl = 0.00 OR pnl IS NULL);

UPDATE public.custom_agents
SET pnl = 18.50, win_rate = 64.30, trades_count = 11
WHERE id = '00000000-0000-0000-0000-000000000002' AND (pnl = 0.00 OR pnl IS NULL);

UPDATE public.custom_agents
SET pnl = 24.80, win_rate = 68.80, trades_count = 16
WHERE id = '00000000-0000-0000-0000-000000000003' AND (pnl = 0.00 OR pnl IS NULL);
