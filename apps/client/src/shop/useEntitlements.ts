import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "../net/supabase.js";

/**
 * Itens que o usuário logado possui (tabela `entitlements`, RLS: só lê os
 * próprios). Em modo offline/deslogado, sempre vazio.
 */
export function useEntitlements(session: Session | null) {
  const [owned, setOwned] = useState<Set<string>>(new Set());
  // Descarta respostas atrasadas de uma sessão anterior (ex.: usuário
  // deslogou/trocou de conta enquanto um fetch ainda estava em voo).
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const myRequest = ++requestId.current;
    const supabase = getSupabase();
    if (!supabase || !session) {
      if (myRequest === requestId.current) setOwned(new Set());
      return;
    }
    const { data } = await supabase.from("entitlements").select("item_id").eq("user_id", session.user.id);
    if (myRequest !== requestId.current) return; // resposta obsoleta, ignora
    setOwned(new Set((data ?? []).map((r) => r.item_id as string)));
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { owned, refresh };
}
