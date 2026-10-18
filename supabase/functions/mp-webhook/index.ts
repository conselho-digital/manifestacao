// Edge Function: webhook do Mercado Pago.
//
// Recebe a notificação de pagamento, VALIDA a assinatura (x-signature), consulta
// o status real no Mercado Pago (nunca confiar só no corpo), e se aprovado:
//   - garante o entitlement do item (idempotente)
//   - marca orders.status = 'paid' de forma atômica (pending -> paid)
//   - envia o recibo por e-mail só na transição real (evita recibo duplicado)
//
// Segredos: MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//           RESEND_API_KEY (opcional), MP_WEBHOOK_SECRET (assinatura).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { sendReceipt } from "../_shared/resend.ts";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("MP_WEBHOOK_SECRET") ?? "";

/**
 * Valida a assinatura do Mercado Pago.
 * Manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * HMAC-SHA256(manifest, MP_WEBHOOK_SECRET) == v1 (hex).
 * Falha fechada quando o segredo está configurado; sem segredo, não valida
 * (apenas para desenvolvimento).
 */
async function signatureValid(req: Request, dataId: string): Promise<boolean> {
  if (!WEBHOOK_SECRET) return true; // dev: sem segredo configurado
  const sig = req.headers.get("x-signature") ?? "";
  const requestId = req.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(
    sig.split(",").map((kv) => kv.split("=").map((s) => s.trim()) as [string, string]),
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // Comparação em tempo constante.
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => null);
    const dataId = url.searchParams.get("data.id") ?? body?.data?.id ?? body?.id;
    if (!dataId) return new Response("ignored", { status: 200 });

    if (!(await signatureValid(req, String(dataId)))) {
      return new Response("invalid_signature", { status: 401 });
    }

    // Consulta o pagamento real no Mercado Pago.
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (!mpRes.ok) return new Response("mp_lookup_failed", { status: 502 });
    const payment = await mpRes.json();
    if (payment.status !== "approved") return new Response("not_approved", { status: 200 });

    const externalReference = payment.external_reference as string | undefined;
    if (!externalReference) return new Response("no_reference", { status: 200 });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: order } = await admin
      .from("orders")
      .select("id, user_id, item_id, amount_cents, status")
      .eq("external_reference", externalReference)
      .single();
    if (!order) return new Response("order_not_found", { status: 200 });

    // Defesa em profundidade: confere o valor pago contra o esperado.
    if (Math.round((payment.transaction_amount ?? 0) * 100) !== order.amount_cents) {
      return new Response("amount_mismatch", { status: 200 });
    }

    // Garante o item SEMPRE (idempotente): mesmo se uma tentativa anterior
    // marcou 'paid' mas falhou ao conceder, o reenvio recria aqui.
    await admin
      .from("entitlements")
      .upsert(
        { user_id: order.user_id, item_id: order.item_id, source: "purchase" },
        { onConflict: "user_id,item_id", ignoreDuplicates: true },
      );

    // Transição atômica pending -> paid. Só quem efetivamente transicionou
    // (linhas retornadas) envia o recibo, evitando e-mail duplicado em reenvios.
    const { data: transitioned } = await admin
      .from("orders")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "pending")
      .select("id");

    if (transitioned && transitioned.length > 0) {
      const { data: userRow } = await admin.auth.admin.getUserById(order.user_id);
      const email = userRow?.user?.email;
      if (email) {
        await sendReceipt(email, order.item_id, payment.transaction_amount).catch(() => {});
      }
    }

    return new Response("ok", { status: 200 });
  } catch (_e) {
    // Não vaza detalhes internos ao chamador.
    return new Response("internal_error", { status: 500 });
  }
});
