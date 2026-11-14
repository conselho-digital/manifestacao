import * as THREE from 'three';
import type { Team } from './teams';
import { view } from './settings';
import { COLLIDERS, MAP, rayBox, terrainHeight, TREES, waterDepth, type Box } from './map';
import type { InputState } from './input';
import { CARS, hittables, type Car } from './vehicle';
import { ARMED_CODE, facesAim, isBatLike, isKnifeLike, type Animator, type Armed } from './anim';
import type { WeaponVisual } from './weapons';
import { rifleNetCode, type RifleKind } from './rifles';

const WALK_SPEED = 2.1;
const SPRINT_SPEED = 6.2;
const CROUCH_SPEED = 1.0;
const AIM_SPEED = 2.7; // andando com o fuzil no ombro
const GRAVITY = -20;
const JUMP_V = 6.8;
const RADIUS = 0.4;
const STEP = 0.45; // desnível que se sobe andando
/** Terceira pessoa: câmera atrás e um pouco à direita (ombro direito), de modo que a mira do centro da tela não caia sobre o personagem. */
const CAM_DISTANCE = 2.7;
const CAM_SHOULDER = 0.7;
/** Mirando (referência): colada atrás do ombro direito, cabeça no canto esquerdo e mira no centro. */
const CAM_AIM_DISTANCE = 1.35;
const CAM_AIM_SHOULDER = 0.55;
const CAM_LOOK_HEIGHT = 1.55; // a câmera olha para a altura da cabeça: o personagem aparece mais embaixo na tela
const CAM_AIM_HEIGHT = 1.5;
/** moto: batida acima desta velocidade (m/s) joga o piloto para a frente */
const CRASH_SPEED = 11; // ~40 km/h (era 9): só um pouco menos sensível

// Escalada: pular(0.63s) -> puxar(1.43s) -> levantar(0.4s)
/** Escalada: altura das mãos (m, acima dos pés) ao longo do clipe climb_pull (amostras a cada PULL_DT s, medidas no esqueleto). O clipe foi feito para uma borda alta (mãos a 2,2 m);
 *  numa borda baixa o personagem começa o clipe mais adiante, no ponto em que as mãos já estão na altura da borda, e o corpo sobe de modo que as mãos fiquem SEMPRE na borda. */
const PULL_HANDS = [2.19, 2.12, 1.95, 1.69, 1.43, 1.24, 1.12, 1.0, 0.93, 0.86, 0.86, 0.91, 0.92];
const PULL_DT = 0.1192;
const PULL_DUR = 1.433;
const GRAB_DUR = 0.633; // clipe climb_jump (só em bordas altas)
const STAND_DUR = 0.4;
const HIGH_EDGE = 2.1; // acima disso o personagem salta para agarrar a borda
const handsAt = (t: number): number => {
  const f = Math.min(PULL_HANDS.length - 1, Math.max(0, t / PULL_DT));
  const i = Math.min(PULL_HANDS.length - 2, Math.floor(f));
  return PULL_HANDS[i]! + (PULL_HANDS[i + 1]! - PULL_HANDS[i]!) * (f - i);
};
/** instante do clipe em que as mãos estão na altura h (as mãos descem ao longo do clipe) */
const pullStartFor = (h: number): number => {
  if (h >= PULL_HANDS[0]!) return 0;
  for (let t = 0; t < PULL_DUR; t += 0.01) if (handsAt(t) <= h) return t;
  return PULL_DT * 9;
};
const SPECIAL: Record<string, { dur: number; speed: number }> = {
  roll: { dur: 0.93, speed: 3.5 },
  dive: { dur: 1.5, speed: 3 },
};

type Mode = 'ground' | 'air' | 'climb' | 'special' | 'drive' | 'dead' | 'approach' | 'enter' | 'exit' | 'ko';

/** Entrar/sair do veículo em etapas (cada uma com o seu clipe do GTA SA) e lado onde o personagem fica. */
type SeqStage = 'open' | 'getin' | 'close' | 'pickup' | 'pullup' | 'getout' | 'shut';
const DOOR_SIDE = { car: 1.6, bike: 0.95 }; // distância do centro do veículo (lado do motorista, +x do modelo)
/** duração de cada etapa em segundos (o clipe é acelerado/esticado para isso, ver TIME_SCALE em anim.ts) */
const STAGE_DUR: Record<SeqStage, number> = { open: 0.9, getin: 1.15, close: 0.55, pickup: 1.0, pullup: 1.0, getout: 1.3, shut: 0.6 };
/** clipe de cada etapa; `side` -1 = lado direito da moto */
export const stageClip = (st: SeqStage, side: number): string => {
  const r = side < 0 ? '_r' : '_l';
  switch (st) {
    case 'open': return 'car_open_l';
    case 'getin': return 'car_getin_l';
    case 'close': return 'car_closedoor_l';
    case 'pickup': return 'bike_pickup' + r;
    case 'pullup': return 'bike_mount' + r; // subir na moto: de pé ao lado até sentado (o antigo bike_pullup do GTA é abaixar para levantar a moto do chão)
    case 'getout': return side < 0 ? 'car_getout_r' : 'car_getout_l';
    default: return 'car_close_l';
  }
};
/** Que etapa um clipe de entrar/sair representa: u = andamento (null = o do clipe), entering, lado. Usado nos jogadores remotos. */
export function stageOfClip(name: string): { u: number | null; entering: boolean; side: number } | null {
  switch (name) {
    case 'car_open_l': return { u: 0, entering: true, side: 1 };
    case 'bike_pickup_l': return { u: 0, entering: true, side: 1 };
    case 'bike_pickup_r': return { u: 0, entering: true, side: -1 };
    case 'car_getin_l': return { u: null, entering: true, side: 1 };
    case 'bike_mount_l': return { u: null, entering: true, side: 1 };
    case 'bike_mount_r': return { u: null, entering: true, side: -1 };
    case 'bike_pullup_l': return { u: null, entering: true, side: 1 };
    case 'bike_pullup_r': return { u: null, entering: true, side: -1 };
    case 'car_closedoor_l': return { u: 1, entering: true, side: 1 };
    case 'car_getout_l': return { u: null, entering: false, side: 1 };
    case 'car_getout_r': return { u: null, entering: false, side: -1 };
    case 'car_close_l': return { u: 1, entering: false, side: 1 };
    default: return null;
  }
}

