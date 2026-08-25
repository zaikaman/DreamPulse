-- ==============================================================================
-- Migration 003: Explicit Order Settlement State and PnL Persistence
-- Ensures realized PnL is calculated exactly once upon market resolution
-- and permanently persisted to prevent dynamic recalculations across restarts.
-- ==============================================================================

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS is_settled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- Backfill existing orders that already have a non-zero PnL or filled status
UPDATE public.orders
SET is_settled = TRUE,
    settled_at = COALESCE(filled_at, created_at)
WHERE is_settled IS FALSE AND (pnl IS NOT NULL AND pnl != 0);

CREATE INDEX IF NOT EXISTS idx_orders_is_settled ON public.orders(is_settled);
CREATE INDEX IF NOT EXISTS idx_orders_market_settled ON public.orders(market_id, is_settled);
