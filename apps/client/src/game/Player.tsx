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
import { RUN_MULTIPLIER, WALK_SPEED, clampToAvenue } from "./world.js";
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
  /** Ângulo da câmera (radianos), controlado pela zona de arrasto da direita. */
  cameraYawRef: { current: number };
  /** true enquanto o botão de correr está pressionado. */
  runRef: { current: boolean };
  onMove: (x: number, z: number, facing: Facing, vehicle: VehicleId, flag: FlagId) => void;
  /** Atualizado a cada frame com a posição atual (opcional). */
  transformRef?: { current: PlayerTransform };
  /** Marcado true após o primeiro frame — transformRef só é confiável depois disso. */
  transformReadyRef?: { current: boolean };
}

const SEND_INTERVAL = 1 / 12; // ~12 updates/s
const CAMERA_HEIGHT = 10;
const CAMERA_DISTANCE = 14;

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
  cameraYawRef,
  runRef,
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

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;

    const yaw = cameraYawRef.current;
    const input = inputRef.current;
    const len = Math.hypot(input.x, input.z);
    const runMul = runRef.current ? RUN_MULTIPLIER : 1;
    const speed = WALK_SPEED * runMul * (VEHICLES[vehicleRef.current]?.speedMul ?? 1);
    if (len > 0) {
      // Entrada do joystick é relativa à tela; giramos pelo ângulo da câmera
      // para mover "pra frente de onde a câmera olha" (terceira pessoa).
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      const worldX = input.x * cos + input.z * sin;
      const worldZ = -input.x * sin + input.z * cos;
      const step = (speed * delta) / len;
      const next = clampToAvenue(g.position.x + worldX * step, g.position.z + worldZ * step);
      g.position.x = next.x;
      g.position.z = next.z;
      g.rotation.y = Math.atan2(worldX, worldZ);
      facing.current = facingOf(worldX, worldZ, facing.current);
    }

    // Câmera atrás do personagem: desloca na direção oposta ao ângulo
    // controlado pelo arrasto da direita (forward = (sin, cos) do ângulo).
    // Nota: com o avatar geométrico atual (simétrico, sem frente/trás visível)
    // não há como confirmar visualmente o lado; ao entrar um modelo glTF com
    // frente definida, revalidar se a câmera fica atrás das costas ou na frente
    // e inverter o sinal aqui se necessário.
    tmp.current.set(
      g.position.x - Math.sin(yaw) * CAMERA_DISTANCE,
      g.position.y + CAMERA_HEIGHT,
      g.position.z - Math.cos(yaw) * CAMERA_DISTANCE,
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
