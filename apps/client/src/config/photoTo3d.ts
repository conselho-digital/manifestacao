import {
  BufferAttribute,
  BufferGeometry,
  Bone,
  CanvasTexture,
  Group,
  MeshStandardMaterial,
  SRGBColorSpace,
  Skeleton,
  SkinnedMesh,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

/**
 * Foto → personagem 3D, tudo no navegador (sem serviço externo, sem custo):
 *  1. recorta a pessoa (transparência do PNG, ou o fundo liso tirado a partir das bordas);
 *  2. dá volume ao recorte (inflado pela distância até a borda: frente e costas, como um boneco de pano);
 *  3. monta um esqueleto humanoide (nomes que o jogo já anima) e distribui os pesos por região do corpo;
 *  4. exporta .glb (com a foto como textura).
 * É um boneco estilizado, não um escaneamento: o rosto vem da foto, achatado. Funciona melhor com a pessoa de frente,
 * de corpo inteiro, braços ao lado do corpo e pernas levemente abertas.
 */

export const CUTOUT_MAX_SIDE = 768;
const HEIGHT_M = 1.8;

export interface Cutout {
  /** Foto recortada (RGBA, alfa = pessoa), já cortada na caixa da pessoa. */
  canvas: HTMLCanvasElement;
  mask: Uint8Array;
  w: number;
  h: number;
}

/** Foto lida e reduzida; fica em memória para refazer o recorte ao mudar a tolerância sem reabrir o arquivo. */
export interface LoadedPhoto {
  data: ImageData;
}

export async function loadPhoto(file: File): Promise<LoadedPhoto> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Não consegui abrir a imagem. Tente outro arquivo.");
  }
  try {
    const scale = Math.min(1, CUTOUT_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Este navegador não consegue preparar a imagem.");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h) };
  } finally {
    bitmap.close();
  }
}

/** Componente conexo (4 vizinhos) a partir das sementes; devolve um mapa 0/1. */
function flood(w: number, h: number, seeds: number[], allowed: (i: number) => boolean): Uint8Array {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (const s of seeds) {
    if (!seen[s] && allowed(s)) {
      seen[s] = 1;
      stack.push(s);
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    const push = (j: number) => {
      if (!seen[j] && allowed(j)) {
        seen[j] = 1;
        stack.push(j);
      }
    };
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  return seen;
}

function borderIndices(w: number, h: number): number[] {
  const out: number[] = [];
  for (let x = 0; x < w; x++) out.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) out.push(y * w, y * w + w - 1);
  return out;
}

/** Recorta a pessoa: usa o alfa se a imagem tem transparência; senão tira o fundo liso a partir das bordas. */
export function makeCutout(photo: LoadedPhoto, tolerance: number): Cutout {
  const { width: w, height: h, data } = photo.data;
  const px = data;
  let transparent = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i]! < 200) transparent++;

  let mask = new Uint8Array(w * h);
  if (transparent > w * h * 0.01) {
    for (let i = 0; i < w * h; i++) mask[i] = px[i * 4 + 3]! >= 128 ? 1 : 0;
  } else {
    // Cor do fundo = mediana dos pixels da borda.
    const border = borderIndices(w, h);
    const med = (c: number) => {
      const v = border.map((i) => px[i * 4 + c]!).sort((a, b) => a - b);
      return v[v.length >> 1]!;
    };
    const br = med(0);
    const bg = med(1);
    const bb = med(2);
    const tol2 = tolerance * tolerance;
    const isBg = (i: number) => {
      const dr = px[i * 4]! - br;
      const dg = px[i * 4 + 1]! - bg;
      const db = px[i * 4 + 2]! - bb;
      return dr * dr + dg * dg + db * db <= tol2;
    };
    const bgMap = flood(w, h, border, isBg);
    for (let i = 0; i < w * h; i++) mask[i] = bgMap[i] ? 0 : 1;
  }

  // Tira a poeira (pedaços pequenos), mas mantém os grandes: braços afastados do corpo são pedaços separados.
  const visited = new Uint8Array(w * h);
  const comps: number[][] = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || visited[i]) continue;
    const comp = flood(w, h, [i], (j) => mask[j] === 1 && !visited[j]);
    const members: number[] = [];
    for (let j = 0; j < w * h; j++) if (comp[j]) (visited[j] = 1), members.push(j);
    comps.push(members);
  }
  const biggest = comps.reduce((m, c) => Math.max(m, c.length), 0);
  if (biggest < w * h * 0.02) throw new Error("Não achei a pessoa na foto. Use fundo liso ou um PNG sem fundo.");
  mask = new Uint8Array(w * h);
  for (const c of comps) if (c.length >= biggest * 0.04) for (const i of c) mask[i] = 1;
  const outside = flood(w, h, borderIndices(w, h), (j) => mask[j] === 0);
  for (let i = 0; i < w * h; i++) if (!outside[i]) mask[i] = 1;
  // Suaviza a borda (maioria 3×3).
  const smooth = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += mask[(y + dy) * w + x + dx]!;
      smooth[y * w + x] = n >= 5 ? 1 : 0;
    }
  }
  mask = smooth;

  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) throw new Error("Não achei a pessoa na foto. Use fundo liso ou um PNG sem fundo.");
  const pad = 2;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const outMask = new Uint8Array(cw * ch);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(cw, ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = (y0 + y) * w + (x0 + x);
      const di = y * cw + x;
      outMask[di] = mask[si]!;
      img.data[di * 4] = px[si * 4]!;
      img.data[di * 4 + 1] = px[si * 4 + 1]!;
      img.data[di * 4 + 2] = px[si * 4 + 2]!;
      img.data[di * 4 + 3] = mask[si] ? 255 : 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, mask: outMask, w: cw, h: ch };
}

