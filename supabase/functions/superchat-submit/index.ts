// Edge Function: envia um superchat para a fila de moderação (ainda SEM cobrança).
//
// Fluxo (CLAUDE.md §3): conteúdo é verificado antes de cobrar e de exibir.
//  1. valida usuário (JWT), nome, mensagem e valor (R$ 5 a R$ 200)
//  2. filtro automático (links, telefone, palavras proibidas)
//  3. grava com status 'review'; o admin aprova → 'awaiting_payment' → o usuário paga (superchat-pay)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { checkContent } from "../_shared/moderation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Mesmos limites de packages/shared/src/superchat.ts (Edge Functions não importam o pacote).
const MIN_CENTS = 500;
const MAX_CENTS = 20000;
const MAX_NAME = 40;
const MAX_MESSAGE = 200;
const MAX_OPEN = 3;

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
    const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    const message = typeof body?.message === "string" ? body.message.trim().replace(/\s+/g, " ") : "";
    const amountCents = body?.amountCents;

    if (!name || name.length > MAX_NAME) return json({ error: "name_invalid" }, 400);
    if (!message || message.length > MAX_MESSAGE) return json({ error: "message_invalid" }, 400);
    if (!Number.isInteger(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
      return json({ error: "amount_invalid" }, 400);
    }

    const verdict = checkContent(name, message);
    if (!verdict.ok) {
      await admin.from("moderation_log").insert({
        actor: null,
        target: `user:${userId}`,
        action: "superchat_auto_blocked",
        reason: verdict.reason,
      });
      return json({ error: "content_blocked", reason: verdict.reason }, 422);
    }

    // Limite de pedidos em aberto por conta.
    const { count } = await admin
      .from("superchats")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["review", "awaiting_payment"]);
    if ((count ?? 0) >= MAX_OPEN) return json({ error: "too_many_open" }, 429);

    const { data: row, error } = await admin
      .from("superchats")
      .insert({ user_id: userId, name, message, amount_cents: amountCents, status: "review" })
      .select("id")
      .single();
    if (error || !row) {
      console.error("superchat_insert_failed", error?.message);
      return json({ error: "insert_failed" }, 500);
    }
    return json({ id: row.id, status: "review" });
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
