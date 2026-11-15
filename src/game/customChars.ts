// Personagens criados na ferramenta /personagens (só o admin cria): uma "receita" que mistura partes dos modelos Law1-9 (cabeça, tronco e
// pernas — todos têm o MESMO esqueleto GTA SA, então animam igual), cores por parte e, no lugar da cabeça, um modelo 3D novo preso ao osso
// da cabeça. As receitas e as cabeças novas ficam no Supabase (tabelas `custom_characters` e `custom_heads`, bucket `chars`); todos leem.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { supabase } from '../net/supabase';
import { CHARACTER_HEIGHT, createCharacter, loadBase } from './characters';
import { RIGGED_NAMES } from './autoRig';
import { buildFelipeHead } from './proceduralHead';

export type Part = 'head' | 'torso' | 'legs';
export const PARTS: Part[] = ['head', 'torso', 'legs'];
export const PART_LABEL: Record<Part, string> = { head: 'Cabeça', torso: 'Tronco e braços', legs: 'Pernas e pés' };
export const LAW_SOURCES = ['Law1', 'Law2', 'Law3', 'Law4', 'Law5', 'Law6', 'Law7', 'Law8', 'Law9'] as const;
/** Os 8 personagens sem esqueleto próprio (ganham o do Law1 em runtime, ver autoRig.ts) também servem de corpo e de cabeça-base. */
export const RIGGED_SOURCES = ['Helena', 'Stewart', 'Bennyse', 'Amanda', 'Garota1', 'Gordao', 'Cesar', 'Akiyama'] as const;
export const ALL_SOURCES: readonly string[] = [...LAW_SOURCES, ...RIGGED_SOURCES];
const LAW_RE = new RegExp(`^(${ALL_SOURCES.join('|')})$`);
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
  /** cor da pele do corpo: pescoço e mãos do tronco são repintados nesta cor (combina com o rosto) */
  skin?: string;
  /** cabeça modelada por código no lugar da cabeça do modelo (ver proceduralHead.ts): só 'felipe'; usa `face` (foto e cor da pele) */
  mod?: 'felipe';
}
/** Fotos do rosto (endereços https) e como cada uma se encaixa na cabeça: [zoom, deslocamento x, deslocamento y]; `m` = área do rosto [largura, altura, altura do centro] */
export interface FaceRecipe {
  f: string; l?: string; r?: string;
  /** [zoom, mover x, mover y, esticar y (opcional, 1 = igual)] */
  pf: [number, number, number, number?]; pl: [number, number, number, number?]; pr: [number, number, number, number?];
  /** [largura, altura, posição, compressão da parte de baixo do rosto (opcional; 1 = sem)] */
  m: [number, number, number, number?];
  /** cor lisa da cabeça fora das fotos (pele; some o cabelo do modelo) */
  base?: string;
  /** cor da barba pintada na parte de baixo do rosto (mandíbula e queixo) fora da foto */
  beard?: string;
}
export const FACE_DEFAULT: Omit<FaceRecipe, 'f'> = { pf: [0.7, 0, 0], pl: [0.7, 0, 0], pr: [0.7, 0, 0], m: [0.3, 0.34, -0.03] };
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
  return Array.from({ length: Math.max(n, Math.min(4, a.length)) }, (_, i) => d[i] ?? 1).map((x, i) => (typeof a[i] === 'number' && Number.isFinite(a[i]) ? Math.max(lo, Math.min(hi, a[i] as number)) : x));
};
/** Valida o rosto por fotos (só endereços https; o editor usa blob: só na prévia, sem passar por aqui). */
export function cleanFace(v: unknown): FaceRecipe | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.f !== 'string' || !HTTPS.test(o.f)) return null;
  const out: FaceRecipe = {
    f: o.f,
    pf: nums(o.pf, 3, -1.5, 1.5, FACE_DEFAULT.pf as number[]) as FaceRecipe['pf'],
    pl: nums(o.pl, 3, -1.5, 1.5, FACE_DEFAULT.pl as number[]) as FaceRecipe['pl'],
    pr: nums(o.pr, 3, -1.5, 1.5, FACE_DEFAULT.pr as number[]) as FaceRecipe['pr'],
    m: nums(o.m, 3, -1, 3, FACE_DEFAULT.m as number[]) as FaceRecipe['m'],
  };
  if (typeof o.base === 'string' && HEX.test(o.base)) out.base = o.base.toLowerCase();
  if (typeof o.beard === 'string' && HEX.test(o.beard)) out.beard = o.beard.toLowerCase();
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
  if (typeof r.skin === 'string' && HEX.test(r.skin)) out.skin = r.skin.toLowerCase();
  const face = cleanFace(r.face);
  if (face && !isHeadId(head)) out.face = face;
  if (r.mod === 'felipe' && out.face) out.mod = 'felipe';
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

