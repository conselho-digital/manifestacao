import * as THREE from 'three';
import { COLLIDERS, MAP, rayBox, TREES, type Box } from './map';
import type { InputState } from './input';
import { CARS, hittables, type Car } from './vehicle';
import { ARMED_CODE, BAT_SWING_NAME, facesAim, type Animator, type Armed } from './anim';
import type { WeaponVisual } from './weapons';

const WALK_SPEED = 2.1;
const SPRINT_SPEED = 6.2;
const CROUCH_SPEED = 1.0;
const AIM_SPEED = 2.7; // andando com o fuzil no ombro
const GRAVITY = -20;
const JUMP_V = 6.8;
const RADIUS = 0.4;
const STEP = 0.45; // desnível que se sobe andando
const CAM_DISTANCE = 3.3;
const CAM_AIM_DISTANCE = 2.7;
/** moto: batida acima desta velocidade (m/s) joga o piloto para a frente */
const CRASH_SPEED = 11; // ~40 km/h (era 9): só um pouco menos sensível

// Escalada: pular(0.63s) -> puxar(1.43s) -> levantar(0.4s)
const CLIMB_T = { grab: 0.633, pull: 2.066, end: 2.466 };
const SPECIAL: Record<string, { dur: number; speed: number }> = {
  roll: { dur: 0.93, speed: 3.5 },
  dive: { dur: 1.5, speed: 3 },
};

type Mode = 'ground' | 'air' | 'climb' | 'special' | 'drive' | 'dead' | 'approach' | 'enter' | 'exit' | 'ko';

/** Entrar/sair do veículo: duração da sequência (o clipe car_getin_l é esticado para isso) e lado onde o personagem fica. */
export const SEQ_DUR = 1.5;
const DOOR_SIDE = { car: 1.6, bike: 0.95 }; // distância do centro do veículo (lado do motorista, +x do modelo)

/**
 * Posição do modelo durante a sequência de entrar/sair (u = 0..1 do tempo): deslocamento no espaço do veículo
 * (x para a esquerda, y da pélvis, z para a frente) e giro do modelo (de frente para a porta -> de frente para a rua).
 */
