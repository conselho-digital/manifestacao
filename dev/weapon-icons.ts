// Ferramenta de desenvolvimento: desenha cada arma de lado, com fundo transparente, para virar ícone do HUD.
// Uso: abrir /dev/weapon-icons.html e ler window.ICONS (dataURL por arma) — o script scratchpad/icons.js salva em public/hud/.
import * as THREE from 'three';
import { loadPistol, loadCricket, loadExtra, loadFlag, loadRifle, loadSign } from '../src/game/weapons';
import { EXTRA_MELEE_KEYS } from '../src/game/anim';
import { loadRifleKind } from '../src/game/weapons';

const W = 1024; // renderiza grande e recorta no objeto; o ícone final é OUT_W x OUT_H
const H = 512;
const OUT_W = 512;
const OUT_H = 256;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
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
  const url = crop(renderer.domElement);
  scene.remove(holder);
  return url;
}

/** Recorta o que foi desenhado (caixa dos pixels visíveis) e centraliza num ícone OUT_W x OUT_H, com 5% de margem. */
function crop(src: HTMLCanvasElement): string {
  const g = src.getContext('2d') ?? (() => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d')!.drawImage(src, 0, 0); return c.getContext('2d')!; })();
  const data = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3]! > 24) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const k = Math.min((OUT_W * 0.86) / w, (OUT_H * 0.86) / h);
  const out = document.createElement('canvas');
  out.width = OUT_W; out.height = OUT_H;
  const o = out.getContext('2d')!;
  o.imageSmoothingQuality = 'high';
  o.drawImage(src, x0, y0, w, h, (OUT_W - w * k) / 2, (OUT_H - h * k) / 2, w * k, h * k);
  return out.toDataURL('image/png');
}

const out: Record<string, string> = {};
const rifle = (await loadRifle()).clone(true);
rifle.traverse((o) => { if (o.name.toLowerCase().includes('gunflash')) o.visible = false; });
out.ak = fit(rifle, new THREE.Euler(0, 0, 0)); // o AK já vem deitado no eixo X
// pistola: o revólver Python .357 (cano em +X, de lado); gira um pouco para mostrar volume
const pistol = (await loadPistol()).clone(true);
pistol.rotation.y = -0.35;
out.pistol = fit(pistol, new THREE.Euler(0.08, 0, 0));
const flag = (await loadFlag()).clone(true);
out.bat = fit(flag, new THREE.Euler(0, 0, -Math.PI / 2 + 0.55)); // mastro (Y) deitado, bandeira para cima
const sign = (await loadSign()).clone(true);
sign.rotation.y = Math.PI / 2; // a placa vira de frente para a câmera
out.sign = fit(sign, new THREE.Euler(0, 0, -Math.PI / 2 + 0.55));
const cricket = (await loadCricket()).clone(true);
out.cricket = fit(cricket, new THREE.Euler(0, 0, -Math.PI / 2 + 0.5)); // taco deitado, lâmina para a direita
for (const k of EXTRA_MELEE_KEYS) out[k] = fit((await loadExtra(k)).clone(true), new THREE.Euler(0, 0, -Math.PI / 2 + (k === 'pipe' ? 0.55 : 0.3)));
for (const k of ['m4', 'm16', 'hb'] as const) out[k] = fit((await loadRifleKind(k)).clone(true), new THREE.Euler(0, 0, 0));
(window as unknown as { ICONS: Record<string, string> }).ICONS = out;
(window as unknown as { READY: boolean }).READY = true;
