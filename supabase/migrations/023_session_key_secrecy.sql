-- ==============================================================================
-- Migration: 023_session_key_secrecy.sql
-- Description: SEC-01 — stop plaintext session signing-key exposure.
--   1. Drops public.sessions from the supabase_realtime CDC publication so rows
--      (which carry session-key ciphertext) are never broadcast to browsers.
--   2. Burns any pre-fix plaintext keys (0x...) to NULL so affected users
--      transparently re-authorize via the Session Modal. Ciphertext rows
--      (v1.<iv>.<tag>.<ct>) are preserved.
--   3. Documents the column invariant for auditors.
-- Frontend session state flows via backend REST (/api/v1/sessions/*, secrets
-- stripped) + polling — never via Supabase Realtime CDC after this migration.
-- ==============================================================================

-- 1. Remove sessions from Realtime CDC (idempotent).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sessions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.sessions';
  END IF;
END $$;

-- 2. Burn pre-fix plaintext keys. The backend (session-key-crypto.ts) writes
-- only v1.<iv>.<tag>.<ct> AES-256-GCM ciphertext; anything else in this column
-- is a pre-fix leak and must not survive.
UPDATE public.sessions
SET session_key_private_key = NULL,
    updated_at = NOW()
WHERE session_key_private_key IS NOT NULL
  AND session_key_private_key NOT LIKE 'v1.%';

-- 3. Auditor-facing invariant.
COMMENT ON COLUMN public.sessions.session_key_private_key IS
  'SEC-01: AES-256-GCM ciphertext only (v1.<iv>.<tag>.<ct>). Never plaintext. Decryptable only by the backend relay via SESSION_KEY_ENCRYPTION_KEY. Never broadcast over Realtime; never returned by the API.';
