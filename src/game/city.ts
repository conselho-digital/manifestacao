import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addBox, COLLIDERS, PARKS, PLACES, ROADS, TREES, type Rect } from './map';
import { buildGrayTower, TOWER } from './tower';
import { registerCullChildren, FAR_TREES } from './culling';
import { addShops } from './shops';
import { placeSafraSign } from './safra';
import { placeTotem } from './totem';
import { HEIGHT, makeTrees, type Species, type TreeSpec } from './trees';
import { CAR_MODELS, COMMON_COLORS, TRAFFIC } from './vehicle';

// Cidade inspirada na maquete da Av. Paulista (SP). O layout é escrito "como na foto" (x para a direita,
// z para o norte) e convertido para o mundo espelhando o eixo X (R(): x_mundo = -x_foto).

const HX = 110; // cidade (quadras): a Paulista tem tamanho fixo (o mapa pode trocar no menu sem recarregar a página, então não lê `CITY`)
const HZ = 84;
const RX = HX + 12; // mapa todo, com a rua em volta
const RZ = HZ + 12;
/** retângulo no espaço da foto -> retângulo do mundo */
const R = (sx0: number, sx1: number, sz0: number, sz1: number): Rect => ({ x0: -sx1, x1: -sx0, z0: sz0, z1: sz1 });

const AVENUE: Rect = { x0: -RX, x1: RX, z0: -12, z1: 12 };
const WALK: Rect = { x0: -RX, x1: RX, z0: -19, z1: 19 }; // avenida + calçadas
const N_STREETS = [R(-85, -77, 12, HZ), R(6, 16, 12, HZ), R(48, 58, 12, HZ)];
const S_STREETS = [R(-68, -58, -HZ, -12), R(18, 27, -HZ, -12)];
const STREETS = [...N_STREETS, ...S_STREETS];
const TRIANON = R(-54, -8, -60, -34);
const PAVERS_S = R(-54, 16, -34, -19);
const PLAZA = R(-58, 8, 19, 46);
const PARKING = R(28, 40, -78, -56); // estacionamento (quadra sul, recuado 6 m da borda: calçada mais larga)

const MASP = { x: 23, z: 34, length: 54 }; // x já em coordenadas do mundo
const MASP_SRC = { cx: 37.5, cz: -11, groundY: -139.67, len: 1500 };

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const rand = rng(20260);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)]!;

// ---------- texturas ----------

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, rx = 1, ry = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Janela com moldura, peitoril e detalhe de ar-condicionado. */
const punched = (wall: string, slab: string, glass: string, frame: string): THREE.CanvasTexture =>
  canvasTex(64, (g, s) => {
    g.fillStyle = wall; g.fillRect(0, 0, s, s);
    g.fillStyle = slab; g.fillRect(0, s - 6, s, 6);
    g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(0, s - 7, s, 1);
    g.fillStyle = frame; g.fillRect(15, 14, s - 30, s - 30);
    g.fillStyle = glass; g.fillRect(17, 16, s - 34, s - 34);
    g.fillStyle = frame; g.fillRect(s / 2 - 1, 16, 2, s - 34);   // divisão da esquadria
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(17, 16, s - 34, 4);
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(14, s - 15, s - 28, 3); // peitoril/sombra
  });

/** Janela em fita (prédios brancos): faixa contínua de vidro. */
const ribbon = (wall: string, slab: string, glass: string): THREE.CanvasTexture =>
  canvasTex(64, (g, s) => {
    g.fillStyle = wall; g.fillRect(0, 0, s, s);
    g.fillStyle = slab; g.fillRect(0, s - 8, s, 8);
    g.fillStyle = glass; g.fillRect(0, 17, s, s - 36);
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, 17, s, 4);
    g.fillStyle = 'rgba(30,40,50,.6)'; g.fillRect(0, 17, 3, s - 36); g.fillRect(s / 2, 17, 2, s - 36);
  });

/** Torre de vidro com caixilhos e faixa opaca entre andares. */
const curtain = (pane: string, spandrel: string, line: string): THREE.CanvasTexture =>
  canvasTex(64, (g, s) => {
    g.fillStyle = spandrel; g.fillRect(0, 0, s, s);
    const grad = g.createLinearGradient(0, s * 0.3, 0, s);
    grad.addColorStop(0, pane); grad.addColorStop(1, 'rgba(10,20,30,.55)');
    g.fillStyle = pane; g.fillRect(0, s * 0.3, s, s * 0.7);
    g.fillStyle = grad; g.fillRect(0, s * 0.3, s, s * 0.7);
    g.fillStyle = line; g.fillRect(0, s - 3, s, 3); g.fillRect(0, 0, 2, s); g.fillRect(s - 2, 0, 2, s);
  });

/** Torre escura com pilares verticais de concreto (como a torre escura da maquete). */
const piers = (): THREE.CanvasTexture =>
  canvasTex(64, (g, s) => {
    g.fillStyle = '#272f39'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#3d5166'; g.fillRect(14, 8, s - 16, s - 14);
    g.fillStyle = 'rgba(255,255,255,.13)'; g.fillRect(14, 8, s - 16, 5);
    g.fillStyle = '#a7a39a'; g.fillRect(0, 0, 14, s);              // pilar
    g.fillStyle = '#85827a'; g.fillRect(12, 0, 2, s);
    g.fillStyle = '#6d6a63'; g.fillRect(0, s - 4, s, 4);           // laje
  });

/** Fachada de cobre (Edifício Safra): pilares de cobre escuro e vidro marrom quase preto, como na foto de referência. */
const copperTex = (): THREE.CanvasTexture =>
  canvasTex(64, (g, s) => {
    g.fillStyle = '#5a2f20'; g.fillRect(0, 0, s, s);                 // cobre escuro
    g.fillStyle = '#231510'; g.fillRect(16, 7, s - 18, s - 13);      // vidro marrom-escuro
    g.fillStyle = 'rgba(255,200,160,.12)'; g.fillRect(16, 7, s - 18, 5);
    g.fillStyle = '#8c4d33'; g.fillRect(0, 0, 14, s);                 // pilar de cobre
    g.fillStyle = '#a8603f'; g.fillRect(2, 0, 4, s);                  // brilho do pilar
    g.fillStyle = '#4a2519'; g.fillRect(12, 0, 2, s);
    g.fillStyle = '#6e3a27'; g.fillRect(0, s - 4, s, 4);              // laje
  });

const houseTex = (): THREE.CanvasTexture =>
  canvasTex(64, (g, s) => {
    g.fillStyle = '#eadcc0'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#7a5b3a'; g.fillRect(18, 14, s - 36, s - 26);
    g.fillStyle = '#5a6d7c'; g.fillRect(21, 17, s - 42, s - 32);
    g.fillStyle = '#c8b894'; g.fillRect(14, 10, s - 28, 4);
    g.fillStyle = '#b8a47e'; g.fillRect(0, s - 5, s, 5);
  });

