import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mock-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'mock-anon-key';
export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    },
    realtime: {
        params: {
            eventsPerSecond: 20,
        },
    },
});
/**
 * Subscribes to real-time table inserts/updates in Supabase.
 */
export function subscribeToTable(table, onInsert, onUpdate, onDelete) {
    const channel = supabaseBrowser
        .channel(`public:${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        if (payload.eventType === 'INSERT' && onInsert) {
            onInsert(payload.new);
        }
        else if (payload.eventType === 'UPDATE' && onUpdate) {
            onUpdate(payload.new);
        }
        else if (payload.eventType === 'DELETE' && onDelete) {
            onDelete(payload.old);
        }
    })
        .subscribe();
    return channel;
}
