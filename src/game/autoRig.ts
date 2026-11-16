// Personagens sem esqueleto (Helena, Stewart, Bennyse, Amanda, Garota1, Gordao, Cesar, Akiyama): em tempo de execução ganham o esqueleto GTA SA do Law1
// e pesos de pele calculados pela distância aos ossos, então andam, correm, lutam e seguram armas com os MESMOS clipes dos Law/Carlos.
// Os arquivos .glb não mudam. Todos os modelos estão em pose A, parecida com a do Law1 (braços para baixo, ~25° do corpo); só o Akiyama está em T
// (braços abertos) e tem os braços girados para baixo antes de ligar aos ossos.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTER_HEIGHT, loadBase } from './characters';

export const RIGGED_NAMES: ReadonlySet<string> = new Set(['Vini', 'Xandao', 'PF', 'Gang1', 'Gang2', 'Gang3', 'Gang4', 'MaiBrasil', 'MaiMexico']);

/** "_R_Thigh_07" → "r thigh"; "Bip01_R_Clavicle_021" → "r clavicle" */
const key = (n: string): string => n.replace(/^_+/, '').replace(/^Bip01_/i, '').replace(/_\d+$/, '').replace(/_/g, ' ').trim().toLowerCase();

interface Seg { k: string; a: THREE.Vector3; b: THREE.Vector3; r: number }

const SIDES = ['r', 'l'] as const;
const PSEL = 3; // quanto mais alto, mais "duro" o peso (o osso mais perto manda mais)
const EPS = 0.012;

