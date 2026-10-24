import { newKnockRefs, type KnockRefs } from "./knock.js";
import { useRef } from "react";
import { Group } from "three";
import { useFrame } from "@react-three/fiber";
import { Avatar } from "./Avatar.js";
import { modelUrlFor } from "./models.js";
import type { RemotePlayer } from "../net/useAvenueRealtime.js";
import type { SignData } from "./useSigns.js";

interface RemotePlayersProps {
  ids: string[];
  playersRef: { current: Map<string, RemotePlayer> };
  signs: Map<string, SignData>;
}

/**
 * Renderiza os outros jogadores (corpo + bandeira + veículo) e interpola suas
 * posições a cada frame em direção ao último valor recebido via broadcast.
 */
export function RemotePlayers({ ids, playersRef, signs }: RemotePlayersProps) {
  const groups = useRef<Map<string, Group>>(new Map());
  // Callback ref estável por id: evita recriar a função (e desmontar/remontar
  // a referência no Three.js) a cada render de RemotePlayers.
  const refCallbacks = useRef<Map<string, (g: Group | null) => void>>(new Map());
  // Quanto cada moto está empinada (suavizado), lido pelo Avatar a cada frame.
  const wheelies = useRef<Map<string, { current: number }>>(new Map());
  const wheelieRefFor = (id: string) => {
    let r = wheelies.current.get(id);
    if (!r) {
      r = { current: 0 };
      wheelies.current.set(id, r);
    }
    return r;
  };

  // Início do último golpe com a bandeira de cada jogador (lido pelo Avatar a cada frame).
  const hits = useRef<Map<string, { current: number }>>(new Map());
  const hitRefFor = (id: string) => {
    let r = hits.current.get(id);
    if (!r) {
      r = { current: 0 };
      hits.current.set(id, r);
    }
    return r;
  };

  // Reação a golpe e queda de cada jogador (lidas pelo Avatar a cada frame).
  const knocks = useRef<Map<string, KnockRefs>>(new Map());
  const knockFor = (id: string) => {
    let r = knocks.current.get(id);
    if (!r) {
      r = newKnockRefs();
      knocks.current.set(id, r);
    }
    return r;
  };

  function refFor(id: string): (g: Group | null) => void {
    let fn = refCallbacks.current.get(id);
    if (!fn) {
      fn = (g) => {
        if (g) groups.current.set(id, g);
        else groups.current.delete(id);
      };
      refCallbacks.current.set(id, fn);
    }
    return fn;
  }

  useFrame((_, delta) => {
    const t = 1 - Math.pow(0.002, delta);
    for (const id of ids) {
      const g = groups.current.get(id);
      const p = playersRef.current.get(id);
      if (!g || !p) continue;
      g.position.x += (p.x - g.position.x) * t;
      g.position.z += (p.z - g.position.z) * t;
      // Dirigindo: o veículo gira para a direção que o dono informou (pelo menor ângulo).
      if (p.vehicle !== "nenhum") {
        const diff = ((((p.heading - g.rotation.y + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
        g.rotation.y += diff * t;
      }
      const w = wheelieRefFor(id);
      w.current += (p.wheelie - w.current) * t;
      hitRefFor(id).current = p.hitAt ?? 0;
      const k = knockFor(id);
      k.reactAt.current = p.reactAt ?? 0;
      k.fallAt.current = p.fallAt ?? 0;
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
            ref={refFor(id)}
            color={p.shirt}
            name={p.nickname}
            flag={p.flag}
            team={p.team}
            character={p.character}
            vehicle={p.vehicle}
            wheelieRef={wheelieRefFor(id)}
            hitRef={hitRefFor(id)}
            knock={knockFor(id)}
            sign={p.signId ? signs.get(p.signId) ?? null : null}
            modelUrl={modelUrlFor(p.character, p.team)}
          />
        );
      })}
    </>
  );
}
