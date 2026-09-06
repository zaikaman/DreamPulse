-- ------------------------------------------------------------------------------
-- Migration 021: V2 per-user trading account clones
-- ------------------------------------------------------------------------------
ALTER TABLE public.sessions
    ADD COLUMN IF NOT EXISTS account_address VARCHAR(42);

CREATE INDEX IF NOT EXISTS idx_sessions_account_address
    ON public.sessions(lower(account_address))
    WHERE account_address IS NOT NULL;
