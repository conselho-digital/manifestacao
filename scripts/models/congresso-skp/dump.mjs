import fs from 'fs';
import { buildScene } from 'openskp';
const scene = buildScene(fs.readFileSync(process.argv[2]));
const P = scene.glbPrimitives, M = scene.gltfMaterials;
const drop = new Set([214,215,216,217]);
const out = [];
P.forEach((p, i) => {
  if (drop.has(i) || p.indices.length / 3 === 96) return;
  const m = M[p.materialIndex]?.pbrMetallicRoughness ?? {};
  out.push({ i, pos: Array.from(p.positions), uv: Array.from(p.uvs ?? []), idx: Array.from(p.indices), color: m.baseColorFactor ?? null, tex: m.baseColorTexture?.index ?? null });
});
fs.writeFileSync('dump/prims.json', JSON.stringify(out));
scene.textures.forEach((t, k) => fs.writeFileSync(`dump/tex${k}.jpg`, Buffer.from(t.data)));
console.log('prims', out.length, 'colors sample', out.filter(o => o.tex === null).slice(0, 5).map(o => o.color));
