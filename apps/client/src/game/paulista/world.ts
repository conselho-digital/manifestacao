import data from "./data.json";

/**
 * Trecho real da Av. Paulista (dados do OpenStreetMap, © contribuidores do OpenStreetMap, ODbL; ver CREDITS.md).
 * O script de extração gira o mapa para a avenida ficar ao longo do eixo X. Aqui: x = leste-oeste do trecho,
 * z = -y (norte para -z, como no resto do jogo). Medidas em metros.
 */

export type Pt = [number, number];
export interface RawBuilding {
  n: string;
  /** Altura em metros (do OSM); null = desconhecida. */
  h: number | null;
  p: Pt[];
}
export interface RawRoad {
  /** 0 = via principal … 4 = pedestre/serviço, 5 = calçadão/ciclovia. */
  c: number;
  n: string;
  p: Pt[];
}
interface Raw {
  boundary: Pt[];
  buildings: RawBuilding[];
  context: RawBuilding[];
  roads: RawRoad[];
  trees: Pt[];
}
const raw = data as unknown as Raw;

const flip = (p: Pt): Pt => [p[0], -p[1]];
/** Limite do mapa (o polígono desenhado). */
export const PAULISTA_BOUNDARY: Pt[] = raw.boundary.map(flip);
/** Prédios dentro do limite: têm colisão. */
export const PAULISTA_BUILDINGS: RawBuilding[] = raw.buildings.map((b) => ({ ...b, p: b.p.map(flip) }));
/** Prédios fora do limite: só cenário, vistos de longe. */
export const PAULISTA_CONTEXT: RawBuilding[] = raw.context.map((b) => ({ ...b, p: b.p.map(flip) }));
export const PAULISTA_ROADS: RawRoad[] = raw.roads.map((r) => ({ ...r, p: r.p.map(flip) }));
export const PAULISTA_TREES: Pt[] = raw.trees.map(flip);

const RADIUS = 0.5;

export function pointInPoly(x: number, z: number, poly: ArrayLike<Pt>): boolean {
  let inside = false;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Ponto mais próximo de (x,z) nas arestas de `poly`. */
export function nearestOnEdges(x: number, z: number, poly: ArrayLike<Pt>): { qx: number; qz: number; d: number } {
  let best = { qx: x, qz: z, d: Infinity };
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2));
    const qx = a[0] + t * dx;
    const qz = a[1] + t * dz;
    const d = Math.hypot(x - qx, z - qz);
    if (d < best.d) best = { qx, qz, d };
  }
  return best;
}

/** Mantém o jogador dentro do limite do mapa (a uma margem da borda). */
export function clampToPaulista(x: number, z: number): { x: number; z: number } {
  const inside = pointInPoly(x, z, PAULISTA_BOUNDARY);
  const n = nearestOnEdges(x, z, PAULISTA_BOUNDARY);
  if (inside && n.d >= RADIUS) return { x, z };
  const dir = inside ? [x - n.qx, z - n.qz] : [n.qx - x, n.qz - z];
  const len = Math.hypot(dir[0]!, dir[1]!);
  if (len < 1e-6) return { x: 0, z: 0 };
  return { x: n.qx + (dir[0]! / len) * RADIUS, z: n.qz + (dir[1]! / len) * RADIUS };
}
