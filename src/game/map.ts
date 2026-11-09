/** Caixa sólida (colisão, tiro, pouso e escalada). `bottom` > 0 = flutua (dá para passar por baixo). */
export interface Box {
  minX: number; maxX: number; minZ: number; maxZ: number;
  top: number;
  bottom?: number;
  /** cor no minimapa */
  color?: string;
}

export interface Rect { x0: number; x1: number; z0: number; z1: number }

/** Limites da cidade (metros a partir do centro). */
export const MAP = { halfX: 100, halfZ: 72 };

/** Lugares com nome, em ordem de prioridade (o primeiro que contém o ponto vence). */
export const PLACES: { name: string; rect: Rect }[] = [];

/** Nome do lugar onde o jogador está (mostrado no topo do HUD). */
export function placeName(x: number, z: number): string {
  for (const p of PLACES) {
    const r = p.rect;
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return p.name;
  }
  return z >= 0 ? 'QUARTEIRÃO NORTE' : 'QUARTEIRÃO SUL';
}

export const COLLIDERS: Box[] = [];
/** Ruas e parques (só para desenhar nos mapas). */
export const ROADS: Rect[] = [];
export const PARKS: Rect[] = [];

export function addBox(minX: number, maxX: number, minZ: number, maxZ: number, top: number, color = '#9a9a9a', bottom = 0): void {
  COLLIDERS.push({ minX, maxX, minZ, maxZ, top, color, bottom });
}

/** Raio contra caixa alinhada aos eixos; devolve a distância ou null. */
export function rayBox(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
): number | null {
  let t0 = 0;
  let t1 = Infinity;
  for (const [o, d, lo, hi] of [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]] as const) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      let a = (lo - o) / d;
      let b = (hi - o) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
  }
  return t0;
}
