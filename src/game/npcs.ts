// Pedestres (NPCs) que andam pela cidade. Só enfeite: cada jogador vê os seus (não vão pela rede), não levam tiro e não têm colisão com o jogador.
// Andam em linha reta até um ponto sorteado (calçada/parque, fora das pistas), esperam um pouco e escolhem outro. Desviam de prédios, postes e água.
import * as THREE from 'three';
import { Animator } from './anim';
import { createCharacter, type BuiltinName } from './characters';
import { CITY, COLLIDERS, ROADS, terrainHeight, waterDepth } from './map';
import { applyOutfit, randomOutfit } from './outfit';
import { IS_TOUCH } from './scene';

const COUNT = IS_TOUCH ? 8 : 16;
const WALK_SPEED = 2.1; // o mesmo do jogador: o passo do clipe 'walk' foi ajustado para essa velocidade
const ACTIVE_R = 75; // além disso o NPC fica parado e escondido (sem gastar com animação)
const HIDE_R = 110;
const CHARS: BuiltinName[] = ['Helena', 'Stewart', 'Bennyse', 'Amanda', 'Garota1', 'Gordao', 'Cesar', 'Akiyama', 'Carlos'];

const inRect = (r: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number): boolean => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

/** Chão livre para um pedestre: sem prédio/poste/árvore (com folga), sem água. */
function free(x: number, z: number, pad: number): boolean {
  if (Math.abs(x) > CITY.halfX - 3 || Math.abs(z) > CITY.halfZ - 3) return false;
  if (waterDepth(x, z) > 0.02) return false;
  const y = terrainHeight(x, z);
  for (const b of COLLIDERS) {
    if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad && (b.bottom ?? 0) < y + 1.4 && b.top > y + 0.35) return false;
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

class Npc {
  readonly root = new THREE.Group();
  private animator: Animator | null = null;
  private tx = 0;
  private tz = 0;
  private wait = 0;
  private walking = false;
  private ready = false;
  private active = true;

  constructor(name: BuiltinName, x: number, z: number) {
    this.root.position.set(x, terrainHeight(x, z), z);
    this.root.rotation.y = Math.random() * Math.PI * 2;
    this.root.visible = false;
    this.wait = Math.random() * 3;
    void createCharacter(name).then(async (m) => {
      if (Math.random() < 0.8) applyOutfit(m, randomOutfit()); // roupa sorteada (a variedade vem das cores)
      this.root.add(m);
      this.animator = await Animator.create(m);
      this.ready = true;
      this.root.visible = true;
    }).catch(() => undefined);
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
      this.tx = tx; this.tz = tz; this.walking = true;
      return;
    }
    this.wait = 1 + Math.random() * 2; // nada livre por perto: espera e tenta de novo
  }

  update(dt: number, px: number, pz: number): void {
    if (!this.ready) return;
    const p = this.root.position;
    const d = Math.hypot(p.x - px, p.z - pz);
    this.root.visible = d < HIDE_R;
    this.active = d < ACTIVE_R;
    if (!this.active) return;
    if (this.walking) {
      const dx = this.tx - p.x;
      const dz = this.tz - p.z;
      const dist = Math.hypot(dx, dz);
      const step = WALK_SPEED * dt;
      if (dist < step + 0.1) { this.walking = false; this.wait = 2 + Math.random() * 5; }
      else {
        const nx = p.x + (dx / dist) * step;
        const nz = p.z + (dz / dist) * step;
        if (free(nx, nz, 0.45)) { p.x = nx; p.z = nz; } else { this.walking = false; this.wait = 0.3; }
        const want = Math.atan2(dx, dz);
        let diff = want - this.root.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.root.rotation.y += diff * Math.min(1, dt * 8);
      }
      p.y = terrainHeight(p.x, p.z);
    } else {
      this.wait -= dt;
      if (this.wait <= 0) this.pickTarget();
    }
    this.animator?.play(this.walking ? 'walk' : 'idle');
    this.animator?.update(dt);
  }
}

export class Npcs {
  readonly group = new THREE.Group();
  private readonly list: Npc[] = [];
  private spawnT = 0;
  private readonly spawnedAt: [number, number][] = [];

  /** Cria um pedestre por vez (a cada 0,5 s) para não engasgar o jogo ao entrar. */
  private spawnOne(): void {
    const name = CHARS[Math.floor(Math.random() * CHARS.length)]!;
    for (let k = 0; k < 200; k++) {
      const x = (Math.random() * 2 - 1) * (CITY.halfX - 6);
      const z = (Math.random() * 2 - 1) * (CITY.halfZ - 6);
      if (onRoad(x, z) || !free(x, z, 1.2)) continue;
      if (this.spawnedAt.some(([sx, sz]) => (sx - x) ** 2 + (sz - z) ** 2 < 100)) continue;
      const n = new Npc(name, x, z);
      this.spawnedAt.push([x, z]);
      this.list.push(n);
      this.group.add(n.root);
      return;
    }
  }

  update(dt: number, px: number, pz: number): void {
    if (this.list.length < COUNT) { this.spawnT -= dt; if (this.spawnT <= 0) { this.spawnT = 0.5; this.spawnOne(); } }
    for (const n of this.list) n.update(dt, px, pz);
  }

  get count(): number { return this.list.length; }
}
