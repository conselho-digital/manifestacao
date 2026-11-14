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
  /** alterna agachado */
  crouch: boolean;
  /** o botão de agachar está pressionado agora (depois da rolagem, segurar = ficar agachado) */
  crouchHeld: boolean;
  /** entrar/sair do carro */
  interact: boolean;
  /** clipe usado ao andar (estilo de andar) */
  /** combate */
  fire: boolean;
  aim: boolean;
  reload: boolean;
  switchWeapon: boolean;
  /** -1 arma anterior, +1 próxima (arrastar o botão de arma); 0 nada */
  weaponStep: number;
  /** id da arma escolhida no menu de seleção (null = nenhuma) */
  weaponPick: number | null;
  /** carro: acelerador, freio e freio de mão */
  gas: boolean;
  brake: boolean;
  handbrake: boolean;
  /** buzina (tecla H ou botão) */
  horn: boolean;
  /** liga/desliga as luzes da viatura (tecla L ou botão): vale uma vez por toque */
  lights: boolean;
  /** moto: empinar */
  wheelie: boolean;
}

const keys = new Set<string>();
let touchX = 0;
let touchY = 0;
let touchActive = false;
let sprintHeld = false;
let sprintUntil = 0; // corre por mais 500 ms depois de soltar o botão
const SPRINT_LINGER = 500;
let jumpQ = false;
let climbQ = false;
let crouchQ = false;
let crouchTouch = false;
let interactQ = false;
let reloadQ = false;
let switchQ = false;
let stepQ = 0;
let pickQ: number | null = null;
let lookDx = 0;
let lookDy = 0;
let fireHeld = false;
let aimOn = false;
let mouseFire = false;
let mouseAim = false;
let padGas = false;
let padBrake = false;
let padHand = false;
let padHorn = false;
let lightsQ = false;
let padWheelie = false;

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  keys.add(e.code);
  if (e.code === 'Space') { jumpQ = true; e.preventDefault(); }
  if (e.code === 'KeyE') climbQ = true;
  if (e.code === 'KeyF') interactQ = true;
  if (e.code === 'KeyL' && !e.repeat) lightsQ = true;
  if (e.code === 'KeyZ' || e.code === 'ControlLeft') { crouchQ = true; if (e.code === 'ControlLeft') e.preventDefault(); }
  if (e.code === 'KeyR') reloadQ = true;
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'KeyX') switchQ = true;
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); mouseFire = false; mouseAim = false; });

export const queueJump = (): void => { jumpQ = true; };
export const queueCrouch = (): void => { crouchQ = true; };
export const setCrouchHeld = (on: boolean): void => { crouchTouch = on; };
export const queueClimb = (): void => { climbQ = true; };
export const queueInteract = (): void => { interactQ = true; };
export const queueReload = (): void => { reloadQ = true; };
export const queueSwitch = (): void => { switchQ = true; };
export const queueWeaponStep = (dir: number): void => { stepQ = dir < 0 ? -1 : 1; };
export const queueWeaponPick = (id: number): void => { pickQ = id; };
export const setSprint = (v: boolean): void => { sprintHeld = v; };
export const setFire = (v: boolean): void => { fireHeld = v; };
export const setAim = (v: boolean): void => { aimOn = v; };
export const setWheelie = (v: boolean): void => { padWheelie = v; };
export const queueLights = (): void => { lightsQ = true; };
export const setHorn = (on: boolean): void => { padHorn = on; };
export const setPedals = (gas: boolean, brake: boolean, hand: boolean): void => { padGas = gas; padBrake = brake; padHand = hand; };
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
  // roda do mouse troca de arma (só com o mouse preso ao jogo)
  window.addEventListener('wheel', (e) => {
    if (!locked() || e.deltaY === 0) return;
    stepQ = e.deltaY > 0 ? 1 : -1;
  }, { passive: true });
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
  // andar devagar é o padrão (joystick ou WASD, não importa o quanto empurra); só o Sprint corre
  const walk = true;
  if (touchActive && Math.hypot(touchX, touchY) > 0.02) {
    x = touchX; y = touchY; len = Math.min(1, Math.hypot(x, y));
  }
  const sprintDown = keys.has('KeyQ') || keys.has('ShiftLeft') || keys.has('ShiftRight') || sprintHeld;
  const now = performance.now();
  if (sprintDown) sprintUntil = now + SPRINT_LINGER;
  const state: InputState = {
    x, y, mag: len, walk,
    sprint: sprintDown || (now < sprintUntil && len > 0.02),
    jump: jumpQ, climb: climbQ, crouch: crouchQ, crouchHeld: keys.has('KeyZ') || keys.has('ControlLeft') || crouchTouch, interact: interactQ,
    fire: fireHeld || mouseFire,
    aim: aimOn || mouseAim,
    reload: reloadQ, switchWeapon: switchQ, weaponStep: stepQ, weaponPick: pickQ,
    gas: keys.has('KeyW') || keys.has('ArrowUp') || padGas,
    brake: keys.has('KeyS') || keys.has('ArrowDown') || padBrake,
    handbrake: keys.has('Space') || padHand,
    horn: keys.has('KeyH') || padHorn,
    lights: lightsQ,
    wheelie: keys.has('KeyV') || padWheelie,
  };
  jumpQ = false;
  climbQ = false;
  crouchQ = false;
  interactQ = false;
  lightsQ = false;
  reloadQ = false;
  switchQ = false;
  stepQ = 0;
  pickQ = null;
  return state;
}
