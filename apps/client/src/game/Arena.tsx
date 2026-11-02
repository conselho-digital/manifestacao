import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Color, DoubleSide, InstancedMesh, Matrix4, Quaternion } from "three";
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
const RISER = 0xddd2b8;
const BENCH_A = 0xb9a47e;
const BENCH_B = 0x8f7a58;
const ACCENT = 0xffd12e;

/** Veículo parado como abrigo: ajusta o modelo ao tamanho previsto, deitado no eixo X e apoiado no chão. */
/** PRNG determinístico: a plateia fica no mesmo lugar para todos os jogadores. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const CROWD_COLORS = [0xffd12e, 0x2e9e5b, 0xf2f2ee, 0x3d6fb6, 0xd9534f, 0x1f2430, 0xf29b38];

/** Plateia: bonecos simples (uma malha instanciada) sentados nos degraus das arquibancadas. */
function Crowd() {
  const mesh = useRef<InstancedMesh>(null);
  const spots = useMemo(() => {
    const r = rng(7);
    const out: { x: number; y: number; z: number; c: number; s: number }[] = [];
    STANDS.forEach((st, i) => {
      const inner = i === 0 ? ARENA_RADIUS + WALL_THICKNESS : STANDS[i - 1]!.outer;
      const rows = 3;
      for (let row = 0; row < rows; row++) {
        const rad = inner + ((row + 0.5) / rows) * (st.outer - inner);
        const n = Math.floor((2 * Math.PI * rad) / 1.35);
        for (let k = 0; k < n; k++) {
          if (r() < 0.18) continue; // lugares vazios
          const a = ((k + r() * 0.5) / n) * Math.PI * 2;
          out.push({ x: Math.sin(a) * rad, y: st.top, z: Math.cos(a) * rad, c: Math.floor(r() * CROWD_COLORS.length), s: 0.85 + r() * 0.3 });
        }
      }
    });
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const mat = new Matrix4();
    const q = new Quaternion();
    const col = new Color();
    spots.forEach((p, i) => {
      mat.compose({ x: p.x, y: p.y + 0.62 * p.s, z: p.z } as never, q, { x: p.s, y: p.s, z: p.s } as never);
      m.setMatrixAt(i, mat);
      m.setColorAt(i, col.setHex(CROWD_COLORS[p.c]!));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [spots]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, spots.length]} frustumCulled={false}>
      <capsuleGeometry args={[0.26, 0.55, 3, 6]} />
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  );
}

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
          <meshStandardMaterial color={WALL} emissive={WALL} emissiveIntensity={0.22} />
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

      {/* Arquibancadas: degraus concêntricos com muretas claras, fileiras de assentos em faixas e plateia. */}
      {STANDS.map((st, i) => {
        const inner = i === 0 ? ARENA_RADIUS + WALL_THICKNESS : STANDS[i - 1]!.outer;
        const bench = (st.outer - inner) / 3;
        return (
          <group key={`st${i}`}>
            <mesh position={[0, st.top / 2, 0]} receiveShadow>
              <cylinderGeometry args={[st.outer, st.outer, st.top, 96, 1, true]} />
              <meshStandardMaterial color={RISER} emissive={RISER} emissiveIntensity={0.18} side={DoubleSide} />
            </mesh>
            {[0, 1, 2].map((row) => (
              <mesh key={`bn${row}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, st.top + row * 0.02, 0]} receiveShadow>
                <ringGeometry args={[inner + row * bench, inner + (row + 1) * bench, 96]} />
                <meshStandardMaterial color={row % 2 === 0 ? BENCH_A : BENCH_B} emissive={row % 2 === 0 ? BENCH_A : BENCH_B} emissiveIntensity={0.12} />
              </mesh>
            ))}
          </group>
        );
      })}
      <Crowd />
      {/* Bandeirolas no alto da última arquibancada. */}
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        const r = STANDS[STANDS.length - 1]!.outer - 1;
        return (
          <mesh key={`bd${i}`} position={[Math.sin(a) * r, STANDS[STANDS.length - 1]!.top + 3, Math.cos(a) * r]} rotation={[0, a, 0]} castShadow>
            <boxGeometry args={[0.15, 6, 0.15]} />
            <meshStandardMaterial color={STONE} />
          </mesh>
        );
      })}

      {/* Blocos (altar, muretas, muros e escadarias) com faixa amarela no topo. */}
      {ARENA_BLOCKS.map((b, i) => (
        <group key={`bk${i}`} position={[b.x, 0, b.z]} rotation={[0, b.rot, 0]}>
          <mesh position={[0, b.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[b.w, b.h, b.d]} />
            <meshStandardMaterial color={BLOCK} emissive={BLOCK} emissiveIntensity={0.18} />
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
