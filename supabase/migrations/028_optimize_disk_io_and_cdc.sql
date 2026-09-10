-- ==============================================================================
-- Migration 028: Supabase Disk IO Optimization & CDC Replication Tuning
-- Fixes:
--   PERF-05: Excessive Disk IO and WAL generation from high-frequency market sync
--            enrolled in supabase_realtime CDC publication.
--   PERF-06: Missing index on orders(created_at DESC) and sweeps(claimed_at DESC)
--            forcing 50x sequential full-table disk scans on startup hydration.
-- ==============================================================================

-- 1. Remove public.markets from supabase_realtime CDC publication
-- Live market book and price ticks are broadcast directly via backend WebSocket gateway.
-- Removing ephemeral market row updates from PostgreSQL logical replication eliminates
-- severe disk I/O and WAL churn (saving ~864,000 replication events/day).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'markets'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.markets';
  END IF;
END $$;

-- 2. Add high-cardinality B-Tree index on orders(created_at DESC)
-- Existing indexes only covered (user_address, created_at DESC), leaving global
-- queries (like order-service boot hydration and admin feeds) doing full table scans.
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc 
ON public.orders(created_at DESC);

-- 3. Add partial index for unsettled orders
-- The settlement sync worker only checks unsettled orders; this partial index
-- allows instantly finding unsettled candidates without scanning millions of settled rows.
CREATE INDEX IF NOT EXISTS idx_orders_unsettled 
ON public.orders(created_at DESC) 
WHERE is_settled = FALSE;

-- 4. Add B-Tree indexes on sweeps for boot hydration and reconciliation
CREATE INDEX IF NOT EXISTS idx_sweeps_claimed_at_desc 
ON public.sweeps(claimed_at DESC);

CREATE INDEX IF NOT EXISTS idx_sweeps_status_claimed 
ON public.sweeps(status, claimed_at DESC);
