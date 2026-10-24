/**
 * Dimensões da avenida no espaço 3D (plano XZ, Y para cima).
 * A avenida é longa em X e estreita em Z (como uma rua).
 */
export const AVENUE_LENGTH = 500; // eixo X (2,5x o tamanho anterior)
export const AVENUE_WIDTH = 40; // eixo Z
export const WALK_SPEED = 6; // unidades/segundo (base dos veículos: ver driving.ts)
/** A pé: andar e correr (mais rápidos que a base dos veículos). */
export const FOOT_WALK_SPEED = 4.2;
export const RUN_MULTIPLIER = 2.7;
export const AVATAR_RADIUS = 0.5;

// ── Câmera de terceira pessoa (livre: gira e inclina em torno do personagem) ──
export const CAMERA_DISTANCE = 5.25;
/** Celular: 25% mais perto do personagem que o padrão. */
export const CAMERA_DISTANCE_MOBILE = CAMERA_DISTANCE * 0.75;
/** PC: câmera mais colada no personagem (metade da distância do celular). */
export const CAMERA_DISTANCE_DESKTOP = CAMERA_DISTANCE / 2;
/** Fração da distância da câmera que o olhar avança à frente do personagem — põe a mira (centro da tela) à frente dele, não na cabeça. */
export const CAMERA_LOOK_AHEAD_RATIO = 0.3;
/** Deslocamento lateral da câmera (sobre o ombro direito), como fração da distância. */
export const CAMERA_SHOULDER_RATIO = 0.14;
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
 * Praça do MASP (lado +Z): piso livre sob o prédio suspenso e ao redor, ligado à avenida.
 * x de -PLAZA_HALF_X a +PLAZA_HALF_X; z de AVENUE_WIDTH/2 até PLAZA_MAX_Z.
 */
/** Largura da calçada ao longo da avenida (os prédios começam depois dela) e recuo das viaturas nas pontas. */
export const SIDEWALK_WIDTH = 6;
export const AVENUE_END_MARGIN = 6;
export const PLAZA_HALF_X = 32;
export const PLAZA_MAX_Z = 44;

/**
 * Limite invisível do mapa: a avenida inteira mais o parque (que é uma
 * "extensão" no lado -Z, mais estreita que a avenida). O jogador não passa
 * dessas bordas — nem em posições vindas da rede (ver useAvenueRealtime).
 */
export function clampToAvenue(
  x: number,
  z: number,
  prev?: { x: number; z: number },
): { x: number; z: number } {
  // Nas pontas a avenida é fechada por viaturas (ver City.tsx): o jogador para antes delas.
  const halfL = AVENUE_LENGTH / 2 - AVENUE_END_MARGIN;
  // Avenida + calçadas dos dois lados (os prédios começam na borda da calçada).
  const halfSide = AVENUE_WIDTH / 2 + SIDEWALK_WIDTH - AVATAR_RADIUS;
  const parkHalf = PARK_SIZE / 2 - AVATAR_RADIUS;
  const zMin = -(AVENUE_WIDTH / 2 + PARK_GAP + PARK_SIZE) + AVATAR_RADIUS;
  const plazaHalf = PLAZA_HALF_X - AVATAR_RADIUS;
  const cx = Math.max(-halfL, Math.min(halfL, x));
  let cz = Math.max(zMin, Math.min(PLAZA_MAX_Z - AVATAR_RADIUS, z));
  let cx2 = cx;
  if (cz > halfSide && Math.abs(cx) > plazaHalf) {
    // Fora da largura da praça: vindo da calçada (prev) a borda dela vira parede; já na praça (ou posição da
    // rede, sem prev) a parede é lateral — só trava x.
    if (prev && prev.z <= halfSide) cz = halfSide;
    else cx2 = Math.max(-plazaHalf, Math.min(plazaHalf, cx));
  }
  if (cz < -halfSide && Math.abs(cx) > parkHalf) {
    // Fora da largura do parque: idem (parede na calçada vindo dela; lateral se já dentro do parque).
    if (prev && prev.z >= -halfSide) cz = -halfSide;
    else cx2 = Math.max(-parkHalf, Math.min(parkHalf, cx));
  }
  return { x: cx2, z: cz };
}

/**
 * Palanque com voz (na praça, à frente do museu). Quem está na zona de fala pode usar o microfone; quem está dentro do
 * alcance de escuta ouve, com volume caindo com a distância.
 */
export const STAGE_X = 0;
export const STAGE_Z = 38;
export const STAGE_SPEAK_RADIUS = 6;
export const STAGE_HEAR_RADIUS = 45;
