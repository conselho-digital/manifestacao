import * as THREE from 'three';
import { COLLIDERS, rayBox } from './map';
import { playShot } from './audio';
import { Tracers } from './weapons';
import type { Player } from './player';
import type { RemotePlayer } from './remote';
import type { InputState } from './input';
import type { Net, ShotMsg, KillMsg } from '../net/sync';

export const MAG_SIZE = 30;
const RESERVE_START = 120;
const AK_DAMAGE = 20;
const FIST_DAMAGE = 12;
const RELOAD_TIME = 1.6;
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
  weapon: 0 | 1 = 0; // 0 = AK-47, 1 = punho
  mag = MAG_SIZE;
  reserve = RESERVE_START;
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
  private readonly tracers: Tracers;
  private readonly stats = new Map<string, StatRow>();
  private player: Player | null = null;
  private readonly tmpO = new THREE.Vector3();
  private readonly tmpD = new THREE.Vector3();

  constructor(private d: Deps) {
    this.tracers = new Tracers(d.scene);
    this.ensure(d.net.id, d.name);
  }

  get weaponName(): string { return this.weapon === 0 ? 'AK-47' : 'PUNHO'; }

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

    if (input.switchWeapon) { this.weapon = this.weapon === 0 ? 1 : 0; this.reloading = false; }
    if (input.reload) this.startReload();
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const take = Math.min(MAG_SIZE - this.mag, this.reserve);
        this.mag += take;
        this.reserve -= take;
        this.reloading = false;
      }
    }
    this.cd -= dt;
    // atirando: o fuzil sobe para a posição de tiro (cano para a frente) e fica assim um instante depois do último tiro
    this.fireHold = input.fire ? 0.35 : Math.max(0, this.fireHold - dt);
    player.setArmed(this.weapon === 0 ? (input.aim || this.fireHold > 0 ? 'aim' : 'rifle') : 'none');

    if (input.fire && this.cd <= 0 && !this.reloading) {
      if (this.weapon === 0) {
        if (this.mag > 0) { this.mag--; this.cd = AK_GAP; this.fireRifle(player, input.aim); }
        else { this.cd = 0.3; playShot(0.6, true); this.startReload(); }
      } else { this.cd = FIST_GAP; this.punch(player); }
    }
  }

  private startReload(): void {
    if (this.weapon === 0 && !this.reloading && this.mag < MAG_SIZE && this.reserve > 0) {
      this.reloading = true;
      this.reloadT = RELOAD_TIME;
    }
  }

  // ---------- tiro ----------

  private fireRifle(player: Player, aiming: boolean): void {
    const { camera, net } = this.d;
    // Direção da mira = para onde a câmera olha (inclui cima/baixo), com um pouco de dispersão
    const dir = camera.getWorldDirection(this.tmpD);
    const spread = aiming ? 0.003 : 0.012;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    // 1) onde o centro da tela aponta; 2) do cano até esse ponto (respeita paredes no meio do caminho)
    const aim = this.cast(camera.position, dir, RANGE);
    const target = camera.position.clone().addScaledVector(dir, aim.t);
    const muzzle = player.weaponVis ? player.weaponVis.muzzle(this.tmpO) : this.tmpO.copy(player.object.position).setY(1.3);
    const toTarget = target.sub(muzzle);
    const dist = toTarget.length();
    // alvo colado no cano ou atrás dele: atira reto na direção da mira
    const shotDir = dist > 1 && toTarget.dot(dir) > 0 ? toTarget.divideScalar(dist) : dir.clone();
    const hit = this.cast(muzzle, shotDir, dist > 1 ? dist + 0.5 : RANGE);
    const end = muzzle.clone().addScaledVector(shotDir, hit.t);

    this.tracers.add(muzzle, end);
    player.weaponVis?.flash();
    playShot(1);
    if (hit.id) this.hitTick++;
    net.sendShot({ x1: muzzle.x, y1: muzzle.y, z1: muzzle.z, x2: end.x, y2: end.y, z2: end.z, h: hit.id ?? '', k: 'r', hs: hit.head });
  }

  private punch(player: Player): void {
    const p = player.object.position;
    const fx = Math.sin(player.object.rotation.y);
    const fz = Math.cos(player.object.rotation.y);
    let best: RemotePlayer | null = null;
    let bestD = FIST_RANGE;
    for (const r of this.d.remotes.values()) {
      if (r.isDead || r.inCar) continue;
      const dx = r.root.position.x - p.x;
      const dz = r.root.position.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < bestD && (dx * fx + dz * fz) / (dist || 1) > 0.4) { best = r; bestD = dist; }
    }
    if (best) this.hitTick++;
    this.d.net.sendShot({ x1: p.x, y1: p.y + 1.3, z1: p.z, x2: p.x + fx, y2: p.y + 1.3, z2: p.z + fz, h: best ? best.info.id : '', k: 'f', hs: false });
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
    return { t: best, id, head };
  }

  // ---------- eventos da rede ----------

  /** Alguém atirou: desenha o rastro/som e, se me acertou, aplica o dano em mim. */
  onShot(m: ShotMsg): void {
    const shooter = this.d.remotes.get(m.id);
    if (m.k === 'r') {
      const from = new THREE.Vector3(m.x1, m.y1, m.z1);
      const to = new THREE.Vector3(m.x2, m.y2, m.z2);
      this.tracers.add(from, to);
      shooter?.flash();
      const me = this.player?.object.position;
      const dist = me ? from.distanceTo(me) : 20;
      playShot(1 / (1 + dist * 0.12));
    }
    if (m.h === this.d.net.id && !this.dead && this.invuln <= 0) {
      const dmg = m.k === 'f' ? FIST_DAMAGE : m.hs ? AK_DAMAGE * 2 : AK_DAMAGE;
      this.damage(dmg, m.id, m.k === 'f' ? 'PUNHO' : 'AK-47');
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
    this.mag = MAG_SIZE;
    this.reserve = RESERVE_START;
    this.reloading = false;
    this.weapon = 0;
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