/**
 * Posição do modelo durante a sequência de entrar/sair (u = 0..1 do tempo): deslocamento no espaço do veículo
 * (x para a esquerda, y da pélvis, z para a frente) e giro do modelo (de frente para a porta -> de frente para a rua).
 * `side` 1 = lado esquerdo (porta do motorista), -1 = lado direito (só motos).
 */
export function seatBlend(car: Car, u: number, entering: boolean, side = 1): { x: number; y: number; z: number; turn: number } {
  const k = THREE.MathUtils.clamp((u - 0.2) / 0.6, 0, 1);
  const f = entering ? k * k * (3 - 2 * k) : 1 - k * k * (3 - 2 * k); // 1 = sentado
  const seat = car.seat ?? new THREE.Vector3(0.48, 0.7, -0.2);
  const out = { x: (car.bike ? DOOR_SIDE.bike : DOOR_SIDE.car) * side, y: 0, z: seat.z - (car.bike ? 0 : 0.1) };
  const hop = car.bike && entering ? Math.sin(Math.PI * f) * 0.14 : 0; // pulinho ao passar a perna por cima da moto
  return {
    x: THREE.MathUtils.lerp(out.x, seat.x, f),
    y: THREE.MathUtils.lerp(out.y, seat.y - 0.97, f) + hop,
    z: THREE.MathUtils.lerp(out.z, seat.z, f),
    turn: -(Math.PI / 2) * (1 - f) * side,
  };
}

interface Climb {
  t: number;
  /** quanto tempo dura cada fase: aproximação/salto, subida (puxar) e levantar */
  aDur: number; bDur: number; t0: number; high: boolean;
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
  private special: { id: string; t: number } | null = null;
  /** deslocamento do corpo do clipe que está tocando (passos do golpe, empurrão, rolagem): já andado até agora */
  private mot: { name: string; f: number; l: number } | null = null;
  /** o botão de agachar está segurado (ao fim da rolagem, segurar = ficar agachado) */
  private holdCrouch = false;
  private climb: Climb | null = null;
  private car: Car | null = null;
  private armed: Armed = 'none';
  private rifleKind: RifleKind = 'ak';
  private crouching = false;
  private swingT = 0;
  private seqT = 0; // entrando/saindo do carro
  private stage: SeqStage = 'open';
  private side = 1; // lado de onde entra/sai (1 esquerda; -1 direita, só motos)
  private approachT = 0; // caminhando até a porta
  private route: THREE.Vector2[] = []; // pontos pelos quais contorna o veículo até a porta
  private approachMax = 1.6;
  private koVel = new THREE.Vector2();
  private koT = 0;
  private koCool = 0;
  private koFace = false; // atropelado: caiu de bruços (ko_skid_front) ou de costas (ko_skid_back)
  private koFront = false; // jogado da moto: voa para a frente (dive), cai de cara e levanta (getup_front)
  private koVy = 0;
  private modelRot0: number | null = null;
  private punchN = 0;
  private knifeN = 0;
  private lastKnifeAt = -1e9;
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
  /** chamado ao ser atropelado (m/s); devolve false se está protegido (então não há tombo nem dano) */
  onRunOver: ((speed: number) => boolean) | null = null;
  /** quem pode entrar neste veículo (veículos pessoais só aceitam o dono e a equipe dele) */
  enterRule: ((c: Car) => boolean) | null = null;
  /** tentou entrar num veículo de outra equipe */
  onEnterDenied: ((c: Car) => void) | null = null;
  /** saiu de um veículo (o dono avisa onde ele ficou) */
  onExitCar: ((c: Car) => void) | null = null;

  /** Liga a arma visual: o animador passa a posicioná-la (peito e mãos). */
  /** A bandeira (arma branca) mostra a pichação da equipe. */
  setFlagTeam(team: Team | null): void {
    this.weaponVis?.setFlagTeam(team, team?.name ?? '', team?.c1 ?? '#ffffff');
  }

  attachWeapon(w: WeaponVisual): void {
    this.weaponVis = w;
    if (this.animator) w.bind(this.animator);
    w.setRifleKind(this.rifleKind);
    this.animator?.setRifleKind(this.rifleKind);
  }

  constructor(object: THREE.Object3D, private animator: Animator | null = null) {
    this.object = object;
  }

  /** Vira o corpo para este ângulo (troca de personagem: o novo modelo continua olhando para o mesmo lado). */
  setHeading(rad: number): void { this.heading = rad; }

