/**
 * Marcações de esqueleto de um personagem (.glb), feitas no editor do painel de admin: de que lado fica a frente e onde
 * ficam cabeça, pescoço, ombro, cotovelo, mão, pélvis, quadril, coxa, joelho, pé e ponta do pé. Com elas o jogo monta o
 * esqueleto e anima o corpo sozinho (game/autoRig.ts). Guardadas em game_config.rigs, por URL do modelo.
 *
 * Coordenadas em metros no referencial do modelo já virado para a frente (+Z): x a partir do centro, y a partir dos pés.
 * Só um lado é marcado (o outro é espelhado em torno do eixo do corpo).
 */

export type RigYaw = 0 | 90 | 180 | 270;
export type Pt = [number, number];

export const RIG_POINTS = [
  { key: "head", label: "Cabeça", help: "Topo da cabeça" },
  { key: "neck", label: "Pescoço", help: "Onde a cabeça encontra o corpo" },
  { key: "shoulder", label: "Ombro", help: "Articulação do ombro (um lado só)" },
  { key: "elbow", label: "Cotovelo", help: "Dobra do braço, do mesmo lado" },
  { key: "hand", label: "Mão", help: "Pulso/mão do mesmo lado" },
  { key: "pelvis", label: "Cintura", help: "Centro da cintura/pélvis" },
  { key: "hip", label: "Quadril", help: "Articulação da perna, no topo da coxa (mesmo lado)" },
  { key: "thigh", label: "Coxa", help: "Meio da coxa, do mesmo lado" },
  { key: "knee", label: "Joelho", help: "Dobra da perna, do mesmo lado" },
  { key: "ankle", label: "Pé", help: "Tornozelo, onde a perna encontra o pé" },
  { key: "toe", label: "Ponta do pé", help: "Ponta do pé, do mesmo lado" },
] as const;
export type RigKey = (typeof RIG_POINTS)[number]["key"];

export interface RigMarks {
  yaw: RigYaw;
  head: Pt;
  neck: Pt;
  shoulder: Pt;
  elbow: Pt;
  hand: Pt;
  pelvis: Pt;
  hip: Pt;
  thigh: Pt;
  knee: Pt;
  ankle: Pt;
  toe: Pt;
}

const MAX = 100;
function cleanPt(v: unknown): Pt | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [x, y] = v as unknown[];
  return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= MAX && Math.abs(y) <= MAX ? [x, y] : null;
}
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** Completa o que falta (esqueletos salvos com só 6 pontos): cotovelo, coxa, joelho, cabeça e ponta do pé saem dos outros. */
export function fillRig(r: Partial<RigMarks> & Pick<RigMarks, "yaw" | "neck" | "pelvis" | "shoulder" | "hand" | "hip" | "ankle">): RigMarks {
  const knee = r.knee ?? mid(r.hip, r.ankle);
  return {
    yaw: r.yaw,
    neck: r.neck,
    pelvis: r.pelvis,
    shoulder: r.shoulder,
    hand: r.hand,
    hip: r.hip,
    ankle: r.ankle,
    head: r.head ?? [r.neck[0], r.neck[1] + Math.max(0.2, (r.neck[1] - r.pelvis[1]) * 0.5)],
    elbow: r.elbow ?? mid(r.shoulder, r.hand),
    knee,
    thigh: r.thigh ?? mid(r.hip, knee),
    toe: r.toe ?? [r.ankle[0], Math.max(0, r.ankle[1] * 0.3)],
  };
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
  const opt = (k: string) => (o[k] === undefined ? undefined : (cleanPt(o[k]) ?? undefined));
  return fillRig({ yaw, neck, pelvis, shoulder, hand, hip, ankle, head: opt("head"), elbow: opt("elbow"), thigh: opt("thigh"), knee: opt("knee"), toe: opt("toe") });
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
