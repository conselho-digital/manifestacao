/**
 * Bater: duas animações. Com bandeira na mão, um golpe de 0,7 s (levanta para trás, desce rápido, volta). Sem bandeira,
 * um soco de 0,5 s (puxa o braço, estica à frente, volta). As curvas daqui movem os braços do personagem
 * (autoAnimate.ts / Avatar.tsx) e a bandeira (Avatar.tsx).
 */
export type StrikeKind = "flag" | "punch";

/** Golpe em andamento: início (performance.now; 0 = nenhum) e tipo. */
export interface StrikeRefs {
  at: { current: number };
  kind: { current: StrikeKind };
}
export function newStrikeRefs(): StrikeRefs {
  return { at: { current: 0 }, kind: { current: "flag" } };
}
/** Progresso do golpe de `refs`, ou null se não há golpe agora. */
export function activeStrike(refs: StrikeRefs | undefined): { kind: StrikeKind; p: number } | null {
  if (!refs) return null;
  const p = strikeProgress(refs.at.current, refs.kind.current);
  return p >= 0 ? { kind: refs.kind.current, p } : null;
}

export const STRIKE_SECONDS = 0.7;
export const PUNCH_SECONDS = 0.5;
export const strikeSeconds = (kind: StrikeKind): number => (kind === "punch" ? PUNCH_SECONDS : STRIKE_SECONDS);

