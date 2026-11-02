import { Suspense, useEffect, useMemo } from "react";
import { Box3, Mesh, Vector3 } from "three";
import { useGLTF } from "@react-three/drei";
import { ModelBoundary } from "./ModelBoundary.js";
import { clearCameraColliders, setCameraColliders } from "./colliders.js";
import { clearSolids, setSolids } from "./solids.js";
import { resetWorldBounds, setWorldBounds } from "./world.js";
import { ARENA_CARS, ARENA_CRATES, ARENA_HALF, ARENA_PILLARS, WALL_HEIGHT, WALL_THICKNESS, arenaSolids, type ArenaCar } from "./arena.js";

const FLOOR = 0x5f6670;
const LINE = 0xe8e4d6;
const WALL = 0x9aa3ae;
const CRATE = 0xc2884a;
const PILLAR = 0xcfd4da;
const ACCENT = 0xffd12e;

/** Veículo parado como abrigo: ajusta o modelo ao tamanho previsto, deitado no eixo X e apoiado no chão. */
/** Registra colisão (jogador) e obstáculo de câmera de um veículo, a partir do retângulo no mundo. */
function useCarBody(id: string, car: ArenaCar, w: number, d: number, h: number) {
  useEffect(() => {
    setSolids(id, [{ minX: car.x - w / 2, maxX: car.x + w / 2, minZ: car.z - d / 2, maxZ: car.z + d / 2 }], [], [], 0);
    setCameraColliders(id, [], [new Box3(new Vector3(car.x - w / 2, 0, car.z - d / 2), new Vector3(car.x + w / 2, h, car.z + d / 2))]);
    return () => {
      clearSolids(id);
      clearCameraColliders(id);
    };
  }, [id, car.x, car.z, w, d, h]);
}

function CoverCar({ car, id }: { car: ArenaCar; id: string }) {
  const { scene } = useGLTF(car.url);
  const prepared = useMemo(() => {
    const root = scene.clone(true);
    root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(root);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    // Eixo comprido do modelo vira o eixo X da arena.
    const longZ = size.z > size.x;
    const longest = Math.max(size.x, size.z) || 1;
    const k = car.len / longest;
    root.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return { root, k, longZ, center, minY: box.min.y, size: { x: size.x * k, y: size.y * k, z: size.z * k } };
  }, [scene, car.len]);
  // Em unidades do modelo: recentra no XZ e encosta a base no chão (y = 0) antes de escalar e girar.
  const { root, k, longZ, center, minY, size } = prepared;
  const yaw0 = (longZ ? Math.PI / 2 : 0) + (car.turn ? Math.PI / 2 : 0);
  // Largura real no mundo: se o eixo comprido era Z, o modelo girou 90° (comprimento = size.z).
  const bodyLen = longZ ? size.z : size.x;
  const bodyWid = longZ ? size.x : size.z;
  useCarBody(id, car, car.turn ? bodyWid : bodyLen, car.turn ? bodyLen : bodyWid, size.y);
  const yaw = yaw0;
  return (
    <group position={[car.x, 0, car.z]} rotation={[0, yaw, 0]} scale={k}>
      <primitive object={root} position={[-center.x, -minY, -center.z]} />
    </group>
  );
}

function CarFallback({ car, id }: { car: ArenaCar; id: string }) {
  const w = car.turn ? car.wid : car.len;
  const d = car.turn ? car.len : car.wid;
  useCarBody(id, car, w, d, 1.8);
  return (
    <mesh position={[car.x, 0.9, car.z]} castShadow receiveShadow>
      <boxGeometry args={[w, 1.8, d]} />
      <meshStandardMaterial color={0x6a7a8c} />
    </mesh>
  );
}

/**
 * Cenário da arena PvP: piso, muralhas, abrigos (caixas, pilares e veículos) e colisão. Fica no lugar do `Scenery`
 * da avenida; ao montar troca os limites do mundo para a arena e, ao sair, devolve os da cidade.
 */
