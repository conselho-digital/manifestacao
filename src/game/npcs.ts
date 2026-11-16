// Pedestres (NPCs) que andam pela cidade. Só enfeite: cada jogador vê os seus (não vão pela rede), não levam tiro e não têm colisão com o jogador.
// Andam em linha reta até um ponto sorteado (calçada/parque, fora das pistas), esperam um pouco e escolhem outro. Desviam de prédios, postes e água.
import * as THREE from 'three';
import { Animator } from './anim';
import { createCharacter, type BuiltinName } from './characters';
import { CITY, COLLIDERS, ROADS, terrainHeight, waterDepth } from './map';
import { IS_TOUCH } from './scene';

const COUNT = IS_TOUCH ? 18 : 26; // +10 em cada (o jogador via só um ou dois)
const NEAR_FIRST = 8; // os primeiros nascem perto de quem entrou, para a rua não parecer vazia
const WALK_SPEED = 2.1; // o mesmo do jogador: o passo do clipe 'walk' foi ajustado para essa velocidade
const ACTIVE_R = 75; // além disso o NPC fica parado e escondido (sem gastar com animação)
const HIDE_R = 110;
const CHARS: BuiltinName[] = ['Vini', 'Xandao', 'PF', 'Gang1', 'Gang2', 'Gang3', 'Gang4', 'MaiBrasil', 'MaiMexico'];

const inRect = (r: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number): boolean => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

/** Círculos de todos os veículos (parados e em movimento), atualizados a cada quadro: os veículos também são objetos, ninguém atravessa. */
let vehCircles: [number, number, number][] = [];

/** Chão livre para um pedestre: sem prédio/poste/árvore/veículo (com folga), sem água. `skip` = ponto de um veículo que está atropelando (ignora os círculos dele). */
function free(x: number, z: number, pad: number, skip?: [number, number]): boolean {
  if (Math.abs(x) > CITY.halfX - 3 || Math.abs(z) > CITY.halfZ - 3) return false;
  if (waterDepth(x, z) > 0.02) return false;
  const y = terrainHeight(x, z);
  for (const b of COLLIDERS) {
    if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad && (b.bottom ?? 0) < y + 1.4 && b.top > y + 0.35) return false;
  }
  for (const [cx, cz, r] of vehCircles) {
    if (skip && Math.hypot(cx - skip[0], cz - skip[1]) < 3.5) continue;
    if (Math.hypot(x - cx, z - cz) < r + pad) return false;
  }
  return true;
}

/** O caminho reto de (ax, az) até (bx, bz) está livre? */
function clear(ax: number, az: number, bx: number, bz: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.2));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (!free(ax + (bx - ax) * t, az + (bz - az) * t, 0.55)) return false;
  }
  return true;
}

const onRoad = (x: number, z: number): boolean => ROADS.some((r) => inRect(r, x, z));

const FLEE_SPEED = 5.2; // um pouco abaixo da corrida do jogador (6,2 m/s)
const NPC_HEALTH = 60;
const CORPSE_S = 9; // quanto tempo o corpo fica no chão antes de outro pedestre nascer

type St = 'idle' | 'walk' | 'flee' | 'hurt' | 'down' | 'getup' | 'dead' | 'fly' | 'tumble' | 'hide';

const FLY_GRAVITY = 22; // m/s² (o mesmo peso do voo do jogador atropelado)
const TUMBLE_S = 1.0; // quanto tempo rola no chão depois de cair

/** Um lugar livre (fora das pistas) a pelo menos `minD` m de (ax, az). */
function pickSpot(ax: number, az: number, minD: number): [number, number] | null {
  for (let k = 0; k < 200; k++) {
    const x = (Math.random() * 2 - 1) * (CITY.halfX - 6);
    const z = (Math.random() * 2 - 1) * (CITY.halfZ - 6);
    if (onRoad(x, z) || !free(x, z, 1.2)) continue;
    if (Math.hypot(x - ax, z - az) < minD) continue;
    return [x, z];
  }
  return null;
}

