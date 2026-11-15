// Personagens criados na ferramenta /personagens (só o admin cria): uma "receita" que mistura partes dos modelos Law1-9 (cabeça, tronco e
// pernas — todos têm o MESMO esqueleto GTA SA, então animam igual), cores por parte e, no lugar da cabeça, um modelo 3D novo preso ao osso
// da cabeça. As receitas e as cabeças novas ficam no Supabase (tabelas `custom_characters` e `custom_heads`, bucket `chars`); todos leem.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { supabase } from '../net/supabase';
import { CHARACTER_HEIGHT, loadBase } from './characters';

export type Part = 'head' | 'torso' | 'legs';
export const PARTS: Part[] = ['head', 'torso', 'legs'];
export const PART_LABEL: Record<Part, string> = { head: 'Cabeça', torso: 'Tronco e braços', legs: 'Pernas e pés' };
export const LAW_SOURCES = ['Law1', 'Law2', 'Law3', 'Law4', 'Law5', 'Law6', 'Law7', 'Law8', 'Law9'] as const;
const LAW_RE = /^Law[1-9]$/;
const HEAD_ID_RE = /^h_[a-z0-9]{4,16}$/;
const HEX = /^#[0-9a-f]{6}$/i;

export interface CharRecipe {
  /** 'Law1'..'Law9' (cabeça do modelo) ou 'h_xxxx' (cabeça 3D nova da biblioteca) */
  head: string;
  torso: string;
  legs: string;
  /** cor multiplicada na textura de cada parte (#rrggbb; branco = sem mudar) */
  tint?: Partial<Record<Part, string>>;
  /** cabeça nova: posição (m, a partir do osso da cabeça: x direita, y cima, z frente), giro (graus) e escala */
  hp?: [number, number, number];
  hr?: [number, number, number];
  hs?: number;
  /** rosto a partir de fotos (projetadas na cabeça do modelo escolhido em `head`) */
  face?: FaceRecipe;
}
/** Fotos do rosto (endereços https) e como cada uma se encaixa na cabeça: [zoom, deslocamento x, deslocamento y]; `m` = área do rosto [largura, altura, altura do centro] */
export interface FaceRecipe {
  f: string; l?: string; r?: string;
  pf: [number, number, number]; pl: [number, number, number]; pr: [number, number, number];
  m: [number, number, number];
}
export const FACE_DEFAULT: Omit<FaceRecipe, 'f'> = { pf: [0.7, 0, 0], pl: [0.7, 0, 0], pr: [0.7, 0, 0], m: [0.3, 0.38, -0.04] };
export interface HeadDef { id: string; name: string; url: string }
export interface CustomChar { id: string; name: string; recipe: CharRecipe; face: string }

export const isCustomId = (v: unknown): v is `c_${string}` => typeof v === 'string' && /^c_[a-z0-9]{4,16}$/.test(v);
export const isHeadId = (v: unknown): v is string => typeof v === 'string' && HEAD_ID_RE.test(v);

const vec3 = (v: unknown, lim: number): [number, number, number] | undefined => {
  if (!Array.isArray(v) || v.length !== 3) return undefined;
  const o = v.map((x) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(-lim, Math.min(lim, x)) : 0));
  return [o[0]!, o[1]!, o[2]!];
};

const HTTPS = /^https:\/\/[^\s]{4,400}$/;
const nums = (v: unknown, n: number, lo: number, hi: number, d: number[]): number[] => {
  const a = Array.isArray(v) ? v : [];
  return d.slice(0, n).map((x, i) => (typeof a[i] === 'number' && Number.isFinite(a[i]) ? Math.max(lo, Math.min(hi, a[i] as number)) : x));
};
/** Valida o rosto por fotos (só endereços https; o editor usa blob: só na prévia, sem passar por aqui). */
export function cleanFace(v: unknown): FaceRecipe | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.f !== 'string' || !HTTPS.test(o.f)) return null;
  const out: FaceRecipe = {
    f: o.f,
    pf: nums(o.pf, 3, -1.5, 1.5, FACE_DEFAULT.pf) as FaceRecipe['pf'],
    pl: nums(o.pl, 3, -1.5, 1.5, FACE_DEFAULT.pl) as FaceRecipe['pl'],
    pr: nums(o.pr, 3, -1.5, 1.5, FACE_DEFAULT.pr) as FaceRecipe['pr'],
    m: nums(o.m, 3, -1, 1, FACE_DEFAULT.m) as FaceRecipe['m'],
  };
  if (typeof o.l === 'string' && HTTPS.test(o.l)) out.l = o.l;
  if (typeof o.r === 'string' && HTTPS.test(o.r)) out.r = o.r;
  return out;
}

