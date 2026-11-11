// Descarte por distância (além do descarte da câmera, que o Three.js já faz por objeto): o que está longe demais não é desenhado.
// Os blocos de árvores e os veículos são objetos separados, então cada um pode ser escondido sozinho. Os prédios são poucos
// triângulos fundidos em poucas malhas, então o gasto está nos carros e nas árvores (ver CLAUDE.md, seção de desempenho).
import * as THREE from 'three';
import { CARS, TRAFFIC } from './vehicle';

/** distâncias (m) a partir do jogador: além disso a neblina já quase cobre e o objeto some */
export const FAR_VEHICLES = 150;
export const FAR_TREES = 170;

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
  for (const it of items) it.obj.visible = Math.hypot(it.x - px, it.z - pz) - it.r < it.far;
  for (const c of CARS) c.root.visible = Math.hypot(c.x - px, c.z - pz) < FAR_VEHICLES;
  for (const t of TRAFFIC) t.obj.visible = Math.hypot(t.obj.position.x - px, t.obj.position.z - pz) < FAR_VEHICLES;
}
