import { useRef } from "react";
import { Group, Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import {
  VEHICLES,
  type Facing,
  type FlagId,
  type TeamId,
  type VehicleId,
} from "@manifestacao/shared";
import { Avatar } from "./Avatar.js";
import { NO_DRIVE_INPUT, stepDrive, type DriveInput, type DriveState } from "./driving.js";
import type { SignData } from "./useSigns.js";
import {
  CAMERA_LOOK_AHEAD_RATIO,
  CAMERA_SHOULDER_RATIO,
  AVATAR_RADIUS,
  CAMERA_PIVOT_HEIGHT,
  RUN_MULTIPLIER,
  WALK_SPEED,
  clampToAvenue,
} from "./world.js";
import type { InputVector } from "./useInput.js";
import { SPRAY_MAX_RANGE } from "./spray.js";
import { allowedCameraDistance } from "./colliders.js";
import { resolveSolids } from "./solids.js";

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
  team?: TeamId;
  /** Cartaz personalizado que o jogador carrega. */
  sign?: SignData | null;
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
  onMove: (x: number, z: number, facing: Facing, vehicle: VehicleId, flag: FlagId, heading?: number, wheelie?: number) => void;
  /** Botões de direção (touch) pressionados; o teclado vem pelo `inputRef`. */
  driveRef: { current: DriveInput };
  /** Quanto a moto está empinada (0..1) — lido pelo Avatar para inclinar o desenho. */
  wheelieRef: { current: number };
  /** Instante (ms) do último arrasto de câmera — a câmera só se alinha ao veículo sozinha se faz tempo. */
  cameraTouchedAtRef: { current: number };
  /** Atualizado a cada frame com a posição atual (opcional). */
  transformRef?: { current: PlayerTransform };
  /** Marcado true após o primeiro frame — transformRef só é confiável depois disso. */
  transformReadyRef?: { current: boolean };
}

const SEND_INTERVAL = 1 / 12; // ~12 updates/s

