// Ferramenta de desenvolvimento: foto do rosto de UM personagem com enquadramento/luz ajustáveis (?c=Vini&cy=1.69&d=1.0&fov=20&s=512).
import * as THREE from 'three';
import { createCharacter, CHARACTER_HEIGHT, type BuiltinName } from '../src/game/characters';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number): number => (q.has(k) ? Number(q.get(k)) : d);
const S = num('s', 512);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(S, S);
renderer.setPixelRatio(1);
renderer.setClearColor(0x41506b);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a94a8, num('hemi', 2.0)));
const key = new THREE.DirectionalLight(0xffffff, num('key', 1.2));
key.position.set(1.5, 2.5, 4);
scene.add(key);
const cam = new THREE.PerspectiveCamera(num('fov', 20), 1, 0.1, 20);
const obj = await createCharacter((q.get('c') ?? 'Vini') as BuiltinName);
obj.rotation.y = (num('yaw', 0) * Math.PI) / 180;
scene.add(obj);
obj.updateMatrixWorld(true);
const cy = num('cy', CHARACTER_HEIGHT - 0.115);
const d = num('d', 1.25);
cam.position.set(num('cx', 0), cy + num('up', 0.01), d);
cam.lookAt(0, cy, 0);
renderer.render(scene, cam);
(window as unknown as { URL64: string }).URL64 = renderer.domElement.toDataURL('image/webp', 0.9);
(window as unknown as { READY: boolean }).READY = true;
