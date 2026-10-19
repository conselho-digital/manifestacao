import { ASSET_BUCKET, MAX_LABEL_LENGTH, isModelSlot } from "./gameConfig.js";
import { getSupabase } from "../net/supabase.js";

/**
 * Escritas do painel de admin. Quem decide se a escrita vale é o RLS do
 * Supabase (função is_admin()) — se uma conta não-admin chamar isto, o banco
 * recusa. As validações daqui são só para dar erro claro e evitar lixo.
 */

const MAX_MODEL_BYTES = 15 * 1024 * 1024;

function db() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Sem conexão com o Supabase.");
  return supabase;
}

export async function saveConfigKey(key: "teams" | "flags" | "models", value: unknown): Promise<void> {
  const { error } = await db().from("game_config").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export interface AdminCatalogRow {
  id: string;
  kind: string;
  label: string;
  price_cents: number;
  active: boolean;
}

export async function fetchAdminCatalog(): Promise<AdminCatalogRow[]> {
  const { data, error } = await db().from("catalog_items").select("id, kind, label, price_cents, active").order("id");
  if (error) throw new Error(error.message);
  return (data as AdminCatalogRow[]) ?? [];
}

export async function saveCatalogItem(row: AdminCatalogRow): Promise<void> {
  const label = row.label.trim().slice(0, MAX_LABEL_LENGTH);
  if (!label) throw new Error("O nome não pode ficar vazio.");
  if (!Number.isInteger(row.price_cents) || row.price_cents < 0) throw new Error("Preço inválido.");
  const { error } = await db()
    .from("catalog_items")
    .update({ label, price_cents: row.price_cents, active: row.active })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
}

/** Envia um .glb para o bucket e devolve a URL pública. */
export async function uploadModel(slot: string, file: File): Promise<string> {
  if (!isModelSlot(slot)) throw new Error("Slot inválido.");
  if (!/\.glb$/i.test(file.name)) throw new Error("Envie um arquivo .glb (glTF binário).");
  if (file.size > MAX_MODEL_BYTES) throw new Error("Arquivo maior que 15 MB.");
  const magic = new TextDecoder().decode(await file.slice(0, 4).arrayBuffer());
  if (magic !== "glTF") throw new Error("O arquivo não parece um .glb válido.");

  const supabase = db();
  const path = `${slot.replace(/:/g, "_")}-${Date.now()}.glb`;
  const { error } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(path, file, { contentType: "model/gltf-binary", upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
}
