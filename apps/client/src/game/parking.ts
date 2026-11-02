/**
 * Veículo estacionado ao lado do personagem: posição, porta do motorista, linha do tempo de entrar e colisão.
 * Convenção do jogo: frente do veículo = (sin h, cos h); +X local é o lado ESQUERDO (onde fica o motorista).
 */
import type { VehicleId } from "@manifestacao/shared";
import { VEHICLES } from "@manifestacao/shared";
import type { SolidCircle } from "./solids.js";

export interface ParkedPose {
  x: number;
  z: number;
  heading: number;
}

/** Medidas (m) por veículo: largura, comprimento (colisão) e a porta falsa do motorista (carros). */
interface VehicleBody {
  width: number;
  length: number;
  /** Porta: dobradiça no X lateral e Z (frente da porta), comprimento, altura de baixo e de cima. Moto: sem porta. */
  door?: { hingeX: number; hingeZ: number; length: number; y0: number; y1: number };
}
const BODY: Record<Exclude<VehicleId, "nenhum">, VehicleBody> = {
  moto: { width: 0.8, length: 2.1 },
  moto2: { width: 0.8, length: 2.2 },
  carro: { width: 2.0, length: 4.4, door: { hingeX: 0.98, hingeZ: 0.45, length: 1.1, y0: 0.5, y1: 1.25 } },
  carro_som: { width: 2.1, length: 5.2, door: { hingeX: 1.02, hingeZ: 0.5, length: 1.1, y0: 0.55, y1: 1.4 } },
  caminhao: { width: 2.6, length: 8, door: { hingeX: 1.28, hingeZ: 2.0, length: 1.2, y0: 0.7, y1: 2.0 } },
};
export const bodyOf = (v: VehicleId): VehicleBody | null => (v === "nenhum" ? null : BODY[v]);
export const hasDoor = (v: VehicleId): boolean => !!bodyOf(v)?.door;

/** Vetores unitários do veículo no plano XZ. */
export const forwardOf = (h: number) => ({ x: Math.sin(h), z: Math.cos(h) });
export const leftOf = (h: number) => ({ x: Math.cos(h), z: -Math.sin(h) });

/** Onde o veículo aparece: ao lado direito de quem olha para `rotationY`, com a lateral esquerda (porta) virada para ele. */
export function spawnBeside(me: { x: number; z: number; rotationY: number }, vehicle: VehicleId): ParkedPose {
  const body = bodyOf(vehicle);
  const gap = (body?.width ?? 1) / 2 + 1.3;
  const f = forwardOf(me.rotationY);
  const right = { x: -f.z, z: f.x };
  return { x: me.x + right.x * gap + f.x * 0.6, z: me.z + right.z * gap + f.z * 0.6, heading: me.rotationY };
}

/** Ponto em pé junto à porta (ou ao flanco da moto): lado esquerdo, na altura do banco do motorista. */
export function doorPoint(pose: ParkedPose, vehicle: VehicleId): { x: number; z: number } {
  const body = bodyOf(vehicle);
  const l = leftOf(pose.heading);
  const f = forwardOf(pose.heading);
  const off = (body?.width ?? 1) / 2 + 0.75;
  const along = body?.door ? body.door.hingeZ - body.door.length / 2 : 0;
  return { x: pose.x + l.x * off + f.x * along, z: pose.z + l.z * off + f.z * along };
}

/** Círculos de colisão ao longo do comprimento do veículo estacionado (a pé não atravessa). */
export function parkedCircles(pose: ParkedPose, vehicle: VehicleId): SolidCircle[] {
  const body = bodyOf(vehicle);
  if (!body) return [];
  const r = body.width / 2;
  const n = Math.max(1, Math.round(body.length / body.width));
  const f = forwardOf(pose.heading);
  const out: SolidCircle[] = [];
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : (i / (n - 1) - 0.5) * (body.length - body.width);
    out.push({ x: pose.x + f.x * k, z: pose.z + f.z * k, r });
  }
  return out;
}

const smooth = (a: number, b: number, v: number) => {
  const x = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Linha do tempo (s) de entrar: chegar na porta, abrir, deslizar para o banco, fechar. Moto: sem porta. */
export interface BoardTimes {
  walkEnd: number;
  openEnd: number;
  seatEnd: number;
  closeEnd: number;
}
export const boardTimes = (v: VehicleId): BoardTimes =>
  hasDoor(v) ? { walkEnd: 0.6, openEnd: 1.0, seatEnd: 1.4, closeEnd: 1.7 } : { walkEnd: 0.5, openEnd: 0.5, seatEnd: 0.9, closeEnd: 1.0 };

/** Porta aberta (0..1) conforme o tempo desde o início de entrar. */
export function doorOpenOnBoard(v: VehicleId, t: number): number {
  const b = boardTimes(v);
  return smooth(b.walkEnd, b.openEnd, t) * (1 - smooth(b.seatEnd, b.closeEnd, t));
}
/** Porta aberta (0..1) ao descer: abre, espera um instante e fecha. */
export function doorOpenOnExit(t: number): number {
  return smooth(0, 0.3, t) * (1 - smooth(0.7, 1.0, t));
}

/** Estado da animação da porta do veículo LOCAL (lido a cada quadro pelo desenho; fora do React). */
export const localDoor: { t0: number; kind: "board" | "exit" | null; vehicle: VehicleId } = { t0: 0, kind: null, vehicle: "nenhum" };
export function startDoor(kind: "board" | "exit", vehicle: VehicleId): void {
  localDoor.t0 = performance.now();
  localDoor.kind = kind;
  localDoor.vehicle = vehicle;
}
export function localDoorOpen(now = performance.now()): number {
  if (!localDoor.kind) return 0;
  const t = (now - localDoor.t0) / 1000;
  const v = localDoor.kind === "board" ? doorOpenOnBoard(localDoor.vehicle, t) : doorOpenOnExit(t);
  if (t > 3) localDoor.kind = null;
  return v;
}

/** Perto o bastante do veículo para entrar (m, do centro até o ponto da porta ou do veículo). */
export const ENTER_RANGE = 3.2;
export function canEnter(me: { x: number; z: number }, pose: ParkedPose, vehicle: VehicleId): boolean {
  const d = doorPoint(pose, vehicle);
  return Math.hypot(me.x - d.x, me.z - d.z) <= ENTER_RANGE || Math.hypot(me.x - pose.x, me.z - pose.z) <= ENTER_RANGE;
}

/** Só sai do veículo parado (m/s). */
export const EXIT_MAX_SPEED = 1.5;
export const isVehicleKind = (v: VehicleId) => VEHICLES[v]?.kind !== "foot";

/** Pedido do Game ao Player: entrar (linha do tempo andando até a porta) ou descer (coloca ao lado da porta). */
export interface BoardOrder {
  kind: "enter" | "exit";
  vehicle: VehicleId;
  pose: ParkedPose;
  from: { x: number; z: number };
  t0: number;
}
