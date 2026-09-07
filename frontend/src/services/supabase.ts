import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

/**
 * SECURITY HARDENING — RLS (see backend/src/config/schema.sql & supabase/migrations/012)
 *
 * The anon key shipped here (VITE_SUPABASE_ANON_KEY, services/supabase.ts:3) is
 * PUBLIC — any visitor can extract it from the bundled JS. Previous RLS was
 * `USING (true)` for sessions/orders/sweeps, so `DELETE FROM sessions` with the
 * anon key wiped the DB. Fixed by:
 *   • Private tables: no anon policy (default deny) + owner JWT (`auth.jwt()->>'user_address'`)
 *     + `FOR ALL TO service_role USING (true)`. Backend uses service_role and is the
 *     sole writer; frontend MUST use /api/v1/* (see api.ts).
 *   • Public tables: anon SELECT only; DML is service_role only.
 *   • Arena tables: anon SELECT for discovery; DML is owner-JWT + service_role.
 *
 * For frontend realtime, only public tables are subscribable with the anon key.
 * Private tables would return 0 rows under RLS and are blocked at the code level
 * to prevent accidental regression and noisy anon error logs.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabaseConfigError: string | null = isSupabaseConfigured
  ? null
  : 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — Supabase realtime/database is disabled until configured.';

if (!isSupabaseConfigured) {
  console.error(
    '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Set them in your environment (Vercel project settings for preview deployments). ' +
      'Supabase realtime/database calls will fail until configured.',
  );
}

export const SUPABASE_CONFIG_BANNER_ID = 'dreampulse-supabase-config-banner';

/**
 * Injects a visible configuration error banner when Supabase env is missing,
 * so misconfiguration fails loudly instead of silently querying a mock domain.
 * Also dispatches `dreampulse:supabase-config-error` for React shells to render
 * their own banner. Safe to call multiple times (idempotent).
 */
export function showSupabaseConfigBanner(): void {
  if (isSupabaseConfigured || typeof window === 'undefined' || typeof document === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent('dreampulse:supabase-config-error', { detail: { message: supabaseConfigError } }),
    );
  } catch {}
  try {
    if (document.getElementById(SUPABASE_CONFIG_BANNER_ID)) return;
    const banner = document.createElement('div');
    banner.id = SUPABASE_CONFIG_BANNER_ID;
    banner.setAttribute('role', 'alert');
    banner.setAttribute(
      'style',
      'position:fixed;top:0;left:0;right:0;z-index:9999;' +
        'background:#7f1d1d;color:#fecaca;font:600 13px/1.5 system-ui,sans-serif;' +
        'padding:10px 16px;text-align:center;border-bottom:1px solid #ef4444;',
    );
    banner.textContent =
      'Configuration error: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY is not set. ' +
      'Database and realtime updates are disabled until configured.';
    document.body?.prepend(banner);
  } catch {}
}

if (typeof window !== 'undefined' && !isSupabaseConfigured) {
  // Defer to after DOM parse so document.body exists when bundled via <script type="module">.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showSupabaseConfigBanner, { once: true });
  } else {
    showSupabaseConfigBanner();
  }
}

// Placeholder keeps createClient from throwing at import time when env is missing.
// All realtime helpers short-circuit to a noop channel below, and REST goes through
// backend /api/v1/* — so this URL is never silently queried for real data.
const effectiveSupabaseUrl = supabaseUrl ?? 'https://misconfigured.supabase.co';
const effectiveSupabaseAnonKey = supabaseAnonKey ?? 'misconfigured-anon-key';

export const supabaseBrowser: SupabaseClient = createClient(effectiveSupabaseUrl, effectiveSupabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});

export const supabase = supabaseBrowser;

// Persisted Supabase JWT key (minted via POST /api/v1/auth/wallet-verify)
export const SUPABASE_JWT_STORAGE_KEY = 'dreampulse_supabase_jwt';
export const SUPABASE_JWT_EXP_STORAGE_KEY = 'dreampulse_supabase_jwt_exp';

