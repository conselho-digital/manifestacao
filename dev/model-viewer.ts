// Ferramenta de desenvolvimento: mostra um GLB em 3 vistas. Uso: /dev/model-viewer.html?m=/models/weapons/shovel.glb
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const url = new URLSearchParams(location.search).get('m') ?? '/models/weapons/shovel.glb';
const W = 1500;
const H = 500;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb7d4);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556655, 1.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 5, 4);
scene.add(sun);
scene.add(new THREE.GridHelper(4, 16, 0x445566, 0x667788));

const gltf = await new GLTFLoader().loadAsync(url);
scene.add(gltf.scene);
const box = new THREE.Box3().setFromObject(gltf.scene);
const size = box.getSize(new THREE.Vector3());
const center = box.getCenter(new THREE.Vector3());
let tris = 0;
gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) tris += (m.geometry.index?.count ?? 0) / 3; });
console.log('tamanho', size.toArray().map((v) => v.toFixed(2)).join(' x '), 'triângulos', tris);
const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
const r = Math.max(size.x, size.y, size.z) * 1.9;
[[1, 0.3, 1], [0, 0.2, 1], [1, 0.1, 0]].forEach((d, i) => {
  const w = W / 3;
  renderer.setViewport(i * w, 0, w, H);
  renderer.setScissor(i * w, 0, w, H);
  cam.aspect = w / H;
  cam.updateProjectionMatrix();
  cam.position.copy(center).add(new THREE.Vector3(...d).normalize().multiplyScalar(r));
  cam.lookAt(center);
  renderer.render(scene, cam);
});
(window as unknown as { READY: boolean }).READY = true;
