/**
 * Levar golpe de bandeira: cada golpe que acerta faz o alvo reagir (0,5 s); o 5º golpe seguido o derruba no chão
 * (cai para trás, fica deitado um instante e levanta). A contagem zera se ficar um tempo sem apanhar.
 */
export const REACT_SECONDS = 0.5;
/** Queda (0,7 s) + deitado + levantar (1 s). */
export const FALL_SECONDS = 3.4;
/** Número do golpe que derruba: 4 só reagem, o 5º derruba. */
export const HITS_TO_FALL = 5;
/** Sem apanhar por este tempo, a contagem de golpes recomeça. */
export const HIT_COUNT_RESET_MS = 20_000;
/** Alcance do golpe (m) e meio ângulo do cone à frente de quem bate (rad). */
export const STRIKE_RANGE = 2.8;
export const STRIKE_HALF_ANGLE = (70 * Math.PI) / 180;
/** Momento do golpe em que a bandeira acerta (fração dos 0,7 s). */
export const STRIKE_IMPACT_AT = 0.35;

export interface KnockRefs {
  /** Início (performance.now) da última reação a um golpe; 0 = nenhuma. */
  reactAt: { current: number };
  /** Início da última queda; 0 = nenhuma. */
  fallAt: { current: number };
}

export function newKnockRefs(): KnockRefs {
  return { reactAt: { current: 0 }, fallAt: { current: 0 } };
}

/** Progresso 0..1 da reação em andamento; -1 se não há. */
export function reactProgress(at: number, now = performance.now()): number {
  if (!(at > 0)) return -1;
  const p = (now - at) / (REACT_SECONDS * 1000);
  return p >= 0 && p < 1 ? p : -1;
}

/** Segundos desde o início da queda; -1 se não está caído (nem levantando). */
export function fallSeconds(at: number, now = performance.now()): number {
  if (!(at > 0)) return -1;
  const t = (now - at) / 1000;
  return t >= 0 && t < FALL_SECONDS ? t : -1;
}

const smooth = (a: number, b: number, v: number) => {
  const x = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Quanto o corpo está deitado (0 em pé … 1 de costas no chão) em `t` segundos de queda. */
export function lieAmount(t: number): number {
  if (t < 0.7) return Math.pow(t / 0.7, 2); // acelera na queda
  if (t < 2.3) return 1;
  return 1 - smooth(2.3, 3.3, t); // levanta devagar
}

/** Quanto a queda domina a pose dos membros (entra rápido, sai ao terminar de levantar). */
export function fallEnvelope(t: number): number {
  return smooth(0, 0.12, t) * (1 - smooth(3.0, 3.4, t));
}

/** Pose do corpo na reação (recuo): tronco para trás, um passo atrás. */
export function reactBody(p: number): { tilt: number; back: number; arms: number } {
  const r = Math.sin(Math.PI * p);
  return { tilt: -0.3 * r, back: -0.12 * r, arms: 0.9 * r };
}

/** Pose do corpo na queda: rotação para trás em torno dos pés, avanço para o corpo ficar em volta do ponto, altura do chão. */
export function fallBody(t: number): { tilt: number; shift: number; lift: number } {
  const k = lieAmount(t);
  // Um quique no impacto com o chão.
  const bounce = t > 0.7 && t < 1.0 ? Math.sin(((t - 0.7) / 0.3) * Math.PI) * 0.06 : 0;
  return { tilt: -(Math.PI / 2) * k - bounce, shift: 0.8 * k, lift: 0.14 * k };
}

/** Membros na queda: braços jogados para cima ao cair e abertos no chão; pernas meio dobradas. */
export function fallLimbs(t: number): { arm: number; forearm: number; thigh: number; knee: number; lean: number } {
  const falling = 1 - smooth(0.3, 1.2, t);
  return {
    arm: 0.7 + 1.0 * falling * (0.6 + 0.4 * Math.sin(t * 16)),
    forearm: 0.3,
    thigh: 0.15 + 0.35 * falling,
    knee: -(0.2 + 0.5 * falling),
    lean: -0.15,
  };
}

/** Registra um golpe recebido: devolve "fall" no 5º golpe seguido (e zera a contagem), senão "react". */
export function registerHit(counts: Map<string, { n: number; at: number }>, targetId: string, now = Date.now()): "react" | "fall" {
  const c = counts.get(targetId);
  const n = c && now - c.at <= HIT_COUNT_RESET_MS ? c.n + 1 : 1;
  if (n >= HITS_TO_FALL) {
    counts.delete(targetId);
    return "fall";
  }
  counts.set(targetId, { n, at: now });
  while (counts.size > 300) {
    const oldest = counts.keys().next().value;
    if (oldest === undefined) break;
    counts.delete(oldest);
  }
  return "react";
}

/** Quem leva o golpe: o jogador a pé mais perto, dentro do alcance e do cone à frente de quem bate. */
export function findStrikeTarget(
  me: { x: number; z: number; rotationY: number },
  candidates: Iterable<[string, { x: number; z: number; vehicle: string; fallAt?: number }]>,
  now = performance.now(),
): string | null {
  const fx = Math.sin(me.rotationY);
  const fz = Math.cos(me.rotationY);
  let best: string | null = null;
  let bestD = Infinity;
  for (const [id, p] of candidates) {
    if (p.vehicle !== "nenhum" || fallSeconds(p.fallAt ?? 0, now) >= 0) continue;
    const dx = p.x - me.x;
    const dz = p.z - me.z;
    const d = Math.hypot(dx, dz);
    if (d > STRIKE_RANGE || d < 1e-3) continue;
    const cos = (dx * fx + dz * fz) / d;
    if (Math.acos(Math.max(-1, Math.min(1, cos))) > STRIKE_HALF_ANGLE) continue;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}
