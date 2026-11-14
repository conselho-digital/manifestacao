// Editor "Armas nas mãos": lista de armas à esquerda, o personagem no meio (com o mesmo animador e as mesmas armas do jogo)
// e os controles à direita (posição, giro e escala de cada arma). O resultado é o arquivo `public/weapon-grips.json`.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createCharacter } from '../game/characters';
import { Animator, type Armed } from '../game/anim';
import { WeaponVisual } from '../game/weapons';
import type { RifleKind } from '../game/rifles';
import { cleanGrips, exportGrips, GRIP_KEYS, gripOf, isZeroGrip, setAllGrips, setGrip, zeroGrip, type Grip, type GripKey } from '../game/grips';

interface Pose { id: string; label: string; armed: Armed; clip?: string; swing?: string[]; run?: boolean }
interface Entry { key: GripKey; name: string; group: string; icon: string; poses: Pose[]; rifle?: RifleKind }

const MELEE_POSES: Pose[] = [
  { id: 'idle', label: 'Parado', armed: 'bat', clip: 'bat_idle' },
  { id: 'walk', label: 'Andando', armed: 'bat', clip: 'walk' },
  { id: 'run', label: 'Correndo', armed: 'bat', clip: 'sprint' },
  { id: 'hit', label: 'Batendo', armed: 'bat', swing: ['bat_swing'] },
];
const KNIFE_POSES: Pose[] = [
  { id: 'idle', label: 'Parado', armed: 'knife', clip: 'knife_idle' },
  { id: 'walk', label: 'Andando', armed: 'knife', clip: 'walk' },
  { id: 'run', label: 'Correndo', armed: 'knife', clip: 'sprint' },
  { id: 'hit', label: 'Batendo', armed: 'knife', swing: ['knife_1', 'knife_2', 'knife_3'] },
];
const RIFLE_POSES: Pose[] = [
  { id: 'idle', label: 'Parado', armed: 'rifle', clip: 'gun_idle' },
  { id: 'aim', label: 'Mirando', armed: 'aim', clip: 'gun_idle' },
  { id: 'walk', label: 'Andando', armed: 'rifle', clip: 'walk' },
  { id: 'run', label: 'Correndo', armed: 'rifle', clip: 'run_armed' },
];
const PISTOL_POSES: Pose[] = [
  { id: 'idle', label: 'Parado', armed: 'pistol', clip: 'idle' },
  { id: 'aim', label: 'Mirando', armed: 'pistol_aim', clip: 'arrestgun' },
  { id: 'walk', label: 'Andando', armed: 'pistol', clip: 'walk' },
  { id: 'run', label: 'Correndo', armed: 'pistol', clip: 'run_1armed' },
];
const SPRAY_POSES: Pose[] = [
  { id: 'idle', label: 'Parado', armed: 'spray', clip: 'idle' },
  { id: 'use', label: 'Pintando', armed: 'spray_aim', clip: 'idle' },
  { id: 'walk', label: 'Andando', armed: 'spray', clip: 'walk' },
];

const melee = (key: GripKey, name: string, icon: string, armed: Armed, poses = MELEE_POSES): Entry =>
  ({ key, name, group: 'Armas brancas', icon, poses: poses.map((p) => ({ ...p, armed })) });
const ENTRIES: Entry[] = [
  melee('bat', 'Bandeira', 'bat', 'bat'),
  melee('sign', 'Placa de trânsito', 'sign', 'sign'),
  melee('cricket', 'Taco de críquete', 'cricket', 'cricket'),
  melee('pipe', 'Cano', 'pipe', 'pipe'),
  melee('sickle', 'Foice', 'sickle', 'sickle'),
  melee('axe', 'Machado', 'axe', 'axe'),
  melee('bottle', 'Garrafa quebrada', 'bottle', 'bottle', KNIFE_POSES),
  melee('cleaver', 'Cutelo', 'cleaver', 'cleaver', KNIFE_POSES),
  melee('knife', 'Faca', 'knife', 'knife', KNIFE_POSES),
  { key: 'ak', name: 'AK-47', group: 'Armas de fogo', icon: 'ak', poses: RIFLE_POSES, rifle: 'ak' },
  { key: 'm4', name: 'M4A1', group: 'Armas de fogo', icon: 'm4', poses: RIFLE_POSES, rifle: 'm4' },
  { key: 'm16', name: 'M16', group: 'Armas de fogo', icon: 'm16', poses: RIFLE_POSES, rifle: 'm16' },
  { key: 'hb', name: 'Honey Badger', group: 'Armas de fogo', icon: 'hb', poses: RIFLE_POSES, rifle: 'hb' },
  { key: 'pistol', name: 'Pistola', group: 'Armas de fogo', icon: 'pistol', poses: PISTOL_POSES },
  { key: 'spray', name: 'Lata de spray', group: 'Outros', icon: 'spray', poses: SPRAY_POSES },
];

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

