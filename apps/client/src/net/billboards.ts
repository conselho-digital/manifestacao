import { FunctionsHttpError } from "@supabase/supabase-js";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { BillboardAd, MyBid } from "@manifestacao/shared";
import { getSupabase } from "./supabase.js";
import type { PixCharge } from "./payments.js";

const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

const ERRORS: Record<string, string> = {
  board_invalid: "Telão inválido.",
  amount_invalid: "Valor entre R$ 20,00 e R$ 1.000,00.",
  text_invalid: "Texto inválido (1 a 60 caracteres).",
  color_invalid: "Escolha uma das cores.",
  content_blocked: "Texto não permitido: sem links, telefones, @ de contato ou palavras ofensivas.",
  too_many_open: "Você já tem lances em análise ou aguardando pagamento. Aguarde ou pague antes de enviar outro.",
  busy: "Gerando o Pix… tente de novo em alguns segundos.",
  payment_provider_error: "O Mercado Pago não respondeu. Tente de novo em instantes.",
  not_found: "Lance não encontrado.",
  insert_failed: "Não foi possível enviar agora. Tente de novo.",
  not_approved: "Este lance ainda não foi aprovado.",
  already_paid: "Este lance já está no ar.",
  no_credit: "Seu crédito não cobre este lance.",
  unauthorized: "Entre com sua conta para dar lances.",
};

async function call<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Sem conexão com o Supabase.");
  const { data, error } = await supabase.functions.invoke<T & { error?: string; minCents?: number }>(fn, { body });
  const explain = (code?: string, minCents?: number) =>
    code === "bid_too_low"
      ? `Lance baixo: o mínimo agora é ${typeof minCents === "number" ? brl(minCents) : "maior"}.`
      : (code && ERRORS[code]) ?? "Não foi possível concluir. Tente de novo.";
  if (error) {
    let payload: { error?: string; minCents?: number } | null = null;
    if (error instanceof FunctionsHttpError) payload = await error.context.json().catch(() => null);
    throw new Error(explain(payload?.error, payload?.minCents));
  }
  if (!data || data.error) throw new Error(explain(data?.error, data?.minCents));
  return data;
}

export function submitBid(billboardId: string, text: string, color: string, amountCents: number) {
  return call<{ id: string }>("bid-submit", { billboardId, text, color, amountCents });
}

export function payBid(id: string) {
  return call<PixCharge>("bid-pay", { id });
}

/** Paga um lance aprovado com o crédito (saldo precisa cobrir tudo). */
export async function payBidWithCredit(id: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Sem conexão com o Supabase.");
  const { error } = await supabase.rpc("bid_pay_with_credit", { p_bid: id });
  if (error) {
    const known = Object.keys(ERRORS).find((k) => error.message.includes(k));
    throw new Error(error.message.includes("bid_too_low") ? "Lance superado: faça um novo, acima do atual." : (known && ERRORS[known]) ?? "Não foi possível pagar com crédito.");
  }
}

export async function fetchMyBids(): Promise<MyBid[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_bids");
  return error ? null : ((data as MyBid[] | null) ?? []);
}

export async function fetchMyCredit(): Promise<number | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_credit");
  return error || typeof data !== "number" ? null : data;
}

/** Lances no ar (leitura pública). */
export async function fetchActiveBids(): Promise<BillboardAd[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from("billboard_bids")
    .select("id, billboard_id, text, color, amount_cents")
    .eq("status", "active");
  return (data as BillboardAd[] | null) ?? [];
}

/** Realtime: novo ativo entra; superado/estornado sai. */
export function subscribeBids(onActive: (ad: BillboardAd) => void, onGone: (id: string) => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const channel: RealtimeChannel = supabase
    .channel("billboards-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "billboard_bids" }, (p) => {
      const r = p.new as Partial<BillboardAd> & { status?: string };
      if (!r || typeof r.id !== "string") return;
      if (r.status === "active") {
        if (typeof r.billboard_id === "string" && typeof r.text === "string" && typeof r.color === "string" && typeof r.amount_cents === "number") {
          onActive(r as BillboardAd);
        }
      } else if (r.status === "outbid" || r.status === "refunded") {
        onGone(r.id);
      }
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("billboards realtime:", status);
    });
  return () => {
    void supabase.removeChannel(channel);
  };
}