export function seatBlend(car: Car, u: number, entering: boolean): { x: number; y: number; z: number; turn: number } {
  const k = THREE.MathUtils.clamp((u - 0.2) / 0.6, 0, 1);
  const f = entering ? k * k * (3 - 2 * k) : 1 - k * k * (3 - 2 * k); // 1 = sentado
  const seat = car.seat ?? new THREE.Vector3(0.48, 0.7, -0.2);
  const out = { x: car.bike ? DOOR_SIDE.bike : DOOR_SIDE.car, y: 0, z: seat.z - (car.bike ? 0 : 0.1) };
  return {
    x: THREE.MathUtils.lerp(out.x, seat.x, f),
    y: THREE.MathUtils.lerp(out.y, seat.y - 0.97, f),
    z: THREE.MathUtils.lerp(out.z, seat.z, f),
    turn: -(Math.PI / 2) * (1 - f),
  };
}

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
  private armed: Armed = 'none';
  private crouching = false;
  private swingT = 0;
  private seqT = 0; // entrando/saindo do carro
  private approachT = 0; // caminhando até a porta
  private koVel = new THREE.Vector2();
  private koT = 0;
  private koCool = 0;
  private koFront = false; // jogado da moto: voa para a frente (dive), cai de cara e levanta (getup_front)
  private koVy = 0;
  private modelRot0: number | null = null;
  private punchN = 0;
  private kickAlt = false;
  private hitN = 0;
  private hitAlt = false;
  private combatT = 0; // tempo restante em modo de combate (guarda) depois de socar
  private lastHitAt = -1e9;
  private crouchK = 0; // 0 em pé, 1 agachado (suaviza a câmera)
  /** direção do movimento em relação ao corpo: frente(+) e esquerda(+) */
  private moveF = 0;
  private moveL = 0;
  private lie = 0; // 0 em pé, 1 deitado (morto)
  private modelBaseY: number | null = null;
  /** arma visual (fuzil na mão), definida pelo main */
  weaponVis: WeaponVisual | null = null;

  /** Liga a arma visual: o animador passa a posicioná-la (peito e mãos). */
  attachWeapon(w: WeaponVisual): void {
    this.weaponVis = w;
    if (this.animator) w.bind(this.animator);
  }

  constructor(object: THREE.Object3D, private animator: Animator | null = null) {
    this.object = object;
  }

  get isDead(): boolean { return this.mode === 'dead'; }
  /** Há um carro livre a até 3,5 m (a pé)? Só então o botão de entrar aparece. */
  get nearCar(): boolean {
    if (this.mode !== 'ground') return false;
    const p = this.object.position;
    return CARS.some((c) => c.driver === null && Math.hypot(c.x - p.x, c.z - p.z) < 3.5);
  }
  get isCrouching(): boolean { return this.crouching; }
  get isBike(): boolean { return !!this.car?.bike; }
  get isDriving(): boolean { return this.mode === 'drive'; }
  get carSpeed(): number { return this.car ? this.car.speed : 0; }
  /** 0 nada, 1 fuzil, 2 fuzil mirando, 3 taco, 4 pistola, 5 pistola mirando (enviado aos outros) */
  get weaponCode(): number { return ARMED_CODE[this.armed]; }

  /** Levou um golpe (soco, taco, bandeira): reações knife_hit_1, 2 e 3 em sequência (volta ao 1 se ficar 2,5 s sem apanhar). */
  flinch(kind: 'f' | 'b' | 'k' = 'f'): void {
    if (this.mode !== 'ground') return;
    const now = performance.now();
    this.hitN = now - this.lastHitAt > 2500 ? 1 : this.hitN % 3 + 1;
    this.lastHitAt = now;
    if (kind === 'k') {
      this.hitAlt = !this.hitAlt;
      this.swingT = 0.6;
      this.animator?.restart(this.hitAlt ? 'hitk_2' : 'hitk_1');
      return;
    }
    this.swingT = this.hitN === 3 ? 0.8 : 0.4;
    this.animator?.restart(`hit_${this.hitN}`);
  }

  /** Combo corpo a corpo: soco, soco, soco e chute (alternando os 2 chutes). Retorna 'k' se foi chute. */
  punch(): 'f' | 'k' {
    if (this.mode !== 'ground') return 'f';
    this.punchN = this.punchN % 4 + 1;
    this.combatT = 3; // fica em guarda por 3 s
    if (this.punchN === 4) {
      this.kickAlt = !this.kickAlt;
      this.swingT = 0.6;
      this.animator?.restart(this.kickAlt ? 'kick_2' : 'kick_1');
      return 'k';
    }
    this.swingT = this.punchN === 3 ? 0.8 : 0.7; // FightA_1/2/3 (jab, direto, gancho) acelerados 2x
    this.animator?.restart(`punch_${this.punchN}`);
    return 'f';
  }

  /** Golpe de taco (animação e trava a troca de clipe até acabar). */
  swing(): void {
    if (this.mode !== 'ground') return;
    // golpe de beisebol por código (os clipes Bat_* do GTA não são uma rebatida de verdade)
    this.swingT = 0.8;
    this.animator?.baseball();
  }

  /** Muda o que o personagem segura (braços e arma na mão). */
  setArmed(a: Armed): void {
    this.armed = a;
    this.animator?.setArmed(a);
    this.weaponVis?.setMode(a);
  }

  /** Morre: cai deitado até renascer. */
  die(): void {
    if (this.car) this.exitCar();
    this.mode = 'dead';
    this.crouching = false;
    this.emote = null;
    this.climb = null;
    this.special = null;
    this.animator?.play('idle');
    this.weaponVis?.setHidden(true);
  }

  respawn(x: number, z: number): void {
    this.object.position.set(x, 0, z);
    this.vy = 0;
    this.mode = 'ground';
    this.weaponVis?.setHidden(false);
  }

  /** Nome do clipe de animação atual (enviado aos outros jogadores). */
  get animName(): string {
    if (this.mode === 'drive') return 'drive';
    if (this.swingT > 0 && (this.armed === 'bat' || this.armed === 'sign')) return BAT_SWING_NAME; // os outros repetem a rebatida
    return this.animator?.name || 'idle';
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
    this.weaponVis?.update(dt);

    if (this.mode === 'dead') { this.finish(dt); return; }
    if (this.mode === 'approach') { this.updateApproach(dt); return; }
    if (this.mode === 'enter' || this.mode === 'exit') { this.updateSeq(dt); return; }
    if (this.mode === 'ko') { this.updateKo(dt); return; }
    if (this.mode === 'drive' && this.car) { this.updateDrive(dt, input); return; }
    if (this.koCool > 0) this.koCool -= dt;
    else if ((this.mode === 'ground' || this.mode === 'air') && this.checkRunOver()) return;
    if (this.mode === 'climb' && this.climb) { this.updateClimb(dt); this.finish(dt); return; }
    if (this.mode === 'special' && this.special) { this.updateSpecial(dt); this.finish(dt); return; }

    const moving = input.mag > 0.02;
    if (this.emote && (moving || input.jump)) this.emote = null;
    if (input.emote) this.startAction(input.emote);
    if (this.mode === 'special') { this.finish(dt); return; }

    if (input.interact && this.mode === 'ground' && this.tryEnterCar()) return;
    if (input.climb && this.tryClimb()) { this.finish(dt); return; }

    if (input.crouch && this.mode === 'ground') this.crouching = !this.crouching;
    if (input.jump) this.crouching = false;

    // Pular perto de um obstáculo alto escala sozinho
    if (input.jump && this.mode === 'ground' && this.tryClimb(1.05, 1.6)) { this.finish(dt); return; }
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
      const speed = this.crouching ? CROUCH_SPEED
        : this.armed === 'aim' || this.armed === 'pistol_aim' ? AIM_SPEED
          : input.sprint ? SPRINT_SPEED : facesAim(this.armed) ? AIM_SPEED : WALK_SPEED;
      const dir = move.clone().normalize();
      this.moveHoriz(dir.x * speed * dt, dir.z * speed * dt);
      this.heading = Math.atan2(dir.x, dir.z);
      // direção em relação ao corpo quando ele olha para onde a câmera aponta
      this.moveF = dir.x * Math.sin(yaw) + dir.z * Math.cos(yaw);
      this.moveL = dir.x * Math.cos(yaw) - dir.z * Math.sin(yaw);
    }
    // Armado (em pé, andando, mirando ou atirando): o corpo acompanha para onde a câmera aponta
    if (facesAim(this.armed)) this.heading = yaw;

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
    if (this.combatT > 0) this.combatT -= dt;
    if (this.swingT > 0) { this.swingT -= dt; return; } // golpe de taco em andamento
    const armed = facesAim(this.armed); // só o fuzil e a pistola mirando usam os passos de arma (de frente, de costas e de lado)
    if (this.crouching) {
      // agachado: andar para a frente ou para trás (de lado usa o andar para a frente)
      a.play(moving ? (armed && this.moveF < -0.5 ? 'crouch_bwd' : 'crouch_fwd') : 'crouch_idle');
    } else if (moving && armed && !input.sprint) {
      // com o fuzil o corpo olha para a mira: anda de frente, de costas ou de lado
      let clip: string;
      if (Math.abs(this.moveF) >= Math.abs(this.moveL)) clip = this.moveF >= 0 ? ('gun_fwd') : 'gun_bwd';
      else clip = this.moveL > 0 ? 'gun_left' : 'gun_right';
      a.play(a.has(clip) ? clip : 'walk');
    } else if (moving) {
      const clip = input.sprint ? 'sprint' : input.walkClip;
      a.play(a.has(clip) ? clip : 'walk');
    } else if (this.emote && a.has(this.emote)) a.play(this.emote);
    else a.play(this.combatT > 0 && this.armed === 'none' && a.has('combat_idle') ? 'combat_idle' : (this.armed === 'bat' || this.armed === 'sign') && a.has('bat_idle') ? 'bat_idle' : (this.armed === 'rifle' || this.armed === 'aim') && a.has('gun_idle') ? 'gun_idle' : 'idle');
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
    this.emote = null;
    this.vy = 0;
    this.object.visible = true; // o motorista aparece sentado (carro ou moto)
    this.crouching = false;
    this.weaponVis?.setHidden(true);
    // caminha até a porta do motorista (ou o lado da moto); chegando lá, abre e entra
    this.mode = 'approach';
    this.approachT = 0;
    return true;
  }

  /** Ponto ao lado do motorista (lado esquerdo do veículo), no chão. */
  private doorPoint(car: Car): THREE.Vector2 {
    const side = car.bike ? DOOR_SIDE.bike : DOOR_SIDE.car;
    const z = (car.seat?.z ?? -0.2) - (car.bike ? 0 : 0.1);
    // +x do modelo é a esquerda do veículo; z do assento ao longo do comprimento
    const lx = Math.cos(car.heading);
    const lz = -Math.sin(car.heading);
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    return new THREE.Vector2(car.x + lx * side + fx * z, car.z + lz * side + fz * z);
  }

  /** Caminha até a porta; ao chegar (ou depois de 1,6 s) começa a sequência de entrar. */
  private updateApproach(dt: number): void {
    const car = this.car!;
    const pos = this.object.position;
    const target = this.doorPoint(car);
    const dx = target.x - pos.x;
    const dz = target.y - pos.z;
    const dist = Math.hypot(dx, dz);
    this.approachT += dt;
    if (dist < 0.12 || this.approachT > 1.6) {
      car.openDoor(SEQ_DUR + 0.4);
      this.mode = 'enter';
      this.seqT = 0;
      return;
    }
    const step = Math.min(dist, WALK_SPEED * dt);
    this.moveHoriz((dx / dist) * step, (dz / dist) * step);
    this.heading = Math.atan2(dx, dz);
    this.animator?.play('walk');
    this.finish(dt);
  }

  private updateDrive(dt: number, input: InputState): void {
    const car = this.car!;
    if (input.interact) {
      car.speed = 0;
      car.openDoor(SEQ_DUR + 0.4);
      this.mode = 'exit';
      this.seqT = 0;
      return;
    }
    // No carro: acelerador, freio e freio de mão; o joystick (A/D) só esterça
    car.drive(dt, input.gas, input.brake, input.handbrake, input.x, input.wheelie);
    if (car.bike && car.impact > CRASH_SPEED) { this.crashBike(car, car.impact); return; }
    this.object.position.set(car.x, 0, car.z);
    this.heading = car.heading;
    this.object.rotation.y = car.heading;
    const bp = car.bikePose();
    if (bp) {
      // o piloto fica preso à moto: gira junto em torno do eixo traseiro (empinar e inclinar)
      this.object.rotation.order = 'YXZ';
      this.object.rotation.set(bp.pitch, car.heading, bp.roll);
      const r = new THREE.Euler(bp.pitch, 0, bp.roll, 'XYZ');
      const d = bp.axle.clone().sub(bp.axle.clone().applyEuler(r)).applyAxisAngle(new THREE.Vector3(0, 1, 0), car.heading);
      this.object.position.add(d);
    }
    if (car.seat) {
      this.animator?.setRide(car.seat, car.grips, car.riderLean);
      this.animator?.setArmed('none');
      this.animator?.play(car.bike ? 'bike_ride' : 'car_sit');
      this.animator?.update(dt);
    }
  }

  private resetModelRot(): void {
    const model = this.object.children[0];
    if (model && this.modelRot0 !== null) model.rotation.y = this.modelRot0;
  }

  /** Entrando/saindo do veículo: o personagem passa da porta (ou do lado da moto) para o banco, ou o contrário. */
  private updateSeq(dt: number): void {
    const car = this.car!;
    const dur = SEQ_DUR;
    this.seqT = Math.min(dur, this.seqT + dt);
    const entering = this.mode === 'enter';
    const b = seatBlend(car, this.seqT / dur, entering);
    this.object.position.set(car.x, 0, car.z);
    this.object.rotation.order = 'XYZ';
    this.object.rotation.set(0, car.heading, 0);
    this.heading = car.heading;
    const model = this.object.children[0];
    if (model) {
      this.modelRot0 ??= model.rotation.y;
      model.rotation.y = this.modelRot0 + b.turn; // de frente para a porta até de frente para a rua
    }
    this.animator?.setRideRaw(b);
    this.animator?.setArmed('none');
    this.animator?.play(entering ? 'car_getin_l' : 'car_getout_l');
    this.animator?.update(dt);
    if (this.seqT >= dur) {
      if (entering) { this.mode = 'drive'; this.resetModelRot(); } else this.exitCar();
    }
  }

  /** Atropelado: leva um tombo (cai, desliza e levanta). */
  private checkRunOver(): boolean {
    const p = this.object.position;
    if (p.y > 1.6) return false;
    for (const h of hittables()) {
      const sp = Math.hypot(h.vx, h.vz);
      if (sp < 4.5) continue;
      for (const [cx, cz, r] of h.circles) {
        const dx = p.x - cx;
        const dz = p.z - cz;
        if (Math.hypot(dx, dz) > RADIUS + r + 0.15) continue;
        const dir = new THREE.Vector2(h.vx / sp, h.vz / sp);
        this.koVel.copy(dir).multiplyScalar(Math.min(9, sp * 0.9)).add(new THREE.Vector2(dx, dz).normalize().multiplyScalar(2));
        this.mode = 'ko';
        this.koT = 0;
        this.crouching = false;
        this.emote = null;
        this.weaponVis?.setHidden(true);
        this.animator?.setArmed('none');
        this.animator?.play('ko');
        return true;
      }
    }
    return false;
  }

  /** Batida forte de moto: o piloto voa para a frente, cai, desliza e levanta; a moto fica caída. */
  private crashBike(car: Car, speed: number): void {
    const h = car.heading;
    car.driver = null;
    car.speed = 0;
    car.fallen = true;
    this.car = null;
    this.object.rotation.order = 'XYZ';
    this.object.rotation.set(0, h, 0);
    this.object.position.set(car.x + Math.sin(h) * 0.9, 0.9, car.z + Math.cos(h) * 0.9);
    this.resetModelRot();
    this.heading = h;
    this.mode = 'ko';
    this.koFront = true;
    this.koT = 0;
    this.koVy = 3.2;
    this.koVel.set(Math.sin(h), Math.cos(h)).multiplyScalar(Math.min(13, speed * 0.85));
    this.weaponVis?.setHidden(true);
    this.animator?.setRide(null);
    this.animator?.setArmed('none');
    this.animator?.setFlail(1);
    this.animator?.restart('dive');
  }

  private updateKo(dt: number): void {
    this.koT += dt;
    const pos = this.object.position;
    const bx = pos.x;
    const bz = pos.z;
    this.moveHoriz(this.koVel.x * dt, this.koVel.y * dt);
    // bateu em parede/carro durante o voo: para
    const moved = Math.hypot(pos.x - bx, pos.z - bz);
    if (moved < this.koVel.length() * dt * 0.5) this.koVel.multiplyScalar(0.1);
    if (this.koFront) {
      // voo em arco; no chão desliza e o corpo vai ficando mole
      this.koVy += GRAVITY * dt;
      pos.y = Math.max(0, pos.y + this.koVy * dt);
      const ground = pos.y <= 0;
      if (ground) { this.koVy = 0; this.koVel.multiplyScalar(Math.exp(-dt * 3.5)); }
      this.animator?.setFlail(ground ? Math.max(0, 1 - (this.koT - 0.6) * 1.2) : 1);
      if (this.koT > 2.2 && this.animator?.name !== 'getup_front') { this.animator?.setFlail(0); this.animator?.play('getup_front'); }
      if (this.koT > 3.5) this.endKo();
    } else {
      this.koVel.multiplyScalar(Math.exp(-dt * 2.4));
      pos.y = Math.max(0, pos.y - 20 * dt);
      if (this.koT > 1.6) this.animator?.play('getup');
      if (this.koT > 3.2) this.endKo();
    }
    this.animator?.update(dt);
  }

  private endKo(): void {
    this.mode = 'ground';
    this.koCool = 3;
    this.koFront = false;
    this.weaponVis?.setHidden(false);
    this.animator?.setFlail(0);
    this.animator?.play('idle');
  }

  private exitCar(): void {
    const car = this.car!;
    // Sai pelo lado do motorista (esquerdo)
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);
    const side = (car.bike ? DOOR_SIDE.bike : DOOR_SIDE.car) + 0.3;
    this.object.position.set(
      THREE.MathUtils.clamp(car.x + rx * side, -(MAP.halfX - 1), MAP.halfX - 1), 0,
      THREE.MathUtils.clamp(car.z + rz * side, -(MAP.halfZ - 1), MAP.halfZ - 1),
    );
    this.resetModelRot();
    car.driver = null;
    car.speed = 0;
    car.openDoor(1);
    this.object.rotation.set(0, car.heading, 0);
    this.object.rotation.order = 'XYZ';
    this.car = null;
    this.object.visible = true;
    this.animator?.setRide(null);
    this.mode = 'ground';
    this.animator?.play('idle');
  }

  /** Procura uma caixa à frente que dê para escalar e começa a subir. */
  private tryClimb(minTop = STEP + 0.3, reach = 1.2): boolean {
    if (this.mode === 'climb') return false;
    const pos = this.object.position;
    const dx = Math.sin(this.heading);
    const dz = Math.cos(this.heading);
    let best: { box: Box; t: number } | null = null;
    for (const b of COLLIDERS) {
      if (b.top < minTop || b.top > 3.2 || (b.bottom ?? 0) > 0 || pos.y > b.top - 0.4) continue;
      const t = rayBoxXZ(pos.x, pos.z, dx, dz, b);
      if (t !== null && t <= reach && (!best || t < best.t)) best = { box: b, t };
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
    pos.x = THREE.MathUtils.clamp(pos.x + dx, -(MAP.halfX - 1), MAP.halfX - 1);
    pos.z = THREE.MathUtils.clamp(pos.z + dz, -(MAP.halfZ - 1), MAP.halfZ - 1);
    if (pos.y < 1.4) {
      for (const h of hittables()) {
        for (const [cx, cz, r] of h.circles) {
          const ox = pos.x - cx;
          const oz = pos.z - cz;
          const d = Math.hypot(ox, oz);
          const min = RADIUS + r;
          if (d < min && d > 1e-6) { pos.x = cx + (ox / d) * min; pos.z = cz + (oz / d) * min; }
        }
      }
    }
    for (const b of COLLIDERS) {
      if (b.top - pos.y <= STEP || (b.bottom ?? 0) >= pos.y + 1.8) continue; // sobe andando / passa por baixo
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
    this.object.rotation.y += diff * Math.min(1, dt * 18);
    this.animator?.update(dt);
    if (this.animator) this.weaponVis?.setSuppressed(!this.animator.holdsWeapon);
    // Morto: deita de costas
    const target = this.mode === 'dead' ? 1 : 0;
    if (this.lie !== target) {
      this.lie += Math.sign(target - this.lie) * Math.min(Math.abs(target - this.lie), dt * 4);
      const model = this.object.children[0];
      if (model) {
        this.modelBaseY ??= model.position.y;
        model.rotation.x = -this.lie * (Math.PI / 2);
        model.position.y = this.modelBaseY + this.lie * 0.12;
      }
    }
  }

  /**
   * Câmera orbital em terceira pessoa. `yaw` gira para os lados, `pitch` inclina (positivo = olha para baixo).
   * `aimK` (0 a 1) aproxima a câmera e a passa para o ombro direito ao mirar.
   * A câmera não atravessa prédios nem o chão.
   */
  followCamera(camera: THREE.PerspectiveCamera, dt: number, yaw: number, pitch: number, aimK: number): void {
    const p = this.object.position;
    const driving = this.mode === 'drive';
    const dist = driving ? 9 : THREE.MathUtils.lerp(CAM_DISTANCE, CAM_AIM_DISTANCE, aimK);
    const shoulder = driving ? 0 : 0.85 - 0.05 * aimK;
    this.crouchK += ((this.crouching && !driving ? 1 : 0) - this.crouchK) * Math.min(1, dt * 8);
    const target = new THREE.Vector3(p.x, p.y + (driving ? 1.6 : 1.25 - 0.45 * this.crouchK), p.z);
    const cp = Math.cos(pitch);
    // direção para onde a câmera olha
    const dir = new THREE.Vector3(Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp);
    const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    // ponto ideal: atrás do alvo, no ombro, e nunca abaixo do chão
    const from = target.clone().addScaledVector(right, shoulder);
    let d = dist;
    // colisão: do alvo até a câmera, encurta se bater em prédio
    const back = dir.clone().negate();
    for (const b of COLLIDERS) {
      const t = rayBox(from.x, from.y, from.z, back.x, back.y, back.z, b.minX - 0.25, b.bottom ?? 0, b.minZ - 0.25, b.maxX + 0.25, b.top + 0.25, b.maxZ + 0.25);
      if (t !== null && t < d) d = Math.max(1.6, t - 0.1);
    }
    // copas de árvores: a câmera para antes de entrar (se o jogador já está debaixo da copa, ela não atrapalha)
    for (const tr of TREES) {
      const ox = from.x - tr.x;
      const oy = from.y - tr.y;
      const oz = from.z - tr.z;
      if (Math.abs(ox) > 16 || Math.abs(oz) > 16) continue;
      const c = ox * ox + oy * oy + oz * oz - tr.r * tr.r;
      if (c < 0) continue; // ponto de partida dentro da copa
      const bq = ox * back.x + oy * back.y + oz * back.z;
      const disc = bq * bq - c;
      if (disc < 0) continue;
      const t = -bq - Math.sqrt(disc);
      if (t > 0 && t < d) d = Math.max(1.6, t - 0.1);
    }
    const desired = from.clone().addScaledVector(back, d);
    desired.y = Math.max(desired.y, 0.35);
    // segue rápido (a câmera acompanha o dedo sem "atraso" perceptível)
    camera.position.lerp(desired, 1 - Math.exp(-dt * 22));
    camera.lookAt(camera.position.x + dir.x, camera.position.y + dir.y, camera.position.z + dir.z);
  }

  /** Inclinação da mira: a arma e os braços acompanham para onde a câmera olha. */
  setAimPitch(pitch: number): void {
    this.weaponVis?.setPitch(pitch);
    this.animator?.setAimPitch(pitch);
  }
}

/** Altura do chão sob (x, z): 0 ou o topo de uma caixa que está abaixo dos pés. */
function supportHeight(x: number, z: number, feetY: number): number {
  let h = 0;
  for (const b of COLLIDERS) {
    if ((b.bottom ?? 0) <= feetY + STEP && x >= b.minX - 0.1 && x <= b.maxX + 0.1 && z >= b.minZ - 0.1 && z <= b.maxZ + 0.1 && b.top <= feetY + STEP) {
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
