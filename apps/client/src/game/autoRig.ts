import { BufferAttribute, BufferGeometry, Group, Material, Matrix4, Mesh, Object3D, Skeleton, SkinnedMesh } from "three";
import { BONE_NAMES, B, createBones, type BoneName } from "../config/photoTo3d.js";
import type { Pt, RigMarks } from "../config/rigs.js";

/**
 * Esqueleto automático a partir das marcações do editor do admin: vira o modelo para a frente (+Z), apoia nos pés no
 * centro e distribui os pesos de cada vértice pelo osso mais próximo (pescoço, pélvis, ombro, mão, quadril, tornozelo;
 * o outro lado é espelhado). Qualquer .glb (malha estática, ou com esqueleto de nomes estranhos) passa a ter ossos
 * com os nomes que o jogo já anima (autoAnimate.ts).
 */

/** Altura (m) a que todo personagem com esqueleto é levado. */
export const TARGET_HEIGHT = 1.8;

export interface RigPiece {
  geometry: BufferGeometry;
  material: Material | Material[];
  name: string;
}

export interface OrientedModel {
  pieces: RigPiece[];
  /** Tamanho do modelo virado (m). */
  size: { x: number; y: number; z: number };
}

/** Cópia da geometria de todas as malhas, no referencial do modelo virado (`yaw`), com os pés em y=0 e centro em x=z=0. */
export function orientModel(scene: Object3D, yawDeg: number): OrientedModel {
  scene.updateMatrixWorld(true);
  const inv = scene.matrixWorld.clone().invert();
  const turn = new Matrix4().makeRotationY((yawDeg * Math.PI) / 180);
  const pieces: RigPiece[] = [];
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !mesh.geometry || !mesh.geometry.getAttribute("position")) return;
    const geometry = mesh.geometry.clone();
    // Vira rígido (sem pele nem morph): o esqueleto novo é que vai deformar.
    geometry.deleteAttribute("skinIndex");
    geometry.deleteAttribute("skinWeight");
    geometry.morphAttributes = {};
    geometry.applyMatrix4(turn.clone().multiply(inv).multiply(mesh.matrixWorld));
    pieces.push({ geometry, material: mesh.material, name: mesh.name });
  });
  if (pieces.length === 0) throw new Error("O modelo não tem malha.");
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const p of pieces) {
    p.geometry.computeBoundingBox();
    const b = p.geometry.boundingBox!;
    minX = Math.min(minX, b.min.x);
    minY = Math.min(minY, b.min.y);
    minZ = Math.min(minZ, b.min.z);
    maxX = Math.max(maxX, b.max.x);
    maxY = Math.max(maxY, b.max.y);
    maxZ = Math.max(maxZ, b.max.z);
  }
  // Todo personagem com esqueleto fica com a altura padrão (1,8 m): modelos exportados em outras escalas não ficam gigantes.
  const k = maxY - minY > 1e-6 ? TARGET_HEIGHT / (maxY - minY) : 1;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  for (const p of pieces) {
    p.geometry.translate(-cx, -minY, -cz);
    p.geometry.scale(k, k, k);
    p.geometry.computeBoundingBox();
    p.geometry.computeBoundingSphere();
  }
  return { pieces, size: { x: (maxX - minX) * k, y: (maxY - minY) * k, z: (maxZ - minZ) * k } };
}

interface Segment {
  bone: number;
  a: Pt;
  b: Pt;
}

export interface RigLayout {
  world: Record<BoneName, [number, number, number]>;
  segments: Segment[];
}

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Posição dos ossos e segmentos de influência a partir das marcações. */
export function layoutFromMarks(rig: RigMarks, height: number): RigLayout {
  const cx = (rig.neck[0] + rig.pelvis[0]) / 2;
  const mirror = (p: Pt): Pt => [2 * cx - p[0], p[1]];
  // O lado marcado pode ser qualquer um: o que está em +x é o esquerdo (o personagem olha para +Z).
  const markedIsLeft = rig.shoulder[0] >= cx;
  const side = (p: Pt, left: boolean): Pt => (left === markedIsLeft ? p : mirror(p));

  const pelvis: Pt = [cx, rig.pelvis[1]];
  const neck: Pt = [cx, rig.neck[1]];
  const spine = lerp(pelvis, neck, 0.4);
  const top: Pt = [cx, Math.max(rig.head[1], neck[1] + 0.08, Math.min(height, rig.head[1] + 0.05))];
  const headBase = lerp(neck, top, 0.3);
  const neckLow = lerp(spine, neck, 0.7);

  const world = {} as Record<BoneName, [number, number, number]>;
  const segments: Segment[] = [];
  const put = (n: BoneName, p: Pt, z = 0) => (world[n] = [p[0], p[1], z]);
  put("Hips", pelvis);
  put("Spine", spine);
  put("Neck", neckLow);
  put("Head", headBase);
  segments.push({ bone: B.Hips, a: pelvis, b: spine });
  segments.push({ bone: B.Spine, a: spine, b: neckLow });
  segments.push({ bone: B.Neck, a: neckLow, b: headBase });
  segments.push({ bone: B.Head, a: headBase, b: top });

  for (const left of [true, false]) {
    const p = left ? "Left" : "Right";
    const hip = side(rig.hip, left);
    const thigh = side(rig.thigh, left);
    const knee = side(rig.knee, left);
    const ankle = side(rig.ankle, left);
    const toe = side(rig.toe, left);
    const shoulder = side(rig.shoulder, left);
    const elbow = side(rig.elbow, left);
    const hand = side(rig.hand, left);
    // Comprimento do pé (para frente): vem da ponta do pé marcada.
    const footLen = Math.max(0.08, Math.min(0.4, Math.abs(toe[0] - ankle[0]) + Math.abs(toe[1] - ankle[1]) + 0.1));
    put(`${p}UpLeg` as BoneName, hip);
    put(`${p}Leg` as BoneName, knee);
    put(`${p}Foot` as BoneName, ankle);
    put(`${p}ToeBase` as BoneName, [ankle[0], Math.max(0, Math.min(ankle[1], toe[1] + (ankle[1] - toe[1]) * 0.3))], footLen);
    put(`${p}Arm` as BoneName, shoulder);
    put(`${p}ForeArm` as BoneName, elbow);
    put(`${p}Hand` as BoneName, hand);
    // A coxa passa pelo ponto do meio (pernas curvas); o resto segue direto.
    segments.push({ bone: B[`${p}UpLeg` as BoneName], a: hip, b: thigh });
    segments.push({ bone: B[`${p}UpLeg` as BoneName], a: thigh, b: knee });
    segments.push({ bone: B[`${p}Leg` as BoneName], a: knee, b: ankle });
    segments.push({ bone: B[`${p}Foot` as BoneName], a: ankle, b: [toe[0], Math.max(0, toe[1])] });
    segments.push({ bone: B[`${p}Arm` as BoneName], a: shoulder, b: elbow });
    segments.push({ bone: B[`${p}ForeArm` as BoneName], a: elbow, b: hand });
    segments.push({ bone: B[`${p}Hand` as BoneName], a: hand, b: lerp(elbow, hand, 1.5) });
  }
  return { world, segments };
}

