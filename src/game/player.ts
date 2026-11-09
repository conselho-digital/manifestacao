import * as THREE from 'three';
import { ARENA_SIZE, COLLIDERS, type Box } from './map';
import type { InputState } from './input';
import { CARS, type Car } from './vehicle';
import type { Animator } from './anim';

const RUN_SPEED = 5;
const WALK_SPEED = 1.8;
const SPRINT_SPEED = 7.5;
const GRAVITY = -20;
const JUMP_V = 6.8;
const RADIUS = 0.4;
const STEP = 0.45; // desnível que se sobe andando
const LIMIT = ARENA_SIZE / 2 - 1;
const CAM_DISTANCE = 6;
const CAM_HEIGHT = 3.5;

// Escalada: pular(0.63s) -> puxar(1.43s) -> levantar(0.4s)
const CLIMB_T = { grab: 0.633, pull: 2.066, end: 2.466 };
const SPECIAL: Record<string, { dur: number; speed: number }> = {
  roll: { dur: 0.93, speed: 3.5 },
  dive: { dur: 1.5, speed: 3 },
};

type Mode = 'ground' | 'air' | 'climb' | 'special' | 'drive';

interface Climb {
  t: number;
  start: THREE.Vector3;
  face: THREE.Vector2; // ponto de contato no chão
  top: number;
  land: THREE.Vector2; // onde fica em cima da caixa
  dir: THREE.Vector2;
}

export class Player {
  readonly object: THREE.Object3D;
  private heading = 0; // rotação do corpo (rad)
  private vy = 0;
  private mode: Mode = 'ground';
  private launchT = 0;
  private landT = 0;
  private emote: string | null = null;
  private special: { id: string; t: number } | null = null;
  private climb: Climb | null = null;
  private car: Car | null = null;

  constructor(object: THREE.Object3D, private animator: Animator | null = null) {
    this.object = object;
  }

  /** Nome do clipe de animação atual (enviado aos outros jogadores). */
  get animName(): string {
    return this.mode === 'drive' ? 'drive' : this.animator?.name || 'idle';
  }

  /** Id do carro que está dirigindo (-1 = nenhum). */
  get carId(): number {
    return this.car ? this.car.id : -1;
  }

  /** Direção do carro (a câmera acompanha), ou null a pé. */
  get driveHeading(): number | null {
    return this.car ? this.car.heading : null;
  }

  update(dt: number, input: InputState, yaw: number): void {
    const pos = this.object.position;

    if (this.mode === 'drive' && this.car) { this.updateDrive(dt, input); return; }
    if (this.mode === 'climb' && this.climb) { this.updateClimb(dt); this.finish(dt); return; }
    if (this.mode === 'special' && this.special) { this.updateSpecial(dt); this.finish(dt); return; }

    const moving = input.mag > 0.02;
    if (this.emote && (moving || input.jump)) this.emote = null;
    if (input.emote) this.startAction(input.emote);
    if (this.mode === 'special') { this.finish(dt); return; }

    if (input.interact && this.mode === 'ground' && this.tryEnterCar()) return;
    if (input.climb && this.tryClimb()) { this.finish(dt); return; }

    if (input.jump && this.mode === 'ground') {
      this.vy = JUMP_V;
      this.mode = 'air';
      this.launchT = 0.2;
      this.landT = 0;
      this.emote = null;
      this.animator?.restart('jump_launch');
    }

    // Movimento horizontal relativo à câmera
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const move = forward.multiplyScalar(input.y).add(right.multiplyScalar(input.x));
    if (moving && move.lengthSq() > 1e-6) {
      const speed = input.sprint ? SPRINT_SPEED : input.walk ? WALK_SPEED : RUN_SPEED;
      const dir = move.clone().normalize();
      this.moveHoriz(dir.x * speed * dt, dir.z * speed * dt);
      this.heading = Math.atan2(dir.x, dir.z);
    }

    // Vertical
    const support = supportHeight(pos.x, pos.z, pos.y);
    if (this.mode === 'ground') {
      if (pos.y > support + 0.05) { this.mode = 'air'; this.vy = 0; } // saiu de uma borda
      else pos.y = support;
    }
    if (this.mode === 'air') {
      this.vy += GRAVITY * dt;
      pos.y += this.vy * dt;
      const sup = supportHeight(pos.x, pos.z, pos.y - this.vy * dt);
      if (pos.y <= sup && this.vy <= 0) {
        pos.y = sup;
        this.mode = 'ground';
        if (this.vy < -3) { this.landT = 0.3; this.animator?.restart('jump_land'); }
        this.vy = 0;
      }
    }

    this.selectAnimation(dt, input, moving);
    this.finish(dt);
  }

