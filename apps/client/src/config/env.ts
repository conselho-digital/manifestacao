/**
 * Configuração vinda de variáveis de ambiente do Vite (prefixo VITE_).
 * Defina-as na Vercel e num `.env.local` para desenvolvimento (ver .env.example).
 * Quando ausentes, o jogo roda em modo offline (sem multiplayer).
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfig =
  url && anonKey ? { url, anonKey } : null;

/** true quando há credenciais do Supabase para ligar o Realtime. */
export const isOnlineEnabled = supabaseConfig !== null;
