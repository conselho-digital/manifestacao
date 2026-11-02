/**
 * Arena PvP: mapa quadrado e fechado, simétrico, para combate (golpes e quedas — ver strike.ts / knock.ts).
 * Dados puros do layout: o desenho vive em Arena.tsx. Tudo no plano XZ (o chão é plano).
 */
import type { SolidCircle, SolidRect } from "./solids.js";

/** Meia-largura da arena (m): vai de -ARENA_HALF a +ARENA_HALF nos dois eixos. */
export const ARENA_HALF = 36;
/** Altura das muralhas e espessura (visual e da câmera). */
export const WALL_HEIGHT = 4;
export const WALL_THICKNESS = 1;

export interface ArenaCrate {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}
export interface ArenaPillar {
  x: number;
  z: number;
  r: number;
  h: number;
}
/** Veículo parado como abrigo: o modelo é ajustado a `len` (comprimento) e deitado no eixo X (`turn` gira 90°). */
export interface ArenaCar {
  url: string;
  x: number;
  z: number;
  len: number;
  wid: number;
  turn: boolean;
}

/** Espelha um ponto nos quatro quadrantes (simetria = nenhum lado leva vantagem). */
function mirror4<T extends { x: number; z: number }>(t: T): T[] {
  return [
    { ...t },
    { ...t, x: -t.x },
    { ...t, z: -t.z },
    { ...t, x: -t.x, z: -t.z },
  ];
}

export const ARENA_CRATES: ArenaCrate[] = [
  // Cruz central: quatro blocos baixos em volta do pilar do meio.
  ...[7, -7].map((x) => ({ x, z: 0, w: 4, d: 1.4, h: 1.4 })),
  ...[7, -7].map((z) => ({ x: 0, z, w: 1.4, d: 4, h: 1.4 })),
  // Muros em L nos quatro cantos internos.
  ...mirror4({ x: 18, z: 18, w: 8, d: 1.2, h: 2.2 }),
  ...mirror4({ x: 22, z: 14, w: 1.2, d: 6, h: 2.2 }),
  // Barricadas baixas junto às muralhas, dos dois lados.
  ...mirror4({ x: 12, z: 29, w: 6, d: 1.4, h: 1.6 }),
];

export const ARENA_PILLARS: ArenaPillar[] = [
  { x: 0, z: 0, r: 2, h: 5 },
  ...mirror4({ x: 9, z: 9, r: 1.1, h: 4 }),
  ...mirror4({ x: 28, z: 6, r: 1.1, h: 4 }),
];

export const ARENA_CARS: ArenaCar[] = [
  { url: "/models/vehicles/carro_neutro.glb", x: 14, z: -6, len: 4.6, wid: 2, turn: false },
  { url: "/models/vehicles/carro_neutro.glb", x: -14, z: 6, len: 4.6, wid: 2, turn: false },
  { url: "/models/vehicles/caminhao_neutro.glb", x: 0, z: 22, len: 8, wid: 2.8, turn: false },
  { url: "/models/vehicles/caminhao_neutro.glb", x: 0, z: -22, len: 8, wid: 2.8, turn: false },
  { url: "/models/vehicles/carro_som_neutro.glb", x: 26, z: -22, len: 5.5, wid: 2.2, turn: true },
  { url: "/models/vehicles/carro_som_neutro.glb", x: -26, z: 22, len: 5.5, wid: 2.2, turn: true },
];

/** Colisão (retângulos e círculos) de todo o layout. */
export function arenaSolids(): { rects: SolidRect[]; circles: SolidCircle[] } {
  const rects: SolidRect[] = [];
  for (const c of ARENA_CRATES) rects.push({ minX: c.x - c.w / 2, maxX: c.x + c.w / 2, minZ: c.z - c.d / 2, maxZ: c.z + c.d / 2 });
  for (const v of ARENA_CARS) {
    const w = v.turn ? v.wid : v.len;
    const d = v.turn ? v.len : v.wid;
    rects.push({ minX: v.x - w / 2, maxX: v.x + w / 2, minZ: v.z - d / 2, maxZ: v.z + d / 2 });
  }
  const circles: SolidCircle[] = ARENA_PILLARS.map((p) => ({ x: p.x, z: p.z, r: p.r }));
  return { rects, circles };
}

export interface ArenaSpawn {
  x: number;
  z: number;
  rotationY: number;
}

/** Oito pontos de entrada em anel, de frente para o centro (livres de obstáculos). */
export const ARENA_SPAWNS: ArenaSpawn[] = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  const x = Math.round(Math.sin(a) * 31 * 10) / 10;
  const z = Math.round(Math.cos(a) * 31 * 10) / 10;
  return { x, z, rotationY: Math.atan2(-x, -z) };
});

export function randomArenaSpawn(): ArenaSpawn {
  return ARENA_SPAWNS[Math.floor(Math.random() * ARENA_SPAWNS.length)]!;
}
