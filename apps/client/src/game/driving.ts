import { VEHICLES, type VehicleId } from "@manifestacao/shared";
import { WALK_SPEED } from "./world.js";

/** Botões de direção pressionados (touch) ou teclas equivalentes (PC). */
export interface DriveInput {
  accel: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  /** Moto: levanta a roda da frente (empinar). */
  up: boolean;
  /** Moto: abaixa a roda da frente. */
  down: boolean;
}

export const NO_DRIVE_INPUT: DriveInput = { accel: false, brake: false, left: false, right: false, up: false, down: false };

/** Estado do veículo dirigido pelo jogador local. */
export interface DriveState {
  /** Velocidade ao longo da direção do veículo (unidades/s); negativa = ré. */
  speed: number;
  /** Direção em radianos em torno de Y: frente = (sin h, cos h). */
  heading: number;
  /** 0 = rodas no chão, 1 = empinada no máximo. */
  wheelie: number;
}

interface DriveConfig {
  /** Segundos até a velocidade máxima, acelerando. */
  accelTime: number;
  /** Segundos para parar freando da velocidade máxima. */
  brakeTime: number;
  /** Segundos para parar sem acelerar nem frear (atrito). */
  coastTime: number;
  /** Giro máximo (rad/s) em velocidade. */
  turn: number;
  /** Fração da velocidade máxima permitida de ré. */
  reverse: number;
}

const CONFIG: Record<"car" | "moto", DriveConfig> = {
  car: { accelTime: 4.5, brakeTime: 1.4, coastTime: 7, turn: 1.5, reverse: 0.3 },
  moto: { accelTime: 3, brakeTime: 1.1, coastTime: 6, turn: 2.2, reverse: 0.15 },
};
/** Caminhão: mais pesado que o carro (acelera e gira mais devagar). */
const TRUCK: DriveConfig = { accelTime: 6.5, brakeTime: 2, coastTime: 8, turn: 1.0, reverse: 0.25 };

function configOf(vehicle: VehicleId): DriveConfig {
  if (vehicle === "caminhao") return TRUCK;
  return CONFIG[VEHICLES[vehicle]?.kind === "moto" ? "moto" : "car"];
}

export function maxSpeedOf(vehicle: VehicleId): number {
  return WALK_SPEED * (VEHICLES[vehicle]?.speedMul ?? 1);
}

/** Ângulo máximo (radianos) da moto empinada. */
export const WHEELIE_MAX_ANGLE = 0.75;

/**
 * Um passo da física simples de direção: acelerar, frear (e dar ré parado), girar
 * (só gira rodando) e, na moto, empinar enquanto ganha velocidade.
 */
export function stepDrive(state: DriveState, input: DriveInput, vehicle: VehicleId, dt: number): void {
  const cfg = configOf(vehicle);
  const max = maxSpeedOf(vehicle);

  if (input.accel && !input.brake) {
    state.speed = Math.min(max, state.speed + (max / cfg.accelTime) * dt);
  } else if (input.brake && !input.accel) {
    if (state.speed > 0.05) {
      state.speed = Math.max(0, state.speed - (max / cfg.brakeTime) * dt);
    } else {
      // Parado e ainda freando: dá ré, devagar.
      state.speed = Math.max(-max * cfg.reverse, state.speed - (max / (cfg.accelTime * 1.5)) * dt);
    }
  } else {
    const drag = (max / cfg.coastTime) * dt;
    state.speed = Math.abs(state.speed) <= drag ? 0 : state.speed - Math.sign(state.speed) * drag;
  }

  // Só gira com o veículo andando; em ré o volante inverte.
  const grip = Math.min(1, Math.abs(state.speed) / (max * 0.25));
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  state.heading += steer * cfg.turn * grip * Math.sign(state.speed || 1) * dt;

  if (VEHICLES[vehicle]?.kind === "moto") {
    const canWheelie = state.speed > 1.5;
    let w = state.wheelie;
    if (input.up && canWheelie) w += 1.6 * dt;
    else w -= 1.1 * dt;
    if (input.down) w -= 3 * dt;
    state.wheelie = Math.max(0, Math.min(1, canWheelie ? w : w - 2 * dt));
  } else {
    state.wheelie = 0;
  }
}