function asphalt(rx: number, ry: number): THREE.CanvasTexture {
  return canvasTex(128, (g, s) => {
    g.fillStyle = '#3b3e44'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${rand() > 0.5 ? 255 : 0},${rand() > 0.5 ? 255 : 0},${rand() > 0.5 ? 255 : 0},.05)`; g.fillRect(rand() * s, rand() * s, 2, 2); }
  }, rx, ry);
}

/** Calçadão de pedra com o desenho em "H" que aparece na maquete. */
function calcadao(rx: number, ry: number): THREE.CanvasTexture {
  return canvasTex(128, (g, s) => {
    g.fillStyle = '#dcd6c6'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#bfb8a6'; g.lineWidth = 2;
    for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * s / 2, 0); g.lineTo(i * s / 2, s); g.stroke(); g.beginPath(); g.moveTo(0, i * s / 2); g.lineTo(s, i * s / 2); g.stroke(); }
    g.fillStyle = '#7d786c';
    for (const [ox, oy] of [[0, 0], [s / 2, s / 2]] as const) {
      g.fillRect(ox + 8, oy + 8, 8, s / 2 - 16);              // haste esquerda do H
      g.fillRect(ox + s / 2 - 16, oy + 8, 8, s / 2 - 16);     // haste direita
      g.fillRect(ox + 16, oy + s / 4 - 4, s / 2 - 32, 8);     // travessa
    }
  }, rx, ry);
}

const plainPavers = (rx: number, ry: number): THREE.CanvasTexture =>
  canvasTex(128, (g, s) => {
    g.fillStyle = '#d9d3c4'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#bdb6a4'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.stroke(); g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); }
    g.fillStyle = 'rgba(80,80,80,.18)';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) g.fillRect(i * s / 4 + 5, j * s / 4 + 5, s / 4 - 10, s / 4 - 10);
  }, rx, ry);

const dashTex = (): THREE.CanvasTexture =>
  canvasTex(64, (g, s) => { g.clearRect(0, 0, s, s); g.fillStyle = '#f1f1f1'; g.fillRect(0, 0, s * 0.5, s); });

function helipadTex(): THREE.CanvasTexture {
  return canvasTex(128, (g, s) => {
    g.fillStyle = '#cfd0d0'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#e8c21a'; g.lineWidth = 7; g.beginPath(); g.arc(s / 2, s / 2, s * 0.4, 0, 6.3); g.stroke();
    g.fillStyle = '#e8c21a'; g.font = `bold ${s * 0.5}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', s / 2, s / 2 + 4);
  });
}

function parkingTex(): THREE.CanvasTexture {
  return canvasTex(128, (g, s) => {
    g.fillStyle = '#44484e'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#e9e9e9'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s * 0.45); g.stroke(); }
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * s / 4, s * 0.55); g.lineTo(i * s / 4, s); g.stroke(); }
  }, 2, 4);
}

// ---------- prédios (geometria fundida por material) ----------

type Kind = 'cream' | 'white' | 'ochre' | 'glass' | 'dark' | 'house' | 'copper';
interface Spec {
  /** no espaço da foto */
  sx0: number; sx1: number; sz0: number; sz1: number;
  h: number; kind: Kind;
  helipad?: boolean; antenna?: boolean; ac?: boolean; plinth?: boolean;
  roof?: 'red' | 'gray';
}

const KIND_CFG: Record<Kind, { bay: number; floor: number }> = {
  cream: { bay: 3.4, floor: 3.2 }, ochre: { bay: 3.4, floor: 3.2 }, white: { bay: 5.5, floor: 3.4 },
  glass: { bay: 2.4, floor: 3.6 }, dark: { bay: 4.2, floor: 3.6 }, house: { bay: 3.5, floor: 3.0 }, copper: { bay: 4.2, floor: 3.6 },
};

class Batch {
  private readonly groups = new Map<string, THREE.BufferGeometry[]>();
  private readonly materials = new Map<string, THREE.Material>();

  constructor() {
    const lam = (m: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial(m);
    const t = (k: string, mat: THREE.Material): void => { this.materials.set(k, mat); };
    t('cream', lam({ map: punched('#f1e8d3', '#dcd1b9', '#3f5266', '#7d7360'), vertexColors: true }));
    t('ochre', lam({ map: punched('#ecd4a6', '#d3b983', '#52657a', '#9c855a'), vertexColors: true }));
    t('white', lam({ map: ribbon('#f6f3ec', '#dedacc', '#5f7385'), vertexColors: true }));
    t('glass', lam({ map: curtain('#6f9ac0', '#3f5b78', '#26384a'), vertexColors: true }));
    t('dark', lam({ map: piers(), vertexColors: true }));
    t('house', lam({ map: houseTex(), vertexColors: true }));
    t('copper', lam({ map: copperTex(), vertexColors: true }));
    t('cu', lam({ color: 0x8c4d33 }));
    t('cud', lam({ color: 0x5a2f20 }));
    t('roof', lam({ color: 0xd6d0c1 }));
    t('gray', lam({ color: 0xb9bcc0 }));
    t('metal', lam({ color: 0x5d6168 }));
    t('white2', lam({ color: 0xf2f2f2 }));
    t('red', lam({ color: 0xc0392b }));
    t('redroof', lam({ color: 0xa4482f }));
    t('grayroof', lam({ color: 0x80868d }));
    t('glassfx', lam({ color: 0x9fc3d9 }));
    t('wood', lam({ color: 0x0c0d0f })); // muro preto em volta do mapa
  }

  private push(key: string, g: THREE.BufferGeometry): void {
    if (!g.getAttribute('color')) {
      const n = g.getAttribute('position').count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }
    (this.groups.get(key) ?? this.groups.set(key, []).get(key)!).push(g);
  }

  /** Caixa com janelas; o número de baias/andares é inteiro para a textura não ser cortada. */
  wall(x: number, z: number, w: number, d: number, h: number, kind: Kind, y0 = 0): void {
    const { bay, floor } = KIND_CFG[kind];
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const faces: [number, number][] = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      const [fw, fh] = faces[f]!;
      for (let i = 0; i < 4; i++) {
        const idx = f * 4 + i;
        if (fw === 0) uv.setXY(idx, 0.03, 0.03);
        else uv.setXY(idx, uv.getX(idx) * Math.max(1, Math.round(fw / bay)), uv.getY(idx) * Math.max(1, Math.round(fh / floor)));
      }
    }
    g.translate(x, y0 + h / 2, z);
    const tint = 0.9 + rand() * 0.13;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(24 * 3).map((_, i) => (i % 3 === 2 ? tint * 0.97 : tint)), 3));
    this.push(kind, g);
  }

  box(key: string, w: number, h: number, d: number, x: number, y: number, z: number): void {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y + h / 2, z);
    this.push(key, g);
  }

  cyl(key: string, r: number, h: number, x: number, y: number, z: number, seg = 8): void {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    g.translate(x, y + h / 2, z);
    this.push(key, g);
  }

  /** Telhado de quatro águas. */
  hip(key: string, x: number, z: number, w: number, d: number, y: number, rise = 3): void {
    const g = new THREE.ConeGeometry(Math.max(w, d) * 0.74, rise, 4);
    g.rotateY(Math.PI / 4);
    g.scale(w / Math.max(w, d), 1, d / Math.max(w, d));
    g.translate(x, y + rise / 2, z);
    this.push(key, g);
  }

  meshes(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [key, list] of this.groups) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      const m = new THREE.Mesh(geo, this.materials.get(key)!);
      m.castShadow = true;
      m.receiveShadow = true;
      out.push(m);
    }
    return out;
  }
}