const smooth = (a: number, b: number, v: number) => {
  const x = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Progresso 0..1 do golpe que começou em `at` (performance.now); -1 se não há golpe em andamento. */
export function strikeProgress(at: number, kind: StrikeKind = "flag", now = performance.now()): number {
  if (!(at > 0)) return -1;
  const p = (now - at) / (strikeSeconds(kind) * 1000);
  return p >= 0 && p < 1 ? p : -1;
}

/** Quanto o golpe domina a pose (0..1): entra e sai suave, para não "dar tranco" na caminhada. */
export function strikeEnvelope(p: number): number {
  return smooth(0, 0.08, p) * (1 - smooth(0.92, 1, p));
}

// ── Segurar a bandeira ─────────────────────────────────────────────────────────────────────────
/** Só a mão direita segura a haste (a esquerda fica livre): ombro à frente e cotovelo dobrado, mão na altura da cintura/peito. */
export const HOLD_RIGHT = { arm: 0.4, forearm: 1.25 };
/** Distância do ombro direito ao eixo do corpo (m) e de quanto da haste fica abaixo da mão (como o cabo de um taco). */
export const SHOULDER_X = 0.2;
export const POLE_GRIP = 0.4;

// ── Golpe com a bandeira: tacada de lado, como no beisebol ─────────────────────────────────────
// 0,7 s no total. Preparação: o braço sobe na horizontal e vai para trás/direita com a haste inclinada para trás; pausa;
// a tacada varre o braço da direita para a esquerda, na frente do corpo, com a haste deitando até ficar horizontal no
// contato (p = 0,5); continua até a esquerda e volta amortecida à posição de segurar.
type Ease = "in" | "out" | "io";
const EASE: Record<Ease, (t: number) => number> = {
  in: (t) => 1.2 * t * t - 0.2 * t * t * t, // arranca devagar e termina em velocidade máxima
  out: (t) => 1 - (1 - t) * (1 - t),
  io: (t) => t * t * (3 - 2 * t),
};
/** Interpola entre quadros-chave [p, valor]; o `ease` de cada quadro vale para o trecho que CHEGA nele. */
function keyed(p: number, keys: readonly (readonly [number, number, Ease])[]): number {
  if (p <= keys[0]![0]) return keys[0]![1];
  for (let i = 1; i < keys.length; i++) {
    const [p1, v1, e] = keys[i]!;
    const [p0, v0] = keys[i - 1]!;
    if (p <= p1) return lerp(v0, v1, EASE[e]((p - p0) / (p1 - p0)));
  }
  return keys[keys.length - 1]![1];
}

/** Ombro: sobe para a frente até quase a horizontal (altura do ombro). */
const ARM_KEYS = [
  [0, HOLD_RIGHT.arm, "io"],
  [0.12, 0.9, "out"],
  [0.3, 1.35, "out"],
  [0.42, 1.4, "io"],
  [0.5, 1.4, "in"],
  [0.66, 1.3, "out"],
  [1, HOLD_RIGHT.arm, "io"],
] as const;
/** Cotovelo: dobrado na preparação, estica no contato. */
const FORE_KEYS = [
  [0, HOLD_RIGHT.forearm, "io"],
  [0.12, 1.0, "out"],
  [0.3, 0.85, "out"],
  [0.42, 0.8, "io"],
  [0.5, 0.25, "in"],
  [0.66, 0.35, "out"],
  [1, HOLD_RIGHT.forearm, "io"],
] as const;
/** Giro do braço na horizontal (rad; positivo = para a esquerda de quem bate): a varredura da tacada. */
const YAW_KEYS = [
  [0, 0, "io"],
  [0.12, -0.4, "out"],
  [0.3, -1.15, "out"],
  [0.42, -1.25, "io"], // pausa atrás, à direita
  [0.5, 0.35, "in"], // varre rápido e acelerando até o contato, na frente
  [0.66, 1.55, "out"], // continua até a esquerda
  [1, 0, "io"],
] as const;
/** Inclinação da haste a partir da vertical, no sentido da varredura: para trás na preparação, deitada no contato. */
const TILT_KEYS = [
  [0, 0, "io"],
  [0.12, -0.2, "out"],
  [0.3, -0.55, "out"],
  [0.42, -0.6, "io"],
  [0.5, 1.3, "in"],
  [0.66, 1.45, "out"],
  [1, 0, "io"],
] as const;
const LEAN_KEYS = [
  [0, 0, "io"],
  [0.3, -0.05, "out"],
  [0.5, 0.12, "in"],
  [0.66, 0.1, "out"],
  [1, 0, "io"],
] as const;

/** Pose da tacada em `p`: ombro, cotovelo, giro do braço e inclinação da haste. */
export function batSwing(p: number): { arm: number; forearm: number; yaw: number; tilt: number } {
  return { arm: keyed(p, ARM_KEYS), forearm: keyed(p, FORE_KEYS), yaw: keyed(p, YAW_KEYS), tilt: keyed(p, TILT_KEYS) };
}

/** Braço direito da bandeira: parado segurando (p = null) ou na tacada, misturado por `env` (0..1). */
export function holdArm(p: number | null, env: number): { arm: number; forearm: number; yaw: number; tilt: number } {
  if (p === null || env <= 0) return { arm: HOLD_RIGHT.arm, forearm: HOLD_RIGHT.forearm, yaw: 0, tilt: 0 };
  const b = batSwing(p);
  return {
    arm: lerp(HOLD_RIGHT.arm, b.arm, env),
    forearm: lerp(HOLD_RIGHT.forearm, b.forearm, env),
    yaw: b.yaw * env,
    tilt: b.tilt * env,
  };
}

/** Inclinação do tronco para a frente (rad) na tacada. */
export function strikeLean(p: number): number {
  return keyed(p, LEAN_KEYS);
}

/** O corpo não gira na tacada: o giro é todo do braço (a haste acompanha a mão sem depender do tronco). */
export function strikeTwist(_p: number): number {
  return 0;
}

// ── Soco ───────────────────────────────────────────────────────────────────────────────────────
export interface PunchPose {
  /** Braço que soca (direito): ombro e cotovelo. */
  rArm: number;
  rFore: number;
  /** Braço da guarda (esquerdo). */
  lArm: number;
  lFore: number;
  /** Giro do quadril (+ = lado direito vai à frente) e do tronco, inclinação do tronco, passo da perna esquerda à frente. */
  twist: number;
  lean: number;
  step: number;
}

/** Soco direto: puxa o punho (0–0,3), estica à frente com o giro do corpo (0,3–0,5), volta à guarda. */
export function punchPose(p: number): PunchPose {
  const wind = smooth(0, 0.3, p);
  const hit = smooth(0.3, 0.5, p);
  const back = smooth(0.5, 1, p);
  // Punho: em guarda (ombro 0,6, cotovelo 1,9) → puxado (−0,3 / 2,0) → esticado (1,55 / 0,12) → guarda.
  const guard = { arm: 0.6, fore: 1.9 };
  let rArm = lerp(guard.arm, -0.3, wind);
  let rFore = lerp(guard.fore, 2.0, wind);
  rArm = lerp(rArm, 1.6, hit); // braço na horizontal: o punho chega na altura do rosto (ombro ~1,45 m)
  rFore = lerp(rFore, 0.04, hit);
  rArm = lerp(rArm, guard.arm, back);
  rFore = lerp(rFore, guard.fore, back);
  const twist = lerp(lerp(0, -0.08, wind), 0.1, hit) * (1 - back);
  const lean = lerp(lerp(0, -0.02, wind), 0.06, hit) * (1 - back);
  const step = lerp(0, 0.45, hit) * (1 - back);
  // Guarda: a mão esquerda fica junto do rosto.
  return { rArm, rFore, lArm: 1.0, lFore: 2.1, twist, lean, step };
}

// ── Mão no espaço (para a bandeira acompanhar o braço) ──────────────────────────────────────────
const UPPER = 0.32;
const LOWER = 0.3;
const SHOULDER_Y = 1.45;
/** Onde fica a mão (altura, distância à frente) com ombro `arm` e cotovelo `forearm` (rad, para a frente). */
export function handPosition(arm: number, forearm: number): { y: number; z: number } {
  return {
    y: SHOULDER_Y - UPPER * Math.cos(arm) - LOWER * Math.cos(arm + forearm),
    z: UPPER * Math.sin(arm) + LOWER * Math.sin(arm + forearm),
  };
}
