import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "../net/supabase.js";

export interface MySanctions {
  banned: boolean;
  /** Fim do silêncio (ms desde 1970); null = não está silenciado. */
  mutedUntil: number | null;
  reason: string | null;
}

const NONE: MySanctions = { banned: false, mutedUntil: null, reason: null };
const REFRESH_MS = 60_000;

/**
 * Sanções ativas da conta logada (silêncio/banimento aplicados no painel de admin). Consulta ao entrar e a cada
 * minuto, para um banimento valer sem recarregar. Sem sessão ou Supabase: sem sanções.
 * Obs.: é uma barreira de interface — o servidor também recusa conteúdo e pagamento de contas sancionadas.
 */
export function useSanctions(session: Session | null): MySanctions {
  const [state, setState] = useState<MySanctions>(NONE);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !userId) {
      setState(NONE);
      return;
    }
    let cancelled = false;
    const load = () =>
      void supabase.rpc("my_sanctions").then(({ data, error }) => {
        if (cancelled || error) return;
        const rows = (data as { kind: string; reason: string | null; expires_at: string | null }[]) ?? [];
        let banned = false;
        let mutedUntil: number | null = null;
        let reason: string | null = null;
        for (const r of rows) {
          reason = reason ?? r.reason;
          if (r.kind === "ban") banned = true;
          if (r.kind === "mute") {
            const t = r.expires_at ? Date.parse(r.expires_at) : Number.MAX_SAFE_INTEGER;
            mutedUntil = Math.max(mutedUntil ?? 0, Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER);
          }
        }
        setState({ banned, mutedUntil, reason });
      });
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [userId]);

  return state;
}
