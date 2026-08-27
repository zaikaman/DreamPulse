-- ==============================================================================
-- Migration: 010_agent_allowance_and_deployment.sql
-- Description: Adds is_deployed, allocated_allowance, and spent_allowance to 
-- custom_agents to support independent agent deployment with granular tUSDC bankroll allowances.
-- ==============================================================================

ALTER TABLE public.custom_agents 
ADD COLUMN IF NOT EXISTS is_deployed BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS allocated_allowance NUMERIC(16, 2) NOT NULL DEFAULT 100.00,
ADD COLUMN IF NOT EXISTS spent_allowance NUMERIC(16, 2) NOT NULL DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_custom_agents_deployment 
ON public.custom_agents(user_address, is_deployed);
