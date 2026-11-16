// Felipe = Xandão (terno) com o rosto de uma foto pintado na textura da cabeça (projeção frontal, bake no atlas).
// Uso (a partir da pasta onde estão @gltf-transform e sharp): node felipe-face.mjs Xandao.glb foto.jpg Felipe.glb atlas-debug.png
// A foto NÃO fica no repositório; só o GLB pronto. FP (JSON) ajusta cx/sx/lm/kx/sx2 (encaixe).
import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions'; import sharp from 'sharp'; import fs from 'fs';
const [inGlb, photoPath, outGlb, dbgPng] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); const d = await io.read(inGlb);
const prim = d.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute('POSITION'), uvA = prim.getAttribute('TEXCOORD_0'), idx = prim.getIndices();
const tex = d.getRoot().listTextures()[0];
const at = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const AW = at.info.width, AH = at.info.height, A = at.data; // RGB
const ph = await sharp(photoPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const PW = ph.info.width, PH = ph.info.height, PD = ph.data;
const sample = (x, y) => { x = Math.max(0, Math.min(PW - 1.001, x)); y = Math.max(0, Math.min(PH - 1.001, y)); const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0; const o = [0, 0, 0];
  for (let c = 0; c < 3; c++) { const g = (xx, yy) => PD[(yy * PW + xx) * 3 + c]; o[c] = (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy; } return o; };
const rawSample = sample; const isBg = (c) => Math.min(c[0], c[1], c[2]) > 222 && Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) < 28;
const avgPatch = (x0, y0, x1, y1) => { const s = [0, 0, 0]; let n = 0; for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const c = sample(x, y); s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; n++; } return s.map((v) => v / n); };
const SKIN = [0, 1, 2].map((c) => (avgPatch(380, 500, 470, 580)[c] + avgPatch(620, 500, 710, 580)[c] + avgPatch(320, 250, 380, 330)[c] + avgPatch(430, 150, 660, 200)[c]) / 4); // bochechas, lateral e topo do crânio
console.log('pele', SKIN.map(Math.round));
// parâmetros do encaixe (modelo: x direita da tela, y cima; foto: px, py)
const P = JSON.parse(process.env.FP || '{}');
const CX = P.cx ?? 545, SX = P.sx ?? 2865, SIDE = P.side ?? 0.085, KX = P.kx ?? 0.045, SX2 = P.sx2 ?? 4300;
const LM = P.lm ?? [[1.80, 122], [1.69, 430], [1.635, 560], [1.60, 660], [1.56, 880]]; // y do modelo -> py da foto
const toPhoto = (x, y) => { let py; if (y >= LM[0][0]) py = LM[0][1] - (y - LM[0][0]) * 3000; else if (y <= LM[LM.length - 1][0]) py = LM[LM.length - 1][1] + (LM[LM.length - 1][0] - y) * 3000; else { for (let i = 0; i < LM.length - 1; i++) { const a = LM[i], b = LM[i + 1]; if (y <= a[0] && y >= b[0]) { py = a[1] + (a[0] - y) / (a[0] - b[0]) * (b[1] - a[1]); break; } } } const ax = Math.abs(x); const dx = SX * Math.min(ax, KX) + SX2 * Math.max(0, ax - KX); return [CX + Math.sign(x || 1) * dx, Math.min(py, 945)]; };
const V = (i) => pos.getElement(i, [0, 0, 0]), UV = (i) => uvA.getElement(i, [0, 0]);
const skip = (cu, cv) => (cu < 75 && cv > 35 && cv < 170) || (cu > 250 && cv > 50 && cv < 150); // boca por dentro e olhos (esferas)
const tris = []; const nrm = new Map();
for (let t = 0; t < idx.getCount(); t += 3) {
  const a = [idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2)]; const ps = a.map(V), us = a.map(UV);
  const cu = (us[0][0] + us[1][0] + us[2][0]) / 3 * AW, cv = (us[0][1] + us[1][1] + us[2][1]) / 3 * AH; const ymin = Math.min(ps[0][1], ps[1][1], ps[2][1]);
  if (!(ymin > 1.45 && cu < 325 && cv < 325)) continue;
  const e1 = ps[1].map((v, k) => v - ps[0][k]), e2 = ps[2].map((v, k) => v - ps[0][k]); const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  for (const i of a) { const o = nrm.get(i) ?? [0, 0, 0]; nrm.set(i, [o[0] + n[0], o[1] + n[1], o[2] + n[2]]); }
  if (skip(cu, cv)) continue; tris.push({ a, ps, us });
}
// normais de vértice: orientação para fora (a partir do centro da cabeça)
const C = [0, 1.66, 0];
const nOf = (i) => { const n = nrm.get(i); const l = Math.hypot(...n) || 1; let r = n.map((v) => v / l); const p = V(i); const o = [p[0] - C[0], p[1] - C[1], p[2] - C[2]]; if (r[0] * o[0] + r[1] * o[1] + r[2] * o[2] < 0) r = r.map((v) => -v); return r; };
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const out = Buffer.from(A); const done = new Uint8Array(AW * AH);
const shade = (y) => 1; 
const colorAt = (p, n) => {
  const [px, py] = toPhoto(p[0], p[1]);
  const wN = sm(-0.25, 0.35, n[2]);
  const up = sm(1.655, 1.68, p[1]); const wX = 1 - sm(0.066 - 0.012 * up, 0.078 - 0.012 * up, Math.abs(p[0]));
  const wY = sm(1.50, 1.54, p[1]);
  const w = wN * wX * wY;
  let f = sample(CX + Math.sign(px - CX) * Math.min(Math.abs(px - CX), 238), py); if (isBg(f)) f = SKIN;
  // pele de reserva: mais escura para baixo (pescoço) e nas laterais
  const k = 1 - 0.06 * sm(0.2, -0.6, n[2]) - 0.1 * sm(1.56, 1.50, p[1]);
  const s = SKIN.map((v) => v * k);
  const base = [0, 1, 2].map((c) => f[c] * w + s[c] * (1 - w));
  // barba nas laterais do rosto (costeletas e mandíbula): a borda da foto é "esticada" para trás até a orelha, só onde ela é escura (barba)
  const ax = Math.abs(p[0]);
  const edge = 238; const fx = CX + Math.sign(p[0] || 1) * Math.min(Math.abs(px - CX), edge);
  let g = sample(fx, py); if (isBg(g)) g = SKIN; const lum = (g[0] + g[1] + g[2]) / 3;
  const bw = sm(125, 70, lum);
  const sb = bw * sm(0.062, 0.076, ax) * (1 - sm(0.097, 0.116, ax)) * sm(1.665, 1.64, p[1]) * sm(1.50, 1.54, p[1]) * sm(-0.7, -0.1, n[2] * 0 + (p[2] + 0.05) * 6);
  return base.map((v, c) => v * (1 - sb) + g[c] * sb);

};
const bary = (x, y, a, b, c) => { const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d; return [l1, l2, 1 - l1 - l2]; };
for (const pass of [0, 1]) for (const T of tris) {
  const q = T.us.map((u) => [u[0] * AW, u[1] * AH]); const eps = pass ? -0.12 : -1e-6;
  const x0 = Math.max(0, Math.floor(Math.min(q[0][0], q[1][0], q[2][0]) - 2)), x1 = Math.min(AW - 1, Math.ceil(Math.max(q[0][0], q[1][0], q[2][0]) + 2));
  const y0 = Math.max(0, Math.floor(Math.min(q[0][1], q[1][1], q[2][1]) - 2)), y1 = Math.min(AH - 1, Math.ceil(Math.max(q[0][1], q[1][1], q[2][1]) + 2));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (pass && done[y * AW + x]) continue; const b = bary(x + 0.5, y + 0.5, q[0], q[1], q[2]); if (b[0] < eps || b[1] < eps || b[2] < eps) continue;
    const p = [0, 1, 2].map((k) => T.ps[0][k] * b[0] + T.ps[1][k] * b[1] + T.ps[2][k] * b[2]);
    const n0 = T.a.map(nOf); let n = [0, 1, 2].map((k) => n0[0][k] * b[0] + n0[1][k] * b[1] + n0[2][k] * b[2]); const l = Math.hypot(...n) || 1; n = n.map((v) => v / l);
    const col = colorAt(p, n); for (let c = 0; c < 3; c++) out[(y * AW + x) * 3 + c] = Math.max(0, Math.min(255, Math.round(col[c]))); done[y * AW + x] = 1;
  }
}
// olhos (esferas): íris castanha e esclera clara (a íris azul do Agent 47 não combina)
for (let y = 55; y < 150; y++) for (let x = 250; x < 325; x++) { const o = (y * AW + x) * 3; const r = Math.hypot(x - 287.5, y - 94.5);
  if (r < 3.4) { out[o] = 15; out[o + 1] = 10; out[o + 2] = 8; } else if (r < 8.8) { const k = 0.8 + 0.4 * (1 - (r - 3.4) / 5.4); out[o] = 78 * k; out[o + 1] = 48 * k; out[o + 2] = 30 * k; } }
await sharp(out, { raw: { width: AW, height: AH, channels: 3 } }).png().toFile(dbgPng);
const buf = await sharp(out, { raw: { width: AW, height: AH, channels: 3 } }).webp({ quality: 90 }).toBuffer();
tex.setImage(new Uint8Array(buf)); await io.write(outGlb, d); console.log('ok', buf.length);
