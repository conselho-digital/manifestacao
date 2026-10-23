import { cleanRig, setRigs, type RigMarks } from "./rigs.js";
import {
  CHARACTERS,
  CHARACTER_IDS,
  TEAMS,
  TEAM_IDS,
  VEHICLES,
  VEHICLE_IDS,
  isCharacterId,
  isTeamId,
  isVehicleId,
  type CharacterId,
  type TeamId,
  type VehicleId,
} from "@manifestacao/shared";
import { getSupabase } from "../net/supabase.js";
import { supabaseConfig } from "./env.js";
import { SPRAY_SLUG_RE, setSprayOptions, type SprayOption } from "./sprays.js";

/**
 * Configuração do jogo editável pelo admin (tabela `game_config` + catálogo).
 * Os valores padrão continuam em packages/shared; aqui eles são SOBRESCRITOS
 * em memória (mutando os objetos compartilhados) quando o banco tem valores.
 * Tudo que vem do banco é revalidado aqui — o RLS já limita quem escreve, mas
 * o cliente não confia cegamente no que lê.
 */

export const MAX_LABEL_LENGTH = 30;
export const ASSET_BUCKET = "game-assets";

export interface TeamOverride {
  label?: string;
  color?: number;
}
export interface GameConfig {
  teams: Partial<Record<TeamId, TeamOverride>>;
  /** slot → URL pública de um .glb. Slots: ver `isModelSlot`. */
  models: Record<string, string>;
  /** URL do .glb → marcações do esqueleto feitas no editor do admin. */
  rigs: Record<string, RigMarks>;
}

export const EMPTY_CONFIG: GameConfig = { teams: {}, models: {}, rigs: {} };

// Valores padrão capturados na primeira execução — permitem "restaurar" ao
// reaplicar uma config sem override (ex.: admin removeu uma mudança).
const DEFAULTS = {
  teams: Object.fromEntries(TEAM_IDS.map((id) => [id, { label: TEAMS[id].label, color: TEAMS[id].color }])) as Record<TeamId, Required<TeamOverride>>,
  characters: Object.fromEntries(CHARACTER_IDS.map((id) => [id, { label: CHARACTERS[id].label, price: CHARACTERS[id].priceCents }])) as Record<CharacterId, { label: string; price: number }>,
  vehicles: Object.fromEntries(VEHICLE_IDS.map((id) => [id, { label: VEHICLES[id].label, price: VEHICLES[id].priceCents }])) as Record<VehicleId, { label: string; price: number }>,
};

function cleanLabel(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, MAX_LABEL_LENGTH);
  return t || undefined;
}
function cleanColor(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : undefined;
}

/** Slots de IMAGEM (bandeira/spray): o valor é a URL de um .png/.jpg/.webp, não de um .glb. */
export function isImageSlot(slot: string): boolean {
  return slot.startsWith("sprayimg:") || slot.startsWith("teamimg:");
}

/**
 * Slots válidos: character:<c>, character:<c>:<team>, vehicle:<v>, spray (.glb)
 * e teamimg:<team> (bandeira da equipe) / sprayimg:<slug> (imagens).
 */
export function isModelSlot(slot: string): boolean {
  if (slot === "spray") return true;
  const [kind, id, team, extra] = slot.split(":");
  if (kind === "teamimg") return isTeamId(id) && team === undefined && extra === undefined;
  if (kind === "sprayimg") return id !== undefined && team === undefined && extra === undefined && SPRAY_SLUG_RE.test(id);
  if (kind === "spray") return id !== undefined && team === undefined && extra === undefined && SPRAY_SLUG_RE.test(id);
  if (extra !== undefined) return false;
  if (kind === "character") return isCharacterId(id) && (team === undefined || isTeamId(team));
  if (kind === "vehicle") return isVehicleId(id) && team === undefined && id !== "nenhum";
  return false;
}

/** Só aceita arquivo do nosso bucket público (.glb, ou imagem nos slots de imagem) — nunca uma URL qualquer (nem com `%2e%2e`, query ou hash). */
export function isTrustedModelUrl(url: unknown, image = false): url is string {
  if (typeof url !== "string" || !supabaseConfig) return false;
  try {
    const u = new URL(url);
    const base = new URL(supabaseConfig.url);
    const prefix = `/storage/v1/object/public/${ASSET_BUCKET}/`;
    return (
      u.origin === base.origin &&
      !u.search &&
      !u.hash &&
      u.pathname.startsWith(prefix) &&
      (image ? /^[A-Za-z0-9_.-]+\.(png|jpe?g|webp)$/i : /^[A-Za-z0-9_.-]+\.glb$/i).test(u.pathname.slice(prefix.length)) &&
      !u.pathname.includes("..")
    );
  } catch {
    return false;
  }
}

