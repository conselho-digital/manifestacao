import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addBox, COLLIDERS, MAP, PARKS, PLACES, ROADS, TREES, type Rect } from './map';

// Cidade inspirada na maquete da Av. Paulista (SP). O layout é escrito "como na foto" (x para a direita,
// z para o norte) e convertido para o mundo espelhando o eixo X (R(): x_mundo = -x_foto).

const HX = MAP.halfX;
const HZ = MAP.halfZ;
/** retângulo no espaço da foto -> retângulo do mundo */
const R = (sx0: number, sx1: number, sz0: number, sz1: number): Rect => ({ x0: -sx1, x1: -sx0, z0: sz0, z1: sz1 });

const AVENUE: Rect = { x0: -HX, x1: HX, z0: -12, z1: 12 };
const WALK: Rect = { x0: -HX, x1: HX, z0: -19, z1: 19 }; // avenida + calçadas
const N_STREETS = [R(-85, -77, 12, HZ), R(6, 16, 12, HZ), R(48, 58, 12, HZ)];
const S_STREETS = [R(-74, -64, -HZ, -12), R(18, 27, -HZ, -12)];
const STREETS = [...N_STREETS, ...S_STREETS];
const TRIANON = R(-62, -8, -60, -34);
const PAVERS_S = R(-62, 16, -34, -19);
const PLAZA = R(-58, 8, 19, 46);
const PARKING = R(28, 40, -84, -60);

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

type Kind = 'cream' | 'white' | 'ochre' | 'glass' | 'dark' | 'house';
interface Spec {
  /** no espaço da foto */
  sx0: number; sx1: number; sz0: number; sz1: number;
  h: number; kind: Kind;
  helipad?: boolean; antenna?: boolean; ac?: boolean; plinth?: boolean;
  roof?: 'red' | 'gray';
}

const KIND_CFG: Record<Kind, { bay: number; floor: number }> = {
  cream: { bay: 3.4, floor: 3.2 }, ochre: { bay: 3.4, floor: 3.2 }, white: { bay: 5.5, floor: 3.4 },
  glass: { bay: 2.4, floor: 3.6 }, dark: { bay: 4.2, floor: 3.6 }, house: { bay: 3.5, floor: 3.0 },
};

class Batch {
  private readonly groups = new Map<string, THREE.BufferGeometry[]>();
  private readonly materials = new Map<string, THREE.Material>();

