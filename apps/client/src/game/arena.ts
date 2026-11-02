/**
 * Arena PvP "coliseu": areia circular cercada por muralha e arquibancadas, com um complexo de obstáculos no meio para
 * subir (degraus), pular (muretas), escalar (muros altos) e se esconder (colunas). Dados puros do layout: o desenho
 * vive em Arena.tsx. Tudo no plano XZ; o chão é plano.
 *
 * Sem veículos na arena (nem parados como abrigo, nem para dirigir). Alturas pensadas para os movimentos (ver physicsHandle.ts): até ~1,1 m dá para pular em cima; até ~1,3 m passa por cima
 * pulando para a frente (vault); até ~2,6 m dá para agarrar a borda e subir (escalar). Degraus de ~0,9 m formam escadas.
 */
import type { SolidCircle, SolidPoly, SolidRect } from "./solids.js";

/** Raio da areia (m): a muralha começa aqui. */
export const ARENA_RADIUS = 64;
/** Muralha em volta da areia (colisão alta o bastante para ninguém sair) e arquibancadas por fora. */
export const WALL_HEIGHT = 5;
export const WALL_THICKNESS = 2;
/** Arquibancadas: degraus concêntricos (raio externo, altura do topo). */
export const STANDS: { outer: number; top: number }[] = [
  { outer: 71, top: 7 },
  { outer: 77, top: 9.5 },
  { outer: 83, top: 12 },
  { outer: 89, top: 14.5 },
];

/** Bloco retangular (w ao longo do eixo local X, d ao longo de Z), girado `rot` rad em torno de Y. */
export interface ArenaBlock {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  /** Faixa amarela no topo (ajuda a ler a altura de quem sobe). */
  cap?: boolean;
}
export interface ArenaPillar {
  x: number;
  z: number;
  r: number;
  h: number;
}
const polar = (r: number, a: number) => ({ x: Math.sin(a) * r, z: Math.cos(a) * r });
const DEG = Math.PI / 180;

function buildBlocks(): ArenaBlock[] {
  const out: ArenaBlock[] = [];
  // Altar central em três degraus (0,9 m cada): a pé, pulando de um para o outro até o topo (2,7 m).
  out.push({ x: 0, z: 0, w: 10, d: 10, h: 0.9, rot: 0, cap: true });
  out.push({ x: 0, z: 0, w: 6.5, d: 6.5, h: 1.8, rot: 0, cap: true });
  out.push({ x: 0, z: 0, w: 3.4, d: 3.4, h: 2.7, rot: 0, cap: true });
  // Muretas baixas (1,1 m) em anel: dá para pular em cima ou passar por cima correndo e pulando.
  for (let k = 0; k < 8; k++) {
    const a = k * 45 * DEG;
    out.push({ ...polar(16, a), w: 6.5, d: 0.8, h: 1.1, rot: a, cap: true });
  }
  // Muros altos (2,1 m) em raios: só escalando (parado, pular na frente do muro).
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) * 45 * DEG;
    out.push({ ...polar(27, a), w: 8, d: 1, h: 2.1, rot: a - Math.PI / 2, cap: true });
  }
  // Escadarias de ruína: três blocos de 0,9 / 1,8 / 2,7 m, de fora para dentro, em quatro pontos.
  for (let k = 0; k < 4; k++) {
    const a = (45 + k * 90) * DEG;
    const rot = a - Math.PI / 2;
    [[44, 0.9], [40, 1.8], [36, 2.7]].forEach(([r, h]) => out.push({ ...polar(r!, a), w: 4, d: 6, h: h!, rot, cap: true }));
  }
  return out;
}
export const ARENA_BLOCKS: ArenaBlock[] = buildBlocks();

/** Colunas de ruína: altas e baixas, em anel (abrigo; as baixas servem de degrau para escalar). */
export const ARENA_PILLARS: ArenaPillar[] = Array.from({ length: 12 }, (_, k) => ({
  ...polar(33, k * 30 * DEG),
  r: 0.9,
  h: k % 2 === 0 ? 5 : 2.2,
}));

/** Cantos de um bloco no mundo (para colisão 2D e minimapa). */
export function blockCorners(b: ArenaBlock): [number, number][] {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sz]) => {
    const lx = (sx * b.w) / 2;
    const lz = (sz * b.d) / 2;
    return [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
  });
}

/** Colisão 2D (para veículos dirigindo): retângulos, polígonos (blocos girados) e círculos (colunas). */
export function arenaSolids(): { rects: SolidRect[]; circles: SolidCircle[]; polys: SolidPoly[] } {
  const rects: SolidRect[] = [];
  const polys: SolidPoly[] = [];
  for (const b of ARENA_BLOCKS) {
    const pts = blockCorners(b);
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    if (Math.abs(Math.sin(b.rot * 2)) < 1e-6) {
      rects.push({ minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });
    } else {
      polys.push({ pts: pts.flat(), minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });
    }
  }
  const circles: SolidCircle[] = ARENA_PILLARS.map((p) => ({ x: p.x, z: p.z, r: p.r }));
  return { rects, circles, polys };
}

export interface ArenaSpawn {
  x: number;
  z: number;
  rotationY: number;
}

/** Oito pontos de entrada junto à muralha, de frente para o centro. */
export const ARENA_SPAWNS: ArenaSpawn[] = Array.from({ length: 8 }, (_, i) => {
  const a = ((i + 0.5) * 45 * Math.PI) / 180;
  const p = polar(58, a);
  const x = Math.round(p.x * 10) / 10;
  const z = Math.round(p.z * 10) / 10;
  return { x, z, rotationY: Math.atan2(-x, -z) };
});

export function randomArenaSpawn(): ArenaSpawn {
  return ARENA_SPAWNS[Math.floor(Math.random() * ARENA_SPAWNS.length)]!;
}
