import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addBox, TREES } from './map';

/**
 * Quatro espécies (carvalho, pinheiro, bordo, bétula) + arbusto, com altura em metros.
 * Tronco afunilado com raízes e galhos, copa feita de tufos de folhas recortadas (com buracos).
 */
export type Species = 'oak' | 'pine' | 'maple' | 'birch' | 'bush';
export interface TreeSpec { x: number; z: number; h: number; species: Species }

/** Faixa de altura (m) de cada espécie, para quem escolhe. */
export const HEIGHT: Record<Species, [number, number]> = {
  oak: [14, 21], pine: [18, 26], maple: [10, 15], birch: [8, 12], bush: [1.1, 2],
};

const rng = ((): (() => number) => {
  let s = 777;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
})();
const rr = (a: number, b: number): number => a + rng() * (b - a);

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
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

// ---------- texturas das folhas (fundo transparente = copa vazada) ----------

function foliageTex(species: Species): THREE.CanvasTexture {
  return canvas(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    if (species === 'pine') {
      // agulhas: muitos traços finos saindo em leque
      for (let i = 0; i < 520; i++) {
        const x = rng() * 128;
        const y = rng() * 128;
        const a = rng() * Math.PI * 2;
        const len = rr(10, 20);
        g.strokeStyle = ['#233f33', '#2c4d3d', '#35604a', '#1d3a2d'][Math.floor(rng() * 4)]!;
        g.lineWidth = 1.7;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        g.stroke();
      }
      return;
    }
    const palettes: Record<string, string[]> = {
      oak: ['#4b7a35', '#3d6a2c', '#5a8a3c', '#35602a'],
      maple: ['#6f9a3d', '#5d8a35', '#82a847', '#4e7a2e'],
      birch: ['#8db84f', '#7aa83f', '#a3c862', '#6e9a38'],
      bush: ['#3f7a35', '#4c8a3c', '#336b2e'],
    };
    const pal = palettes[species]!;
    const n = species === 'birch' ? 190 : species === 'bush' ? 120 : 95;
    for (let i = 0; i < n; i++) {
      const x = rng() * 128;
      const y = rng() * 128;
      const r = species === 'birch' ? rr(3.2, 5.5) : species === 'maple' ? rr(8, 13) : rr(6, 11);
      g.save();
      g.translate(x, y);
      g.rotate(rng() * 6.3);
      g.fillStyle = pal[Math.floor(rng() * pal.length)]!;
      g.beginPath();
      if (species === 'maple') {
        // folha palmada (5 pontas)
        for (let k = 0; k < 10; k++) {
          const ang = (k / 10) * Math.PI * 2;
          const rad = k % 2 === 0 ? r : r * 0.45;
          g.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
        }
        g.closePath();
      } else if (species === 'oak') {
        // folha lobada: três círculos sobrepostos
        for (const [ox, oy, rs] of [[0, 0, 0.7], [r * 0.55, -r * 0.1, 0.5], [-r * 0.55, r * 0.1, 0.5], [0, r * 0.6, 0.45]] as const) {
          g.moveTo(ox + r * rs, oy);
          g.arc(ox, oy, r * rs, 0, 6.3);
        }
      } else {
        g.ellipse(0, 0, r, r * 0.72, 0, 0, 6.3);
      }
      g.fill();
      g.strokeStyle = 'rgba(20,40,15,.45)';
      g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(-r * 0.7, 0); g.lineTo(r * 0.7, 0); g.stroke(); // nervura
      g.restore();
    }
  });
}

// ---------- cascas ----------

function barkTex(species: Species): THREE.CanvasTexture {
  return canvas(64, 128, (g) => {
    const base = { oak: '#5a4a3b', pine: '#a65f3a', maple: '#7a6a58', birch: '#ecebe5', bush: '#5b4333' }[species];
    g.fillStyle = base; g.fillRect(0, 0, 64, 128);
    if (species === 'birch') {
      for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(25,25,25,.85)'; g.fillRect(rng() * 56, rng() * 128, rr(5, 14), rr(1.5, 3.5)); }
      return;
    }
    // fissuras verticais
    for (let i = 0; i < 46; i++) {
      g.fillStyle = species === 'pine' ? ['#7d4527', '#c47a4c', '#8f5030'][i % 3]! : ['#3f332a', '#6c5a49', '#4a3d31'][i % 3]!;
      g.fillRect(rng() * 62, rng() * 128, rr(1.5, 3.5), rr(14, 46));
    }
  });
}

