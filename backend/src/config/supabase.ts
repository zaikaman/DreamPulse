import { createClient, SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { env } from './env.js';

if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}

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
      realtime: {
        transport: WebSocket as any,
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
      realtime: {
        transport: WebSocket as any,
      },
    });
  }
  return anonClientInstance;
}

/** Default backend client = service_role (bypasses hardened RLS). */
export const supabase = getServiceSupabase();

let schemaReady: boolean | null = null;

/**
 * Returns whether the database schema is confirmed ready, false if probed and missing, or null if unprobed.
 */
export function isSchemaReady(): boolean | null {
  return schemaReady;
}

/**
 * Manually override or reset the schema ready state (primarily for tests).
 */
export function setSchemaReady(state: boolean | null): void {
  schemaReady = state;
}

/**
 * Returns true if Supabase URL is configured and we are not in a test runner.
 */
export function isPersistenceConfigured(): boolean {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return false;
  }
  const url = process.env.SUPABASE_URL || env.SUPABASE_URL || '';
  return url.length > 0 && !url.includes('mock-project');
}

/**
 * Returns true if Supabase persistence is enabled and ready to use.
 * Falls back to false if the schema preflight probe detected missing tables.
 */
export function isPersistenceEnabled(): boolean {
  if (schemaReady === false) {
    return false;
  }
  return isPersistenceConfigured();
}

/**
 * Lightweight preflight probe on server startup to verify if database tables exist.
 * If tables like `orders` are missing (PostgreSQL error 42P01), prints a clear diagnostic notice
 * guiding evaluators to execute schema.sql in the Supabase SQL editor.
 */
export async function checkDatabaseSchemaReady(
  customClient?: SupabaseClient,
  options?: { force?: boolean }
): Promise<boolean> {
  if (!options?.force && !isPersistenceConfigured()) {
    return false;
  }

  try {
    const client = customClient || getServiceSupabase();
    const { error } = await client.from('orders').select('id').limit(1);

    if (error) {
      const isMissingTable =
        error.code === '42P01' ||
        error.code === 'PGRST204' ||
        error.code === 'PGRST205' ||
        error.message?.includes('42P01') ||
        error.message?.includes('does not exist') ||
        error.message?.includes('relation "orders" does not exist') ||
        error.message?.includes('not find the table') ||
        error.message?.includes('could not find the table');

      if (isMissingTable) {
        schemaReady = false;
        console.warn(
          '[Database] Notice: Tables not detected in Supabase. Please run backend/src/config/schema.sql in the Supabase SQL editor to enable persistent order storage.'
        );
        return false;
      }

      console.warn(`[Database] Preflight probe warning: ${error.message} (code: ${error.code || 'UNKNOWN'})`);
      schemaReady = false;
      return false;
    }

    schemaReady = true;
    console.log('[Database] Supabase schema verified: persistent storage ready.');
    return true;
  } catch (err: any) {
    console.warn(`[Database] Preflight probe error: ${err?.message || err}`);
    schemaReady = false;
    return false;
  }
}
