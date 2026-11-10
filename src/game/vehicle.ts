import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { COLLIDERS, MAP } from './map';

export const CAR_MODELS = ['blistac', 'buffalo', 'clover'] as const;
const loader = new GLTFLoader();
const modelCache = new Map<string, Promise<THREE.Object3D>>();
const loadModel = (name: string): Promise<THREE.Object3D> => {
  let p = modelCache.get(name);
  if (!p) { p = loader.loadAsync(`/models/vehicles/${name}.glb`).then((g) => g.scene); modelCache.set(name, p); }
  return p;
};

const MAX_SPEED = 14;
const MAX_REVERSE = 5;
const ACCEL = 11;
const BRAKE = 20;
const DRAG = 3;
const HAND_BRAKE = 16;
const TURN_RATE = 1.9;
const RADIUS = 1.3;


/** Monta o visual de um carro a partir do GLB (nós `body` e `wheel_FL/FR/BL/BR`); a pintura (`paint`) recebe a cor. */
export function buildCarVisual(src: THREE.Object3D, colorHex: number): { group: THREE.Group; wheels: Record<string, THREE.Object3D> } {
  const model = src.clone(true);
  const paint = new THREE.Color(colorHex);
  const done = new Map<THREE.Material, THREE.Material>();
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const out = mats.map((mat) => {
      if (mat.name !== 'paint') return mat;
      let c = done.get(mat);
      if (!c) { c = mat.clone(); (c as THREE.MeshStandardMaterial).color.copy(paint); done.set(mat, c); }
      return c;
    });
    m.material = Array.isArray(m.material) ? out : out[0]!;
  });
  const wheels: Record<string, THREE.Object3D> = {};
  const group = new THREE.Group();
  const body = model.getObjectByName('body');
  if (body) group.add(body);
  for (const name of ['wheel_FL', 'wheel_FR', 'wheel_BL', 'wheel_BR']) {
    const node = model.getObjectByName(name);
    if (!node) continue;
    const pivot = new THREE.Group(); // pivô: esterça sem atrapalhar o giro
    pivot.name = name;
    pivot.position.copy(node.position);
    node.position.set(0, 0, 0);
    pivot.add(node);
    group.add(pivot);
    wheels[name] = pivot;
  }
  // a origem do GLB fica no centro do carro: sobe até as rodas tocarem o chão
  group.position.y = -new THREE.Box3().setFromObject(group).min.y;
  return { group, wheels };
}

/** Visual de um carro parado/decorativo (sem lógica de direção). */
export function loadCarVisual(model: string, colorHex: number): Promise<THREE.Group> {
  return loadModel(model).then((src) => buildCarVisual(src, colorHex).group);
}

export class Car {
  readonly root: THREE.Group;
  x: number;
  z: number;
  heading: number;
  speed = 0;
  /** id de quem está dirigindo (null = livre) */
  driver: string | null = null;
  private wheels: Record<string, THREE.Object3D>;
  private spin = 0;
  private readonly color: number;

  constructor(readonly id: number, x: number, z: number, heading: number, color: number, model?: string) {
    this.color = color;
    this.root = new THREE.Group(); // o modelo GLB entra quando carregar
    this.wheels = {};
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.apply(0);
    if (model) void loadModel(model).then((src) => this.useModel(src));
  }

  private useModel(src: THREE.Object3D): void {
    const v = buildCarVisual(src, this.color);
    this.root.clear();
    this.root.add(v.group);
    this.wheels = v.wheels;
  }

  /** Dirige: acelerador, freio e freio de mão; steer -1..1 (direita +). */
  drive(dt: number, gas: boolean, brake: boolean, hand: boolean, steer: number): void {
    const f = this.speed;
    if (gas) this.speed += (f < -0.5 ? BRAKE : ACCEL) * dt;
    else if (brake) this.speed -= (f > 0.5 ? BRAKE : ACCEL * 0.6) * dt; // freia e depois dá ré
    else this.speed -= Math.sign(f) * Math.min(Math.abs(f), DRAG * dt);
    if (hand) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), HAND_BRAKE * dt);
    this.speed = THREE.MathUtils.clamp(this.speed, -MAX_REVERSE, MAX_SPEED);

    // Só esterça andando; com o freio de mão o carro "derrapa" (gira mais)
    const grip = THREE.MathUtils.clamp(this.speed / 4, -1, 1) * (hand ? 1.7 : 1);
    this.heading -= steer * TURN_RATE * grip * dt;
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;

    // Limites da arena e caixas: para e quica um pouco
    let hit = false;
    const cx = THREE.MathUtils.clamp(this.x, -(MAP.halfX - 1.8), MAP.halfX - 1.8);
    const cz = THREE.MathUtils.clamp(this.z, -(MAP.halfZ - 1.8), MAP.halfZ - 1.8);
    if (cx !== this.x || cz !== this.z) { this.x = cx; this.z = cz; hit = true; }
    for (const b of COLLIDERS) {
      if (b.top < 0.6 || (b.bottom ?? 0) > 2.2) continue; // degraus baixos e coisas suspensas não bloqueiam
      const px = THREE.MathUtils.clamp(this.x, b.minX, b.maxX);
      const pz = THREE.MathUtils.clamp(this.z, b.minZ, b.maxZ);
      const dx = this.x - px;
      const dz = this.z - pz;
      const d = Math.hypot(dx, dz);
      if (d < RADIUS) {
        if (d > 1e-6) { this.x = px + (dx / d) * RADIUS; this.z = pz + (dz / d) * RADIUS; }
        hit = true;
      }
    }
    if (hit) this.speed *= -0.25;
    this.apply(steer, dt);
  }

  setPose(x: number, z: number, heading: number): void {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.apply(0);
  }

  private apply(steer: number, dt = 0): void {
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.heading;
    this.spin += (this.speed * dt) / 0.36;
    for (const [name, pivot] of Object.entries(this.wheels)) {
      const front = name.startsWith('wheel_F');
      pivot.rotation.y = front ? -steer * 0.45 : 0;
      (pivot.children[0] as THREE.Object3D).rotation.x = this.spin;
    }
  }
}

export const CARS: Car[] = [];

/** Cria os carros parados do mapa. */
export function createCars(): THREE.Group {
  CARS.length = 0;
  const group = new THREE.Group();
  // Avenida: pista sul vai para leste (heading π/2), pista norte para oeste (-π/2)
  const spawn: [number, number, number, number][] = [
    [34, -9, Math.PI / 2, 0xc0392b],
    [-26, -9, Math.PI / 2, 0x2e86c1],
    [10, 9, -Math.PI / 2, 0xf1c40f],
    [-40, 9, -Math.PI / 2, 0xecf0f1],
  ];
  spawn.forEach(([x, z, h, c], i) => {
    const car = new Car(i, x, z, h, c, CAR_MODELS[i % CAR_MODELS.length]);
    CARS.push(car);
    group.add(car.root);
  });
  return group;
}