// ---------- modelos (altura = 1) ----------

interface Blob { p: THREE.Vector3; r: THREE.Vector3 }
interface Template { trunk: THREE.BufferGeometry; blobs: Blob[]; trunkHalf: number; crownBase: number }

const Y = new THREE.Vector3(0, 1, 0);

/** Galho/tronco afunilado entre dois pontos. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg = 6): THREE.BufferGeometry {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

function buildTemplate(sp: Exclude<Species, 'bush'>): Template {
  const parts: THREE.BufferGeometry[] = [];
  const blobs: Blob[] = [];
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

  if (sp === 'oak') {
    // tronco grosso com base alargada (raízes); a partir de ~1/3 da altura abre em galhos curvos para os lados
    parts.push(limb(V(0, 0, 0), V(0, 0.07, 0), 0.052, 0.034, 8));
    parts.push(limb(V(0, 0.06, 0), V(0, 0.36, 0), 0.034, 0.022, 8));
    for (let i = 0; i < 6; i++) { // raízes
      const a = (i / 6) * Math.PI * 2 + 0.3;
      parts.push(limb(V(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1), V(Math.cos(a) * 0.025, 0.07, Math.sin(a) * 0.025), 0.013, 0.02, 5));
    }
    for (let i = 0; i < 6; i++) { // galhos principais (dois trechos cada, com curva)
      const a = (i / 6) * Math.PI * 2 + rr(-0.3, 0.3);
      const y0 = rr(0.3, 0.44);
      const reach = rr(0.2, 0.34);
      const top = rr(0.62, 0.86);
      const mid = V(Math.cos(a) * reach * 0.5, y0 + (top - y0) * 0.3, Math.sin(a) * reach * 0.5);
      const end = V(Math.cos(a) * reach, top, Math.sin(a) * reach);
      parts.push(limb(V(0, y0, 0), mid, 0.021, 0.013, 6));
      parts.push(limb(mid, end, 0.013, 0.005, 5));
      // galhos menores que saem do principal
      const sub = V(Math.cos(a + 0.5) * reach * 1.15, top + 0.05, Math.sin(a + 0.5) * reach * 1.15);
      parts.push(limb(mid.clone().lerp(end, 0.6), sub, 0.007, 0.003, 4));
    }
    parts.push(limb(V(0, 0.34, 0), V(0.02, 0.9, 0.01), 0.016, 0.004, 5));
    // copa: cúpula larga e cheia de tufos pequenos
    for (let i = 0; i < 34; i++) {
      const a = rng() * Math.PI * 2;
      const u = Math.sqrt(rng());
      const e = rng() * Math.PI * 0.5;
      const rx = 0.42 * u;
      blobs.push({
        p: V(Math.cos(a) * Math.cos(e) * rx, 0.66 + Math.sin(e) * 0.3 * u, Math.sin(a) * Math.cos(e) * rx),
        r: V(rr(0.1, 0.16), rr(0.08, 0.12), rr(0.1, 0.16)),
      });
    }
    return { trunk: mergeGeometries(parts)!, blobs, trunkHalf: 0.045, crownBase: 0.36 };
  }

  if (sp === 'pine') {
    // tronco reto e alto, alaranjado; copa em camadas (cones achatados) só no terço de cima
    parts.push(limb(V(0, 0, 0), V(0, 0.05, 0), 0.016, 0.012, 7));
    parts.push(limb(V(0, 0.04, 0), V(0.004, 0.98, 0), 0.012, 0.0035, 7));
    for (let i = 0; i < 7; i++) { // galhos secos embaixo
      const y = 0.22 + i * 0.045;
      const a = i * 2.4;
      parts.push(limb(V(0.002, y, 0), V(Math.cos(a) * 0.07, y + 0.03, Math.sin(a) * 0.07), 0.003, 0.0015, 4));
    }
    const tiers = 9;
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const y = 0.5 + t * 0.46;
      const rad = THREE.MathUtils.lerp(0.19, 0.035, t);
      blobs.push({ p: V(0.004, y, 0), r: V(rad, 0.045, rad) });
      for (let k = 0; k < 3; k++) { // tufos soltos nas pontas dos galhos
        const a = rng() * 6.3;
        blobs.push({ p: V(Math.cos(a) * rad * 0.85, y - 0.01, Math.sin(a) * rad * 0.85), r: V(rad * 0.5, 0.032, rad * 0.5) });
      }
    }
    blobs.push({ p: V(0.004, 0.99, 0), r: V(0.025, 0.04, 0.025) });
    return { trunk: mergeGeometries(parts)!, blobs, trunkHalf: 0.016, crownBase: 0.5 };
  }

  if (sp === 'maple') {
    // tronco fino, galhos principais, copa oval aberta feita de muitos tufos
    parts.push(limb(V(0, 0, 0), V(0, 0.05, 0), 0.022, 0.016, 7));
    parts.push(limb(V(0, 0.04, 0), V(0.005, 0.5, 0), 0.016, 0.01, 7));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rng();
      const y0 = rr(0.4, 0.55);
      const reach = rr(0.1, 0.2);
      const top = rr(0.72, 0.92);
      const mid = V(Math.cos(a) * reach * 0.5, y0 + (top - y0) * 0.4, Math.sin(a) * reach * 0.5);
      parts.push(limb(V(0.004, y0, 0), mid, 0.009, 0.006, 5));
      parts.push(limb(mid, V(Math.cos(a) * reach, top, Math.sin(a) * reach), 0.006, 0.0025, 4));
    }
    for (let i = 0; i < 24; i++) {
      const a = rng() * Math.PI * 2;
      const u = Math.sqrt(rng());
      const e = rng() * Math.PI * 0.5;
      blobs.push({
        p: V(Math.cos(a) * Math.cos(e) * 0.3 * u, 0.7 + Math.sin(e) * 0.28 * u - 0.06 * (1 - u), Math.sin(a) * Math.cos(e) * 0.3 * u),
        r: V(rr(0.07, 0.11), rr(0.06, 0.1), rr(0.07, 0.11)),
      });
    }
    return { trunk: mergeGeometries(parts)!, blobs, trunkHalf: 0.022, crownBase: 0.42 };
  }

  // bétula: tronco branco fino, galhos finos, copa estreita e arejada
  parts.push(limb(V(0, 0, 0), V(0, 0.04, 0), 0.017, 0.013, 6));
  parts.push(limb(V(0, 0.03, 0), V(0.006, 0.55, 0), 0.013, 0.008, 6));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng();
    const y0 = rr(0.45, 0.62);
    const reach = rr(0.07, 0.14);
    const top = rr(0.74, 0.95);
    const mid = V(Math.cos(a) * reach * 0.5, y0 + (top - y0) * 0.45, Math.sin(a) * reach * 0.5);
    parts.push(limb(V(0.005, y0, 0), mid, 0.006, 0.004, 4));
    parts.push(limb(mid, V(Math.cos(a) * reach, top, Math.sin(a) * reach), 0.004, 0.002, 4));
  }
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const u = Math.sqrt(rng());
    const e = rng() * Math.PI * 0.5;
    blobs.push({
      p: V(Math.cos(a) * Math.cos(e) * 0.2 * u, 0.74 + Math.sin(e) * 0.24 * u - 0.1 * (1 - u), Math.sin(a) * Math.cos(e) * 0.2 * u),
      r: V(rr(0.05, 0.085), rr(0.06, 0.1), rr(0.05, 0.085)),
    });
  }
  return { trunk: mergeGeometries(parts)!, blobs, trunkHalf: 0.017, crownBase: 0.45 };
}

// ---------- construção ----------

const TINT: Record<Species, string> = { oak: '#ffffff', pine: '#ffffff', maple: '#ffffff', birch: '#ffffff', bush: '#ffffff' };

/** Cria todas as árvores (instanciadas por espécie), com troncos sólidos e copas para a câmera. */
export function makeTrees(list: TreeSpec[]): THREE.Group {
  const group = new THREE.Group();
  const sphere = new THREE.IcosahedronGeometry(1, 0);
  const bushTemplate: Template = {
    trunk: new THREE.BufferGeometry(),
    blobs: [{ p: new THREE.Vector3(0, 0.45, 0), r: new THREE.Vector3(0.5, 0.42, 0.5) }, { p: new THREE.Vector3(0.32, 0.3, 0.12), r: new THREE.Vector3(0.33, 0.3, 0.33) }, { p: new THREE.Vector3(-0.3, 0.32, -0.1), r: new THREE.Vector3(0.34, 0.3, 0.34) }, { p: new THREE.Vector3(0.05, 0.28, 0.32), r: new THREE.Vector3(0.3, 0.26, 0.3) }, { p: new THREE.Vector3(0.0, 0.7, 0.0), r: new THREE.Vector3(0.28, 0.24, 0.28) }],
    trunkHalf: 0, crownBase: 0,
  };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const col = new THREE.Color();

  for (const sp of ['oak', 'pine', 'maple', 'birch', 'bush'] as const) {
    const trees = list.filter((t) => t.species === sp);
    if (!trees.length) continue;
    const tpl = sp === 'bush' ? bushTemplate : buildTemplate(sp);

    // folhagem
    const ftex = foliageTex(sp);
    ftex.repeat.set(sp === 'pine' ? 2 : 3, sp === 'pine' ? 2 : 3);
    const mat = new THREE.MeshLambertMaterial({ map: ftex, alphaTest: 0.45, side: THREE.DoubleSide });
    const blobs = new THREE.InstancedMesh(sphere, mat, trees.length * tpl.blobs.length);
    let bi = 0;
    for (const t of trees) {
      const yaw = rng() * 6.3;
      const base = new THREE.Color(TINT[sp]).offsetHSL((rng() - 0.5) * 0.05, 0, (rng() - 0.5) * 0.18);
      for (const b of tpl.blobs) {
        const cosY = Math.cos(yaw);
        const sinY = Math.sin(yaw);
        const px = (b.p.x * cosY - b.p.z * sinY) * t.h + t.x;
        const pz = (b.p.x * sinY + b.p.z * cosY) * t.h + t.z;
        const py = b.p.y * t.h;
        e.set(rng() * 0.4, rng() * 6.3, rng() * 0.4);
        q.setFromEuler(e);
        m.compose(new THREE.Vector3(px, py, pz), q, b.r.clone().multiplyScalar(t.h));
        blobs.setMatrixAt(bi, m);
        col.copy(base).offsetHSL(0, 0, (rng() - 0.5) * 0.14);
        blobs.setColorAt(bi, col);
        bi++;
        // a câmera não entra nas copas grandes
        const rad = Math.max(b.r.x, b.r.z) * t.h;
        if (sp !== 'bush' && rad > 1.4) TREES.push({ x: px, y: py, z: pz, r: rad * 0.8 });
      }
      if (sp !== 'bush') {
        const half = tpl.trunkHalf * t.h * 0.9;
        addBox(t.x - half, t.x + half, t.z - half, t.z + half, 5, '#5b4333');
      }
    }
    blobs.castShadow = true;
    group.add(blobs);

    // troncos e galhos
    if (sp !== 'bush') {
      const bark = new THREE.MeshLambertMaterial({ map: barkTex(sp) });
      (bark.map as THREE.Texture).repeat.set(2, sp === 'pine' ? 6 : 3);
      const trunks = new THREE.InstancedMesh(tpl.trunk, bark, trees.length);
      trees.forEach((t, i) => {
        q.setFromAxisAngle(Y, rng() * 6.3);
        m.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.h, t.h, t.h));
        trunks.setMatrixAt(i, m);
      });
      trunks.castShadow = true;
      group.add(trunks);
    }
  }
  return group;
}