export function Arena() {
  useEffect(() => {
    setWorldBounds(ARENA_HALF, ARENA_HALF);
    const { rects, circles } = arenaSolids();
    setSolids("arena", rects, circles, [], 0);
    return () => {
      clearSolids("arena");
      resetWorldBounds();
    };
  }, []);

  // Obstáculos da câmera (ela não atravessa muralha nem abrigo).
  useEffect(() => {
    const boxes: Box3[] = [];
    for (const c of ARENA_CRATES) boxes.push(new Box3(new Vector3(c.x - c.w / 2, 0, c.z - c.d / 2), new Vector3(c.x + c.w / 2, c.h, c.z + c.d / 2)));
    for (const p of ARENA_PILLARS) boxes.push(new Box3(new Vector3(p.x - p.r, 0, p.z - p.r), new Vector3(p.x + p.r, p.h, p.z + p.r)));
    const e = ARENA_HALF + WALL_THICKNESS;
    boxes.push(
      new Box3(new Vector3(-e, 0, ARENA_HALF), new Vector3(e, WALL_HEIGHT, e)),
      new Box3(new Vector3(-e, 0, -e), new Vector3(e, WALL_HEIGHT, -ARENA_HALF)),
      new Box3(new Vector3(ARENA_HALF, 0, -e), new Vector3(e, WALL_HEIGHT, e)),
      new Box3(new Vector3(-e, 0, -e), new Vector3(-ARENA_HALF, WALL_HEIGHT, e)),
    );
    setCameraColliders("arena", [], boxes);
    return () => clearCameraColliders("arena");
  }, []);

  const size = ARENA_HALF * 2;
  const wallLen = size + WALL_THICKNESS * 2;
  const wallOff = ARENA_HALF + WALL_THICKNESS / 2;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[size + 400, size + 400]} />
        <meshStandardMaterial color={0x3a3f46} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color={FLOOR} />
      </mesh>
      {/* Círculo central e faixas de meio de campo. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[5.5, 5.8, 48]} />
        <meshStandardMaterial color={LINE} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <planeGeometry args={[size, 0.25]} />
        <meshStandardMaterial color={LINE} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <planeGeometry args={[0.25, size]} />
        <meshStandardMaterial color={LINE} />
      </mesh>

      {/* Muralhas */}
      {(
        [
          [0, wallOff, wallLen, WALL_THICKNESS],
          [0, -wallOff, wallLen, WALL_THICKNESS],
          [wallOff, 0, WALL_THICKNESS, wallLen],
          [-wallOff, 0, WALL_THICKNESS, wallLen],
        ] as const
      ).map(([x, z, w, d]) => (
        <mesh key={`${x}:${z}`} position={[x, WALL_HEIGHT / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[w, WALL_HEIGHT, d]} />
          <meshStandardMaterial color={WALL} />
        </mesh>
      ))}

      {ARENA_CRATES.map((c, i) => (
        <group key={`c${i}`} position={[c.x, 0, c.z]}>
          <mesh position={[0, c.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[c.w, c.h, c.d]} />
            <meshStandardMaterial color={CRATE} />
          </mesh>
          <mesh position={[0, c.h + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[c.w * 0.92, c.d * 0.92]} />
            <meshStandardMaterial color={ACCENT} />
          </mesh>
        </group>
      ))}
      {ARENA_PILLARS.map((p, i) => (
        <mesh key={`p${i}`} position={[p.x, p.h / 2, p.z]} castShadow receiveShadow>
          <cylinderGeometry args={[p.r, p.r, p.h, 20]} />
          <meshStandardMaterial color={PILLAR} />
        </mesh>
      ))}
      {ARENA_CARS.map((car, i) => (
        <ModelBoundary key={`${car.url}:${i}`} fallback={<CarFallback car={car} id={`arena-car:${i}`} />}>
          <Suspense fallback={<CarFallback car={car} id={`arena-car:${i}`} />}>
            <CoverCar car={car} id={`arena-car:${i}`} />
          </Suspense>
        </ModelBoundary>
      ))}
    </group>
  );
}
