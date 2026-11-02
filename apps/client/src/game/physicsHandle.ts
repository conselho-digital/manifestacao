/**
 * Ponte entre o jogador (Player.tsx, sem dependência do Rapier) e o corpo físico da arena (ArenaWorld.tsx, carregado
 * sob demanda): o Player só fala com esta interface, assim a avenida não paga o custo do WASM do Rapier.
 */
export interface PhysicsHandle {
  /** Centro da cápsula (m). */
  pos(): { x: number; y: number; z: number };
  vel(): { x: number; y: number; z: number };
  setVel(x: number, y: number, z: number): void;
  setPos(x: number, y: number, z: number): void;
  /** true se há chão logo abaixo dos pés (pode pular). */
  grounded(): boolean;
}

/** Cápsula do jogador a pé: meia altura do trecho reto e raio (altura total ~2 m, como o avatar). */
export const PLAYER_HALF_HEIGHT = 0.55;
export const PLAYER_RADIUS = 0.45;
/** Distância do centro da cápsula até a sola dos pés. */
export const PLAYER_FOOT_OFFSET = PLAYER_HALF_HEIGHT + PLAYER_RADIUS;
export const ARENA_GRAVITY: [number, number, number] = [0, -22, 0];
/** Velocidade do pulo (m/s): com a gravidade acima sobe ~1,1 m. */
export const JUMP_SPEED = 7;
