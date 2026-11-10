import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { COLLIDERS, MAP } from './map';
import { EngineSound } from './audio';

export const CAR_MODELS = ['blistac', 'buffalo', 'clover', 'gol'] as const;
export const BIKE_MODELS = ['harley', 'triumph', 'bmw', 'suzuki'] as const;
/** Assento do piloto (z = para a frente, y = para cima), no espaço do modelo antes de subir até o chão. */
const SEATS: Record<string, [number, number]> = { harley: [-0.46, 0.14], triumph: [-0.51, 0.42], bmw: [-0.4, 0.47], suzuki: [-0.4, 0.57] };
/** Pontas do guidão (x lateral, z para a frente, y para cima), mesmo espaço dos assentos. */
const BARS: Record<string, [number, number, number]> = { harley: [0.37, 0.15, 0.76], triumph: [0.37, 0.17, 0.63], bmw: [0.31, 0.43, 0.4], suzuki: [0.29, 0.46, 0.46] };
/** Banco do motorista dos carros (x para a esquerda, z para a frente, y para cima) e volante. */
const CAR_SEATS: Record<string, [number, number, number]> = { blistac: [0.48, -0.25, -0.12], buffalo: [0.54, -0.35, -0.16], clover: [0.51, -0.15, -0.12], gol: [0.43, 0.4, -0.1] };
const isBikeModel = (m?: string): boolean => (BIKE_MODELS as readonly string[]).includes(m ?? '');
const loader = new GLTFLoader();
const modelCache = new Map<string, Promise<THREE.Object3D>>();
const loadModel = (name: string): Promise<THREE.Object3D> => {
  let p = modelCache.get(name);
  if (!p) { p = loader.loadAsync(`/models/${isBikeModel(name) ? 'bikes' : 'vehicles'}/${name}.glb`).then((g) => g.scene); modelCache.set(name, p); }
  return p;
};

