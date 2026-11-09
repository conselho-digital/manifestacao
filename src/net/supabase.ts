import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Cliente Supabase, ou null se as variáveis de ambiente não existirem. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, { realtime: { params: { eventsPerSecond: 40 } } })
    : null;
