// Ferramenta de desenvolvimento: mostra várias armas lado a lado (comprimento = eixo Y do GLB) para revisão.
// Uso: /dev/pack-view.html?f=a.glb,b.glb  (arquivos em /models/weapons/)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const files = (new URLSearchParams(location.search).get('f') ?? '').split(',').filter(Boolean);
const W = 1800, H = 420;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6c7a8c);
scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(2, 3, 4);
scene.add(sun);
const loader = new GLTFLoader();
const info: Record<string, unknown>[] = [];
const cam = new THREE.PerspectiveCamera(25, (W / files.length) / H, 0.01, 50);
for (const [i, f] of files.entries()) {
  const g = (await loader.loadAsync('/models/weapons/' + f)).scene;
  const holder = new THREE.Group();
  holder.add(g);
  scene.add(holder);
  const box = new THREE.Box3().setFromObject(holder);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  info.push({ f, size: s.toArray().map((x) => +x.toFixed(2)), min: box.min.toArray().map((x) => +x.toFixed(2)), max: box.max.toArray().map((x) => +x.toFixed(2)) });
  renderer.setViewport(i * W / files.length, 0, W / files.length, H);
  renderer.setScissor(i * W / files.length, 0, W / files.length, H);
  const d = Math.max(s.x, s.y, s.z) * 2.6;
  cam.position.set(c.x + d * 0.45, c.y + d * 0.1, c.z + d * 0.9);
  cam.lookAt(c);
  renderer.render(scene, cam);
  scene.remove(holder);
}
(window as unknown as { INFO: typeof info }).INFO = info;
(window as unknown as { READY: boolean }).READY = true;