/**
 * Calçadas mais largas (pedido do usuário, marcado no mapa): os prédios ficavam colados na borda das quadras. Cada quadra tem as extensões
 * ocupadas pelos prédios (espaço da foto) e as novas, menores nas bordas que ganharam calçada; o prédio é remapeado por uma escala+deslocamento
 * (fica um pouco mais estreito, o resto "anda para o lado"). Norte: borda de cima 84 -> 78 em todas; lados voltados para as ruas transversais ~5 m.
 */
interface BlockMap { sx: [number, number]; sz: [number, number]; toSx?: [number, number]; toSz?: [number, number] }
const NORTH_Z: [number, number] = [19, 84];
const NORTH_TO_Z: [number, number] = [19, 78];
const SOUTH_Z: [number, number] = [-84, -19];
const SOUTH_TO_Z: [number, number] = [-78, -19];
const BLOCK_MAPS: BlockMap[] = [
  { sx: [-104, -86], sz: NORTH_Z, toSx: [-104, -91], toSz: NORTH_TO_Z }, // A (noroeste... quadra mais à esquerda no mapa)
  { sx: [-76, 2], sz: NORTH_Z, toSx: [-71, 2], toSz: NORTH_TO_Z }, // B (MASP, praça)
  { sx: [18, 46], sz: NORTH_Z, toSx: [21, 43], toSz: NORTH_TO_Z }, // C (prédio de cobre)
  { sx: [60, 106], sz: NORTH_Z, toSx: [64, 106], toSz: NORTH_TO_Z }, // D
  { sx: [-106, -78], sz: SOUTH_Z, toSz: SOUTH_TO_Z }, // E
  { sx: [-54, 16], sz: SOUTH_Z, toSz: SOUTH_TO_Z }, // F (Trianon)
  { sx: [41, 108], sz: SOUTH_Z, toSx: [41, 103], toSz: SOUTH_TO_Z }, // G
];
const lerpMap = (v: number, a: [number, number], b: [number, number]): number => b[0] + ((v - a[0]) * (b[1] - b[0])) / (a[1] - a[0]);
function widenSidewalks(sx0: number, sx1: number, sz0: number, sz1: number): { sx0: number; sx1: number; sz0: number; sz1: number } {
  const cx = (sx0 + sx1) / 2;
  const cz = (sz0 + sz1) / 2;
  const blk = BLOCK_MAPS.find((m) => cx >= m.sx[0] - 1 && cx <= m.sx[1] + 1 && cz >= m.sz[0] && cz <= m.sz[1]);
  if (!blk) return { sx0, sx1, sz0, sz1 };
  const mx = (v: number): number => (blk.toSx ? lerpMap(v, blk.sx, blk.toSx) : v);
  const mz = (v: number): number => (blk.toSz ? lerpMap(v, blk.sz, blk.toSz) : v);
  return { sx0: mx(sx0), sx1: mx(sx1), sz0: mz(sz0), sz1: mz(sz1) };
}

const footprints: { name: string; r: Rect; allowWalk?: boolean; off?: number; bay?: number; col?: number; shops?: boolean }[] = [];
/** postes e abrigos (para a verificação de desenvolvimento: nada no meio da rua) */
const propSpots: [string, number, number][] = [];

/** Detalhes de telhado (casa de máquinas, caixa d'água, ventiladores, chaminé, helipontos): quase nunca aparecem vistos da rua, então não são gerados (cidade mais leve). As antenas ficam: aparecem de longe. */
const ROOF_DETAILS = false;
/** Fração da altura original dos prédios (0,5 = metade dos andares). */
const BUILDING_SCALE = 0.5;

/** Prédio de cobre (referência: torre em degraus com pilastras): base larga com faixa de vidro, corpo com pilastras verticais salientes, bloco recuado com faixas horizontais, casa de máquinas e antena. */
function addCopperTower(b: Batch, x: number, z: number, w: number, d: number, h: number): void {
  const BASE = 7;
  // base (térreo + faixa de vidro) e laje
  b.wall(x, z, w + 1.4, d + 1.4, BASE, 'copper', 0);
  b.box('cud', w + 2.2, 0.6, d + 2.2, x, BASE, z);
  const y0 = BASE + 0.6;
  const total = h - y0;
  const shaftH = total * 0.78;
  // corpo: parede de janelas + pilastras salientes nas 4 faces
  b.wall(x, z, w, d, shaftH, 'copper', y0);
  const fw = 1.2; // largura da pilastra
  const fd = 0.9; // quanto sai da parede
  for (const fx of [-w / 2 + 0.7, -w / 6, w / 6, w / 2 - 0.7]) for (const sz of [-1, 1]) b.box('cu', fw, shaftH, fd, x + fx, y0, z + sz * (d / 2 + fd / 2 - 0.05));
  for (const fz of [-d / 2 + 0.7, -d / 6, d / 6, d / 2 - 0.7]) for (const sx of [-1, 1]) b.box('cu', fd, shaftH, fw, x + sx * (w / 2 + fd / 2 - 0.05), y0, z + fz);
  // cornijas do corpo
  const top = y0 + shaftH;
  b.box('cud', w + 1.2, 0.7, d + 1.2, x, top, z);
  // bloco recuado com faixas horizontais
  const bw = w * 0.72;
  const bd = d * 0.72;
  const bh = total * 0.14;
  b.wall(x, z, bw, bd, bh, 'copper', top + 0.7);
  for (let y = top + 0.7 + bh / 3; y < top + 0.7 + bh; y += bh / 3) b.box('cud', bw + 0.5, 0.35, bd + 0.5, x, y - 0.17, z);
  const roofY = top + 0.7 + bh;
  b.box('cud', bw + 0.8, 0.7, bd + 0.8, x, roofY, z);
  // casa de máquinas, caixas e antena treliçada
  b.box('cu', bw * 0.5, 2.6, bd * 0.5, x, roofY + 0.7, z);
  b.box('metal', 1.2, 1.2, 1.2, x + bw * 0.3, roofY + 0.7, z - bd * 0.25);
  b.box('metal', 0.4, 16, 0.4, x - bw * 0.2, roofY + 0.7, z + bd * 0.2);
  b.box('metal', 1.4, 0.15, 1.4, x - bw * 0.2, roofY + 7, z + bd * 0.2);
}

