import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addBox, COLLIDERS, MAP, PARKS, PLACES, ROADS, type Rect } from './map';

// Cidade inspirada na maquete da Av. Paulista (SP): avenida larga no meio (leste-oeste),
// MASP na calçada norte, Parque Trianon do lado sul, torres bege, de vidro e com heliponto.

const AVENUE: Rect = { x0: -MAP.halfX, x1: MAP.halfX, z0: -12, z1: 12 };
const SIDE_STREETS: Rect[] = [-56, -14, 64].map((x) => ({ x0: x - 6, x1: x + 6, z0: -MAP.halfZ, z1: MAP.halfZ }));
const TRIANON: Rect = { x0: 6, x1: 50, z0: -66, z1: -22 };

// Posição e escala do MASP (modelo: comprimento ~1500 unidades)
const MASP = { x: 25, z: 40, length: 60 };
const MASP_SRC = { cx: 37.5, cz: -11, groundY: -139.67, len: 1500 };

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const rand = rng(20260);

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------- texturas ----------

const wallTex = (wall: string, slab: string, glass: string, frame: string): THREE.CanvasTexture =>
  canvasTex(64, (g, s) => {
    g.fillStyle = wall; g.fillRect(0, 0, s, s);
    g.fillStyle = slab; g.fillRect(0, s - 6, s, 6);             // laje (embaixo)
    g.fillStyle = frame; g.fillRect(9, 12, s - 18, s - 26);     // moldura da janela
    g.fillStyle = glass; g.fillRect(11, 14, s - 22, s - 30);    // vidro
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(11, 14, s - 22, 6);
  });

const glassTex = (pane: string, spandrel: string, line: string): THREE.CanvasTexture =>
  canvasTex(64, (g, s) => {
    g.fillStyle = spandrel; g.fillRect(0, 0, s, s);
    const grad = g.createLinearGradient(0, 0, 0, s * 0.72);
    grad.addColorStop(0, pane); grad.addColorStop(1, 'rgba(0,0,0,.25)');
    g.fillStyle = pane; g.fillRect(0, s * 0.28, s, s * 0.72);
    g.fillStyle = grad; g.fillRect(0, s * 0.28, s, s * 0.72);
    g.fillStyle = line; g.fillRect(0, s - 3, s, 3); g.fillRect(0, 0, 2, s); g.fillRect(s - 2, 0, 2, s);
  });

function asphaltTex(): THREE.CanvasTexture {
  return canvasTex(128, (g, s) => {
    g.fillStyle = '#3b3e44'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${rand() > 0.5 ? 255 : 0},${rand() > 0.5 ? 255 : 0},${rand() > 0.5 ? 255 : 0},.05)`; g.fillRect(rand() * s, rand() * s, 2, 2); }
  }, 12, 12);
}

function paversTex(base: string, line: string, repeat: number): THREE.CanvasTexture {
  return canvasTex(128, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    g.strokeStyle = line; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.stroke(); g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); }
    // "calçadão" da Paulista: detalhes escuros em ondas
    g.fillStyle = 'rgba(70,70,70,.35)';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) g.fillRect(i * s / 4 + 6, j * s / 4 + 6, s / 4 - 12, s / 4 - 12);
  }, repeat, repeat);
}

const dashTex = (): THREE.CanvasTexture =>
  canvasTex(64, (g, s) => { g.clearRect(0, 0, s, s); g.fillStyle = '#f1f1f1'; g.fillRect(0, 0, s * 0.5, s); }, 1, 1);

function helipadTex(): THREE.CanvasTexture {
  return canvasTex(128, (g, s) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#e8c21a'; g.lineWidth = 8; g.beginPath(); g.arc(s / 2, s / 2, s * 0.4, 0, 6.3); g.stroke();
    g.fillStyle = '#e8c21a'; g.font = `bold ${s * 0.5}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', s / 2, s / 2 + 4);
  });
}

// ---------- prédios (geometria fundida por material) ----------

type Kind = 'beige' | 'glass' | 'dark';
interface Spec { x: number; z: number; w: number; d: number; h: number; kind: Kind; helipad?: boolean; antenna?: boolean; ac?: boolean; tone?: number }

