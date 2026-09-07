-- ==============================================================================
-- Migration: 026_backtest_history_indexing.sql
-- Fixes:
--   BE-BUG-07: Global Backtest Cache Truncation Causes Data Loss in User History API
--              Adds functional lower() expression index on public.backtests(lower(user_address), created_at DESC)
--              to ensure direct user backtest history lookups are fully index-backed and performant
--              even when global in-memory caches rotate or truncate.
-- ==============================================================================

-- Functional index on lower(user_address) with created_at DESC for fast user history queries
CREATE INDEX IF NOT EXISTS idx_backtests_user_lower ON public.backtests(lower(user_address), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backtests_user ON public.backtests(user_address, created_at DESC);
