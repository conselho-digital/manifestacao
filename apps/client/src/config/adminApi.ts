import { ASSET_BUCKET, MAX_LABEL_LENGTH, isImageSlot, isModelSlot } from "./gameConfig.js";
import { getSupabase } from "../net/supabase.js";
import type { RigMarks } from "./rigs.js";
import { serverNow, type PlaybackState } from "./parkScreen.js";
import { userImageUrl } from "../net/userImages.js";

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

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export async function saveConfigKey(key: "teams" | "models" | "rigs" | "screen" | "screen_playback", value: unknown): Promise<void> {
  const { data, error } = await db()
    .from("game_config")
    .upsert({ key, value, updated_at: new Date().toISOString() })
    .select("key, value");
  if (error) throw new Error(error.message);
  // Confirma que o banco gravou mesmo (um bloqueio silencioso de permissão não pode parecer sucesso).
  if (!data || data.length === 0) throw new Error("O banco não confirmou a gravação (sem permissão?). Tente sair e entrar de novo.");
  // jsonb reordena as chaves (em qualquer nível): compara em profundidade, sem depender da ordem.
  if (!deepEqual(data[0]!.value, value)) throw new Error("O banco guardou um valor diferente do enviado. Tente de novo.");
}

/** Guarda (ou remove, com `null`) as marcações de esqueleto de modelos, sem perder as dos outros. */
export async function mergeRigs(patch: Record<string, RigMarks | null>): Promise<void> {
  const { data, error } = await db().from("game_config").select("value").eq("key", "rigs").maybeSingle();
  if (error) throw new Error(error.message);
  const next: Record<string, unknown> = data?.value && typeof data.value === "object" && !Array.isArray(data.value) ? { ...(data.value as Record<string, unknown>) } : {};
  for (const [url, rig] of Object.entries(patch)) {
    if (rig === null) delete next[url];
    else next[url] = rig;
  }
  await saveConfigKey("rigs", next);
}

/**
 * Atualiza `game_config.models` SEM perder o que já existe: lê o valor atual direto do banco (não do cache
 * filtrado do cliente), aplica as mudanças (`null` remove a chave), grava e devolve o mapa resultante.
 */
