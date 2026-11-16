// Converte um personagem DFF/TXD do GTA (skin parado, qualquer eixo) em GLB do jogo: 1,8 m, pés no chão, olhando para +Z, sem luz,
// texturas até 512 px e no máximo N triângulos. Uso (com rw-parser, sharp, meshoptimizer e @gltf-transform no NODE_PATH/node_modules):
//   node dff2glb.mjs <dff> <txd> <saida.glb> [triangulos=3500] [textura=512] [up=+x fwd=+y]  (up/fwd só se a detecção automática errar)
import { createRequire } from 'module';
import fs from 'fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRMaterialsUnlit, EXTTextureWebP } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const { DffParser, TxdParser } = require('rw-parser');
await MeshoptSimplifier.ready;
const [dffp, txdp, outp, trisArg, texArg, upArg, fwdArg] = process.argv.slice(2);
const TARGET = +(trisArg ?? 3500), TEX = +(texArg ?? 512);
const quiet = (fn) => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };
const rawD = fs.readFileSync(dffp);
const dff = quiet(() => new DffParser(rawD.subarray(0, 12 + rawD.readUInt32LE(4))).parse()); // alguns arquivos têm lixo depois do clump
const rawT = fs.readFileSync(txdp);
const txd = quiet(() => new TxdParser(rawT).parse());
const clump = dff.clumps[0];
// ---- geometria (todas as atomics, com a matriz do frame) ----
const fr = clump.frameList.frames;
const mat = (f) => { const r = f.rotationMatrix, o = f.coordinatesOffset; return [[r.right.x, r.up.x, r.at.x, o.x], [r.right.y, r.up.y, r.at.y, o.y], [r.right.z, r.up.z, r.at.z, o.z], [0, 0, 0, 1]]; };
const mul = (a, b) => a.map((_, i) => [0, 1, 2, 3].map((j) => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j] + a[i][3] * b[3][j]));
const world = (i) => { let m = mat(fr[i]); let p = fr[i].parentFrame; while (p >= 0) { m = mul(mat(fr[p]), m); p = fr[p].parentFrame; } return m; };
const P = [], N = [], UV = [], MATS = []; // por vértice; MATS por material (textura + cor)
const tri = []; // [a, b, c, material]
const matKey = new Map();
for (const at of clump.atomics) {
  const g = clump.geometryList.geometries[at.geometryIndex];
  const W = world(at.frameIndex);
  const base = P.length / 3;
  for (let i = 0; i < g.vertexInformation.length; i++) {
    const v = g.vertexInformation[i];
    for (let r = 0; r < 3; r++) P.push(W[r][0] * v.x + W[r][1] * v.y + W[r][2] * v.z + W[r][3]);
    const n = g.normalInformation?.[i] ?? { x: 0, y: 0, z: 1 };
    for (let r = 0; r < 3; r++) N.push(W[r][0] * n.x + W[r][1] * n.y + W[r][2] * n.z);
    const t = g.textureMappingInformation?.[0]?.[i] ?? { u: 0, v: 0 };
    UV.push(t.u, t.v);
  }
  const mids = g.materialList.materialData.map((m) => {
    const tex = m.texture?.textureName?.toLowerCase() ?? null;
    const key = `${tex}|${m.color.r},${m.color.g},${m.color.b}`;
    if (!matKey.has(key)) { matKey.set(key, MATS.length); MATS.push({ tex, color: [m.color.r / 255, m.color.g / 255, m.color.b / 255] }); }
    return matKey.get(key);
  });
  if (!g.binMesh?.meshes?.length && g.triangleInformation?.length) {
    for (const t of g.triangleInformation) tri.push([base + t.vector.x, base + t.vector.y, base + t.vector.z, mids[t.materialId] ?? 0]);
  } else {
    for (const m of g.binMesh.meshes) {
      const id = m.indices;
      if (g.isTriangleStrip) for (let i = 0; i + 2 < id.length; i++) { const a = id[i], b = id[i + 1], c = id[i + 2]; if (a === b || b === c || a === c) continue; tri.push(i % 2 ? [base + a, base + c, base + b, mids[m.materialIndex]] : [base + a, base + b, base + c, mids[m.materialIndex]]); }
      else for (let i = 0; i + 2 < id.length; i += 3) tri.push([base + id[i], base + id[i + 1], base + id[i + 2], mids[m.materialIndex]]);
    }
  }
}
const nv = P.length / 3;
// ---- orientação: cima = eixo mais longo; frente = eixo mais fino; sinais pela distribuição ----
const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], P[i * 3 + a]); hi[a] = Math.max(hi[a], P[i * 3 + a]); }
const ext = [0, 1, 2].map((a) => hi[a] - lo[a]);
const order = [0, 1, 2].sort((a, b) => ext[b] - ext[a]);
let upA = order[0], fwA = order[2];
let upS = 1, fwS = 1;
if (upArg) { upA = 'xyz'.indexOf(upArg[1]); upS = upArg[0] === '-' ? -1 : 1; }
else { // a ponta com mais vértices é a cabeça
  const cut = 0.15 * ext[upA]; let top = 0, bot = 0;
  for (let i = 0; i < nv; i++) { const v = P[i * 3 + upA]; if (v > hi[upA] - cut) top++; else if (v < lo[upA] + cut) bot++; }
  upS = top >= bot ? 1 : -1;
}
if (fwdArg) { fwA = 'xyz'.indexOf(fwdArg[1]); fwS = fwdArg[0] === '-' ? -1 : 1; }
else { // os pés apontam para a frente: o centro dos vértices dos pés fica deslocado para o lado da frente
  const h0 = upS > 0 ? lo[upA] : hi[upA]; let s = 0, n = 0, m = 0;
  for (let i = 0; i < nv; i++) { const d = Math.abs(P[i * 3 + upA] - h0); if (d < 0.07 * ext[upA]) { s += P[i * 3 + fwA]; n++; } m += P[i * 3 + fwA]; }
  fwS = s / Math.max(1, n) >= m / nv ? 1 : -1;
}
const U = [0, 0, 0], F = [0, 0, 0]; U[upA] = upS; F[fwA] = fwS;
const L = [U[1] * F[2] - U[2] * F[1], U[2] * F[0] - U[0] * F[2], U[0] * F[1] - U[1] * F[0]]; // esquerda = cima x frente (sistema destro, como no glTF)
const dot = (a, i) => a[0] * P[i * 3] + a[1] * P[i * 3 + 1] + a[2] * P[i * 3 + 2];
const dotv = (a, x, y, z) => a[0] * x + a[1] * y + a[2] * z;
let ymin = 1e9, ymax = -1e9, xmin = 1e9, xmax = -1e9, zmin = 1e9, zmax = -1e9;
for (let i = 0; i < nv; i++) { const y = dot(U, i), x = dot(L, i), z = dot(F, i); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
const S = 1.8 / (ymax - ymin);
const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
for (let i = 0; i < nv; i++) {
  pos[i * 3] = (dot(L, i) - (xmin + xmax) / 2) * S; pos[i * 3 + 1] = (dot(U, i) - ymin) * S; pos[i * 3 + 2] = (dot(F, i) - (zmin + zmax) / 2) * S;
  const nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
  nor[i * 3] = dotv(L, nx, ny, nz); nor[i * 3 + 1] = dotv(U, nx, ny, nz); nor[i * 3 + 2] = dotv(F, nx, ny, nz);
}
// ---- documento glTF ----
const doc = new Document();
const unlit = doc.createExtension(KHRMaterialsUnlit);
doc.createExtension(EXTTextureWebP).setRequired(false);
const buf = doc.createBuffer();
const scene = doc.createScene(); const node = doc.createNode(outp.split('/').pop().replace('.glb', '')); scene.addChild(node);
const mesh = doc.createMesh(); node.setMesh(mesh);
const texByName = new Map(txd.textureDictionary.textureNatives.map((t) => [t.textureName.toLowerCase(), t]));
const uvA = new Float32Array(UV); const posA = doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buf);
const norA = doc.createAccessor().setType('VEC3').setArray(nor).setBuffer(buf);
const uvAcc = doc.createAccessor().setType('VEC2').setArray(uvA).setBuffer(buf);
for (let mi = 0; mi < MATS.length; mi++) {
  const ids = []; for (const t of tri) if (t[3] === mi) ids.push(t[0], t[1], t[2]);
  if (!ids.length) continue;
  const def = MATS[mi]; const material = doc.createMaterial(`m${mi}_${def.tex ?? 'cor'}`).setBaseColorFactor([...def.color, 1]).setDoubleSided(true);
  material.setExtension('KHR_materials_unlit', unlit.createUnlit());
  const tn = def.tex && texByName.get(def.tex);
  if (tn) {
    const rgba = Buffer.from(tn.mipmaps[0]);
    const img = sharp(rgba, { raw: { width: tn.width, height: tn.height, channels: 4 } });
    let hasAlpha = false; for (let i = 3; i < rgba.length; i += 4 * 64) if (rgba[i] < 250) { hasAlpha = true; break; }
    const png = await img.resize(Math.min(TEX, tn.width), Math.min(TEX, tn.height), { fit: 'fill' }).png().toBuffer();
    const tex = doc.createTexture(def.tex).setImage(new Uint8Array(png)).setMimeType('image/png');
    material.setBaseColorTexture(tex).setBaseColorFactor([1, 1, 1, 1]);
    if (hasAlpha) material.setAlphaMode('MASK').setAlphaCutoff(0.5);
  }
  const prim = doc.createPrimitive().setMaterial(material).setAttribute('POSITION', posA).setAttribute('NORMAL', norA).setAttribute('TEXCOORD_0', uvAcc)
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(ids)).setBuffer(buf));
  mesh.addPrimitive(prim);
}
const count = () => { let t = 0; for (const p of mesh.listPrimitives()) t += p.getIndices().getCount() / 3; return t; };
const before = count();
const steps = [weld({ tolerance: 0.0005 })];
if (before > TARGET * 1.03) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: TARGET / before, error: +(process.env.ERR ?? 0.08) }));
steps.push(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEX, TEX], quality: 80 }));
await doc.transform(...steps);
if (count() > TARGET * 1.3 && process.env.SLOPPY === '1') { // malhas de cascas separadas (roupas por cima do corpo) não colapsam pelo método normal: simplificação "sloppy" só nas peças do corpo (a cabeça e o cabelo, de 1,45 m para cima, ficam como estão: o rosto estraga)
  const headFrac = (p) => { const ix = p.getIndices().getArray(), pa = p.getAttribute('POSITION'); let n = 0, h = 0; const t = [0, 0, 0]; for (let i = 0; i < ix.length; i += 3) { pa.getElement(ix[i], t); n++; if (t[1] > 1.45) h++; } return h / Math.max(1, n); };
  const prims = mesh.listPrimitives(); const heads = prims.filter((p) => headFrac(p) > 0.3);
  const keep = heads.reduce((s2, p) => s2 + p.getIndices().getCount() / 3, 0), body = count() - keep;
  const k = Math.min(1, Math.max(0.02, (TARGET - keep) / Math.max(1, body)));
  for (const p of prims) {
    if (heads.includes(p)) continue;
    const idx = p.getIndices(); const want = Math.max(30, Math.round((idx.getCount() / 3) * k)) * 3;
    if (want >= idx.getCount()) continue;
    const pa = p.getAttribute('POSITION'); const pos = new Float32Array(pa.getCount() * 3); const tmp = [0, 0, 0];
    for (let i = 0; i < pa.getCount(); i++) { pa.getElement(i, tmp); pos.set(tmp, i * 3); }
    const [out] = MeshoptSimplifier.simplifySloppy(idx.getArray(), pos, 3, null, want, 0.25);
    idx.setArray(new Uint32Array(out));
  }
  await doc.transform(prune());
}
await new NodeIO().registerExtensions([KHRMaterialsUnlit, EXTTextureWebP]).write(outp, doc);
console.log(outp.split('/').pop(), 'cima', (upS > 0 ? '+' : '-') + 'xyz'[upA], 'frente', (fwS > 0 ? '+' : '-') + 'xyz'[fwA], 'ext', ext.map((n) => +n.toFixed(2)).join('x'), 'tris', before, '->', count(), 'mats', mesh.listPrimitives().length, Math.round(fs.statSync(outp).size / 1024) + 'KB');
