import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildCustom, customOf, isCustomId } from './customChars';
import { buildRigged, RIGGED_NAMES } from './autoRig';

/** Personagens do jogo. Carlos e Law1 ficam só como base interna (Carlos: ferramentas de animação; Law1: esqueleto que os outros ganham em tempo de execução, ver autoRig.ts) e NÃO aparecem na seleção. */
export const CHARACTERS = [
  'Vini', 'Xandao', 'PF', 'Gang1', 'Gang2', 'Gang3', 'Gang4', 'MaiBrasil', 'MaiMexico',
  'Carlos', 'Law1',
] as const;
export type BuiltinName = (typeof CHARACTERS)[number];
/** personagem do jogo (`Vini`...) ou criado na ferramenta /personagens (`c_xxxx`, ver customChars.ts) */
export type CharacterName = BuiltinName | `c_${string}`;

/** Categorias da tela de seleção (um carrossel por categoria). Todo personagem da seleção aparece em exatamente uma. */
export const CATEGORIES: { title: string; names: BuiltinName[] }[] = [
  { title: 'Famosos', names: ['Vini', 'Xandao'] },
  { title: 'Polícia', names: ['PF'] },
  { title: 'Gangue', names: ['Gang1', 'Gang2', 'Gang3', 'Gang4'] },
  { title: 'Meninas', names: ['MaiBrasil', 'MaiMexico'] },
];
/** Personagens que SÓ a conta de administrador vê e escolhe (nem aparecem na seleção das outras contas). */
export const ADMIN_ONLY: ReadonlySet<string> = new Set<string>();
let charAdmin = import.meta.env.DEV && new URLSearchParams(location.search).has('admin'); // ?admin=1 só no npm run dev
const adminListeners = new Set<() => void>();
/** Chamado quando se descobre se a conta logada é administrador. */
export function setCharAdmin(a: boolean): void {
  if (a === charAdmin) return;
  charAdmin = a;
  adminListeners.forEach((f) => f());
}
export function onCharAdmin(f: () => void): () => void { adminListeners.add(f); return () => { adminListeners.delete(f); }; }
/** Esta conta pode escolher esse personagem? (a trava é do cliente, como o resto do jogo) */
export const canUseCharacter = (n: string): boolean => !ADMIN_ONLY.has(n) || charAdmin;

/** Os personagens que o jogador pode escolher (todos os das categorias). */
export const SELECTABLE: BuiltinName[] = CATEGORIES.flatMap((c) => c.names);

/** Nome mostrado na seleção. */
export const LABELS: Partial<Record<BuiltinName, string>> = {
  Vini: 'Vini Jr', Xandao: 'Xandão', PF: 'Polícia Federal', Gang1: 'Gangue 1', Gang2: 'Gangue 2', Gang3: 'Gangue 3', Gang4: 'Gangue 4',
  MaiBrasil: 'Mai Brasil', MaiMexico: 'Mai México',
};
export const labelOf = (n: CharacterName): string => (isCustomId(n) ? customOf(n)?.name ?? 'Personagem' : LABELS[n as BuiltinName] ?? n);

export const CHARACTER_HEIGHT = 1.8;

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // modelos comprimidos com meshopt (menos bytes)
const cache = new Map<string, Promise<THREE.Object3D>>();

/** Cena original (sem clonar) de um modelo de `public/models/characters`. */
export function loadBase(name: string): Promise<THREE.Object3D> {
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

/** Retorna um clone com altura de 1,8 m e origem nos pés. Os modelos sem esqueleto ganham o do Law1 (ver autoRig.ts) e animam como os outros. */
export async function createCharacter(name: CharacterName): Promise<THREE.Group> {
  if (isCustomId(name)) {
    const rec = customOf(name);
    if (rec) return buildCustom(rec.recipe);
    return createCharacter('Vini'); // personagem novo que não está na lista (ainda não carregou ou foi apagado)
  }
  const still = await createStatic(name);
  if (!RIGGED_NAMES.has(name)) return still;
  try { return await buildRigged(still, name); } catch (e) { console.warn('auto-rig falhou, usando o modelo parado', name, e); return still; }
}

/** O modelo como está no arquivo (1,8 m, pés no chão, olhando para +Z). */
async function createStatic(name: CharacterName): Promise<THREE.Group> {
  const source = await loadBase(name);
  const model = SkeletonUtils.clone(source);
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });

  // Modelos GTA SA (Law) olham para +X; gira para olhar para +Z (os personagens novos já saem do conversor olhando para +Z)
  if (name.startsWith('Law')) model.rotation.y = -Math.PI / 2;
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
