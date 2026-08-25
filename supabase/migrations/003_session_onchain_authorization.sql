-- ==============================================================================
-- Migration: 003_session_onchain_authorization.sql
-- Description: Persist on-chain operator authorization proof on sessions so
-- copy-trading never treats leftover/test wallets as delegated users.
-- ==============================================================================

ALTER TABLE public.sessions
    ADD COLUMN IF NOT EXISTS on_chain_tx_hash VARCHAR(66),
    ADD COLUMN IF NOT EXISTS on_chain_authorized BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS vault_deposit_amount NUMERIC(18, 4),
    ADD COLUMN IF NOT EXISTS target_pool_address VARCHAR(42);

CREATE INDEX IF NOT EXISTS idx_sessions_on_chain_authorized
    ON public.sessions (is_active, on_chain_authorized)
    WHERE is_active = TRUE;
