-- ==============================================================================
-- Migration: 012_harden_rls_policies.sql
-- Description: Harden Row Level Security — close anon DELETE/UPDATE/INSERT
--   on all user-scoped tables. Frontend anon key is shipped to every browser
--   (VITE_SUPABASE_ANON_KEY via services/supabase.ts:3) and was able to
--   DELETE FROM sessions/orders/sweeps because every policy was USING (true).
--   Fix: owner JWT (auth.jwt() ->> 'user_address' = user_address) + service_role
--   only for writes. All frontend mutations must go through backend (service_role
--   bypasses RLS). Public tables keep anon SELECT; DML is service_role only.
--   Arena tables keep public SELECT for leaderboard discovery; DML is owner only.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. Ensure RLS is enabled (idempotent)
-- ------------------------------------------------------------------------------
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sweeps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_swarm_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_swarms ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 1. Drop every legacy permissive policy (covers schema.sql + prior migrations)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public Read Markets" ON public.markets;
DROP POLICY IF EXISTS "Public Read Agent Logs" ON public.agent_logs;
DROP POLICY IF EXISTS "User Read Own Sessions" ON public.sessions;
DROP POLICY IF EXISTS "User Modify Own Sessions" ON public.sessions;
DROP POLICY IF EXISTS "User Read Own Strategies" ON public.agent_strategies;
DROP POLICY IF EXISTS "User Modify Own Strategies" ON public.agent_strategies;
DROP POLICY IF EXISTS "User Read Own Orders" ON public.orders;
DROP POLICY IF EXISTS "User Insert Own Orders" ON public.orders;
DROP POLICY IF EXISTS "User Read Own Sweeps" ON public.sweeps;
DROP POLICY IF EXISTS "User Read Own Backtests" ON public.backtests;
DROP POLICY IF EXISTS "User Insert Own Backtests" ON public.backtests;
DROP POLICY IF EXISTS "Public Read System State" ON public.system_state;
DROP POLICY IF EXISTS "Service Role Modify System State" ON public.system_state;
DROP POLICY IF EXISTS "Public Read Swarm Configs" ON public.user_swarm_configs;
DROP POLICY IF EXISTS "User Modify Own Swarm Config" ON public.user_swarm_configs;
DROP POLICY IF EXISTS "Public Read Custom Agents" ON public.custom_agents;
DROP POLICY IF EXISTS "User Modify Own Custom Agents" ON public.custom_agents;
DROP POLICY IF EXISTS "Public Read Custom Swarms" ON public.custom_swarms;
DROP POLICY IF EXISTS "User Modify Own Custom Swarms" ON public.custom_swarms;

