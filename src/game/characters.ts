import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export const CHARACTERS = [
  'Helena', 'Stewart', 'Bennyse', 'Amanda', 'Garota1', 'Carlos', 'Gordao', 'Cesar',
  'Akiyama',
  'Law1', 'Law2', 'Law3', 'Law4', 'Law5', 'Law6', 'Law7', 'Law8', 'Law9',
] as const;
export type CharacterName = (typeof CHARACTERS)[number];

/** Categorias da tela de seleção (um carrossel por categoria). Todo personagem aparece em exatamente uma. */
export const CATEGORIES: { title: string; names: CharacterName[] }[] = [
  { title: 'Rua', names: ['Carlos', 'Cesar', 'Gordao', 'Garota1', 'Amanda'] },
  { title: 'Civis', names: ['Akiyama', 'Helena', 'Stewart', 'Bennyse'] },
  { title: 'Polícia', names: ['Law1', 'Law2', 'Law3', 'Law4', 'Law6', 'Law7'] },
  { title: 'Forças especiais', names: ['Law5', 'Law8', 'Law9'] },
];

/** Nome mostrado na seleção (os modelos Law não têm nome próprio). */
export const LABELS: Partial<Record<CharacterName, string>> = {
  Garota1: 'Garota', Law1: 'Policial', Law2: 'Delegado', Law3: 'Patrulheiro', Law4: 'Oficial',
  Law5: 'Agente', Law6: 'Xerife', Law7: 'Xerife 2', Law8: 'Tático', Law9: 'Soldado',
};
export const labelOf = (n: CharacterName): string => LABELS[n] ?? n;

export const CHARACTER_HEIGHT = 1.8;

const loader = new GLTFLoader();
const cache = new Map<CharacterName, Promise<THREE.Object3D>>();

function load(name: CharacterName): Promise<THREE.Object3D> {
  let p = cache.get(name);
  if (!p) {
    p = loader.loadAsync(`/models/characters/${name}.glb`).then((gltf) => gltf.scene);
    cache.set(name, p);
  }
  return p;
}

/** Mede a caixa real, considerando ossos (SkinnedMesh). */
function measure(model: THREE.Object3D, out = new THREE.Box3()): THREE.Box3 {
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.update();
  });
  return out.setFromObject(model, true);
}

/** Retorna um clone com altura de 1,8 m e origem nos pés. */
export async function createCharacter(name: CharacterName): Promise<THREE.Group> {
  const source = await load(name);
  const model = SkeletonUtils.clone(source);
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });

  // Modelos GTA SA (Law) olham para +X; gira para olhar para +Z
  if (name.startsWith('Law')) model.rotation.y = -Math.PI / 2;
  if (name === 'Akiyama') model.rotation.y = Math.PI; // o modelo olha para -Z
  const box = measure(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = CHARACTER_HEIGHT / size.y;
  model.scale.multiplyScalar(scale);
  measure(model, box);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  const root = new THREE.Group();
  root.add(model);
  return root;
}
