import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Box3, Color, InstancedMesh, Matrix4, Mesh, Quaternion, Sphere, Vector3 } from "three";
import { ModelBoundary } from "./ModelBoundary.js";
import { clearCameraColliders, setCameraColliders } from "./colliders.js";
import { useGLTF } from "@react-three/drei";
import { AVENUE_LENGTH, AVENUE_WIDTH, PARK_GAP, PARK_SIZE } from "./world.js";

const MASP_URL = "/models/scenery/masp.glb";
// Modelo original (Sketchfab, exportado de FBX) vem em unidades arbitrárias
// bem maiores que a cena (~1500x466x524). Escala medida via bounding box
// (GLTFLoader + Box3) para a altura final ficar ~14 unidades — na mesma
// faixa dos prédios-placeholder anteriores (8-24). Y compensa o pivô do
// modelo (base ~139.67 unidades abaixo da origem local) para encostar no chão.
const MASP_SCALE = 0.03;
const MASP_Y_OFFSET = 4.19;

/**
 * Prédio de cenário carregado de um glTF (CC0 — ver CREDITS.md). Habilita
 * sombra em cada malha do modelo, já que o glTF não vem com essas flags.
 */
function SceneryBuilding({
  url,
  position,
  rotation = 0,
  scale = 1,
}: {
  url: string;
  position: [number, number, number];
  rotation?: number;
  scale?: number;
}) {
  const { scene } = useGLTF(url);

  useEffect(() => {
    scene.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    // Caixa envolvente do prédio: a câmera de terceira pessoa não o atravessa.
    scene.updateMatrixWorld(true);
    // Recorta o que invade a avenida: o jogador anda até a borda dela, e a
    // câmera dele não pode "nascer" dentro da caixa.
    const box = new Box3().setFromObject(scene);
    box.min.z = Math.max(box.min.z, AVENUE_WIDTH / 2 + 1);
    setCameraColliders(`building:${url}`, [], [box]);
    return () => clearCameraColliders(`building:${url}`);
  }, [scene, url]);

  return (
    <primitive object={scene} position={position} rotation={[0, rotation, 0]} scale={scale} />
  );
}

useGLTF.preload(MASP_URL);

// ── Parque arborizado (inspirado no Trianon): do outro lado da avenida em
// relação ao MASP. Coordenadas locais: x lateral, d = distância a partir da
// calçada (d=0 encosta na avenida, cresce afastando-se dela).
const PARK_Z0 = -(AVENUE_WIDTH / 2 + PARK_GAP); // z do lado do parque que encosta na calçada
const PATH_W = 3;
/** Árvores 25% mais altas (só no eixo Y — a largura não muda). */
const TREE_HEIGHT_SCALE = 1.25;

interface PathRect {
  x: number; // centro lateral
  d: number; // centro em profundidade
  w: number; // largura (x)
  h: number; // comprimento (d)
}

/** Alamedas de pedestre — eixo central, travessas e um anel, como no mapa de referência. */
const PARK_PATHS: PathRect[] = [
  { x: 0, d: PARK_SIZE / 2, w: PATH_W, h: PARK_SIZE }, // eixo central
  { x: 0, d: 20, w: PARK_SIZE, h: PATH_W }, // travessa baixa
  { x: 0, d: 46, w: PARK_SIZE * 0.75, h: PATH_W }, // travessa alta
  { x: -20, d: 38, w: PATH_W, h: 28 }, // anel: lado esquerdo
  { x: 20, d: 38, w: PATH_W, h: 28 }, // anel: lado direito
];

function nearPath(x: number, d: number, margin: number): boolean {
  return PARK_PATHS.some(
    (r) => Math.abs(x - r.x) < r.w / 2 + margin && Math.abs(d - r.d) < r.h / 2 + margin,
  );
}