export class Npc {
  readonly root = new THREE.Group();
  private animator: Animator | null = null;
  private tx = 0;
  private tz = 0;
  private wait = 0;
  private st: St = 'idle';
  private t = 0;
  private health = NPC_HEALTH;
  private kx = 0; // empurrão do golpe/tiro (m/s) que vai acabando: o corpo escorrega para longe de quem bateu
  private kz = 0;
  private vy = 0; // velocidade vertical no voo do atropelamento
  private hx = 0; // de onde veio a ameaça (tiro, golpe, veículo)
  private hz = 0;
  private hiding = false; // foge para um esconderijo (tx, tz) em vez de só correr em linha reta
  private fx = 0; // direção de fuga (vetor unitário)
  private fz = 0;
  private ready = false;
  private model: BuiltinName;

  constructor(name: BuiltinName, x: number, z: number) {
    this.model = name;
    this.root.position.set(x, terrainHeight(x, z), z);
    this.root.rotation.y = Math.random() * Math.PI * 2;
    this.root.visible = false;
    this.wait = Math.random() * 3;
    void createCharacter(name).then(async (m) => {
      this.root.add(m);
      this.animator = await Animator.create(m);
      this.ready = true;
      this.root.visible = true;
    }).catch(() => undefined);
  }

  get alive(): boolean { return this.ready && this.st !== 'dead' && this.st !== 'down' && this.st !== 'fly' && this.st !== 'tumble'; }
  get pos(): THREE.Vector3 { return this.root.position; }

  /** De que lado veio o golpe em relação a para onde o pedestre olha: 'front' | 'back' | 'l' | 'r', mais o produto escalar com a frente. */
  private side(fromX: number, fromZ: number): { s: 'front' | 'back' | 'l' | 'r'; dot: number } {
    const y = this.root.rotation.y;
    const ax = fromX - this.root.position.x;
    const az = fromZ - this.root.position.z;
    const l = Math.hypot(ax, az) || 1;
    const dot = (ax * Math.sin(y) + az * Math.cos(y)) / l; // 1 = veio de frente, -1 = veio por trás
    const left = (ax * Math.cos(y) - az * Math.sin(y)) / l; // > 0 = veio da esquerda
    if (dot > 0.55) return { s: 'front', dot };
    if (dot < -0.55) return { s: 'back', dot };
    return { s: left > 0 ? 'l' : 'r', dot };
  }

  /** Levou dano (tiro, soco, taco). `fromX/fromZ` = de onde veio: ele reage pelo lado do golpe, é empurrado para longe e foge (ou cai morto). */
  hurt(dmg: number, fromX: number, fromZ: number): void {
    if (this.st === 'dead') return;
    this.health -= dmg;
    const { s: side, dot } = this.side(fromX, fromZ);
    this.flinchFrom(fromX, fromZ);
    if (this.health <= 0) {
      // morre caindo para longe de quem atirou: de costas se levou de frente, de bruços se levou por trás; o corpo escorrega um pouco
      this.st = 'dead';
      this.t = CORPSE_S;
      this.kx = this.fx * 3.2;
      this.kz = this.fz * 3.2;
      this.animator?.restart(dot >= 0 ? 'ko_skid_back' : 'ko_skid_front');
      return;
    }
    this.st = 'hurt';
    this.t = 0.6;
    this.kx = this.fx * 1.8;
    this.kz = this.fz * 1.8;
    const clip = side === 'front' ? 'hitr_front' : side === 'back' ? (Math.random() < 0.5 ? 'hitr_back' : 'hitr_behind') : side === 'l' ? 'hitr_l' : 'hitr_r';
    this.animator?.restart(clip);
  }