-- Also drop hardened names if re-running migration
DROP POLICY IF EXISTS "Markets public read" ON public.markets;
DROP POLICY IF EXISTS "Markets service_role all" ON public.markets;
DROP POLICY IF EXISTS "Agent Logs public read" ON public.agent_logs;
DROP POLICY IF EXISTS "Agent Logs service_role all" ON public.agent_logs;
DROP POLICY IF EXISTS "System State public read" ON public.system_state;
DROP POLICY IF EXISTS "System State service_role all" ON public.system_state;
DROP POLICY IF EXISTS "Custom Agents public read" ON public.custom_agents;
DROP POLICY IF EXISTS "Custom Swarms public read" ON public.custom_swarms;
DROP POLICY IF EXISTS "sessions_owner_select" ON public.sessions;
DROP POLICY IF EXISTS "sessions_owner_insert" ON public.sessions;
DROP POLICY IF EXISTS "sessions_owner_update" ON public.sessions;
DROP POLICY IF EXISTS "sessions_owner_delete" ON public.sessions;
DROP POLICY IF EXISTS "sessions_service_role" ON public.sessions;
DROP POLICY IF EXISTS "strategies_owner_select" ON public.agent_strategies;
DROP POLICY IF EXISTS "strategies_owner_insert" ON public.agent_strategies;
DROP POLICY IF EXISTS "strategies_owner_update" ON public.agent_strategies;
DROP POLICY IF EXISTS "strategies_owner_delete" ON public.agent_strategies;
DROP POLICY IF EXISTS "strategies_service_role" ON public.agent_strategies;
DROP POLICY IF EXISTS "orders_owner_select" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_update" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_delete" ON public.orders;
DROP POLICY IF EXISTS "orders_service_role" ON public.orders;
DROP POLICY IF EXISTS "sweeps_owner_select" ON public.sweeps;
DROP POLICY IF EXISTS "sweeps_owner_insert" ON public.sweeps;
DROP POLICY IF EXISTS "sweeps_owner_update" ON public.sweeps;
DROP POLICY IF EXISTS "sweeps_owner_delete" ON public.sweeps;
DROP POLICY IF EXISTS "sweeps_service_role" ON public.sweeps;
DROP POLICY IF EXISTS "backtests_owner_select" ON public.backtests;
DROP POLICY IF EXISTS "backtests_owner_insert" ON public.backtests;
DROP POLICY IF EXISTS "backtests_owner_update" ON public.backtests;
DROP POLICY IF EXISTS "backtests_owner_delete" ON public.backtests;
DROP POLICY IF EXISTS "backtests_service_role" ON public.backtests;
DROP POLICY IF EXISTS "swarm_configs_owner_select" ON public.user_swarm_configs;
DROP POLICY IF EXISTS "swarm_configs_owner_insert" ON public.user_swarm_configs;
DROP POLICY IF EXISTS "swarm_configs_owner_update" ON public.user_swarm_configs;
DROP POLICY IF EXISTS "swarm_configs_owner_delete" ON public.user_swarm_configs;
DROP POLICY IF EXISTS "swarm_configs_service_role" ON public.user_swarm_configs;
DROP POLICY IF EXISTS "custom_agents_owner_insert" ON public.custom_agents;
DROP POLICY IF EXISTS "custom_agents_owner_update" ON public.custom_agents;
DROP POLICY IF EXISTS "custom_agents_owner_delete" ON public.custom_agents;
DROP POLICY IF EXISTS "custom_agents_service_role" ON public.custom_agents;
DROP POLICY IF EXISTS "custom_swarms_owner_insert" ON public.custom_swarms;
DROP POLICY IF EXISTS "custom_swarms_owner_update" ON public.custom_swarms;
DROP POLICY IF EXISTS "custom_swarms_owner_delete" ON public.custom_swarms;
DROP POLICY IF EXISTS "custom_swarms_service_role" ON public.custom_swarms;

-- ------------------------------------------------------------------------------
-- 2. Public tables: anon SELECT, service_role DML only
--    (markets & agent_logs are realtime feeds; system_state is key-rotation)
-- ------------------------------------------------------------------------------
CREATE POLICY "Markets public read" ON public.markets
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Markets service_role all" ON public.markets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Agent Logs public read" ON public.agent_logs
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Agent Logs service_role all" ON public.agent_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "System State public read" ON public.system_state
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "System State service_role all" ON public.system_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 3. Arena discovery tables: public SELECT for leaderboard, owner-JWT + service_role for DML
-- ------------------------------------------------------------------------------
CREATE POLICY "Custom Agents public read" ON public.custom_agents
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "custom_agents_owner_insert" ON public.custom_agents
  FOR INSERT TO authenticated WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "custom_agents_owner_update" ON public.custom_agents
  FOR UPDATE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address))
  WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "custom_agents_owner_delete" ON public.custom_agents
  FOR DELETE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "custom_agents_service_role" ON public.custom_agents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Custom Swarms public read" ON public.custom_swarms
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "custom_swarms_owner_insert" ON public.custom_swarms
  FOR INSERT TO authenticated WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "custom_swarms_owner_update" ON public.custom_swarms
  FOR UPDATE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address))
  WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "custom_swarms_owner_delete" ON public.custom_swarms
  FOR DELETE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "custom_swarms_service_role" ON public.custom_swarms
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 4. Private user tables: authenticated owner (JWT claim) + service_role ONLY
--    Anon has zero policies → denied (no SELECT, no INSERT, no UPDATE, no DELETE).
--    Backend uses service_role (bypasses RLS) and is the sole writer until
--    wallet-JWT minting is wired (POST /api/v1/auth/wallet-verify -> JWT with
--    { role: "authenticated", user_address }).
--    All comparisons use lower() because addresses are stored checksummed.
-- ------------------------------------------------------------------------------