export function getStoredSupabaseJwt(): { token: string; expiresAt: number } | null {
  try {
    const t = localStorage.getItem(SUPABASE_JWT_STORAGE_KEY);
    const e = localStorage.getItem(SUPABASE_JWT_EXP_STORAGE_KEY);
    if (!t || !e) return null;
    const exp = Number(e);
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000) + 60) return null; // 60s grace
    return { token: t, expiresAt: exp };
  } catch { return null; }
}

export function setStoredSupabaseJwt(token: string, expiresAt: number): void {
  try {
    localStorage.setItem(SUPABASE_JWT_STORAGE_KEY, token);
    localStorage.setItem(SUPABASE_JWT_EXP_STORAGE_KEY, String(expiresAt));
  } catch {}
}

export function clearStoredSupabaseJwt(): void {
  try {
    localStorage.removeItem(SUPABASE_JWT_STORAGE_KEY);
    localStorage.removeItem(SUPABASE_JWT_EXP_STORAGE_KEY);
  } catch {}
}

/**
 * Sets Supabase auth + realtime auth from a minted JWT.
 * Must be called before subscribing to private tables. Uses both
 * auth.setSession (for REST RLS) and realtime.setAuth (for Realtime RLS).
 */
export async function setSupabaseAuth(token: string): Promise<void> {
  try {
    const maybeRealtime: any = (supabaseBrowser as any).realtime;
    if (maybeRealtime?.setAuth) {
      maybeRealtime.setAuth(token);
    }
  } catch (e) {
    console.warn('[Supabase] setSupabaseAuth warn:', e);
  }
}

export async function clearSupabaseAuth(): Promise<void> {
  clearStoredSupabaseJwt();
  try {
    const maybeRealtime: any = (supabaseBrowser as any).realtime;
    if (maybeRealtime?.setAuth) maybeRealtime.setAuth(null);
  } catch {}
}

const PUBLIC_REALTIME_TABLES = new Set<string>([
  'markets',
  'agent_logs',
  // Arena discovery is public-read but currently consumed via REST; allowing
  // realtime here is safe because SELECT is public and DML is owner-only.
  'custom_agents',
  'custom_swarms',
  'system_state',
]);

const PRIVATE_REALTIME_TABLES = new Set<string>([
  'sessions',
  'user_swarm_configs',
  'orders',
  'sweeps',
  'backtests',
  'agent_strategies',
  'social_copy_trades',
  'daily_pnl',
]);

function createNoopChannel(): RealtimeChannel {
  return {
    unsubscribe: () => Promise.resolve('ok'),
    teardown: () => {},
  } as unknown as RealtimeChannel;
}

/**
 * Cleanly unbinds, unsubscribes, and removes a Supabase Realtime channel
 * from the client multiplexer table to prevent memory leaks in long sessions.
 */
export async function removeRealtimeChannel(channel: RealtimeChannel | null | undefined): Promise<void> {
  if (!channel) return;
  try {
    channel.unsubscribe();
  } catch {}
  try {
    await supabaseBrowser.removeChannel(channel);
  } catch {}
}

/**
 * Subscribes to real-time table inserts/updates in Supabase.
 * Public tables work with anon. Private tables require a minted JWT
 * (auth.jwt()->>'user_address') via POST /api/v1/auth/wallet-verify → setSupabaseAuth(token).
 * Call subscribeToPrivateTable for those; this helper blocks anon private attempts.
 */
