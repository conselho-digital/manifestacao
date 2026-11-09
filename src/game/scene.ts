import * as THREE from 'three';

const BLUR_KEY = 'arena:blur';
const BLUR_DEFAULT = 0.5;

/** Desfoque leve da imagem 3D (px). Vem de ?blur=N, do que o jogador salvou ou do padrão 0,5. */
export function getBlur(): number {
  const params = new URLSearchParams(location.search);
  if (params.has('blur')) { const q = Number(params.get('blur')); if (Number.isFinite(q)) return Math.min(Math.max(q, 0), 3); }
  try { const v = Number(localStorage.getItem(BLUR_KEY)); if (localStorage.getItem(BLUR_KEY) !== null && Number.isFinite(v)) return Math.min(Math.max(v, 0), 3); } catch { /* sem armazenamento */ }
  return BLUR_DEFAULT;
}

export function applyBlur(canvas: HTMLCanvasElement, px: number, save = false): void {
  canvas.style.filter = px > 0 ? `blur(${px}px)` : '';
  canvas.style.transform = px > 0 ? 'scale(1.004)' : ''; // esconde a borda translúcida do desfoque
  if (save) { try { localStorage.setItem(BLUR_KEY, String(px)); } catch { /* sem armazenamento */ } }
}

export function createRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  applyBlur(renderer.domElement, getBlur());
  document.body.appendChild(renderer.domElement);
  return renderer;
}

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b8e8);
  scene.fog = new THREE.Fog(0x87b8e8, 110, 330);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.0));

  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(15, 25, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -45; cam.right = 45; cam.top = 45; cam.bottom = -45;
  cam.near = 1; cam.far = 160;
  scene.add(sun, sun.target);
  scene.userData.sun = sun; // o main faz o sol (e as sombras) seguirem o jogador

  return scene;
}

export function createCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);
  camera.position.set(0, 18, 24);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function handleResize(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
