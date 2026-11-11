// Ferramenta de desenvolvimento: mostra um personagem em poses fixas (lado e frente) para revisar animações.
// Uso: /dev/anim-viewer.html?char=Carlos  ->  window.V.sheet('walk', 8, 'none', 0)
import * as THREE from 'three';
import { createCharacter, type CharacterName } from '../src/game/characters';
import { Animator, type Armed } from '../src/game/anim';
import { WeaponVisual } from '../src/game/weapons';

const params = new URLSearchParams(location.search);
const name = (params.get('char') ?? 'Carlos') as CharacterName;
const W = 1800;
const H = Number(params.get("h") ?? 700);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb7d4);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556655, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(3, 6, 4);
scene.add(sun);
const grid = new THREE.GridHelper(20, 40, 0x445566, 0x667788);
scene.add(grid);

const obj = await createCharacter(name);
scene.add(obj);
const animator = await Animator.create(obj);
const weapon = new WeaponVisual(obj);
if (!animator) throw new Error('sem animador para ' + name);
weapon.bind(animator);
await new Promise((r) => setTimeout(r, 1500)); // clipes extras + rifle carregam

const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

function tile(col: number, cols: number, row: number, rows: number, view: 'side' | 'front' | 'top' | 'cam' | 'closeR' | 'closeB' | 'closeL' | 'closeF' | 'hand' | 'handL'): void {
  const w = W / cols;
  const h = H / rows;
  const x = col * w;
  const y = (rows - 1 - row) * h;
  renderer.setViewport(x, y, w, h);
  renderer.setScissor(x, y, w, h);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  const c = new THREE.Vector3(0, 0.95, 0);
  if (view === 'side') cam.position.set(5.2, 1.1, 0);
  else if (view === 'front') cam.position.set(0, 1.1, 5.2);
  else if (view === 'hand') { cam.position.set(-0.75, 1.5, 1.15); c.set(0, 1.3, 0.4); }
  else if (view === 'handL') { cam.position.set(0.75, 1.5, 1.15); c.set(0, 1.3, 0.4); }
  else if (view === 'closeF') { cam.position.set(0, 1.25, 2.6); c.set(0, 1.1, 0); }
  else if (view === 'closeR') { cam.position.set(-2.4, 1.5, 0.3); c.set(0, 1.35, 0.3); }
  else if (view === 'closeL') { cam.position.set(2.4, 1.5, 0.3); c.set(0, 1.35, 0.3); }
  else if (view === 'closeB') { cam.position.set(-0.7, 1.75, -1.7); c.set(0, 1.4, 0.5); }
  else if (view === 'cam') { cam.position.set(-1.4, 1.75, -3.2); c.set(0, 1.35, 0.8); }
  else { cam.position.set(0, 6.2, 0.01); c.set(0, 0.5, 0); }
  cam.lookAt(c);
  renderer.render(scene, cam);
}