export async function mergeModels(patch: Record<string, string | null>): Promise<Record<string, string>> {
  const { data, error } = await db().from("game_config").select("value").eq("key", "models").maybeSingle();
  if (error) throw new Error(error.message);
  const current = data?.value && typeof data.value === "object" && !Array.isArray(data.value) ? (data.value as Record<string, string>) : {};
  const next: Record<string, string> = { ...current };
  for (const [slot, url] of Object.entries(patch)) {
    if (url === null) delete next[slot];
    else next[slot] = url;
  }
  await saveConfigKey("models", next);
  return next;
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

/** Tipos que um produto novo pode ter (o enum do banco). */
export const NEW_PRODUCT_KINDS = [
  { id: "object", label: "Objeto" },
  { id: "sound", label: "Som" },
  { id: "pass", label: "Passe" },
] as const;

/** Id único e legível para produto novo: `produto:<nome>-<sufixo>` (só [a-z0-9-]). */
export function newProductId(label: string): string {
  const base =
    label
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "item";
  return `produto:${base}-${Date.now().toString(36).slice(-5)}`;
}

export async function createCatalogItem(row: AdminCatalogRow): Promise<void> {
  const label = row.label.trim().slice(0, MAX_LABEL_LENGTH);
  if (!label) throw new Error("O nome não pode ficar vazio.");
  if (!Number.isInteger(row.price_cents) || row.price_cents < 0 || row.price_cents > MAX_PRICE_CENTS) {
    throw new Error("Preço inválido (máximo R$ 10.000,00).");
  }
  const { error } = await db()
    .from("catalog_items")
    .insert({ id: row.id, kind: row.kind, label, price_cents: row.price_cents, active: row.active });
  if (error) throw new Error(error.message);
}

/**
 * Apaga o produto. Se já existem pedidos/posses ligados a ele (FK), não dá pra apagar sem perder
 * o histórico de compras: nesse caso o produto só é DESATIVADO (some da loja) e a função avisa.
 */
export async function deleteCatalogItem(id: string): Promise<"deleted" | "deactivated"> {
  const supabase = db();
  const { data: removed, error } = await supabase.from("catalog_items").delete().eq("id", id).select("id");
  if (!error && removed && removed.length > 0) return "deleted";
  // 0 linhas sem erro = o banco recusou em silêncio (RLS): não finge que apagou.
  if (!error) throw new Error("Sem permissão para apagar este produto.");
  if (error.code !== "23503") throw new Error(error.message);
  const { error: e2 } = await supabase.from("catalog_items").update({ active: false }).eq("id", id);
  if (e2) throw new Error(e2.message);
  return "deactivated";
}

/** Lado máximo da imagem enviada (px): bandeira/spray não precisam de mais, e o WebP fica leve. */
const MAX_IMAGE_SIDE = 1024;
const WEBP_QUALITY = 0.9;
/** Lado máximo aceito do arquivo original (px): barra imagens que decodificam para centenas de MB. */
const MAX_SOURCE_SIDE = 8000;

/**
 * Copia o arquivo escolhido para a memória. No Android o navegador revoga o acesso ao arquivo quando o input é
 * limpo ou o app do seletor fecha ("requested file could not be read"); com a cópia isso não afeta mais o envio.
 */
export async function snapshotFile(file: File): Promise<File> {
  try {
    return new File([await file.arrayBuffer()], file.name, { type: file.type, lastModified: file.lastModified });
  } catch {
    throw new Error("Não consegui ler o arquivo. Escolha de novo (de preferência da galeria ou de Downloads).");
  }
}

/** Converte a imagem para WebP (com transparência, no máx. 1024 px de lado); null se o navegador não souber gerar WebP. */
export async function toWebp(file: File): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    // PNG pequeno em bytes pode declarar dimensões gigantes: confere o cabeçalho antes de decodificar.
    const head = new DataView(await file.slice(0, 32).arrayBuffer());
    if (head.byteLength >= 24 && head.getUint32(12) === 0x49484452) {
      if (head.getUint32(16) > MAX_SOURCE_SIDE || head.getUint32(20) > MAX_SOURCE_SIDE) throw new Error("Imagem grande demais (máx. 8000 px de lado).");
    }
    bitmap = await createImageBitmap(file);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Imagem grande")) throw e;
    throw new Error("Não consegui abrir a imagem. Tente outro arquivo.");
  }
  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY));
    return blob && blob.type === "image/webp" ? blob : null;
  } finally {
    bitmap.close();
  }
}

