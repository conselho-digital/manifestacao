// Ferramenta de desenvolvimento: vista lateral de uma arma longa com grade de 5 cm (para medir empunhadura e guarda-mão).
// Uso: /dev/gun-grid.html?f=m4a1.glb  (o comprimento deve estar no eixo X do GLB, como nos GLB do AK-47 e da M4)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const f = new URLSearchParams(location.search).get('f') ?? 'm4a1.glb';
const W = 1600, H = 560;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x58626f);
scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.4));
const g = (await new GLTFLoader().loadAsync('/models/weapons/' + f)).scene;
scene.add(g);
const box = new THREE.Box3().setFromObject(g);
const size = box.getSize(new THREE.Vector3());
const c = box.getCenter(new THREE.Vector3());
const half = Math.max(size.x, size.y * (W / H)) * 0.58;
const cam = new THREE.OrthographicCamera(c.x - half, c.x + half, c.y + half * H / W, c.y - half * H / W, 0.01, 20);
cam.position.set(c.x, c.y, 5);
cam.lookAt(c.x, c.y, 0);
// grade: linha a cada 5 cm (mais forte a cada 10 cm)
const pts: number[] = [];
const cols: number[] = [];
const col = (strong: boolean): number[] => (strong ? [1, 0.9, 0.2] : [0.45, 0.8, 1]);
for (let x = Math.floor((c.x - half) / 0.05) * 0.05; x < c.x + half; x += 0.05) {
  const s = Math.abs(Math.round(x * 10) / 10 - x) < 1e-6;
  pts.push(x, c.y - half, 1, x, c.y + half, 1); cols.push(...col(s), ...col(s));
}
for (let y = Math.floor((c.y - half) / 0.05) * 0.05; y < c.y + half; y += 0.05) {
  const s = Math.abs(Math.round(y * 10) / 10 - y) < 1e-6;
  pts.push(c.x - half, y, 1, c.x + half, y, 1); cols.push(...col(s), ...col(s));
}
const lg = new THREE.BufferGeometry();
lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
lg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthTest: false })));
renderer.render(scene, cam);
(window as unknown as { INFO: unknown }).INFO = { size: size.toArray(), min: box.min.toArray(), max: box.max.toArray(), left: c.x - half, right: c.x + half, top: c.y + half * H / W, bottom: c.y - half * H / W };
(window as unknown as { READY: boolean }).READY = true;
