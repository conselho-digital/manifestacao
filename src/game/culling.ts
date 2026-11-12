// Descarte por distância (além do descarte da câmera, que o Three.js já faz por objeto): o que está longe demais não é desenhado.
// Os blocos de árvores e os veículos são objetos separados, então cada um pode ser escondido sozinho. Os prédios são poucos
// triângulos fundidos em poucas malhas, então o gasto está nos carros e nas árvores (ver CLAUDE.md, seção de desempenho).
import * as THREE from 'three';
import { CARS, TRAFFIC } from './vehicle';

/** distâncias (m) a partir do jogador: além disso a neblina já quase cobre e o objeto some */
export const FAR_VEHICLES = 190;
export const FAR_TREES = 220;

/** além destas distâncias (m) o objeto continua aparecendo, mas não projeta sombra (a sombra só cobre ~45 m em volta do jogador) */
const SHADOW_TREES = 55;
const SHADOW_CARS = 40;

interface Item { obj: THREE.Object3D; x: number; z: number; r: number; far: number }
const items: Item[] = [];

/** Registra um objeto estático (centro e raio medidos agora) para ser escondido além de `far` m. */
export function registerCull(obj: THREE.Object3D, far: number): void {
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  items.push({ obj, x: sphere.center.x, z: sphere.center.z, r: sphere.radius, far });
}

/** Registra cada filho de um grupo (os blocos de árvores). */
export function registerCullChildren(group: THREE.Object3D, far: number): void {
  group.updateMatrixWorld(true);
  for (const c of group.children) registerCull(c, far);
}

/** Atualiza o que aparece (chamar algumas vezes por segundo, não todo quadro). */
export function updateCulling(px: number, pz: number): void {
  for (const it of items) {
    const d = Math.hypot(it.x - px, it.z - pz) - it.r;
    it.obj.visible = d < it.far;
    setShadow(it.obj, d < SHADOW_TREES, true);
  }
  for (const c of CARS) { const d = Math.hypot(c.x - px, c.z - pz); c.root.visible = d < FAR_VEHICLES; setShadow(c.root, d < SHADOW_CARS, false); }
  for (const t of TRAFFIC) { const d = Math.hypot(t.obj.position.x - px, t.obj.position.z - pz); t.obj.visible = d < FAR_VEHICLES; setShadow(t.obj, d < SHADOW_CARS, false); }
}

const shadowOff = new WeakMap<THREE.Mesh, boolean>(); // malhas que não projetam sombra por natureza (não ligar de novo)

/** Liga/desliga a sombra de todas as malhas do objeto sem perder quais eram só "sem sombra" desde o início. Arbustos (`skipBush`) nunca projetam. */
function setShadow(obj: THREE.Object3D, on: boolean, skipBush: boolean): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!shadowOff.has(m)) shadowOff.set(m, !m.castShadow);
    if (shadowOff.get(m)) return;
    const bush = skipBush && (m as THREE.InstancedMesh).isInstancedMesh && (m.material as THREE.Material).name === 'bush';
    m.castShadow = on && !bush;
  });
}
