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
 * Falha FECHADA: sem MP_WEBHOOK_SECRET configurado, toda chamada é recusada.
 * (Só para desenvolvimento local: ALLOW_UNSIGNED_WEBHOOK=1 libera.)
 */
async function signatureValid(req: Request, dataId: string): Promise<boolean> {
  if (!WEBHOOK_SECRET) {
    if (Deno.env.get("ALLOW_UNSIGNED_WEBHOOK") === "1") return true;
    console.error("MP_WEBHOOK_SECRET ausente: webhook recusado");
    return false;
  }
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

/** Conteúdos pagos que seguem o mesmo fluxo (moderação → Pix → ativo). */
interface Kind {
  table: string;
  pay: string;
  fk: string;
  /** Status final quando quitado. */
  done: string;
  log: string;
  /** RPC que quita (em vez do update direto) e RPC que estorna — usadas pelos lances de telão (crédito). */
  settleRpc?: string;
  refundRpc?: string;
}
const KINDS: Record<string, Kind> = {
  superchat: { table: "superchats", pay: "superchat_payments", fk: "superchat_id", done: "paid", log: "superchat" },
  sign: { table: "custom_signs", pay: "sign_payments", fk: "sign_id", done: "active", log: "sign" },
  bid: {
    table: "billboard_bids",
    pay: "billboard_payments",
    fk: "bid_id",
    done: "active",
    log: "bid",
    settleRpc: "bid_settle",
    refundRpc: "bid_refund",
  },
};

/** Acha a tentativa de pagamento (superchat ou cartaz) pela external_reference. */
async function findAttempt(
  admin: ReturnType<typeof createClient>,
  externalReference: string,
): Promise<{ kind: Kind; parentId: string; settled: boolean; amountCents: number } | "error" | null> {
  for (const kind of Object.values(KINDS)) {
    const { data, error } = await admin
      .from(kind.pay)
      .select(`${kind.fk}, settled, amount_cents`)
      .eq("external_reference", externalReference)
      .maybeSingle();
    if (error) return "error";
    if (data) {
      const row = data as unknown as Record<string, unknown>;
      return { kind, parentId: String(row[kind.fk]), settled: Boolean(row.settled), amountCents: Number(row.amount_cents) };
    }
  }
  return null;
}

// deno-lint-ignore no-explicit-any
async function settleContent(admin: ReturnType<typeof createClient>, kind: Kind, parentId: string, externalReference: string, amountCents: number, payment: any): Promise<Response> {
  const { data: parent, error } = await admin.from(kind.table).select("id, status").eq("id", parentId).single();
  const { data: attempt, error: attErr } = await admin
    .from(kind.pay)
    .select("id, settled")
    .eq("external_reference", externalReference)
    .single();
  if (error || !parent || attErr || !attempt) return new Response("db_error", { status: 500 });

  // Reenvio do webhook de uma tentativa que já quitou: só garante o estado final.
  const paidCents = Math.round((payment.transaction_amount ?? 0) * 100);
  const eligible =
    attempt.settled ||
    (parent.status === "awaiting_payment" && paidCents === amountCents && payment.payment_method_id === "pix");

  if (eligible) {
    if (!attempt.settled) {
      // Índice único parcial: só UMA tentativa por item pode quitar.
      const { error: lockErr } = await admin.from(kind.pay).update({ settled: true }).eq("id", attempt.id);
      if (lockErr) {
        if (lockErr.code !== "23505") return new Response("db_error", { status: 500 });
        return await refundUnsettled(admin, kind, parent.id, payment, "outra tentativa já quitou");
      }
    }
    // Transição atômica awaiting_payment -> ativo (idempotente).
    if (kind.settleRpc) {
      // Telão: a função do banco decide (ativo, ou superado na hora com valor devolvido em crédito).
      const { error: rpcErr } = await admin.rpc(kind.settleRpc, { p_bid: parent.id });
      if (rpcErr) return new Response("db_error", { status: 500 });
      return new Response("ok", { status: 200 });
    }
    const { error: upErr } = await admin
      .from(kind.table)
      .update({ status: kind.done, paid_at: new Date().toISOString() })
      .eq("id", parent.id)
      .eq("status", "awaiting_payment");
    if (upErr) return new Response("db_error", { status: 500 });
    return new Response("ok", { status: 200 });
  }

  return await refundUnsettled(admin, kind, parent.id, payment, `status=${parent.status} pago=${paidCents}`);
}

/** Dinheiro entrou mas não dá para exibir (já pago por outra tentativa, status mudou, valor divergente): estorna e registra. */
// deno-lint-ignore no-explicit-any
async function refundUnsettled(admin: ReturnType<typeof createClient>, kind: Kind, parentId: string, payment: any, why: string): Promise<Response> {
  console.error("unsettled_refund", { kind: kind.log, id: parentId, why });
  const refund = await fetch(`https://api.mercadopago.com/v1/payments/${payment.id}/refunds`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, "X-Idempotency-Key": `refund-${payment.id}`, "Content-Type": "application/json" },
    body: "{}",
  });
  await admin.from("moderation_log").insert({
    actor: null,
    target: `${kind.log}:${parentId}`,
    action: refund.ok ? `${kind.log}_auto_refunded` : `${kind.log}_refund_failed`,
    reason: why,
  });
  // Estorno falhou: 500 faz o MP reenviar e tentamos de novo.
  return new Response(refund.ok ? "refunded" : "refund_failed", { status: refund.ok ? 200 : 500 });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => null);
    // Só notificações de pagamento (merchant_order etc. têm outro formato de id).
    const type = url.searchParams.get("type") ?? body?.type;
    if (type && type !== "payment") return new Response("ignored", { status: 200 });
    const dataId = url.searchParams.get("data.id") ?? body?.data?.id ?? body?.id;
    // ID numérico: nunca monta a URL da API do Mercado Pago com texto livre.
    if (!dataId || !/^\d{1,20}$/.test(String(dataId))) return new Response("ignored", { status: 200 });

    if (!(await signatureValid(req, String(dataId)))) {
      return new Response("invalid_signature", { status: 401 });
    }

    // Consulta o pagamento real no Mercado Pago.
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (!mpRes.ok) return new Response("mp_lookup_failed", { status: 502 });
    const payment = await mpRes.json();
    const externalReference = payment.external_reference as string | undefined;

    // Devolução/estorno (CDC: direito de arrependimento): o pedido vira
    // 'refunded' e o item comprado é retirado do usuário.
    if (["refunded", "charged_back", "cancelled"].includes(payment.status)) {
      if (!externalReference) return new Response("no_reference", { status: 200 });
      const adminRefund = createClient(SUPABASE_URL, SERVICE_ROLE);
      // Superchat/cartaz pago e estornado: sai do ar (só se a tentativa estornada foi a que quitou).
      const attempt = await findAttempt(adminRefund, externalReference);
      if (attempt === "error") return new Response("db_error", { status: 500 });
      if (attempt) {
        if (!attempt.settled) return new Response("ignored", { status: 200 });
        if (attempt.kind.refundRpc) {
          const { error: rpcErr } = await adminRefund.rpc(attempt.kind.refundRpc, { p_bid: attempt.parentId });
          if (rpcErr) return new Response("db_error", { status: 500 });
          return new Response("refunded", { status: 200 });
        }
        const { error: upErr } = await adminRefund
          .from(attempt.kind.table)
          .update({ status: "refunded" })
          .eq("id", attempt.parentId)
          .eq("status", attempt.kind.done);
        if (upErr) return new Response("db_error", { status: 500 });
        return new Response("refunded", { status: 200 });
      }
      const { data: paidOrder } = await adminRefund
        .from("orders")
        .update({ status: "refunded" })
        .eq("external_reference", externalReference)
        .eq("status", "paid")
        .select("user_id, item_id");
      for (const o of paidOrder ?? []) {
        const { error: delErr } = await adminRefund
          .from("entitlements")
          .delete()
          .eq("user_id", o.user_id)
          .eq("item_id", o.item_id)
          .eq("source", "purchase");
        // 500 faz o Mercado Pago reenviar; o pedido já está 'refunded', então o reenvio só repete o delete.
        if (delErr) {
          console.error("refund_revoke_failed", delErr.message);
          return new Response("revoke_failed", { status: 500 });
        }
      }
      return new Response("refunded", { status: 200 });
    }

    if (payment.status !== "approved") return new Response("not_approved", { status: 200 });

    if (!externalReference) return new Response("no_reference", { status: 200 });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Superchat/cartaz: a referência está na tabela de tentativas de cada um.
    const attempt = await findAttempt(admin, externalReference);
    if (attempt === "error") return new Response("db_error", { status: 500 }); // MP reenvia
    if (attempt) return await settleContent(admin, attempt.kind, attempt.parentId, externalReference, attempt.amountCents, payment);

    const { data: order } = await admin
      .from("orders")
      .select("id, user_id, item_id, amount_cents, status")
      .eq("external_reference", externalReference)
      .single();
    if (!order) return new Response("order_not_found", { status: 200 });

    // Defesa em profundidade: confere o valor pago contra o esperado.
    if (Math.round((payment.transaction_amount ?? 0) * 100) !== order.amount_cents) {
      console.error("amount_mismatch", { orderId: order.id });
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
