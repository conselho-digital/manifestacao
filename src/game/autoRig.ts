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

/** Giro extra dos braços para perto do corpo (graus, no plano da frente, em volta do ombro): o Vini tem os braços mais abertos que o esqueleto do Law1. */
const ARM_IN: Record<string, number> = { Vini: 11, Xandao: 6, MaiBrasil: 15, MaiMexico: 15 };
/** Giro (rad) das clavículas no idle para os ombros voltarem ao lado do peito (`Animator.shoulderFwd`): só o Vini, que tem os ombros atrás do peito; nos outros deixava os braços abertos demais. */
const SHOULDER_FWD: Record<string, number> = { Vini: -0.35 };
/**
 * Corpo mais cheio (só quem pede): as Mai têm braços e pernas finíssimos como gravetos e pés minúsculos. Cada vértice é empurrado para fora do eixo do osso que o move
 * ([radial, axial, profundidade]: quanto o membro engrossa e, nos pés, quanto alonga a partir do tornozelo), antes de ligar os pesos; vale na pose de repouso, então anima junto.
 */
const BODY_FIX: Record<string, Record<string, readonly [number, number, number?]>> = {
  MaiBrasil: { thigh: [1.05, 1, 1.55], calf: [1.05, 1, 1.5], foot: [1.2, 1.1], toe0: [1.2, 1.1] },
  MaiMexico: { thigh: [1.05, 1, 1.55], calf: [1.05, 1, 1.5], foot: [1.2, 1.1], toe0: [1.2, 1.1] },
};
/** Ordem dos ossos nos atributos `_rigidx`/`_rigw` (pesos de pele NATIVOS do DFF, gravados por scripts/models/chars/dff2glb.mjs com SKIN=1: MESMA lista). */
const RIG_NAMES = ['pelvis', 'spine', 'spine1', 'neck', 'head', 'r clavicle', 'r upperarm', 'r forearm', 'r hand', 'r finger', 'r finger01', 'l clavicle', 'l upperarm', 'l forearm', 'l hand', 'l finger', 'l finger01', 'r thigh', 'r calf', 'r foot', 'r toe0', 'l thigh', 'l calf', 'l foot', 'l toe0'];
const Z_AXIS = new THREE.Vector3(0, 0, 1);
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
      { k: `${s} hand`, a: P(`${s} hand`), b: P(`${s} finger`), r: 0.04 },
      // dedos: o Law tem só dois ossos (Finger e Finger01) em cadeia; sem pesos neles a mão nunca fecha (empunhar arma, punho, mão relaxada)
      { k: `${s} finger`, a: P(`${s} finger`), b: P(`${s} finger01`), r: 0.03 },
      { k: `${s} finger01`, a: P(`${s} finger01`), b: P(`${s} finger01`).add(P(`${s} finger01`).sub(P(`${s} finger`)).normalize().multiplyScalar(0.08)), r: 0.028 },
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
  const armIn = ((ARM_IN[name] ?? 0) * Math.PI) / 180;
  if (maxX > 0.75 || armIn > 0) {
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
      if (maxX > 0.75) rots[s].setFromUnitVectors(cur, want);
    }
    fixArms = (v) => {
      const s = v.x < 0 ? 'r' : 'l';
      const a = smooth(Math.abs(v.x) - Math.abs(sh[s].x), 0.0, 0.16) * (maxX > 0.75 ? smooth(v.y, 1.1, 1.3) : 1 - smooth(v.y, sh[s].y - 0.12, sh[s].y + 0.02));
      if (a <= 0) return;
      const q = new THREE.Quaternion().slerp(rots[s], a);
      v.sub(sh[s]).applyQuaternion(q);
      // para perto do corpo: gira em volta do eixo Z (frente do modelo); fora do ombro mais, junto ao peito nada
      if (armIn > 0) v.applyAxisAngle(Z_AXIS, s === 'l' ? -armIn * a : armIn * a);
      v.add(sh[s]);
    };
  }

  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const tmp = new THREE.Vector3();
  const v = new THREE.Vector3();
  const bodyFix = BODY_FIX[name];
  interface Built { m: THREE.Mesh; pos: Float32Array; wpos: Float32Array; si: Uint16Array; sw: Float32Array }
  const built: Built[] = [];
  const w4 = new Float32Array(segs.length);
  for (const m of meshes) {
    const g = m.geometry;
    const pa = g.getAttribute('position');
    const n = pa.count;
    const pos = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const wpos = new Float32Array(n * 3);
    const nIdx = g.getAttribute('_rigidx');
    const nW = g.getAttribute('_rigw');
    const native = nIdx && nW ? RIG_NAMES.map((nm) => segs.findIndex((sg) => sg.k === nm)) : null;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld);
      if (fixArms) fixArms(v);
      if (native && nIdx && nW) { // pesos de pele do próprio modelo (esqueleto SA do DFF): o braço e a perna deformam como o artista fez
        let sumN = 0;
        for (let k = 0; k < 4; k++) { const wk = nW.getComponent(i, k); const jk = native[Math.round(nIdx.getComponent(i, k))] ?? 0; si[i * 4 + k] = Math.max(0, jk); sw[i * 4 + k] = wk; sumN += wk; }
        for (let k = 0; k < 4; k++) sw[i * 4 + k] = sumN > 0 ? sw[i * 4 + k]! / sumN : k === 0 ? 1 : 0;
      } else {
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
      }
      if (bodyFix) {
        let dx = 0, dy = 0, dz = 0;
        for (let k = 0; k < 4; k++) {
          const wk = sw[i * 4 + k]!;
          const sg = segs[si[i * 4 + k]!]!;
          const f = bodyFix[sg.k.replace(/^[rl] /, '')];
          if (!f || wk <= 0) continue;
          distSeg(v, sg.a, sg.b, tmp); // tmp = ponto mais próximo do eixo − v
          dx -= wk * (f[0] - 1) * tmp.x; dy -= wk * (f[0] - 1) * tmp.y; dz -= wk * ((f[2] ?? f[0]) - 1) * tmp.z; // 3º número: só a profundidade (frente-trás), para pernas "de papel" vistas de lado
          if (f[1] !== 1) { dx += wk * (f[1] - 1) * (v.x - sg.a.x); dy += wk * (f[1] - 1) * (v.y - sg.a.y); dz += wk * (f[1] - 1) * (v.z - sg.a.z); }
        }
        v.x += dx; v.y += dy; v.z += dz;
      }
      wpos[i * 3] = v.x; wpos[i * 3 + 1] = v.y; wpos[i * 3 + 2] = v.z;
      v.applyMatrix4(inv);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    built.push({ m, pos, wpos, si, sw });
  }
  // ---- dedos de verdade: cada mão ganha 4 dedos (3 juntas) e o polegar (2 juntas) medidos na malha DA MÃO do modelo, não nos 2 ossos do Law1 ----
  const extra: THREE.Bone[] = [];
  const fingerRig: Record<string, { bone: THREE.Bone; axis: number[]; ang: number }[]> = { r: [], l: [] };
  const palmGrip: Record<string, number[]> = {};
  const palmN: Record<string, number[]> = {};
  const FINGER_ANG = [1.15, 1.4, 1.0]; // dobra de cada junta com a mão 100% fechada (rad)
  const THUMB_ANG = [0.7, 0.6];
  const reweights: { b: Built; i: number; list: [number, number][] }[] = [];
  const V3 = (): THREE.Vector3 => new THREE.Vector3();
  const wv = V3();
  for (const sd of SIDES) {
    const handB = bones.get(`${sd} hand`)!;
    const H: { b: Built; i: number; p: THREE.Vector3 }[] = [];
    for (const b of built) {
      const n = b.si.length / 4;
      for (let i = 0; i < n; i++) {
        let top = 0;
        for (let k = 1; k < 4; k++) if (b.sw[i * 4 + k]! > b.sw[i * 4 + top]!) top = k;
        const key = segs[b.si[i * 4 + top]!]?.k;
        if ((key === `${sd} hand` || key === `${sd} finger` || key === `${sd} finger01`) && b.sw[i * 4 + top]! > 0.3) H.push({ b, i, p: new THREE.Vector3(b.wpos[i * 3]!, b.wpos[i * 3 + 1]!, b.wpos[i * 3 + 2]!) });
      }
    }
    if (H.length < 24) continue;
    const W = P(`${sd} hand`);
    const C = V3();
    for (const h of H) C.add(h.p);
    C.multiplyScalar(1 / H.length);
    const aLaw = P(`${sd} finger`).sub(W).normalize();
    const aMesh = C.clone().sub(W).normalize();
    const a = aMesh.angleTo(aLaw) < 0.6 ? aMesh : aLaw;
    // lado da palma: para onde a ponta do Law1 vai ao fechar a mão (o jogo dobra o osso `finger` no eixo Z local, 75° × lado)
    const fing = bones.get(`${sd} finger`)!;
    const fing1 = bones.get(`${sd} finger01`)!;
    const p0 = fing1.getWorldPosition(V3());
    const qc = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, (75 * Math.PI / 180) * (sd === 'l' ? 1 : -1));
    fing.quaternion.multiply(qc); fing.updateMatrixWorld(true);
    const dCurl = fing1.getWorldPosition(V3()).sub(p0);
    fing.quaternion.multiply(qc.clone().invert()); fing.updateMatrixWorld(true);
    const n = dCurl.addScaledVector(a, -dCurl.dot(a)).normalize();
    // com os braços caídos (pose A) a palma olha para a coxa: mão direita (x < 0) para +x, esquerda para -x. O teste do Law1 acima deu a MESMA direção (-x) nas duas mãos, ou seja, a direita fechava para fora.
    if (n.x * (W.x < 0 ? 1 : -1) < 0) n.negate();
    const u = V3().crossVectors(a, n).normalize();
    const rel = (p: THREE.Vector3): [number, number, number] => { wv.copy(p).sub(W); return [wv.dot(a), wv.dot(u), wv.dot(n)]; };
    const co = H.map((h) => rel(h.p));
    // a malha da mão não começa onde está o osso do pulso do Law1: o pulso do MODELO é a ponta mais baixa da mão (2º percentil)
    const ps = co.map((c) => c[0]).sort((x, y) => x - y);
    const pw = ps[Math.floor(ps.length * 0.02)]!;
    const L = ps[ps.length - 1]!;
    if (L - pw < 0.07) continue;
    const pk = pw + 0.48 * (L - pw);
    // palma: largura e superfície
    let xmin = 1e9, xmax = -1e9;
    const palmW: number[] = [];
    let pcn = 0;
    for (const c of co) if (c[0] > pw + 0.1 * (L - pw) && c[0] < pk) { xmin = Math.min(xmin, c[1]); xmax = Math.max(xmax, c[1]); palmW.push(c[2]); }
    if (palmW.length < 6) continue;
    palmW.sort((q, r) => q - r);
    pcn = palmW[Math.floor(palmW.length * 0.9)]!;
    const xmid = (xmin + xmax) / 2;
    const half = Math.max(0.012, (xmax - xmin) / 2);
    // ponto onde o cabo/empunhadura fica na mão fechada: um pouco à frente da palma, entre a palma e os nós dos dedos
    const gw = W.clone().addScaledVector(a, pw + 0.7 * (pk - pw)).addScaledVector(u, xmid).addScaledVector(n, pcn + 0.012);
    palmGrip[sd] = gw.sub(W).applyQuaternion(handB.getWorldQuaternion(new THREE.Quaternion()).invert()).toArray();
    // polegar: lado da frente do corpo (palma para a coxa), saindo da lateral da palma
    const tsign = Math.abs(u.z) > 0.2 ? Math.sign(u.z) : 1;
    const isThumb = (c: [number, number, number]): boolean => tsign * (c[1] - xmid) > half * (c[0] < pk ? 0.8 : 1.05) && c[0] < pw + 0.9 * (L - pw) && c[0] > pw + 0.1 * (L - pw);
    const fingerIdx: number[] = [];
    const thumbIdx: number[] = [];
    co.forEach((c, k) => { if (isThumb(c)) thumbIdx.push(k); else if (c[0] > pk - 0.012) fingerIdx.push(k); });
    if (fingerIdx.length < 8) continue;
    let fxa = 1e9, fxb = -1e9, fw = 0;
    for (const k of fingerIdx) { fxa = Math.min(fxa, co[k]![1]); fxb = Math.max(fxb, co[k]![1]); fw += co[k]![2]; }
    fw /= fingerIdx.length;
    const fspan = Math.max(0.02, fxb - fxa);
    const hq = handB.getWorldQuaternion(new THREE.Quaternion());
    const hqi = hq.clone().invert();
    const mkBone = (parent: THREE.Bone, world: THREE.Vector3, nm: string): THREE.Bone => {
      const bn = new THREE.Bone();
      bn.name = nm;
      bn.position.copy(parent.worldToLocal(world.clone()));
      parent.add(bn);
      parent.updateMatrixWorld(true);
      bn.updateMatrixWorld(true);
      return bn;
    };
    const at = (pp: number, xx: number, ww: number): THREE.Vector3 => W.clone().addScaledVector(a, pp).addScaledVector(u, xx).addScaledVector(n, ww);
    const axisU = u.clone().applyQuaternion(hqi).toArray();
    palmN[sd] = n.clone().applyQuaternion(hqi).toArray();
    const J = [pk, pk + 0.36 * (L - pk), pk + 0.68 * (L - pk)];
    const laneBase: number[] = [];
    for (let k = 0; k < 4; k++) {
      let parent = handB;
      laneBase.push(segs.length + extra.length);
      for (let j = 0; j < 3; j++) {
        const bn = mkBone(parent, at(J[j]!, fxa + ((k + 0.5) / 4) * fspan, fw), `${sd}_f${k}_${j}`);
        extra.push(bn);
        fingerRig[sd]!.push({ bone: bn, axis: axisU, ang: FINGER_ANG[j]! });
        parent = bn;
      }
    }
    const handIdx = segs.findIndex((sg) => sg.k === `${sd} hand`);
    const B = 0.012;
    for (const k of fingerIdx) {
      const h = H[k]!;
      const c = co[k]!;
      const f = ((c[1] - fxa) / fspan) * 4 - 0.5;
      const lo = Math.max(0, Math.min(3, Math.floor(f)));
      const hi = Math.min(3, lo + 1);
      const t = lo === hi ? 0 : Math.max(0, Math.min(1, f - lo));
      const sm = J.map((jp) => smooth(c[0], jp - B, jp + B));
      const sj = [sm[0]! - sm[1]!, sm[1]! - sm[2]!, sm[2]!];
      const list: [number, number][] = [[handIdx, 1 - sm[0]!]];
      for (let j = 0; j < 3; j++) {
        list.push([laneBase[lo]! + j, sj[j]! * (1 - t)]);
        if (hi !== lo) list.push([laneBase[hi]! + j, sj[j]! * t]);
      }
      reweights.push({ b: h.b, i: h.i, list });
    }
    if (thumbIdx.length >= 6) {
      const tb = at(pw + 0.2 * (L - pw), xmid + tsign * half, pcn * 0.6);
      let tip = tb.clone();
      let best = 0;
      for (const k of thumbIdx) { const d = H[k]!.p.distanceTo(tb); if (d > best) { best = d; tip = H[k]!.p; } }
      const dirT = tip.clone().sub(tb).normalize();
      const lenT = Math.max(0.03, best);
      const t0 = mkBone(handB, tb, `${sd}_th0`);
      const t1 = mkBone(t0, tb.clone().addScaledVector(dirT, 0.5 * lenT), `${sd}_th1`);
      const i0 = segs.length + extra.length;
      extra.push(t0, t1);
      const axisT = V3().crossVectors(dirT, n).normalize().applyQuaternion(hqi).toArray();
      fingerRig[sd]!.push({ bone: t0, axis: axisT, ang: THUMB_ANG[0]! }, { bone: t1, axis: axisT, ang: THUMB_ANG[1]! });
      for (const k of thumbIdx) {
        const q = H[k]!.p.clone().sub(tb).dot(dirT);
        const s0 = smooth(q, -0.012, 0.012);
        const s1 = smooth(q, 0.5 * lenT - 0.012, 0.5 * lenT + 0.012);
        reweights.push({ b: H[k]!.b, i: H[k]!.i, list: [[handIdx, 1 - s0], [i0, s0 - s1], [i0 + 1, s1]] });
      }
    }
  }
  rig.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([...skelBones, ...extra]);
  for (const rw of reweights) {
    const l = rw.list.filter((e) => e[1] > 1e-3).sort((x, y) => y[1] - x[1]).slice(0, 4);
    let sum = 0;
    for (const e of l) sum += e[1];
    for (let k = 0; k < 4; k++) {
      rw.b.si[rw.i * 4 + k] = l[k]?.[0] ?? 0;
      rw.b.sw[rw.i * 4 + k] = l[k] ? l[k]![1] / sum : 0;
    }
  }
  for (const b of built) {
    const g = b.m.geometry;
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(b.pos, 3));
    const uv = g.getAttribute('uv');
    if (uv) ng.setAttribute('uv', uv);
    const col = g.getAttribute('color');
    if (col) ng.setAttribute('color', col);
    ng.setAttribute('skinIndex', new THREE.BufferAttribute(b.si, 4));
    ng.setAttribute('skinWeight', new THREE.BufferAttribute(b.sw, 4));
    if (g.index) ng.setIndex(g.index);
    for (const grp of g.groups) ng.addGroup(grp.start, grp.count, grp.materialIndex);
    ng.computeVertexNormals();
    const mat = Array.isArray(b.m.material) ? b.m.material.map((x) => x.clone()) : b.m.material.clone();
    const sm = new THREE.SkinnedMesh(ng, mat);
    sm.name = `rig_${name}_${b.m.name || meshes.indexOf(b.m)}`;
    sm.castShadow = true;
    sm.frustumCulled = false;
    parent.add(sm);
    sm.updateMatrixWorld(true);
    sm.bind(skeleton);
  }
  if (palmGrip.r) root.userData.handGrip = palmGrip.r;
  if (palmGrip.l) root.userData.handGripL = palmGrip.l;
  if (palmN.r && palmN.l) root.userData.palmN = palmN;
  if (fingerRig.r!.length && fingerRig.l!.length) root.userData.fingerRig = fingerRig;
  if (SHOULDER_FWD[name] !== undefined) root.userData.shoulderFwd = SHOULDER_FWD[name];
  return root;
}
