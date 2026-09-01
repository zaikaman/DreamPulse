-- ==============================================================================
-- Migration: 017_sync_realtime_publications.sql
-- Description: Synchronizes all application tables (including social_copy_trades,
--   custom_agents, custom_swarms, daily_pnl, etc.) with Supabase Realtime
--   publication (supabase_realtime). Fixes publication drift across migrations
--   and sets REPLICA IDENTITY FULL on mutation tables so update/delete CDC
--   events replicate complete records.
-- ==============================================================================

-- 1. Ensure supabase_realtime publication exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- 2. Idempotently add all application tables to supabase_realtime publication
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

-- 3. Set REPLICA IDENTITY FULL for tables with frequent updates/deletes to ensure CDC streams deliver full row states
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'public.sessions',
    'public.orders',
    'public.sweeps',
    'public.agent_strategies',
    'public.user_swarm_configs',
    'public.custom_agents',
    'public.custom_swarms',
    'public.daily_pnl',
    'public.social_copy_trades',
    'public.system_state'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables 
      WHERE schemaname = split_part(tbl, '.', 1) 
        AND tablename = split_part(tbl, '.', 2)
    ) THEN
      EXECUTE format('ALTER TABLE %s REPLICA IDENTITY FULL', tbl);
    END IF;
  END LOOP;
END $$;
