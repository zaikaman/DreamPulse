-- ==============================================================================
-- Migration 019: Social Copy Trades Daily Spend Tracking & Reset Timestamps
-- ==============================================================================

ALTER TABLE public.social_copy_trades
    ADD COLUMN IF NOT EXISTS spent_today NUMERIC(18, 4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_spend_reset_timestamp BIGINT;