/**
 * Personagens que já vêm no jogo (não dependem do servidor): o Felipe, feito de uma foto do dono (agente com rosto projetado, cabeça pelada,
 * barba pintada e pescoço/mãos na cor da pele). A foto está em public/characters/felipe.webp (fundo branco trocado pela cor da pele).
 */
const BUILTIN: CustomChar[] = [{
  id: 'c_felipe',
  name: 'Felipe',
  face: '/faces/Felipe.webp',
  recipe: {
    head: 'Law5', torso: 'Law5', legs: 'Law5',
    skin: '#e0a584',
    mod: 'felipe', // cabeça modelada por código (proceduralHead.ts): crânio liso e redondo (careca) e barba em 3D
    face: { f: '/characters/felipe.webp', pf: [0.531, 0, 0.1445, 1], pl: [0.7, 0, 0], pr: [0.7, 0, 0], m: [0.7, 0.9, 0, 1], base: '#eab38f' },
  },
}];
for (const c of BUILTIN) chars.set(c.id, c);

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
      for (const c of BUILTIN) chars.set(c.id, c);
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

interface Entry {
  geoms: THREE.BufferGeometry[]; // 0 cabeça, 1 tronco, 2 pernas
  joints: string[];
  ibms: THREE.Matrix4[];
  bind: THREE.Matrix4;
  material: THREE.Material | THREE.Material[];
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: THREE.Vector3;
  faceGeom?: THREE.BufferGeometry;
}
/** Um modelo-fonte: uma ou mais malhas (o Akiyama tem 7), todas ligadas ao mesmo esqueleto GTA SA. */
interface SrcInfo { entries: Entry[]; frame?: HeadFrame }
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
    p = (RIGGED_NAMES.has(name) ? riggedSource(name) : lawSource(name));
    srcCache.set(name, p);
  }
  return p;
}

function lawSource(name: string): Promise<SrcInfo> {
  return loadBase(name).then((scene) => {
    let sm: THREE.SkinnedMesh | null = null;
    scene.traverse((o) => { if (!sm && (o as THREE.SkinnedMesh).isSkinnedMesh) sm = o as THREE.SkinnedMesh; });
    if (!sm) throw new Error(`${name} sem malha`);
    const m = sm as THREE.SkinnedMesh;
    return {
      entries: [{
        geoms: splitMesh(m),
        joints: m.skeleton.bones.map((b) => norm(b.name)),
        ibms: m.skeleton.boneInverses.map((x) => x.clone()),
        bind: m.bindMatrix.clone(),
        material: m.material as THREE.Material,
        pos: m.position.clone(),
        quat: m.quaternion.clone(),
        scale: m.scale.clone(),
      }],
    };
  });
}

/**
 * Personagem sem esqueleto: monta o rigado (autoRig) e leva as malhas e as matrizes de volta ao espaço "cru" do Law1 (sem a escala/posição que o
 * autoRig aplica ao esqueleto), que é o espaço que `buildCustom` usa para todas as fontes.
 */
async function riggedSource(name: string): Promise<SrcInfo> {
  const root = await createCharacter(name as never);
  root.updateMatrixWorld(true);
  const rig = root.children[0]!;
  const G = rig.matrixWorld.clone();
  const Ginv = G.clone().invert();
  const entries: Entry[] = [];
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh) return;
    entries.push({
      geoms: splitMesh(sm),
      joints: sm.skeleton.bones.map((b) => norm(b.name)),
      ibms: sm.skeleton.boneInverses.map((x) => x.clone().multiply(G)),
      bind: Ginv.clone().multiply(sm.bindMatrix),
      material: sm.material,
      pos: sm.position.clone(),
      quat: sm.quaternion.clone(),
      scale: sm.scale.clone(),
    });
  });
  if (!entries.length) throw new Error(`${name} não ficou rigado`);
  return { entries };
}

