// Escultura "Safra" (letreiro dourado de pé na calçada): pilar de latão quadrado e as letras brancas empilhadas, de lado
// (lê-se de baixo para cima), grossas, com a borda dourada, como nas fotos de referência. Sem fonte 3D: cada letra é
// desenhada num canvas, o contorno é extraído (marching squares) e extrudado em sólido (ExtrudeGeometry, com os furos).
import * as THREE from 'three';
import { addBox } from './map';

const TEXT = 'Safra';
const PX = 0.018; // metros por pixel do canvas (letra maiúscula ≈ 2,6 m antes da escala do mapa)
const DEPTH = 1.5; // espessura das letras
const PILLAR = 1.0; // lado do pilar
const BASE_Y = 2.3; // onde começa a primeira letra (o S)
const GAP = 0.24;

/** escala da escultura no mapa (0,5 = metade do tamanho original, ~3,5 m de altura) */
const SCALE = 0.5;
const GOLD = 0xd2a64a;

type Pt = [number, number];

/** Desenha a letra num canvas e devolve a máscara (1 = tinta) com o tamanho e o centro das maiúsculas. */
function letterMask(ch: string): { mask: Uint8Array; W: number; H: number; capCenter: number } {
  const size = 200;
  const font = `800 ${size}px "Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const pad = 14;
  const W = Math.ceil(probe.measureText(ch).width) + pad * 2;
  const H = Math.round(size * 1.25);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.font = font;
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#000';
  const baseline = Math.round(size * 0.97);
  g.fillText(ch, pad, baseline);
  const data = g.getImageData(0, 0, W, H).data;
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) mask[i] = data[i * 4 + 3]! > 127 ? 1 : 0;
  return { mask, W, H, capCenter: baseline - size * 0.36 };
}

/** Contornos da máscara (marching squares): lista de laços fechados em pixels. */
function traceLoops(mask: Uint8Array, W: number, H: number): Pt[][] {
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= W || y >= H ? 0 : mask[y * W + x]!);
  const key = (x: number, y: number): string => `${x},${y}`;
  const adj = new Map<string, Pt[]>();
  const link = (a: Pt, b: Pt): void => {
    for (const [p, q] of [[a, b], [b, a]] as const) {
      const k = key(p[0], p[1]);
      const l = adj.get(k);
      if (l) l.push(q); else adj.set(k, [q]);
    }
  };
  for (let y = -1; y < H; y++) {
    for (let x = -1; x < W; x++) {
      const idx = at(x, y) * 8 + at(x + 1, y) * 4 + at(x + 1, y + 1) * 2 + at(x, y + 1);
      // coordenadas dos centros dos pixels: a célula liga os centros (x,y)..(x+1,y+1); T/R/B/L = meios das 4 arestas
      const T: Pt = [x + 1, y + 0.5], R: Pt = [x + 1.5, y + 1], B: Pt = [x + 1, y + 1.5], L: Pt = [x + 0.5, y + 1];
      const segs: Record<number, [Pt, Pt][]> = {
        1: [[L, B]], 2: [[B, R]], 3: [[L, R]], 4: [[T, R]], 5: [[T, R], [L, B]], 6: [[T, B]], 7: [[T, L]], 8: [[T, L]],
        9: [[T, B]], 10: [[T, L], [B, R]], 11: [[T, R]], 12: [[L, R]], 13: [[B, R]], 14: [[L, B]],
      };
      for (const [a, b] of segs[idx] ?? []) link(a, b);
    }
  }
  const loops: Pt[][] = [];
  const used = new Set<string>();
  for (const [k, nb] of adj) {
    if (used.has(k) || nb.length !== 2) continue;
    const loop: Pt[] = [];
    let cur = k;
    let prev = '';
    for (let guard = 0; guard < 100000; guard++) {
      used.add(cur);
      const [cx, cy] = cur.split(',').map(Number) as [number, number];
      loop.push([cx, cy]);
      const n = adj.get(cur)!.map((p) => key(p[0], p[1]));
      const next = n.find((q) => q !== prev && !used.has(q)) ?? n.find((q) => q !== prev);
      if (!next || next === k && guard > 1 || used.has(next) && next !== k) break;
      if (next === k) break;
      prev = cur;
      cur = next;
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

/** Simplifica um laço (Ramer–Douglas–Peucker) com tolerância em pixels. */
function simplify(loop: Pt[], eps: number): Pt[] {
  const rdp = (pts: Pt[]): Pt[] => {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0]!, pts[pts.length - 1]!];
    let dmax = 0;
    let im = 0;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs(dy * (pts[i]![0] - a[0]) - dx * (pts[i]![1] - a[1])) / len;
      if (d > dmax) { dmax = d; im = i; }
    }
    if (dmax <= eps) return [a, b];
    return [...rdp(pts.slice(0, im + 1)).slice(0, -1), ...rdp(pts.slice(im))];
  };
  // fecha o laço cortando em dois pontos distantes
  let far = 0, fd = 0;
  for (let i = 1; i < loop.length; i++) { const d = Math.hypot(loop[i]![0] - loop[0]![0], loop[i]![1] - loop[0]![1]); if (d > fd) { fd = d; far = i; } }
  const h1 = rdp(loop.slice(0, far + 1));
  const h2 = rdp([...loop.slice(far), loop[0]!]);
  return [...h1.slice(0, -1), ...h2.slice(0, -1)];
}

const inside = (p: Pt, poly: Pt[]): boolean => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

/** Forma 3D da letra (com furos, como o miolo do "a"): contornos da máscara em metros. */
function letterShape(ch: string): { shape: THREE.Shape; w: number } {
  const { mask, W, H, capCenter } = letterMask(ch);
  const loops = traceLoops(mask, W, H).map((l) => simplify(l, 0.9)).filter((l) => l.length >= 3);
  const world = (p: Pt): THREE.Vector2 => new THREE.Vector2(p[0] * PX, (H - p[1] - capCenter) * PX);
  // laço de profundidade par = contorno externo; ímpar = furo
  const depth = loops.map((l, i) => loops.reduce((n, o, j) => n + (i !== j && inside(l[0]!, o) ? 1 : 0), 0));
  const shapes: { shape: THREE.Shape; area: number }[] = [];
  loops.forEach((l, i) => {
    if (depth[i]! % 2 === 0) {
      const sh = new THREE.Shape(l.map(world));
      shapes.push({ shape: sh, area: Math.abs(THREE.ShapeUtils.area(l.map(world))) });
    }
  });
  // um "Shape" por letra: o principal (maior); os furos vão para o contorno que os contém
  const main = shapes.sort((a, b) => b.area - a.area)[0]!.shape;
  loops.forEach((l, i) => { if (depth[i]! % 2 === 1) main.holes.push(new THREE.Path(l.map(world))); });
  return { shape: main, w: W * PX };
}

/** Cria a escultura (origem no chão, frente = +Z). Devolve também a altura total. */
export function createSafraSign(): THREE.Group {
  const group = new THREE.Group();
  const brass = new THREE.MeshLambertMaterial({ color: GOLD });
  const brassDark = new THREE.MeshLambertMaterial({ color: 0xa57d2e });

  // letras: sólidos de verdade (contorno da letra extrudado): frente branca, lados e bordas em latão. Uma malha por letra.
  const letters = new THREE.Group();
  let cursor = 0;
  const capMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8 });
  const sideMat = new THREE.MeshLambertMaterial({ color: GOLD });
  for (const ch of TEXT) {
    const { shape, w } = letterShape(ch);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 1 });
    geo.translate(cursor, 0, PILLAR / 2);
    const m = new THREE.Mesh(geo, [capMat, sideMat]);
    m.castShadow = true;
    letters.add(m);
    cursor += w - 0.12 + GAP;
  }
  const total = cursor - GAP;
  // de lado: lê-se de baixo para cima, o topo das letras aponta para a esquerda
  letters.rotation.z = Math.PI / 2;
  letters.position.set(0, BASE_Y, 0);
  // "Safra" nos dois lados: a segunda cópia gira 180° em volta do pilar (lê-se certo de frente e de trás)
  const side1 = new THREE.Group();
  side1.add(letters);
  const side2 = side1.clone();
  side2.rotation.y = Math.PI;
  group.add(side1, side2);
  const top = BASE_Y + total;

  // pilar de latão (com uma emenda mais escura perto do chão, como nas fotos) e base de pedra
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(PILLAR, top, PILLAR), brass);
  pillar.position.y = top / 2;
  pillar.castShadow = true;
  const seam = new THREE.Mesh(new THREE.BoxGeometry(PILLAR + 0.01, 0.04, PILLAR + 0.01), brassDark);
  seam.position.y = 1.35;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(PILLAR + 0.7, 0.14, PILLAR + 0.7), new THREE.MeshLambertMaterial({ color: 0x9a948a }));
  plinth.position.y = 0.07;
  group.add(pillar, seam, plinth);
  group.userData.height = top;
  group.userData.size = PILLAR + 0.7;
  void brassDark;
  return group;
}

/** Põe a escultura no mapa em (x, z) olhando para `heading` (rad, 0 = +Z) e cria a colisão do pilar. */
export function placeSafraSign(parent: THREE.Object3D, x: number, z: number, heading: number): void {
  const s = createSafraSign();
  s.scale.setScalar(SCALE);
  s.position.set(x, 0, z);
  s.rotation.y = heading;
  parent.add(s);
  const half = ((s.userData.size as number) * SCALE) / 2;
  addBox(x - half, x + half, z - half, z + half, (s.userData.height as number) * SCALE, '#b98f3c');
}
