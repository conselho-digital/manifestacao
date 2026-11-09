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

export const COLLIDERS: Box[] = [];
/** Ruas e parques (só para desenhar nos mapas). */
export const ROADS: Rect[] = [];
export const PARKS: Rect[] = [];

export function addBox(minX: number, maxX: number, minZ: number, maxZ: number, top: number, color = '#9a9a9a', bottom = 0): void {
  COLLIDERS.push({ minX, maxX, minZ, maxZ, top, color, bottom });
}
