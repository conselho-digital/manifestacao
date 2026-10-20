import { FunctionsHttpError } from "@supabase/supabase-js";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Superchat } from "@manifestacao/shared";
import { getSupabase } from "./supabase.js";
import type { PixCharge } from "./payments.js";

const ERRORS: Record<string, string> = {
  name_invalid: "Nome inválido (1 a 40 letras).",
  message_invalid: "Mensagem inválida (1 a 200 caracteres).",
  amount_invalid: "Valor entre R$ 5,00 e R$ 200,00.",
  content_blocked: "Mensagem não permitida: sem links, telefones, @ de contato ou palavras ofensivas.",
  too_many_open: "Você já tem 3 superchats em análise ou aguardando pagamento.",
  busy: "Gerando o Pix… tente de novo em alguns segundos.",
  payment_provider_error: "O Mercado Pago não respondeu. Tente de novo em instantes.",
  not_found: "Superchat não encontrado.",
  insert_failed: "Não foi possível enviar agora. Tente de novo.",
  not_approved: "Este superchat ainda não foi aprovado.",
  already_paid: "Este superchat já foi pago.",
  unauthorized: "Entre com sua conta para enviar.",
};

/** Chama uma Edge Function e traduz o código de erro do corpo em texto pt-BR. */
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

export function submitSuperchat(name: string, message: string, amountCents: number) {
  return call<{ id: string }>("superchat-submit", { name, message, amountCents });
}

export function paySuperchat(id: string) {
  return call<PixCharge>("superchat-pay", { id });
}

/** Superchats do usuário logado, mais recentes primeiro. `null` = falha (mantém a lista anterior). */
export async function fetchMySuperchats(): Promise<Superchat[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  // RPC: autor e pagamentos ficam em tabelas privadas; a tabela pública só tem o que é de todos.
  const { data, error } = await supabase.rpc("my_superchats");
  return error ? null : ((data as Superchat[] | null) ?? []);
}

/**
 * Escuta superchats que viram 'paid' (INSERT ou UPDATE) via Realtime e entrega
 * cada um uma vez. Só linhas pagas passam pelo RLS público.
 */
export function subscribePaidSuperchats(onPaid: (s: Superchat) => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const seen = new Set<string>();
  const handle = (row: unknown) => {
    const s = row as Partial<Superchat> | null;
    if (!s || s.status !== "paid" || typeof s.id !== "string" || seen.has(s.id)) return;
    if (typeof s.name !== "string" || typeof s.message !== "string" || typeof s.amount_cents !== "number") return;
    seen.add(s.id);
    onPaid(s as Superchat);
  };
  const channel: RealtimeChannel = supabase
    .channel("superchats-paid")
    .on("postgres_changes", { event: "*", schema: "public", table: "superchats", filter: "status=eq.paid" }, (p) =>
      handle(p.new),
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("superchat realtime:", status);
    });
  return () => {
    void supabase.removeChannel(channel);
  };
}
