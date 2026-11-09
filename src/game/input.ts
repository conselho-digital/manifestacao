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
  /** entrar/sair do carro */
  interact: boolean;
  /** id de animação pedida no menu (emote ou ação) */
  emote: string | null;
  /** clipe usado ao andar (estilo de andar) */
  walkClip: string;
  /** combate */
  fire: boolean;
  aim: boolean;
  reload: boolean;
  switchWeapon: boolean;
  /** carro: acelerador, freio e freio de mão */
  gas: boolean;
  brake: boolean;
  handbrake: boolean;
}

const keys = new Set<string>();
let touchX = 0;
let touchY = 0;
let touchActive = false;
let sprintHeld = false;
let jumpQ = false;
let climbQ = false;
let interactQ = false;
let reloadQ = false;
let switchQ = false;
let emoteQ: string | null = null;
let lookDx = 0;
let lookDy = 0;
let walkClip = 'walk';
let fireHeld = false;
let aimOn = false;
let mouseFire = false;
let mouseAim = false;
let padGas = false;
let padBrake = false;
let padHand = false;

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  keys.add(e.code);
  if (e.code === 'Space') { jumpQ = true; e.preventDefault(); }
  if (e.code === 'KeyE' || e.code === 'KeyC') climbQ = true;
  if (e.code === 'KeyF') interactQ = true;
  if (e.code === 'KeyR') reloadQ = true;
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'KeyX') switchQ = true;
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); mouseFire = false; mouseAim = false; });

export const queueJump = (): void => { jumpQ = true; };
export const queueClimb = (): void => { climbQ = true; };
export const queueInteract = (): void => { interactQ = true; };
export const queueReload = (): void => { reloadQ = true; };
export const queueSwitch = (): void => { switchQ = true; };
export const queueEmote = (id: string): void => { emoteQ = id; };
export const setSprint = (v: boolean): void => { sprintHeld = v; };
export const setFire = (v: boolean): void => { fireHeld = v; };
export const setAim = (v: boolean): void => { aimOn = v; };
export const setPedals = (gas: boolean, brake: boolean, hand: boolean): void => { padGas = gas; padBrake = brake; padHand = hand; };
export const setWalkClip = (id: string): void => { walkClip = id; };
export const getWalkClip = (): string => walkClip;
export function setTouchVector(x: number, y: number, active: boolean): void {
  touchX = x; touchY = y; touchActive = active;
}
export const addLook = (dx: number, dy = 0): void => { lookDx += dx; lookDy += dy; };
/** Quanto o dedo/mouse andou desde a última leitura (px): dx gira, dy inclina. */
export function takeLook(): { dx: number; dy: number } {
  const d = { dx: lookDx, dy: lookDy };
  lookDx = 0;
  lookDy = 0;
  return d;
}

/** PC: clique no jogo trava o mouse (gira a câmera), botão esquerdo atira, direito mira. */
export function initMouse(canvas: HTMLElement): void {
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;
  const locked = (): boolean => document.pointerLockElement === canvas;
  canvas.addEventListener('click', () => { if (!locked()) void canvas.requestPointerLock?.(); });
  window.addEventListener('mousemove', (e) => {
    if (locked() || (e.buttons & 1 && !(e.target instanceof HTMLElement && e.target.closest('.m-hud button, .m-btn')))) { lookDx += e.movementX; lookDy += e.movementY; }
  });
  window.addEventListener('mousedown', (e) => {
    if (!locked()) return;
    if (e.button === 0) mouseFire = true;
    if (e.button === 2) mouseAim = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseFire = false;
    if (e.button === 2) mouseAim = false;
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
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
    jump: jumpQ, climb: climbQ, interact: interactQ, emote: emoteQ, walkClip,
    fire: fireHeld || mouseFire,
    aim: aimOn || mouseAim,
    reload: reloadQ, switchWeapon: switchQ,
    gas: keys.has('KeyW') || keys.has('ArrowUp') || padGas,
    brake: keys.has('KeyS') || keys.has('ArrowDown') || padBrake,
    handbrake: keys.has('Space') || padHand,
  };
  jumpQ = false;
  climbQ = false;
  interactQ = false;
  reloadQ = false;
  switchQ = false;
  emoteQ = null;
  return state;
}
