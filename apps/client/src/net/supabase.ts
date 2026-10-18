import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "../config/env.js";

/**
 * Cliente Supabase único (ou null em modo offline). Usa apenas a chave
 * ANÔNIMA pública — nunca a service_role, que fica só no servidor.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfig) return null;
  if (!client) {
    client = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      realtime: { params: { eventsPerSecond: 15 } },
    });
  }
  return client;
}
