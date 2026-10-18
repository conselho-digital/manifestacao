import { useRef } from "react";
import { Group } from "three";
import { useFrame } from "@react-three/fiber";
import { Avatar } from "./Avatar.js";
import { modelUrlFor } from "./models.js";
import type { RemotePlayer } from "../net/useAvenueRealtime.js";

interface RemotePlayersProps {
  ids: string[];
  playersRef: { current: Map<string, RemotePlayer> };
}

/**
 * Renderiza os outros jogadores (corpo + bandeira + veículo) e interpola suas
 * posições a cada frame em direção ao último valor recebido via broadcast.
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
          <Avatar
            key={id}
            ref={(g) => {
              if (g) groups.current.set(id, g);
              else groups.current.delete(id);
            }}
            color={p.shirt}
            name={p.nickname}
            flag={p.flag}
            vehicle={p.vehicle}
            modelUrl={modelUrlFor(p.character)}
          />
        );
      })}
    </>
  );
}