function addBuilding(b: Batch, s: Spec, helipads: THREE.Mesh[], hpTex: THREE.Texture, name: string): void {
  const r = R(s.sx0, s.sx1, s.sz0, s.sz1);
  const x = (r.x0 + r.x1) / 2;
  const z = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const { h, kind } = s;
  // off: quanto o térreo sai da caixa; bay/col: grade de colunas da parede do térreo (térreo escuro e cobre: baia 4,2 com pilar na esquerda; outros: a baia do tipo)
  footprints.push({ name, r, off: s.plinth || kind === 'copper' ? 0.7 : 0, bay: s.plinth || kind === 'copper' ? 4.2 : KIND_CFG[kind].bay, col: s.plinth || kind === 'copper' ? 7 / 64 : 0, shops: kind !== 'house' });
  addBox(r.x0, r.x1, r.z0, r.z1, h, kind === 'house' ? '#a8a08e' : kind === 'glass' || kind === 'dark' ? '#6b7f94' : kind === 'copper' ? '#7a4a34' : '#b4ab98');

  if (kind === 'copper') { addCopperTower(b, x, z, w, d, h); return; }

  // Casas: paredes + telhado de quatro águas
  if (kind === 'house') {
    b.wall(x, z, w, d, h - 2.2 > 3 ? h - 2.2 : h, 'house');
    b.hip(s.roof === 'red' ? 'redroof' : 'grayroof', x, z, w + 0.8, d + 0.8, h - 2.2 > 3 ? h - 2.2 : h, 3.2);
    if (ROOF_DETAILS) b.box('roof', 1, 2, 1, x + w * 0.2, h, z - d * 0.1); // chaminé
    return;
  }

  // Térreo (loja/hall) mais largo e escuro, com marquise
  let y0 = 0;
  if (s.plinth) {
    b.wall(x, z, w + 1.4, d + 1.4, 7, 'dark');
    b.box('roof', w + 2.6, 0.5, d + 2.6, x, 7, z);
    y0 = 7.5;
  }
  if (s.roof) {
    // prédio baixo com telhado de quatro águas (conjuntos de casas da maquete)
    b.wall(x, z, w, d, h, kind, 0);
    b.hip(s.roof === 'red' ? 'redroof' : 'grayroof', x, z, w + 0.8, d + 0.8, h, 3.6);
    return;
  }
  const crown = h >= 60;
  const total = h - y0;
  const bodyH = crown ? total * 0.72 : total;
  b.wall(x, z, w, d, bodyH, kind, y0);
  // Lajes salientes a cada 4 andares
  const floorH = KIND_CFG[kind].floor;
  for (let y = y0 + floorH * 6; y < y0 + bodyH - 1; y += floorH * 6) b.box('roof', w + 0.35, 0.25, d + 0.35, x, y, z);
  let top = y0 + bodyH;
  if (crown) {
    const h2 = total * 0.2;
    b.wall(x, z, w * 0.84, d * 0.84, h2, kind, top);
    top += h2;
    const h3 = total * 0.08;
    b.wall(x, z, w * 0.6, d * 0.6, h3, kind, top);
    top += h3;
  }
  // Coroamento, casa de máquinas, caixa d'água, ar-condicionado
  const rw = w * (crown ? 0.64 : 1.03);
  const rd = d * (crown ? 0.64 : 1.03);
  b.box('roof', rw, 0.7, rd, x, top, z);
  top += 0.7;
  if (ROOF_DETAILS) {
    b.box('gray', rw * 0.34, 3.2, rd * 0.3, x - rw * 0.18, top, z + rd * 0.12);
    b.cyl('metal', 1.3, 2.4, x + rw * 0.2, top, z - rd * 0.18, 10);
    b.cyl('gray', 1.4, 0.3, x + rw * 0.2, top + 2.4, z - rd * 0.18, 10);
    if (s.ac) {
      // ventiladores redondos, como no prédio grande da foto
      for (let i = 0; i < 4; i++) {
        b.cyl('metal', 1.0, 0.7, x + rw * (-0.3 + i * 0.2), top, z + rd * 0.3, 12);
        b.cyl('gray', 0.75, 0.15, x + rw * (-0.3 + i * 0.2), top + 0.7, z + rd * 0.3, 12);
      }
    }
    for (let i = 0; i < (s.ac ? 3 : 2); i++) b.box('gray', 2, 1.3, 2, x + (rand() - 0.5) * rw * 0.7, top, z + (rand() - 0.5) * rd * 0.7);
  } else {
    for (let i = 0; i < (s.ac ? 6 : 4); i++) rand(); // mantém a sequência do gerador: árvores e fachadas continuam nos mesmos lugares
  }
  if (s.antenna) {
    const ax = x + rw * 0.26;
    const az = z - rd * 0.22;
    b.cyl('white2', 0.16, 30, ax, top, az, 6);
    for (let i = 0; i < 5; i++) b.cyl('red', 0.2, 3.2, ax, top + 2 + i * 6, az, 6);
    b.cyl('white2', 0.13, 18, ax + 2.6, top, az + 1.6, 6);
  }
  // Aparelhos de ar-condicionado e floreiras na fachada (lados que dão para a rua)
  if (kind === 'cream' || kind === 'ochre') {
    for (let i = 0; i < 9; i++) {
      const fy = y0 + 3 + Math.floor(rand() * (bodyH / floorH - 1)) * floorH;
      const fz = (rand() > 0.5 ? 1 : -1) * (d / 2 + 0.25);
      b.box('gray', 1.1, 0.8, 0.5, x + (rand() - 0.5) * (w - 3), fy, z + fz);
    }
  }
  if (ROOF_DETAILS && s.helipad) {
    const sz = Math.min(rw, rd) * 0.7;
    const hp = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), new THREE.MeshLambertMaterial({ map: hpTex }));
    hp.rotation.x = -Math.PI / 2;
    hp.position.set(x, top + 0.05, z);
    helipads.push(hp);
  }
}

// ---------- chão ----------

