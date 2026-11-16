// Círculo no chão em volta de quem está falando: mostra até onde a voz chega AGORA (quem está dentro dele escuta).
// Só aparece enquanto há som saindo; o raio acompanha o volume (voz baixinha = círculo pequeno, grito = círculo grande).
// Um anel por jogador, no mundo (não filho do personagem), com geometria própria atualizada no lugar (poucos vértices).
import * as THREE from 'three';
import { HEAR_RANGE } from '../net/voice';
import { settings } from './settings';

const SEG = 96;
const HALF = 0.03; // meia espessura da linha (m)
const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });

interface RingMesh { mesh: THREE.Mesh; pos: THREE.BufferAttribute; r: number }

function makeRing(): RingMesh {
  const pos = new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3);
  pos.setUsage(THREE.DynamicDrawUsage);
  const idx: number[] = [];
  for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', pos);
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), HEAR_RANGE + 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  const ring = { mesh, pos, r: -1 };
  setRadius(ring, 0.1);
  return ring;
}

function setRadius(ring: RingMesh, r: number): void {
  if (Math.abs(r - ring.r) < 0.004) return;
  ring.r = r;
  const a = ring.pos.array as Float32Array;
  const inner = Math.max(0.01, r - HALF);
  const outer = r + HALF;
  for (let i = 0; i <= SEG; i++) {
    const ang = (i / SEG) * Math.PI * 2;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    a.set([c * inner, 0, s * inner, c * outer, 0, s * outer], i * 6);
  }
  ring.pos.needsUpdate = true;
}

export class VoiceRings {
  readonly group = new THREE.Group();
  private readonly pool: RingMesh[] = [];

  constructor() { this.group.name = 'voiceRings'; }

  /** Põe um anel em cada posição (pés de quem está com som); `r` é o alcance da voz agora (m). Os que sobram somem. */
  update(spots: { x: number; y: number; z: number; r: number }[]): void {
    this.group.visible = settings.voiceRing;
    if (!settings.voiceRing) return;
    spots.forEach((p, i) => {
      let rm = this.pool[i];
      if (!rm) { rm = makeRing(); this.pool[i] = rm; this.group.add(rm.mesh); }
      rm.mesh.visible = true;
      setRadius(rm, p.r);
      rm.mesh.position.set(p.x, p.y + 0.08, p.z);
    });
    for (let i = spots.length; i < this.pool.length; i++) this.pool[i]!.mesh.visible = false;
  }
}