  constructor() {
    const lam = (m: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial(m);
    const t = (k: string, mat: THREE.Material): void => { this.materials.set(k, mat); };
    t('cream', lam({ map: punched('#f1e8d3', '#dcd1b9', '#566b7d', '#a39a85'), vertexColors: true }));
    t('ochre', lam({ map: punched('#ecd4a6', '#d3b983', '#52657a', '#9c855a'), vertexColors: true }));
    t('white', lam({ map: ribbon('#f6f3ec', '#dedacc', '#5f7385'), vertexColors: true }));
    t('glass', lam({ map: curtain('#6f9ac0', '#3f5b78', '#26384a'), vertexColors: true }));
    t('dark', lam({ map: piers(), vertexColors: true }));
    t('house', lam({ map: houseTex(), vertexColors: true }));
    t('roof', lam({ color: 0xd6d0c1 }));
    t('gray', lam({ color: 0xb9bcc0 }));
    t('metal', lam({ color: 0x5d6168 }));
    t('white2', lam({ color: 0xf2f2f2 }));
    t('red', lam({ color: 0xc0392b }));
    t('redroof', lam({ color: 0xa4482f }));
    t('grayroof', lam({ color: 0x80868d }));
    t('glassfx', lam({ color: 0x9fc3d9 }));
    t('wood', lam({ color: 0x7a4a2e }));
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

const footprints: { name: string; r: Rect; allowWalk?: boolean }[] = [];

function addBuilding(b: Batch, s: Spec, helipads: THREE.Mesh[], hpTex: THREE.Texture, name: string): void {
  const r = R(s.sx0, s.sx1, s.sz0, s.sz1);
  const x = (r.x0 + r.x1) / 2;
  const z = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const { h, kind } = s;
  footprints.push({ name, r });
  addBox(r.x0, r.x1, r.z0, r.z1, h, kind === 'house' ? '#a8a08e' : kind === 'glass' || kind === 'dark' ? '#6b7f94' : '#b4ab98');

  // Casas: paredes + telhado de quatro águas
  if (kind === 'house') {
    b.wall(x, z, w, d, h - 2.2 > 3 ? h - 2.2 : h, 'house');
    b.hip(s.roof === 'red' ? 'redroof' : 'grayroof', x, z, w + 0.8, d + 0.8, h - 2.2 > 3 ? h - 2.2 : h, 3.2);
    b.box('roof', 1, 2, 1, x + w * 0.2, h, z - d * 0.1); // chaminé
    return;
  }

  // Térreo (loja/hall) mais largo e escuro, com marquise
  let y0 = 0;
  if (s.plinth) {
    b.wall(x, z, w + 1.4, d + 1.4, 7, 'dark');
    b.box('roof', w + 2.6, 0.5, d + 2.6, x, 7, z);
    y0 = 7.5;
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
  b.box('gray', rw * 0.34, 3.2, rd * 0.3, x - rw * 0.18, top, z + rd * 0.12);
  b.cyl('metal', 1.3, 2.4, x + rw * 0.2, top, z - rd * 0.18, 10);
  b.cyl('gray', 1.4, 0.3, x + rw * 0.2, top + 2.4, z - rd * 0.18, 10);
  for (let i = 0; i < (s.ac ? 5 : 2); i++) b.box('gray', 2, 1.3, 2, x + (rand() - 0.5) * rw * 0.7, top, z + (rand() - 0.5) * rd * 0.7);
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
  if (s.helipad) {
    const sz = Math.min(rw, rd) * 0.7;
    const hp = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), new THREE.MeshLambertMaterial({ map: hpTex }));
    hp.rotation.x = -Math.PI / 2;
    hp.position.set(x, top + 0.05, z);
    helipads.push(hp);
  }
}

// ---------- árvores ----------

const GREENS = ['#2f5d2a', '#3b7231', '#46803a', '#5f8a35', '#7d9a3a', '#2a4f2b'];

interface TreeSpec { x: number; z: number; s: number; kind: 'round' | 'tall' | 'bush' }

function makeTrees(list: TreeSpec[]): THREE.Group {
  const blobs: { p: THREE.Vector3; s: THREE.Vector3; c: THREE.Color }[] = [];
  const trunks: { p: THREE.Vector3; h: number; r: number }[] = [];
  for (const t of list) {
    const base = new THREE.Color(pick(GREENS));
    const mk = (dx: number, y: number, dz: number, sx: number, sy: number): void => {
      const c = base.clone().offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.08);
      blobs.push({ p: new THREE.Vector3(t.x + dx, y, t.z + dz), s: new THREE.Vector3(sx, sy, sx), c });
    };
    const s = t.s;
    if (t.kind === 'bush') {
      mk(0, 0.5 * s, 0, 0.8 * s, 0.65 * s);
      mk(0.5 * s, 0.4 * s, 0.2 * s, 0.55 * s, 0.5 * s);
    } else if (t.kind === 'tall') {
      trunks.push({ p: new THREE.Vector3(t.x, 0, t.z), h: 2.6 * s * 0.5, r: 0.2 });
      addBox(t.x - 0.28, t.x + 0.28, t.z - 0.28, t.z + 0.28, 5, '#5b4333');
      TREES.push({ x: t.x, y: 2.6 * s * 0.5 + 1.4 * s, z: t.z, r: 1.0 * s });
      mk(0, 2.6 * s * 0.5 + 1.2 * s, 0, 0.85 * s, 1.35 * s);
      mk(0, 2.6 * s * 0.5 + 2.5 * s, 0, 0.6 * s, 0.9 * s);
    } else {
      trunks.push({ p: new THREE.Vector3(t.x, 0, t.z), h: 2.4 * s * 0.55, r: 0.22 * Math.max(1, s * 0.6) });
      const y = 2.4 * s * 0.55;
      const tr = 0.3 + 0.1 * Math.min(2, s);
      addBox(t.x - tr, t.x + tr, t.z - tr, t.z + tr, 5, '#5b4333');
      TREES.push({ x: t.x, y: y + 1.2 * s, z: t.z, r: 1.3 * s });
      mk(0, y + 0.9 * s, 0, 1.0 * s, 0.9 * s);
      mk(0.75 * s, y + 0.6 * s, 0.3 * s, 0.7 * s, 0.65 * s);
      mk(-0.7 * s, y + 0.7 * s, -0.4 * s, 0.75 * s, 0.7 * s);
      mk(0.1 * s, y + 1.7 * s, 0.1 * s, 0.7 * s, 0.6 * s);
    }
  }
  const g = new THREE.Group();
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), blobs.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  blobs.forEach((b, i) => {
    q.setFromEuler(new THREE.Euler(rand() * 0.5, rand() * 6, rand() * 0.5));
    m.compose(b.p, q, b.s);
    crown.setMatrixAt(i, m);
    crown.setColorAt(i, b.c);
  });
  crown.castShadow = true;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1, 1, 6), new THREE.MeshLambertMaterial({ color: 0x5b4333 }), Math.max(1, trunks.length));
  trunks.forEach((t, i) => {
    m.compose(new THREE.Vector3(t.p.x, t.h / 2, t.p.z), new THREE.Quaternion(), new THREE.Vector3(t.r, t.h, t.r));
    trunk.setMatrixAt(i, m);
  });
  trunk.count = trunks.length;
  trunk.castShadow = true;
  g.add(crown, trunk);
  return g;
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

