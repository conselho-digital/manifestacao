import { getSupabase } from "./supabase.js";

export interface PixCharge {
  orderRef: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
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
  if (!data || data.error) throw new Error(data?.error ?? "Falha ao criar cobrança");
  return data;
}
