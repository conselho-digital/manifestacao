import * as THREE from 'three';
import { createCharacter } from './characters';
import { ARMED_FROM_CODE, Animator } from './anim';
import { CARS, type Car } from './vehicle';
import { WeaponVisual } from './weapons';
import { seatBlend } from './player';
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
  /** grupo do modelo: gira com a moto (empinar/inclinar) */
  private readonly pivot = new THREE.Group();
  private weaponVis: WeaponVisual | null = null;
  private weapon = 0;
  private pitch = 0;
  private lie = 0;
  private modelBaseY: number | null = null;
  private modelRot0: number | null = null;

  constructor(readonly info: PlayerInfo) {
    this.root.add(makeLabel(info.name));
    void createCharacter(info.character).then((m) => {
      this.root.add(this.pivot);
      this.pivot.add(m);
      this.model = m;
      this.weaponVis = new WeaponVisual(this.root);
      void Animator.create(m).then((a) => { this.animator = a; if (a) this.weaponVis?.bind(a); });
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
      // Dirigindo: o boneco aparece sentado e o carro anda
      car.driver = this.info.id;
      if (this.lastCar !== car) car.openDoor(1);
      this.lastCar = car;
      if (this.model) this.model.visible = true;
      car.setPose(this.root.position.x, this.root.position.z, this.root.rotation.y);
    } else {
      if (this.lastCar) { this.lastCar.driver = null; this.lastCar.openDoor(1); this.lastCar = null; }
      if (this.model) this.model.visible = true;
    }
    const bp = car?.bikePose();
    if (bp) {
      const r = new THREE.Euler(bp.pitch, 0, bp.roll, 'XYZ');
      this.pivot.rotation.copy(r);
      this.pivot.position.copy(bp.axle).sub(bp.axle.clone().applyEuler(r));
    } else if (this.pivot.rotation.x !== 0 || this.pivot.rotation.z !== 0) {
      this.pivot.rotation.set(0, 0, 0);
      this.pivot.position.set(0, 0, 0);
    }
    const dead = this.anim === 'dead';
    if (this.animator && car?.seat) {
      this.animator.setRide(car.seat, car.grips, car.riderLean);
      this.animator.setArmed('none');
      this.animator.play(car.bike ? 'bike_ride' : 'car_sit');
      this.animator.update(dt);
    }
    if (this.animator && !car) {
      // entrando/saindo de um veículo: o boneco vai da porta ao banco como no jogador local (o clipe dá o tempo)
      const seq = this.anim === 'car_getin_l' || this.anim === 'car_getout_l' ? this.nearestCar(1.5) : null;
      if (seq && this.model) {
        this.modelRot0 ??= this.model.rotation.y;
        const b = seatBlend(seq, this.animator.name === this.anim ? this.animator.progress : 0, this.anim === 'car_getin_l');
        this.animator.setRideRaw(b);
        this.model.rotation.y = this.modelRot0 + b.turn;
      } else {
        this.animator.setRide(null);
        if (this.modelRot0 !== null && this.model) { this.model.rotation.y = this.modelRot0; this.modelRot0 = null; }
      }
      this.animator.setArmed(ARMED_FROM_CODE[this.weapon] ?? 'none');
      this.animator.setAimPitch(this.pitch);
      this.animator.play(dead ? 'idle' : this.anim);
      this.animator.update(dt);
    }
    if (this.weaponVis) {
      this.weaponVis.setMode(ARMED_FROM_CODE[this.weapon] ?? 'none');
      this.weaponVis.setPitch(this.pitch);
      this.weaponVis.setHidden(!!car || dead);
      if (this.animator) this.weaponVis.setSuppressed(!this.animator.holdsWeapon);
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

  /** Veículo mais próximo (até `r` m) do ponto onde este jogador está. */
  private nearestCar(r: number): Car | null {
    let best: Car | null = null;
    for (const c of CARS) {
      const d = Math.hypot(c.x - this.root.position.x, c.z - this.root.position.z);
      if (d < r) { best = c; r = d; }
    }
    return best;
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
