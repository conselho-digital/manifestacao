export interface InputState {
  /** x: direita(+)/esquerda(-), y: frente(+)/trás(-), valores de -1 a 1 */
  x: number;
  y: number;
  /** intensidade do movimento, 0 a 1 */
  mag: number;
  /** andar em vez de correr */
  walk: boolean;
  sprint: boolean;
  /** disparados uma vez por toque/tecla */
  jump: boolean;
  climb: boolean;
  /** id de animação pedida no menu (emote ou ação) */
  emote: string | null;
  /** clipe usado ao andar (estilo de andar) */
  walkClip: string;
}

const keys = new Set<string>();
let touchX = 0;
let touchY = 0;
let touchActive = false;
let sprintHeld = false;
let jumpQ = false;
let climbQ = false;
let emoteQ: string | null = null;
let lookDx = 0;
let walkClip = 'walk';

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  keys.add(e.code);
  if (e.code === 'Space') { jumpQ = true; e.preventDefault(); }
  if (e.code === 'KeyE' || e.code === 'KeyC') climbQ = true;
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

export const queueJump = (): void => { jumpQ = true; };
export const queueClimb = (): void => { climbQ = true; };
export const queueEmote = (id: string): void => { emoteQ = id; };
export const setSprint = (v: boolean): void => { sprintHeld = v; };
export const setWalkClip = (id: string): void => { walkClip = id; };
export const getWalkClip = (): string => walkClip;
export function setTouchVector(x: number, y: number, active: boolean): void {
  touchX = x; touchY = y; touchActive = active;
}
export const addLook = (dx: number): void => { lookDx += dx; };
export function takeLook(): number {
  const d = lookDx;
  lookDx = 0;
  return d;
}

export function readInput(): InputState {
  let x = 0;
  let y = 0;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  let len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; len = 1; }
  let walk = keys.has('ShiftLeft') || keys.has('ShiftRight');
  if (touchActive && Math.hypot(touchX, touchY) > 0.02) {
    x = touchX; y = touchY; len = Math.min(1, Math.hypot(x, y));
    walk = len < 0.5; // empurrar pouco = andar, empurrar muito = correr
  }
  const state: InputState = {
    x, y, mag: len, walk,
    sprint: keys.has('KeyQ') || sprintHeld,
    jump: jumpQ, climb: climbQ, emote: emoteQ, walkClip,
  };
  jumpQ = false;
  climbQ = false;
  emoteQ = null;
  return state;
}