  /** Atropelado a `speed` m/s: é lançado no ar (braços e pernas soltos), cai, rola no chão e então levanta e foge (ou fica caído se o golpe foi forte). */
  runOver(speed: number, fromX: number, fromZ: number): void {
    if (this.st === 'dead' || this.st === 'down' || this.st === 'getup' || this.st === 'fly' || this.st === 'tumble') return;
    this.health -= Math.min(100, 20 + speed * 5);
    this.flinchFrom(fromX, fromZ);
    this.root.rotation.y = Math.atan2(this.fx, this.fz); // voa na direção do veículo
    const h = Math.min(20, speed * 1.2); // quanto mais rápido o veículo, mais longe ele vai
    this.kx = this.fx * h;
    this.kz = this.fz * h;
    this.vy = 2.2 + Math.min(2, speed * 0.12); // voo baixo (cerca de 1 m de altura) e comprido
    this.root.position.y += 0.3;
    this.st = 'fly';
    this.t = 0;
    this.animator?.setFlail(1);
    this.animator?.restart('dive');
  }

  /** Voo do atropelamento; ao pousar começa a rolar. */
  private flyStep(dt: number): void {
    const p = this.root.position;
    const nx = p.x + this.kx * dt;
    const nz = p.z + this.kz * dt;
    if (free(nx, nz, 0.4, [this.hx, this.hz])) { p.x = nx; p.z = nz; } else { this.kx *= 0.1; this.kz *= 0.1; }
    this.vy -= FLY_GRAVITY * dt;
    const gy = terrainHeight(p.x, p.z);
    p.y += this.vy * dt;
    if (p.y > gy) return;
    p.y = gy;
    this.vy = 0;
    this.st = 'tumble';
    this.t = TUMBLE_S;
    this.animator?.restart('roll_f');
  }

  /** Barulho (tiro) a `d` m: se não está ferido, sai correndo no sentido contrário. */
  scare(fromX: number, fromZ: number): void {
    if (this.st === 'hide') { this.hx = fromX; this.hz = fromZ; this.t = Math.max(this.t, 8 + Math.random() * 6); return; } // já escondido: fica quieto mais um tempo
    if (this.st === 'idle' || this.st === 'walk' || this.st === 'flee') { this.flinchFrom(fromX, fromZ); this.startHide(); }
  }

