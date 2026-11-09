import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export const CHARACTERS = [
  'Helena', 'Stewart', 'Bennyse', 'Amanda', 'Garota1', 'Carlos', 'Gordao', 'Cesar',
] as const;
export type CharacterName = (typeof CHARACTERS)[number];

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