/** Distância (px) de cada pixel da pessoa até a borda, em duas passadas (chanfro 3-4). */
function distanceInside(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]!);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      d[i] = Math.min(d[i]!, at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!mask[i]) continue;
      d[i] = Math.min(d[i]!, at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4);
    }
  return d;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Ossos (nomes que o jogo reconhece para animar a caminhada). x: + = esquerda do personagem (ele olha para +Z).
const BONE_NAMES = [
  "Hips",
  "Spine",
  "Head",
  "LeftUpLeg",
  "LeftLeg",
  "LeftFoot",
  "RightUpLeg",
  "RightLeg",
  "RightFoot",
  "LeftArm",
  "LeftForeArm",
  "LeftHand",
  "RightArm",
  "RightForeArm",
  "RightHand",
  "LeftToeBase",
  "RightToeBase",
] as const;
const B = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i])) as Record<(typeof BONE_NAMES)[number], number>;

/** Pesos (osso → peso) de um ponto do corpo; t = altura/H (0 pés … 1 topo), u = x/H (+ = esquerda do personagem). */
function weightsAt(t: number, u: number): [number, number][] {
  const w = new Float64Array(BONE_NAMES.length);
  const left = smooth(-0.02, 0.02, u);
  const right = 1 - left;
  // Braço: região lateral entre o cotovelo/mão e o ombro.
  const armZone = smooth(0.16, 0.19, Math.abs(u)) * smooth(0.4, 0.46, t) * (1 - smooth(0.82, 0.86, t));
  const head = smooth(0.84, 0.89, t);
  const legs = 1 - smooth(0.47, 0.53, t);
  const body = Math.max(0, 1 - head - legs);
  const spineShare = smooth(0.5, 0.6, t);

  const torso = 1 - armZone;
  w[B.Head]! += torso * head;
  w[B.Spine]! += torso * body * spineShare;
  w[B.Hips]! += torso * body * (1 - spineShare);

  const upper = smooth(0.26, 0.32, t);
  const foot = 1 - smooth(0.03, 0.07, t);
  const legUp = torso * legs * upper;
  const legLow = torso * legs * (1 - upper) * (1 - foot);
  const legFoot = torso * legs * (1 - upper) * foot;
  w[B.LeftUpLeg]! += legUp * left;
  w[B.RightUpLeg]! += legUp * right;
  w[B.LeftLeg]! += legLow * left;
  w[B.RightLeg]! += legLow * right;
  w[B.LeftFoot]! += legFoot * left;
  w[B.RightFoot]! += legFoot * right;

  const arm = armZone;
  const upperArm = 1 - smooth(0.6, 0.66, t);
  const hand = 1 - smooth(0.44, 0.49, t);
  const upA = arm * upperArm;
  const fore = arm * (1 - upperArm) * (1 - hand);
  const hnd = arm * (1 - upperArm) * hand;
  w[B.LeftArm]! += upA * left;
  w[B.RightArm]! += upA * right;
  w[B.LeftForeArm]! += fore * left;
  w[B.RightForeArm]! += fore * right;
  w[B.LeftHand]! += hnd * left;
  w[B.RightHand]! += hnd * right;

  const list: [number, number][] = [];
  for (let i = 0; i < w.length; i++) if (w[i]! > 1e-4) list.push([i, w[i]!]);
  list.sort((a, b) => b[1] - a[1]);
  const top = list.slice(0, 4);
  const sum = top.reduce((s, [, v]) => s + v, 0) || 1;
  return top.map(([i, v]) => [i, v / sum]);
}

