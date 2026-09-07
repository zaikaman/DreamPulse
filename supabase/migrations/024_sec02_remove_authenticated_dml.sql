-- ==============================================================================
-- Migration: 024_sec02_remove_authenticated_dml.sql
-- SEC-02 (Critical): Supabase RLS granted direct SQL DML to authenticated clients.
--   schema.sql + migration 012 created FOR INSERT/UPDATE/DELETE TO authenticated
--   on sessions, orders, sweeps, agent_strategies, backtests, user_swarm_configs,
--   custom_agents, custom_swarms, social_copy_trades. Any wallet-verified user
--   (POST /api/v1/auth/wallet-verify -> Supabase JWT) could bypass /api/v1/*
--   and call PostgREST directly: flip sessions.on_chain_authorized, raise
--   daily_volume_cap, forge orders (status/pnl), delete losing trades,
--   fabricate custom_agents.pnl/win_rate — subverting risk caps, leaderboard,
--   and Proof-of-Alpha analytics.
-- Fix: drop EVERY authenticated DML policy. Authenticated keeps SELECT-own
--   (realtime reads); ALL writes go through backend service_role (/api/v1/*).
--   Idempotent: safe to re-run. Mirrors backend/src/config/schema.sql.
-- ==============================================================================

-- sessions
DROP POLICY IF EXISTS "sessions_owner_insert" ON public.sessions;
DROP POLICY IF EXISTS "sessions_owner_update" ON public.sessions;
DROP POLICY IF EXISTS "sessions_owner_delete" ON public.sessions;

-- agent_strategies
DROP POLICY IF EXISTS "strategies_owner_insert" ON public.agent_strategies;
DROP POLICY IF EXISTS "strategies_owner_update" ON public.agent_strategies;
DROP POLICY IF EXISTS "strategies_owner_delete" ON public.agent_strategies;

-- orders
DROP POLICY IF EXISTS "orders_owner_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_update" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_delete" ON public.orders;

-- sweeps
DROP POLICY IF EXISTS "sweeps_owner_insert" ON public.sweeps;
DROP POLICY IF EXISTS "sweeps_owner_update" ON public.sweeps;
DROP POLICY IF EXISTS "sweeps_owner_delete" ON public.sweeps;

-- backtests
DROP POLICY IF EXISTS "backtests_owner_insert" ON public.backtests;
DROP POLICY IF EXISTS "backtests_owner_update" ON public.backtests;
DROP POLICY IF EXISTS "backtests_owner_delete" ON public.backtests;

-- user_swarm_configs
DROP POLICY IF EXISTS "swarm_configs_owner_insert" ON public.user_swarm_configs;
DROP POLICY IF EXISTS "swarm_configs_owner_update" ON public.user_swarm_configs;
DROP POLICY IF EXISTS "swarm_configs_owner_delete" ON public.user_swarm_configs;

-- custom_agents (backend-computed pnl/win_rate/trades_count — never client-writable)
DROP POLICY IF EXISTS "custom_agents_owner_insert" ON public.custom_agents;
DROP POLICY IF EXISTS "custom_agents_owner_update" ON public.custom_agents;
DROP POLICY IF EXISTS "custom_agents_owner_delete" ON public.custom_agents;

-- custom_swarms
DROP POLICY IF EXISTS "custom_swarms_owner_insert" ON public.custom_swarms;
DROP POLICY IF EXISTS "custom_swarms_owner_update" ON public.custom_swarms;
DROP POLICY IF EXISTS "custom_swarms_owner_delete" ON public.custom_swarms;

-- social_copy_trades (backend-managed spent_today/total_copied_volume caps)
DROP POLICY IF EXISTS "social_copy_owner_insert" ON public.social_copy_trades;
DROP POLICY IF EXISTS "social_copy_owner_update" ON public.social_copy_trades;
DROP POLICY IF EXISTS "social_copy_owner_delete" ON public.social_copy_trades;

-- daily_pnl: already SELECT + service_role only — assert no authenticated DML exists
DROP POLICY IF EXISTS "daily_pnl_owner_insert" ON public.daily_pnl;
DROP POLICY IF EXISTS "daily_pnl_owner_update" ON public.daily_pnl;
DROP POLICY IF EXISTS "daily_pnl_owner_delete" ON public.daily_pnl;

-- ------------------------------------------------------------------------------
-- Ensure owner-SELECT + service_role policies exist (re-created if missing).
-- No authenticated DML is created here by design.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sessions' AND policyname='sessions_owner_select') THEN
    CREATE POLICY "sessions_owner_select" ON public.sessions FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sessions' AND policyname='sessions_service_role') THEN
    CREATE POLICY "sessions_service_role" ON public.sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_strategies' AND policyname='strategies_owner_select') THEN
    CREATE POLICY "strategies_owner_select" ON public.agent_strategies FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_strategies' AND policyname='strategies_service_role') THEN
    CREATE POLICY "strategies_service_role" ON public.agent_strategies FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orders' AND policyname='orders_owner_select') THEN
    CREATE POLICY "orders_owner_select" ON public.orders FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orders' AND policyname='orders_service_role') THEN
    CREATE POLICY "orders_service_role" ON public.orders FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sweeps' AND policyname='sweeps_owner_select') THEN
    CREATE POLICY "sweeps_owner_select" ON public.sweeps FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sweeps' AND policyname='sweeps_service_role') THEN
    CREATE POLICY "sweeps_service_role" ON public.sweeps FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='backtests' AND policyname='backtests_owner_select') THEN
    CREATE POLICY "backtests_owner_select" ON public.backtests FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='backtests' AND policyname='backtests_service_role') THEN
    CREATE POLICY "backtests_service_role" ON public.backtests FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_swarm_configs' AND policyname='swarm_configs_owner_select') THEN
    CREATE POLICY "swarm_configs_owner_select" ON public.user_swarm_configs FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_swarm_configs' AND policyname='swarm_configs_service_role') THEN
    CREATE POLICY "swarm_configs_service_role" ON public.user_swarm_configs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='social_copy_trades' AND policyname='social_copy_owner_select') THEN
    CREATE POLICY "social_copy_owner_select" ON public.social_copy_trades FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(copier_address) OR lower(auth.jwt() ->> 'user_address') = lower(target_address));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='social_copy_trades' AND policyname='social_copy_service_role') THEN
    CREATE POLICY "social_copy_service_role" ON public.social_copy_trades FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- SEC-01 follow-through: migration 017 re-added public.sessions to the
-- supabase_realtime publication, rebroadcasting session rows (AES ciphertext
-- column) to browsers. schema.sql excludes sessions; enforce that here so
-- live DBs that ran 017 converge to the hardened state. Idempotent.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sessions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.sessions';
  END IF;
END $$;

-- Fail-closed guards (MUST return 0 rows after the migration):
-- SELECT schemaname, tablename, policyname, cmd, roles FROM pg_policies
-- WHERE schemaname='public' AND roles::text LIKE '%authenticated%'
--   AND cmd IN ('INSERT','UPDATE','DELETE');
-- SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime'
--   AND schemaname='public' AND tablename='sessions';
