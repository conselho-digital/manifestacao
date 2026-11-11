// Login com conta Google pelo Supabase Auth (a mesma configuração do projeto anterior).
import { supabase } from './supabase';

export interface AuthUser {
  id: string;
  /** nome da conta Google (só para sugerir o nome do jogador) */
  name: string;
}

/** Em desenvolvimento, ?dev=1 pula o login (só no `npm run dev`; o site publicado sempre exige). */
const devBypass = (): boolean => import.meta.env.DEV && new URLSearchParams(location.search).has('dev');

/** O Supabase está configurado? Sem ele não há como entrar (exceto no modo dev). */
export const authAvailable = (): boolean => !!supabase || devBypass();

/** Usuário logado (a sessão volta do Google no endereço da página e o Supabase a guarda). */
export async function currentUser(): Promise<AuthUser | null> {
  if (devBypass()) return { id: 'dev', name: 'Dev' };
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const u = data.session?.user;
    if (!u) return null;
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const name = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : '';
    return { id: u.id, name: name.slice(0, 40) };
  } catch {
    return null;
  }
}

/** Abre o login do Google; ao voltar, a página recarrega já com a sessão. */
export async function signInWithGoogle(): Promise<string | null> {
  if (!supabase) return 'Login indisponível: o Supabase não está configurado.';
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${location.origin}${location.pathname}`, queryParams: { prompt: 'select_account' } },
  });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  try { await supabase?.auth.signOut(); } catch { /* segue */ }
}