// ---------- rosto por fotos ----------
// A cabeça do modelo escolhido ganha, em cada vértice, a posição e a normal num sistema da própria cabeça (x = direita do personagem, y = cima,
// z = frente, tudo dividido pela altura da cabeça): `fP` e `fN`. O shader projeta até 3 fotos (frente, perfil esquerdo e direito) por essas
// coordenadas e as mistura pelo lado para onde a superfície aponta, só dentro de uma "área do rosto" oval; fora dela vale a textura do modelo.
interface HeadFrame { right: THREE.Vector3; up: THREE.Vector3; fwd: THREE.Vector3; cen: THREE.Vector3; size: number }

const boneAt = (e: Entry, re: RegExp): THREE.Vector3 | null => {
  const i = e.joints.findIndex((j) => re.test(j));
  return i < 0 ? null : new THREE.Vector3().setFromMatrixPosition(e.ibms[i]!.clone().invert());
};

/** Eixos da cabeça (direita, cima, frente), centro e altura, medidos nos vértices da cabeça de todas as malhas da fonte. */
function headFrame(info: SrcInfo): HeadFrame {
  if (info.frame) return info.frame;
  const e0 = info.entries[0]!;
  const head = boneAt(e0, /^Head$/);
  const neck = boneAt(e0, /^Neck$/);
  if (!head || !neck) throw new Error('modelo sem pescoço/cabeça');
  const up = head.clone().sub(neck).normalize();
  const rb = boneAt(e0, /^R Brow$/) ?? boneAt(e0, /R Clavicle$/);
  const lb = boneAt(e0, /^L Brow$/) ?? boneAt(e0, /L Clavicle$/);
  if (!rb || !lb) throw new Error('modelo sem referência para o lado direito');
  const right = rb.sub(lb);
  right.addScaledVector(up, -right.dot(up)).normalize();
  const fwd = new THREE.Vector3().crossVectors(up, right).normalize();
  const mn = new THREE.Vector3(1e9, 1e9, 1e9);
  const mx = new THREE.Vector3(-1e9, -1e9, -1e9);
  const v = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (const e of info.entries) {
    const g = e.geoms[0]!;
    const pos = g.getAttribute('position');
    const ix = g.index!;
    for (let i = 0; i < ix.count; i++) {
      v.fromBufferAttribute(pos, ix.getX(i)).applyMatrix4(e.bind);
      q.set(v.dot(right), v.dot(up), v.dot(fwd));
      mn.min(q); mx.max(q);
    }
  }
  const size = Math.max(1e-6, mx.y - mn.y);
  info.frame = { right, up, fwd, cen: mn.clone().add(mx).multiplyScalar(0.5), size };
  return info.frame;
}

