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
  /** Usar estes pontos mesmo que o arquivo já tenha esqueleto próprio. */
  own?: boolean;
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
  const rig = fillRig({ yaw, neck, pelvis, shoulder, hand, hip, ankle, head: opt("head"), elbow: opt("elbow"), thigh: opt("thigh"), knee: opt("knee"), toe: opt("toe") });
  return o.own === true ? { ...rig, own: true } : rig;
}

let rigs: Record<string, RigMarks> = {};

export function setRigs(next: Record<string, RigMarks>): void {
  rigs = next;
}

/**
 * Esqueleto dos modelos que já vêm no jogo sem esqueleto próprio (marcado uma vez e guardado aqui). O que o admin
 * marcar no editor para a mesma URL vale mais.
 */
const SHIPPED_RIGS: Record<string, RigMarks> = {
  "/models/characters/renam_santos.glb": fillRig({
    yaw: 0,
    head: [0, 1.755],
    neck: [0, 1.56],
    shoulder: [0.207, 1.416],
    elbow: [0.535, 1.416],
    hand: [0.863, 1.416],
    pelvis: [0, 0.936],
    hip: [0.103, 0.9],
    knee: [0.103, 0.495],
    ankle: [0.103, 0.09],
    toe: [0.103, 0.036],
  }),
  // Bonecos feitos da foto (Foto → 3D): braços em A; o esqueleto marcado aqui vale mais que o do arquivo.
  "/models/characters/flavio_bolsonaro.glb": {
    ...fillRig({
      yaw: 0,
      head: [0, 1.78],
      neck: [0, 1.56],
      shoulder: [0.22, 1.45],
      elbow: [0.43, 1.15],
      hand: [0.6, 0.86],
      pelvis: [0, 0.93],
      hip: [0.1, 0.9],
      knee: [0.1, 0.5],
      ankle: [0.1, 0.09],
      toe: [0.1, 0.04],
    }),
    own: true,
  },
  "/models/characters/lula.glb": {
    ...fillRig({
      yaw: 0,
      head: [0, 1.78],
      neck: [0, 1.52],
      shoulder: [0.215, 1.39],
      elbow: [0.52, 1.14],
      hand: [0.68, 1.0],
      pelvis: [0, 0.97],
      hip: [0.1, 0.93],
      knee: [0.1, 0.5],
      ankle: [0.1, 0.09],
      toe: [0.1, 0.04],
    }),
    own: true,
  },
  "/models/characters/eneias.glb": fillRig({
    yaw: 0,
    head: [0, 1.755],
    neck: [0, 1.56],
    shoulder: [0.23, 1.371],
    elbow: [0.557, 1.371],
    hand: [0.885, 1.371],
    pelvis: [0, 0.92],
    hip: [0.1, 0.88],
    knee: [0.1, 0.48],
    ankle: [0.1, 0.09],
    toe: [0.1, 0.036],
  }),
};

/** Marcações do modelo com essa URL: as do admin (editor) ou, na falta, as que já vêm no jogo. */
export function rigForUrl(url: string): RigMarks | null {
  if (Object.hasOwn(rigs, url)) return rigs[url]!;
  return Object.hasOwn(SHIPPED_RIGS, url) ? SHIPPED_RIGS[url]! : null;
}

export function currentRigs(): Record<string, RigMarks> {
  return { ...rigs };
}
