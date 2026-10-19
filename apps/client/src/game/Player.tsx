import { useRef } from "react";
import { Group, Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import {
  VEHICLES,
  type Facing,
  type FlagId,
  type VehicleId,
} from "@manifestacao/shared";
import { Avatar } from "./Avatar.js";
import { WALK_SPEED, clampToAvenue } from "./world.js";
import type { InputVector } from "./useInput.js";

/** Posição + rotação atuais do jogador local, lidas fora do Canvas (ex.: botão de spray). */
export interface PlayerTransform {
  x: number;
  z: number;
  /** Rotação em torno de Y, radianos — usada para calcular "na minha frente". */
  rotationY: number;
}

interface PlayerProps {
  color: number;
  name: string;
  flag: FlagId;
  vehicle: VehicleId;
  modelUrl: string | null;
  inputRef: { current: InputVector };
  onMove: (x: number, z: number, facing: Facing, vehicle: VehicleId, flag: FlagId) => void;
  /** Atualizado a cada frame com a posição atual (opcional). */
  transformRef?: { current: PlayerTransform };
  /** Marcado true após o primeiro frame — transformRef só é confiável depois disso. */
  transformReadyRef?: { current: boolean };
}

const SEND_INTERVAL = 1 / 12; // ~12 updates/s
const CAMERA_HEIGHT = 10;
const CAMERA_DISTANCE = 14;
/** Radianos/s máximos de giro da câmera ao redor do personagem. */
const CAMERA_TURN_SPEED = 6;

/** Diferença angular mais curta de `a` para `b`, já normalizada em [-PI, PI]. */
function shortestAngleDelta(a: number, b: number): number {
  return ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

function facingOf(x: number, z: number, prev: Facing): Facing {
  if (x === 0 && z === 0) return prev;
  if (Math.abs(x) >= Math.abs(z)) return x < 0 ? "left" : "right";
  return z < 0 ? "up" : "down";
}

/**
 * Jogador local: move o avatar pelo input (velocidade ajustada pelo veículo),
 * mantém a câmera seguindo e envia posição + veículo + bandeira via Realtime.
 */
export function Player({
  color,
  name,
  flag,
  vehicle,
  modelUrl,
  inputRef,
  onMove,
  transformRef,
  transformReadyRef,
}: PlayerProps) {
  const ref = useRef<Group>(null);
  const camera = useThree((s) => s.camera);
  const facing = useRef<Facing>("down");
  const accum = useRef(0);
  const wasMoving = useRef(false);

  // Refs com o estado dinâmico atual, para o broadcast ler sem recriar o loop.
  const vehicleRef = useRef(vehicle);
  vehicleRef.current = vehicle;
  const flagRef = useRef(flag);
  flagRef.current = flag;
  const tmp = useRef(new Vector3());
  // Ângulo da câmera ao redor do personagem (terceira pessoa, atrás das
  // costas). Suavizado com giro máximo por segundo para não "chacoalhar"
  // a cada pequena correção do joystick.
  const camAngle = useRef(0);

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;

    const input = inputRef.current;
    const len = Math.hypot(input.x, input.z);
    const speed = WALK_SPEED * (VEHICLES[vehicleRef.current]?.speedMul ?? 1);
    if (len > 0) {
      const step = (speed * delta) / len;
      const next = clampToAvenue(g.position.x + input.x * step, g.position.z + input.z * step);
      g.position.x = next.x;
      g.position.z = next.z;
      g.rotation.y = Math.atan2(input.x, input.z);
      facing.current = facingOf(input.x, input.z, facing.current);
    }

    const maxTurn = CAMERA_TURN_SPEED * delta;
    const turnDelta = shortestAngleDelta(camAngle.current, g.rotation.y);
    camAngle.current += Math.max(-maxTurn, Math.min(maxTurn, turnDelta));

    // Câmera atrás do personagem: desloca na direção oposta à que ele olha
    // (forward = (sin, cos) do ângulo), girando junto conforme ele vira.
    // Nota: com o avatar geométrico atual (simétrico, sem frente/trás visível)
    // não há como confirmar visualmente o lado; ao entrar um modelo glTF com
    // frente definida, revalidar se a câmera fica atrás das costas ou na frente
    // e inverter o sinal aqui se necessário.
    tmp.current.set(
      g.position.x - Math.sin(camAngle.current) * CAMERA_DISTANCE,
      g.position.y + CAMERA_HEIGHT,
      g.position.z - Math.cos(camAngle.current) * CAMERA_DISTANCE,
    );
    camera.position.lerp(tmp.current, 1 - Math.pow(0.001, delta));
    camera.lookAt(g.position.x, g.position.y + 1, g.position.z);

    if (transformRef) {
      transformRef.current.x = g.position.x;
      transformRef.current.z = g.position.z;
      transformRef.current.rotationY = g.rotation.y;
      if (transformReadyRef) transformReadyRef.current = true;
    }

    if (len === 0) {
      accum.current = 0;
      if (wasMoving.current) {
        onMove(g.position.x, g.position.z, facing.current, vehicleRef.current, flagRef.current);
        wasMoving.current = false;
      }
    } else {
      accum.current += delta;
      if (accum.current >= SEND_INTERVAL) {
        accum.current = 0;
        onMove(g.position.x, g.position.z, facing.current, vehicleRef.current, flagRef.current);
        wasMoving.current = true;
      }
    }
  });

  return (
    <Avatar ref={ref} color={color} name={name} flag={flag} vehicle={vehicle} modelUrl={modelUrl} />
  );
}
