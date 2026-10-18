/**
 * Dimensões e constantes do mundo (a avenida). Compartilhadas para que
 * cliente e servidor concordem sobre limites, tamanho do avatar e ritmo.
 */

/** Tamanho do mundo em pixels (coordenadas lógicas, não de tela). */
export const WORLD_WIDTH = 3200;
export const WORLD_HEIGHT = 720;

/** Raio de colisão/desenho do avatar, em pixels lógicos. */
export const AVATAR_RADIUS = 16;

/** Velocidade de caminhada do avatar, em pixels lógicos por segundo. */
export const WALK_SPEED = 180;

/** Ticks por segundo do servidor autoritativo (Fase 1+). */
export const TICK_RATE = 15;

/** Direção que o avatar encara. */
export type Facing = "up" | "down" | "left" | "right";

/** Vetor de input de movimento normalizado por eixo (-1, 0 ou 1). */
export interface MoveInput {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

/** Mantém uma posição dentro dos limites do mundo. */
export function clampToWorld(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(AVATAR_RADIUS, Math.min(WORLD_WIDTH - AVATAR_RADIUS, x)),
    y: Math.max(AVATAR_RADIUS, Math.min(WORLD_HEIGHT - AVATAR_RADIUS, y)),
  };
}
