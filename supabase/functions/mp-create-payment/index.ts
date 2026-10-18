// Edge Function: cria uma cobrança Pix no Mercado Pago para um item do catálogo.
//
// Fluxo (CLAUDE.md §5):
//  1. valida o usuário (JWT do Supabase) e o item
//  2. cria o pagamento Pix no Mercado Pago
//  3. grava orders.status = 'pending' com external_reference (idempotência)
//  4. devolve QR Code / copia-e-cola para o cliente
//
// Segredos (configurar em Supabase → Edge Functions → Secrets):
//   MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Observação: a liberação do item NÃO acontece aqui — só no webhook confirmado
// (mp-webhook). Nunca conceder entitlement sem pagamento aprovado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Identifica o usuário pelo JWT enviado pelo cliente.
    const { data: userData, error: userErr } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const { itemId } = await req.json().catch(() => ({ itemId: null }));
    if (!itemId) return json({ error: "item_required" }, 400);

    // Confere o item ativo e o preço no catálogo (nunca confiar no cliente).
    const { data: item, error: itemErr } = await admin
      .from("catalog_items")
      .select("id, price_cents, label, active")
      .eq("id", itemId)
      .single();
    if (itemErr || !item || !item.active) return json({ error: "item_invalid" }, 400);

    // Idempotência: reaproveita um pedido pendente recente do mesmo usuário+item
    // em vez de criar outra cobrança a cada clique.
    const { data: pending } = await admin
      .from("orders")
      .select("mp_payment_id, external_reference")
      .eq("user_id", userId)
      .eq("item_id", item.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pending?.mp_payment_id) {
      const existing = await fetch(
        `https://api.mercadopago.com/v1/payments/${pending.mp_payment_id}`,
        { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } },
      );
      if (existing.ok) {
        const ep = await existing.json();
        if (ep.status === "pending") {
          const tx = ep.point_of_interaction?.transaction_data ?? {};
          return json({
            orderRef: pending.external_reference,
            qrCode: tx.qr_code ?? null,
            qrCodeBase64: tx.qr_code_base64 ?? null,
            ticketUrl: tx.ticket_url ?? null,
          });
        }
      }
    }

    const externalReference = crypto.randomUUID();

    // Cria o pagamento Pix no Mercado Pago.
    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "X-Idempotency-Key": externalReference,
      },
      body: JSON.stringify({
        transaction_amount: item.price_cents / 100,
        description: item.label,
        payment_method_id: "pix",
        external_reference: externalReference,
        payer: { email: userData.user.email ?? "sem-email@manifestacao.com" },
      }),
    });
    const mp = await mpRes.json();
    if (!mpRes.ok) {
      console.error("mp_error", mp);
      return json({ error: "payment_provider_error" }, 502);
    }

    // Registra o pedido pendente (idempotente por external_reference).
    const { error: orderErr } = await admin.from("orders").insert({
      user_id: userId,
      item_id: item.id,
      amount_cents: item.price_cents,
      mp_payment_id: String(mp.id),
      external_reference: externalReference,
      status: "pending",
    });
    if (orderErr) {
      console.error("order_insert_failed", orderErr.message);
      return json({ error: "order_failed" }, 500);
    }

    const tx = mp.point_of_interaction?.transaction_data ?? {};
    return json({
      orderRef: externalReference,
      qrCode: tx.qr_code ?? null,
      qrCodeBase64: tx.qr_code_base64 ?? null,
      ticketUrl: tx.ticket_url ?? null,
    });
  } catch (e) {
    console.error("mp-create-payment internal", e);
    return json({ error: "internal" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
