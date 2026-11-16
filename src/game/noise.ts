// Barulhos que os outros jogadores podem ouvir (tiros, buzina, batida, motor, sirene, pneu e lata raspando): cada um vira um círculo no chão
// com o raio de "até onde se ouve agora" (voiceRing.ts desenha). Quem produz o som (audio.ts) avisa aqui; nada daqui toca som.
import { terrainHeight } from './map';

/** Volume mínimo (0..1) que ainda conta como "dá para ouvir": o círculo vai até onde o som cai a esse nível. */
const AUDIBLE = 0.04;
/** o círculo mostra só 30% do alcance real do som (pedido do dono: o círculo era grande demais; depois mais 30% menor; o som continua chegando onde chegava) */
const RING_SCALE = 0.21; // 0,3 x 0,7: duas reduções pedidas (30% e depois 70% do que sobrou)

/**
 * Distância (m) até onde um som de amplitude `amp` (0..1) ainda se ouve, com o mesmo cálculo de volume do `proximity` (cheio a menos de `near`,
 * cai com o quadrado até `range`).
 */
export function audibleRadius(range: number, near: number, amp: number): number {
  const a = Math.max(0.001, Math.min(1, amp));
  const k = a <= AUDIBLE ? 0 : 1 - Math.sqrt(AUDIBLE / a);
  return near + Math.max(0, range - near) * k;
}

export interface NoiseSpot { x: number; y: number; z: number; r: number }

interface Hold { x: number; z: number; r: number; shown: number; seen: number }
interface Burst { x: number; z: number; r: number; t0: number; dur: number }

const holds = new Map<string, Hold>();
const bursts: Burst[] = [];
const HOLD_GRACE_MS = 220; // som contínuo some se ninguém renová-lo nesse tempo (motor desligou, saiu do carro...)

/** Som contínuo (motor, sirene, pneu...): chamar a cada quadro enquanto soa; `key` identifica a fonte. */
export function noiseHold(key: string, x: number, z: number, r: number): void {
  const now = performance.now();
  const h = holds.get(key);
  r *= RING_SCALE;
  if (h) { h.x = x; h.z = z; h.r = r; h.seen = now; } else holds.set(key, { x, z, r, shown: 0, seen: now });
}

/** Som curto (tiro, buzina, batida): o círculo abre no raio cheio e encolhe até sumir em `dur` s. */
export function noiseBurst(x: number, z: number, r: number, dur = 0.5): void {
  if (bursts.length > 64) bursts.shift();
  bursts.push({ x, z, r: r * RING_SCALE, t0: performance.now(), dur: dur * 1000 });
}

/** Círculos a desenhar agora (só os que passam de `minR` e estão a menos de `maxDist` do ouvinte). */
export function activeNoises(lx: number, lz: number, maxDist: number, dt: number): NoiseSpot[] {
  const now = performance.now();
  const out: NoiseSpot[] = [];
  const near = (x: number, z: number, r: number): boolean => Math.hypot(x - lx, z - lz) < r + maxDist;
  for (const [key, h] of holds) {
    const live = now - h.seen < HOLD_GRACE_MS;
    const target = live ? h.r : 0;
    h.shown += (target - h.shown) * (1 - Math.exp(-dt * (target > h.shown ? 18 : 7)));
    if (!live && h.shown < 0.15) { holds.delete(key); continue; }
    if (h.shown > 0.15 && near(h.x, h.z, h.shown)) out.push({ x: h.x, y: terrainHeight(h.x, h.z), z: h.z, r: h.shown });
  }
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]!;
    const f = 1 - (now - b.t0) / b.dur;
    if (f <= 0) { bursts.splice(i, 1); continue; }
    const r = b.r * f * f;
    if (r > 0.15 && near(b.x, b.z, r)) out.push({ x: b.x, y: terrainHeight(b.x, b.z), z: b.z, r });
  }
  return out;
}
