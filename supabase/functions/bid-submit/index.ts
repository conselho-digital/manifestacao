// Edge Function: envia um lance de telão para a fila de moderação (ainda SEM cobrança).
// Conteúdo é verificado antes de cobrar e de exibir (CLAUDE.md §3). Lance abaixo do mínimo é recusado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { checkContent, sanitize } from "../_shared/moderation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Mesmos limites de packages/shared/src/billboards.ts (Edge Functions não importam o pacote).
const MAX_TEXT = 60;
const BOARDS = ["tela-1", "tela-2", "tela-3"];
const MIN_CENTS = 2000;
const MAX_CENTS = 100000;
const COLORS = ["#f8f9fa", "#ffd43b", "#51cf66", "#4dabf7", "#ff6b6b", "#b197fc"];

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
    const board = body?.billboardId;
    const amountCents = body?.amountCents;
    const text = typeof body?.text === "string" ? sanitize(body.text) : "";
    const color = body?.color;
    if (typeof board !== "string" || !BOARDS.includes(board)) return json({ error: "board_invalid" }, 400);
    if (!Number.isInteger(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
      return json({ error: "amount_invalid" }, 400);
    }
    if (!text || text.length > MAX_TEXT) return json({ error: "text_invalid" }, 400);
    if (typeof color !== "string" || !COLORS.includes(color)) return json({ error: "color_invalid" }, 400);

    const verdict = checkContent(text);
    if (!verdict.ok) {
      const target = `user:${userId}`;
      const { count: blocked } = await admin
        .from("moderation_log")
        .select("id", { count: "exact", head: true })
        .eq("target", target)
        .eq("action", "bid_auto_blocked")
        .gt("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
      if ((blocked ?? 0) < 5) {
        await admin.from("moderation_log").insert({ actor: null, target, action: "bid_auto_blocked", reason: verdict.reason });
      }
      return json({ error: "content_blocked", reason: verdict.reason }, 422);
    }

    const { data: id, error } = await admin.rpc("bid_create", {
      p_user: userId,
      p_board: board,
      p_text: text,
      p_color: color,
      p_amount: amountCents,
    });
    if (error || !id) {
      const msg = error?.message ?? "";
      const low = msg.match(/bid_too_low:(\d+)/);
      if (low) return json({ error: "bid_too_low", minCents: Number(low[1]) }, 409);
      if (msg.includes("too_many_open") || msg.includes("too_many_daily")) return json({ error: "too_many_open" }, 429);
      console.error("bid_create_failed", msg);
      return json({ error: "insert_failed" }, 500);
    }
    return json({ id, status: "review" });
  } catch (e) {
    console.error("bid-submit internal", e);
    return json({ error: "internal" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
