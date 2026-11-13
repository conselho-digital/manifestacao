import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addBox, COLLIDERS, PARKS, PLACES, ROADS, setTerrainHeight, setWaterDepth, TREES, type Rect } from './map';
import { FAR_TREES, registerCullChildren } from './culling';
import { HEIGHT, makeTrees, type Species, type TreeSpec } from './trees';

// Mapa "Esplanada": Esplanada dos Ministérios e Congresso Nacional (fotos de referência do usuário: vista aérea e maquete).
// Eixo no sentido norte (+z): o Congresso fica no fim do eixo, de frente para o sul. Duas avenidas (Eixo Monumental) ladeiam o gramado
// central e, fora delas, as duas fileiras de ministérios. Sem carros: só aparecem os chamados na Garagem.

const IX = 150; // meio-largura da área interna (m); em volta dela há a rua perimetral de 10 m e 2 m de grama até o muro
const IZ = 190; // meio-comprimento da área interna
const HX = 162; // meio-largura do mapa (até o muro)
const HZ = 202; // meio-comprimento do mapa
const RING_W = 10; // largura da rua perimetral
const AV_L: Rect = { x0: -85, x1: -55, z0: -175, z1: IZ }; // avenida oeste (3 faixas para cada lado)
const AV_R: Rect = { x0: 55, x1: 85, z0: -175, z1: IZ };
const PERIM_S: Rect = { x0: -IX - RING_W, x1: IX + RING_W, z0: -IZ, z1: -175 }; // rua do fim sul, liga as duas avenidas
const CROSS: Rect[] = [
  { x0: -55, x1: 55, z0: -105, z1: -90 }, // 1ª transversal (cruza o gramado)
  { x0: -55, x1: 55, z0: -35, z1: -20 }, // 2ª transversal
];
// ruas que saem das avenidas entre os ministérios (alinhadas com a 1ª transversal)
const OUTER: Rect[] = [{ x0: -IX, x1: -85, z0: -105, z1: -90 }, { x0: 85, x1: IX, z0: -105, z1: -90 }];
// rua perimetral: leste, oeste e norte (o sul é a PERIM_S); liga as ruas que antes acabavam no muro
const RING_E: Rect = { x0: IX, x1: IX + RING_W, z0: -IZ, z1: IZ };
const RING_W_: Rect = { x0: -IX - RING_W, x1: -IX, z0: -IZ, z1: IZ };
const RING_N: Rect = { x0: -IX, x1: IX, z0: IZ, z1: IZ + RING_W };
// estacionamentos: margens, e dois estreitos ao lado das torres do Congresso
const lots: Rect[] = [
  { x0: 104, x1: 146, z0: -34, z1: -12 }, { x0: 102, x1: 118, z0: 100, z1: 136 },
  { x0: 25.3, x1: 42, z0: 141.2, z1: 188 }, { x0: -42, x1: -25.3, z0: 141.2, z1: 188 }, // atrás do Congresso (como na foto aérea)
];
const CONG_FRONT = 70; // z da frente do Congresso
const CONG_SCALE = 2; // o modelo do usuário tem ~44 unidades de comprimento: vira ~89 m (20% menor que os 111 m de antes)

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function noiseFill(g: CanvasRenderingContext2D, w: number, h: number, base: [number, number, number], spread: number, rnd: () => number, n: number): void {
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const d = (rnd() - 0.5) * spread;
    g.fillStyle = `rgba(${Math.max(0, base[0] + d)},${Math.max(0, base[1] + d)},${Math.max(0, base[2] + d * 0.7)},.55)`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2.5, 1 + rnd() * 2.5);
  }
}

function makeTextures(): Record<string, THREE.CanvasTexture> {
  const r = rng(11);
  const grass = canvasTex(128, 128, (g) => noiseFill(g, 128, 128, [118, 150, 78], 34, r, 900));
  const lawn = canvasTex(128, 128, (g) => noiseFill(g, 128, 128, [136, 163, 84], 26, r, 700));
  const concrete = canvasTex(128, 128, (g) => {
    noiseFill(g, 128, 128, [206, 201, 188], 16, r, 500);
    g.strokeStyle = 'rgba(140,135,122,.45)';
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, 127, 127);
  });
  // avenida: duas pistas de 3 faixas, linha dupla amarela no meio, faixas tracejadas, bordas contínuas; o ladrilho tem 12 m de comprimento
  const avenue = canvasTex(128, 128, (g) => {
    noiseFill(g, 128, 128, [66, 69, 74], 14, r, 700);
    g.fillStyle = '#e9c84a';
    g.fillRect(62, 0, 2, 128);
    g.fillRect(66, 0, 2, 128);
    g.fillStyle = '#e8e8e8';
    for (const u of [21, 43, 85, 107]) g.fillRect(u - 1, 0, 2, 38); // tracejado: 3 m de pintura a cada 12 m
    g.fillRect(4, 0, 2, 128);
    g.fillRect(122, 0, 2, 128);
  });
  const street = canvasTex(128, 128, (g) => {
    noiseFill(g, 128, 128, [66, 69, 74], 14, r, 700);
    g.fillStyle = '#e8e8e8';
    g.fillRect(63, 0, 2, 50);
    g.fillRect(4, 0, 2, 128);
    g.fillRect(122, 0, 2, 128);
  });
  // estacionamento: ladrilho de 21 m; vagas de 2,6 x 5 m em duas fileiras com corredor no meio
  const lot = canvasTex(128, 128, (g) => {
    noiseFill(g, 128, 128, [96, 98, 102], 12, r, 500);
    g.fillStyle = 'rgba(235,235,235,.85)';
    for (let x = 0; x <= 128; x += 16) { g.fillRect(x, 6, 2, 30); g.fillRect(x, 92, 2, 30); }
    g.fillRect(0, 6, 128, 2);
    g.fillRect(0, 120, 128, 2);
  });
  // estacionamento organizado: a largura do lote vira u (0..1): vaga (30%) + corredor (40%) + vaga (30%); v = 5,2 m (2 vagas de 2,6 m)
  const lotBays = canvasTex(128, 64, (g) => {
    noiseFill(g, 128, 64, [88, 90, 95], 12, r, 400);
    g.fillStyle = 'rgba(238,238,238,.92)';
    for (const [x0, x1] of [[0, 38], [90, 128]] as const) {
      for (const y of [0, 32]) g.fillRect(x0, y, x1 - x0, 2);
    }
    g.fillRect(38, 0, 2, 64); // limite do fundo da vaga, lado esquerdo
    g.fillRect(88, 0, 2, 64);
    g.fillRect(0, 0, 2, 64);
    g.fillRect(126, 0, 2, 64);
  });
  // telhado de galpão com nervuras (ladrilho de 8 m, nervuras a cada 1 m)
  const rib = canvasTex(64, 64, (g) => {
    g.fillStyle = '#c4c5c0';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(90,92,90,.35)';
    for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 2, 64);
  });
  // fachadas: o ladrilho cobre 16 m de largura x 8 m de altura (2 andares)
  const ministry = canvasTex(256, 256, (g) => {
    g.fillStyle = '#e5e1d6';
    g.fillRect(0, 0, 256, 256);
    for (let f = 0; f < 2; f++) {
      const y = f * 128;
      g.fillStyle = '#56697b'; // faixa de vidro
      g.fillRect(0, y + 30, 256, 62);
      g.fillStyle = 'rgba(255,255,255,.22)';
      for (let x = 0; x < 256; x += 32) g.fillRect(x, y + 30, 2, 62);
      g.fillStyle = 'rgba(255,255,255,.16)';
      g.fillRect(0, y + 30, 256, 6);
      g.fillStyle = '#c6c1b3'; // laje
      g.fillRect(0, y + 96, 256, 8);
    }
    g.fillStyle = '#d4cfc2';
    for (let x = 0; x < 256; x += 128) g.fillRect(x, 0, 6, 256); // pilares
  });
  const warehouse = canvasTex(256, 256, (g) => {
    g.fillStyle = '#d8cda0';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(120,108,70,.25)';
    for (let x = 0; x < 256; x += 8) g.fillRect(x, 0, 3, 256);
    g.fillStyle = '#4c5f70';
    g.fillRect(0, 150, 256, 44);
  });
  const plain = canvasTex(256, 256, (g) => {
    g.fillStyle = '#d9d3c6';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#5d7083';
    for (let y = 24; y < 256; y += 128) for (let x = 14; x < 256; x += 64) g.fillRect(x, y, 36, 64);
    g.fillStyle = 'rgba(0,0,0,.08)';
    g.fillRect(0, 126, 256, 4);
    g.fillRect(0, 254, 256, 2);
  });
  const palace = canvasTex(256, 256, (g) => {
    g.fillStyle = '#f0eee6';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#35495a';
    for (let x = 12; x < 256; x += 64) g.fillRect(x, 20, 40, 216);
  });
  const asphalt = canvasTex(128, 128, (g) => noiseFill(g, 128, 128, [78, 80, 85], 14, r, 700));
  const stripes = canvasTex(64, 8, (g) => { // cancela: listras vermelhas e brancas (1 m = 4 listras)
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#f2f2f2' : '#d22a2a'; g.fillRect(i * 16, 0, 16, 8); }
  });
  return { grass, lawn, concrete, avenue, street, lot, lotBays, rib, asphalt, stripes, ministry, warehouse, plain, palace };
}

