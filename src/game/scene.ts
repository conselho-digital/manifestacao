import * as THREE from 'three';
import { settings, type Quality } from './settings';

/** neblina: começa em FOG_NEAR m e cobre tudo em FOG_FAR; o que passa de FOG_FAR + folga nem é desenhado (câmera) */
export const FOG_COLOR = 0xe9eff5;
export const FOG_NEAR = 49; // 30% mais curta que os 70 m de antes
export const FOG_FAR = 161; // 30% mais curta que os 230 m de antes

const BLUR_KEY = 'arena:blur';
const BLUR_DEFAULT = 0.45;

/** Desfoque leve da imagem 3D (px). Vem de ?blur=N, do que o jogador salvou ou do padrão 0,45. */
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

/** Celular/tablet (toque): tela com muitos pixels e GPU fraca, então desenha com menos pixels e sem suavização de borda (o leve desfoque da imagem já suaviza). */
export const IS_TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
/** Resolução de desenho por qualidade: alta = PC 2x / toque 1,5x; média (padrão) = PC 1,5x / toque 1,25x; baixa = 1x (?pr=N força, para testar). */
const PR_CAP: Record<Quality, number> = { high: IS_TOUCH ? 1.5 : 2, medium: IS_TOUCH ? 1.25 : 1.5, low: 1 };
export function pixelRatio(): number {
  const q = Number(new URLSearchParams(location.search).get('pr'));
  const cap = Number.isFinite(q) && q > 0 ? Math.min(q, 3) : PR_CAP[settings.quality];
  return Math.min(window.devicePixelRatio, cap);
}

/** Sombras por qualidade: lado do mapa de sombra, meia-largura da área sombreada (m) e se há sombra. */
function shadowCfg(q: Quality): { size: number; half: number; on: boolean } {
  if (q === 'low') return { size: 512, half: 36, on: false };
  if (q === 'medium') return { size: 1024, half: 40, on: true };
  return { size: IS_TOUCH ? 1024 : 2048, half: 45, on: true };
}

/** Aplica a qualidade escolhida (resolução e sombras). Chamada ao criar a cena e quando o jogador troca a opção. */
export function applyQuality(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
  const sun = scene.userData.sun as THREE.DirectionalLight | undefined;
  if (sun) {
    const c = shadowCfg(settings.quality);
    if (sun.shadow.mapSize.x !== c.size) { sun.shadow.map?.dispose(); sun.shadow.map = null; sun.shadow.mapSize.set(c.size, c.size); }
    const cam = sun.shadow.camera;
    cam.left = -c.half; cam.right = c.half; cam.top = c.half; cam.bottom = -c.half;
    cam.updateProjectionMatrix();
    sun.castShadow = c.on;
    renderer.shadowMap.needsUpdate = true;
  }
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
}

export function createRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio());
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
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR); // neblina branca bem fraca: some o que está longe

  scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.0));

  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(15, 25, 10);
  const sc = shadowCfg(settings.quality);
  sun.castShadow = sc.on;
  sun.shadow.mapSize.set(sc.size, sc.size);
  const cam = sun.shadow.camera;
  cam.left = -sc.half; cam.right = sc.half; cam.top = sc.half; cam.bottom = -sc.half;
  cam.near = 1; cam.far = 160;
  scene.add(sun, sun.target);
  scene.userData.sun = sun; // o main faz o sol (e as sombras) seguirem o jogador

  return scene;
}

export function createCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, FOG_FAR + 30);
  camera.position.set(0, 18, 24);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function handleResize(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
