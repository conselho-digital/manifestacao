// Edge Function: envia um superchat para a fila de moderação (ainda SEM cobrança).
//
// Fluxo (CLAUDE.md §3): conteúdo é verificado antes de cobrar e de exibir.
//  1. valida usuário (JWT), nome, mensagem e valor (R$ 5 a R$ 200)
//  2. filtro automático (links, telefone, palavras proibidas)
//  3. grava com status 'review'; o admin aprova → 'awaiting_payment' → o usuário paga (superchat-pay)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { checkContent, sanitize } from "../_shared/moderation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Mesmos limites de packages/shared/src/superchat.ts (Edge Functions não importam o pacote).
const MIN_CENTS = 500;
const MAX_CENTS = 20000;
const MAX_NAME = 40;
const MAX_MESSAGE = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? sanitize(body.name) : "";
    const message = typeof body?.message === "string" ? sanitize(body.message) : "";
    const amountCents = body?.amountCents;

    if (!name || name.length > MAX_NAME) return json({ error: "name_invalid" }, 400);
    if (!message || message.length > MAX_MESSAGE) return json({ error: "message_invalid" }, 400);
    if (!Number.isInteger(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
      return json({ error: "amount_invalid" }, 400);
    }

    const verdict = checkContent(name, message);
    if (!verdict.ok) {
      // Log limitado por usuário (spam de bloqueios não enche a tabela).
      const target = `user:${userId}`;
      const { count: blocked } = await admin
        .from("moderation_log")
        .select("id", { count: "exact", head: true })
        .eq("target", target)
        .eq("action", "superchat_auto_blocked")
        .gt("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
      if ((blocked ?? 0) < 5) {
        await admin.from("moderation_log").insert({ actor: null, target, action: "superchat_auto_blocked", reason: verdict.reason });
      }
      return json({ error: "content_blocked", reason: verdict.reason }, 422);
    }

    // Limites (3 em aberto, 10 por dia) checados de forma atômica no banco.
    const { data: id, error } = await admin.rpc("superchat_create", {
      p_user: userId,
      p_name: name,
      p_message: message,
      p_amount: amountCents,
    });
    if (error || !id) {
      const msg = error?.message ?? "";
      if (msg.includes("too_many_open") || msg.includes("too_many_daily")) return json({ error: "too_many_open" }, 429);
      console.error("superchat_create_failed", msg);
      return json({ error: "insert_failed" }, 500);
    }
    return json({ id, status: "review" });
  } catch (e) {
    console.error("superchat-submit internal", e);
    return json({ error: "internal" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
