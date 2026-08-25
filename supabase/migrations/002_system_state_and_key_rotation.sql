-- ==============================================================================
-- Migration: 002_system_state_and_key_rotation.sql
-- Description: Persistent System State & Groq Multi-Key Round-Robin Index Across Restarts
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. System State Key-Value Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_state (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.system_state ENABLE ROW LEVEL SECURITY;

-- Allow service role full access and public read
CREATE POLICY "Public Read System State" ON public.system_state FOR SELECT USING (true);
CREATE POLICY "Service Role Modify System State" ON public.system_state FOR ALL USING (true);

-- ------------------------------------------------------------------------------
-- 2. Seed Initial Key Rotation State
-- ------------------------------------------------------------------------------
INSERT INTO public.system_state (key, value, description)
VALUES (
    'groq_key_rotation',
    '{"current_index": 0, "total_keys": 20, "last_rotated_at": null}'::jsonb,
    'Tracks the active round-robin Groq API key index across backend dyno restarts'
)
ON CONFLICT (key) DO NOTHING;

-- Index on updated_at for telemetry
CREATE INDEX IF NOT EXISTS idx_system_state_updated ON public.system_state(updated_at DESC);
