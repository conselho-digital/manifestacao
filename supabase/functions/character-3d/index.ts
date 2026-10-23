// Edge Function (SÓ ADMIN): gera um personagem 3D (.glb) a partir de uma foto, via Meshy (imagem→3D + rig automático).
// Segredo: MESHY_API_KEY (Supabase → Edge Functions → Secrets). Nunca vai ao cliente.
// O cliente conduz as etapas (cada chamada é curta): start → status(model) → rig → status(rig) → save.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MESHY_KEY = Deno.env.get("MESHY_API_KEY") ?? "";
const MESHY = "https://api.meshy.ai/openapi/v1";

const BUCKET = "game-assets";
const MAX_GLB_BYTES = 40 * 1024 * 1024;
const MAX_IMAGE_CHARS = 6_000_000; // ~4,5 MB em base64
const IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    // Quem chama precisa ser admin: o RPC is_admin() roda com o JWT de quem chamou.
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: isAdmin, error: adminErr } = await asUser.rpc("is_admin");
    if (adminErr || isAdmin !== true) return json({ error: "forbidden" }, 403);
    if (!MESHY_KEY) return json({ error: "no_key", message: "MESHY_API_KEY não configurada nos Secrets do Supabase." }, 503);

    const body = await req.json().catch(() => null);
    const action = body?.action;

    if (action === "start") {
      const image = body?.image;
      if (typeof image !== "string" || image.length > MAX_IMAGE_CHARS || !IMAGE_RE.test(image)) return json({ error: "image_invalid" }, 400);
      const r = await meshy("/image-to-3d", {
        image_url: image,
        ai_model: "latest",
        should_texture: true,
        enable_pbr: false,
        should_remesh: true,
        topology: "triangle",
        target_polycount: 12000,
        pose_mode: "a-pose",
      });
      return json({ taskId: r.result });
    }

    if (action === "status") {
      const id = idOf(body?.taskId);
      const phase = body?.phase === "rig" ? "rigging" : "image-to-3d";
      if (!id) return json({ error: "task_invalid" }, 400);
      const r = await meshyGet(`/${phase}/${id}`);
      const glb: string | null =
        phase === "rigging" ? (r.result?.rigged_character_glb_url ?? null) : (r.model_urls?.glb ?? null);
      return json({ status: r.status, progress: r.progress ?? 0, glb, error: r.task_error?.message ?? null });
    }

    if (action === "rig") {
      const id = idOf(body?.taskId);
      if (!id) return json({ error: "task_invalid" }, 400);
      const r = await meshy("/rigging", { input_task_id: id, height_meters: 1.7 });
      return json({ taskId: r.result });
    }

    if (action === "save") {
      const url = typeof body?.url === "string" ? body.url : "";
      let host = "";
      try {
        const u = new URL(url);
        if (u.protocol !== "https:") throw new Error("proto");
        host = u.hostname;
      } catch {
        return json({ error: "url_invalid" }, 400);
      }
      // Só baixa de domínios do próprio Meshy (evita usar a função como proxy aberto).
      if (!(host === "meshy.ai" || host.endsWith(".meshy.ai"))) return json({ error: "url_invalid" }, 400);
      const res = await fetch(url);
      if (!res.ok) return json({ error: "download_failed" }, 502);
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > MAX_GLB_BYTES) return json({ error: "too_big" }, 413);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > MAX_GLB_BYTES) return json({ error: "too_big" }, 413);
      if (new TextDecoder().decode(bytes.slice(0, 4)) !== "glTF") return json({ error: "not_glb" }, 422);

      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const path = `character3d-${Date.now()}.glb`;
      const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "model/gltf-binary", upsert: false });
      if (error) {
        console.error("character-3d upload", error.message);
        return json({ error: "upload_failed" }, 500);
      }
      return json({ url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
    }

    return json({ error: "action_invalid" }, 400);
  } catch (e) {
    console.error("character-3d internal", e instanceof Error ? e.message : e);
    return json({ error: "internal", message: e instanceof Error ? e.message : "erro" }, 500);
  }
});

function idOf(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

// deno-lint-ignore no-explicit-any
async function meshy(path: string, payload: unknown): Promise<any> {
  const res = await fetch(MESHY + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${MESHY_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return unwrap(res);
}

// deno-lint-ignore no-explicit-any
async function meshyGet(path: string): Promise<any> {
  const res = await fetch(MESHY + path, { headers: { Authorization: `Bearer ${MESHY_KEY}` } });
  return unwrap(res);
}

// deno-lint-ignore no-explicit-any
async function unwrap(res: Response): Promise<any> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Meshy ${res.status}: ${data?.message ?? "erro"}`);
  return data;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