function faceGeometry(info: SrcInfo, e: Entry): THREE.BufferGeometry {
  if (e.faceGeom) return e.faceGeom;
  const g = e.geoms[0]!;
  const f = headFrame(info);
  const pos = g.getAttribute('position');
  const ix = g.index!;
  const used = new Set<number>();
  for (let i = 0; i < ix.count; i++) used.add(ix.getX(i));
  const ng = new THREE.BufferGeometry();
  for (const k of Object.keys(g.attributes)) ng.setAttribute(k, g.attributes[k]!);
  ng.setIndex(g.index);
  const fP = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (const i of used) {
    v.fromBufferAttribute(pos, i).applyMatrix4(e.bind);
    fP[i * 3] = (v.dot(f.right) - f.cen.x) / f.size;
    fP[i * 3 + 1] = (v.dot(f.up) - f.cen.y) / f.size;
    fP[i * 3 + 2] = (v.dot(f.fwd) - f.cen.z) / f.size;
  }
  // normais do pedaço da cabeça, levadas ao mesmo sistema
  const nrm = new THREE.BufferGeometry();
  nrm.setAttribute('position', pos);
  nrm.setIndex(g.index);
  nrm.computeVertexNormals();
  const na = nrm.getAttribute('normal');
  const nm = new THREE.Matrix3().getNormalMatrix(e.bind);
  const fN = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  for (const i of used) {
    n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
    fN[i * 3] = n.dot(f.right); fN[i * 3 + 1] = n.dot(f.up); fN[i * 3 + 2] = n.dot(f.fwd);
  }
  ng.setAttribute('fP', new THREE.BufferAttribute(fP, 3));
  ng.setAttribute('fN', new THREE.BufferAttribute(fN, 3));
  e.faceGeom = ng;
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
    mk: { value: new THREE.Vector4(face.m[0], face.m[1], face.m[2], face.m[3] ?? 1) },
    br: { value: face.beard ? new THREE.Vector4(...(() => { const c = new THREE.Color(face.beard); return [c.r, c.g, c.b]; })(), 1) : new THREE.Vector4(0, 0, 0, 0) },
    asp: { value: new THREE.Vector3(1, 1, 1) },
    sy: { value: new THREE.Vector3(face.pf[3] ?? 1, face.pl[3] ?? 1, face.pr[3] ?? 1) },
    bs: { value: face.base ? new THREE.Vector4(...(() => { const c = new THREE.Color(face.base); return [c.r, c.g, c.b]; })(), 1) : new THREE.Vector4(1, 1, 1, 0) },
  };
  mat.userData.face = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTF: u.tF, uTL: u.tL, uTR: u.tR, uPF: u.pF, uPL: u.pL, uPR: u.pR, uMK: u.mk, uBS: u.bs, uAS: u.asp, uSY: u.sy, uBR: u.br });
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
uniform vec4 uMK;
uniform vec4 uBS;
uniform vec3 uAS;
uniform vec3 uSY;
uniform vec4 uBR;
float inUV(vec2 t) { return step(0.0, t.x) * step(t.x, 1.0) * step(0.0, t.y) * step(t.y, 1.0); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        if (uBS.a > 0.5) diffuseColor.rgb = uBS.rgb;
        float a = vFP.x; float b = vFP.y; float c = vFP.z;
        if (uBR.a > 0.5) {
          float bt = uMK.z - 0.04;
          float bm = (1.0 - smoothstep(bt - 0.1, bt, b)) * smoothstep(-0.2, 0.0, c);
          diffuseColor.rgb = mix(diffuseColor.rgb, uBR.rgb, bm);
        }
        vec3 n = normalize(vFN + vec3(1e-5));
        float rb = (b - uMK.z) / uMK.y;
        // área do rosto: oval na frente; nas laterais, faixa entre a testa e o queixo, da frente até a orelha
        vec2 q4 = pow(abs(vec2(a / uMK.x, rb)), vec2(4.0));
        float mFront = 1.0 - smoothstep(0.75, 1.0, pow(q4.x + q4.y, 0.25));
        float mSide = (1.0 - smoothstep(0.75, 1.0, abs(rb))) * smoothstep(-0.18, 0.02, c);
        float bl = uMK.z - 0.12;
        float bb = b < bl ? bl + (b - bl) * uMK.w : b;
        vec2 tF = vec2(0.5 - a * uPF.x / uAS.x + uPF.y, 0.5 + bb * uPF.x * uSY.x + uPF.z);
        vec2 tL = vec2(0.5 - c * uPL.x / uAS.y + uPL.y, 0.5 + b * uPL.x * uSY.y + uPL.z);
        vec2 tR = vec2(0.5 + c * uPR.x / uAS.z + uPR.y, 0.5 + b * uPR.x * uSY.z + uPR.z);
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
  const set = (key: 'tF' | 'tL' | 'tR', pk: 'pF' | 'pL' | 'pR', ai: 'x' | 'y' | 'z', url: string | undefined): void => {
    if (!url) return;
    void loadPhoto(url).then((t) => {
      const im = t.image as { width: number; height: number };
      u.asp.value[ai] = im.width / Math.max(1, im.height); // largura/altura da foto: a escala vale em alturas da cabeça nos dois eixos
      u[key].value = t; u[pk].value.w = 1;
    }).catch(() => undefined);
  };
  set('tF', 'pF', 'x', face.f); set('tL', 'pL', 'y', face.l); set('tR', 'pR', 'z', face.r);
  return mat;
}


