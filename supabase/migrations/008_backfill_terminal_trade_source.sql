-- ==============================================================================
-- Migration: 008_backfill_terminal_trade_source.sql
-- Description: Backfills historical manual discretionary trading terminal orders
-- that were defaulted to 'SWARM' during migration 007.
-- ==============================================================================

UPDATE public.orders
   SET source = 'TERMINAL',
       agent_type = 'Manual'
 WHERE agent_type IN ('Manual', 'MANUAL');
