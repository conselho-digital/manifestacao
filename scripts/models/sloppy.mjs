import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, prune, dedup, textureCompress, reorder } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [src, dst, target, tex] = [process.argv[2], process.argv[3], Number(process.argv[4]), Number(process.argv[5] || 512)];
const doc = await io.read(src);
await doc.transform(weld());
const tris = () => { let t = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) t += p.getIndices().getCount() / 3; return t; };
const before = tris();
const k = target / before;
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
  const idx = p.getIndices(); const n = idx.getCount() / 3;
  const want = Math.max(24, Math.round(n * k)) * 3;
  if (want >= idx.getCount()) continue;
  const pa = p.getAttribute('POSITION'); const pos = new Float32Array(pa.getCount() * 3); const tmp = [0, 0, 0]; for (let i = 0; i < pa.getCount(); i++) { pa.getElement(i, tmp); pos.set(tmp, i * 3); }
  const [out] = MeshoptSimplifier.simplifySloppy(idx.getArray(), pos, 3, null, want, 0.2);
  idx.setArray(new Uint32Array(out));
}
await doc.transform(prune(), dedup(), reorder({ encoder: MeshoptEncoder }), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 78 }));
await io.write(dst, doc);
console.log(before, '->', tris(), 'tris', Math.round(fs.statSync(dst).size / 1024) + 'KB');