export function subscribeToTable<T = any>(
  table: string,
  onInsert?: (payload: T) => void,
  onUpdate?: (payload: T) => void,
  onDelete?: (payload: T) => void,
): RealtimeChannel {
  if (!isSupabaseConfigured) {
    console.error(`[Supabase] subscribeToTable('${table}') skipped — Supabase env is not configured.`);
    return createNoopChannel();
  }
  if (!PUBLIC_REALTIME_TABLES.has(table) && PRIVATE_REALTIME_TABLES.has(table)) {
    console.warn(
      `[Supabase] Blocked anon realtime subscription to private table '${table}' — anon RLS denies it. Use subscribeToPrivateTable(userAddress, ...) after wallet-verify (sets auth.jwt()->>'user_address'). See 012_harden_rls_policies.sql.`,
    );
    return createNoopChannel();
  }
  if (!PUBLIC_REALTIME_TABLES.has(table)) {
    console.warn(
      `[Supabase] Blocked realtime subscription to unknown/private table '${table}' — anon RLS denies it. Use backend REST / WebSocket (telemetryClient) instead. See 012_harden_rls_policies.sql.`,
    );
    return createNoopChannel();
  }

  const channelTopic = `public:${table}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const channel = supabaseBrowser
    .channel(channelTopic)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => {
        if (payload.eventType === 'INSERT' && onInsert) {
          onInsert(payload.new as T);
        } else if (payload.eventType === 'UPDATE' && onUpdate) {
          onUpdate(payload.new as T);
        } else if (payload.eventType === 'DELETE' && onDelete) {
          onDelete(payload.old as T);
        }
      },
    )
    .subscribe();

  return channel;
}

/**
 * Subscribes to a private table for a specific user address.
 * Requires prior setSupabaseAuth(token) from wallet-verify. If no JWT is
 * present, it still subscribes but RLS will return 0 rows (graceful degrade
 * to polling).
 *
 * NOTE: We do not pass `filter: user_address=eq.<lower>` in the postgres_changes
 * filter config because Supabase Realtime CDC filters are case-sensitive string
 * matches which drop records when addresses are stored checksummed (e.g. 0xAbC...).
 * Server-side tenant isolation is enforced by Postgres RLS (012_harden_rls_policies.sql),
 * and client-side case-insensitive address filtering is applied below.
 */
export function subscribeToPrivateTable<T = any>(
  table: string,
  userAddress: string,
  onInsert?: (payload: T) => void,
  onUpdate?: (payload: T) => void,
  onDelete?: (payload: T) => void,
  addressField: string = 'user_address',
): RealtimeChannel {
  if (!isSupabaseConfigured) {
    console.error(`[Supabase] subscribeToPrivateTable('${table}') skipped — Supabase env is not configured.`);
    return createNoopChannel();
  }
  const lower = userAddress.toLowerCase();
  const needsJwt = PRIVATE_REALTIME_TABLES.has(table);
  if (needsJwt && !getStoredSupabaseJwt()) {
    console.warn(`[Supabase] subscribeToPrivateTable('${table}') without JWT — RLS will deny until wallet-verify mints token. Polling will cover.`);
  }
  const channelTopic = `private:${table}:${lower}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const channel = supabaseBrowser
    .channel(channelTopic)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => {
        const row: any = payload.new || payload.old;
        if (row) {
          const rowAddr = row[addressField] || row.user_address || row.copier_address || row.target_address;
          if (rowAddr && typeof rowAddr === 'string' && rowAddr.toLowerCase() !== lower) {
            return;
          }
        }
        if (payload.eventType === 'INSERT' && onInsert) {
          onInsert(payload.new as T);
        } else if (payload.eventType === 'UPDATE' && onUpdate) {
          onUpdate(payload.new as T);
        } else if (payload.eventType === 'DELETE' && onDelete) {
          onDelete(payload.old as T);
        }
      },
    )
    .subscribe();
  return channel;
}

// Auto-restore cached JWT on module load (client side) — enables instant
// filtered realtime before first wallet-verified mint without extra popup.
if (typeof window !== 'undefined') {
  try {
    const cached = getStoredSupabaseJwt();
    if (cached?.token) {
      // fire-and-forget; errors are non-fatal (fallback to polling)
      setSupabaseAuth(cached.token).catch(() => {});
    }
  } catch {}
}