// ---------- cena ----------
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x24303f);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556655, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 6, 4);
scene.add(sun);
const grid = new THREE.GridHelper(8, 32, 0x4a5a70, 0x34414f);
scene.add(grid);
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
camera.position.set(-2.6, 1.5, 2.8);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1.1, 0);
orbit.enableDamping = true;
orbit.minDistance = 0.4;
orbit.maxDistance = 9;
orbit.maxPolarAngle = Math.PI * 0.95;

function resize(): void {
  const w = Math.max(10, view.clientWidth);
  const h = Math.max(10, view.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
resize();

// ---------- estado ----------
let animator: Animator | null = null;
let weapon: WeaponVisual | null = null;
let entry = ENTRIES[0]!;
let pose = entry.poses[0]!;
let paused = false;
let speed = 1;
let follow = true;
let showAxes = true;
let swingIdx = 0;
let swingT = 0;
let axes: THREE.AxesHelper | null = null;
const status = mk('div');
status.id = 'status';
let statusTimer = 0;
const say = (t: string): void => { status.textContent = t; clearTimeout(statusTimer); statusTimer = window.setTimeout(() => { status.textContent = ''; }, 3500); };

// ---------- salvar / carregar ----------
const LS = 'arena-grips-edit';
function persist(): void { try { localStorage.setItem(LS, exportGrips()); } catch { /* sem armazenamento */ } }
async function loadInitial(): Promise<void> {
  let published = new Map<GripKey, Grip>();
  try {
    const r = await fetch('/weapon-grips.json', { cache: 'no-cache' });
    if (r.ok) published = cleanGrips(await r.json());
  } catch { /* sem arquivo */ }
  setAllGrips(published);
  try {
    const mine = localStorage.getItem(LS);
    if (mine) setAllGrips(cleanGrips(JSON.parse(mine)));
  } catch { /* edição local inválida: ignora */ }
}

// ---------- animação ----------
function applyPose(): void {
  if (!animator || !weapon) return;
  animator.setArmed(pose.armed);
  weapon.setMode(pose.armed);
  if (entry.rifle) { animator.setRifleKind(entry.rifle); weapon.setRifleKind(entry.rifle); }
  animator.setAimPitch(0);
  swingIdx = 0;
  swingT = 0;
  if (pose.swing) animator.restart(pose.swing[0]!);
  else if (pose.clip) animator.play(animator.has(pose.clip) ? pose.clip : 'idle');
}

let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (animator && !paused) {
    animator.update(dt * speed);
    if (pose.swing) {
      swingT += dt * speed;
      const id = pose.swing[swingIdx % pose.swing.length]!;
      if (swingT > animator.length(id) + 0.45) {
        swingIdx++;
        swingT = 0;
        animator.restart(pose.swing[swingIdx % pose.swing.length]!);
      }
    }
  }
  if (weapon && follow) {
    const p = weapon.heldPosition(new THREE.Vector3());
    const mid = new THREE.Vector3(0, 1.1, 0).lerp(p, 0.6);
    orbit.target.lerp(mid, 0.12);
  }
  orbit.update();
  renderer.render(scene, camera);
}

// ---------- interface ----------
const list = $('list');
const itemEls = new Map<GripKey, HTMLButtonElement>();
function buildList(): void {
  let group = '';
  for (const e of ENTRIES) {
    if (e.group !== group) { group = e.group; list.append(mk('h2', '', group)); }
    const b = mk('button', 'item');
    const img = mk('img');
    img.src = `/hud/w-${e.icon}.png`;
    img.alt = '';
    b.append(img, mk('span', 'nm', e.name), mk('span', 'dot'));
    b.onclick = () => select(e);
    list.append(b);
    itemEls.set(e.key, b);
  }
}
function markList(): void {
  for (const e of ENTRIES) {
    const b = itemEls.get(e.key)!;
    b.classList.toggle('on', e === entry);
    b.classList.toggle('mod', !isZeroGrip(gripOf(e.key)));
  }
}

const poseBar = $('poses');
function buildPoses(): void {
  poseBar.textContent = '';
  const seg = mk('div', 'seg');
  for (const p of entry.poses) {
    const b = mk('button', p === pose ? 'on' : '', p.label);
    b.onclick = () => { pose = p; applyPose(); buildPoses(); };
    seg.append(b);
  }
  const pause = mk('button', paused ? 'on' : '', paused ? '▶ Continuar' : '⏸ Pausar');
  pause.onclick = () => { paused = !paused; buildPoses(); };
  const sp = mk('select');
  for (const v of [0.25, 0.5, 1, 1.5]) { const o = mk('option', '', `Velocidade ${v}x`); o.value = String(v); o.selected = v === speed; sp.append(o); }
  sp.onchange = () => { speed = Number(sp.value); };
  poseBar.append(seg, pause, sp);
}

const camBar = $('camb');
function placeCamera(dx: number, dy: number, dz: number, dist: number): void {
  const t = orbit.target;
  camera.position.set(t.x + dx * dist, t.y + dy * dist, t.z + dz * dist);
}
function buildCamBar(): void {
  camBar.textContent = '';
  const views: [string, number, number, number, number][] = [
    ['Frente', 0, 0.1, 1, 2.6], ['Lado direito', -1, 0.1, 0, 2.6], ['Lado esquerdo', 1, 0.1, 0, 2.6], ['Costas', 0, 0.1, -1, 2.6], ['De cima', 0, 1, 0.01, 2.6], ['Perto da mão', -1, 0.25, 0.8, 1.0],
  ];
  for (const [n, x, y, z, d] of views) { const b = mk('button', '', n); b.onclick = () => placeCamera(x, y, z, d); camBar.append(b); }
  const f = mk('button', follow ? 'on' : '', 'Seguir a arma');
  f.onclick = () => { follow = !follow; buildCamBar(); };
  const a = mk('button', showAxes ? 'on' : '', 'Mostrar eixos');
  a.onclick = () => { showAxes = !showAxes; buildCamBar(); mountAxes(); };
  camBar.append(f, a);
}

function mountAxes(): void {
  if (axes) { axes.removeFromParent(); axes.geometry.dispose(); axes = null; }
  const frameG = weapon?.gripFrame(entry.key);
  if (!frameG || !showAxes) return;
  axes = new THREE.AxesHelper(0.3);
  const m = axes.material as THREE.LineBasicMaterial;
  m.depthTest = false;
  axes.renderOrder = 10;
  frameG.add(axes);
}

const ctl = $('ctl');
const sliders: { get: () => number; set: (v: number) => void; range: HTMLInputElement; num: HTMLInputElement }[] = [];
function row(label: string, color: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void): HTMLElement {
  const r = mk('div', 'row');
  const l = mk('label');
  const sw = mk('span', 'axis');
  sw.style.background = color;
  l.append(sw, label);
  const range = mk('input');
  range.type = 'range';
  range.min = String(min); range.max = String(max); range.step = String(step);
  const num = mk('input');
  num.type = 'number';
  num.min = String(min); num.max = String(max); num.step = String(step);
  const sync = (): void => { const v = get(); range.value = String(v); num.value = String(Math.round(v * 100) / 100); };
  range.oninput = () => { set(Number(range.value)); sync(); };
  num.onchange = () => { const v = Number(num.value); if (Number.isFinite(v)) { set(Math.max(min, Math.min(max, v))); } sync(); };
  sync();
  sliders.push({ get, set, range, num });
  r.append(l, range, num);
  return r;
}

function commit(key: GripKey, g: Grip): void {
  setGrip(key, g);
  weapon?.refreshGrips();
  persist();
  markList();
}
const cur = (key: GripKey): Grip => { const g = gripOf(key); return { p: [...g.p], r: [...g.r], s: g.s }; };

function buildControls(): void {
  ctl.textContent = '';
  sliders.length = 0;
  const key = entry.key; // os controles são desta arma, mesmo que um evento atrasado chegue depois de trocar de arma
  ctl.append(mk('div', 'title', entry.name));
  const pad = mk('div', 'pad');
  pad.append(mk('p', 'hint', 'Mexa nos valores e veja a arma na mão do personagem. Os eixos desenhados (vermelho X, verde Y, azul Z) são os da arma: Z aponta ao longo do cabo/cano.'));
  const axisNames = ['X (lado)', 'Y (cima/baixo)', 'Z (ao longo)'];
  const axisCol = ['#e5694a', '#3fbf6f', '#4f9bff'];
  pad.append(mk('h2', '', 'Posição (cm)'));
  for (let i = 0; i < 3; i++) {
    pad.append(row(axisNames[i]!, axisCol[i]!, -40, 40, 0.5, () => cur(key).p[i]! * 100, (v) => { const g = cur(key); g.p[i] = v / 100; commit(key, g); }));
  }
  pad.append(mk('h2', '', 'Giro (graus)'));
  for (let i = 0; i < 3; i++) {
    pad.append(row(['Em X', 'Em Y', 'Em Z (cabo)'][i]!, axisCol[i]!, -180, 180, 1, () => cur(key).r[i]!, (v) => { const g = cur(key); g.r[i] = v; commit(key, g); }));
  }
  pad.append(mk('h2', '', 'Tamanho'));
  pad.append(row('Escala %', '#93a1b3', 50, 200, 1, () => cur(key).s * 100, (v) => { const g = cur(key); g.s = v / 100; commit(key, g); }));

  const nudge = mk('div', 'btns');
  const nb = (label: string, fn: () => void): void => { const b = mk('button', '', label); b.onclick = fn; nudge.append(b); };
  nb('↺ Girar 90° no cabo', () => { const g = cur(key); g.r[2] = ((g.r[2] + 90 + 180) % 360) - 180; commit(key, g); refreshSliders(); });
  nb('⇄ Inverter cabo (180° em X)', () => { const g = cur(key); g.r[0] = ((g.r[0] + 180 + 180) % 360) - 180; commit(key, g); refreshSliders(); });
  pad.append(mk('h2', '', 'Atalhos'), nudge);

  const btns = mk('div', 'btns');
  const bt = (label: string, cls: string, fn: () => void): void => { const b = mk('button', cls, label); b.onclick = fn; btns.append(b); };
  bt('Zerar esta arma', 'warn', () => { commit(key, zeroGrip()); refreshSliders(); say('Arma zerada.'); });
  bt('Zerar todas', 'warn', () => { setAllGrips(new Map()); weapon?.refreshGrips(); persist(); markList(); refreshSliders(); say('Todas zeradas.'); });
  pad.append(mk('h2', '', 'Salvar'), btns);

  const out = mk('div', 'btns');
  const ob = (label: string, fn: () => void): void => { const b = mk('button', '', label); b.onclick = fn; out.append(b); };
  ob('Copiar JSON', () => { void copy(exportGrips()); });
  ob('Baixar arquivo', download);
  ob('Colar JSON…', togglePaste);
  pad.append(out);
  pad.append(mk('p', 'hint', 'Suas edições ficam salvas neste navegador. Para valer no jogo, copie o JSON e mande para publicar como public/weapon-grips.json.'));
  paste.hidden = true;
  pad.append(paste, pasteOk);
  ctl.append(pad, status);
}
function refreshSliders(): void { for (const s of sliders) { const v = s.get(); s.range.value = String(v); s.num.value = String(Math.round(v * 100) / 100); } }

const paste = mk('textarea');
paste.placeholder = '{ "grips": { … } }';
const pasteOk = mk('button', '', 'Aplicar JSON colado');
pasteOk.hidden = true;
pasteOk.onclick = () => {
  try {
    const m = cleanGrips(JSON.parse(paste.value));
    setAllGrips(m);
    weapon?.refreshGrips();
    persist();
    markList();
    refreshSliders();
    say(`Aplicado (${m.size} arma${m.size === 1 ? '' : 's'}).`);
  } catch { say('JSON inválido.'); }
};
function togglePaste(): void { paste.hidden = !paste.hidden; pasteOk.hidden = paste.hidden; if (!paste.hidden) paste.focus(); }

async function copy(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); say('JSON copiado.'); }
  catch {
    paste.hidden = false; pasteOk.hidden = false; paste.value = text; paste.select();
    say('Selecione e copie o texto abaixo (Ctrl+C).');
  }
}
function download(): void {
  const a = mk('a');
  a.href = URL.createObjectURL(new Blob([exportGrips()], { type: 'application/json' }));
  a.download = 'weapon-grips.json';
  a.click();
  URL.revokeObjectURL(a.href);
  say('Arquivo baixado.');
}

function select(e: Entry): void {
  entry = e;
  pose = e.poses[0]!;
  applyPose();
  buildPoses();
  buildControls();
  mountAxes();
  markList();
}

// ---------- início ----------
async function start(): Promise<void> {
  buildList();
  await loadInitial();
  const obj = await createCharacter('Carlos');
  scene.add(obj);
  animator = await Animator.create(obj);
  if (!animator) { $('load').textContent = 'Não consegui carregar as animações.'; return; }
  weapon = new WeaponVisual(obj);
  weapon.bind(animator);
  for (let i = 0; i < 80 && !animator.has('bat_swing'); i++) await new Promise((r) => setTimeout(r, 150)); // clipes extras
  await new Promise((r) => setTimeout(r, 600)); // modelos das armas
  weapon.refreshGrips();
  $('load').remove();
  buildCamBar();
  select(entry);
  requestAnimationFrame(frame);
  const w = window as unknown as { __armas: unknown };
  w.__armas = { select: (k: string) => { const e = ENTRIES.find((x) => x.key === k); if (e) select(e); }, pose: (id: string) => { const p = entry.poses.find((x) => x.id === id); if (p) { pose = p; applyPose(); buildPoses(); } }, keys: GRIP_KEYS };
}
void start();
