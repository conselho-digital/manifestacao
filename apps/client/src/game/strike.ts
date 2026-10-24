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
  return smooth(0, 0.12, p) * (1 - smooth(0.88, 1, p));
}

// ── Segurar a bandeira ─────────────────────────────────────────────────────────────────────────
/** Braço da bandeira (esquerdo) segurando a haste: ombro à frente e cotovelo dobrado, mão na altura do peito. */
export const CARRY_LEFT = { arm: 0.45, forearm: 1.25 };
/** Outro braço, relaxado e meio dobrado. */
export const CARRY_RIGHT = { arm: 0.2, forearm: 0.8 };

// ── Golpe com a bandeira ───────────────────────────────────────────────────────────────────────
/** Braço (ombro e cotovelo) do lado da bandeira durante o golpe: do "segurar" para cima/atrás, desce, volta. */
export function strikeArms(p: number): { arm: number; forearm: number } {
  if (p < 0.3) {
    const k = smooth(0, 0.3, p);
    return { arm: lerp(CARRY_LEFT.arm, 2.0, k), forearm: lerp(CARRY_LEFT.forearm, 0.7, k) };
  }
  if (p < 0.52) {
    const k = smooth(0.3, 0.52, p);
    return { arm: lerp(2.0, 0.85, k), forearm: lerp(0.7, 0.35, k) };
  }
  const k = smooth(0.52, 1, p);
  return { arm: lerp(0.85, CARRY_LEFT.arm, k), forearm: lerp(0.35, CARRY_LEFT.forearm, k) };
}

/** Inclinação do tronco para a frente (rad): um pouco para trás ao levantar, bastante para a frente no golpe. */
export function strikeLean(p: number): number {
  if (p < 0.3) return -0.2 * smooth(0, 0.3, p);
  if (p < 0.52) return -0.2 + 0.75 * smooth(0.3, 0.52, p);
  return 0.55 * (1 - smooth(0.52, 1, p));
}

/** Giro do quadril/tronco (rad) acompanhando o golpe com a bandeira. */
export function strikeTwist(p: number): number {
  return 0.3 * Math.sin(Math.PI * smooth(0.15, 0.7, p));
}

/** Inclinação da própria bandeira em torno da mão (rad; positivo = ponta para a frente). */
export function flagTilt(p: number): number {
  if (p < 0.3) return -0.9 * smooth(0, 0.3, p);
  if (p < 0.52) return -0.9 + 2.45 * smooth(0.3, 0.52, p);
  return 1.55 * (1 - smooth(0.52, 1, p));
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