  get isDead(): boolean { return this.mode === 'dead'; }
  /** Há um carro livre a até 3,5 m (a pé)? Só então o botão de entrar aparece. */
  get nearCar(): boolean {
    if (this.mode !== 'ground') return false;
    const p = this.object.position;
    return CARS.some((c) => c.driver === null && this.mayEnter(c) && Math.hypot(c.x - p.x, c.z - p.z) < 3.5);
  }
  private mayEnter(c: Car): boolean { return !this.enterRule || this.enterRule(c); }
  get isCrouching(): boolean { return this.crouching; }
  get isBike(): boolean { return !!this.car?.bike; }
  get isDriving(): boolean { return this.mode === 'drive'; }
  get carSpeed(): number { return this.car ? this.car.speed : 0; }
  /** 0 nada, 1 fuzil, 2 fuzil mirando, 3 taco, 4 pistola, 5 pistola mirando (enviado aos outros) */
  get weaponCode(): number {
    if ((this.armed === 'rifle' || this.armed === 'aim') && this.rifleKind !== 'ak') return rifleNetCode(this.rifleKind, this.armed === 'aim');
    return ARMED_CODE[this.armed];
  }

  /** Qual fuzil está na mão (AK-47, M4A1, M16 ou Honey Badger): muda o modelo e onde ficam as mãos. */
  setRifleKind(k: RifleKind): void {
    if (k === this.rifleKind) return;
    this.rifleKind = k;
    this.animator?.setRifleKind(k);
    this.weaponVis?.setRifleKind(k);
  }

  /** Levou um golpe (soco, chute, tiro, taco): de soco/chute/tiro reage com os HIT_* do ped.ifp conforme o lado de onde veio; de arma branca, Bat_Hit_1-3 (baseball.ifp). */
  flinch(kind: 'f' | 'b' | 'k' = 'f', from?: { x: number; z: number }): void {
    if (this.mode !== 'ground') return;
    const now = performance.now();
    this.hitN = now - this.lastHitAt > 2500 ? 1 : this.hitN % 3 + 1;
    this.lastHitAt = now;
    let id: string;
    if (kind === 'b') id = `bat_hit_${this.hitN}`;
    else if (from && this.animator?.has('hitr_front')) {
      // de onde veio o golpe em relação ao corpo: frente, trás (duas reações em revezamento) ou lado
      const p = this.object.position;
      const dx = from.x - p.x;
      const dz = from.z - p.z;
      const f = dx * Math.sin(this.heading) + dz * Math.cos(this.heading);
      const l = dx * Math.cos(this.heading) - dz * Math.sin(this.heading);
      this.hitAlt = !this.hitAlt;
      if (Math.abs(f) >= Math.abs(l)) id = f >= 0 ? 'hitr_front' : this.hitAlt ? 'hitr_back' : 'hitr_behind';
      else id = l > 0 ? 'hitr_l' : 'hitr_r';
    } else if (kind === 'k') {
      this.hitAlt = !this.hitAlt;
      id = this.hitAlt ? 'hitk_2' : 'hitk_1';
    } else id = `hit_${this.hitN}`;
    this.swingT = this.clipLen(id, 0.6);
    this.animator?.restart(id);
    this.startMotion(id);
    if (id === 'hitk_2' && this.animator?.has('getup')) {
      // o chute derruba: cai, fica deitado e levanta (getup) em vez de "ficar de pé" de repente
      this.mode = 'ko';
      this.koT = 0;
      this.koFace = false;
      this.koFront = false;
      this.koVel.set(0, 0);
      this.crouching = false;
      this.weaponVis?.setHidden(true);
      this.animator?.setArmed('none');
    }
  }

  /** Combo corpo a corpo: soco, soco, soco e chute (alternando os 2 chutes). Retorna 'k' se foi chute. */
  punch(): 'f' | 'k' {
    if (this.mode !== 'ground') return 'f';
    this.punchN = this.punchN % 4 + 1;
    this.combatT = 3; // fica em guarda por 3 s
    if (this.punchN === 4) {
      this.kickAlt = !this.kickAlt;
      const id = this.kickAlt ? 'kick_2' : 'kick_1';
      this.swingT = this.clipLen(id, 0.6);
      this.animator?.restart(id);
      this.startMotion(id);
      return 'k';
    }
    this.swingT = this.punchN === 3 ? 0.8 : 0.7; // FightA_1/2/3 (jab, direto, gancho) acelerados 2x
    this.animator?.restart(`punch_${this.punchN}`);
    return 'f';
  }

  /** Golpe de arma branca (taco, bandeira, placa, facas...): sempre o clipe Bat_1 do baseball.ifp (a tacada), nunca os outros (Bat_2 e Bat_3 pareciam soco). */
  swing(): void {
    if (this.mode !== 'ground') return;
    // faca e garrafa: sequência knife_1, knife_2, knife_3 (knife.ifp); as outras armas brancas: a tacada Bat_1
    let id = 'bat_swing';
    if (isKnifeLike(this.armed) && this.animator?.has('knife_1')) {
      const now = performance.now();
      this.knifeN = now - this.lastKnifeAt > 1800 ? 1 : this.knifeN % 3 + 1;
      this.lastKnifeAt = now;
      id = `knife_${this.knifeN}`;
    }
    this.swingT = this.clipLen(id, 0.7);
    this.animator?.restart(id);
    this.startMotion(id);
  }

