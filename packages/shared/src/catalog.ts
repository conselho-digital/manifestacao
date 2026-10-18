/**
 * Catálogo de conteúdo (Fase 2): personagens, bandeiras e veículos.
 *
 * Na Fase 2 a seleção é livre (identidade visual). A posse paga (entitlements)
 * e os preços só passam a valer na Fase 3. Os preços aqui são referência e
 * alimentam o seed de `catalog_items`.
 */

import type { TeamId } from "./teams.js";

// ── Personagens ────────────────────────────────────────────────────────────
export type CharacterId = "comum" | "tiozao" | "jovem" | "trabalhador";

export interface Character {
  id: CharacterId;
  label: string;
  /** Preço de referência (centavos); 0 = grátis. */
  priceCents: number;
}

export const CHARACTERS: Record<CharacterId, Character> = {
  comum: { id: "comum", label: "Brasileiro comum", priceCents: 0 },
  jovem: { id: "jovem", label: "Jovem", priceCents: 0 },
  trabalhador: { id: "trabalhador", label: "Trabalhador", priceCents: 2990 },
  tiozao: { id: "tiozao", label: "Tiozão do Zap", priceCents: 2990 },
};

export const CHARACTER_IDS: CharacterId[] = ["comum", "jovem", "trabalhador", "tiozao"];

export function isCharacterId(v: unknown): v is CharacterId {
  return typeof v === "string" && v in CHARACTERS;
}

// ── Bandeiras ──────────────────────────────────────────────────────────────
export type FlagId = "nenhuma" | "time" | "verde" | "amarela" | "branca";

export interface Flag {
  id: FlagId;
  label: string;
  /** Cor do tecido (0xrrggbb) ou null para usar a cor do time. */
  color: number | null;
}

export const FLAGS: Record<FlagId, Flag> = {
  nenhuma: { id: "nenhuma", label: "Sem bandeira", color: null },
  time: { id: "time", label: "Do meu time", color: null },
  verde: { id: "verde", label: "Verde", color: 0x2ecc71 },
  amarela: { id: "amarela", label: "Amarela", color: 0xffd12e },
  branca: { id: "branca", label: "Branca", color: 0xf2f4f7 },
};

export const FLAG_IDS: FlagId[] = ["nenhuma", "time", "verde", "amarela", "branca"];

export function isFlagId(v: unknown): v is FlagId {
  return typeof v === "string" && v in FLAGS;
}

/** Cor efetiva da bandeira, resolvendo "time" para a cor do time. */
export function flagColor(flag: FlagId, teamColor: number): number {
  const f = FLAGS[flag];
  if (!f || flag === "nenhuma") return teamColor;
  return f.color ?? teamColor;
}

// ── Veículos ──────────────────────────────────────────────────────────────
export type VehicleId = "nenhum" | "moto" | "carro" | "carro_som";

export interface Vehicle {
  id: VehicleId;
  label: string;
  /** Multiplicador de velocidade de caminhada. */
  speedMul: number;
  /** Toca som ambiente por proximidade (carro de som). */
  playsMusic: boolean;
  priceCents: number;
}

export const VEHICLES: Record<VehicleId, Vehicle> = {
  nenhum: { id: "nenhum", label: "A pé", speedMul: 1, playsMusic: false, priceCents: 0 },
  moto: { id: "moto", label: "Moto", speedMul: 2.2, playsMusic: false, priceCents: 0 },
  carro: { id: "carro", label: "Carro", speedMul: 2.6, playsMusic: false, priceCents: 0 },
  carro_som: {
    id: "carro_som",
    label: "Carro de som",
    speedMul: 2.0,
    playsMusic: true,
    priceCents: 20000,
  },
};

export const VEHICLE_IDS: VehicleId[] = ["nenhum", "moto", "carro", "carro_som"];

export function isVehicleId(v: unknown): v is VehicleId {
  return typeof v === "string" && v in VEHICLES;
}

/** Linha do catálogo para o seed SQL de `catalog_items`. */
export interface CatalogRow {
  id: string;
  kind: "character" | "flag" | "vehicle";
  label: string;
  priceCents: number;
  teamRestriction: TeamId | null;
}

export function catalogRows(): CatalogRow[] {
  const rows: CatalogRow[] = [];
  for (const c of Object.values(CHARACTERS))
    rows.push({ id: `character:${c.id}`, kind: "character", label: c.label, priceCents: c.priceCents, teamRestriction: null });
  for (const f of Object.values(FLAGS))
    if (f.id !== "nenhuma")
      rows.push({ id: `flag:${f.id}`, kind: "flag", label: f.label, priceCents: 0, teamRestriction: null });
  for (const v of Object.values(VEHICLES))
    if (v.id !== "nenhum")
      rows.push({ id: `vehicle:${v.id}`, kind: "vehicle", label: v.label, priceCents: v.priceCents, teamRestriction: null });
  return rows;
}
