import * as THREE from 'three';
import { BIKE_MODELS, buildCarVisual, loadModel } from '../game/vehicle';

// Pré-visualização do veículo numa cor escolhida (Garagem): desenha o modelo de verdade, em vista 3/4 e fundo transparente,
// com o mesmo método de `dev/vehicle-icons.ts` (que gera as fotos padrão). Cada modelo+cor é desenhado uma vez só.
const W = 384;
const H = 192;
const cache = new Map<string, Promise<string>>();
let ctx: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera } | null = null;

function getCtx(): NonNullable<typeof ctx> {
  if (ctx) return ctx;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  ctx = { renderer, scene, cam: new THREE.PerspectiveCamera(24, W / H, 0.1, 100) };
  return ctx;
}

/** Imagem (dataURL) do veículo `model` pintado com `color`. */
export function vehiclePreview(model: string, color: number): Promise<string> {
  const key = `${model}:${color}`;
  let p = cache.get(key);
  if (!p) {
    p = loadModel(model).then((src) => {
      const { renderer, scene, cam } = getCtx();
      const bike = (BIKE_MODELS as readonly string[]).includes(model);
      const holder = new THREE.Group();
      holder.add(buildCarVisual(src, color, { c1: '#c8ccd2', c2: '#2b2e33' }, bike, model).group);
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
      const url = renderer.domElement.toDataURL('image/png');
      scene.remove(holder);
      return url;
    });
    cache.set(key, p);
  }
  return p;
}