/** PRNG determinístico — as árvores ficam no mesmo lugar para todos os jogadores. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TreeSpec {
  x: number;
  z: number;
  scale: number;
  hue: number;
}

function buildTrees(): TreeSpec[] {
  const rand = mulberry32(1905);
  const out: TreeSpec[] = [];
  const step = 4.2;
  for (let d = step / 2; d < PARK_SIZE; d += step) {
    for (let x = -PARK_SIZE / 2 + step / 2; x < PARK_SIZE / 2; x += step) {
      const jx = x + (rand() - 0.5) * 2.2;
      const jd = d + (rand() - 0.5) * 2.2;
      if (nearPath(jx, jd, 1.8)) continue;
      out.push({ x: jx, z: PARK_Z0 - jd, scale: 0.8 + rand() * 0.7, hue: rand() });
    }
  }
  return out;
}

/** Quadrado arborizado: gramado, alamedas e árvores low-poly instanciadas. */
function Park() {
  const trees = useMemo(buildTrees, []);
  const trunks = useRef<InstancedMesh>(null);
  const crowns = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!trunks.current || !crowns.current) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const color = new Color();
    const colliders: Sphere[] = [];
    trees.forEach((t, i) => {
      const h = t.scale * TREE_HEIGHT_SCALE;
      const size = new Vector3(t.scale, h, t.scale);
      m.compose(new Vector3(t.x, 1 * h, t.z), q, size);
      trunks.current!.setMatrixAt(i, m);
      m.compose(new Vector3(t.x, 3.4 * h, t.z), q, size);
      crowns.current!.setMatrixAt(i, m);
      colliders.push(new Sphere(new Vector3(t.x, 3.4 * h, t.z), 1.6 * t.scale));
      crowns.current!.setColorAt(i, color.setHSL(0.3 + t.hue * 0.06, 0.55, 0.2 + t.hue * 0.12));
    });
    trunks.current.instanceMatrix.needsUpdate = true;
    crowns.current.instanceMatrix.needsUpdate = true;
    if (crowns.current.instanceColor) crowns.current.instanceColor.needsUpdate = true;
    // Copas como esferas: a câmera de terceira pessoa não as atravessa.
    setCameraColliders("park-trees", colliders);
    return () => clearCameraColliders("park-trees");
  }, [trees]);

  const centerZ = PARK_Z0 - PARK_SIZE / 2;

  return (
    <group>
      {/* Calçada entre a avenida e o parque */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, -(AVENUE_WIDTH / 2 + PARK_GAP / 2)]} receiveShadow>
        <planeGeometry args={[PARK_SIZE + 8, PARK_GAP]} />
        <meshStandardMaterial color={0x5a6068} />
      </mesh>
      {/* Gramado */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, centerZ]} receiveShadow>
        <planeGeometry args={[PARK_SIZE, PARK_SIZE]} />
        <meshStandardMaterial color={0x2f5d34} />
      </mesh>
      {/* Alamedas */}
      {PARK_PATHS.map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[r.x, 0.02, PARK_Z0 - r.d]} receiveShadow>
          <planeGeometry args={[r.w, r.h]} />
          <meshStandardMaterial color={0x9a9486} />
        </mesh>
      ))}
      {/* Árvores: troncos e copas instanciados (2 draw calls no total) */}
      <instancedMesh ref={trunks} frustumCulled={false} args={[undefined, undefined, trees.length]}>
        <cylinderGeometry args={[0.25, 0.35, 2, 6]} />
        <meshStandardMaterial color={0x5b3a22} />
      </instancedMesh>
      <instancedMesh ref={crowns} frustumCulled={false} args={[undefined, undefined, trees.length]}>
        <icosahedronGeometry args={[1.8, 0]} />
        <meshStandardMaterial color={0xffffff} flatShading />
      </instancedMesh>
    </group>
  );
}

/**
 * Cenário: terreno plano (sem prédios-placeholder) com o MASP (CC0) como
 * marco visual num dos lados da avenida.
 */
export function Scenery() {
  const laneMarks = useMemo(
    () => Array.from({ length: Math.floor(AVENUE_LENGTH / 6) }, (_, i) => -AVENUE_LENGTH / 2 + i * 6 + 1),
    [],
  );

  return (
    <group>
      {/* Terreno plano */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[AVENUE_LENGTH, AVENUE_WIDTH]} />
        <meshStandardMaterial color={0x2b3139} />
      </mesh>

      {/* Faixa central tracejada */}
      {laneMarks.map((x, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.01, 0]}>
          <planeGeometry args={[3, 0.3]} />
          <meshStandardMaterial color={0xffd12e} />
        </mesh>
      ))}

      {/* Parque arborizado do outro lado da avenida (lado oposto ao MASP). */}
      <Park />

      {/* Marco visual: MASP ao lado da avenida. Suspense evita que a cena
          quebre enquanto o glTF (~920KB) ainda está baixando. */}
      <ModelBoundary>
      <Suspense fallback={null}>
        <SceneryBuilding
          url={MASP_URL}
          position={[0, MASP_Y_OFFSET, AVENUE_WIDTH / 2 + 6]}
          scale={MASP_SCALE}
        />
      </Suspense>
      </ModelBoundary>
    </group>
  );
}