  /** Quanto o clipe dura de verdade (s, já com a velocidade); `fallback` se o clipe ainda não carregou. */
  private clipLen(name: string, fallback: number): number {
    return this.animator?.has(name) ? this.animator.length(name) * 0.92 : fallback;
  }

  /** Passa a andar com o corpo do clipe (osso Root do IFP: passo, empurrão, rolagem). */
  private startMotion(name: string): void {
    this.mot = this.animator?.hasMotion(name) ? { name, f: 0, l: 0 } : null;
  }

  /** Anda o que o clipe andou desde o último quadro (para a frente e para a esquerda do corpo), respeitando as colisões. */
  private applyMotion(): void {
    const m = this.mot;
    const a = this.animator;
    if (!m || !a) return;
    if (a.name !== m.name) { this.mot = null; return; }
    const cur = a.motionAt(m.name, a.time);
    if (!cur) { this.mot = null; return; }
    const df = cur.f - m.f;
    const dl = cur.l - m.l;
    m.f = cur.f;
    m.l = cur.l;
    if (Math.abs(df) + Math.abs(dl) < 1e-5) return;
    // quem apanha só escorrega um pouco (o IFP empurra 1 a 2 m por golpe)
    const k = /^(hit_|bat_hit_|hitk_|hitr_)/.test(m.name) ? 0.4 : 1;
    const h = this.heading;
    this.moveHoriz((Math.sin(h) * df + Math.cos(h) * dl) * k, (Math.cos(h) * df - Math.sin(h) * dl) * k);
  }

  /** Recarregando (a pistola mostra o colt45_reload nas mãos). */
  setReloading(on: boolean): void {
    this.animator?.setReloading(on);
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
    return this.animator?.name || 'idle';
  }

  /** Id do carro que está dirigindo (-1 = nenhum; 8 = veículo pessoal, ver carOwner). */
  get carId(): number {
    return this.car ? (this.car.ownerId ? 8 : this.car.id) : -1;
  }

  /** Dono do veículo pessoal que está dirigindo ('' = veículo comum ou nenhum). */
  get carOwner(): string {
    return this.car?.ownerId ?? '';
  }

  /** Veículo que está dirigindo (ou null). */
  get drivenCar(): Car | null { return this.car; }

  /** Direção do carro (a câmera acompanha), ou null a pé. */
  get driveHeading(): number | null {
    return this.car ? this.car.heading : null;
  }

  update(dt: number, input: InputState, yaw: number): void {
    const pos = this.object.position;
    this.weaponVis?.update(dt);
    this.holdCrouch = input.crouchHeld;

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
    if (this.mode === 'special') { this.finish(dt); return; }

    if (input.interact && this.mode === 'ground' && this.tryEnterCar()) return;
    if (input.climb && this.tryClimb()) { this.finish(dt); return; }

    if (input.crouch && this.mode === 'ground') {
      // andando e apertando agachar: rola para o lado em que anda; parado, só agacha/levanta
      if (!this.crouching && moving && this.tryRoll(input, yaw)) { this.finish(dt); return; }
      this.crouching = !this.crouching;
    }
    if (input.jump) this.crouching = false;

    // Pular perto de um obstáculo alto escala sozinho
    if (input.jump && this.mode === 'ground' && this.tryClimb(1.05, 1.6)) { this.finish(dt); return; }
    if (input.jump && this.mode === 'ground') {
      this.vy = JUMP_V;
      this.mode = 'air';
      this.launchT = 0.2;
      this.landT = 0;
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
      const wade = waterDepth(pos.x, pos.z) > 0.05 ? 0.6 : 1; // dentro da água rasa anda mais devagar
      this.moveHoriz(dir.x * speed * wade * dt, dir.z * speed * wade * dt);
      this.heading = Math.atan2(dir.x, dir.z);
      // direção em relação ao corpo quando ele olha para onde a câmera aponta
      this.moveF = dir.x * Math.sin(yaw) + dir.z * Math.cos(yaw);
      this.moveL = dir.x * Math.cos(yaw) - dir.z * Math.sin(yaw);
    }
    // Armado (em pé, andando, mirando ou atirando): o corpo acompanha para onde a câmera aponta
    if (facesAim(this.armed) && !this.crouching) this.heading = yaw; // agachado o corpo segue o movimento (andar agachado de lado ficava torto)

    // Vertical
    const support = supportHeight(pos.x, pos.z, pos.y);
    if (this.mode === 'ground') {
      // em ladeira (terreno rebaixado) o pé acompanha o chão ao descer; só vira queda numa borda de caixa
      if (pos.y > support + 0.05 + (support <= terrainHeight(pos.x, pos.z) + 1e-6 ? 0.7 : 0)) { this.mode = 'air'; this.vy = 0; } // saiu de uma borda
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

    this.applyMotion();
    this.selectAnimation(dt, input, moving);
    this.finish(dt);
  }

  /** Rolagem (VRolling_*): escolhe o clipe pela direção em que anda em relação ao corpo. */
  private tryRoll(input: InputState, yaw: number): boolean {
    const a = this.animator;
    if (!a || !a.has('roll_f')) return false;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const dir = fwd.multiplyScalar(input.y).add(right.multiplyScalar(input.x));
    if (dir.lengthSq() < 1e-6) return false;
    dir.normalize();
    if (!facesAim(this.armed)) this.heading = Math.atan2(dir.x, dir.z); // sem mirar o corpo já olha para onde anda: rola para a frente
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const ang = Math.atan2(dir.x * fz - dir.z * fx, dir.x * fx + dir.z * fz) * 180 / Math.PI; // + = esquerda do corpo
    const ad = Math.abs(ang);
    const s = ang > 0 ? 'l' : 'r';
    const id = ad < 22.5 ? 'roll_f' : ad < 67.5 ? `roll_f${s}` : ad < 112.5 ? `roll_${s}` : ad < 157.5 ? `roll_b${s}` : 'roll_b';
    if (!a.has(id)) return false;
    this.mode = 'special';
    this.special = { id, t: 0 };
    a.restart(id);
    this.startMotion(id);
    return true;
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
    const armed = facesAim(this.armed) && !this.crouching; // só o fuzil e a pistola mirando usam os passos de arma (de frente, de costas e de lado)
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
      // correndo armado: fuzil nas duas mãos = run_armed; pistola = run_1armed (ped.ifp); sem arma de fogo, sprint
      const gunRun = this.armed === 'rifle' || this.armed === 'aim' ? 'run_armed' : this.armed === 'pistol' || this.armed === 'pistol_aim' ? 'run_1armed' : 'sprint';
      const clip = input.sprint ? (a.has(gunRun) ? gunRun : 'sprint') : 'walk';
      a.play(a.has(clip) ? clip : 'walk');
    } else if (this.armed === 'pistol_aim' && a.has('arrestgun')) a.play('arrestgun'); // pistola mirando parado: o corpo e a pose de mirar do ARRESTgun (ped.ifp)
    else a.play(this.combatT > 0 && this.armed === 'none' && a.has('combat_idle') ? 'combat_idle' : isKnifeLike(this.armed) && a.has('knife_idle') ? 'knife_idle' : isBatLike(this.armed) && a.has('bat_idle') ? 'bat_idle' : (this.armed === 'rifle' || this.armed === 'aim') && a.has('gun_idle') ? 'gun_idle' : 'idle');
  }

