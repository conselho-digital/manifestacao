import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, prune, dedup, textureCompress, reorder } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [src, dst, target, tex, wheelTarget] = [process.argv[2], process.argv[3], Number(process.argv[4]), Number(process.argv[5] || 512), Number(process.argv[6] || 400)];
const doc = await io.read(src);
const tris = () => { let t = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) t += p.getIndices().getCount() / 3; return t; };
const before = tris();
let dropped = 0;
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const mt = p.getMaterial(); const n = p.getIndices().getCount() / 3; const keepN = (process.env.KEEP || '').split(',');
  if (n <= Number(process.env.TINY || 0) && mt && mt.getBaseColorTexture() && !keepN.includes(mt.getName()) && mt.getName() !== 'paint') { m.removePrimitive(p); dropped++; } }
console.log('prims minúsculas removidas', dropped);
// a pintura branca fixa da viatura vira cor lisa (junta com as outras na hora de achatar)
for (const mt of doc.getRoot().listMaterials()) if (mt.getName() === 'paint') mt.setName('white');
// nós de roda: ficam com wheelTarget triângulos cada; o resto divide o que sobrar
let wheelTotal = 0, rest = 0;
const isDoor = (mesh) => doc.getRoot().listNodes().some((n) => n.getMesh() === mesh && /^door/.test(n.getName()));
const isWheel = (mesh) => doc.getRoot().listNodes().some((n) => n.getMesh() === mesh && /^wheel/.test(n.getName()));
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const n = p.getIndices().getCount() / 3; if (isWheel(m)) wheelTotal += n; else if (!isDoor(m)) rest += n; }
const wheelK = Math.min(1, (wheelTarget * 4) / wheelTotal);
const doorTris = (() => { let t = 0; for (const m of doc.getRoot().listMeshes()) if (isDoor(m)) for (const p of m.listPrimitives()) t += p.getIndices().getCount() / 3; return t; })();
const restK = Math.min(1, (target - wheelTarget * 4 - doorTris) / rest);
for (const m of doc.getRoot().listMeshes()) {
  const k = isWheel(m) ? wheelK : isDoor(m) ? 1 : restK;
  for (const p of m.listPrimitives()) {
    const idx = p.getIndices(); const n = idx.getCount() / 3;
    const kk = p.getMaterial()?.getName() === 'glass' && !isWheel(m) ? Math.min(k, Number(process.env.GLASSK || 1)) : k;
    const want = Math.max(30, Math.round(n * kk)) * 3;
    if (want >= idx.getCount()) continue;
    const pa = p.getAttribute('POSITION'); const cnt = pa.getCount();
    const pos = new Float32Array(cnt * 3); const tmp = [0, 0, 0];
    for (let i = 0; i < cnt; i++) { pa.getElement(i, tmp); pos.set(tmp, i * 3); }
    const canon = new Uint32Array(cnt); const seen = new Map();
    for (let i = 0; i < cnt; i++) { const key = Math.round(pos[i * 3] * 1e4) + ',' + Math.round(pos[i * 3 + 1] * 1e4) + ',' + Math.round(pos[i * 3 + 2] * 1e4); if (!seen.has(key)) seen.set(key, i); canon[i] = seen.get(key); }
    const ci = Uint32Array.from(idx.getArray(), (v) => canon[v]);
    let [out] = MeshoptSimplifier.simplify(ci, pos, 3, want, Number(process.env.ERR || 0.6), process.env.LB ? ['LockBorder'] : []);
    if ((isWheel(m) || process.env.SLOPPY_BODY) && out.length > want * 1.1) [out] = MeshoptSimplifier.simplifySloppy(ci, pos, 3, null, want, 0.3); // roda: redonda, aguenta o simplificador grosso
    if (process.env.DBG) console.log(m.getName(), n, want / 3, out.length / 3, 'err');
    idx.setArray(new Uint32Array(out));
  }
}
// roda: um só primitivo por roda (o shader do pneu pinta tudo; menos chamadas de desenho)
for (const m of doc.getRoot().listMeshes()) {
  if (!isWheel(m)) continue;
  const prims = m.listPrimitives();
  if (prims.length < 2) continue;
  const all = []; for (const p of prims) all.push(...p.getIndices().getArray());
  const first = prims[0];
  first.getIndices().setArray(new Uint32Array(all));
  for (const p of prims.slice(1)) m.removePrimitive(p);
}
await doc.transform(prune(), dedup(), reorder({ encoder: MeshoptEncoder }), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 78 }));
await io.write(dst, doc);
console.log(before, '->', tris(), 'tris', Math.round(fs.statSync(dst).size / 1024) + 'KB');
