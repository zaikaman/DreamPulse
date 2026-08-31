import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

let serviceClientInstance: SupabaseClient | null = null;
let anonClientInstance: SupabaseClient | null = null;

/**
 * Returns the Supabase client with admin/service-role privileges.
 * Backend MUST use this for all private-table writes — it bypasses RLS (see
 * supabase/migrations/012_harden_rls_policies.sql). The anon key shipped to
 * the frontend is RLS-denied for sessions/orders/sweeps etc, so every
 * frontend mutation goes through /api/v1/* here.
 */
export function getServiceSupabase(): SupabaseClient {
  if (!serviceClientInstance) {
    serviceClientInstance = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return serviceClientInstance;
}

/**
 * Returns the Supabase client with standard anon public privileges.
 * ONLY for public reads (markets, agent_logs, system_state, arena discovery).
 * Never use for sessions/orders/sweeps/backtests/agent_strategies/user_swarm_configs —
 * anon has no RLS policy on those tables (default deny) and all writes would
 * be rejected. For tests/anonymous public market polls only.
 */
export function getAnonSupabase(): SupabaseClient {
  if (!anonClientInstance) {
    anonClientInstance = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
      },
    });
  }
  return anonClientInstance;
}

/** Default backend client = service_role (bypasses hardened RLS). */
export const supabase = getServiceSupabase();

/**
 * Returns true if Supabase persistence is enabled and we are not in a test runner (Vitest/test).
 */
export function isPersistenceEnabled(): boolean {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return false;
  }
  const url = process.env.SUPABASE_URL || env.SUPABASE_URL || '';
  return url.length > 0 && !url.includes('mock-project');
}
