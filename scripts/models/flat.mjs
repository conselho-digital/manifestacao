import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { join, prune, dedup } from '@gltf-transform/functions';
import fs from 'fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [src, dst] = [process.argv[2], process.argv[3]];
const doc = await io.read(src);
const buf = doc.getRoot().listBuffers()[0];
const flat = doc.createMaterial('flat').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.7);
const glass = doc.createMaterial('glass').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.2).setAlphaMode('BLEND');
let merged = 0, kept = 0;
const keepNames = [];
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const m = prim.getMaterial();
  const isGlass = m && !m.getBaseColorTexture() && m.getAlphaMode() === 'BLEND' && /glass/i.test(m.getName());
  if (isGlass) glass.setDoubleSided(m.getDoubleSided());
  const plain = m && !m.getBaseColorTexture() && (m.getAlphaMode() === 'OPAQUE' || isGlass) && m.getEmissiveFactor().every(v => v < 0.01) && !m.getEmissiveTexture();
  if (!plain || prim.getAttribute('COLOR_0')) { kept++; if (m) keepNames.push(m.getName()); continue; }
  const n = prim.getAttribute('POSITION').getCount();
  const f = m.getBaseColorFactor();
  const arr = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) arr.set(f, i * 4);
  prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(arr).setBuffer(buf));
  prim.setMaterial(isGlass ? glass : flat);
  merged++;
}
// junta as primitivas de mesmo material dentro de CADA malha (os nós body, wheel_*, door_* continuam separados)
for (const mesh of doc.getRoot().listMeshes()) {
  const groups = new Map();
  for (const p of mesh.listPrimitives()) { const k = (p.getMaterial()?.getName() ?? '') + '|' + (p.getMaterial() === flat ? 'f' : p.getMaterial() === glass ? 'g' : doc.getRoot().listMaterials().indexOf(p.getMaterial())) + '|' + p.listSemantics().sort().join(','); (groups.get(k) ?? groups.set(k, []).get(k)).push(p); }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const first = list[0];
    const sem = first.listSemantics();
    const counts = list.map((p) => p.getAttribute('POSITION').getCount());
    const iarrs = list.map((p) => p.getIndices().getArray());
    const total = list.reduce((a, p) => a + p.getAttribute('POSITION').getCount(), 0);
    const icount = list.reduce((a, p) => a + p.getIndices().getCount(), 0);
    for (const s of sem) {
      const a0 = first.getAttribute(s);
      const es = a0.getElementSize();
      const out = new Float32Array(total * es); // tudo em float (os tipos variam entre as primitivas: Int16/Uint16 normalizados e Float32)
      let off = 0;
      const tmp = new Array(es).fill(0);
      for (const p of list) { const at = p.getAttribute(s); for (let i = 0; i < at.getCount(); i++) { at.getElement(i, tmp); out.set(tmp, off); off += es; } }
      first.setAttribute(s, doc.createAccessor().setType(a0.getType()).setArray(out).setBuffer(buf));
    }
    const idx = new Uint32Array(icount);
    let io2 = 0, vo = 0;
    list.forEach((p, k) => { const ia = iarrs[k]; for (let i = 0; i < ia.length; i++) idx[io2++] = ia[i] + vo; vo += counts[k]; });
    first.setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buf));
    for (const p of list.slice(1)) { mesh.removePrimitive(p); p.dispose(); }
  }
}
await doc.transform(prune(), dedup());
await io.write(dst, doc);
let t = 0, prims = 0; for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) { t += p.getIndices().getCount() / 3; prims++; }
console.log('prims fundidas', merged, 'mantidas', kept, '->', prims, 'prims', Math.round(t), 'tris', Math.round(fs.statSync(dst).size / 1024) + 'KB', [...new Set(keepNames)].join(','));
