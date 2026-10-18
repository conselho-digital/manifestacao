import { useRef } from "react";
import { Group } from "three";
import { useFrame } from "@react-three/fiber";
import type { RemotePlayer } from "../net/useAvenueRealtime.js";

interface RemotePlayersProps {
  ids: string[];
  playersRef: { current: Map<string, RemotePlayer> };
}

/**
 * Renderiza os outros jogadores e interpola suas posições a cada frame em
 * direção ao último valor recebido via broadcast (suaviza a baixa taxa de rede).
 */
export function RemotePlayers({ ids, playersRef }: RemotePlayersProps) {
  const groups = useRef<Map<string, Group>>(new Map());

  useFrame((_, delta) => {
    const t = 1 - Math.pow(0.002, delta);
    for (const id of ids) {
      const g = groups.current.get(id);
      const p = playersRef.current.get(id);
      if (!g || !p) continue;
      g.position.x += (p.x - g.position.x) * t;
      g.position.z += (p.z - g.position.z) * t;
    }
  });

  return (
    <>
      {ids.map((id) => {
        const p = playersRef.current.get(id);
        if (!p) return null;
        return (
          <group
            key={id}
            ref={(g) => {
              if (g) groups.current.set(id, g);
              else groups.current.delete(id);
            }}
          >
            <mesh position={[0, 0.9, 0]} castShadow>
              <capsuleGeometry args={[0.35, 0.8, 4, 12]} />
              <meshStandardMaterial color={p.shirt} />
            </mesh>
            <mesh position={[0, 1.7, 0]} castShadow>
              <sphereGeometry args={[0.28, 16, 16]} />
              <meshStandardMaterial color={0xf2d2b6} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
