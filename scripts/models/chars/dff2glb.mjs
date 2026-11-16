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
// ---- atlas: todas as texturas do personagem numa só (1 material opaco + 1 com recorte, para cabelo/dentes) ----
const texByName = new Map(txd.textureDictionary.textureNatives.map((t) => [t.textureName.toLowerCase(), t]));
const used = [...new Set(tri.map((t) => t[3]))];
const GUT = 8;
const ent = used.map((mi) => {
  const def = MATS[mi]; const tn = def.tex && texByName.get(def.tex);
  if (!tn) return { mi, def, w: 8, h: 8, solid: true, alpha: def.color[3] < 0.99 };
  const rgba = Buffer.from(tn.mipmaps[0]); let alpha = false;
  for (let i = 3; i < rgba.length; i += 4 * 16) if (rgba[i] < 250) { alpha = true; break; }
  return { mi, def, tn, rgba, w: Math.min(TEX, tn.width), h: Math.min(TEX, tn.height), alpha };
});
const pack = (AW, scale) => { // prateleiras, da mais alta para a mais baixa; devolve as posições e a altura usada (ou null)
  const cells = ent.map((e) => ({ e, cw: Math.max(8, Math.round(e.w * scale)), ch: Math.max(8, Math.round(e.h * scale)) })).sort((x, y) => y.ch - x.ch);
  let x = 0, y = 0, rowH = 0;
  for (const c of cells) {
    if (x + c.cw + 2 * GUT > AW) { x = 0; y += rowH; rowH = 0; }
    if (c.cw + 2 * GUT > AW) return null;
    c.x = x + GUT; c.y = y + GUT; x += c.cw + 2 * GUT; rowH = Math.max(rowH, c.ch + 2 * GUT);
  }
  return { cells, H: y + rowH };
};
let atlas = null;
for (const [AW, AH, minS] of (process.env.BIGATLAS === '1' ? [[1024, 1024, 0.35]] : [[512, 512, 0.5], [1024, 512, 0.5], [1024, 1024, 0.35]])) { // BIGATLAS=1: só 1024x1024 (personagem principal, rosto mais nítido)
  for (let sc = 1; sc >= minS - 1e-6 && !atlas; sc -= 0.05) { const r = pack(AW, sc); if (r && r.H <= AH) atlas = { ...r, AW, AH }; }
  if (atlas) break;
}
if (!atlas) throw new Error('texturas não cabem no atlas');
// UV de cada triângulo por material (com o deslocamento inteiro tirado): serve para saber quais texels da textura são usados
const triUV = new Map();
for (const t of tri) {
  const cu = (UV[t[0] * 2] + UV[t[1] * 2] + UV[t[2] * 2]) / 3, cv = (UV[t[0] * 2 + 1] + UV[t[1] * 2 + 1] + UV[t[2] * 2 + 1]) / 3;
  const ou = Math.floor(cu), ov = Math.floor(cv); const l = triUV.get(t[3]) ?? []; triUV.set(t[3], l);
  l.push([0, 1, 2].map((k) => [UV[t[k] * 2] - ou, UV[t[k] * 2 + 1] - ov]));
}
/** Pinta (para fora) a cor dos texels usados nos texels vazios em volta (fundo preto da textura), para o mipmap e o filtro não sujarem as bordas das ilhas de UV. */
function dilate(px, w, h, tris) {
  const used = new Uint8Array(w * h);
  for (const [a, b, c] of tris) {
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]) * w) - 1), x1 = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0]) * w) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]) * h) - 1), y1 = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1]) * h) + 1);
    const ax = a[0] * w, ay = a[1] * h, bx = b[0] * w, by = b[1] * h, cx = c[0] * w, cy = c[1] * h;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px2 = x + 0.5, py2 = y + 0.5;
      const l1 = ((by - cy) * (px2 - cx) + (cx - bx) * (py2 - cy)) / den, l2 = ((cy - ay) * (px2 - cx) + (ax - cx) * (py2 - cy)) / den, l3 = 1 - l1 - l2;
      const e = 1.2 / Math.sqrt(Math.abs(den)); // meio texel de folga
      if (l1 > -e && l2 > -e && l3 > -e) used[y * w + x] = 1;
    }
  }
  for (let it = 0; it < 24; it++) {
    const add = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (used[y * w + x]) continue;
      let r = 0, g = 0, b2 = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h || !used[yy * w + xx]) continue; const o = (yy * w + xx) * 4; r += px[o]; g += px[o + 1]; b2 += px[o + 2]; n++; }
      if (n) add.push([y * w + x, r / n, g / n, b2 / n]);
    }
    if (!add.length) break;
    for (const [i, r, g, b2] of add) { px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b2; used[i] = 1; }
  }
}
const comps = [];
const cellOf = new Map();
for (const c of atlas.cells) {
  cellOf.set(c.e.mi, c);
  let buf;
  if (c.e.solid) buf = await sharp({ create: { width: c.cw, height: c.ch, channels: 4, background: { r: Math.round(c.e.def.color[0] * 255), g: Math.round(c.e.def.color[1] * 255), b: Math.round(c.e.def.color[2] * 255), alpha: 1 } } }).png().toBuffer();
  else {
    const rawPx = await sharp(c.e.rgba, { raw: { width: c.e.tn.width, height: c.e.tn.height, channels: 4 } }).resize(c.cw, c.ch, { fit: 'fill' }).raw().toBuffer();
    dilate(rawPx, c.cw, c.ch, triUV.get(c.e.mi) ?? []);
    buf = await sharp(rawPx, { raw: { width: c.cw, height: c.ch, channels: 4 } }).png().toBuffer();
  }
  // borda = a própria textura repetida (como o REPEAT do original): UV um pouco além de 0..1 pega a outra ponta da textura e não a de outro material
  const tile = await sharp({ create: { width: c.cw * 3, height: c.ch * 3, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).composite([0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => ({ input: buf, left: j * c.cw, top: i * c.ch })))).png().toBuffer();
  const ext = await sharp(tile).extract({ left: c.cw - GUT, top: c.ch - GUT, width: c.cw + 2 * GUT, height: c.ch + 2 * GUT }).png().toBuffer();
  comps.push({ input: ext, left: c.x - GUT, top: c.y - GUT });
}
// fundo do atlas = cor média das texturas (preto sujava as bordas quando o mipmap mistura a vizinhança)
let ar = 0, ag = 0, ab = 0, an = 0;
for (const c of atlas.cells) { if (c.e.solid) { ar += c.e.def.color[0] * 255; ag += c.e.def.color[1] * 255; ab += c.e.def.color[2] * 255; an++; continue; } for (let i = 0; i < c.e.rgba.length; i += 4 * 97) { if (c.e.rgba[i + 3] > 128) { ar += c.e.rgba[i]; ag += c.e.rgba[i + 1]; ab += c.e.rgba[i + 2]; an++; } } }
const bg = { r: Math.round(ar / Math.max(1, an)), g: Math.round(ag / Math.max(1, an)), b: Math.round(ab / Math.max(1, an)), alpha: 1 };
const atlasPng = await sharp({ create: { width: atlas.AW, height: atlas.AH, channels: 4, background: bg } }).composite(comps).png().toBuffer();
// ---- vértices por grupo (opaco / recorte): um vértice por (vértice, material), com a UV levada para o atlas ----
let outside = 0;
const HEADY = process.env.HEADY ? +process.env.HEADY : null; // altura (m) a partir da qual os triângulos opacos vão para a malha "cabeça" (simplificada com menos força: os detalhes do rosto somem fácil)
const mkGroup = (alpha, name) => ({ alpha, name, key: new Map(), P: [], N: [], T: [], I: [] });
const groups = [mkGroup(false, 'opaco'), mkGroup(true, 'recorte'), mkGroup(false, 'cabeca')];
for (const t of tri) {
  const c = cellOf.get(t[3]);
  const gy = HEADY === null || c.e.alpha ? 0 : (pos[t[0] * 3 + 1] + pos[t[1] * 3 + 1] + pos[t[2] * 3 + 1]) / 3;
  const g = groups[c.e.alpha ? 1 : HEADY !== null && gy >= HEADY ? 2 : 0];
  // textura repetida: o deslocamento inteiro (de 1 em 1) é escolhido por triângulo, pelo centro dele, e tirado das UV antes de levar para o atlas
  const cu = (UV[t[0] * 2] + UV[t[1] * 2] + UV[t[2] * 2]) / 3, cv = (UV[t[0] * 2 + 1] + UV[t[1] * 2 + 1] + UV[t[2] * 2 + 1]) / 3;
  const ou = Math.floor(cu), ov = Math.floor(cv);
  for (let k = 0; k < 3; k++) {
    const vi = t[k]; const key = `${vi}_${t[3]}_${ou}_${ov}`;
    let ni = g.key.get(key);
    if (ni === undefined) {
      ni = g.P.length / 3; g.key.set(key, ni);
      g.P.push(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]); g.N.push(nor[vi * 3], nor[vi * 3 + 1], nor[vi * 3 + 2]);
      let u = UV[vi * 2] - ou, v = UV[vi * 2 + 1] - ov;
      if (u < -GUT / c.cw || u > 1 + GUT / c.cw || v < -GUT / c.ch || v > 1 + GUT / c.ch) outside++;
      u = Math.min(1 + GUT / c.cw, Math.max(-GUT / c.cw, u)); v = Math.min(1 + GUT / c.ch, Math.max(-GUT / c.ch, v));
      g.T.push((c.x + u * c.cw) / atlas.AW, (c.y + v * c.ch) / atlas.AH);
    }
    g.I.push(ni);
  }
}
if (outside) console.error(`AVISO: ${outside} vértices com UV bem fora de 0..1 depois do deslocamento (textura repetida?)`);
// ---- documento glTF ----
const doc = new Document();
const unlit = doc.createExtension(KHRMaterialsUnlit);
doc.createExtension(EXTTextureWebP).setRequired(false);
const buf = doc.createBuffer();
const scene = doc.createScene(); const node = doc.createNode(outp.split('/').pop().replace('.glb', '')); scene.addChild(node);
const mesh = doc.createMesh(); node.setMesh(mesh);
const atlasTex = doc.createTexture('atlas').setImage(new Uint8Array(atlasPng)).setMimeType('image/png');
for (const g of groups) {
  if (!g.I.length) continue;
  const material = doc.createMaterial(g.name).setBaseColorTexture(atlasTex).setBaseColorFactor([1, 1, 1, 1]);
  material.setDoubleSided(g.alpha || process.env.DOUBLE === '1');
  if (g.alpha) material.setAlphaMode('MASK').setAlphaCutoff(0.5);
  material.setExtension('KHR_materials_unlit', unlit.createUnlit());
  const acc = (type, arr, Arr) => doc.createAccessor().setType(type).setArray(new Arr(arr)).setBuffer(buf);
  mesh.addPrimitive(doc.createPrimitive().setName(g.name).setMaterial(material)
    .setAttribute('POSITION', acc('VEC3', g.P, Float32Array)).setAttribute('NORMAL', acc('VEC3', g.N, Float32Array)).setAttribute('TEXCOORD_0', acc('VEC2', g.T, Float32Array))
    .setIndices(acc('SCALAR', g.I, Uint32Array)));
}
const count = () => { let t = 0; for (const p of mesh.listPrimitives()) t += p.getIndices().getCount() / 3; return t; };
const before = count();
const steps = [weld({ tolerance: 0.0005 })];
if (before > TARGET * 1.03 && HEADY === null) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: TARGET / before, error: +(process.env.ERR ?? 0.08) }));
steps.push(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 80 }));
await doc.transform(...steps);
if (HEADY !== null) { // corpo e cabeça com alvos separados; na cabeça as bordas ficam travadas (sobrancelhas, olhos e brincos são cascas soltas que sumiam)
  const HT = +(process.env.HEADTRIS ?? 5000);
  const prims = mesh.listPrimitives(); const headP = prims.find((p) => p.getName() === 'cabeca');
  const headN = headP ? headP.getIndices().getCount() / 3 : 0;
  const bodyN = prims.filter((p) => p !== headP && p.getName() === 'opaco').reduce((a, p) => a + p.getIndices().getCount() / 3, 0);
  for (const p of prims) {
    if (p.getName() === 'recorte') continue;
    const isHead = p === headP; const n = p.getIndices().getCount() / 3;
    const want = Math.round(isHead ? Math.min(n, HT) : Math.min(n, Math.max(200, TARGET - Math.min(headN, HT))));
    if (want >= n) continue;
    const pa = p.getAttribute('POSITION'); const pos2 = new Float32Array(pa.getCount() * 3); const tmp = [0, 0, 0];
    for (let i = 0; i < pa.getCount(); i++) { pa.getElement(i, tmp); pos2.set(tmp, i * 3); }
    const [out] = MeshoptSimplifier.simplify(p.getIndices().getArray(), pos2, 3, want * 3, +(process.env.ERR ?? 0.08), ['LockBorder']); // bordas travadas nas duas malhas: a emenda do pescoço não abre
    p.getIndices().setArray(new Uint32Array(out));
    // tira os vértices que sobraram sem uso (a simplificação só mexe nos índices)
    const ids = p.getIndices().getArray(); const remap = new Map(); const keep = [];
    for (let i = 0; i < ids.length; i++) if (!remap.has(ids[i])) { remap.set(ids[i], keep.length); keep.push(ids[i]); }
    for (const sem of p.listSemantics()) {
      const a = p.getAttribute(sem); const n = a.getElementSize(); const na = a.getArray().constructor; const arr = new na(keep.length * n); const tmp = new Array(n).fill(0);
      keep.forEach((src, j) => { a.getElement(src, tmp); for (let k = 0; k < n; k++) arr[j * n + k] = tmp[k]; });
      a.setArray(arr);
    }
    p.getIndices().setArray(new Uint32Array(ids.map((v) => remap.get(v))));
  }
  await doc.transform(prune());
}
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