/** Valida uma receita vinda do servidor ou do editor. */
export function cleanRecipe(v: unknown): CharRecipe | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const head = typeof r.head === 'string' && (LAW_RE.test(r.head) || HEAD_ID_RE.test(r.head)) ? r.head : null;
  const torso = typeof r.torso === 'string' && LAW_RE.test(r.torso) ? r.torso : null;
  const legs = typeof r.legs === 'string' && LAW_RE.test(r.legs) ? r.legs : null;
  if (!head || !torso || !legs) return null;
  const out: CharRecipe = { head, torso, legs };
  if (r.tint && typeof r.tint === 'object') {
    const t = r.tint as Record<string, unknown>;
    const tint: Partial<Record<Part, string>> = {};
    for (const p of PARTS) if (typeof t[p] === 'string' && HEX.test(t[p] as string) && (t[p] as string).toLowerCase() !== '#ffffff') tint[p] = (t[p] as string).toLowerCase();
    if (Object.keys(tint).length) out.tint = tint;
  }
  const face = cleanFace(r.face);
  if (face && !isHeadId(head)) out.face = face;
  const hp = vec3(r.hp, 1);
  const hr = vec3(r.hr, 360);
  if (hp) out.hp = hp;
  if (hr) out.hr = hr;
  if (typeof r.hs === 'number' && Number.isFinite(r.hs)) out.hs = Math.max(0.2, Math.min(4, r.hs));
  return out;
}

// ---------- biblioteca (servidor) ----------
const chars = new Map<string, CustomChar>();
const heads = new Map<string, HeadDef>();
const listeners = new Set<() => void>();
export const customList = (): CustomChar[] => [...chars.values()];
export const customOf = (id: string): CustomChar | undefined => chars.get(id);
export const headList = (): HeadDef[] => [...heads.values()];
export const headOf = (id: string): HeadDef | undefined => heads.get(id);
/** (ferramenta) cabeça ainda não enviada: vale só neste navegador, com endereço local (blob:) */
export function registerLocalHead(def: HeadDef): void { heads.set(def.id, def); }
export function forgetHead(id: string): void { heads.delete(id); }
/** avisa quando a lista de personagens novos muda (carregou do servidor) */
export function onCustomChange(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }

const SAFE_URL = /^https:\/\/[^\s]+$/;
let loading: Promise<void> | null = null;
/** Lê personagens e cabeças novas do servidor (uma vez; `force` lê de novo). Sem servidor ou sem as tabelas, a lista fica vazia. */
export function loadCustom(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = (async () => {
    if (!supabase) return;
    try {
      const [h, c] = await Promise.all([
        supabase.from('custom_heads').select('id,name,url').order('created_at'),
        supabase.from('custom_characters').select('id,name,recipe,face_url').order('created_at'),
      ]);
      heads.clear();
      chars.clear();
      for (const row of (h.data ?? []) as { id: string; name: string; url: string }[]) {
        if (isHeadId(row.id) && SAFE_URL.test(row.url)) heads.set(row.id, { id: row.id, name: String(row.name).slice(0, 30), url: row.url });
      }
      for (const row of (c.data ?? []) as { id: string; name: string; recipe: unknown; face_url: string }[]) {
        const recipe = cleanRecipe(row.recipe);
        if (isCustomId(row.id) && recipe && SAFE_URL.test(row.face_url ?? '')) chars.set(row.id, { id: row.id, name: String(row.name).slice(0, 24), recipe, face: row.face_url });
      }
    } catch { /* tabelas ainda não existem */ }
    listeners.forEach((f) => f());
  })();
  return loading;
}

if (import.meta.env.DEV) (window as unknown as { __custom: unknown }).__custom = { add: (c: CustomChar) => { chars.set(c.id, c); listeners.forEach((f) => f()); } }; // só no npm run dev (testes sem servidor)