class BuildingBatch {
  private readonly groups = new Map<string, THREE.BufferGeometry[]>();
  private readonly materials = new Map<string, THREE.Material>();

  constructor() {
    const lam = (m: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial(m);
    this.materials.set('beige', lam({ map: wallTex('#e4d9c2', '#c4b99f', '#56697a', '#9d927c'), vertexColors: true }));
    this.materials.set('glass', lam({ map: glassTex('#6f9ac0', '#3f5b78', '#26384a'), vertexColors: true }));
    this.materials.set('dark', lam({ map: glassTex('#44596c', '#252e38', '#161c23'), vertexColors: true }));
    this.materials.set('roof', lam({ color: 0xbdb6a6 }));
    this.materials.set('gray', lam({ color: 0x8a8f95 }));
    this.materials.set('white', lam({ color: 0xf2f2f2 }));
    this.materials.set('red', lam({ color: 0xc0392b }));
    this.materials.set('redroof', lam({ color: 0xa4482f }));
  }

  private push(key: string, g: THREE.BufferGeometry): void {
    if (!g.getAttribute('color')) {
      const n = g.getAttribute('position').count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }
    (this.groups.get(key) ?? this.groups.set(key, []).get(key)!).push(g);
  }

  /** Caixa com janelas: o número de baias/andares é inteiro para a textura não ser cortada. */
  tower(x: number, z: number, w: number, d: number, h: number, kind: Kind, y0 = 0, tone = 1): void {
    const bayW = kind === 'beige' ? 3.4 : 2.4;
    const floorH = kind === 'beige' ? 3.2 : 3.6;
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const faces: [number, number][] = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      const [fw, fh] = faces[f]!;
      for (let i = 0; i < 4; i++) {
        const idx = f * 4 + i;
        if (fw === 0) uv.setXY(idx, 0.03, 0.03); // teto e piso: cor lisa
        else uv.setXY(idx, uv.getX(idx) * Math.max(1, Math.round(fw / bayW)), uv.getY(idx) * Math.max(1, Math.round(fh / floorH)));
      }
    }
    g.translate(x, y0 + h / 2, z);
    const t = 0.9 + rand() * 0.14 * tone;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(24 * 3).map((_, i) => (i % 3 === 2 ? t * 0.97 : t)), 3));
    this.push(kind, g);
  }

  plain(key: string, w: number, h: number, d: number, x: number, y: number, z: number): void {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y + h / 2, z);
    this.push(key, g);
  }

  cylinder(key: string, r: number, h: number, x: number, y: number, z: number): void {
    const g = new THREE.CylinderGeometry(r, r, h, 6);
    g.translate(x, y + h / 2, z);
    this.push(key, g);
  }

  /** Telhado de quatro águas (a casinha do Trianon). */
  hipRoof(x: number, z: number, w: number, d: number, y: number): void {
    const g = new THREE.ConeGeometry(Math.max(w, d) * 0.72, 3, 4);
    g.rotateY(Math.PI / 4);
    g.scale(w / Math.max(w, d), 1, d / Math.max(w, d));
    g.translate(x, y + 1.5, z);
    this.push('redroof', g);
  }

  meshes(shadows: boolean): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [key, list] of this.groups) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      const m = new THREE.Mesh(geo, this.materials.get(key)!);
      m.castShadow = shadows;
      m.receiveShadow = true;
      out.push(m);
    }
    return out;
  }
}