  private updateSpecial(dt: number): void {
    const sp = this.special!;
    const cfg = SPECIAL[sp.id];
    sp.t += dt;
    if (!cfg) {
      // rolagem com o clipe do IFP: o corpo anda pelo deslocamento do clipe; segurando o botão de agachar até o fim, fica agachado
      this.applyMotion();
      if (sp.t >= (this.animator?.length(sp.id) ?? 1)) {
        this.special = null;
        this.mode = 'ground';
        this.mot = null;
        this.crouching = this.holdCrouch;
        this.animator?.play(this.crouching ? 'crouch_idle' : 'idle');
      }
      return;
    }
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
    let denied: Car | null = null;
    for (const c of CARS) {
      const d = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (c.driver !== null || d >= bestD) continue;
      if (this.mayEnter(c)) { best = c; bestD = d; } else denied = c;
    }
    if (!best) { if (denied) this.onEnterDenied?.(denied); return false; }
    best.driver = 'local';
    this.car = best;
    // moto: entra pelo lado em que o jogador está; carro: só pela porta do motorista
    this.side = best.bike && (pos.x - best.x) * Math.cos(best.heading) - (pos.z - best.z) * Math.sin(best.heading) < 0 ? -1 : 1;
    best.holdFallen = best.fallen; // moto caída: continua deitada até o personagem levantar
    this.vy = 0;
    this.object.visible = true; // o motorista aparece sentado (carro ou moto)
    this.crouching = false;
    this.weaponVis?.setHidden(true);
    // caminha até a porta do motorista (ou o lado da moto); chegando lá, abre e entra
    this.mode = 'approach';
    this.approachT = 0;
    this.planRoute(best);
    return true;
  }