function distSeg(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, tmp: THREE.Vector3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 1e-9 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  tmp.set(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
  return tmp.length();
}

const smooth = (x: number, a: number, b: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * `source` = o personagem estático já pronto do `createCharacter` (1,8 m, pés no chão, centrado, olhando para +Z).
 * Devolve um grupo no mesmo formato, mas com o esqueleto do Law1 (o `Animator` o reconhece como GTA).
 */
export async function buildRigged(source: THREE.Object3D, name: string): Promise<THREE.Group> {
  // 1. esqueleto do Law1, no mesmo tamanho e lugar do Law1 do jogo
  const rig = SkeletonUtils.clone(await loadBase('Law1'));
  rig.rotation.y = -Math.PI / 2; // modelos GTA SA olham para +X
  let lawMesh: THREE.SkinnedMesh | null = null;
  rig.traverse((o) => { if (!lawMesh && (o as THREE.SkinnedMesh).isSkinnedMesh) lawMesh = o as THREE.SkinnedMesh; });
  if (!lawMesh) throw new Error('Law1 sem malha');
  const lm = lawMesh as THREE.SkinnedMesh;
  rig.updateMatrixWorld(true);
  lm.skeleton.update();
  const box = new THREE.Box3().setFromObject(rig, true);
  rig.scale.multiplyScalar(CHARACTER_HEIGHT / box.getSize(new THREE.Vector3()).y);
  rig.updateMatrixWorld(true);
  lm.skeleton.update();
  box.setFromObject(rig, true);
  const c0 = box.getCenter(new THREE.Vector3());
  rig.position.x -= c0.x;
  rig.position.z -= c0.z;
  rig.position.y -= box.min.y;
  const parent = lm.parent!;
  parent.remove(lm);
  const root = new THREE.Group();
  root.add(rig);
  root.updateMatrixWorld(true);

  // 2. posições dos ossos (no espaço do grupo) e cápsulas de influência
  const bones = new Map<string, THREE.Bone>();
  rig.traverse((o) => { if ((o as THREE.Bone).isBone) bones.set(key(o.name), o as THREE.Bone); });
  const P = (k: string): THREE.Vector3 => {
    const b = bones.get(k);
    if (!b) throw new Error(`osso ${k} não existe no Law1`);
    return b.getWorldPosition(new THREE.Vector3());
  };
  const up = (v: THREE.Vector3, dy: number): THREE.Vector3 => v.clone().add(new THREE.Vector3(0, dy, 0));
  const segs: Seg[] = [
    { k: 'pelvis', a: up(P('pelvis'), -0.08), b: up(P('pelvis'), 0.06), r: 0.12 },
    { k: 'spine', a: P('spine'), b: P('spine1'), r: 0.15 },
    { k: 'spine1', a: P('spine1'), b: P('neck'), r: 0.17 },
    { k: 'neck', a: P('neck'), b: P('head'), r: 0.06 },
    { k: 'head', a: P('head'), b: up(P('head'), 0.17), r: 0.11 },
  ];
  for (const s of SIDES) {
    segs.push(
      { k: `${s} clavicle`, a: P(`${s} clavicle`), b: P(`${s} upperarm`), r: 0.05 },
      { k: `${s} upperarm`, a: P(`${s} upperarm`), b: P(`${s} forearm`), r: 0.05 },
      { k: `${s} forearm`, a: P(`${s} forearm`), b: P(`${s} hand`), r: 0.04 },
      { k: `${s} hand`, a: P(`${s} hand`), b: P(`${s} finger01`), r: 0.04 },
      { k: `${s} thigh`, a: P(`${s} thigh`), b: P(`${s} calf`), r: 0.09 },
      { k: `${s} calf`, a: P(`${s} calf`), b: P(`${s} foot`), r: 0.06 },
      { k: `${s} foot`, a: P(`${s} foot`), b: P(`${s} toe0`), r: 0.05 },
      { k: `${s} toe0`, a: P(`${s} toe0`), b: P(`${s} toe0`).add(new THREE.Vector3(0, 0.01, 0.09)), r: 0.03 },
    );
  }
  const skelBones = segs.map((s) => bones.get(s.k)!);

  // 3. malhas do personagem estático, no espaço do grupo
  source.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  source.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });

  // pose em T (Akiyama): gira os braços para baixo, até a direção do braço do Law1
  let maxX = 0;
  const tmpV = new THREE.Vector3();
  for (const m of meshes) {
    const pa = m.geometry.getAttribute('position');
    for (let i = 0; i < pa.count; i++) maxX = Math.max(maxX, Math.abs(tmpV.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld).x));
  }
  let fixArms: ((v: THREE.Vector3) => void) | null = null;
  if (maxX > 0.75) {
    const sh = { r: P('r upperarm'), l: P('l upperarm') };
    const hand = { r: P('r hand'), l: P('l hand') };
    // direção atual do braço: do ombro até o centro dos vértices do braço (longe do corpo)
    const acc = { r: new THREE.Vector3(), l: new THREE.Vector3() };
    const cnt = { r: 0, l: 0 };
    for (const m of meshes) {
      const pa = m.geometry.getAttribute('position');
      for (let i = 0; i < pa.count; i++) {
        const v = tmpV.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld);
        if (Math.abs(v.x) > 0.5 && v.y > 1.0) { const s = v.x < 0 ? 'r' : 'l'; acc[s].add(v); cnt[s]++; }
      }
    }
    const rots = { r: new THREE.Quaternion(), l: new THREE.Quaternion() };
    for (const s of SIDES) {
      if (!cnt[s]) continue;
      const cur = acc[s].multiplyScalar(1 / cnt[s]).sub(sh[s]).normalize();
      const want = hand[s].clone().sub(sh[s]).normalize();
      rots[s].setFromUnitVectors(cur, want);
    }
    fixArms = (v) => {
      const s = v.x < 0 ? 'r' : 'l';
      const a = smooth(Math.abs(v.x) - Math.abs(sh[s].x), 0.0, 0.16) * smooth(v.y, 1.1, 1.3);
      if (a <= 0) return;
      const q = new THREE.Quaternion().slerp(rots[s], a);
      v.sub(sh[s]).applyQuaternion(q).add(sh[s]);
    };
  }

  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const tmp = new THREE.Vector3();
  const v = new THREE.Vector3();
  const skeleton = new THREE.Skeleton(skelBones);
  const w4 = new Float32Array(segs.length);
  for (const m of meshes) {
    const g = m.geometry;
    const pa = g.getAttribute('position');
    const n = pa.count;
    const pos = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld);
      if (fixArms) fixArms(v);
      // pesos: 1 / (distância além do raio do osso)^3, os 4 mais fortes
      for (let j = 0; j < segs.length; j++) {
        const s = segs[j]!;
        const d = Math.max(0, distSeg(v, s.a, s.b, tmp) - s.r);
        w4[j] = 1 / Math.pow(d + EPS, PSEL);
      }
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        let best = -1;
        let bw = 0;
        for (let j = 0; j < segs.length; j++) if (w4[j]! > bw) { bw = w4[j]!; best = j; }
        if (best < 0) break;
        si[i * 4 + k] = best;
        sw[i * 4 + k] = bw;
        sum += bw;
        w4[best] = 0;
      }
      for (let k = 0; k < 4; k++) sw[i * 4 + k] = sum > 0 ? sw[i * 4 + k]! / sum : k === 0 ? 1 : 0;
      v.applyMatrix4(inv);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const uv = g.getAttribute('uv');
    if (uv) ng.setAttribute('uv', uv);
    const col = g.getAttribute('color');
    if (col) ng.setAttribute('color', col);
    ng.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    ng.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    if (g.index) ng.setIndex(g.index);
    for (const grp of g.groups) ng.addGroup(grp.start, grp.count, grp.materialIndex);
    ng.computeVertexNormals();
    const mat = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
    const sm = new THREE.SkinnedMesh(ng, mat);
    sm.name = `rig_${name}_${m.name || meshes.indexOf(m)}`;
    sm.castShadow = true;
    sm.frustumCulled = false;
    parent.add(sm);
    sm.updateMatrixWorld(true);
    sm.bind(skeleton);
  }
  return root;
}