// ---------- partes dos modelos Law ----------
const norm = (n: string): string => n.replace(/_\d+$/, '').replace(/_/g, ' ').trim();
const HEAD_BONE = /^(Head|Jaw|R Brow|L Brow)/;
const LEG_BONE = /^(Pelvis|R Thigh|L Thigh|R Calf|L Calf|R Foot|L Foot|R Toe|L Toe|rootJoint|Fbx Root|Root)/;
/** a que parte pertence um osso: pescoço, ombros, braços e dedos ficam no tronco (a "ponta do pescoço" assim sempre existe, mesmo com cabeça nova) */
const partOfBone = (name: string): number => (HEAD_BONE.test(name) ? 0 : LEG_BONE.test(name) ? 2 : 1);

interface SrcInfo {
  geoms: THREE.BufferGeometry[]; // 0 cabeça, 1 tronco, 2 pernas
  joints: string[];
  ibms: THREE.Matrix4[];
  bind: THREE.Matrix4;
  material: THREE.Material;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: THREE.Vector3;
  faceGeom?: THREE.BufferGeometry;
}
const srcCache = new Map<string, Promise<SrcInfo>>();

function splitMesh(sm: THREE.SkinnedMesh): THREE.BufferGeometry[] {
  const g = sm.geometry;
  const si = g.getAttribute('skinIndex') as THREE.BufferAttribute;
  const sw = g.getAttribute('skinWeight') as THREE.BufferAttribute;
  const group = sm.skeleton.bones.map((b) => partOfBone(norm(b.name)));
  const idx = g.index ? g.index.array : Uint32Array.from({ length: g.getAttribute('position').count }, (_, i) => i);
  const lists: number[][] = [[], [], []];
  const acc = [0, 0, 0];
  for (let t = 0; t < idx.length; t += 3) {
    acc[0] = acc[1] = acc[2] = 0;
    for (let k = 0; k < 3; k++) {
      const v = idx[t + k]!;
      for (let j = 0; j < 4; j++) acc[group[si.getComponent(v, j)] ?? 1]! += sw.getComponent(v, j);
    }
    const best = acc[0]! >= acc[1]! && acc[0]! >= acc[2]! ? 0 : acc[2]! > acc[1]! ? 2 : 1;
    lists[best]!.push(idx[t]!, idx[t + 1]!, idx[t + 2]!);
  }
  return lists.map((l) => {
    const ng = new THREE.BufferGeometry();
    for (const k of Object.keys(g.attributes)) ng.setAttribute(k, g.attributes[k]!);
    ng.setIndex(new THREE.BufferAttribute(Uint32Array.from(l), 1));
    return ng;
  });
}

function source(name: string): Promise<SrcInfo> {
  let p = srcCache.get(name);
  if (!p) {
    p = loadBase(name).then((scene) => {
      let sm: THREE.SkinnedMesh | null = null;
      scene.traverse((o) => { if (!sm && (o as THREE.SkinnedMesh).isSkinnedMesh) sm = o as THREE.SkinnedMesh; });
      if (!sm) throw new Error(`${name} sem malha`);
      const m = sm as THREE.SkinnedMesh;
      return {
        geoms: splitMesh(m),
        joints: m.skeleton.bones.map((b) => norm(b.name)),
        ibms: m.skeleton.boneInverses.map((x) => x.clone()),
        bind: m.bindMatrix.clone(),
        material: m.material as THREE.Material,
        pos: m.position.clone(),
        quat: m.quaternion.clone(),
        scale: m.scale.clone(),
      };
    });
    srcCache.set(name, p);
  }
  return p;
}


// ---------- rosto por fotos ----------
// A cabeça do modelo escolhido ganha, em cada vértice, a posição e a normal num sistema da própria cabeça (x = direita do personagem, y = cima,
// z = frente, tudo dividido pela altura da cabeça): `fP` e `fN`. O shader projeta até 3 fotos (frente, perfil esquerdo e direito) por essas
// coordenadas e as mistura pelo lado para onde a superfície aponta, só dentro de uma "área do rosto" oval; fora dela vale a textura do modelo.
const boneAt = (info: SrcInfo, re: RegExp): THREE.Vector3 => {
  const i = info.joints.findIndex((j) => re.test(j));
  if (i < 0) throw new Error(`osso ${re} não existe`);
  return new THREE.Vector3().setFromMatrixPosition(info.ibms[i]!.clone().invert());
};