-- 4a. sessions
CREATE POLICY "sessions_owner_select" ON public.sessions
  FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "sessions_owner_insert" ON public.sessions
  FOR INSERT TO authenticated WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "sessions_owner_update" ON public.sessions
  FOR UPDATE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address))
  WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "sessions_owner_delete" ON public.sessions
  FOR DELETE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "sessions_service_role" ON public.sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4b. agent_strategies
CREATE POLICY "strategies_owner_select" ON public.agent_strategies
  FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "strategies_owner_insert" ON public.agent_strategies
  FOR INSERT TO authenticated WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "strategies_owner_update" ON public.agent_strategies
  FOR UPDATE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address))
  WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "strategies_owner_delete" ON public.agent_strategies
  FOR DELETE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "strategies_service_role" ON public.agent_strategies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4c. orders
CREATE POLICY "orders_owner_select" ON public.orders
  FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "orders_owner_insert" ON public.orders
  FOR INSERT TO authenticated WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "orders_owner_update" ON public.orders
  FOR UPDATE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address))
  WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "orders_owner_delete" ON public.orders
  FOR DELETE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "orders_service_role" ON public.orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4d. sweeps
CREATE POLICY "sweeps_owner_select" ON public.sweeps
  FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "sweeps_owner_insert" ON public.sweeps
  FOR INSERT TO authenticated WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "sweeps_owner_update" ON public.sweeps
  FOR UPDATE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address))
  WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "sweeps_owner_delete" ON public.sweeps
  FOR DELETE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "sweeps_service_role" ON public.sweeps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4e. backtests
CREATE POLICY "backtests_owner_select" ON public.backtests
  FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "backtests_owner_insert" ON public.backtests
  FOR INSERT TO authenticated WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "backtests_owner_update" ON public.backtests
  FOR UPDATE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address))
  WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "backtests_owner_delete" ON public.backtests
  FOR DELETE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "backtests_service_role" ON public.backtests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4f. user_swarm_configs
CREATE POLICY "swarm_configs_owner_select" ON public.user_swarm_configs
  FOR SELECT TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "swarm_configs_owner_insert" ON public.user_swarm_configs
  FOR INSERT TO authenticated WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "swarm_configs_owner_update" ON public.user_swarm_configs
  FOR UPDATE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address))
  WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "swarm_configs_owner_delete" ON public.user_swarm_configs
  FOR DELETE TO authenticated USING (lower(auth.jwt() ->> 'user_address') = lower(user_address));
CREATE POLICY "swarm_configs_service_role" ON public.user_swarm_configs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 5. Hardening notes for reviewers
-- ------------------------------------------------------------------------------
-- After this migration:
--   anon can: SELECT markets, agent_logs, system_state, custom_agents/swarms (discovery)
--   anon cannot: SELECT/INSERT/UPDATE/DELETE sessions, orders, sweeps, backtests,
--                agent_strategies, user_swarm_configs  (0 policies → default deny)
--   authenticated with valid JWT (user_address claim matching row) can: CRUD own rows
--   service_role (backend) can: ALL (backend is sole writer for now)
-- Functional lower() indexes for case-insensitive lookups (avoid seq scans from lower() in RLS + service filters)
CREATE INDEX IF NOT EXISTS idx_sessions_user_active_lower ON public.sessions(lower(user_address), is_active);
CREATE INDEX IF NOT EXISTS idx_orders_user_created_lower ON public.orders(lower(user_address), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_swarm_lower ON public.user_swarm_configs(lower(user_address));

-- Frontend must use backend REST API for private data:
--   GET  /api/v1/sessions/:userAddress        -> service_role read
--   POST /api/v1/sessions/register            -> service_role insert
--   POST /api/v1/sessions/:id/revoke          -> service_role update
--   GET  /api/v1/orders?userAddress=...       -> service_role filtered read
--   POST /api/v1/orders/place                 -> service_role insert
--   GET  /api/v1/swarm/my-config?userAddress= -> service_role read
--   etc. Direct supabase.from('sessions') from browser is now denied.