export function sanitizeConfig(raw: { teams?: unknown; flags?: unknown; models?: unknown; rigs?: unknown }): GameConfig {
  const out: GameConfig = { teams: {}, models: {}, rigs: {} };
  if (raw.teams && typeof raw.teams === "object") {
    for (const [id, v] of Object.entries(raw.teams)) {
      if (!isTeamId(id) || !v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      out.teams[id] = { label: cleanLabel(o.label), color: cleanColor(o.color) };
    }
  }
  if (raw.models && typeof raw.models === "object") {
    for (const [slot, url] of Object.entries(raw.models)) {
      if (isModelSlot(slot) && isTrustedModelUrl(url, isImageSlot(slot))) out.models[slot] = url;
    }
  }
  if (raw.rigs && typeof raw.rigs === "object") {
    for (const [url, v] of Object.entries(raw.rigs)) {
      const rig = isTrustedModelUrl(url) ? cleanRig(v) : null;
      if (rig) out.rigs[url] = rig;
    }
  }
  return out;
}

interface CatalogRow {
  id: string;
  label: string;
  price_cents: number;
}

let modelOverrides: Record<string, string> = {};

/** URL do modelo configurado pelo admin para um slot, ou null (usa o padrão). */
export function modelOverride(slot: string): string | null {
  return Object.hasOwn(modelOverrides, slot) ? modelOverrides[slot]! : null;
}

/** Aplica a config (e o catálogo) por cima dos padrões compartilhados. */
export function applyGameConfig(cfg: GameConfig, catalog: CatalogRow[] = []): void {
  for (const id of TEAM_IDS) {
    const o = cfg.teams[id];
    TEAMS[id].label = o?.label ?? DEFAULTS.teams[id].label;
    TEAMS[id].color = o?.color ?? DEFAULTS.teams[id].color;
  }
  // Volta personagens/veículos ao padrão antes: um item que o admin renomeou e
  // depois desativou sai do catálogo ativo e não pode ficar com o nome antigo.
  for (const id of CHARACTER_IDS) {
    CHARACTERS[id].label = DEFAULTS.characters[id].label;
    CHARACTERS[id].priceCents = DEFAULTS.characters[id].price;
  }
  for (const id of VEHICLE_IDS) {
    VEHICLES[id].label = DEFAULTS.vehicles[id].label;
    VEHICLES[id].priceCents = DEFAULTS.vehicles[id].price;
  }
  for (const row of catalog) {
    const [kind, id] = row.id.split(":");
    const label = cleanLabel(row.label);
    const price = Number.isInteger(row.price_cents) && row.price_cents >= 0 ? row.price_cents : undefined;
    if (kind === "character" && isCharacterId(id)) {
      CHARACTERS[id].label = label ?? DEFAULTS.characters[id].label;
      CHARACTERS[id].priceCents = price ?? DEFAULTS.characters[id].price;
    } else if (kind === "vehicle" && isVehicleId(id)) {
      VEHICLES[id].label = label ?? DEFAULTS.vehicles[id].label;
      VEHICLES[id].priceCents = price ?? DEFAULTS.vehicles[id].price;
    }
  }
  modelOverrides = cfg.models;
  setRigs(cfg.rigs);
}

/** Busca config + catálogo no Supabase e aplica. Em modo offline, não faz nada. */
export async function loadAndApplyGameConfig(): Promise<GameConfig> {
  const supabase = getSupabase();
  if (!supabase) return EMPTY_CONFIG;
  const [cfgRes, catRes, sprayRes] = await Promise.all([
    supabase.from("game_config").select("key, value"),
    supabase.from("catalog_items").select("id, label, price_cents").eq("active", true),
    supabase.from("spray_options").select("slug, color, sort_order").order("sort_order"),
  ]);
  // Se a leitura falhou, NÃO aplica (senão uma falha de rede apagaria as
  // customizações já carregadas e voltaria tudo ao padrão).
  if (cfgRes.error) throw new Error(cfgRes.error.message);
  if (catRes.error) throw new Error(catRes.error.message);
  const raw: Record<string, unknown> = {};
  for (const row of cfgRes.data ?? []) raw[row.key as string] = row.value;
  const cfg = sanitizeConfig(raw);
  const catalog = (catRes.data as CatalogRow[] | null) ?? [];
  applyGameConfig(cfg, catalog);

  // Sprays do admin: opção só existe se está em spray_options E ativa no catálogo.
  const sprays: SprayOption[] = [];
  for (const row of // Falha ao ler sprays NÃO derruba o resto da config (equipes, bandeiras, modelos).
    (sprayRes.error ? [] : (sprayRes.data as { slug: string; color: number | null }[] | null)) ?? []) {
    if (!SPRAY_SLUG_RE.test(row.slug)) continue;
    const item = catalog.find((c) => c.id === `spray:${row.slug}`);
    if (!item) continue;
    const price = Number.isInteger(item.price_cents) && item.price_cents >= 0 ? item.price_cents : 0;
    sprays.push({ id: row.slug, label: cleanLabel(item.label) ?? row.slug, priceCents: price, color: cleanColor(row.color) ?? null });
  }
  setSprayOptions(sprays);
  return cfg;
}

/** Cópia dos modelos configurados hoje (para o painel de admin editar). */
export function currentModelOverrides(): Record<string, string> {
  return { ...modelOverrides };
}
