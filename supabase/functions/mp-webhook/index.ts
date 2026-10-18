// Edge Function: webhook do Mercado Pago.
//
// Recebe a notificação de pagamento, consulta o status real no Mercado Pago
// (nunca confiar só no corpo do webhook), e se estiver aprovado:
//   - marca orders.status = 'paid' (idempotente: só se ainda não estava paga)
//   - cria o entitlement do item
//   - envia o recibo por e-mail via Resend
//
// Segredos: MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//           RESEND_API_KEY (opcional), MP_WEBHOOK_SECRET (validação da origem).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { sendReceipt } from "../_shared/resend.ts";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  try {
    // TODO: validar a assinatura do webhook (header x-signature + MP_WEBHOOK_SECRET)
    // antes de processar, para garantir que a chamada veio do Mercado Pago.
    const body = await req.json().catch(() => null);
    const paymentId = body?.data?.id ?? body?.id;
    if (!paymentId) return new Response("ignored", { status: 200 });

    // Consulta o pagamento real no Mercado Pago.
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    const payment = await mpRes.json();
    if (!mpRes.ok) return new Response("mp_lookup_failed", { status: 502 });
    if (payment.status !== "approved") return new Response("not_approved", { status: 200 });

    const externalReference = payment.external_reference as string | undefined;
    if (!externalReference) return new Response("no_reference", { status: 200 });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Idempotência: só processa se a ordem ainda estiver pendente.
    const { data: order } = await admin
      .from("orders")
      .select("id, user_id, item_id, status")
      .eq("external_reference", externalReference)
      .single();
    if (!order) return new Response("order_not_found", { status: 200 });
    if (order.status === "paid") return new Response("already_paid", { status: 200 });

    await admin
      .from("orders")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "pending");

    // Concede o item (unique user_id+item_id evita duplicata).
    await admin
      .from("entitlements")
      .upsert(
        { user_id: order.user_id, item_id: order.item_id, source: "purchase" },
        { onConflict: "user_id,item_id", ignoreDuplicates: true },
      );

    // Recibo por e-mail (não bloqueia a liberação se falhar).
    const { data: userRow } = await admin.auth.admin.getUserById(order.user_id);
    const email = userRow?.user?.email;
    if (email) {
      await sendReceipt(email, order.item_id, payment.transaction_amount).catch(() => {});
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response(`internal: ${e}`, { status: 500 });
  }
});