function faceGeometry(info: SrcInfo): THREE.BufferGeometry {
  if (info.faceGeom) return info.faceGeom;
  const g = info.geoms[0]!;
  const up = boneAt(info, /^Head$/).sub(boneAt(info, /^Neck$/)).normalize();
  const right = boneAt(info, /^R Brow$/).sub(boneAt(info, /^L Brow$/));
  right.addScaledVector(up, -right.dot(up)).normalize();
  const fwd = new THREE.Vector3().crossVectors(up, right).normalize();
  const pos = g.getAttribute('position');
  const used = new Set<number>();
  const ix = g.index!;
  for (let i = 0; i < ix.count; i++) used.add(ix.getX(i));
  const w = new Float32Array(pos.count * 3);
  const mn = new THREE.Vector3(1e9, 1e9, 1e9);
  const mx = new THREE.Vector3(-1e9, -1e9, -1e9);
  const v = new THREE.Vector3();
  for (const i of used) {
    v.fromBufferAttribute(pos, i).applyMatrix4(info.bind);
    w[i * 3] = v.dot(right); w[i * 3 + 1] = v.dot(up); w[i * 3 + 2] = v.dot(fwd);
    mn.min(new THREE.Vector3(w[i * 3], w[i * 3 + 1], w[i * 3 + 2]));
    mx.max(new THREE.Vector3(w[i * 3], w[i * 3 + 1], w[i * 3 + 2]));
  }
  const size = Math.max(1e-6, mx.y - mn.y);
  const cen = mn.clone().add(mx).multiplyScalar(0.5);
  const ng = new THREE.BufferGeometry();
  for (const k of Object.keys(g.attributes)) ng.setAttribute(k, g.attributes[k]!);
  ng.setIndex(g.index);
  const fP = new Float32Array(pos.count * 3);
  for (const i of used) for (let k = 0; k < 3; k++) fP[i * 3 + k] = (w[i * 3 + k]! - cen.getComponent(k)) / size;
  // normais do pedaço da cabeça, levadas ao mesmo sistema
  const nrm = new THREE.BufferGeometry();
  nrm.setAttribute('position', pos);
  nrm.setIndex(g.index);
  nrm.computeVertexNormals();
  const na = nrm.getAttribute('normal');
  const nm = new THREE.Matrix3().getNormalMatrix(info.bind);
  const fN = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  for (const i of used) {
    n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
    fN[i * 3] = n.dot(right); fN[i * 3 + 1] = n.dot(up); fN[i * 3 + 2] = n.dot(fwd);
  }
  ng.setAttribute('fP', new THREE.BufferAttribute(fP, 3));
  ng.setAttribute('fN', new THREE.BufferAttribute(fN, 3));
  info.faceGeom = ng;
  return ng;
}

const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');
const photoCache = new Map<string, Promise<THREE.Texture>>();
const loadPhoto = (url: string): Promise<THREE.Texture> => {
  let p = photoCache.get(url);
  if (!p) {
    p = texLoader.loadAsync(url).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; });
    photoCache.set(url, p);
  }
  return p;
};
const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE.needsUpdate = true;

/** Material da cabeça com o rosto: parte do material do modelo e troca a cor dentro da área do rosto pelas fotos. */
function faceMaterial(base: THREE.Material, face: FaceRecipe): THREE.Material {
  const mat = base.clone();
  const u = {
    tF: { value: WHITE as THREE.Texture }, tL: { value: WHITE as THREE.Texture }, tR: { value: WHITE as THREE.Texture },
    pF: { value: new THREE.Vector4(face.pf[0], face.pf[1], face.pf[2], 0) },
    pL: { value: new THREE.Vector4(face.pl[0], face.pl[1], face.pl[2], 0) },
    pR: { value: new THREE.Vector4(face.pr[0], face.pr[1], face.pr[2], 0) },
    mk: { value: new THREE.Vector3(face.m[0], face.m[1], face.m[2]) },
  };
  mat.userData.face = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTF: u.tF, uTL: u.tL, uTR: u.tR, uPF: u.pF, uPL: u.pL, uPR: u.pR, uMK: u.mk });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 fP;\nattribute vec3 fN;\nvarying vec3 vFP;\nvarying vec3 vFN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFP = fP;\nvFN = fN;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vFP;
