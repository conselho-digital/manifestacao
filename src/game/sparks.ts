import * as THREE from 'three';

/** Faíscas (raspar de metal): partículas aditivas com gravidade; um único objeto Points na cena, sem alocar a cada faísca. */
const MAX = 160;
const pos = new Float32Array(MAX * 3);
const col = new Float32Array(MAX * 3);
const vel = new Float32Array(MAX * 3);
const life = new Float32Array(MAX);
let next = 0;

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
const mat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
export const sparksObject = new THREE.Points(geo, mat);
sparksObject.frustumCulled = false;

/** Solta `n` faíscas em (x, y, z) com velocidade média (vx, vy, vz) mais um espalhamento. */
export function emitSparks(x: number, y: number, z: number, vx: number, vy: number, vz: number, n: number): void {
  for (let k = 0; k < n; k++) {
    const i = next;
    next = (next + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx + (Math.random() - 0.5) * 3;
    vel[i * 3 + 1] = vy + Math.random() * 2.5;
    vel[i * 3 + 2] = vz + (Math.random() - 0.5) * 3;
    life[i] = 0.25 + Math.random() * 0.3;
    col[i * 3] = 1; col[i * 3 + 1] = 0.75; col[i * 3 + 2] = 0.3;
  }
}

export function updateSparks(dt: number): void {
  let any = false;
  for (let i = 0; i < MAX; i++) {
    if (life[i]! <= 0) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; pos[i * 3 + 1] = -50; continue; }
    any = true;
    life[i]! -= dt;
    vel[i * 3 + 1]! -= 9 * dt;
    pos[i * 3] += vel[i * 3]! * dt;
    pos[i * 3 + 1] = Math.max(0.02, pos[i * 3 + 1]! + vel[i * 3 + 1]! * dt);
    pos[i * 3 + 2] += vel[i * 3 + 2]! * dt;
    const k = Math.max(0, life[i]! / 0.4);
    col[i * 3] = k; col[i * 3 + 1] = k * 0.6; col[i * 3 + 2] = k * 0.2; // esfria: amarelo -> laranja -> some
  }
  if (any || next >= 0) { geo.attributes.position!.needsUpdate = true; geo.attributes.color!.needsUpdate = true; }
}