  /** Corre para um esconderijo: um ponto livre a 6–32 m, fora da linha de visão da ameaça (atrás de prédio, poste, árvore, carro), com caminho livre. Sem lugar bom, só foge. */
  private startHide(): void {
    const p = this.root.position;
    let best: [number, number] | null = null;
    let bestScore = Infinity;
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 26;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      if (Math.abs(x) > CITY.halfX - 4 || Math.abs(z) > CITY.halfZ - 4 || onRoad(x, z) || !free(x, z, 0.8)) continue;
      if (Math.hypot(x - this.hx, z - this.hz) < Math.hypot(p.x - this.hx, p.z - this.hz)) continue; // não vai em direção à ameaça
      if (!clear(p.x, p.z, x, z)) continue;
      const seen = clear(this.hx, this.hz, x, z); // a ameaça enxerga o ponto?
      const score = r + (seen ? 60 : 0);
      if (score < bestScore) { bestScore = score; best = [x, z]; }
    }
    this.st = 'flee';
    this.t = 12;
    if (best) { this.tx = best[0]; this.tz = best[1]; this.hiding = true; } else this.hiding = false;
  }

  private flinchFrom(fromX: number, fromZ: number): void {
    this.hx = fromX; this.hz = fromZ;
    const dx = this.root.position.x - fromX;
    const dz = this.root.position.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    this.fx = dx / l;
    this.fz = dz / l;
  }

  private pickTarget(): void {
    const x = this.root.position.x;
    const z = this.root.position.z;
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = 8 + Math.random() * 22;
      const tx = x + Math.cos(a) * d;
      const tz = z + Math.sin(a) * d;
      if (onRoad(tx, tz) || !free(tx, tz, 0.9) || !clear(x, z, tx, tz)) continue;
      this.tx = tx; this.tz = tz; this.st = 'walk';
      return;
    }
    this.wait = 1 + Math.random() * 2; // nada livre por perto: espera e tenta de novo
  }

  private face(dx: number, dz: number, dt: number): void {
    const want = Math.atan2(dx, dz);
    let diff = want - this.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.root.rotation.y += diff * Math.min(1, dt * 8);
  }

  /** Anda um passo; devolve false se bateu em algo. */
  private step(dx: number, dz: number, speed: number, dt: number): boolean {
    const p = this.root.position;
    const nx = p.x + dx * speed * dt;
    const nz = p.z + dz * speed * dt;
    if (!free(nx, nz, 0.45)) return false;
    p.x = nx; p.z = nz;
    p.y = terrainHeight(nx, nz);
    return true;
  }

  update(dt: number, px: number, pz: number, respawn: (npc: Npc) => void): void {
    if (!this.ready) return;
    const p = this.root.position;
    const d = Math.hypot(p.x - px, p.z - pz);
    this.root.visible = d < HIDE_R;
    if (d >= ACTIVE_R && this.st !== 'dead') return;
    switch (this.st) {
      case 'idle':
        this.wait -= dt;
        if (this.wait <= 0) this.pickTarget();
        break;
      case 'walk': {
        const dx = this.tx - p.x;
        const dz = this.tz - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < WALK_SPEED * dt + 0.1) { this.st = 'idle'; this.wait = 2 + Math.random() * 5; break; }
        if (!this.step(dx / dist, dz / dist, WALK_SPEED, dt)) { this.st = 'idle'; this.wait = 0.3; }
        this.face(dx, dz, dt);
        break;
      }
      case 'flee': {
        this.t -= dt;
        if (this.hiding) {
          // corre até o esconderijo e se agacha lá
          const dx = this.tx - p.x;
          const dz = this.tz - p.z;
          const dist = Math.hypot(dx, dz);
          if (dist < FLEE_SPEED * dt + 0.2) { this.st = 'hide'; this.hiding = false; this.t = 10 + Math.random() * 8; break; }
          if (!this.step(dx / dist, dz / dist, FLEE_SPEED, dt)) { this.st = 'hide'; this.hiding = false; this.t = 8 + Math.random() * 6; break; }
          this.face(dx, dz, dt);
          if (this.t <= 0) { this.st = 'hide'; this.hiding = false; this.t = 8; }
          break;
        }
        if (!this.step(this.fx, this.fz, FLEE_SPEED, dt)) {
          // bateu: tenta outra direção (gira até 60° para cada lado)
          const a = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6);
          const c = Math.cos(a), s = Math.sin(a);
          const nx = this.fx * c - this.fz * s;
          this.fz = this.fx * s + this.fz * c;
          this.fx = nx;
        }
        this.face(this.fx, this.fz, dt);
        if (this.t <= 0) { this.st = 'idle'; this.wait = 1 + Math.random() * 3; }
        break;
      }
      case 'hide':
        this.t -= dt;
        if (this.t <= 0) { this.st = 'idle'; this.wait = 1 + Math.random() * 3; }
        break;
      case 'fly':
        this.flyStep(dt);
        break;
      case 'tumble':
        this.slide(dt, 2.2);
        this.animator?.setFlail(Math.max(0, this.t / TUMBLE_S) * 0.7);
        this.t -= dt;
        if (this.t <= 0) {
          this.animator?.setFlail(0);
          if (this.health <= 0) { this.st = 'dead'; this.t = CORPSE_S; } else { this.st = 'down'; this.t = 1.1; }
          this.animator?.restart('ko_skid_front');
        }
        break;
      case 'hurt':
        this.slide(dt);
        this.t -= dt;
        if (this.t <= 0) this.startHide();
        break;
      case 'down':
        this.slide(dt);
        this.t -= dt;
        if (this.t <= 0) { this.st = 'getup'; this.t = 1.4; this.animator?.restart('getup_front'); }
        break;
      case 'getup':
        this.t -= dt;
        if (this.t <= 0) this.startHide();
        break;
      case 'dead':
        this.slide(dt);
        this.t -= dt;
        if (this.t <= 0) respawn(this);
        break;
    }
    if (this.st === 'idle') this.animator?.play('idle');
    else if (this.st === 'walk') this.animator?.play('walk');
    else if (this.st === 'flee') this.animator?.play('sprint');
    else if (this.st === 'hide') this.animator?.play('crouch_idle');
    this.animator?.update(dt);
  }

  /** Escorrega com o empurrão do golpe (some em ~0,5 s); para se bater em algo. */
  private slide(dt: number, decay = 5): void {
    const sp = Math.hypot(this.kx, this.kz);
    if (sp < 0.05) { this.kx = this.kz = 0; return; }
    const p = this.root.position;
    const nx = p.x + this.kx * dt;
    const nz = p.z + this.kz * dt;
    if (free(nx, nz, 0.4, this.st === 'tumble' ? [this.hx, this.hz] : undefined)) { p.x = nx; p.z = nz; p.y = terrainHeight(nx, nz); } else { this.kx = this.kz = 0; }
    const k = Math.exp(-dt * decay);
    this.kx *= k; this.kz *= k;
  }

  /** Volta à vida em outro lugar (depois que o corpo ficou um tempo no chão). */
  reset(x: number, z: number): void {
    this.health = NPC_HEALTH;
    this.kx = this.kz = 0;
    this.vy = 0;
    this.hiding = false;
    this.animator?.setFlail(0);
    this.st = 'idle';
    this.wait = Math.random() * 2;
    this.root.position.set(x, terrainHeight(x, z), z);
    this.animator?.play('idle');
  }

  get name(): BuiltinName { return this.model; }
}

