// Cabeçalhos CORS compartilhados entre Edge Functions.
// ALLOWED_ORIGIN = domínio da Vercel (Secrets). Sem ele, nenhuma origem é liberada (falha fechada).
export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