function segDist(px: number, py: number, s: Segment): number {
  const dx = s.b[0] - s.a[0];
  const dy = s.b[1] - s.a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - s.a[0]) * dx + (py - s.a[1]) * dy) / len2));
  return Math.hypot(px - (s.a[0] + t * dx), py - (s.a[1] + t * dy));
}

/** Acrescenta skinIndex/skinWeight: cada vértice segue, sobretudo, os ossos mais próximos (até 4). */
export function skinGeometry(geometry: BufferGeometry, segments: Segment[]): void {
  const pos = geometry.getAttribute("position");
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wts = new Float32Array(n * 4);
  const cand: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    cand.length = 0;
    // Um osso pode ter mais de um segmento (coxa): vale o mais próximo.
    for (const s of segments) {
      const d = segDist(x, y, s);
      const prev = cand.findIndex((c) => c[0] === s.bone);
      if (prev < 0) cand.push([s.bone, d]);
      else if (d < cand[prev]![1]) cand[prev]![1] = d;
    }
    cand.sort((a, b) => a[1] - b[1]);
    // Peso ~ 1/d⁴: o osso mais próximo domina; perto da junta, dois osos se misturam.
    const d0 = Math.max(cand[0]![1], 1e-4);
    let sum = 0;
    const top: [number, number][] = [];
    for (let k = 0; k < 4; k++) {
      const w = Math.pow(d0 / Math.max(cand[k]![1], 1e-4), 4);
      if (w < 0.02) break;
      top.push([cand[k]![0], w]);
      sum += w;
    }
    for (let k = 0; k < top.length; k++) {
      idx[i * 4 + k] = top[k]![0];
      wts[i * 4 + k] = top[k]![1] / sum;
    }
  }
  geometry.setAttribute("skinIndex", new BufferAttribute(idx, 4));
  geometry.setAttribute("skinWeight", new BufferAttribute(wts, 4));
}

export interface BakedRig {
  pieces: RigPiece[];
  world: RigLayout["world"];
}

/** Orienta o modelo e calcula pesos e posições dos ossos (feito uma vez por modelo; a geometria é compartilhada). */
export function bakeRig(scene: Object3D, rig: RigMarks): BakedRig {
  const oriented = orientModel(scene, rig.yaw);
  const layout = layoutFromMarks(rig, oriented.size.y);
  for (const p of oriented.pieces) skinGeometry(p.geometry, layout.segments);
  return { pieces: oriented.pieces, world: layout.world };
}

const cache = new Map<string, BakedRig>();

export function getBakedRig(url: string, scene: Object3D, rig: RigMarks): BakedRig {
  const key = `${url}|${JSON.stringify(rig)}`;
  let baked = cache.get(key);
  if (!baked) {
    baked = bakeRig(scene, rig);
    cache.set(key, baked);
    if (cache.size > 24) cache.delete(cache.keys().next().value as string);
  }
  return baked;
}

/** Instância com ossos próprios (geometria e materiais compartilhados com as outras instâncias). */
export function instantiateRig(baked: BakedRig): Group {
  const root = new Group();
  const bones = createBones(baked.world);
  const meshes = baked.pieces.map((p) => {
    const m = new SkinnedMesh(p.geometry, p.material);
    m.name = p.name;
    m.frustumCulled = false;
    root.add(m);
    return m;
  });
  meshes[0]!.add(bones[0]!);
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);
  for (const m of meshes) m.bind(skeleton);
  void BONE_NAMES;
  return root;
}
