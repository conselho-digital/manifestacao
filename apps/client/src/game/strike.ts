/**
 * Golpe com a bandeira ("Bater"): 0,7 s no total — levanta a bandeira para trás (0–0,3), desce rápido (0,3–0,52) e volta
 * ao normal (0,52–1). As curvas daqui movem o braço do personagem (autoAnimate.ts / Avatar.tsx) e a bandeira (Avatar.tsx).
 */
export const STRIKE_SECONDS = 0.7;

const smooth = (a: number, b: number, v: number) => {
  const x = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Progresso 0..1 do golpe que começou em `at` (performance.now); -1 se não há golpe em andamento. */
export function strikeProgress(at: number, now = performance.now()): number {
  if (!(at > 0)) return -1;
  const p = (now - at) / (STRIKE_SECONDS * 1000);
  return p >= 0 && p < 1 ? p : -1;
}

/** Quanto o golpe domina a pose (0..1): entra e sai suave, para não "dar tranco" na caminhada. */
export function strikeEnvelope(p: number): number {
  return smooth(0, 0.15, p) * (1 - smooth(0.85, 1, p));
}

/** Balanço do braço que segura a bandeira (rad; positivo = para a frente; 0 = pendurado). */
export function strikeArm(p: number): number {
  if (p < 0.3) return 1.9 * smooth(0, 0.3, p);
  if (p < 0.52) return 1.9 - 1.2 * smooth(0.3, 0.52, p);
  return 0.7 * (1 - smooth(0.52, 1, p));
}

/** Inclinação do tronco para a frente (rad): um pouco para trás ao levantar, bastante para a frente no golpe. */
export function strikeLean(p: number): number {
  if (p < 0.3) return -0.2 * smooth(0, 0.3, p);
  if (p < 0.52) return -0.2 + 0.75 * smooth(0.3, 0.52, p);
  return 0.55 * (1 - smooth(0.52, 1, p));
}

/** Giro do quadril/tronco (rad) acompanhando o golpe. */
export function strikeTwist(p: number): number {
  return 0.3 * Math.sin(Math.PI * smooth(0.15, 0.7, p));
}

/** Inclinação da própria bandeira em torno da mão (rad; positivo = ponta para a frente). */
export function flagTilt(p: number): number {
  if (p < 0.3) return -0.9 * smooth(0, 0.3, p);
  if (p < 0.52) return -0.9 + 2.45 * smooth(0.3, 0.52, p);
  return 1.55 * (1 - smooth(0.52, 1, p));
}

const ARM_LEN = 0.65;
const SHOULDER_Y = 1.45;
/** Onde fica a mão (altura, distância à frente) com o braço em `armAngle`: a bandeira gira em torno desse ponto. */
export function handPosition(armAngle: number): { y: number; z: number } {
  return { y: SHOULDER_Y - ARM_LEN * Math.cos(armAngle), z: ARM_LEN * Math.sin(armAngle) };
}