varying vec3 vFN;
uniform sampler2D uTF;
uniform sampler2D uTL;
uniform sampler2D uTR;
uniform vec4 uPF;
uniform vec4 uPL;
uniform vec4 uPR;
uniform vec3 uMK;
float inUV(vec2 t) { return step(0.0, t.x) * step(t.x, 1.0) * step(0.0, t.y) * step(t.y, 1.0); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        float a = vFP.x; float b = vFP.y; float c = vFP.z;
        vec3 n = normalize(vFN + vec3(1e-5));
        float rb = (b - uMK.z) / uMK.y;
        // área do rosto: oval na frente; nas laterais, faixa entre a testa e o queixo, da frente até a orelha
        float mFront = 1.0 - smoothstep(0.7, 1.0, length(vec2(a / uMK.x, rb)));
        float mSide = (1.0 - smoothstep(0.75, 1.0, abs(rb))) * smoothstep(-0.18, 0.02, c);
        vec2 tF = vec2(0.5 - a * uPF.x + uPF.y, 0.5 + b * uPF.x + uPF.z);
        vec2 tL = vec2(0.5 - c * uPL.x + uPL.y, 0.5 + b * uPL.x + uPL.z);
        vec2 tR = vec2(0.5 + c * uPR.x + uPR.y, 0.5 + b * uPR.x + uPR.z);
        float wF = pow(max(n.z, 0.0), 3.0) * mFront * inUV(tF) * uPF.w;
        float wL = pow(max(-n.x, 0.0), 2.0) * mSide * inUV(tL) * uPL.w;
        float wR = pow(max(n.x, 0.0), 2.0) * mSide * inUV(tR) * uPR.w;
        float tot = wF + wL + wR;
        if (tot > 0.001) {
          vec3 ph = (texture2D(uTF, tF).rgb * wF + texture2D(uTL, tL).rgb * wL + texture2D(uTR, tR).rgb * wR) / tot;
          diffuseColor.rgb = mix(diffuseColor.rgb, ph, clamp(tot * 1.6, 0.0, 1.0));
        }
      }`);
  };
  mat.customProgramCacheKey = () => 'face';
  const set = (key: 'tF' | 'tL' | 'tR', pk: 'pF' | 'pL' | 'pR', url: string | undefined): void => {
    if (!url) return;
    void loadPhoto(url).then((t) => { u[key].value = t; u[pk].value.w = 1; }).catch(() => undefined);
  };
  set('tF', 'pF', face.f); set('tL', 'pL', face.l); set('tR', 'pR', face.r);
  return mat;
}

// ---------- cabeça 3D nova ----------
export const HEAD_SIZE = 0.26; // altura (m) da cabeça nova com escala 1
const headCache = new Map<string, Promise<THREE.Group>>();
const gltf = new GLTFLoader();

/** Baixa e normaliza uma cabeça: materiais sem luz (como os personagens), caixa centrada na origem e 0,26 m de altura. */
export function loadHeadModel(url: string): Promise<THREE.Group> {
  let p = headCache.get(url);
  if (!p) {
    p = gltf.loadAsync(url).then((g) => {
      const root = new THREE.Group();
      const inner = g.scene;
      inner.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.frustumCulled = false;
        const fix = (mt: THREE.Material): THREE.Material => {
          const s = mt as THREE.MeshStandardMaterial;
          return new THREE.MeshBasicMaterial({ map: s.map ?? null, color: s.color ?? 0xffffff, transparent: s.transparent, opacity: s.opacity, alphaTest: s.alphaTest, side: s.side, vertexColors: !!m.geometry.getAttribute('color') });
        };
        m.material = Array.isArray(m.material) ? m.material.map(fix) : fix(m.material);
      });
      const box = new THREE.Box3().setFromObject(inner);
      const size = box.getSize(new THREE.Vector3());
      const k = HEAD_SIZE / Math.max(0.001, size.y);
      inner.scale.multiplyScalar(k);
      const c = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
      inner.position.sub(c);
      root.add(inner);
      return root;
    });
    headCache.set(url, p);
  }
  return p;
}

const findBone = (model: THREE.Object3D, re: RegExp): THREE.Object3D | null => {
  let found: THREE.Object3D | null = null;
  model.traverse((o) => { if (!found && (o as THREE.Bone).isBone && re.test(norm(o.name))) found = o; });
  return found;
};

let lawScale: number | null = null;
/** Escala fixa (a mesma do Law1) para toda mistura: o mesmo corpo sempre tem a mesma altura, qualquer cabeça. */
async function refScale(): Promise<number> {
  if (lawScale === null) {
    const base = SkeletonUtils.clone(await loadBase('Law1'));
    base.rotation.y = -Math.PI / 2;
    base.updateMatrixWorld(true);
    base.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.update(); });
    lawScale = CHARACTER_HEIGHT / new THREE.Box3().setFromObject(base, true).getSize(new THREE.Vector3()).y;
  }
  return lawScale;
}

/** Monta um personagem da receita: mesmo formato do `createCharacter` (grupo com 1,8 m, pés no chão, olhando para +Z). */
export async function buildCustom(rec: CharRecipe): Promise<THREE.Group> {
  const model = SkeletonUtils.clone(await loadBase('Law1'));
  let baseMesh: THREE.SkinnedMesh | null = null;
  model.traverse((o) => { if (!baseMesh && (o as THREE.SkinnedMesh).isSkinnedMesh) baseMesh = o as THREE.SkinnedMesh; });
  if (!baseMesh) throw new Error('Law1 sem malha');
  const bm = baseMesh as THREE.SkinnedMesh;
  const parent = bm.parent!;
  parent.remove(bm);
  const bones = new Map<string, THREE.Object3D>();
  model.traverse((o) => { if (!bones.has(norm(o.name))) bones.set(norm(o.name), o); });
  const spare = new Map<string, THREE.Bone>();
  const boneFor = (n: string): THREE.Bone => {
    const b = bones.get(n);
    if (b && (b as THREE.Bone).isBone) return b as THREE.Bone;
    let s = spare.get(n);
    if (!s) { s = new THREE.Bone(); s.name = n; (b ?? parent).add(s); spare.set(n, s); }
    return s;
  };
  const customHead = isHeadId(rec.head);
  for (let i = 0; i < 3; i++) {
    const part = PARTS[i]!;
    const from = part === 'head' ? rec.head : part === 'torso' ? rec.torso : rec.legs;
    if (part === 'head' && customHead) continue;
    const info = await source(from);
    const skeleton = new THREE.Skeleton(info.joints.map(boneFor), info.ibms);
    const material = (info.material as THREE.MeshBasicMaterial).clone();
    const tint = rec.tint?.[part];
    if (tint && (material as THREE.MeshBasicMaterial).color) (material as THREE.MeshBasicMaterial).color.set(tint);
    const withFace = part === 'head' && rec.face;
    const mesh = new THREE.SkinnedMesh(withFace ? faceGeometry(info) : info.geoms[i]!, withFace ? faceMaterial(material, rec.face!) : material);
    mesh.position.copy(info.pos);
    mesh.quaternion.copy(info.quat);
    mesh.scale.copy(info.scale);
    mesh.name = `part_${part}`;
    parent.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(skeleton, info.bind);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
  }
  model.rotation.y = -Math.PI / 2; // modelos GTA SA olham para +X
  model.scale.multiplyScalar(await refScale());
  const box = new THREE.Box3();
  model.updateMatrixWorld(true);
  model.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.update(); });
  box.setFromObject(model, true);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  const root = new THREE.Group();
  root.add(model);

  if (customHead) {
    const def = headOf(rec.head);
    const hb = findBone(model, /^Head$/);
    if (def && hb) {
      try {
        const proto = await loadHeadModel(def.url);
        const wrap = new THREE.Group();
        wrap.add(proto.clone(true));
        root.updateMatrixWorld(true);
        const hp = hb.getWorldPosition(new THREE.Vector3());
        const p = rec.hp ?? [0, 0.075, 0];
        const r = rec.hr ?? [0, 0, 0];
        wrap.position.set(hp.x + p[0], hp.y + p[1], hp.z + p[2]);
        wrap.rotation.set(THREE.MathUtils.degToRad(r[0]), THREE.MathUtils.degToRad(r[1]), THREE.MathUtils.degToRad(r[2]));
        wrap.scale.setScalar(rec.hs ?? 1);
        root.add(wrap);
        root.updateMatrixWorld(true);
        hb.attach(wrap); // acompanha o osso da cabeça (e some junto na 1ª pessoa)
      } catch { /* cabeça não carregou: fica sem cabeça */ }
    }
  }
  return root;
}
