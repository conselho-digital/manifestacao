// Ferramenta de desenvolvimento: tira a "foto do rosto" de cada personagem (renderizada do próprio modelo).
// Abrir /dev/face-shots.html e ler window.FACES (dataURL webp por personagem); scratchpad/faces.js salva em public/faces/.
import * as THREE from 'three';
import { CHARACTERS, createCharacter, CHARACTER_HEIGHT } from '../src/game/characters';

const S = 256;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(S, S);
renderer.setPixelRatio(1);
renderer.setClearColor(0x41506b);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a94a8, 2.0));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(1.5, 2.5, 4);
scene.add(key);
const cam = new THREE.PerspectiveCamera(20, 1, 0.1, 20);

const out: Record<string, string> = {};
for (const name of CHARACTERS) {
  const obj = await createCharacter(name);
  scene.add(obj);
  obj.updateMatrixWorld(true);
  // o modelo tem 1,8 m e os pés no chão: a cabeça fica no topo (rosto ~ 10 cm abaixo do alto)
  const top = CHARACTER_HEIGHT;
  const cy = top - 0.115;
  cam.position.set(0, cy + 0.01, 1.25);
  cam.lookAt(0, cy, 0);
  renderer.render(scene, cam);
  out[name] = renderer.domElement.toDataURL('image/webp', 0.86);
  scene.remove(obj);
}
(window as unknown as { FACES: Record<string, string> }).FACES = out;
(window as unknown as { READY: boolean }).READY = true;
