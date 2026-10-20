// Edge Function: cria (ou reaproveita) a cobrança Pix de um superchat JÁ APROVADO.
//
// Só cobra superchat do próprio usuário com status 'awaiting_payment' (aprovado
// na moderação). O valor vem do banco, nunca do cliente. A exibição só acontece
// quando o webhook (mp-webhook) confirma o pagamento e marca 'paid'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const { id } = await req.json().catch(() => ({ id: null }));
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "id_required" }, 400);

    const { data: sc } = await admin
      .from("superchats")
      .select("id, user_id, status, amount_cents, name, external_reference, mp_payment_id")
      .eq("id", id)
      .maybeSingle();
    if (!sc || sc.user_id !== userId) return json({ error: "not_found" }, 404);
    if (sc.status === "paid") return json({ error: "already_paid" }, 409);
    if (sc.status !== "awaiting_payment") return json({ error: "not_approved" }, 409);

    // Reaproveita a cobrança Pix pendente (evita uma nova a cada clique).
    if (sc.mp_payment_id) {
      const existing = await fetch(`https://api.mercadopago.com/v1/payments/${sc.mp_payment_id}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });
      if (existing.ok) {
        const ep = await existing.json();
        if (ep.status === "pending") return json(charge(sc.external_reference, ep));
        if (ep.status === "approved") {
          // Pago, webhook ainda não processou: o webhook conclui (idempotente).
          return json({ orderRef: sc.external_reference, qrCode: null, qrCodeBase64: null, ticketUrl: null, paid: true });
        }
        // rejected/cancelled/expired: cria cobrança nova abaixo.
      }
    }

    // Referência nova ANTES de chamar o Mercado Pago (nunca cobrar sem registro).
    const externalReference = crypto.randomUUID();
    const { error: refErr } = await admin
      .from("superchats")
      .update({ external_reference: externalReference, mp_payment_id: null })
      .eq("id", sc.id)
      .eq("status", "awaiting_payment");
    if (refErr) {
      console.error("superchat_ref_failed", refErr.message);
      return json({ error: "order_failed" }, 500);
    }

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "X-Idempotency-Key": externalReference,
      },
      body: JSON.stringify({
        transaction_amount: Number((sc.amount_cents / 100).toFixed(2)),
        description: "Superchat",
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
    await admin.from("superchats").update({ mp_payment_id: String(mp.id) }).eq("id", sc.id);
    return json(charge(externalReference, mp));
  } catch (e) {
    console.error("superchat-pay internal", e);
    return json({ error: "internal" }, 500);
  }
});

function charge(orderRef: string | null, p: { point_of_interaction?: { transaction_data?: Record<string, string> } }) {
  const tx = p.point_of_interaction?.transaction_data ?? {};
  return {
    orderRef,
    qrCode: tx.qr_code ?? null,
    qrCodeBase64: tx.qr_code_base64 ?? null,
    ticketUrl: tx.ticket_url ?? null,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
