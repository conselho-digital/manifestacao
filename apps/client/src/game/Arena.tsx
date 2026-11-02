import { useEffect, useMemo } from "react";
import { DoubleSide } from "three";
import { Box3, Vector3 } from "three";
import { CuboidCollider, CylinderCollider, RigidBody } from "@react-three/rapier";
import { clearCameraColliders, setCameraColliders } from "./colliders.js";
import { clearSolids, setSolids } from "./solids.js";
import { resetWorldBounds, setWorldBounds, setWorldRadius } from "./world.js";
import { ARENA_BLOCKS, ARENA_PILLARS, ARENA_RADIUS, STANDS, WALL_HEIGHT, WALL_THICKNESS, arenaSolids, blockCorners } from "./arena.js";

const SAND = 0xd2b27a;
const SAND_DARK = 0xb8955c;
const LINE = 0xf1e6c8;
const WALL = 0xb5a07a;
const STONE = 0xc9bba0;
const BLOCK = 0xa89570;
const PILLAR = 0xdcd3bd;
const STAND = 0x9b8a6c;
const ACCENT = 0xffd12e;

/** Veículo parado como abrigo: ajusta o modelo ao tamanho previsto, deitado no eixo X e apoiado no chão. */
/** Segmentos do anel da muralha: n pedaços retos (corda) ao redor da areia. */
const WALL_SEGMENTS = 48;
function wallRing(): { x: number; z: number; a: number; len: number }[] {
  const r = ARENA_RADIUS + WALL_THICKNESS / 2;
  const len = 2 * r * Math.tan(Math.PI / WALL_SEGMENTS) + 0.6; // um pouco de sobreposição entre pedaços
  return Array.from({ length: WALL_SEGMENTS }, (_, i) => {
    const a = (i / WALL_SEGMENTS) * Math.PI * 2;
    return { x: Math.sin(a) * r, z: Math.cos(a) * r, a, len };
  });
}

/**
 * Cenário da arena PvP (coliseu): areia circular, muralha, arquibancadas, complexo de obstáculos no meio e colisão. Fica no
 * lugar do `Scenery` da avenida; ao montar troca os limites do mundo para a arena e, ao sair, devolve os da cidade.
 */
