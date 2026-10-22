import { FunctionsHttpError } from "@supabase/supabase-js";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { SIGN_ID_RE, type CustomSign } from "@manifestacao/shared";
import { getSupabase } from "./supabase.js";
import type { PixCharge } from "./payments.js";

const ERRORS: Record<string, string> = {
  sanctioned: "Sua conta está silenciada ou banida. Veja o aviso no jogo.",
  text_invalid: "Texto inválido (1 a 40 caracteres).",
  color_invalid: "Escolha uma das cores.",
  content_blocked: "Texto não permitido: sem links, telefones, @ de contato ou palavras ofensivas.",
  too_many_open: "Você já tem cartazes em análise ou aguardando pagamento. Aguarde ou pague antes de enviar outro.",
  busy: "Gerando o Pix… tente de novo em alguns segundos.",
  payment_provider_error: "O Mercado Pago não respondeu. Tente de novo em instantes.",
  not_found: "Cartaz não encontrado.",
  insert_failed: "Não foi possível enviar agora. Tente de novo.",
  not_approved: "Este cartaz ainda não foi aprovado.",
  already_paid: "Este cartaz já está ativo.",
  unauthorized: "Entre com sua conta para enviar.",
};

async function call<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Sem conexão com o Supabase.");
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>(fn, { body });
  if (error) {
    let code: string | undefined;
    if (error instanceof FunctionsHttpError) {
      code = ((await error.context.json().catch(() => null)) as { error?: string } | null)?.error;
    }
    throw new Error((code && ERRORS[code]) ?? "Não foi possível concluir. Tente de novo.");
  }
  if (!data || data.error) throw new Error(ERRORS[data?.error ?? ""] ?? "Não foi possível concluir.");
  return data;
}

export function submitSign(text: string, color: string) {
  return call<{ id: string }>("sign-submit", { text, color });
}

export function paySign(id: string) {
  return call<PixCharge>("sign-pay", { id });
}

/** Cartazes do usuário logado. `null` = falha (mantém a lista anterior). */
export async function fetchMySigns(): Promise<CustomSign[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_signs");
  return error ? null : ((data as CustomSign[] | null) ?? []);
}

/** Cartazes ATIVOS (pagos) por id — é com isso que se valida o que vem pela rede. */
export async function fetchActiveSigns(ids: string[]): Promise<Pick<CustomSign, "id" | "text" | "color">[]> {
  const supabase = getSupabase();
  const valid = ids.filter((id) => SIGN_ID_RE.test(id));
  if (!supabase || valid.length === 0) return [];
  const { data } = await supabase.from("custom_signs").select("id, text, color").eq("status", "active").in("id", valid.slice(0, 50));
  return (data as Pick<CustomSign, "id" | "text" | "color">[] | null) ?? [];
}

/** Realtime: cartaz que vira 'refunded' (Pix estornado) — a cena o retira. */
export function subscribeSignRefunds(onRefunded: (id: string) => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const channel: RealtimeChannel = supabase
    .channel("signs-live")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "custom_signs" }, (p) => {
      const r = p.new as { id?: unknown; status?: unknown } | null;
      if (r && r.status === "refunded" && typeof r.id === "string") onRefunded(r.id);
    })
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
