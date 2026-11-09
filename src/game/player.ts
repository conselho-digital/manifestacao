import * as THREE from 'three';
import { ARENA_SIZE } from './map';
import type { InputState } from './input';
import type { Animator } from './anim';

const RUN_SPEED = 5;
const WALK_SPEED = 1.8;
const LIMIT = ARENA_SIZE / 2 - 1;
const CAM_DISTANCE = 6;
const CAM_HEIGHT = 3.5;

export class Player {
  readonly object: THREE.Object3D;
  private heading = 0; // rotação do corpo (rad)

  constructor(object: THREE.Object3D, private animator: Animator | null = null) {
    this.object = object;
  }

  update(dt: number, input: InputState, yaw: number): void {
    // Direção do movimento relativa à câmera (no plano XZ)
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);

    const move = forward.multiplyScalar(input.y).add(right.multiplyScalar(input.x));
    if (move.lengthSq() > 0.0001) {
      this.object.position.addScaledVector(move, (input.walk ? WALK_SPEED : RUN_SPEED) * dt);
      this.object.position.x = THREE.MathUtils.clamp(this.object.position.x, -LIMIT, LIMIT);
      this.object.position.z = THREE.MathUtils.clamp(this.object.position.z, -LIMIT, LIMIT);
      this.heading = Math.atan2(move.x, move.z);
      this.animator?.set(input.walk ? 'walk' : 'run');
    } else {
      this.animator?.set('idle');
    }
    this.animator?.update(dt);

    // Gira suavemente até a direção do movimento
    let diff = this.heading - this.object.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.object.rotation.y += diff * Math.min(1, dt * 12);
  }

  /** Câmera em terceira pessoa, atrás do jogador. */
  followCamera(camera: THREE.PerspectiveCamera, dt: number, yaw: number): void {
    const p = this.object.position;
    const target = new THREE.Vector3(
      p.x - Math.sin(yaw) * CAM_DISTANCE,
      p.y + CAM_HEIGHT,
      p.z - Math.cos(yaw) * CAM_DISTANCE,
    );
    camera.position.lerp(target, Math.min(1, dt * 8));
    camera.lookAt(p.x, p.y + 1.2, p.z);
  }
}
