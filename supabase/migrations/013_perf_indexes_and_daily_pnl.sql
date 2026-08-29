-- ==============================================================================
-- Migration: 013_perf_indexes_and_daily_pnl.sql
-- Fixes:
--   12. ilike(user_address) forces seq scan over sessions/user_swarm_configs.
--       Add functional lower() indexes so case-insensitive lookups use an index.
--   13/16. Analytics scans all orders in RAM; support DB-backed analytics history
--       after in-memory 5000-cap eviction via pre-aggregated daily_pnl.
--   14. syncActiveMarketsToDatabase spams 35 upserts every 5s; add updated_at
--       tracking via index (not schema change) — app-level diff gate handles it.
-- ==============================================================================

-- 12. Functional indexes for ilike -> lower() equality
CREATE INDEX IF NOT EXISTS idx_sessions_user_active_lower ON public.sessions(lower(user_address), is_active);
CREATE INDEX IF NOT EXISTS idx_orders_user_created_lower ON public.orders(lower(user_address), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_swarm_lower ON public.user_swarm_configs(lower(user_address));

-- Market freshness index for sync diff polling
CREATE INDEX IF NOT EXISTS idx_markets_updated_at ON public.markets(updated_at DESC);

-- Order analytics supporting indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_settled_created ON public.orders(user_address, is_settled, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_source_created ON public.orders(user_address, source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_settled_at ON public.orders(settled_at DESC) WHERE is_settled = TRUE;

-- 16. Pre-aggregated daily PnL for analytics (avoids full table scans)
CREATE TABLE IF NOT EXISTS public.daily_pnl (
    user_address VARCHAR(42) NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'ALL', -- 'ALL' | 'SWARM' | 'TERMINAL'
    day DATE NOT NULL,
    pnl NUMERIC(18, 4) NOT NULL DEFAULT 0,
    volume NUMERIC(18, 4) NOT NULL DEFAULT 0,
    trades INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_address, source, day),
    CONSTRAINT valid_daily_pnl_address CHECK (user_address ~ '^0x[a-fA-F0-9]{40}$')
);
CREATE INDEX IF NOT EXISTS idx_daily_pnl_user_day ON public.daily_pnl(user_address, day DESC);
CREATE INDEX IF NOT EXISTS idx_daily_pnl_source_day ON public.daily_pnl(source, day DESC);

ALTER TABLE public.daily_pnl ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_pnl_owner_select" ON public.daily_pnl;
DROP POLICY IF EXISTS "daily_pnl_service_role" ON public.daily_pnl;
CREATE POLICY "daily_pnl_owner_select" ON public.daily_pnl
  FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "daily_pnl_service_role" ON public.daily_pnl
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.daily_pnl IS 'Pre-aggregated daily PnL/volume/trades per user per source. Refreshed by backend on settlement; analytics reads this instead of scanning all orders.';
