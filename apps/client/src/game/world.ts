/**
 * Dimensões da avenida no espaço 3D (plano XZ, Y para cima).
 * A avenida é longa em X e estreita em Z (como uma rua).
 */
export const AVENUE_LENGTH = 200; // eixo X
export const AVENUE_WIDTH = 40; // eixo Z
export const WALK_SPEED = 6; // unidades/segundo
export const RUN_MULTIPLIER = 1.7;
export const AVATAR_RADIUS = 0.5;

// ── Câmera de terceira pessoa (livre: gira e inclina em torno do personagem) ──
export const CAMERA_DISTANCE = 14;
/** Celular: 25% mais perto do personagem que o padrão. */
export const CAMERA_DISTANCE_MOBILE = CAMERA_DISTANCE * 0.75;
/** PC: câmera mais colada no personagem (metade da distância do celular). */
export const CAMERA_DISTANCE_DESKTOP = CAMERA_DISTANCE / 2;
/** Fração da distância da câmera que o olhar avança à frente do personagem — põe a mira (centro da tela) à frente dele, não na cabeça. */
export const CAMERA_LOOK_AHEAD_RATIO = 0.3;
/** Altura do ponto que a câmera mira/orbita (ombro/cabeça do personagem). */
export const CAMERA_PIVOT_HEIGHT = 1.5;
/** Inclinação inicial (radianos) — mantém o enquadramento parecido com o antigo offset fixo. */
export const CAMERA_PITCH_DEFAULT = 0.62; // ~35.5°
/**
 * Limites de inclinação — câmera livre de verdade, quase o círculo todo.
 * Só não vai a ±90° exatos (reto pra cima/baixo): nesse ponto o vetor
 * "forward" da câmera fica paralelo ao eixo Y, e o `camera.lookAt` perde a
 * referência de "pra cima" (gimbal lock) — a câmera giraria de forma
 * instável bem na borda. Parar um pouco antes evita esse artefato mantendo
 * a sensação de liberdade total.
 */
export const CAMERA_PITCH_MIN = -1.5; // ~-86°, quase reto de baixo pra cima
export const CAMERA_PITCH_MAX = 1.5; // ~86°, quase reto de cima pra baixo

export function clampPitch(p: number): number {
  return Math.max(CAMERA_PITCH_MIN, Math.min(CAMERA_PITCH_MAX, p));
}

export type Facing3D = "up" | "down" | "left" | "right";

/** Parque arborizado do outro lado da avenida (lado -Z): quadrado PARK_SIZE, com calçada PARK_GAP. */
export const PARK_SIZE = 64;
export const PARK_GAP = 4;

/**
 * Limite invisível do mapa: a avenida inteira mais o parque (que é uma
 * "extensão" no lado -Z, mais estreita que a avenida). O jogador não passa
 * dessas bordas — nem em posições vindas da rede (ver useAvenueRealtime).
 */
export function clampToAvenue(x: number, z: number): { x: number; z: number } {
  const halfL = AVENUE_LENGTH / 2 - AVATAR_RADIUS;
  const halfW = AVENUE_WIDTH / 2 - AVATAR_RADIUS;
  const parkHalf = PARK_SIZE / 2 - AVATAR_RADIUS;
  const zMin = -(AVENUE_WIDTH / 2 + PARK_GAP + PARK_SIZE) + AVATAR_RADIUS;
  const cx = Math.max(-halfL, Math.min(halfL, x));
  let cz = Math.max(zMin, Math.min(halfW, z));
  // Fora da largura do parque, a borda sul da avenida vira parede invisível.
  if (cz < -halfW && Math.abs(cx) > parkHalf) cz = -halfW;
  return { x: cx, z: cz };
}
