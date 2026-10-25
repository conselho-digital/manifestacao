/**
 * Levar golpe: cada golpe que acerta faz o alvo reagir (0,5 s); o 5º golpe seguido o derruba no chão (cambaleia, os joelhos
 * dobram, cai de costas, fica deitado, senta e levanta). A contagem zera se ficar um tempo sem apanhar.
 */
export const REACT_SECONDS = 0.5;
/** Cambaleia, desaba, deitado, senta, levanta. */
export const FALL_SECONDS = 3.8;
/** Número do golpe que derruba: 4 só reagem, o 5º derruba. */
export const HITS_TO_FALL = 5;
/** Sem apanhar por este tempo, a contagem de golpes recomeça. */
export const HIT_COUNT_RESET_MS = 20_000;
/** Alcance do golpe (m) e meio ângulo do cone à frente de quem bate (rad). */
export const STRIKE_RANGE = 2.8;
export const PUNCH_RANGE = 1.7;
export const STRIKE_HALF_ANGLE = (70 * Math.PI) / 180;
/** Momento do golpe em que acerta (fração da duração). */
export const STRIKE_IMPACT_AT = 0.5; // instante do contato na animação de bandeira (strike.ts)
export const PUNCH_IMPACT_AT = 0.42;
/** Altura do quadril em pé (m): o corpo gira em torno dele ao cair. */
export const HIP_HEIGHT = 0.95;

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
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Quanto a queda domina a pose dos membros (entra rápido, sai ao terminar de levantar). */
export function fallEnvelope(t: number): number {
  return smooth(0, 0.1, t) * (1 - smooth(3.5, 3.8, t));
}

/** Pose do corpo na reação (recuo): tronco para trás, um passo atrás. */
export function reactBody(p: number): { tilt: number; back: number; arms: number } {
  const r = Math.sin(Math.PI * p);
  return { tilt: -0.3 * r, back: -0.12 * r, arms: 0.9 * r };
}

/**
 * Corpo na queda: gira para trás em torno do QUADRIL (os pés escorregam para a frente) e o quadril desce até o chão.
 * 0–0,25 cambaleia · 0,25–0,8 desaba · 0,8–1,0 bate no chão e quica · deitado até 2,5 · senta até 3,0 · levanta até 3,8.
 */
export function fallBody(t: number): { tilt: number; drop: number } {
  const lie = -Math.PI / 2;
  let tilt: number;
  let drop: number;
  if (t < 0.25) {
    tilt = lerp(0, -0.2, smooth(0, 0.25, t));
    drop = 0.03 * smooth(0, 0.25, t);
  } else if (t < 0.8) {
    const k = smooth(0.25, 0.8, t);
    tilt = lerp(-0.2, lie, k * k);
    drop = lerp(0.03, HIP_HEIGHT - 0.17, k);
  } else if (t < 1.0) {
    const k = (t - 0.8) / 0.2;
    tilt = lie - 0.07 * Math.sin(Math.PI * k); // quica no chão
    drop = HIP_HEIGHT - 0.17 - 0.03 * Math.sin(Math.PI * k);
  } else if (t < 2.5) {
    tilt = lie;
    drop = HIP_HEIGHT - 0.17;
  } else if (t < 3.0) {
    const k = smooth(2.5, 3.0, t);
    tilt = lerp(lie, -0.55, k); // senta
    drop = lerp(HIP_HEIGHT - 0.17, HIP_HEIGHT - 0.4, k);
  } else {
    const k = smooth(3.0, 3.8, t);
    tilt = lerp(-0.55, 0, k); // levanta
    drop = lerp(HIP_HEIGHT - 0.4, 0, k);
  }
  return { tilt, drop };
}

/** Membros na queda (ângulos para a frente; joelho negativo = dobra). */
export function fallLimbs(t: number): { arm: number; forearm: number; thigh: number; knee: number; lean: number; head: number } {
  if (t < 0.25) {
    const k = smooth(0, 0.25, t);
    return { arm: lerp(0.1, 1.5, k), forearm: lerp(0.3, 0.4, k), thigh: lerp(0.03, 0.2, k), knee: lerp(-0.05, -0.4, k), lean: -0.1, head: -0.25 };
  }
  if (t < 0.8) {
    const k = smooth(0.25, 0.8, t);
    // Joelhos cedem (coxas à frente, joelhos dobrados), braços abertos para amortecer.
    return { arm: lerp(1.5, 0.9, k), forearm: lerp(0.4, 0.2, k), thigh: lerp(0.2, 1.0, k), knee: lerp(-0.4, -1.5, k), lean: lerp(-0.1, -0.05, k), head: lerp(-0.25, 0.1, k) };
  }
  if (t < 2.5) {
    // Deitado: pernas relaxam e se esticam devagar, braços caem ao lado.
    const k = smooth(0.8, 1.6, t);
    return { arm: lerp(0.9, 0.35, k), forearm: 0.25, thigh: lerp(1.0, 0.15, k), knee: lerp(-1.5, -0.25, k), lean: 0, head: lerp(0.1, 0.0, k) + 0.02 * Math.sin(t * 2.4) };
  }
  if (t < 3.0) {
    // Apoia as mãos no chão e senta.
    const k = smooth(2.5, 3.0, t);
    return { arm: lerp(0.35, -0.5, k), forearm: lerp(0.25, 0.1, k), thigh: lerp(0.15, 1.2, k), knee: lerp(-0.25, -0.35, k), lean: lerp(0, 0.1, k), head: 0.1 };
  }
  // Agacha e levanta.
  const k = smooth(3.0, 3.8, t);
  const squat = Math.sin(Math.PI * Math.min(1, k * 1.1)) * 0.6;
  return { arm: lerp(-0.5, 0.1, k), forearm: lerp(0.1, 0.3, k), thigh: lerp(1.2, 0.03, k) + squat * 0.2, knee: lerp(-0.35, -0.05, k) - squat * 0.5, lean: lerp(0.1, 0, k) + squat * 0.15, head: lerp(0.1, 0, k) };
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
  range = STRIKE_RANGE,
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
    if (d > range || d < 1e-3) continue;
    const cos = (dx * fx + dz * fz) / d;
    if (Math.acos(Math.max(-1, Math.min(1, cos))) > STRIKE_HALF_ANGLE) continue;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}