const MAX_SPEED = 14;
const MAX_REVERSE = 10; // dobro da ré anterior (5)
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
  for (const name of ['wheel_FL', 'wheel_FR', 'wheel_BL', 'wheel_BR', 'wheel_F', 'wheel_R', 'door_L', 'door_R']) {
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
  readonly bike: boolean;
  private readonly model?: string;
  private readonly engine: EngineSound;
  /** empinada (rad) e inclinação lateral da moto */
  private throttle = 0;
  private tilt = 0;
  private lean = 0;
  private axle = new THREE.Vector3(0, 0.35, -0.9);
  private lastX = 0;
  private lastZ = 0;
  /** velocidade estimada por quem só vê o carro (motorista remoto) */
  private seenSpeed = 0;

  constructor(readonly id: number, x: number, z: number, heading: number, color: number, model?: string) {
    this.color = color;
    this.bike = isBikeModel(model);
    this.model = model;
    this.engine = new EngineSound(this.bike ? 'bike' : 'car');
    this.root = new THREE.Group(); // o modelo GLB entra quando carregar
    this.wheels = {};
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.apply(0);
    if (model) void loadModel(model).then((src) => this.useModel(src));
  }

  /** portas dianteiras (0 fechada, 1 aberta) e o tempo que ficam abertas */
  private doorT = 0;
  private doorOpen = 0;
  /** abre a porta do motorista por um instante (entrar/sair) */
  openDoor(sec = 0.9): void { this.doorT = sec; }
  /** onde fica a pélvis do piloto (espaço do carro); null em carros */
  seat: THREE.Vector3 | null = null;
  /** mãos no guidão: [esquerda, direita] (espaço do carro) */
  grips: [THREE.Vector3, THREE.Vector3] | null = null;
  private body: THREE.Group | null = null;
  private bodyBase = new THREE.Vector3();

  private useModel(src: THREE.Object3D): void {
    const v = buildCarVisual(src, this.color);
    this.root.clear();
    if (this.bike) {
      // a moto inteira (corpo e rodas) vai dentro de um grupo que empina/inclina
      const inner = new THREE.Group();
      inner.add(v.group);
      this.body = inner;
      this.bodyBase.set(0, 0, 0);
      const rear = v.wheels['wheel_R'];
      if (rear) this.axle.set(0, rear.position.y + v.group.position.y, rear.position.z);
      const sp = SEATS[this.model ?? ''];
      if (sp) this.seat = new THREE.Vector3(0, sp[1] + v.group.position.y, sp[0]);
      const bar = BARS[this.model ?? ''];
      if (bar) { const y = bar[2] + v.group.position.y; this.grips = [new THREE.Vector3(bar[0], y, bar[1]), new THREE.Vector3(-bar[0], y, bar[1])]; }
      this.root.add(inner);
    } else {
      this.root.add(v.group);
      const cs = CAR_SEATS[this.model ?? ''];
      if (cs) {
        const lift = v.group.position.y;
        this.seat = new THREE.Vector3(cs[0], cs[2] + lift, cs[1]);
        // mãos no volante: um pouco à frente e acima do quadril
        const w = new THREE.Vector3(0, cs[2] + lift + 0.4, cs[1] + 0.5);
        this.grips = [w.clone().add(new THREE.Vector3(cs[0] + 0.17, 0, 0)), w.clone().add(new THREE.Vector3(cs[0] - 0.17, 0, 0))];
      }
    }
    this.wheels = v.wheels;
  }

  /** Dirige: acelerador, freio e freio de mão; steer -1..1 (direita +). */
  drive(dt: number, gas: boolean, brake: boolean, hand: boolean, steer: number, wheelie = false): void {
    const f = this.speed;
    const bike = this.bike;
    this.throttle = gas ? 1 : 0;
    const accel = bike ? 15 : ACCEL;
    const maxSpeed = bike ? 20 : MAX_SPEED;
    const turn = bike ? 2.5 : TURN_RATE;
    const radius = bike ? 0.7 : RADIUS;
    // empinar: só com velocidade; a roda da frente sobe até ~40° e volta ao soltar
    const wantTilt = bike && wheelie && this.speed > 3 ? 0.72 : 0;
    this.tilt += (wantTilt - this.tilt) * Math.min(1, dt * (wantTilt > this.tilt ? 3 : 5));
    if (gas) this.speed += (f < -0.5 ? BRAKE : accel * (this.tilt > 0.3 ? 1.2 : 1)) * dt;
    else if (brake) this.speed -= (f > 0.5 ? BRAKE : ACCEL * 0.6) * dt; // freia e depois dá ré
    else this.speed -= Math.sign(f) * Math.min(Math.abs(f), DRAG * dt);
    if (hand) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), HAND_BRAKE * dt);
    this.speed = THREE.MathUtils.clamp(this.speed, bike ? -4 : -MAX_REVERSE, maxSpeed);

    // Só esterça andando; com o freio de mão o carro "derrapa" (gira mais)
    const grip = THREE.MathUtils.clamp(this.speed / 4, -1, 1) * (hand ? 1.7 : 1);
    this.heading -= steer * turn * grip * (1 - this.tilt * 0.8) * dt;
    this.lean += (steer * Math.min(1, Math.abs(this.speed) / 10) * 0.45 - this.lean) * Math.min(1, dt * 6);
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
      if (d < radius) {
        if (d > 1e-6) { this.x = px + (dx / d) * radius; this.z = pz + (dz / d) * radius; }
        hit = true;
      }
    }
    if (hit) this.speed *= -0.25;
    this.apply(steer, dt);
  }

  /** Motor: toca quando há motorista; mais alto perto de quem ouve (lx, lz). Chame todo quadro. */
  updateEngine(dt: number, lx: number, lz: number): void {
    // portas: abrem enquanto doorT > 0,25 e fecham no final
    this.doorOpen += ((this.doorT > 0.25 ? 1 : 0) - this.doorOpen) * Math.min(1, dt * 10);
    if (this.doorT > 0) this.doorT -= dt;
    const dl = this.wheels['door_L'];
    const dr = this.wheels['door_R'];
    if (dl) dl.rotation.y = -this.doorOpen * 1.0;
    if (dr) dr.rotation.y = this.doorOpen * 0.35;
    const moved = Math.hypot(this.x - this.lastX, this.z - this.lastZ) / Math.max(dt, 1e-3);
    this.lastX = this.x;
    this.lastZ = this.z;
    const sp = this.driver === null ? 0 : Math.abs(this.speed) > 0.01 ? this.speed : moved;
    this.seenSpeed += (sp - this.seenSpeed) * Math.min(1, dt * 5);
    const d = Math.hypot(this.x - lx, this.z - lz);
    this.engine.update(this.driver !== null, this.seenSpeed, Math.max(0, 1 - d / 45), this.driver === null ? 0 : this.throttle);
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
    this.spin += (this.speed * dt) / (this.bike ? 0.33 : 0.36);
    if (this.bike && this.body) {
      // empina em torno do eixo traseiro e inclina nas curvas
      this.body.rotation.set(-this.tilt, 0, this.lean);
      const a = this.axle;
      this.body.position.copy(a).sub(a.clone().applyEuler(this.body.rotation)).add(this.bodyBase);
    }
    for (const [name, pivot] of Object.entries(this.wheels)) {
      if (name.startsWith('door')) continue;
      const front = name.startsWith('wheel_F');
      pivot.rotation.y = front && !this.bike ? -steer * 0.45 : 0;
      (pivot.children[0] as THREE.Object3D).rotation.x = this.spin;
    }
  }
}

export const CARS: Car[] = [];

/** Atualiza o som de motor de todos os carros (o ouvinte é o jogador). */
export function updateEngines(dt: number, lx: number, lz: number): void {
  for (const c of CARS) c.updateEngine(dt, lx, lz);
}

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
    [50, -9, Math.PI / 2, 0x888888],
    [-8, 9, -Math.PI / 2, 0x888888],
    [30, 9, -Math.PI / 2, 0x888888],
    [-30, -9, Math.PI / 2, 0x888888],
  ];
  spawn.forEach(([x, z, h, c], i) => {
    const model = i < 4 ? CAR_MODELS[i % CAR_MODELS.length] : BIKE_MODELS[i - 4];
    const car = new Car(i, x, z, h, c, model);
    CARS.push(car);
    group.add(car.root);
  });
  return group;
}
