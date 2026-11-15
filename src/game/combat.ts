import { rankDeath, rankKill } from '../net/ranking';
import type { Npc, Npcs } from './npcs';
import * as THREE from 'three';
import { COLLIDERS, rayBox, terrainHeight } from './map';
import { playClick, playReloadSound, playShotAt } from './audio';
import { Tracers } from './weapons';
import { hittables } from './vehicle';
import type { Player } from './player';
import type { RemotePlayer } from './remote';
import type { InputState } from './input';
import type { Net, ShotMsg, KillMsg } from '../net/sync';
import { isGunId, type Inventory, type ShopItem, type WeaponId } from './inventory';
import type { RifleKind } from './rifles';
import type { Armed } from './anim';
import { findWall, SPRAY_DURATION, type Graffiti } from './graffiti';
import { showNotice } from '../ui/toast';

/** vida cheia: 400 (4 vezes a antiga de 100). O dano das armas não mudou, então o jogador aguenta 4 vezes mais. */
export const MAX_HEALTH = 400;
export const MAG_SIZE = 30;
const RESERVE_START = 120;
const PISTOL_MAG = 12;
const PISTOL_RESERVE = 60;
/** a munição é de graça, mas só enche de novo a cada 30 minutos */
const AMMO_REFILL_MS = 30 * 60 * 1000;
const GUN_IDS = [0, 3, 12, 13, 14] as const;
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
/** fuzis: tipo de modelo, código do tiro na rede, dano e intervalo entre tiros (s) */
const RIFLE_OF: Partial<Record<number, { kind: RifleKind; shot: 'r' | 'm' | 'q' | 'h'; damage: number; gap: number }>> = {
  0: { kind: 'ak', shot: 'r', damage: 20, gap: 0.11 },
  12: { kind: 'm4', shot: 'm', damage: 18, gap: 0.09 },
  13: { kind: 'm16', shot: 'q', damage: 22, gap: 0.12 },
  14: { kind: 'hb', shot: 'h', damage: 16, gap: 0.1 },
};
const SHOT_DAMAGE: Record<string, number> = { r: 20, m: 18, q: 22, h: 16 };
const FIST_GAP = 0.5;
/** intervalo mínimo entre dois golpes/tiros da mesma arma (s), usado para validar o dano que vem da rede */
const SHOT_GAP_S: Record<string, number> = { r: 0.11, m: 0.09, q: 0.12, h: 0.1, p: PISTOL_GAP, b: BAT_GAP, f: FIST_GAP, k: FIST_GAP };
const FIST_RANGE = 1.7;
const RANGE = 90;
const HIT_RADIUS = 0.55; // um pouco generoso para facilitar no celular
const RESPAWN_TIME = 3.5;
const INVULNERABLE = 2;
/** depois de morrer: 60 s andando sem arma e sem levar dano de jogadores ou carros */
export const PROTECT_TIME = 60;
/** armas brancas de duas mãos (golpes do baseball.ifp) e o que o jogador segura com cada uma */
const MELEE_ARMED: Partial<Record<number, Armed>> = { 2: 'bat', 4: 'sign', 5: 'cricket', 7: 'bottle', 8: 'pipe', 9: 'cleaver', 10: 'sickle', 11: 'axe', 16: 'knife' };
const KILL_MONEY = 100;
const SPAWNS: [number, number][] = [[25, 16], [-10, -16], [64, 16], [-45, 16], [30, -16], [-60, -16], [-14, 16], [80, -16]];

export interface StatRow { id: string; name: string; k: number; d: number }

interface CarHit { h: ReturnType<typeof hittables>[number]; dx: number; dz: number; t: number }

interface Hit { t: number; id: string | null; head: boolean; npc?: Npc }

interface Deps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  net: Net;
  name: string;
  remotes: Map<string, RemotePlayer>;
  /** texto para o chat/feed */
  log: (text: string) => void;
  /** armas e dinheiro do jogador */
  inv: Inventory;
  /** pinturas nas paredes (lata de spray) */
  graffiti: Graffiti;
  /** a cidade (paredes onde se pode pintar) */
  city: THREE.Object3D;
  /** equipe do jogador (id e cor 1, para a pintura e a névoa) */
  myTeam(): { id: string; c1: string };
  /** pedestres da cidade (levam tiro e golpe e fogem) */
  npcs?: () => Npcs | null;
}

