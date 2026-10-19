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

/** Inicia o login com Google (redireciona e volta para a mesma página). */
export async function signInWithGoogle(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}
