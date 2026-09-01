-- ==============================================================================
-- Migration: 015_enable_supabase_realtime.sql
-- Description: Enables PostgreSQL CDC (Change Data Capture) via Supabase Realtime
--   publication (supabase_realtime) on all application tables.
--   By default in fresh Supabase projects, tables are not added to supabase_realtime,
--   causing realtime postgres_changes listeners (frontend & backend) to not receive events
--   unless enabled via script or Supabase dashboard.
-- ==============================================================================

-- Ensure publication exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Idempotently add all application tables to supabase_realtime publication
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'public.markets',
    'public.sessions',
    'public.agent_strategies',
    'public.orders',
    'public.sweeps',
    'public.agent_logs',
    'public.backtests',
    'public.system_state',
    'public.user_swarm_configs',
    'public.custom_agents',
    'public.custom_swarms',
    'public.daily_pnl',
    'public.social_copy_trades'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    -- Only add if table exists and is not already in the publication
    IF EXISTS (
      SELECT 1 FROM pg_tables 
      WHERE schemaname = split_part(tbl, '.', 1) 
        AND tablename = split_part(tbl, '.', 2)
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = split_part(tbl, '.', 1) 
        AND tablename = split_part(tbl, '.', 2)
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', tbl);
    END IF;
  END LOOP;
END $$;