interface Ambient { obj: THREE.Object3D; dir: 1 | -1; speed: number }
const ambient: Ambient[] = [];

function ambientVehicle(color: number, bus: boolean): THREE.Group {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fc3d9 });
  const len = bus ? 11 : 4;
  const body = new THREE.Mesh(new THREE.BoxGeometry(bus ? 2.5 : 1.8, bus ? 2.6 : 0.7, len), paint);
  body.position.y = bus ? 1.9 : 0.7;
  g.add(body);
  if (bus) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.9, len - 0.8), glass);
    win.position.y = 2.4;
    g.add(win);
  } else {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 2), glass);
    cab.position.set(0, 1.25, -0.2);
    g.add(cab);
  }
  const tire = new THREE.MeshLambertMaterial({ color: 0x1b1b1b });
  const wg = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
  wg.rotateZ(Math.PI / 2);
  for (const [wx, wz] of bus ? [[1.1, 3.4], [-1.1, 3.4], [1.1, -3.4], [-1.1, -3.4]] : [[0.95, 1.3], [-0.95, 1.3], [0.95, -1.3], [-0.95, -1.3]]) {
    const w = new THREE.Mesh(wg, tire);
    w.position.set(wx!, 0.36, wz!);
    g.add(w);
  }
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

/** Anda os carros e ônibus do fundo (chame todo quadro). */
export function updateCity(dt: number): void {
  for (const a of ambient) {
    a.obj.position.x += a.dir * a.speed * dt;
    if (a.obj.position.x > HX + 12) a.obj.position.x = -HX - 12;
    if (a.obj.position.x < -HX - 12) a.obj.position.x = HX + 12;
  }
}

// ---------- a cidade ----------