function wrapAngle(a: number): number {
  return ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
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
/** Raio de colisão de qualquer veículo (carro, moto, caminhão). */
const VEHICLE_RADIUS = 1.2;

export function Player({
  color,
  name,
  flag,
  team,
  sign = null,
  vehicle,
  modelUrl,
  inputRef,
  cameraYawRef,
  cameraPitchRef,
  cameraDistance: cameraDistanceProp,
  aimRef,
  runRef,
  onMove,
  driveRef,
  wheelieRef,
  cameraTouchedAtRef,
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
  const driveState = useRef<DriveState>({ speed: 0, heading: 0, wheelie: 0 });
  const prevVehicle = useRef<VehicleId>(vehicle);
  const tmp = useRef(new Vector3());
  const aimDir = useRef(new Vector3());
  const dir = useRef(new Vector3());
  const pivot = useRef(new Vector3());
  const offset = useRef(new Vector3());

  useFrame((_, rawDelta) => {
    // Limita o delta: ao voltar de aba oculta ele pode ser de segundos.
    const delta = Math.min(rawDelta, 0.1);
    const g = ref.current;
    if (!g) return;

    const input = inputRef.current;
    const len = Math.hypot(input.x, input.z);
    const driving = (VEHICLES[vehicleRef.current]?.kind ?? "foot") !== "foot";
    // Trocou de veículo (ou desceu): zera a velocidade e herda a direção atual.
    if (prevVehicle.current !== vehicleRef.current) {
      prevVehicle.current = vehicleRef.current;
      driveState.current = { speed: 0, heading: g.rotation.y, wheelie: 0 };
    }
    let moving = len > 0;

    if (driving) {
      // Dirigindo: acelerar / frear / girar (botões na tela ou W S A D) e, na moto, empinar (Q / E).
      const d = driveRef.current;
      const di: DriveInput = {
        accel: d.accel || input.z < -0.3,
        brake: d.brake || input.z > 0.3,
        left: d.left || input.x > 0.3,
        right: d.right || input.x < -0.3,
        up: d.up,
        down: d.down,
      };
      const st = driveState.current;
      stepDrive(st, di, vehicleRef.current, delta);
      const wantX = g.position.x + Math.sin(st.heading) * st.speed * delta;
      const wantZ = g.position.z + Math.cos(st.heading) * st.speed * delta;
      const clamped = clampToAvenue(wantX, wantZ, g.position);
      // Re-limita depois dos sólidos: um tronco rente à borda do mapa não pode empurrar ninguém para fora dele.
      const solid = resolveSolids(clamped.x, clamped.z, VEHICLE_RADIUS);
      const next = clampToAvenue(solid.x, solid.z, clamped);
      // Bateu na borda da avenida, em prédio ou árvore: perde velocidade.
      if (Math.hypot(next.x - wantX, next.z - wantZ) > 1e-3) st.speed *= 0.4;
      g.position.x = next.x;
      g.position.z = next.z;
      g.rotation.y = st.heading;
      facing.current = facingOf(Math.sin(st.heading), Math.cos(st.heading), facing.current);
      wheelieRef.current = st.wheelie;
      moving = Math.abs(st.speed) > 0.05 || st.wheelie > 0.01;
      // A câmera se alinha atrás do veículo, a menos que o jogador esteja olhando em volta.
      if (Math.abs(st.speed) > 1 && performance.now() - cameraTouchedAtRef.current > 1500) {
        const diff = wrapAngle(st.heading - cameraYawRef.current);
        cameraYawRef.current = wrapAngle(cameraYawRef.current + diff * Math.min(1, 2.2 * delta));
      }
    } else {
      wheelieRef.current = 0;
      driveRef.current = NO_DRIVE_INPUT;
    }

    const yaw = cameraYawRef.current;
    // Correr só a pé (a velocidade do veículo vem da direção).
    const runMul = runRef.current ? RUN_MULTIPLIER : 1;
    const speed = WALK_SPEED * runMul;
    if (!driving && len > 0) {
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
      const clamped = clampToAvenue(g.position.x + worldX * step, g.position.z + worldZ * step, g.position);
      const solid = resolveSolids(clamped.x, clamped.z, AVATAR_RADIUS);
      const next = clampToAvenue(solid.x, solid.z, clamped);
      g.position.x = next.x;
      g.position.z = next.z;
      facing.current = facingOf(worldX, worldZ, facing.current);
    }
    // A pé: o personagem olha para onde a mira aponta (gira junto com a câmera), parado ou andando.
    // forward(yaw) = (sin yaw, cos yaw), o mesmo da rotação em Y. Em veículo a direção vem do volante.
    if (!driving) {
      const diff = wrapAngle(yaw - g.rotation.y);
      g.rotation.y = wrapAngle(g.rotation.y + diff * Math.min(1, 18 * delta));
    }

    // Câmera orbital livre: gira (yaw) e inclina (pitch) em torno de um
    // pivô na altura do personagem, controlada pela zona de arrasto da
    // direita — não fica mais presa a um offset fixo no mundo, dá pra olhar
    // pra frente/pra cima de verdade. forward(yaw) = (sin, cos) do ângulo.
    // Nota: com o avatar geométrico atual (simétrico, sem frente/trás visível)
    // não há como confirmar visualmente o lado; ao entrar um modelo glTF com
    // frente definida, revalidar se a câmera fica atrás das costas ou na frente
    // e inverter o sinal aqui se necessário.
    // Veículos maiores pedem a câmera mais afastada (senão o caminhão tampa a tela).
    const camMul = vehicleRef.current === "caminhao" ? 1.9 : driving ? (VEHICLES[vehicleRef.current]?.kind === "car" ? 1.5 : 1.2) : 1;
    const cameraDistance = cameraDistanceProp * camMul;
    const pitch = cameraPitchRef.current;
    const cosPitch = Math.cos(pitch);
    const pivotX = g.position.x;
    const pivotY = g.position.y + CAMERA_PIVOT_HEIGHT;
    const pivotZ = g.position.z;
    // Câmera "sobre o ombro" (estilo GTA): o ponto que a câmera orbita e mira
    // fica deslocado pra DIREITA do personagem, então ele aparece à esquerda do
    // centro da tela e a mira (centro) nunca cai em cima dele.
    const shoulder = cameraDistance * CAMERA_SHOULDER_RATIO;
    const shX = -Math.cos(yaw) * shoulder;
    const shZ = Math.sin(yaw) * shoulder;
    pivot.current.set(pivotX, pivotY, pivotZ);
    dir.current.set(-Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch);
    // Posição desejada = ponto do ombro + recuo; encurtada se chão/obstáculo
    // estiver entre a cabeça do personagem e a câmera (nunca atravessa nada).
    tmp.current.set(pivotX + shX, pivotY, pivotZ + shZ).addScaledVector(dir.current, cameraDistance);
    offset.current.copy(tmp.current).sub(pivot.current);
    const wantedDist = offset.current.length();
    offset.current.divideScalar(wantedDist);
    const wanted = allowedCameraDistance(pivot.current, offset.current, wantedDist);
    tmp.current.copy(pivot.current).addScaledVector(offset.current, wanted);
    camera.position.lerp(tmp.current, 1 - Math.pow(0.001, delta));
    // O lerp suaviza o afastamento, mas a aproximação é imediata: se a câmera
    // (ainda a caminho) ficou além do permitido, encosta já no limite.
    offset.current.copy(camera.position).sub(pivot.current);
    const cur = offset.current.length();
    if (cur > 1e-4) {
      offset.current.divideScalar(cur);
      const limit = allowedCameraDistance(pivot.current, offset.current, cur);
      if (limit < cur) camera.position.copy(pivot.current).addScaledVector(offset.current, limit);
    }
    // Olha um pouco à frente do personagem: assim o centro da tela (onde fica
    // a mira do spray) cai no chão à frente dele, em vez de em cima da cabeça.
    const ahead = cameraDistance * CAMERA_LOOK_AHEAD_RATIO;
    camera.lookAt(pivotX + shX + Math.sin(yaw) * ahead, pivotY, pivotZ + shZ + Math.cos(yaw) * ahead);

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

    const heading = driving ? driveState.current.heading : g.rotation.y;
    const wheelie = driving ? driveState.current.wheelie : 0;
    if (!moving) {
      accum.current = 0;
      if (wasMoving.current) {
        onMove(g.position.x, g.position.z, facing.current, vehicleRef.current, flagRef.current, heading, wheelie);
        wasMoving.current = false;
      }
    } else {
      accum.current += delta;
      if (accum.current >= SEND_INTERVAL) {
        accum.current = 0;
        onMove(g.position.x, g.position.z, facing.current, vehicleRef.current, flagRef.current, heading, wheelie);
        wasMoving.current = true;
      }
    }
  });

  return (
    <Avatar ref={ref} color={color} name={name} flag={flag} team={team} vehicle={vehicle} sign={sign} modelUrl={modelUrl} wheelieRef={wheelieRef} />
  );
}