export class Npcs {
  readonly group = new THREE.Group();
  private readonly list: Npc[] = [];
  private spawnT = 0;
  private readonly spawnedAt: [number, number][] = [];
  private px = 0;
  private pz = 0;

  /** Cria um pedestre por vez (a cada 0,5 s) para não engasgar o jogo ao entrar. */
  private spawnOne(): void {
    const name = CHARS[Math.floor(Math.random() * CHARS.length)]!;
    for (let k = 0; k < 200; k++) {
      const x = (Math.random() * 2 - 1) * (CITY.halfX - 6);
      const z = (Math.random() * 2 - 1) * (CITY.halfZ - 6);
      if (onRoad(x, z) || !free(x, z, 1.2)) continue;
      if (this.list.length < NEAR_FIRST) { const d = Math.hypot(x - this.px, z - this.pz); if (d < 10 || d > 45) continue; }
      if (this.spawnedAt.some(([sx, sz]) => (sx - x) ** 2 + (sz - z) ** 2 < 100)) continue;
      const n = new Npc(name, x, z);
      this.spawnedAt.push([x, z]);
      this.list.push(n);
      this.group.add(n.root);
      return;
    }
  }

  private readonly respawn = (n: Npc): void => {
    const s = pickSpot(this.px, this.pz, 40); // longe de quem está jogando
    if (s) n.reset(s[0], s[1]);
  };

  /** `vehicles`: veículos em movimento (círculos e velocidade) para atropelar quem estiver na frente. */
  update(dt: number, px: number, pz: number, vehicles: { circles: [number, number, number][]; vx: number; vz: number }[] = []): void {
    this.px = px; this.pz = pz;
    vehCircles = [];
    for (const v of vehicles) for (const c of v.circles) vehCircles.push(c);
    if (this.list.length < COUNT) { this.spawnT -= dt; if (this.spawnT <= 0) { this.spawnT = this.list.length < NEAR_FIRST ? 0.2 : 0.5; this.spawnOne(); } }
    for (const n of this.list) {
      n.update(dt, px, pz, this.respawn);
      if (!n.alive || dt <= 0) continue;
      for (const v of vehicles) {
        const sp = Math.hypot(v.vx, v.vz);
        if (sp < 4.5) continue;
        for (const [cx, cz, r] of v.circles) {
          if (Math.hypot(n.pos.x - cx, n.pos.z - cz) < r + 0.5) { n.runOver(sp, cx, cz); break; }
        }
        if (!n.alive) break;
      }
    }
  }

  /** Tiro ou barulho em (x, z): quem está a menos de `radius` m foge. */
  scare(x: number, z: number, radius: number): void {
    for (const n of this.list) if (n.alive && Math.hypot(n.pos.x - x, n.pos.z - z) < radius) n.scare(x, z);
  }

  /** Pedestres vivos (para os tiros e golpes do jogador). */
  get targets(): readonly Npc[] { return this.list; }

  get count(): number { return this.list.length; }
}
