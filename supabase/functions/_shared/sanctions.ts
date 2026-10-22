// Moderação: contas silenciadas (mute) ou banidas (ban) não enviam conteúdo nem pagam.
// Falha FECHADA: se a consulta ao banco der erro, trata como sancionado (melhor negar do que liberar).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export async function isSanctioned(admin: SupabaseClient, userId: string, kinds: ("mute" | "ban")[]): Promise<boolean> {
  const { data, error } = await admin.rpc("is_sanctioned", { p_user: userId, p_kinds: kinds });
  if (error) {
    console.error("is_sanctioned_failed", error.message);
    return true;
  }
  return data === true;
}
