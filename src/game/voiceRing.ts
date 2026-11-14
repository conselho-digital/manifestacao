// Círculo no chão em volta de cada personagem: até onde a voz dele chega (quem está dentro do círculo escuta). Um anel só por jogador,
// no mundo (não filho do personagem), posto a cada quadro; a mesma geometria e o mesmo material para todos.
import * as THREE from 'three';
import { HEAR_RANGE } from '../net/voice';
import { settings } from './settings';

const geo = new THREE.RingGeometry(HEAR_RANGE - 0.3, HEAR_RANGE + 0.3, 120);
geo.rotateX(-Math.PI / 2);
const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });

export class VoiceRings {
  readonly group = new THREE.Group();
  private readonly pool: THREE.Mesh[] = [];

  constructor() { this.group.name = 'voiceRings'; }

  /** Põe um anel em cada posição (pés dos personagens); os que sobram somem. */
  update(spots: { x: number; y: number; z: number }[]): void {
    this.group.visible = settings.voiceRing;
    if (!settings.voiceRing) return;
    spots.forEach((p, i) => {
      let m = this.pool[i];
      if (!m) { m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 2; this.pool[i] = m; this.group.add(m); }
      m.visible = true;
      m.position.set(p.x, p.y + 0.08, p.z);
    });
    for (let i = spots.length; i < this.pool.length; i++) this.pool[i]!.visible = false;
  }
}
