-- ------------------------------------------------------------------------------
-- Migration 022: Enforce unique tx_hash on orders to prevent tx replay attacks
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tx_hash_unique
    ON public.orders(tx_hash)
    WHERE tx_hash IS NOT NULL;
