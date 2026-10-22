import { getSupabase } from "./supabase.js";

export interface PixCharge {
  orderRef: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  /** true quando o pagamento já estava aprovado (corrida com o webhook);
   * o item já foi concedido no servidor, não há QR Code para mostrar. */
  paid?: boolean;
}

/**
 * Chama a Edge Function `mp-create-payment` (Mercado Pago Pix). Requer
 * usuário autenticado — `supabase.functions.invoke` já anexa o JWT da
 * sessão atual automaticamente.
 */
export async function createPixCharge(itemId: string): Promise<PixCharge> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase não configurado");

  const { data, error } = await supabase.functions.invoke<PixCharge & { error?: string }>(
    "mp-create-payment",
    { body: { itemId } },
  );
  if (error) throw error;
  if (data?.error === "sanctioned") throw new Error("Sua conta está banida e não pode comprar.");
  if (!data || data.error) throw new Error(data?.error ?? "Falha ao criar cobrança");
  return data;
}
