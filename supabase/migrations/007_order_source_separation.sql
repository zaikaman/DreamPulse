-- ==============================================================================
-- Migration: 007_order_source_separation.sql
-- Description: Adds source column to orders table to clearly partition manual
-- discretionary trading terminal orders from autonomous agent swarm executions.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Add source column to orders table
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'SWARM';

-- Index for high-performance order querying by user, source, and creation time
CREATE INDEX IF NOT EXISTS idx_orders_user_source_created
    ON public.orders (user_address, source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_source_status
    ON public.orders (source, status);

-- ------------------------------------------------------------------------------
-- 2. Backfill manual discretionary trading terminal orders
-- ------------------------------------------------------------------------------
UPDATE public.orders
   SET source = 'TERMINAL',
       agent_type = 'Manual'
 WHERE agent_type IN ('Manual', 'MANUAL');
