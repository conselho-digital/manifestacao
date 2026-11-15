// Roupas por cor: camisa, calça e sapato. Funciona em qualquer personagem com esqueleto (Carlos, Law, os 8 auto-rigados e os criados):
// cada vértice guarda quanto ele pertence à camisa/calça/sapato (soma dos pesos dos ossos de cada grupo) e o shader do material
// troca a cor ali, mantendo o brilho e os detalhes da textura. Pele (cabeça, pescoço, antebraços, mãos) e cabelo não mudam.
import * as THREE from 'three';

export interface Outfit { s?: string; p?: string; h?: string }

const HEX = /^#[0-9a-fA-F]{6}$/;
export const SLOTS = [
  { key: 's', label: 'Camisa' },
  { key: 'p', label: 'Calça' },
  { key: 'h', label: 'Sapato' },
] as const;
export type SlotKey = (typeof SLOTS)[number]['key'];

/** Cores oferecidas no menu. */
export const OUTFIT_COLORS = ['#f2f2f2', '#1c1c1f', '#6b6f78', '#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#1a2f5a', '#8e44ad', '#e84393', '#7a5230'];

/** Valida o que veio da rede ou do armazenamento. null = sem roupa nova (as originais do modelo). */
export function cleanOutfit(o: unknown): Outfit | null {
  if (typeof o !== 'object' || o === null) return null;
  const r = o as Record<string, unknown>;
  const out: Outfit = {};
  for (const { key } of SLOTS) {
    const v = r[key];
    if (typeof v === 'string' && HEX.test(v)) out[key] = v.toLowerCase();
  }
  return Object.keys(out).length ? out : null;
}

export const outfitKey = (o: Outfit | null | undefined): string => (o ? `${o.s ?? ''}${o.p ?? ''}${o.h ?? ''}` : '');

export function randomOutfit(): Outfit {
  const pick = (): string => OUTFIT_COLORS[Math.floor(Math.random() * OUTFIT_COLORS.length)]!;
  return { s: pick(), p: pick(), h: Math.random() < 0.5 ? '#1c1c1f' : pick() };
}

/** Grupo de um osso pelo nome: 0 camisa, 1 calça, 2 sapato, -1 pele/outros. */
function groupOf(name: string): number {
  const n = name.toLowerCase();
  if (/foot|toe|ankle/.test(n)) return 2;
  if (/pelvis|thigh|calf|knee|hips/.test(n)) return 1;
  if (/forearm|elbow|wrist|hand|finger|neck|head|jaw|brow|eye|lip|mouth/.test(n)) return -1;
  if (/spine|belly|breast|clavicle|upperarm|upper arm|shoulder|chest/.test(n)) return 0;
  return -1;
}

/** Guarda em cada vértice o peso de camisa/calça/sapato (atributo `outfitW`), uma vez por geometria. */
function ensureWeights(mesh: THREE.SkinnedMesh): boolean {
  const g = mesh.geometry;
  if (g.getAttribute('outfitW')) return true;
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  if (!si || !sw || !mesh.skeleton) return false;
  const groups = mesh.skeleton.bones.map((b) => groupOf(b.name));
  const out = new Float32Array(si.count * 3);
  for (let i = 0; i < si.count; i++) {
    for (let k = 0; k < 4; k++) {
      const gr = groups[si.getComponent(i, k)] ?? -1;
      if (gr >= 0) out[i * 3 + gr] += sw.getComponent(i, k);
    }
  }
  g.setAttribute('outfitW', new THREE.BufferAttribute(out, 3));
  return true;
}

interface Uniforms { s: { value: THREE.Vector4 }; p: { value: THREE.Vector4 }; h: { value: THREE.Vector4 } }

function patch(mat: THREE.Material, u: Uniforms): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uShirt = u.s;
    shader.uniforms.uPants = u.p;
    shader.uniforms.uShoes = u.h;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 outfitW;\nvarying vec3 vOutfit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOutfit = outfitW;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOutfit;\nuniform vec4 uShirt;\nuniform vec4 uPants;\nuniform vec4 uShoes;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 shade = vec3(0.4 + 0.9 * lum);
        diffuseColor.rgb = mix(diffuseColor.rgb, uShirt.rgb * shade, smoothstep(0.3, 0.7, vOutfit.x) * uShirt.a);
        diffuseColor.rgb = mix(diffuseColor.rgb, uPants.rgb * shade, smoothstep(0.3, 0.7, vOutfit.y) * uPants.a);
        diffuseColor.rgb = mix(diffuseColor.rgb, uShoes.rgb * shade, smoothstep(0.3, 0.7, vOutfit.z) * uShoes.a);
      }`);
  };
  mat.customProgramCacheKey = () => 'outfit';
  mat.needsUpdate = true;
}

const NONE = (): THREE.Vector4 => new THREE.Vector4(1, 1, 1, 0);

/**
 * Aplica (ou tira, com null) a roupa no personagem. Na 1ª vez copia os materiais deste boneco (eles podem ser compartilhados com os outros
 * bonecos do mesmo modelo) e liga o shader; depois só muda as cores (sem recompilar).
 */
export function applyOutfit(model: THREE.Object3D, outfit: Outfit | null): void {
  let u = model.userData.outfitU as Uniforms | undefined;
  if (!u) {
    const meshes: THREE.SkinnedMesh[] = [];
    model.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
    const ok = meshes.filter(ensureWeights);
    if (!ok.length) { model.userData.outfitU = null; return; }
    u = { s: { value: NONE() }, p: { value: NONE() }, h: { value: NONE() } };
    for (const m of ok) {
      const clone = (x: THREE.Material): THREE.Material => { const c = x.clone(); patch(c, u!); return c; };
      m.material = Array.isArray(m.material) ? m.material.map(clone) : clone(m.material);
    }
    model.userData.outfitU = u;
  }
  if (u === null || !u) return;
  const c = new THREE.Color();
  for (const { key } of SLOTS) {
    const hex = outfit?.[key];
    const v = u[key].value;
    if (hex) { c.set(hex); v.set(c.r, c.g, c.b, 1); } else v.set(1, 1, 1, 0);
  }
}