/** Monta o personagem (malha com volume + esqueleto) a partir do recorte. */
export function buildCharacter(cut: Cutout): Group {
  const { w, h, mask } = cut;
  const dist = distanceInside(mask, w, h);
  const s = HEIGHT_M / h; // metros por pixel
  const dcap = h * 0.06;
  const tmax = h * 0.07;
  const step = Math.max(1, Math.round(h / 150));
  const nx = Math.ceil(w / step);
  const ny = Math.ceil(h / step);

  const at = (px: number, py: number) => {
    const x = Math.min(w - 1, Math.max(0, px));
    const y = Math.min(h - 1, Math.max(0, py));
    return y * w + x;
  };
  /** Nó ativo = pixel da pessoa. Os da borda (com vizinho fora) ficam em z=0: frente e costas se fecham ali. */
  const active = new Uint8Array((nx + 1) * (ny + 1));
  const zOf = new Float32Array((nx + 1) * (ny + 1));
  const inside = (gx: number, gy: number) => gx >= 0 && gy >= 0 && gx <= nx && gy <= ny && mask[at(gx * step, gy * step)] === 1 && gx * step < w && gy * step < h;
  for (let gy = 0; gy <= ny; gy++) {
    for (let gx = 0; gx <= nx; gx++) {
      const n = gy * (nx + 1) + gx;
      if (!inside(gx, gy)) continue;
      active[n] = 1;
      if (!(inside(gx - 1, gy) && inside(gx + 1, gy) && inside(gx, gy - 1) && inside(gx, gy + 1))) continue; // borda: z = 0
      const d = dist[at(gx * step, gy * step)]!;
      const k = Math.min(1, d / dcap);
      zOf[n] = tmax * Math.sqrt(Math.max(0, 1 - (1 - k) * (1 - k))) * s;
    }
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const skinIdx: number[] = [];
  const skinW: number[] = [];
  const frontIdx = new Int32Array((nx + 1) * (ny + 1)).fill(-1);
  const backIdx = new Int32Array((nx + 1) * (ny + 1)).fill(-1);
  const addVertex = (n: number, gx: number, gy: number, z: number, shade: number): number => {
    const px = gx * step;
    const py = gy * step;
    const x = (px - w / 2) * s;
    const y = (h - py) * s;
    positions.push(x, y, z);
    uvs.push(Math.min(1, px / w), 1 - Math.min(1, py / h));
    colors.push(shade, shade, shade);
    const wts = weightsAt(y / HEIGHT_M, x / HEIGHT_M);
    for (let k = 0; k < 4; k++) {
      skinIdx.push(wts[k] ? wts[k]![0] : 0);
      skinW.push(wts[k] ? wts[k]![1] : 0);
    }
    void n;
    return positions.length / 3 - 1;
  };
  const vert = (gx: number, gy: number, back: boolean): number => {
    const n = gy * (nx + 1) + gx;
    const z = zOf[n]!;
    if (z < 1e-5) {
      // Na borda a frente e as costas são o mesmo vértice (sem fresta).
      if (frontIdx[n]! < 0) frontIdx[n] = addVertex(n, gx, gy, 0, 1);
      return frontIdx[n]!;
    }
    if (back) {
      if (backIdx[n]! < 0) backIdx[n] = addVertex(n, gx, gy, -z, 0.7);
      return backIdx[n]!;
    }
    if (frontIdx[n]! < 0) frontIdx[n] = addVertex(n, gx, gy, z, 1);
    return frontIdx[n]!;
  };

  const index: number[] = [];
  for (let gy = 0; gy < ny; gy++) {
    for (let gx = 0; gx < nx; gx++) {
      const n00 = gy * (nx + 1) + gx;
      const n10 = n00 + 1;
      const n01 = n00 + (nx + 1);
      const n11 = n01 + 1;
      if (!(active[n00] && active[n10] && active[n01] && active[n11])) continue;
      const fa = vert(gx, gy, false);
      const fb = vert(gx + 1, gy, false);
      const fc = vert(gx + 1, gy + 1, false);
      const fd = vert(gx, gy + 1, false);
      index.push(fa, fd, fc, fa, fc, fb);
      const ba = vert(gx, gy, true);
      const bb = vert(gx + 1, gy, true);
      const bc = vert(gx + 1, gy + 1, true);
      const bd = vert(gx, gy + 1, true);
      index.push(ba, bc, bd, ba, bb, bc);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geo.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geo.setAttribute("skinIndex", new BufferAttribute(new Uint16Array(skinIdx), 4));
  geo.setAttribute("skinWeight", new BufferAttribute(new Float32Array(skinW), 4));
  geo.setIndex(index);
  geo.computeVertexNormals();

  const map = new CanvasTexture(cut.canvas);
  map.colorSpace = SRGBColorSpace;
  const material = new MeshStandardMaterial({ map, vertexColors: true, roughness: 0.9, metalness: 0 });
  const mesh = new SkinnedMesh(geo, material);
  mesh.name = "Personagem";
  mesh.frustumCulled = false;

  // Esqueleto: posições (m) no mundo; cada osso fica relativo ao pai.
  const H = HEIGHT_M;
  const world: Record<(typeof BONE_NAMES)[number], [number, number, number]> = {
    Hips: [0, 0.5 * H, 0],
    Spine: [0, 0.58 * H, 0],
    Head: [0, 0.84 * H, 0],
    LeftUpLeg: [0.07 * H, 0.5 * H, 0],
    LeftLeg: [0.07 * H, 0.27 * H, 0],
    LeftFoot: [0.07 * H, 0.05 * H, 0],
    LeftToeBase: [0.07 * H, 0.02 * H, 0.07 * H],
    RightUpLeg: [-0.07 * H, 0.5 * H, 0],
    RightLeg: [-0.07 * H, 0.27 * H, 0],
    RightFoot: [-0.07 * H, 0.05 * H, 0],
    RightToeBase: [-0.07 * H, 0.02 * H, 0.07 * H],
    LeftArm: [0.19 * H, 0.83 * H, 0],
    LeftForeArm: [0.19 * H, 0.63 * H, 0],
    LeftHand: [0.19 * H, 0.45 * H, 0],
    RightArm: [-0.19 * H, 0.83 * H, 0],
    RightForeArm: [-0.19 * H, 0.63 * H, 0],
    RightHand: [-0.19 * H, 0.45 * H, 0],
  };
  const parent: Partial<Record<(typeof BONE_NAMES)[number], (typeof BONE_NAMES)[number]>> = {
    Spine: "Hips",
    Head: "Spine",
    LeftUpLeg: "Hips",
    LeftLeg: "LeftUpLeg",
    LeftFoot: "LeftLeg",
    LeftToeBase: "LeftFoot",
    RightUpLeg: "Hips",
    RightLeg: "RightUpLeg",
    RightFoot: "RightLeg",
    RightToeBase: "RightFoot",
    LeftArm: "Spine",
    LeftForeArm: "LeftArm",
    LeftHand: "LeftForeArm",
    RightArm: "Spine",
    RightForeArm: "RightArm",
    RightHand: "RightForeArm",
  };
  const bones = BONE_NAMES.map((n) => {
    const b = new Bone();
    b.name = n;
    return b;
  });
  for (const n of BONE_NAMES) {
    const b = bones[B[n]]!;
    const p = parent[n];
    const [x, y, z] = world[n];
    if (p) {
      const [px, py, pz] = world[p];
      b.position.set(x - px, y - py, z - pz);
      bones[B[p]]!.add(b);
    } else {
      b.position.set(x, y, z);
    }
  }
  const root = new Group();
  root.name = "Personagem3D";
  root.add(mesh);
  mesh.add(bones[0]!);
  root.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones));
  return root;
}

/** Exporta o personagem como .glb. */
export async function exportGlb(root: Group): Promise<Blob> {
  const out = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false });
  if (!(out instanceof ArrayBuffer)) throw new Error("Falha ao exportar o modelo.");
  return new Blob([out], { type: "model/gltf-binary" });
}
