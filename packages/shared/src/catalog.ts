/**
 * Catálogo de conteúdo: personagens, bandeiras, veículos e passes.
 *
 * A partir da Fase 3 a posse paga (entitlements) passa a ser exigida de
 * verdade para os itens com preço (hoje: carro de som e o passe Premium).
 * Personagens/bandeiras seguem de seleção livre por enquanto — o preço é
 * só referência até a Fase 4 cobrir moderação/posse de conteúdo cosmético.
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
  // Object.hasOwn (não `in`): evita que "constructor"/"toString" etc.
  // (herdados do prototype) passem como ID válido.
  return typeof v === "string" && Object.hasOwn(CHARACTERS, v);
}

// ── Bandeiras ──────────────────────────────────────────────────────────────
export type FlagId = "nenhuma" | "time" | "verde" | "amarela" | "branca" | "vermelha";

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
  vermelha: { id: "vermelha", label: "Vermelha", color: 0xe5484d },
};

export const FLAG_IDS: FlagId[] = ["nenhuma", "time", "verde", "amarela", "branca", "vermelha"];

export function isFlagId(v: unknown): v is FlagId {
  return typeof v === "string" && Object.hasOwn(FLAGS, v);
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
  moto: { id: "moto", label: "Moto", speedMul: 2.2, playsMusic: false, priceCents: 2990 },
  carro: { id: "carro", label: "Carro", speedMul: 2.6, playsMusic: false, priceCents: 4990 },
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
  return typeof v === "string" && Object.hasOwn(VEHICLES, v);
}

/** Veículos que exigem posse (entitlement `vehicle:<id>`) para selecionar. */
export function vehicleRequiresEntitlement(id: VehicleId): boolean {
  return VEHICLES[id].priceCents > 0;
}

// ── Passes ──────────────────────────────────────────────────────────────
export type PassId = "premium";

export interface Pass {
  id: PassId;
  label: string;
  description: string;
  priceCents: number;
}

export const PASSES: Record<PassId, Pass> = {
  premium: {
    id: "premium",
    label: "Premium",
    description:
      "Personagem sempre conectado, moto, carro, caixa de som básica inclusa (libera o carro de som), spray ilimitado e 5 cartazes.",
    priceCents: 1000,
  },
};

export const PASS_IDS: PassId[] = ["premium"];

export function isPassId(v: unknown): v is PassId {
  return typeof v === "string" && Object.hasOwn(PASSES, v);
}

/** O passe Premium inclui moto, carro e o carro de som (caixa de som básica). */
export function hasVehicleViaPremium(vehicle: VehicleId, owned: ReadonlySet<string>): boolean {
  return vehicle !== "nenhum" && owned.has("pass:premium");
}

/** Linha do catálogo para o seed SQL de `catalog_items`. */
export interface CatalogRow {
  id: string;
  kind: "character" | "flag" | "vehicle" | "pass";
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
  for (const p of Object.values(PASSES))
    rows.push({ id: `pass:${p.id}`, kind: "pass", label: p.label, priceCents: p.priceCents, teamRestriction: null });
  return rows;
}
