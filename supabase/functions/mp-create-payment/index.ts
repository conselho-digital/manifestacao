// Edge Function: cria uma cobrança Pix no Mercado Pago para um item do catálogo.
//
// Fluxo (CLAUDE.md §5):
//  1. valida o usuário (JWT do Supabase) e o item
//  2. grava orders.status = 'pending' com external_reference ANTES de criar o
//     pagamento no Mercado Pago (nunca o contrário — ver nota de robustez abaixo)
//  3. cria o pagamento Pix no Mercado Pago
//  4. devolve QR Code / copia-e-cola para o cliente
//
// Segredos (configurar em Supabase → Edge Functions → Secrets):
//   MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Observação: a liberação do item NÃO acontece aqui no caminho normal — só no
// webhook confirmado (mp-webhook). A única exceção é o caminho de reaproveitar
// um pedido pendente que, ao reconsultar, já veio "approved" no Mercado Pago
// (corrida com o webhook, que pode ainda não ter processado); nesse caso
// concedemos aqui com a mesma idempotência/transição atômica do webhook.
//
// Nota de robustez: a ORDEM importa. Criar o pagamento no Mercado Pago antes
// de garantir a linha em `orders` deixaria um pagamento "órfão" (dinheiro
// cobrado, sem registro local) se o INSERT falhasse depois. Por isso o pedido
// é gravado primeiro (sem mp_payment_id ainda) e só então chamamos o MP.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { isSanctioned } from "../_shared/sanctions.ts";
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
    if (await isSanctioned(admin, userId, ["ban"])) return json({ error: "sanctioned" }, 403);

    const { itemId } = await req.json().catch(() => ({ itemId: null }));
    if (!itemId) return json({ error: "item_required" }, 400);

    // Confere o item ativo e o preço no catálogo (nunca confiar no cliente).
    const { data: item, error: itemErr } = await admin
      .from("catalog_items")
      .select("id, price_cents, label, active")
      .eq("id", itemId)
      .single();
    if (itemErr || !item || !item.active) return json({ error: "item_invalid" }, 400);
    // Item de preço zero não é vendido (evita pedidos/cobranças inválidas).
    if (!Number.isInteger(item.price_cents) || item.price_cents <= 0) return json({ error: "item_not_for_sale" }, 400);

    // Já possui: não cobra de novo.
    const { data: owned } = await admin
      .from("entitlements")
      .select("id")
      .eq("user_id", userId)
      .eq("item_id", item.id)
      .maybeSingle();
    if (owned) return json({ error: "already_owned" }, 409);

    // Reaproveita um pedido pendente recente do mesmo usuário+item em vez de
    // criar outra cobrança a cada clique.
    const { data: pending } = await admin
      .from("orders")
      .select("id, mp_payment_id, external_reference, status, amount_cents, created_at")
      .eq("user_id", userId)
      .eq("item_id", item.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Pedido pendente SEM pagamento criado: se é recente, outra chamada está criando agora (evita 2 Pix);
    // se travou, será descartado abaixo.
    if (pending && !pending.mp_payment_id && Date.now() - new Date(pending.created_at).getTime() < 60_000) {
      return json({ error: "busy" }, 409);
    }

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

        if (ep.status === "approved") {
          // Já foi pago — provavelmente o webhook ainda não processou. Concede
          // aqui mesmo, com a mesma idempotência do webhook (nunca duas vezes,
          // nunca sem conferir o valor), em vez de criar uma SEGUNDA cobrança.
          await grantPaidOrder(admin, pending.id, userId, item.id, Number(ep.transaction_amount), pending.amount_cents);
          return json({ orderRef: pending.external_reference, qrCode: null, qrCodeBase64: null, ticketUrl: null, paid: true });
        }

        // rejected/cancelled/expired/outro: segue para criar uma cobrança nova.
      }
    }

    // Chegou aqui: o pendente anterior (se houver) está morto (rejeitado/expirado/travado). Fecha-o:
    // o banco só permite UM pedido pendente por usuário e item.
    if (pending) {
      await admin.from("orders").update({ status: "failed" }).eq("id", pending.id).eq("status", "pending");
    }

    const externalReference = crypto.randomUUID();

    // Grava o pedido ANTES de chamar o Mercado Pago (ver nota de robustez no
    // topo do arquivo): se isto falhar, nenhum pagamento é criado — nunca
    // cobramos sem ter onde registrar a confirmação depois.
    const { data: orderRow, error: orderErr } = await admin
      .from("orders")
      .insert({
        user_id: userId,
        item_id: item.id,
        amount_cents: item.price_cents,
        external_reference: externalReference,
        status: "pending",
      })
      .select("id")
      .single();
    if (orderErr?.code === "23505") return json({ error: "busy" }, 409); // outra chamada criou o pendente primeiro
    if (orderErr || !orderRow) {
      console.error("order_insert_failed", orderErr?.message);
      return json({ error: "order_failed" }, 500);
    }

    // Cria o pagamento Pix no Mercado Pago.
    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "X-Idempotency-Key": externalReference,
      },
      body: JSON.stringify({
        transaction_amount: Number((item.price_cents / 100).toFixed(2)),
        description: item.label,
        payment_method_id: "pix",
        external_reference: externalReference,
        payer: { email: userData.user.email ?? "sem-email@example.com" },
      }),
    });
    const mp = await mpRes.json();
    if (!mpRes.ok) {
      console.error("mp_error", mp);
      // Nenhum pagamento foi criado: fecha o pedido para o usuário poder tentar de novo na hora
      // (o banco só permite UM pendente por usuário e item).
      await admin.from("orders").update({ status: "failed" }).eq("id", orderRow.id).eq("status", "pending");
      return json({ error: "payment_provider_error" }, 502);
    }

    // Preenche o id do pagamento no pedido já existente (best effort: mesmo
    // se isto falhar, o webhook encontra o pedido pelo external_reference).
    await admin.from("orders").update({ mp_payment_id: String(mp.id) }).eq("id", orderRow.id);

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

/**
 * Concede o entitlement e marca o pedido como pago, de forma idempotente
 * (mesma lógica do mp-webhook): só grava se a transição pending->paid for
 * esta chamada, e confere o valor pago contra o esperado antes de conceder.
 */
async function grantPaidOrder(
  admin: ReturnType<typeof createClient>,
  orderId: string,
  userId: string,
  itemId: string,
  paidAmount: number,
  expectedCents: number,
): Promise<void> {
  if (Math.round(paidAmount * 100) !== expectedCents) {
    console.error("amount_mismatch_on_create_payment", { orderId, paidAmount, expectedCents });
    return;
  }
  await admin
    .from("entitlements")
    .upsert({ user_id: userId, item_id: itemId, source: "purchase" }, { onConflict: "user_id,item_id", ignoreDuplicates: true });
  await admin
    .from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "pending");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