interface Bld { x0: number; x1: number; z0: number; z1: number; h: number; tex: 'ministry' | 'warehouse' | 'plain' | 'palace'; core?: boolean; roof?: 'rib' | 'gable' }

/** Paredes de uma caixa (sem topo e sem base), com UV em metros para a fachada ladrilhar (tw x th m). */
function boxWalls(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, tw: number, th: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const pos = g.attributes.position!;
  const nor = g.attributes.normal!;
  const keep: number[] = [];
  const uv: number[] = [];
  const P: number[] = [];
  const N: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(nor.getY(i)) > 0.5) continue;
    keep.push(i);
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const u = Math.abs(nor.getX(i)) > 0.5 ? z / tw : x / tw;
    uv.push(u, y / th);
    P.push(x, y, z);
    N.push(nor.getX(i), nor.getY(i), nor.getZ(i));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

function flatGeom(x0: number, x1: number, z0: number, z1: number, y: number, tile: number, mode: 'xz' | 'road-z' | 'road-x' = 'xz'): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const pos = g.attributes.position!;
  const uv = g.attributes.uv!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (mode === 'road-z') uv.setXY(i, (x - x0) / (x1 - x0), (z - z0) / tile);
    else if (mode === 'road-x') uv.setXY(i, (z - z0) / (z1 - z0), (x - x0) / tile);
    else uv.setXY(i, x / tile, z / tile);
  }
  return g;
}

// ---- terreno rebaixado em volta do Congresso (a laje fica com o teto na altura das avenidas) ----
const PIT_D = 4.6; // profundidade: o teto da laje tem 4,6 m
const PIT_X = 52; // começa na calçada interna das avenidas (|x| = 52)
const PIT_XB = 45; // talude lateral: do |x| 52 ao 45 (7 m) chega ao fundo
const PIT_Z0 = 3; // rampa do sul: z 3 → 28 (25 m)
const PIT_Z1 = 28;
const PIT_Z2 = 160; // fundo: z 28 → 160 (passa pelas torres de trás); a rampa de subida só começa depois delas: z 160 → 188 (28 m)
const PIT_Z3 = 188;
const smooth = (t: number): number => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
// lagos rasos em frente ao Congresso (x, z em metros; quem olha para o Congresso vê +x à ESQUERDA, então o x da foto está invertido)
const LAKE_POLYS: [number, number][][] = [
  [[39.8, 90.4], [29.8, 90.4], [29.8, 62.6], [39.8, 62.6]],
  [[25.5, 90.4], [21.4, 90.4], [19.2, 86.3], [17.3, 81.9], [15.5, 76.2], [13.6, 71.8], [25.5, 71.3]],
  [[6.1, 71.1], [-26.7, 71.1], [-26.7, 90.1], [-21.1, 90.1], [-17.8, 86.3], [-13.1, 82.8], [-4.7, 79.7], [1.9, 77.5], [5.6, 73.7]],
  [[-30.9, 90.4], [-41.1, 90.4], [-41.1, 62.6], [-30.9, 62.6]],
  [[25.5, 61.2], [-26.7, 61.2], [-26.7, 54.6], [-17.8, 56.9], [-12.2, 57.4], [-8.4, 55.1], [-5.6, 49.9], [-2.8, 48.5], [4.7, 49.0], [12.2, 49.9], [18.8, 53.2], [25.5, 54.6]],
];
const WATER_Y = -PIT_D - 0.25; // superfície da água: 25 cm abaixo da margem
const LAKE_DEPTH = 0.5; // profundidade máxima (m) abaixo da superfície: dá para andar dentro
const LAKE_IN = 3; // caimento de dentro (da borda da água ao fundo)
const LAKE_OUT = 1.3; // caimento de fora (da margem à borda da água)
// faixas onde o chão fica seco, na altura da margem: as duas ruas, a rua e a calçada do fim da rampa (passam por cima da água, como pontes)
const DRY: Rect[] = [{ x0: -31, x1: -26, z0: 40, z1: 95 }, { x0: 26, x1: 31, z0: 40, z1: 95 }, { x0: -26, x1: 26, z0: 61.2, z1: 71.5 }];
function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz));
}
/** Distância assinada até a borda de um lago (positiva dentro). */
function lakeSigned(pts: [number, number][], x: number, z: number): number {
  let d = Infinity;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]!;
    const [xj, zj] = pts[j]!;
    d = Math.min(d, segDist(x, z, xi, zi, xj, zj));
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside ? d : -d;
}
const LAKE_BOX = { x0: -43, x1: 42.5, z0: 46, z1: 93 };
/** Quanto o chão afunda por causa dos lagos em (x, z): 0 fora, -0,25 na borda da água, até -0,75 no fundo. */
function lakeOffset(x: number, z: number): number {
  if (x < LAKE_BOX.x0 || x > LAKE_BOX.x1 || z < LAKE_BOX.z0 || z > LAKE_BOX.z1) return 0;
  let best = 0;
  for (const pts of LAKE_POLYS) {
    const sd = lakeSigned(pts, x, z);
    let o = 0;
    if (sd > 0) o = -0.25 - LAKE_DEPTH * smooth(sd / LAKE_IN);
    else if (sd > -LAKE_OUT) o = -0.25 * smooth((sd + LAKE_OUT) / LAKE_OUT);
    best = Math.min(best, o);
  }
  if (best === 0) return 0;
  let dry = 1;
  for (const r of DRY) {
    const d = Math.hypot(Math.max(0, r.x0 - x, x - r.x1), Math.max(0, r.z0 - z, z - r.z1));
    dry = Math.min(dry, smooth(d / 0.8));
  }
  return best * dry;
}
// plataforma do estacionamento do lado direito, atrás do Congresso: fica na altura das avenidas (y = 0); a borda sul e a leste são taludes curtos
const PLAT = { x1: -21.8, z0: 141.2, band: 2.5 };
export function pitHeight(x: number, z: number): number {
  const ax = Math.abs(x);
  if (ax >= PIT_X || z <= PIT_Z0 || z >= PIT_Z3) return 0;
  const lake = lakeOffset(x, z);
  const base = -PIT_D * smooth((PIT_X - ax) / (PIT_X - PIT_XB)) * smooth((z - PIT_Z0) / (PIT_Z1 - PIT_Z0)) * smooth((PIT_Z3 - z) / (PIT_Z3 - PIT_Z2));
  {
    const d = Math.hypot(Math.max(0, -PLAT.x1 - ax), Math.max(0, PLAT.z0 - z)); // os dois estacionamentos de trás ficam em plataformas (simétricas)
    if (d < PLAT.band) return base * smooth(d / PLAT.band) + lake;
  }
  return base + lake;
}
const CELL = 1.25; // lado da malha fina do terreno (m): os caimentos dos lagos têm 1,3 e 3 m
const PIT_REGION = { x0: -53, x1: 53, z0: 2, z1: 189 };