function flat(w: number, d: number, x: number, z: number, y: number, tex: THREE.Texture | null, color = 0xffffff, transparent = false): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({ map: tex, color, transparent, polygonOffset: true, polygonOffsetFactor: -y * 100, polygonOffsetUnits: -y * 100 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}
const flatRect = (r: Rect, y: number, tex: THREE.Texture | null, color = 0xffffff, transparent = false): THREE.Mesh =>
  flat(r.x1 - r.x0, r.z1 - r.z0, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, y, tex, color, transparent);

// ---------- trânsito ao fundo (decorativo, sem colisão) ----------


// ---------- a cidade ----------

export function createCity(): THREE.Group {
  const city = new THREE.Group();
  COLLIDERS.length = 0;
  ROADS.length = 0;
  PARKS.length = 0;
  PLACES.length = 0;
  footprints.length = 0;
  TRAFFIC.length = 0;
  TREES.length = 0;
  ROADS.push(AVENUE, ...STREETS);
  PARKS.push(TRIANON);
  PLACES.push(
    { name: 'MASP', rect: PLAZA },
    { name: 'PARQUE TRIANON', rect: R(-56, -4, -62, -34) },
    { name: 'AV. PAULISTA', rect: AVENUE },
    { name: 'CALÇADA DA PAULISTA', rect: WALK },
    ...STREETS.map((r, i) => ({ name: `RUA TRANSVERSAL ${i + 1}`, rect: r })),
  );

  const W = RX * 2;
  const D = RZ * 2;

  // Calçada (chão base)
  city.add(flat(W, D, 0, 0, 0, plainPavers(W / 4, D / 4)));
  // Calçadão (padrão em H) na frente do MASP e na calçada sul
  city.add(flatRect(PLAZA, 0.012, calcadao((PLAZA.x1 - PLAZA.x0) / 3, (PLAZA.z1 - PLAZA.z0) / 3)));
  city.add(flatRect(PAVERS_S, 0.012, calcadao((PAVERS_S.x1 - PAVERS_S.x0) / 3, (PAVERS_S.z1 - PAVERS_S.z0) / 3)));
  city.add(flatRect({ x0: -HX, x1: HX, z0: 12, z1: 19 }, 0.014, calcadao((HX * 2) / 3, 7 / 3)));
  city.add(flatRect({ x0: -HX, x1: HX, z0: -19, z1: -12 }, 0.014, calcadao((HX * 2) / 3, 7 / 3)));

  // Avenida: asfalto, faixa vermelha central com bordas brancas e linhas de faixa
  city.add(flatRect(AVENUE, 0.02, asphalt(W / 8, 3)));
  city.add(flat(W, 3.4, 0, 0, 0.03, null, 0xb34a3c));
  for (const z of [-1.8, 1.8]) city.add(flat(W, 0.18, 0, z, 0.035, null, 0xf0f0f0));
  for (const z of [-6.5, 6.5]) {
    const dash = dashTex();
    dash.repeat.set(W / 6, 1);
    city.add(flat(W, 0.25, 0, z, 0.035, dash, 0xffffff, true));
  }
  // Rua em volta da cidade (perimetral): 4 faixas de asfalto com linha central tracejada, ligadas à avenida e às ruas transversais
  const RING_RECTS: Rect[] = [
    { x0: -RX, x1: RX, z0: HZ, z1: RZ }, { x0: -RX, x1: RX, z0: -RZ, z1: -HZ },
    { x0: HX, x1: RX, z0: -HZ, z1: HZ }, { x0: -RX, x1: -HX, z0: -HZ, z1: HZ },
  ];
  RING_RECTS.forEach((r, i) => {
    city.add(flatRect(r, 0.02, asphalt((r.x1 - r.x0) / 8, (r.z1 - r.z0) / 8)));
    const horiz = i < 2;
    const len = horiz ? r.x1 - r.x0 : r.z1 - r.z0;
    const dash = dashTex();
    if (horiz) dash.repeat.set(len / 6, 1); else dash.repeat.set(1, len / 6);
    city.add(flat(horiz ? len : 0.22, horiz ? 0.22 : len, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 0.035, dash, 0xffffff, true));
  });
  ROADS.push(...RING_RECTS);
  PLACES.push({ name: 'AV. PERIMETRAL', rect: { x0: -RX, x1: RX, z0: -RZ, z1: RZ } });

  // Ruas transversais com faixa central tracejada
  for (const r of STREETS) {
    const len = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    city.add(flat(r.x1 - r.x0, len, cx, cz, 0.02, asphalt(1.2, len / 8)));
    const dash = dashTex();
    dash.repeat.set(1, len / 6);
    city.add(flat(0.22, len, cx, cz, 0.035, dash, 0xffffff, true));
  }
  // Faixas de pedestre: nas ruas (junto à avenida) e atravessando a avenida
  const zebra = canvasTex(64, (g, s) => { g.clearRect(0, 0, s, s); g.fillStyle = '#eee'; for (let i = 0; i < 4; i++) g.fillRect(i * 16 + 2, 0, 9, s); });
  const zebraH = canvasTex(64, (g, s) => { g.clearRect(0, 0, s, s); g.fillStyle = '#eee'; for (let i = 0; i < 4; i++) g.fillRect(0, i * 16 + 2, s, 9); });
  for (const r of N_STREETS) city.add(flat(r.x1 - r.x0, 3.2, (r.x0 + r.x1) / 2, 15.5, 0.04, zebraH, 0xffffff, true));
  for (const r of S_STREETS) city.add(flat(r.x1 - r.x0, 3.2, (r.x0 + r.x1) / 2, -15.5, 0.04, zebraH, 0xffffff, true));
  for (const r of [...N_STREETS, ...S_STREETS]) city.add(flat(3.2, 24, (r.x0 + r.x1) / 2 + (r.x1 - r.x0) / 2 + 3, 0, 0.04, zebra, 0xffffff, true));

  // Esquinas arredondadas (raio de 4 m) onde as ruas encontram a avenida
  const fillet = (cx: number, cz: number, sx: 1 | -1, sz: 1 | -1, r = 4): void => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(r, 0);
    sh.absarc(r, r, r, -Math.PI / 2, -Math.PI, true);
    sh.lineTo(0, 0);
    const g = new THREE.ShapeGeometry(sh, 10);
    g.scale(sx, -sz, 1);
    if (sx * -sz < 0) { // espelhar inverte a face: desvira os triângulos para a esquina não ficar escura
      const idx = g.index!;
      for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i); idx.setX(i, idx.getX(i + 2)); idx.setX(i + 2, a); }
    }
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: asphalt(0.4, 0.4), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, 0.025, cz);
    m.receiveShadow = true;
    city.add(m);
  };
  for (const r of N_STREETS) { fillet(r.x0, 12, -1, 1); fillet(r.x1, 12, 1, 1); }
  for (const r of S_STREETS) { fillet(r.x0, -12, -1, -1); fillet(r.x1, -12, 1, -1); }

  // Parque Trianon (grama) e alamedas
  const grass = canvasTex(64, (g, s) => { g.fillStyle = '#4f8a45'; g.fillRect(0, 0, s, s); for (let i = 0; i < 200; i++) { g.fillStyle = rand() > 0.5 ? '#5d9b52' : '#3f7539'; g.fillRect(rand() * s, rand() * s, 2, 2); } }, 14, 6);
  city.add(flatRect(TRIANON, 0.02, grass));
  const pathTex = plainPavers(4, 4);
  city.add(flat(3, TRIANON.z1 - TRIANON.z0, (TRIANON.x0 + TRIANON.x1) / 2, (TRIANON.z0 + TRIANON.z1) / 2, 0.03, pathTex));
  city.add(flat(TRIANON.x1 - TRIANON.x0, 3, (TRIANON.x0 + TRIANON.x1) / 2, (TRIANON.z0 + TRIANON.z1) / 2, 0.03, pathTex));
  // Estacionamento
  city.add(flatRect(PARKING, 0.02, parkingTex()));

  // ---- prédios (posições no espaço da foto) ----
  const b = new Batch();
  const helipads: THREE.Mesh[] = [];
  const hpTex = helipadTex();
  /** Altura dos prédios = metade da original (metade dos andares); casas não mudam; com térreo (plinth) fica pelo menos 18 m, os outros 10 m */
  const S = (n: string, sx0: number, sx1: number, sz0: number, sz1: number, h: number, kind: Kind, o: Partial<Spec> = {}): void => {
    const m = widenSidewalks(sx0, sx1, sz0, sz1);
    addBuilding(b, { sx0: m.sx0, sx1: m.sx1, sz0: m.sz0, sz1: m.sz1, h: kind === 'house' ? h : Math.max(o.plinth ? 18 : 10, h * BUILDING_SCALE), kind, ...o }, helipads, hpTex, n);
  };

  // Norte, fileira da frente
  S('N2', -104, -86, 19, 40, 46, 'cream');
  S('N1', -77, -58, 19, 41, 70, 'cream', { plinth: true, ac: true });
  S('NT', 18, 46, 19, 50, 96, 'copper', { plinth: true, helipad: true, antenna: true });
  S('NG', 60, 79, 19, 44, 78, 'glass', { plinth: true, antenna: true });
  S('NC', 81, 100, 19, 42, 66, 'cream', { plinth: true });
  // Norte, atrás
  S('NB1', -104, -88, 46, 66, 34, 'cream');
  S('NB2', -76, -62, 46, 64, 30, 'white');
  S('NB3', -60, -48, 44, 60, 26, 'ochre');
  S('H1', -46, -34, 54, 64, 7, 'house', { roof: 'red' });
  S('H2', -32, -20, 54, 66, 9, 'house', { roof: 'gray' });
  S('NM', -16, 2, 52, 74, 30, 'cream');
  S('NR1', 18, 34, 54, 70, 24, 'ochre');
  S('NR2', 36, 46, 54, 76, 38, 'cream');
  S('NR3', 60, 72, 52, 70, 30, 'white');
  S('NR4', 74, 88, 50, 62, 46, 'cream');
  S('NR5', 90, 106, 52, 74, 58, 'cream', { ac: true });
  S('NK1', -104, -88, 70, 84, 40, 'white');
  S('NK2', -76, -62, 68, 84, 28, 'cream');
  S('NK3', -14, 2, 78, 84, 24, 'ochre');
  S('NK4', 20, 40, 78, 84, 32, 'white');
  S('NK5', 76, 90, 66, 84, 70, 'white', { ac: true });
  // Sul
  S('SL1', -106, -78, -38, -19, 46, 'cream', { ac: true, plinth: true });
  S('SL2a', -106, -92, -66, -46, 18, 'ochre', { roof: 'red' });
  S('SL2b', -90, -76, -82, -56, 24, 'cream');
  S('SL2c', -106, -92, -84, -70, 14, 'cream', { roof: 'gray' });
  S('SL3', -48, -30, -44, -27, 9, 'house', { roof: 'gray' });
  S('SH', -2, 10, -44, -28, 8, 'house', { roof: 'gray' });
  S('SL5', -54, -42, -82, -62, 20, 'cream', { roof: 'red' });
  S('SL6', -40, -28, -84, -64, 22, 'ochre', { roof: 'gray' });
  S('SL7', -14, -3, -84, -64, 14, 'cream');
  S('SL4', 2, 16, -84, -64, 10, 'house', { roof: 'red' });
  S('SH2', 50, 72, -84, -60, 80, 'white', { plinth: true, helipad: true });
  S('SLONG', 41, 46, -84, -62, 7, 'house', { roof: 'red' });
  S('SR1', 76, 94, -60, -28, 78, 'cream', { ac: true, plinth: true });
  S('SR2', 96, 108, -40, -19, 40, 'white');
  S('SR3', 96, 108, -84, -46, 22, 'ochre');
  S('SR4', 76, 92, -84, -64, 18, 'cream');

  // Torre de concreto cinza (modelada a partir da foto de referência), de frente para a avenida
  {
    const cx = -44;
    const cz = -33;
    const rect: Rect = { x0: cx - TOWER.w / 2, x1: cx + TOWER.w / 2, z0: cz - TOWER.d / 2, z1: cz + TOWER.d / 2 };
    footprints.push({ name: 'SD', r: rect });
    addBox(rect.x0, rect.x1, rect.z0, rect.z1, TOWER.h, '#6b7f94');
    const tw = buildGrayTower();
    tw.position.set(cx, 0, cz);
    city.add(tw);
  }

  // Postes de luz ao longo da avenida (na calçada, nunca dentro de uma rua lateral) — com colisão
  const poleX = (x: number, side: number): number => {
    for (const r of STREETS) {
      if ((r.z0 > 0) !== (side > 0)) continue; // só as ruas do mesmo lado da avenida
      if (x > r.x0 - 1.4 && x < r.x1 + 1.4) return x < (r.x0 + r.x1) / 2 ? r.x0 - 1.4 : r.x1 + 1.4;
    }
    return x;
  };
  for (let x0 = -100; x0 <= 100; x0 += 22) {
    for (const side of [1, -1]) {
      const x = poleX(x0, side);
      const z = side * 13.4;
      b.cyl('metal', 0.14, 8, x, 0, z, 6);
      b.box('metal', 0.14, 0.14, 2.6, x, 7.8, z - side * 1.2);
      b.box('white2', 0.7, 0.2, 0.35, x, 7.7, z - side * 2.4);
      addBox(x - 0.2, x + 0.2, z - 0.2, z + 0.2, 8, '#6f7378');
      propSpots.push(['poste', x, z]);
    }
  }
  // Abrigos de ônibus
  for (const [x, z] of [[-30, 14.2], [40, -14.2], [-70, -14.2], [70, 14.2]] as const) {
    b.box('metal', 4, 0.2, 1.6, x, 2.6, z);
    b.box('glassfx', 4, 2.4, 0.1, x, 0.2, z + (z > 0 ? 0.7 : -0.7));
    b.box('metal', 0.15, 2.6, 0.15, x - 1.9, 0, z);
    b.box('metal', 0.15, 2.6, 0.15, x + 1.9, 0, z);
    const back = z + (z > 0 ? 0.7 : -0.7);
    addBox(x - 2, x + 2, back - 0.15, back + 0.15, 2.6, '#8a9aa6'); // vidro do fundo
    for (const px of [x - 1.9, x + 1.9]) addBox(px - 0.1, px + 0.1, z - 0.1, z + 0.1, 2.6, '#6f7378');
    propSpots.push(['abrigo', x, z]);
  }
  // Moldura da maquete (bordas)
  for (const [x, z, w, d] of [[0, RZ + 1.5, W + 6, 3], [0, -RZ - 1.5, W + 6, 3], [RX + 1.5, 0, 3, D], [-RX - 1.5, 0, 3, D]] as const) b.box('wood', w, 4, d, x, 0, z);

  for (const m of b.meshes()) city.add(m);
  for (const hp of helipads) city.add(hp);

  // Carros parados no estacionamento
  const colors = COMMON_COLORS; // cores comuns de carro (nada de cores berrantes)
  const pk = new THREE.Group();
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    if (rand() < 0.25) continue;
    // sem carros parados no mapa (só aparecem os que alguém chamar na Garagem); os sorteios continuam para o resto da cidade não mudar
    pick(colors); pick(CAR_MODELS); void j; void i;
  }
  city.add(pk);

  // Carros estacionados junto ao meio-fio das ruas laterais (com colisão)
  const parked = new THREE.Group();
  for (const st of STREETS) {
    const north = st.z0 > 0;
    let side = rand() < 0.5 ? 1 : -1;
    for (let z = north ? 30 : -30; north ? z < HZ - 8 : z > -HZ + 8; z += north ? 17 : -17) {
      side = -side;
      if (rand() < 0.3) continue;
      pick(colors); pick(CAR_MODELS); rand(); // sem carros estacionados (sorteios mantidos)
    }
  }
  city.add(parked);

  // (Sem trânsito: o mapa Paulista não tem carros, só os chamados pela Garagem)
  // Trânsito antigo na avenida (só carros, dos 3 modelos): pista sul vai para +X (π/2), pista norte para -X
  const lane = 4;
  const veh: [number, number, 1 | -1, number][] = [
    [-90, -lane, 1, 9], [-30, -lane, 1, 10], [70, -lane, 1, 8],
    [90, lane, -1, 9], [20, lane, -1, 10], [-80, lane, -1, 8],
  ];
  for (const [, , , speed] of veh) { pick(colors); pick(CAR_MODELS); void speed; } // sem trânsito (sorteios mantidos)

  // Árvores: parque denso (carvalhos, pinheiros, bordos, bétulas), calçadas, ruas e praça. Alturas reais.
  const trees: TreeSpec[] = [];
  const nearBuilding = (x: number, z: number, m = 1.5): boolean => footprints.some((f) => x > f.r.x0 - m && x < f.r.x1 + m && z > f.r.z0 - m && z < f.r.z1 + m);
  const tall = (sp: Species): number => rand() * (HEIGHT[sp][1] - HEIGHT[sp][0]) + HEIGHT[sp][0];
  const spot = (x: number, z: number, sp: Species): void => { trees.push({ x, z, h: tall(sp), species: sp }); };
  const pickStreet = (): Species => { const r = rand(); return r < 0.5 ? 'maple' : r < 0.8 ? 'birch' : 'oak'; };
  const clearedPark = (x: number, z: number): boolean =>
    Math.abs(x - (TRIANON.x0 + TRIANON.x1) / 2) < 2 || Math.abs(z - (TRIANON.z0 + TRIANON.z1) / 2) < 2;
  // parque: o lado leste (no mundo, x de 2 a 32) concentra as árvores grandes, como na maquete
  const parkTrees: { x: number; z: number; gap: number }[] = [];
  for (let i = 0; i < 160; i++) {
    if (parkTrees.length >= 62) break;
    const x = TRIANON.x0 + 2 + rand() * (TRIANON.x1 - TRIANON.x0 - 4);
    const z = TRIANON.z0 + 2 + rand() * (TRIANON.z1 - TRIANON.z0 - 4);
    if (clearedPark(x, z)) continue;
    const dense = x > 2 && x < 32;
    const r = rand();
    const sp: Species = dense ? (r < 0.5 ? 'oak' : r < 0.68 ? 'pine' : r < 0.88 ? 'maple' : 'birch') : (r < 0.3 ? 'oak' : r < 0.5 ? 'pine' : r < 0.78 ? 'maple' : 'birch');
    if (nearBuilding(x, z, sp === 'oak' ? 5 : 3)) continue;
    // distância mínima entre árvores grandes (troncos sólidos não podem formar parede)
    const gap = sp === 'oak' ? 7 : sp === 'pine' ? 5 : 4;
    if (parkTrees.some((t) => Math.hypot(t.x - x, t.z - z) < (t.gap + gap) / 2)) continue;
    parkTrees.push({ x, z, gap });
    spot(x, z, sp);
  }
  for (let i = 0; i < 70; i++) {
    const x = TRIANON.x0 + 1 + rand() * (TRIANON.x1 - TRIANON.x0 - 2);
    const z = TRIANON.z0 + 1 + rand() * (TRIANON.z1 - TRIANON.z0 - 2);
    if (!nearBuilding(x, z, 0.5)) trees.push({ x, z, h: HEIGHT.bush[0] + rand() * (HEIGHT.bush[1] - HEIGHT.bush[0]), species: 'bush' });
  }
  const onCrosswalk = (x: number): boolean => STREETS.some((r) => x > r.x0 - 6 && x < r.x1 + 6);
  for (let x = -104; x <= 104; x += 9) {
    if (onCrosswalk(x)) continue;
    const plaza = x > PLAZA.x0 && x < PLAZA.x1;
    spot(x, -16.4, pickStreet());
    if (!plaza) spot(x, 16.4, pickStreet());
    else if (rand() < 0.3) trees.push({ x, z: 20.5, h: 1.5, species: 'bush' });
  }
  for (const r of STREETS) {
    const north = r.z0 > 0;
    for (let z = north ? 26 : -26; north ? z < HZ - 4 : z > -HZ + 4; z += north ? 15 : -15) {
      for (const x of [r.x0 - 1.6, r.x1 + 1.6]) if (!nearBuilding(x, z, 2)) spot(x, z, rand() < 0.6 ? 'maple' : 'birch');
    }
  }
  // fileira de arbustos atrás do MASP e árvores ao redor da praça
  for (let x = PLAZA.x0 + 3; x < PLAZA.x1 - 2; x += 4.5) trees.push({ x, z: 48.5, h: 1.3, species: 'bush' });
  // (o canto oeste da praça invade a rua lateral: as árvores dele ficam na calçada da rua, em x = -4,4)
  for (const [x, z] of [[-4.4, 33.5], [PLAZA.x1 - 0.5, 22], [PLAZA.x1 - 0.5, 36]] as const) spot(x, z, rand() < 0.5 ? 'maple' : 'birch');
  // copa não pode entrar no prédio: tira árvores cuja copa atravessaria uma fachada
  const crown: Record<string, number> = { oak: 0.4, pine: 0.2, maple: 0.3, birch: 0.2, bush: 0 };
  const placed = trees.filter((t) => t.species === 'bush' || !nearBuilding(t.x, t.z, crown[t.species]! * t.h + 0.4));
  const treeGroup = makeTrees(placed);
  city.add(treeGroup);
  registerCullChildren(treeGroup, FAR_TREES);

  // Bancos e jardineiras (dá para escalar)
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x8c8f93 });
  const plantMat = new THREE.MeshLambertMaterial({ color: 0x7b6a58 });
  const planterBushes: TreeSpec[] = [];
  const props: [number, number, number, number, number, THREE.Material][] = [
    [45, 17.6, 3.2, 3.2, 1.1, plantMat], [5, 17.6, 3.2, 3.2, 1.6, plantMat], [25, 20.4, 6, 0.8, 0.5, benchMat],
    [40, 23, 2.2, 0.7, 0.5, benchMat], [10, 23, 2.2, 0.7, 0.5, benchMat],
    [20, -17.6, 6, 0.8, 0.5, benchMat], [-10, -17.6, 3.2, 3.2, 1.2, plantMat], [60, -17.6, 3.2, 3.2, 1.1, plantMat],
    [-45, 17.6, 3.2, 3.2, 1.6, plantMat], [-64, -17.6, 5, 0.8, 0.5, benchMat],
  ];
  for (const prop of props) {
    const [x0, z, w, d, h, mat] = prop;
    // jardineiras e bancos não ficam em cima das ruas transversais: vão para a calçada ao lado
    const street = STREETS.find((r) => x0 + w / 2 > r.x0 - 1.5 && x0 - w / 2 < r.x1 + 1.5);
    const x = street ? street.x1 + 9 + w / 2 : x0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    city.add(m);
    if (mat === plantMat) {
      // arbusto de verdade na jardineira (ramos e folhas), em vez de uma forma lisa
      const n = Math.max(1, Math.round(Math.min(w, d) / 1.6));
      for (let i = 0; i < n * n; i++) {
        const ox = ((i % n) + 0.5) / n - 0.5;
        const oz = (Math.floor(i / n) + 0.5) / n - 0.5;
        planterBushes.push({ x: x + ox * (w - 1.2), z: z + oz * (d - 1.2), y: h - 0.05, h: 1.2 + rand() * 0.6, species: 'bush' });
      }
    }
    addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h, '#7b6a58');
  }

  city.add(makeTrees(planterBushes));

  // Totens semafóricos "Av. Paulista": um em cada extremidade da faixa de pedestre que atravessa a avenida entre o MASP e o prédio de cobre (faixa em x ≈ -3), na calçada, de frente para a travessia
  placeTotem(city, -0.7, 13.4, Math.PI);
  placeTotem(city, -0.7, -13.4, 0);

  // Escultura "Safra" na calçada em frente ao prédio de cobre (NT), girada 90°: as letras ficam dos dois lados, de frente para quem anda pela calçada
  placeSafraSign(city, -23, 15.6, Math.PI / 2);

  // Lojas no térreo de cada prédio (vitrine com cartaz, porta, letreiro e toldo); sem colisão
  addShops(city, footprints.map((f) => ({ name: f.name, r: f.r, off: f.off ?? 0, bay: f.bay ?? 4.2, col: f.col ?? 0, shops: f.shops })), { hx: HX, hz: HZ });

  validate();
  void loadMasp(city);
  return city;
}

