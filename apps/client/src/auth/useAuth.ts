import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "../net/supabase.js";

export interface AuthState {
  session: Session | null;
  loading: boolean;
}

/**
 * Sessão de autenticação (login só Google, CLAUDE.md §5). Em modo offline
 * (sem credenciais do Supabase) fica sempre deslogado — login é opcional
 * para jogar, só necessário para comprar.
 */
export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      // Sem isso, uma rejeição aqui travava `loading` em true pra sempre —
      // inclusive o próprio botão de login, que fica desabilitado enquanto
      // authLoading for true.
      .catch(() => setLoading(false));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

/**
 * Login com Google via redirect de página inteira (fluxo OAuth padrão do
 * Supabase). Funciona sempre, mas a tela do Google mostra a URL do projeto
 * Supabase ("Prosseguir para xxx.supabase.co"), não o domínio do jogo —
 * veja `GoogleSignInButton.tsx` para o fluxo sem redirect (preferido).
 * Mantido como alternativa (ex.: Google Identity Services bloqueado por
 * algum bloqueador de conteúdo).
 */
export async function signInWithGoogle(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
}

/**
 * Login com Google a partir de um ID token (JWT) já obtido no cliente via
 * Google Identity Services — sem redirect de página inteira. Ver
 * `GoogleSignInButton.tsx`, que coleta o token e chama isto.
 *
 * `nonce`: o mesmo valor passado em `google.accounts.id.initialize({nonce})`
 * — o Supabase confere que bate com o nonce embutido no token antes de
 * aceitar, impedindo que um ID token vazado por outro canal (log, extensão
 * maliciosa) seja reaproveitado fora desta tentativa de login específica.
 */
export async function signInWithGoogleIdToken(
  idToken: string,
  nonce: string,
): Promise<{ error: Error | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error("Supabase não configurado") };
  const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce });
  return { error };
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}
