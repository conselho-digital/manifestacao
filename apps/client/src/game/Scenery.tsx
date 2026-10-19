import { useEffect, useMemo } from "react";
import { Mesh } from "three";
import { useGLTF } from "@react-three/drei";
import { AVENUE_LENGTH, AVENUE_WIDTH } from "./world.js";

const MASP_URL = "/models/scenery/masp.glb";

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

      {/* Marco visual: MASP ao lado da avenida */}
      <SceneryBuilding url={MASP_URL} position={[0, 0, AVENUE_WIDTH / 2 + 6]} />
    </group>
  );
}