  private selectAnimation(dt: number, input: InputState, moving: boolean): void {
    const a = this.animator;
    if (!a) return;
    if (this.mode === 'air') {
      this.launchT -= dt;
      if (this.launchT <= 0) a.play('jump_air');
      return;
    }
    if (this.landT > 0) {
      this.landT -= dt;
      if (!moving) return; // termina o pouso parado
    }
    if (moving) {
      const clip = input.sprint ? 'sprint' : input.walk ? input.walkClip : 'run';
      a.play(a.has(clip) ? clip : input.walk ? 'walk' : 'run');
    } else if (this.emote && a.has(this.emote)) a.play(this.emote);
    else a.play('idle');
  }

  /** Emote (loop até mexer) ou ação (rolar, mergulhar). */
  private startAction(id: string): void {
    if (this.mode !== 'ground') return;
    const sp = SPECIAL[id];
    if (sp) {
      this.mode = 'special';
      this.special = { id, t: 0 };
      this.animator?.restart(id);
    } else this.emote = id;
  }

  private updateSpecial(dt: number): void {
    const sp = this.special!;
    const cfg = SPECIAL[sp.id]!;
    sp.t += dt;
    this.moveHoriz(Math.sin(this.heading) * cfg.speed * dt, Math.cos(this.heading) * cfg.speed * dt);
    if (sp.t >= cfg.dur) {
      this.special = null;
      this.mode = 'ground';
      this.animator?.play('idle');
    }
  }

  /** Entra no carro livre mais próximo (até 3,5 m). */
  private tryEnterCar(): boolean {
    const pos = this.object.position;
    let best: Car | null = null;
    let bestD = 3.5;
    for (const c of CARS) {
      const d = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (c.driver === null && d < bestD) { best = c; bestD = d; }
    }
    if (!best) return false;
    best.driver = 'local';
    this.car = best;
    this.mode = 'drive';
    this.emote = null;
    this.vy = 0;
    this.object.visible = false;
    return true;
  }

  private updateDrive(dt: number, input: InputState): void {
    const car = this.car!;
    if (input.interact) { this.exitCar(); return; }
    // No carro o controle é do carro: W/S acelera e freia, A/D esterça
    car.drive(dt, input.y, input.x);
    this.object.position.set(car.x, 0, car.z);
    this.heading = car.heading;
    this.object.rotation.y = car.heading;
  }

  private exitCar(): void {
    const car = this.car!;
    // Sai pelo lado direito do carro
    const rx = -Math.cos(car.heading);
    const rz = Math.sin(car.heading);
    this.object.position.set(
      THREE.MathUtils.clamp(car.x + rx * 2.2, -LIMIT, LIMIT), 0,
      THREE.MathUtils.clamp(car.z + rz * 2.2, -LIMIT, LIMIT),
    );
    car.driver = null;
    car.speed = 0;
    this.car = null;
    this.object.visible = true;
    this.mode = 'ground';
    this.animator?.play('idle');
  }

  /** Procura uma caixa à frente que dê para escalar e começa a subir. */
  private tryClimb(): boolean {
    if (this.mode === 'climb') return false;
    const pos = this.object.position;
    const dx = Math.sin(this.heading);
    const dz = Math.cos(this.heading);
    let best: { box: Box; t: number } | null = null;
    for (const b of COLLIDERS) {
      if (b.top < STEP + 0.3 || b.top > 3.2 || pos.y > b.top - 0.4) continue;
      const t = rayBoxXZ(pos.x, pos.z, dx, dz, b);
      if (t !== null && t <= 1.2 && (!best || t < best.t)) best = { box: b, t };
    }
    if (!best) return false;
    const b = best.box;
    const fx = pos.x + dx * best.t;
    const fz = pos.z + dz * best.t;
    const lx = THREE.MathUtils.clamp(fx + dx * 0.7, b.minX + 0.3, b.maxX - 0.3);
    const lz = THREE.MathUtils.clamp(fz + dz * 0.7, b.minZ + 0.3, b.maxZ - 0.3);
    this.climb = {
      t: 0, start: pos.clone(), face: new THREE.Vector2(fx - dx * 0.4, fz - dz * 0.4),
      top: b.top, land: new THREE.Vector2(lx, lz), dir: new THREE.Vector2(dx, dz),
    };
    this.mode = 'climb';
    this.vy = 0;
    this.emote = null;
    this.animator?.restart('climb_jump');
    return true;
  }

