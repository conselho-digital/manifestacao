export interface InputState {
  /** x: direita(+)/esquerda(-), y: frente(+)/trás(-), valores de -1 a 1 */
  x: number;
  y: number;
  /** Shift pressionado: andar em vez de correr */
  walk: boolean;
}

const keys = new Set<string>();
window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

export function readInput(): InputState {
  let x = 0;
  let y = 0;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  const len = Math.hypot(x, y);
  const walk = keys.has('ShiftLeft') || keys.has('ShiftRight');
  return len > 1 ? { x: x / len, y: y / len, walk } : { x, y, walk };
}