const V = {
  /** Soco (jab): n instantes do golpe. */
  jabSheet(n: number, views: ('side' | 'front' | 'cam' | 'closeR' | 'closeF')[] = ['side', 'front']): void {
    renderer.setScissor(0, 0, W, H);
    renderer.setViewport(0, 0, W, H);
    renderer.clear();
    for (let i = 0; i < n; i++) {
      animator.play('idle');
      animator.setArmed('none');
      animator.seek('idle', 0);
      animator.jab();
      const frames = Math.round(((i + 0.5) / n) * 0.42 * 60);
      for (let f = 0; f < frames; f++) animator.update(1 / 60);
      views.forEach((v, r) => tile(i, n, r, views.length, v));
    }
  },
  /** Rebatida de beisebol (por código): n instantes do golpe, depois de calibrar o taco no bat_idle. */
  swingSheet(n: number, views: ('side' | 'front' | 'top' | 'cam' | 'closeR' | 'closeF')[] = ['side', 'front', 'top'], armed: Armed = 'bat'): void {
    animator.setArmed(armed);
    weapon.setMode(armed);
    animator.play('bat_idle');
    for (let f = 0; f < 20; f++) animator.update(1 / 30);
    renderer.setScissor(0, 0, W, H);
    renderer.setViewport(0, 0, W, H);
    renderer.clear();
    const total = 0.8;
    for (let i = 0; i < n; i++) {
      for (let f = 0; f < 90; f++) animator.update(1 / 60); // termina o golpe anterior (e o cooldown)
      animator.baseball();
      const frames = Math.round(((i + 0.5) / n) * total * 60);
      for (let f = 0; f < frames; f++) animator.update(1 / 60);
      views.forEach((v, r) => tile(i, n, r, views.length, v));
    }
  },
  /** Simula o jogo: toca o clipe por n quadros de 1/30 s (suavizações reais) e desenha 1 tile. */
  live(clip: string, armed: Armed, pitch: number, frames: number, view: 'side' | 'cam' | 'closeR' | 'closeB' | 'front'): void {
    animator.setArmed(armed);
    weapon.setMode(armed);
    animator.setAimPitch(pitch);
    animator.play(clip);
    for (let i = 0; i < frames; i++) { animator.setAimPitch(pitch); animator.update(1 / 30); }
    renderer.setScissor(0, 0, W, H);
    renderer.setViewport(0, 0, W, H);
    renderer.clear();
    tile(0, 1, 0, 1, view);
  },
  /** Clarão de tiro na boca da arma (confere de onde o tiro sai). */
  muzzle(clip: string, armed: Armed, pitch: number, view: 'side' | 'closeR' | 'closeF' | 'closeL' | 'hand'): void {
    animator.setArmed(armed);
    weapon.setMode(armed);
    animator.setAimPitch(pitch);
    weapon.setPitch(pitch);
    animator.seek(clip, 0.3);
    weapon.flash();
    const m = weapon.muzzle(new THREE.Vector3());
    const mark = new THREE.Mesh(new THREE.SphereGeometry(0.03), new THREE.MeshBasicMaterial({ color: 0x00ff66, depthTest: false }));
    mark.position.copy(m);
    mark.renderOrder = 20;
    scene.add(mark);
    renderer.setScissor(0, 0, W, H);
    renderer.setViewport(0, 0, W, H);
    renderer.clear();
    tile(0, 1, 0, 1, view);
    scene.remove(mark);
  },
  clips: (): string[] => [...(animator as unknown as { actions: Map<string, unknown> }).actions.keys()],
  /** n poses de um clipe em 2 vistas (lado em cima, frente embaixo). */
  sheet(clip: string, n: number, armed: Armed = 'none', pitch = 0, views: ('side' | 'front' | 'top' | 'cam' | 'closeR' | 'closeB' | 'closeL' | 'closeF' | 'hand' | 'handL')[] = ['side', 'front']): number {
    animator.play(clip);
    animator.setArmed(armed);
    weapon.setMode(armed === 'none' ? 'none' : armed);
    animator.setAimPitch(pitch);
    weapon.setPitch(pitch);
    const dur = animator.duration(clip);
    renderer.setScissor(0, 0, W, H);
    renderer.setViewport(0, 0, W, H);
    renderer.clear();
    for (let i = 0; i < n; i++) {
      animator.seek(clip, (dur * i) / n);
      views.forEach((v, r) => tile(i, n, r, views.length, v));
    }
    return dur;
  },
};
(window as unknown as { V: typeof V }).V = V;
(window as unknown as { READY: boolean }).READY = true;

/** Posição (no espaço do personagem) de cada osso, para comparar com cálculos fora do navegador. */
(V as unknown as Record<string, unknown>).bones = (clip: string, t: number): Record<string, number[]> => {
  animator.seek(clip, t);
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const out: Record<string, number[]> = {};
  obj.traverse((o) => {
    if ((o as THREE.Bone).isBone) {
      const p = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      out[o.name] = [p.x, p.y, p.z].map((v) => Math.round(v * 1000) / 1000);
    }
  });
  return out;
};
