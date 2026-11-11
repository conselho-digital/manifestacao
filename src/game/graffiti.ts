// Lata de spray: o jogador levanta a lata de frente para uma parede e a imagem da equipe aparece nela.
// Todos veem (mensagem `spray` pela rede); as pinturas ficam só enquanto o jogo está aberto (máx. MAX_DECALS, as mais velhas somem).
import * as THREE from 'three';
import { playSprayAt } from './audio';
import { teamById, type Team } from './teams';

export interface SprayMsg {
  /** quem pintou */
  id: string;
  /** centro da pintura na parede */
  x: number; y: number; z: number;
  /** direção da parede (aponta para fora, na horizontal) */
  nx: number; nz: number;
  /** largura (m) */
  w: number;
  /** id da equipe (para achar a imagem) */
  t: string;
}

const SIZE = 2.2; // lado da pintura (m)
const REACH = 2.6; // distância máxima até a parede
const MAX_DECALS = 40;
const SPRAY_TIME = 1.4; // a tinta aparece durante este tempo
const HEIGHT = 1.7;

export interface WallHit { x: number; y: number; z: number; nx: number; nz: number }

const ray = new THREE.Raycaster();
const nrm = new THREE.Vector3();

/** Primeiro ponto de parede (superfície sólida quase vertical) que o raio acerta, ou null. Ignora folhagem, sprites e instâncias (árvores). */
function wallAt(city: THREE.Object3D, o: THREE.Vector3, d: THREE.Vector3): { dist: number; point: THREE.Vector3; nx: number; nz: number } | null {
  ray.set(o, d);
  ray.far = REACH + 0.6;
  for (const h of ray.intersectObject(city, true)) {
    const m = h.object as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) continue;
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    if (mat && (mat.transparent || mat.alphaTest > 0)) continue;
    if (!h.face) continue;
    nrm.copy(h.face.normal).transformDirection(m.matrixWorld);
    if (nrm.dot(d) > 0) nrm.negate(); // sempre voltada para quem pinta
    if (Math.abs(nrm.y) > 0.35) return null; // chão, telhado ou beiral: não é parede
    const len = Math.hypot(nrm.x, nrm.z) || 1;
    return { dist: h.distance, point: h.point.clone(), nx: nrm.x / len, nz: nrm.z / len };
  }
  return null;
}

/**
 * Parede à frente (direção horizontal dx,dz) até REACH m, ou null. A superfície tem de ser lisa numa área de ~2 m
 * (cinco raios: centro, dois dos lados, um acima e um abaixo — se um acerta bem mais perto ou mais longe, é quina, coluna ou poste).
 */
export function findWall(city: THREE.Object3D, ox: number, oz: number, dx: number, dz: number): WallHit | null {
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const dir = new THREE.Vector3(ux, 0, uz);
  const c = wallAt(city, new THREE.Vector3(ox, HEIGHT, oz), dir);
  if (!c || c.dist > REACH) return null;
  const side = new THREE.Vector3(-uz, 0, ux);
  for (const [sx, sy] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]] as const) {
    const o = new THREE.Vector3(ox + side.x * sx, HEIGHT + sy, oz + side.z * sx);
    const h = wallAt(city, o, dir);
    // a distância é medida da origem de cada raio; o lado muda pouco se a parede é reta e de frente
    if (!h || Math.abs(h.dist - c.dist) > 0.4) return null;
  }
  return { x: c.point.x, y: HEIGHT, z: c.point.z, nx: c.nx, nz: c.nz };
}

const texCache = new Map<string, THREE.Texture>();

