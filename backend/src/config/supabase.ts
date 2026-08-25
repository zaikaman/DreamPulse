import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

let serviceClientInstance: SupabaseClient | null = null;
let anonClientInstance: SupabaseClient | null = null;

/**
 * Returns the Supabase client with admin/service-role privileges (for backend daemon, sweeps & orders).
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
 * Returns the Supabase client with standard anon public privileges (for public market reads).
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

export const supabase = getServiceSupabase();
