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

/**
 * Client ID OAuth do Google (público — não é segredo, é o mesmo valor que
 * fica visível no HTML de qualquer app que usa Google Identity Services).
 * Usado para o botão de login via GIS (apps/client/src/auth/GoogleSignInButton.tsx),
 * que evita o redirect de página inteira (e a tela do Google mostrando a
 * URL do Supabase) do fluxo `signInWithOAuth` padrão.
 */
export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
