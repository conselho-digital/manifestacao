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
export type CharacterId =
  | "homem_comum"
  | "homem_alternativo"
  | "menino"
  | "mulher_comum"
  | "mulher_alternativa"
  | "menina"
  | "policial";

export interface Character {
  id: CharacterId;
  label: string;
  /** Preço de referência (centavos); 0 = grátis. */
  priceCents: number;
}

/** Todos os personagens existem para todas as equipes (o admin pode subir um modelo por equipe). */
export const CHARACTERS: Record<CharacterId, Character> = {
  homem_comum: { id: "homem_comum", label: "Homem comum", priceCents: 0 },
  homem_alternativo: { id: "homem_alternativo", label: "Homem alternativo", priceCents: 2990 },
  menino: { id: "menino", label: "Menino", priceCents: 0 },
  mulher_comum: { id: "mulher_comum", label: "Mulher comum", priceCents: 0 },
  mulher_alternativa: { id: "mulher_alternativa", label: "Mulher alternativa", priceCents: 2990 },
  menina: { id: "menina", label: "Menina", priceCents: 0 },
  policial: { id: "policial", label: "Policial", priceCents: 2990 },
};

export const CHARACTER_IDS: CharacterId[] = [
  "homem_comum",
  "homem_alternativo",
  "menino",
  "mulher_comum",
  "mulher_alternativa",
  "menina",
  "policial",
];

/** Personagem inicial (e o que vale quando um valor salvo/recebido é inválido ou de uma versão antiga). */
export const DEFAULT_CHARACTER: CharacterId = "homem_comum";

export function isCharacterId(v: unknown): v is CharacterId {
  // Object.hasOwn (não `in`): evita que "constructor"/"toString" etc.
  // (herdados do prototype) passem como ID válido.
  return typeof v === "string" && Object.hasOwn(CHARACTERS, v);
}

// ── Bandeira ───────────────────────────────────────────────────────────────
/** Só existe a bandeira da própria equipe (a imagem dela é enviada no admin, em Equipes) ou nenhuma. */
export type FlagId = "nenhuma" | "time";

export interface Flag {
  id: FlagId;
  label: string;
}

export const FLAGS: Record<FlagId, Flag> = {
  nenhuma: { id: "nenhuma", label: "Sem bandeira" },
  time: { id: "time", label: "Bandeira da equipe" },
};

export const FLAG_IDS: FlagId[] = ["nenhuma", "time"];

export function isFlagId(v: unknown): v is FlagId {
  return typeof v === "string" && Object.hasOwn(FLAGS, v);
}

/** Cor do tecido da bandeira: sempre a cor da equipe (a imagem, quando existe, cobre o tecido). */
export function flagColor(_flag: FlagId, teamColor: number): number {
  return teamColor;
}

// ── Veículos ──────────────────────────────────────────────────────────────
export type VehicleId = "nenhum" | "moto" | "moto2" | "carro" | "carro_som" | "caminhao";

/** Como se dirige: a pé (joystick), carro/caminhão (4 botões) ou moto (6 botões, com empinar). */
export type VehicleKind = "foot" | "car" | "moto";

export interface Vehicle {
  id: VehicleId;
  label: string;
  kind: VehicleKind;
  /** Multiplicador de velocidade de caminhada (define a velocidade máxima). */
  speedMul: number;
  /** Toca som ambiente por proximidade (carro de som). */
  playsMusic: boolean;
  priceCents: number;
}

// PREÇOS PROVISÓRIOS (moto, carro, carro de som) — a definir. Ao mudar, atualize
// também supabase/migrations (nova migration de update em catalog_items): a
// cobrança lê o preço do banco, e a lista da lateral lê daqui.
export const VEHICLES: Record<VehicleId, Vehicle> = {
  nenhum: { id: "nenhum", label: "A pé", kind: "foot", speedMul: 1, playsMusic: false, priceCents: 0 },
  moto: { id: "moto", label: "Moto", kind: "moto", speedMul: 2.2, playsMusic: false, priceCents: 2990 },
  moto2: { id: "moto2", label: "Moto esportiva", kind: "moto", speedMul: 2.8, playsMusic: false, priceCents: 2990 },
  carro: { id: "carro", label: "Carro", kind: "car", speedMul: 2.6, playsMusic: false, priceCents: 4990 },
  carro_som: {
    id: "carro_som",
    label: "Carro de som",
    kind: "car",
    speedMul: 2.0,
    playsMusic: true,
    priceCents: 20000,
  },
  caminhao: { id: "caminhao", label: "Caminhão", kind: "car", speedMul: 1.8, playsMusic: false, priceCents: 9990 },
};

export const VEHICLE_IDS: VehicleId[] = ["nenhum", "moto", "moto2", "carro", "carro_som", "caminhao"];

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
      "Moto, carro, caixa de som básica inclusa (libera o carro de som), spray ilimitado e 5 cartazes.",
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
