import { ASSET_BUCKET, MAX_LABEL_LENGTH, isImageSlot, isModelSlot } from "./gameConfig.js";
import { getSupabase } from "../net/supabase.js";

/**
 * Escritas do painel de admin. Quem decide se a escrita vale é o RLS do
 * Supabase (função is_admin()) — se uma conta não-admin chamar isto, o banco
 * recusa. As validações daqui são só para dar erro claro e evitar lixo.
 */

const MAX_MODEL_BYTES = 15 * 1024 * 1024;
/** Teto de preço (R$ 10.000) — barra erro de digitação no painel. */
const MAX_PRICE_CENTS = 1_000_000;

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
  if (!Number.isInteger(row.price_cents) || row.price_cents < 0 || row.price_cents > MAX_PRICE_CENTS) {
    throw new Error("Preço inválido (máximo R$ 10.000,00).");
  }
  const { error } = await db()
    .from("catalog_items")
    .update({ label, price_cents: row.price_cents, active: row.active })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Tipo da imagem pelos primeiros bytes (não confia na extensão nem no tipo do navegador). */
function sniffImage(b: Uint8Array): { ext: "png" | "jpg" | "webp"; type: string } | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", type: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { ext: "webp", type: "image/webp" };
  }
  return null;
}

/** Envia a imagem da bandeira (PNG/JPG/WebP até 2 MB) para o bucket e devolve a URL pública. */
async function uploadImage(slot: string, file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Imagem maior que 2 MB.");
  const kind = sniffImage(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (!kind) throw new Error("Envie uma imagem PNG, JPG ou WebP.");
  const supabase = db();
  const path = `${slot.replace(/:/g, "_")}-${Date.now()}.${kind.ext}`;
  const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, file, { contentType: kind.type, upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Envia um .glb (ou, nos slots de bandeira, uma imagem) para o bucket e devolve a URL pública. */
export async function uploadModel(slot: string, file: File): Promise<string> {
  if (!isModelSlot(slot)) throw new Error("Slot inválido.");
  if (isImageSlot(slot)) return uploadImage(slot, file);
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

// ── Sprays (opções gerenciadas pelo admin) ────────────────────────────────
export interface AdminSpray {
  slug: string;
  label: string;
  price_cents: number;
  active: boolean;
  /** 0xrrggbb ou null (cor da equipe). */
  color: number | null;
  sort_order: number;
}

export async function fetchAdminSprays(): Promise<AdminSpray[]> {
  const supabase = db();
  const [items, opts] = await Promise.all([
    supabase.from("catalog_items").select("id, label, price_cents, active").like("id", "spray:%"),
    supabase.from("spray_options").select("slug, color, sort_order").order("sort_order"),
  ]);
  if (items.error) throw new Error(items.error.message);
  if (opts.error) throw new Error(opts.error.message);
  const byId = new Map((items.data ?? []).map((i) => [i.id as string, i]));
  const out: AdminSpray[] = [];
  for (const o of opts.data ?? []) {
    const item = byId.get(`spray:${o.slug}`);
    if (!item) continue;
    out.push({
      slug: o.slug as string,
      label: item.label as string,
      price_cents: item.price_cents as number,
      active: item.active as boolean,
      color: (o.color as number | null) ?? null,
      sort_order: (o.sort_order as number) ?? 0,
    });
  }
  return out;
}

/** Slug a partir do nome + sufixo curto (único, só [a-z0-9-], até 32). */
export function newSprayId(label: string): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 22) || "spray";
  return `${base}-${Date.now().toString(36).slice(-5)}`;
}

function checkSpray(s: AdminSpray): string {
  const label = s.label.trim().slice(0, MAX_LABEL_LENGTH);
  if (!label) throw new Error("O nome do spray não pode ficar vazio.");
  if (!Number.isInteger(s.price_cents) || s.price_cents < 0 || s.price_cents > 1_000_000) {
    throw new Error("Preço inválido (máximo R$ 10.000,00).");
  }
  return label;
}

/**
 * Cria um spray novo. Ordem importa: primeiro os dados de jogo (órfão em
 * spray_options é inofensivo), só depois o item de catálogo (que é o que a loja
 * vende). Se o catálogo falhar, desfaz a opção — nunca fica item à venda sem spray.
 */
export async function createSpray(s: AdminSpray): Promise<void> {
  const label = checkSpray(s);
  const supabase = db();
  const { error: e1 } = await supabase
    .from("spray_options")
    .insert({ slug: s.slug, color: s.color, sort_order: s.sort_order });
  if (e1) throw new Error(e1.message);
  const { error } = await supabase
    .from("catalog_items")
    .insert({ id: `spray:${s.slug}`, kind: "spray", label, price_cents: s.price_cents, active: s.active });
  if (error) {
    await supabase.from("spray_options").delete().eq("slug", s.slug);
    throw new Error(error.message);
  }
}

export async function updateSpray(s: AdminSpray): Promise<void> {
  const label = checkSpray(s);
  const supabase = db();
  const { error } = await supabase
    .from("catalog_items")
    .update({ label, price_cents: s.price_cents, active: s.active })
    .eq("id", `spray:${s.slug}`);
  if (error) throw new Error(error.message);
  const { error: e2 } = await supabase
    .from("spray_options")
    .update({ color: s.color, sort_order: s.sort_order })
    .eq("slug", s.slug);
  if (e2) throw new Error(e2.message);
}

/**
 * Remove a opção do jogo. O item do catálogo só é DESATIVADO (não apagado):
 * pedidos e posses antigos continuam apontando pra ele.
 */
export async function removeSpray(slug: string): Promise<void> {
  const supabase = db();
  const { error } = await supabase.from("catalog_items").update({ active: false }).eq("id", `spray:${slug}`);
  if (error) throw new Error(error.message);
  const { error: e2 } = await supabase.from("spray_options").delete().eq("slug", slug);
  if (e2) throw new Error(e2.message);
}

// ── Superchats (fila de moderação) ────────────────────────────────────────
export interface AdminSuperchat {
  id: string;
  name: string;
  message: string;
  amount_cents: number;
  status: string;
  created_at: string;
}

/** Fila: superchats aguardando análise, mais antigos primeiro (RPC só para admin). */
export async function fetchSuperchatQueue(): Promise<AdminSuperchat[]> {
  const { data, error } = await db().rpc("superchat_queue");
  if (error) throw new Error(error.message);
  return (data as AdminSuperchat[]) ?? [];
}

/** Aprova (libera a cobrança do Pix) ou recusa. Revisor e log gravados na mesma transação do banco. */
export async function moderateSuperchat(id: string, approve: boolean, reason?: string): Promise<void> {
  const { error } = await db().rpc("moderate_superchat", { p_id: id, p_approve: approve, p_reason: reason ?? null });
  if (error) throw new Error(error.message.includes("already_moderated") ? "Este superchat já foi moderado." : error.message);
}

// ── Cartazes (fila de moderação) ──────────────────────────────────────────
export interface AdminSign {
  id: string;
  text: string;
  color: string;
  status: string;
  created_at: string;
}

export async function fetchSignQueue(): Promise<AdminSign[]> {
  const { data, error } = await db().rpc("sign_queue");
  if (error) throw new Error(error.message);
  return (data as AdminSign[]) ?? [];
}

export async function moderateSign(id: string, approve: boolean, reason?: string): Promise<void> {
  const { error } = await db().rpc("moderate_sign", { p_id: id, p_approve: approve, p_reason: reason ?? null });
  if (error) throw new Error(error.message.includes("already_moderated") ? "Este cartaz já foi moderado." : error.message);
}

// ── Telões (fila de moderação dos lances) ─────────────────────────────────
export interface AdminBid {
  id: string;
  billboard_id: string;
  text: string;
  color: string;
  amount_cents: number;
  status: string;
  created_at: string;
}

export async function fetchBidQueue(): Promise<AdminBid[]> {
  const { data, error } = await db().rpc("bid_queue");
  if (error) throw new Error(error.message);
  return (data as AdminBid[]) ?? [];
}

export async function moderateBid(id: string, approve: boolean, reason?: string): Promise<void> {
  const { error } = await db().rpc("moderate_bid", { p_id: id, p_approve: approve, p_reason: reason ?? null });
  if (error) throw new Error(error.message.includes("already_moderated") ? "Este lance já foi moderado." : error.message);
}
