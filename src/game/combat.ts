import * as THREE from 'three';
import { COLLIDERS, rayBox } from './map';
import { playClick, playShotAt } from './audio';
import { Tracers } from './weapons';
import { hittables } from './vehicle';
import type { Player } from './player';
import type { RemotePlayer } from './remote';
import type { InputState } from './input';
import type { Net, ShotMsg, KillMsg } from '../net/sync';

export const MAG_SIZE = 30;
const RESERVE_START = 120;
const PISTOL_MAG = 12;
const PISTOL_RESERVE = 60;
const PISTOL_DAMAGE = 15;
const PISTOL_GAP = 0.28;
const BAT_DAMAGE = 30;
const BAT_GAP = 0.9;
const BAT_RANGE = 2.5;
const AK_DAMAGE = 20;
const FIST_DAMAGE = 12;
const KICK_DAMAGE = 20;
const RELOAD_TIME = 1.6;
const AIM_HOLD = 3; // depois de atirar, continua mirando por 3 s
const AK_GAP = 0.11;
const FIST_GAP = 0.5;
const FIST_RANGE = 1.7;
const RANGE = 90;
const HIT_RADIUS = 0.55; // um pouco generoso para facilitar no celular
const RESPAWN_TIME = 3.5;
const INVULNERABLE = 2;
const KILL_MONEY = 100;
const SPAWNS: [number, number][] = [[25, 16], [-10, -16], [64, 16], [-45, 16], [30, -16], [-60, -16], [-14, 16], [80, -16]];

export interface StatRow { id: string; name: string; k: number; d: number }

interface CarHit { h: ReturnType<typeof hittables>[number]; dx: number; dz: number; t: number }

interface Hit { t: number; id: string | null; head: boolean }

interface Deps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  net: Net;
  name: string;
  remotes: Map<string, RemotePlayer>;
  /** texto para o chat/feed */
  log: (text: string) => void;
}

/** Combate casual: o atirador calcula o acerto; quem foi acertado aplica o dano em si mesmo. */
export class Combat {
  health = 100;
  armor = 50;
  money = 0;
  /** 0 = AK-47, 1 = punho, 2 = taco (bandeira), 3 = pistola, 4 = placa de trânsito */
  /** começa de mãos livres (punho); o botão Arma troca */
  weapon: 0 | 1 | 2 | 3 | 4 = 1;
  private ammo = [{ mag: MAG_SIZE, reserve: RESERVE_START }, { mag: 0, reserve: 0 }, { mag: 0, reserve: 0 }, { mag: PISTOL_MAG, reserve: PISTOL_RESERVE }, { mag: 0, reserve: 0 }];
  get mag(): number { return this.ammo[this.weapon]!.mag; }
  get reserve(): number { return this.ammo[this.weapon]!.reserve; }
  /** tem mira (fuzil ou pistola) */
  get isGun(): boolean { return this.weapon === 0 || this.weapon === 3; }
  reloading = false;
  dead = false;
  respawnIn = 0;
  /** contadores que sobem a cada acerto/dano (o HUD anima a cada mudança) */
  hitTick = 0;
  hurtTick = 0;

  private reloadT = 0;
  private cd = 0;
  private fireHold = 0;
  private invuln = 0;
  private lastCarHit: CarHit | null = null;
  private readonly tracers: Tracers;
  private readonly stats = new Map<string, StatRow>();
  private player: Player | null = null;
  private readonly tmpO = new THREE.Vector3();
  private readonly tmpD = new THREE.Vector3();

  constructor(private d: Deps) {
    this.tracers = new Tracers(d.scene);
    this.ensure(d.net.id, d.name);
  }

  private get magSize(): number { return this.weapon === 3 ? PISTOL_MAG : MAG_SIZE; }

  get weaponName(): string { return ['AK-47', 'PUNHO', 'BANDEIRA', 'PISTOLA', 'PLACA'][this.weapon]!; }