  /**
   * Caminho até a porta sem atravessar o veículo: se a reta passa por dentro da caixa do carro, contorna pela frente ou por trás
   * (escolhe o contorno mais curto). Espaço local: lx para a esquerda do veículo, lz para a frente.
   */
  private planRoute(car: Car): void {
    this.route = [];
    const hw = car.bike ? 0.5 : 1.1;
    const hl = car.bike ? 1.2 : 2.45;
    const c = hw + 0.45;
    const d = hl + 0.45;
    const cos = Math.cos(car.heading);
    const sin = Math.sin(car.heading);
    const toLocal = (x: number, z: number): THREE.Vector2 => new THREE.Vector2((x - car.x) * cos - (z - car.z) * sin, (x - car.x) * sin + (z - car.z) * cos);
    const toWorld = (v: THREE.Vector2): THREE.Vector2 => new THREE.Vector2(car.x + v.x * cos + v.y * sin, car.z - v.x * sin + v.y * cos);
    const hitsBox = (a: THREE.Vector2, b: THREE.Vector2): boolean => {
      // segmento a-b contra a caixa (|lx| < hw, |lz| < hl), por amostragem curta
      const n = Math.max(2, Math.ceil(a.distanceTo(b) / 0.2));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        if (Math.abs(a.x + (b.x - a.x) * t) < hw && Math.abs(a.y + (b.y - a.y) * t) < hl) return true;
      }
      return false;
    };
    const start = toLocal(this.object.position.x, this.object.position.z);
    const door = toLocal(this.doorPoint(car).x, this.doorPoint(car).y);
    const paths: THREE.Vector2[][] = [
      [door],
      [new THREE.Vector2(c, d), door], [new THREE.Vector2(c, -d), door],
      [new THREE.Vector2(-c, d), new THREE.Vector2(c, d), door], [new THREE.Vector2(-c, -d), new THREE.Vector2(c, -d), door],
    ];
    let best: THREE.Vector2[] | null = null;
    let bestLen = Infinity;
    for (const path of paths) {
      let len = 0;
      let prev = start;
      let ok = true;
      for (const pt of path) {
        if (hitsBox(prev, pt)) { ok = false; break; }
        len += prev.distanceTo(pt);
        prev = pt;
      }
      if (ok && len < bestLen) { best = path; bestLen = len; }
    }
    if (best) this.route = best.slice(0, -1).map(toWorld); // o último ponto (a porta) é tratado em updateApproach
    this.approachMax = Math.max(1.6, (Number.isFinite(bestLen) ? bestLen : 0) / (WALK_SPEED * 0.8));
  }

  /** Ponto ao lado do motorista (lado esquerdo do veículo), no chão. */
  private doorPoint(car: Car): THREE.Vector2 {
    const side = (car.bike ? DOOR_SIDE.bike : DOOR_SIDE.car) * this.side;
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
    const way = this.route[0];
    const target = way ?? this.doorPoint(car);
    const dx = target.x - pos.x;
    const dz = target.y - pos.z;
    const dist = Math.hypot(dx, dz);
    this.approachT += dt;
    if (way && this.approachT > this.approachMax + 1.5) this.route = []; // preso em algum obstáculo: vai direto
    if (way) {
      // ponto do contorno: ao chegar perto passa para o próximo
      if (dist < 0.3) this.route.shift();
    } else if (dist < 0.12 || this.approachT > this.approachMax) {
      this.mode = 'enter';
      this.setStage(car.bike ? (car.fallen ? 'pickup' : 'pullup') : 'open');
      return;
    }
    const step = Math.min(dist, WALK_SPEED * dt);
    this.moveHoriz((dx / Math.max(dist, 1e-6)) * step, (dz / Math.max(dist, 1e-6)) * step);
    this.heading = Math.atan2(dx, dz);
    this.animator?.play('walk');
    this.finish(dt);
  }

  private updateDrive(dt: number, input: InputState): void {
    const car = this.car!;
    if (input.interact) {
      car.speed = 0;
      this.side = car.bike ? this.side : 1;
      this.mode = 'exit';
      this.setStage('getout');
      return;
    }
    // No carro: acelerador, freio e freio de mão; o joystick (A/D) só esterça
    car.drive(dt, input.gas, input.brake, input.handbrake, input.x, input.wheelie);
    if (car.bike && car.impact > CRASH_SPEED) { this.crashBike(car, car.impact); return; }
    this.object.position.set(car.x, car.groundY, car.z);
    this.heading = car.heading;
    this.object.rotation.order = 'YXZ';
    this.object.rotation.set(car.slopeP, car.heading, car.slopeR); // o piloto acompanha a inclinação do relevo junto com o veículo
    const bp = car.bikePose();
    if (bp) {
      // o piloto fica preso à moto: gira junto em torno do eixo traseiro (empinar e inclinar)
      this.object.rotation.set(bp.pitch + car.slopeP, car.heading, bp.roll + car.slopeR);
      const r = new THREE.Euler(bp.pitch, 0, bp.roll, 'XYZ');
      const d = bp.axle.clone().sub(bp.axle.clone().applyEuler(r)).applyAxisAngle(new THREE.Vector3(0, 1, 0), car.heading);
      this.object.position.add(d);
    }
    if (car.seat) {
      this.animator?.setRide(car.seat, car.grips, car.riderLean, car.riderShift);
      this.animator?.setArmed('none');
      this.animator?.play(car.bike ? 'bike_ride' : 'car_sit');
      this.animator?.update(dt);
    }
  }

  private resetModelRot(): void {
    const model = this.object.children[0];
    if (model && this.modelRot0 !== null) model.rotation.y = this.modelRot0;
  }

  private setStage(st: SeqStage): void {
    this.stage = st;
    this.seqT = 0;
  }

  /** Entrando/saindo do veículo, em etapas: abrir a porta, sentar, fechar (carro); levantar a moto caída e subir (moto); sair e fechar a porta. */
  private updateSeq(dt: number): void {
    const car = this.car!;
    const st = this.stage;
    const dur = STAGE_DUR[st];
    this.seqT = Math.min(dur, this.seqT + dt);
    const u = this.seqT / dur;
    // porta: abre no meio do "abrir", fecha no meio do "fechar"; moto caída levanta no meio do "levantar"
    if (st === 'open' && u >= 0.4) car.doorHold = true;
    else if (st === 'getout' && u >= 0.1) car.doorHold = true;
    else if ((st === 'close' || st === 'shut') && u >= 0.45) car.doorHold = false;
    if (st === 'pickup' && u >= 0.5) car.holdFallen = false;
    const seated = st === 'close';
    const entering = st === 'open' || st === 'getin' || st === 'close' || st === 'pickup' || st === 'pullup';
    const at = st === 'open' || st === 'pickup' ? 0 : st === 'shut' ? 1 : seated ? 1 : u; // 0/1 = só ao lado do veículo / sentado
    const b = seatBlend(car, at, entering, this.side);
    this.object.position.set(car.x, car.groundY, car.z);
    this.object.rotation.order = 'YXZ';
    this.object.rotation.set(car.slopeP, car.heading, car.slopeR);
    this.heading = car.heading;
    const model = this.object.children[0];
    if (model) {
      this.modelRot0 ??= model.rotation.y;
      model.rotation.y = this.modelRot0 + b.turn; // de frente para a porta até de frente para a rua
    }
    this.animator?.setRideRaw(b);
    this.animator?.setArmed('none');
    this.animator?.play(stageClip(st, this.side));
    this.animator?.update(dt);
    if (this.seqT < dur) return;
    switch (st) {
      case 'open': this.setStage('getin'); break;
      case 'getin': this.setStage('close'); break;
      case 'pickup': this.setStage('pullup'); break;
      case 'getout': if (car.bike) this.exitCar(); else this.setStage('shut'); break;
      case 'shut': this.exitCar(); break;
      default: // close, pullup: sentado, pode dirigir
        car.doorHold = false;
        car.holdFallen = false;
        this.mode = 'drive';
        this.resetModelRot();
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
        if (this.onRunOver && !this.onRunOver(sp)) continue; // protegido: o carro não derruba
        const dir = new THREE.Vector2(h.vx / sp, h.vz / sp);
        this.koVel.copy(dir).multiplyScalar(Math.min(9, sp * 0.9)).add(new THREE.Vector2(dx, dz).normalize().multiplyScalar(2));
        this.mode = 'ko';
        this.koT = 0;
        this.crouching = false;
        this.weaponVis?.setHidden(true);
        this.animator?.setArmed('none');
        // cai de costas (KO_skid_back) se o carro vem pela frente, de bruços (KO_skid_front) se vem por trás; o corpo se vira para cair no sentido da batida
        const fwd = Math.sin(this.heading) * dir.x + Math.cos(this.heading) * dir.y;
        this.koFace = fwd >= 0;
        if (!this.koFace) this.heading = Math.atan2(-dir.x, -dir.y);
        else this.heading = Math.atan2(dir.x, dir.y);
        this.object.rotation.y = this.heading;
        this.animator?.restart(this.koFace ? 'ko_skid_front' : 'ko_skid_back');
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
    this.object.position.set(car.x + Math.sin(h) * 0.9, car.groundY + 0.9, car.z + Math.cos(h) * 0.9);
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
      const gy = terrainHeight(pos.x, pos.z);
      pos.y = Math.max(gy, pos.y + this.koVy * dt);
      const ground = pos.y <= gy;
      if (ground) { this.koVy = 0; this.koVel.multiplyScalar(Math.exp(-dt * 3.5)); }
      this.animator?.setFlail(ground ? Math.max(0, 1 - (this.koT - 0.6) * 1.2) : 1);
      if (this.koT > 2.2 && this.animator?.name !== 'getup_front') { this.animator?.setFlail(0); this.animator?.play('getup_front'); }
      if (this.koT > 3.5) this.endKo();
    } else {
      this.koVel.multiplyScalar(Math.exp(-dt * 2.4));
      pos.y = Math.max(terrainHeight(pos.x, pos.z), pos.y - 20 * dt);
      const lie = this.koFace ? 1.5 : 1.3; // fica caído um instante antes de levantar
      if (this.koT > lie) this.animator?.play(this.koFace ? 'getup_front' : 'getup');
      if (this.koT > lie + this.clipLen(this.koFace ? 'getup_front' : 'getup', 1.3)) this.endKo();
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
    const rx = Math.cos(car.heading) * this.side;
    const rz = -Math.sin(car.heading) * this.side;
    const side = (car.bike ? DOOR_SIDE.bike : DOOR_SIDE.car) + 0.3;
    car.doorHold = false;
    this.object.position.set(
      THREE.MathUtils.clamp(car.x + rx * side, -(MAP.halfX - 1), MAP.halfX - 1), terrainHeight(car.x + rx * side, car.z + rz * side),
      THREE.MathUtils.clamp(car.z + rz * side, -(MAP.halfZ - 1), MAP.halfZ - 1),
    );
    this.resetModelRot();
    car.driver = null;
    car.speed = 0;
    this.onExitCar?.(car);
    this.object.rotation.set(0, car.heading, 0);
    this.object.rotation.order = 'XYZ';
    this.car = null;
    this.object.visible = true;
    this.animator?.setRide(null);
    this.weaponVis?.setHidden(false); // entrar no veículo esconde a arma: ao sair ela volta (antes ficava escondida para sempre)
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
    const high = b.top - pos.y > HIGH_EDGE;
    const t0 = high ? 0 : pullStartFor(b.top - pos.y);
    this.climb = {
      t: 0, high, t0, aDur: high ? GRAB_DUR : 0.3, bDur: PULL_DUR - t0,
      start: pos.clone(), face: new THREE.Vector2(fx - dx * 0.25, fz - dz * 0.25),
      top: b.top, land: new THREE.Vector2(lx, lz), dir: new THREE.Vector2(dx, dz),
    };
    this.mode = 'climb';
    this.vy = 0;
    this.animator?.restart(high ? 'climb_jump' : 'idle');
    this.climbPhase = 0;
    return true;
  }

  private climbPhase = 0;

  private updateClimb(dt: number): void {
    const c = this.climb!;
    const pos = this.object.position;
    c.t += dt;
    const ease = (u: number): number => u * u * (3 - 2 * u);
    const bEnd = c.aDur + c.bDur;
    if (c.t < c.aDur) {
      // aproximação (e, em borda alta, o salto): chega junto da borda
      const u = ease(Math.min(1, c.t / c.aDur));
      pos.x = THREE.MathUtils.lerp(c.start.x, c.face.x, u);
      pos.z = THREE.MathUtils.lerp(c.start.z, c.face.y, u);
      pos.y = c.high ? THREE.MathUtils.lerp(c.start.y, Math.max(c.start.y, c.top - PULL_HANDS[0]!), u) : c.start.y;
    } else if (c.t < bEnd) {
      // puxar o corpo para cima com as mãos na borda: a altura do corpo sai da altura das mãos no clipe
      if (this.climbPhase < 1) { this.climbPhase = 1; if (c.t0 > 0) this.animator?.seek('climb_pull', c.t0); else this.animator?.play('climb_pull'); }
      const tau = c.t - c.aDur;
      pos.x = c.face.x;
      pos.z = c.face.y;
      const byHands = c.top - handsAt(c.t0 + tau);
      const tail = Math.max(0, Math.min(1, (tau - (c.bDur - 0.4)) / 0.4)); // no fim, as pernas sobem e o corpo termina em cima da borda
      pos.y = Math.max(c.start.y, THREE.MathUtils.lerp(byHands, c.top, ease(tail)));
    } else {
      const u = ease(Math.min(1, (c.t - bEnd) / STAND_DUR));
      pos.x = THREE.MathUtils.lerp(c.face.x, c.land.x, u);
      pos.z = THREE.MathUtils.lerp(c.face.y, c.land.y, u);
      pos.y = c.top;
      if (this.climbPhase < 2) { this.climbPhase = 2; this.animator?.play('climb_stand'); }
    }
    // mãos por IK em cima da borda: sobem de peso no fim da aproximação, ficam na borda enquanto o corpo sobe e soltam ao levantar
    const wIn = c.t < c.aDur ? ease(Math.max(0, (c.t - c.aDur * 0.4) / (c.aDur * 0.6))) : 1;
    const wOut = c.t > bEnd ? 1 - ease(Math.min(1, (c.t - bEnd) / 0.25)) : 1;
    this.animator?.setClimbHands(Math.max(0, c.top - pos.y), Math.min(wIn, wOut));
    this.heading = Math.atan2(c.dir.x, c.dir.y);
    if (c.t >= bEnd + STAND_DUR) {
      this.animator?.setClimbHands(null);
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
  followCamera(camera: THREE.PerspectiveCamera, dt: number, yaw: number, pitch: number, aimK: number, snap = false): void {
    const p = this.object.position;
    const driving = this.mode === 'drive';
    // tecla C: 0 = terceira pessoa, 1 = terceira pessoa perto (metade da distância), 2 = primeira pessoa (só a pé)
    const mode = driving && view.mode === 2 ? 0 : view.mode;
    const near = mode === 1 ? 0.5 : 1;
    const dist = driving ? (this.car?.bike ? 6.2 : 8) * near : THREE.MathUtils.lerp(CAM_DISTANCE * near, CAM_AIM_DISTANCE, aimK);
    const shoulder = driving ? 0 : THREE.MathUtils.lerp(CAM_SHOULDER * near, CAM_AIM_SHOULDER, aimK); // a pé: sempre à direita do personagem
    const fp = mode === 2 && !snap;
    const nearPlane = fp ? 0.1 : 1;
    if (camera.near !== nearPlane) { camera.near = nearPlane; camera.updateProjectionMatrix(); }
    if (fp) {
      const eye = new THREE.Vector3();
      const fpDir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      if (this.animator?.firstPerson(true, eye)) eye.y += 0.22; else eye.set(p.x, p.y + 1.35 - 0.4 * this.crouchK, p.z); // altura do peito: a arma aparece na tela
      eye.x += Math.sin(yaw) * 0.25;
      eye.z += Math.cos(yaw) * 0.25;
      camera.position.copy(eye);
      camera.lookAt(eye.x + fpDir.x, eye.y + fpDir.y, eye.z + fpDir.z);
      return;
    }
    this.animator?.firstPerson(false, new THREE.Vector3());
    this.crouchK += ((this.crouching && !driving ? 1 : 0) - this.crouchK) * Math.min(1, dt * 8);
    const target = new THREE.Vector3(p.x, p.y + (driving ? 1.35 : THREE.MathUtils.lerp(CAM_LOOK_HEIGHT, CAM_AIM_HEIGHT, aimK) - 0.5 * this.crouchK), p.z);
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
      if (t !== null && t < d) d = Math.max(Math.min(1.6, dist), t - 0.1);
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
      if (t > 0 && t < d) d = Math.max(Math.min(1.6, dist), t - 0.1);
    }
    const desired = from.clone().addScaledVector(back, d);
    desired.y = Math.max(desired.y, terrainHeight(desired.x, desired.z) + 0.35);
    // segue rápido (a câmera acompanha o dedo sem "atraso" perceptível)
    if (snap) camera.position.copy(desired); // voo de entrada: o main mistura com a câmera do menu
    else camera.position.lerp(desired, 1 - Math.exp(-dt * 22));
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
  let h = terrainHeight(x, z);
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
