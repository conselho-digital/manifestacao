import { useRef } from "react";
import { Group, Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { Facing } from "@manifestacao/shared";
import { Avatar } from "./Avatar.js";
import { WALK_SPEED, clampToAvenue } from "./world.js";
import type { InputVector } from "./useInput.js";

interface PlayerProps {
  color: number;
  name: string;
  inputRef: { current: InputVector };
  onMove: (x: number, z: number, facing: Facing) => void;
}

const SEND_INTERVAL = 1 / 12; // ~12 updates/s
const CAMERA_OFFSET = new Vector3(0, 10, 14);

function facingOf(x: number, z: number, prev: Facing): Facing {
  if (x === 0 && z === 0) return prev;
  if (Math.abs(x) >= Math.abs(z)) return x < 0 ? "left" : "right";
  return z < 0 ? "up" : "down";
}

/**
 * Jogador local: move o avatar pelo input, mantém a câmera seguindo por trás
 * e envia a posição via Realtime num ritmo fixo. Movimento é local e imediato
 * (sem esperar o servidor).
 */
export function Player({ color, name, inputRef, onMove }: PlayerProps) {
  const ref = useRef<Group>(null);
  const camera = useThree((s) => s.camera);
  const facing = useRef<Facing>("down");
  const accum = useRef(0);
  const tmp = useRef(new Vector3());

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;

    const input = inputRef.current;
    const len = Math.hypot(input.x, input.z);
    if (len > 0) {
      const step = (WALK_SPEED * delta) / len;
      const next = clampToAvenue(g.position.x + input.x * step, g.position.z + input.z * step);
      g.position.x = next.x;
      g.position.z = next.z;
      g.rotation.y = Math.atan2(input.x, input.z);
      facing.current = facingOf(input.x, input.z, facing.current);
    }

    // Câmera segue suavemente por trás do jogador.
    tmp.current.copy(g.position).add(CAMERA_OFFSET);
    camera.position.lerp(tmp.current, 1 - Math.pow(0.001, delta));
    camera.lookAt(g.position.x, g.position.y + 1, g.position.z);

    accum.current += delta;
    if (accum.current >= SEND_INTERVAL && len > 0) {
      accum.current = 0;
      onMove(g.position.x, g.position.z, facing.current);
    }
  });

  return <Avatar ref={ref} color={color} name={name} />;
}
