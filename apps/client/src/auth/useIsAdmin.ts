import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "../net/supabase.js";

/**
 * true se a conta logada é admin. A decisão vem do banco (função `is_admin()`,
 * baseada na lista de e-mails em `admin_emails`) — o cliente só usa isso para
 * mostrar o botão; quem protege de verdade é o RLS nas tabelas e no bucket.
 */
export function useIsAdmin(session: Session | null): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !userId) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    void supabase.rpc("is_admin").then(({ data, error }) => {
      if (!cancelled) setIsAdmin(!error && data === true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return isAdmin;
}
