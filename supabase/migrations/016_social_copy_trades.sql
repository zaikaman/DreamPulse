-- ==============================================================================
-- Migration 016: Social Forecaster Mirror Trading & Copy-Trade Relationships
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.social_copy_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    copier_address VARCHAR(42) NOT NULL,
    target_address VARCHAR(42) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    max_trade_size NUMERIC(18, 4),
    daily_volume_cap NUMERIC(18, 4),
    total_copied_trades INTEGER NOT NULL DEFAULT 0,
    total_copied_volume NUMERIC(18, 4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_copier_address CHECK (copier_address ~ '^0x[a-fA-F0-9]{40}$'),
    CONSTRAINT valid_target_address CHECK (target_address ~ '^0x[a-fA-F0-9]{40}$'),
    CONSTRAINT unique_copier_target UNIQUE (copier_address, target_address)
);

CREATE INDEX IF NOT EXISTS idx_social_copy_target_active ON public.social_copy_trades(target_address, is_active);
CREATE INDEX IF NOT EXISTS idx_social_copy_copier ON public.social_copy_trades(copier_address);
CREATE INDEX IF NOT EXISTS idx_social_copy_copier_lower ON public.social_copy_trades(lower(copier_address));
CREATE INDEX IF NOT EXISTS idx_social_copy_target_lower ON public.social_copy_trades(lower(target_address));

ALTER TABLE public.social_copy_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_copy_owner_select" ON public.social_copy_trades;
DROP POLICY IF EXISTS "social_copy_owner_insert" ON public.social_copy_trades;
DROP POLICY IF EXISTS "social_copy_owner_update" ON public.social_copy_trades;
DROP POLICY IF EXISTS "social_copy_owner_delete" ON public.social_copy_trades;
DROP POLICY IF EXISTS "social_copy_service_role" ON public.social_copy_trades;

CREATE POLICY "social_copy_owner_select" ON public.social_copy_trades
    FOR SELECT TO authenticated
    USING (lower(auth.jwt() ->> 'user_address') = lower(copier_address) OR lower(auth.jwt() ->> 'user_address') = lower(target_address));

CREATE POLICY "social_copy_owner_insert" ON public.social_copy_trades
    FOR INSERT TO authenticated
    WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(copier_address));

CREATE POLICY "social_copy_owner_update" ON public.social_copy_trades
    FOR UPDATE TO authenticated
    USING (lower(auth.jwt() ->> 'user_address') = lower(copier_address))
    WITH CHECK (lower(auth.jwt() ->> 'user_address') = lower(copier_address));

CREATE POLICY "social_copy_owner_delete" ON public.social_copy_trades
    FOR DELETE TO authenticated
    USING (lower(auth.jwt() ->> 'user_address') = lower(copier_address));

CREATE POLICY "social_copy_service_role" ON public.social_copy_trades
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Add to Realtime publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename = 'social_copy_trades'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'social_copy_trades'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.social_copy_trades';
  END IF;
END $$;
