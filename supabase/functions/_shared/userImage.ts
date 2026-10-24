// Imagem enviada pelo usuário (bucket user-media, WebP): valida o caminho e confere que o arquivo existe.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const PATH_RE = /^([0-9a-f-]{36})\/([0-9a-f-]{36}\.webp)$/;

/** null = sem imagem; "invalid" = caminho que não é do próprio usuário; "missing" = o arquivo não foi enviado. */
export async function checkUserImage(
  admin: SupabaseClient,
  userId: string,
  raw: unknown,
): Promise<{ path: string | null } | { error: "image_invalid" | "image_missing" }> {
  if (raw === undefined || raw === null || raw === "") return { path: null };
  if (typeof raw !== "string") return { error: "image_invalid" };
  const m = PATH_RE.exec(raw);
  if (!m || m[1] !== userId) return { error: "image_invalid" };
  const { data, error } = await admin.storage.from("user-media").list(m[1], { limit: 1, search: m[2] });
  if (error || !data?.some((o) => o.name === m[2])) return { error: "image_missing" };
  return { path: raw };
}
