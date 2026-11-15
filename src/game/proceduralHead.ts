// Cabeça modelada por código (sem arquivo): crânio liso e redondo (careca), nariz, sobrancelhas, bochechas, lábios, queixo, orelhas e uma BARBA
// de verdade em 3D (casca de malha em volta da mandíbula, bigode e cavanhaque, com tufos e fios grisalhos no queixo). A foto do rosto vai por cima
// da pele (projeção de frente, como em customChars.ts) e a casca da barba tem cor própria por vértice.
// Medidas em "alturas da cabeça" (H = do topo do crânio à base da mandíbula, 0,235 m): x = direita do personagem, y = cima, z = frente.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const HEAD_H = 0.215;
const ss = (a: number, b: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const g2 = (x: number, y: number, cx: number, cy: number, sx: number, sy: number): number => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));

/** ruído de valor barato e repetível (para tufos e fios) */
function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  return l(
    l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
    l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}

/** Forma do rosto: recebe a direção na esfera e devolve o ponto da pele (em H). */
function skinPoint(dx: number, dy: number, dz: number): THREE.Vector3 {
  const y = dy >= 0 ? 0.5 * dy : -0.5 * Math.pow(-dy, 0.72); // metade de baixo mais cheia: a mandíbula fica quadrada, não pontuda
  const t = Math.max(0, Math.min(1, (-dy - 0.05) / 0.95)); // 0 no crânio, 1 no queixo
  const jaw = 1 - 0.2 * Math.pow(t, 1.3); // a mandíbula é mais estreita que o crânio
  const x = dx * 0.36 * jaw;
  let z = dz * (dz > 0 ? 0.4 : 0.44) * (1 - 0.1 * t) - 0.02;
  const front = ss(0.25, 0.8, dz);
  const ax = Math.abs(x);
  let f = 0;
  f += 0.035 * g2(x, y, 0, -0.03, 0.03, 0.09); // ponte do nariz
  f += 0.045 * g2(x, y, 0, -0.095, 0.032, 0.035); // ponta do nariz
  f += 0.022 * (g2(ax, y, 0.04, -0.1, 0.02, 0.03)); // asas do nariz
  f += 0.022 * g2(ax, y, 0.1, 0.09, 0.12, 0.035) * (1 - ss(0.2, 0.3, ax)); // arcada das sobrancelhas
  f -= 0.012 * g2(ax, y, 0.12, 0.063, 0.05, 0.03); // órbitas dos olhos
  f += 0.014 * g2(ax, y, 0.2, -0.08, 0.07, 0.08); // bochechas
  f += 0.012 * g2(x, y, 0, -0.275, 0.07, 0.025); // lábios
  f += 0.03 * g2(x, y, 0, -0.47, 0.08, 0.06); // queixo
  z += f * front;
  // queixo e mandíbula um pouco mais para a frente e para baixo
  if (dy < -0.55) z += 0.02 * ss(-0.55, -1, dy) * front;
  return new THREE.Vector3(x, y, z);
}

export interface HeadParts { group: THREE.Group; skin: THREE.Mesh }

/**
 * Monta a cabeça (pele + orelhas + barba). `skinMat` é o material da pele (já com a foto); `skinHex` é a cor lisa das orelhas.
 * A origem do grupo é o CENTRO da cabeça; fica de frente para +Z.
 */
