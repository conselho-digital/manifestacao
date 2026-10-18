/**
 * Dimensões da avenida no espaço 3D (plano XZ, Y para cima).
 * A avenida é longa em X e estreita em Z (como uma rua).
 */
export const AVENUE_LENGTH = 200; // eixo X
export const AVENUE_WIDTH = 40; // eixo Z
export const WALK_SPEED = 6; // unidades/segundo
export const AVATAR_RADIUS = 0.5;

export type Facing3D = "up" | "down" | "left" | "right";

export function clampToAvenue(x: number, z: number): { x: number; z: number } {
  const halfL = AVENUE_LENGTH / 2 - AVATAR_RADIUS;
  const halfW = AVENUE_WIDTH / 2 - AVATAR_RADIUS;
  return {
    x: Math.max(-halfL, Math.min(halfL, x)),
    z: Math.max(-halfW, Math.min(halfW, z)),
  };
}