/** Combate casual: o atirador calcula o acerto; quem foi acertado aplica o dano em si mesmo. */
export class Combat {
  health = MAX_HEALTH;
  armor = 50;
  get money(): number { return this.d.inv.money; }
  /** pausado: não leva dano nem atira */
  paused = false;
  /** 0 = AK-47, 1 = punho, 2 = taco (bandeira), 3 = pistola, 4 = placa de trânsito, 5 = taco de críquete */
  /** começa de mãos livres (punho); o botão Arma troca */
  weapon: WeaponId = 1;
  /** munição de cada arma (só quem tem a arma recebe) */
  private ammo = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(() => ({ mag: 0, reserve: 0 }));
  get mag(): number { return this.ammo[this.weapon]!.mag; }
  get reserve(): number { return this.ammo[this.weapon]!.reserve; }
  /** tem mira (fuzil ou pistola) */
  get isGun(): boolean { return isGunId(this.weapon); }
  reloading = false;
  dead = false;
  respawnIn = 0;
  /** contadores que sobem a cada acerto/dano (o HUD anima a cada mudança) */
  hitTick = 0;
  hurtTick = 0;

  private reloadT = 0;
  /** segundos restantes pintando com a lata de spray (braço levantado) */
  private sprayT = 0;
  private sprayTo = new THREE.Vector3();
  private cd = 0;
  private fireHold = 0;
  private invuln = 0;
  /** segundos restantes de proteção depois de renascer (sem arma, sem dano) */
  protectT = 0;
  private lastFlinchAt = -1e9;
  /** última vez que um atirador me causou dano (cadência da arma: ninguém me atinge mais rápido que a arma atira) */
  private lastDmgFrom = new Map<string, number>();
  /** última vez que EU acertei cada jogador (só então um abate dele conta para o ranking e o dinheiro) */
  private recentHit = new Map<string, number>();
  private lastCarHit: CarHit | null = null;
  private readonly tracers: Tracers;
  private readonly stats = new Map<string, StatRow>();
  private player: Player | null = null;
  private readonly tmpO = new THREE.Vector3();
  private readonly tmpD = new THREE.Vector3();

  constructor(private d: Deps) {
    this.tracers = new Tracers(d.scene);
    this.ensure(d.net.id, d.name);
    this.loadAmmo();
    window.addEventListener('pagehide', () => this.saveAmmo());
  }

  /** quando a munição encheu pela última vez (ms) e se há algo para guardar */
  private lastRefill = Date.now();
  private ammoDirty = false;
  private ammoSaveT = 0;
  private lastEmptyWarn = -1e9;

