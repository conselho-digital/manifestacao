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
/** Braço da bandeira (esquerdo) segurando a haste: ombro à frente e cotovelo dobrado, mão na altura do peito. */
export const CARRY_LEFT = { arm: 0.45, forearm: 1.25 };
/** Outro braço, relaxado e meio dobrado. */
export const CARRY_RIGHT = { arm: 0.2, forearm: 0.8 };

// ── Golpe com a bandeira ───────────────────────────────────────────────────────────────────────
// 0,7 s no total (a duração não muda). Fases: preparação (pequeno recuo), levantada para trás com a bandeira, instante
// de pausa no alto, descida que ACELERA até o contato (p = 0,5), continuação do movimento (passa um pouco do ponto) e
// volta amortecida para a posição de segurar.
type Ease = "in" | "out" | "io";
const EASE: Record<Ease, (t: number) => number> = {
  in: (t) => t * t * (1.2 + 0 * t) - 0.2 * t * t * t, // arranca devagar e termina em velocidade máxima
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

const ARM_KEYS = [
  [0, CARRY_LEFT.arm, "io"],
  [0.1, 0.3, "out"], // prepara: a bandeira desce um pouco
  [0.36, 2.1, "out"], // levanta para trás/cima
  [0.42, 2.18, "io"], // pausa no alto
  [0.52, 0.8, "in"], // desce acelerando até o contato
  [0.62, 0.52, "out"], // continua um pouco depois do contato
  [1, CARRY_LEFT.arm, "io"],
] as const;
const FORE_KEYS = [
  [0, CARRY_LEFT.forearm, "io"],
  [0.1, 1.4, "out"],
  [0.36, 0.55, "out"],
  [0.42, 0.5, "io"],
  [0.52, 0.28, "in"],
  [0.62, 0.22, "out"],
  [1, CARRY_LEFT.forearm, "io"],
] as const;
const LEAN_KEYS = [
  [0, 0, "io"],
  [0.1, 0.06, "out"], // agacha de leve ao preparar
  [0.38, -0.24, "out"], // peito para trás ao levantar
  [0.42, -0.26, "io"],
  [0.54, 0.52, "in"], // joga o peso para a frente no golpe
  [0.64, 0.6, "out"],
  [1, 0, "io"],
] as const;
const TWIST_KEYS = [
  [0, 0, "io"],
  [0.1, 0.03, "out"],
  [0.4, -0.28, "out"], // quadril e ombros giram para trás
  [0.56, 0.42, "in"], // e vêm junto com a descida
  [0.66, 0.44, "out"],
  [1, 0, "io"],
] as const;
const TILT_KEYS = [
  [0, 0, "io"],
  [0.1, 0.1, "out"],
  [0.36, -0.95, "out"],
  [0.42, -1.0, "io"],
  [0.52, 1.5, "in"],
  [0.62, 1.78, "out"],
  [1, 0, "io"],
] as const;

/** Braço (ombro e cotovelo) do lado da bandeira durante o golpe: do "segurar" para cima/atrás, desce, volta. */
export function strikeArms(p: number): { arm: number; forearm: number } {
  return { arm: keyed(p, ARM_KEYS), forearm: keyed(p, FORE_KEYS) };
}

/** Inclinação do tronco para a frente (rad): para trás ao levantar, bastante para a frente no golpe. */
export function strikeLean(p: number): number {
  return keyed(p, LEAN_KEYS);
}

/** Giro do quadril/tronco (rad) acompanhando o golpe com a bandeira. */
export function strikeTwist(p: number): number {
  return keyed(p, TWIST_KEYS);
}

/** Inclinação da própria bandeira em torno da mão (rad; positivo = ponta para a frente). */
export function flagTilt(p: number): number {
  return keyed(p, TILT_KEYS);
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
  rArm = lerp(rArm, 1.55, hit);
  rFore = lerp(rFore, 0.12, hit);
  rArm = lerp(rArm, guard.arm, back);
  rFore = lerp(rFore, guard.fore, back);
  const twist = lerp(lerp(0, -0.3, wind), 0.4, hit) * (1 - back);
  const lean = lerp(lerp(0, -0.05, wind), 0.35, hit) * (1 - back);
  const step = lerp(0, 0.45, hit) * (1 - back);
  return { rArm, rFore, lArm: 0.85, lFore: 1.9, twist, lean, step };
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

// ── Segurar com as duas mãos ────────────────────────────────────────────────────────────────────
/** Quanto a mão de baixo (esquerda) desliza haste abaixo, em metros. */
export const GRIP_SLIDE = 0.24;
/** Abertura lateral (rad) que aproxima os braços da haste, no centro do corpo. */
export const GRIP_ADDUCT = 1.0;
/** Só uma abertura leve para a mão de baixo (esquerda), que já está do lado da haste. */
export const GRIP_ADDUCT_NEAR = 0.1;

/** Braço de dois ossos (ombro e cotovelo): ângulos que levam a mão a `target` (altura, distância à frente). */
export function solveArm(target: { y: number; z: number }): { arm: number; forearm: number } {
  const dy = SHOULDER_Y - target.y;
  const dz = target.z;
  const d = Math.min(UPPER + LOWER - 1e-4, Math.max(Math.abs(UPPER - LOWER) + 1e-4, Math.hypot(dy, dz)));
  const c = Math.max(-1, Math.min(1, (d * d - UPPER * UPPER - LOWER * LOWER) / (2 * UPPER * LOWER)));
  const forearm = Math.acos(c);
  const arm = Math.atan2(dz, dy) - Math.atan2(LOWER * Math.sin(forearm), UPPER + LOWER * Math.cos(forearm));
  return { arm, forearm };
}

/**
 * Braços ao segurar a bandeira com as duas mãos. A mão de cima (direita) fica onde a mão esquerda segurava; a de baixo
 * (esquerda) desliza haste abaixo. `p` = progresso do golpe (ou null parado) e `env` = quanto o golpe domina a pose.
 */
export function gripArms(p: number | null, env: number): { upper: { arm: number; forearm: number }; lower: { arm: number; forearm: number } } {
  const strike = p === null ? CARRY_LEFT : strikeArms(p);
  const arm = lerp(CARRY_LEFT.arm, strike.arm, env);
  const forearm = lerp(CARRY_LEFT.forearm, strike.forearm, env);
  const hand = handPosition(arm, forearm);
  const tilt = p === null ? 0 : flagTilt(p) * env;
  const lowerTarget = { y: hand.y - GRIP_SLIDE * Math.cos(tilt), z: hand.z - GRIP_SLIDE * Math.sin(tilt) };
  return { upper: solveArm(hand), lower: solveArm(lowerTarget) };
}
