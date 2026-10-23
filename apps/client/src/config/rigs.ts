/**
 * Marcações de esqueleto de um personagem (.glb), feitas no editor do painel de admin: de que lado fica a frente e onde
 * ficam pescoço, pélvis, ombro, mão, quadril e tornozelo. Com elas o jogo monta o esqueleto e anima braços e pernas
 * sozinho (game/autoRig.ts). Guardadas em game_config.rigs, por URL do modelo.
 *
 * Coordenadas em metros no referencial do modelo já virado para a frente (+Z): x a partir do centro, y a partir dos pés.
 * Só um lado é marcado (o outro é espelhado em torno do eixo do corpo).
 */

export type RigYaw = 0 | 90 | 180 | 270;
export type Pt = [number, number];

export const RIG_POINTS = [
  { key: "neck", label: "Pescoço", help: "Onde a cabeça encontra o corpo" },
  { key: "pelvis", label: "Pélvis", help: "Centro da cintura/quadril" },
  { key: "shoulder", label: "Ombro", help: "Articulação do ombro (um lado só)" },
  { key: "hand", label: "Mão", help: "Ponta da mão do mesmo lado" },
  { key: "hip", label: "Quadril", help: "Articulação da perna, no topo da coxa (mesmo lado)" },
  { key: "ankle", label: "Tornozelo", help: "Onde a perna encontra o pé (mesmo lado)" },
] as const;
export type RigKey = (typeof RIG_POINTS)[number]["key"];

export interface RigMarks {
  yaw: RigYaw;
  neck: Pt;
  pelvis: Pt;
  shoulder: Pt;
  hand: Pt;
  hip: Pt;
  ankle: Pt;
}

const MAX = 100;
function cleanPt(v: unknown): Pt | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [x, y] = v as unknown[];
  return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= MAX && Math.abs(y) <= MAX ? [x, y] : null;
}

/** Valida marcações vindas do banco (nada de confiar no formato). */
export function cleanRig(v: unknown): RigMarks | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const yaw = o.yaw;
  if (yaw !== 0 && yaw !== 90 && yaw !== 180 && yaw !== 270) return null;
  const neck = cleanPt(o.neck);
  const pelvis = cleanPt(o.pelvis);
  const shoulder = cleanPt(o.shoulder);
  const hand = cleanPt(o.hand);
  const hip = cleanPt(o.hip);
  const ankle = cleanPt(o.ankle);
  if (!neck || !pelvis || !shoulder || !hand || !hip || !ankle) return null;
  return { yaw, neck, pelvis, shoulder, hand, hip, ankle };
}

let rigs: Record<string, RigMarks> = {};

export function setRigs(next: Record<string, RigMarks>): void {
  rigs = next;
}

/** Marcações do modelo com essa URL, se o admin fez o editor para ele. */
export function rigForUrl(url: string): RigMarks | null {
  return Object.hasOwn(rigs, url) ? rigs[url]! : null;
}

export function currentRigs(): Record<string, RigMarks> {
  return { ...rigs };
}