  /** Placar: eu e os outros jogadores, do que mais matou para o que menos. */
  statRows(): StatRow[] {
    this.ensure(this.d.net.id, this.d.name);
    for (const [id, r] of this.d.remotes) this.ensure(id, r.info.name);
    return [...this.stats.values()].sort((a, b) => b.k - a.k || a.d - b.d);
  }

  get myStats(): StatRow { return this.ensure(this.d.net.id, this.d.name); }

  private ensure(id: string, name: string): StatRow {
    let r = this.stats.get(id);
    if (!r) { r = { id, name, k: 0, d: 0 }; this.stats.set(id, r); }
    return r;
  }

  private nameOf(id: string): string {
    return id === this.d.net.id ? this.d.name : this.d.remotes.get(id)?.info.name ?? 'Alguém';
  }

  update(dt: number, input: InputState, player: Player): void {
    this.player = player;
    this.tracers.update(dt);
    if (this.invuln > 0) this.invuln -= dt;

    if (this.dead) {
      this.respawnIn -= dt;
      if (this.respawnIn <= 0) this.respawn();
      return;
    }
    if (player.isDriving) { player.setArmed('none'); return; }

    if (input.switchWeapon) {
      const order = [0, 3, 2, 4, 1] as const; // fuzil, pistola, bandeira, placa, punho
      this.weapon = order[(order.indexOf(this.weapon) + 1) % order.length]!;
      this.reloading = false;
    }
    if (input.reload) this.startReload();
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const a = this.ammo[this.weapon]!;
        const take = Math.min(this.magSize - a.mag, a.reserve);
        a.mag += take;
        a.reserve -= take;
        this.reloading = false;
      }
    }
    this.cd -= dt;
    // atirando: o fuzil sobe para a posição de tiro (cano para a frente) e fica assim um instante depois do último tiro
    this.fireHold = input.fire ? AIM_HOLD : Math.max(0, this.fireHold - dt);
    const aiming = input.aim || this.fireHold > 0;
    player.setArmed(this.weapon === 0 ? (aiming ? 'aim' : 'rifle') : this.weapon === 3 ? (aiming ? 'pistol_aim' : 'pistol') : this.weapon === 2 ? 'bat' : this.weapon === 4 ? 'sign' : 'none');

    if (input.fire && this.cd <= 0 && !this.reloading) {
      const a = this.ammo[this.weapon]!;
      if (this.weapon === 0 || this.weapon === 3) {
        if (a.mag > 0) {
          a.mag--;
          this.cd = this.weapon === 0 ? AK_GAP : PISTOL_GAP;
          this.fireGun(player, aiming, this.weapon === 0 ? 'r' : 'p');
        } else { this.cd = 0.3; playClick(); this.startReload(); }
      } else if (this.weapon === 2 || this.weapon === 4) { this.cd = BAT_GAP; player.swing(); this.melee(player, BAT_RANGE, 'b'); }
      else { this.cd = FIST_GAP; const kind = player.punch(); this.melee(player, kind === 'k' ? FIST_RANGE + 0.3 : FIST_RANGE, kind); }
    }
  }

  private startReload(): void {
    if (this.isGun && !this.reloading && this.mag < this.magSize && this.reserve > 0) {
      this.reloading = true;
      this.reloadT = RELOAD_TIME;
    }
  }

  // ---------- tiro ----------

  private fireGun(player: Player, aiming: boolean, kind: 'r' | 'p'): void {
    const { camera, net } = this.d;
    // Direção da mira = para onde a câmera olha (inclui cima/baixo), com um pouco de dispersão
    const dir = camera.getWorldDirection(this.tmpD);
    const spread = aiming ? 0.003 : 0.012;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    // 1) onde o centro da tela aponta; 2) do cano até esse ponto (respeita paredes no meio do caminho)
    this.lastCarHit = null;
    const aim = this.cast(camera.position, dir, RANGE);
    const target = camera.position.clone().addScaledVector(dir, aim.t);
    const muzzle = player.weaponVis ? player.weaponVis.muzzle(this.tmpO) : this.tmpO.copy(player.object.position).setY(1.3);
    const toTarget = target.sub(muzzle);
    const dist = toTarget.length();
    // alvo colado no cano ou atrás dele: atira reto na direção da mira
    const shotDir = dist > 1 && toTarget.dot(dir) > 0 ? toTarget.divideScalar(dist) : dir.clone();
    const hit = this.cast(muzzle, shotDir, dist > 1 ? dist + 0.5 : RANGE);
    const end = muzzle.clone().addScaledVector(shotDir, hit.t);
    const ch = this.lastCarHit as CarHit | null;
    if (ch && Math.abs(ch.t - hit.t) < 1e-3) ch.h.hit(ch.dx, ch.dz, kind === 'p' ? 0.4 : 0.7);
    this.lastCarHit = null;

    this.tracers.add(muzzle, end);
    player.weaponVis?.flash();
    playShotAt(muzzle.x, muzzle.z, kind === 'p' ? 'pistol' : 'rifle');
    if (hit.id) this.hitTick++;
    net.sendShot({ x1: muzzle.x, y1: muzzle.y, z1: muzzle.z, x2: end.x, y2: end.y, z2: end.z, h: hit.id ?? '', k: kind, hs: hit.head });
  }

  private melee(player: Player, range: number, kind: 'f' | 'b' | 'k'): void {
    const p = player.object.position;
    const fx = Math.sin(player.object.rotation.y);
    const fz = Math.cos(player.object.rotation.y);
    let best: RemotePlayer | null = null;
    let bestD = range;
    for (const r of this.d.remotes.values()) {
      if (r.isDead || r.inCar) continue;
      const dx = r.root.position.x - p.x;
      const dz = r.root.position.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < bestD && (dx * fx + dz * fz) / (dist || 1) > 0.4) { best = r; bestD = dist; }
    }
    for (const h of hittables()) {
      for (const [cx, cz, r] of h.circles) {
        const dx = cx - p.x;
        const dz = cz - p.z;
        const dist = Math.hypot(dx, dz) - r;
        if (dist < range && (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1) > 0.5) { h.hit(dx, dz, kind === 'b' ? 3 : 1.5); this.hitTick++; }
      }
    }
    if (best) this.hitTick++;
    this.d.net.sendShot({ x1: p.x, y1: p.y + 1.3, z1: p.z, x2: p.x + fx, y2: p.y + 1.3, z2: p.z + fz, h: best ? best.info.id : '', k: kind, hs: false });
  }

  /** Raio contra chão, caixas e jogadores. */
  private cast(o: THREE.Vector3, d: THREE.Vector3, maxT: number): Hit {
    let best = maxT;
    let id: string | null = null;
    let head = false;
    if (d.y < -1e-4) { const tg = -o.y / d.y; if (tg > 0 && tg < best) best = tg; }
    for (const b of COLLIDERS) {
      const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b.minX, b.bottom ?? 0, b.minZ, b.maxX, b.top, b.maxZ);
      if (t !== null && t < best) best = t;
    }
    for (const r of this.d.remotes.values()) {
      if (r.isDead || r.inCar) continue;
      const hit = rayVerticalSegment(o, d, r.root.position, 1.75, HIT_RADIUS);
      if (hit && hit.t < best) { best = hit.t; id = r.info.id; head = hit.s > 0.82; }
    }
    // veículos (carros, motos e trânsito): a bala para neles e eles balançam
    for (const h of hittables()) {
      for (const [cx, cz, r] of h.circles) {
        const hit = rayVerticalSegment(o, d, new THREE.Vector3(cx, 0, cz), 1.5, r);
        if (hit && hit.t < best) { best = hit.t; id = null; head = false; if (hit.t < maxT) this.lastCarHit = { h, dx: d.x, dz: d.z, t: hit.t }; }
      }
    }
    return { t: best, id, head };
  }

  // ---------- eventos da rede ----------

  /** Alguém atirou: desenha o rastro/som e, se me acertou, aplica o dano em mim. */
  onShot(m: ShotMsg): void {
    const shooter = this.d.remotes.get(m.id);
    if (m.k === 'r' || m.k === 'p') {
      const from = new THREE.Vector3(m.x1, m.y1, m.z1);
      const to = new THREE.Vector3(m.x2, m.y2, m.z2);
      this.tracers.add(from, to);
      shooter?.flash();
      playShotAt(from.x, from.z, m.k === 'p' ? 'pistol' : 'rifle'); // volume e lado pela distância ao ouvinte
    }
    if (m.h === this.d.net.id && !this.dead && this.invuln <= 0) {
      const base = m.k === 'k' ? KICK_DAMAGE : m.k === 'f' ? FIST_DAMAGE : m.k === 'b' ? BAT_DAMAGE : m.k === 'p' ? PISTOL_DAMAGE : AK_DAMAGE;
      const dmg = m.hs && (m.k === 'r' || m.k === 'p') ? base * 2 : base;
      if (m.k === 'f' || m.k === 'b' || m.k === 'k') this.player?.flinch(m.k);
      this.damage(dmg, m.id, { f: 'PUNHO', k: 'CHUTE', b: 'TACO', p: 'PISTOLA', r: 'AK-47' }[m.k]);
    }
  }

  private damage(amount: number, attacker: string, weapon: string): void {
    const soak = Math.min(this.armor, amount * 0.6);
    this.armor -= soak;
    this.health -= amount - soak;
    this.hurtTick++;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.respawnIn = RESPAWN_TIME;
      this.player?.die();
      this.d.net.sendKill(this.d.net.id, attacker, weapon);
      this.onKill({ k: attacker, v: this.d.net.id, w: weapon });
    }
  }

  /** Alguém morreu (inclusive eu): atualiza placar, dinheiro e o feed. */
  onKill(m: KillMsg): void {
    const killer = this.ensure(m.k, this.nameOf(m.k));
    const victim = this.ensure(m.v, this.nameOf(m.v));
    victim.d++;
    if (m.k !== m.v) killer.k++;
    if (m.k === this.d.net.id && m.v !== this.d.net.id) this.money += KILL_MONEY;
    this.d.log(`${this.nameOf(m.k)}: matou ${this.nameOf(m.v)} (${m.w || 'AK-47'})`);
  }

  private respawn(): void {
    const [x, z] = SPAWNS[Math.floor(Math.random() * SPAWNS.length)]!;
    this.player?.respawn(x, z);
    this.health = 100;
    this.armor = 50;
    this.ammo[0] = { mag: MAG_SIZE, reserve: RESERVE_START };
    this.ammo[3] = { mag: PISTOL_MAG, reserve: PISTOL_RESERVE };
    this.reloading = false;
    this.weapon = 1; // renasce de mãos livres
    this.dead = false;
    this.invuln = INVULNERABLE;
  }
}

// ---------- geometria dos raios ----------

/** Raio contra um "cilindro" fino vertical (o corpo): ponto mais próximo entre o raio e o segmento. */
function rayVerticalSegment(o: THREE.Vector3, d: THREE.Vector3, base: THREE.Vector3, height: number, radius: number): { t: number; s: number } | null {
  // reta do raio: o + t d ; segmento: base + s (0,height,0), s em [0,1]
  const wx = o.x - base.x;
  const wy = o.y - base.y;
  const wz = o.z - base.z;
  const b = d.y * height;
  const c = height * height;
  const dd = d.x * wx + d.y * wy + d.z * wz;
  const e = height * wy;
  const denom = c - b * b; // a = 1
  let s = denom < 1e-9 ? 0.5 : (e - b * dd) / denom;
  s = Math.min(1, Math.max(0, s));
  const t = b * s - dd;
  if (t <= 0) return null;
  const px = o.x + d.x * t - base.x;
  const py = o.y + d.y * t - (base.y + s * height);
  const pz = o.z + d.z * t - base.z;
  return Math.hypot(px, py, pz) <= radius ? { t, s } : null;
}
