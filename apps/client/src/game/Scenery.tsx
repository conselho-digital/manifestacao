import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Box3, Color, InstancedMesh, Matrix4, Mesh, Quaternion, Sphere, Vector3 } from "three";
import { ModelBoundary } from "./ModelBoundary.js";
import { City } from "./City.js";
import { clearCameraColliders, setCameraColliders } from "./colliders.js";
import { useGLTF } from "@react-three/drei";
import { AVENUE_LENGTH, AVENUE_WIDTH, PARK_GAP, PARK_SIZE, PLAZA_HALF_X, PLAZA_MAX_Z } from "./world.js";

const MASP_URL = "/models/scenery/masp.glb";
// Modelo original (Sketchfab, exportado de FBX) vem em unidades arbitrárias
// bem maiores que a cena (~1500x466x524). Escala medida via bounding box
// (GLTFLoader + Box3) para a altura final ficar ~14 unidades — na mesma
// faixa dos prédios-placeholder anteriores (8-24). Y compensa o pivô do
// modelo (base ~139.67 unidades abaixo da origem local) para encostar no chão.
const MASP_SCALE = 0.03;
/** O prédio tem o DOBRO da altura (eixo Y x2): o vão livre sob ele passa de ~3 para ~6 e dá para andar por baixo. */
const MASP_SCALE_Y = MASP_SCALE * 2;
const MASP_Y_OFFSET = 139.67 * MASP_SCALE_Y;
const MASP_Z = AVENUE_WIDTH / 2 + 6;
/** Vão livre sob o prédio e topo do telhado (mundo), a partir das medidas do modelo (laje -38,6..282,4; chão -139,7). */
const MASP_SLAB_BOTTOM = (-38.6 + 139.67) * MASP_SCALE_Y;
const MASP_ROOF_TOP = (282.4 + 139.67) * MASP_SCALE_Y;

/**
 * Prédio de cenário carregado de um glTF (CC0 — ver CREDITS.md). Habilita
 * sombra em cada malha do modelo, já que o glTF não vem com essas flags.
 */
function SceneryBuilding({
  url,
  position,
  rotation = 0,
  scale = [1, 1, 1],
}: {
  url: string;
  position: [number, number, number];
  rotation?: number;
  scale?: [number, number, number];
}) {
  const { scene } = useGLTF(url);

  useEffect(() => {
    scene.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    // Colisão da câmera só na laje e no telhado (a partir do vão livre): por baixo do prédio a câmera passa livre.
    scene.updateMatrixWorld(true);
    const whole = new Box3().setFromObject(scene);
    const slab = new Box3(
      new Vector3(whole.min.x, MASP_SLAB_BOTTOM, Math.max(whole.min.z, AVENUE_WIDTH / 2 + 1)),
      new Vector3(whole.max.x, MASP_ROOF_TOP, whole.max.z),
    );
    setCameraColliders(`building:${url}`, [], [slab]);
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
/**
 * Árvores do parque: o TRONCO tem 2,5 vezes a altura de um personagem a pé (o corpo geométrico tem ~2,0 de altura),
 * ou seja, 5,0 unidades para todas; o que varia entre árvores é a grossura do tronco e o tamanho da copa.
 */
const CHARACTER_HEIGHT = 2.0;
const TRUNK_HEIGHT_FACTOR = 2.5;
const TRUNK_HEIGHT = CHARACTER_HEIGHT * TRUNK_HEIGHT_FACTOR; // 5,0
const TRUNK_BASE_LENGTH = 2; // comprimento do cilindro base do tronco
const TRUNK_WIDTH = 1.7;
const CROWN_WIDTH = 1.4;
const CROWN_STRETCH = 1.15;
const CROWN_RADIUS = 1.8; // raio da icosfera da copa

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
      const trunkW = t.scale * TRUNK_WIDTH;
      // Cilindro base tem 2 de comprimento e é centrado: escala Y = altura/2, centro na metade da altura.
      m.compose(new Vector3(t.x, TRUNK_HEIGHT / 2, t.z), q, new Vector3(trunkW, TRUNK_HEIGHT / TRUNK_BASE_LENGTH, trunkW));
      trunks.current!.setMatrixAt(i, m);
      const cw = t.scale * CROWN_WIDTH;
      const radius = CROWN_RADIUS * cw;
      // A copa senta no topo do tronco e afunda um pouco nele.
      const crownY = TRUNK_HEIGHT + radius * 0.35;
      m.compose(new Vector3(t.x, crownY, t.z), q, new Vector3(cw, cw * CROWN_STRETCH, cw));
      crowns.current!.setMatrixAt(i, m);
      colliders.push(new Sphere(new Vector3(t.x, crownY, t.z), radius));
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
  // Faixa central tracejada: um único mesh instanciado (a avenida é longa).
  const laneCount = Math.floor(AVENUE_LENGTH / 6);
  const lanes = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = lanes.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
    for (let i = 0; i < laneCount; i++) {
      m.compose(new Vector3(-AVENUE_LENGTH / 2 + i * 6 + 1, 0.01, 0), q, new Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [laneCount]);

  return (
    <group>
      {/* Terreno plano */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[AVENUE_LENGTH, AVENUE_WIDTH]} />
        <meshStandardMaterial color={0x2b3139} />
      </mesh>

      {/* Faixa central tracejada */}
      <instancedMesh ref={lanes} frustumCulled={false} args={[undefined, undefined, laneCount]}>
        <planeGeometry args={[3, 0.3]} />
        <meshStandardMaterial color={0xffd12e} />
      </instancedMesh>

      {/* Quarteirões de prédios dos dois lados, atrás da praça e do parque. */}
      <City />

      {/* Parque arborizado do outro lado da avenida (lado oposto ao MASP). */}
      <Park />

      {/* Praça do MASP: piso por baixo e ao redor do prédio suspenso, ligado à avenida (dá para andar embaixo). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, (AVENUE_WIDTH / 2 + PLAZA_MAX_Z) / 2]} receiveShadow>
        <planeGeometry args={[PLAZA_HALF_X * 2, PLAZA_MAX_Z - AVENUE_WIDTH / 2]} />
        <meshStandardMaterial color={0x8e8a80} />
      </mesh>

      {/* Marco visual: MASP ao lado da avenida. Suspense evita que a cena
          quebre enquanto o glTF (~920KB) ainda está baixando. */}
      <ModelBoundary>
      <Suspense fallback={null}>
        <SceneryBuilding
          url={MASP_URL}
          position={[0, MASP_Y_OFFSET, MASP_Z]}
          scale={[MASP_SCALE, MASP_SCALE_Y, MASP_SCALE]}
        />
      </Suspense>
      </ModelBoundary>
    </group>
  );
}
