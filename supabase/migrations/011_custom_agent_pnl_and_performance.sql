-- ==============================================================================
-- Migration: 011_custom_agent_pnl_and_performance.sql
-- Description: Adds pnl, win_rate, and trades_count columns to custom_agents table
-- initialized to zero for real-time tracking of agent performance.
-- ==============================================================================

ALTER TABLE public.custom_agents 
ADD COLUMN IF NOT EXISTS pnl NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS win_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS trades_count INTEGER NOT NULL DEFAULT 0;