// ---------- pele do corpo (pescoço e mãos) ----------
const SKIN_BONE = /^(Neck|[LR] Hand|[LR] Finger|Bip01 [LR] Finger)/;
/** peso (0..1) de cada vértice nos ossos de pele (pescoço, mãos, dedos), guardado no atributo `skW` da geometria */
function skinWeights(e: Entry, g: THREE.BufferGeometry): void {
  if (g.getAttribute('skW')) return;
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  const isSkin = e.joints.map((j) => SKIN_BONE.test(j));
  const out = new Float32Array(si.count);
  for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) if (isSkin[si.getComponent(i, k)]) out[i] += sw.getComponent(i, k);
  g.setAttribute('skW', new THREE.BufferAttribute(out, 1));
}
/** Repinta (na cor da pele) os vértices ligados a pescoço e mãos, mantendo o sombreado da textura. */
function skinMaterial(base: THREE.Material, hex: string): THREE.Material {
  const mat = base.clone();
  const c = new THREE.Color(hex);
  const uni = { value: new THREE.Vector3(c.r, c.g, c.b) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSkin = uni;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float skW;\nvarying float vSkW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkW = skW;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSkW;\nuniform vec3 uSkin;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(diffuseColor.rgb, uSkin * (0.45 + 0.9 * lum), smoothstep(0.3, 0.7, vSkW));
      }`);
  };
  mat.customProgramCacheKey = () => 'skin';
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
  const procHead = rec.mod === 'felipe' && !!rec.face;
  for (let i = 0; i < 3; i++) {
    const part = PARTS[i]!;
    const from = part === 'head' ? rec.head : part === 'torso' ? rec.torso : rec.legs;
    if (part === 'head' && (customHead || procHead)) continue;
    const info = await source(from);
    for (const e of info.entries) {
      const geom = e.geoms[i]!;
      if (!geom.index || geom.index.count === 0) continue; // esta malha não tem triângulos desta parte
      const skeleton = new THREE.Skeleton(e.joints.map(boneFor), e.ibms);
      const cl = (m: THREE.Material): THREE.Material => {
        const c = m.clone();
        const tint = rec.tint?.[part];
        if (tint && (c as THREE.MeshBasicMaterial).color) (c as THREE.MeshBasicMaterial).color.set(tint);
        if (part === 'head' && rec.face) return faceMaterial(c, rec.face);
        if (part === 'torso' && rec.skin) { skinWeights(e, geom); return skinMaterial(c, rec.skin); }
        return c;
      };
      const material = Array.isArray(e.material) ? e.material.map(cl) : cl(e.material);
      const mesh = new THREE.SkinnedMesh(part === 'head' && rec.face ? faceGeometry(info, e) : geom, material);
      mesh.position.copy(e.pos);
      mesh.quaternion.copy(e.quat);
      mesh.scale.copy(e.scale);
      mesh.name = `part_${part}`;
      parent.add(mesh);
      mesh.updateMatrixWorld(true);
      mesh.bind(skeleton, e.bind);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
    }
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

  if (procHead) {
    const hb = findBone(model, /^Head$/);
    if (hb) {
      const skinBase = new THREE.MeshBasicMaterial({ vertexColors: true });
      const { group } = buildFelipeHead(faceMaterial(skinBase, rec.face!), rec.skin ?? rec.face!.base ?? '#e0a584');
      root.updateMatrixWorld(true);
      const hp = hb.getWorldPosition(new THREE.Vector3());
      const p = rec.hp ?? [0, 0.085, 0.005];
      group.position.set(hp.x + p[0], hp.y + p[1], hp.z + p[2]);
      group.scale.setScalar(rec.hs ?? 1);
      root.add(group);
      root.updateMatrixWorld(true);
      hb.attach(group);
    }
  }
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
