// Edge Function: cria (ou reaproveita) a cobrança Pix de um cartaz JÁ APROVADO.
//
// Só cobra cartaz do próprio usuário com status 'awaiting_payment' (aprovado
// na moderação). O valor é fixo no servidor. O cartaz só fica ativo
// quando o webhook (mp-webhook) confirma o pagamento.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Mesmo valor de SIGN_PRICE_CENTS em packages/shared/src/signs.ts.
const SIGN_PRICE_CENTS = 990;

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

    // Autor = sign_private.user_id (nunca confiar no cliente).
    const { data: sc } = await admin
      .from("custom_signs")
      .select("id, status, sign_private!inner(user_id)")
      .eq("id", id)
      .eq("sign_private.user_id", userId)
      .maybeSingle();
    if (!sc) return json({ error: "not_found" }, 404);
    if (sc.status === "active") return json({ error: "already_paid" }, 409);
    if (sc.status !== "awaiting_payment") return json({ error: "not_approved" }, 409);

    // Tentativa de cobrança aberta? (no máximo UMA por cartaz — índice parcial no banco.)
    const { data: open } = await admin
      .from("sign_payments")
      .select("id, external_reference, mp_payment_id, state, created_at")
      .eq("sign_id", sc.id)
      .in("state", ["creating", "pending"])
      .maybeSingle();

    if (open) {
      if (!open.mp_payment_id) {
        // Outra chamada está criando agora; se travou há mais de 60 s, descarta e recria.
        if (Date.now() - new Date(open.created_at).getTime() < 60_000) return json({ error: "busy" }, 409);
        await admin.from("sign_payments").update({ state: "dead" }).eq("id", open.id);
      } else {
        const existing = await fetch(`https://api.mercadopago.com/v1/payments/${open.mp_payment_id}`, {
          headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
        });
        // Sem resposta do MP: NÃO cria outra cobrança por cima (evitaria pagamento órfão).
        if (!existing.ok) return json({ error: "payment_provider_error" }, 502);
        const ep = await existing.json();
        if (ep.status === "pending") return json(charge(open.external_reference, ep));
        if (ep.status === "approved") {
          // Pago; o webhook conclui (idempotente). O cliente mostra "pagamento recebido".
          return json({ orderRef: open.external_reference, qrCode: null, qrCodeBase64: null, ticketUrl: null, paid: true });
        }
        // rejected/cancelled/expired: encerra e cria uma nova abaixo.
        await admin.from("sign_payments").update({ state: "dead" }).eq("id", open.id);
      }
    }

    // Reserva a tentativa ANTES de chamar o MP (nunca cobrar sem registro). Se duas
    // chamadas correrem juntas, o índice único barra a segunda.
    const externalReference = crypto.randomUUID();
    const { data: attempt, error: attemptErr } = await admin
      .from("sign_payments")
      .insert({ sign_id: sc.id, external_reference: externalReference, amount_cents: SIGN_PRICE_CENTS, state: "creating" })
      .select("id")
      .single();
    if (attemptErr || !attempt) return json({ error: "busy" }, 409);

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "X-Idempotency-Key": externalReference,
      },
      body: JSON.stringify({
        transaction_amount: Number((SIGN_PRICE_CENTS / 100).toFixed(2)),
        description: "Cartaz personalizado",
        payment_method_id: "pix",
        external_reference: externalReference,
        payer: { email: userData.user.email ?? "sem-email@example.com" },
      }),
    });
    const mp = await mpRes.json();
    if (!mpRes.ok) {
      console.error("mp_error", mp);
      await admin.from("sign_payments").update({ state: "dead" }).eq("id", attempt.id);
      return json({ error: "payment_provider_error" }, 502);
    }
    // Se isto falhar, a linha 'creating' fica e o webhook ainda casa pela referência.
    const { error: saveErr } = await admin
      .from("sign_payments")
      .update({ mp_payment_id: String(mp.id), state: "pending" })
      .eq("id", attempt.id);
    if (saveErr) console.error("sign_payment_save_failed", saveErr.message);
    return json(charge(externalReference, mp));
  } catch (e) {
    console.error("sign-pay internal", e);
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