/** Divide cada triângulo em 4, k vezes (o mesmo k para todos: sem rachaduras entre vizinhos da mesma peça). */
function subdivide(g: THREE.BufferGeometry, k: number): THREE.BufferGeometry {
  let pos = Array.from((g.attributes.position as THREE.BufferAttribute).array);
  let uv = g.attributes.uv ? Array.from((g.attributes.uv as THREE.BufferAttribute).array) : null;
  for (let it = 0; it < k; it++) {
    const np: number[] = [];
    const nu: number[] | null = uv ? [] : null;
    for (let t = 0; t < pos.length / 9; t++) {
      const P = [0, 1, 2].map((i) => [pos[t * 9 + i * 3]!, pos[t * 9 + i * 3 + 1]!, pos[t * 9 + i * 3 + 2]!]);
      const U = uv ? [0, 1, 2].map((i) => [uv![t * 6 + i * 2]!, uv![t * 6 + i * 2 + 1]!]) : null;
      const mid = (a: number[], b: number[]): number[] => a.map((v, i) => (v + b[i]!) / 2);
      const pm = [mid(P[0]!, P[1]!), mid(P[1]!, P[2]!), mid(P[2]!, P[0]!)];
      const um = U ? [mid(U[0]!, U[1]!), mid(U[1]!, U[2]!), mid(U[2]!, U[0]!)] : null;
      // vértices dos 4 triângulos filhos: cantos 0,1,2 e meios m0 (0-1), m1 (1-2), m2 (2-0)
      const V = [P[0]!, P[1]!, P[2]!, pm[0]!, pm[1]!, pm[2]!];
      const W = U ? [U[0]!, U[1]!, U[2]!, um![0]!, um![1]!, um![2]!] : null;
      for (const idx of [[0, 3, 5], [3, 1, 4], [5, 4, 2], [3, 4, 5]]) {
        for (const i of idx) { np.push(...V[i]!); if (nu && W) nu.push(...W[i]!); }
      }
    }
    pos = np;
    if (uv && nu) uv = nu;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

/** Aplica o terreno (altura e normal) a uma geometria sem índice. */
function applyTerrain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, pos.getY(i) + pitHeight(x, z));
    const e = 0.4;
    const hx = (pitHeight(x + e, z) - pitHeight(x - e, z)) / (2 * e);
    const hz = (pitHeight(x, z + e) - pitHeight(x, z - e)) / (2 * e);
    const l = Math.hypot(hx, 1, hz);
    nor[i * 3] = -hx / l;
    nor[i * 3 + 1] = 1 / l;
    nor[i * 3 + 2] = -hz / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

/** Prepara uma peça de chão: se toca a área rebaixada, é cortada em retângulos (o do meio com malha fina) ou subdividida e recebe o terreno. */
function terrainPieces(src: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const g0 = src.index ? src.toNonIndexed() : src;
  g0.computeBoundingBox();
  const bb = g0.boundingBox!;
  const R = PIT_REGION;
  if (bb.max.x <= R.x0 || bb.min.x >= R.x1 || bb.max.z <= R.z0 || bb.min.z >= R.z1) return [g0];
  const pos = g0.attributes.position as THREE.BufferAttribute;
  const uvA = g0.attributes.uv as THREE.BufferAttribute | undefined;
  // retângulo alinhado aos eixos com uv afim (quase todo o chão): corta na área rebaixada
  let rect = false;
  if (uvA && pos.count === 6 && Math.abs(bb.max.y - bb.min.y) < 1e-6) {
    const xs = new Set<number>();
    const zs = new Set<number>();
    for (let i = 0; i < 6; i++) { xs.add(Math.round(pos.getX(i) * 1000)); zs.add(Math.round(pos.getZ(i) * 1000)); }
    rect = xs.size === 2 && zs.size === 2;
  }
  if (rect && uvA) {
    const at = (x: number, z: number): [number, number] => {
      let a = -1, b = -1, c = -1;
      for (let i = 0; i < 6; i++) {
        const px = pos.getX(i);
        const pz = pos.getZ(i);
        if (Math.abs(px - bb.min.x) < 1e-4 && Math.abs(pz - bb.min.z) < 1e-4) a = i;
        if (Math.abs(px - bb.max.x) < 1e-4 && Math.abs(pz - bb.min.z) < 1e-4) b = i;
        if (Math.abs(px - bb.min.x) < 1e-4 && Math.abs(pz - bb.max.z) < 1e-4) c = i;
      }
      const tx = (x - bb.min.x) / (bb.max.x - bb.min.x);
      const tz = (z - bb.min.z) / (bb.max.z - bb.min.z);
      return [uvA.getX(a) + (uvA.getX(b) - uvA.getX(a)) * tx + (uvA.getX(c) - uvA.getX(a)) * tz, uvA.getY(a) + (uvA.getY(b) - uvA.getY(a)) * tx + (uvA.getY(c) - uvA.getY(a)) * tz];
    };
    const y = bb.min.y;
    const piece = (x0: number, x1: number, z0: number, z1: number, fine: boolean, cell = CELL): THREE.BufferGeometry | null => {
      if (x1 - x0 < 1e-4 || z1 - z0 < 1e-4) return null;
      const sx = fine ? Math.max(1, Math.ceil((x1 - x0) / cell)) : 1;
      const sz = fine ? Math.max(1, Math.ceil((z1 - z0) / cell)) : 1;
      const p = new THREE.PlaneGeometry(x1 - x0, z1 - z0, sx, sz);
      p.rotateX(-Math.PI / 2);
      p.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
      const pp = p.attributes.position as THREE.BufferAttribute;
      const uu = p.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < pp.count; i++) { const [u, v] = at(pp.getX(i), pp.getZ(i)); uu.setXY(i, u, v); }
      const ng = p.toNonIndexed();
      return fine ? applyTerrain(ng) : ng;
    };
    const cx0 = Math.max(bb.min.x, R.x0);
    const cx1 = Math.min(bb.max.x, R.x1);
    const cz0 = Math.max(bb.min.z, R.z0);
    const cz1 = Math.min(bb.max.z, R.z1);
    // malha fina (1,25 m) só na faixa dos lagos; no resto do rebaixo 3 m bastam (curvas suaves de 7 a 28 m)
    const LB0 = Math.max(cz0, 44);
    const LB1 = Math.min(cz1, 95);
    const center = LB1 > LB0 ? [piece(cx0, cx1, cz0, LB0, true, 3), piece(cx0, cx1, LB0, LB1, true, CELL), piece(cx0, cx1, LB1, cz1, true, 3)] : [piece(cx0, cx1, cz0, cz1, true, 3)];
    const out = [...center, piece(bb.min.x, cx0, bb.min.z, bb.max.z, false), piece(cx1, bb.max.x, bb.min.z, bb.max.z, false), piece(cx0, cx1, bb.min.z, cz0, false), piece(cx0, cx1, cz1, bb.max.z, false)];
    return out.filter((o): o is THREE.BufferGeometry => !!o).map((o) => { if (!o.attributes.normal) o.computeVertexNormals(); return o; });
  }
  // polígono qualquer: subdivide até as arestas ficarem com ~1,25 m
  let maxE = 0;
  for (let t = 0; t < pos.count / 3; t++) for (let e = 0; e < 3; e++) {
    const a = t * 3 + e;
    const b = t * 3 + ((e + 1) % 3);
    maxE = Math.max(maxE, Math.hypot(pos.getX(a) - pos.getX(b), pos.getZ(a) - pos.getZ(b)));
  }
  const k = Math.min(6, Math.max(0, Math.ceil(Math.log2(maxE / CELL))));
  return [applyTerrain(subdivide(g0, k))];
}

