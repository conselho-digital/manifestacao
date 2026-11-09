import * as THREE from 'three';
import { COLLIDERS, MAP } from './map';

const MAX_SPEED = 14;
const MAX_REVERSE = 5;
const ACCEL = 11;
const BRAKE = 20;
const DRAG = 3;
const HAND_BRAKE = 16;
const TURN_RATE = 1.9;
const RADIUS = 1.3;


/** Carro provisório: carroceria `body` e rodas `wheel_FL/FR/BL/BR` (como os GLB terão que ter). */
function buildMesh(color: number): { root: THREE.Group; wheels: Record<string, THREE.Object3D> } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fc3d9 });
  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 4), paint);
  lower.position.y = 0.65;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 2), glass);
  cabin.position.set(0, 1.2, -0.2);
  body.add(lower, cabin);
  body.traverse((o) => { o.castShadow = true; });
  root.add(body);

  const tire = new THREE.MeshLambertMaterial({ color: 0x1b1b1b });
  const geo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14);
  geo.rotateZ(Math.PI / 2);
  const wheels: Record<string, THREE.Object3D> = {};
  for (const [name, x, z] of [['wheel_FL', 0.95, 1.3], ['wheel_FR', -0.95, 1.3], ['wheel_BL', 0.95, -1.3], ['wheel_BR', -0.95, -1.3]] as const) {
    const pivot = new THREE.Group(); // pivô permite esterçar sem atrapalhar o giro
    pivot.name = name;
    pivot.position.set(x, 0.36, z);
    const w = new THREE.Mesh(geo, tire);
    w.castShadow = true;
    pivot.add(w);
    root.add(pivot);
    wheels[name] = pivot;
  }
  return { root, wheels };
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

  constructor(readonly id: number, x: number, z: number, heading: number, color: number) {
    const m = buildMesh(color);
    this.root = m.root;
    this.wheels = m.wheels;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.apply(0);
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
    const car = new Car(i, x, z, h, c);
    CARS.push(car);
    group.add(car.root);
  });
  return group;
}
