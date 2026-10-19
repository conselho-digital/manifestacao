import { Suspense, useEffect, useMemo } from "react";
import { Mesh } from "three";
import { useGLTF } from "@react-three/drei";
import { AVENUE_LENGTH, AVENUE_WIDTH } from "./world.js";

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
  }, [scene]);

  return (
    <primitive object={scene} position={position} rotation={[0, rotation, 0]} scale={scale} />
  );
}

useGLTF.preload(MASP_URL);

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

      {/* Marco visual: MASP ao lado da avenida. Suspense evita que a cena
          quebre enquanto o glTF (~920KB) ainda está baixando. */}
      <Suspense fallback={null}>
        <SceneryBuilding
          url={MASP_URL}
          position={[0, MASP_Y_OFFSET, AVENUE_WIDTH / 2 + 6]}
          scale={MASP_SCALE}
        />
      </Suspense>
    </group>
  );
}
