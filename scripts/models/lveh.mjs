import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const ROOT = '/home/user/manifestacao/';
const HQ = ROOT + 'assets-src/vehicles-hq/';
// [arquivo, triângulos alvo, erro máximo, textura máxima]
const JOBS = JSON.parse(process.argv[2]);
const tris = (doc) => { let t = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? 0) / 3; return t; };
for (const [f, target, err, tex] of JOBS) {
  const src = ROOT + 'public/models/' + f;
  const hq = HQ + f.replace('/', '_');
  if (!fs.existsSync(hq)) fs.copyFileSync(src, hq); // original guardado
  const doc = await io.read(hq);
  const before = tris(doc);
  const steps = [weld()];
  if (before > target * 1.05) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: target / before, error: err, lockBorder: process.env.LB === '1' }));
  steps.push(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 78 }));
  await doc.transform(...steps);
  await io.write(src, doc);
  console.log(f.padEnd(20), before, '->', tris(doc), 'tris', Math.round(fs.statSync(hq).size / 1024) + 'KB ->', Math.round(fs.statSync(src).size / 1024) + 'KB');
}
