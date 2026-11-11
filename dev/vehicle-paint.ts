// Ferramenta de desenvolvimento: mostra um veículo com cada material numa cor diferente (para escolher o que vira tinta da equipe).
// Uso: /dev/vehicle-paint.html?m=blistac  ->  window.LEGEND = [{i, tris, name, hex}]
import * as THREE from 'three';
import { loadModel, buildCarVisual } from '../src/game/vehicle';

const params = new URLSearchParams(location.search);
const model = params.get('m') ?? 'blistac';
const W = 1200, H = 560;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x777f88);
scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
const src = await loadModel(model);
const v = buildCarVisual(src, 0xffffff);
const mats: THREE.Material[] = [];
const tris = new Map<THREE.Material, number>();
v.group.traverse((o) => {
  const m = o as THREE.Mesh;
  if (!m.isMesh) return;
  const list = Array.isArray(m.material) ? m.material : [m.material];
  for (const mat of list) if (!mats.includes(mat)) mats.push(mat);
  const idx = m.geometry.index;
  if (Array.isArray(m.material)) m.geometry.groups.forEach((g) => { const mm = m.material[g.materialIndex ?? 0]; tris.set(mm, (tris.get(mm) ?? 0) + g.count / 3); });
  else tris.set(m.material, (tris.get(m.material) ?? 0) + (idx ? idx.count : m.geometry.attributes.position.count) / 3);
});
const legend: { i: number; tris: number; name: string; hex: string }[] = [];
mats.forEach((mat, i) => {
  const c = new THREE.Color().setHSL((i * 0.137) % 1, 0.85, i % 2 ? 0.5 : 0.62);
  const nm = new THREE.MeshBasicMaterial({ color: c });
  legend.push({ i, tris: Math.round(tris.get(mat) ?? 0), name: mat.name, hex: '#' + c.getHexString() });
  v.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (Array.isArray(m.material)) m.material = m.material.map((x) => (x === mat ? nm : x));
    else if (m.material === mat) m.material = nm;
  });
});
scene.add(v.group);
const box = new THREE.Box3().setFromObject(v.group);
const c = box.getCenter(new THREE.Vector3());
const s = box.getSize(new THREE.Vector3());
const cam = new THREE.PerspectiveCamera(30, 0.5 * W / H, 0.1, 100);
const d = Math.max(s.x, s.y, s.z) * 2.1;
renderer.setScissorTest(true);
const views: [number, number, number][] = [[0.8, 0.45, 0.8], [-0.8, 0.45, -0.8]];
views.forEach((vw, k) => {
  renderer.setViewport(k * W / 2, 0, W / 2, H);
  renderer.setScissor(k * W / 2, 0, W / 2, H);
  cam.position.set(c.x + vw[0] * d, c.y + vw[1] * d * 0.7, c.z + vw[2] * d);
  cam.lookAt(c);
  renderer.render(scene, cam);
});
(window as unknown as { LEGEND: typeof legend }).LEGEND = legend;
(window as unknown as { READY: boolean }).READY = true;