export function createCity(): THREE.Group {
  const city = new THREE.Group();
  COLLIDERS.length = 0;
  ROADS.length = 0;
  PARKS.length = 0;
  PLACES.length = 0;
  footprints.length = 0;
  ambient.length = 0;
  TREES.length = 0;
  ROADS.push(AVENUE, ...STREETS);
  PARKS.push(TRIANON);
  PLACES.push(
    { name: 'MASP', rect: PLAZA },
    { name: 'PARQUE TRIANON', rect: R(-66, -4, -62, -34) },
    { name: 'AV. PAULISTA', rect: AVENUE },
    { name: 'CALÇADA DA PAULISTA', rect: WALK },
    ...STREETS.map((r, i) => ({ name: `RUA TRANSVERSAL ${i + 1}`, rect: r })),
  );

  const W = HX * 2;
  const D = HZ * 2;

  // Calçada (chão base)
  city.add(flat(W, D, 0, 0, 0, plainPavers(W / 4, D / 4)));
  // Calçadão (padrão em H) na frente do MASP e na calçada sul
  city.add(flatRect(PLAZA, 0.012, calcadao((PLAZA.x1 - PLAZA.x0) / 3, (PLAZA.z1 - PLAZA.z0) / 3)));
  city.add(flatRect(PAVERS_S, 0.012, calcadao((PAVERS_S.x1 - PAVERS_S.x0) / 3, (PAVERS_S.z1 - PAVERS_S.z0) / 3)));
  city.add(flatRect({ x0: -HX, x1: HX, z0: 12, z1: 19 }, 0.014, calcadao(W / 3, 7 / 3)));
  city.add(flatRect({ x0: -HX, x1: HX, z0: -19, z1: -12 }, 0.014, calcadao(W / 3, 7 / 3)));

  // Avenida: asfalto, faixa vermelha central com bordas brancas e linhas de faixa
  city.add(flatRect(AVENUE, 0.02, asphalt(W / 8, 3)));
  city.add(flat(W, 3.4, 0, 0, 0.03, null, 0xb34a3c));
  for (const z of [-1.8, 1.8]) city.add(flat(W, 0.18, 0, z, 0.035, null, 0xf0f0f0));
  for (const z of [-6.5, 6.5]) {
    const dash = dashTex();
    dash.repeat.set(W / 6, 1);
    city.add(flat(W, 0.25, 0, z, 0.035, dash, 0xffffff, true));
  }
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
  const S = (n: string, sx0: number, sx1: number, sz0: number, sz1: number, h: number, kind: Kind, o: Partial<Spec> = {}): void =>
    addBuilding(b, { sx0, sx1, sz0, sz1, h, kind, ...o }, helipads, hpTex, n);

  // Norte, fileira da frente
  S('N2', -104, -86, 19, 40, 46, 'cream');
  S('N1', -77, -58, 19, 41, 70, 'cream', { plinth: true, ac: true });
  S('NT', 18, 46, 19, 50, 96, 'white', { plinth: true, helipad: true, antenna: true });
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
  S('SL2a', -106, -92, -66, -46, 20, 'ochre');
  S('SL2b', -90, -78, -80, -56, 26, 'cream');
  S('SL2c', -106, -92, -82, -70, 16, 'white');
  S('SL3', -50, -30, -44, -27, 9, 'house', { roof: 'gray' });
  S('SH', -2, 10, -44, -28, 8, 'house', { roof: 'gray' });
  S('SL5', -62, -48, -82, -62, 22, 'cream');
  S('SL6', -46, -32, -84, -64, 24, 'white');
  S('SL7', -14, -3, -84, -64, 14, 'cream');
  S('SL4', 2, 16, -84, -64, 10, 'house', { roof: 'red' });
  S('SD', 28, 60, -46, -20, 90, 'dark', { ac: true, antenna: true, plinth: true });
  S('SH2', 50, 72, -84, -60, 80, 'white', { plinth: true, helipad: true });
  S('SLONG', 41, 46, -84, -62, 7, 'house', { roof: 'red' });
  S('SR1', 76, 94, -60, -28, 78, 'cream', { ac: true, plinth: true });
  S('SR2', 96, 108, -40, -19, 40, 'white');
  S('SR3', 96, 108, -84, -46, 22, 'ochre');
  S('SR4', 76, 92, -84, -64, 18, 'cream');

  // Postes de luz ao longo da avenida
  for (let x = -100; x <= 100; x += 22) {
    for (const side of [1, -1]) {
      const z = side * 13.4;
      b.cyl('metal', 0.14, 8, x, 0, z, 6);
      b.box('metal', 0.14, 0.14, 2.6, x, 7.8, z - side * 1.2);
      b.box('white2', 0.7, 0.2, 0.35, x, 7.7, z - side * 2.4);
    }
  }
  // Abrigos de ônibus
  for (const [x, z] of [[-30, 14.2], [40, -14.2], [-70, -14.2], [70, 14.2]] as const) {
    b.box('metal', 4, 0.2, 1.6, x, 2.6, z);
    b.box('glassfx', 4, 2.4, 0.1, x, 0.2, z + (z > 0 ? 0.7 : -0.7));
    b.box('metal', 0.15, 2.6, 0.15, x - 1.9, 0, z);
    b.box('metal', 0.15, 2.6, 0.15, x + 1.9, 0, z);
  }
  // Moldura da maquete (bordas)
  for (const [x, z, w, d] of [[0, HZ + 1.5, W + 6, 3], [0, -HZ - 1.5, W + 6, 3], [HX + 1.5, 0, 3, D], [-HX - 1.5, 0, 3, D]] as const) b.box('wood', w, 3, d, x, 0, z);

  for (const m of b.meshes()) city.add(m);
  for (const hp of helipads) city.add(hp);

  // Carros parados no estacionamento
  const colors = [0xc0392b, 0x2e86c1, 0xecf0f1, 0x27ae60, 0xf1c40f, 0x34495e];
  const pk = new THREE.Group();
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    if (rand() < 0.25) continue;
    const car = ambientVehicle(pick(colors), false);
    car.position.set((PARKING.x0 + PARKING.x1) / 2 - 3 + j * 6, 0, PARKING.z0 + 3 + i * 5.4);
    car.rotation.y = j === 0 ? 0 : Math.PI;
    pk.add(car);
  }
  city.add(pk);

  // Trânsito na avenida: pista sul vai para +X (π/2), pista norte para -X
  const lane = 4;
  const veh: [number, number, boolean, 1 | -1, number][] = [
    [-90, -lane, false, 1, 9], [-40, -lane, true, 1, 7], [10, -lane, false, 1, 10], [70, -lane, false, 1, 8],
    [90, lane, false, -1, 9], [30, lane, true, -1, 7], [-20, lane, false, -1, 10], [-80, lane, false, -1, 8],
  ];
  for (const [x, z, bus, dir, speed] of veh) {
    const o = ambientVehicle(bus ? 0x2e8b57 : pick(colors), bus);
    o.position.set(x, 0, z);
    o.rotation.y = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    city.add(o);
    ambient.push({ obj: o, dir, speed });
  }

  // Árvores: parque denso, calçadas da avenida, ruas e praça
  const trees: TreeSpec[] = [];
  const nearBuilding = (x: number, z: number, m = 1.5): boolean => footprints.some((f) => x > f.r.x0 - m && x < f.r.x1 + m && z > f.r.z0 - m && z < f.r.z1 + m);
  for (let i = 0; i < 260; i++) {
    const x = TRIANON.x0 + 1.5 + rand() * (TRIANON.x1 - TRIANON.x0 - 3);
    const z = TRIANON.z0 + 1.5 + rand() * (TRIANON.z1 - TRIANON.z0 - 3);
    if (Math.abs(x - (TRIANON.x0 + TRIANON.x1) / 2) < 2 || Math.abs(z - (TRIANON.z0 + TRIANON.z1) / 2) < 2 || nearBuilding(x, z)) continue;
    // as árvores grandes se concentram no lado leste do parque, como na maquete
    const big = x > 2 && x < 32 ? 3.2 + rand() * 1.8 : 2.0 + rand() * 1.6;
    trees.push({ x, z, s: big, kind: rand() < 0.2 ? 'tall' : 'round' });
  }
  for (let i = 0; i < 70; i++) {
    const x = TRIANON.x0 + 1 + rand() * (TRIANON.x1 - TRIANON.x0 - 2);
    const z = TRIANON.z0 + 1 + rand() * (TRIANON.z1 - TRIANON.z0 - 2);
    if (!nearBuilding(x, z, 0.5)) trees.push({ x, z, s: 0.9 + rand() * 0.6, kind: 'bush' });
  }
  const onCrosswalk = (x: number): boolean => STREETS.some((r) => x > r.x0 - 6 && x < r.x1 + 6);
  for (let x = -104; x <= 104; x += 8.5) {
    if (onCrosswalk(x)) continue;
    const plaza = x > PLAZA.x0 && x < PLAZA.x1;
    trees.push({ x, z: -16.2, s: 1.5, kind: rand() < 0.3 ? 'tall' : 'round' });
    if (!plaza) trees.push({ x, z: 16.2, s: 1.5, kind: rand() < 0.3 ? 'tall' : 'round' });
    else if (rand() < 0.3) trees.push({ x, z: 20.5, s: 1.2, kind: 'bush' });
  }
  for (const r of STREETS) {
    const north = r.z0 > 0;
    for (let z = north ? 26 : -26; north ? z < HZ - 4 : z > -HZ + 4; z += north ? 13 : -13) {
      for (const x of [r.x0 - 1.4, r.x1 + 1.4]) if (!nearBuilding(x, z, 0.8)) trees.push({ x, z, s: 1.4, kind: 'round' });
    }
  }
  // Fileira de arbustos atrás do MASP e árvores ao redor da praça
  for (let x = PLAZA.x0 + 3; x < PLAZA.x1 - 2; x += 4.5) trees.push({ x, z: 48.5, s: 1.0, kind: 'bush' });
  for (const [x, z] of [[PLAZA.x0 + 0.5, 24], [PLAZA.x1 - 0.5, 22], [PLAZA.x1 - 0.5, 36], [PLAZA.x0 + 0.5, 36]] as const) trees.push({ x, z, s: 1.7, kind: 'round' });
  city.add(makeTrees(trees));

  // Bancos e jardineiras (dá para escalar)
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x8c8f93 });
  const plantMat = new THREE.MeshLambertMaterial({ color: 0x7b6a58 });
  const shrub = new THREE.MeshLambertMaterial({ color: 0x3f7a35 });
  const props: [number, number, number, number, number, THREE.Material][] = [
    [45, 17.6, 3.2, 3.2, 1.1, plantMat], [5, 17.6, 3.2, 3.2, 1.6, plantMat], [25, 20.4, 6, 0.8, 0.5, benchMat],
    [40, 23, 2.2, 0.7, 0.5, benchMat], [10, 23, 2.2, 0.7, 0.5, benchMat],
    [20, -17.6, 6, 0.8, 0.5, benchMat], [-10, -17.6, 3.2, 3.2, 1.2, plantMat], [60, -17.6, 3.2, 3.2, 1.1, plantMat],
    [-45, 17.6, 3.2, 3.2, 1.6, plantMat], [-64, -17.6, 5, 0.8, 0.5, benchMat],
  ];
  for (const [x, z, w, d, h, mat] of props) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    city.add(m);
    if (mat === plantMat) {
      const top = new THREE.Mesh(new THREE.IcosahedronGeometry(Math.min(w, d) * 0.45, 0), shrub);
      top.position.set(x, h + 0.35, z);
      city.add(top);
    }
    addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h, '#7b6a58');
  }

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
