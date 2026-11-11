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

// ---------- botão oficial do Google (Google Identity Services) ----------
// O popup do Google mostra o nome/endereço DESTE site (e não o endereço do Supabase, que aparece no login por redirecionamento).
// O Google devolve um token (JWT) e o Supabase só confere (signInWithIdToken). Precisa de `https://manifestacao-ten.vercel.app`
// em "Origens JavaScript autorizadas" do cliente OAuth no Google Cloud (o Client ID é público, não é segredo).
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)
  ?? '992845805301-bs1e4r9m6nr9nmudj1vqu99365dje7ea.apps.googleusercontent.com';

interface GsiButtonOpts { type: string; theme: string; size: string; text: string; shape: string; logo_alignment: string; width: number; locale: string }
interface GsiApi {
  initialize(cfg: { client_id: string; callback: (r: { credential?: string }) => void; nonce: string; ux_mode: string; auto_select: boolean; use_fedcm_for_prompt: boolean }): void;
  renderButton(parent: HTMLElement, opts: GsiButtonOpts): void;
}
declare global {
  interface Window { google?: { accounts?: { id?: GsiApi } } }
}

let gsiLoad: Promise<GsiApi | null> | null = null;
function loadGsi(): Promise<GsiApi | null> {
  gsiLoad ??= new Promise((resolve) => {
    const ready = (): GsiApi | null => window.google?.accounts?.id ?? null;
    if (ready()) { resolve(ready()); return; }
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client?hl=pt-BR';
    sc.async = true;
    sc.onload = () => resolve(ready());
    sc.onerror = () => resolve(null);
    window.setTimeout(() => resolve(ready()), 8000);
    document.head.appendChild(sc);
  });
  return gsiLoad;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Desenha o botão "Continuar com o Google" dentro de `parent`. Ao concluir, chama `done` com o usuário (ou a mensagem de erro).
 * Retorna false se o botão não pôde ser criado (sem Supabase ou o script do Google não carregou).
 */
export async function renderGoogleButton(parent: HTMLElement, width: number, done: (user: AuthUser | null, error?: string) => void): Promise<boolean> {
  if (!supabase) return false;
  const gsi = await loadGsi();
  if (!gsi) return false;
  const client = supabase;
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  gsi.initialize({
    client_id: GOOGLE_CLIENT_ID,
    nonce: await sha256Hex(raw),
    ux_mode: 'popup',
    auto_select: false,
    use_fedcm_for_prompt: true,
    callback: (r) => {
      if (!r.credential) { done(null, 'O Google não devolveu o login. Tente de novo.'); return; }
      void client.auth.signInWithIdToken({ provider: 'google', token: r.credential, nonce: raw }).then(async ({ error }) => {
        if (error) done(null, error.message);
        else done(await currentUser());
      });
    },
  });
  gsi.renderButton(parent, { type: 'standard', theme: 'filled_blue', size: 'large', text: 'continue_with', shape: 'rectangular', logo_alignment: 'left', width: Math.max(200, Math.min(400, Math.round(width))), locale: 'pt-BR' });
  return true;
}

/** Login pelo redirecionamento do Supabase (reserva: mostra o endereço do Supabase no Google). */
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
