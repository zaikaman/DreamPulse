-- ==============================================================================
-- Migration 027: Session Last Spend Reset Timestamp
-- Fixes:
--   BE-BUG-10: Missing `last_spend_reset_timestamp` in `sessions` DB Table
--              Causing Arbitrary Cap Resets
-- ==============================================================================

-- 1. Add last_spend_reset_timestamp column if not exists
ALTER TABLE public.sessions
    ADD COLUMN IF NOT EXISTS last_spend_reset_timestamp BIGINT;

-- 2. Backfill existing active sessions with epoch ms from updated_at / created_at if null
UPDATE public.sessions
SET last_spend_reset_timestamp = (EXTRACT(EPOCH FROM COALESCE(updated_at, created_at, NOW())) * 1000)::BIGINT
WHERE last_spend_reset_timestamp IS NULL;
