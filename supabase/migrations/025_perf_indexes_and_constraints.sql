-- ==============================================================================
-- Migration: 025_perf_indexes_and_constraints.sql
-- Fixes:
--   PERF-01: Missing Foreign Key Indexes on orders(session_id) and agent_strategies(session_id)
--            Avoids sequential scans across orders/agent_strategies when a session is revoked/deleted.
--   PERF-02: Missing functional index on agent_strategies(lower(user_address))
--            Accelerates RLS checks evaluating lower(auth.jwt()->>'user_address') = lower(user_address).
--   PERF-03: Sequential scans on agent_logs and sweeps due to case-insensitive lookups
--            Adds functional lower() expression indexes for idx_sweeps_user_lower and idx_agent_logs_type_lower.
--   PERF-05: Case-sensitive UNIQUE constraint on social_copy_trades allows duplicate pairs with mixed casing
--            Cleans up legacy case-variant duplicates and enforces unique index on (lower(copier_address), lower(target_address)).
--   PERF-10: Missing functional index on daily_pnl(lower(user_address), day DESC)
--            Accelerates portfolio equity curve analytics under case-insensitive RLS.
-- ==============================================================================

-- PERF-01: Explicit Foreign Key Indexes for sessions(id) references
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON public.orders(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_strategies_session_id ON public.agent_strategies(session_id);

-- PERF-02: Functional index for agent_strategies RLS user lookups
CREATE INDEX IF NOT EXISTS idx_agent_strategies_user_lower ON public.agent_strategies(lower(user_address));

-- PERF-03: Functional indexes for case-insensitive scans on sweeps and agent_logs
CREATE INDEX IF NOT EXISTS idx_sweeps_user_lower ON public.sweeps(lower(user_address));
CREATE INDEX IF NOT EXISTS idx_agent_logs_type_lower ON public.agent_logs(lower(agent_type));

-- PERF-05: Deduplicate existing mixed-case records and create unique index on (lower(copier_address), lower(target_address))
DELETE FROM public.social_copy_trades a
USING public.social_copy_trades b
WHERE a.ctid > b.ctid
  AND lower(a.copier_address) = lower(b.copier_address)
  AND lower(a.target_address) = lower(b.target_address);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_copy_pair_lower
  ON public.social_copy_trades(lower(copier_address), lower(target_address));

-- PERF-10: Functional index for daily_pnl time-series equity curves
CREATE INDEX IF NOT EXISTS idx_daily_pnl_user_day_lower ON public.daily_pnl(lower(user_address), day DESC);
