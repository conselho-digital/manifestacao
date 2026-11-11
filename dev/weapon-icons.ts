// Ferramenta de desenvolvimento: desenha cada arma de lado, com fundo transparente, para virar ícone do HUD.
// Uso: abrir /dev/weapon-icons.html e ler window.ICONS (dataURL por arma) — o script scratchpad/icons.js salva em public/hud/.
import * as THREE from 'three';
import { buildPistol, loadBaseball, loadCricket, loadExtra, loadFlag, loadRifle, loadSign } from '../src/game/weapons';
import { EXTRA_MELEE_KEYS } from '../src/game/anim';

const W = 256;
const H = 128;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(2, 4, 5);
scene.add(sun);
const cam = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0.01, 20);
cam.position.set(0, 0, 5);
cam.lookAt(0, 0, 0);

/** Enquadra o objeto visto de lado (eixo maior na horizontal), com margem. */
function fit(obj: THREE.Object3D, rot: THREE.Euler): string {
  const holder = new THREE.Group();
  holder.add(obj);
  holder.rotation.copy(rot);
  scene.add(holder);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  holder.position.sub(center);
  const s = Math.max(size.x / (W / H), size.y) * 0.56;
  cam.left = -s * (W / H); cam.right = s * (W / H); cam.top = s; cam.bottom = -s;
  cam.updateProjectionMatrix();
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(holder);
  return url;
}

const out: Record<string, string> = {};
const rifle = (await loadRifle()).clone(true);
rifle.traverse((o) => { if (o.name.toLowerCase().includes('gunflash')) o.visible = false; });
out.ak = fit(rifle, new THREE.Euler(0, 0, 0)); // o AK já vem deitado no eixo X
const pistol = buildPistol();
pistol.rotation.y = -Math.PI / 2 + 0.45; // cano (+Z) vira para a esquerda, com um pouco de volume
out.pistol = fit(pistol, new THREE.Euler(0.25, 0, 0));
const flag = (await loadFlag()).clone(true);
out.bat = fit(flag, new THREE.Euler(0, 0, -Math.PI / 2 + 0.35)); // mastro (Y) deitado, bandeira para cima
const sign = (await loadSign()).clone(true);
sign.rotation.y = Math.PI / 2; // a placa vira de frente para a câmera
out.sign = fit(sign, new THREE.Euler(0, 0, -Math.PI / 2 + 0.25));
const cricket = (await loadCricket()).clone(true);
out.cricket = fit(cricket, new THREE.Euler(0, 0, -Math.PI / 2 + 0.3)); // taco deitado, lâmina para a direita
const baseball = (await loadBaseball()).clone(true);
out.baseball = fit(baseball, new THREE.Euler(0, 0, -Math.PI / 2 + 0.3));
for (const k of EXTRA_MELEE_KEYS) out[k] = fit((await loadExtra(k)).clone(true), new THREE.Euler(0, 0, -Math.PI / 2 + 0.3));
(window as unknown as { ICONS: Record<string, string> }).ICONS = out;
(window as unknown as { READY: boolean }).READY = true;