function addBuilding(b: BuildingBatch, s: Spec): void {
  const { x, z, w, d, h, kind } = s;
  // Torre com recuo no topo (como nas maquetes): corpo + coroa menor
  const crown = h > 50;
  const bodyH = crown ? h * 0.86 : h;
  b.tower(x, z, w, d, bodyH, kind, 0, s.tone ?? 1);
  let topY = bodyH;
  if (crown) {
    b.tower(x, z, w * 0.78, d * 0.78, h - bodyH, kind, bodyH, s.tone ?? 1);
    topY = h;
  }
  b.plain('roof', w * (crown ? 0.82 : 1.03), 0.7, d * (crown ? 0.82 : 1.03), x, topY, z);
  topY += 0.7;
  // Casa de máquinas e caixas de ar-condicionado
  b.plain('beige' === kind ? 'beige' : 'gray', w * 0.3, 3.2, d * 0.3, x - w * 0.15, topY, z + d * 0.1);
  if (s.ac) {
    for (let i = 0; i < 6; i++) b.plain('gray', 2.2, 1.5, 2.2, x + (rand() - 0.5) * w * 0.6, topY, z + (rand() - 0.5) * d * 0.6);
  }
  if (s.antenna) {
    const ax = x + w * 0.22;
    const az = z - d * 0.2;
    b.cylinder('white', 0.18, 26, ax, topY, az);
    for (let i = 0; i < 4; i++) b.cylinder('red', 0.22, 3.2, ax, topY + 2 + i * 6.5, az);
    b.cylinder('white', 0.18, 26, ax + 3, topY, az + 2);
    for (let i = 0; i < 3; i++) b.cylinder('red', 0.22, 3.2, ax + 3, topY + 3 + i * 7, az + 2);
  }
  addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h, kind === 'beige' ? '#a8a08e' : '#6b7f94');
}

// ---------- árvores (instanciadas) ----------

function makeTrees(points: [number, number, number][]): THREE.Group {
  const g = new THREE.Group();
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), points.length);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6), new THREE.MeshLambertMaterial({ color: 0x5b4333 }), points.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  points.forEach(([x, z, s], i) => {
    m.compose(new THREE.Vector3(x, 1.2, z), q, new THREE.Vector3(1, 1, 1));
    trunk.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, 2.4 + s * 0.8, z), q.setFromEuler(new THREE.Euler(0, rand() * 6, 0)), new THREE.Vector3(s, s * 0.9, s));
    crown.setMatrixAt(i, m);
    col.setHSL(0.27 + rand() * 0.06, 0.45 + rand() * 0.2, 0.26 + rand() * 0.14);
    crown.setColorAt(i, col);
  });
  crown.castShadow = true;
  trunk.castShadow = true;
  g.add(crown, trunk);
  return g;
}

// ---------- cidade ----------

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