/** Imagem de reserva (equipe sem imagem enviada): faixas nas duas cores e o nome, estilo tag de rua. */
function fallbackTexture(team: Team | null, name: string): THREE.Texture {
  const key = `fb:${team?.id ?? name}:${team?.c1}${team?.c2}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const c1 = team?.c1 ?? '#ffffff';
  const c2 = team?.c2 ?? '#111111';
  g.translate(128, 128);
  g.rotate(-0.12);
  g.translate(-128, -128);
  g.fillStyle = c2;
  g.fillRect(14, 70, 228, 116);
  g.fillStyle = c1;
  g.fillRect(14, 70, 228, 52);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(0,0,0,.85)';
  const label = (team?.name || name || 'EQUIPE').toUpperCase().slice(0, 24);
  // até duas linhas, com a fonte reduzida para caber na faixa
  const words = label.split(' ');
  const lines = words.length > 1 && label.length > 9 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [label];
  let size = lines.length > 1 ? 46 : 54;
  const fit = (): number => Math.max(...lines.map((l) => g.measureText(l).width));
  g.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
  while (fit() > 212 && size > 16) { size -= 2; g.font = `900 ${size}px Impact, "Arial Black", sans-serif`; }
  g.fillStyle = c1 === '#ffffff' ? '#f5f5f5' : c1;
  lines.forEach((l, i) => {
    const y = 128 + (i - (lines.length - 1) / 2) * (size * 1.05) + 8;
    g.strokeText(l, 128, y);
    g.fillText(l, 128, y);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

const loader = new THREE.TextureLoader();
loader.setCrossOrigin('anonymous');

/** Textura do grafite da equipe (imagem enviada pelo admin) ou a de reserva. Chama `done` quando a imagem chegar. */
function teamTexture(team: Team | null, name: string, done: (t: THREE.Texture) => void): void {
  const url = team?.graffiti;
  if (!url) { done(fallbackTexture(team, name)); return; }
  const hit = texCache.get(url);
  if (hit) { done(hit); return; }
  loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache.set(url, t); done(t); }, undefined, () => done(fallbackTexture(team, name)));
}

interface Decal { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number }
interface Puff { s: THREE.Sprite; t: number; life: number; vx: number; vy: number; vz: number }

let puffTex: THREE.Texture | null = null;
function puffTexture(): THREE.Texture {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,255,255,.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}

/** Pinturas nas paredes + a névoa de tinta do bico. */
export class Graffiti {
  private readonly decals: Decal[] = [];
  private readonly puffs: Puff[] = [];
  private readonly pool: THREE.Sprite[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /** Coloca (ou recebe pela rede) uma pintura. `nozzle` = onde está o bico agora (para a névoa), se estiver perto. */
  add(m: SprayMsg, name: string): void {
    const team = teamById(m.t);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, color: 0xffffff });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(m.w, m.w), mat);
    mesh.position.set(m.x + m.nx * 0.03, m.y, m.z + m.nz * 0.03);
    mesh.rotation.y = Math.atan2(m.nx, m.nz);
    mesh.visible = false;
    this.scene.add(mesh);
    const decal: Decal = { mesh, mat, age: 0 };
    this.decals.push(decal);
    while (this.decals.length > MAX_DECALS) {
      const old = this.decals.shift()!;
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.mat.dispose();
    }
    teamTexture(team, name, (t) => { mat.map = t; mat.needsUpdate = true; mesh.visible = true; });
    playSprayAt(m.x, m.z);
  }

  /** Solta névoa de tinta do bico até o ponto da parede. */
  mist(from: THREE.Vector3, to: THREE.Vector3, color: string): void {
    for (let i = 0; i < 2; i++) {
      let s = this.pool.pop();
      if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), transparent: true, depthWrite: false })); this.scene.add(s); }
      (s.material as THREE.SpriteMaterial).color.set(color);
      (s.material as THREE.SpriteMaterial).opacity = 0.7;
      const k = Math.random();
      s.position.lerpVectors(from, to, k * 0.2);
      s.position.x += (Math.random() - 0.5) * 0.03;
      s.position.y += (Math.random() - 0.5) * 0.03;
      s.scale.setScalar(0.05 + Math.random() * 0.05);
      s.visible = true;
      const life = 0.25 + Math.random() * 0.2;
      const v = to.clone().sub(from).divideScalar(life);
      this.puffs.push({ s, t: 0, life, vx: v.x + (Math.random() - 0.5) * 0.6, vy: v.y + (Math.random() - 0.5) * 0.6, vz: v.z + (Math.random() - 0.5) * 0.6 });
    }
  }

  update(dt: number): void {
    for (const d of this.decals) {
      if (d.age < SPRAY_TIME) {
        d.age += dt;
        d.mat.opacity = Math.min(1, d.age / SPRAY_TIME) ** 1.5; // a tinta vai aparecendo enquanto a lata sopra
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!;
      p.t += dt;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      p.s.scale.multiplyScalar(1 + dt * 5);
      (p.s.material as THREE.SpriteMaterial).opacity = 0.7 * Math.max(0, 1 - p.t / p.life);
      if (p.t >= p.life) { p.s.visible = false; this.pool.push(p.s); this.puffs.splice(i, 1); }
    }
  }
}

export const SPRAY_SIZE = SIZE;
export const SPRAY_DURATION = SPRAY_TIME;