export function createEsplanada(): THREE.Group {
  setTerrainHeight(pitHeight);
  setWaterDepth((x, z) => (x < LAKE_BOX.x0 || x > LAKE_BOX.x1 || z < LAKE_BOX.z0 || z > LAKE_BOX.z1 ? 0 : Math.max(0, WATER_Y - pitHeight(x, z))));
  const city = new THREE.Group();
  COLLIDERS.length = 0;
  ROADS.length = 0;
  PARKS.length = 0;
  PLACES.length = 0;
  TREES.length = 0;
  const T = makeTextures();
  const rnd = rng(2024);

  const std = (map: THREE.Texture, color = 0xffffff, rough = 0.95): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: 0 });
  const mats = {
    grass: std(T.grass!),
    lawn: std(T.lawn!),
    concrete: std(T.concrete!),
    avenue: std(T.avenue!, 0xffffff, 0.9),
    street: std(T.street!, 0xffffff, 0.9),
    lot: std(T.lot!, 0xffffff, 0.9),
    lotBays: std(T.lotBays!, 0xffffff, 0.9),
    water: new THREE.MeshStandardMaterial({ color: 0x6fa3a8, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    asp: std(T.asphalt!, 0xffffff, 0.9),
    streetBr: ((): THREE.MeshStandardMaterial => { const m = std(T.street!, 0xffffff, 0.9); m.polygonOffset = true; m.polygonOffsetFactor = -4; m.polygonOffsetUnits = -4; return m; })(),
    pave: new THREE.MeshStandardMaterial({ color: 0xdcdcd6, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    terra: new THREE.MeshStandardMaterial({ color: 0xa65a3c, roughness: 0.95 }),
    ribRoof: std(T.rib!),
    gable: new THREE.MeshStandardMaterial({ color: 0x9a968c, roughness: 0.9 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xb8b2a4, roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xc7c3b9, roughness: 0.9 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x3a3d3a, roughness: 1 }),
  };
  // ordem das camadas vista de longe (a profundidade perde precisão em 500 m e a grama aparecia por cima das ruas): ruas > calçadas > gramado
  for (const m of [mats.avenue, mats.street, mats.lot, mats.lotBays, mats.asp]) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; }
  mats.concrete.polygonOffset = true; mats.concrete.polygonOffsetFactor = -1; mats.concrete.polygonOffsetUnits = -1;
  const flats = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const addFlat = (m: THREE.Material, g: THREE.BufferGeometry): void => { (flats.get(m) ?? flats.set(m, []).get(m)!).push(g); };

  // ---- chão: gramado de ponta a ponta; por cima, calçadas, ruas e gramados mais claros (camadas em y diferentes) ----
  addFlat(mats.grass, flatGeom(-HX, HX, -HZ, HZ, 0, 12));
  const lawns: Rect[] = [
    { x0: -52, x1: 52, z0: -172, z1: -108 }, // gramado sul (com caminhos em diagonal)
    { x0: -52, x1: 52, z0: -88, z1: -37 }, // gramado grande do meio
    { x0: -52, x1: 52, z0: -18, z1: 65 }, // gramado central, até a calçada do fim da rampa
  ];
  for (const r of lawns) { addFlat(mats.lawn, flatGeom(r.x0, r.x1, r.z0, r.z1, 0.015, 12)); PARKS.push(r); }
  // faixas de gramado ao lado das avenidas (lado de fora)
  for (const r of [{ x0: -97, x1: -88, z0: -172, z1: 188 }, { x0: 88, x1: 97, z0: -172, z1: 188 }, { x0: 97, x1: IX - 4, z0: -90, z1: -36 }]) { addFlat(mats.lawn, flatGeom(r.x0, r.x1, r.z0, r.z1, 0.015, 12)); PARKS.push(r); }
  // ladrilho dos ministérios: o pátio (concreto) das duas margens
  for (const r of [{ x0: -IX, x1: -97, z0: -175, z1: IZ }, { x0: 97, x1: IX, z0: -175, z1: IZ }]) addFlat(mats.lawn, flatGeom(r.x0, r.x1, r.z0, r.z1, 0.015, 12)); // margens: gramado, com pátio de concreto em volta de cada prédio
  // calçadas ao longo das avenidas (3 m) e em volta dos gramados (caminhos de 3 m)
  const walk: Rect[] = [
    { x0: -88, x1: -85, z0: -175, z1: IZ }, { x0: -55, x1: -52, z0: -175, z1: IZ },
    { x0: 55, x1: 58, z0: -175, z1: IZ }, { x0: 85, x1: 88, z0: -175, z1: IZ },
    // caminhos laterais do gramado central e do gramado do meio
        { x0: -52, x1: 52, z0: -175, z1: -172 }, { x0: -52, x1: 52, z0: -108, z1: -105 },
    { x0: -52, x1: 52, z0: -90, z1: -88 }, { x0: -52, x1: 52, z0: -37, z1: -35 },
    { x0: 88, x1: 104, z0: -62, z1: -59 }, { x0: 112, x1: 124, z0: -90, z1: -80 }, // caminho até o palácio e rampa de entrada
  ];
  for (const r of walk) addFlat(mats.concrete, flatGeom(r.x0, r.x1, r.z0, r.z1, 0.035, 4));
  // caminhos em diagonal no gramado sul (como na foto de referência)
  const diag = (ax: number, az: number, bx: number, bz: number, w: number): void => {
    const len = Math.hypot(bx - ax, bz - az);
    const g = new THREE.PlaneGeometry(len, w);
    g.rotateX(-Math.PI / 2);
    g.rotateY(-Math.atan2(bz - az, bx - ax));
    g.translate((ax + bx) / 2, 0.04, (az + bz) / 2);
    const uv = g.attributes.uv!;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 4, uv.getY(i) * w / 4);
    addFlat(mats.concrete, g);
  };
  diag(-50, -170, 0, -140, 3);
  diag(50, -170, 0, -140, 3);
  diag(-50, -110, 0, -140, 3);
  diag(50, -110, 0, -140, 3);
  // água em frente ao Congresso, no formato da foto de satélite (x, z em metros; quem olha para o Congresso (norte, +z) vê +x à ESQUERDA, então x da foto está invertido): dois retângulos fora das ruas, uma peça de cada lado da
  // rampa (borda curva) e um lago ondulado logo abaixo da calçada; as ruas e a calçada ficam POR CIMA
  const stoneRing = (pts: [number, number][], grow: number, y: number): THREE.BufferGeometry => {
    // reamostra o contorno a cada ~1,2 m e liga cada ponto ao mesmo ponto deslocado para fora (grow m)
    let area = 0;
    pts.forEach(([x, z], i) => { const [x2, z2] = pts[(i + 1) % pts.length]!; area += x * z2 - x2 * z; });
    const sg = area > 0 ? 1 : -1;
    const rs: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i]!;
      const [bx, bz] = pts[(i + 1) % pts.length]!;
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 1.2));
      for (let k = 0; k < n; k++) rs.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    const out: [number, number][] = rs.map(([x, z], i) => {
      const [px, pz] = rs[(i + rs.length - 1) % rs.length]!;
      const [nx, nz] = rs[(i + 1) % rs.length]!;
      const ox = sg * (nz - pz);
      const oz = sg * -(nx - px);
      const l = Math.hypot(ox, oz) || 1;
      return [x + (ox / l) * grow, z + (oz / l) * grow];
    });
    const pos: number[] = [];
    for (let i = 0; i < rs.length; i++) {
      const j = (i + 1) % rs.length;
      const a = rs[i]!;
      const b = rs[j]!;
      const c = out[i]!;
      const d = out[j]!;
      // as faces precisam apontar para cima: o sentido do contorno muda de um lago para o outro
      const up = (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]);
      const tri = up < 0 ? [a, c, b, b, c, d] : [a, b, c, b, d, c];
      for (const [x, z] of tri as [number, number][]) pos.push(x, y, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  };
  const polyGeom = (pts: [number, number][], y: number, grow: number): THREE.BufferGeometry => {
    // margem de pedra = o mesmo contorno deslocado para fora (grow metros, pela média das normais dos dois lados de cada ponto)
    let area = 0;
    pts.forEach(([x, z], i) => { const [x2, z2] = pts[(i + 1) % pts.length]!; area += x * z2 - x2 * z; });
    const sg = area > 0 ? 1 : -1;
    const q = pts.map(([x, z], i) => {
      const [px, pz] = pts[(i + pts.length - 1) % pts.length]!;
      const [nx, nz] = pts[(i + 1) % pts.length]!;
      const e1 = Math.hypot(x - px, z - pz) || 1;
      const e2 = Math.hypot(nx - x, nz - z) || 1;
      const ox = sg * ((z - pz) / e1 + (nz - z) / e2);
      const oz = sg * (-(x - px) / e1 - (nx - x) / e2);
      const l = Math.hypot(ox, oz) || 1;
      return new THREE.Vector2(x + (ox / l) * grow, -(z + (oz / l) * grow));
    });
    const g = new THREE.ShapeGeometry(new THREE.Shape(q));
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    return g;
  };
  for (const pts of LAKE_POLYS) {
    city.add(new THREE.Mesh(applyTerrain(stoneRing(pts, 0.9, 0.045)), mats.stone)); // margem de pedra: só o anel (antes era o polígono inteiro, 54 mil triângulos)
    // a água é uma superfície plana, num nível absoluto (não segue o terreno): o chão do lago fica abaixo dela
    const wg = polyGeom(pts, WATER_Y, 0);
    const water = new THREE.Mesh(wg, mats.water);
    water.receiveShadow = true;
    city.add(water);
    const xs = pts.map((v) => v[0]);
    const zs = pts.map((v) => v[1]);
    PARKS.push({ x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) });
  }
  // rua de asfalto entre as duas ruas, colada na calçada (onde antes havia grama), como na foto
  addFlat(mats.street, flatGeom(-26, 26, 61.6, 65, 0.05, 12, 'road-x'));
  ROADS.push({ x0: -26, x1: 26, z0: 61.6, z1: 65 });
  // calçada cinza-clara no fim da rampa, ligando as duas ruas
  addFlat(mats.pave, flatGeom(-26, 26, 65, 71, 0.1, 4));
  // duas ruas, mais juntas, que descem da fachada; sobre o lago (z > 49) ficam acima da água
  for (const r of [{ x0: -31, x1: -26, z0: -90, z1: 92 }, { x0: 26, x1: 31, z0: -90, z1: 92 }]) {
    // dois trechos: não cobre o cruzamento com a rua transversal (evita pintura sobreposta)
    addFlat(mats.street, flatGeom(r.x0, r.x1, r.z0, CROSS[1]!.z0, 0.05, 12, 'road-z'));
    addFlat(mats.street, flatGeom(r.x0, r.x1, CROSS[1]!.z1, 49, 0.05, 12, 'road-z'));
    addFlat(mats.streetBr, flatGeom(r.x0, r.x1, 49, r.z1, 0.1, 12, 'road-z'));
    ROADS.push(r);
  }
  // ruas: asfalto com as faixas pintadas na textura
  for (const r of [AV_L, AV_R]) { addFlat(mats.avenue, flatGeom(r.x0, r.x1, r.z0, r.z1, 0.05, 12, 'road-z')); ROADS.push(r); }
  addFlat(mats.street, flatGeom(PERIM_S.x0, PERIM_S.x1, PERIM_S.z0, PERIM_S.z1, 0.05, 12, 'road-x'));
  ROADS.push(PERIM_S);
  // rua perimetral em volta da cidade (liga as ruas que antes acabavam no muro)
  addFlat(mats.street, flatGeom(RING_E.x0, RING_E.x1, RING_E.z0, RING_E.z1, 0.05, 12, 'road-z'));
  addFlat(mats.street, flatGeom(RING_W_.x0, RING_W_.x1, RING_W_.z0, RING_W_.z1, 0.05, 12, 'road-z'));
  addFlat(mats.street, flatGeom(RING_N.x0, RING_N.x1, RING_N.z0, RING_N.z1, 0.05, 12, 'road-x'));
  for (const sx of [-1, 1]) addFlat(mats.asp, flatGeom(sx > 0 ? IX : -IX - RING_W, sx > 0 ? IX + RING_W : -IX, IZ, IZ + RING_W, 0.05, 12)); // cantos
  ROADS.push(RING_E, RING_W_, RING_N, { x0: -IX - RING_W, x1: -IX, z0: IZ, z1: IZ + RING_W }, { x0: IX, x1: IX + RING_W, z0: IZ, z1: IZ + RING_W });
  for (const r of [...CROSS, ...OUTER]) { addFlat(mats.street, flatGeom(r.x0, r.x1, r.z0, r.z1, 0.05, 12, 'road-x')); ROADS.push(r); }
  // pátios de terracota entre os ministérios de cada par (como na maquete)
  for (const r of [{ x0: -112, x1: -102, z0: -146, z1: -138 }, { x0: 103, x1: 110, z0: -146, z1: -138 }]) addFlat(mats.terra, flatGeom(r.x0, r.x1, r.z0, r.z1, 0.055, 4));
  // estacionamentos (margem leste e oeste)
  // estacionamentos de 14 m ou mais de largura: todo o lote pintado com vagas dos dois lados e corredor no meio (o sentido segue o lado maior)
  const lotGeom = (r: Rect): THREE.BufferGeometry => {
    const g = flatGeom(r.x0, r.x1, r.z0, r.z1, 0.045, 21);
    const pos = g.attributes.position!;
    const uv = g.attributes.uv!;
    const alongZ = r.z1 - r.z0 >= r.x1 - r.x0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      if (alongZ) uv.setXY(i, (x - r.x0) / (r.x1 - r.x0), (z - r.z0) / 5.2);
      else uv.setXY(i, (z - r.z0) / (r.z1 - r.z0), (x - r.x0) / 5.2);
    }
    return g;
  };
  for (const r of lots) {
    const w = Math.min(r.x1 - r.x0, r.z1 - r.z0);
    if (w >= 14) addFlat(mats.lotBays, lotGeom(r));
    else addFlat(mats.lot, flatGeom(r.x0, r.x1, r.z0, r.z1, 0.045, 21));
  }

  // ---- ministérios e demais prédios ----
  const B: Bld[] = [];
  const pair = (x0: number, x1: number, zA: number, zB: number): void => {
    B.push({ x0, x1, z0: zA, z1: zA + 22, h: 24, tex: 'ministry', core: true });
    B.push({ x0, x1, z0: zB, z1: zB + 22, h: 24, tex: 'ministry', core: true });
  };
  // margem oeste: par de ministérios ao sul; par empilhado ao norte da rua; galpão com telhado nervurado, galpões baixos e prédio quadrado
  pair(-146, -100, -168, -138);
  pair(-146, -100, -88, -60);
  // margem direita da foto aérea (a leste do Congresso; no jogo é o lado x < 0): galpão cinza, edifício creme em degraus, anexo e galpão de duas águas
  B.push({ x0: -125, x1: -99, z0: 59.7, z1: 124, h: 12, tex: 'plain' });
  B.push({ x0: -143, x1: -133, z0: 59.6, z1: 123.1, h: 10, tex: 'warehouse', roof: 'rib' });
  B.push({ x0: -148, x1: -139.5, z0: 109.2, z1: 123.1, h: 8, tex: 'plain' });
  B.push({ x0: -148, x1: -143, z0: 83.2, z1: 109.2, h: 8, tex: 'warehouse' });
  B.push({ x0: -148, x1: -133.5, z0: 135.8, z1: 174.2, h: 12, tex: 'warehouse', roof: 'gable' });
  B.push({ x0: -125, x1: -97, z0: 36.3, z1: 51.8, h: 9, tex: 'plain' }); // galpão menor, abaixo do grande
  B.push({ x0: -148, x1: -133, z0: 48.7, z1: 64, h: 12, tex: 'plain' }); // bloco creme de baixo
  B.push({ x0: -136.2, x1: -104.2, z0: -21.3, z1: 11.9, h: 14, tex: 'plain' }); // prédio quadrado com telhado bege
  // margem leste: par ao sul, palácio com colunas, blocos cinza, edifício creme e galpão de duas águas
  pair(100, 146, -168, -138);
  B.push({ x0: 104, x1: 132, z0: -78, z1: -38, h: 16, tex: 'palace' });
  B.push({ x0: 106, x1: 146, z0: 0, z1: 58, h: 14, tex: 'plain' });
  B.push({ x0: 108, x1: 144, z0: 64, z1: 86, h: 9, tex: 'plain' });
  B.push({ x0: 124, x1: 146, z0: 96, z1: 150, h: 10, tex: 'warehouse', roof: 'rib' });
  B.push({ x0: 126, x1: 146, z0: 152, z1: 168, h: 7, tex: 'warehouse' });
  B.push({ x0: 112, x1: 146, z0: 170, z1: 188, h: 12, tex: 'warehouse', roof: 'gable' });
  // ---- área atrás do Congresso (foto aérea do usuário): gramado, estacionamentos, calçadas, ruas de asfalto e duas cancelas ----
  addFlat(mats.lawn, flatGeom(-55, 55, 124, 188, 0.015, 12));
  const back = (m: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number, tile = 4): void => { addFlat(m, flatGeom(x0, x1, z0, z1, y, tile)); };
  const WALKS: [number, number, number, number][] = [
    [22.3, 25.3, 141.2, 188], // calçada de pedestres do lado das torres (espelho da outra)
    [42, 46, 141.2, 188], // calçada do lado da avenida, ao longo de todo o estacionamento
    [2.9, 22.3, 124.8, 147], // praça das torres
    [-25.3, -22.3, 141.2, 188], // 6: calçada da esquerda do estacionamento = entrada de pedestres
    [-46, -42, 141.2, 188], // 7-9: calçada do lado da avenida, ao longo de todo o estacionamento
    [46.1, 55, 100.5, 103.2], // 10: passeio curto da avenida até o prédio
  ];
  for (const [x0, x1, z0, z1] of WALKS) back(mats.concrete, x0, x1, z0, z1, 0.06);
  // cancelas de estacionamento (poste + braço listrado a 1 m): uma na via da esquerda e uma na da direita
  const posts: THREE.BufferGeometry[] = [];
  const arms: THREE.BufferGeometry[] = [];
  // cancela da entrada de carros do estacionamento da esquerda: serve aos carros que vêm da avenida e atravessa a faixa (poste do lado de fora da pista)
  for (const gx of [-47.5, 47.5]) {
    const za = 145.7;
    const zb = 141.5;
    const len = Math.abs(za - zb);
    const arm = new THREE.BoxGeometry(len, 0.14, 0.14);
    const uv = arm.attributes.uv!;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len);
    arm.rotateY(Math.PI / 2);
    const dy = pitHeight(gx, za);
    arm.translate(gx, 1.05 + dy, (za + zb) / 2);
    arms.push(arm);
    posts.push(new THREE.BoxGeometry(0.4, 1.3, 0.4).translate(gx, 0.65 + dy, za));
    posts.push(new THREE.BoxGeometry(0.44, 0.12, 0.44).translate(gx, 1.36 + dy, za));
    addBox(gx - 0.25, gx + 0.25, za - 0.25, za + 0.25, 1.3 + dy, '#30343a', dy);
    addBox(gx - 0.1, gx + 0.1, zb, za, 1.15 + dy, '#d22a2a', dy);
  }
  // ponte de pedestres: sai da calçada do estacionamento (na altura da avenida, y 0) e desce suave até a praça das torres (y −4,5), sobre o rebaixo
  for (const [bx0, bx1] of [[-22.3, 2.3], [22.3, 2.3]] as const) {
    const bz0 = 141.7;
    const bz1 = 143.9;
    const y0 = 0;
    const y1 = -PIT_D + 0.1;
    const N = 20;
    const deckAt = (x: number): number => y0 + ((x - bx0) / (bx1 - bx0)) * (y1 - y0);
    const ang = bx1 > bx0 ? Math.atan2(y1 - y0, bx1 - bx0) : Math.atan2(y0 - y1, bx0 - bx1);
    const len = Math.hypot(bx1 - bx0, y1 - y0);
    const cx = (bx0 + bx1) / 2;
    const cy = (y0 + y1) / 2;
    const cz = (bz0 + bz1) / 2;
    const parts: THREE.BufferGeometry[] = [];
    const part = (h: number, d: number, dz: number, dyy: number): void => {
      const g = new THREE.BoxGeometry(len, h, d);
      g.rotateZ(ang);
      g.translate(cx, cy + dyy, cz + dz);
      parts.push(g);
    };
    part(0.3, bz1 - bz0, 0, -0.15); // tabuleiro
    part(0.9, 0.12, -(bz1 - bz0) / 2 + 0.06, 0.45); // guarda-corpo (lado sul)
    part(0.9, 0.12, (bz1 - bz0) / 2 - 0.06, 0.45); // guarda-corpo (lado norte)
    for (let t = 4; t < Math.abs(bx1 - bx0) - 2; t += 6) { // pilares até o chão
      const x = bx0 + Math.sign(bx1 - bx0) * t;
      const top = deckAt(x) - 0.3;
      const ground = pitHeight(x, cz);
      if (top - ground > 0.4) parts.push(new THREE.BoxGeometry(0.7, top - ground, 1.2).translate(x, (top + ground) / 2, cz));
    }
    const bridge = new THREE.Mesh(mergeGeometries(parts, false)!, new THREE.MeshStandardMaterial({ color: 0xc9c5b8, roughness: 0.9 }));
    bridge.castShadow = true;
    bridge.receiveShadow = true;
    city.add(bridge);
    // colisão em degraus de 1,2 m (queda de 0,22 m cada: dá para subir e descer andando); o guarda-corpo bloqueia as laterais
    for (let i = 0; i < N; i++) {
      const xa = Math.min(bx0 + (i / N) * (bx1 - bx0), bx0 + ((i + 1) / N) * (bx1 - bx0));
      const xb = Math.max(bx0 + (i / N) * (bx1 - bx0), bx0 + ((i + 1) / N) * (bx1 - bx0));
      const top = deckAt((xa + xb) / 2);
      addBox(xa, xb, bz0, bz1, top, '#c9c5b8', top - 0.5);
      addBox(xa, xb, bz0 - 0.1, bz0, top + 0.9, '#c9c5b8', top);
      addBox(xa, xb, bz1, bz1 + 0.1, top + 0.9, '#c9c5b8', top);
    }
  }
  const postMesh = new THREE.Mesh(mergeGeometries(posts, false)!, new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.7 }));
  const armMesh = new THREE.Mesh(mergeGeometries(arms, false)!, new THREE.MeshStandardMaterial({ map: T.stripes!, roughness: 0.6 }));
  postMesh.castShadow = armMesh.castShadow = true;
  city.add(postMesh, armMesh);

  // ---- margem direita (foto aérea do usuário): estacionamento diagonal, ruas de asfalto, praça de pedra com árvores ----
  // A foto tem escala diferente da do jogo: x da foto vira |x| do jogo por trechos (avenida, calçada, gramado, prédios); z = 124,4 + (680 − y)·0,084.
  const EXK: [number, number][] = [[305, 55], [390, 85], [418, 88], [495, 97], [765, 125], [815, 130], [850, 133], [1045, 148], [1079, 150]];
  const EX = (px: number): number => {
    for (let i = 1; i < EXK.length; i++) {
      const [a, ga] = EXK[i - 1]!;
      const [b, gb] = EXK[i]!;
      if (px <= b) return ga + ((px - a) / (b - a)) * (gb - ga);
    }
    return 150;
  };
  const E = (px: number, py: number): [number, number] => [-EX(px), 124.4 + (680 - py) * 0.084];
  const ph = (pts: [number, number][]): [number, number][] => pts.map(([px, py]) => E(px, py));
  const flatPoly = (pts: [number, number][], y: number, tile: number): THREE.BufferGeometry => {
    const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))));
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    const pos = g.attributes.position!;
    const uv = g.attributes.uv!;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
    return g;
  };
  const LOT_D = ph([[440, 15], [695, 15], [530, 350], [440, 330]]);
  const STREETS_E: [number, number][][] = [
    ph([[802, 105], [860, 105], [860, 590], [802, 590]]), // faixa de serviço ao lado do galpão de duas águas
    ph([[765, 640], [815, 640], [815, 1565], [765, 1565]]), // rua entre os prédios
  ];
  const PLAZA = ph([[763, 100], [807, 113], [807, 587], [520, 587], [520, 560]]);
  addFlat(mats.lot, flatPoly(LOT_D, 0.045, 21));
  for (const pts of STREETS_E) addFlat(mats.asp, flatPoly(pts, 0.047, 12));
  addFlat(mats.concrete, flatPoly(PLAZA, 0.06, 4));
  addFlat(mats.concrete, flatGeom(-101.7, -85, 141.1, 143.5, 0.06, 4)); // passeio da calçada da avenida até a rua da margem (sem cruzar a avenida)
  // ---- 2ª foto aérea (mais ao sul na mesma margem): rua entre prédios, praça de pedra, rua horizontal, caminhos, estacionamento e árvores ----
  // x_foto2 → x_foto1: 495 + (x − 518)·1,04; y_foto2 → y_foto1: y + 515 (mesma escala em z).
  const E2 = (px: number, py: number): [number, number] => E(495 + (px - 518) * 1.04, py + 515);
  const rectE2 = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [E2(x0, y0), E2(x1, y0), E2(x1, y1), E2(x0, y1)];
  STREETS_E.push(
    rectE2(780, 950, 830, 1385), // rua entre os prédios, continuação
    rectE2(410, 1350, 1100, 1400), // rua horizontal abaixo da praça
  );
  addFlat(mats.asp, flatPoly(STREETS_E[STREETS_E.length - 2]!, 0.047, 12));
  addFlat(mats.asp, flatPoly(STREETS_E[STREETS_E.length - 1]!, 0.047, 12));
  const PLAZA2 = [rectE2(405, 1215, 780, 1345), rectE2(830, 1285, 1100, 1350)];
  for (const pts of PLAZA2) addFlat(mats.concrete, flatPoly(pts, 0.06, 4));
  for (const pts of [rectE2(410, 1660, 585, 1700), rectE2(410, 1760, 585, 1780), rectE2(708, 1405, 748, 1505), rectE2(708, 1900, 748, 2150)]) addFlat(mats.concrete, flatPoly(pts, 0.06, 4));
  const TREES2: [number, number][] = ([[480, 1295], [555, 1300], [615, 1310], [665, 1305], [740, 1315], [860, 1260], [915, 1265], [985, 1260], [1030, 1255], [500, 1500], [500, 1925], [575, 2010], [520, 2060], [640, 2090], [860, 2090], [930, 2030], [1000, 2090]] as [number, number][]).map(([px, py]) => E2(px, py));
  // ---- retoques pedidos sobre uma captura de cima (asfalto em cinza, grama em verde): coordenadas medidas na captura (3,71 px/m) ----
  const CW = (cx: number, cy: number): [number, number] => [-(cx - 3) / 3.71, 194.7 - cy / 3.71];
  const cpoly = (pts: [number, number][]): [number, number][] => pts.map(([cx, cy]) => CW(cx, cy));
  const crect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => cpoly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  // Entrada de carros do estacionamento da esquerda: sai da avenida, atravessa a calçada e entra pelo lado direito do estacionamento (a calçada da esquerda é a entrada de pedestres)
  const ASPH: [number, number][][] = [
    crect(127, 184, 210, 199), // faixa da avenida até o corredor do estacionamento (entrada de carros)
    cpoly([[-121, 184], [-204, 184], [-204, 199], [-121, 199]]), // o mesmo, espelhado, para o estacionamento de frente para as torres
  ];
  for (const pts of ASPH) { addFlat(mats.asp, flatPoly(pts, 0.07, 12)); STREETS_E.push(pts); }
  // Rua em volta da praça: da rua em diagonal faz uma curva suave e segue reta até a margem (faixa de 7 m em volta de uma linha central suave)
  const ribbon = (center: [number, number][], width: number, y: number): [number, number][] => {
    const curve = new THREE.CatmullRomCurve3(center.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.5);
    const pts = curve.getSpacedPoints(90);
    const L: [number, number][] = [];
    const R: [number, number][] = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)]!;
      const b = pts[Math.min(pts.length - 1, i + 1)]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      L.push([p.x - (dz / l) * (width / 2), p.z + (dx / l) * (width / 2)]);
      R.push([p.x + (dz / l) * (width / 2), p.z - (dx / l) * (width / 2)]);
    });
    const pos: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const q = [L[i]!, R[i]!, L[i + 1]!, R[i]!, R[i + 1]!, L[i + 1]!];
      for (const [x, z] of q) pos.push(x, y, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const uv: number[] = [];
    for (let i = 0; i < pos.length; i += 3) uv.push(pos[i]! / 12, pos[i + 2]! / 12);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    // garante a face voltada para cima
    if (g.attributes.normal!.getY(0) < 0) {
      const idx = new Uint32Array(pos.length / 3);
      for (let i = 0; i < idx.length; i += 3) { idx[i] = i; idx[i + 1] = i + 2; idx[i + 2] = i + 1; }
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeVertexNormals();
    }
    addFlat(mats.asp, g);
    return [...L, ...R.reverse()];
  };
  const loop = ribbon([[-130.5, IZ + 0.5], ...ph([[782, 25], [690, 170], [610, 320], [552, 440], [515, 510], [497, 548], [503, 580], [532, 594], [600, 594], [850, 594], [1079, 594]])], 7, 0.071);
  STREETS_E.push(loop);
  // Entrada e saída de carros do estacionamento diagonal: um acesso curto ligando a lateral dele (lado direito, perto da praça) à rua em diagonal
  const driveway = ph([[560, 246], [650, 238], [650, 292], [552, 288]]);
  addFlat(mats.asp, flatPoly(driveway, 0.08, 12));
  STREETS_E.push(driveway);
  const GRASS: [number, number][][] = [
    [[-48.5, 128.2], [-23.5, 128.2], [-23.5, 124.4], [-48.5, 124.4]], // faixa de grama entre a via e a laje
  ];
  for (const pts of GRASS) addFlat(mats.lawn, flatPoly(pts, 0.075, 12));
  const lotS: Rect = { x0: -146, x1: -137, z0: -23.8, z1: 16.1 };
  lots.push(lotS);
  addFlat(mats.lot, flatGeom(lotS.x0, lotS.x1, lotS.z0, lotS.z1, 0.045, 21));
  const PLAZA_TREES: [number, number][] = ([[680, 45], [600, 110], [535, 265], [600, 240], [440, 465], [500, 440], [580, 430], [565, 505], [340, 595], [390, 640], [460, 625], [535, 650], [615, 650], [335, 700], [345, 825], [420, 820], [495, 825], [565, 820], [645, 825]] as [number, number][]).map(([cx, cy]) => [400 + cx / 1.5, cy / 1.5] as [number, number]);
  const inPoly = (x: number, z: number, pts: [number, number][]): boolean => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, zi] = pts[i]!;
      const [xj, zj] = pts[j]!;
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };

  // pátio de concreto em volta de cada prédio das margens
  for (const b of B) {
    const x0 = Math.max(b.x0 - 5, b.x0 < 0 ? -IX : 97);
    const x1 = Math.min(b.x1 + 5, b.x1 < 0 ? -97 : IX);
    addFlat(mats.concrete, flatGeom(x0, x1, Math.max(b.z0 - 5, -175), Math.min(b.z1 + 5, IZ), 0.03, 4));
  }
  for (const [m, list] of flats) {
    const pieces = list.flatMap((g) => terrainPieces(g)).map((g) => { if (!g.attributes.normal) g.computeVertexNormals(); return g; });
    const mesh = new THREE.Mesh(mergeGeometries(pieces, false)!, m);
    mesh.receiveShadow = true;
    city.add(mesh);
  }
  const wallsBy: Record<string, THREE.BufferGeometry[]> = { ministry: [], warehouse: [], plain: [], palace: [] };
  const roofs: THREE.BufferGeometry[] = [];
  const ribRoofs: THREE.BufferGeometry[] = [];
  const gables: THREE.BufferGeometry[] = [];
  // telhado plano com UV em metros (as nervuras correm no sentido de z)
  const ribPlane = (x0: number, x1: number, z0: number, z1: number, y: number): THREE.BufferGeometry => {
    const g = flatGeom(x0, x1, z0, z1, y + 0.02, 8);
    return g;
  };
  // telhado de duas águas (cumeeira no sentido de z)
  const gableGeom = (x0: number, x1: number, z0: number, z1: number, y: number, rise: number): THREE.BufferGeometry => {
    const xm = (x0 + x1) / 2;
    const v: number[][] = [
      [x0, y, z0], [xm, y + rise, z0], [xm, y + rise, z1], [x0, y, z0], [xm, y + rise, z1], [x0, y, z1],
      [xm, y + rise, z0], [x1, y, z0], [x1, y, z1], [xm, y + rise, z0], [x1, y, z1], [xm, y + rise, z1],
      [x0, y, z0], [x1, y, z0], [xm, y + rise, z0], [x0, y, z1], [xm, y + rise, z1], [x1, y, z1],
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v.flat(), 3));
    g.computeVertexNormals();
    return g;
  };
  const roofAt = (x0: number, x1: number, z0: number, z1: number, y: number): void => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, y + 0.02, (z0 + z1) / 2);
    roofs.push(g);
  };
  for (const b of B) {
    wallsBy[b.tex]!.push(boxWalls(b.x0, b.x1, b.z0, b.z1, 0, b.h, 16, 8));
    if (b.roof === 'rib') ribRoofs.push(ribPlane(b.x0, b.x1, b.z0, b.z1, b.h));
    else if (b.roof === 'gable') gables.push(gableGeom(b.x0, b.x1, b.z0, b.z1, b.h, 4));
    else roofAt(b.x0, b.x1, b.z0, b.z1, b.h);
    addBox(b.x0, b.x1, b.z0, b.z1, b.roof === 'gable' ? b.h + 2 : b.h, b.tex === 'warehouse' ? '#a89e72' : '#b4ab98');
    if (b.core) {
      // blocos de circulação no topo (como na maquete) e nas pontas
      for (const cx of [b.x0 + 8, b.x1 - 8]) {
        wallsBy.plain!.push(boxWalls(cx - 4, cx + 4, (b.z0 + b.z1) / 2 - 4, (b.z0 + b.z1) / 2 + 4, b.h, b.h + 3, 16, 8));
        roofAt(cx - 4, cx + 4, (b.z0 + b.z1) / 2 - 4, (b.z0 + b.z1) / 2 + 4, b.h + 3);
      }
    }
  }
  // passarelas ligando os dois prédios de cada par (a 8 m do chão: dá para passar por baixo)
  for (const [x0, x1, za, zb] of [[-126, -120, -146, -138], [-126, -120, -66, -60], [124, 130, -146, -138]] as const) {
    wallsBy.plain!.push(boxWalls(x0, x1, za, zb, 8, 13, 16, 8));
    roofAt(x0, x1, za, zb, 13);
    addBox(x0, x1, za, zb, 13, '#b4ab98', 8);
  }
  // palácio: colunata na fachada sul (voltada para o gramado), varanda coberta e claraboia bege no teto
  for (let x = 108; x <= 130; x += 4.4) {
    wallsBy.palace!.push(boxWalls(x - 0.7, x + 0.7, -82.7, -81.3, 0, 14, 16, 8));
    addBox(x - 0.7, x + 0.7, -82.7, -81.3, 14, '#e8e4da');
  }
  wallsBy.palace!.push(boxWalls(104, 132, -84, -78, 14, 15, 16, 8));
  roofAt(104, 132, -84, -78, 15);
  wallsBy.plain!.push(boxWalls(113, 123, -64, -52, 16, 18.5, 16, 8));
  roofAt(113, 123, -64, -52, 18.5);
  // telhado bege no centro do prédio quadrado (foto)
  wallsBy.warehouse!.push(boxWalls(-130.5, -115, -8.3, -1.3, 14, 15.3, 16, 8));
  roofAt(-130.5, -115, -8.3, -1.3, 15.3);
  // pontos de ônibus (abrigo com cobertura e fundo) nas calçadas externas das avenidas
  for (const [sx, z] of [[-1, -122], [1, -122], [-1, 30], [1, 30]] as const) {
    const xa = sx * 91.2;
    wallsBy.plain!.push(boxWalls(xa - 1.2, xa + 1.2, z - 3.5, z + 3.5, 2.5, 2.7, 16, 8));
    roofAt(xa - 1.2, xa + 1.2, z - 3.5, z + 3.5, 2.7);
    addBox(xa + sx * 1.0 - 0.1, xa + sx * 1.0 + 0.1, z - 3.5, z + 3.5, 2.5, '#9aa3a8');
  }
  for (const k of Object.keys(wallsBy)) {
    if (!wallsBy[k]!.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(wallsBy[k]!, false)!, new THREE.MeshStandardMaterial({ map: T[k]!, roughness: 0.9 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    city.add(mesh);
  }
  const roofMesh = new THREE.Mesh(mergeGeometries(roofs, false)!, mats.roof);
  roofMesh.receiveShadow = true;
  city.add(roofMesh);
  if (ribRoofs.length) { const m = new THREE.Mesh(mergeGeometries(ribRoofs, false)!, mats.ribRoof); m.receiveShadow = true; city.add(m); }
  if (gables.length) { const m = new THREE.Mesh(mergeGeometries(gables, false)!, mats.gable); m.castShadow = true; city.add(m); }

  // ---- muro em volta (limite do mapa) ----
  const wallGeo: THREE.BufferGeometry[] = [];
  for (const [x0, x1, z0, z1] of [[-HX - 2, HX + 2, -HZ - 2, -HZ], [-HX - 2, HX + 2, HZ, HZ + 2], [-HX - 2, -HX, -HZ, HZ], [HX, HX + 2, -HZ, HZ]] as const) {
    const g = new THREE.BoxGeometry(x1 - x0, 4, z1 - z0);
    g.translate((x0 + x1) / 2, 2, (z0 + z1) / 2);
    wallGeo.push(g);
  }
  city.add(new THREE.Mesh(mergeGeometries(wallGeo, false)!, mats.wall));

  // ---- postes de luz ao longo das avenidas (instanciados) ----
  const poles: [number, number][] = [];
  for (let z = -165; z <= 180; z += 28) for (const x of [-86.5, -53.5, 56.5, 86.5]) {
    if (CROSS.some((c) => z > c.z0 - 3 && z < c.z1 + 3 && Math.abs(x) < 60)) continue;
    if (OUTER.some((c) => z > c.z0 - 3 && z < c.z1 + 3 && Math.abs(x) > 80)) continue;
    if ((x === -53.5 || x === 56.5) && Math.abs(z - 143.2) < 10) continue; // sem poste de luz nas entradas de carros dos estacionamentos de trás // sem poste de luz na entrada de carros do estacionamento da esquerda
    poles.push([x, z]);
  }
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 8, 6).translate(0, 4, 0), new THREE.MeshStandardMaterial({ color: 0x6b7178, roughness: 0.6 }), poles.length);
  const lampMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.2, 0.5).translate(0, 8.1, 0), new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0x665a30 }), poles.length);
  const dummy = new THREE.Object3D();
  poles.forEach(([x, z], i) => {
    dummy.position.set(x, 0, z);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix);
    lampMesh.setMatrixAt(i, dummy.matrix);
    addBox(x - 0.2, x + 0.2, z - 0.2, z + 0.2, 8, '#6b7178');
  });
  poleMesh.castShadow = true;
  city.add(poleMesh, lampMesh);

  // ---- árvores: fileiras ao longo das avenidas e do gramado, grupos nas margens ----
  const trees: TreeSpec[] = [];
  const spot = (x: number, z: number, sp: Species): void => { trees.push({ x, y: pitHeight(x, z), z, h: HEIGHT[sp][0] + rnd() * (HEIGHT[sp][1] - HEIGHT[sp][0]), species: sp }); };
  const inCross = (z: number): boolean => CROSS.some((c) => z > c.z0 - 5 && z < c.z1 + 5);
  for (let z = -165; z <= 38; z += 9) {
    if (inCross(z) || z > -90) continue; // na frente do Congresso só há a fileira ao longo das duas ruas (abaixo)
    // fileiras entre as ruas estreitas do gramado central e as avenidas (x ±48), como na maquete
    for (const x of [-48.5, 48.5]) spot(x, z + rnd() * 2, z > -34 ? 'maple' : rnd() < 0.6 ? 'oak' : 'maple');
  }
  for (let z = -170; z <= 175; z += 8) for (const x of [-92, 92]) if (rnd() < 0.92) spot(x + (rnd() - 0.5), z, rnd() < 0.5 ? 'birch' : 'maple');
  // algumas árvores soltas e bosques nos pátios e gramados dos ministérios
  for (let i = 0; i < 70; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    spot(side * (100 + rnd() * 44), -176 + rnd() * 350, rnd() < 0.5 ? 'oak' : 'birch');
  }
  for (const [px, py] of PLAZA_TREES) { const [x, z] = E(px, py); spot(x, z, rnd() < 0.6 ? 'oak' : 'maple'); } // árvores da praça de pedra
  for (const [x, z] of TREES2) { spot(x, z, rnd() < 0.6 ? 'oak' : 'maple'); } // árvores soltas e bosque da 2ª foto
  for (let z = 34; z <= 124; z += 3.6) spot(-93.6, z + (rnd() - 0.5), rnd() < 0.5 ? 'maple' : 'oak'); // fileira densa junto à avenida, ao lado do galpão cinza
  for (const [gx, gz] of [[-120, -125], [120, -125], [100, -70], [118, -45], [-118, -98], [118, -98], [-122, 66], [118, 90], [-120, 124], [128, 146], [-100, 150], [100, 150]] as const) {
    for (let i = 0; i < 9; i++) spot(gx + (rnd() - 0.5) * 16, gz + (rnd() - 0.5) * 16, rnd() < 0.5 ? 'oak' : 'maple');
  }
  for (const [x, z] of [[-24, -150], [24, -150], [0, -128]] as const) spot(x, z, 'oak');
  // na frente do Congresso: UMA fileira de árvores paralela a cada uma das duas ruas (3,5 m para fora da pista), acompanhando-as até o lago
  for (let z = -86; z <= 47; z += 7) for (const x of [-34.5, 34.5]) spot(x, z + (rnd() - 0.5) * 0.6, rnd() < 0.5 ? 'oak' : 'maple');
  const nearBuilding = (x: number, z: number, m: number): boolean => B.some((b) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m);
  // gramados das margens e de trás do Congresso: muitas árvores (menos na frente do Palácio, o gramado x 97..150, z −92..−34, e na frente do Congresso)
  {
    const poleXZ = poles;
    const free = (x: number, z: number): boolean => {
      if (nearBuilding(x, z, 6)) return false;
      if (ROADS.some((r) => x > r.x0 - 2 && x < r.x1 + 2 && z > r.z0 - 2 && z < r.z1 + 2) || lots.some((r) => x > r.x0 - 2 && x < r.x1 + 2 && z > r.z0 - 2 && z < r.z1 + 2)) return false;
      if ([LOT_D, ...STREETS_E, PLAZA, ...PLAZA2].some((pts) => inPoly(x, z, pts))) return false;
      if (WALKS.some(([x0, x1, z0, z1]) => x > x0 - 1.5 && x < x1 + 1.5 && z > z0 - 1.5 && z < z1 + 1.5)) return false;
      if (poleXZ.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2)) return false;
      if (Math.abs(x) > 97 && x > 0 && z > -94 && z < -32) return false; // gramado em frente ao Palácio (colunata): sem árvores
      if (Math.abs(x - 10) < 14 && z > 155 && z < 185) return false; // as duas torres
      if (Math.abs(x) < 26 && z > 139 && z < 147) return false; // pontes de pedestres
      if (Math.abs(x + 92) < 9 && Math.abs(z + 60) < 10) return false; // em frente ao outdoor
      if (Math.abs(Math.abs(x) - 91.2) < 4.5 && (Math.abs(z + 122) < 6 || Math.abs(z - 30) < 6)) return false; // pontos de ônibus
      return true;
    };
    const pick = (): Species => { const r = rnd(); return r < 0.35 ? 'oak' : r < 0.65 ? 'maple' : r < 0.9 ? 'birch' : 'pine'; };
    const taken: [number, number][] = [];
    const tryPlant = (x: number, z: number, gap: number): void => {
      if (!free(x, z) || taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < gap)) return;
      taken.push([x, z]);
      spot(x, z, pick());
    };
    for (let i = 0; i < 9000; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      tryPlant(side * (88 + rnd() * 60), -172 + rnd() * 358, 6.5); // margens oeste e leste (inclui o gramado junto às avenidas)
    }
    for (let i = 0; i < 1500; i++) tryPlant(-52 + rnd() * 104, 126 + rnd() * 62, 7); // atrás do Congresso (no rebaixo, em cima do fundo)
  }
  for (let i = 0; i < 40; i++) trees.push({ x: -50 + rnd() * 100, z: -170 + rnd() * 62, h: HEIGHT.bush[0] + rnd() * (HEIGHT.bush[1] - HEIGHT.bush[0]), species: 'bush' });
  const crown: Record<string, number> = { oak: 0.4, pine: 0.2, maple: 0.3, birch: 0.2, bush: 0 };
  const blocked = (x: number, z: number): boolean => [...ROADS, ...lots].some((r) => x > r.x0 - 1.5 && x < r.x1 + 1.5 && z > r.z0 - 1.5 && z < r.z1 + 1.5) || [LOT_D, ...STREETS_E].some((pts) => inPoly(x, z, pts));
  const placed = trees.filter((t) => t.species === 'bush' || (!nearBuilding(t.x, t.z, crown[t.species]! * t.h + 0.4) && !blocked(t.x, t.z)));
  const treeGroup = makeTrees(placed);
  city.add(treeGroup);
  registerCullChildren(treeGroup, FAR_TREES);

  // ---- nomes dos lugares (barra de cima do jogo, mapa grande) ----
  PLACES.push(
    { name: 'LAGO DO CONGRESSO', rect: { x0: -42, x1: 42, z0: 48, z1: 92 } },
    { name: 'CONGRESSO NACIONAL', rect: { x0: -60, x1: 60, z0: 44, z1: IZ } },
    { name: 'EIXO MONUMENTAL OESTE', rect: { x0: -88, x1: -52, z0: -IZ, z1: IZ } },
    { name: 'EIXO MONUMENTAL LESTE', rect: { x0: 52, x1: 88, z0: -IZ, z1: IZ } },
    { name: 'MINISTÉRIOS (OESTE)', rect: { x0: -IX, x1: -88, z0: -IZ, z1: IZ } },
    { name: 'AV. PERIMETRAL', rect: { x0: -HX, x1: -IX, z0: -HZ, z1: HZ } },
    { name: 'AV. PERIMETRAL', rect: { x0: IX, x1: HX, z0: -HZ, z1: HZ } },
    { name: 'AV. PERIMETRAL', rect: { x0: -HX, x1: HX, z0: IZ, z1: HZ } },
    { name: 'MINISTÉRIOS (LESTE)', rect: { x0: 88, x1: IX, z0: -IZ, z1: IZ } },
  );

  // ---- Congresso Nacional: o modelo do usuário (laje com as duas cúpulas, rampa e as duas torres) ----
  void new GLTFLoader().loadAsync('/models/map/congresso.glb').then((g) => {
    const root = new THREE.Group();
    root.add(g.scene);
    root.scale.setScalar(CONG_SCALE);
    root.rotation.y = Math.PI; // a rampa (frente) do modelo olha para +z: vira para o sul (-z), para quem vem do gramado
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    root.position.set(-c.x, -box.min.y, CONG_FRONT - box.min.z);
    root.updateMatrixWorld(true);
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    city.add(root);
    // Ajustes no modelo (em coordenadas do mundo): a laje desce até o chão (o modelo a deixava ~8 m no ar) e as duas torres
    // de trás perdem metade da altura. Cada malha vira geometria em coordenadas do mundo, solta na cidade.
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    const wbox = new Map(meshes.map((m) => [m, new THREE.Box3().setFromObject(m)] as const));
    const isTower = (b: THREE.Box3): boolean => (b.min.y < 1 && b.max.y > 20) || b.min.y > 20; // corpo das torres e a passarela de vidro entre elas
    const drop = Math.min(...meshes.filter((m) => !isTower(wbox.get(m)!)).map((m) => wbox.get(m)!.min.y));
    for (const m of meshes) {
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      if (isTower(wbox.get(m)!)) {
        g.scale(1, 0.5, 1); // as torres de trás: metade da altura
        const tp = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < tp.count; i++) if (tp.getY(i) < 0.5) tp.setY(i, pitHeight(tp.getX(i), tp.getZ(i))); // a base acompanha o terreno (a rampa passa por baixo delas)
        g.computeBoundingBox();
      }
      else g.translate(0, -drop - PIT_D, 0); // a laje desce até o chão rebaixado: o teto fica na altura das avenidas
      m.geometry = g;
      m.removeFromParent();
      m.position.set(0, 0, 0);
      m.rotation.set(0, 0, 0);
      m.scale.set(1, 1, 1);
      m.updateMatrixWorld(true);
      city.add(m);
    }
    // colisão: a laje (a maior peça branca), as duas cúpulas e as torres, medidas no próprio modelo
    const parts: { box: THREE.Box3; area: number; dark: boolean }[] = [];
    for (const m of meshes) {
      const b = new THREE.Box3().setFromObject(m);
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
      const sz = b.getSize(new THREE.Vector3());
      if (sz.x < 1 || sz.z < 1) continue;
      parts.push({ box: b, area: sz.x * sz.z, dark: mat.color.r < 0.6 && mat.color.r > 0.3 && sz.y > 20 });
    }
    const dark = parts.filter((p) => p.dark);
    for (const p of dark) addBox(p.box.min.x, p.box.max.x, p.box.min.z, p.box.max.z, p.box.max.y, '#8a8d8d', Math.min(0, p.box.min.y));
    // a laje (a peça branca de maior área) vira uma caixa de ~6 m; as cúpulas ficam em cima dela (não bloqueiam)
    const whites = parts.filter((p) => !p.dark && p.box.max.y > 1 - PIT_D).sort((x, y) => y.area - x.area);
    const slab = whites[0];
    // a rampa (a ponta da peça maior, na frente) não bloqueia: a caixa começa na fachada de vidro
    const facadeZ = Math.min(...whites.slice(1).filter((p) => p.area > 200).map((p) => p.box.min.z));
    if (slab) addBox(slab.box.min.x, slab.box.max.x, Number.isFinite(facadeZ) ? Math.max(slab.box.min.z, facadeZ) : slab.box.min.z, slab.box.max.z, 0, '#cfcfcf', -PIT_D); // teto da laje na altura das avenidas: dá para andar em cima
  }).catch((e) => console.warn('Congresso não carregou:', e));

  return city;
}


