-- ==============================================================================
-- Migration 018: Add nonce tracking, backfill existing rows, and enforce uniqueness
-- ==============================================================================

-- 1. Add nonce column to public.sessions if it doesn't already exist
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS nonce BIGINT NOT NULL DEFAULT 0;

-- 2. Backfill existing duplicate session rows with sequential nonces per user_address
WITH numbered_sessions AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY lower(user_address) ORDER BY created_at ASC) - 1 AS row_nonce
    FROM public.sessions
)
UPDATE public.sessions s
SET nonce = ns.row_nonce
FROM numbered_sessions ns
WHERE s.id = ns.id;

-- 3. Create unique index per user_address and nonce to ensure session nonce uniqueness & replay protection
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_user_nonce ON public.sessions(lower(user_address), nonce);
