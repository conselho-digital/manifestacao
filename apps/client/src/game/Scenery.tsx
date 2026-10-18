import { useMemo } from "react";
import { AVENUE_LENGTH, AVENUE_WIDTH } from "./world.js";

/**
 * Cenário mínimo da avenida: chão, faixa central e duas fileiras de prédios
 * (caixas) nas calçadas. Placeholder até entrarem kits urbanos CC0
 * (Kenney/Quaternius) na Fase 2.
 */
export function Scenery() {
  const buildings = useMemo(() => {
    const items: { x: number; z: number; h: number; d: number }[] = [];
    const step = 12;
    for (let x = -AVENUE_LENGTH / 2; x < AVENUE_LENGTH / 2; x += step) {
      const h = 8 + ((Math.abs(x) * 7) % 16);
      const zEdge = AVENUE_WIDTH / 2 + 4;
      items.push({ x: x + step / 2, z: zEdge, h, d: 1 });
      items.push({ x: x + step / 2, z: -zEdge, h: h * 0.8 + 6, d: -1 });
    }
    return items;
  }, []);

  return (
    <group>
      {/* Chão da avenida */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[AVENUE_LENGTH, AVENUE_WIDTH]} />
        <meshStandardMaterial color={0x2b3139} />
      </mesh>

      {/* Faixa central tracejada */}
      {Array.from({ length: Math.floor(AVENUE_LENGTH / 6) }).map((_, i) => {
        const x = -AVENUE_LENGTH / 2 + i * 6 + 1;
        return (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.01, 0]}>
            <planeGeometry args={[3, 0.3]} />
            <meshStandardMaterial color={0xffd12e} />
          </mesh>
        );
      })}

      {/* Prédios nas bordas */}
      {buildings.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]} castShadow receiveShadow>
          <boxGeometry args={[8, b.h, 6]} />
          <meshStandardMaterial color={b.d > 0 ? 0x3a424c : 0x434c57} />
        </mesh>
      ))}
    </group>
  );
}