/** Confere (só em desenvolvimento) se algum prédio caiu em rua, avenida ou calçada, ou se dois prédios se sobrepõem. */
function validate(): void {
  if (!import.meta.env.DEV) return;
  const hit = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
  const bad: string[] = [];
  for (const f of footprints) {
    if (hit(f.r, WALK)) bad.push(`${f.name} está na avenida/calçada`);
    for (const s of STREETS) if (hit(f.r, s)) bad.push(`${f.name} está em uma rua`);
    if (hit(f.r, PARKING)) bad.push(`${f.name} está no estacionamento`);
    if (f.r.x0 < -HX || f.r.x1 > HX || f.r.z0 < -HZ || f.r.z1 > HZ) bad.push(`${f.name} passa do limite do mapa`);
  }
  for (let i = 0; i < footprints.length; i++) for (let j = i + 1; j < footprints.length; j++) {
    if (hit(footprints[i]!.r, footprints[j]!.r)) bad.push(`${footprints[i]!.name} e ${footprints[j]!.name} se sobrepõem`);
  }
  for (const [name, x, z] of propSpots) {
    if (hit({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2 }, AVENUE)) bad.push(`${name} em (${x.toFixed(1)}, ${z.toFixed(1)}) está na avenida`);
    for (const st of STREETS) if (hit({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2 }, st)) bad.push(`${name} em (${x.toFixed(1)}, ${z.toFixed(1)}) está numa rua lateral`);
  }
  if (bad.length) console.warn('CIDADE: problemas no layout:\n' + bad.join('\n'));
  else console.info(`CIDADE: layout ok (${footprints.length} prédios, nenhum em rua ou calçada)`);
}

