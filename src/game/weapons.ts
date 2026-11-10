import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ArmedMode = Armed;

import type { Animator, Armed } from './anim';

const loader = new GLTFLoader();
let rifleSrc: Promise<THREE.Object3D> | null = null;
const loadRifle = (): Promise<THREE.Object3D> => (rifleSrc ??= loader.loadAsync('/models/weapons/AK47.glb').then((g) => g.scene));

let flagSrc: Promise<THREE.Object3D> | null = null;
const loadFlag = (): Promise<THREE.Object3D> => (flagSrc ??= loader.loadAsync('/models/weapons/flag-turkey.glb').then((g) => g.scene));

let flashTex: THREE.Texture | null = null;
function flashTexture(): THREE.Texture {
  if (flashTex) return flashTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,220,1)');
  grad.addColorStop(0.4, 'rgba(255,190,60,.85)');
  grad.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  flashTex = new THREE.CanvasTexture(c);
  return flashTex;
}

/** AK-47 na mão do personagem (fica na frente do peito) + clarão do cano. */
export class WeaponVisual {
  private readonly anchor = new THREE.Group();
  private readonly flashSprite: THREE.Sprite;
  private rifleInner: THREE.Object3D | null = null;
  private readonly pistolInner = buildPistol();
  private readonly batAnchor = new THREE.Group();
  private flashT = 0;
  private mode: ArmedMode = 'none';
  private ready = false;
  private bound = false;
  private animator: Animator | null = null;
  private hidden = false;
  private suppressed = false;

  constructor(root: THREE.Object3D) {
    this.anchor.visible = false;
    root.add(this.anchor);
    this.anchor.add(this.pistolInner);
    this.pistolInner.visible = false;
    this.batAnchor.add(buildBat());
    // o "taco" é a bandeira num mastro (modelo convertido do DFF); enquanto carrega, vale o taco simples
    void loadFlag().then((src) => {
      this.batAnchor.clear();
      const flag = src.clone(true);
      flag.traverse((o) => { o.castShadow = true; });
      const inner = new THREE.Group();
      inner.add(flag);
      inner.rotation.x = Math.PI / 2; // mastro (Y no GLB) passa a apontar para +Z
      inner.scale.setScalar(0.75);
      inner.position.z = -0.1 * 0.75; // a mão segura o mastro um pouco acima da base
      this.batAnchor.add(inner);
    });
    this.batAnchor.visible = false;
    root.add(this.batAnchor);
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flashSprite.scale.setScalar(0.5);
    this.flashSprite.position.set(0, 0, 0.78);
    this.flashSprite.visible = false;
    this.anchor.add(this.flashSprite);
    void loadRifle().then((src) => {
      const model = src.clone(true);
      // some o "clarão" que vem no arquivo (usamos o nosso)
      const dead: THREE.Object3D[] = [];
      model.traverse((o) => { if (o.name.toLowerCase().includes('gunflash')) dead.push(o); });
      dead.forEach((o) => o.removeFromParent());
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      const inner = new THREE.Group();
      inner.add(model);
      inner.scale.setScalar(0.88 / Math.max(size.x, size.y, size.z));
      inner.rotation.y = -Math.PI / 2; // cano para +Z (frente)
      inner.position.z = 0.3;
      inner.traverse((o) => { o.castShadow = true; });
      this.anchor.add(inner);
      this.rifleInner = inner;
      this.ready = true;
      this.apply();
    });
  }

  /** A posição da arma passa a ser dada pelo animador (acompanha o peito e as mãos). */
  bind(animator: Animator): void {
    this.bound = true;
    this.animator = animator;
    animator.attachWeapon(this.anchor);
    animator.attachBat(this.batAnchor);
  }

  setMode(mode: ArmedMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.apply();
  }

  /** Inclina a arma para onde a câmera mira (positivo = para baixo). */
  setPitch(p: number): void {
    if (!this.bound) this.anchor.rotation.x = p * 0.9;
  }

  /** Esconde (morto, no carro) sem perder o modo. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.refresh();
  }

  /** Some enquanto o animador não segura a arma (escalando, rolando, emote). */
  setSuppressed(v: boolean): void {
    if (v === this.suppressed) return;
    this.suppressed = v;
    this.refresh();
  }

  private refresh(): void {
    const show = this.ready && this.mode !== 'none' && !this.hidden && !this.suppressed;
    const bat = this.mode === 'bat';
    const pistol = this.mode === 'pistol' || this.mode === 'pistol_aim';
    this.anchor.visible = show && !bat;
    this.batAnchor.visible = show && bat;
    this.pistolInner.visible = pistol;
    if (this.rifleInner) this.rifleInner.visible = !pistol;
    this.flashSprite.position.z = pistol ? 0.2 : 0.78;
    this.flashSprite.scale.setScalar(pistol ? 0.3 : 0.5);
  }

  private apply(): void {
    this.refresh();
    if (!this.bound) this.anchor.position.set(0.02, this.mode === 'aim' || this.mode === 'pistol_aim' ? 1.34 : 1.2, 0.18);
  }

  /** Mostra o clarão por ~50 ms. */
  flash(): void {
    this.flashT = 0.05;
    this.animator?.kick();
    this.flashSprite.visible = true;
  }

  update(dt: number): void {
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flashSprite.visible = false;
    }
  }

  /** Posição do cano no mundo (de onde sai o tiro). */
  muzzle(out: THREE.Vector3): THREE.Vector3 {
    return this.flashSprite.getWorldPosition(out);
  }
}

/** Rastros dos tiros (linhas amarelas curtas). */
export class Tracers {
  private readonly pool: { line: THREE.Line; t: number }[] = [];
  private next = 0;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < 16; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.9 }));
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.pool.push({ line, t: 0 });
    }
  }

  add(from: THREE.Vector3, to: THREE.Vector3): void {
    const e = this.pool[this.next++ % this.pool.length]!;
    const pos = e.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    e.line.visible = true;
    e.t = 0.07;
  }

  update(dt: number): void {
    for (const e of this.pool) {
      if (!e.line.visible) continue;
      e.t -= dt;
      if (e.t <= 0) e.line.visible = false;
    }
  }
}

const DARK = new THREE.MeshLambertMaterial({ color: 0x2a2d31 });

/** Pistola simples: ferrolho, cano e cabo (cano para +Z, origem perto do cabo). */
function buildPistol(): THREE.Group {
  const g = new THREE.Group();
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.045, 0.22), DARK);
  slide.position.set(0, 0, 0.06);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.1, 0.05), new THREE.MeshLambertMaterial({ color: 0x3b2c22 }));
  grip.position.set(0, -0.07, -0.03);
  grip.rotation.x = -0.18;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.06), DARK);
  guard.position.set(0, -0.03, 0.03);
  g.add(slide, grip, guard);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

/** Taco de madeira: cabo na origem (palma), ponta em +Z. */
function buildBat(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0xb88a52 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.35, 8), wood);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.024, 0.5, 10), wood);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), wood);
  for (const m of [handle, barrel]) m.rotation.x = Math.PI / 2;
  handle.position.z = 0.1;
  barrel.position.z = 0.53;
  knob.position.z = -0.08;
  g.add(handle, barrel, knob);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}
