// Ferramenta de desenvolvimento: desenha cada veículo em vista 3/4, fundo transparente, para a Garagem e a Loja.
// Uso: abrir /dev/vehicle-icons.html e ler window.ICONS (dataURL por modelo) — o script scratchpad/vicons.js salva em public/hud/v-<modelo>.png.
import * as THREE from 'three';
import { BIKE_MODELS, buildCarVisual, CAR_MODELS, loadModel, POLICE_MODEL, VEHICLE_COLOR } from '../src/game/vehicle';

const W = 256;
const H = 128;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.position.set(3, 5, 4);
scene.add(sun);
const cam = new THREE.PerspectiveCamera(24, W / H, 0.1, 100);

// cores neutras (prata e preto): na Garagem o veículo usa as cores da equipe de quem o chama
const LOOK = new URLSearchParams(location.search).has('team') ? { c1: '#009c3b', c2: '#ffdf00' } : { c1: '#c8ccd2', c2: '#2b2e33' };
const out: Record<string, string> = {};
for (const m of [...CAR_MODELS, POLICE_MODEL, ...BIKE_MODELS]) {
  const bike = (BIKE_MODELS as readonly string[]).includes(m);
  const v = buildCarVisual(await loadModel(m), VEHICLE_COLOR[m] ?? 0xffffff, LOOK, bike, m).group;
  const holder = new THREE.Group();
  holder.add(v);
  holder.rotation.y = -0.75; // vista 3/4 da frente
  scene.add(holder);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const c = box.getCenter(new THREE.Vector3());
  const r = box.getSize(new THREE.Vector3()).length() / 2;
  const dist = (r / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2))) * 0.5;
  cam.position.set(c.x + dist * 0.15, c.y + dist * 0.28, c.z + dist);
  cam.lookAt(c);
  renderer.render(scene, cam);
  out[m] = renderer.domElement.toDataURL('image/png');
  scene.remove(holder);
}
(window as unknown as { ICONS: Record<string, string> }).ICONS = out;
(window as unknown as { READY: boolean }).READY = true;
