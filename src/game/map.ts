/** Caixa sólida (colisão, tiro, pouso e escalada). `bottom` > 0 = flutua (dá para passar por baixo). */
export interface Box {
  minX: number; maxX: number; minZ: number; maxZ: number;
  top: number;
  bottom?: number;
  /** cor no minimapa */
  color?: string;
}

export interface Rect { x0: number; x1: number; z0: number; z1: number }

export type MapId = 'paulista' | 'esplanada';
/** Mapas do jogo: Paulista (cidade da Av. Paulista) e Esplanada (Esplanada dos Ministérios e Congresso Nacional). */
export const MAPS: { id: MapId; name: string; desc: string }[] = [
  { id: 'paulista', name: 'Paulista', desc: 'Av. Paulista e o MASP' },
  { id: 'esplanada', name: 'Esplanada', desc: 'Ministérios e Congresso Nacional' },
];
function readMapId(): MapId {
  const q = new URLSearchParams(location.search).get('mapa');
  if (q === 'esplanada' || q === 'paulista') return q;
  try { const v = localStorage.getItem('arena-map'); if (v === 'esplanada') return v; } catch { /* sem armazenamento */ }
  return 'paulista';
}
/** Mapa desta sessão do navegador (escolhido no menu; trocar recarrega a página). */
export const MAP_ID: MapId = readMapId();
export function saveMapChoice(id: MapId): void {
  try { localStorage.setItem('arena-map', id); } catch { /* sem armazenamento */ }
}

/** Quadras e prédios da cidade (metros a partir do centro). */
export const CITY = MAP_ID === 'esplanada' ? { halfX: 162, halfZ: 202 } : { halfX: 110, halfZ: 84 };
/** Largura da rua que contorna a cidade (a Esplanada não tem: o limite é o muro). */
export const RING = MAP_ID === 'esplanada' ? 0 : 12;
/** Cor do chão no minimapa. */
export const MAP_BASE = MAP_ID === 'esplanada' ? '#6c8f4f' : '#b9b3a2';
/** Limites do mapa jogável: a cidade mais a rua em volta (o muro preto fica logo depois). */
export const MAP = { halfX: CITY.halfX + RING, halfZ: CITY.halfZ + RING };

/** Lugares com nome, em ordem de prioridade (o primeiro que contém o ponto vence). */
export const PLACES: { name: string; rect: Rect }[] = [];

/** Nome do lugar onde o jogador está (mostrado no topo do HUD). */
export function placeName(x: number, z: number): string {
  for (const p of PLACES) {
    const r = p.rect;
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return p.name;
  }
  if (MAP_ID === 'esplanada') return 'ESPLANADA DOS MINISTÉRIOS';
  return z >= 0 ? 'QUARTEIRÃO NORTE' : 'QUARTEIRÃO SUL';
}

/** Altura do chão em (x, z): 0 em todo lugar, menos onde o mapa tem um terreno rebaixado (Esplanada: a área do Congresso). */
export let terrainHeight: (x: number, z: number) => number = () => 0;
/** Profundidade da água (m) sobre o chão em (x, z): 0 fora de lagos (Esplanada: os lagos em frente ao Congresso são rasos e dá para andar dentro). */
export let waterDepth: (x: number, z: number) => number = () => 0;
export function setWaterDepth(f: (x: number, z: number) => number): void { waterDepth = f; }
export function setTerrainHeight(f: (x: number, z: number) => number): void { terrainHeight = f; }

export const COLLIDERS: Box[] = [];
/** Copas das árvores (esferas), só para a câmera não entrar nelas. */
export const TREES: { x: number; y: number; z: number; r: number }[] = [];
/** Ruas e parques (só para desenhar nos mapas). */
export const ROADS: Rect[] = [];
export const PARKS: Rect[] = [];

export function addBox(minX: number, maxX: number, minZ: number, maxZ: number, top: number, color = '#9a9a9a', bottom = 0): void {
  COLLIDERS.push({ minX, maxX, minZ, maxZ, top, color, bottom });
}

/** Ponto de partida: Paulista = na frente do MASP; Esplanada = no gramado central, de frente para o Congresso. */
export function spawnPoint(): [number, number] {
  if (MAP_ID !== 'esplanada') return museumSpawn();
  for (let i = 0; i < 60; i++) {
    const x = (Math.random() - 0.5) * 50;
    const z = -82 + Math.random() * 38; // no gramado grande, entre as duas ruas transversais
    const blocked = COLLIDERS.some((b) => b.top > 0.3 && x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1);
    if (!blocked) return [x, z];
  }
  return [0, -110];
}

/** Ponto aleatório na frente do MASP (entre a avenida e o prédio), longe de qualquer obstáculo. O personagem nasce de frente para o museu. */
export function museumSpawn(): [number, number] {
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 46; // o MASP vai de x = -4 a 50
    const z = 16.5 + Math.random() * 6.5; // calçada e calçadão, antes do prédio (z ≈ 24,6)
    const blocked = COLLIDERS.some((b) => b.top > 0.3 && (b.bottom ?? 0) < 1.8 && x > b.minX - 0.9 && x < b.maxX + 0.9 && z > b.minZ - 0.9 && z < b.maxZ + 0.9);
    if (!blocked) return [x, z];
  }
  return [23, 18];
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