export function Arena() {
  const ring = useMemo(wallRing, []);

  useEffect(() => {
    setWorldBounds(ARENA_RADIUS + 2, ARENA_RADIUS + 2);
    setWorldRadius(ARENA_RADIUS);
    const { rects, circles, polys } = arenaSolids();
    setSolids("arena", rects, circles, polys, 0);
    return () => {
      clearSolids("arena");
      resetWorldBounds();
    };
  }, []);

  // Obstáculos da câmera: muralha em anel e blocos/colunas (ela não atravessa).
  useEffect(() => {
    const boxes: Box3[] = [];
    for (const b of ARENA_BLOCKS) {
      if (Math.abs(Math.sin(b.rot * 2)) > 1e-6) continue; // blocos girados: caixa alinhada aos eixos pesaria demais; a câmera os atravessa
      const pts = blockCorners(b);
      boxes.push(new Box3(new Vector3(Math.min(...pts.map((p) => p[0])), 0, Math.min(...pts.map((p) => p[1]))), new Vector3(Math.max(...pts.map((p) => p[0])), b.h, Math.max(...pts.map((p) => p[1])))));
    }
    for (const p of ARENA_PILLARS) boxes.push(new Box3(new Vector3(p.x - p.r, 0, p.z - p.r), new Vector3(p.x + p.r, p.h, p.z + p.r)));
    for (const s of ring) {
      const half = s.len / 2;
      const cx = Math.abs(Math.cos(s.a)) * half + Math.abs(Math.sin(s.a)) * (WALL_THICKNESS / 2);
      const cz = Math.abs(Math.sin(s.a)) * half + Math.abs(Math.cos(s.a)) * (WALL_THICKNESS / 2);
      boxes.push(new Box3(new Vector3(s.x - cx, 0, s.z - cz), new Vector3(s.x + cx, WALL_HEIGHT, s.z + cz)));
    }
    setCameraColliders("arena", [], boxes);
    return () => clearCameraColliders("arena");
  }, [ring]);

  const floorSize = (STANDS[STANDS.length - 1]!.outer + 30) * 2;

  return (
    <group>
      {/* Física (Rapier): piso, muralha em anel, blocos e colunas como corpos fixos; o jogador pisa, bate, pula e escala. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[floorSize / 2, 0.5, floorSize / 2]} position={[0, -0.5, 0]} />
        {ring.map((s, i) => (
          <CuboidCollider key={`w${i}`} args={[s.len / 2, WALL_HEIGHT * 1.6, WALL_THICKNESS / 2]} position={[s.x, WALL_HEIGHT * 1.6, s.z]} rotation={[0, s.a, 0]} />
        ))}
        {ARENA_BLOCKS.map((b, i) => (
          <CuboidCollider key={`b${i}`} args={[b.w / 2, b.h / 2, b.d / 2]} position={[b.x, b.h / 2, b.z]} rotation={[0, b.rot, 0]} />
        ))}
        {ARENA_PILLARS.map((p, i) => (
          <CylinderCollider key={`p${i}`} args={[p.h / 2, p.r]} position={[p.x, p.h / 2, p.z]} />
        ))}
      </RigidBody>

      {/* Chão: terra fora da arena, areia dentro, anéis e emblema no centro. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[floorSize / 2, 64]} />
        <meshStandardMaterial color={0x6b5a3e} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[ARENA_RADIUS, 96]} />
        <meshStandardMaterial color={SAND} />
      </mesh>
      {[20, 38, 56].map((r, i) => (
        <mesh key={`ring${r}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02 + i * 0.002, 0]}>
          <ringGeometry args={[r - 0.35, r + 0.35, 96]} />
          <meshStandardMaterial color={SAND_DARK} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[7.2, 7.6, 64]} />
        <meshStandardMaterial color={LINE} />
      </mesh>

      {/* Muralha em anel */}
      {ring.map((s, i) => (
        <mesh key={`wm${i}`} position={[s.x, WALL_HEIGHT / 2, s.z]} rotation={[0, s.a, 0]} castShadow receiveShadow>
          <boxGeometry args={[s.len, WALL_HEIGHT, WALL_THICKNESS]} />
          <meshStandardMaterial color={WALL} />
        </mesh>
      ))}
      {/* Colunata sobre a muralha */}
      {Array.from({ length: 32 }, (_, i) => {
        const a = (i / 32) * Math.PI * 2;
        const r = ARENA_RADIUS + WALL_THICKNESS / 2;
        return (
          <mesh key={`cl${i}`} position={[Math.sin(a) * r, WALL_HEIGHT + 1.2, Math.cos(a) * r]} castShadow>
            <cylinderGeometry args={[0.5, 0.6, 2.4, 10]} />
            <meshStandardMaterial color={STONE} />
          </mesh>
        );
      })}

      {/* Arquibancadas: degraus concêntricos (só visual). */}
      {STANDS.map((st, i) => {
        const inner = i === 0 ? ARENA_RADIUS + WALL_THICKNESS : STANDS[i - 1]!.outer;
        return (
          <group key={`st${i}`}>
            <mesh position={[0, st.top / 2, 0]} receiveShadow>
              <cylinderGeometry args={[st.outer, st.outer, st.top, 64, 1, true]} />
              <meshStandardMaterial color={STAND} side={DoubleSide} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, st.top, 0]} receiveShadow>
              <ringGeometry args={[inner, st.outer, 64]} />
              <meshStandardMaterial color={i % 2 === 0 ? STONE : STAND} />
            </mesh>
          </group>
        );
      })}

      {/* Blocos (altar, muretas, muros e escadarias) com faixa amarela no topo. */}
      {ARENA_BLOCKS.map((b, i) => (
        <group key={`bk${i}`} position={[b.x, 0, b.z]} rotation={[0, b.rot, 0]}>
          <mesh position={[0, b.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[b.w, b.h, b.d]} />
            <meshStandardMaterial color={BLOCK} />
          </mesh>
          {b.cap && (
            <mesh position={[0, b.h + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[b.w * 0.94, b.d * 0.94]} />
              <meshStandardMaterial color={ACCENT} />
            </mesh>
          )}
        </group>
      ))}
      {ARENA_PILLARS.map((p, i) => (
        <mesh key={`pl${i}`} position={[p.x, p.h / 2, p.z]} castShadow receiveShadow>
          <cylinderGeometry args={[p.r, p.r * 1.1, p.h, 16]} />
          <meshStandardMaterial color={PILLAR} />
        </mesh>
      ))}
    </group>
  );
}