/** Envia a imagem da bandeira (PNG/JPG/WebP até 2 MB), convertida para WebP, e devolve a URL pública. */
async function uploadImage(slot: string, file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Imagem maior que 2 MB.");
  const kind = sniffImage(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (!kind) throw new Error("Envie uma imagem PNG, JPG ou WebP.");
  // Sempre WebP (reencoda: some metadado/EXIF e conteúdo extra). Se o navegador não gera WebP, recusa em vez de subir o original.
  const webp = await toWebp(file);
  if (!webp) throw new Error("Este navegador não consegue converter para WebP. Use outro navegador.");
  const body: Blob = webp;
  const ext = "webp";
  const type = "image/webp";
  const supabase = db();
  const path = `${slot.replace(/:/g, "_")}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, body, { contentType: type, upsert: false });
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
    .upload(path, new Blob([file], { type: "model/gltf-binary" }), { contentType: "model/gltf-binary", upsert: false });
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

/** Imagens (cartaz/lance) por id, para a moderação ver o que foi enviado: id → URL pública. */
export async function fetchMediaUrls(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await db().rpc("admin_media_paths", { p_ids: ids });
  if (error) return {};
  const out: Record<string, string> = {};
  for (const r of (data as { id: string; image_path: string }[] | null) ?? []) {
    const url = userImageUrl(r.image_path);
    if (url) out[r.id] = url;
  }
  return out;
}

/** Comando do admin para o vídeo do outdoor: chega na hora a quem está com ele aberto. */
export async function publishPlayback(state: PlaybackState, position: number, volume?: number): Promise<void> {
  await saveConfigKey("screen_playback", {
    state,
    position: Math.max(0, Math.round(position * 10) / 10),
    at: serverNow(),
    ...(volume !== undefined ? { volume: Math.max(0, Math.min(100, Math.round(volume))) } : {}),
  });
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

// ── Testes de admin ───────────────────────────────────────────────────────
/** Devolve ao admin todos os itens do catálogo (inclusive os criados depois). Retorna quantos foram concedidos. */
export async function grantAllItemsToMe(): Promise<number> {
  const { data, error } = await db().rpc("admin_grant_all_to_me");
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : 0;
}

/** Ativa um superchat, cartaz ou lance aprovado SEM pagar (teste). Nada é cobrado; a ação fica no log. */
export async function testActivate(kind: "superchat" | "sign" | "bid", id: string): Promise<string> {
  const { data, error } = await db().rpc("admin_test_activate", { p_kind: kind, p_id: id });
  if (error) throw new Error(error.message);
  return String(data ?? "");
}

// ── Moderação de contas (silenciar / banir) ───────────────────────────────
export interface AdminUserHit {
  id: string;
  nickname: string;
  email: string | null;
  muted: boolean;
  banned: boolean;
}

export interface AdminSanction {
  id: string;
  user_id: string;
  nickname: string | null;
  email: string | null;
  kind: "mute" | "ban";
  reason: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface AdminModLogRow {
  created_at: string;
  actor_nickname: string | null;
  target: string | null;
  action: string;
  reason: string | null;
}

const MOD_ERRORS: Record<string, string> = {
  self_not_allowed: "Você não pode sancionar a própria conta.",
  target_is_admin: "Contas de admin não podem ser sancionadas.",
  not_found: "Conta não encontrada.",
  minutes_required: "Informe por quanto tempo silenciar.",
  minutes_invalid: "Duração inválida (1 minuto a 30 dias).",
  forbidden: "Sem permissão.",
};

function modError(message: string): Error {
  const known = Object.keys(MOD_ERRORS).find((k) => message.includes(k));
  return new Error(known ? MOD_ERRORS[known]! : message);
}

export async function findUsers(q: string): Promise<AdminUserHit[]> {
  const { data, error } = await db().rpc("admin_find_users", { p_q: q });
  if (error) throw modError(error.message);
  return (data as AdminUserHit[]) ?? [];
}

/** `minutes` nulo = permanente (só para banimento). */
export async function sanctionUser(userId: string, kind: "mute" | "ban", minutes: number | null, reason: string): Promise<void> {
  const { error } = await db().rpc("admin_sanction", { p_user: userId, p_kind: kind, p_minutes: minutes, p_reason: reason });
  if (error) throw modError(error.message);
}

export async function liftSanction(id: string): Promise<void> {
  const { error } = await db().rpc("admin_lift_sanction", { p_id: id });
  if (error) throw modError(error.message);
}

export async function fetchSanctions(): Promise<AdminSanction[]> {
  const { data, error } = await db().rpc("admin_list_sanctions");
  if (error) throw modError(error.message);
  return (data as AdminSanction[]) ?? [];
}

export async function fetchModerationLog(): Promise<AdminModLogRow[]> {
  const { data, error } = await db().rpc("admin_moderation_log");
  if (error) throw modError(error.message);
  return (data as AdminModLogRow[]) ?? [];
}
