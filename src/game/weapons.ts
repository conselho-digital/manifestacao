import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ArmedMode = 'none' | 'rifle' | 'aim';

import type { Animator } from './anim';

const loader = new GLTFLoader();
let rifleSrc: Promise<THREE.Object3D> | null = null;
const loadRifle = (): Promise<THREE.Object3D> => (rifleSrc ??= loader.loadAsync('/models/weapons/AK47.glb').then((g) => g.scene));

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
  private flashT = 0;
  private mode: ArmedMode = 'none';
  private ready = false;
  private bound = false;
  private hidden = false;
  private suppressed = false;

  constructor(root: THREE.Object3D) {
    this.anchor.visible = false;
    root.add(this.anchor);
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
      this.ready = true;
      this.apply();
    });
  }

  /** A posição da arma passa a ser dada pelo animador (acompanha o peito e as mãos). */
  bind(animator: Animator): void {
    this.bound = true;
    animator.attachWeapon(this.anchor);
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
    this.anchor.visible = this.ready && this.mode !== 'none' && !this.hidden && !this.suppressed;
  }

  private apply(): void {
    this.refresh();
    if (!this.bound) this.anchor.position.set(0.02, this.mode === 'aim' ? 1.34 : 1.2, 0.18);
  }

  /** Mostra o clarão por ~50 ms. */
  flash(): void {
    this.flashT = 0.05;
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
