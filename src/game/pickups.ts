// Ícones de vida (cruz vermelha) e colete (escudo azul) espalhados pelo mapa. Quem chega perto pega; depois de um tempo voltam.
// Posições fixas por mapa (sorteio com semente: todos os jogadores veem os ícones nos mesmos lugares). Só o seu jogo sabe o que você pegou.
import * as THREE from 'three';
import { CITY, COLLIDERS, MAP_ID, terrainHeight, waterDepth } from './map';

export const HEALTH_COUNT = 30;
export const ARMOR_COUNT = 30;
/** vida que cada ícone dá (de 400) e colete (de 100) */
export const HEALTH_GIVES = 100;
export const ARMOR_GIVES = 50;
const RESPAWN_S = 90;
const GRAB_R = 1.3;
const MIN_GAP = 14;

export type PickupKind = 'health' | 'armor';
interface Spot { kind: PickupKind; x: number; y: number; z: number; back: number; phase: number }

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function iconTexture(kind: PickupKind): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  if (kind === 'health') {
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(10, 10, 108, 108, 20); g.fill();
    g.strokeStyle = '#7a1018'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#e02030'; g.fillRect(50, 24, 28, 80); g.fillRect(24, 50, 80, 28);
  } else {
    g.beginPath(); g.moveTo(64, 8); g.lineTo(112, 24); g.lineTo(108, 70); g.quadraticCurveTo(100, 104, 64, 122); g.quadraticCurveTo(28, 104, 20, 70); g.lineTo(16, 24); g.closePath();
    g.fillStyle = '#2a6fe0'; g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.stroke();
    g.fillStyle = '#ffffff'; g.fillRect(58, 30, 12, 62); g.fillRect(38, 50, 52, 12);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Sorteia os lugares: em chão livre (fora de prédios, postes, árvores, água), longe um do outro. */
function pickSpots(): Spot[] {
  const rand = mulberry32(MAP_ID === 'esplanada' ? 20250611 : 20250610);
  const hx = CITY.halfX - 6;
  const hz = CITY.halfZ - 6;
  const spots: Spot[] = [];
  const total = HEALTH_COUNT + ARMOR_COUNT;
  const free = (x: number, z: number, y: number): boolean => {
    if (waterDepth(x, z) > 0.02) return false;
    for (const b of COLLIDERS) {
      if (x > b.minX - 1.2 && x < b.maxX + 1.2 && z > b.minZ - 1.2 && z < b.maxZ + 1.2 && (b.bottom ?? 0) < y + 2 && b.top > y - 0.2) return false;
    }
    return true;
  };
  for (let i = 0, tries = 0; i < total && tries < 20000; tries++) {
    const x = (rand() * 2 - 1) * hx;
    const z = (rand() * 2 - 1) * hz;
    const y = terrainHeight(x, z);
    if (!free(x, z, y)) continue;
    const gap = tries < 8000 ? MIN_GAP : 7; // se não couber tudo com folga, aperta
    if (spots.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < gap * gap)) continue;
    // alterna para as duas espécies ficarem misturadas: os pontos do sorteio com mais vida, o resto colete, embaralhado
    spots.push({ kind: 'health', x, y, z, back: 0, phase: rand() * 6.28 });
    i++;
  }
  // 30 dos pontos viram colete (sorteio espaçado)
  const idx = spots.map((_, k) => k);
  for (let k = idx.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [idx[k], idx[j]] = [idx[j]!, idx[k]!]; }
  for (const k of idx.slice(0, Math.min(ARMOR_COUNT, Math.floor(spots.length * ARMOR_COUNT / total)))) spots[k]!.kind = 'armor';
  return spots;
}

export class Pickups {
  readonly group = new THREE.Group();
  private readonly spots: Spot[];
  private readonly icons: Record<PickupKind, { mesh: THREE.InstancedMesh; ids: number[] }>;
  private readonly ring: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private t = 0;

  constructor() {
    this.group.name = 'pickups';
    this.spots = pickSpots();
    const geo = new THREE.PlaneGeometry(0.9, 0.9);
    const ringGeo = new THREE.RingGeometry(0.5, 0.62, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const mk = (kind: PickupKind): { mesh: THREE.InstancedMesh; ids: number[] } => {
      const ids = this.spots.map((s, i) => (s.kind === kind ? i : -1)).filter((i) => i >= 0);
      const mat = new THREE.MeshBasicMaterial({ map: iconTexture(kind), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, ids.length));
      mesh.count = ids.length;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return { mesh, ids };
    };
    this.icons = { health: mk('health'), armor: mk('armor') };
    this.ring = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), Math.max(1, this.spots.length));
    this.ring.count = this.spots.length;
    this.ring.frustumCulled = false;
    this.spots.forEach((s, i) => this.ring.setColorAt(i, new THREE.Color(s.kind === 'health' ? 0xff3a3a : 0x3a8bff)));
    this.group.add(this.ring);
    this.refresh(new THREE.Vector3());
  }

  get count(): { health: number; armor: number } { return { health: this.icons.health.ids.length, armor: this.icons.armor.ids.length }; }

  private refresh(cam: THREE.Vector3): void {
    const d = this.dummy;
    for (const kind of ['health', 'armor'] as const) {
      const { mesh, ids } = this.icons[kind];
      ids.forEach((si, k) => {
        const s = this.spots[si]!;
        const gone = s.back > this.t;
        d.position.set(s.x, s.y + 1.05 + Math.sin(this.t * 2 + s.phase) * 0.1, s.z);
        d.rotation.set(0, Math.atan2(cam.x - s.x, cam.z - s.z), 0);
        d.scale.setScalar(gone ? 0 : 1);
        d.updateMatrix();
        mesh.setMatrixAt(k, d.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.spots.forEach((s, i) => {
      d.position.set(s.x, s.y + 0.06, s.z);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(s.back > this.t ? 0 : 1);
      d.updateMatrix();
      this.ring.setMatrixAt(i, d.matrix);
    });
    this.ring.instanceMatrix.needsUpdate = true;
    if (this.ring.instanceColor) this.ring.instanceColor.needsUpdate = true;
  }

  /** `take` recebe o tipo e diz se o jogador aproveitou (false = vida/colete já cheio: o ícone fica). */
  update(dt: number, me: THREE.Vector3 | null, cam: THREE.Vector3, take: (kind: PickupKind) => boolean): void {
    this.t += dt;
    if (me) {
      for (const s of this.spots) {
        if (s.back > this.t) continue;
        const dx = me.x - s.x, dz = me.z - s.z;
        if (dx * dx + dz * dz > GRAB_R * GRAB_R || Math.abs(me.y - s.y) > 2.2) continue;
        if (take(s.kind)) s.back = this.t + RESPAWN_S;
      }
    }
    this.refresh(cam);
  }
}