  private updateClimb(dt: number): void {
    const c = this.climb!;
    const pos = this.object.position;
    c.t += dt;
    const ease = (u: number): number => u * u * (3 - 2 * u);
    if (c.t < CLIMB_T.grab) {
      const u = ease(Math.min(1, c.t / CLIMB_T.grab));
      pos.x = THREE.MathUtils.lerp(c.start.x, c.face.x, u);
      pos.z = THREE.MathUtils.lerp(c.start.z, c.face.y, u);
    } else if (c.t < CLIMB_T.pull) {
      pos.x = c.face.x;
      pos.z = c.face.y;
      const u = ease((c.t - CLIMB_T.grab) / (CLIMB_T.pull - CLIMB_T.grab));
      pos.y = THREE.MathUtils.lerp(c.start.y, c.top, u);
      if (this.animator?.name !== 'climb_pull') this.animator?.play('climb_pull');
    } else {
      const u = ease(Math.min(1, (c.t - CLIMB_T.pull) / (CLIMB_T.end - CLIMB_T.pull)));
      pos.x = THREE.MathUtils.lerp(c.face.x, c.land.x, u);
      pos.z = THREE.MathUtils.lerp(c.face.y, c.land.y, u);
      pos.y = c.top;
      if (this.animator?.name !== 'climb_stand') this.animator?.play('climb_stand');
    }
    this.heading = Math.atan2(c.dir.x, c.dir.y);
    if (c.t >= CLIMB_T.end) {
      pos.set(c.land.x, c.top, c.land.y);
      this.climb = null;
      this.mode = 'ground';
      this.animator?.play('idle');
    }
  }

  /** Move com colisão contra as caixas e limites da arena. */
  private moveHoriz(dx: number, dz: number): void {
    const pos = this.object.position;
    pos.x = THREE.MathUtils.clamp(pos.x + dx, -LIMIT, LIMIT);
    pos.z = THREE.MathUtils.clamp(pos.z + dz, -LIMIT, LIMIT);
    for (const b of COLLIDERS) {
      if (b.top - pos.y <= STEP) continue; // dá para subir andando
      const cx = THREE.MathUtils.clamp(pos.x, b.minX, b.maxX);
      const cz = THREE.MathUtils.clamp(pos.z, b.minZ, b.maxZ);
      const ox = pos.x - cx;
      const oz = pos.z - cz;
      const d = Math.hypot(ox, oz);
      if (d < RADIUS) {
        if (d > 1e-6) { pos.x = cx + (ox / d) * RADIUS; pos.z = cz + (oz / d) * RADIUS; }
        else { pos.x = b.minX - RADIUS; } // dentro da caixa: empurra para fora
      }
    }
  }

  private finish(dt: number): void {
    // Gira suavemente até a direção do movimento
    let diff = this.heading - this.object.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.object.rotation.y += diff * Math.min(1, dt * 12);
    this.animator?.update(dt);
  }

  /** Câmera em terceira pessoa, atrás do jogador. */
  followCamera(camera: THREE.PerspectiveCamera, dt: number, yaw: number): void {
    const p = this.object.position;
    const driving = this.mode === 'drive';
    const dist = driving ? 9 : CAM_DISTANCE;
    const height = driving ? 4.5 : CAM_HEIGHT;
    const target = new THREE.Vector3(
      p.x - Math.sin(yaw) * dist,
      p.y + height,
      p.z - Math.cos(yaw) * dist,
    );
    camera.position.lerp(target, Math.min(1, dt * 8));
    camera.lookAt(p.x, p.y + 1.2, p.z);
  }
}

/** Altura do chão sob (x, z): 0 ou o topo de uma caixa que está abaixo dos pés. */
function supportHeight(x: number, z: number, feetY: number): number {
  let h = 0;
  for (const b of COLLIDERS) {
    if (x >= b.minX - 0.1 && x <= b.maxX + 0.1 && z >= b.minZ - 0.1 && z <= b.maxZ + 0.1 && b.top <= feetY + STEP) {
      h = Math.max(h, b.top);
    }
  }
  return h;
}

/** Distância até a face da caixa no plano XZ (raio a partir de (x,z) na direção (dx,dz)), ou null. */
function rayBoxXZ(x: number, z: number, dx: number, dz: number, b: Box): number | null {
  let t0 = 0;
  let t1 = Infinity;
  for (const [o, d, lo, hi] of [[x, dx, b.minX, b.maxX], [z, dz, b.minZ, b.maxZ]] as const) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      let a = (lo - o) / d;
      let c = (hi - o) / d;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, c);
      if (t0 > t1) return null;
    }
  }
  return t0;
}
