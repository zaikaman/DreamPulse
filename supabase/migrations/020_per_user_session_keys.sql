-- ------------------------------------------------------------------------------
-- Migration 020: Per-User Session Key Model & On-Chain Risk Enforced Delegation
-- ------------------------------------------------------------------------------
ALTER TABLE public.sessions
    ADD COLUMN IF NOT EXISTS session_key_address VARCHAR(42),
    ADD COLUMN IF NOT EXISTS session_key_private_key TEXT,
    ADD COLUMN IF NOT EXISTS delegation_contract_address VARCHAR(42);

CREATE INDEX IF NOT EXISTS idx_sessions_session_key_address
    ON public.sessions(lower(session_key_address))
    WHERE session_key_address IS NOT NULL;
