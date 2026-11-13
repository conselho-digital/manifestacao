import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addBox, COLLIDERS, PARKS, PLACES, ROADS, TREES, type Rect } from './map';
import { FAR_TREES, registerCullChildren } from './culling';
import { HEIGHT, makeTrees, type Species, type TreeSpec } from './trees';

// Mapa "Esplanada": Esplanada dos Ministérios e Congresso Nacional (fotos de referência do usuário: vista aérea e maquete).
// Eixo no sentido norte (+z): o Congresso fica no fim do eixo, de frente para o sul. Duas avenidas (Eixo Monumental) ladeiam o gramado
// central e, fora delas, as duas fileiras de ministérios. Sem carros: só aparecem os chamados na Garagem.

const HX = 150; // meio-largura do mapa (m)
const HZ = 190; // meio-comprimento
const AV_L: Rect = { x0: -85, x1: -55, z0: -175, z1: HZ }; // avenida oeste (3 faixas para cada lado)
const AV_R: Rect = { x0: 55, x1: 85, z0: -175, z1: HZ };
const PERIM_S: Rect = { x0: -HX, x1: HX, z0: -HZ, z1: -175 }; // rua do fim sul, liga as duas avenidas
const CROSS: Rect[] = [
  { x0: -55, x1: 55, z0: -105, z1: -90 }, // 1ª transversal (cruza o gramado)
  { x0: -55, x1: 55, z0: -35, z1: -20 }, // 2ª transversal
];
// ruas que saem das avenidas entre os ministérios (alinhadas com a 1ª transversal)
const OUTER: Rect[] = [{ x0: -HX, x1: -85, z0: -105, z1: -90 }, { x0: 85, x1: HX, z0: -105, z1: -90 }];
// estacionamentos: margens, e dois estreitos ao lado das torres do Congresso
const lots: Rect[] = [
  { x0: 104, x1: 146, z0: -34, z1: -12 }, { x0: 102, x1: 118, z0: 100, z1: 136 }, { x0: -146, x1: -114, z0: 114, z1: 140 },
  { x0: -52, x1: -26, z0: 146, z1: 178 }, { x0: 26, x1: 52, z0: 146, z1: 178 },
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
  return { grass, lawn, concrete, avenue, street, lot, rib, ministry, warehouse, plain, palace };
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

export function createEsplanada(): THREE.Group {
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
    water: new THREE.MeshStandardMaterial({ color: 0x61797a, roughness: 0.15, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    streetBr: ((): THREE.MeshStandardMaterial => { const m = std(T.street!, 0xffffff, 0.9); m.polygonOffset = true; m.polygonOffsetFactor = -4; m.polygonOffsetUnits = -4; return m; })(),
    pave: new THREE.MeshStandardMaterial({ color: 0xdcdcd6, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    terra: new THREE.MeshStandardMaterial({ color: 0xa65a3c, roughness: 0.95 }),
    ribRoof: std(T.rib!),
    gable: new THREE.MeshStandardMaterial({ color: 0x9a968c, roughness: 0.9, side: THREE.DoubleSide }),
    stone: new THREE.MeshStandardMaterial({ color: 0xb8b2a4, roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xc7c3b9, roughness: 0.9 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x3a3d3a, roughness: 1 }),
  };
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
  for (const r of [{ x0: -97, x1: -88, z0: -172, z1: 188 }, { x0: 88, x1: 97, z0: -172, z1: 188 }, { x0: 97, x1: HX - 4, z0: -90, z1: -36 }]) { addFlat(mats.lawn, flatGeom(r.x0, r.x1, r.z0, r.z1, 0.015, 12)); PARKS.push(r); }
  // ladrilho dos ministérios: o pátio (concreto) das duas margens
  for (const r of [{ x0: -HX, x1: -97, z0: -175, z1: HZ }, { x0: 97, x1: HX, z0: -175, z1: HZ }]) addFlat(mats.lawn, flatGeom(r.x0, r.x1, r.z0, r.z1, 0.015, 12)); // margens: gramado, com pátio de concreto em volta de cada prédio
  // calçadas ao longo das avenidas (3 m) e em volta dos gramados (caminhos de 3 m)
  const walk: Rect[] = [
    { x0: -88, x1: -85, z0: -175, z1: HZ }, { x0: -55, x1: -52, z0: -175, z1: HZ },
    { x0: 55, x1: 58, z0: -175, z1: HZ }, { x0: 85, x1: 88, z0: -175, z1: HZ },
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
  const LAKES: [number, number][][] = [
    [[39.8, 122], [29.8, 122], [29.8, 62.6], [39.8, 62.6]],
    [[25.5, 122], [21.4, 122], [21.4, 90.4], [19.2, 86.3], [17.3, 81.9], [15.5, 76.2], [13.6, 71.8], [25.5, 71.3]],
    [[6.1, 71.1], [-26.7, 71.1], [-26.7, 122], [-21.1, 122], [-21.1, 90.1], [-17.8, 86.3], [-13.1, 82.8], [-4.7, 79.7], [1.9, 77.5], [5.6, 73.7]],
    [[-30.9, 122], [-41.1, 122], [-41.1, 62.6], [-30.9, 62.6]],
    [[25.5, 61.2], [-26.7, 61.2], [-26.7, 54.6], [-17.8, 56.9], [-12.2, 57.4], [-8.4, 55.1], [-5.6, 49.9], [-2.8, 48.5], [4.7, 49.0], [12.2, 49.9], [18.8, 53.2], [25.5, 54.6]],
  ];
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
  for (const pts of LAKES) {
    addFlat(mats.stone, polyGeom(pts, 0.045, 0.9));
    addFlat(mats.water, polyGeom(pts, 0.07, 0));
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
  for (const r of [{ x0: -31, x1: -26, z0: -37, z1: 112 }, { x0: 26, x1: 31, z0: -37, z1: 112 }]) {
    addFlat(mats.street, flatGeom(r.x0, r.x1, r.z0, 49, 0.05, 12, 'road-z'));
    addFlat(mats.streetBr, flatGeom(r.x0, r.x1, 49, r.z1, 0.1, 12, 'road-z'));
    ROADS.push(r);
  }
  // ruas: asfalto com as faixas pintadas na textura
  for (const r of [AV_L, AV_R]) { addFlat(mats.avenue, flatGeom(r.x0, r.x1, r.z0, r.z1, 0.05, 12, 'road-z')); ROADS.push(r); }
  addFlat(mats.street, flatGeom(PERIM_S.x0, PERIM_S.x1, PERIM_S.z0, PERIM_S.z1, 0.05, 12, 'road-x'));
  ROADS.push(PERIM_S);
  for (const r of [...CROSS, ...OUTER]) { addFlat(mats.street, flatGeom(r.x0, r.x1, r.z0, r.z1, 0.05, 12, 'road-x')); ROADS.push(r); }
  // pátios de terracota entre os ministérios de cada par (como na maquete)
  for (const r of [{ x0: -112, x1: -102, z0: -146, z1: -138 }, { x0: 103, x1: 110, z0: -146, z1: -138 }]) addFlat(mats.terra, flatGeom(r.x0, r.x1, r.z0, r.z1, 0.055, 4));
  // estacionamentos (margem leste e oeste)
  for (const r of lots) addFlat(mats.lot, flatGeom(r.x0, r.x1, r.z0, r.z1, 0.045, 21));

  // ---- ministérios e demais prédios ----
  const B: Bld[] = [];
  const pair = (x0: number, x1: number, zA: number, zB: number): void => {
    B.push({ x0, x1, z0: zA, z1: zA + 22, h: 24, tex: 'ministry', core: true });
    B.push({ x0, x1, z0: zB, z1: zB + 22, h: 24, tex: 'ministry', core: true });
  };
  // margem oeste: par de ministérios ao sul; par empilhado ao norte da rua; galpão com telhado nervurado, galpões baixos e prédio quadrado
  pair(-146, -100, -168, -138);
  pair(-146, -100, -88, -60);
  B.push({ x0: -126, x1: -100, z0: -32, z1: 50, h: 12, tex: 'warehouse', roof: 'rib' });
  B.push({ x0: -146, x1: -130, z0: -30, z1: -6, h: 7, tex: 'warehouse' });
  B.push({ x0: -146, x1: -130, z0: -2, z1: 18, h: 9, tex: 'warehouse' });
  B.push({ x0: -146, x1: -130, z0: 22, z1: 44, h: 7, tex: 'warehouse' });
  B.push({ x0: -146, x1: -112, z0: 56, z1: 74, h: 8, tex: 'warehouse' });
  B.push({ x0: -140, x1: -108, z0: 80, z1: 108, h: 16, tex: 'plain' });
  // margem leste: par ao sul, palácio com colunas, blocos cinza, edifício creme e galpão de duas águas
  pair(100, 146, -168, -138);
  B.push({ x0: 104, x1: 132, z0: -78, z1: -38, h: 16, tex: 'palace' });
  B.push({ x0: 106, x1: 146, z0: 0, z1: 58, h: 14, tex: 'plain' });
  B.push({ x0: 108, x1: 144, z0: 64, z1: 86, h: 9, tex: 'plain' });
  B.push({ x0: 124, x1: 146, z0: 96, z1: 150, h: 10, tex: 'warehouse', roof: 'rib' });
  B.push({ x0: 126, x1: 146, z0: 152, z1: 168, h: 7, tex: 'warehouse' });
  B.push({ x0: 112, x1: 146, z0: 170, z1: 188, h: 12, tex: 'warehouse', roof: 'gable' });
  // pátio de concreto em volta de cada prédio das margens
  for (const b of B) {
    const x0 = Math.max(b.x0 - 5, b.x0 < 0 ? -HX : 97);
    const x1 = Math.min(b.x1 + 5, b.x1 < 0 ? -97 : HX);
    addFlat(mats.concrete, flatGeom(x0, x1, Math.max(b.z0 - 5, -175), Math.min(b.z1 + 5, HZ), 0.03, 4));
  }
  for (const [m, list] of flats) {
    const mesh = new THREE.Mesh(mergeGeometries(list, false)!, m);
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
  const spot = (x: number, z: number, sp: Species): void => { trees.push({ x, z, h: HEIGHT[sp][0] + rnd() * (HEIGHT[sp][1] - HEIGHT[sp][0]), species: sp }); };
  const inCross = (z: number): boolean => CROSS.some((c) => z > c.z0 - 5 && z < c.z1 + 5);
  for (let z = -165; z <= 38; z += 9) {
    if (inCross(z)) continue;
    // fileiras entre as ruas estreitas do gramado central e as avenidas (x ±48), como na maquete
    for (const x of [-48.5, 48.5]) spot(x, z + rnd() * 2, z > -34 ? 'maple' : rnd() < 0.6 ? 'oak' : 'maple');
  }
  for (let z = -170; z <= 175; z += 8) for (const x of [-92, 92]) if (rnd() < 0.92) spot(x + (rnd() - 0.5), z, rnd() < 0.5 ? 'birch' : 'maple');
  // algumas árvores soltas e bosques nos pátios e gramados dos ministérios
  for (let i = 0; i < 70; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    spot(side * (100 + rnd() * 44), -176 + rnd() * 350, rnd() < 0.5 ? 'oak' : 'birch');
  }
  for (const [gx, gz] of [[-120, -125], [120, -125], [100, -70], [118, -45], [-118, -98], [118, -98], [-122, 66], [118, 90], [-120, 124], [128, 146], [-100, 150], [100, 150]] as const) {
    for (let i = 0; i < 9; i++) spot(gx + (rnd() - 0.5) * 16, gz + (rnd() - 0.5) * 16, rnd() < 0.5 ? 'oak' : 'maple');
  }
  for (const [x, z] of [[-24, -150], [24, -150], [0, -128], [-20, -70], [22, -60], [-26, -52], [28, -78], [0, -62]] as const) spot(x, z, 'oak');
  for (let i = 0; i < 40; i++) trees.push({ x: -50 + rnd() * 100, z: -170 + rnd() * 62, h: HEIGHT.bush[0] + rnd() * (HEIGHT.bush[1] - HEIGHT.bush[0]), species: 'bush' });
  const nearBuilding = (x: number, z: number, m: number): boolean => B.some((b) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m);
  const crown: Record<string, number> = { oak: 0.4, pine: 0.2, maple: 0.3, birch: 0.2, bush: 0 };
  const blocked = (x: number, z: number): boolean => [...ROADS, ...lots].some((r) => x > r.x0 - 1.5 && x < r.x1 + 1.5 && z > r.z0 - 1.5 && z < r.z1 + 1.5);
  const placed = trees.filter((t) => t.species === 'bush' || (!nearBuilding(t.x, t.z, crown[t.species]! * t.h + 0.4) && !blocked(t.x, t.z)));
  const treeGroup = makeTrees(placed);
  city.add(treeGroup);
  registerCullChildren(treeGroup, FAR_TREES);

  // ---- nomes dos lugares (barra de cima do jogo, mapa grande) ----
  PLACES.push(
    { name: 'LAGO DO CONGRESSO', rect: { x0: -42, x1: 42, z0: 48, z1: 92 } },
    { name: 'CONGRESSO NACIONAL', rect: { x0: -60, x1: 60, z0: 44, z1: HZ } },
    { name: 'EIXO MONUMENTAL OESTE', rect: { x0: -88, x1: -52, z0: -HZ, z1: HZ } },
    { name: 'EIXO MONUMENTAL LESTE', rect: { x0: 52, x1: 88, z0: -HZ, z1: HZ } },
    { name: 'MINISTÉRIOS (OESTE)', rect: { x0: -HX, x1: -88, z0: -HZ, z1: HZ } },
    { name: 'MINISTÉRIOS (LESTE)', rect: { x0: 88, x1: HX, z0: -HZ, z1: HZ } },
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
    // colisão: a laje (a maior peça branca), as duas cúpulas e as torres, medidas no próprio modelo
    const parts: { box: THREE.Box3; area: number; dark: boolean }[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const b = new THREE.Box3().setFromObject(m);
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
      const sz = b.getSize(new THREE.Vector3());
      if (sz.x < 1 || sz.z < 1) return;
      parts.push({ box: b, area: sz.x * sz.z, dark: mat.color.r < 0.6 && mat.color.r > 0.3 && sz.y > 20 });
    });
    const dark = parts.filter((p) => p.dark);
    for (const p of dark) addBox(p.box.min.x, p.box.max.x, p.box.min.z, p.box.max.z, p.box.max.y, '#8a8d8d');
    // a laje (a peça branca de maior área) vira uma caixa de ~6 m; as cúpulas ficam em cima dela (não bloqueiam)
    const whites = parts.filter((p) => !p.dark && p.box.max.y > 1).sort((x, y) => y.area - x.area);
    const slab = whites[0];
    // a rampa (a ponta da peça maior, na frente) não bloqueia: a caixa começa na fachada de vidro
    const facadeZ = Math.min(...whites.slice(1).filter((p) => p.area > 200).map((p) => p.box.min.z));
    if (slab) addBox(slab.box.min.x, slab.box.max.x, Number.isFinite(facadeZ) ? Math.max(slab.box.min.z, facadeZ) : slab.box.min.z, slab.box.max.z, Math.min(slab.box.max.y, 7), '#cfcfcf');
  }).catch((e) => console.warn('Congresso não carregou:', e));

  return city;
}


