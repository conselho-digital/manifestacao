import * as THREE from 'three';
import { createCharacter } from './characters';
import { Animator } from './anim';
import { CARS, type Car } from './vehicle';
import { WeaponVisual } from './weapons';
import type { MoveMsg, PlayerInfo } from '../net/sync';

function makeLabel(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = 'bold 32px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.strokeText(text, 128, 32);
  g.fillStyle = '#fff';
  g.fillText(text, 128, 32);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }),
  );
  sprite.scale.set(2, 0.5, 1);
  sprite.position.y = 2.2;
  sprite.renderOrder = 10;
  return sprite;
}

/** Jogador remoto: posição suavizada em direção ao último estado recebido. */
export class RemotePlayer {
  readonly root = new THREE.Group();
  private target = new THREE.Vector3();
  private targetRy = 0;
  private ready = false;
  private pending: MoveMsg | null = null;
  private animator: Animator | null = null;
  private anim = 'idle';
  private carId = -1;
  private lastCar: Car | null = null;
  private model: THREE.Object3D | null = null;
  private weaponVis: WeaponVisual | null = null;
  private weapon = 0;
  private pitch = 0;
  private lie = 0;
  private modelBaseY: number | null = null;

  constructor(readonly info: PlayerInfo) {
    this.root.add(makeLabel(info.name));
    void createCharacter(info.character).then((m) => {
      this.root.add(m);
      this.model = m;
      this.weaponVis = new WeaponVisual(this.root);
      void Animator.create(m).then((a) => (this.animator = a));
      this.ready = true;
      if (this.pending) this.setTarget(this.pending, true);
    });
  }

  setTarget(m: MoveMsg, snap = false): void {
    this.pending = m;
    this.target.set(m.x, m.y ?? 0, m.z);
    this.targetRy = m.ry;
    this.anim = m.a || 'idle';
    this.carId = m.v;
    this.weapon = m.w;
    this.pitch = m.pt;
    if (snap || !this.ready) {
      this.root.position.copy(this.target);
      this.root.rotation.y = m.ry;
    }
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 12);
    this.root.position.lerp(this.target, k);
    const car = this.carId >= 0 ? CARS[this.carId] : undefined;
    if (car) {
      // Dirigindo: esconde o boneco e move o carro
      car.driver = this.info.id;
      this.lastCar = car;
      if (this.model) this.model.visible = false;
      car.setPose(this.root.position.x, this.root.position.z, this.root.rotation.y);
    } else {
      if (this.lastCar) { this.lastCar.driver = null; this.lastCar = null; }
      if (this.model) this.model.visible = true;
    }
    const dead = this.anim === 'dead';
    if (this.animator && !car) {
      this.animator.setArmed(this.weapon === 2 ? 'aim' : this.weapon === 1 ? 'rifle' : 'none');
      this.animator.setAimPitch(this.pitch);
      this.animator.play(dead ? 'idle' : this.anim);
      this.animator.update(dt);
    }
    if (this.weaponVis) {
      this.weaponVis.setMode(this.weapon === 2 ? 'aim' : this.weapon === 1 ? 'rifle' : 'none');
      this.weaponVis.setPitch(this.pitch);
      this.weaponVis.setHidden(!!car || dead);
      this.weaponVis.update(dt);
    }
    // Morto: deita de costas
    const target = dead ? 1 : 0;
    if (this.model && this.lie !== target) {
      this.lie += Math.sign(target - this.lie) * Math.min(Math.abs(target - this.lie), dt * 4);
      this.modelBaseY ??= this.model.position.y;
      this.model.rotation.x = -this.lie * (Math.PI / 2);
      this.model.position.y = this.modelBaseY + this.lie * 0.12;
    }
    let d = this.targetRy - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * k;
  }

  get isDead(): boolean { return this.anim === 'dead'; }
  get inCar(): boolean { return this.carId >= 0; }

  /** Clarão do cano quando este jogador atira. */
  flash(): void { this.weaponVis?.flash(); }

  /** Posição do cano no mundo. */
  muzzle(out: THREE.Vector3): THREE.Vector3 {
    return this.weaponVis ? this.weaponVis.muzzle(out) : out.copy(this.root.position).setY(1.3);
  }

  dispose(): void {
    if (this.lastCar) this.lastCar.driver = null;
    this.root.removeFromParent();
  }
}