/** MASP: modelo 3D no meio da calçada norte. Pilares sólidos, volume de vidro suspenso (passa por baixo). */
async function loadMasp(city: THREE.Group): Promise<void> {
  const s = MASP.length / MASP_SRC.len;
  try {
    const gltf = await new GLTFLoader().loadAsync('/models/map/masp.glb');
    const m = gltf.scene;
    m.scale.setScalar(s);
    m.position.set(MASP.x - MASP_SRC.cx * s, -MASP_SRC.groundY * s, MASP.z - MASP_SRC.cz * s);
    m.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    city.add(m);
  } catch (e) {
    console.warn('MASP não carregou:', e);
  }
  const wx = (mx: number): number => MASP.x + (mx - MASP_SRC.cx) * s;
  const wz = (mz: number): number => MASP.z + (mz - MASP_SRC.cz) * s;
  const high = (326.2 - MASP_SRC.groundY) * s;
  const glassBottom = (-38.6 - MASP_SRC.groundY) * s;
  for (const [x0, x1, z0, z1] of [[-713, -616, 96, 163], [-713, -616, -184, -118], [691, 788, 96, 163], [691, 788, -184, -118]] as const) {
    addBox(wx(x0), wx(x1), wz(z0), wz(z1), high, '#a33a2e');
  }
  addBox(wx(-621), wx(692), wz(-273), wz(251), (282.4 - MASP_SRC.groundY) * s, '#a33a2e', glassBottom);
}