export function createCity(): THREE.Group {
  const city = new THREE.Group();
  COLLIDERS.length = 0;
  ROADS.length = 0;
  PARKS.length = 0;
  ROADS.push(AVENUE, ...SIDE_STREETS);
  PARKS.push(TRIANON);
  // Nomes dos lugares (do mais específico para o mais geral)
  PLACES.length = 0;
  PLACES.push(
    { name: 'MASP', rect: { x0: MASP.x - 34, x1: MASP.x + 34, z0: 18, z1: 62 } },
    { name: 'PARQUE TRIANON', rect: TRIANON },
    { name: 'AV. PAULISTA', rect: AVENUE },
    { name: 'CALÇADA DA PAULISTA', rect: { x0: -MAP.halfX, x1: MAP.halfX, z0: -18, z1: 18 } },
    ...SIDE_STREETS.map((r, i) => ({ name: `RUA TRANSVERSAL ${i + 1}`, rect: r })),
  );

  const W = MAP.halfX * 2;
  const D = MAP.halfZ * 2;

  // Calçada (chão base)
  const pavers = paversTex('#d9d3c4', '#bdb6a4', W / 4);
  pavers.repeat.set(W / 4, D / 4);
  city.add(flat(W, D, 0, 0, 0, pavers));

  // Avenida: asfalto, faixa vermelha central (corredor) e linhas
  const asphalt = asphaltTex();
  const avenue = flat(W, 24, 0, 0, 0.02, asphalt);
  (avenue.material as THREE.MeshLambertMaterial).map!.repeat.set(W / 8, 3);
  city.add(avenue);
  city.add(flat(W, 3.4, 0, 0, 0.03, null, 0xb34a3c));
  for (const z of [-6, 6]) {
    const dash = dashTex();
    dash.repeat.set(W / 6, 1);
    city.add(flat(W, 0.25, 0, z, 0.03, dash, 0xffffff, true));
  }
  // Ruas transversais
  for (const r of SIDE_STREETS) {
    const cx = (r.x0 + r.x1) / 2;
    const t = asphaltTex();
    t.repeat.set(1.5, D / 8);
    city.add(flat(12, D, cx, 0, 0.02, t));
    const dash = dashTex();
    dash.repeat.set(1, D / 6);
    const line = flat(0.25, D, cx, 0, 0.03, dash, 0xffffff, true);
    city.add(line);
  }
  // Faixas de pedestre na avenida
  const zebra = canvasTex(64, (g, s) => { g.clearRect(0, 0, s, s); g.fillStyle = '#eee'; for (let i = 0; i < 4; i++) g.fillRect(i * 16 + 2, 0, 9, s); }, 1, 1);
  for (const x of [77, 41, -1, -36, -70]) city.add(flat(4, 24, x, 0, 0.035, zebra, 0xffffff, true));

  // Praça do MASP (calçadão) e parque Trianon
  const plaza = paversTex('#cfc8b6', '#aaa391', 12);
  city.add(flat(66, 40, 25, 38, 0.012, plaza));
  const grass = canvasTex(64, (g, s) => { g.fillStyle = '#4f8a45'; g.fillRect(0, 0, s, s); for (let i = 0; i < 160; i++) { g.fillStyle = rand() > 0.5 ? '#5d9b52' : '#437a3b'; g.fillRect(rand() * s, rand() * s, 2, 2); } }, 12, 9);
  city.add(flat(TRIANON.x1 - TRIANON.x0, TRIANON.z1 - TRIANON.z0, (TRIANON.x0 + TRIANON.x1) / 2, (TRIANON.z0 + TRIANON.z1) / 2, 0.02, grass));
  // Alamedas do parque
  const path = paversTex('#c9bfa6', '#b3a98f', 8);
  city.add(flat(3, 44, 28, -44, 0.03, path));
  city.add(flat(44, 3, 28, -44, 0.03, path));

  // Prédios
  const b = new BuildingBatch();
  const specsPhoto: Spec[] = [
    // Norte
    { x: -86, z: 38, w: 24, d: 26, h: 46, kind: 'beige' },
    { x: -86, z: 64, w: 22, d: 14, h: 26, kind: 'beige' },
    { x: -44, z: 63, w: 26, d: 14, h: 38, kind: 'beige' },
    { x: -12, z: 63, w: 26, d: 14, h: 44, kind: 'beige', tone: 1.4 },
    { x: -62, z: 46, w: 6, d: 14, h: 22, kind: 'beige' },
    { x: 35, z: 34, w: 26, d: 26, h: 92, kind: 'beige', helipad: true, antenna: true },
    { x: 35, z: 62, w: 26, d: 14, h: 42, kind: 'beige' },
    { x: 82, z: 34, w: 24, d: 24, h: 76, kind: 'glass', antenna: true },
    { x: 82, z: 62, w: 24, d: 14, h: 50, kind: 'beige' },
    // Sul
    { x: -86, z: -36, w: 24, d: 30, h: 42, kind: 'beige' },
    { x: -86, z: -62, w: 22, d: 14, h: 24, kind: 'beige' },
    { x: -34, z: -26, w: 18, d: 8, h: 9, kind: 'beige' },
    { x: 0, z: -34, w: 10, d: 24, h: 30, kind: 'beige' },
    { x: 35, z: -34, w: 26, d: 26, h: 88, kind: 'dark', ac: true },
    { x: 35, z: -62, w: 26, d: 14, h: 32, kind: 'beige' },
    { x: 76, z: -34, w: 20, d: 26, h: 66, kind: 'beige', helipad: true },
    { x: 95, z: -30, w: 8, d: 18, h: 44, kind: 'beige' },
    { x: 82, z: -62, w: 24, d: 14, h: 32, kind: 'beige' },
  ];
  // As posições acima seguem a foto (esquerda = esquerda); o eixo X do mundo é invertido
  const specs = specsPhoto.map((sp) => ({ ...sp, x: -sp.x }));
  const helipads: THREE.Mesh[] = [];
  const hpTex = helipadTex();
  for (const s of specs) {
    addBuilding(b, s);
    if (s.helipad) {
      const hp = flat(Math.min(s.w, s.d) * 0.55, Math.min(s.w, s.d) * 0.55, s.x + s.w * 0.1, s.z + s.d * 0.1, s.h + 0.76 + 0.05, hpTex);
      hp.position.y = s.h + 0.78;
      helipads.push(hp);
    }
  }
  // Casa de telhado vermelho no Trianon e muros baixos
  b.plain('beige', 11, 6, 9, 10, 0, -48);
  b.hipRoof(10, -48, 11, 9, 6);
  addBox(4.5, 15.5, -52.5, -43.5, 7.5, '#a8a08e');
  for (const m of b.meshes(true)) city.add(m);
  for (const hp of helipads) city.add(hp);

  // Bordas: muros nas laterais e no fundo
  const wall = new THREE.MeshLambertMaterial({ color: 0x9a9a9a });
  for (const [x, z, w, d] of [[0, MAP.halfZ, W, 1], [0, -MAP.halfZ, W, 1], [MAP.halfX, 0, 1, D], [-MAP.halfX, 0, 1, D]] as const) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 4, d), wall);
    m.position.set(x, 2, z);
    city.add(m);
  }

  // Árvores: parque, calçadas da avenida e ruas
  const trees: [number, number, number][] = [];
  for (let i = 0; i < 110; i++) {
    const x = TRIANON.x0 + 2 + rand() * (TRIANON.x1 - TRIANON.x0 - 4);
    const z = TRIANON.z0 + 2 + rand() * (TRIANON.z1 - TRIANON.z0 - 4);
    if (Math.abs(x - 28) < 2.5 || Math.abs(z + 44) < 2.5) continue; // alamedas livres
    if (x > 3 && x < 17 && z > -54 && z < -42) continue; // casa
    trees.push([x, z, 1.8 + rand() * 1.4]);
  }
  for (let x = -94; x <= 94; x += 9) {
    if (SIDE_STREETS.some((r) => x > r.x0 - 4 && x < r.x1 + 4)) continue;
    if (x > -8 && x < 58) { trees.push([x, -15, 1.6]); continue; } // na praça do MASP só no lado sul
    trees.push([x, 15, 1.6], [x, -15, 1.6]);
  }
  for (const r of SIDE_STREETS) for (let z = -66; z <= 66; z += 12) if (Math.abs(z) > 20) trees.push([r.x0 - 1.5, z, 1.5], [r.x1 + 1.5, z, 1.5]);
  city.add(makeTrees(trees));

  // Bancos e jardineiras (dá para escalar)
  const bench = new THREE.MeshLambertMaterial({ color: 0x8c8f93 });
  const planter = new THREE.MeshLambertMaterial({ color: 0x7b6a58 });
  const props: [number, number, number, number, number, THREE.Material][] = [
    [45, 21, 3.2, 3.2, 1.1, planter], [5, 21, 3.2, 3.2, 1.1, planter], [25, 21.5, 6, 0.8, 0.5, bench],
    [40, 24, 2.2, 0.7, 0.5, bench], [10, 24, 2.2, 0.7, 0.5, bench],
    [20, -19, 6, 0.8, 0.5, bench], [-10, -19, 3.2, 3.2, 1.2, planter], [60, -19, 3.2, 3.2, 1.1, planter],
    [-45, 21, 3.2, 3.2, 1.6, planter], [-64, -19, 5, 0.8, 0.5, bench],
  ];
  for (const [x, z, w, d, h, mat] of props) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    city.add(m);
    addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h, '#7b6a58');
  }

  void loadMasp(city);
  return city;
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
  // quatro pilares
  for (const [x0, x1, z0, z1] of [[-713, -616, 96, 163], [-713, -616, -184, -118], [691, 788, 96, 163], [691, 788, -184, -118]] as const) {
    addBox(wx(x0), wx(x1), wz(z0), wz(z1), high, '#a33a2e');
  }
  // volume de vidro (4 m acima do chão)
  addBox(wx(-621), wx(692), wz(-273), wz(251), (282.4 - MASP_SRC.groundY) * s, '#a33a2e', glassBottom);
}
