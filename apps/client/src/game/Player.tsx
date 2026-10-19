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
import {
  CAMERA_LOOK_AHEAD_RATIO,
  CAMERA_PIVOT_HEIGHT,
  RUN_MULTIPLIER,
  WALK_SPEED,
  clampToAvenue,
} from "./world.js";
import type { InputVector } from "./useInput.js";
import { SPRAY_MAX_RANGE } from "./spray.js";

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
  /** Ângulo horizontal da câmera (radianos), controlado pela zona de arrasto da direita. */
  cameraYawRef: { current: number };
  /** Inclinação vertical da câmera (radianos), mesma zona de arrasto. */
  cameraPitchRef: { current: number };
  /** Distância da câmera ao personagem (menor no PC). */
  cameraDistance: number;
  /** Atualizado a cada frame com o ponto do chão sob a mira (centro da tela) — onde o spray cai. */
  aimRef: { current: { x: number; z: number } };
  /** true enquanto o botão de correr está pressionado. */
  runRef: { current: boolean };
  onMove: (x: number, z: number, facing: Facing, vehicle: VehicleId, flag: FlagId) => void;
  /** Atualizado a cada frame com a posição atual (opcional). */
  transformRef?: { current: PlayerTransform };
  /** Marcado true após o primeiro frame — transformRef só é confiável depois disso. */
  transformReadyRef?: { current: boolean };
}

const SEND_INTERVAL = 1 / 12; // ~12 updates/s

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
  cameraPitchRef,
  cameraDistance,
  aimRef,
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
  const aimDir = useRef(new Vector3());

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;

    const yaw = cameraYawRef.current;
    const input = inputRef.current;
    const len = Math.hypot(input.x, input.z);
    // Correr não se aplica dirigindo — o veículo já define a velocidade.
    const runMul = runRef.current && vehicleRef.current === "nenhum" ? RUN_MULTIPLIER : 1;
    const speed = WALK_SPEED * runMul * (VEHICLES[vehicleRef.current]?.speedMul ?? 1);
    if (len > 0) {
      // Entrada do joystick é relativa à tela (z negativo = pra frente, ver
      // useInput.ts); giramos pelo ângulo da câmera para mover "pra onde a
      // câmera olha" (terceira pessoa). forward(yaw) = (sin(yaw), cos(yaw)),
      // então "pra frente" (input.z=-1) deve mapear pra +forward — daí o
      // sinal trocado de input.z abaixo em relação a uma rotação 2D comum.
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      const worldX = input.x * cos - input.z * sin;
      const worldZ = -input.x * sin - input.z * cos;
      const step = (speed * delta) / len;
      const next = clampToAvenue(g.position.x + worldX * step, g.position.z + worldZ * step);
      g.position.x = next.x;
      g.position.z = next.z;
      g.rotation.y = Math.atan2(worldX, worldZ);
      facing.current = facingOf(worldX, worldZ, facing.current);
    }

    // Câmera orbital livre: gira (yaw) e inclina (pitch) em torno de um
    // pivô na altura do personagem, controlada pela zona de arrasto da
    // direita — não fica mais presa a um offset fixo no mundo, dá pra olhar
    // pra frente/pra cima de verdade. forward(yaw) = (sin, cos) do ângulo.
    // Nota: com o avatar geométrico atual (simétrico, sem frente/trás visível)
    // não há como confirmar visualmente o lado; ao entrar um modelo glTF com
    // frente definida, revalidar se a câmera fica atrás das costas ou na frente
    // e inverter o sinal aqui se necessário.
    const pitch = cameraPitchRef.current;
    const cosPitch = Math.cos(pitch);
    const pivotX = g.position.x;
    const pivotY = g.position.y + CAMERA_PIVOT_HEIGHT;
    const pivotZ = g.position.z;
    tmp.current.set(
      pivotX - Math.sin(yaw) * cameraDistance * cosPitch,
      pivotY + Math.sin(pitch) * cameraDistance,
      pivotZ - Math.cos(yaw) * cameraDistance * cosPitch,
    );
    camera.position.lerp(tmp.current, 1 - Math.pow(0.001, delta));
    // Olha um pouco à frente do personagem: assim o centro da tela (onde fica
    // a mira do spray) cai no chão à frente dele, em vez de em cima da cabeça.
    const ahead = cameraDistance * CAMERA_LOOK_AHEAD_RATIO;
    camera.lookAt(pivotX + Math.sin(yaw) * ahead, pivotY, pivotZ + Math.cos(yaw) * ahead);

    // Mira: raio do centro da tela até o chão (y=0), limitado ao alcance do spray.
    camera.getWorldDirection(aimDir.current);
    const d = aimDir.current;
    let ax: number;
    let az: number;
    if (d.y < -0.01) {
      const t = -camera.position.y / d.y;
      ax = camera.position.x + d.x * t;
      az = camera.position.z + d.z * t;
    } else {
      // Olhando pro horizonte/céu: sem ponto no chão, usa o alcance máximo na direção do olhar.
      ax = pivotX + d.x * SPRAY_MAX_RANGE;
      az = pivotZ + d.z * SPRAY_MAX_RANGE;
    }
    const dx = ax - g.position.x;
    const dz = az - g.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > SPRAY_MAX_RANGE) {
      ax = g.position.x + (dx / dist) * SPRAY_MAX_RANGE;
      az = g.position.z + (dz / dist) * SPRAY_MAX_RANGE;
    }
    aimRef.current.x = ax;
    aimRef.current.z = az;

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