  /** Começa com a munição guardada desta conta; se já passaram 30 min desde o último enchimento, enche. (Recarregar a página não enche.) */
  private loadAmmo(): void {
    const key = `arena-ammo:${this.d.inv.userKey}`;
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as { t?: number; a?: Record<string, { mag: number; reserve: number }> } | null;
      if (raw && typeof raw.t === 'number' && raw.a && raw.t <= Date.now() && Date.now() - raw.t < AMMO_REFILL_MS) {
        for (const w of GUN_IDS) {
          const v = raw.a[String(w)];
          if (v && Number.isFinite(v.mag) && Number.isFinite(v.reserve)) this.ammo[w] = { mag: Math.max(0, Math.min(MAG_SIZE, Math.floor(v.mag))), reserve: Math.max(0, Math.min(5000, Math.floor(v.reserve))) };
          else this.ammo[w] = this.startAmmo(w);
        }
        this.lastRefill = raw.t;
        return;
      }
    } catch { /* sem dados: começa cheio */ }
    this.refillGuns();
    this.lastRefill = Date.now();
    this.ammoDirty = true;
    this.saveAmmo();
  }

  private saveAmmo(): void {
    this.ammoDirty = false;
    try {
      const a: Record<string, { mag: number; reserve: number }> = {};
      for (const w of GUN_IDS) a[String(w)] = this.ammo[w]!;
      localStorage.setItem(`arena-ammo:${this.d.inv.userKey}`, JSON.stringify({ t: this.lastRefill, a }));
    } catch { /* sem armazenamento */ }
  }

  /** Minutos que faltam para a munição encher de novo (arredonda para cima). */
  private refillMinutes(): number { return Math.max(1, Math.ceil((this.lastRefill + AMMO_REFILL_MS - Date.now()) / 60000)); }

  /** Aviso: a munição acabou (no máximo de 6 em 6 segundos). */
  private warnEmpty(): void {
    const now = performance.now();
    if (now - this.lastEmptyWarn < 6000) return;
    this.lastEmptyWarn = now;
    showNotice(`Sem munição! A munição é de graça, mas só enche 1 vez a cada 30 minutos. Faltam ${this.refillMinutes()} min.`, 6000);
  }

  /** Cura (ícone de vida no mapa). Devolve false se a vida já está cheia ou o jogador morreu. */
  heal(n: number): boolean {
    if (this.dead || this.health >= MAX_HEALTH) return false;
    this.health = Math.min(MAX_HEALTH, this.health + n);
    return true;
  }

  /** Colete (ícone no mapa). Devolve false se o colete já está cheio ou o jogador morreu. */
  addArmor(n: number): boolean {
    if (this.dead || this.armor >= 100) return false;
    this.armor = Math.min(100, this.armor + n);
    return true;
  }

  /** Enche a munição das armas de fogo que o jogador tem. */
  private refillGuns(): void {
    for (const w of [0, 3, 12, 13, 14] as const) if (this.d.inv.has(w)) this.ammo[w] = this.startAmmo(w);
  }

  /** Munição inicial de uma arma de fogo. */
  private startAmmo(w: WeaponId): { mag: number; reserve: number } {
    return w === 3 ? { mag: PISTOL_MAG, reserve: PISTOL_RESERVE } : { mag: MAG_SIZE, reserve: RESERVE_START };
  }

  /** Armas que o jogador tem, na ordem do botão de troca. */
  ownedWeapons(): WeaponId[] {
    return ([0, 12, 13, 14, 3, 2, 4, 5, 7, 8, 9, 10, 11, 16, 15, 1] as const).filter((w) => this.d.inv.has(w));
  }

  /** Munição de uma arma (para o menu). */
  ammoOf(w: WeaponId): { mag: number; reserve: number } { return this.ammo[w]!; }

  /** Equipa uma arma que o jogador tem. */
  equip(w: WeaponId): void {
    if (!this.d.inv.has(w) || this.protectT > 0) return;
    this.weapon = w;
    this.reloading = false;
  }

  /** Compra um item da loja. Retorna a mensagem (para mostrar) e se deu certo. */
  buy(item: ShopItem): { ok: boolean; msg: string } {
    const inv = this.d.inv;
    if (item.kind === 'weapon' || item.kind === 'vehicle') return { ok: false, msg: 'Este item é pago em reais.' };
    if (item.kind === 'ammo' && item.weapon !== undefined && !inv.has(item.weapon)) return { ok: false, msg: 'Compre a arma primeiro.' };
    if (item.kind === 'ammo' && item.weapons && !item.weapons.some((w) => inv.has(w))) return { ok: false, msg: 'Você não tem nenhum fuzil 5,56.' };
    if (item.kind === 'health' && this.health >= MAX_HEALTH) return { ok: false, msg: 'Sua vida já está cheia.' };
    if (item.kind === 'armor' && this.armor >= 100) return { ok: false, msg: 'Seu colete já está cheio.' };
    if (!inv.spend(item.price)) return { ok: false, msg: 'Dinheiro insuficiente.' };
    if (item.kind === 'ammo' && item.weapons) {
      for (const w of item.weapons) if (inv.has(w)) this.ammo[w]!.reserve += item.amount ?? 0;
    } else if (item.kind === 'ammo' && item.weapon !== undefined) this.ammo[item.weapon]!.reserve += item.amount ?? 0;
    if (item.kind === 'ammo') this.ammoDirty = true;
    else if (item.kind === 'health') this.health = MAX_HEALTH;
    else if (item.kind === 'armor') this.armor = 100;
    return { ok: true, msg: `${item.name} comprado.` };
  }

  private get magSize(): number { return this.weapon === 3 ? PISTOL_MAG : MAG_SIZE; }

  get weaponName(): string { return ['AK-47', 'PUNHO', 'BANDEIRA', 'PISTOLA', 'PLACA', 'TACO', 'TACO', 'GARRAFA', 'CANO', 'CUTELO', 'FOICE', 'MACHADO', 'M4A1', 'M16', 'HONEY BADGER', 'SPRAY'][this.weapon]!; }

  /** Placar: eu e os outros jogadores, do que mais matou para o que menos. */
  statRows(): StatRow[] {
    this.ensure(this.d.net.id, this.d.name);
    for (const [id, r] of this.d.remotes) this.ensure(id, r.info.name);
    for (const id of [...this.stats.keys()]) if (id !== this.d.net.id && !this.d.remotes.has(id)) this.stats.delete(id); // quem saiu (ou id inventado) some do placar
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
    // a cada 30 minutos a munição enche de novo (também enquanto o jogador está morto ou dirigindo)
    if (Date.now() - this.lastRefill >= AMMO_REFILL_MS) {
      this.refillGuns();
      this.lastRefill = Date.now();
      this.ammoDirty = true;
      showNotice('Munição reabastecida! Ela enche de novo em 30 minutos.', 5000);
    }
    this.ammoSaveT -= dt;
    if (this.ammoDirty && this.ammoSaveT <= 0) { this.ammoSaveT = 2; this.saveAmmo(); }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.protectT > 0) this.protectT = Math.max(0, this.protectT - dt);

    if (this.dead) {
      this.respawnIn -= dt;
      if (this.respawnIn <= 0) this.respawn();
      return;
    }
    if (player.isDriving) { player.setArmed('none'); return; }

    if (this.protectT > 0) { this.weapon = 1; this.reloading = false; } // protegido: só as mãos
    else if (input.switchWeapon || input.weaponStep !== 0 || input.weaponPick !== null) {
      // fuzil, pistola, bandeira, placa, punho — só as que o jogador tem; passo +1/-1 percorre a lista, ou escolhe uma pelo menu
      const order = this.ownedWeapons();
      const i = Math.max(0, order.indexOf(this.weapon));
      const pick = input.weaponPick;
      if (pick !== null && order.includes(pick as WeaponId)) this.weapon = pick as WeaponId;
      else if (pick === null) this.weapon = order[(i + (input.weaponStep < 0 ? -1 : 1) + order.length) % order.length]!;
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
        this.ammoDirty = true;
      }
    }
    this.cd -= dt;
    // atirando: o fuzil sobe para a posição de tiro (cano para a frente) e fica assim um instante depois do último tiro
    this.fireHold = input.fire ? AIM_HOLD : Math.max(0, this.fireHold - dt);
    const aiming = input.aim || this.fireHold > 0;
    const rf = RIFLE_OF[this.weapon];
    if (rf) player.setRifleKind(rf.kind);
    if (this.sprayT > 0) this.sprayT = Math.max(0, this.sprayT - dt);
    player.setArmed(rf ? (aiming ? 'aim' : 'rifle') : this.weapon === 3 ? (aiming ? 'pistol_aim' : 'pistol') : this.weapon === 15 ? (this.sprayT > 0 ? 'spray_aim' : 'spray') : (MELEE_ARMED[this.weapon] ?? 'none'));
    if (this.sprayT > 0 && player.weaponVis) this.d.graffiti.mist(player.weaponVis.muzzle(this.tmpO), this.sprayTo, this.d.myTeam().c1);

    if (input.fire && this.cd <= 0 && !this.reloading && this.protectT <= 0) {
      const a = this.ammo[this.weapon]!;
      if (this.isGun) {
        if (a.mag > 0) {
          a.mag--;
          this.ammoDirty = true;
          this.cd = rf ? rf.gap : PISTOL_GAP;
          this.fireGun(player, aiming, rf ? rf.shot : 'p');
          if (a.mag === 0 && a.reserve === 0) this.warnEmpty(); // acabou o último tiro
        } else { this.cd = 0.3; playClick(); this.startReload(); if (a.reserve === 0) this.warnEmpty(); }
      } else if (this.weapon === 15) this.spray(player);
      else if (MELEE_ARMED[this.weapon]) { this.cd = BAT_GAP; player.swing(); this.melee(player, BAT_RANGE, 'b'); }
      else { this.cd = FIST_GAP; const kind = player.punch(); this.melee(player, kind === 'k' ? FIST_RANGE + 0.3 : FIST_RANGE, kind); }
    }
  }

  /** Lata de spray: se há uma parede de prédio na frente, levanta a lata e pinta a imagem da equipe. */
  private spray(player: Player): void {
    const p = player.object.position;
    const dir = this.d.camera.getWorldDirection(this.tmpD);
    const wall = findWall(this.d.city, p.x, p.y, p.z, dir.x, dir.z);
    if (!wall) { this.cd = 1.2; this.d.log('Spray: chegue perto de uma parede lisa, olhando de frente para ela.'); return; }
    this.cd = 2.6;
    this.sprayT = SPRAY_DURATION;
    this.sprayTo.set(wall.x + wall.nx * 0.05, wall.y, wall.z + wall.nz * 0.05);
    const t = this.d.myTeam();
    const r2 = (v: number): number => Math.round(v * 100) / 100;
    const msg = { x: r2(wall.x), y: wall.y, z: r2(wall.z), nx: r2(wall.nx), nz: r2(wall.nz), w: r2(wall.w), t: t.id };
    this.d.graffiti.add({ id: this.d.net.id, ...msg }, this.d.name);
    this.d.net.sendSpray(msg);
  }

  private startReload(): void {
    if (this.isGun && !this.reloading && this.mag < this.magSize && this.reserve > 0) {
      this.reloading = true;
      this.reloadT = RELOAD_TIME;
      if (this.weapon === 0 || this.weapon === 12 || this.weapon === 13 || this.weapon === 14) playReloadSound(); // AK-47, M4A1, M16 e Honey Badger (a pistola fica sem som de recarga)
    }
  }

  // ---------- tiro ----------

  private fireGun(player: Player, aiming: boolean, kind: 'r' | 'm' | 'q' | 'h' | 'p'): void {
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
    playShotAt(muzzle.x, muzzle.z, kind === 'p' ? 'pistol' : kind === 'h' ? 'silenced' : kind === 'm' ? 'm4' : kind === 'q' ? 'm16' : 'rifle');
    if (hit.id) { this.hitTick++; this.recentHit.set(hit.id, performance.now()); }
    if (hit.npc) { const dmg = kind === 'p' ? PISTOL_DAMAGE : SHOT_DAMAGE[kind] ?? AK_DAMAGE; hit.npc.hurt(hit.head ? dmg * 2 : dmg, muzzle.x, muzzle.z); this.hitTick++; }
    this.d.npcs?.()?.scare(muzzle.x, muzzle.z, kind === 'h' ? 10 : 35); // o barulho do tiro faz a rua fugir
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
    for (const n of this.d.npcs?.()?.targets ?? []) {
      if (!n.alive) continue;
      const dx = n.pos.x - p.x;
      const dz = n.pos.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < range && (dx * fx + dz * fz) / (dist || 1) > 0.4) { n.hurt(kind === 'k' ? KICK_DAMAGE : kind === 'b' ? BAT_DAMAGE : FIST_DAMAGE, p.x, p.z); this.hitTick++; }
    }
    if (best) { this.hitTick++; this.recentHit.set(best.info.id, performance.now()); }
    this.d.net.sendShot({ x1: p.x, y1: p.y + 1.3, z1: p.z, x2: p.x + fx, y2: p.y + 1.3, z2: p.z + fz, h: best ? best.info.id : '', k: kind, hs: false });
  }

  /** Raio contra chão, caixas e jogadores. */
  private cast(o: THREE.Vector3, d: THREE.Vector3, maxT: number): Hit {
    let best = maxT;
    let id: string | null = null;
    let head = false;
    if (d.y < -1e-4) { const tg = (terrainHeight(o.x, o.z) - o.y) / d.y; if (tg > 0 && tg < best) best = tg; } // chão (acompanha o terreno rebaixado)
    for (const b of COLLIDERS) {
      const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b.minX, b.bottom ?? 0, b.minZ, b.maxX, b.top, b.maxZ);
      if (t !== null && t < best) best = t;
    }
    for (const r of this.d.remotes.values()) {
      if (r.isDead || r.inCar) continue;
      const hit = rayVerticalSegment(o, d, r.root.position, 1.75, HIT_RADIUS);
      if (hit && hit.t < best) { best = hit.t; id = r.info.id; head = hit.s > 0.82; }
    }
    let npc: Npc | undefined;
    for (const n of this.d.npcs?.()?.targets ?? []) {
      if (!n.alive) continue;
      const hit = rayVerticalSegment(o, d, n.pos, 1.75, 0.45);
      if (hit && hit.t < best) { best = hit.t; id = null; npc = n; head = hit.s > 0.82; }
    }
    // veículos (carros, motos e trânsito): a bala para neles e eles balançam
    for (const h of hittables()) {
      for (const [cx, cz, r] of h.circles) {
        const hit = rayVerticalSegment(o, d, new THREE.Vector3(cx, 0, cz), 1.5, r);
        if (hit && hit.t < best) { best = hit.t; id = null; npc = undefined; head = false; if (hit.t < maxT) this.lastCarHit = { h, dx: d.x, dz: d.z, t: hit.t }; }
      }
    }
    return { t: best, id, head, npc };
  }

  // ---------- eventos da rede ----------

  /** Alguém atirou: desenha o rastro/som e, se me acertou, aplica o dano em mim. */
  onShot(m: ShotMsg): void {
    const shooter = this.d.remotes.get(m.id);
    if (m.k === 'r' || m.k === 'm' || m.k === 'q' || m.k === 'h' || m.k === 'p') {
      const from = new THREE.Vector3(m.x1, m.y1, m.z1);
      const to = new THREE.Vector3(m.x2, m.y2, m.z2);
      this.tracers.add(from, to);
      shooter?.flash();
      this.d.npcs?.()?.scare(from.x, from.z, m.k === 'h' ? 10 : 35);
      playShotAt(from.x, from.z, m.k === 'p' ? 'pistol' : m.k === 'h' ? 'silenced' : m.k === 'm' ? 'm4' : m.k === 'q' ? 'm16' : 'rifle'); // volume e lado pela distância ao ouvinte
    }
    if (m.h === this.d.net.id && !this.dead && this.invuln <= 0 && this.protectT <= 0 && !this.paused && this.plausible(m, shooter)) {
      const base = m.k === 'k' ? KICK_DAMAGE : m.k === 'f' ? FIST_DAMAGE : m.k === 'b' ? BAT_DAMAGE : m.k === 'p' ? PISTOL_DAMAGE : (SHOT_DAMAGE[m.k] ?? AK_DAMAGE);
      const dmg = m.hs && m.k !== 'f' && m.k !== 'b' && m.k !== 'k' ? base * 2 : base;
      if (m.k === 'f' || m.k === 'b' || m.k === 'k') this.player?.flinch(m.k, shooter?.root.position);
      else if (performance.now() - this.lastFlinchAt > 700) { this.lastFlinchAt = performance.now(); this.player?.flinch('f', shooter?.root.position); } // levou tiro: reage (no máximo a cada 0,7 s)
      this.damage(dmg, m.id, { f: 'PUNHO', k: 'CHUTE', b: 'ARMA BRANCA', p: 'PISTOLA', r: 'AK-47', m: 'M4A1', q: 'M16', h: 'HONEY BADGER' }[m.k]);
    }
  }

  /**
   * O canal é público e o atirador é quem diz que me acertou: confere se o tiro é possível antes de tirar vida.
   * O atirador precisa estar vivo, a pé e perto de onde diz que disparou; o tiro precisa passar por mim, sem parede no meio,
   * dentro do alcance e na cadência da arma. (Sem servidor não dá para ser perfeito, mas acaba com o dano de qualquer lugar.)
   */
  private plausible(m: ShotMsg, s: RemotePlayer | undefined): boolean {
    const me = this.player;
    if (!s || !me || s.isDead || s.inCar) return false;
    const now = performance.now();
    const gap = (SHOT_GAP_S[m.k] ?? 0.1) * 1000 * 0.6; // folga para o agrupamento de pacotes da rede
    if (now - (this.lastDmgFrom.get(m.id) ?? -1e9) < gap) return false;
    const mp = me.object.position;
    const sp = s.root.position;
    const melee = m.k === 'f' || m.k === 'k' || m.k === 'b';
    if (Math.hypot(m.x1 - sp.x, m.z1 - sp.z) > 8) return false; // diz que atirou de onde ele não está
    if (melee) {
      if (Math.hypot(mp.x - sp.x, mp.z - sp.z) > (m.k === 'b' ? BAT_RANGE : FIST_RANGE + 0.3) + 3.5) return false;
    } else {
      const from = new THREE.Vector3(m.x1, m.y1, m.z1);
      const to = new THREE.Vector3(m.x2, m.y2, m.z2);
      const dir = to.clone().sub(from);
      const len = dir.length();
      if (len < 0.5 || len > RANGE + 5) return false;
      dir.divideScalar(len);
      const hit = rayVerticalSegment(from, dir, mp, 1.75, HIT_RADIUS + 0.9);
      if (!hit || hit.t > len + 1) return false; // o tiro não passa por mim
      for (const b of COLLIDERS) {
        const t = rayBox(from.x, from.y, from.z, dir.x, dir.y, dir.z, b.minX, b.bottom ?? 0, b.minZ, b.maxX, b.top, b.maxZ);
        if (t !== null && t > 0.05 && t < hit.t - 0.6) return false; // tem parede no caminho
      }
    }
    this.lastDmgFrom.set(m.id, now);
    return true;
  }

  private damage(amount: number, attacker: string, weapon: string): void {
    if (this.protectT > 0 || this.invuln > 0 || this.dead) return;
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

  /** Fui atropelado a `speed` m/s: aplica o dano (false = estou protegido/pausado e nada acontece). */
  vehicleHit(speed: number): boolean {
    if (this.dead || this.paused || this.protectT > 0 || this.invuln > 0) return false;
    this.damage(Math.min(90, 10 + (speed - 4.5) * 3.6), this.d.net.id, 'ATROPELAMENTO');
    return true;
  }

  /** Bati a moto e caí a `speed` m/s (≥ ~40 km/h): dano pela velocidade da batida (40 km/h ≈ 27, 100 km/h ≈ 170, 150 km/h ≈ 300 de 400; o colete segura 60%). */
  bikeCrash(speed: number): void {
    this.damage(Math.min(380, (speed - 8) * 9), this.d.net.id, 'ACIDENTE DE MOTO');
  }

  /** Alguém morreu (inclusive eu): atualiza placar, dinheiro e o feed. */
  onKill(m: KillMsg): void {
    const killer = this.ensure(m.k, this.nameOf(m.k));
    const victim = this.ensure(m.v, this.nameOf(m.v));
    victim.d++;
    if (m.k !== m.v) killer.k++;
    if (m.v === this.d.net.id) rankDeath(); // ranking global (conta)
    // abate meu só vale (ranking e dinheiro) se eu acertei essa vítima nos últimos 15 s: uma mensagem falsa de "matei fulano" não conta
    if (m.k === this.d.net.id && m.v !== this.d.net.id && performance.now() - (this.recentHit.get(m.v) ?? -1e9) < 15000) { rankKill(); this.d.inv.earn(KILL_MONEY); }
    if (m.k === m.v) this.d.log(`${this.nameOf(m.v)}: morreu (${m.w || 'acidente'})`);
    else this.d.log(`${this.nameOf(m.k)}: matou ${this.nameOf(m.v)} (${m.w || 'AK-47'})`);
  }

  private respawn(): void {
    const [x, z] = SPAWNS[Math.floor(Math.random() * SPAWNS.length)]!;
    this.player?.respawn(x, z);
    this.health = MAX_HEALTH;
    this.armor = 50;
    this.refillGuns();
    this.reloading = false;
    this.weapon = 1; // renasce de mãos livres
    this.dead = false;
    this.invuln = INVULNERABLE;
    this.protectT = PROTECT_TIME;
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