export function buildFelipeHead(skinMat: THREE.Material, skinHex: string, beard = true): HeadParts {
  const group = new THREE.Group();

  // ---- pele ----
  let g: THREE.BufferGeometry = new THREE.SphereGeometry(1, 80, 60);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-5);
  const pos = g.getAttribute('position');
  const n = pos.count;
  const dir = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    dir.fromBufferAttribute(pos, i).normalize();
    const p = skinPoint(dir.x, dir.y, dir.z);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  const nrm = g.getAttribute('normal');
  // atributos do shader do rosto: posição/normal no sistema "direita, cima, frente" (x invertido) em H
  const fP = new Float32Array(n * 3);
  const fN = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const light = new THREE.Vector3(0.35, 0.55, 0.75).normalize();
  for (let i = 0; i < n; i++) {
    fP[i * 3] = -pos.getX(i); fP[i * 3 + 1] = pos.getY(i); fP[i * 3 + 2] = pos.getZ(i);
    fN[i * 3] = -nrm.getX(i); fN[i * 3 + 1] = nrm.getY(i); fN[i * 3 + 2] = nrm.getZ(i);
    const sh = 0.8 + 0.2 * Math.max(-0.3, nrm.getX(i) * light.x + nrm.getY(i) * light.y + nrm.getZ(i) * light.z); // sombreado suave (o material não tem luz)
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = sh;
  }
  g.setAttribute('fP', new THREE.BufferAttribute(fP, 3));
  g.setAttribute('fN', new THREE.BufferAttribute(fN, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const skin = new THREE.Mesh(g, skinMat);
  skin.name = 'felipe_skin';
  skin.scale.setScalar(HEAD_H);
  skin.frustumCulled = false;
  group.add(skin);

  // ---- pescoço: um tubo curto sob a mandíbula, para esconder a ponta recortada do pescoço do corpo ----
  const neckMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setStyle(skinHex) });
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.054, 0.07, 18, 1, true), neckMat);
  neck.position.set(0, -0.5 * HEAD_H - 0.012, -0.012);
  neck.frustumCulled = false;
  group.add(neck);

  // ---- orelhas ----
  const earMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setStyle(skinHex) });
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 12), earMat);
    e.scale.set(0.022, 0.065, 0.045).multiplyScalar(HEAD_H);
    e.position.set(sx * 0.355 * HEAD_H, 0.0, -0.03 * HEAD_H);
    e.rotation.set(0, 0, sx * 0.12);
    e.frustumCulled = false;
    group.add(e);
  }

  // ---- barba ----
  if (beard) {
    const idx = g.index!;
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = -pos.getX(i), b = pos.getY(i), c = pos.getZ(i);
      const top = -0.07 - 0.1 * (1 - ss(0.08, 0.26, Math.abs(a))); // linha de cima em U: alta nas bochechas, baixa no meio (só o bigode)
      let v = ss(top, top - 0.06, b) * ss(-0.25, -0.05, c);
      const mouth = Math.hypot(a / 0.105, (b + 0.272) / 0.036);
      v *= ss(0.85, 1.25, mouth); // abertura da boca: os lábios da foto aparecem
      w[i] = v;
    }
    const beardPos = new Float32Array(n * 3);
    const beardCol = new Float32Array(n * 3);
    const c0 = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = -pos.getX(i), b = pos.getY(i);
      const nz = nrm.getZ(i), nx = nrm.getX(i), ny = nrm.getY(i);
      const tuft = 0.75 + 0.5 * vnoise(pos.getX(i) * 90, pos.getY(i) * 90, pos.getZ(i) * 90);
      const t = (0.02 + 0.06 * ss(-0.3, -0.46, b) * (1 - 0.5 * ss(-0.46, -0.5, b)) + 0.025 * ss(0.15, 0.3, Math.abs(a))) * w[i]! * tuft; // mais comprida no queixo
      beardPos[i * 3] = pos.getX(i) + nx * t;
      beardPos[i * 3 + 1] = pos.getY(i) + ny * t - 0.005 * ss(-0.4, -0.5, b) * w[i]!; // o cavanhaque desce um pouco
      beardPos[i * 3 + 2] = pos.getZ(i) + nz * t;
      // cor: preto-acastanhado com variação por tufo; fios grisalhos no queixo e no meio da mandíbula
      const fine = vnoise(pos.getX(i) * 260, pos.getY(i) * 260, pos.getZ(i) * 260);
      const gray = ss(-0.34, -0.5, b) * (1 - ss(0.0, 0.2, Math.abs(a))) * (0.35 + 0.65 * ss(0.45, 0.75, fine));
      const base = 0.1 + 0.07 * fine;
      const lum = base + gray * 0.34;
      c0.setRGB(lum * 1.05, lum, lum * 0.95, THREE.SRGBColorSpace);
      const sh = 0.85 + 0.15 * Math.max(-0.3, nx * light.x + ny * light.y + nz * light.z);
      beardCol[i * 3] = c0.r * sh; beardCol[i * 3 + 1] = c0.g * sh; beardCol[i * 3 + 2] = c0.b * sh;
    }
    const keep: number[] = [];
    for (let k = 0; k < idx.count; k += 3) {
      const a = idx.getX(k), b2 = idx.getX(k + 1), c = idx.getX(k + 2);
      if (w[a]! > 0.03 || w[b2]! > 0.03 || w[c]! > 0.03) keep.push(a, b2, c);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(beardPos, 3));
    bg.setAttribute('color', new THREE.BufferAttribute(beardCol, 3));
    bg.setAttribute('bw', new THREE.BufferAttribute(w, 1));
    bg.setIndex(keep);
    const bmat = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    // borda da barba desfiada: o fragmento some onde o peso da barba é baixo (com ruído), em vez de recortar triângulos
    bmat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float bw;\nvarying float vBW;\nvarying vec3 vBP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBW = bw;\nvBP = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vBW;\nvarying vec3 vBP;')
        .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 q = floor(vBP * 420.0);
          float nz = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          if (vBW < 0.38 + 0.3 * nz) discard;
        }`);
    };
    bmat.customProgramCacheKey = () => 'beard';
    const bm = new THREE.Mesh(bg, bmat);
    bm.name = 'felipe_beard';
    bm.scale.setScalar(HEAD_H);
    bm.frustumCulled = false;
    group.add(bm);
  }
  group.traverse((o) => { (o as THREE.Mesh).castShadow = false; });
  return { group, skin };
}
